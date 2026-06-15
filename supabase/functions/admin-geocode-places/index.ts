import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = { family_id: string; place_ids?: string[]; geocode_missing_only?: boolean };
type RoleRow = { member_id: string | null; role: string };
type PlaceRow = { id: string; family_id: string; name: string; address: string | null; lat: number | null; lng: number | null };

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
function getAdminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
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
async function loadPlaces(adminClient: any, body: Body): Promise<PlaceRow[]> {
  let query = adminClient
    .from("places")
    .select("id, family_id, name, address, lat, lng")
    .eq("family_id", body.family_id)
    .order("name", { ascending: true });
  if (Array.isArray(body.place_ids) && body.place_ids.length > 0) query = query.in("id", body.place_ids);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let places = (data ?? []) as PlaceRow[];
  if (body.geocode_missing_only !== false) places = places.filter((p) => p.lat === null || p.lng === null);
  return places;
}
async function geocodePlace(place: PlaceRow) {
  const key = requireEnv("GOOGLE_MAPS_API_KEY");
  const address = `${place.address || place.name}, Australia`;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Google Geocoding HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.status !== "OK" || !payload.results?.[0]) {
    return { ok: false, place_id: place.id, name: place.name, status: payload.status, error_message: payload.error_message ?? "No result" };
  }
  const first = payload.results[0];
  return {
    ok: true,
    place_id: place.id,
    name: place.name,
    lat: first.geometry.location.lat,
    lng: first.geometry.location.lng,
    formatted_address: first.formatted_address,
    provider: "google",
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

    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);
    const actorRole = await getActorRole(adminClient, body.family_id, user.id);
    if (!["parent", "guardian"].includes(actorRole.role)) return jsonResponse({ error: "Only parent/guardian can geocode places." }, 403);

    const places = await loadPlaces(adminClient, body);
    const results = [];
    for (const place of places) {
      const result = await geocodePlace(place);
      results.push(result);
      if ((result as any).ok) {
        const { error } = await adminClient
          .from("places")
          .update({
            lat: (result as any).lat,
            lng: (result as any).lng,
            formatted_address: (result as any).formatted_address,
            geocoded_at: new Date().toISOString(),
            geocode_provider: "google",
          })
          .eq("family_id", body.family_id)
          .eq("id", place.id);
        if (error) throw new Error(error.message);
      }
    }
    return jsonResponse({ ok: true, count: results.length, updated_count: results.filter((r: any) => r.ok).length, results });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
