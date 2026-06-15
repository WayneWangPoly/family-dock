# Firebase AI path fix

This patch fixes the AI screen showing:

`This Supabase path has not been migrated to Firebase yet.`

## What changed

- Re-applies Firebase versions of:
  - `src/lib/aiParseCommand.ts`
  - `src/lib/aiCommitActions.ts`
  - `src/hooks/useAiCommandFlow.ts`
- Replaces `src/lib/supabaseClient.ts` with a compatibility shim.
- Legacy calls to:
  - `supabase.functions.invoke("ai-parse-command")`
  - `supabase.functions.invoke("ai-commit-actions")`

now forward to Firebase callable functions:

- `parseAiCommand`
- `commitAiActions`

Other old Supabase database/admin paths remain blocked intentionally.

## Still required

AI will only fully work after Firebase Functions are deployed and `OPENAI_API_KEY` is set as a Firebase secret.
