import { collection, doc, getDocs, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { FamilyData } from "./familyDataTypes";
import { firebaseFunctions, firestore } from "./firebaseClient";
import { loadScheduledRunnerLogs } from "./lateRisk";

export type ScheduledJobSetting = {
  id: string;
  family_id: string | null;
  job_name: string;
  is_enabled: boolean;
  cron_expression: string | null;
  cadence_label: string | null;
  function_name: string;
  runner_payload: Record<string, unknown>;
  run_window_label: string | null;
  notes: string | null;
  last_manual_run_at: string | null;
  last_manual_result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ScheduledJobDraft = Omit<ScheduledJobSetting, "id" | "last_manual_run_at" | "last_manual_result" | "created_at" | "updated_at">;

function nowIso() { return new Date().toISOString(); }
function settingsCollection(familyId: string) { return collection(firestore, "families", familyId, "scheduled_job_settings"); }
function settingDoc(familyId: string, id: string) { return doc(firestore, "families", familyId, "scheduled_job_settings", id); }
function withId<T>(snapshot: { id: string; data: () => Record<string, unknown> }) { return { id: snapshot.id, ...snapshot.data() } as T; }

export function defaultCronJobs(familyId: string): ScheduledJobDraft[] {
  return [
    { family_id: familyId, job_name: "afternoon-route-runner", is_enabled: false, cron_expression: "*/5 14-20 * * 1-5", cadence_label: "Every 5 minutes, weekday afternoons", function_name: "scheduledFamilyRunner", runner_payload: { limit: 100, run_late_risk: true, run_route_alerts: true, run_family_reminders: false }, run_window_label: "School pickup / after-school activity window", notes: "Recommended for route risk and leave-now alerts." },
    { family_id: familyId, job_name: "family-reminders", is_enabled: false, cron_expression: "*/15 7-21 * * *", cadence_label: "Every 15 minutes during daytime", function_name: "scheduledFamilyRunner", runner_payload: { limit: 100, run_late_risk: false, run_route_alerts: false, run_family_reminders: true }, run_window_label: "General daytime reminders", notes: "Recommended for homework, payment and event reminders." },
    { family_id: familyId, job_name: "full-safety-runner", is_enabled: false, cron_expression: "*/10 7-21 * * *", cadence_label: "Every 10 minutes during daytime", function_name: "scheduledFamilyRunner", runner_payload: { limit: 100, run_late_risk: true, run_route_alerts: true, run_family_reminders: true }, run_window_label: "All-in-one safety runner", notes: "Use this instead of separate jobs if you prefer one cron." },
  ];
}

export async function ensureDefaultCronJobs(data: FamilyData) {
  const createdAt = nowIso();
  await Promise.all(defaultCronJobs(data.family.id).map((row) => setDoc(settingDoc(data.family.id, row.job_name), { ...row, created_at: createdAt, updated_at: createdAt, last_manual_run_at: null, last_manual_result: null }, { merge: true })));
  return loadScheduledJobSettings(data.family.id);
}

export async function loadScheduledJobSettings(familyId: string) {
  const snap = await getDocs(query(settingsCollection(familyId), orderBy("job_name", "asc")));
  return snap.docs.map((docSnap) => withId<ScheduledJobSetting>(docSnap));
}

export async function updateScheduledJobSetting(args: { familyId: string; id: string; patch: Partial<ScheduledJobSetting>; }) {
  await updateDoc(settingDoc(args.familyId, args.id), { ...args.patch, updated_at: nowIso() });
}

export async function runScheduledJobManually(args: { data: FamilyData; job: ScheduledJobSetting; cronSecret: string; }) {
  const fn = httpsCallable(firebaseFunctions, "scheduledFamilyRunner");
  const result = await fn({ family_id: args.data.family.id, mode: "manual", ...(args.job.runner_payload ?? {}) });
  const json = (result.data ?? {}) as Record<string, unknown>;
  await updateDoc(settingDoc(args.data.family.id, args.job.id), { last_manual_run_at: nowIso(), last_manual_result: json, updated_at: nowIso() });
  return json;
}

export function buildCronCurl(args: { projectRef: string; job: ScheduledJobSetting; }) {
  const body = JSON.stringify(args.job.runner_payload ?? {}, null, 2);
  return `curl -X POST "https://us-central1-${args.projectRef}.cloudfunctions.net/${args.job.function_name}" -H "Content-Type: application/json" -d '${body.replaceAll("'", "'\\''")}'`;
}

export function buildPgCronSql(args: { job: ScheduledJobSetting; projectRef: string; }) {
  return `Firebase scheduled functions are configured in Firebase, not pg_cron. Job: ${args.job.job_name}; project: ${args.projectRef}.`;
}

export { loadScheduledRunnerLogs };
