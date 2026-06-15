import type { FamilyData } from "../../lib/familyDataTypes";
import { buildDailyBrief } from "../../lib/dailyBrief";
import { PanelCard, SectionTitle } from "./shared";

type Props = {
  data: FamilyData;
};

function iconForTone(tone: string) {
  if (tone === "danger") return "!";
  if (tone === "warning") return "•";
  if (tone === "success") return "✓";
  return "i";
}

function humanTitle(title: string, tone: string) {
  const lower = title.toLowerCase();
  if (lower.includes("conflict") || lower.includes("risk")) {
    return tone === "success" ? "✨ Schedule is clear today" : "Check timing today";
  }
  if (lower.includes("homework")) return "Homework to keep an eye on";
  if (lower.includes("payment")) return "Payments to review";
  if (lower.includes("route")) return "Pickup timing";
  if (lower.includes("request")) return "Family requests";
  return title;
}

export function DailyBriefPanel({ data }: Props) {
  const items = buildDailyBrief(data).slice(0, 5);

  if (items.length === 0) return null;

  return (
    <PanelCard>
      <SectionTitle title="Today brief" />

      <div className="fd-feed-list">
        {items.map((item, index) => (
          <article key={`${item.title}-${index}`} className={`fd-feed-item ${item.tone}`}>
            <div className="fd-feed-icon">{iconForTone(item.tone)}</div>
            <div className="fd-feed-copy">
              <strong>{humanTitle(item.title, item.tone)}</strong>
              {item.detail && <span>{item.detail}</span>}
            </div>
          </article>
        ))}
      </div>
    </PanelCard>
  );
}
