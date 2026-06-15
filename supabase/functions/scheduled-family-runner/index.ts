import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id?: string | null;
  limit?: number | null;
  run_route_alerts?: boolean;
  run_late_risk?: boolean;
  run_family_reminders?: boolean;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getOptionalEnv(name: string) {
  return Deno.env.get(name) ?? "";
}

function getAdminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function assertCron(req: Request) {
  const cronSecret = getOptionalEnv("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret") ?? "";

  if (!cronSecret || providedSecret !== cronSecret) {
    throw new Error("Missing or invalid x-cron-secret.");
  }
}

async function createRunLog(adminClient: any, runnerName: string, familyId?: string | null) {
  const { data, error } = await adminClient
    .from("scheduled_runner_logs")
    .insert({
      runner_name: runnerName,
      run_mode: "cron",
      family_id: familyId ?? null,
      status: "running",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

async function finishRunLog(adminClient: any, id: string, status: "completed" | "failed", summary: unknown, errorMessage?: string | null) {
  await adminClient
    .from("scheduled_runner_logs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      summary: summary ?? {},
      error_message: errorMessage ?? null,
    })
    .eq("id", id);
}

async function callFunction(name: string, body: unknown) {
  const url = `${requireEnv("SUPABASE_URL")}/functions/v1/${name}`;
  const cronSecret = requireEnv("CRON_SECRET");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": cronSecret,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json: unknown = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${name} failed ${response.status}: ${text}`);
  }

  return json;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const adminClient = getAdminClient();
  let logId: string | null = null;

  try {
    assertCron(req);

    const body = (await req.json().catch(() => ({}))) as Body;
    logId = await createRunLog(adminClient, "scheduled-family-runner", body.family_id);

    const tasks = {
      route_alerts: body.run_route_alerts ?? true,
      late_risk: body.run_late_risk ?? true,
      family_reminders: body.run_family_reminders ?? true,
    };

    const results: Record<string, unknown> = {};

    if (tasks.late_risk) {
      results.late_risk = await callFunction("route-late-risk-check", {
        family_id: body.family_id ?? null,
        mode: "cron",
        limit: body.limit ?? 100,
      });
    }

    if (tasks.route_alerts) {
      results.route_alerts = await callFunction("route-departure-alerts", {
        family_id: body.family_id ?? null,
        mode: "cron_check",
        limit: body.limit ?? 100,
      });
    }

    if (tasks.family_reminders) {
      results.family_reminders = await callFunction("run-scheduled-reminders", {
        limit: body.limit ?? 100,
      });
    }

    const summary = {
      ok: true,
      tasks,
      results,
    };

    if (logId) await finishRunLog(adminClient, logId, "completed", summary);

    return jsonResponse(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (logId) await finishRunLog(adminClient, logId, "failed", {}, message);

    return jsonResponse({ error: message }, 500);
  }
});
