import { useEffect, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  lateRiskTone,
  loadLateRiskChecks,
  loadScheduledRunnerLogs,
  runLateRiskCheck,
} from "../../lib/lateRisk";
import type { RouteLateRiskCheck, ScheduledRunnerLog } from "../../lib/lateRisk";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
  selectedPlanId?: string | null;
};

export function LateRiskRunnerPanel({ data, selectedPlanId }: Props) {
  const [checks, setChecks] = useState<RouteLateRiskCheck[]>([]);
  const [logs, setLogs] = useState<ScheduledRunnerLog[]>([]);
  const [busy, setBusy] = useState(false);
  const { showToast, showError } = useToast();

  async function refresh() {
    try {
      const [riskRows, logRows] = await Promise.all([
        loadLateRiskChecks(data.family.id, selectedPlanId ?? null),
        loadScheduledRunnerLogs(data.family.id),
      ]);
      setChecks(riskRows);
      setLogs(logRows);
    } catch (error) {
      showError(error);
    }
  }

  async function run() {
    setBusy(true);
    try {
      const result = await runLateRiskCheck({ data, planId: selectedPlanId ?? null });
      await refresh();
      showToast(`Late-risk checked ${result.checked_plans} plans, ${result.checked_legs} legs. High/late: ${result.high_or_late}.`, result.high_or_late ? "error" : "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [data.family.id, selectedPlanId]);

  return (
    <div className="fd-grid">
      <PanelCard>
        <SectionTitle
          title="Live late-risk recalculation"
          subtitle="检查是否已经过推荐出发时间或最晚安全出发时间"
          right={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button disabled={busy} onClick={run} className="fd-button primary small">
                {busy ? "Checking..." : "Run late-risk check"}
              </button>
              <button onClick={refresh} className="fd-button small">Refresh</button>
            </div>
          }
        />

        {checks.length === 0 ? (
          <EmptyState text="No late-risk checks yet." />
        ) : (
          <div className="fd-grid">
            {checks.map((check) => (
              <article key={check.id} className="fd-row wrap">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <strong>{check.message}</strong>
                    <StatusPill label={check.risk_level} tone={lateRiskTone(check.risk_level) as any} />
                  </div>
                  <div className="fd-muted">
                    recommended {check.minutes_to_recommended ?? "—"} min · latest {check.minutes_to_latest_safe ?? "—"} min · {new Date(check.created_at).toLocaleString("en-AU")}
                  </div>
                  {check.recommendation && <div style={{ marginTop: 6 }}>{check.recommendation}</div>}
                </div>
              </article>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="Scheduled runner logs"
          subtitle="查看 cron / manual runner 是否正常运行"
          right={<StatusPill label={`${logs.length} logs`} tone="info" />}
        />

        {logs.length === 0 ? (
          <EmptyState text="No runner logs yet." />
        ) : (
          <div className="fd-grid">
            {logs.slice(0, 12).map((log) => (
              <article key={log.id} className="fd-row wrap">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <strong>{log.runner_name}</strong>
                    <StatusPill label={log.run_mode} tone="info" />
                    <StatusPill label={log.status} tone={log.status === "completed" ? "success" : log.status === "failed" ? "danger" : "warning"} />
                  </div>
                  <div className="fd-muted">
                    {new Date(log.started_at).toLocaleString("en-AU")}
                    {log.finished_at ? ` → ${new Date(log.finished_at).toLocaleString("en-AU")}` : ""}
                  </div>
                  {log.error_message && <div className="fd-alert danger" style={{ marginTop: 8 }}>{log.error_message}</div>}
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 900 }}>Summary JSON</summary>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(log.summary, null, 2)}</pre>
                  </details>
                </div>
              </article>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}
