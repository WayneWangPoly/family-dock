import webpush from "web-push"; import OpenAI, { toFile } from "openai"; import { getApps, initializeApp } from "firebase-admin/app"; if (!getApps().length) initializeApp(); ﻿import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https"; import { defineSecret } from "firebase-functions/params";

const db = getFirestore();
const adminAuth = getAuth(); const openAiApiKey = defineSecret("OPENAI_API_KEY"); const vapidPublicKey = defineSecret("VAPID_PUBLIC_KEY"); const vapidPrivateKey = defineSecret("VAPID_PRIVATE_KEY"); const vapidSubject = defineSecret("VAPID_SUBJECT");

function assertAuthed(uid?: string) {
  if (!uid) throw new HttpsError("unauthenticated", "Login required.");
  return uid;
}

async function assertFamilyMember(familyId: string, uid: string) {
  const direct = await db.doc(`families/${familyId}/members/${uid}`).get();
  if (direct.exists) return direct.data() ?? {};
  const members = await db.collection(`families/${familyId}/members`).where("auth_user_id", "==", uid).limit(1).get();
  if (members.empty) throw new HttpsError("permission-denied", "Not a family member.");
  return members.docs[0].data();
}

function isoNow() { return new Date().toISOString(); }
function cleanFamilyId(value: unknown) { const familyId = String(value ?? "").trim(); if (!familyId) throw new HttpsError("invalid-argument", "family_id is required."); return familyId; }
function safeText(value: unknown, fallback = "") { return String(value ?? fallback).trim(); }

