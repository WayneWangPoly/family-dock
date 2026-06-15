import { supabase } from "./supabaseClient";

export type FamilyMemberInvite = {
  id: string;
  family_id: string;
  member_id: string;
  invite_code: string;
  intended_role: string;
  expires_at: string;
  used_at: string | null;
  used_by_auth_user_id: string | null;
  created_at: string;
};

export async function loadFamilyMemberInvites(familyId: string) {
  const { data, error } = await supabase
    .from("family_member_invites")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FamilyMemberInvite[];
}

export function getInviteStatus(invite: FamilyMemberInvite) {
  if (invite.used_at) return "used";
  if (new Date(invite.expires_at).getTime() < Date.now()) return "expired";
  return "unused";
}

export function buildInviteLink(inviteCode: string) {
  return `${window.location.origin}/?invite=${encodeURIComponent(inviteCode)}`;
}
