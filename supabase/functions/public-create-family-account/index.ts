import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  parent_email: string;
  parent_password: string;
  parent_display_name: string;
  family_name: string;
  timezone?: string | null;
  state_region?: string | null;
  school_level?: string | null;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as Body;

    if (!body.parent_email) return jsonResponse({ error: "parent_email is required" }, 400);
    if (!body.parent_password) return jsonResponse({ error: "parent_password is required" }, 400);
    if (!body.parent_display_name) return jsonResponse({ error: "parent_display_name is required" }, 400);
    if (!body.family_name) return jsonResponse({ error: "family_name is required" }, 400);

    const email = normalizeEmail(body.parent_email);
    validatePassword(body.parent_password);

    const adminClient = getAdminClient();

    const existing = await findAuthUserByEmail(adminClient, email);
    if (existing) {
      return jsonResponse({ error: "This email is already registered. Please login instead." }, 400);
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: body.parent_password,
      email_confirm: true,
      user_metadata: {
        display_name: body.parent_display_name,
        role: "parent",
      },
    });

    if (authError) throw new Error(authError.message);

    const authUser = authData.user;

    const { data: family, error: familyError } = await adminClient
      .from("families")
      .insert({
        name: body.family_name,
        timezone: body.timezone ?? "Australia/Adelaide",
        state_region: body.state_region ?? "SA",
        school_level: body.school_level ?? "primary",
      })
      .select("*")
      .single();

    if (familyError) throw new Error(familyError.message);

    const { data: parentMember, error: memberError } = await adminClient
      .from("family_members")
      .insert({
        family_id: family.id,
        display_name: body.parent_display_name,
        role: "parent",
        auth_user_id: authUser.id,
        can_login: true,
        default_navigation_app: "google",
      })
      .select("*")
      .single();

    if (memberError) throw new Error(memberError.message);

    const { error: roleError } = await adminClient
      .from("family_user_roles")
      .insert({
        family_id: family.id,
        auth_user_id: authUser.id,
        member_id: parentMember.id,
        role: "parent",
      });

    if (roleError) throw new Error(roleError.message);

    return jsonResponse({
      ok: true,
      message: "Family account created. Please login.",
      family: {
        id: family.id,
        name: family.name,
      },
      parent: {
        id: parentMember.id,
        display_name: parentMember.display_name,
        email,
        auth_user_id: authUser.id,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
