import { supabase } from "./supabaseClient";

export async function transcribeAudioBlob(blob: Blob) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Please sign in again before using voice transcription.");

  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", blob, `family-dock-voice.${ext}`);

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Supabase URL is not configured.");

  const response = await fetch(`${baseUrl}/functions/v1/ai-transcribe-audio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Voice transcription failed (${response.status}).`);
  }

  return String(payload?.text ?? "").trim();
}
