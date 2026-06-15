import { useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { HomeworkPanel } from "./HomeworkPanel";
import { NotebookPanel } from "./NotebookPanel";
import { MealsPanel } from "./MealsPanel";
import { PaymentsPanel } from "./PaymentsPanel";
import { RequestsPanel } from "./RequestsPanel";
import { MembersPlacesPanel } from "./MembersPlacesPanel";
import { PanelCard, StatusPill } from "./shared";

type Props = {
  data: FamilyData;
  onRefresh?: () => Promise<unknown> | unknown;
  onSignOut?: () => Promise<unknown> | unknown;
  realtimeStatus?: string;
};

type FamilySection = "home" | "homework" | "requests" | "money" | "places" | "people" | "notes" | "meals";

const sections: Array<{ id: FamilySection; label: string; hint: string; icon: string }> = [
  { id: "requests", label: "Requests", hint: "Needs approval", icon: "💬" },
  { id: "homework", label: "Homework", hint: "Tasks and evidence", icon: "✓" },
  { id: "money", label: "Payments", hint: "Fees and due dates", icon: "$" },
  { id: "places", label: "Locations", hint: "School, clubs, pickup", icon: "⌖" },
  { id: "people", label: "People", hint: "Family members", icon: "♡" },
  { id: "notes", label: "Notes", hint: "Progress notebook", icon: "✎" },
  { id: "meals", label: "Meals", hint: "Food plan", icon: "◦" },
];

function countFor(section: FamilySection, data: FamilyData) {
  if (section === "requests") return data.requests.filter((request) => request.status === "pending").length;
  if (section === "homework") return data.homeworkTasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length;
  if (section === "money") return data.payments.filter((payment) => payment.status !== "paid").length;
  if (section === "places") return data.places.length;
  if (section === "people") return data.members.length;
  if (section === "notes") return data.learningRecords.length;
  if (section === "meals") return data.mealPlans.length;
  return 0;
}

function FamilyHome({ data, onSelect, onSignOut }: {
  data: FamilyData;
  onSelect: (section: FamilySection) => void;
  onSignOut?: () => Promise<unknown> | unknown;
}) {
  return (
    <div className="fd-grid">
      <PanelCard raised>
        <div className="fd-family-home-head">
          <div>
            <h2>Family</h2>
            <p>Everything for the children, home and school.</p>
          </div>
        </div>

        <div className="fd-family-home-list">
          {sections.map((item) => {
            const count = countFor(item.id, data);
            const isPriority = item.id === "requests" && count > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`fd-family-home-row ${isPriority ? "priority" : ""}`}
              >
                <span className="fd-family-home-icon">{item.icon}</span>
                <span className="fd-family-home-copy">
                  <strong>{item.label}</strong>
                  <em>{item.hint}</em>
                </span>
                {count > 0 && (
                  <StatusPill
                    label={item.id === "requests" || item.id === "homework" || item.id === "money" ? String(count) : `${count}`}
                    tone={isPriority ? "warning" : "info"}
                  />
                )}
                <span className="fd-family-chevron">›</span>
              </button>
            );
          })}
        </div>
      </PanelCard>

      {onSignOut && (
        <button className="fd-button subtle" onClick={() => onSignOut()}>Sign out</button>
      )}
    </div>
  );
}

export function FamilyPanel({ data, onRefresh, onSignOut }: Props) {
  const [section, setSection] = useState<FamilySection>("home");

  return (
    <div className="fd-grid fd-family-page">
      {section !== "home" && (
        <button className="fd-button fd-back-button" onClick={() => setSection("home")}>‹ Family</button>
      )}

      {section === "home" && <FamilyHome data={data} onSelect={setSection} onSignOut={onSignOut} />}
      {section === "homework" && <HomeworkPanel data={data} onRefresh={onRefresh} />}
      {section === "requests" && <RequestsPanel data={data} onRefresh={onRefresh} />}
      {section === "money" && <PaymentsPanel data={data} onRefresh={onRefresh} />}
      {section === "places" && <MembersPlacesPanel data={data} onRefresh={onRefresh} initialView="places" />}
      {section === "people" && <MembersPlacesPanel data={data} onRefresh={onRefresh} initialView="people" />}
      {section === "notes" && <NotebookPanel data={data} onRefresh={onRefresh} />}
      {section === "meals" && <MealsPanel data={data} />}
    </div>
  );
}
