import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id: string;
  member_id: string;
  expires_in_days?: number;
};

type RoleRow = {
  member_id: string | null;
  role: string;
};

type MemberRow = {
  id: string;
  family_id: string;
  display_name: string;
  role: string;
  auth_user_id: string | null;
  can_login: boolean;
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

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FD-";
  for (let i = 0; i < 4; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  code += "-";
  for (let i = 0; i < 4; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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

async function getTargetMember(adminClient: any, familyId: string, memberId: string): Promise<MemberRow> {
  const { data, error } = await adminClient
    .from("family_members")
    .select("id, family_id, display_name, role, auth_user_id, can_login")
    .eq("family_id", familyId)
    .eq("id", memberId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Target member not found.");

  return data as MemberRow;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const body = (await req.json()) as Body;
    if (!body.family_id) return jsonResponse({ error: "family_id is required" }, 400);
    if (!body.member_id) return jsonResponse({ error: "member_id is required" }, 400);

    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const actorRole = await getActorRole(adminClient, body.family_id, user.id);
    if (!["parent", "guardian"].includes(actorRole.role)) {
      return jsonResponse({ error: "Only parent/guardian can create invites." }, 403);
    }

    const member = await getTargetMember(adminClient, body.family_id, body.member_id);

    if (!["child", "homestay", "parent", "guardian"].includes(member.role)) {
      return jsonResponse({ error: `Unsupported member role: ${member.role}` }, 400);
    }

    if (member.auth_user_id && member.can_login) {
      return jsonResponse({ error: `${member.display_name} already has a login account.` }, 400);
    }

    const expiresInDays = Math.min(Math.max(body.expires_in_days ?? 14, 1), 60);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    // Expire older unused invites for this member.
    const { error: expireError } = await adminClient
      .from("family_member_invites")
      .update({ expires_at: new Date().toISOString() })
      .eq("family_id", body.family_id)
      .eq("member_id", body.member_id)
      .is("used_at", null);

    if (expireError) throw new Error(expireError.message);

    let invite = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateInviteCode();

      const { data, error } = await adminClient
        .from("family_member_invites")
        .insert({
          family_id: body.family_id,
          member_id: body.member_id,
          invite_code: code,
          intended_role: member.role,
          created_by: actorRole.member_id,
          expires_at: expiresAt,
        })
        .select("*")
        .single();

      if (!error) {
        invite = data;
        break;
      }

      if (!String(error.message).includes("duplicate")) {
        throw new Error(error.message);
      }
    }

    if (!invite) throw new Error("Failed to generate unique invite code.");

    return jsonResponse({
      ok: true,
      member: {
        id: member.id,
        display_name: member.display_name,
        role: member.role,
      },
      invite: {
        id: invite.id,
        invite_code: invite.invite_code,
        expires_at: invite.expires_at,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
