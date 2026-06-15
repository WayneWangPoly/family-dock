import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id: string;
  session_id?: string | null;
  actions: CopilotAction[];
  context?: {
    members?: Array<{ id: string; display_name: string; role: string }>;
    places?: Array<{ id: string; name: string }>;
  };
};

type CopilotAction = {
  id: string;
  type: string;
  title: string;
  payload: Record<string, any>;
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

function normalize(text?: string | null) {
  return String(text ?? "").trim().toLowerCase();
}

function findMember(context: Body["context"], name?: string | null) {
  const target = normalize(name);
  if (!target) return null;

  return context?.members?.find((member) => {
    const label = normalize(member.display_name);
    return label === target || label.includes(target) || target.includes(label);
  }) ?? null;
}

function findPlace(context: Body["context"], name?: string | null) {
  const target = normalize(name);
  if (!target) return null;

  return context?.places?.find((place) => {
    const label = normalize(place.name);
    return label === target || label.includes(target) || target.includes(label);
  }) ?? null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

async function logAction(adminClient: any, args: {
  familyId: string;
  sessionId?: string | null;
  action: CopilotAction;
  status: "committed" | "failed" | "skipped";
  targetTable?: string | null;
  targetId?: string | null;
  errorMessage?: string | null;
}) {
  const { error } = await adminClient
    .from("ai_copilot_action_logs")
    .insert({
      family_id: args.familyId,
      session_id: args.sessionId ?? null,
      action_type: args.action.type,
      action_payload: args.action,
      target_table: args.targetTable ?? null,
      target_id: args.targetId ?? null,
      status: args.status,
      error_message: args.errorMessage ?? null,
    });

  if (error) throw new Error(error.message);
}

async function commitCalendarEvent(adminClient: any, body: Body, action: CopilotAction) {
  const payload = action.payload ?? {};
  const member = findMember(body.context, payload.child_name);
  const place = findPlace(body.context, payload.place_name);

  if (!payload.title) throw new Error("calendar_event.title is required");
  if (!payload.start_at) throw new Error("calendar_event.start_at is required");

  const { data, error } = await adminClient
    .from("calendar_events")
    .insert({
      family_id: body.family_id,
      child_id: member?.id ?? null,
      place_id: place?.id ?? null,
      title: payload.title,
      event_type: payload.event_type ?? "other",
      start_at: payload.start_at,
      end_at: payload.end_at ?? null,
      teacher_name: payload.teacher_name ?? null,
      status: "planned",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return { table: "calendar_events", id: data.id };
}

async function commitHomeworkTask(adminClient: any, body: Body, action: CopilotAction) {
  const payload = action.payload ?? {};
  const member = findMember(body.context, payload.child_name);

  if (!payload.title) throw new Error("homework_task.title is required");

  const { data: task, error } = await adminClient
    .from("homework_tasks")
    .insert({
      family_id: body.family_id,
      child_id: member?.id ?? null,
      title: payload.title,
      due_at: payload.due_at ?? null,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length > 0) {
    const rows = items.map((item: any, index: number) => ({
      family_id: body.family_id,
      task_id: task.id,
      label: item.label ?? `Item ${index + 1}`,
      item_type: item.item_type ?? "other",
      is_done: false,
      sort_order: index + 1,
    }));

    const { error: itemError } = await adminClient.from("homework_items").insert(rows);
    if (itemError) throw new Error(`Homework task created, but items failed: ${itemError.message}`);
  }

  return { table: "homework_tasks", id: task.id };
}

async function commitPayment(adminClient: any, body: Body, action: CopilotAction) {
  const payload = action.payload ?? {};
  const member = findMember(body.context, payload.child_name);

  if (!payload.title) throw new Error("payment.title is required");

  const { data, error } = await adminClient
    .from("payments")
    .insert({
      family_id: body.family_id,
      child_id: member?.id ?? null,
      title: payload.title,
      amount: payload.amount ?? 0,
      currency: payload.currency ?? "AUD",
      due_date: payload.due_date ?? null,
      pay_to: payload.pay_to ?? null,
      reference: payload.reference ?? null,
      status: "unpaid",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return { table: "payments", id: data.id };
}

async function commitRequest(adminClient: any, body: Body, action: CopilotAction, actorRole: RoleRow) {
  const payload = action.payload ?? {};
  const requester = findMember(body.context, payload.requester_name);

  if (!payload.title) throw new Error("request.title is required");

  const { data, error } = await adminClient
    .from("requests")
    .insert({
      family_id: body.family_id,
      requester_id: requester?.id ?? actorRole.member_id,
      request_type: payload.request_type ?? "other",
      title: payload.title,
      detail: payload.detail ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return { table: "requests", id: data.id };
}

async function commitNotebookNote(adminClient: any, body: Body, action: CopilotAction, actorRole: RoleRow) {
  const payload = action.payload ?? {};
  const child = findMember(body.context, payload.child_name);

  if (!payload.title) throw new Error("notebook_note.title is required");
  if (!payload.content) throw new Error("notebook_note.content is required");

  const { data, error } = await adminClient
    .from("learning_notes")
    .insert({
      family_id: body.family_id,
      child_id: child?.id ?? null,
      created_by: actorRole.member_id,
      source_session_id: body.session_id ?? null,
      subject: payload.subject ?? null,
      title: payload.title,
      content: payload.content,
      tags: asStringArray(payload.tags),
      note_date: payload.note_date ?? new Date().toISOString().slice(0, 10),
      note_type: payload.note_type ?? "general",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return { table: "learning_notes", id: data.id };
}

async function commitMealPlan(adminClient: any, body: Body, action: CopilotAction, actorRole: RoleRow) {
  const payload = action.payload ?? {};
  const title = payload.title ?? `AI meal plan ${payload.week_start ?? ""}`.trim();

  const { data: plan, error } = await adminClient
    .from("meal_plans")
    .insert({
      family_id: body.family_id,
      created_by: actorRole.member_id,
      source_session_id: body.session_id ?? null,
      week_start: payload.week_start ?? null,
      meal_type: payload.meal_type ?? "both",
      title,
      preferences: asStringArray(payload.preferences),
      notes: payload.notes ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const meals = Array.isArray(payload.meals) ? payload.meals : [];
  if (meals.length > 0) {
    const rows = meals.map((meal: any, index: number) => ({
      family_id: body.family_id,
      meal_plan_id: plan.id,
      day_label: meal.day_label ?? null,
      meal_slot: meal.meal_slot ?? "dinner",
      title: meal.title ?? `Meal ${index + 1}`,
      description: meal.description ?? null,
      sort_order: index + 1,
    }));

    const { error: mealsError } = await adminClient.from("meal_plan_items").insert(rows);
    if (mealsError) throw new Error(`Meal plan created, but meal items failed: ${mealsError.message}`);
  }

  const shopping = Array.isArray(payload.shopping_items) ? payload.shopping_items : [];
  if (shopping.length > 0) {
    const rows = shopping.map((item: any, index: number) => ({
      family_id: body.family_id,
      meal_plan_id: plan.id,
      name: item.name ?? `Item ${index + 1}`,
      quantity: item.quantity ?? null,
      category: item.category ?? null,
      sort_order: index + 1,
    }));

    const { error: shoppingError } = await adminClient.from("shopping_list_items").insert(rows);
    if (shoppingError) throw new Error(`Meal plan created, but shopping items failed: ${shoppingError.message}`);
  }

  return { table: "meal_plans", id: plan.id };
}

async function commitRouteReview(adminClient: any, body: Body, action: CopilotAction, actorRole: RoleRow) {
  const payload = action.payload ?? {};

  if (!payload.question) throw new Error("route_review.question is required");

  const { data, error } = await adminClient
    .from("ai_route_reviews")
    .insert({
      family_id: body.family_id,
      created_by: actorRole.member_id,
      source_session_id: body.session_id ?? null,
      review_date: payload.date ?? null,
      focus: payload.focus ?? "general",
      question: payload.question,
      analysis: payload.analysis ?? action.preview ?? "AI route review",
      risk_level: payload.risk_level ?? "normal",
      recommendations: asStringArray(payload.recommendations),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return { table: "ai_route_reviews", id: data.id };
}

async function commitAction(adminClient: any, body: Body, action: CopilotAction, actorRole: RoleRow) {
  if (action.type === "calendar_event") return commitCalendarEvent(adminClient, body, action);
  if (action.type === "homework_task") return commitHomeworkTask(adminClient, body, action);
  if (action.type === "payment") return commitPayment(adminClient, body, action);
  if (action.type === "request") return commitRequest(adminClient, body, action, actorRole);
  if (action.type === "notebook_note") return commitNotebookNote(adminClient, body, action, actorRole);
  if (action.type === "meal_plan") return commitMealPlan(adminClient, body, action, actorRole);
  if (action.type === "route_review") return commitRouteReview(adminClient, body, action, actorRole);

  return {
    table: null,
    id: null,
    skipped: true,
    reason: `${action.type} is not committed by this version.`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const body = (await req.json()) as Body;
    if (!body.family_id) return jsonResponse({ error: "family_id is required" }, 400);
    if (!Array.isArray(body.actions)) return jsonResponse({ error: "actions must be an array" }, 400);

    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const actorRole = await getActorRole(adminClient, body.family_id, user.id);
    if (!["parent", "guardian"].includes(actorRole.role)) {
      return jsonResponse({ error: "Only parent/guardian can commit AI actions." }, 403);
    }

    const results = [];

    for (const action of body.actions) {
      try {
        const target = await commitAction(adminClient, body, action, actorRole);

        await logAction(adminClient, {
          familyId: body.family_id,
          sessionId: body.session_id,
          action,
          status: target.skipped ? "skipped" : "committed",
          targetTable: target.table,
          targetId: target.id,
          errorMessage: target.skipped ? target.reason : null,
        });

        results.push({
          ok: !target.skipped,
          skipped: Boolean(target.skipped),
          action_id: action.id,
          action_type: action.type,
          target_table: target.table,
          target_id: target.id,
          message: target.reason ?? "Committed",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        await logAction(adminClient, {
          familyId: body.family_id,
          sessionId: body.session_id,
          action,
          status: "failed",
          errorMessage: message,
        });

        results.push({
          ok: false,
          action_id: action.id,
          action_type: action.type,
          error: message,
        });
      }
    }

    if (body.session_id) {
      const hasFailure = results.some((result) => !result.ok && !result.skipped);
      await adminClient
        .from("ai_copilot_sessions")
        .update({
          status: hasFailure ? "failed" : "committed",
          committed_at: new Date().toISOString(),
          error_message: hasFailure ? "Some actions failed." : null,
        })
        .eq("family_id", body.family_id)
        .eq("id", body.session_id);
    }

    return jsonResponse({
      ok: true,
      committed: results.filter((result) => result.ok).length,
      skipped: results.filter((result) => result.skipped).length,
      failed: results.filter((result) => !result.ok && !result.skipped).length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
