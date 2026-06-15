import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  ActionLogRow,
  isUndoableCreateAction,
  isUndoableTargetTable,
  UndoActionBody,
} from "../_shared/undo-action-types.ts";

type RoleRow = {
  member_id: string | null;
  role: string;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getSupabaseAdminClient() {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function getSupabaseUserClient(authHeader: string) {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  return createClient(supabaseUrl, anonKey, {
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

async function loadActionLog(adminClient: any, familyId: string, actionLogId: string): Promise<ActionLogRow> {
  const { data, error } = await adminClient
    .from("action_logs")
    .select("*")
    .eq("family_id", familyId)
    .eq("id", actionLogId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Action log not found.");

  return data as ActionLogRow;
}

async function deleteTargetRecord(adminClient: any, log: ActionLogRow) {
  if (!isUndoableCreateAction(log.action_type)) {
    throw new Error(`Action type is not undoable in v1: ${log.action_type}`);
  }

  if (!isUndoableTargetTable(log.target_table)) {
    throw new Error(`Target table is not undoable in v1: ${log.target_table}`);
  }

  if (!log.target_id) {
    throw new Error("Action log target_id is missing.");
  }

  if (log.target_table === "meal_plans") {
    // The schema uses source_meal_plan_id on shopping_items with ON DELETE SET NULL,
    // so we delete generated shopping items first to make Undo feel natural.
    const { error: shoppingError } = await adminClient
      .from("shopping_items")
      .delete()
      .eq("family_id", log.family_id)
      .eq("source_meal_plan_id", log.target_id);

    if (shoppingError) throw new Error(shoppingError.message);
  }

  const { data: existing, error: existingError } = await adminClient
    .from(log.target_table)
    .select("*")
    .eq("family_id", log.family_id)
    .eq("id", log.target_id)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  // Idempotent behavior: if the target was already manually deleted,
  // still mark this log as undone.
  if (!existing) {
    return { already_deleted: true };
  }

  const { error: deleteError } = await adminClient
    .from(log.target_table)
    .delete()
    .eq("family_id", log.family_id)
    .eq("id", log.target_id);

  if (deleteError) throw new Error(deleteError.message);

  return { already_deleted: false, deleted_record: existing };
}

async function markActionUndone(adminClient: any, log: ActionLogRow, actorMemberId: string | null, undoResult: unknown) {
  const nextAfterData = {
    original_after_data: log.after_data,
    undo_result: undoResult,
    undone_by: actorMemberId,
  };

  const { data, error } = await adminClient
    .from("action_logs")
    .update({
      undone: true,
      undone_at: new Date().toISOString(),
      after_data: nextAfterData,
    })
    .eq("family_id", log.family_id)
    .eq("id", log.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const body = (await req.json()) as UndoActionBody;

    if (!body.family_id) return jsonResponse({ error: "family_id is required" }, 400);
    if (!body.action_log_id) return jsonResponse({ error: "action_log_id is required" }, 400);

    const adminClient = getSupabaseAdminClient();
    const userClient = getSupabaseUserClient(authHeader);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const roleRow = await getActorRole(adminClient, body.family_id, user.id);

    if (!["parent", "guardian"].includes(roleRow.role)) {
      return jsonResponse({ error: "Only parent/guardian can undo actions in v1" }, 403);
    }

    const log = await loadActionLog(adminClient, body.family_id, body.action_log_id);

    if (!log.can_undo) return jsonResponse({ error: "This action cannot be undone." }, 400);
    if (log.undone) {
      return jsonResponse({
        ok: true,
        already_undone: true,
        action_log_id: log.id,
        undone_at: log.undone_at,
      });
    }

    const undoResult = await deleteTargetRecord(adminClient, log);
    const updatedLog = await markActionUndone(adminClient, log, roleRow.member_id, undoResult);

    return jsonResponse({
      ok: true,
      action_log_id: log.id,
      undone: true,
      target_table: log.target_table,
      target_id: log.target_id,
      undo_result: undoResult,
      updated_log: updatedLog,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
