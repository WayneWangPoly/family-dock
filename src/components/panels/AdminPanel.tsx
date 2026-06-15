import { useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { CalendarIntegrationPanel } from "./CalendarIntegrationPanel";
import { ProductionHardeningPanel } from "./ProductionHardeningPanel";
import { QualityAssurancePanel } from "./QualityAssurancePanel";
import { PanelCard, SectionTitle } from "./shared";

type Props = {
  data: FamilyData;
  realtimeStatus?: string;
};

export function AdminPanel({ data, realtimeStatus }: Props) {
  const [tab, setTab] = useState<"health" | "calendar" | "release">("health");

  return (
    <div className="fd-grid">
      <PanelCard raised>
        <SectionTitle
          title="Admin tools"
          subtitle="Setup and checks are kept here so the daily app stays clean."
        />
        <div className="fd-segmented">
          <button onClick={() => setTab("health")} className={tab === "health" ? "active" : ""}>Health</button>
          <button onClick={() => setTab("calendar")} className={tab === "calendar" ? "active" : ""}>Calendar setup</button>
          <button onClick={() => setTab("release")} className={tab === "release" ? "active" : ""}>Release</button>
        </div>
      </PanelCard>

      {tab === "health" && <QualityAssurancePanel data={data} realtimeStatus={realtimeStatus} />}
      {tab === "calendar" && <CalendarIntegrationPanel data={data} />}
      {tab === "release" && <ProductionHardeningPanel data={data} />}
    </div>
  );
}
