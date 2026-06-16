import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseFunctions, firestore } from "./firebaseClient";

export type SummarizeLearningInput = {
  familyId: string;
  childId?: string | null;
  childName?: string | null;
  courseName?: string | null;
  rangeType: "week" | "month" | "term" | "year" | "custom";
  startDate: string;
  endDate: string;
  saveSummary?: boolean;
};

export async function summarizeLearning(input: SummarizeLearningInput) {
  const callable = httpsCallable(firebaseFunctions, "summarizeLearning");
  const response = await callable(input);
  return response.data;
}

export async function loadLearningSummaries(familyId: string, rowLimit = 20) {
  const ref = collection(firestore, "families", familyId, "learning_summaries");
  const snapshot = await getDocs(query(ref, orderBy("created_at", "desc"), limit(rowLimit)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}