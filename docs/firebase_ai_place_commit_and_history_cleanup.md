# Firebase AI place commit + history cleanup

Fixes two issues after the Firebase migration:

1. AI could review a new location/place but did not save it.
2. The old AI History tab opened a Supabase-only module and showed a migration error.

## Changed

- `src/lib/aiCopilot.ts`
  - Replaces legacy Supabase AI copilot calls with Firebase callable functions.
  - Adds `place` as a committable action type.
  - Sends reviewed `place` actions to `commitAiActions`.

- `src/components/panels/AICopilotPanel.tsx`
  - Removes the old `AI history` tab.
  - Keeps only `Assistant` and `Progress reports`.

## Deploy

```bash
npm run build
firebase deploy --only hosting
```

No Functions deploy is required for this patch if your current `commitAiActions` function already supports `place` actions.
