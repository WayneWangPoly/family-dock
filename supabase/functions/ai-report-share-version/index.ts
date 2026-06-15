import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id: string;
  summary_id: string;
  audience: "parent" | "teacher" | "coach" | "meeting" | "email" | "custom";
  language: "zh" | "en" | "bilingual";
  custom_instruction?: string | null;
  save?: boolean;
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

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function compact(value: unknown, max = 26000) {
  const text = JSON.stringify(value ?? {});
  if (text.length <= max) return text;
  return text.slice(0, max) + "...[truncated]";
}

async function loadSummary(adminClient: any, familyId: string, summaryId: string) {
  const { data, error } = await adminClient
    .from("learning_progress_summaries")
    .select("*")
    .eq("family_id", familyId)
    .eq("id", summaryId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Progress summary not found.");

  return data;
}

async function loadChild(adminClient: any, familyId: string, childId: string | null) {
  if (!childId) return null;

  const { data, error } = await adminClient
    .from("family_members")
    .select("id, display_name, role")
    .eq("family_id", familyId)
    .eq("id", childId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

function languageInstruction(language: string) {
  if (language === "en") return "Write in professional Australian English.";
  if (language === "bilingual") return "Write in bilingual format. Use Chinese first, then concise English sections or bullets where useful.";
  return "Write in professional Chinese.";
}

function audienceInstruction(audience: string) {
  if (audience === "teacher") {
    return `
Create a concise teacher-facing version.
Purpose: send to a school teacher or tutor.
Include: observable progress, concerns to monitor, classroom/tutoring questions, next learning goals.
Avoid: private family logistics, payment details, overly personal family commentary, diagnosis, or unsupported claims.
Tone: respectful, collaborative, concise.
`;
  }

  if (audience === "coach") {
    return `
Create a concise coach-facing version.
Purpose: send to a sports/music/activity coach.
Include: observed performance patterns, stamina/focus/technique notes if supported, questions for the coach, next practice goals.
Avoid: diagnosis, unsupported conclusions, private family logistics, or too much background.
Tone: practical and coach-friendly.
`;
  }

  if (audience === "meeting") {
    return `
Create a parent meeting preparation version.
Purpose: help parent prepare for a meeting with teacher/coach.
Include: key talking points, questions to ask, evidence-based concerns, desired outcomes, and next actions.
Tone: clear, structured, action-oriented.
`;
  }

  if (audience === "email") {
    return `
Create an email-ready version.
Purpose: parent can paste it directly into an email to a teacher/coach.
Include: subject line, polite opening, concise body, questions, and closing.
Avoid: sensitive private details unless directly relevant.
`;
  }

  if (audience === "parent") {
    return `
Create a parent full version.
Purpose: internal family review and planning.
Include: fuller details, parent actions, child actions, missing evidence, and next goals.
Tone: professional but supportive.
`;
  }

  return `
Create a custom share version according to the custom instruction.
If instruction is missing, produce a concise external sharing version.
`;
}

function buildPrompt(body: Body) {
  return `
You are converting a professional child progress summary into a shareable report version.

${languageInstruction(body.language)}

${audienceInstruction(body.audience)}

Return ONLY valid JSON with this shape:
{
  "title": string,
  "content_markdown": string,
  "email_subject": string | null,
  "email_body": string | null,
  "key_points": string[],
  "questions": string[],
  "action_items": string[],
  "privacy_notes": string[]
}

Rules:
- Do not invent new evidence.
- Keep source summary meaning intact.
- Remove or soften private/internal details for teacher/coach/email versions.
- Keep it practical and usable.
- For meeting version, focus on agenda and questions.
- For email version, write an email body ready to paste.
- Do not include raw JSON in content_markdown.
- Avoid medical/psychological diagnosis.
`;
}

async function callOpenAI(args: {
  body: Body;
  summary: unknown;
  child: unknown;
}) {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = getOptionalEnv("AI_REPORT_MODEL") || getOptionalEnv("AI_PROGRESS_MODEL") || getOptionalEnv("AI_COPILOT_MODEL") || "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.18,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildPrompt(args.body) },
        {
          role: "user",
          content: [
            `Audience: ${args.body.audience}`,
            `Language: ${args.body.language}`,
            args.body.custom_instruction ? `Custom instruction: ${args.body.custom_instruction}` : "",
            `Child/member JSON: ${compact(args.child, 3000)}`,
            `Source professional summary JSON: ${compact(args.summary, 26000)}`,
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
    if (!body.summary_id) return jsonResponse({ error: "summary_id is required" }, 400);
    if (!body.audience) return jsonResponse({ error: "audience is required" }, 400);
    if (!body.language) return jsonResponse({ error: "language is required" }, 400);

    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const actorRole = await getActorRole(adminClient, body.family_id, user.id);
    if (!["parent", "guardian"].includes(actorRole.role)) {
      return jsonResponse({ error: "Only parent/guardian can generate share versions." }, 403);
    }

    const summary = await loadSummary(adminClient, body.family_id, body.summary_id);
    const child = await loadChild(adminClient, body.family_id, summary.child_id);

    const ai = await callOpenAI({ body, summary, child });

    const row = {
      family_id: body.family_id,
      summary_id: body.summary_id,
      child_id: summary.child_id,
      created_by: actorRole.member_id,
      audience: body.audience,
      language: body.language,
      title: ai.title ?? `${summary.title} - share version`,
      content_markdown: ai.content_markdown ?? "",
      email_subject: ai.email_subject ?? null,
      email_body: ai.email_body ?? null,
      key_points: asStringArray(ai.key_points),
      questions: asStringArray(ai.questions),
      action_items: asStringArray(ai.action_items),
      privacy_notes: asStringArray(ai.privacy_notes),
      status: "draft",
    };

    if (body.save === false) {
      return jsonResponse({
        ok: true,
        saved: false,
        share: row,
      });
    }

    const { data: saved, error: saveError } = await adminClient
      .from("progress_report_shares")
      .insert(row)
      .select("*")
      .single();

    if (saveError) throw new Error(saveError.message);

    return jsonResponse({
      ok: true,
      saved: true,
      share: saved,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
