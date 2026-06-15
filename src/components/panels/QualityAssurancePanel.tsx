import { useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { buildBackendQaChecks, buildFrontendQaChecks, runBackendHealthCheck, summarizeChecks } from "../../lib/qaHealth";
import type { QaCheck, QaSeverity, SystemHealthPayload } from "../../lib/qaHealth";
import { FAMILY_DOCK_BUILD_LABEL, FAMILY_DOCK_VERSION } from "../../lib/appVersion";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = { data: FamilyData; realtimeStatus?: string };
function severityTone(severity: QaSeverity) { return severity === "fail" ? "danger" : severity === "warning" ? "warning" : severity === "info" ? "info" : "success"; }
function severityLabel(severity: QaSeverity) { return severity === "fail" ? "Fail" : severity === "warning" ? "Warning" : severity === "info" ? "Info" : "Pass"; }
function CheckCard({ check }: { check: QaCheck }) {
  return (
    <article className={`fd-alert ${severityTone(check.severity)}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div><strong>{check.label}</strong><div className="fd-muted" style={{ color: "inherit", opacity: 0.86 }}>{check.group}</div></div>
        <StatusPill label={severityLabel(check.severity)} tone={severityTone(check.severity) as any} />
      </div>
      <div style={{ marginTop: 8 }}>{check.detail}</div>
      {check.action && <div style={{ marginTop: 8, fontWeight: 950 }}>Action: {check.action}</div>}
    </article>
  );
}
export function QualityAssurancePanel({ data, realtimeStatus }: Props) {
  const [backendPayload, setBackendPayload] = useState<SystemHealthPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | QaSeverity>("all");
  const { showToast, showError } = useToast();
  const frontendChecks = useMemo(() => buildFrontendQaChecks(data), [data]);
  const backendChecks = useMemo(() => buildBackendQaChecks(backendPayload), [backendPayload]);
  const allChecks = useMemo(() => [...frontendChecks, ...backendChecks], [frontendChecks, backendChecks]);
  const summary = summarizeChecks(allChecks);
  const visibleChecks = filter === "all" ? allChecks : allChecks.filter((check) => check.severity === filter);
  async function runBackend() {
    setRunning(true);
    try { setBackendPayload(await runBackendHealthCheck(data.family.id)); showToast("Backend health check completed.", "success"); }
    catch (error) { showError(error); }
    finally { setRunning(false); }
  }
  function copyReport() {
    const lines = [
      `Family Dock QA Report`, `${FAMILY_DOCK_BUILD_LABEL} · ${FAMILY_DOCK_VERSION}`, `Family: ${data.family.name}`, `Realtime: ${realtimeStatus ?? "unknown"}`, `Generated: ${new Date().toLocaleString("en-AU")}`, ``,
      `Summary: fail=${summary.fail}, warning=${summary.warning}, info=${summary.info}, pass=${summary.pass}, total=${summary.total}`, ``,
      ...allChecks.map((check) => `[${check.severity.toUpperCase()}] ${check.group} / ${check.label}\n${check.detail}${check.action ? `\nAction: ${check.action}` : ""}`),
    ].join("\n\n");
    navigator.clipboard.writeText(lines);
    showToast("QA report copied.", "success");
  }
  return (
    <div className="fd-grid">
      <PanelCard raised>
        <SectionTitle title="Health / QA" subtitle="Setup and data checks" right={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={runBackend} disabled={running} className="fd-button primary">{running ? "Checking..." : "Run backend health"}</button><button onClick={copyReport} className="fd-button">Copy report</button></div>} />
        <div className="fd-grid three">
          <div className="fd-stat"><div className="fd-stat-label">Fails</div><div className="fd-stat-value">{summary.fail}</div><div className="fd-stat-note">must fix first</div></div>
          <div className="fd-stat"><div className="fd-stat-label">Warnings</div><div className="fd-stat-value">{summary.warning}</div><div className="fd-stat-note">risky or incomplete</div></div>
          <div className="fd-stat"><div className="fd-stat-label">Passed</div><div className="fd-stat-value">{summary.pass}</div><div className="fd-stat-note">{summary.total} checks total</div></div>
        </div>
        <div className="fd-alert info" style={{ marginTop: 14 }}>Version: {FAMILY_DOCK_BUILD_LABEL} · {FAMILY_DOCK_VERSION}. Realtime: {realtimeStatus ?? "unknown"}.</div>
      </PanelCard>
      <details className="fd-disclosure">
        <summary>Manual QA checklist</summary>
        <div className="fd-grid" style={{ marginTop: 12 }}>
          {[
            "Today overview, calendar, route and attention cards.",
            "Calendar view switch, add event, done/cancel and conflict warning.",
            "Route current location, plan generation, map and handoff message.",
            "Homework add/edit, checklist, upload and attachment list.",
            "Payments add/edit, mark paid/unpaid and summary.",
            "Requests add/approve/reject.",
            "Notebook records and progress summaries.",
            "Meals and shopping list.",
            "People, places, invites and account security.",
            "Child/homestay login on mobile.",
          ].map((text, index) => <label key={text} className="fd-row wrap" style={{ cursor: "pointer" }}><input type="checkbox" /><strong>{index + 1}.</strong><span>{text}</span></label>)}
        </div>
      </details>
      <PanelCard>
        <SectionTitle title="Check results" subtitle="前端即时检查 + 后端 Edge Function / 数据库检查" right={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{(["all", "fail", "warning", "info", "pass"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`fd-button small ${filter === item ? "primary" : ""}`}>{item}</button>)}</div>} />
        {visibleChecks.length === 0 ? <EmptyState text="No checks in this filter." /> : <div className="fd-grid">{visibleChecks.map((check) => <CheckCard key={check.id} check={check} />)}</div>}
      </PanelCard>
      <details className="fd-disclosure">
        <summary>Permission safety notes</summary>
        <div className="fd-grid" style={{ marginTop: 12 }}>
          <div className="fd-alert warning">Child / Homestay accounts must be tested with their own login.</div>
          <div className="fd-alert warning">Service-role Edge Functions must verify family membership before using family_id.</div>
          <div className="fd-alert warning">Invite, account reset, device disable and export tools are parent/guardian only.</div>
        </div>
      </details>
    </div>
  );
}
