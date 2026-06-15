import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateMemberInviteInput = {
  familyId: string;
  memberId: string;
  expiresInDays?: number;
};

export async function createMemberInvite(
  supabase: SupabaseClient,
  input: CreateMemberInviteInput,
) {
  const { data, error } = await supabase.functions.invoke("admin-create-member-invite", {
    body: {
      family_id: input.familyId,
      member_id: input.memberId,
      expires_in_days: input.expiresInDays ?? 14,
    },
  });

  if (error) throw error;

  return data;
}

export type SelfRegisterMemberInput = {
  inviteCode: string;
  email: string;
  password: string;
};

export async function selfRegisterMember(
  supabase: SupabaseClient,
  input: SelfRegisterMemberInput,
) {
  const { data, error } = await supabase.functions.invoke("self-register-member-account", {
    body: {
      invite_code: input.inviteCode,
      email: input.email,
      password: input.password,
    },
  });

  if (error) throw error;

  return data;
}