export const transcribeAudio = onCall({ region: "us-central1", secrets: [openAiApiKey] }, async (request) => {
  const uid = assertAuthed(request.auth?.uid);
  const apiKey = openAiApiKey.value();

  if (!apiKey) {
    throw new HttpsError("failed-precondition", "OPENAI_API_KEY secret is missing.");
  }

  const audioBase64 = safeText(request.data?.audio_base64);
  const mimeType = safeText(request.data?.mime_type, "audio/webm").toLowerCase();
  const originalFilename = safeText(request.data?.filename, "family-dock-voice.webm");

  if (!audioBase64) {
    throw new HttpsError("invalid-argument", "audio_base64 is required.");
  }

  const cleaned = audioBase64.includes(",") ? audioBase64.split(",").pop() ?? "" : audioBase64;
  const audioBuffer = Buffer.from(cleaned, "base64");

  if (!audioBuffer.length) {
    throw new HttpsError("invalid-argument", "Audio payload is empty.");
  }

  const maxBytes = 8 * 1024 * 1024;
  if (audioBuffer.byteLength > maxBytes) {
    throw new HttpsError(
      "invalid-argument",
      `Audio is too large for callable transcription. Keep recordings under ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    );
  }

  const extensionFromMime =
    mimeType.includes("mp3") ? "mp3" :
    mimeType.includes("mp4") ? "mp4" :
    mimeType.includes("mpeg") ? "mpeg" :
    mimeType.includes("mpga") ? "mpga" :
    mimeType.includes("m4a") ? "m4a" :
    mimeType.includes("wav") ? "wav" :
    mimeType.includes("ogg") ? "ogg" :
    mimeType.includes("oga") ? "oga" :
    "webm";

  const safeFilename = originalFilename.includes(".")
    ? originalFilename.replace(/[^a-zA-Z0-9._-]/g, "-")
    : `family-dock-voice.${extensionFromMime}`;

  const model = safeText(request.data?.model, "gpt-4o-mini-transcribe");
  const language = safeText(request.data?.language);
  const prompt = safeText(
    request.data?.prompt,
    "Family schedule, child activities, homework, locations, requests, payments, fencing, school, Adelaide.",
  );

  try {
    const client = new OpenAI({ apiKey });
    const file = await toFile(audioBuffer, safeFilename, {
      type: mimeType || "audio/webm",
    });

    const transcription = await client.audio.transcriptions.create({
      file,
      model,
      language: language || undefined,
      prompt,
      response_format: "json",
    });

    const text = String((transcription as { text?: unknown }).text ?? "").trim();

    await db.collection("ai_audio_logs").add({
      auth_user_id: uid,
      filename: safeFilename,
      mime_type: mimeType,
      size_bytes: audioBuffer.byteLength,
      model,
      text_length: text.length,
      created_at: isoNow(),
    });

    return {
      ok: true,
      text,
      size: audioBuffer.byteLength,
      mime_type: mimeType,
      filename: safeFilename,
      model,
    };
  } catch (error: any) {
    console.error("transcribeAudio failed", {
      uid,
      mime_type: mimeType,
      filename: safeFilename,
      size_bytes: audioBuffer.byteLength,
      message: error?.message ?? String(error),
      status: error?.status ?? null,
      code: error?.code ?? null,
    });

    throw new HttpsError(
      "internal",
      `Audio transcription failed: ${String(error?.message ?? error).slice(0, 300)}`,
    );
  }
}); export const generateProgressSummary = onCall({ region: "us-central1", secrets: [openAiApiKey] }, async (request) => {
  const uid = assertAuthed(request.auth?.uid);
  const familyId = cleanFamilyId(request.data?.family_id);
  await assertFamilyMember(familyId, uid);

  const apiKey = openAiApiKey.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "OPENAI_API_KEY secret is missing.");
  }

  const now = isoNow();
  const childId = safeText(request.data?.child_id) || null;
  if (!childId) throw new HttpsError("invalid-argument", "child_id is required.");

  const periodStart = safeText(request.data?.period_start, now.slice(0, 10));
  const periodEnd = safeText(request.data?.period_end, periodStart);
  const periodType = safeText(request.data?.period_type, "custom") as "week" | "month" | "term" | "custom";
  const subject = safeText(request.data?.subject) || null;
  const language = safeText(request.data?.language, "zh");

  const familyRef = db.doc(`families/${familyId}`);
  const childRef = db.doc(`families/${familyId}/members/${childId}`);
  const [familySnap, childSnap] = await Promise.all([familyRef.get(), childRef.get()]);

  const family = familySnap.data() ?? {};
  const child = childSnap.data() ?? {};
  const childName = safeText(child.display_name, "Child");

  function inDateRange(value: unknown) {
    const date = String(value ?? "").slice(0, 10);
    return Boolean(date) && date >= periodStart && date <= periodEnd;
  }

  function compactRecord(docSnap: any) {
    const row = docSnap.data() ?? {};
    return {
      id: docSnap.id,
      lesson_date: row.lesson_date ?? null,
      course_name: row.course_name ?? null,
      lesson_title: row.lesson_title ?? null,
      child_comment: row.child_comment ?? null,
      parent_comment: row.parent_comment ?? null,
      teacher_feedback: row.teacher_feedback ?? null,
      summary: row.summary ?? null,
      strengths: Array.isArray(row.strengths) ? row.strengths : [],
      issues: Array.isArray(row.issues) ? row.issues : [],
      next_steps: Array.isArray(row.next_steps) ? row.next_steps : [],
      expectations: Array.isArray(row.expectations) ? row.expectations : [],
      tags: Array.isArray(row.tags) ? row.tags : [],
    };
  }

  function compactEvent(docSnap: any) {
    const row = docSnap.data() ?? {};
    return {
      id: docSnap.id,
      title: row.title ?? null,
      event_type: row.event_type ?? null,
      start_at: row.start_at ?? null,
      end_at: row.end_at ?? null,
      status: row.status ?? null,
      teacher_name: row.teacher_name ?? null,
      place_id: row.place_id ?? null,
    };
  }

  function compactHomework(docSnap: any, items: any[]) {
    const row = docSnap.data() ?? {};
    return {
      id: docSnap.id,
      title: row.title ?? null,
      due_at: row.due_at ?? null,
      status: row.status ?? null,
      source: row.source ?? null,
      items,
    };
  }

  const [recordSnap, homeworkSnap, eventSnap] = await Promise.all([
    db.collection(`families/${familyId}/learning_records`).where("child_id", "==", childId).limit(120).get(),
    db.collection(`families/${familyId}/homework_tasks`).where("child_id", "==", childId).limit(150).get(),
    db.collection(`families/${familyId}/events`).where("child_id", "==", childId).limit(160).get(),
  ]);

  const records = recordSnap.docs
    .map(compactRecord)
    .filter((row) => inDateRange(row.lesson_date))
    .slice(0, 50);

  const eventRows = eventSnap.docs
    .map(compactEvent)
    .filter((row) => inDateRange(row.start_at))
    .slice(0, 50);

  const homeworkDocs = homeworkSnap.docs
    .filter((docSnap) => {
      const row = docSnap.data() ?? {};
      return inDateRange(row.due_at ?? row.created_at ?? row.updated_at);
    })
    .slice(0, 50);

  const homeworkRows = [];
  for (const taskDoc of homeworkDocs) {
    const itemsSnap = await db
      .collection(`families/${familyId}/homework_items`)
      .where("homework_task_id", "==", taskDoc.id)
      .limit(30)
      .get();

    const items = itemsSnap.docs.map((itemDoc) => {
      const item = itemDoc.data() ?? {};
      return {
        id: itemDoc.id,
        label: item.label ?? null,
        item_type: item.item_type ?? null,
        is_required: Boolean(item.is_required ?? false),
        is_done: Boolean(item.is_done ?? false),
        sort_order: Number(item.sort_order ?? 0),
      };
    });

    homeworkRows.push(compactHomework(taskDoc, items));
  }

  const evidence = {
    family: {
      name: family.name ?? null,
      timezone: family.timezone ?? "Australia/Adelaide",
      state_region: family.state_region ?? null,
      school_level: family.school_level ?? null,
    },
    child: {
      id: childId,
      display_name: childName,
      role: child.role ?? null,
    },
    period: {
      type: periodType,
      start: periodStart,
      end: periodEnd,
      subject,
      language,
    },
    learning_records: records,
    homework_tasks: homeworkRows,
    calendar_events: eventRows,
  };

  const evidenceCount = records.length + homeworkRows.length + eventRows.length;

  const system = `You are a careful family learning progress assistant.
Return JSON only. Do not invent facts. Use only the evidence provided.
The report is for a parent. It should be useful, specific, and balanced.
If evidence is weak, say so clearly.
Required JSON fields:
{
  "title": string,
  "executive_summary": string,
  "narrative_text": string,
  "strengths": string[],
  "concerns": string[],
  "observed_patterns": string[],
  "recommendations": string[],
  "parent_actions": string[],
  "child_actions": string[],
  "teacher_questions": string[],
  "next_goals": string[],
  "missing_evidence": string[],
  "progress_level": "strong" | "steady" | "mixed" | "needs_attention" | "insufficient_evidence",
  "confidence": number
}
Language target: ${language}.`;

  const client = new OpenAI({ apiKey });
  let parsed: any = null;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(evidence).slice(0, 45000) },
      ],
    });

    parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
  } catch (error: any) {
    console.error("generateProgressSummary OpenAI failed", {
      message: error?.message ?? String(error),
      status: error?.status ?? null,
      code: error?.code ?? null,
    });

    throw new HttpsError("internal", `AI progress summary failed: ${String(error?.message ?? error).slice(0, 300)}`);
  }

  function asList(value: unknown) {
    return Array.isArray(value)
      ? value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 12)
      : [];
  }

  function asText(value: unknown, fallback: string) {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  const evidenceBasedConfidence =
    evidenceCount >= 10 ? 0.82 :
    evidenceCount >= 5 ? 0.7 :
    evidenceCount >= 2 ? 0.55 :
    0.35;

  const aiConfidence = Number(parsed?.confidence);
  const confidence = Math.max(
    0.1,
    Math.min(0.95, Number.isFinite(aiConfidence) ? aiConfidence : evidenceBasedConfidence),
  );

  const title = asText(
    parsed?.title,
    subject ? `${subject} progress summary` : `${childName} progress summary`,
  );

  const summary = {
    family_id: familyId,
    child_id: childId,
    created_by: uid,
    period_type: periodType,
    period_start: periodStart,
    period_end: periodEnd,
    subject,
    title,
    executive_summary: asText(parsed?.executive_summary, "Not enough evidence to generate a detailed summary yet."),
    narrative_text: asText(parsed?.narrative_text, "Add more learning notes, homework records and event feedback for a richer progress summary."),
    strengths: asList(parsed?.strengths),
    concerns: asList(parsed?.concerns),
    observed_patterns: asList(parsed?.observed_patterns),
    recommendations: asList(parsed?.recommendations),
    parent_actions: asList(parsed?.parent_actions),
    child_actions: asList(parsed?.child_actions),
    teacher_questions: asList(parsed?.teacher_questions),
    next_goals: asList(parsed?.next_goals),
    missing_evidence: evidenceCount === 0
      ? ["No learning notes, homework records or calendar events were found for this period."]
      : asList(parsed?.missing_evidence),
    summary_json: {
      ...parsed,
      progress_level: asText(parsed?.progress_level, evidenceCount < 2 ? "insufficient_evidence" : "mixed"),
      evidence_counts: {
        notes: records.length,
        homework: homeworkRows.length,
        events: eventRows.length,
      },
    },
    source_note_ids: records.map((row) => row.id),
    source_homework_ids: homeworkRows.map((row) => row.id),
    source_event_ids: eventRows.map((row) => row.id),
    evidence_count: evidenceCount,
    confidence,
    status: "draft",
    created_at: now,
    updated_at: now,
  };

  let id = `local-${Date.now()}`;
  if (request.data?.save !== false) {
    const ref = db.collection(`families/${familyId}/learning_progress_summaries`).doc();
    id = ref.id;
    await ref.set({ id, ...summary });
  }

  return {
    ok: true,
    saved: request.data?.save !== false,
    model: "gpt-4.1-mini",
    summary: { id, ...summary },
    evidence_counts: {
      notes: records.length,
      homework: homeworkRows.length,
      events: eventRows.length,
    },
  };
}); export const generateReportShareVersion = onCall({ region: "us-central1" }, async (request) => {
  const uid = assertAuthed(request.auth?.uid);
  const familyId = cleanFamilyId(request.data?.family_id);
  await assertFamilyMember(familyId, uid);
  const summaryId = safeText(request.data?.summary_id);
  if (!summaryId) throw new HttpsError("invalid-argument", "summary_id is required.");
  const summarySnap = await db.doc(`families/${familyId}/learning_progress_summaries/${summaryId}`).get();
  const summary = summarySnap.data() ?? {};
  const now = isoNow();
  const audience = safeText(request.data?.audience, "parent");
  const language = safeText(request.data?.language, "en");
  const title = `${safeText(summary.title, "Progress summary")} - ${audience}`;
  const content = `# ${title}\n\n${safeText(summary.executive_summary, "Draft summary.")}\n\n${safeText(summary.narrative_text, "")}`;
  const share = { family_id: familyId, summary_id: summaryId, child_id: summary.child_id ?? null, created_by: uid, audience, language, title, content_markdown: content, email_subject: title, email_body: content, key_points: [], questions: [], action_items: [], privacy_notes: ["Review before sharing externally."], status: "draft", created_at: now, updated_at: now };
  let id = `local-${Date.now()}`;
  if (request.data?.save !== false) {
    const ref = db.collection(`families/${familyId}/progress_report_shares`).doc();
    id = ref.id;
    await ref.set({ id, ...share });
  }
  return { ok: true, saved: request.data?.save !== false, share: { id, ...share } };
});

export const routeLateRiskCheck = onCall({ region: "us-central1" }, async (request) => {
  const uid = assertAuthed(request.auth?.uid);
  const familyId = cleanFamilyId(request.data?.family_id);
  await assertFamilyMember(familyId, uid);
  const now = isoNow();
  const logRef = db.collection(`families/${familyId}/scheduled_runner_logs`).doc();
  await logRef.set({ id: logRef.id, runner_name: "routeLateRiskCheck", run_mode: "manual", family_id: familyId, started_at: now, finished_at: now, status: "completed", summary: { checked_plans: 0, checked_legs: 0, high_or_late: 0 }, error_message: null, created_at: now });
  return { ok: true, checked_plans: 0, checked_legs: 0, high_or_late: 0, risks: [] };
});


type PushSendPayload = {
  title: string;
  body: string;
  target_url?: string | null;
  notification_type: string;
  source_table?: string | null;
  source_id?: string | null;
};

function configureWebPush() {
  const subject = vapidSubject.value();
  const publicKey = vapidPublicKey.value();
  const privateKey = vapidPrivateKey.value();

  if (!subject || !publicKey || !privateKey) {
    throw new HttpsError("failed-precondition", "Missing VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT.");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

function asWebPushSubscription(row: any) {
  const endpoint = safeText(row.endpoint);
  const keys = row.keys ?? {};
  const p256dh = safeText(keys.p256dh);
  const auth = safeText(keys.auth);

  if (!endpoint || !p256dh || !auth) return null;

  return {
    endpoint,
    keys: { p256dh, auth },
  };
}

async function sendPushToFamily(args: {
  familyId: string;
  senderUid: string;
  payload: PushSendPayload;
}) {
  configureWebPush();

  const now = isoNow();
  const snap = await db
    .collection(`families/${args.familyId}/push_subscriptions`)
    .where("is_active", "==", true)
    .limit(200)
    .get();

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const results: Array<{ subscription_id: string; status: string; error?: string | null }> = [];

  for (const docSnap of snap.docs) {
    const row = docSnap.data();
    const subscription = asWebPushSubscription(row);

    if (!subscription) {
      skipped += 1;
      results.push({ subscription_id: docSnap.id, status: "skipped", error: "Missing endpoint or keys." });
      continue;
    }

    const logRef = db.collection(`families/${args.familyId}/notification_logs`).doc();
    const message = {
      title: args.payload.title,
      body: args.payload.body,
      target_url: args.payload.target_url ?? "/",
      notification_type: args.payload.notification_type,
      family_id: args.familyId,
      log_id: logRef.id,
    };

    try {
      await webpush.sendNotification(subscription as any, JSON.stringify(message), { TTL: 3600 });

      sent += 1;

      await logRef.set({
        id: logRef.id,
        family_id: args.familyId,
        auth_user_id: row.auth_user_id ?? null,
        member_id: row.member_id ?? null,
        subscription_id: docSnap.id,
        notification_type: args.payload.notification_type,
        title: args.payload.title,
        body: args.payload.body,
        target_url: args.payload.target_url ?? "/",
        source_table: args.payload.source_table ?? null,
        source_id: args.payload.source_id ?? null,
        dedupe_key: null,
        status: "sent",
        error_message: null,
        sent_at: now,
        read_at: null,
        archived_at: null,
        created_by: args.senderUid,
        created_at: now,
        updated_at: now,
      });

      results.push({ subscription_id: docSnap.id, status: "sent", error: null });
    } catch (error: any) {
      failed += 1;
      const statusCode = Number(error?.statusCode ?? error?.status ?? 0);
      const messageText = String(error?.body ?? error?.message ?? error);

      if (statusCode === 404 || statusCode === 410) {
        await docSnap.ref.set({
          is_active: false,
          disabled_at: now,
          updated_at: now,
          disable_reason: `web-push-${statusCode}`,
        }, { merge: true });
      }

      await logRef.set({
        id: logRef.id,
        family_id: args.familyId,
        auth_user_id: row.auth_user_id ?? null,
        member_id: row.member_id ?? null,
        subscription_id: docSnap.id,
        notification_type: args.payload.notification_type,
        title: args.payload.title,
        body: args.payload.body,
        target_url: args.payload.target_url ?? "/",
        source_table: args.payload.source_table ?? null,
        source_id: args.payload.source_id ?? null,
        dedupe_key: null,
        status: "failed",
        error_message: messageText.slice(0, 500),
        sent_at: null,
        read_at: null,
        archived_at: null,
        created_by: args.senderUid,
        created_at: now,
        updated_at: now,
      });

      results.push({ subscription_id: docSnap.id, status: "failed", error: messageText.slice(0, 200) });
    }
  }

  return {
    subscription_count: snap.size,
    sent,
    failed,
    skipped,
    no_subscription: snap.empty ? 1 : 0,
    results,
  };
}

export const routeDepartureAlerts = onCall(
  { region: "us-central1", secrets: [vapidPublicKey, vapidPrivateKey, vapidSubject] },
  async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = cleanFamilyId(request.data?.family_id);
    await assertFamilyMember(familyId, uid);

    const sendResult = await sendPushToFamily({
      familyId,
      senderUid: uid,
      payload: {
        notification_type: "route_departure_alert",
        title: "Family Dock route check",
        body: "Route departure alert test completed. Detailed late-risk logic can be expanded next.",
        target_url: request.data?.target_url ?? "/",
        source_table: "route_departure_plans",
        source_id: request.data?.plan_id ?? null,
      },
    });

    return {
      ok: true,
      plan_count: 0,
      ...sendResult,
    };
  },
); export const savePushSubscription = onCall({ region: "us-central1" }, async (request) => {
  const uid = assertAuthed(request.auth?.uid);
  const familyId = cleanFamilyId(request.data?.family_id);
  await assertFamilyMember(familyId, uid);
  const endpoint = safeText(request.data?.endpoint);
  if (!endpoint) throw new HttpsError("invalid-argument", "endpoint is required.");
  const existing = await db.collection(`families/${familyId}/push_subscriptions`).where("endpoint", "==", endpoint).limit(1).get();
  const ref = existing.empty ? db.collection(`families/${familyId}/push_subscriptions`).doc() : existing.docs[0].ref;
  const now = isoNow();
  if (request.data?.action === "deactivate") {
    await ref.set({ id: ref.id, family_id: familyId, auth_user_id: uid, endpoint, is_active: false, disabled_at: now, updated_at: now }, { merge: true });
    return { ok: true, active: false, id: ref.id };
  }
  await ref.set({ id: ref.id, family_id: familyId, auth_user_id: uid, member_id: request.data?.member_id ?? null, endpoint, keys: request.data?.keys ?? {}, user_agent: request.data?.user_agent ?? null, device_label: request.data?.device_label ?? null, is_active: true, last_seen_at: now, created_at: now, updated_at: now }, { merge: true });
  return { ok: true, active: true, id: ref.id };
});

export const sendFamilyReminders = onCall(
  { region: "us-central1", secrets: [vapidPublicKey, vapidPrivateKey, vapidSubject] },
  async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = cleanFamilyId(request.data?.family_id);
    await assertFamilyMember(familyId, uid);

    const mode = safeText(request.data?.mode, "manual_test");
    const isManual = mode === "manual_test";

    const sendResult = await sendPushToFamily({
      familyId,
      senderUid: uid,
      payload: {
        notification_type: mode,
        title: isManual ? "Family Dock push test" : "Family Dock reminder",
        body: isManual ? "This is a real Web Push test from Family Dock." : "Family Dock reminder check completed.",
        target_url: request.data?.target_url ?? "/",
        source_table: null,
        source_id: null,
      },
    });

    return {
      ok: true,
      ...sendResult,
    };
  },
); export const systemHealthCheck = onCall({ region: "us-central1" }, async (request) => {
  const uid = assertAuthed(request.auth?.uid);
  const familyId = cleanFamilyId(request.data?.family_id);
  await assertFamilyMember(familyId, uid);
  const tables = ["members", "places", "events", "route_stops", "homework_tasks", "payments", "requests"];
  const result = [];
  for (const table of tables) {
    const snap = await db.collection(`families/${familyId}/${table}`).limit(1).get();
    result.push({ ok: true, table, count: snap.size, error: null });
  }
  return { ok: true, checked_at: isoNow(), env: { FIREBASE_PROJECT_ID: Boolean(process.env.GCLOUD_PROJECT) }, tables: result, problem_counts: {} };
});

export const scheduledFamilyRunner = onCall({ region: "us-central1" }, async (request) => {
  const uid = assertAuthed(request.auth?.uid);
  const familyId = cleanFamilyId(request.data?.family_id);
  await assertFamilyMember(familyId, uid);
  const now = isoNow();
  const ref = db.collection(`families/${familyId}/scheduled_runner_logs`).doc();
  await ref.set({ id: ref.id, runner_name: "scheduledFamilyRunner", run_mode: safeText(request.data?.mode, "manual"), family_id: familyId, started_at: now, finished_at: now, status: "completed", summary: { ok: true }, error_message: null, created_at: now });
  return { ok: true, log_id: ref.id };
});
