export type FamilyDockActionType =
  | "create_calendar_event"
  | "create_homework_task"
  | "create_request"
  | "create_payment"
  | "create_meal_or_recipe"
  | "create_learning_record";

export type ParsedAction = {
  client_action_id?: string | null;
  type: FamilyDockActionType;
  confidence?: number | null;
  child_name?: string | null;
  title?: string | null;
  detail?: string | null;
  event_type?: string | null;
  request_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  timezone?: string | null;
  weekday?: string | null;
  recurrence_rule?: string | null;
  place_name?: string | null;
  teacher_name?: string | null;
  due_date?: string | null;
  homework_items?: Array<{ label: string; item_type: string; is_required?: boolean }>;
  amount?: number | null;
  currency?: string | null;
  pay_to?: string | null;
  reference?: string | null;
  meal_type?: string | null;
  ingredients?: Array<{ name: string; quantity?: string | null; category?: string | null }>;
  course_name?: string | null;
  lesson_title?: string | null;
  child_comment?: string | null;
  parent_comment?: string | null;
  teacher_feedback?: string | null;
  strengths?: string[];
  issues?: string[];
  next_steps?: string[];
  expectations?: string[];
  raw_note?: string | null;
};

export type CommitActionsBody = {
  family_id: string;
  ai_interaction_id?: string | null;
  confirmed: boolean;
  actions: ParsedAction[];
};

export function normalizeDate(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 10) : null;
}

export function normalizeTime(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2}):?(\d{2})?$/);
  if (!match) return trimmed;
  return `${match[1].padStart(2, "0")}:${(match[2] ?? "00").padStart(2, "0")}`;
}

export function defaultEndTime(startTime?: string | null): string | null {
  const t = normalizeTime(startTime);
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  d.setMinutes(d.getMinutes() + 60);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function localDateTimeToIso(date?: string | null, time?: string | null, timezone = "Australia/Adelaide"): string | null {
  const d = normalizeDate(date);
  if (!d) return null;
  const t = normalizeTime(time) ?? "09:00";
  if (timezone === "Australia/Adelaide") return `${d}T${t}:00+09:30`;
  return `${d}T${t}:00`;
}

export function assertRequired(value: unknown, label: string): void {
  if (value === null || value === undefined || String(value).trim() === "") throw new Error(`${label} is required`);
}
