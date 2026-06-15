import { useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import type { LearningProgressSummary } from "../../lib/progressSummary";
import {
  buildEmailDraft,
  buildSummaryMarkdown,
  downloadHtml,
  generateReportShareVersion,
  loadReportShares,
  markdownToPlainText,
  openPrintWindow,
  updateReportShareStatus,
} from "../../lib/reportExport";
import type { ProgressReportShare } from "../../lib/reportExport";
import { getMemberName } from "../../lib/familyUiHelpers";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
  summary: LearningProgressSummary;
};

function audienceLabel(audience: string) {
  if (audience === "teacher") return "Teacher";
  if (audience === "coach") return "Coach";
  if (audience === "meeting") return "Meeting prep";
  if (audience === "email") return "Email";
  if (audience === "parent") return "Parent full";
  return "Custom";
}

export function ProgressReportToolsPanel({ data, summary }: Props) {
  const [shares, setShares] = useState<ProgressReportShare[]>([]);
  const [audience, setAudience] = useState<ProgressReportShare["audience"]>("teacher");
  const [language, setLanguage] = useState<ProgressReportShare["language"]>("en");
  const [customInstruction, setCustomInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const { showToast, showError } = useToast();

  const childName = getMemberName(data, summary.child_id);
  const parentMarkdown = useMemo(() => buildSummaryMarkdown(summary, childName), [summary, childName]);

  async function refresh() {
    try {
      setShares(await loadReportShares(data.family.id, summary.id));
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    refresh();
  }, [data.family.id, summary.id]);

  async function copyText(text: string, label = "Copied") {
    await navigator.clipboard.writeText(text);
    showToast(label, "success");
  }

  async function generateShare() {
    setBusy(true);

    try {
      const result = await generateReportShareVersion({
        familyId: data.family.id,
        summaryId: summary.id,
        audience,
        language,
        customInstruction,
        save: true,
      });

      await refresh();
      showToast(`${audienceLabel(result.share.audience)} version generated.`, "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function setShareStatus(share: ProgressReportShare, status: "draft" | "final" | "archived") {
    try {
      await updateReportShareStatus({
        familyId: data.family.id,
        shareId: share.id,
        status,
      });
      await refresh();
      showToast(`Share version marked ${status}.`, "success");
    } catch (error) {
      showError(error);
    }
  }

  return (
    <div className="fd-grid">
      <PanelCard>
        <SectionTitle
          title="Export / Print"
          subtitle="把完整家长版报告导出、打印或复制"
          right={<StatusPill label="Parent full version" tone="info" />}
        />

        <div className="fd-alert warning">
          家长完整版本可能包含内部观察和家庭行动计划。发给老师或教练前，建议先生成 Teacher / Coach 分享版。
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button onClick={() => openPrintWindow(summary.title, parentMarkdown)} className="fd-button primary">
            Print / Save PDF
          </button>
          <button onClick={() => downloadHtml(`${summary.title.replaceAll(" ", "_")}.html`, summary.title, parentMarkdown)} className="fd-button">
            Download HTML
          </button>
          <button onClick={() => copyText(markdownToPlainText(parentMarkdown), "Full report copied.")} className="fd-button">
            Copy full text
          </button>
        </div>
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="Generate share version"
          subtitle="生成老师 / 教练 / 家长会 / 邮件版本"
          right={<StatusPill label="AI rewrite with privacy filter" tone="success" />}
        />

        <div className="fd-grid two">
          <label className="fd-field">
            Audience
            <select className="fd-select" value={audience} onChange={(event) => setAudience(event.target.value as any)}>
              <option value="teacher">Teacher</option>
              <option value="coach">Coach</option>
              <option value="meeting">Parent meeting prep</option>
              <option value="email">Email-ready</option>
              <option value="parent">Parent full rewrite</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="fd-field">
            Language
            <select className="fd-select" value={language} onChange={(event) => setLanguage(event.target.value as any)}>
              <option value="en">English</option>
              <option value="zh">Chinese</option>
              <option value="bilingual">Bilingual</option>
            </select>
          </label>
        </div>

        {audience === "custom" && (
          <label className="fd-field" style={{ marginTop: 12 }}>
            Custom instruction
            <textarea
              className="fd-textarea"
              value={customInstruction}
              onChange={(event) => setCustomInstruction(event.target.value)}
              placeholder="例如：生成给击剑教练的简短英文版，重点问体能和比赛节奏..."
            />
          </label>
        )}

        <div className="fd-alert info" style={{ marginTop: 12 }}>
          Teacher / Coach 版本会自动去掉过于内部的家庭细节，保留可观察表现、问题、下一步目标和沟通问题。
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button disabled={busy} onClick={generateShare} className="fd-button primary">
            {busy ? "Generating..." : "Generate share version"}
          </button>
          <button onClick={refresh} className="fd-button">Refresh</button>
        </div>
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="Saved share versions"
          subtitle="长期保存不同对象的报告版本"
          right={<StatusPill label={`${shares.length} versions`} tone="info" />}
        />

        {shares.length === 0 ? (
          <EmptyState text="暂无分享版本。先生成 Teacher / Coach / Meeting / Email 版本。" />
        ) : (
          <div className="fd-grid">
            {shares.map((share) => (
              <article key={share.id} className="fd-card soft">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong>{share.title}</strong>
                  <StatusPill label={audienceLabel(share.audience)} tone="info" />
                  <StatusPill label={share.language} tone="success" />
                  <StatusPill label={share.status} tone={share.status === "final" ? "success" : "info"} />
                </div>

                <div className="fd-muted">
                  {childName} · {new Date(share.created_at).toLocaleString("en-AU")}
                </div>

                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 950 }}>Open share version</summary>
                  <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                    {share.content_markdown}
                  </div>

                  {share.key_points.length > 0 && (
                    <>
                      <h4>Key points</h4>
                      <ul>{share.key_points.map((item) => <li key={item}>{item}</li>)}</ul>
                    </>
                  )}

                  {share.questions.length > 0 && (
                    <>
                      <h4>Questions</h4>
                      <ul>{share.questions.map((item) => <li key={item}>{item}</li>)}</ul>
                    </>
                  )}

                  {share.action_items.length > 0 && (
                    <>
                      <h4>Action items</h4>
                      <ul>{share.action_items.map((item) => <li key={item}>{item}</li>)}</ul>
                    </>
                  )}

                  {share.privacy_notes.length > 0 && (
                    <div className="fd-alert warning">
                      <strong>Privacy notes</strong>
                      <ul style={{ marginBottom: 0 }}>
                        {share.privacy_notes.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  )}
                </details>

                {share.email_subject && share.email_body && (
                  <div className="fd-alert info" style={{ marginTop: 10 }}>
                    <strong>Email subject:</strong> {share.email_subject}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button onClick={() => openPrintWindow(share.title, share.content_markdown)} className="fd-button small primary">
                    Print / Save PDF
                  </button>
                  <button onClick={() => downloadHtml(`${share.title.replaceAll(" ", "_")}.html`, share.title, share.content_markdown)} className="fd-button small">
                    Download HTML
                  </button>
                  <button onClick={() => copyText(markdownToPlainText(share.content_markdown), "Share version copied.")} className="fd-button small">
                    Copy text
                  </button>
                  {share.email_subject && share.email_body && (
                    <>
                      <button onClick={() => copyText(`Subject: ${share.email_subject}\n\n${share.email_body}`, "Email copied.")} className="fd-button small">
                        Copy email
                      </button>
                      <button onClick={() => buildEmailDraft(share.email_subject ?? "", share.email_body ?? "")} className="fd-button small">
                        Open email
                      </button>
                    </>
                  )}
                  {share.status !== "final" && (
                    <button onClick={() => setShareStatus(share, "final")} className="fd-button small">Mark final</button>
                  )}
                  {share.status !== "archived" && (
                    <button onClick={() => setShareStatus(share, "archived")} className="fd-button small">Archive</button>
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
