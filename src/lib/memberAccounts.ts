import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebaseClient";

export type UpsertMemberAccountInput = {
  familyId: string;
  memberId?: string | null;
  email: string;
  password: string;
  displayName?: string;
  role?: "parent" | "guardian" | "child" | "homestay";
  color?: string | null;
  defaultNavigationApp?: string;
};

export async function upsertMemberAccount(
  _legacyClient: unknown,
  input: UpsertMemberAccountInput,
) {
  const callable = httpsCallable(firebaseFunctions, "createMemberLogin");
  const result = await callable({
    familyId: input.familyId,
    memberId: input.memberId ?? null,
    email: input.email,
    password: input.password,
    displayName: input.displayName ?? input.email.split("@")[0],
    role: input.role ?? "child",
    color: input.color ?? null,
    defaultNavigationApp: input.defaultNavigationApp ?? "google",
  });
  return result.data;
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
