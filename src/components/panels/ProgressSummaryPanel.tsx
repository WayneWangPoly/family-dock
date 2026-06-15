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

function confidenceTone(confidence: number) {
  if (confidence >= 0.75) return "success";
  if (confidence >= 0.5) return "warning";
  return "danger";
}

function riskTone(summary: LearningProgressSummary) {
  const level = summary.summary_json?.progress_level;
  if (level === "strong" || level === "steady") return "success";
  if (level === "mixed") return "warning";
  if (level === "needs_attention" || level === "insufficient_evidence") return "danger";
  return "info";
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

  const children = useMemo(() => {
    return data.members.filter((member) => ["child", "homestay"].includes(member.role));
  }, [data.members]);

  useEffect(() => {
    if (!childId && children[0]) setChildId(children[0].id);
  }, [children, childId]);

  async function refresh() {
    try {
      const rows = await loadProgressSummaries(data.family.id);
      setSummaries(rows);
      if (selectedSummary) {
        setSelectedSummary(rows.find((row) => row.id === selectedSummary.id) ?? null);
      }
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    refresh();
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
      showToast(`Progress summary created with ${result.evidence_counts.notes} notes, ${result.evidence_counts.homework} homework, ${result.evidence_counts.events} events.`, "success");
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

  function copy(summary: LearningProgressSummary) {
    const text = formatProgressSummaryForCopy(summary, getMemberName(data, summary.child_id));
    navigator.clipboard.writeText(text);
    showToast("Progress summary copied.", "success");
  }

  return (
    <div className="fd-grid">
      <PanelCard raised>
        <SectionTitle
          title="Professional progress summary"
          subtitle="基于课程笔记、作业、日程证据，生成专业成长报告"
          right={<StatusPill label="Evidence-based" tone="info" />}
        />

        <div className="fd-grid two">
          <label className="fd-field">
            Child / Homestay
            <select className="fd-select" value={childId} onChange={(event) => setChildId(event.target.value)}>
              <option value="">Select child</option>
              {children.map((member) => (
                <option key={member.id} value={member.id}>{member.display_name}</option>
              ))}
            </select>
          </label>

          <label className="fd-field">
            Subject / activity focus
            <input
              className="fd-input"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="e.g. Fencing, spelling, reading, music..."
            />
          </label>

          <label className="fd-field">
            Period type
            <select className="fd-select" value={periodType} onChange={(event) => applyPeriod(event.target.value as any)}>
              <option value="week">week</option>
              <option value="month">month</option>
              <option value="term">term</option>
              <option value="custom">custom</option>
            </select>
          </label>

          <label className="fd-field">
            Language
            <select className="fd-select" value={language} onChange={(event) => setLanguage(event.target.value as any)}>
              <option value="zh">Chinese</option>
              <option value="en">English</option>
              <option value="bilingual">Bilingual</option>
            </select>
          </label>

          <label className="fd-field">
            Period start
            <input className="fd-input" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
          </label>

          <label className="fd-field">
            Period end
            <input className="fd-input" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </label>
        </div>

        <div className="fd-alert info" style={{ marginTop: 14 }}>
          专业报告不会凭空判断。证据越多，confidence 越高；证据不足会明确写 missing evidence。
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button disabled={busy} onClick={generate} className="fd-button primary">
            {busy ? "Generating..." : "Generate progress summary"}
          </button>
          <button onClick={refresh} className="fd-button">Refresh</button>
        </div>
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="Saved summaries"
          subtitle="可复制给家长、老师、教练，也可以作为长期成长档案"
          right={<StatusPill label={`${summaries.length} reports`} tone="info" />}
        />

        {summaries.length === 0 ? (
          <EmptyState text="暂无成长总结。先添加 learning notes / homework / events，再生成报告。" />
        ) : (
          <div className="fd-grid">
            {summaries.map((summary) => (
              <article key={summary.id} className="fd-card soft">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{summary.title}</strong>
                  <StatusPill label={summary.status} tone={summary.status === "final" ? "success" : "info"} />
                  <StatusPill label={`${Math.round(Number(summary.confidence) * 100)}%`} tone={confidenceTone(Number(summary.confidence)) as any} />
                  <StatusPill label={summary.summary_json?.progress_level ?? "summary"} tone={riskTone(summary) as any} />
                </div>

                <div className="fd-muted">
                  {getMemberName(data, summary.child_id)} · {summary.period_start} to {summary.period_end}
                  {summary.subject ? ` · ${summary.subject}` : ""} · evidence {summary.evidence_count}
                </div>

                <div className="fd-alert info" style={{ marginTop: 10 }}>
                  {summary.executive_summary}
                </div>

                <details style={{ marginTop: 10 }}>
                  <summary style={{ fontWeight: 950, cursor: "pointer" }}>Full professional report</summary>
                  <section style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                    <p>{summary.narrative_text}</p>

                    <h4>Strengths</h4>
                    <ul>{summary.strengths.map((item) => <li key={item}>{item}</li>)}</ul>

                    <h4>Concerns / improvement areas</h4>
                    <ul>{summary.concerns.map((item) => <li key={item}>{item}</li>)}</ul>

                    <h4>Observed patterns</h4>
                    <ul>{summary.observed_patterns.map((item) => <li key={item}>{item}</li>)}</ul>

                    <h4>Recommendations</h4>
                    <ul>{summary.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>

                    <h4>Parent actions</h4>
                    <ul>{summary.parent_actions.map((item) => <li key={item}>{item}</li>)}</ul>

                    <h4>Child actions</h4>
                    <ul>{summary.child_actions.map((item) => <li key={item}>{item}</li>)}</ul>

                    <h4>Teacher / coach questions</h4>
                    <ul>{summary.teacher_questions.map((item) => <li key={item}>{item}</li>)}</ul>

                    <h4>Next goals</h4>
                    <ul>{summary.next_goals.map((item) => <li key={item}>{item}</li>)}</ul>

                    {summary.missing_evidence.length > 0 && (
                      <>
                        <h4>Missing evidence</h4>
                        <ul>{summary.missing_evidence.map((item) => <li key={item}>{item}</li>)}</ul>
                      </>
                    )}
                  </section>
                </details>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button onClick={() => setSelectedSummary(summary)} className="fd-button small primary">Export / Share</button>
                  <button onClick={() => copy(summary)} className="fd-button small">Copy full report</button>
                  {summary.status !== "final" && (
                    <button onClick={() => setStatus(summary, "final")} className="fd-button small">Mark final</button>
                  )}
                  {summary.status !== "archived" && (
                    <button onClick={() => setStatus(summary, "archived")} className="fd-button small">Archive</button>
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
