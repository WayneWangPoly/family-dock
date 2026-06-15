import type { CalendarEvent, FamilyData } from "./familyDataTypes";
import { getPlaceName } from "./familyUiHelpers";

export type ConflictSeverity = "high" | "medium" | "low";

export type FamilyConflict = {
  id: string;
  dateKey: string;
  severity: ConflictSeverity;
  type: "overlap" | "tight_transfer" | "missing_location" | "missing_end_time";
  title: string;
  detail: string;
  eventIds: string[];
};

function toMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function minutesBetween(startMs: number, endMs: number) {
  return Math.round((endMs - startMs) / 60000);
}

function sameMember(a: CalendarEvent, b: CalendarEvent) {
  if (!a.child_id || !b.child_id) return false;
  return a.child_id === b.child_id;
}

function sameDate(event: CalendarEvent, dateKey: string) {
  return event.start_at.slice(0, 10) === dateKey;
}

export function getDateKeysFromEvents(events: CalendarEvent[]) {
  return Array.from(new Set(events.map((event) => event.start_at.slice(0, 10)))).sort();
}

export function detectConflictsForDate(data: FamilyData, dateKey: string) {
  const events = data.calendarEvents
    .filter((event) => sameDate(event, dateKey) && event.status !== "cancelled")
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  const conflicts: FamilyConflict[] = [];

  for (const event of events) {
    if (!event.place_id) {
      conflicts.push({
        id: `missing-location-${event.id}`,
        dateKey,
        severity: "medium",
        type: "missing_location",
        title: `Missing location: ${event.title}`,
        detail: "This event has no place linked, so route planning and travel warnings cannot work accurately.",
        eventIds: [event.id],
      });
    }

    if (!event.end_at) {
      conflicts.push({
        id: `missing-end-${event.id}`,
        dateKey,
        severity: "low",
        type: "missing_end_time",
        title: `Missing end time: ${event.title}`,
        detail: "Without end time, the app cannot judge whether the next activity is reachable.",
        eventIds: [event.id],
      });
    }
  }

  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i];
      const b = events[j];

      if (!sameMember(a, b)) continue;

      const aStart = toMs(a.start_at);
      const aEnd = toMs(a.end_at ?? a.start_at);
      const bStart = toMs(b.start_at);
      const bEnd = toMs(b.end_at ?? b.start_at);

      if (aStart === null || aEnd === null || bStart === null || bEnd === null) continue;

      const overlaps = aStart < bEnd && bStart < aEnd;

      if (overlaps) {
        conflicts.push({
          id: `overlap-${a.id}-${b.id}`,
          dateKey,
          severity: "high",
          type: "overlap",
          title: `Time overlap: ${a.title} / ${b.title}`,
          detail: `${a.title} and ${b.title} overlap for the same child/member.`,
          eventIds: [a.id, b.id],
        });
        continue;
      }

      const gap = minutesBetween(aEnd, bStart);

      if (gap >= 0 && gap < 20 && a.place_id && b.place_id && a.place_id !== b.place_id) {
        conflicts.push({
          id: `tight-${a.id}-${b.id}`,
          dateKey,
          severity: gap < 10 ? "high" : "medium",
          type: "tight_transfer",
          title: `Tight transfer: ${a.title} → ${b.title}`,
          detail: `Only ${gap} minutes between different locations: ${getPlaceName(data, a.place_id)} → ${getPlaceName(data, b.place_id)}.`,
          eventIds: [a.id, b.id],
        });
      }
    }
  }

  return conflicts;
}

export function detectAllConflicts(data: FamilyData, horizonDays = 30) {
  const now = new Date();
  const max = new Date(now);
  max.setDate(max.getDate() + horizonDays);

  const dateKeys = getDateKeysFromEvents(data.calendarEvents).filter((key) => {
    const ms = new Date(`${key}T00:00:00`).getTime();
    return ms >= new Date(now.toISOString().slice(0, 10)).getTime() && ms <= max.getTime();
  });

  return dateKeys.flatMap((key) => detectConflictsForDate(data, key));
}

export function conflictTone(severity: ConflictSeverity) {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "info";
}
