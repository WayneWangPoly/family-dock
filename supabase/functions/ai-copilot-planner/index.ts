import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id: string;
  active_page?: string | null;
  command: string;
  extra_detail?: string | null;
  previous_plan?: unknown;
  context?: unknown;
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

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);

  const match = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/i);
  if (match?.[1]) return JSON.parse(match[1]);

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));

  throw new Error("AI did not return valid JSON.");
}

function compact(value: unknown, max = 14000) {
  const text = JSON.stringify(value ?? {});
  if (text.length <= max) return text;
  return text.slice(0, max) + "...[truncated]";
}

function buildSystemPrompt() {
  return `
You are the AI Copilot planner for a mobile-first family coordination app called Family Dock.

The user may speak Chinese, English, or mixed language. Understand natural family commands.

Your task is to convert the user's command into a safe, reviewable JSON plan. Do NOT commit data. Only plan.

Supported action types:
- calendar_event
- homework_task
- payment
- request
- notebook_note
- meal_plan
- route_review
- query_answer

Return ONLY valid JSON with this shape:
{
  "language": "zh" | "en" | "mixed",
  "intent_summary": string,
  "confidence": number,
  "needs_more_info": boolean,
  "questions": string[],
  "actions": [
    {
      "id": string,
      "type": one of supported action types,
      "title": string,
      "preview": string,
      "confidence": number,
      "missing_fields": string[],
      "payload": object
    }
  ],
  "answer": string | null,
  "safety_notes": string[]
}

Payload guidelines:
calendar_event payload:
{
  "title": string,
  "child_name": string | null,
  "place_name": string | null,
  "event_type": "school" | "course" | "family" | "exam" | "pupil_free_day" | "meeting" | "other",
  "start_at": ISO string or null,
  "end_at": ISO string or null,
  "teacher_name": string | null,
  "note": string | null
}

homework_task payload:
{
  "title": string,
  "child_name": string | null,
  "due_at": ISO string or null,
  "items": [{"label": string, "item_type": "reading" | "writing" | "practice" | "upload" | "other"}],
  "note": string | null
}

payment payload:
{
  "title": string,
  "child_name": string | null,
  "amount": number | null,
  "currency": "AUD",
  "due_date": "YYYY-MM-DD" or null,
  "pay_to": string | null,
  "reference": string | null,
  "note": string | null
}

request payload:
{
  "requester_name": string | null,
  "request_type": "food" | "outing" | "help" | "schedule" | "other",
  "title": string,
  "detail": string | null
}

notebook_note payload:
{
  "child_name": string | null,
  "subject": string | null,
  "title": string,
  "content": string,
  "tags": string[],
  "note_date": "YYYY-MM-DD" or null,
  "note_type": "lesson" | "parent_comment" | "child_reflection" | "teacher_feedback" | "ai_summary" | "general"
}

meal_plan payload:
{
  "week_start": "YYYY-MM-DD" or null,
  "meal_type": "dinner" | "lunchbox" | "both",
  "title": string | null,
  "preferences": string[],
  "notes": string | null,
  "meals": [
    {"day_label": string | null, "meal_slot": "breakfast" | "lunchbox" | "lunch" | "dinner" | "snack" | "other", "title": string, "description": string | null}
  ],
  "shopping_items": [{"name": string, "quantity": string | null, "category": string | null}]
}

route_review payload:
{
  "date": "YYYY-MM-DD" or null,
  "question": string,
  "focus": "conflict" | "travel_time" | "order" | "next_stop" | "general",
  "analysis": string,
  "risk_level": "low" | "normal" | "medium" | "high",
  "recommendations": string[]
}

query_answer payload:
{
  "question": string,
  "answer": string
}

Rules:
- Use current family context for member/place name matching, but if uncertain add missing_fields/questions.
- If date/time is vague, infer from the current date only when safe. Otherwise ask.
- If no child/member is mentioned and the action needs one, set child_name null and add missing_fields.
- If place is needed for route/calendar but missing, add missing_fields.
- Never invent exact addresses, payment amounts, or teacher names.
- For route_review, use provided route/calendar context and give practical recommendations.
- For meal_plan, include practical child-friendly meals and a usable shopping list.
- For notebook_note, preserve concrete observations and improvement directions.
- For query_answer, answer using only provided context. If context is insufficient, say what is missing.
`;
}

async function callOpenAI(args: {
  command: string;
  extraDetail?: string | null;
  previousPlan?: unknown;
  context?: unknown;
}) {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = getOptionalEnv("AI_COPILOT_MODEL") || "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: [
            `User command: ${args.command}`,
            args.extraDetail ? `Additional detail: ${args.extraDetail}` : "",
            args.previousPlan ? `Previous plan: ${compact(args.previousPlan, 9000)}` : "",
            `Family context JSON: ${compact(args.context, 22000)}`,
          ].filter(Boolean).join("\n\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${text}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content.");

  return extractJson(content);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const body = (await req.json()) as Body;
    if (!body.family_id) return jsonResponse({ error: "family_id is required" }, 400);
    if (!body.command?.trim()) return jsonResponse({ error: "command is required" }, 400);

    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const actorRole = await getActorRole(adminClient, body.family_id, user.id);

    const plan = await callOpenAI({
      command: body.command,
      extraDetail: body.extra_detail,
      previousPlan: body.previous_plan,
      context: body.context,
    });

    const { data: session, error: sessionError } = await adminClient
      .from("ai_copilot_sessions")
      .insert({
        family_id: body.family_id,
        auth_user_id: user.id,
        member_id: actorRole.member_id,
        active_page: body.active_page ?? null,
        raw_input: body.command,
        planner_response: plan,
        status: "planned",
      })
      .select("*")
      .single();

    if (sessionError) throw new Error(sessionError.message);

    return jsonResponse({
      ok: true,
      session_id: session.id,
      plan,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
