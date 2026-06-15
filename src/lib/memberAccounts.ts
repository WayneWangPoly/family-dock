import type { SupabaseClient } from "@supabase/supabase-js";

export type UpsertMemberAccountInput = {
  familyId: string;
  memberId: string;
  email: string;
  password: string;
};

export async function upsertMemberAccount(
  supabase: SupabaseClient,
  input: UpsertMemberAccountInput,
) {
  const { data, error } = await supabase.functions.invoke("admin-upsert-member-account", {
    body: {
      family_id: input.familyId,
      member_id: input.memberId,
      email: input.email,
      password: input.password,
    },
  });

  if (error) throw error;

  return data;
}

export function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "!@#$";
  let password = "";

  for (let i = 0; i < 10; i += 1) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }

  password += symbols[Math.floor(Math.random() * symbols.length)];
  password += String(Math.floor(Math.random() * 90) + 10);

  return password;
}
