import { useEffect, useState } from "react";
import { buildSystemHealthItems } from "../../lib/systemHealth";
import type { HealthItem } from "../../lib/systemHealth";
import { PanelCard, SectionTitle, StatusPill } from "./shared";

export function SystemHealthPanel() {
  const [items, setItems] = useState<HealthItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await buildSystemHealthItems());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  const failed = items.filter((item) => !item.ok).length;

  return (
    <PanelCard>
      <SectionTitle
        title="System health"
        subtitle="手机端/PWA/通知/地图关键配置检查"
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatusPill label={failed ? `${failed} issue` : "healthy"} tone={failed ? "warning" : "success"} />
            <button onClick={refresh} className="fd-button small">{loading ? "Checking..." : "Refresh"}</button>
          </div>
        }
      />

      <div className="fd-grid">
        {items.map((item) => (
          <article key={item.key} className="fd-row wrap">
            <div style={{ flex: 1 }}>
              <strong>{item.label}</strong>
              <div className="fd-muted">{item.detail}</div>
            </div>
            <StatusPill label={item.ok ? "ok" : "check"} tone={item.ok ? "success" : "warning"} />
          </article>
        ))}
      </div>
    </PanelCard>
  );
}
