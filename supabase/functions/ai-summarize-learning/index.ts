import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { openAILearningSummaryResponseFormat } from "../_shared/learning-summary-schema.ts";

type SummarizeLearningBody = {
  family_id: string;
  child_id?: string | null;
  child_name?: string | null;
  course_name?: string | null;
  range_type: "week" | "month" | "term" | "year" | "custom";
  start_date: string;
  end_date: string;
  save_summary?: boolean;
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

function extractOpenAIText(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text;

  const parts: string[] = [];
  for (const output of data?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        parts.push(content.text);
      }
      if (content?.type === "text" && typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch (_err) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1));
    throw new Error("AI response was not valid JSON.");
  }
}

function normalizeDate(value: string): string {
  return value.slice(0, 10);
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

async function resolveChildId(adminClient: any, familyId: string, body: SummarizeLearningBody): Promise<string | null> {
  if (body.child_id) return body.child_id;
  if (!body.child_name) return null;

  const { data, error } = await adminClient
    .from("family_members")
    .select("id")
    .eq("family_id", familyId)
    .ilike("display_name", body.child_name)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

function buildSystemPrompt() {
  return `
You are the Family Dock learning analysis engine.

Your job:
- Analyze a child's learning records, homework, and activity history.
- Produce a practical parent-facing summary.
- Do not make unsupported claims.
- Every important point must reference evidence IDs where possible.
- Focus on repeated patterns, progress, bottlenecks, next steps, and what parents should observe.
- Avoid generic advice like "keep working hard".
- Be concrete and actionable.
- The parent may use this before exams, competitions, parent-teacher meetings, or coaching conversations.

Output must strictly follow the JSON schema.
`.trim();
}

function buildEvidencePayload(args: {
  family: any;
  child: any;
  body: SummarizeLearningBody;
  learningRecords: any[];
  homeworkTasks: any[];
  homeworkItems: any[];
  calendarEvents: any[];
}) {
  const homeworkItemsByTaskId = new Map<string, any[]>();
  for (const item of args.homeworkItems) {
    const list = homeworkItemsByTaskId.get(item.homework_task_id) ?? [];
    list.push(item);
    homeworkItemsByTaskId.set(item.homework_task_id, list);
  }

  return {
    task: {
      range_type: args.body.range_type,
      start_date: args.body.start_date,
      end_date: args.body.end_date,
      course_name: args.body.course_name ?? null,
      child_name: args.child?.display_name ?? args.body.child_name ?? null,
    },
    family: {
      timezone: args.family?.timezone ?? "Australia/Adelaide",
      state_region: args.family?.state_region ?? null,
      school_level: args.family?.school_level ?? null,
    },
    evidence: {
      learning_records: args.learningRecords.map((record) => ({
        id: record.id,
        source_type: "learning_record",
        date: record.lesson_date,
        course_name: record.course_name,
        lesson_title: record.lesson_title,
        child_comment: record.child_comment,
        parent_comment: record.parent_comment,
        teacher_feedback: record.teacher_feedback,
        summary: record.summary,
        strengths: record.strengths,
        issues: record.issues,
        next_steps: record.next_steps,
        expectations: record.expectations,
        tags: record.tags,
      })),
      homework_tasks: args.homeworkTasks.map((task) => ({
        id: task.id,
        source_type: "homework_task",
        title: task.title,
        due_at: task.due_at,
        status: task.status,
        items: (homeworkItemsByTaskId.get(task.id) ?? []).map((item) => ({
          id: item.id,
          label: item.label,
          item_type: item.item_type,
          is_required: item.is_required,
          is_done: item.is_done,
          completed_at: item.completed_at,
        })),
      })),
      calendar_events: args.calendarEvents.map((event) => ({
        id: event.id,
        source_type: "calendar_event",
        title: event.title,
        event_type: event.event_type,
        start_at: event.start_at,
        teacher_name: event.teacher_name,
        status: event.status,
      })),
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const body = (await req.json()) as SummarizeLearningBody;

    if (!body.family_id) return jsonResponse({ error: "family_id is required" }, 400);
    if (!body.start_date || !body.end_date) return jsonResponse({ error: "start_date and end_date are required" }, 400);
    if (!body.range_type) return jsonResponse({ error: "range_type is required" }, 400);

    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const roleRow = await getActorRole(adminClient, body.family_id, user.id);

    if (!["parent", "guardian"].includes(roleRow.role)) {
      return jsonResponse({ error: "Only parent/guardian can summarize learning in v1" }, 403);
    }

    const childId = await resolveChildId(adminClient, body.family_id, body);

    const { data: family, error: familyError } = await adminClient
      .from("families")
      .select("*")
      .eq("id", body.family_id)
      .maybeSingle();

    if (familyError) throw new Error(familyError.message);

    let child = null;
    if (childId) {
      const { data: childRow, error: childError } = await adminClient
        .from("family_members")
        .select("*")
        .eq("family_id", body.family_id)
        .eq("id", childId)
        .maybeSingle();

      if (childError) throw new Error(childError.message);
      child = childRow;
    }

    let lrQuery = adminClient
      .from("learning_records")
      .select("*")
      .eq("family_id", body.family_id)
      .gte("lesson_date", normalizeDate(body.start_date))
      .lte("lesson_date", normalizeDate(body.end_date))
      .order("lesson_date", { ascending: true });

    if (childId) lrQuery = lrQuery.eq("child_id", childId);
    if (body.course_name) lrQuery = lrQuery.ilike("course_name", body.course_name);

    const { data: learningRecords, error: lrError } = await lrQuery;
    if (lrError) throw new Error(lrError.message);

    let hwQuery = adminClient
      .from("homework_tasks")
      .select("*")
      .eq("family_id", body.family_id)
      .gte("created_at", `${normalizeDate(body.start_date)}T00:00:00Z`)
      .lte("created_at", `${normalizeDate(body.end_date)}T23:59:59Z`)
      .order("created_at", { ascending: true });

    if (childId) hwQuery = hwQuery.eq("child_id", childId);

    const { data: homeworkTasks, error: hwError } = await hwQuery;
    if (hwError) throw new Error(hwError.message);

    const homeworkTaskIds = (homeworkTasks ?? []).map((task: any) => task.id);
    let homeworkItems: any[] = [];

    if (homeworkTaskIds.length > 0) {
      const { data: items, error: itemError } = await adminClient
        .from("homework_items")
        .select("*")
        .eq("family_id", body.family_id)
        .in("homework_task_id", homeworkTaskIds)
        .order("sort_order", { ascending: true });

      if (itemError) throw new Error(itemError.message);
      homeworkItems = items ?? [];
    }

    let eventQuery = adminClient
      .from("calendar_events")
      .select("*")
      .eq("family_id", body.family_id)
      .gte("start_at", `${normalizeDate(body.start_date)}T00:00:00Z`)
      .lte("start_at", `${normalizeDate(body.end_date)}T23:59:59Z`)
      .order("start_at", { ascending: true });

    if (childId) eventQuery = eventQuery.eq("child_id", childId);

    const { data: calendarEvents, error: eventError } = await eventQuery;
    if (eventError) throw new Error(eventError.message);

    const evidenceCount =
      (learningRecords?.length ?? 0) +
      (homeworkTasks?.length ?? 0) +
      homeworkItems.length +
      (calendarEvents?.length ?? 0);

    if (evidenceCount === 0) {
      return jsonResponse({
        ok: false,
        error: "No learning evidence found for this range.",
        evidence_count: 0,
      }, 404);
    }

    const openAIModel = Deno.env.get("OPENAI_SUMMARY_MODEL") || "gpt-4.1";
    const openAIKey = requireEnv("OPENAI_API_KEY");

    const payload = buildEvidencePayload({
      family,
      child,
      body,
      learningRecords: learningRecords ?? [],
      homeworkTasks: homeworkTasks ?? [],
      homeworkItems,
      calendarEvents: calendarEvents ?? [],
    });

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openAIModel,
        input: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: JSON.stringify(payload, null, 2) },
        ],
        text: {
          format: openAILearningSummaryResponseFormat,
        },
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      return jsonResponse({
        error: "OpenAI learning summary request failed",
        status: openAIResponse.status,
        detail: errorText,
      }, 502);
    }

    const openAIData = await openAIResponse.json();
    const parsed = safeJsonParse(extractOpenAIText(openAIData));

    let savedSummary = null;

    if (body.save_summary !== false) {
      const { data: inserted, error: insertError } = await adminClient
        .from("learning_summaries")
        .insert({
          family_id: body.family_id,
          child_id: childId,
          course_name: body.course_name ?? null,
          range_type: body.range_type,
          start_date: normalizeDate(body.start_date),
          end_date: normalizeDate(body.end_date),
          summary_title: parsed.summary_title,
          evidence_count: parsed.evidence_count ?? evidenceCount,
          overall_summary: parsed.overall_summary,
          progress: parsed.progress ?? [],
          recurring_issues: parsed.recurring_issues ?? [],
          current_bottleneck: parsed.current_bottleneck ?? null,
          next_steps: parsed.next_steps ?? [],
          parent_focus_points: parsed.parent_focus_points ?? [],
          questions_for_teacher: parsed.questions_for_teacher ?? [],
          evidence_refs: parsed.evidence_refs ?? [],
          ai_model: openAIModel,
          created_by: roleRow.member_id,
        })
        .select("*")
        .single();

      if (insertError) throw new Error(insertError.message);
      savedSummary = inserted;
    }

    return jsonResponse({
      ok: true,
      parsed,
      saved_summary: savedSummary,
      evidence_count: evidenceCount,
      model: openAIModel,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
