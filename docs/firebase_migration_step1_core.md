# Family Dock Firebase Migration Step 1 - Core

This patch starts the Supabase -> Firebase conversion.

It does **not** read or use any `.env` zip. Secrets must be entered manually in Firebase and local `.env.local`.

## What this step migrates

- Firebase Hosting config
- Firebase Auth session handling
- Cloud Firestore core data layer
- Firestore Security Rules
- Firebase Storage rules
- Parent family signup
- Parent login/logout
- Core data loading
- Core manual mutations:
  - events
  - homework
  - homework checklist items
  - payments
  - requests
  - places
  - homework attachments
- AI text flow now calls Firebase callable functions:
  - `parseAiCommand`
  - `commitAiActions`

## What is intentionally not fully migrated yet

- Child/homestay invite self-registration
- Admin/QA/release/cron panels
- Push notifications
- Route planner backed by Google Maps
- Reports/export
- Member account creation through Admin SDK

These should be Step 2/3. The goal of Step 1 is to make the family app start on Firebase without rebuilding everything at once.

## Firebase Console setup

Create a Firebase project and enable:

1. Authentication -> Email/Password
2. Firestore Database
3. Storage
4. Functions
5. Hosting

## Local setup

```bash
npm install
cp .env.firebase.example .env.local
```

Fill `.env.local` with your Firebase Web App config.

## Firebase CLI

```bash
npm install -g firebase-tools
firebase login
firebase use --add
```

Copy `.firebaserc.example` to `.firebaserc` or let `firebase use --add` create it.

## Deploy rules only first

```bash
firebase deploy --only firestore:rules,storage
```

## Set OpenAI secret for AI functions

```bash
firebase functions:secrets:set OPENAI_API_KEY
```

## Deploy functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## Run app locally

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

Then create a new family from the login screen.

## Deploy Hosting

```bash
npm run build
firebase deploy --only hosting
```

## Cost control without limiting AI usage

You asked not to limit AI usage count. This patch does not add AI usage caps.

Cost control should instead come from:

- only querying current family collections
- avoiding all-user/global queries
- keeping Calendar/Today queries scoped in later optimization steps
- keeping file upload size at 20MB max in Storage Rules
- putting Maps/OpenAI keys in Functions secrets, not browser env

## Firestore structure

```text
users/{uid}
families/{familyId}
families/{familyId}/members/{uidOrMemberId}
families/{familyId}/places/{placeId}
families/{familyId}/events/{eventId}
families/{familyId}/homework_tasks/{taskId}
families/{familyId}/homework_items/{itemId}
families/{familyId}/homework_attachments/{attachmentId}
families/{familyId}/requests/{requestId}
families/{familyId}/payments/{paymentId}
families/{familyId}/meal_plans/{mealId}
families/{familyId}/shopping_items/{itemId}
families/{familyId}/learning_records/{recordId}
families/{familyId}/learning_summaries/{summaryId}
families/{familyId}/ai_logs/{logId}
```
