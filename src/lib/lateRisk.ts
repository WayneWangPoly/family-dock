import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { FamilyData } from "./familyDataTypes";
import { firebaseFunctions, firestore } from "./firebaseClient";

export type RouteLateRiskCheck = { id: string; family_id: string; plan_id: string; leg_id: string | null; check_time: string; risk_level: "low" | "normal" | "medium" | "high" | "late"; minutes_to_recommended: number | null; minutes_to_latest_safe: number | null; message: string; recommendation: string | null; status: "active" | "resolved" | "ignored"; created_at: string; };
export type ScheduledRunnerLog = { id: string; runner_name: string; run_mode: "manual" | "cron" | "test"; family_id: string | null; started_at: string; finished_at: string | null; status: "running" | "completed" | "failed" | "skipped"; summary: Record<string, unknown>; error_message: string | null; created_at: string; };

function withId<T>(snapshot: { id: string; data: () => Record<string, unknown> }) { return { id: snapshot.id, ...snapshot.data() } as T; }
function familyCollection(familyId: string, name: string) { return collection(firestore, "families", familyId, name); }

export async function runLateRiskCheck(args: { data: FamilyData; planId?: string | null; }) {
  const fn = httpsCallable(firebaseFunctions, "routeLateRiskCheck");
  const result = await fn({ family_id: args.data.family.id, plan_id: args.planId ?? null, mode: "manual", limit: 100 });
  return result.data as { ok: boolean; checked_plans: number; checked_legs: number; high_or_late: number; risks: Array<{ plan_id: string; risk: string; message: string }>; };
}

export async function loadLateRiskChecks(familyId: string, planId?: string | null) {
  const constraints = planId ? [where("plan_id", "==", planId), orderBy("created_at", "desc"), limit(80)] : [orderBy("created_at", "desc"), limit(80)];
  const snap = await getDocs(query(familyCollection(familyId, "route_late_risk_checks"), ...constraints));
  return snap.docs.map((docSnap) => withId<RouteLateRiskCheck>(docSnap));
}

export async function loadScheduledRunnerLogs(familyId: string) {
  const snap = await getDocs(query(familyCollection(familyId, "scheduled_runner_logs"), orderBy("created_at", "desc"), limit(80)));
  return snap.docs.map((docSnap) => withId<ScheduledRunnerLog>(docSnap));
}

export function lateRiskTone(risk: string) {
  if (risk === "late" || risk === "high") return "danger";
  if (risk === "medium") return "warning";
  if (risk === "low") return "success";
  return "info";
}

export async function buildDailyRouteDeparturePlans(args: {
  data: FamilyData;
  date?: string | null;
  childId?: string | null;
}) {
  const fn = httpsCallable(firebaseFunctions, "buildDailyRouteDeparturePlans");
  const result = await fn({
    family_id: args.data.family.id,
    date: args.date ?? new Date().toISOString().slice(0, 10),
    child_id: args.childId ?? null,
    mode: "manual",
  });
  return result.data as {
    ok: boolean;
    date: string;
    event_count: number;
    usable_event_count: number;
    created_plans: number;
    created_legs: number;
    skipped_children: number;
    results: Array<Record<string, unknown>>;
  };
}
