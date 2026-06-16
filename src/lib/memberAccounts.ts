import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseFunctions, firestore } from "./firebaseClient";
import type { FamilyMember } from "./familyDataTypes";

export type UpsertMemberAccountInput = {
  familyId: string;
  memberId: string;
  email: string;
  password: string;
};

type CreateMemberLoginResult = {
  ok: boolean;
  uid: string;
  member_id: string;
};

export async function upsertMemberAccount(input: UpsertMemberAccountInput) {
  const memberSnap = await getDoc(doc(firestore, "families", input.familyId, "members", input.memberId));
  if (!memberSnap.exists()) {
    throw new Error("Member not found in Firestore.");
  }

  const member = { id: memberSnap.id, ...memberSnap.data() } as FamilyMember;
  const callable = httpsCallable(firebaseFunctions, "createMemberLogin");
  const response = await callable({
    familyId: input.familyId,
    memberId: input.memberId,
    displayName: member.display_name,
    email: input.email,
    password: input.password,
    role: member.role,
    color: member.color ?? null,
    defaultNavigationApp: member.default_navigation_app ?? "google",
  });

  const data = response.data as CreateMemberLoginResult;
  return {
    member: { ...member, id: data.member_id, auth_user_id: data.uid, can_login: true, email: input.email },
    account: { created: true, email: input.email, uid: data.uid },
  };
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