import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id: string;
  child_id: string;
  period_type: "week" | "month" | "term" | "custom";
  period_start: string;
  period_end: string;
  subject?: string | null;
  language?: "zh" | "en" | "bilingual";
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

function compact(value: unknown, max = 24000) {
  const text = JSON.stringify(value ?? {});
  if (text.length <= max) return text;
  return text.slice(0, max) + "...[truncated]";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function clampConfidence(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.min(Math.max(numeric, 0), 1);
}

async function loadChild(adminClient: any, familyId: string, childId: string) {
  const { data, error } = await adminClient
    .from("family_members")
    .select("id, display_name, role")
    .eq("family_id", familyId)
    .eq("id", childId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Child/member not found in this family.");

  return data;
}

async function loadEvidence(adminClient: any, body: Body) {
  const periodStart = `${body.period_start}T00:00:00`;
  const periodEnd = `${body.period_end}T23:59:59`;

  let notesQuery = adminClient
    .from("learning_notes")
    .select("id, child_id, subject, title, content, tags, note_date, note_type, created_at")
    .eq("family_id", body.family_id)
    .eq("child_id", body.child_id)
    .gte("note_date", body.period_start)
    .lte("note_date", body.period_end)
    .order("note_date", { ascending: true })
    .limit(120);

  if (body.subject?.trim()) {
    notesQuery = notesQuery.ilike("subject", `%${body.subject.trim()}%`);
  }

  const { data: notes, error: notesError } = await notesQuery;
  if (notesError) throw new Error(notesError.message);

  const { data: homework, error: homeworkError } = await adminClient
    .from("homework_tasks")
    .select("id, title, due_at, status, child_id, homework_items(id, label, item_type, is_done)")
    .eq("family_id", body.family_id)
    .eq("child_id", body.child_id)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd)
    .order("created_at", { ascending: true })
    .limit(80);

  if (homeworkError) throw new Error(homeworkError.message);

  const { data: events, error: eventsError } = await adminClient
    .from("calendar_events")
    .select("id, title, event_type, start_at, end_at, teacher_name, status, child_id")
    .eq("family_id", body.family_id)
    .eq("child_id", body.child_id)
    .gte("start_at", periodStart)
    .lte("start_at", periodEnd)
    .neq("status", "cancelled")
    .order("start_at", { ascending: true })
    .limit(120);

  if (eventsError) throw new Error(eventsError.message);

  return {
    notes: notes ?? [],
    homework: homework ?? [],
    events: events ?? [],
  };
}

function buildSystemPrompt(language: string) {
  const languageInstruction = language === "en"
    ? "Write the report in professional English."
    : language === "bilingual"
    ? "Write the report bilingually with Chinese first and concise English support where useful."
    : "Write the report in professional Chinese. Use clear parent-facing language; avoid vague motivational slogans.";

  return `
You are a professional child progress analyst for Family Dock.

You generate parent-facing progress reports from structured evidence:
- learning notes
- homework tasks and item completion
- calendar/course attendance records

${languageInstruction}

Return ONLY valid JSON with this shape:
{
  "title": string,
  "executive_summary": string,
  "narrative_text": string,
  "strengths": string[],
  "concerns": string[],
  "observed_patterns": string[],
  "recommendations": string[],
  "parent_actions": string[],
  "child_actions": string[],
  "teacher_questions": string[],
  "next_goals": string[],
  "missing_evidence": string[],
  "confidence": number,
  "evidence_count": number,
  "summary_json": {
    "progress_level": "strong" | "steady" | "mixed" | "needs_attention" | "insufficient_evidence",
    "learning_domains": object,
    "risk_flags": string[],
    "evidence_notes": string[]
  }
}

Professional standards:
- Be evidence-based. Do not invent achievements, diagnoses, causes, or teacher opinions.
- Distinguish facts, patterns, and recommendations.
- If evidence is thin, say so explicitly and reduce confidence.
- Use precise, actionable language: what improved, what is not stable, what to practise next.
- Recommendations should be realistic for busy parents.
- If the subject is sport/music/tutoring, adapt terminology appropriately but avoid overclaiming.
- Do not provide medical, psychological, or diagnostic conclusions.
- Do not shame the child. Keep tone constructive and specific.
`;
}

async function callOpenAI(args: {
  child: unknown;
  body: Body;
  evidence: unknown;
}) {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = getOptionalEnv("AI_PROGRESS_MODEL") || getOptionalEnv("AI_COPILOT_MODEL") || "gpt-4o-mini";

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
        { role: "system", content: buildSystemPrompt(args.body.language ?? "zh") },
        {
          role: "user",
          content: [
            `Child/member: ${compact(args.child, 3000)}`,
            `Period: ${args.body.period_type} from ${args.body.period_start} to ${args.body.period_end}`,
            args.body.subject ? `Subject focus: ${args.body.subject}` : "Subject focus: all available learning/activity evidence",
            `Evidence JSON: ${compact(args.evidence, 26000)}`,
          ].join("\n\n"),
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
    if (!body.child_id) return jsonResponse({ error: "child_id is required" }, 400);
    if (!body.period_start || !body.period_end) return jsonResponse({ error: "period_start and period_end are required" }, 400);

    const adminClient = getAdminClient();
    const userClient = getUserClient(authHeader);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const actorRole = await getActorRole(adminClient, body.family_id, user.id);
    if (!["parent", "guardian"].includes(actorRole.role)) {
      return jsonResponse({ error: "Only parent/guardian can generate progress summaries." }, 403);
    }

    const child = await loadChild(adminClient, body.family_id, body.child_id);
    const evidence = await loadEvidence(adminClient, body);

    const evidenceCount = evidence.notes.length + evidence.homework.length + evidence.events.length;
    if (evidenceCount === 0) {
      return jsonResponse({
        ok: false,
        error: "No evidence found for this child/member and period. Add learning notes, homework, or events first.",
        evidence_count: 0,
      }, 400);
    }

    const ai = await callOpenAI({ child, body, evidence });

    const sourceNoteIds = evidence.notes.map((row: any) => row.id);
    const sourceHomeworkIds = evidence.homework.map((row: any) => row.id);
    const sourceEventIds = evidence.events.map((row: any) => row.id);

    const row = {
      family_id: body.family_id,
      child_id: body.child_id,
      created_by: actorRole.member_id,
      period_type: body.period_type,
      period_start: body.period_start,
      period_end: body.period_end,
      subject: body.subject ?? null,
      title: ai.title ?? `${child.display_name} progress summary`,
      executive_summary: ai.executive_summary ?? "",
      narrative_text: ai.narrative_text ?? "",
      strengths: asStringArray(ai.strengths),
      concerns: asStringArray(ai.concerns),
      observed_patterns: asStringArray(ai.observed_patterns),
      recommendations: asStringArray(ai.recommendations),
      parent_actions: asStringArray(ai.parent_actions),
      child_actions: asStringArray(ai.child_actions),
      teacher_questions: asStringArray(ai.teacher_questions),
      next_goals: asStringArray(ai.next_goals),
      missing_evidence: asStringArray(ai.missing_evidence),
      summary_json: ai.summary_json ?? {},
      source_note_ids: sourceNoteIds,
      source_homework_ids: sourceHomeworkIds,
      source_event_ids: sourceEventIds,
      evidence_count: Number(ai.evidence_count ?? evidenceCount),
      confidence: clampConfidence(ai.confidence),
      status: "draft",
    };

    if (body.save === false) {
      return jsonResponse({
        ok: true,
        saved: false,
        summary: row,
        evidence_counts: {
          notes: evidence.notes.length,
          homework: evidence.homework.length,
          events: evidence.events.length,
        },
      });
    }

    const { data: saved, error: saveError } = await adminClient
      .from("learning_progress_summaries")
      .insert(row)
      .select("*")
      .single();

    if (saveError) throw new Error(saveError.message);

    return jsonResponse({
      ok: true,
      saved: true,
      summary: saved,
      evidence_counts: {
        notes: evidence.notes.length,
        homework: evidence.homework.length,
        events: evidence.events.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
