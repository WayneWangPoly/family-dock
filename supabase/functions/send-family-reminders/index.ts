import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type Body = {
  family_id: string;
  mode?: "manual_test" | "due_reminders";
  target_url?: string | null;
};

type RoleRow = {
  member_id: string | null;
  role: string;
};

type MemberRow = {
  id: string;
  family_id: string;
  display_name: string;
  role: string;
};

type NotificationPreferenceRow = {
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

type SourceKind = "event" | "homework" | "payment" | "manual";

type NotificationPayload = {
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

const defaultPreference = (familyId: string, memberId: string): NotificationPreferenceRow => ({
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
});

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getOptionalEnv(name: string) {
  return Deno.env.get(name) ?? "";
}

function getAdminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function getUserClient(authHeader: string) {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

function configureWebPush() {
  webpush.setVapidDetails(
    getOptionalEnv("VAPID_SUBJECT") || "mailto:admin@example.com",
    requireEnv("VAPID_PUBLIC_KEY"),
    requireEnv("VAPID_PRIVATE_KEY"),
  );
}

async function getActorRole(adminClient: any, familyId: string, authUserId: string): Promise<RoleRow> {
  const { data, error } = await adminClient
    .from("family_user_roles")
    .select("member_id, role")
    .eq("family_id", familyId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("User is not linked to this family.");

  return data as RoleRow;
}

async function assertAuthorized(req: Request, adminClient: any, familyId: string) {
  const authHeader = req.headers.get("Authorization");

  if (authHeader) {
    const userClient = getUserClient(authHeader);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) throw new Error("Invalid or expired user session");

    const role = await getActorRole(adminClient, familyId, user.id);
    if (!["parent", "guardian"].includes(role.role)) {
      throw new Error("Only parent/guardian can send family reminders manually.");
    }

    return {
      mode: "user",
      auth_user_id: user.id,
      member_id: role.member_id,
    };
  }

  const cronSecret = getOptionalEnv("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret") ?? "";

  if (cronSecret && providedSecret === cronSecret) {
    return {
      mode: "cron",
      auth_user_id: null,
      member_id: null,
    };
  }

  throw new Error("Missing Authorization header or valid x-cron-secret.");
}

async function loadMembers(adminClient: any, familyId: string): Promise<MemberRow[]> {
  const { data, error } = await adminClient
    .from("family_members")
    .select("id, family_id, display_name, role")
    .eq("family_id", familyId);

  if (error) throw new Error(error.message);
  return (data ?? []) as MemberRow[];
}

async function loadPreferences(adminClient: any, familyId: string): Promise<NotificationPreferenceRow[]> {
  const { data, error } = await adminClient
    .from("notification_preferences")
    .select("family_id, member_id, events_enabled, homework_enabled, payments_enabled, event_reminder_minutes, homework_reminder_hours, payment_reminder_days, quiet_hours_enabled, quiet_start, quiet_end")
    .eq("family_id", familyId);

  if (error) throw new Error(error.message);
  return (data ?? []) as NotificationPreferenceRow[];
}

async function ensureMissingPreferences(adminClient: any, familyId: string, members: MemberRow[], existingPrefs: NotificationPreferenceRow[]) {
  const existing = new Set(existingPrefs.map((pref) => pref.member_id));
  const missingRows = members
    .filter((member) => !existing.has(member.id))
    .map((member) => ({ family_id: familyId, member_id: member.id }));

  if (missingRows.length === 0) return existingPrefs;

  const { data, error } = await adminClient
    .from("notification_preferences")
    .upsert(missingRows, { onConflict: "family_id,member_id" })
    .select("family_id, member_id, events_enabled, homework_enabled, payments_enabled, event_reminder_minutes, homework_reminder_hours, payment_reminder_days, quiet_hours_enabled, quiet_start, quiet_end");

  if (error) throw new Error(error.message);

  return [...existingPrefs, ...((data ?? []) as NotificationPreferenceRow[])];
}

async function loadSubscriptions(adminClient: any, familyId: string): Promise<PushSubscriptionRow[]> {
  const { data, error } = await adminClient
    .from("push_subscriptions")
    .select("id, family_id, auth_user_id, member_id, endpoint, p256dh, auth")
    .eq("family_id", familyId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  return (data ?? []) as PushSubscriptionRow[];
}

function toWebPushSubscription(row: PushSubscriptionRow) {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isParentLike(member: MemberRow) {
  return member.role === "parent" || member.role === "guardian";
}

function recipientMembersForPayload(members: MemberRow[], payload: NotificationPayload) {
  if (payload.source_kind === "manual") return members.map((member) => member.id);

  const recipients = new Set<string>();

  for (const member of members) {
    if (isParentLike(member)) recipients.add(member.id);
  }

  if (payload.source_child_member_id) {
    recipients.add(payload.source_child_member_id);
  }

  if (recipients.size === 0) {
    members.forEach((member) => recipients.add(member.id));
  }

  return Array.from(recipients);
}

function preferenceAllows(pref: NotificationPreferenceRow, payload: NotificationPayload) {
  if (payload.source_kind === "manual") return true;
  if (payload.source_kind === "event") return pref.events_enabled;
  if (payload.source_kind === "homework") return pref.homework_enabled;
  if (payload.source_kind === "payment") return pref.payments_enabled;
  return true;
}

function withinPreferenceWindow(pref: NotificationPreferenceRow, payload: NotificationPayload) {
  if (payload.source_kind === "manual") return true;
  if (!payload.source_due_at) return true;

  const now = Date.now();
  const dueAt = new Date(payload.source_due_at).getTime();
  if (!Number.isFinite(dueAt) || dueAt < now) return false;

  if (payload.source_kind === "event") {
    return dueAt - now <= pref.event_reminder_minutes * 60 * 1000;
  }

  if (payload.source_kind === "homework") {
    return dueAt - now <= pref.homework_reminder_hours * 60 * 60 * 1000;
  }

  if (payload.source_kind === "payment") {
    return dueAt - now <= pref.payment_reminder_days * 24 * 60 * 60 * 1000;
  }

  return true;
}


async function loadFamilyTimezone(adminClient: any, familyId: string) {
  const { data, error } = await adminClient
    .from("families")
    .select("timezone")
    .eq("id", familyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.timezone || "Australia/Adelaide";
}

function parseHm(value: string | null | undefined) {
  const [hRaw, mRaw] = String(value || "00:00").split(":");
  const h = Math.min(Math.max(Number(hRaw) || 0, 0), 23);
  const m = Math.min(Math.max(Number(mRaw) || 0, 0), 59);
  return h * 60 + m;
}

function currentMinutesInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone || "Australia/Adelaide",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  let hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}

function isQuietHoursNow(pref: NotificationPreferenceRow, timezone: string) {
  if (!pref.quiet_hours_enabled) return false;

  const start = parseHm(pref.quiet_start);
  const end = parseHm(pref.quiet_end);
  if (start === end) return false;

  const now = currentMinutesInTimezone(timezone);

  if (start < end) {
    return now >= start && now < end;
  }

  return now >= start || now < end;
}

function quietHoursAllows(pref: NotificationPreferenceRow, payload: NotificationPayload, timezone: string) {
  if (payload.source_kind === "manual") return true;
  return !isQuietHoursNow(pref, timezone);
}

async function buildCandidateReminderPayloads(adminClient: any, familyId: string): Promise<NotificationPayload[]> {
  const now = new Date();
  const maxEventWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const maxHomeworkWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const maxPaymentWindowKey = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const payloads: NotificationPayload[] = [];

  const { data: events, error: eventsError } = await adminClient
    .from("calendar_events")
    .select("id, title, start_at, child_id")
    .eq("family_id", familyId)
    .neq("status", "cancelled")
    .gte("start_at", now.toISOString())
    .lte("start_at", maxEventWindow)
    .order("start_at", { ascending: true });

  if (eventsError) throw new Error(eventsError.message);

  for (const event of events ?? []) {
    payloads.push({
      notification_type: "event_reminder",
      source_kind: "event",
      title: "Upcoming family event",
      body: `${event.title} starts at ${new Date(event.start_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}.`,
      target_url: "/",
      source_table: "calendar_events",
      source_id: event.id,
      source_child_member_id: event.child_id,
      source_due_at: event.start_at,
      dedupe_key: `${familyId}:event:${event.id}:${todayKey()}`,
    });
  }

  const { data: homework, error: homeworkError } = await adminClient
    .from("homework_tasks")
    .select("id, title, due_at, child_id")
    .eq("family_id", familyId)
    .not("due_at", "is", null)
    .neq("status", "done")
    .neq("status", "cancelled")
    .gte("due_at", now.toISOString())
    .lte("due_at", maxHomeworkWindow)
    .order("due_at", { ascending: true });

  if (homeworkError) throw new Error(homeworkError.message);

  for (const task of homework ?? []) {
    payloads.push({
      notification_type: "homework_reminder",
      source_kind: "homework",
      title: "Homework due soon",
      body: `${task.title} is due ${new Date(task.due_at).toLocaleString("en-AU")}.`,
      target_url: "/",
      source_table: "homework_tasks",
      source_id: task.id,
      source_child_member_id: task.child_id,
      source_due_at: task.due_at,
      dedupe_key: `${familyId}:homework:${task.id}:${todayKey()}`,
    });
  }

  const { data: payments, error: paymentsError } = await adminClient
    .from("payments")
    .select("id, title, amount, due_date, child_id")
    .eq("family_id", familyId)
    .neq("status", "paid")
    .not("due_date", "is", null)
    .lte("due_date", maxPaymentWindowKey)
    .order("due_date", { ascending: true });

  if (paymentsError) throw new Error(paymentsError.message);

  for (const payment of payments ?? []) {
    const dueAt = `${payment.due_date}T09:00:00`;
    payloads.push({
      notification_type: "payment_reminder",
      source_kind: "payment",
      title: "Payment due soon",
      body: `${payment.title} $${payment.amount} is due ${payment.due_date}.`,
      target_url: "/",
      source_table: "payments",
      source_id: payment.id,
      source_child_member_id: payment.child_id,
      source_due_at: dueAt,
      dedupe_key: `${familyId}:payment:${payment.id}:${todayKey()}`,
    });
  }

  return payloads;
}

async function alreadySentForSubscription(adminClient: any, subscriptionId: string, dedupeKey?: string | null) {
  if (!dedupeKey) return false;

  const { data, error } = await adminClient
    .from("notification_logs")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .eq("dedupe_key", dedupeKey)
    .eq("status", "sent")
    .maybeSingle();

  if (error) throw new Error(error.message);

  return Boolean(data);
}

async function logNotification(adminClient: any, args: {
  familyId: string;
  subscription: PushSubscriptionRow;
  payload: NotificationPayload;
  recipientMemberId: string | null;
  status: "sent" | "failed" | "skipped";
  errorMessage?: string | null;
}) {
  const { error } = await adminClient
    .from("notification_logs")
    .insert({
      family_id: args.familyId,
      auth_user_id: args.subscription.auth_user_id,
      member_id: args.subscription.member_id,
      recipient_member_id: args.recipientMemberId,
      subscription_id: args.subscription.id,
      notification_type: args.payload.notification_type,
      title: args.payload.title,
      body: args.payload.body,
      target_url: args.payload.target_url,
      source_table: args.payload.source_table ?? null,
      source_id: args.payload.source_id ?? null,
      dedupe_key: args.payload.dedupe_key ?? null,
      status: args.status,
      error_message: args.errorMessage ?? null,
      sent_at: args.status === "sent" ? new Date().toISOString() : null,
    });

  if (error && !String(error.message).includes("duplicate")) {
    throw new Error(error.message);
  }
}

async function sendOne(adminClient: any, familyId: string, subscription: PushSubscriptionRow, payload: NotificationPayload, recipientMemberId: string | null) {
  if (await alreadySentForSubscription(adminClient, subscription.id, payload.dedupe_key)) {
    await logNotification(adminClient, {
      familyId,
      subscription,
      payload,
      recipientMemberId,
      status: "skipped",
      errorMessage: "Duplicate reminder already sent to this subscription.",
    });

    return {
      ok: true,
      skipped: true,
      subscription_id: subscription.id,
    };
  }

  const pushBody = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.target_url || "/",
    tag: payload.dedupe_key ?? payload.notification_type,
  });

  try {
    await webpush.sendNotification(toWebPushSubscription(subscription), pushBody);

    await logNotification(adminClient, {
      familyId,
      subscription,
      payload,
      recipientMemberId,
      status: "sent",
    });

    return {
      ok: true,
      subscription_id: subscription.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await logNotification(adminClient, {
      familyId,
      subscription,
      payload,
      recipientMemberId,
      status: "failed",
      errorMessage: message,
    });

    const statusCode = (error as any)?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await adminClient
        .from("push_subscriptions")
        .update({
          is_active: false,
          disabled_at: new Date().toISOString(),
        })
        .eq("id", subscription.id);
    }

    return {
      ok: false,
      subscription_id: subscription.id,
      error: message,
    };
  }
}

export async function sendFamilyReminders(req: Request, body: Body) {
  configureWebPush();

  if (!body.family_id) return jsonResponse({ error: "family_id is required" }, 400);

  const mode = body.mode ?? "due_reminders";
  const adminClient = getAdminClient();

  await assertAuthorized(req, adminClient, body.family_id);

  const members = await loadMembers(adminClient, body.family_id);
  const familyTimezone = await loadFamilyTimezone(adminClient, body.family_id);
  const preferences = await ensureMissingPreferences(adminClient, body.family_id, members, await loadPreferences(adminClient, body.family_id));
  const prefByMember = new Map(preferences.map((pref) => [pref.member_id, pref]));
  const subscriptions = await loadSubscriptions(adminClient, body.family_id);

  if (subscriptions.length === 0) {
    return jsonResponse({
      ok: true,
      sent: 0,
      failed: 0,
      skipped: 0,
      message: "No active push subscriptions.",
    });
  }

  const payloads: NotificationPayload[] = mode === "manual_test"
    ? [{
        notification_type: "manual_test",
        source_kind: "manual",
        title: "Family Dock test",
        body: "Push notification is working on this device.",
        target_url: body.target_url ?? "/",
        dedupe_key: null,
      }]
    : await buildCandidateReminderPayloads(adminClient, body.family_id);

  const results = [];

  for (const payload of payloads) {
    const recipientIds = new Set(recipientMembersForPayload(members, payload));

    for (const subscription of subscriptions) {
      if (!subscription.member_id || !recipientIds.has(subscription.member_id)) continue;

      const pref = prefByMember.get(subscription.member_id) ?? defaultPreference(body.family_id, subscription.member_id);
      if (!preferenceAllows(pref, payload)) continue;
      if (!withinPreferenceWindow(pref, payload)) continue;

      if (!quietHoursAllows(pref, payload, familyTimezone)) {
        await logNotification(adminClient, {
          familyId: body.family_id,
          subscription,
          payload,
          recipientMemberId: subscription.member_id,
          status: "skipped",
          errorMessage: `Skipped by quiet hours (${pref.quiet_start}-${pref.quiet_end}, ${familyTimezone}).`,
        });
        results.push({
          ok: true,
          skipped: true,
          subscription_id: subscription.id,
          reason: "quiet_hours",
        });
        continue;
      }

      results.push(await sendOne(adminClient, body.family_id, subscription, payload, subscription.member_id));
    }
  }

  return jsonResponse({
    ok: true,
    mode,
    payload_count: payloads.length,
    subscription_count: subscriptions.length,
    sent: results.filter((result) => result.ok && !result.skipped).length,
    failed: results.filter((result) => !result.ok).length,
    skipped: results.filter((result) => result.skipped).length,
    targeted_results: results.length,
    results,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as Body;
    return await sendFamilyReminders(req, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
