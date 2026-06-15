import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id?: string | null;
  plan_id?: string | null;
  mode?: "manual" | "cron";
  limit?: number | null;
};

type RoleRow = {
  member_id: string | null;
  role: string;
};

type PlanRow = {
  id: string;
  family_id: string;
  title: string;
  plan_date: string;
  recommended_departure_at: string | null;
  latest_safe_departure_at: string | null;
  overall_risk: string;
  execution_status: string;
};

type LegRow = {
  id: string;
  family_id: string;
  plan_id: string;
  leg_order: number;
  event_title: string | null;
  recommended_departure_at: string | null;
  latest_safe_departure_at: string | null;
  risk_level: string;
  leg_status: string;
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
        throw new Error("Only parent/guardian can run late-risk checks manually.");
      }
    }

    return "manual";
  }

  const cronSecret = getOptionalEnv("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret && providedSecret === cronSecret) return "cron";

  throw new Error("Missing Authorization header or valid x-cron-secret.");
}

function minutesUntil(value?: string | null) {
  if (!value) return null;
  return Math.round((new Date(value).getTime() - Date.now()) / 60000);
}

function classify(minutesToRecommended: number | null, minutesToLatest: number | null) {
  if (minutesToLatest !== null && minutesToLatest < 0) return "late";
  if (minutesToRecommended !== null && minutesToRecommended < 0) return "high";
  if (minutesToRecommended !== null && minutesToRecommended <= 5) return "medium";
  if (minutesToRecommended !== null && minutesToRecommended <= 15) return "normal";
  return "low";
}

function messageFor(label: string, risk: string, rec: number | null, latest: number | null) {
  if (risk === "late") {
    return {
      message: `${label}: already past latest safe departure.`,
      recommendation: "Leave immediately or adjust the plan. Consider notifying the other parent/coach/teacher.",
    };
  }

  if (risk === "high") {
    return {
      message: `${label}: past recommended departure time.`,
      recommendation: "Leave now. Buffer has been consumed.",
    };
  }

  if (risk === "medium") {
    return {
      message: `${label}: only ${rec} minute(s) until recommended departure.`,
      recommendation: "Prepare to leave; avoid starting another task.",
    };
  }

  if (risk === "normal") {
    return {
      message: `${label}: ${rec} minute(s) until recommended departure.`,
      recommendation: "Timing is acceptable but keep watching the clock.",
    };
  }

  return {
    message: `${label}: no immediate late risk.`,
    recommendation: "No action needed right now.",
  };
}

async function loadPlans(adminClient: any, body: Body) {
  let query = adminClient
    .from("route_departure_plans")
    .select("id, family_id, title, plan_date, recommended_departure_at, latest_safe_departure_at, overall_risk, execution_status")
    .in("execution_status", ["planned", "ready", "on_the_way"])
    .not("recommended_departure_at", "is", null)
    .order("recommended_departure_at", { ascending: true })
    .limit(Math.min(Math.max(Number(body.limit ?? 100), 1), 500));

  if (body.family_id) query = query.eq("family_id", body.family_id);
  if (body.plan_id) query = query.eq("id", body.plan_id);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as PlanRow[];
}

