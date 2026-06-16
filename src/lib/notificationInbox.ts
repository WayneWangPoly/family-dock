import { collection, getDocs, limit, orderBy, query, updateDoc, doc } from "firebase/firestore";
import { firestore } from "./firebaseClient";

export type NotificationLog = { id: string; family_id: string; auth_user_id: string | null; member_id: string | null; subscription_id: string | null; notification_type: string; title: string; body: string | null; target_url: string | null; source_table: string | null; source_id: string | null; dedupe_key: string | null; status: "pending" | "sent" | "failed" | "skipped"; error_message: string | null; sent_at: string | null; read_at: string | null; archived_at: string | null; created_at: string; };
export type PushSubscriptionRecord = { id: string; family_id: string; auth_user_id: string; member_id: string | null; endpoint: string; user_agent: string | null; device_label: string | null; is_active: boolean; last_seen_at: string; created_at: string; updated_at: string; platform?: string | null; browser?: string | null; disabled_at?: string | null; disabled_by?: string | null; };

function withId<T>(snapshot: { id: string; data: () => Record<string, unknown> }) { return { id: snapshot.id, ...snapshot.data() } as T; }
function familyCollection(familyId: string, name: string) { return collection(firestore, "families", familyId, name); }
function familyDoc(familyId: string, name: string, id: string) { return doc(firestore, "families", familyId, name, id); }

export async function loadNotificationLogs(familyId: string) {
  const snap = await getDocs(query(familyCollection(familyId, "notification_logs"), orderBy("created_at", "desc"), limit(80)));
  return snap.docs.map((docSnap) => withId<NotificationLog>(docSnap)).filter((item) => !item.archived_at);
}

export async function markNotificationRead(logId: string, familyId: string) {
  await updateDoc(familyDoc(familyId, "notification_logs", logId), { read_at: new Date().toISOString() });
}

export async function archiveNotification(logId: string, familyId: string) {
  await updateDoc(familyDoc(familyId, "notification_logs", logId), { archived_at: new Date().toISOString() });
}

export async function loadPushSubscriptions(familyId: string) {
  const snap = await getDocs(query(familyCollection(familyId, "push_subscriptions"), orderBy("last_seen_at", "desc")));
  return snap.docs.map((docSnap) => withId<PushSubscriptionRecord>(docSnap));
}

export async function setPushSubscriptionActive(args: { familyId: string; subscriptionId: string; active: boolean; disabledBy?: string | null; }) {
  await updateDoc(familyDoc(args.familyId, "push_subscriptions", args.subscriptionId), { is_active: args.active, disabled_at: args.active ? null : new Date().toISOString(), disabled_by: args.active ? null : args.disabledBy ?? null, updated_at: new Date().toISOString() });
}

export function summarizeDevice(userAgent?: string | null) {
  if (!userAgent) return "Unknown device";
  const ua = userAgent.toLowerCase();
  const platform = ua.includes("iphone") ? "iPhone" : ua.includes("ipad") ? "iPad" : ua.includes("android") ? "Android" : ua.includes("windows") ? "Windows" : ua.includes("mac") ? "Mac" : "Device";
  const browser = ua.includes("edg") ? "Edge" : ua.includes("chrome") ? "Chrome" : ua.includes("safari") ? "Safari" : ua.includes("firefox") ? "Firefox" : "Browser";
  return `${platform} - ${browser}`;
}
