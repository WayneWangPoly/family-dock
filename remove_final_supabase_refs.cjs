const fs = require("fs");

function replaceFunctionBlock(text, functionName, replacement) {
  const fnIndex = text.indexOf(`function ${functionName}`);
  if (fnIndex < 0) return { text, replaced: false };

  const braceStart = text.indexOf("{", fnIndex);
  if (braceStart < 0) return { text, replaced: false };

  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      return {
        text: text.slice(0, fnIndex) + replacement + text.slice(i + 1),
        replaced: true,
      };
    }
  }

  return { text, replaced: false };
}

const cronPath = "src/components/panels/CronSetupPanel.tsx";
if (!fs.existsSync(cronPath)) {
  throw new Error(`Missing ${cronPath}. Run this from the family-dock project root.`);
}

let cron = fs.readFileSync(cronPath, "utf8");

const newGuessProjectRef = `function guessProjectRef() {
  const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "");
  return projectId || "YOUR_FIREBASE_PROJECT_ID";
}`;

const result = replaceFunctionBlock(cron, "guessProjectRef", newGuessProjectRef);
cron = result.text;

cron = cron
  .replace(/VITE_SUPABASE_URL/g, "VITE_FIREBASE_PROJECT_ID")
  .replace(/Supabase secrets \/ Scheduled Functions \/ pg_cron/g, "Firebase secrets / scheduled Cloud Functions")
  .replace(/Supabase 已自动创建 cron/g, "Firebase Scheduler 已自动创建任务")
  .replace(/Supabase/g, "Firebase")
  .replace(/Edge Function/g, "Cloud Function")
  .replace(/pg_cron/g, "Firebase Scheduler")
  .replace(/Scheduled Functions/g, "scheduled Cloud Functions")
  .replace(/supabase\.co/g, "firebaseapp.com");

fs.writeFileSync(cronPath, cron, "utf8");
console.log(`${cronPath}: ${result.replaced ? "guessProjectRef replaced" : "guessProjectRef function not found, text replacements applied"}`);

const lockPath = "src/hooks/useEditingLock.ts";
if (fs.existsSync(lockPath)) {
  let lock = fs.readFileSync(lockPath, "utf8");
  lock = lock.replace(
    /\/\/ Editing locks belonged to the earlier Supabase multi-user admin workflow\.\r?\n?/,
    "// Editing locks are disabled in the current Firebase workflow.\n",
  );
  lock = lock.replace(/Supabase/g, "Firebase");
  fs.writeFileSync(lockPath, lock, "utf8");
  console.log(`${lockPath}: comment cleaned`);
}

console.log("Now run:");
console.log('git grep -ni "supabase\\|@supabase\\|vite_supabase\\|supabaseclient"');