async function loadLegs(adminClient: any, familyId: string, planId: string) {
  const { data, error } = await adminClient
    .from("route_departure_legs")
    .select("id, family_id, plan_id, leg_order, event_title, recommended_departure_at, latest_safe_departure_at, risk_level, leg_status")
    .eq("family_id", familyId)
    .eq("plan_id", planId)
    .in("leg_status", ["planned", "ready", "on_the_way"])
    .order("leg_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as LegRow[];
}

async function logRisk(adminClient: any, args: {
  familyId: string;
  planId: string;
  legId?: string | null;
  riskLevel: string;
  minutesToRecommended: number | null;
  minutesToLatest: number | null;
  message: string;
  recommendation: string;
}) {
  const { error } = await adminClient.from("route_late_risk_checks").insert({
    family_id: args.familyId,
    plan_id: args.planId,
    leg_id: args.legId ?? null,
    risk_level: args.riskLevel,
    minutes_to_recommended: args.minutesToRecommended,
    minutes_to_latest_safe: args.minutesToLatest,
    message: args.message,
    recommendation: args.recommendation,
    status: "active",
  });

  if (error) throw new Error(error.message);
}

async function updatePlanRisk(adminClient: any, plan: PlanRow, riskLevel: string, message: string) {
  const patch: Record<string, unknown> = {
    late_risk_level: riskLevel,
    late_risk_message: message,
    last_late_risk_check_at: new Date().toISOString(),
  };

  if (riskLevel === "late" || riskLevel === "high") {
    patch.execution_status = "ready";
  }

  const { error } = await adminClient
    .from("route_departure_plans")
    .update(patch)
    .eq("id", plan.id);

  if (error) throw new Error(error.message);
}

async function updateLegRisk(adminClient: any, leg: LegRow, riskLevel: string, message: string) {
  const patch: Record<string, unknown> = {
    late_risk_level: riskLevel,
    late_risk_message: message,
    last_late_risk_check_at: new Date().toISOString(),
  };

  if (riskLevel === "late" || riskLevel === "high") {
    patch.leg_status = "ready";
  }

  const { error } = await adminClient
    .from("route_departure_legs")
    .update(patch)
    .eq("id", leg.id);

  if (error) throw new Error(error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const adminClient = getAdminClient();
  let logId: string | null = null;

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const runMode = await assertAuthorized(req, adminClient, body.family_id);

    const { data: runnerLog } = await adminClient
      .from("scheduled_runner_logs")
      .insert({
        runner_name: "route-late-risk-check",
        run_mode: runMode,
        family_id: body.family_id ?? null,
        status: "running",
      })
      .select("id")
      .single();

    logId = runnerLog?.id ?? null;

    const plans = await loadPlans(adminClient, body);
    const result = {
      ok: true,
      checked_plans: plans.length,
      checked_legs: 0,
      high_or_late: 0,
      risks: [] as any[],
    };

    for (const plan of plans) {
      const planRec = minutesUntil(plan.recommended_departure_at);
      const planLatest = minutesUntil(plan.latest_safe_departure_at);
      const planRisk = classify(planRec, planLatest);
      const planMsg = messageFor(plan.title, planRisk, planRec, planLatest);

      await updatePlanRisk(adminClient, plan, planRisk, planMsg.message);

      if (["high", "late"].includes(planRisk)) {
        result.high_or_late += 1;
        await logRisk(adminClient, {
          familyId: plan.family_id,
          planId: plan.id,
          riskLevel: planRisk,
          minutesToRecommended: planRec,
          minutesToLatest: planLatest,
          message: planMsg.message,
          recommendation: planMsg.recommendation,
        });
      }

      result.risks.push({
        plan_id: plan.id,
        risk: planRisk,
        message: planMsg.message,
      });

      const legs = await loadLegs(adminClient, plan.family_id, plan.id);
      result.checked_legs += legs.length;

      for (const leg of legs) {
        const legRec = minutesUntil(leg.recommended_departure_at);
        const legLatest = minutesUntil(leg.latest_safe_departure_at);
        const legRisk = classify(legRec, legLatest);
        const legMsg = messageFor(`Leg ${leg.leg_order} ${leg.event_title ?? ""}`.trim(), legRisk, legRec, legLatest);

        await updateLegRisk(adminClient, leg, legRisk, legMsg.message);

        if (["high", "late"].includes(legRisk)) {
          result.high_or_late += 1;
          await logRisk(adminClient, {
            familyId: leg.family_id,
            planId: leg.plan_id,
            legId: leg.id,
            riskLevel: legRisk,
            minutesToRecommended: legRec,
            minutesToLatest: legLatest,
            message: legMsg.message,
            recommendation: legMsg.recommendation,
          });
        }
      }
    }

    if (logId) {
      await adminClient
        .from("scheduled_runner_logs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          summary: result,
        })
        .eq("id", logId);
    }

    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (logId) {
      await adminClient
        .from("scheduled_runner_logs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: message,
        })
        .eq("id", logId);
    }

    return jsonResponse({ error: message }, 500);
  }
});
