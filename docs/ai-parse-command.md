# AI Parse Command API Design

## Endpoint

Supabase Edge Function:

```text
POST /functions/v1/ai-parse-command
```

## Purpose

Convert a parent's natural-language command into structured draft actions.

This endpoint does not create calendar events, payments, homework tasks, requests, or learning records. It only returns proposed actions and saves an `ai_interactions` record.

## Supported intents

- `create_calendar_event`
- `create_homework_task`
- `create_request`
- `create_payment`
- `create_meal_or_recipe`
- `create_learning_record`
- `multi_action`
- `ask_clarifying_question`
- `unknown`

## Example: course + payment

Input:

```json
{
  "family_id": "fam_uuid",
  "transcript": "给大女儿加一个击剑课，每周三下午4点半，John教练，地点Fencing Club，费用420刀，下周五前付",
  "input_type": "text"
}
```

Expected shape:

```json
{
  "intent": "multi_action",
  "confidence": 0.9,
  "needs_clarification": false,
  "missing_fields": [],
  "actions": [
    {
      "type": "create_calendar_event",
      "child_name": "大女儿",
      "title": "击剑课",
      "start_time": "16:30",
      "weekday": "Wednesday",
      "place_name": "Fencing Club",
      "teacher_name": "John"
    },
    {
      "type": "create_payment",
      "child_name": "大女儿",
      "title": "击剑课费用",
      "amount": 420,
      "currency": "AUD",
      "due_date": "2026-06-12"
    }
  ]
}
```

## Example: missing fields

Input:

```json
{
  "family_id": "fam_uuid",
  "transcript": "给大女儿加一个击剑课，每周三下午4点半"
}
```

Expected:

```json
{
  "intent": "ask_clarifying_question",
  "needs_clarification": true,
  "missing_fields": ["start_date", "end_date", "place_name"],
  "clarifying_question": "这个击剑课从哪一天开始？地点是哪一个击剑馆？是长期每周三，还是只加一节？"
}
```

## Notes

The JSON schema intentionally keeps the action format stable by using nullable fields. Step 3 will validate each action type again before committing database changes.
