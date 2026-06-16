import { collection, doc, getDocs, limit, orderBy, query, updateDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseFunctions, firestore } from "./firebaseClient";
import type { FamilyData } from "./familyDataTypes";
import type { RouteDepartureLeg, RouteDeparturePlan } from "./smartRoute";

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
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (args.assignedParentId !== undefined) patch.assigned_parent_id = args.assignedParentId;
  if (args.alertEnabled !== undefined) patch.alert_enabled = args.alertEnabled;
  if (args.alertMinutesBefore !== undefined) patch.alert_minutes_before = args.alertMinutesBefore;
  if (args.executionStatus !== undefined) patch.execution_status = args.executionStatus;

  await updateDoc(
    doc(firestore, "families", args.familyId, "route_departure_plans", args.planId),
    patch,
  );
}

export async function updateRouteLegExecution(args: {
  familyId: string;
  legId: string;
  assignedParentId?: string | null;
  legStatus?: "planned" | "ready" | "on_the_way" | "arrived" | "completed" | "skipped";
}) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (args.assignedParentId !== undefined) patch.assigned_parent_id = args.assignedParentId;
  if (args.legStatus !== undefined) patch.leg_status = args.legStatus;

  await updateDoc(
    doc(firestore, "families", args.familyId, "route_departure_legs", args.legId),
    patch,
  );
}

export async function runRouteDepartureAlertCheck(args: {
  data: FamilyData;
  planId?: string | null;
}) {
  const callRouteDepartureAlerts = httpsCallable<
    {
      family_id: string;
      mode: string;
      plan_id: string | null;
      target_url: string;
    },
    {
      ok: boolean;
      plan_count: number;
      sent: number;
      failed: number;
      skipped: number;
      no_subscription: number;
      results: unknown[];
    }
  >(firebaseFunctions, "routeDepartureAlerts");

  const result = await callRouteDepartureAlerts({
    family_id: args.data.family.id,
    mode: "manual_check",
    plan_id: args.planId ?? null,
    target_url: window.location.origin,
  });

  return result.data;
}

export async function loadRouteDepartureAlerts(familyId: string, planId?: string | null) {
  const ref = collection(firestore, "families", familyId, "route_departure_alerts");

  const q = planId
    ? query(ref, where("plan_id", "==", planId), orderBy("created_at", "desc"), limit(80))
    : query(ref, orderBy("created_at", "desc"), limit(80));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as RouteDepartureAlert);
}

function formatRouteTime(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

export function buildSplitHandoffMessage(args: {
  plan: RouteDeparturePlan;
  legs: RouteDepartureLeg[];
  getMemberName: (id?: string | null) => string;
}) {
  const byParent = new Map<string, RouteDepartureLeg[]>();

  for (const leg of args.legs) {
    const assigned =
      (leg as RouteDepartureLeg & { assigned_parent_id?: string | null }).assigned_parent_id ??
      args.plan.assigned_parent_id ??
      "unassigned";

    byParent.set(assigned, [...(byParent.get(assigned) ?? []), leg]);
  }

  const firstDeparture = formatRouteTime(args.plan.recommended_departure_at);

  const lines = [
    `Route handoff: ${args.plan.plan_date}`,
    `Overall risk: ${args.plan.overall_risk}`,
    `Suggested first departure: ${firstDeparture}`,
    "",
  ];

  for (const [memberId, memberLegs] of byParent.entries()) {
    lines.push(memberId === "unassigned" ? "Unassigned:" : `${args.getMemberName(memberId)}:`);

    for (const leg of memberLegs) {
      const depart = formatRouteTime(leg.recommended_departure_at);
      const arrive = formatRouteTime(leg.arrival_target_at);
      const stopLabel = leg.to_label ?? "next stop";
      const eventTitle = leg.event_title ?? "event";

      lines.push(`- ${depart} leave -> ${arrive} arrive at ${stopLabel} (${eventTitle}, risk ${leg.risk_level})`);
    }

    lines.push("");
  }

  if (args.plan.warnings?.length) {
    lines.push("Warnings:", ...args.plan.warnings.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}
