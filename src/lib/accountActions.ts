import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebaseClient";

export type MemberAccountAction = "reset_password" | "disable" | "enable";

export async function runMemberAccountAction(
  _legacyClient: unknown,
  input: {
    familyId: string;
    memberId: string;
    action: MemberAccountAction;
    newPassword?: string;
  },
) {
  const callable = httpsCallable(firebaseFunctions, "adminMemberAccountAction");
  const result = await callable({
    familyId: input.familyId,
    memberId: input.memberId,
    action: input.action,
    newPassword: input.newPassword ?? null,
  });
  return result.data;
}
