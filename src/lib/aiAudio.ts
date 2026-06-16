import { httpsCallable } from "firebase/functions";
import { firebaseAuth, firebaseFunctions } from "./firebaseClient";

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read audio blob."));
    reader.readAsDataURL(blob);
  });
}

export async function transcribeAudioBlob(blob: Blob) {
  if (!firebaseAuth.currentUser) {
    throw new Error("Please sign in again before using voice transcription.");
  }

  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const transcribeAudio = httpsCallable(firebaseFunctions, "transcribeAudio");
  const result = await transcribeAudio({
    audio_base64: await blobToBase64(blob),
    mime_type: blob.type || "audio/webm",
    filename: `family-dock-voice.${ext}`,
  });

  const payload = result.data as { text?: unknown } | null;
  return String(payload?.text ?? "").trim();
}
