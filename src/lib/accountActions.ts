import type { SupabaseClient } from "@supabase/supabase-js";
export type MemberAccountAction = "reset_password" | "disable" | "enable";

export async function runMemberAccountAction(
  supabase: SupabaseClient,
  input: { familyId: string; memberId: string; action: MemberAccountAction; newPassword?: string },
) {
  const { data, error } = await supabase.functions.invoke("admin-member-account-actions", {
    body: {
      family_id: input.familyId,
      member_id: input.memberId,
      action: input.action,
      new_password: input.newPassword,
    },
  });
  if (error) throw error;
  return data;
}
