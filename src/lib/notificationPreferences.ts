import { collection, doc, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import { firestore } from "./firebaseClient";

export type NotificationPreference = { id: string; family_id: string; member_id: string; events_enabled: boolean; homework_enabled: boolean; payments_enabled: boolean; event_reminder_minutes: number; homework_reminder_hours: number; payment_reminder_days: number; quiet_hours_enabled: boolean; quiet_start: string; quiet_end: string; created_at?: string; updated_at?: string; };
export type NotificationPreferenceDraft = Pick<NotificationPreference, "family_id" | "member_id" | "events_enabled" | "homework_enabled" | "payments_enabled" | "event_reminder_minutes" | "homework_reminder_hours" | "payment_reminder_days" | "quiet_hours_enabled" | "quiet_start" | "quiet_end">;

function nowIso() { return new Date().toISOString(); }
function prefDoc(familyId: string, memberId: string) { return doc(firestore, "families", familyId, "notification_preferences", memberId); }
function withId<T>(snapshot: { id: string; data: () => Record<string, unknown> }) { return { id: snapshot.id, ...snapshot.data() } as T; }

export function defaultNotificationPreference(familyId: string, memberId: string): NotificationPreferenceDraft {
  return { family_id: familyId, member_id: memberId, events_enabled: true, homework_enabled: true, payments_enabled: true, event_reminder_minutes: 60, homework_reminder_hours: 24, payment_reminder_days: 3, quiet_hours_enabled: false, quiet_start: "21:00", quiet_end: "07:00" };
}

export async function loadNotificationPreferences(familyId: string) {
  const snap = await getDocs(query(collection(firestore, "families", familyId, "notification_preferences"), orderBy("created_at", "asc")));
  return snap.docs.map((docSnap) => withId<NotificationPreference>(docSnap));
}

export async function upsertNotificationPreference(draft: NotificationPreferenceDraft) {
  const now = nowIso();
  await setDoc(prefDoc(draft.family_id, draft.member_id), { ...draft, updated_at: now, created_at: now }, { merge: true });
  return { id: draft.member_id, ...draft, created_at: now, updated_at: now } as NotificationPreference;
}

export async function ensureNotificationPreferences(familyId: string, memberIds: string[]) {
  await Promise.all(memberIds.map((memberId) => upsertNotificationPreference(defaultNotificationPreference(familyId, memberId))));
  return loadNotificationPreferences(familyId);
}
