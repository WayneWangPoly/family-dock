import { useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  addDays,
  getEventsByDate,
  getMonthGridDays,
  getWeekDays,
  toDateKey,
} from "../../lib/calendarRouteHelpers";
import type { CalendarViewMode } from "../../lib/calendarRouteHelpers";
import { formatTime, getMemberName, getPlaceName } from "../../lib/familyUiHelpers";
import { updateCalendarEventStatus } from "../../lib/familyMutations";
import { detectConflictsForDate, conflictTone } from "../../lib/conflictEngine";
import { EventFormModal } from "../forms/EventFormModal";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
  onRefresh?: () => Promise<unknown> | unknown;
};

export function CalendarPanel({ data, onRefresh }: Props) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(toDateKey(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const { showToast, showError } = useToast();
  const eventsByDate = useMemo(() => getEventsByDate(data.calendarEvents), [data.calendarEvents]);

  const weekDays = useMemo(() => getWeekDays(new Date(`${selectedDateKey}T00:00:00`)), [selectedDateKey]);
  const visibleDays =
    viewMode === "month"
      ? getMonthGridDays(anchor)
      : viewMode === "week"
      ? getWeekDays(anchor)
      : [anchor];

  const selectedEvents = eventsByDate[selectedDateKey] ?? [];
  const selectedConflicts = detectConflictsForDate(data, selectedDateKey);

  function move(delta: number) {
    let next: Date;
    if (viewMode === "month") next = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
    else if (viewMode === "week") next = addDays(anchor, delta * 7);
    else next = addDays(anchor, delta);
    setAnchor(next);
    setSelectedDateKey(toDateKey(next));
  }

  function jumpToday() {
    const today = new Date();
    setAnchor(today);
    setSelectedDateKey(toDateKey(today));
  }

  async function setDone(eventId: string) {
    try {
      await updateCalendarEventStatus({ eventId, familyId: data.family.id, status: "done" });
      await onRefresh?.();
      showToast("Done.", "success");
    } catch (error) {
      showError(error);
    }
  }

  async function cancel(eventId: string) {
    try {
      await updateCalendarEventStatus({ eventId, familyId: data.family.id, status: "cancelled" });
      await onRefresh?.();
      showToast("Cancelled.", "success");
    } catch (error) {
      showError(error);
    }
  }

  return (
    <>
      <div className="fd-grid fd-calendar-page">
        <PanelCard raised>
          <SectionTitle
            title="Calendar"
            right={
              <div className="fd-calendar-actions">
                <button onClick={() => setFormOpen(true)} className="fd-button primary">Add</button>
                <div className="fd-segmented compact fd-desktop-only-flex">
                  {(["month", "week", "day"] as CalendarViewMode[]).map((mode) => (
                    <button key={mode} onClick={() => setViewMode(mode)} className={viewMode === mode ? "active" : ""}>
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            }
          />

          <div className="fd-calendar-toolbar">
            <button onClick={() => move(-1)} className="fd-button small">Prev</button>
            <strong>{new Date(`${selectedDateKey}T00:00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</strong>
            <button onClick={jumpToday} className="fd-button small">Today</button>
            <button onClick={() => move(1)} className="fd-button small">Next</button>
          </div>

          <div className="fd-week-strip" aria-label="Week calendar">
            {weekDays.map((day) => {
              const key = toDateKey(day);
              const events = eventsByDate[key] ?? [];
              const isToday = key === toDateKey(new Date());
              const isSelected = key === selectedDateKey;
              return (
                <button key={key} onClick={() => { setSelectedDateKey(key); setAnchor(day); }} className={`fd-week-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}>
                  <span>{day.toLocaleDateString("en-AU", { weekday: "short" })}</span>
                  <strong>{day.getDate()}</strong>
                  <em>{events.length > 0 ? events.length : ""}</em>
                </button>
              );
            })}
          </div>

          <div className={`fd-calendar-board ${viewMode}`}>
            {viewMode === "month" && ["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
              <div key={`${label}-${index}`} className="fd-calendar-weekday">{label}</div>
            ))}

            {visibleDays.map((day) => {
              const key = toDateKey(day);
              const events = eventsByDate[key] ?? [];
              const conflicts = detectConflictsForDate(data, key);
              const isToday = key === toDateKey(new Date());
              const isSelected = key === selectedDateKey;
              const isCurrentMonth = day.getMonth() === anchor.getMonth();

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setSelectedDateKey(key)}
                  className={`fd-calendar-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${!isCurrentMonth && viewMode === "month" ? "outside" : ""}`}
                >
                  <div className="fd-calendar-day-head">
                    <span className="fd-calendar-weekday-full">{day.toLocaleDateString("en-AU", { weekday: "short" })}</span>
                    <strong>{day.getDate()}</strong>
                  </div>

                  <div className="fd-calendar-dots" aria-label={`${events.length} events`}>
                    {events.slice(0, 4).map((event) => <span key={event.id} />)}
                  </div>

                  {conflicts.length > 0 && <span className="fd-calendar-risk">!</span>}

                  <div className="fd-calendar-desktop-events">
                    {events.length === 0 && <div className="fd-muted">No events</div>}
                    {events.slice(0, viewMode === "month" ? 2 : 8).map((event) => (
                      <div key={event.id} className="fd-calendar-mini-event">
                        {formatTime(event.start_at)} · {event.title}
                      </div>
                    ))}
                    {events.length > 2 && viewMode === "month" && <div className="fd-muted">+{events.length - 2} more</div>}
                  </div>
                </button>
              );
            })}
          </div>

          {visibleDays.length === 0 && <EmptyState text="No calendar days to show." />}
        </PanelCard>

        <PanelCard>
          <SectionTitle
            title={new Date(`${selectedDateKey}T00:00:00`).toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
            right={selectedConflicts.length > 0 ? <StatusPill label={`${selectedConflicts.length} check`} tone="warning" /> : undefined}
          />

          {selectedConflicts.length > 0 && (
            <div className="fd-feed-list" style={{ marginBottom: 12 }}>
              {selectedConflicts.slice(0, 3).map((conflict) => (
                <div key={conflict.id} className={`fd-feed-item ${conflictTone(conflict.severity)}`}>
                  <div className="fd-feed-icon">!</div>
                  <div className="fd-feed-copy"><strong>{conflict.title}</strong></div>
                </div>
              ))}
            </div>
          )}

          {selectedEvents.length > 0 && (
            <div className="fd-agenda-list">
              {selectedEvents.map((event) => (
                <article key={event.id} className="fd-agenda-item">
                  <div className="fd-agenda-time">{formatTime(event.start_at)}</div>
                  <div className="fd-agenda-copy">
                    <strong>{event.title}</strong>
                    <span>{getMemberName(data, event.child_id)} · {getPlaceName(data, event.place_id)}</span>
                    {event.teacher_name && <span>Teacher: {event.teacher_name}</span>}
                  </div>
                  <div className="fd-agenda-actions">
                    {event.status !== "done" && <button onClick={() => setDone(event.id)} className="fd-button small">Done</button>}
                    {event.status !== "cancelled" && <button onClick={() => cancel(event.id)} className="fd-button small danger">Cancel</button>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </PanelCard>
      </div>

      <EventFormModal open={formOpen} data={data} onClose={() => setFormOpen(false)} onSaved={onRefresh} />
    </>
  );
}
