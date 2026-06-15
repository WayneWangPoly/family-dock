/*
Patch note:
Your existing src/lib/familyDataTypes.ts should add these types/fields.

Add:

export type LearningSummary = {
  id: string;
  family_id: string;
  child_id: string | null;
  course_name: string | null;
  range_type: string;
  start_date: string;
  end_date: string;
  summary_title: string | null;
  evidence_count: number;
  overall_summary: string | null;
  progress: unknown[];
  recurring_issues: unknown[];
  current_bottleneck: string | null;
  next_steps: unknown[];
  parent_focus_points: unknown[];
  questions_for_teacher: unknown[];
  evidence_refs: unknown[];
  created_at: string;
};

Then add to FamilyData:

learningSummaries: LearningSummary[];

If you do not add this, NotebookPanel still compiles because it treats learningSummaries as optional,
but full typed data loading needs this patch.
*/
