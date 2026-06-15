import type { CalendarEvent, FamilyData, RouteStop } from "./familyDataTypes";
import { supabase } from "./supabaseClient";

export type RouteLegSummary = {
  from: string;
  to: string;
  distanceText: string;
  durationText: string;
  distanceMeters: number;
  durationSeconds: number;
};

export type RouteConflict = {
  fromStopId: string;
  toStopId: string;
  fromTitle: string;
  toTitle: string;
  availableSeconds: number;
  requiredSeconds: number;
  message: string;
};

export async function reorderRouteStops(args: {
  familyId: string;
  orderedStopIds: string[];
}) {
  const updates = args.orderedStopIds.map((stopId, index) =>
    supabase
      .from("route_stops")
      .update({ stop_order: index + 1 })
      .eq("family_id", args.familyId)
      .eq("id", stopId),
  );

  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;

  if (error) throw error;
}

export async function deleteRouteStop(args: {
  familyId: string;
  stopId: string;
}) {
  const { error } = await supabase
    .from("route_stops")
    .delete()
    .eq("family_id", args.familyId)
    .eq("id", args.stopId);

  if (error) throw error;
}

export async function createRouteStop(args: {
  familyId: string;
  stopDate: string;
  stopOrder: number;
  stopType: string;
  placeId: string;
  responsibleMemberId?: string | null;
  note?: string | null;
}) {
  const { data, error } = await supabase
    .from("route_stops")
    .insert({
      family_id: args.familyId,
      stop_date: args.stopDate,
      stop_order: args.stopOrder,
      stop_type: args.stopType,
      place_id: args.placeId,
      responsible_member_id: args.responsibleMemberId ?? null,
      note: args.note ?? null,
      risk_level: "normal",
      status: "pending",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function replaceRouteFromCalendarEvents(args: {
  data: FamilyData;
  dateKey: string;
}) {
  const events = getRouteEligibleEvents(args.data.calendarEvents, args.dateKey);

  const { error: deleteError } = await supabase
    .from("route_stops")
    .delete()
    .eq("family_id", args.data.family.id)
    .eq("stop_date", args.dateKey);

  if (deleteError) throw deleteError;

  if (events.length === 0) {
    return [];
  }

  const rows = events.map((event, index) => ({
    family_id: args.data.family.id,
    stop_date: args.dateKey,
    stop_order: index + 1,
    stop_type: event.event_type === "school" ? "school" : "course",
    place_id: event.place_id,
    responsible_member_id: event.child_id,
    risk_level: "normal",
    status: "pending",
    note: event.title,
  }));

  const { data, error } = await supabase
    .from("route_stops")
    .insert(rows)
    .select("*");

  if (error) throw error;

  return data ?? [];
}

export function getRouteEligibleEvents(events: CalendarEvent[], dateKey: string) {
  return events
    .filter((event) =>
      event.start_at.slice(0, 10) === dateKey &&
      Boolean(event.place_id) &&
      event.status !== "cancelled",
    )
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function findEventForStop(data: FamilyData, stop: RouteStop) {
  const dateKey = stop.stop_date;

  return data.calendarEvents
    .filter((event) =>
      event.start_at.slice(0, 10) === dateKey &&
      event.place_id === stop.place_id &&
      event.status !== "cancelled",
    )
    .sort((a, b) => a.start_at.localeCompare(b.start_at))[0] ?? null;
}

export function computeRouteConflicts(args: {
  data: FamilyData;
  stops: RouteStop[];
  legs: RouteLegSummary[];
  bufferMinutes?: number;
}) {
  const bufferSeconds = (args.bufferMinutes ?? 10) * 60;
  const conflicts: RouteConflict[] = [];

  for (let i = 0; i < args.stops.length - 1; i += 1) {
    const fromStop = args.stops[i];
    const toStop = args.stops[i + 1];
    const fromEvent = findEventForStop(args.data, fromStop);
    const toEvent = findEventForStop(args.data, toStop);
    const leg = args.legs[i];

    if (!fromEvent || !toEvent || !leg) continue;

    const fromEnd = new Date(fromEvent.end_at ?? fromEvent.start_at).getTime();
    const toStart = new Date(toEvent.start_at).getTime();

    if (!Number.isFinite(fromEnd) || !Number.isFinite(toStart)) continue;

    const availableSeconds = Math.floor((toStart - fromEnd) / 1000);
    const requiredSeconds = leg.durationSeconds + bufferSeconds;

    if (availableSeconds < requiredSeconds) {
      conflicts.push({
        fromStopId: fromStop.id,
        toStopId: toStop.id,
        fromTitle: fromEvent.title,
        toTitle: toEvent.title,
        availableSeconds,
        requiredSeconds,
        message: `${fromEvent.title} → ${toEvent.title}: available ${Math.round(availableSeconds / 60)} min, need about ${Math.round(requiredSeconds / 60)} min including buffer.`,
      });
    }
  }

  return conflicts;
}

export function reorderArrayByDrag<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
