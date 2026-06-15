import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id: string;
  plan_date: string;
  start_place_id?: string | null;
  start_label?: string | null;
  default_start_lat?: number | null;
  default_start_lng?: number | null;
  buffer_minutes?: number | null;
  save?: boolean;
};

type RoleRow = {
  member_id: string | null;
  role: string;
};

type PlaceRow = {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type EventRow = {
  id: string;
  title: string;
  child_id: string | null;
  place_id: string | null;
  start_at: string;
  end_at: string | null;
  event_type: string;
  status: string;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getOptionalEnv(name: string) {
  return Deno.env.get(name) ?? "";
}

function getAdminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function getUserClient(authHeader: string) {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

async function getActorRole(adminClient: any, familyId: string, authUserId: string): Promise<RoleRow> {
  const { data, error } = await adminClient
    .from("family_user_roles")
    .select("member_id, role")
    .eq("family_id", familyId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("User is not linked to this family.");

  return data as RoleRow;
}

function toMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isoFromMs(ms: number | null) {
  if (ms === null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function minutes(value: number) {
  return value * 60 * 1000;
}

function haversineMinutes(a: { lat?: number | null; lng?: number | null }, b: { lat?: number | null; lng?: number | null }) {
  if (typeof a.lat !== "number" || typeof a.lng !== "number" || typeof b.lat !== "number" || typeof b.lng !== "number") {
    return null;
  }

  const r = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const distanceKm = 2 * r * Math.asin(Math.sqrt(x));

  // Conservative city-driving approximation:
  // average 28 km/h + 6 min parking/walking overhead.
  return Math.max(6, Math.ceil((distanceKm / 28) * 60 + 6));
}

async function googleDistanceMinutes(origin: PlaceRow | { lat?: number | null; lng?: number | null; address?: string | null }, destination: PlaceRow) {
  const apiKey = getOptionalEnv("GOOGLE_MAPS_API_KEY");
  if (!apiKey) return null;

  const originValue =
    typeof origin.lat === "number" && typeof origin.lng === "number"
      ? `${origin.lat},${origin.lng}`
      : origin.address;

  const destinationValue =
    typeof destination.lat === "number" && typeof destination.lng === "number"
      ? `${destination.lat},${destination.lng}`
      : destination.address;

  if (!originValue || !destinationValue) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", originValue);
  url.searchParams.set("destinations", destinationValue);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("departure_time", "now");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const data = await response.json();
  const element = data.rows?.[0]?.elements?.[0];
  const seconds = element?.duration_in_traffic?.value ?? element?.duration?.value;
  if (!seconds) return null;

  return Math.ceil(seconds / 60);
}

function riskFromBuffer(bufferMinutes: number, missingData: boolean) {
  if (missingData) return "medium";
  if (bufferMinutes < 0) return "high";
  if (bufferMinutes < 8) return "medium";
  if (bufferMinutes < 15) return "normal";
  return "low";
}

function maxRisk(risks: string[]) {
  if (risks.includes("high")) return "high";
  if (risks.includes("medium")) return "medium";
  if (risks.includes("normal")) return "normal";
  return "low";
}

function makeHandoffMessage(args: {
  date: string;
  title: string;
  summary: string;
  legs: any[];
  warnings: string[];
  assumptions: string[];
}) {
  const lines = [
    `今天接送安排：${args.date}`,
    "",
    args.summary,
    "",
    "路线重点：",
    ...args.legs.map((leg) => {
      const departure = leg.recommended_departure_at
        ? new Date(leg.recommended_departure_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })
        : "时间不明";

      const arrive = leg.arrival_target_at
        ? new Date(leg.arrival_target_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })
        : "到达时间不明";

      return `${leg.leg_order}. ${departure} 出发 → ${arrive} 到 ${leg.to_label}（${leg.event_title ?? "event"}，风险：${leg.risk_level}）`;
    }),
  ];

  if (args.warnings.length > 0) {
    lines.push("", "需要注意：", ...args.warnings.map((item) => `- ${item}`));
  }

  if (args.assumptions.length > 0) {
    lines.push("", "系统假设：", ...args.assumptions.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}

async function loadData(adminClient: any, familyId: string, date: string) {
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  const { data: events, error: eventsError } = await adminClient
    .from("calendar_events")
    .select("id, title, child_id, place_id, start_at, end_at, event_type, status")
    .eq("family_id", familyId)
    .neq("status", "cancelled")
    .gte("start_at", dayStart)
    .lte("start_at", dayEnd)
    .order("start_at", { ascending: true });

  if (eventsError) throw new Error(eventsError.message);

  const { data: places, error: placesError } = await adminClient
    .from("places")
    .select("id, name, address, lat, lng")
    .eq("family_id", familyId);

  if (placesError) throw new Error(placesError.message);

  return {
    events: (events ?? []) as EventRow[],
    places: (places ?? []) as PlaceRow[],
  };
}

async function buildPlan(body: Body, adminClient: any) {
  const defaultBuffer = Math.max(0, Number(body.buffer_minutes ?? 10));
  const data = await loadData(adminClient, body.family_id, body.plan_date);

  const placeById = new Map(data.places.map((place) => [place.id, place]));
  const events = data.events.filter((event) => event.place_id).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const warnings: string[] = [];
  const assumptions: string[] = [];

  if (data.events.length === 0) {
    warnings.push("No calendar events found for this date.");
  }

  const eventsWithoutPlace = data.events.filter((event) => !event.place_id);
  if (eventsWithoutPlace.length > 0) {
    warnings.push(`${eventsWithoutPlace.length} event(s) have no location and were excluded from route timing.`);
  }

  let currentPlace: PlaceRow | { id?: string; name: string; address?: string | null; lat?: number | null; lng?: number | null } | null = null;

  if (body.start_place_id) {
    currentPlace = placeById.get(body.start_place_id) ?? null;
  }

  if (!currentPlace) {
    currentPlace = {
      name: body.start_label || "Current location / starting point",
      lat: typeof body.default_start_lat === "number" ? body.default_start_lat : null,
      lng: typeof body.default_start_lng === "number" ? body.default_start_lng : null,
    };
    assumptions.push("Start location used current/default coordinates or manual label.");
  }

  const legs = [];
  let previousEventEndMs: number | null = null;

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const destination = placeById.get(event.place_id ?? "");

    if (!destination) {
      warnings.push(`Missing place record for event: ${event.title}.`);
      continue;
    }

    const targetMs = toMs(event.start_at);
    if (targetMs === null) continue;

    let travelMinutes = await googleDistanceMinutes(currentPlace, destination);
    let usedFallback = false;

    if (travelMinutes === null) {
      travelMinutes = haversineMinutes(currentPlace, destination);
      usedFallback = true;
    }

    const missingData = travelMinutes === null;
    if (missingData) {
      travelMinutes = 20;
      warnings.push(`Could not calculate travel time to ${destination.name}; used 20 minutes fallback.`);
    } else if (usedFallback) {
      assumptions.push(`Used approximate travel time for ${currentPlace?.name ?? "start"} → ${destination.name}.`);
    }

    const recommendedDepartureMs = targetMs - minutes(travelMinutes + defaultBuffer);
    const latestSafeDepartureMs = targetMs - minutes(travelMinutes);
    const bufferFromPrevious = previousEventEndMs === null
      ? defaultBuffer
      : Math.round((recommendedDepartureMs - previousEventEndMs) / 60000);

    const risk = riskFromBuffer(bufferFromPrevious, missingData);
    const warning = risk === "high"
      ? `High risk: ${event.title} may not be reachable on time.`
      : risk === "medium"
      ? `Watch timing: limited buffer before ${event.title}.`
      : null;

    if (warning) warnings.push(warning);

    legs.push({
      leg_order: legs.length + 1,
      from_place_id: "id" in currentPlace ? currentPlace.id ?? null : null,
      to_place_id: destination.id,
      from_label: currentPlace?.name ?? "Start",
      to_label: destination.name,
      related_event_id: event.id,
      child_id: event.child_id,
      event_title: event.title,
      event_start_at: event.start_at,
      event_end_at: event.end_at,
      travel_minutes: travelMinutes,
      buffer_minutes: bufferFromPrevious,
      arrival_target_at: event.start_at,
      recommended_departure_at: isoFromMs(recommendedDepartureMs),
      latest_safe_departure_at: isoFromMs(latestSafeDepartureMs),
      risk_level: risk,
      warning,
    });

    currentPlace = destination;
    previousEventEndMs = toMs(event.end_at) ?? targetMs;
  }

  const overallRisk = maxRisk(legs.map((leg) => leg.risk_level));
  const firstDeparture = legs[0]?.recommended_departure_at ?? null;
  const firstLatest = legs[0]?.latest_safe_departure_at ?? null;
  const totalTravel = legs.reduce((sum, leg) => sum + Number(leg.travel_minutes || 0), 0);
  const totalBuffer = legs.reduce((sum, leg) => sum + Math.max(0, Number(leg.buffer_minutes || 0)), 0);

  const summary = legs.length === 0
    ? "No route departure plan could be generated."
    : `Generated ${legs.length} route leg(s). Overall risk: ${overallRisk}. First recommended departure: ${firstDeparture ? new Date(firstDeparture).toLocaleString("en-AU") : "not available"}.`;

  return {
    plan: {
      family_id: body.family_id,
      plan_date: body.plan_date,
      title: `Smart route plan ${body.plan_date}`,
      overall_risk: overallRisk,
      start_place_id: body.start_place_id ?? null,
      start_label: currentPlace?.name ?? body.start_label ?? null,
      recommended_departure_at: firstDeparture,
      latest_safe_departure_at: firstLatest,
      total_travel_minutes: totalTravel,
      total_buffer_minutes: totalBuffer,
      summary,
      warnings: Array.from(new Set(warnings)),
      assumptions: Array.from(new Set(assumptions)),
      raw_plan: {
        generated_at: new Date().toISOString(),
        default_buffer_minutes: defaultBuffer,
      },
      status: "draft",
    },
    legs,
    handoffMessage: makeHandoffMessage({
      date: body.plan_date,
      title: `Smart route plan ${body.plan_date}`,
      summary,
      legs,
      warnings: Array.from(new Set(warnings)),
      assumptions: Array.from(new Set(assumptions)),
    }),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const body = (await req.json()) as Body;
    if (!body.family_id) return jsonResponse({ error: "family_id is required" }, 400);
    if (!body.plan_date) return jsonResponse({ error: "plan_date is required" }, 400);

    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const actorRole = await getActorRole(adminClient, body.family_id, user.id);
    if (!["parent", "guardian"].includes(actorRole.role)) {
      return jsonResponse({ error: "Only parent/guardian can generate route departure plans." }, 403);
    }

    const built = await buildPlan(body, adminClient);

    if (body.save === false) {
      return jsonResponse({
        ok: true,
        saved: false,
        ...built,
      });
    }

    const { data: plan, error: planError } = await adminClient
      .from("route_departure_plans")
      .insert({
        ...built.plan,
        created_by: actorRole.member_id,
      })
      .select("*")
      .single();

    if (planError) throw new Error(planError.message);

    if (built.legs.length > 0) {
      const { error: legsError } = await adminClient
        .from("route_departure_legs")
        .insert(built.legs.map((leg) => ({
          ...leg,
          family_id: body.family_id,
          plan_id: plan.id,
        })));

      if (legsError) throw new Error(`Plan created but legs failed: ${legsError.message}`);
    }

    const { data: handoff, error: handoffError } = await adminClient
      .from("parent_handoff_messages")
      .insert({
        family_id: body.family_id,
        plan_id: plan.id,
        created_by: actorRole.member_id,
        message_date: body.plan_date,
        audience: "parent",
        title: `Handoff ${body.plan_date}`,
        message_text: built.handoffMessage,
        language: "zh",
        status: "draft",
      })
      .select("*")
      .single();

    if (handoffError) throw new Error(`Plan created but handoff message failed: ${handoffError.message}`);

    return jsonResponse({
      ok: true,
      saved: true,
      plan,
      legs: built.legs,
      handoff,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
