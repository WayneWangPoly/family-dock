import type { CalendarEvent, FamilyData, Place, RouteStop } from "./familyDataTypes";
import { buildGoogleMapsUrl, getPlace } from "./familyUiHelpers";

export type CalendarViewMode = "month" | "week" | "day";

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeekMonday(date: Date): Date {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function getMonthGridDays(anchor: Date): Date[] {
  const start = startOfWeekMonday(startOfMonth(anchor));
  const end = addDays(startOfWeekMonday(endOfMonth(anchor)), 6);
  const days: Date[] = [];

  let cursor = start;
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
}

export function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeekMonday(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function getEventsByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  return events.reduce<Record<string, CalendarEvent[]>>((groups, event) => {
    const key = event.start_at.slice(0, 10);
    groups[key] = groups[key] ?? [];
    groups[key].push(event);
    groups[key].sort((a, b) => a.start_at.localeCompare(b.start_at));
    return groups;
  }, {});
}

export function getStopsForDate(stops: RouteStop[], dateKey: string): RouteStop[] {
  return stops
    .filter((stop) => stop.stop_date === dateKey)
    .sort((a, b) => a.stop_order - b.stop_order);
}

export function buildRouteMapEmbedUrl(data: FamilyData, stops: RouteStop[]): string | null {
  const places = stops
    .map((stop) => getPlace(data, stop.place_id))
    .filter(Boolean) as Place[];

  const first = places[0];

  if (!first) return null;

  if (typeof first.lat === "number" && typeof first.lng === "number") {
    return `https://www.google.com/maps?q=${first.lat},${first.lng}&output=embed`;
  }

  const query = first.address || first.name;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

export function buildMultiStopGoogleMapsUrl(data: FamilyData, stops: RouteStop[]): string | null {
  const places = stops
    .map((stop) => getPlace(data, stop.place_id))
    .filter(Boolean) as Place[];

  if (places.length === 0) return null;

  // Google Maps dir URL without API key.
  const names = places
    .map((place) => {
      if (typeof place.lat === "number" && typeof place.lng === "number") {
        return `${place.lat},${place.lng}`;
      }
      return place.address || place.name;
    })
    .map(encodeURIComponent);

  if (names.length === 1) {
    return buildGoogleMapsUrl(places[0]);
  }

  const origin = names[0];
  const destination = names[names.length - 1];
  const waypoints = names.slice(1, -1).join("|");

  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${
    waypoints ? `&waypoints=${waypoints}` : ""
  }&travelmode=driving`;
}
