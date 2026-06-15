import type { FamilyData } from "./familyDataTypes";
import { supabase } from "./supabaseClient";
import { loadScheduledRunnerLogs } from "./lateRisk";

export type ScheduledJobSetting = {
  id: string;
  family_id: string | null;
  job_name: string;
  is_enabled: boolean;
  cron_expression: string | null;
  cadence_label: string | null;
  function_name: string;
  runner_payload: Record<string, any>;
  run_window_label: string | null;
  notes: string | null;
  last_manual_run_at: string | null;
  last_manual_result: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

export function defaultCronJobs(familyId: string) {
  return [
    {
      family_id: familyId,
      job_name: "afternoon-route-runner",
      is_enabled: false,
      cron_expression: "*/5 14-20 * * 1-5",
      cadence_label: "Every 5 minutes, weekday afternoons",
      function_name: "scheduled-family-runner",
      runner_payload: {
        limit: 100,
        run_late_risk: true,
        run_route_alerts: true,
        run_family_reminders: false,
      },
      run_window_label: "School pickup / after-school activity window",
      notes: "Recommended for Route late risk and leave-now alerts.",
    },
    {
      family_id: familyId,
      job_name: "family-reminders",
      is_enabled: false,
      cron_expression: "*/15 7-21 * * *",
      cadence_label: "Every 15 minutes during daytime",
      function_name: "scheduled-family-runner",
      runner_payload: {
        limit: 100,
        run_late_risk: false,
        run_route_alerts: false,
        run_family_reminders: true,
      },
      run_window_label: "General daytime reminders",
      notes: "Recommended for homework, payment and event reminders.",
    },
    {
      family_id: familyId,
      job_name: "full-safety-runner",
      is_enabled: false,
      cron_expression: "*/10 7-21 * * *",
      cadence_label: "Every 10 minutes during daytime",
      function_name: "scheduled-family-runner",
      runner_payload: {
        limit: 100,
        run_late_risk: true,
        run_route_alerts: true,
        run_family_reminders: true,
      },
      run_window_label: "All-in-one safety runner",
      notes: "Use this instead of separate jobs if you prefer one cron.",
    },
  ];
}

export async function ensureDefaultCronJobs(data: FamilyData) {
  const rows = defaultCronJobs(data.family.id);

  const { data: saved, error } = await supabase
    .from("scheduled_job_settings")
    .upsert(rows, { onConflict: "family_id,job_name" })
    .select("*")
    .order("job_name", { ascending: true });

  if (error) throw error;
  return (saved ?? []) as ScheduledJobSetting[];
}

export async function loadScheduledJobSettings(familyId: string) {
  const { data, error } = await supabase
    .from("scheduled_job_settings")
    .select("*")
    .eq("family_id", familyId)
    .order("job_name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ScheduledJobSetting[];
}

export async function updateScheduledJobSetting(args: {
  familyId: string;
  id: string;
  patch: Partial<Pick<ScheduledJobSetting, "is_enabled" | "cron_expression" | "cadence_label" | "runner_payload" | "run_window_label" | "notes">>;
}) {
  const { error } = await supabase
    .from("scheduled_job_settings")
    .update(args.patch)
    .eq("family_id", args.familyId)
    .eq("id", args.id);

  if (error) throw error;
}

export async function runScheduledJobManually(args: {
  data: FamilyData;
  job: ScheduledJobSetting;
  cronSecret: string;
}) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${args.job.function_name}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": args.cronSecret,
    },
    body: JSON.stringify(args.job.runner_payload ?? {}),
  });

  const text = await response.text();
  let json: Record<string, any> = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${args.job.function_name} failed ${response.status}: ${text}`);
  }

  const { error } = await supabase
    .from("scheduled_job_settings")
    .update({
      last_manual_run_at: new Date().toISOString(),
      last_manual_result: json,
    })
    .eq("family_id", args.data.family.id)
    .eq("id", args.job.id);

  if (error) throw error;

  return json;
}

export function buildCronCurl(args: {
  projectRef: string;
  job: ScheduledJobSetting;
}) {
  const body = JSON.stringify(args.job.runner_payload ?? {}, null, 2);

  return `curl -X POST "https://${args.projectRef}.supabase.co/functions/v1/${args.job.function_name}" \\
  -H "Content-Type: application/json" \\
  -H "x-cron-secret: YOUR_CRON_SECRET" \\
  -d '${body.replaceAll("'", "'\\''")}'`;
}

export function buildPgCronSql(args: {
  job: ScheduledJobSetting;
  projectRef: string;
}) {
  const functionUrl = `https://${args.projectRef}.supabase.co/functions/v1/${args.job.function_name}`;
  const payload = JSON.stringify(args.job.runner_payload ?? {});

  return `-- Example only. Requires pg_cron + pg_net enabled in Supabase.
select cron.schedule(
  '${args.job.job_name}',
  '${args.job.cron_expression ?? "*/10 * * * *"}',
  $$
  select net.http_post(
    url := '${functionUrl}',
    headers := '{"Content-Type":"application/json","x-cron-secret":"YOUR_CRON_SECRET"}'::jsonb,
    body := '${payload.replaceAll("'", "''")}'::jsonb
  );
  $$
);`;
}

export { loadScheduledRunnerLogs };
