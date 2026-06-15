import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = { family_id: string; member_id: string; action: "reset_password" | "disable" | "enable"; new_password?: string };
type RoleRow = { member_id: string | null; role: string };
type MemberRow = { id: string; family_id: string; display_name: string; role: string; auth_user_id: string | null; can_login: boolean };

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
function validatePassword(password?: string) {
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
}
async function getActorRole(adminClient: any, familyId: string, authUserId: string): Promise<RoleRow> {
  const { data, error } = await adminClient.from("family_user_roles").select("member_id, role").eq("family_id", familyId).eq("auth_user_id", authUserId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("User is not linked to this family.");
  return data as RoleRow;
}
async function getMember(adminClient: any, familyId: string, memberId: string): Promise<MemberRow> {
  const { data, error } = await adminClient.from("family_members").select("id, family_id, display_name, role, auth_user_id, can_login").eq("family_id", familyId).eq("id", memberId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Member not found.");
  return data as MemberRow;
}
async function enableAccount(adminClient: any, member: MemberRow) {
  if (!member.auth_user_id) throw new Error("Member has no auth_user_id.");
  const { error: roleError } = await adminClient.from("family_user_roles").upsert({
    family_id: member.family_id,
    auth_user_id: member.auth_user_id,
    member_id: member.id,
    role: member.role,
  }, { onConflict: "family_id,auth_user_id" });
  if (roleError) throw new Error(roleError.message);
  const { error: memberError } = await adminClient.from("family_members").update({ can_login: true }).eq("family_id", member.family_id).eq("id", member.id);
  if (memberError) throw new Error(memberError.message);
}
async function disableAccount(adminClient: any, member: MemberRow) {
  if (!member.auth_user_id) throw new Error("Member has no auth_user_id.");
  const { error: roleError } = await adminClient.from("family_user_roles").delete().eq("family_id", member.family_id).eq("member_id", member.id).eq("auth_user_id", member.auth_user_id);
  if (roleError) throw new Error(roleError.message);
  const { error: memberError } = await adminClient.from("family_members").update({ can_login: false }).eq("family_id", member.family_id).eq("id", member.id);
  if (memberError) throw new Error(memberError.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);
    const body = (await req.json()) as Body;
    if (!body.family_id || !body.member_id || !body.action) return jsonResponse({ error: "family_id, member_id and action are required" }, 400);
    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);
    const actorRole = await getActorRole(adminClient, body.family_id, user.id);
    if (!["parent", "guardian"].includes(actorRole.role)) return jsonResponse({ error: "Only parent/guardian can manage accounts." }, 403);
    const member = await getMember(adminClient, body.family_id, body.member_id);
    if (!member.auth_user_id) return jsonResponse({ error: `${member.display_name} has no login account yet.` }, 400);

    if (body.action === "reset_password") {
      validatePassword(body.new_password);
      const { error } = await adminClient.auth.admin.updateUserById(member.auth_user_id, { password: body.new_password });
      if (error) throw new Error(error.message);
      await enableAccount(adminClient, member);
    } else if (body.action === "disable") {
      await disableAccount(adminClient, member);
    } else if (body.action === "enable") {
      await enableAccount(adminClient, member);
    }
    return jsonResponse({ ok: true, action: body.action, member: { id: member.id, display_name: member.display_name } });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
