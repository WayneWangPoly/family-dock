import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getUserClient(authHeader: string) {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const userClient = getUserClient(authHeader);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Invalid or expired user session" }, 401);

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return jsonResponse({ error: "Audio file is required." }, 400);

    const openAiForm = new FormData();
    openAiForm.append("file", audio, audio.name || "voice.webm");
    openAiForm.append("model", Deno.env.get("AI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe");
    openAiForm.append("language", "zh");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      },
      body: openAiForm,
    });

    const payload = await response.json().catch(async () => ({ raw: await response.text() }));
    if (!response.ok) {
      return jsonResponse({ error: payload?.error?.message ?? "OpenAI transcription failed.", details: payload }, 500);
    }

    return jsonResponse({ ok: true, text: payload.text ?? "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
