# Firebase AI fallback parser fix

This patch improves AI reliability after the Firebase migration.

## What changed

`functions/src/index.ts`

- Logs real OpenAI/model parsing errors to Firebase Functions logs.
- Adds a local fallback parser for common actions when OpenAI is not ready.
- Currently supports:
  - add place / add location
  - simple request fallback

## Example now supported even if OpenAI temporarily fails

```text
添加一个地点，名字叫 Fencing Club，地址是 123 Main Road, Adelaide
```

This generates a `place` action, which can be reviewed and committed into Firestore.

## Deploy

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

No hosting deploy is required for this backend-only patch unless you also changed frontend code.
