import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { openAIResponseFormat } from "../_shared/ai-command-schema.ts";

type ParseCommandBody = {
  family_id: string;
  transcript: string;
  input_type?: "text" | "voice";
  active_page?: string | null;
  current_date?: string | null;
  timezone?: string | null;
  save_interaction?: boolean;
};

type FamilyMemberLite = {
  id: string;
  display_name: string;
  role: string;
};

type PlaceLite = {
  id: string;
  name: string;
  address: string | null;
  place_type: string | null;
  pickup_note: string | null;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
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

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (_err) {
    // Sometimes providers may wrap JSON in whitespace; keep this narrow and explicit.
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(text.slice(first, last + 1));
    }
    throw new Error("AI response was not valid JSON.");
  }
}

function buildSystemPrompt(): string {
  return `
You are the Family Dock AI command parser.

Your job:
- Convert a parent's natural language command into structured actions.
- Do not execute actions.
- Do not invent critical missing information.
- Use the family context to resolve names and places when clear.
- If information is missing, set needs_clarification=true and provide a short clarifying_question.
- A single sentence can produce multiple actions.

Supported action types:
1. create_calendar_event
2. create_homework_task
3. create_request
4. create_payment
5. create_meal_or_recipe
6. create_learning_record

Important behavior:
- Prefer Australian local context.
- Default currency is AUD.
- Default timezone is Australia/Adelaide unless given.
- For school/activity course commands, place is required if it is not clearly inferable.
- For recurring courses, include recurrence_rule if possible.
- For homework, break the task into actionable checklist items.
- For payment, extract amount, due date, pay_to, reference if present.
- For learning records, distinguish child_comment, parent_comment, teacher_feedback if possible.
- Preserve useful text in raw_note if it does not fit a field.

Never write prose outside the required JSON schema.
`.trim();
}

function buildUserPayload(args: {
  body: ParseCommandBody;
  role: { member_id: string | null; role: string };
  members: FamilyMemberLite[];
  places: PlaceLite[];
  family: any;
}): string {
  return JSON.stringify(
    {
      command: {
        transcript: args.body.transcript,
        input_type: args.body.input_type ?? "text",
        active_page: args.body.active_page ?? null,
        current_date: args.body.current_date ?? new Date().toISOString().slice(0, 10),
        timezone: args.body.timezone ?? args.family?.timezone ?? "Australia/Adelaide",
      },
      actor: {
        member_id: args.role.member_id,
        role: args.role.role,
      },
      family: {
        id: args.body.family_id,
        name: args.family?.name ?? null,
        timezone: args.family?.timezone ?? "Australia/Adelaide",
        state_region: args.family?.state_region ?? null,
        school_level: args.family?.school_level ?? null,
        school_week1_start: args.family?.school_week1_start ?? null,
      },
      known_members: args.members.map((m) => ({
        id: m.id,
        display_name: m.display_name,
        role: m.role,
      })),
      known_places: args.places.map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        place_type: p.place_type,
        pickup_note: p.pickup_note,
      })),
    },
    null,
    2,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const openAIKey = requireEnv("OPENAI_API_KEY");
    const openAIModel = Deno.env.get("OPENAI_PARSE_MODEL") || "gpt-4.1-mini";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const body = (await req.json()) as ParseCommandBody;

    if (!body.family_id) {
      return jsonResponse({ error: "family_id is required" }, 400);
    }

    if (!body.transcript || body.transcript.trim().length < 2) {
      return jsonResponse({ error: "transcript is required" }, 400);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Invalid or expired user session" }, 401);
    }

    const { data: roleRow, error: roleError } = await adminClient
      .from("family_user_roles")
      .select("member_id, role")
      .eq("family_id", body.family_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (roleError) {
      return jsonResponse({ error: "Failed to check family role", detail: roleError.message }, 500);
    }

    if (!roleRow) {
      return jsonResponse({ error: "User is not a member of this family" }, 403);
    }

    // Conservative v1: only parent/guardian can use the global AI parser.
    // Later you can allow child/homestay with reduced intent set.
    if (!["parent", "guardian"].includes(roleRow.role)) {
      return jsonResponse({ error: "AI command parser is currently parent/guardian only" }, 403);
    }

    const [{ data: family, error: familyError }, { data: members, error: membersError }, { data: places, error: placesError }] =
      await Promise.all([
        adminClient
          .from("families")
          .select("id, name, timezone, state_region, school_level, school_week1_start")
          .eq("id", body.family_id)
          .maybeSingle(),
        adminClient
          .from("family_members")
          .select("id, display_name, role")
          .eq("family_id", body.family_id)
          .order("created_at", { ascending: true }),
        adminClient
          .from("places")
          .select("id, name, address, place_type, pickup_note")
          .eq("family_id", body.family_id)
          .order("created_at", { ascending: true }),
      ]);

    if (familyError) return jsonResponse({ error: "Failed to load family", detail: familyError.message }, 500);
    if (membersError) return jsonResponse({ error: "Failed to load members", detail: membersError.message }, 500);
    if (placesError) return jsonResponse({ error: "Failed to load places", detail: placesError.message }, 500);
    if (!family) return jsonResponse({ error: "Family not found" }, 404);

    const openAIRequestBody = {
      model: openAIModel,
      input: [
        {
          role: "system",
          content: buildSystemPrompt(),
        },
        {
          role: "user",
          content: buildUserPayload({
            body,
            role: roleRow,
            members: (members ?? []) as FamilyMemberLite[],
            places: (places ?? []) as PlaceLite[],
            family,
          }),
        },
      ],
      text: {
        format: openAIResponseFormat,
      },
    };

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openAIRequestBody),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      return jsonResponse(
        {
          error: "OpenAI parse request failed",
          status: openAIResponse.status,
          detail: errorText,
        },
        502,
      );
    }

    const openAIData = await openAIResponse.json();
    const outputText = extractOpenAIText(openAIData);
    const parsed = safeJsonParse(outputText) as any;

    // Defensive normalization.
    if (Array.isArray(parsed.missing_fields) && parsed.missing_fields.length > 0) {
      parsed.needs_clarification = true;
      if (!parsed.clarifying_question) {
        parsed.clarifying_question = `请补充：${parsed.missing_fields.join("、")}`;
      }
    }

    let aiInteractionId: string | null = null;

    if (body.save_interaction !== false) {
      const { data: aiInteraction, error: insertError } = await adminClient
        .from("ai_interactions")
        .insert({
          family_id: body.family_id,
          actor_id: roleRow.member_id,
          input_type: body.input_type ?? "text",
          transcript: body.transcript,
          parsed_intent: parsed.intent ?? null,
          confidence: parsed.confidence ?? null,
          missing_fields: parsed.missing_fields ?? [],
          proposed_actions: parsed.actions ?? [],
          confirmed: false,
        })
        .select("id")
        .single();

      if (insertError) {
        return jsonResponse(
          {
            error: "Parsed command but failed to save ai_interaction",
            detail: insertError.message,
            parsed,
          },
          500,
        );
      }

      aiInteractionId = aiInteraction.id;
    }

    return jsonResponse({
      ok: true,
      ai_interaction_id: aiInteractionId,
      parsed,
      model: openAIModel,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
