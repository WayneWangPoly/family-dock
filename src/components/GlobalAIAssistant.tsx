import type { FamilyData } from "../lib/familyDataTypes";
import { getAiIntentLabel } from "../lib/aiActionLabels";
import { useAiCommandFlow } from "../hooks/useAiCommandFlow";
import { AiActionReviewCard } from "./AiActionReviewCard";

type Props = {
  familyData: FamilyData;
  activePage?: string;
  onRefresh?: () => Promise<unknown> | unknown;
};

export function GlobalAIAssistant({ familyData, activePage, onRefresh }: Props) {
  const flow = useAiCommandFlow({ familyData, activePage, onRefresh });

  return (
    <>
      <button onClick={() => flow.setOpen(true)} className="fd-global-ai-button">AI</button>

      {flow.open && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <header style={modalHeaderStyle}>
              <div>
                <h2 style={{ margin: 0 }}>AI 家庭助理</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontWeight: 600 }}>
输入一句话处理日程、作业、付款、申请、菜单和课程笔记
                </p>
              </div>
              <button onClick={flow.close} style={iconButtonStyle}>×</button>
            </header>

            <div style={bodyStyle}>
              <section style={inputPanelStyle}>
                <textarea
                  value={flow.transcript}
                  onChange={(event) => flow.setTranscript(event.target.value)}
                  placeholder="例如：给大女儿增加击剑付款420刀，付给Adelaide Fencing Club，reference ELLA-T3-FENCE"
                  style={textareaStyle}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  <button onClick={() => flow.parse()} disabled={flow.parsing} style={primaryButtonStyle}>
                    {flow.parsing ? "解析中..." : "AI 解析"}
                  </button>
                  <button onClick={flow.resetFlow} style={secondaryButtonStyle}>清空</button>
                </div>
              </section>

              {flow.errorMessage && <div style={errorStyle}>{flow.errorMessage}</div>}

              {flow.parseResult && (
                <section style={summaryStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={eyebrowStyle}>AI 判断</div>
                      <h3 style={{ margin: 0 }}>{getAiIntentLabel(flow.parseResult.parsed.intent)}</h3>
                    </div>
                    <div style={confidenceStyle}>{Math.round((flow.parseResult.parsed.confidence ?? 0) * 100)}%</div>
                  </div>

                  <p style={{ marginBottom: 0 }}>{flow.parseResult.parsed.draft_summary}</p>

                  {flow.parseResult.parsed.needs_clarification && (
                    <div style={warningStyle}>
                      {flow.parseResult.parsed.clarifying_question ?? "AI 认为还需要补充信息。"}
                    </div>
                  )}

                  {flow.localMissingFields.length > 0 && (
                    <div style={warningStyle}>仍有必填字段缺失：{flow.localMissingFields.join("、")}</div>
                  )}
                </section>
              )}

              {flow.editableActions.length > 0 && (
                <div style={{ display: "grid", gap: 12 }}>
                  {flow.editableActions.map((action, index) => (
                    <AiActionReviewCard
                      key={action.client_action_id ?? `${action.type}-${index}`}
                      action={action}
                      index={index}
                      onChange={flow.updateAction}
                      onRemove={flow.removeAction}
                    />
                  ))}
                </div>
              )}
            </div>

            <footer style={footerStyle}>
              <button onClick={flow.close} style={secondaryButtonStyle}>取消</button>
              <button
                onClick={flow.commit}
                disabled={!flow.canCommit}
                style={{ ...primaryButtonStyle, opacity: flow.canCommit ? 1 : 0.45, cursor: flow.canCommit ? "pointer" : "not-allowed" }}
              >
                {flow.committing ? "保存中..." : "确认执行"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 70, background: "rgba(15,23,42,.45)", display: "flex", justifyContent: "center", alignItems: "center", padding: 16 };
const modalStyle: React.CSSProperties = { width: "min(960px, 100%)", maxHeight: "90vh", background: "#fffaf2", borderRadius: 28, overflow: "hidden", boxShadow: "0 24px 90px rgba(15,23,42,.35)", display: "flex", flexDirection: "column" };
const modalHeaderStyle: React.CSSProperties = { padding: 18, display: "flex", justifyContent: "space-between", alignItems: "start", borderBottom: "1px solid #eadfd0", background: "rgba(255,255,255,.75)" };
const iconButtonStyle: React.CSSProperties = { width: 36, height: 36, borderRadius: 12, border: "1px solid #ddd", background: "white", fontSize: 24, cursor: "pointer" };
const bodyStyle: React.CSSProperties = { padding: 16, overflow: "auto", display: "grid", gap: 14 };
const inputPanelStyle: React.CSSProperties = { padding: 14, borderRadius: 20, background: "white", border: "1px solid #eadfd0" };
const textareaStyle: React.CSSProperties = { width: "100%", minHeight: 110, resize: "vertical", padding: 12, borderRadius: 16, border: "1px solid #ddd", font: "inherit", boxSizing: "border-box" };
const primaryButtonStyle: React.CSSProperties = { padding: "10px 14px", borderRadius: 14, border: "none", background: "#31535c", color: "white", fontWeight: 900, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { padding: "10px 14px", borderRadius: 14, border: "1px solid #ddd", background: "white", color: "#334155", fontWeight: 900, cursor: "pointer" };
const errorStyle: React.CSSProperties = { padding: 12, borderRadius: 16, background: "#fef2f2", color: "#b91c1c", fontWeight: 800 };
const summaryStyle: React.CSSProperties = { padding: 14, borderRadius: 20, background: "white", border: "1px solid #eadfd0" };
const eyebrowStyle: React.CSSProperties = { fontSize: 12, fontWeight: 900, color: "#64748b", marginBottom: 3 };
const confidenceStyle: React.CSSProperties = { alignSelf: "start", padding: "6px 10px", borderRadius: 999, background: "#ecfdf5", color: "#047857", fontWeight: 900 };
const warningStyle: React.CSSProperties = { marginTop: 12, padding: 10, borderRadius: 14, background: "#fff7ed", color: "#c2410c", fontWeight: 800 };
const footerStyle: React.CSSProperties = { padding: 16, display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #eadfd0", background: "rgba(255,255,255,.75)" };
