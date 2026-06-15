import { useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  actionIsCommitReady,
  commitCopilotActions,
  getCopilotPromptExamples,
  planCopilotCommand,
} from "../../lib/aiCopilot";
import type { AICopilotAction, AICopilotPlan } from "../../lib/aiCopilot";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { ProgressSummaryPanel } from "./ProgressSummaryPanel";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
  activePage: string;
  onRefresh?: () => Promise<unknown> | unknown;
};

function getActionTone(action: AICopilotAction) {
  if ((action.missing_fields ?? []).length > 0) return "warning";
  if (actionIsCommitReady(action)) return "success";
  if (action.type === "query_answer") return "info";
  return "warning";
}


export function AICopilotPanel({ data, activePage, onRefresh }: Props) {
  const [command, setCommand] = useState("");
  const [extraDetail, setExtraDetail] = useState("");
  const [plan, setPlan] = useState<AICopilotPlan | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"assistant" | "reports">("assistant");
  const { showToast, showError } = useToast();

  const examples = useMemo(() => getCopilotPromptExamples(), []);
  const readyActions = useMemo(() => {
    return (plan?.actions ?? []).filter(actionIsCommitReady);
  }, [plan]);

  async function generatePlan(extra?: string) {
    if (!command.trim()) {
      showToast("先输入一句指令。", "info");
      return;
    }

    setBusy("plan");

    try {
      const result = await planCopilotCommand({
        data,
        command,
        activePage,
        extraDetail: extra ?? extraDetail,
        previousPlan: plan,
      });

      setPlan(result.plan);
      setSessionId(result.session_id);
      setExtraDetail("");
      showToast("AI plan ready. Review it before saving.", "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function commitReadyActions() {
    if (!sessionId || readyActions.length === 0) return;

    setBusy("commit");

    try {
      const result = await commitCopilotActions({
        data,
        sessionId,
        actions: readyActions,
      });

      await onRefresh?.();
      showToast(result.failed ? "Some items could not be saved." : "Saved.", result.failed ? "error" : "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  function clearAll() {
    setCommand("");
    setExtraDetail("");
    setPlan(null);
    setSessionId(null);
  }

  return (
    <div className="fd-grid">
      <PanelCard raised>
        <SectionTitle
          title="Ask AI"
          subtitle="Type once. AI will organise it."
        />

        <div className="fd-segmented" style={{ marginBottom: 14 }}>
          <button onClick={() => setView("assistant")} className={view === "assistant" ? "active" : ""}>Assistant</button>
          <button onClick={() => setView("reports")} className={view === "reports" ? "active" : ""}>Progress reports</button>
        </div>

        {view === "assistant" && (
        <div className="fd-grid">
          <textarea
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            className="fd-textarea"
            style={{ minHeight: 130, fontSize: 16 }}
            placeholder="例如：记录一下今天击剑课大女儿步伐进步明显，但最后体力下降..."
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button disabled={busy === "plan"} onClick={() => generatePlan()} className="fd-button primary">
              {busy === "plan" ? "Thinking..." : "Review"}
            </button>
            <button onClick={clearAll} className="fd-button">Clear</button>
          </div>

          <div className="fd-muted" style={{ fontSize: 12 }}>
            You can use your phone keyboard’s microphone, then tap Review.
          </div>

          <details className="fd-disclosure">
            <summary>Examples</summary>
            <div className="fd-mobile-scroll-strip" style={{ marginTop: 10 }}>
              {examples.map((example) => (
                <button
                  key={example}
                  onClick={() => setCommand(example)}
                  className="fd-touch-card"
                  style={{ textAlign: "left", border: "1px solid var(--fd-border)", color: "var(--fd-brand)", fontWeight: 850 }}
                >
                  {example}
                </button>
              ))}
            </div>
          </details>
        </div>
        )}
      </PanelCard>

      {view === "assistant" && plan && (
        <PanelCard>
          <SectionTitle
            title="Review before saving"
            subtitle={plan.intent_summary}
            right={plan.needs_more_info ? <StatusPill label="needs details" tone="warning" /> : <StatusPill label="ready" tone="success" />}
          />

          {plan.answer && <div className="fd-alert info">{plan.answer}</div>}

          {plan.questions?.length > 0 && (
            <div className="fd-alert warning">
              <strong>AI needs a little more detail:</strong>
              <ul style={{ marginBottom: 0 }}>
                {plan.questions.map((question) => <li key={question}>{question}</li>)}
              </ul>
            </div>
          )}

          {plan.questions?.length > 0 && (
            <div className="fd-grid">
              <label className="fd-field">
                Add details
                <textarea
                  className="fd-textarea"
                  value={extraDetail}
                  onChange={(event) => setExtraDetail(event.target.value)}
                  placeholder="补充地点、时间、孩子名字、老师、金额等..."
                />
              </label>
              <button disabled={busy === "plan"} onClick={() => generatePlan(extraDetail)} className="fd-button primary">
                Update AI plan
              </button>
            </div>
          )}

          <div className="fd-grid" style={{ marginTop: 14 }}>
            {plan.actions?.length === 0 && <EmptyState text="AI 没有生成可执行动作。" />}
            {plan.actions?.map((action) => {
              const canCommit = actionIsCommitReady(action);

              return (
                <article key={action.id} className="fd-row wrap" style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong>{action.title}</strong>
                      <StatusPill label={action.type.replaceAll("_", " ")} tone={getActionTone(action) as any} />
                    </div>

                    <div style={{ marginTop: 8 }}>{action.preview}</div>

                    {action.missing_fields?.length > 0 && (
                      <div className="fd-alert warning" style={{ marginTop: 8 }}>
                        Missing: {action.missing_fields.join(", ")}
                      </div>
                    )}
                  </div>

                  <StatusPill label={canCommit ? "ready" : "check"} tone={canCommit ? "success" : "warning"} />
                </article>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <button
              disabled={busy === "commit" || readyActions.length === 0}
              onClick={commitReadyActions}
              className="fd-button primary"
            >
              {busy === "commit" ? "Saving..." : `Save ${readyActions.length}` }
            </button>
            <button onClick={clearAll} className="fd-button">Cancel</button>
          </div>

          {plan.safety_notes?.length > 0 && (
            <div className="fd-alert info" style={{ marginTop: 14 }}>
              <strong>Notes:</strong>
              <ul style={{ marginBottom: 0 }}>
                {plan.safety_notes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            </div>
          )}
        </PanelCard>
      )}

      {view === "reports" && <ProgressSummaryPanel data={data} />}

    </div>
  );
}
