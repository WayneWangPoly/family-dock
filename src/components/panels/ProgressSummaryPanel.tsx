import { useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  defaultMonthRange,
  defaultWeekRange,
  formatProgressSummaryForCopy,
  generateProgressSummary,
  loadProgressSummaries,
  updateProgressSummaryStatus,
} from "../../lib/progressSummary";
import type { LearningProgressSummary } from "../../lib/progressSummary";
import { getMemberName } from "../../lib/familyUiHelpers";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { ProgressReportToolsPanel } from "./ProgressReportToolsPanel";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
};

type StatusTone = "default" | "warning" | "success" | "danger" | "info";

function confidenceTone(confidence: number): StatusTone {
  if (confidence >= 0.75) return "success";
  if (confidence >= 0.5) return "warning";
  return "danger";
}

function getProgressLevel(summary: LearningProgressSummary) {
  const raw = (summary.summary_json as { progress_level?: unknown } | null | undefined)?.progress_level;
  return typeof raw === "string" && raw.trim() ? raw : "summary";
}

function riskTone(summary: LearningProgressSummary): StatusTone {
  const level = getProgressLevel(summary);
  if (level === "strong" || level === "steady") return "success";
  if (level === "mixed") return "warning";
  if (level === "needs_attention" || level === "insufficient_evidence") return "danger";
  return "info";
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;

  return (
    <>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={`${title}-${item}`}>{item}</li>
        ))}
      </ul>
    </>
  );
}

