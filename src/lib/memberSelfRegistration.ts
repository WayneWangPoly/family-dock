import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebaseClient";

export type CreateMemberInviteInput = {
  familyId: string;
  memberId: string;
  expiresInDays?: number;
  baseUrl?: string;
};

export async function createMemberInvite(input: CreateMemberInviteInput) {
  const callable = httpsCallable(firebaseFunctions, "createMemberInvite");
  const response = await callable({
    familyId: input.familyId,
    memberId: input.memberId,
    expiresInDays: input.expiresInDays ?? 14,
    baseUrl: input.baseUrl ?? window.location.origin,
  });
  return response.data as { ok: boolean; invite: Record<string, any> };
}

export type SelfRegisterMemberInput = {
  inviteCode: string;
  email: string;
  password: string;
};

export async function selfRegisterMember(input: SelfRegisterMemberInput) {
  const callable = httpsCallable(firebaseFunctions, "selfRegisterMember");
  const response = await callable({
    inviteCode: input.inviteCode,
    email: input.email,
    password: input.password,
  });
  return response.data;
}