import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id: string;
  run_type?: "manual" | "scheduled" | "pre_release" | "support";
};

type RoleRow = {
  member_id: string | null;
  role: string;
};

type CheckItem = {
  category: string;
  check_key: string;
  severity: "pass" | "info" | "warning" | "fail";
  status: "pass" | "info" | "warning" | "fail";
  title: string;
  message: string;
  recommendation?: string | null;
  details?: Record<string, unknown>;
};

const REQUIRED_TABLES = [
  "families",
  "family_members",
  "family_user_roles",
  "places",
  "calendar_events",
  "homework_tasks",
  "payments",
  "requests",
  "learning_notes",
  "learning_progress_summaries",
  "route_departure_plans",
  "route_departure_legs",
  "route_departure_alerts",
  "family_calendar_settings",
  "school_term_periods",
  "calendar_day_overrides",
  "push_subscriptions",
  "notification_logs",
  "notification_preferences",
  "action_logs",
];

const HIGH_RISK_TABLES = [
  "families",
  "family_members",
  "family_user_roles",
  "calendar_events",
  "homework_tasks",
  "payments",
  "requests",
  "learning_notes",
  "learning_progress_summaries",
  "push_subscriptions",
  "family_data_export_logs",
];

const EXPECTED_FUNCTION_SECRETS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "CRON_SECRET",
];

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function hasEnv(name: string) {
  return Boolean(Deno.env.get(name));
}

function getAdminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function getUserClient(authHeader: string) {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

async function getActorRole(adminClient: any, familyId: string, authUserId: string): Promise<RoleRow> {
  const { data, error } = await adminClient
    .from("family_user_roles")
    .select("member_id, role")
    .eq("family_id", familyId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("User is not linked to this family.");

  return data as RoleRow;
}

function push(items: CheckItem[], item: CheckItem) {
  items.push({
    ...item,
    recommendation: item.recommendation ?? null,
    details: item.details ?? {},
  });
}

async function tableExists(adminClient: any, table: string) {
  const { error } = await adminClient
    .from(table)
    .select("*", { count: "exact", head: true });

  if (!error) return { exists: true, error: null };

  return { exists: false, error: error.message };
}

async function tableCount(adminClient: any, table: string, familyId?: string | null) {
  let query = adminClient
    .from(table)
    .select("id", { count: "exact", head: true });

  if (familyId) query = query.eq("family_id", familyId);

  const { count, error } = await query;
  return {
    count: error ? null : count ?? 0,
    error: error?.message ?? null,
  };
}

async function maybeCount(adminClient: any, table: string, familyId: string, build: (query: any) => any) {
  try {
    let query = adminClient.from(table).select("id", { count: "exact", head: true }).eq("family_id", familyId);
    query = build(query);
    const { count, error } = await query;
    return error ? -1 : count ?? 0;
  } catch {
    return -1;
  }
}

async function createRun(adminClient: any, body: Body, role: RoleRow) {
  const { data, error } = await adminClient
    .from("production_check_runs")
    .insert({
      family_id: body.family_id,
      created_by: role.member_id,
      run_type: body.run_type ?? "manual",
      status: "running",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

async function saveItems(adminClient: any, familyId: string, runId: string, items: CheckItem[]) {
  if (items.length === 0) return;

  const { error } = await adminClient
    .from("production_check_items")
    .insert(items.map((item) => ({
      family_id: familyId,
      run_id: runId,
      category: item.category,
      check_key: item.check_key,
      severity: item.severity,
      status: item.status,
      title: item.title,
      message: item.message,
      recommendation: item.recommendation ?? null,
      details: item.details ?? {},
    })));

  if (error) throw new Error(error.message);
}

function summarize(items: CheckItem[]) {
  return {
    total: items.length,
    pass: items.filter((item) => item.severity === "pass").length,
    info: items.filter((item) => item.severity === "info").length,
    warning: items.filter((item) => item.severity === "warning").length,
    fail: items.filter((item) => item.severity === "fail").length,
    generated_at: new Date().toISOString(),
  };
}

async function finishRun(adminClient: any, runId: string, status: "completed" | "failed", summary: unknown, errorMessage?: string | null) {
  await adminClient
    .from("production_check_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      summary,
      error_message: errorMessage ?? null,
    })
    .eq("id", runId);
}

async function loadPolicyNames(adminClient: any, tableName: string) {
  const { data, error } = await adminClient
    .from("pg_policies")
    .select("policyname, cmd")
    .eq("schemaname", "public")
    .eq("tablename", tableName);

  if (error) return { policies: [], error: error.message };
  return { policies: data ?? [], error: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const adminClient = getAdminClient();
  let runId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const body = (await req.json()) as Body;
    if (!body.family_id) return jsonResponse({ error: "family_id is required" }, 400);

    const userClient = getUserClient(authHeader);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const role = await getActorRole(adminClient, body.family_id, user.id);
    if (!["parent", "guardian"].includes(role.role)) {
      return jsonResponse({ error: "Only parent/guardian can run production audit." }, 403);
    }

    runId = await createRun(adminClient, body, role);
    const items: CheckItem[] = [];

    for (const secret of EXPECTED_FUNCTION_SECRETS) {
      const present = hasEnv(secret);
      const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].includes(secret);

      push(items, {
        category: "Environment",
        check_key: `env_${secret}`,
        severity: present ? "pass" : required ? "fail" : "warning",
        status: present ? "pass" : required ? "fail" : "warning",
        title: `Secret ${secret}`,
        message: present ? "Configured." : "Missing.",
        recommendation: present ? null : `Set Supabase secret ${secret}.`,
      });
    }

    for (const table of REQUIRED_TABLES) {
      const exists = await tableExists(adminClient, table);
      push(items, {
        category: "Database",
        check_key: `table_${table}`,
        severity: exists.exists ? "pass" : "fail",
        status: exists.exists ? "pass" : "fail",
        title: `Table ${table}`,
        message: exists.exists ? "Table exists and is queryable." : `Table missing or not queryable: ${exists.error}`,
        recommendation: exists.exists ? null : "Run the relevant migration and redeploy.",
      });
    }

    for (const table of HIGH_RISK_TABLES) {
      const policies = await loadPolicyNames(adminClient, table);
      const policyCount = policies.policies.length;

      push(items, {
        category: "RLS",
        check_key: `policies_${table}`,
        severity: policyCount > 0 ? "pass" : "warning",
        status: policyCount > 0 ? "pass" : "warning",
        title: `RLS policies for ${table}`,
        message: policyCount > 0 ? `${policyCount} policy/policies found.` : "No policy found through pg_policies.",
        recommendation: policyCount > 0 ? null : "Verify RLS is enabled and policies exist. Do not expose this table to child/homestay without scoped policies.",
        details: { policies: policies.policies, error: policies.error },
      });
    }

    const counts: Record<string, number | null> = {};
    for (const table of REQUIRED_TABLES) {
      const result = await tableCount(adminClient, table, table === "families" ? null : body.family_id);
      counts[table] = result.count;
    }

    push(items, {
      category: "Data",
      check_key: "family_members_count",
      severity: (counts.family_members ?? 0) >= 2 ? "pass" : "warning",
      status: (counts.family_members ?? 0) >= 2 ? "pass" : "warning",
      title: "Family members",
      message: `${counts.family_members ?? 0} member(s) found.`,
      recommendation: (counts.family_members ?? 0) >= 2 ? null : "Add parent/child/homestay members before real use.",
    });

    push(items, {
      category: "Data",
      check_key: "places_count",
      severity: (counts.places ?? 0) > 0 ? "pass" : "warning",
      status: (counts.places ?? 0) > 0 ? "pass" : "warning",
      title: "Places",
      message: `${counts.places ?? 0} place(s) found.`,
      recommendation: (counts.places ?? 0) > 0 ? null : "Add school, library, club, tutoring and home places.",
    });

    const placesNoCoords = await maybeCount(adminClient, "places", body.family_id, (query) => query.or("lat.is.null,lng.is.null"));
    push(items, {
      category: "Route",
      check_key: "places_without_coordinates",
      severity: placesNoCoords <= 0 ? "pass" : "warning",
      status: placesNoCoords <= 0 ? "pass" : "warning",
      title: "Places with coordinates",
      message: placesNoCoords < 0 ? "Could not check coordinates." : `${placesNoCoords} place(s) missing coordinates.`,
      recommendation: placesNoCoords > 0 ? "Add lat/lng or geocode missing places for route accuracy." : null,
    });

    const eventsNoPlace = await maybeCount(adminClient, "calendar_events", body.family_id, (query) => query.is("place_id", null).neq("status", "cancelled"));
    push(items, {
      category: "Calendar",
      check_key: "events_without_place",
      severity: eventsNoPlace <= 0 ? "pass" : "warning",
      status: eventsNoPlace <= 0 ? "pass" : "warning",
      title: "Calendar events with places",
      message: eventsNoPlace < 0 ? "Could not check calendar event places." : `${eventsNoPlace} active event(s) missing place.`,
      recommendation: eventsNoPlace > 0 ? "Add places to events so route and conflict checks work." : null,
    });

    const pushDevices = await maybeCount(adminClient, "push_subscriptions", body.family_id, (query) => query.eq("is_active", true));
    push(items, {
      category: "Notification",
      check_key: "active_push_devices",
      severity: pushDevices > 0 ? "pass" : "warning",
      status: pushDevices > 0 ? "pass" : "warning",
      title: "Active push devices",
      message: pushDevices < 0 ? "Could not check push devices." : `${pushDevices} active push device(s).`,
      recommendation: pushDevices > 0 ? null : "Install PWA and subscribe at least one parent device before relying on reminders.",
    });

    const cronJobs = await maybeCount(adminClient, "scheduled_job_settings", body.family_id, (query) => query.eq("is_enabled", true));
    push(items, {
      category: "Cron",
      check_key: "enabled_scheduled_jobs",
      severity: cronJobs > 0 ? "pass" : "warning",
      status: cronJobs > 0 ? "pass" : "warning",
      title: "Enabled scheduled job settings",
      message: cronJobs < 0 ? "Could not check scheduled jobs." : `${cronJobs} enabled job setting(s).`,
      recommendation: cronJobs > 0 ? "Remember: app-side enabled setting does not by itself create Supabase cron." : "Create default cron jobs and configure real scheduled execution.",
    });

    const backupLogs = await maybeCount(adminClient, "family_data_export_logs", body.family_id, (query) => query.gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()));
    push(items, {
      category: "Backup",
      check_key: "recent_exports",
      severity: backupLogs > 0 ? "pass" : "info",
      status: backupLogs > 0 ? "pass" : "info",
      title: "Recent family data exports",
      message: backupLogs < 0 ? "Could not check exports." : `${backupLogs} export(s) in last 30 days.`,
      recommendation: backupLogs > 0 ? null : "Create a JSON backup before heavy migrations or user testing.",
    });

    push(items, {
      category: "Release",
      check_key: "manual_device_test",
      severity: "info",
      status: "info",
      title: "Manual device test required",
      message: "Automated checks cannot confirm iPhone/Android PWA behavior, speech recognition, browser permissions, or real push delivery.",
      recommendation: "Before release, test on at least one iPhone and one Android device.",
    });

    push(items, {
      category: "Security",
      check_key: "service_role_function_rule",
      severity: "info",
      status: "info",
      title: "Service-role function rule",
      message: "Any Edge Function using service role must first verify the authenticated user belongs to the requested family and has the required role.",
      recommendation: "Review all functions after each new module. Never trust family_id from request body without membership check.",
    });

    const summary = summarize(items);
    await saveItems(adminClient, body.family_id, runId, items);
    await finishRun(adminClient, runId, "completed", summary);

    return jsonResponse({
      ok: true,
      run_id: runId,
      summary,
      items,
      table_counts: counts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId) await finishRun(adminClient, runId, "failed", {}, message);
    return jsonResponse({ error: message }, 500);
  }
});
