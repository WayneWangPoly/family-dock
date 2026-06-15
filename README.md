# Family Dock

Family Dock is a Firebase-backed family coordination app.

## Current backend

- Firebase Hosting
- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Firebase Cloud Functions

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the Firebase Web App config from Firebase Console.

## Build

```bash
npm run build
```

## Deploy

```bash
firebase deploy
```

Or deploy hosting only:

```bash
firebase deploy --only hosting
```
