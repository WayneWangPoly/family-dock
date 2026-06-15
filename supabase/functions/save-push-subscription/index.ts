import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  action?: "save" | "deactivate";
  family_id: string;
  member_id?: string | null;
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  user_agent?: string | null;
  device_label?: string | null;
};

type RoleRow = {
  member_id: string | null;
  role: string;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const body = (await req.json()) as Body;
    if (!body.family_id) return jsonResponse({ error: "family_id is required" }, 400);
    if (!body.endpoint) return jsonResponse({ error: "endpoint is required" }, 400);

    const action = body.action ?? "save";

    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const actorRole = await getActorRole(adminClient, body.family_id, user.id);
    const memberId = body.member_id ?? actorRole.member_id;

    if (action === "deactivate") {
      const { data, error } = await adminClient
        .from("push_subscriptions")
        .update({
          is_active: false,
          last_seen_at: new Date().toISOString(),
        })
        .eq("family_id", body.family_id)
        .eq("auth_user_id", user.id)
        .eq("endpoint", body.endpoint)
        .select("*")
        .maybeSingle();

      if (error) throw new Error(error.message);

      return jsonResponse({
        ok: true,
        action,
        subscription: data,
      });
    }

    if (!body.keys?.p256dh || !body.keys?.auth) {
      return jsonResponse({ error: "subscription keys are required" }, 400);
    }

    const { data, error } = await adminClient
      .from("push_subscriptions")
      .upsert(
        {
          family_id: body.family_id,
          auth_user_id: user.id,
          member_id: memberId,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          user_agent: body.user_agent ?? null,
          device_label: body.device_label ?? null,
          is_active: true,
          last_seen_at: new Date().toISOString(),
        },
        {
          onConflict: "endpoint",
        },
      )
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return jsonResponse({
      ok: true,
      action,
      subscription: data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
