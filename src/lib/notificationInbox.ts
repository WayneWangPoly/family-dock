import { supabase } from "./supabaseClient";

export type NotificationLog = {
  id: string;
  family_id: string;
  auth_user_id: string | null;
  member_id: string | null;
  subscription_id: string | null;
  notification_type: string;
  title: string;
  body: string | null;
  target_url: string | null;
  source_table: string | null;
  source_id: string | null;
  dedupe_key: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  error_message: string | null;
  sent_at: string | null;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
};

export type PushSubscriptionRecord = {
  id: string;
  family_id: string;
  auth_user_id: string;
  member_id: string | null;
  endpoint: string;
  user_agent: string | null;
  device_label: string | null;
  is_active: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  platform?: string | null;
  browser?: string | null;
  disabled_at?: string | null;
  disabled_by?: string | null;
};

export async function loadNotificationLogs(familyId: string) {
  const { data, error } = await supabase
    .from("notification_logs")
    .select("*")
    .eq("family_id", familyId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return (data ?? []) as NotificationLog[];
}

export async function markNotificationRead(logId: string, familyId: string) {
  const { error } = await supabase
    .from("notification_logs")
    .update({ read_at: new Date().toISOString() })
    .eq("id", logId)
    .eq("family_id", familyId);
  if (error) throw error;
}

export async function archiveNotification(logId: string, familyId: string) {
  const { error } = await supabase
    .from("notification_logs")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", logId)
    .eq("family_id", familyId);
  if (error) throw error;
}

export async function loadPushSubscriptions(familyId: string) {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("family_id", familyId)
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PushSubscriptionRecord[];
}

export async function setPushSubscriptionActive(args: {
  familyId: string;
  subscriptionId: string;
  active: boolean;
  disabledBy?: string | null;
}) {
  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      is_active: args.active,
      disabled_at: args.active ? null : new Date().toISOString(),
      disabled_by: args.active ? null : args.disabledBy ?? null,
    })
    .eq("family_id", args.familyId)
    .eq("id", args.subscriptionId);
  if (error) throw error;
}

export function summarizeDevice(userAgent?: string | null) {
  if (!userAgent) return "Unknown device";
  const ua = userAgent.toLowerCase();
  const platform = ua.includes("iphone") ? "iPhone" : ua.includes("ipad") ? "iPad" : ua.includes("android") ? "Android" : ua.includes("windows") ? "Windows" : ua.includes("mac") ? "Mac" : "Device";
  const browser = ua.includes("edg") ? "Edge" : ua.includes("chrome") ? "Chrome" : ua.includes("safari") ? "Safari" : ua.includes("firefox") ? "Firefox" : "Browser";
  return `${platform} · ${browser}`;
}
