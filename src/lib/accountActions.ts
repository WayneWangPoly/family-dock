import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebaseClient";

export type MemberAccountAction = "reset_password" | "disable" | "enable";

export async function runMemberAccountAction(input: {
  familyId: string;
  memberId: string;
  action: MemberAccountAction;
  newPassword?: string;
}) {
  const callable = httpsCallable(firebaseFunctions, "adminMemberAccountAction");
  const response = await callable({
    familyId: input.familyId,
    memberId: input.memberId,
    action: input.action,
    newPassword: input.newPassword,
  });
  return response.data;
}