import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id: string;
  member_id: string;
  email: string;
  password: string;
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validatePassword(password: string) {
  if (!password || password.length < 8) {
    throw new Error("Temporary password must be at least 8 characters.");
  }
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

async function findAuthUserByEmail(adminClient: any, email: string) {
  // Supabase Admin API currently has listUsers pagination, no direct getByEmail in all versions.
  // Family app scale is small, so this is fine for household accounts.
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

async function createOrUpdateAuthUser(adminClient: any, args: {
  email: string;
  password: string;
  familyId: string;
  memberId: string;
  displayName: string;
  role: string;
}) {
  const existing = await findAuthUserByEmail(adminClient, args.email);

  if (existing) {
    const { data, error } = await adminClient.auth.admin.updateUserById(existing.id, {
      password: args.password,
      user_metadata: {
        family_id: args.familyId,
        member_id: args.memberId,
        display_name: args.displayName,
        role: args.role,
      },
    });

    if (error) throw new Error(error.message);

    return {
      authUser: data.user,
      created: false,
      passwordUpdated: true,
    };
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
    user_metadata: {
      family_id: args.familyId,
      member_id: args.memberId,
      display_name: args.displayName,
      role: args.role,
    },
  });

  if (error) throw new Error(error.message);

  return {
    authUser: data.user,
    created: true,
    passwordUpdated: false,
  };
}

async function bindMember(adminClient: any, args: {
  familyId: string;
  memberId: string;
  authUserId: string;
  role: string;
}) {
  const { error: memberError } = await adminClient
    .from("family_members")
    .update({
      auth_user_id: args.authUserId,
      can_login: true,
    })
    .eq("family_id", args.familyId)
    .eq("id", args.memberId);

  if (memberError) throw new Error(memberError.message);

  const { error: roleError } = await adminClient
    .from("family_user_roles")
    .upsert(
      {
        family_id: args.familyId,
        auth_user_id: args.authUserId,
        member_id: args.memberId,
        role: args.role,
      },
      {
        onConflict: "family_id,auth_user_id",
      },
    );

  if (roleError) throw new Error(roleError.message);
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
    if (!body.email) return jsonResponse({ error: "email is required" }, 400);
    if (!body.password) return jsonResponse({ error: "password is required" }, 400);

    const email = normalizeEmail(body.email);
    validatePassword(body.password);

    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const actorRole = await getActorRole(adminClient, body.family_id, user.id);

    if (!["parent", "guardian"].includes(actorRole.role)) {
      return jsonResponse({ error: "Only parent/guardian can create member accounts." }, 403);
    }

    const member = await getTargetMember(adminClient, body.family_id, body.member_id);

    if (!["child", "homestay", "parent", "guardian"].includes(member.role)) {
      return jsonResponse({ error: `Unsupported member role: ${member.role}` }, 400);
    }

    const result = await createOrUpdateAuthUser(adminClient, {
      email,
      password: body.password,
      familyId: body.family_id,
      memberId: body.member_id,
      displayName: member.display_name,
      role: member.role,
    });

    await bindMember(adminClient, {
      familyId: body.family_id,
      memberId: body.member_id,
      authUserId: result.authUser.id,
      role: member.role,
    });

    return jsonResponse({
      ok: true,
      member: {
        id: member.id,
        display_name: member.display_name,
        role: member.role,
      },
      account: {
        email,
        auth_user_id: result.authUser.id,
        created: result.created,
        password_updated: result.passwordUpdated,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
