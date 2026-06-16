import type { FamilyData } from "./familyDataTypes";

export type ProductionCheckSeverity = "pass" | "info" | "warning" | "fail";

export type ProductionSummary = {
  pass?: number;
  info?: number;
  warning?: number;
  fail?: number;
  total?: number;
  [key: string]: number | undefined;
};

export type ProductionCheckItem = {
  id?: string;
  family_id?: string | null;
  run_id?: string | null;
  category: string;
  check_key: string;
  severity: ProductionCheckSeverity;
  status: ProductionCheckSeverity;
  title: string;
  message: string;
  recommendation: string | null;
  details: Record<string, unknown>;
  created_at?: string;
};

export type ProductionCheckRun = {
  id: string;
  family_id: string | null;
  created_by: string | null;
  run_type: "manual" | "scheduled" | "pre_release" | "support";
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  summary: ProductionSummary;
  error_message: string | null;
  created_at: string;
};

export type FamilyDataExportLog = {
  id: string;
  family_id: string;
  created_by: string | null;
  export_type: "json" | "diagnostic" | "summary";
  include_sensitive: boolean;
  table_counts: Record<string, number>;
  file_name: string | null;
  status: "created" | "downloaded" | "failed";
  error_message: string | null;
  created_at: string;
};

const localRuns = new Map<string, ProductionCheckRun[]>();
const localItems = new Map<string, ProductionCheckItem[]>();
const localExportLogs = new Map<string, FamilyDataExportLog[]>();

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function countRecords(data: FamilyData): Record<string, number> {
  const source = data as unknown as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, asArray(value).length]),
  );
}

function makeItem(
  input: Omit<ProductionCheckItem, "id" | "created_at" | "status">,
): ProductionCheckItem {
  return {
    ...input,
    id: `local-check-${Math.random().toString(36).slice(2)}`,
    status: input.severity,
    created_at: new Date().toISOString(),
  };
}

export async function runProductionHealthAudit(args: {
  data: FamilyData;
  runType?: "manual" | "pre_release" | "support";
}) {
  const familyId = args.data.family.id;
  const startedAt = new Date().toISOString();
  const tableCounts = countRecords(args.data);
  const items: ProductionCheckItem[] = [];

  items.push(makeItem({
    family_id: familyId,
    category: "Backend",
    check_key: "firebase_backend",
    severity: "pass",
    title: "Firebase backend active",
    message: "This build uses Firebase Auth, Firestore, Storage and callable Cloud Functions.",
    recommendation: null,
    details: { backend: "firebase" },
  }));

  if (!args.data.family?.id) {
    items.push(makeItem({
      family_id: familyId ?? null,
      category: "Data",
      check_key: "family_id_missing",
      severity: "fail",
      title: "Family ID missing",
      message: "The loaded family object does not include an id.",
      recommendation: "Check the Firestore family document loading path.",
      details: {},
    }));
  }

  const members = asArray((args.data as unknown as Record<string, unknown>).members);
  if (members.length === 0) {
    items.push(makeItem({
      family_id: familyId,
      category: "Data",
      check_key: "members_empty",
      severity: "warning",
      title: "No family members loaded",
      message: "No members were found in the current family data snapshot.",
      recommendation: "Confirm Firestore rules and member collection data before inviting testers.",
      details: { members: 0 },
    }));
  }

  const fail = items.filter((item) => item.severity === "fail").length;
  const warning = items.filter((item) => item.severity === "warning").length;
  const info = items.filter((item) => item.severity === "info").length;
  const pass = items.filter((item) => item.severity === "pass").length;

  const run: ProductionCheckRun = {
    id: `local-run-${Date.now()}`,
    family_id: familyId,
    created_by: null,
    run_type: args.runType ?? "manual",
    status: "completed",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    summary: { pass, info, warning, fail, total: items.length },
    error_message: null,
    created_at: startedAt,
  };

  localRuns.set(familyId, [run, ...(localRuns.get(familyId) ?? [])].slice(0, 20));
  localItems.set(run.id, items.map((item) => ({ ...item, run_id: run.id })));

  return {
    ok: fail === 0,
    run_id: run.id,
    summary: run.summary,
    items: localItems.get(run.id) ?? [],
    table_counts: tableCounts,
  };
}

