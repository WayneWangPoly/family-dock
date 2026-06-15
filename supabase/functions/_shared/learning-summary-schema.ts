export const learningSummaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary_title",
    "evidence_count",
    "overall_summary",
    "progress",
    "recurring_issues",
    "current_bottleneck",
    "next_steps",
    "parent_focus_points",
    "questions_for_teacher",
    "evidence_refs",
    "confidence",
  ],
  properties: {
    summary_title: { type: "string" },
    evidence_count: { type: "integer", minimum: 0 },
    overall_summary: { type: "string" },
    progress: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["point", "evidence_ids", "why_it_matters"],
        properties: {
          point: { type: "string" },
          evidence_ids: { type: "array", items: { type: "string" } },
          why_it_matters: { type: "string" },
        },
      },
    },
    recurring_issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["issue", "frequency_estimate", "pattern", "evidence_ids"],
        properties: {
          issue: { type: "string" },
          frequency_estimate: { type: "integer", minimum: 0 },
          pattern: { type: "string" },
          evidence_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
    current_bottleneck: { type: "string" },
    next_steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "reason", "timeframe", "evidence_ids"],
        properties: {
          action: { type: "string" },
          reason: { type: "string" },
          timeframe: { type: "string" },
          evidence_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
    parent_focus_points: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["focus", "how_to_observe"],
        properties: {
          focus: { type: "string" },
          how_to_observe: { type: "string" },
        },
      },
    },
    questions_for_teacher: {
      type: "array",
      items: { type: "string" },
    },
    evidence_refs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "source_type", "date", "quote_or_fact"],
        properties: {
          id: { type: "string" },
          source_type: {
            type: "string",
            enum: ["learning_record", "homework_task", "homework_item", "calendar_event"],
          },
          date: { type: ["string", "null"] },
          quote_or_fact: { type: "string" },
        },
      },
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
  },
} as const;

export const openAILearningSummaryResponseFormat = {
  type: "json_schema",
  name: "family_dock_learning_summary",
  strict: true,
  schema: learningSummaryJsonSchema,
} as const;
