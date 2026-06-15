# Firebase Migration Step 2 — People, Locations, and bounded reads

This overlay is based on the uploaded project zip, then includes:

- all previous mobile consumer cleanup patches through v7
- Firebase Migration Step 1 core
- Firebase Migration Step 2 people/location management

## What is now Firebase-backed

- Firebase Auth login/signup
- Firestore family workspace
- Firestore members, places, events, homework, requests, payments, meals and notes
- Firebase Storage homework attachments
- Firebase Functions for AI parse/commit
- Firebase Function for parent-created child/homestay login accounts

## Step 2 additions

### People

Family → People now supports:

- Add person without login
- Edit person
- Remove person from the family
- Create login for a child / homestay / parent / guardian through Firebase Cloud Function

Parent-created logins are created through `createMemberLogin`, so the browser never needs Firebase Admin permissions.

### Locations

Family → Locations supports:

- Add location
- Edit location
- Remove location
- Open map

### Query cost controls

Firestore listeners and initial loads are bounded:

- events: last 30 days to next 120 days
- route stops: last 7 days to next 45 days
- homework: latest 150 tasks
- requests: latest 150
- payments: latest 160
- learning records: latest 120
- places/members have small practical limits

AI usage is not app-limited, as requested.

## Setup

1. Copy `.env.firebase.example` to `.env.local` and fill Firebase Web App config.
2. Run:

```bash
npm install
```

3. Deploy Firestore rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

4. Set OpenAI secret:

```bash
firebase functions:secrets:set OPENAI_API_KEY
```

5. Deploy Functions:

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

6. Run locally:

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

## Notes

- `.env.local` is not included.
- `node_modules` and `dist` are not included in this overlay.
- Old Supabase folders/files may still exist in your project, but the main app path now uses Firebase.