export async function loadProductionCheckRuns(familyId: string): Promise<ProductionCheckRun[]> {
  return localRuns.get(familyId) ?? [];
}

export async function loadProductionCheckItems(_familyId: string, runId: string): Promise<ProductionCheckItem[]> {
  return localItems.get(runId) ?? [];
}

export async function exportFamilyData(args: {
  data: FamilyData;
  exportType?: "json" | "diagnostic" | "summary";
  includeSensitive?: boolean;
}) {
  const familyId = args.data.family.id;
  const exportType = args.exportType ?? "json";
  const tableCounts = countRecords(args.data);
  const createdAt = new Date().toISOString();
  const fileName = `family-dock-${familyId}-${exportType}-${createdAt.slice(0, 10)}.json`;
  const exportData = exportType === "summary"
    ? { family: args.data.family, table_counts: tableCounts, created_at: createdAt }
    : { ...args.data, exported_at: createdAt, include_sensitive: Boolean(args.includeSensitive) };

  const exportLog: FamilyDataExportLog = {
    id: `local-export-${Date.now()}`,
    family_id: familyId,
    created_by: null,
    export_type: exportType,
    include_sensitive: Boolean(args.includeSensitive),
    table_counts: tableCounts,
    file_name: fileName,
    status: "created",
    error_message: null,
    created_at: createdAt,
  };

  localExportLogs.set(familyId, [exportLog, ...(localExportLogs.get(familyId) ?? [])].slice(0, 30));

  return {
    ok: true,
    export_log: exportLog,
    file_name: fileName,
    table_counts: tableCounts,
    export_data: exportData as Record<string, unknown>,
  };
}

export async function loadFamilyDataExportLogs(familyId: string): Promise<FamilyDataExportLog[]> {
  return localExportLogs.get(familyId) ?? [];
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function severityTone(severity: ProductionCheckSeverity) {
  if (severity === "fail") return "danger";
  if (severity === "warning") return "warning";
  if (severity === "pass") return "success";
  return "info";
}

export function buildDiagnosticText(args: {
  familyName: string;
  run?: ProductionCheckRun | null;
  items: ProductionCheckItem[];
  exportLogs?: FamilyDataExportLog[];
}) {
  const summary = args.run?.summary ?? {};
  const lines = [
    "Family Dock Diagnostic Report",
    `Family: ${args.familyName}`,
    `Generated: ${new Date().toLocaleString("en-AU")}`,
    args.run ? `Run: ${args.run.id}` : "",
    args.run ? `Status: ${args.run.status}` : "",
    `Summary: ${JSON.stringify(summary)}`,
    "",
    "Checks",
    ...args.items.map((item) => [
      `[${item.severity.toUpperCase()}] ${item.category} / ${item.title}`,
      item.message,
      item.recommendation ? `Recommendation: ${item.recommendation}` : "",
    ].filter(Boolean).join("\n")),
    "",
    "Recent exports",
    ...(args.exportLogs ?? [])
      .slice(0, 5)
      .map((log) => `${log.created_at} 路 ${log.file_name ?? "export"} 路 ${JSON.stringify(log.table_counts)}`),
  ].filter(Boolean);

  return lines.join("\n\n");
}

export function productionChecklistItems() {
  return [
    "Run Production Health Audit after every migration pack.",
    "Run Health / QA page and confirm no fail-level checks remain.",
    "Test parent account on desktop and mobile.",
    "Test child/homestay account separately.",
    "Create at least one family data JSON backup before heavy changes.",
    "Confirm Firebase Functions secrets are configured where needed.",
    "Confirm OpenAI, Google Maps and VAPID secrets are configured where needed.",
    "Install PWA on at least one iPhone and one Android device.",
    "Send one real push test to each parent device.",
    "Generate one route plan, one progress report, one export and one AI action.",
    "Check Firestore and Storage rules before inviting external testers.",
  ];
}