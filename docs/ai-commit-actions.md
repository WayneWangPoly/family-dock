# AI Commit Actions API

Endpoint: `POST /functions/v1/ai-commit-actions`

Purpose: commit parent-confirmed AI actions into Supabase.

Every action writes a row to `action_logs`.

V1 commits sequentially rather than as a single database transaction. Step 4 will add Undo based on `action_logs`.
