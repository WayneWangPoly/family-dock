import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  assertRequired,
  CommitActionsBody,
  compactObject,
  defaultEndTime,
  localDateTimeToIso,
  normalizeDate,
  ParsedAction,
} from "../_shared/commit-action-types.ts";

type RoleRow = {
  member_id: string | null;
  role: string;
};

type CommitResult = {
  client_action_id?: string | null;
  type: string;
  table: string;
  id: string;
  action_log_id: string;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getSupabaseAdminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function getSupabaseUserClient(authHeader: string) {
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

async function findMemberId(adminClient: any, familyId: string, name?: string | null): Promise<string | null> {
  if (!name) return null;

  const { data, error } = await adminClient
    .from("family_members")
    .select("id, display_name")
    .eq("family_id", familyId)
    .ilike("display_name", name)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

async function findOrCreatePlace(adminClient: any, familyId: string, name?: string | null, actorMemberId?: string | null): Promise<string | null> {
  if (!name) return null;

  const cleanName = name.trim();
  if (!cleanName) return null;

  const { data: existing, error: existingError } = await adminClient
    .from("places")
    .select("id")
    .eq("family_id", familyId)
    .ilike("name", cleanName)
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await adminClient
    .from("places")
    .insert({
      family_id: familyId,
      name: cleanName,
      place_type: "other",
      created_by: actorMemberId ?? null,
    })
    .select("id")
    .single();

  if (createError) throw new Error(createError.message);
  return created.id;
}

async function insertActionLog(adminClient: any, args: {
  familyId: string;
  actorMemberId: string | null;
  actionType: string;
  targetTable: string;
  targetId: string;
  beforeData?: unknown;
  afterData?: unknown;
}) {
  const { data, error } = await adminClient
    .from("action_logs")
    .insert({
      family_id: args.familyId,
      actor_id: args.actorMemberId,
      action_type: args.actionType,
      target_table: args.targetTable,
      target_id: args.targetId,
      before_data: args.beforeData ?? null,
      after_data: args.afterData ?? null,
      can_undo: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

async function commitCalendarEvent(adminClient: any, familyId: string, action: ParsedAction, actorMemberId: string | null): Promise<CommitResult> {
  assertRequired(action.title, "calendar title");

  const childId = await findMemberId(adminClient, familyId, action.child_name);
  const placeId = await findOrCreatePlace(adminClient, familyId, action.place_name, actorMemberId);

  const timezone = action.timezone ?? "Australia/Adelaide";
  const startAt = localDateTimeToIso(action.start_date, action.start_time, timezone);
  if (!startAt) throw new Error("calendar start_date is required");

  const endTime = action.end_time ?? defaultEndTime(action.start_time);
  const endAt = action.end_date
    ? localDateTimeToIso(action.end_date, endTime, timezone)
    : localDateTimeToIso(action.start_date, endTime, timezone);

  const payload = compactObject({
    family_id: familyId,
    child_id: childId,
    title: action.title,
    event_type: action.event_type ?? "course",
    start_at: startAt,
    end_at: endAt,
    place_id: placeId,
    teacher_name: action.teacher_name ?? null,
    recurrence_rule: action.recurrence_rule ?? null,
    source: "ai",
    status: "scheduled",
    created_by: actorMemberId,
  });

  const { data, error } = await adminClient.from("calendar_events").insert(payload).select("*").single();
  if (error) throw new Error(error.message);

  const actionLogId = await insertActionLog(adminClient, {
    familyId,
    actorMemberId,
    actionType: "create_calendar_event",
    targetTable: "calendar_events",
    targetId: data.id,
    afterData: data,
  });

  return { client_action_id: action.client_action_id ?? null, type: action.type, table: "calendar_events", id: data.id, action_log_id: actionLogId };
}

async function commitHomeworkTask(adminClient: any, familyId: string, action: ParsedAction, actorMemberId: string | null): Promise<CommitResult> {
  assertRequired(action.title, "homework title");

  const childId = await findMemberId(adminClient, familyId, action.child_name);
  const timezone = action.timezone ?? "Australia/Adelaide";
  const dueAt = action.due_date ? localDateTimeToIso(action.due_date, action.start_time ?? "20:00", timezone) : null;

  const { data: task, error: taskError } = await adminClient
    .from("homework_tasks")
    .insert({
      family_id: familyId,
      child_id: childId,
      title: action.title,
      due_at: dueAt,
      status: "not_started",
      source: "ai",
      created_by: actorMemberId,
    })
    .select("*")
    .single();

  if (taskError) throw new Error(taskError.message);

  const items = action.homework_items?.length
    ? action.homework_items
    : [
        { label: "孩子确认", item_type: "checkbox", is_required: true },
        { label: "提交材料", item_type: "photo_upload", is_required: true },
        { label: "家长确认", item_type: "parent_approval", is_required: true },
      ];

  const itemPayload = items.map((item, index) => ({
    homework_task_id: task.id,
    family_id: familyId,
    label: item.label,
    item_type: item.item_type,
    is_required: item.is_required ?? true,
    is_done: false,
    sort_order: index + 1,
  }));

  const { data: insertedItems, error: itemError } = await adminClient.from("homework_items").insert(itemPayload).select("*");
  if (itemError) throw new Error(itemError.message);

  const actionLogId = await insertActionLog(adminClient, {
    familyId,
    actorMemberId,
    actionType: "create_homework_task",
    targetTable: "homework_tasks",
    targetId: task.id,
    afterData: { task, items: insertedItems },
  });

  return { client_action_id: action.client_action_id ?? null, type: action.type, table: "homework_tasks", id: task.id, action_log_id: actionLogId };
}

async function commitRequest(adminClient: any, familyId: string, action: ParsedAction, actorMemberId: string | null): Promise<CommitResult> {
  assertRequired(action.title, "request title");
  const requesterId = await findMemberId(adminClient, familyId, action.child_name) ?? actorMemberId;

  const { data, error } = await adminClient
    .from("requests")
    .insert({
      family_id: familyId,
      requester_id: requesterId,
      request_type: action.request_type ?? "other",
      title: action.title,
      detail: action.detail ?? action.raw_note ?? null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const actionLogId = await insertActionLog(adminClient, {
    familyId,
    actorMemberId,
    actionType: "create_request",
    targetTable: "requests",
    targetId: data.id,
    afterData: data,
  });

  return { client_action_id: action.client_action_id ?? null, type: action.type, table: "requests", id: data.id, action_log_id: actionLogId };
}

async function commitPayment(adminClient: any, familyId: string, action: ParsedAction, actorMemberId: string | null): Promise<CommitResult> {
  assertRequired(action.title, "payment title");
  if (typeof action.amount !== "number") throw new Error("payment amount is required");

  const childId = await findMemberId(adminClient, familyId, action.child_name);

  const { data, error } = await adminClient
    .from("payments")
    .insert({
      family_id: familyId,
      child_id: childId,
      title: action.title,
      category: "AI",
      project: action.course_name ?? action.title,
      amount: action.amount,
      currency: action.currency ?? "AUD",
      due_date: normalizeDate(action.due_date),
      pay_to: action.pay_to ?? null,
      reference: action.reference ?? null,
      status: "unpaid",
      created_by: actorMemberId,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const actionLogId = await insertActionLog(adminClient, {
    familyId,
    actorMemberId,
    actionType: "create_payment",
    targetTable: "payments",
    targetId: data.id,
    afterData: data,
  });

  return { client_action_id: action.client_action_id ?? null, type: action.type, table: "payments", id: data.id, action_log_id: actionLogId };
}

async function commitMealOrRecipe(adminClient: any, familyId: string, action: ParsedAction, actorMemberId: string | null): Promise<CommitResult> {
  assertRequired(action.title, "meal title");

  const weekStart = normalizeDate(action.start_date) ?? new Date().toISOString().slice(0, 10);

  const { data: meal, error: mealError } = await adminClient
    .from("meal_plans")
    .insert({
      family_id: familyId,
      week_start: weekStart,
      day_of_week: 1,
      meal_type: action.meal_type ?? "dinner",
      title: action.title,
      notes: action.detail ?? action.raw_note ?? null,
      tags: ["ai"],
      created_by: actorMemberId,
    })
    .select("*")
    .single();

  if (mealError) throw new Error(mealError.message);

  const ingredients = action.ingredients ?? [];
  let shoppingItems: unknown[] = [];

  if (ingredients.length > 0) {
    const itemPayload = ingredients.map((item) => ({
      family_id: familyId,
      week_start: weekStart,
      name: item.name,
      quantity: item.quantity ?? null,
      category: item.category ?? null,
      status: "not_bought",
      source_meal_plan_id: meal.id,
      created_by: actorMemberId,
    }));

    const { data: inserted, error: shoppingError } = await adminClient.from("shopping_items").insert(itemPayload).select("*");
    if (shoppingError) throw new Error(shoppingError.message);
    shoppingItems = inserted ?? [];
  }

  const actionLogId = await insertActionLog(adminClient, {
    familyId,
    actorMemberId,
    actionType: "create_meal_or_recipe",
    targetTable: "meal_plans",
    targetId: meal.id,
    afterData: { meal, shopping_items: shoppingItems },
  });

  return { client_action_id: action.client_action_id ?? null, type: action.type, table: "meal_plans", id: meal.id, action_log_id: actionLogId };
}

async function commitLearningRecord(adminClient: any, familyId: string, action: ParsedAction, actorMemberId: string | null): Promise<CommitResult> {
  const childId = await findMemberId(adminClient, familyId, action.child_name);
  const lessonDate = normalizeDate(action.start_date) ?? new Date().toISOString().slice(0, 10);
  const title = action.lesson_title ?? action.title ?? action.course_name ?? "课后点评";

  const { data, error } = await adminClient
    .from("learning_records")
    .insert({
      family_id: familyId,
      child_id: childId,
      course_name: action.course_name ?? action.place_name ?? action.title ?? null,
      lesson_title: title,
      lesson_date: lessonDate,
      child_comment: action.child_comment ?? null,
      parent_comment: action.parent_comment ?? action.raw_note ?? action.detail ?? null,
      teacher_feedback: action.teacher_feedback ?? null,
      summary: action.detail ?? action.raw_note ?? null,
      strengths: action.strengths ?? [],
      issues: action.issues ?? [],
      next_steps: action.next_steps ?? [],
      expectations: action.expectations ?? [],
      tags: ["ai"],
      source: "ai",
      created_by: actorMemberId,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const actionLogId = await insertActionLog(adminClient, {
    familyId,
    actorMemberId,
    actionType: "create_learning_record",
    targetTable: "learning_records",
    targetId: data.id,
    afterData: data,
  });

  return { client_action_id: action.client_action_id ?? null, type: action.type, table: "learning_records", id: data.id, action_log_id: actionLogId };
}

async function commitOneAction(adminClient: any, familyId: string, action: ParsedAction, actorMemberId: string | null): Promise<CommitResult> {
  switch (action.type) {
    case "create_calendar_event": return await commitCalendarEvent(adminClient, familyId, action, actorMemberId);
    case "create_homework_task": return await commitHomeworkTask(adminClient, familyId, action, actorMemberId);
    case "create_request": return await commitRequest(adminClient, familyId, action, actorMemberId);
    case "create_payment": return await commitPayment(adminClient, familyId, action, actorMemberId);
    case "create_meal_or_recipe": return await commitMealOrRecipe(adminClient, familyId, action, actorMemberId);
    case "create_learning_record": return await commitLearningRecord(adminClient, familyId, action, actorMemberId);
    default: throw new Error(`Unsupported action type: ${(action as any).type}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const body = (await req.json()) as CommitActionsBody;
    if (!body.family_id) return jsonResponse({ error: "family_id is required" }, 400);
    if (!body.confirmed) return jsonResponse({ error: "confirmed=true is required" }, 400);
    if (!Array.isArray(body.actions) || body.actions.length === 0) return jsonResponse({ error: "actions array is required" }, 400);

    const adminClient = getSupabaseAdminClient();
    const userClient = getSupabaseUserClient(authHeader);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const roleRow = await getActorRole(adminClient, body.family_id, user.id);
    if (!["parent", "guardian"].includes(roleRow.role)) return jsonResponse({ error: "Only parent/guardian can commit AI actions in v1" }, 403);

    const committed: CommitResult[] = [];
    for (const action of body.actions) {
      committed.push(await commitOneAction(adminClient, body.family_id, action, roleRow.member_id));
    }

    if (body.ai_interaction_id) {
      const { error: aiUpdateError } = await adminClient
        .from("ai_interactions")
        .update({ confirmed: true })
        .eq("id", body.ai_interaction_id)
        .eq("family_id", body.family_id);

      if (aiUpdateError) throw new Error(aiUpdateError.message);
    }

    return jsonResponse({ ok: true, committed, count: committed.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
