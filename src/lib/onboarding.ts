import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateFamilyAccountInput = {
  parentEmail: string;
  parentPassword: string;
  parentDisplayName: string;
  familyName: string;
  timezone?: string | null;
  stateRegion?: string | null;
  schoolLevel?: string | null;
};

export async function createFamilyAccount(
  supabase: SupabaseClient,
  input: CreateFamilyAccountInput,
) {
  const { data, error } = await supabase.functions.invoke("public-create-family-account", {
    body: {
      parent_email: input.parentEmail,
      parent_password: input.parentPassword,
      parent_display_name: input.parentDisplayName,
      family_name: input.familyName,
      timezone: input.timezone ?? "Australia/Adelaide",
      state_region: input.stateRegion ?? "SA",
      school_level: input.schoolLevel ?? "primary",
    },
  });

  if (error) throw error;

  return data;
}

export type BulkMemberInviteInput = {
  familyId: string;
  members?: Array<{
    display_name: string;
    role: "child" | "homestay";
    email_hint?: string | null;
  }>;
  inviteExistingUnlinked?: boolean;
  expiresInDays?: number;
  baseUrl?: string;
};

export async function bulkMemberInvites(
  supabase: SupabaseClient,
  input: BulkMemberInviteInput,
) {
  const { data, error } = await supabase.functions.invoke("admin-bulk-member-invites", {
    body: {
      family_id: input.familyId,
      members: input.members ?? [],
      invite_existing_unlinked: input.inviteExistingUnlinked ?? false,
      expires_in_days: input.expiresInDays ?? 14,
      base_url: input.baseUrl ?? window.location.origin,
    },
  });

  if (error) throw error;

  return data;
}

export function parseMemberCsv(text: string): Array<{ display_name: string; role: "child" | "homestay"; email_hint: string | null }> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const parts = line.split(",").map((part) => part.trim());
    const displayName = parts[0] ?? "";
    const roleRaw = (parts[1] ?? "child").toLowerCase();
    const emailHint = parts[2] ?? "";

    const role = roleRaw === "homestay" ? "homestay" : "child";

    return {
      display_name: displayName,
      role,
      email_hint: emailHint || null,
    };
  });
}

export function formatInviteResultsForCopy(results: any[]) {
  return results
    .map((item) => {
      return `${item.member.display_name} (${item.member.role})\nCode: ${item.invite.invite_code}\nLink: ${item.invite.registration_link}`;
    })
    .join("\n\n");
}
