import type { FamilyData } from "./familyDataTypes";
import { supabase } from "./supabaseClient";
import type { RouteDeparturePlan, RouteDepartureLeg } from "./smartRoute";

export type RouteDepartureAlert = {
  id: string;
  family_id: string;
  plan_id: string;
  leg_id: string | null;
  recipient_member_id: string | null;
  subscription_id: string | null;
  alert_type: "leave_soon" | "leave_now" | "high_risk" | "manual_test";
  title: string;
  body: string;
  target_url: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  error_message: string | null;
  dedupe_key: string | null;
  created_at: string;
};

export async function updateRoutePlanExecution(args: {
  familyId: string;
  planId: string;
  assignedParentId?: string | null;
  alertEnabled?: boolean;
  alertMinutesBefore?: number;
  executionStatus?: "planned" | "ready" | "on_the_way" | "completed" | "cancelled";
}) {
  const patch: Record<string, unknown> = {};

  if (args.assignedParentId !== undefined) patch.assigned_parent_id = args.assignedParentId;
  if (args.alertEnabled !== undefined) patch.alert_enabled = args.alertEnabled;
  if (args.alertMinutesBefore !== undefined) patch.alert_minutes_before = args.alertMinutesBefore;
  if (args.executionStatus !== undefined) patch.execution_status = args.executionStatus;

  const { error } = await supabase
    .from("route_departure_plans")
    .update(patch)
    .eq("family_id", args.familyId)
    .eq("id", args.planId);

  if (error) throw error;
}

export async function updateRouteLegExecution(args: {
  familyId: string;
  legId: string;
  assignedParentId?: string | null;
  legStatus?: "planned" | "ready" | "on_the_way" | "arrived" | "completed" | "skipped";
}) {
  const patch: Record<string, unknown> = {};

  if (args.assignedParentId !== undefined) patch.assigned_parent_id = args.assignedParentId;
  if (args.legStatus !== undefined) patch.leg_status = args.legStatus;

  const { error } = await supabase
    .from("route_departure_legs")
    .update(patch)
    .eq("family_id", args.familyId)
    .eq("id", args.legId);

  if (error) throw error;
}

export async function runRouteDepartureAlertCheck(args: {
  data: FamilyData;
  planId?: string | null;
}) {
  const { data, error } = await supabase.functions.invoke("route-departure-alerts", {
    body: {
      family_id: args.data.family.id,
      mode: "manual_check",
      plan_id: args.planId ?? null,
      target_url: window.location.origin,
    },
  });

  if (error) throw error;
  return data as {
    ok: boolean;
    plan_count: number;
    sent: number;
    failed: number;
    skipped: number;
    no_subscription: number;
    results: unknown[];
  };
}

export async function loadRouteDepartureAlerts(familyId: string, planId?: string | null) {
  let query = supabase
    .from("route_departure_alerts")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (planId) query = query.eq("plan_id", planId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as RouteDepartureAlert[];
}

export function buildSplitHandoffMessage(args: {
  plan: RouteDeparturePlan;
  legs: RouteDepartureLeg[];
  getMemberName: (id?: string | null) => string;
}) {
  const byParent = new Map<string, RouteDepartureLeg[]>();

  for (const leg of args.legs) {
    const assigned = (leg as any).assigned_parent_id ?? args.plan.assigned_parent_id ?? "unassigned";
    byParent.set(assigned, [...(byParent.get(assigned) ?? []), leg]);
  }

  const lines = [
    `接送分工：${args.plan.plan_date}`,
    `总体风险：${args.plan.overall_risk}`,
    `建议第一段出发：${args.plan.recommended_departure_at ? new Date(args.plan.recommended_departure_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) : "—"}`,
    "",
  ];

  for (const [memberId, memberLegs] of byParent.entries()) {
    lines.push(memberId === "unassigned" ? "未分配：" : `${args.getMemberName(memberId)}：`);
    for (const leg of memberLegs) {
      const depart = leg.recommended_departure_at
        ? new Date(leg.recommended_departure_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })
        : "—";
      const arrive = leg.arrival_target_at
        ? new Date(leg.arrival_target_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })
        : "—";

      lines.push(`- ${depart} 出发 → ${arrive} 到 ${leg.to_label}（${leg.event_title ?? "event"}，风险 ${leg.risk_level}）`);
    }
    lines.push("");
  }

  if (args.plan.warnings?.length) {
    lines.push("注意：", ...args.plan.warnings.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}
