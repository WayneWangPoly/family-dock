import { collection, doc, getDocs, limit, orderBy, query, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { FamilyData } from "./familyDataTypes";
import { firebaseFunctions, firestore } from "./firebaseClient";

export type LearningProgressSummary = { id: string; family_id: string; child_id: string | null; created_by: string | null; period_type: "week" | "month" | "term" | "custom"; period_start: string; period_end: string; subject: string | null; title: string; executive_summary: string; narrative_text: string; strengths: string[]; concerns: string[]; observed_patterns: string[]; recommendations: string[]; parent_actions: string[]; child_actions: string[]; teacher_questions: string[]; next_goals: string[]; missing_evidence: string[]; summary_json: Record<string, unknown>; source_note_ids: string[]; source_homework_ids: string[]; source_event_ids: string[]; evidence_count: number; confidence: number; status: "draft" | "final" | "archived"; created_at: string; updated_at: string; };

function withId<T>(snapshot: { id: string; data: () => Record<string, unknown> }) { return { id: snapshot.id, ...snapshot.data() } as T; }

export function defaultMonthRange() { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1); const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }; }
export function defaultWeekRange() { const now = new Date(); const day = now.getDay() || 7; const start = new Date(now); start.setDate(now.getDate() - day + 1); const end = new Date(start); end.setDate(start.getDate() + 6); return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }; }

export async function generateProgressSummary(args: { data: FamilyData; childId: string; periodType: "week" | "month" | "term" | "custom"; periodStart: string; periodEnd: string; subject?: string | null; language: "zh" | "en" | "bilingual"; save?: boolean; }) {
  const fn = httpsCallable(firebaseFunctions, "generateProgressSummary");
  const result = await fn({ family_id: args.data.family.id, child_id: args.childId, period_type: args.periodType, period_start: args.periodStart, period_end: args.periodEnd, subject: args.subject || null, language: args.language, save: args.save ?? true });
  return result.data as { ok: boolean; saved: boolean; summary: LearningProgressSummary; evidence_counts: { notes: number; homework: number; events: number } };
}

export async function loadProgressSummaries(familyId: string) {
  const snap = await getDocs(query(collection(firestore, "families", familyId, "learning_progress_summaries"), orderBy("created_at", "desc"), limit(30)));
  return snap.docs.map((docSnap) => withId<LearningProgressSummary>(docSnap));
}

export async function updateProgressSummaryStatus(args: { familyId: string; summaryId: string; status: "draft" | "final" | "archived"; }) {
  await updateDoc(doc(firestore, "families", args.familyId, "learning_progress_summaries", args.summaryId), { status: args.status, updated_at: new Date().toISOString() });
}

export function formatProgressSummaryForCopy(summary: LearningProgressSummary, childName: string) {
  const sections = [summary.title, `Child: ${childName}`, `Period: ${summary.period_start} to ${summary.period_end}`, summary.subject ? `Subject: ${summary.subject}` : "", `Status: ${summary.status}`, `Evidence count: ${summary.evidence_count}`, `Confidence: ${Math.round(Number(summary.confidence) * 100)}%`, "", "Executive summary", summary.executive_summary, "", "Narrative", summary.narrative_text, "", "Strengths", ...summary.strengths.map((item) => `- ${item}`), "", "Concerns / areas to improve", ...summary.concerns.map((item) => `- ${item}`), "", "Observed patterns", ...summary.observed_patterns.map((item) => `- ${item}`), "", "Recommendations", ...summary.recommendations.map((item) => `- ${item}`), "", "Parent actions", ...summary.parent_actions.map((item) => `- ${item}`), "", "Child actions", ...summary.child_actions.map((item) => `- ${item}`), "", "Teacher / coach questions", ...summary.teacher_questions.map((item) => `- ${item}`), "", "Next goals", ...summary.next_goals.map((item) => `- ${item}`), "", "Missing evidence", ...summary.missing_evidence.map((item) => `- ${item}`)].filter((line) => line !== null && line !== undefined);
  return sections.join("\n");
}
