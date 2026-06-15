import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type FamilyRow = { id: string; name: string; timezone?: string | null };
type MemberRow = { id: string; family_id: string; display_name: string; role: string };
type PreferenceRow = {
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
};
type PushSubscriptionRow = {
  id: string;
  family_id: string;
  auth_user_id: string;
  member_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};
type SourceKind = "event" | "homework" | "payment";
type Payload = {
  notification_type: string;
  source_kind: SourceKind;
  title: string;
  body: string;
  target_url: string;
  source_table?: string | null;
  source_id?: string | null;
  source_child_member_id?: string | null;
  source_due_at?: string | null;
  dedupe_key?: string | null;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
function getOptionalEnv(name: string) { return Deno.env.get(name) ?? ""; }
function getAdminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
function configureWebPush() {
  webpush.setVapidDetails(getOptionalEnv("VAPID_SUBJECT") || "mailto:admin@example.com", requireEnv("VAPID_PUBLIC_KEY"), requireEnv("VAPID_PRIVATE_KEY"));
}
function assertCron(req: Request) {
  const cronSecret = getOptionalEnv("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret") ?? "";
  if (!cronSecret || providedSecret !== cronSecret) throw new Error("Missing or invalid x-cron-secret.");
}
function todayKey() { return new Date().toISOString().slice(0, 10); }
function isParentLike(member: MemberRow) { return member.role === "parent" || member.role === "guardian"; }
function toWebPushSubscription(row: PushSubscriptionRow) {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
}
function defaultPref(familyId: string, memberId: string): PreferenceRow {
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
function recipientMembersForPayload(members: MemberRow[], payload: Payload) {
  const recipients = new Set<string>();
  for (const member of members) if (isParentLike(member)) recipients.add(member.id);
  if (payload.source_child_member_id) recipients.add(payload.source_child_member_id);
  if (recipients.size === 0) members.forEach((member) => recipients.add(member.id));
  return Array.from(recipients);
}
function preferenceAllows(pref: PreferenceRow, payload: Payload) {
  if (payload.source_kind === "event") return pref.events_enabled;
  if (payload.source_kind === "homework") return pref.homework_enabled;
  if (payload.source_kind === "payment") return pref.payments_enabled;
  return true;
}
function withinPreferenceWindow(pref: PreferenceRow, payload: Payload) {
  if (!payload.source_due_at) return true;
  const now = Date.now();
  const dueAt = new Date(payload.source_due_at).getTime();
  if (!Number.isFinite(dueAt) || dueAt < now) return false;
  if (payload.source_kind === "event") return dueAt - now <= pref.event_reminder_minutes * 60 * 1000;
  if (payload.source_kind === "homework") return dueAt - now <= pref.homework_reminder_hours * 60 * 60 * 1000;
  if (payload.source_kind === "payment") return dueAt - now <= pref.payment_reminder_days * 24 * 60 * 60 * 1000;
  return true;
}

function parseHm(value: string | null | undefined) {
  const [hRaw, mRaw] = String(value || "00:00").split(":");
  const h = Math.min(Math.max(Number(hRaw) || 0, 0), 23);
  const m = Math.min(Math.max(Number(mRaw) || 0, 0), 59);
  return h * 60 + m;
}
function currentMinutesInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: timezone || "Australia/Adelaide", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  let hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}
function isQuietHoursNow(pref: PreferenceRow, timezone: string) {
  if (!pref.quiet_hours_enabled) return false;
  const start = parseHm(pref.quiet_start);
  const end = parseHm(pref.quiet_end);
  if (start === end) return false;
  const now = currentMinutesInTimezone(timezone);
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}
function quietHoursAllows(pref: PreferenceRow, timezone: string) {
  return !isQuietHoursNow(pref, timezone);
}

async function loadFamilies(adminClient: any, limit: number): Promise<FamilyRow[]> {
  const { data, error } = await adminClient.from("families").select("id, name, timezone").order("created_at", { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as FamilyRow[];
}
async function loadMembers(adminClient: any, familyId: string): Promise<MemberRow[]> {
  const { data, error } = await adminClient.from("family_members").select("id, family_id, display_name, role").eq("family_id", familyId);
  if (error) throw new Error(error.message);
  return (data ?? []) as MemberRow[];
}
async function loadPrefs(adminClient: any, familyId: string): Promise<PreferenceRow[]> {
  const { data, error } = await adminClient.from("notification_preferences").select("family_id, member_id, events_enabled, homework_enabled, payments_enabled, event_reminder_minutes, homework_reminder_hours, payment_reminder_days, quiet_hours_enabled, quiet_start, quiet_end").eq("family_id", familyId);
  if (error) throw new Error(error.message);
  return (data ?? []) as PreferenceRow[];
}
async function ensureMissingPrefs(adminClient: any, familyId: string, members: MemberRow[], existingPrefs: PreferenceRow[]) {
  const existing = new Set(existingPrefs.map((pref) => pref.member_id));
  const missingRows = members.filter((member) => !existing.has(member.id)).map((member) => ({ family_id: familyId, member_id: member.id }));
  if (missingRows.length === 0) return existingPrefs;
  const { data, error } = await adminClient.from("notification_preferences").upsert(missingRows, { onConflict: "family_id,member_id" }).select("family_id, member_id, events_enabled, homework_enabled, payments_enabled, event_reminder_minutes, homework_reminder_hours, payment_reminder_days, quiet_hours_enabled, quiet_start, quiet_end");
  if (error) throw new Error(error.message);
  return [...existingPrefs, ...((data ?? []) as PreferenceRow[])];
}
async function loadSubscriptions(adminClient: any, familyId: string): Promise<PushSubscriptionRow[]> {
  const { data, error } = await adminClient.from("push_subscriptions").select("id, family_id, auth_user_id, member_id, endpoint, p256dh, auth").eq("family_id", familyId).eq("is_active", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as PushSubscriptionRow[];
}
async function buildPayloads(adminClient: any, familyId: string): Promise<Payload[]> {
  const now = new Date();
  const maxEventWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const maxHomeworkWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const maxPaymentWindowKey = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const payloads: Payload[] = [];

  const { data: events, error: eventsError } = await adminClient.from("calendar_events").select("id, title, start_at, child_id").eq("family_id", familyId).neq("status", "cancelled").gte("start_at", now.toISOString()).lte("start_at", maxEventWindow).order("start_at", { ascending: true });
  if (eventsError) throw new Error(eventsError.message);
  for (const event of events ?? []) payloads.push({ notification_type: "event_reminder", source_kind: "event", title: "Upcoming family event", body: `${event.title} starts at ${new Date(event.start_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}.`, target_url: "/", source_table: "calendar_events", source_id: event.id, source_child_member_id: event.child_id, source_due_at: event.start_at, dedupe_key: `${familyId}:event:${event.id}:${todayKey()}` });

  const { data: homework, error: homeworkError } = await adminClient.from("homework_tasks").select("id, title, due_at, child_id").eq("family_id", familyId).not("due_at", "is", null).neq("status", "done").neq("status", "cancelled").gte("due_at", now.toISOString()).lte("due_at", maxHomeworkWindow).order("due_at", { ascending: true });
  if (homeworkError) throw new Error(homeworkError.message);
  for (const task of homework ?? []) payloads.push({ notification_type: "homework_reminder", source_kind: "homework", title: "Homework due soon", body: `${task.title} is due ${new Date(task.due_at).toLocaleString("en-AU")}.`, target_url: "/", source_table: "homework_tasks", source_id: task.id, source_child_member_id: task.child_id, source_due_at: task.due_at, dedupe_key: `${familyId}:homework:${task.id}:${todayKey()}` });

  const { data: payments, error: paymentsError } = await adminClient.from("payments").select("id, title, amount, due_date, child_id").eq("family_id", familyId).neq("status", "paid").not("due_date", "is", null).lte("due_date", maxPaymentWindowKey).order("due_date", { ascending: true });
  if (paymentsError) throw new Error(paymentsError.message);
  for (const payment of payments ?? []) payloads.push({ notification_type: "payment_reminder", source_kind: "payment", title: "Payment due soon", body: `${payment.title} $${payment.amount} is due ${payment.due_date}.`, target_url: "/", source_table: "payments", source_id: payment.id, source_child_member_id: payment.child_id, source_due_at: `${payment.due_date}T09:00:00`, dedupe_key: `${familyId}:payment:${payment.id}:${todayKey()}` });

  return payloads;
}
async function alreadySent(adminClient: any, subscriptionId: string, dedupeKey?: string | null) {
  if (!dedupeKey) return false;
  const { data, error } = await adminClient.from("notification_logs").select("id").eq("subscription_id", subscriptionId).eq("dedupe_key", dedupeKey).eq("status", "sent").maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}
async function logNotification(adminClient: any, args: { familyId: string; subscription: PushSubscriptionRow; payload: Payload; recipientMemberId: string | null; status: "sent" | "failed" | "skipped"; errorMessage?: string | null }) {
  const { error } = await adminClient.from("notification_logs").insert({ family_id: args.familyId, auth_user_id: args.subscription.auth_user_id, member_id: args.subscription.member_id, recipient_member_id: args.recipientMemberId, subscription_id: args.subscription.id, notification_type: args.payload.notification_type, title: args.payload.title, body: args.payload.body, target_url: args.payload.target_url, source_table: args.payload.source_table ?? null, source_id: args.payload.source_id ?? null, dedupe_key: args.payload.dedupe_key ?? null, status: args.status, error_message: args.errorMessage ?? null, sent_at: args.status === "sent" ? new Date().toISOString() : null });
  if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);
}
async function sendOne(adminClient: any, familyId: string, subscription: PushSubscriptionRow, payload: Payload) {
  if (await alreadySent(adminClient, subscription.id, payload.dedupe_key)) {
    await logNotification(adminClient, { familyId, subscription, payload, recipientMemberId: subscription.member_id, status: "skipped", errorMessage: "Duplicate reminder already sent to this subscription." });
    return { sent: 0, failed: 0, skipped: 1 };
  }
  try {
    await webpush.sendNotification(toWebPushSubscription(subscription), JSON.stringify({ title: payload.title, body: payload.body, url: payload.target_url || "/", tag: payload.dedupe_key ?? payload.notification_type }));
    await logNotification(adminClient, { familyId, subscription, payload, recipientMemberId: subscription.member_id, status: "sent" });
    return { sent: 1, failed: 0, skipped: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logNotification(adminClient, { familyId, subscription, payload, recipientMemberId: subscription.member_id, status: "failed", errorMessage: message });
    const statusCode = (error as any)?.statusCode;
    if (statusCode === 404 || statusCode === 410) await adminClient.from("push_subscriptions").update({ is_active: false, disabled_at: new Date().toISOString() }).eq("id", subscription.id);
    return { sent: 0, failed: 1, skipped: 0 };
  }
}
async function processFamily(adminClient: any, family: FamilyRow) {
  const members = await loadMembers(adminClient, family.id);
  const prefs = await ensureMissingPrefs(adminClient, family.id, members, await loadPrefs(adminClient, family.id));
  const prefByMember = new Map(prefs.map((pref) => [pref.member_id, pref]));
  const subscriptions = await loadSubscriptions(adminClient, family.id);
  const payloads = await buildPayloads(adminClient, family.id);
  const summary = { family_id: family.id, family_name: family.name, payload_count: payloads.length, subscription_count: subscriptions.length, sent: 0, failed: 0, skipped: 0, targeted_results: 0 };

  for (const payload of payloads) {
    const recipientIds = new Set(recipientMembersForPayload(members, payload));
    for (const subscription of subscriptions) {
      if (!subscription.member_id || !recipientIds.has(subscription.member_id)) continue;
      const pref = prefByMember.get(subscription.member_id) ?? defaultPref(family.id, subscription.member_id);
      if (!preferenceAllows(pref, payload)) continue;
      if (!withinPreferenceWindow(pref, payload)) continue;

      if (!quietHoursAllows(pref, family.timezone || "Australia/Adelaide")) {
        await logNotification(adminClient, {
          familyId: family.id,
          subscription,
          payload,
          recipientMemberId: subscription.member_id,
          status: "skipped",
          errorMessage: `Skipped by quiet hours (${pref.quiet_start}-${pref.quiet_end}, ${family.timezone || "Australia/Adelaide"}).`,
        });
        summary.skipped += 1;
        summary.targeted_results += 1;
        continue;
      }

      const result = await sendOne(adminClient, family.id, subscription, payload);
      summary.sent += result.sent;
      summary.failed += result.failed;
      summary.skipped += result.skipped;
      summary.targeted_results += 1;
    }
  }
  return summary;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    assertCron(req);
    configureWebPush();
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 500);
    const adminClient = getAdminClient();
    const families = await loadFamilies(adminClient, limit);
    const results = [];
    for (const family of families) results.push(await processFamily(adminClient, family));
    return jsonResponse({ ok: true, family_count: families.length, sent: results.reduce((sum, row) => sum + row.sent, 0), failed: results.reduce((sum, row) => sum + row.failed, 0), skipped: results.reduce((sum, row) => sum + row.skipped, 0), targeted_results: results.reduce((sum, row) => sum + row.targeted_results, 0), results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
