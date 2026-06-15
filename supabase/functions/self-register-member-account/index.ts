import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  invite_code: string;
  email: string;
  password: string;
};

type InviteRow = {
  id: string;
  family_id: string;
  member_id: string;
  invite_code: string;
  intended_role: string;
  expires_at: string;
  used_at: string | null;
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeInviteCode(code: string) {
  return code.trim().toUpperCase();
}

function validatePassword(password: string) {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
}

async function findAuthUserByEmail(adminClient: any, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) throw new Error(error.message);

    const found = data.users.find((user: any) => normalizeEmail(user.email ?? "") === email);
    if (found) return found;

    if (data.users.length < 100) break;
  }

  return null;
}

async function loadInvite(adminClient: any, code: string): Promise<InviteRow> {
  const { data, error } = await adminClient
    .from("family_member_invites")
    .select("*")
    .eq("invite_code", code)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid invite code.");

  return data as InviteRow;
}

async function loadMember(adminClient: any, invite: InviteRow): Promise<MemberRow> {
  const { data, error } = await adminClient
    .from("family_members")
    .select("id, family_id, display_name, role, auth_user_id, can_login")
    .eq("family_id", invite.family_id)
    .eq("id", invite.member_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invite target member not found.");

  return data as MemberRow;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as Body;
    if (!body.invite_code) return jsonResponse({ error: "invite_code is required" }, 400);
    if (!body.email) return jsonResponse({ error: "email is required" }, 400);
    if (!body.password) return jsonResponse({ error: "password is required" }, 400);

    const email = normalizeEmail(body.email);
    const inviteCode = normalizeInviteCode(body.invite_code);
    validatePassword(body.password);

    const adminClient = getAdminClient();

    const invite = await loadInvite(adminClient, inviteCode);

    if (invite.used_at) {
      return jsonResponse({ error: "This invite code has already been used." }, 400);
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "This invite code has expired." }, 400);
    }

    const member = await loadMember(adminClient, invite);

    if (member.auth_user_id && member.can_login) {
      return jsonResponse({ error: `${member.display_name} already has a login account.` }, 400);
    }

    if (member.role !== invite.intended_role) {
      return jsonResponse({ error: "Invite role no longer matches member role." }, 400);
    }

    const existingUser = await findAuthUserByEmail(adminClient, email);
    if (existingUser) {
      return jsonResponse({ error: "This email is already registered. Use another email or ask parents to reset the account." }, 400);
    }

    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        family_id: invite.family_id,
        member_id: invite.member_id,
        display_name: member.display_name,
        role: member.role,
      },
    });

    if (createError) throw new Error(createError.message);

    const authUserId = createdUser.user.id;

    const { error: memberError } = await adminClient
      .from("family_members")
      .update({
        auth_user_id: authUserId,
        can_login: true,
      })
      .eq("family_id", invite.family_id)
      .eq("id", invite.member_id);

    if (memberError) throw new Error(memberError.message);

    const { error: roleError } = await adminClient
      .from("family_user_roles")
      .upsert(
        {
          family_id: invite.family_id,
          auth_user_id: authUserId,
          member_id: invite.member_id,
          role: member.role,
        },
        {
          onConflict: "family_id,auth_user_id",
        },
      );

    if (roleError) throw new Error(roleError.message);

    const { error: inviteError } = await adminClient
      .from("family_member_invites")
      .update({
        used_at: new Date().toISOString(),
        used_by_auth_user_id: authUserId,
      })
      .eq("id", invite.id);

    if (inviteError) throw new Error(inviteError.message);

    return jsonResponse({
      ok: true,
      message: "Account registered successfully. You can now sign in.",
      member: {
        id: member.id,
        display_name: member.display_name,
        role: member.role,
      },
      account: {
        email,
        auth_user_id: authUserId,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
