import { addDoc, collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { firebaseAuth, firestore } from "./firebaseClient";
import type { CalendarEvent, FamilyData, Place } from "./familyDataTypes";

export type RouteDeparturePlan = {
  id: string;
  family_id: string;
  plan_date: string;
  created_by: string | null;
  title: string;
  overall_risk: "low" | "normal" | "medium" | "high";
  start_place_id: string | null;
  start_label: string | null;
  recommended_departure_at: string | null;
  latest_safe_departure_at: string | null;
  total_travel_minutes: number;
  total_buffer_minutes: number;
  summary: string;
  warnings: string[];
  assumptions: string[];
  raw_plan: Record<string, unknown>;
  status: "draft" | "active" | "archived";
  alert_enabled?: boolean;
  alert_minutes_before?: number;
  alert_sent_at?: string | null;
  assigned_parent_id?: string | null;
  execution_status?: "planned" | "ready" | "on_the_way" | "completed" | "cancelled";
  late_risk_level?: "low" | "normal" | "medium" | "high" | "late";
  late_risk_message?: string | null;
  last_late_risk_check_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type RouteDepartureLeg = {
  id?: string;
  family_id?: string;
  plan_id?: string;
  leg_order: number;
  from_place_id: string | null;
  to_place_id: string | null;
  from_label: string | null;
  to_label: string | null;
  related_event_id: string | null;
  child_id: string | null;
  event_title: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  travel_minutes: number;
  buffer_minutes: number;
  arrival_target_at: string | null;
  recommended_departure_at: string | null;
  latest_safe_departure_at: string | null;
  risk_level: "low" | "normal" | "medium" | "high";
  warning: string | null;
};

export type ParentHandoffMessage = {
  id: string;
  family_id: string;
  plan_id: string | null;
  created_by: string | null;
  message_date: string;
  audience: "parent" | "dad" | "mum" | "guardian" | "driver" | "custom";
  title: string;
  message_text: string;
  language: "zh" | "en" | "bilingual";
  status: "draft" | "sent" | "archived";
  created_at: string;
  updated_at: string;
};

export function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function isoNow() {
  return new Date().toISOString();
}

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}


function placeName(places: Place[], placeId?: string | null) {
  if (!placeId) return null;
  return places.find((place) => place.id === placeId)?.name ?? null;
}

function eventsForDay(data: FamilyData, dateKey: string) {
  return data.calendarEvents
    .filter((event) => event.status !== "cancelled")
    .filter((event) => (event.start_at ?? "").slice(0, 10) === dateKey)
    .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
}

function buildLegs(args: {
  data: FamilyData;
  events: CalendarEvent[];
  startPlaceId?: string | null;
  startLabel?: string | null;
  bufferMinutes: number;
}) {
  const legs: RouteDepartureLeg[] = [];
  let fromPlaceId = args.startPlaceId ?? null;
  let fromLabel = args.startLabel || placeName(args.data.places, fromPlaceId) || "Current location";

  args.events.forEach((event, index) => {
    const travelMinutes = index === 0 ? 20 : 15;
    const bufferMinutes = args.bufferMinutes;
    const arrivalTarget = event.start_at;
    const recommendedDeparture = addMinutes(arrivalTarget, -(travelMinutes + bufferMinutes));
    const latestSafeDeparture = addMinutes(arrivalTarget, -travelMinutes);
    const toLabel = placeName(args.data.places, event.place_id) || event.title;
    const warning = event.place_id ? null : "No saved location for this event.";

    legs.push({
      leg_order: index + 1,
      from_place_id: fromPlaceId,
      to_place_id: event.place_id,
      from_label: fromLabel,
      to_label: toLabel,
      related_event_id: event.id,
      child_id: event.child_id,
      event_title: event.title,
      event_start_at: event.start_at,
      event_end_at: event.end_at,
      travel_minutes: travelMinutes,
      buffer_minutes: bufferMinutes,
      arrival_target_at: arrivalTarget,
      recommended_departure_at: recommendedDeparture,
      latest_safe_departure_at: latestSafeDeparture,
      risk_level: warning ? "medium" : "normal",
      warning,
    });

    fromPlaceId = event.place_id;
    fromLabel = toLabel;
  });

  return legs;
}

function handoffText(planDate: string, legs: RouteDepartureLeg[]) {
  if (legs.length === 0) return `No pickup route planned for ${planDate}.`;
  const lines = legs.map((leg) => `• ${formatTime(leg.recommended_departure_at)} leave for ${leg.to_label ?? leg.event_title ?? "next stop"}`);
  return [`Family Dock route for ${planDate}:`, ...lines].join("\n");
}

export async function generateRouteDeparturePlan(args: {
  data: FamilyData;
  planDate: string;
  startPlaceId?: string | null;
  startLabel?: string | null;
  currentLat?: number | null;
  currentLng?: number | null;
  bufferMinutes?: number;
  save?: boolean;
}) {
  const bufferMinutes = args.bufferMinutes ?? 10;
  const createdAt = isoNow();
  const events = eventsForDay(args.data, args.planDate);
  const legs = buildLegs({ data: args.data, events, startPlaceId: args.startPlaceId, startLabel: args.startLabel, bufferMinutes });
  const warnings = legs.map((leg) => leg.warning).filter(Boolean) as string[];
  const firstLeg = legs[0];
  const totalTravelMinutes = legs.reduce((sum, leg) => sum + leg.travel_minutes, 0);
  const totalBufferMinutes = legs.reduce((sum, leg) => sum + leg.buffer_minutes, 0);
  const overallRisk: RouteDeparturePlan["overall_risk"] = warnings.length ? "medium" : legs.length ? "normal" : "low";

  let plan: RouteDeparturePlan = {
    id: `local_${Date.now()}`,
    family_id: args.data.family.id,
    plan_date: args.planDate,
    created_by: firebaseAuth.currentUser?.uid ?? null,
    title: `Route ${args.planDate}`,
    overall_risk: overallRisk,
    start_place_id: args.startPlaceId ?? null,
    start_label: args.startLabel ?? "Current location",
    recommended_departure_at: firstLeg?.recommended_departure_at ?? null,
    latest_safe_departure_at: firstLeg?.latest_safe_departure_at ?? null,
    total_travel_minutes: totalTravelMinutes,
    total_buffer_minutes: totalBufferMinutes,
    summary: legs.length ? `Plan has ${legs.length} stop(s).` : "No events with route stops on this day.",
    warnings,
    assumptions: ["Firebase first version uses estimated travel time. Google Maps route timing can be added later."],
    raw_plan: { source: "firebase-local-estimate" },
    status: "active",
    created_at: createdAt,
    updated_at: createdAt,
  };

  let savedLegs = legs;
  let handoff: ParentHandoffMessage | undefined;

  if (args.save) {
    const planRef = await addDoc(collection(firestore, "families", args.data.family.id, "route_departure_plans"), plan);
    plan = { ...plan, id: planRef.id };
    savedLegs = [];
    for (const leg of legs) {
      const legDoc = { ...leg, family_id: args.data.family.id, plan_id: planRef.id, created_at: createdAt, updated_at: createdAt };
      const legRef = await addDoc(collection(firestore, "families", args.data.family.id, "route_departure_legs"), legDoc);
      savedLegs.push({ ...legDoc, id: legRef.id });
    }
    const handoffDoc: Omit<ParentHandoffMessage, "id"> = {
      family_id: args.data.family.id,
      plan_id: planRef.id,
      created_by: firebaseAuth.currentUser?.uid ?? null,
      message_date: args.planDate,
      audience: "parent",
      title: `Route handoff ${args.planDate}`,
      message_text: handoffText(args.planDate, savedLegs),
      language: "en",
      status: "draft",
      created_at: createdAt,
      updated_at: createdAt,
    };
    const handoffRef = await addDoc(collection(firestore, "families", args.data.family.id, "parent_handoff_messages"), handoffDoc);
    handoff = { id: handoffRef.id, ...handoffDoc };
  }

  return { ok: true, saved: Boolean(args.save), plan, legs: savedLegs, handoff, handoffMessage: handoff?.message_text };
}

export async function loadRouteDeparturePlans(familyId: string, maxRows = 10) {
  const snapshot = await getDocs(query(
    collection(firestore, "families", familyId, "route_departure_plans"),
    orderBy("created_at", "desc"),
    limit(maxRows),
  ));
  return snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() }) as RouteDeparturePlan);
}

export async function loadRouteDepartureLegs(familyId: string, planId: string) {
  const snapshot = await getDocs(query(
    collection(firestore, "families", familyId, "route_departure_legs"),
    where("plan_id", "==", planId),
    orderBy("leg_order", "asc"),
    limit(30),
  ));
  return snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() }) as RouteDepartureLeg);
}

export async function loadHandoffMessages(familyId: string, planId?: string | null) {
  const constraints = [orderBy("created_at", "desc"), limit(20)];
  const q = planId
    ? query(collection(firestore, "families", familyId, "parent_handoff_messages"), where("plan_id", "==", planId), ...constraints)
    : query(collection(firestore, "families", familyId, "parent_handoff_messages"), ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() }) as ParentHandoffMessage);
}

export async function updateRoutePlanStatus() {
  // Route status editing is not exposed in the consumer Firebase version.
}

export function riskTone(risk: string) {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warning";
  if (risk === "low") return "success";
  return "info";
}

export function formatTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-AU");
}
