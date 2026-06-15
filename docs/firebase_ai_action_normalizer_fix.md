# Firebase AI action normalizer fix

Fixes the AI review message `AI 没有生成可执行动作。` after the Firebase migration.

## What changed

### Backend: `functions/src/index.ts`

- Accepts a single action object, not only `{ actions: [...] }`.
- Normalises `location` action type to `place`.
- If OpenAI returns no executable actions, falls back to a local parser for common family commands.
- The local parser supports location commands such as:

```text
添加一个地点，名字叫 Fencing Club，地址是 123 Main Road, Adelaide
```

### Frontend: `src/lib/aiCopilot.ts`

- Normalises `location` to `place`.
- Adds a client-side fallback plan for add-location commands if the backend returns an empty action list.
- Keeps `place` as a committable action.

## Deploy

Apply the patch, then run:

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
npm run build
firebase deploy --only hosting
```

Both Functions and Hosting should be deployed because this patch changes backend and frontend AI handling.
