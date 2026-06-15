import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id?: string | null;
  mode?: "manual_check" | "cron_check" | "manual_test";
  plan_id?: string | null;
  target_url?: string | null;
  limit?: number | null;
};

type RoleRow = {
  member_id: string | null;
  role: string;
};

type RoutePlan = {
  id: string;
  family_id: string;
  plan_date: string;
  title: string;
  overall_risk: string;
  recommended_departure_at: string | null;
  latest_safe_departure_at: string | null;
  alert_enabled: boolean;
  alert_minutes_before: number;
  alert_sent_at: string | null;
  assigned_parent_id: string | null;
  summary: string;
};

type PushSubscription = {
  id: string;
  family_id: string;
  auth_user_id: string;
  member_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
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

function configureWebPush() {
  webpush.setVapidDetails(
    getOptionalEnv("VAPID_SUBJECT") || "mailto:admin@example.com",
    requireEnv("VAPID_PUBLIC_KEY"),
    requireEnv("VAPID_PRIVATE_KEY"),
  );
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

async function assertAuthorized(req: Request, adminClient: any, familyId?: string | null) {
  const authHeader = req.headers.get("Authorization");

  if (authHeader) {
    const userClient = getUserClient(authHeader);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) throw new Error("Invalid or expired user session.");

    if (familyId) {
      const role = await getActorRole(adminClient, familyId, user.id);
      if (!["parent", "guardian"].includes(role.role)) {
        throw new Error("Only parent/guardian can run route departure alerts manually.");
      }

      return { mode: "user", auth_user_id: user.id, member_id: role.member_id };
    }

    return { mode: "user", auth_user_id: user.id, member_id: null };
  }

  const cronSecret = getOptionalEnv("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret && providedSecret === cronSecret) {
    return { mode: "cron", auth_user_id: null, member_id: null };
  }

  throw new Error("Missing Authorization header or valid x-cron-secret.");
}

async function loadCandidatePlans(adminClient: any, body: Body) {
  const now = new Date();
  const maxTime = new Date(now.getTime() + 35 * 60 * 1000).toISOString();

  let query = adminClient
    .from("route_departure_plans")
    .select("id, family_id, plan_date, title, overall_risk, recommended_departure_at, latest_safe_departure_at, alert_enabled, alert_minutes_before, alert_sent_at, assigned_parent_id, summary")
    .eq("alert_enabled", true)
    .is("alert_sent_at", null)
    .not("recommended_departure_at", "is", null)
    .lte("recommended_departure_at", maxTime)
    .in("status", ["draft", "active"])
    .in("execution_status", ["planned", "ready"])
    .order("recommended_departure_at", { ascending: true })
    .limit(Math.min(Math.max(Number(body.limit ?? 50), 1), 200));

  if (body.family_id) query = query.eq("family_id", body.family_id);
  if (body.plan_id) query = query.eq("id", body.plan_id);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []) as RoutePlan[];
}

