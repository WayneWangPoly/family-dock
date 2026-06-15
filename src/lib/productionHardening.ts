import type { FamilyData } from "./familyDataTypes";
import { supabase } from "./supabaseClient";

export type ProductionCheckSeverity = "pass" | "info" | "warning" | "fail";

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
  details: Record<string, any>;
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
  summary: Record<string, any>;
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

export async function runProductionHealthAudit(args: {
  data: FamilyData;
  runType?: "manual" | "pre_release" | "support";
}) {
  const { data, error } = await supabase.functions.invoke("production-health-audit", {
    body: {
      family_id: args.data.family.id,
      run_type: args.runType ?? "manual",
    },
  });

  if (error) throw error;

  return data as {
    ok: boolean;
    run_id: string;
    summary: Record<string, number | string>;
    items: ProductionCheckItem[];
    table_counts: Record<string, number | null>;
  };
}

export async function loadProductionCheckRuns(familyId: string) {
  const { data, error } = await supabase
    .from("production_check_runs")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data ?? []) as ProductionCheckRun[];
}

export async function loadProductionCheckItems(familyId: string, runId: string) {
  const { data, error } = await supabase
    .from("production_check_items")
    .select("*")
    .eq("family_id", familyId)
    .eq("run_id", runId)
    .order("category", { ascending: true })
    .order("severity", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ProductionCheckItem[];
}

export async function exportFamilyData(args: {
  data: FamilyData;
  exportType?: "json" | "diagnostic" | "summary";
  includeSensitive?: boolean;
}) {
  const { data, error } = await supabase.functions.invoke("family-data-export", {
    body: {
      family_id: args.data.family.id,
      export_type: args.exportType ?? "json",
      include_sensitive: args.includeSensitive ?? false,
    },
  });

  if (error) throw error;

  return data as {
    ok: boolean;
    export_log: FamilyDataExportLog;
    file_name: string;
    table_counts: Record<string, number>;
    export_data: Record<string, any>;
  };
}

export async function loadFamilyDataExportLogs(familyId: string) {
  const { data, error } = await supabase
    .from("family_data_export_logs")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data ?? []) as FamilyDataExportLog[];
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
    ...(args.exportLogs ?? []).slice(0, 5).map((log) => `${log.created_at} · ${log.file_name ?? "export"} · ${JSON.stringify(log.table_counts)}`),
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
    "Confirm CRON_SECRET exists and cron runner is reachable.",
    "Confirm OpenAI, Google Maps, VAPID secrets are configured where needed.",
    "Install PWA on at least one iPhone and one Android device.",
    "Send one real push test to each parent device.",
    "Generate one route plan, one progress report, one export, one cron manual run.",
    "Check RLS policies before inviting external testers.",
  ];
}
