import type { FamilyData } from "../../lib/familyDataTypes";
import { conflictTone, detectAllConflicts } from "../../lib/conflictEngine";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";

type Props = {
  data: FamilyData;
  compact?: boolean;
};

export function ConflictCenterPanel({ data, compact }: Props) {
  const conflicts = detectAllConflicts(data, compact ? 7 : 30);
  const visible = compact ? conflicts.slice(0, 4) : conflicts;

  return (
    <PanelCard>
      <SectionTitle
        title="Conflict centre"
        subtitle={compact ? "未来 7 天主要冲突" : "未来 30 天冲突和风险"}
        right={<StatusPill label={`${conflicts.length} risks`} tone={conflicts.length ? "warning" : "success"} />}
      />

      {visible.length === 0 ? (
        <EmptyState text="没有发现明显时间冲突。" />
      ) : (
        <div className="fd-grid">
          {visible.map((conflict) => (
            <article key={conflict.id} className={`fd-alert ${conflictTone(conflict.severity)}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{conflict.title}</strong>
                <StatusPill label={conflict.severity} tone={conflictTone(conflict.severity) as any} />
              </div>
              <div style={{ marginTop: 6 }}>{conflict.detail}</div>
              <div className="fd-muted">{conflict.dateKey} · {conflict.type}</div>
            </article>
          ))}

          {compact && conflicts.length > visible.length && (
            <div className="fd-muted">还有 {conflicts.length - visible.length} 个风险，请到 Calendar 查看。</div>
          )}
        </div>
      )}
    </PanelCard>
  );
}
