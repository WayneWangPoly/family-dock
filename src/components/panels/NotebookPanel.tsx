import type { FamilyData } from "../../lib/familyDataTypes";
import type { LearningSummary } from "../../lib/familyUiHelpers";
import { getMemberName, getRecentLearningRecords } from "../../lib/familyUiHelpers";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";

type Props = {
  data: FamilyData & { learningSummaries?: LearningSummary[] };
  onRefresh?: () => Promise<unknown> | unknown;
};

export function NotebookPanel({ data }: Props) {
  const records = getRecentLearningRecords(data.learningRecords, 10);
  const summaries = data.learningSummaries ?? [];

  return (
    <div className="fd-grid">
      <PanelCard raised>
        <SectionTitle title="Learning summaries" subtitle="Progress notes and parent observations" />
        {summaries.length === 0 ? (
          <EmptyState text="No summaries yet." />
        ) : (
          <div className="fd-grid">
            {summaries.map((summary) => (
              <section key={summary.id} className="fd-soft-card">
                <div className="fd-row-between">
                  <div>
                    <strong>{summary.summary_title ?? "Learning summary"}</strong>
                    <div className="fd-muted">
                      {summary.course_name ?? "All courses"} · {summary.range_type} · {summary.start_date} to {summary.end_date}
                    </div>
                  </div>
                  <StatusPill label={`${summary.evidence_count} evidence`} />
                </div>
                {summary.overall_summary && <p style={{ marginBottom: 0 }}>{summary.overall_summary}</p>}
              </section>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard>
        <SectionTitle title="Course notebook" subtitle="Child comments, parent notes and teacher feedback" />
        {records.length === 0 ? (
          <EmptyState text="No notebook records yet." />
        ) : (
          <div className="fd-grid">
            {records.map((record) => (
              <section key={record.id} className="fd-soft-card">
                <strong>{record.lesson_title ?? record.course_name ?? "Course note"}</strong>
                <div className="fd-muted">
                  {record.lesson_date} · {getMemberName(data, record.child_id)} · {record.course_name ?? "Uncategorised"}
                </div>
                <div className="fd-grid two" style={{ marginTop: 10 }}>
                  <div className="fd-note-box">
                    <strong>Child</strong>
                    <span>{record.child_comment ?? "Not added yet"}</span>
                  </div>
                  <div className="fd-note-box">
                    <strong>Parent</strong>
                    <span>{record.parent_comment ?? record.summary ?? "Not added yet"}</span>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}
