const fs = require("fs");

const requiredExports = [
  "parseAiCommand",
  "commitAiActions",
  "createMemberLogin",
  "adminMemberAccountAction",
  "createMemberInvite",
  "bulkMemberInvites",
  "selfRegisterMember",
  "createFamilyAccount",
  "geocodeFamilyPlaces",
  "summarizeLearning",
  "undoFamilyAction",
  "transcribeAudio",
  "generateProgressSummary",
  "generateReportShareVersion",
  "routeLateRiskCheck",
  "routeDepartureAlerts",
  "savePushSubscription",
  "sendFamilyReminders",
  "systemHealthCheck",
  "scheduledFamilyRunner",
  "scheduledAfternoonRouteRunner",
  "scheduledFamilyReminderRunner",
  "buildDailyRouteDeparturePlans",
  "refreshRouteLegTravelTimes",
];

const files = [
  "functions/src/index.ts",
  "functions/src/firebaseMigrationAdditions.ts",
  "functions/src/firebaseMigrationPass2.ts",
  "functions/lib/index.js",
];

let failed = false;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`Missing file: ${file}`);
    failed = true;
  }
}

if (failed) process.exit(1);

const srcIndex = fs.readFileSync("functions/src/index.ts", "utf8");
const libIndex = fs.existsSync("functions/lib/index.js")
  ? fs.readFileSync("functions/lib/index.js", "utf8")
  : "";
const additions = fs.readFileSync("functions/src/firebaseMigrationAdditions.ts", "utf8");
const pass2 = fs.readFileSync("functions/src/firebaseMigrationPass2.ts", "utf8");
const allSource = srcIndex + "\n" + additions + "\n" + pass2;

for (const name of requiredExports) {
  if (!allSource.includes(name)) {
    console.error(`Missing function definition/reference in source: ${name}`);
    failed = true;
  }

  if (!srcIndex.includes(name)) {
    console.error(`Missing source index export: ${name}`);
    failed = true;
  }

  if (libIndex && !libIndex.includes(name)) {
    console.error(`Missing built lib export/reference: ${name}`);
    failed = true;
  }
}

const forbiddenPatterns = [
  "supabase",
  "@supabase",
  "VITE_SUPABASE",
];

for (const pattern of forbiddenPatterns) {
  if (allSource.toLowerCase().includes(pattern.toLowerCase())) {
    console.error(`Forbidden legacy reference found: ${pattern}`);
    failed = true;
  }
}

const pass2LineCount = pass2.split(/\r?\n/).length;
if (pass2LineCount < 100) {
  console.warn(`Warning: firebaseMigrationPass2.ts has only ${pass2LineCount} lines. Run npm run format:functions to make it maintainable.`);
}

if (failed) {
  console.error("Function export/status check failed.");
  process.exit(1);
}

console.log("Function export/status check passed.");
