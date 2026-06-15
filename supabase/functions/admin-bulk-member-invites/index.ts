import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type MemberInput = {
  display_name: string;
  role: "child" | "homestay";
  email_hint?: string | null;
};

type Body = {
  family_id: string;
  members?: MemberInput[];
  invite_existing_unlinked?: boolean;
  expires_in_days?: number;
  base_url?: string | null;
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

function cleanBaseUrl(baseUrl?: string | null) {
  if (!baseUrl) return "";
  return baseUrl.replace(/\/+$/, "");
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

async function expireOldInvites(adminClient: any, familyId: string, memberId: string) {
  const { error } = await adminClient
    .from("family_member_invites")
    .update({ expires_at: new Date().toISOString() })
    .eq("family_id", familyId)
    .eq("member_id", memberId)
    .is("used_at", null);

  if (error) throw new Error(error.message);
}

async function createInvite(adminClient: any, args: {
  familyId: string;
  member: MemberRow;
  createdBy: string | null;
  expiresAt: string;
  baseUrl: string;
}) {
  await expireOldInvites(adminClient, args.familyId, args.member.id);

  let invite = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateInviteCode();

    const { data, error } = await adminClient
      .from("family_member_invites")
      .insert({
        family_id: args.familyId,
        member_id: args.member.id,
        invite_code: code,
        intended_role: args.member.role,
        created_by: args.createdBy,
        expires_at: args.expiresAt,
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

  const registrationLink = args.baseUrl
    ? `${args.baseUrl}/?invite=${encodeURIComponent(invite.invite_code)}`
    : `?invite=${encodeURIComponent(invite.invite_code)}`;

  return {
    id: invite.id,
    invite_code: invite.invite_code,
    expires_at: invite.expires_at,
    registration_link: registrationLink,
  };
}

async function createMember(adminClient: any, familyId: string, input: MemberInput): Promise<MemberRow> {
  const displayName = input.display_name.trim();
  if (!displayName) throw new Error("Member display_name is required.");

  const role = input.role;
  if (!["child", "homestay"].includes(role)) throw new Error(`Unsupported role: ${role}`);

  const { data: existing, error: existingError } = await adminClient
    .from("family_members")
    .select("id, family_id, display_name, role, auth_user_id, can_login")
    .eq("family_id", familyId)
    .ilike("display_name", displayName)
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing) return existing as MemberRow;

  const { data, error } = await adminClient
    .from("family_members")
    .insert({
      family_id: familyId,
      display_name: displayName,
      role,
      can_login: false,
      default_navigation_app: "google",
    })
    .select("id, family_id, display_name, role, auth_user_id, can_login")
    .single();

  if (error) throw new Error(error.message);

  return data as MemberRow;
}

async function loadUnlinkedMembers(adminClient: any, familyId: string): Promise<MemberRow[]> {
  const { data, error } = await adminClient
    .from("family_members")
    .select("id, family_id, display_name, role, auth_user_id, can_login")
    .eq("family_id", familyId)
    .in("role", ["child", "homestay"])
    .eq("can_login", false)
    .order("display_name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []) as MemberRow[];
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

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const actorRole = await getActorRole(adminClient, body.family_id, user.id);
    if (!["parent", "guardian"].includes(actorRole.role)) {
      return jsonResponse({ error: "Only parent/guardian can bulk invite members." }, 403);
    }

    const expiresInDays = Math.min(Math.max(body.expires_in_days ?? 14, 1), 60);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const baseUrl = cleanBaseUrl(body.base_url);

    let members: MemberRow[] = [];

    if (Array.isArray(body.members) && body.members.length > 0) {
      for (const input of body.members) {
        members.push(await createMember(adminClient, body.family_id, input));
      }
    }

    if (body.invite_existing_unlinked) {
      const existingUnlinked = await loadUnlinkedMembers(adminClient, body.family_id);
      const seen = new Set(members.map((member) => member.id));
      for (const member of existingUnlinked) {
        if (!seen.has(member.id)) members.push(member);
      }
    }

    members = members.filter((member) => !(member.auth_user_id && member.can_login));

    const results = [];
    for (const member of members) {
      const invite = await createInvite(adminClient, {
        familyId: body.family_id,
        member,
        createdBy: actorRole.member_id,
        expiresAt,
        baseUrl,
      });

      results.push({
        member: {
          id: member.id,
          display_name: member.display_name,
          role: member.role,
        },
        invite,
      });
    }

    return jsonResponse({
      ok: true,
      count: results.length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
