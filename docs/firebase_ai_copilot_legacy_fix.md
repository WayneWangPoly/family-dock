# Firebase AI Copilot Legacy Fix

Fixes this error:

`Legacy Supabase function "ai-copilot-planner" has not been migrated to Firebase.`

## What changed

`src/lib/supabaseClient.ts` now forwards old AI copilot calls:

- `ai-copilot-planner` -> Firebase `parseAiCommand`
- `ai-copilot-commit` -> Firebase `commitAiActions`

It adapts the Firebase AI response into the old copilot plan shape so existing UI components can still render the review/confirm screen.

## Deploy

After applying this patch, rebuild and deploy hosting:

```bash
npm run build
firebase deploy --only hosting
```

Firebase Functions still need to be deployed separately for AI to actually work.
