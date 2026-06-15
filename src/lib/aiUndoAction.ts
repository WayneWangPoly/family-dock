import type { SupabaseClient } from "@supabase/supabase-js";

export type UndoFamilyActionInput = {
  familyId: string;
  actionLogId: string;
};

export async function undoFamilyAction(
  supabase: SupabaseClient,
  input: UndoFamilyActionInput,
) {
  const { data, error } = await supabase.functions.invoke("ai-undo-action", {
    body: {
      family_id: input.familyId,
      action_log_id: input.actionLogId,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function loadRecentUndoableActions(
  supabase: SupabaseClient,
  familyId: string,
  limit = 10,
) {
  const { data, error } = await supabase
    .from("action_logs")
    .select("id, action_type, target_table, target_id, can_undo, undone, created_at")
    .eq("family_id", familyId)
    .eq("can_undo", true)
    .eq("undone", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}
