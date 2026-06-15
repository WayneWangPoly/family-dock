import { useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  buildCronCurl,
  buildPgCronSql,
  ensureDefaultCronJobs,
  loadScheduledJobSettings,
  loadScheduledRunnerLogs,
  runScheduledJobManually,
  updateScheduledJobSetting,
} from "../../lib/cronSetup";
import type { ScheduledJobSetting } from "../../lib/cronSetup";
import type { ScheduledRunnerLog } from "../../lib/lateRisk";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
};

function guessProjectRef() {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? "");
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] ?? "YOUR_PROJECT_REF";
}

export function CronSetupPanel({ data }: Props) {
  const [jobs, setJobs] = useState<ScheduledJobSetting[]>([]);
  const [logs, setLogs] = useState<ScheduledRunnerLog[]>([]);
  const [cronSecret, setCronSecret] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { showToast, showError } = useToast();

  const projectRef = useMemo(() => guessProjectRef(), []);
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null;

  async function refresh() {
    try {
      const [jobRows, logRows] = await Promise.all([
        loadScheduledJobSettings(data.family.id),
        loadScheduledRunnerLogs(data.family.id),
      ]);
      setJobs(jobRows);
      setLogs(logRows);
      if (!selectedJobId && jobRows[0]) setSelectedJobId(jobRows[0].id);
    } catch (error) {
      showError(error);
    }
  }

  async function createDefaults() {
    setBusy("defaults");
    try {
      const rows = await ensureDefaultCronJobs(data);
      setJobs(rows);
      if (rows[0]) setSelectedJobId(rows[0].id);
      showToast("Default cron jobs created.", "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(job: ScheduledJobSetting) {
    try {
      await updateScheduledJobSetting({
        familyId: data.family.id,
        id: job.id,
        patch: { is_enabled: !job.is_enabled },
      });
      await refresh();
      showToast("Cron job setting updated.", "success");
    } catch (error) {
      showError(error);
    }
  }

  async function runManual(job: ScheduledJobSetting) {
    if (!cronSecret.trim()) {
      showToast("Enter CRON_SECRET first. It is only used for this manual call.", "error");
      return;
    }

    setBusy(job.id);

    try {
      const result = await runScheduledJobManually({
        data,
        job,
        cronSecret,
      });
      await refresh();
      showToast("Manual scheduled runner completed.", "success");
      console.log("scheduled job result", result);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  function copy(text: string, label = "Copied.") {
    navigator.clipboard.writeText(text);
    showToast(label, "success");
  }

  useEffect(() => {
    refresh();
  }, [data.family.id]);

  return (
    <div className="fd-grid">
      <PanelCard raised>
        <SectionTitle
          title="Cron setup centre"
          subtitle="管理 scheduled runner 配置，复制 curl / pg_cron，手动测试运行"
          right={<StatusPill label={`${jobs.length} jobs`} tone={jobs.length ? "success" : "warning"} />}
        />

        <div className="fd-alert warning">
          CRON_SECRET 不会保存到数据库。这里输入只用于手动测试调用 Edge Function。生产 cron 建议在 Supabase secrets / Scheduled Functions / pg_cron 中配置。
        </div>

        <div className="fd-grid two" style={{ marginTop: 14 }}>
          <label className="fd-field">
            CRON_SECRET for manual test
            <input
              className="fd-input"
              type="password"
              value={cronSecret}
              onChange={(event) => setCronSecret(event.target.value)}
              placeholder="paste CRON_SECRET for manual run"
            />
          </label>

          <label className="fd-field">
            Project ref
            <input className="fd-input" value={projectRef} readOnly />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button disabled={busy === "defaults"} onClick={createDefaults} className="fd-button primary">
            {busy === "defaults" ? "Creating..." : "Create default jobs"}
          </button>
          <button onClick={refresh} className="fd-button">Refresh</button>
        </div>
      </PanelCard>

      <div className="fd-grid two">
        <PanelCard>
          <SectionTitle
            title="Scheduled job settings"
            subtitle="这些是 App 内记录的计划任务配置，不等于 Supabase 已自动创建 cron"
          />

          {jobs.length === 0 ? (
            <EmptyState text="No scheduled job settings. Create defaults first." />
          ) : (
            <div className="fd-grid">
              {jobs.map((job) => (
                <article key={job.id} className="fd-row wrap">
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong>{job.job_name}</strong>
                      <StatusPill label={job.is_enabled ? "enabled" : "disabled"} tone={job.is_enabled ? "success" : "warning"} />
                      <StatusPill label={job.function_name} tone="info" />
                    </div>
                    <div className="fd-muted">{job.cadence_label ?? job.cron_expression ?? "No cadence"}</div>
                    <div className="fd-muted">{job.run_window_label}</div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button onClick={() => setSelectedJobId(job.id)} className="fd-button small primary">Open</button>
                    <button onClick={() => toggle(job)} className="fd-button small">{job.is_enabled ? "Disable" : "Enable"}</button>
                    <button disabled={busy === job.id} onClick={() => runManual(job)} className="fd-button small">
                      {busy === job.id ? "Running..." : "Run"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard>
          <SectionTitle
            title="Selected job"
            subtitle={selectedJob ? selectedJob.job_name : "Select a job"}
          />

          {!selectedJob ? (
            <EmptyState text="No selected job." />
          ) : (
            <div className="fd-grid">
              <label className="fd-field">
                Cron expression
                <input
                  className="fd-input"
                  value={selectedJob.cron_expression ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setJobs((prev) => prev.map((job) => job.id === selectedJob.id ? { ...job, cron_expression: value } : job));
                  }}
                  onBlur={(event) => updateScheduledJobSetting({
                    familyId: data.family.id,
                    id: selectedJob.id,
                    patch: { cron_expression: event.target.value },
                  }).catch(showError)}
                />
              </label>

              <label className="fd-field">
                Payload JSON
                <textarea
                  className="fd-textarea"
                  value={JSON.stringify(selectedJob.runner_payload ?? {}, null, 2)}
                  onChange={(event) => {
                    try {
                      const parsed = JSON.parse(event.target.value);
                      setJobs((prev) => prev.map((job) => job.id === selectedJob.id ? { ...job, runner_payload: parsed } : job));
                    } catch {
                      // keep local typing tolerant
                    }
                  }}
                  onBlur={(event) => {
                    try {
                      const parsed = JSON.parse(event.target.value);
                      updateScheduledJobSetting({
                        familyId: data.family.id,
                        id: selectedJob.id,
                        patch: { runner_payload: parsed },
                      }).catch(showError);
                    } catch (error) {
                      showError(error);
                    }
                  }}
                  style={{ minHeight: 140 }}
                />
              </label>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => copy(buildCronCurl({ projectRef, job: selectedJob }), "curl copied.")} className="fd-button primary">
                  Copy curl
                </button>
                <button onClick={() => copy(buildPgCronSql({ projectRef, job: selectedJob }), "pg_cron SQL copied.")} className="fd-button">
                  Copy pg_cron SQL
                </button>
              </div>

              <details>
                <summary style={{ cursor: "pointer", fontWeight: 900 }}>curl preview</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{buildCronCurl({ projectRef, job: selectedJob })}</pre>
              </details>
            </div>
          )}
        </PanelCard>
      </div>

      <PanelCard>
        <SectionTitle
          title="Runner logs"
          subtitle="scheduled-family-runner / route-late-risk-check 的运行记录"
          right={<StatusPill label={`${logs.length} logs`} tone="info" />}
        />

        {logs.length === 0 ? (
          <EmptyState text="No runner logs yet." />
        ) : (
          <div className="fd-grid">
            {logs.slice(0, 16).map((log) => (
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
