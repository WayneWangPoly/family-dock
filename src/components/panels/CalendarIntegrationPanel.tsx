import { useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { CalendarSchoolOverlayPanel } from "./CalendarSchoolOverlayPanel";
import { SchoolCalendarEnginePanel } from "./SchoolCalendarEnginePanel";
import { CronSetupPanel } from "./CronSetupPanel";
import { PanelCard, SectionTitle } from "./shared";

type Props = {
  data: FamilyData;
};

export function CalendarIntegrationPanel({ data }: Props) {
  const [tab, setTab] = useState<"overlay" | "settings" | "cron">("overlay");

  return (
    <div className="fd-grid">
      <PanelCard raised>
        <SectionTitle
          title="Calendar integration"
          subtitle="School term engine、Week labels、Cron setup 集成入口"
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setTab("overlay")} className={`fd-button ${tab === "overlay" ? "primary" : ""}`}>
            Week labels
          </button>
          <button onClick={() => setTab("settings")} className={`fd-button ${tab === "settings" ? "primary" : ""}`}>
            School settings
          </button>
          <button onClick={() => setTab("cron")} className={`fd-button ${tab === "cron" ? "primary" : ""}`}>
            Cron setup
          </button>
        </div>
      </PanelCard>

      {tab === "overlay" && <CalendarSchoolOverlayPanel data={data} />}
      {tab === "settings" && <SchoolCalendarEnginePanel data={data} />}
      {tab === "cron" && <CronSetupPanel data={data} />}
    </div>
  );
}
