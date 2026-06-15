import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebaseClient";

export type CommitFamilyActionsInput = {
  familyId: string;
  aiInteractionId?: string | null;
  actions: unknown[];
};

export async function commitFamilyActions(_unused: unknown, input: CommitFamilyActionsInput) {
  const callable = httpsCallable(firebaseFunctions, "commitAiActions");
  const result = await callable({
    family_id: input.familyId,
    ai_interaction_id: input.aiInteractionId ?? null,
    confirmed: true,
    actions: input.actions,
  });
  return result.data;
}
