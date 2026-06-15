import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebaseClient";

export type ParseFamilyCommandInput = {
  familyId: string;
  transcript: string;
  inputType?: "text" | "voice";
  activePage?: string;
  currentDate?: string;
  timezone?: string;
};

export async function parseFamilyCommand(
  _unused: unknown,
  input: ParseFamilyCommandInput,
) {
  const callable = httpsCallable(firebaseFunctions, "parseAiCommand");
  const result = await callable({
    family_id: input.familyId,
    transcript: input.transcript,
    input_type: input.inputType ?? "text",
    active_page: input.activePage ?? null,
    current_date: input.currentDate ?? new Date().toISOString().slice(0, 10),
    timezone: input.timezone ?? "Australia/Adelaide",
  });
  return result.data;
}
