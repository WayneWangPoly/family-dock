import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentFamilyRole } from "./familyDataApi";

export type EditingLock = {
  id: string;
  family_id: string;
  target_table: string;
  target_id: string;
  locked_by: string | null;
  locked_at: string;
  expires_at: string;
  family_members?: {
    id: string;
    display_name: string;
    role: string;
  } | null;
};

export type LockTarget = {
  familyId: string;
  targetTable: string;
  targetId: string;
};

export function getLockExpiry(seconds = 75): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function cleanupExpiredEditingLocks(
  supabase: SupabaseClient,
  familyId: string,
) {
  const { error } = await supabase
    .from("editing_locks")
    .delete()
    .eq("family_id", familyId)
    .lt("expires_at", new Date().toISOString());

  if (error) throw error;
}

export async function loadEditingLock(
  supabase: SupabaseClient,
  target: LockTarget,
): Promise<EditingLock | null> {
  const { data, error } = await supabase
    .from("editing_locks")
    .select(`
      *,
      family_members:locked_by (
        id,
        display_name,
        role
      )
    `)
    .eq("family_id", target.familyId)
    .eq("target_table", target.targetTable)
    .eq("target_id", target.targetId)
    .maybeSingle();

  if (error) throw error;

  if (!data) return null;

  if (new Date(data.expires_at).getTime() < Date.now()) {
    await cleanupExpiredEditingLocks(supabase, target.familyId);
    return null;
  }

  return data as EditingLock;
}

export async function acquireEditingLock(
  supabase: SupabaseClient,
  target: LockTarget,
): Promise<EditingLock> {
  const role = await getCurrentFamilyRole();

  const existing = await loadEditingLock(supabase, target);

  if (existing && existing.locked_by && existing.locked_by !== role.member_id) {
    throw new Error(
      `${existing.family_members?.display_name ?? "Someone"} is editing this item.`,
    );
  }

  const payload = {
    family_id: target.familyId,
    target_table: target.targetTable,
    target_id: target.targetId,
    locked_by: role.member_id,
    locked_at: new Date().toISOString(),
    expires_at: getLockExpiry(),
  };

  const { data, error } = await supabase
    .from("editing_locks")
    .upsert(payload, {
      onConflict: "family_id,target_table,target_id",
    })
    .select(`
      *,
      family_members:locked_by (
        id,
        display_name,
        role
      )
    `)
    .single();

  if (error) throw error;

  return data as EditingLock;
}

export async function heartbeatEditingLock(
  supabase: SupabaseClient,
  target: LockTarget,
): Promise<EditingLock | null> {
  const role = await getCurrentFamilyRole();

  if (!role.member_id) return null;

  const { data, error } = await supabase
    .from("editing_locks")
    .update({
      expires_at: getLockExpiry(),
    })
    .eq("family_id", target.familyId)
    .eq("target_table", target.targetTable)
    .eq("target_id", target.targetId)
    .eq("locked_by", role.member_id)
    .select(`
      *,
      family_members:locked_by (
        id,
        display_name,
        role
      )
    `)
    .maybeSingle();

  if (error) throw error;

  return data as EditingLock | null;
}

export async function releaseEditingLock(
  supabase: SupabaseClient,
  target: LockTarget,
) {
  const role = await getCurrentFamilyRole();

  if (!role.member_id) return;

  const { error } = await supabase
    .from("editing_locks")
    .delete()
    .eq("family_id", target.familyId)
    .eq("target_table", target.targetTable)
    .eq("target_id", target.targetId)
    .eq("locked_by", role.member_id);

  if (error) throw error;
}
