# Learning Summary AI

## Endpoint

```text
POST /functions/v1/ai-summarize-learning
```

## Request

```json
{
  "family_id": "uuid",
  "child_name": "大女儿",
  "course_name": "击剑",
  "range_type": "month",
  "start_date": "2026-06-01",
  "end_date": "2026-06-30",
  "save_summary": true
}
```

## Response

```json
{
  "ok": true,
  "parsed": {
    "summary_title": "...",
    "overall_summary": "...",
    "progress": [],
    "recurring_issues": [],
    "current_bottleneck": "...",
    "next_steps": [],
    "parent_focus_points": [],
    "questions_for_teacher": [],
    "evidence_refs": [],
    "confidence": 0.86
  },
  "saved_summary": {}
}
```

## Why this endpoint exists

The course notebook should not only store notes. It should help parents answer:

- What has improved recently?
- What problem repeats?
- Is this a one-off issue or a pattern?
- What should we ask the teacher/coach?
- What should we focus on before an exam or competition?
- What should parents observe next time?

## Evidence principle

Every important claim should point to evidence IDs from:

- learning_records
- homework_tasks
- homework_items
- calendar_events

This keeps AI from producing vague "good progress, keep trying" summaries.
