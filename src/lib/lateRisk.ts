import type { FamilyData } from "./familyDataTypes";
import { supabase } from "./supabaseClient";

export type RouteLateRiskCheck = {
  id: string;
  family_id: string;
  plan_id: string;
  leg_id: string | null;
  check_time: string;
  risk_level: "low" | "normal" | "medium" | "high" | "late";
  minutes_to_recommended: number | null;
  minutes_to_latest_safe: number | null;
  message: string;
  recommendation: string | null;
  status: "active" | "resolved" | "ignored";
  created_at: string;
};

export type ScheduledRunnerLog = {
  id: string;
  runner_name: string;
  run_mode: "manual" | "cron" | "test";
  family_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "failed" | "skipped";
  summary: Record<string, any>;
  error_message: string | null;
  created_at: string;
};

export async function runLateRiskCheck(args: {
  data: FamilyData;
  planId?: string | null;
}) {
  const { data, error } = await supabase.functions.invoke("route-late-risk-check", {
    body: {
      family_id: args.data.family.id,
      plan_id: args.planId ?? null,
      mode: "manual",
      limit: 100,
    },
  });

  if (error) throw error;
  return data as {
    ok: boolean;
    checked_plans: number;
    checked_legs: number;
    high_or_late: number;
    risks: Array<{ plan_id: string; risk: string; message: string }>;
  };
}

export async function loadLateRiskChecks(familyId: string, planId?: string | null) {
  let query = supabase
    .from("route_late_risk_checks")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (planId) query = query.eq("plan_id", planId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as RouteLateRiskCheck[];
}

export async function loadScheduledRunnerLogs(familyId: string) {
  const { data, error } = await supabase
    .from("scheduled_runner_logs")
    .select("*")
    .or(`family_id.eq.${familyId},family_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) throw error;
  return (data ?? []) as ScheduledRunnerLog[];
}

export function lateRiskTone(risk: string) {
  if (risk === "late" || risk === "high") return "danger";
  if (risk === "medium") return "warning";
  if (risk === "low") return "success";
  return "info";
}
