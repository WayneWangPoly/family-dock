import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseFunctions, firestore } from "./firebaseClient";

export type UndoFamilyActionInput = {
  familyId: string;
  actionLogId: string;
};

export async function undoFamilyAction(input: UndoFamilyActionInput) {
  const callable = httpsCallable(firebaseFunctions, "undoFamilyAction");
  const response = await callable(input);
  return response.data;
}

export async function loadRecentUndoableActions(familyId: string, rowLimit = 10) {
  const ref = collection(firestore, "families", familyId, "action_logs");
  const snapshot = await getDocs(query(
    ref,
    where("can_undo", "==", true),
    where("undone", "==", false),
    orderBy("created_at", "desc"),
    limit(rowLimit),
  ));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}