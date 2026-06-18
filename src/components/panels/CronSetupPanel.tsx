import { useEffect, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  ensureDefaultCronJobs,
  loadScheduledJobSettings,
  loadScheduledRunnerLogs,
  runScheduledJobManually,
  updateScheduledJobSetting,
} from "../../lib/cronSetup";
import type { ScheduledJobSetting } from "../../lib/cronSetup";
import type { ScheduledRunnerLog } from "../../lib/lateRisk";
import { EmptyState, PanelCard, SectionTitle, StatusPill } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
};

type BusyAction = "defaults" | string | null;

export function CronSetupPanel({ data }: Props) {
  const [jobs, setJobs] = useState<ScheduledJobSetting[]>([]);
  const [logs, setLogs] = useState<ScheduledRunnerLog[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const { showToast, showError } = useToast();

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
      showToast("Runner presets created.", "success");
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
      showToast("Runner updated.", "success");
    } catch (error) {
      showError(error);
    }
  }

  async function runManual(job: ScheduledJobSetting) {
    setBusy(job.id);
    try {
      await runScheduledJobManually({
        data,
        job,
        cronSecret: "",
      });

      await refresh();
      showToast("Runner completed.", "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  function updateSelectedPayload(value: string) {
    if (!selectedJob) return;

    try {
      const parsed = JSON.parse(value);
      setJobs((prev) =>
        prev.map((job) =>
          job.id === selectedJob.id ? { ...job, runner_payload: parsed } : job,
        ),
      );
    } catch {
      // Keep typing tolerant until blur.
    }
  }

  async function saveSelectedPayload(value: string) {
    if (!selectedJob) return;

    try {
      const parsed = JSON.parse(value);
      await updateScheduledJobSetting({
        familyId: data.family.id,
        id: selectedJob.id,
        patch: { runner_payload: parsed },
      });
      await refresh();
      showToast("Payload saved.", "success");
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    void refresh();
  }, [data.family.id]);

  return (
    <div className="fd-grid">
      <PanelCard>
        <SectionTitle
          title="Scheduled runners"
          right={<StatusPill label={`${jobs.length} jobs`} tone="info" />}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={createDefaults} className="fd-button primary" disabled={busy === "defaults"}>
            {busy === "defaults" ? "Creating..." : "Create presets"}
          </button>
          <button onClick={refresh} className="fd-button">
            Refresh
          </button>
        </div>

        {jobs.length === 0 ? (
          <EmptyState text="No scheduled runners." />
        ) : (
          <div className="fd-grid">
            {jobs.map((job) => (
              <article key={job.id} className="fd-row wrap">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <strong>{job.job_name}</strong>
                  <div className="fd-muted">{job.cadence_label ?? job.cron_expression ?? "No cadence"}</div>
                  {job.run_window_label && <div className="fd-muted">{job.run_window_label}</div>}
                </div>

                <StatusPill
                  label={job.is_enabled ? "Enabled" : "Disabled"}
                  tone={job.is_enabled ? "success" : "default"}
                />

                <button onClick={() => setSelectedJobId(job.id)} className="fd-button small primary">
                  Open
                </button>
                <button onClick={() => toggle(job)} className="fd-button small">
                  {job.is_enabled ? "Disable" : "Enable"}
                </button>
                <button onClick={() => runManual(job)} className="fd-button small" disabled={busy === job.id}>
                  {busy === job.id ? "Running..." : "Run"}
                </button>
              </article>
            ))}
          </div>
        )}

        {selectedJob && (
          <div style={{ marginTop: 12 }}>
            <SectionTitle title={selectedJob.job_name} />
            <label className="fd-field">
              Payload
              <textarea
                value={JSON.stringify(selectedJob.runner_payload ?? {}, null, 2)}
                onChange={(event) => updateSelectedPayload(event.target.value)}
                onBlur={(event) => void saveSelectedPayload(event.target.value)}
                style={{ minHeight: 120 }}
              />
            </label>
          </div>
        )}
      </PanelCard>

      <PanelCard>
        <SectionTitle title="Runner logs" right={<StatusPill label={`${logs.length} logs`} tone="info" />} />

        {logs.length === 0 ? (
          <EmptyState text="No runner logs." />
        ) : (
          <div className="fd-grid">
            {logs.slice(0, 12).map((log) => (
              <article key={log.id} className="fd-row wrap">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <strong>{log.runner_name}</strong>
                    <StatusPill label={log.run_mode} tone="info" />
                    <StatusPill
                      label={log.status}
                      tone={log.status === "completed" ? "success" : log.status === "failed" ? "danger" : "warning"}
                    />
                  </div>
                  <div className="fd-muted">
                    {new Date(log.started_at).toLocaleString("en-AU")}
                    {log.finished_at ? ` → ${new Date(log.finished_at).toLocaleString("en-AU")}` : ""}
                  </div>
                  {log.error_message && (
                    <div className="fd-alert danger" style={{ marginTop: 8 }}>
                      {log.error_message}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}
