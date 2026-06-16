import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { firestore } from "./firebaseClient";

export type FamilyMemberInvite = { id: string; family_id: string; member_id: string; invite_code: string; intended_role: string; expires_at: string; used_at: string | null; used_by_auth_user_id: string | null; created_at: string; };

function withId<T>(snapshot: { id: string; data: () => Record<string, unknown> }) { return { id: snapshot.id, ...snapshot.data() } as T; }

export async function loadFamilyMemberInvites(familyId: string) {
  const snap = await getDocs(query(collection(firestore, "families", familyId, "family_member_invites"), orderBy("created_at", "desc")));
  return snap.docs.map((docSnap) => withId<FamilyMemberInvite>(docSnap));
}

export function getInviteStatus(invite: FamilyMemberInvite) {
  if (invite.used_at) return "used";
  if (new Date(invite.expires_at).getTime() < Date.now()) return "expired";
  return "unused";
}

export function buildInviteLink(inviteCode: string) {
  return `${window.location.origin}/?invite=${encodeURIComponent(inviteCode)}`;
}
