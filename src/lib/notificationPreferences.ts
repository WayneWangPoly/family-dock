import { supabase } from "./supabaseClient";

export type NotificationPreference = {
  id: string;
  family_id: string;
  member_id: string;
  events_enabled: boolean;
  homework_enabled: boolean;
  payments_enabled: boolean;
  event_reminder_minutes: number;
  homework_reminder_hours: number;
  payment_reminder_days: number;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  created_at?: string;
  updated_at?: string;
};

export type NotificationPreferenceDraft = Pick<
  NotificationPreference,
  | "family_id"
  | "member_id"
  | "events_enabled"
  | "homework_enabled"
  | "payments_enabled"
  | "event_reminder_minutes"
  | "homework_reminder_hours"
  | "payment_reminder_days"
  | "quiet_hours_enabled"
  | "quiet_start"
  | "quiet_end"
>;

export function defaultNotificationPreference(familyId: string, memberId: string): NotificationPreferenceDraft {
  return {
    family_id: familyId,
    member_id: memberId,
    events_enabled: true,
    homework_enabled: true,
    payments_enabled: true,
    event_reminder_minutes: 60,
    homework_reminder_hours: 24,
    payment_reminder_days: 3,
    quiet_hours_enabled: false,
    quiet_start: "21:00",
    quiet_end: "07:00",
  };
}

export async function loadNotificationPreferences(familyId: string) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []) as NotificationPreference[];
}

export async function upsertNotificationPreference(draft: NotificationPreferenceDraft) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(draft, { onConflict: "family_id,member_id" })
    .select("*")
    .single();

  if (error) throw error;

  return data as NotificationPreference;
}

export async function ensureNotificationPreferences(familyId: string, memberIds: string[]) {
  const rows = memberIds.map((memberId) => ({ family_id: familyId, member_id: memberId }));

  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(rows, { onConflict: "family_id,member_id", ignoreDuplicates: true })
    .select("*");

  if (error) throw error;

  return (data ?? []) as NotificationPreference[];
}
