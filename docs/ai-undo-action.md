# AI Undo Action API

## Endpoint

```text
POST /functions/v1/ai-undo-action
```

## Request

```json
{
  "family_id": "uuid",
  "action_log_id": "uuid"
}
```

## Response

```json
{
  "ok": true,
  "action_log_id": "uuid",
  "undone": true,
  "target_table": "payments",
  "target_id": "uuid"
}
```

## Flow

```text
AI parse
→ parent confirm
→ commit action
→ create action_logs
→ parent clicks Undo
→ ai-undo-action deletes target record
→ action_logs.undone = true
```

## Security

- Requires authenticated Supabase user.
- Checks `family_user_roles`.
- v1 allows only `parent` and `guardian`.
- Uses `SUPABASE_SERVICE_ROLE_KEY` only inside Edge Function.

## Recommended frontend behavior

After commit, show:

```text
Undo last action
```

When clicked:

1. call `ai-undo-action`
2. refresh family data
3. hide undo button if successful

## Test SQL

Before undo:

```sql
select id, action_type, target_table, target_id, undone
from public.action_logs
where can_undo = true
order by created_at desc
limit 5;
```

After undo:

```sql
select id, action_type, target_table, target_id, undone, undone_at
from public.action_logs
order by created_at desc
limit 5;
```