async function loadSubscriptions(adminClient: any, familyId: string, assignedParentId?: string | null) {
  let query = adminClient
    .from("push_subscriptions")
    .select("id, family_id, auth_user_id, member_id, endpoint, p256dh, auth")
    .eq("family_id", familyId)
    .eq("is_active", true);

  if (assignedParentId) {
    query = query.eq("member_id", assignedParentId);
  } else {
    const { data: parentRoles, error: roleError } = await adminClient
      .from("family_user_roles")
      .select("member_id")
      .eq("family_id", familyId)
      .in("role", ["parent", "guardian"]);

    if (roleError) throw new Error(roleError.message);

    const parentIds = (parentRoles ?? []).map((row: any) => row.member_id).filter(Boolean);
    if (parentIds.length > 0) query = query.in("member_id", parentIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []) as PushSubscription[];
}

function alertTypeFor(plan: RoutePlan) {
  const departMs = plan.recommended_departure_at ? new Date(plan.recommended_departure_at).getTime() : null;
  if (!departMs) return "leave_soon";

  const minutesToDepart = Math.round((departMs - Date.now()) / 60000);

  if (plan.overall_risk === "high") return "high_risk";
  if (minutesToDepart <= 3) return "leave_now";
  return "leave_soon";
}

function toWebPushSubscription(row: PushSubscription) {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

async function alreadySent(adminClient: any, subscriptionId: string, dedupeKey: string) {
  const { data, error } = await adminClient
    .from("route_departure_alerts")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .eq("dedupe_key", dedupeKey)
    .eq("status", "sent")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function logAlert(adminClient: any, args: {
  familyId: string;
  plan: RoutePlan;
  subscription: PushSubscription | null;
  alertType: string;
  title: string;
  body: string;
  targetUrl: string;
  dedupeKey: string;
  status: "sent" | "failed" | "skipped";
  errorMessage?: string | null;
}) {
  const { error } = await adminClient
    .from("route_departure_alerts")
    .insert({
      family_id: args.familyId,
      plan_id: args.plan.id,
      recipient_member_id: args.subscription?.member_id ?? args.plan.assigned_parent_id ?? null,
      subscription_id: args.subscription?.id ?? null,
      alert_type: args.alertType,
      title: args.title,
      body: args.body,
      target_url: args.targetUrl,
      scheduled_for: args.plan.recommended_departure_at,
      sent_at: args.status === "sent" ? new Date().toISOString() : null,
      status: args.status,
      error_message: args.errorMessage ?? null,
      dedupe_key: args.dedupeKey,
    });

  if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);
}

async function sendToSubscription(adminClient: any, plan: RoutePlan, subscription: PushSubscription, targetUrl: string) {
  const alertType = alertTypeFor(plan);
  const departLabel = plan.recommended_departure_at
    ? new Date(plan.recommended_departure_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })
    : "soon";

  const title = alertType === "high_risk"
    ? "High risk route: leave now"
    : alertType === "leave_now"
    ? "Leave now"
    : `Leave at ${departLabel}`;

  const body = `${plan.title}. ${plan.summary}`;
  const dedupeKey = `${plan.family_id}:route-plan:${plan.id}:${alertType}`;

  if (await alreadySent(adminClient, subscription.id, dedupeKey)) {
    await logAlert(adminClient, {
      familyId: plan.family_id,
      plan,
      subscription,
      alertType,
      title,
      body,
      targetUrl,
      dedupeKey,
      status: "skipped",
      errorMessage: "Already sent to this device.",
    });

    return { sent: 0, failed: 0, skipped: 1 };
  }

  try {
    await webpush.sendNotification(
      toWebPushSubscription(subscription),
      JSON.stringify({
        title,
        body,
        url: targetUrl,
        tag: dedupeKey,
      }),
    );

    await logAlert(adminClient, {
      familyId: plan.family_id,
      plan,
      subscription,
      alertType,
      title,
      body,
      targetUrl,
      dedupeKey,
      status: "sent",
    });

    return { sent: 1, failed: 0, skipped: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await logAlert(adminClient, {
      familyId: plan.family_id,
      plan,
      subscription,
      alertType,
      title,
      body,
      targetUrl,
      dedupeKey,
      status: "failed",
      errorMessage: message,
    });

    const statusCode = (error as any)?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await adminClient
        .from("push_subscriptions")
        .update({ is_active: false, disabled_at: new Date().toISOString() })
        .eq("id", subscription.id);
    }

    return { sent: 0, failed: 1, skipped: 0 };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    configureWebPush();

    const body = (await req.json().catch(() => ({}))) as Body;
    const adminClient = getAdminClient();

    await assertAuthorized(req, adminClient, body.family_id);

    const targetUrl = body.target_url ?? "/";
    const plans = await loadCandidatePlans(adminClient, body);

    const summary = {
      ok: true,
      plan_count: plans.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      no_subscription: 0,
      results: [] as any[],
    };

    for (const plan of plans) {
      const subscriptions = await loadSubscriptions(adminClient, plan.family_id, plan.assigned_parent_id);

      if (subscriptions.length === 0) {
        const alertType = alertTypeFor(plan);
        await logAlert(adminClient, {
          familyId: plan.family_id,
          plan,
          subscription: null,
          alertType,
          title: "Route alert skipped",
          body: "No active push subscription for assigned parent/guardian.",
          targetUrl,
          dedupeKey: `${plan.family_id}:route-plan:${plan.id}:${alertType}:no-subscription`,
          status: "skipped",
          errorMessage: "No active push subscription.",
        });
        summary.no_subscription += 1;
        continue;
      }

      let anySent = false;
      for (const subscription of subscriptions) {
        const result = await sendToSubscription(adminClient, plan, subscription, targetUrl);
        summary.sent += result.sent;
        summary.failed += result.failed;
        summary.skipped += result.skipped;
        if (result.sent > 0) anySent = true;
      }

      if (anySent) {
        await adminClient
          .from("route_departure_plans")
          .update({ alert_sent_at: new Date().toISOString() })
          .eq("id", plan.id);
      }

      summary.results.push({
        plan_id: plan.id,
        subscriptions: subscriptions.length,
        any_sent: anySent,
      });
    }

    return jsonResponse(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
