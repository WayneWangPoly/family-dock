import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id: string;
  export_type?: "json" | "diagnostic" | "summary";
  include_sensitive?: boolean;
};

type RoleRow = {
  member_id: string | null;
  role: string;
};

const EXPORT_TABLES = [
  "families",
  "family_members",
  "family_user_roles",
  "places",
  "calendar_events",
  "homework_tasks",
  "homework_items",
  "payments",
  "requests",
  "learning_notes",
  "learning_progress_summaries",
  "meal_plans",
  "meal_plan_items",
  "shopping_list_items",
  "route_departure_plans",
  "route_departure_legs",
  "route_late_risk_checks",
  "parent_handoff_messages",
  "family_calendar_settings",
  "school_term_periods",
  "calendar_day_overrides",
  "notification_preferences",
  "scheduled_job_settings",
];

const SENSITIVE_TABLES = new Set([
  "family_user_roles",
  "push_subscriptions",
  "notification_logs",
]);

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
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

async function exportTable(adminClient: any, table: string, familyId: string) {
  let query = adminClient.from(table).select("*");

  if (table === "families") {
    query = query.eq("id", familyId);
  } else {
    query = query.eq("family_id", familyId);
  }

  const { data, error } = await query;
  if (error) {
    return {
      ok: false,
      rows: [],
      error: error.message,
    };
  }

  return {
    ok: true,
    rows: data ?? [],
    error: null,
  };
}

function redactRows(table: string, rows: any[], includeSensitive: boolean) {
  if (includeSensitive) return rows;

  if (table === "family_user_roles") {
    return rows.map((row) => ({
      ...row,
      auth_user_id: row.auth_user_id ? "[redacted]" : null,
    }));
  }

  return rows;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const adminClient = getAdminClient();

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
      return jsonResponse({ error: "Only parent/guardian can export family data." }, 403);
    }

    const includeSensitive = Boolean(body.include_sensitive);
    const exportType = body.export_type ?? "json";

    const exportData: Record<string, unknown> = {
      meta: {
        app: "Family Dock",
        export_type: exportType,
        exported_at: new Date().toISOString(),
        family_id: body.family_id,
        include_sensitive: includeSensitive,
        warning: "This file may contain family schedule, child learning, route and payment data. Store it securely.",
      },
      tables: {},
      errors: {},
    };

    const tableCounts: Record<string, number> = {};
    const tablesToExport = includeSensitive
      ? [...EXPORT_TABLES, ...Array.from(SENSITIVE_TABLES)]
      : EXPORT_TABLES;

    for (const table of tablesToExport) {
      const result = await exportTable(adminClient, table, body.family_id);

      if (result.ok) {
        const rows = redactRows(table, result.rows, includeSensitive);
        (exportData.tables as Record<string, unknown>)[table] = rows;
        tableCounts[table] = rows.length;
      } else {
        (exportData.errors as Record<string, unknown>)[table] = result.error;
        tableCounts[table] = -1;
      }
    }

    if (exportType === "summary") {
      exportData.tables = {};
      exportData.summary_only = true;
    }

    const fileName = `family-dock-export-${body.family_id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;

    const { data: log, error: logError } = await adminClient
      .from("family_data_export_logs")
      .insert({
        family_id: body.family_id,
        created_by: role.member_id,
        export_type: exportType,
        include_sensitive: includeSensitive,
        table_counts: tableCounts,
        file_name: fileName,
        status: "created",
      })
      .select("*")
      .single();

    if (logError) throw new Error(logError.message);

    return jsonResponse({
      ok: true,
      export_log: log,
      file_name: fileName,
      table_counts: tableCounts,
      export_data: exportData,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
