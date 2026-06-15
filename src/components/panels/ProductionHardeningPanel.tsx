import { useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  buildDiagnosticText,
  downloadJson,
  exportFamilyData,
  loadFamilyDataExportLogs,
  loadProductionCheckItems,
  loadProductionCheckRuns,
  productionChecklistItems,
  runProductionHealthAudit,
  severityTone,
} from "../../lib/productionHardening";
import type {
  FamilyDataExportLog,
  ProductionCheckItem,
  ProductionCheckRun,
} from "../../lib/productionHardening";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
};

function groupByCategory(items: ProductionCheckItem[]) {
  const map = new Map<string, ProductionCheckItem[]>();
  for (const item of items) {
    map.set(item.category, [...(map.get(item.category) ?? []), item]);
  }
  return Array.from(map.entries());
}

export function ProductionHardeningPanel({ data }: Props) {
  const [runs, setRuns] = useState<ProductionCheckRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ProductionCheckRun | null>(null);
  const [items, setItems] = useState<ProductionCheckItem[]>([]);
  const [exportLogs, setExportLogs] = useState<FamilyDataExportLog[]>([]);
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { showToast, showError } = useToast();

  const grouped = useMemo(() => groupByCategory(items), [items]);
  const checklist = useMemo(() => productionChecklistItems(), []);

  async function refresh() {
    try {
      const [runRows, exportRows] = await Promise.all([
        loadProductionCheckRuns(data.family.id),
        loadFamilyDataExportLogs(data.family.id),
      ]);

      setRuns(runRows);
      setExportLogs(exportRows);

      const nextRun = selectedRun
        ? runRows.find((run) => run.id === selectedRun.id) ?? runRows[0] ?? null
        : runRows[0] ?? null;

      setSelectedRun(nextRun);

      if (nextRun) {
        setItems(await loadProductionCheckItems(data.family.id, nextRun.id));
      } else {
        setItems([]);
      }
    } catch (error) {
      showError(error);
    }
  }

  async function openRun(run: ProductionCheckRun) {
    setSelectedRun(run);
    try {
      setItems(await loadProductionCheckItems(data.family.id, run.id));
    } catch (error) {
      showError(error);
    }
  }

  async function runAudit() {
    setBusy("audit");

    try {
      const result = await runProductionHealthAudit({ data, runType: "pre_release" });
      await refresh();

      if (result.summary.fail) {
        showToast(`Audit completed with ${result.summary.fail} fail(s).`, "error");
      } else if (result.summary.warning) {
        showToast(`Audit completed with ${result.summary.warning} warning(s).`, "info");
      } else {
        showToast("Audit passed.", "success");
      }
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function runExport(type: "json" | "diagnostic" | "summary") {
    setBusy(`export-${type}`);

    try {
      const result = await exportFamilyData({
        data,
        exportType: type,
        includeSensitive,
      });

      downloadJson(result.file_name, result.export_data);
      await refresh();
      showToast(`Export created: ${result.file_name}`, "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  function copyDiagnostic() {
    const text = buildDiagnosticText({
      familyName: data.family.name,
      run: selectedRun,
      items,
      exportLogs,
    });

    navigator.clipboard.writeText(text);
    showToast("Diagnostic report copied.", "success");
  }

  useEffect(() => {
    refresh();
  }, [data.family.id]);

  return (
    <div className="fd-grid">
      <PanelCard raised>
        <SectionTitle
          title="Production hardening"
          subtitle="发布前检查、权限安全、备份导出和恢复清单"
          right={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button disabled={busy === "audit"} onClick={runAudit} className="fd-button primary">
                {busy === "audit" ? "Running..." : "Run production audit"}
              </button>
              <button onClick={refresh} className="fd-button">Refresh</button>
            </div>
          }
        />

        <div className="fd-alert warning">
          这不是替代真实渗透测试或完整 QA，但可以在每次迁移、部署、邀请别人测试前快速发现明显配置和数据风险。
        </div>

        {selectedRun && (
          <div className="fd-grid four" style={{ marginTop: 14 }}>
            {(["fail", "warning", "info", "pass"] as const).map((key) => (
              <div key={key} className="fd-stat">
                <div className="fd-stat-label">{key}</div>
                <div className="fd-stat-value">{selectedRun.summary?.[key] ?? 0}</div>
                <div className="fd-stat-note">latest run</div>
              </div>
            ))}
          </div>
        )}
      </PanelCard>

      <div className="fd-grid two">
        <PanelCard>
          <SectionTitle
            title="Audit runs"
            subtitle="选择历史检查记录"
            right={<StatusPill label={`${runs.length} runs`} tone="info" />}
          />

          {runs.length === 0 ? (
            <EmptyState text="No production audit runs yet." />
          ) : (
            <div className="fd-grid">
              {runs.map((run) => (
                <article key={run.id} className="fd-row wrap">
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong>{new Date(run.created_at).toLocaleString("en-AU")}</strong>
                      <StatusPill label={run.status} tone={run.status === "completed" ? "success" : run.status === "failed" ? "danger" : "warning"} />
                      <StatusPill label={run.run_type} tone="info" />
                    </div>
                    <div className="fd-muted">
                      fail {run.summary?.fail ?? 0} · warning {run.summary?.warning ?? 0} · pass {run.summary?.pass ?? 0}
                    </div>
                    {run.error_message && <div className="fd-alert danger" style={{ marginTop: 8 }}>{run.error_message}</div>}
                  </div>
                  <button onClick={() => openRun(run)} className="fd-button small primary">Open</button>
                </article>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard>
          <SectionTitle
            title="Backup / export"
            subtitle="导出家庭数据 JSON，迁移前先备份"
            right={<StatusPill label={`${exportLogs.length} exports`} tone="info" />}
          />

          <label className="fd-row wrap" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={includeSensitive}
              onChange={(event) => setIncludeSensitive(event.target.checked)}
            />
            <strong>Include sensitive auth/push metadata</strong>
          </label>

          <div className="fd-alert warning" style={{ marginTop: 10 }}>
            Sensitive export 可能包含 auth_user_id、push endpoint 等元数据。只在你明确需要排查账号/推送问题时使用，并妥善保存。
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button disabled={busy === "export-json"} onClick={() => runExport("json")} className="fd-button primary">
              Export JSON
            </button>
            <button disabled={busy === "export-summary"} onClick={() => runExport("summary")} className="fd-button">
              Export summary only
            </button>
            <button onClick={copyDiagnostic} className="fd-button">Copy diagnostic</button>
          </div>

          {exportLogs.length > 0 && (
            <div className="fd-grid" style={{ marginTop: 14 }}>
              {exportLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="fd-row wrap">
                  <div style={{ flex: 1 }}>
                    <strong>{log.file_name ?? "export"}</strong>
                    <div className="fd-muted">
                      {new Date(log.created_at).toLocaleString("en-AU")} · {log.export_type} · sensitive {log.include_sensitive ? "yes" : "no"}
                    </div>
                  </div>
                  <StatusPill label={log.status} tone={log.status === "failed" ? "danger" : "success"} />
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>

      <PanelCard>
        <SectionTitle
          title="Audit items"
          subtitle={selectedRun ? `Run ${selectedRun.id}` : "No selected run"}
        />

        {items.length === 0 ? (
          <EmptyState text="No audit items selected." />
        ) : (
          <div className="fd-grid">
            {grouped.map(([category, rows]) => (
              <section key={category} className="fd-card soft">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{category}</strong>
                  <StatusPill label={`${rows.length} checks`} tone="info" />
                </div>

                <div className="fd-grid" style={{ marginTop: 10 }}>
                  {rows.map((item) => (
                    <article key={`${item.check_key}-${item.title}`} className={`fd-alert ${severityTone(item.severity)}`}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
                        <strong>{item.title}</strong>
                        <StatusPill label={item.severity} tone={severityTone(item.severity) as any} />
                      </div>
                      <div style={{ marginTop: 6 }}>{item.message}</div>
                      {item.recommendation && (
                        <div style={{ marginTop: 6, fontWeight: 950 }}>Recommendation: {item.recommendation}</div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="Release / recovery checklist"
          subtitle="每次邀请外部测试或正式使用前过一遍"
        />

        <div className="fd-grid">
          {checklist.map((item, index) => (
            <label key={item} className="fd-row wrap" style={{ cursor: "pointer" }}>
              <input type="checkbox" />
              <strong>{index + 1}.</strong>
              <span>{item}</span>
            </label>
          ))}
        </div>
      </PanelCard>
    </div>
  );
}
