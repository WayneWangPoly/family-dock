import { useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  getCalendarGridRange,
  getEventsForDateLoose,
  groupDaysByWeek,
  loadCalendarOverlayBundle,
  overlayToneClass,
} from "../../lib/calendarOverlay";
import type { CalendarOverlayBundle } from "../../lib/calendarOverlay";
import { currentSchoolYear } from "../../lib/schoolCalendarEngine";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { SchoolCalendarEnginePanel } from "./SchoolCalendarEnginePanel";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
};

export function CalendarSchoolOverlayPanel({ data }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [bundle, setBundle] = useState<CalendarOverlayBundle | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { showError } = useToast();

  const range = useMemo(() => getCalendarGridRange(year, month), [year, month]);
  const weeks = useMemo(() => groupDaysByWeek(bundle?.days ?? []), [bundle]);

  async function refresh() {
    try {
      setBundle(await loadCalendarOverlayBundle({
        data,
        schoolYear,
        start: range.start,
        end: range.end,
      }));
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    refresh();
  }, [data.family.id, schoolYear, range.start, range.end]);

  function prevMonth() {
    const date = new Date(year, month - 1, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth());
  }

  function nextMonth() {
    const date = new Date(year, month + 1, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth());
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="fd-grid">
      <PanelCard raised>
        <SectionTitle
          title="Calendar school overlay"
          subtitle="月视图预览：Week 1/2/3、school day、holiday、pupil free day、exam day"
          right={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatusPill label={bundle?.setting?.state_code ?? "state not set"} tone={bundle?.setting ? "success" : "warning"} />
              <StatusPill label={`${bundle?.terms.length ?? 0}/4 terms`} tone={(bundle?.terms.length ?? 0) === 4 ? "success" : "warning"} />
            </div>
          }
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={prevMonth} className="fd-button">←</button>
          <strong style={{ fontSize: 20 }}>{monthLabel}</strong>
          <button onClick={nextMonth} className="fd-button">→</button>

          <label className="fd-field" style={{ maxWidth: 160 }}>
            School year
            <input className="fd-input" type="number" value={schoolYear} onChange={(event) => setSchoolYear(Number(event.target.value))} />
          </label>

          <button onClick={refresh} className="fd-button">Refresh</button>
          <button onClick={() => setShowSettings((v) => !v)} className="fd-button primary">
            {showSettings ? "Hide settings" : "School settings"}
          </button>
        </div>

        <div className="fd-alert info" style={{ marginTop: 12 }}>
          这是 Calendar overlay 预览层。后续可以把这些 badges 放进正式 Calendar month/week/day cell。
        </div>
      </PanelCard>

      {showSettings && <SchoolCalendarEnginePanel data={data} />}

      <PanelCard>
        <SectionTitle
          title="Month overlay preview"
          subtitle={bundle ? `${range.start} to ${range.end}` : "Loading overlay"}
        />

        {!bundle ? (
          <EmptyState text="Loading calendar overlay..." />
        ) : (
          <div className="fd-calendar-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="fd-calendar-header-cell">{day}</div>
            ))}

            {weeks.flatMap((week) => week.map((day) => {
              const events = getEventsForDateLoose(data, day.date);
              const isThisMonth = new Date(`${day.date}T00:00:00`).getMonth() === month;

              return (
                <article
                  key={day.date}
                  className={`fd-calendar-cell ${overlayToneClass(day.colorTone)} ${isThisMonth ? "" : "muted"}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                    <strong>{Number(day.date.slice(8, 10))}</strong>
                    {day.weekNumber && <span className="fd-badge">W{day.weekNumber}</span>}
                  </div>

                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                    {day.termNumber && <span className="fd-badge">T{day.termNumber}</span>}
                    <span className={`fd-badge ${day.isSchoolDay ? "success" : "warning"}`}>
                      {day.isSchoolDay ? "school" : "holiday"}
                    </span>
                  </div>

                  {day.labels.slice(0, 2).map((label) => (
                    <div key={label} className="fd-calendar-label">{label}</div>
                  ))}

                  {events.slice(0, 3).map((event) => (
                    <div key={event.id} className="fd-calendar-event-dot">
                      {new Date(event.start_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })} {event.title}
                    </div>
                  ))}

                  {events.length > 3 && <div className="fd-muted">+{events.length - 3} more</div>}
                </article>
              );
            }))}
          </div>
        )}
      </PanelCard>

      <style>{`
        .fd-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 8px;
        }
        .fd-calendar-header-cell {
          font-weight: 950;
          color: var(--fd-muted);
          padding: 8px;
          text-align: center;
        }
        .fd-calendar-cell {
          min-height: 132px;
          border: 1px solid var(--fd-border);
          border-radius: 18px;
          padding: 10px;
          background: white;
          overflow: hidden;
        }
        .fd-calendar-cell.muted {
          opacity: .55;
        }
        .fd-cal-school {
          background: linear-gradient(180deg, rgba(236, 253, 245, .92), white);
        }
        .fd-cal-holiday {
          background: linear-gradient(180deg, rgba(255, 247, 237, .95), white);
        }
        .fd-cal-exam {
          background: linear-gradient(180deg, rgba(254, 226, 226, .95), white);
          border-color: rgba(239, 68, 68, .35);
        }
        .fd-cal-custom {
          background: linear-gradient(180deg, rgba(239, 246, 255, .95), white);
        }
        .fd-calendar-label {
          margin-top: 6px;
          font-size: 11px;
          color: var(--fd-muted);
          font-weight: 800;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .fd-calendar-event-dot {
          margin-top: 6px;
          padding: 5px 7px;
          border-radius: 10px;
          background: rgba(49,83,92,.08);
          color: var(--fd-brand);
          font-size: 11px;
          font-weight: 850;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @media (max-width: 760px) {
          .fd-calendar-grid {
            gap: 6px;
          }
          .fd-calendar-cell {
            min-height: 112px;
            padding: 7px;
            border-radius: 14px;
          }
          .fd-calendar-header-cell {
            font-size: 11px;
            padding: 4px;
          }
        }
      `}</style>
    </div>
  );
}
