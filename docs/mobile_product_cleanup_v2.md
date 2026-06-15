# Mobile Product Cleanup v2

## What changed

This patch focuses on mobile polish before GitHub/deployment:

- removes the developer-facing login copy shown to parents
- replaces the mobile calendar with a compact month grid + selected-day agenda
- adds a mobile More drawer because the desktop sidebar is hidden on phones
- hides floating AI/quick-action buttons on mobile so the bottom nav is not crowded
- makes global mobile spacing, cards, buttons and badges denser
- adds AI recording fallback for browsers that do not support direct speech recognition
- adds `ai-transcribe-audio` Edge Function for recording-to-text fallback
- trims mobile topbar wording and hides noisy status badges on phones

## Supabase command

Deploy the new transcription function:

```bash
npx supabase functions deploy ai-transcribe-audio --project-ref uicdrdtehdszaeprdawh
```

It requires the existing `OPENAI_API_KEY` secret:

```bash
npx supabase secrets set OPENAI_API_KEY="YOUR_KEY" --project-ref uicdrdtehdszaeprdawh
```

Optional model override:

```bash
npx supabase secrets set AI_TRANSCRIBE_MODEL="gpt-4o-mini-transcribe" --project-ref uicdrdtehdszaeprdawh
```

## Build verification

Ran successfully after refreshing dependencies:

```bash
npm run build
```

The uploaded lockfile was out of sync with `package.json`, so `npm ci` failed before `npm install` refreshed the lockfile. This patch includes the refreshed `package-lock.json`.
