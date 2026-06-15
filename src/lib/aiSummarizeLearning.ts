import type { SupabaseClient } from "@supabase/supabase-js";

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

export async function summarizeLearning(
  supabase: SupabaseClient,
  input: SummarizeLearningInput,
) {
  const { data, error } = await supabase.functions.invoke("ai-summarize-learning", {
    body: {
      family_id: input.familyId,
      child_id: input.childId ?? null,
      child_name: input.childName ?? null,
      course_name: input.courseName ?? null,
      range_type: input.rangeType,
      start_date: input.startDate,
      end_date: input.endDate,
      save_summary: input.saveSummary ?? true,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function loadLearningSummaries(
  supabase: SupabaseClient,
  familyId: string,
  limit = 20,
) {
  const { data, error } = await supabase
    .from("learning_summaries")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}
