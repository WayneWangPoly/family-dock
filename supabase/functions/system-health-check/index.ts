import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = { family_id?: string | null };
type RoleRow = { member_id: string | null; role: string };

function envPresent(name: string) { return Boolean(Deno.env.get(name)); }
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
async function getActorRole(adminClient: any, familyId: string, authUserId: string): Promise<RoleRow | null> {
  const { data, error } = await adminClient
    .from("family_user_roles")
    .select("member_id, role")
    .eq("family_id", familyId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as RoleRow | null;
}
async function tableCount(adminClient: any, table: string, familyId?: string | null) {
  let query = adminClient.from(table).select("id", { count: "exact", head: true });
  if (familyId) query = query.eq("family_id", familyId);
  const { count, error } = await query;
  if (error) return { ok: false, table, count: null, error: error.message };
  return { ok: true, table, count: count ?? 0, error: null };
}
async function findProblemCounts(adminClient: any, familyId: string) {
  const results: Record<string, number> = {};
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const queries = [
    { key: "events_without_place", promise: adminClient.from("calendar_events").select("id", { count: "exact", head: true }).eq("family_id", familyId).is("place_id", null) },
    { key: "events_without_end_at", promise: adminClient.from("calendar_events").select("id", { count: "exact", head: true }).eq("family_id", familyId).is("end_at", null) },
    { key: "unlinked_login_members", promise: adminClient.from("family_members").select("id", { count: "exact", head: true }).eq("family_id", familyId).in("role", ["child", "homestay"]).eq("can_login", false) },
    { key: "places_without_coordinates", promise: adminClient.from("places").select("id", { count: "exact", head: true }).eq("family_id", familyId).or("lat.is.null,lng.is.null") },
    { key: "active_homework_without_due_at", promise: adminClient.from("homework_tasks").select("id", { count: "exact", head: true }).eq("family_id", familyId).neq("status", "done").neq("status", "cancelled").is("due_at", null) },
    { key: "unpaid_overdue_payments", promise: adminClient.from("payments").select("id", { count: "exact", head: true }).eq("family_id", familyId).neq("status", "paid").not("due_date", "is", null).lt("due_date", today) },
    { key: "active_push_devices", promise: adminClient.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("family_id", familyId).eq("is_active", true) },
    { key: "failed_notifications_7d", promise: adminClient.from("notification_logs").select("id", { count: "exact", head: true }).eq("family_id", familyId).eq("status", "failed").gte("created_at", sevenDaysAgo) },
  ];
  for (const item of queries) {
    const { count, error } = await item.promise;
    results[item.key] = error ? -1 : count ?? 0;
  }
  return results;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);
    const body = (await req.json().catch(() => ({}))) as Body;
    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);
    let role: RoleRow | null = null;
    if (body.family_id) {
      role = await getActorRole(adminClient, body.family_id, user.id);
      if (!role) return jsonResponse({ error: "User is not linked to this family." }, 403);
    }
    const familyId = body.family_id ?? null;
    const tableChecks = await Promise.all([
      tableCount(adminClient, "families", null),
      tableCount(adminClient, "family_members", familyId),
      tableCount(adminClient, "family_user_roles", familyId),
      tableCount(adminClient, "calendar_events", familyId),
      tableCount(adminClient, "places", familyId),
      tableCount(adminClient, "homework_tasks", familyId),
      tableCount(adminClient, "payments", familyId),
      tableCount(adminClient, "route_stops", familyId),
      tableCount(adminClient, "push_subscriptions", familyId),
      tableCount(adminClient, "notification_logs", familyId),
      tableCount(adminClient, "notification_preferences", familyId),
    ]);
    const problemCounts = familyId ? await findProblemCounts(adminClient, familyId) : {};
    return jsonResponse({
      ok: true,
      checked_at: new Date().toISOString(),
      user: { id: user.id, email: user.email },
      actor_role: role,
      env: {
        SUPABASE_URL: envPresent("SUPABASE_URL"),
        SUPABASE_ANON_KEY: envPresent("SUPABASE_ANON_KEY"),
        SUPABASE_SERVICE_ROLE_KEY: envPresent("SUPABASE_SERVICE_ROLE_KEY"),
        OPENAI_API_KEY: envPresent("OPENAI_API_KEY"),
        GOOGLE_MAPS_API_KEY: envPresent("GOOGLE_MAPS_API_KEY"),
        VAPID_PUBLIC_KEY: envPresent("VAPID_PUBLIC_KEY"),
        VAPID_PRIVATE_KEY: envPresent("VAPID_PRIVATE_KEY"),
        VAPID_SUBJECT: envPresent("VAPID_SUBJECT"),
        CRON_SECRET: envPresent("CRON_SECRET"),
      },
      tables: tableChecks,
      problem_counts: problemCounts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
