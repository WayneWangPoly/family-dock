import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebaseClient";

export type CreateFamilyAccountInput = {
  parentEmail: string;
  parentPassword: string;
  parentDisplayName: string;
  familyName: string;
  timezone?: string | null;
  stateRegion?: string | null;
  schoolLevel?: string | null;
};

export async function createFamilyAccount(input: CreateFamilyAccountInput) {
  const callable = httpsCallable(firebaseFunctions, "createFamilyAccount");
  const response = await callable({
    parentEmail: input.parentEmail,
    parentPassword: input.parentPassword,
    parentDisplayName: input.parentDisplayName,
    familyName: input.familyName,
    timezone: input.timezone ?? "Australia/Adelaide",
    stateRegion: input.stateRegion ?? "SA",
    schoolLevel: input.schoolLevel ?? "primary",
  });
  return response.data;
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

export async function bulkMemberInvites(input: BulkMemberInviteInput) {
  const callable = httpsCallable(firebaseFunctions, "bulkMemberInvites");
  const response = await callable({
    familyId: input.familyId,
    members: input.members ?? [],
    inviteExistingUnlinked: input.inviteExistingUnlinked ?? false,
    expiresInDays: input.expiresInDays ?? 14,
    baseUrl: input.baseUrl ?? window.location.origin,
  });
  return response.data as { ok: boolean; results: any[] };
}

export function parseMemberCsv(text: string): Array<{
  display_name: string;
  role: "child" | "homestay";
  email_hint: string | null;
}> {
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
    return { display_name: displayName, role, email_hint: emailHint || null };
  });
}

export function formatInviteResultsForCopy(results: any[]) {
  return results
    .map((item) => {
      return `${item.member.display_name} (${item.member.role})\nCode: ${item.invite.invite_code}\nLink: ${item.invite.registration_link}`;
    })
    .join("\n\n");
}