export function ProgressSummaryPanel({ data }: Props) {
  const month = defaultMonthRange();

  const [childId, setChildId] = useState("");
  const [periodType, setPeriodType] = useState<"week" | "month" | "term" | "custom">("month");
  const [periodStart, setPeriodStart] = useState(month.start);
  const [periodEnd, setPeriodEnd] = useState(month.end);
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState<"zh" | "en" | "bilingual">("zh");
  const [busy, setBusy] = useState(false);
  const [summaries, setSummaries] = useState<LearningProgressSummary[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<LearningProgressSummary | null>(null);

  const { showToast, showError } = useToast();

  const children = useMemo(
    () => data.members.filter((member) => ["child", "homestay"].includes(member.role)),
    [data.members],
  );

  useEffect(() => {
    if (!childId && children[0]) setChildId(children[0].id);
  }, [children, childId]);

  async function refresh() {
    try {
      const rows = await loadProgressSummaries(data.family.id);
      setSummaries(rows);
      setSelectedSummary((current) => (current ? rows.find((row) => row.id === current.id) ?? null : current));
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.family.id]);

  function applyPeriod(type: "week" | "month" | "term" | "custom") {
    setPeriodType(type);

    if (type === "week") {
      const range = defaultWeekRange();
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
    }

    if (type === "month") {
      const range = defaultMonthRange();
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
    }
  }

  async function generate() {
    if (!childId) {
      showToast("Please select a child/member.", "info");
      return;
    }

    setBusy(true);

    try {
      const result = await generateProgressSummary({
        data,
        childId,
        periodType,
        periodStart,
        periodEnd,
        subject,
        language,
        save: true,
      });

      await refresh();
      setSelectedSummary(result.summary);
      showToast(
        `Progress summary created with ${result.evidence_counts.notes} notes, ${result.evidence_counts.homework} homework, ${result.evidence_counts.events} events.`,
        "success",
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(summary: LearningProgressSummary, status: "draft" | "final" | "archived") {
    try {
      await updateProgressSummaryStatus({
        familyId: data.family.id,
        summaryId: summary.id,
        status,
      });

      await refresh();
      showToast(`Summary marked ${status}.`, "success");
    } catch (error) {
      showError(error);
    }
  }

  async function copy(summary: LearningProgressSummary) {
    const text = formatProgressSummaryForCopy(summary, getMemberName(data, summary.child_id));
    await navigator.clipboard.writeText(text);
    showToast("Progress summary copied.", "success");
  }

  return (
    <div className="fd-stack">
      <PanelCard>
        <SectionTitle
          title="Learning progress summary"
          subtitle="Generate a structured progress report from notes, homework and calendar evidence."
        />

        <div className="fd-grid">
          <label>
            Child / Homestay
            <select value={childId} onChange={(event) => setChildId(event.target.value)}>
              <option value="">Select child</option>
              {children.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Subject / activity focus
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="e.g. Fencing, spelling, reading, music..."
            />
          </label>

          <label>
            Period type
            <select value={periodType} onChange={(event) => applyPeriod(event.target.value as typeof periodType)}>
              <option value="week">week</option>
              <option value="month">month</option>
              <option value="term">term</option>
              <option value="custom">custom</option>
            </select>
          </label>

          <label>
            Language
            <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
              <option value="zh">Chinese</option>
              <option value="en">English</option>
              <option value="bilingual">Bilingual</option>
            </select>
          </label>

          <label>
            Period start
            <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
          </label>

          <label>
            Period end
            <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </label>
        </div>

        <div className="fd-alert info" style={{ marginTop: 12 }}>
          Professional reports should be evidence-based. More notes and homework records improve confidence; missing evidence will be listed clearly.
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button disabled={busy} onClick={generate} className="fd-button primary">
            {busy ? "Generating..." : "Generate progress summary"}
          </button>
          <button onClick={refresh} className="fd-button">
            Refresh
          </button>
        </div>
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="Saved progress summaries"
          subtitle="Saved structured reports for child progress, activities and school/lifestyle evidence."
          right={<StatusPill label={`${summaries.length} reports`} tone="info" />}
        />

        {summaries.length === 0 ? (
          <EmptyState text="No progress summaries yet. Generate the first one from available evidence." />
        ) : (
          <div className="fd-grid">
            {summaries.map((summary) => (
              <article key={summary.id} className="fd-card soft">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong>{summary.title}</strong>
                  <StatusPill label={getProgressLevel(summary)} tone={riskTone(summary)} />
                  <StatusPill label={`${Math.round(Number(summary.confidence ?? 0) * 100)}%`} tone={confidenceTone(Number(summary.confidence ?? 0))} />
                  <StatusPill label={summary.status} tone={summary.status === "final" ? "success" : "info"} />
                </div>

                <div className="fd-muted">
                  {getMemberName(data, summary.child_id)} - {summary.period_start} to {summary.period_end}
                  {summary.subject ? ` - ${summary.subject}` : ""} - evidence {summary.evidence_count}
                </div>

                <p>{summary.executive_summary}</p>

                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 950 }}>Full professional report</summary>
                  <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                    {summary.narrative_text}
                  </div>

                  <BulletList title="Strengths" items={summary.strengths ?? []} />
                  <BulletList title="Concerns / improvement areas" items={summary.concerns ?? []} />
                  <BulletList title="Observed patterns" items={summary.observed_patterns ?? []} />
                  <BulletList title="Recommendations" items={summary.recommendations ?? []} />
                  <BulletList title="Parent actions" items={summary.parent_actions ?? []} />
                  <BulletList title="Child actions" items={summary.child_actions ?? []} />
                  <BulletList title="Teacher / coach questions" items={summary.teacher_questions ?? []} />
                  <BulletList title="Next goals" items={summary.next_goals ?? []} />
                  <BulletList title="Missing evidence" items={summary.missing_evidence ?? []} />
                </details>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button onClick={() => setSelectedSummary(summary)} className="fd-button small primary">
                    Export / Share
                  </button>
                  <button onClick={() => void copy(summary)} className="fd-button small">
                    Copy full report
                  </button>
                  {summary.status !== "final" && (
                    <button onClick={() => void setStatus(summary, "final")} className="fd-button small">
                      Mark final
                    </button>
                  )}
                  {summary.status !== "archived" && (
                    <button onClick={() => void setStatus(summary, "archived")} className="fd-button small">
                      Archive
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </PanelCard>

      {selectedSummary && (
        <ProgressReportToolsPanel data={data} summary={selectedSummary} />
      )}
    </div>
  );
}
