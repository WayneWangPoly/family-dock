import { logger } from "firebase-functions"; import { onSchedule } from "firebase-functions/v2/scheduler"; import webpush from "web-push"; import OpenAI, { toFile } from "openai"; import { getApps, initializeApp } from "firebase-admin/app"; if (!getApps().length) initializeApp(); ﻿import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https"; import { defineSecret } from "firebase-functions/params";

const db = getFirestore();
const adminAuth = getAuth(); const openAiApiKey = defineSecret("OPENAI_API_KEY"); const vapidPublicKey = defineSecret("VAPID_PUBLIC_KEY"); const vapidPrivateKey = defineSecret("VAPID_PRIVATE_KEY"); const vapidSubject = defineSecret("VAPID_SUBJECT"); const googleMapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");

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


function adelaideDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Adelaide",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function addDaysToDateString(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minutesBeforeIso(iso: string, minutes: number) {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time - minutes * 60 * 1000).toISOString();
}

function routeDocIdPart(value: unknown) {
  const raw = String(value ?? "unknown").trim() || "unknown";
  return raw.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}

function numericCoordinate(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function haversineKm(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const radiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(a));
}

function estimateTravelMinutes(args: {
  fromPlace: any;
  toPlace: any;
  defaultTravelMinutes: number;
}) {
  const fromLat = numericCoordinate(args.fromPlace?.lat);
  const fromLng = numericCoordinate(args.fromPlace?.lng);
  const toLat = numericCoordinate(args.toPlace?.lat);
  const toLng = numericCoordinate(args.toPlace?.lng);

  if (fromLat === null || fromLng === null || toLat === null || toLng === null) {
    return {
      travel_minutes: args.defaultTravelMinutes,
      distance_km_estimate: null,
      estimate_method: "default_no_coordinates",
    };
  }

  const distanceKm = haversineKm(fromLat, fromLng, toLat, toLng);
  const drivingMultiplier = 1.35;
  const averageKmh = 32;
  const rawMinutes = Math.ceil((distanceKm * drivingMultiplier / averageKmh) * 60) + 5;
  const travelMinutes = Math.max(8, Math.min(rawMinutes, 120));

  return {
    travel_minutes: travelMinutes,
    distance_km_estimate: Math.round(distanceKm * 10) / 10,
    estimate_method: "coordinate_estimate",
  };
}

async function loadPlaceMap(familyId: string, placeIds: string[]) {
  const uniqueIds = Array.from(new Set(placeIds.filter(Boolean)));
  const map = new Map<string, any>();

  for (const placeId of uniqueIds) {
    const snap = await db.doc(`families/${familyId}/places/${placeId}`).get();
    if (snap.exists) {
      map.set(placeId, { id: snap.id, ...(snap.data() ?? {}) });
    }
  }

  return map;
}

async function buildDailyRouteDeparturePlansInternal(args: {
  familyId: string;
  date: string;
  createdBy: string;
  childId?: string | null;
  defaultTravelMinutes?: number;
  bufferMinutes?: number;
  alertMinutesBefore?: number;
}) {
  const now = isoNow();
  const date = safeText(args.date, adelaideDateString());
  const nextDate = addDaysToDateString(date, 1);
  const defaultTravelMinutes = Math.max(5, Math.min(Number(args.defaultTravelMinutes ?? 25) || 25, 120));
  const bufferMinutes = Math.max(0, Math.min(Number(args.bufferMinutes ?? 10) || 10, 60));
  const alertMinutesBefore = Math.max(1, Math.min(Number(args.alertMinutesBefore ?? 15) || 15, 120));

  const eventsSnap = await db
    .collection(`families/${args.familyId}/events`)
    .where("start_at", ">=", date)
    .where("start_at", "<", nextDate)
    .limit(300)
    .get();

  const rawEvents = eventsSnap.docs
    .map((docSnap) => {
      const row = docSnap.data() ?? {};
      return {
        id: docSnap.id,
        title: safeText(row.title, "Event"),
        child_id: safeText(row.child_id) || "family",
        place_id: safeText(row.place_id),
        start_at: safeText(row.start_at),
        end_at: safeText(row.end_at),
        status: safeText(row.status, "scheduled"),
        event_type: safeText(row.event_type, "event"),
      };
    })
    .filter((event) => {
      if (!event.start_at || !event.place_id) return false;
      if (event.start_at.slice(0, 10) !== date) return false;
      if (["cancelled", "canceled", "deleted"].includes(event.status.toLowerCase())) return false;
      if (args.childId && event.child_id !== args.childId) return false;
      return true;
    });

  const placeMap = await loadPlaceMap(args.familyId, rawEvents.map((event) => event.place_id));
  const usableEvents = rawEvents
    .filter((event) => placeMap.has(event.place_id))
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  const byChild = new Map<string, typeof usableEvents>();
  for (const event of usableEvents) {
    const list = byChild.get(event.child_id) ?? [];
    list.push(event);
    byChild.set(event.child_id, list);
  }

  let createdPlans = 0;
  let createdLegs = 0;
  let skippedChildren = 0;
  const results: any[] = [];
  const batch = db.batch();

  for (const [childId, events] of byChild.entries()) {
    const placeEvents = events.filter((event) => event.place_id);
    if (placeEvents.length < 2) {
      skippedChildren += 1;
      continue;
    }

    const legs: any[] = [];

    for (let index = 1; index < placeEvents.length; index += 1) {
      const fromEvent = placeEvents[index - 1];
      const toEvent = placeEvents[index];

      if (fromEvent.place_id === toEvent.place_id) continue;

      const fromPlace = placeMap.get(fromEvent.place_id);
      const toPlace = placeMap.get(toEvent.place_id);
      if (!fromPlace || !toPlace) continue;

      const estimate = estimateTravelMinutes({ fromPlace, toPlace, defaultTravelMinutes });
      const latestSafeDepartureAt = minutesBeforeIso(toEvent.start_at, estimate.travel_minutes);
      const recommendedDepartureAt = minutesBeforeIso(toEvent.start_at, estimate.travel_minutes + bufferMinutes);

      if (!latestSafeDepartureAt || !recommendedDepartureAt) continue;

      legs.push({
        index,
        fromEvent,
        toEvent,
        fromPlace,
        toPlace,
        ...estimate,
        latest_safe_departure_at: latestSafeDepartureAt,
        recommended_departure_at: recommendedDepartureAt,
      });
    }

    if (legs.length === 0) {
      skippedChildren += 1;
      continue;
    }

    const planId = `daily-${routeDocIdPart(date)}-${routeDocIdPart(childId)}`;
    const planRef = db.doc(`families/${args.familyId}/route_departure_plans/${planId}`);

    const oldLegsSnap = await db
      .collection(`families/${args.familyId}/route_departure_legs`)
      .where("plan_id", "==", planId)
      .limit(100)
      .get();

    oldLegsSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));

    const firstEvent = placeEvents[0];
    const lastEvent = placeEvents[placeEvents.length - 1];

    const planRecommended = legs
      .map((leg) => leg.recommended_departure_at)
      .sort()[0] ?? null;

    const planLatestSafe = legs
      .map((leg) => leg.latest_safe_departure_at)
      .sort()[0] ?? null;

    batch.set(planRef, {
      id: planId,
      family_id: args.familyId,
      child_id: childId === "family" ? null : childId,
      date,
      title: `Daily route plan - ${date}`,
      status: "active",
      source: "daily_route_builder",
      route_mode: "driving_estimate",
      event_ids: placeEvents.map((event) => event.id),
      start_at: firstEvent.start_at,
      end_at: lastEvent.end_at || lastEvent.start_at,
      recommended_departure_at: planRecommended,
      latest_safe_departure_at: planLatestSafe,
      alert_minutes_before: alertMinutesBefore,
      default_travel_minutes: defaultTravelMinutes,
      buffer_minutes: bufferMinutes,
      overall_risk: "normal",
      late_risk_level: "normal",
      late_risk_message: "Daily route plan generated. Waiting for late-risk scan.",
      generated_at: now,
      created_by: args.createdBy,
      updated_at: now,
      created_at: now,
    }, { merge: true });

    legs.forEach((leg, legIndex) => {
      const legId = `${planId}-leg-${String(legIndex + 1).padStart(2, "0")}`;
      const legRef = db.doc(`families/${args.familyId}/route_departure_legs/${legId}`);

      batch.set(legRef, {
        id: legId,
        family_id: args.familyId,
        plan_id: planId,
        child_id: childId === "family" ? null : childId,
        date,
        status: "active",
        source: "daily_route_builder",
        route_mode: "driving_estimate",
        sort_order: legIndex + 1,
        from_event_id: leg.fromEvent.id,
        to_event_id: leg.toEvent.id,
        from_place_id: leg.fromEvent.place_id,
        to_place_id: leg.toEvent.place_id,
        from_label: safeText(leg.fromPlace.name, leg.fromEvent.title),
        to_label: safeText(leg.toPlace.name, leg.toEvent.title),
        event_title: leg.toEvent.title,
        target_start_at: leg.toEvent.start_at,
        travel_minutes: leg.travel_minutes,
        buffer_minutes: bufferMinutes,
        recommended_departure_at: leg.recommended_departure_at,
        latest_safe_departure_at: leg.latest_safe_departure_at,
        distance_km_estimate: leg.distance_km_estimate,
        estimate_method: leg.estimate_method,
        risk_level: "normal",
        late_risk_level: "normal",
        late_risk_message: "Waiting for late-risk scan.",
        created_by: args.createdBy,
        created_at: now,
        updated_at: now,
      }, { merge: true });
    });

    createdPlans += 1;
    createdLegs += legs.length;
    results.push({
      plan_id: planId,
      child_id: childId === "family" ? null : childId,
      event_count: placeEvents.length,
      leg_count: legs.length,
    });
  }

  if (createdPlans > 0 || createdLegs > 0) {
    await batch.commit();
  }

  return {
    ok: true,
    date,
    event_count: rawEvents.length,
    usable_event_count: usableEvents.length,
    created_plans: createdPlans,
    created_legs: createdLegs,
    skipped_children: skippedChildren,
    results,
  };
}

export const buildDailyRouteDeparturePlans = onCall({ region: "us-central1" }, async (request) => {
  const uid = assertAuthed(request.auth?.uid);
  const familyId = cleanFamilyId(request.data?.family_id);
  await assertFamilyMember(familyId, uid);

  const date = safeText(request.data?.date, adelaideDateString());
  const childId = safeText(request.data?.child_id) || null;

  const result = await buildDailyRouteDeparturePlansInternal({
    familyId,
    date,
    childId,
    createdBy: uid,
    defaultTravelMinutes: Number(request.data?.default_travel_minutes ?? 25) || 25,
    bufferMinutes: Number(request.data?.buffer_minutes ?? 10) || 10,
    alertMinutesBefore: Number(request.data?.alert_minutes_before ?? 15) || 15,
  });

  const logRef = db.collection(`families/${familyId}/scheduled_runner_logs`).doc();
  const finishedAt = isoNow();
  await logRef.set({
    id: logRef.id,
    runner_name: "buildDailyRouteDeparturePlans",
    run_mode: safeText(request.data?.mode, "manual"),
    family_id: familyId,
    started_at: finishedAt,
    finished_at: finishedAt,
    status: "completed",
    summary: result,
    error_message: null,
    created_at: finishedAt,
    updated_at: finishedAt,
  });

  return result;
});



function durationToSeconds(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.endsWith("s")) {
    const seconds = Number(text.slice(0, -1));
    return Number.isFinite(seconds) ? seconds : null;
  }
  const seconds = Number(text);
  return Number.isFinite(seconds) ? seconds : null;
}

function futureDepartureTime(value: unknown) {
  const requestedMs = new Date(String(value ?? "")).getTime();
  const minMs = Date.now() + 5 * 60 * 1000;
  const departureMs = Number.isFinite(requestedMs) ? Math.max(requestedMs, minMs) : minMs;
  return new Date(departureMs).toISOString();
}

async function computeGoogleRouteForLeg(args: {
  apiKey: string;
  fromPlace: any;
  toPlace: any;
  departureTime?: string | null;
}) {
  const fromLat = numericCoordinate(args.fromPlace?.lat);
  const fromLng = numericCoordinate(args.fromPlace?.lng);
  const toLat = numericCoordinate(args.toPlace?.lat);
  const toLng = numericCoordinate(args.toPlace?.lng);

  if (fromLat === null || fromLng === null || toLat === null || toLng === null) {
    throw new Error("Missing numeric coordinates for origin or destination place.");
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": args.apiKey,
      "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters",
    },
    body: JSON.stringify({
      origin: {
        location: {
          latLng: {
            latitude: fromLat,
            longitude: fromLng,
          },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: toLat,
            longitude: toLng,
          },
        },
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: false,
      routeModifiers: {
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: false,
      },
      departureTime: futureDepartureTime(args.departureTime),
      languageCode: "en-AU",
      units: "METRIC",
    }),
  });

  const body = await response.json().catch(async () => {
    const text = await response.text();
    return { error: { message: text } };
  });

  if (!response.ok) {
    throw new Error(`Google Routes API HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }

  const route = body?.routes?.[0];
  const durationSeconds = durationToSeconds(route?.duration ?? route?.staticDuration);
  const staticDurationSeconds = durationToSeconds(route?.staticDuration);
  const distanceMeters = Number(route?.distanceMeters ?? 0);

  if (!durationSeconds || durationSeconds <= 0) {
    throw new Error(`Google Routes API returned no usable duration: ${JSON.stringify(body).slice(0, 500)}`);
  }

  return {
    duration_seconds: durationSeconds,
    static_duration_seconds: staticDurationSeconds,
    travel_minutes: Math.max(1, Math.ceil(durationSeconds / 60)),
    distance_meters: Number.isFinite(distanceMeters) ? distanceMeters : null,
    distance_km_estimate: Number.isFinite(distanceMeters) ? Math.round((distanceMeters / 1000) * 10) / 10 : null,
  };
}

async function refreshRouteLegTravelTimesInternal(args: {
  familyId: string;
  date?: string | null;
  planId?: string | null;
  limit?: number;
  allowMissingApiKey?: boolean;
}) {
  const apiKey = googleMapsApiKey.value();

  if (!apiKey) {
    if (args.allowMissingApiKey) {
      return {
        ok: false,
        skipped: true,
        reason: "GOOGLE_MAPS_API_KEY secret is missing.",
        updated_legs: 0,
        failed_legs: 0,
      };
    }

    throw new HttpsError("failed-precondition", "GOOGLE_MAPS_API_KEY secret is missing.");
  }

  const now = isoNow();
  const date = safeText(args.date, adelaideDateString());
  const planId = safeText(args.planId);
  const limit = Math.max(1, Math.min(Number(args.limit ?? 80) || 80, 200));

  let query: any = db.collection(`families/${args.familyId}/route_departure_legs`);

  if (planId) {
    query = query.where("plan_id", "==", planId);
  } else {
    query = query.where("date", "==", date);
  }

  const legsSnap = await query.limit(limit).get();

  let updatedLegs = 0;
  let failedLegs = 0;
  let skippedLegs = 0;
  const affectedPlanIds = new Set<string>();
  const failures: Array<{ leg_id: string; error: string }> = [];

  for (const legDoc of legsSnap.docs) {
    const leg = legDoc.data() ?? {};

    if (String(leg.status ?? "active") !== "active") {
      skippedLegs += 1;
      continue;
    }

    const fromPlaceId = safeText(leg.from_place_id);
    const toPlaceId = safeText(leg.to_place_id);

    if (!fromPlaceId || !toPlaceId) {
      skippedLegs += 1;
      continue;
    }

    try {
      const [fromPlaceSnap, toPlaceSnap] = await Promise.all([
        db.doc(`families/${args.familyId}/places/${fromPlaceId}`).get(),
        db.doc(`families/${args.familyId}/places/${toPlaceId}`).get(),
      ]);

      if (!fromPlaceSnap.exists || !toPlaceSnap.exists) {
        throw new Error("Origin or destination place document not found.");
      }

      const fromPlace = fromPlaceSnap.data() ?? {};
      const toPlace = toPlaceSnap.data() ?? {};
      const route = await computeGoogleRouteForLeg({
        apiKey,
        fromPlace,
        toPlace,
        departureTime: leg.recommended_departure_at ?? leg.target_start_at ?? null,
      });

      const bufferMinutes = Math.max(0, Math.min(Number(leg.buffer_minutes ?? 10) || 10, 60));
      const targetStartAt = safeText(leg.target_start_at);
      const latestSafeDepartureAt = targetStartAt
        ? minutesBeforeIso(targetStartAt, route.travel_minutes)
        : leg.latest_safe_departure_at ?? null;
      const recommendedDepartureAt = targetStartAt
        ? minutesBeforeIso(targetStartAt, route.travel_minutes + bufferMinutes)
        : leg.recommended_departure_at ?? null;

      await legDoc.ref.set({
        route_mode: "google_routes_traffic_aware",
        travel_minutes: route.travel_minutes,
        routes_duration_seconds: route.duration_seconds,
        routes_static_duration_seconds: route.static_duration_seconds,
        distance_meters: route.distance_meters,
        distance_km_estimate: route.distance_km_estimate,
        estimate_method: "google_routes_traffic_aware",
        recommended_departure_at: recommendedDepartureAt,
        latest_safe_departure_at: latestSafeDepartureAt,
        routes_refresh_status: "ok",
        routes_error: null,
        routes_refreshed_at: now,
        updated_at: now,
      }, { merge: true });

      affectedPlanIds.add(safeText(leg.plan_id));
      updatedLegs += 1;
    } catch (error: any) {
      const message = String(error?.message ?? error).slice(0, 500);
      failedLegs += 1;
      failures.push({ leg_id: legDoc.id, error: message });

      await legDoc.ref.set({
        routes_refresh_status: "failed",
        routes_error: message,
        routes_refreshed_at: now,
        updated_at: now,
      }, { merge: true });
    }
  }

  for (const affectedPlanId of Array.from(affectedPlanIds).filter(Boolean)) {
    const planLegsSnap = await db
      .collection(`families/${args.familyId}/route_departure_legs`)
      .where("plan_id", "==", affectedPlanId)
      .limit(100)
      .get();

    const planLegs = planLegsSnap.docs.map((docSnap) => docSnap.data() ?? {});
    const recommendedValues = planLegs
      .map((leg) => safeText(leg.recommended_departure_at))
      .filter(Boolean)
      .sort();
    const latestSafeValues = planLegs
      .map((leg) => safeText(leg.latest_safe_departure_at))
      .filter(Boolean)
      .sort();
    const totalTravelMinutes = planLegs.reduce((sum, leg) => sum + (Number(leg.travel_minutes ?? 0) || 0), 0);

    await db.doc(`families/${args.familyId}/route_departure_plans/${affectedPlanId}`).set({
      route_mode: "google_routes_traffic_aware",
      estimate_method: "google_routes_traffic_aware",
      recommended_departure_at: recommendedValues[0] ?? null,
      latest_safe_departure_at: latestSafeValues[0] ?? null,
      total_travel_minutes: totalTravelMinutes,
      routes_refreshed_at: now,
      routes_refresh_status: failedLegs > 0 ? "partial" : "ok",
      updated_at: now,
    }, { merge: true });
  }

  return {
    ok: failedLegs === 0,
    date,
    plan_id: planId || null,
    checked_legs: legsSnap.size,
    updated_legs: updatedLegs,
    failed_legs: failedLegs,
    skipped_legs: skippedLegs,
    affected_plan_ids: Array.from(affectedPlanIds).filter(Boolean),
    failures: failures.slice(0, 20),
  };
}

export const refreshRouteLegTravelTimes = onCall(
  { region: "us-central1", secrets: [googleMapsApiKey] },
  async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = cleanFamilyId(request.data?.family_id);
    await assertFamilyMember(familyId, uid);

    const result = await refreshRouteLegTravelTimesInternal({
      familyId,
      date: safeText(request.data?.date) || null,
      planId: safeText(request.data?.plan_id) || null,
      limit: Number(request.data?.limit ?? 80) || 80,
    });

    const finishedAt = isoNow();
    const logRef = db.collection(`families/${familyId}/scheduled_runner_logs`).doc();
    await logRef.set({
      id: logRef.id,
      runner_name: "refreshRouteLegTravelTimes",
      run_mode: safeText(request.data?.mode, "manual"),
      family_id: familyId,
      started_at: finishedAt,
      finished_at: finishedAt,
      status: result.ok ? "completed" : "partial",
      summary: result,
      error_message: result.ok ? null : "Some route legs failed to refresh.",
      created_at: finishedAt,
      updated_at: finishedAt,
    });

    return result;
  },
);


export const routeLateRiskCheck = onCall({ region: "us-central1" }, async (request) => {
  const uid = assertAuthed(request.auth?.uid);
  const familyId = cleanFamilyId(request.data?.family_id);
  await assertFamilyMember(familyId, uid);

  const now = new Date();
  const nowIsoValue = now.toISOString();
  const planId = safeText(request.data?.plan_id);
  const maxPlans = Math.min(Number(request.data?.limit ?? 40) || 40, 100);

  function minutesUntil(value: unknown) {
    const iso = safeText(value);
    if (!iso) return null;
    const time = new Date(iso).getTime();
    if (!Number.isFinite(time)) return null;
    return Math.round((time - now.getTime()) / 60000);
  }

  function classifyRisk(args: {
    recommended: number | null;
    latestSafe: number | null;
    alertMinutesBefore: number;
    baseRisk?: string | null;
  }) {
    if (args.latestSafe !== null && args.latestSafe < 0) return "late";
    if (args.latestSafe !== null && args.latestSafe <= 5) return "high";
    if (args.recommended !== null && args.recommended <= 0) return "high";
    if (args.recommended !== null && args.recommended <= args.alertMinutesBefore) return "medium";
    if (args.baseRisk === "high") return "high";
    if (args.baseRisk === "medium") return "medium";
    return "normal";
  }

  function riskMessage(risk: string, leg: any, minutesToRecommended: number | null, minutesToLatestSafe: number | null) {
    const stop = safeText(leg.to_label, safeText(leg.event_title, "next stop"));
    if (risk === "late") return `You are late for ${stop}. Latest safe departure passed ${Math.abs(minutesToLatestSafe ?? 0)} minute(s) ago.`;
    if (risk === "high") return `Leave now for ${stop}. Latest safe departure is in ${Math.max(minutesToLatestSafe ?? 0, 0)} minute(s).`;
    if (risk === "medium") return `Prepare to leave for ${stop}. Recommended departure is in ${Math.max(minutesToRecommended ?? 0, 0)} minute(s).`;
    return `Route timing for ${stop} looks OK.`;
  }

  const planDocs = planId
    ? [await db.doc(`families/${familyId}/route_departure_plans/${planId}`).get()]
    : (await db
        .collection(`families/${familyId}/route_departure_plans`)
        .where("status", "==", "active")
        .limit(maxPlans)
        .get()).docs;

  const risks: Array<{
    plan_id: string;
    leg_id: string | null;
    risk: string;
    message: string;
    minutes_to_recommended: number | null;
    minutes_to_latest_safe: number | null;
  }> = [];

  let checkedPlans = 0;
  let checkedLegs = 0;
  let highOrLate = 0;

  for (const planDoc of planDocs) {
    if (!planDoc.exists) continue;

    const plan = planDoc.data() ?? {};
    checkedPlans += 1;

    const alertMinutesBefore = Math.max(1, Math.min(Number(plan.alert_minutes_before ?? 15) || 15, 120));

    const legsSnap = await db
      .collection(`families/${familyId}/route_departure_legs`)
      .where("plan_id", "==", planDoc.id)
      .limit(80)
      .get();

    let worstRisk = "normal";
    let worstMessage = "Route timing looks OK.";

    for (const legDoc of legsSnap.docs) {
      const leg = legDoc.data() ?? {};
      checkedLegs += 1;

      const minutesToRecommended = minutesUntil(leg.recommended_departure_at);
      const minutesToLatestSafe = minutesUntil(leg.latest_safe_departure_at);

      const risk = classifyRisk({
        recommended: minutesToRecommended,
        latestSafe: minutesToLatestSafe,
        alertMinutesBefore,
        baseRisk: leg.risk_level,
      });

      const message = riskMessage(risk, leg, minutesToRecommended, minutesToLatestSafe);

      const riskRank: Record<string, number> = { normal: 1, low: 1, medium: 2, high: 3, late: 4 };
      if ((riskRank[risk] ?? 1) > (riskRank[worstRisk] ?? 1)) {
        worstRisk = risk;
        worstMessage = message;
      }

      if (risk === "medium" || risk === "high" || risk === "late") {
        if (risk === "high" || risk === "late") highOrLate += 1;

        const riskRef = db.collection(`families/${familyId}/route_late_risk_checks`).doc();
        const row = {
          id: riskRef.id,
          family_id: familyId,
          plan_id: planDoc.id,
          leg_id: legDoc.id,
          check_time: nowIsoValue,
          risk_level: risk,
          minutes_to_recommended: minutesToRecommended,
          minutes_to_latest_safe: minutesToLatestSafe,
          message,
          recommendation: risk === "late" || risk === "high" ? "Leave now or adjust pickup plan." : "Get ready to leave soon.",
          status: "active",
          created_at: nowIsoValue,
        };

        await riskRef.set(row);

        risks.push({
          plan_id: planDoc.id,
          leg_id: legDoc.id,
          risk,
          message,
          minutes_to_recommended: minutesToRecommended,
          minutes_to_latest_safe: minutesToLatestSafe,
        });
      }

      await legDoc.ref.set({
        late_risk_level: risk,
        late_risk_message: message,
        minutes_to_recommended: minutesToRecommended,
        minutes_to_latest_safe: minutesToLatestSafe,
        last_late_risk_check_at: nowIsoValue,
        updated_at: nowIsoValue,
      }, { merge: true });
    }

    const planRecommended = minutesUntil(plan.recommended_departure_at);
    const planLatestSafe = minutesUntil(plan.latest_safe_departure_at);
    const planRisk = legsSnap.empty
      ? classifyRisk({
          recommended: planRecommended,
          latestSafe: planLatestSafe,
          alertMinutesBefore,
          baseRisk: plan.overall_risk,
        })
      : worstRisk;

    const planMessage = legsSnap.empty
      ? (planRisk === "late"
          ? "This route plan appears late."
          : planRisk === "high"
            ? "This route plan should depart now."
            : planRisk === "medium"
              ? "This route plan should prepare to depart soon."
              : "Route timing looks OK.")
      : worstMessage;

    await planDoc.ref.set({
      late_risk_level: planRisk,
      late_risk_message: planMessage,
      minutes_to_recommended: planRecommended,
      minutes_to_latest_safe: planLatestSafe,
      last_late_risk_check_at: nowIsoValue,
      updated_at: nowIsoValue,
    }, { merge: true });
  }

  const logRef = db.collection(`families/${familyId}/scheduled_runner_logs`).doc();
  await logRef.set({
    id: logRef.id,
    runner_name: "routeLateRiskCheck",
    run_mode: safeText(request.data?.mode, "manual"),
    family_id: familyId,
    started_at: nowIsoValue,
    finished_at: isoNow(),
    status: "completed",
    summary: {
      checked_plans: checkedPlans,
      checked_legs: checkedLegs,
      high_or_late: highOrLate,
      risks: risks.slice(0, 20),
    },
    error_message: null,
    created_at: nowIsoValue,
    updated_at: isoNow(),
  });

  return {
    ok: true,
    checked_plans: checkedPlans,
    checked_legs: checkedLegs,
    high_or_late: highOrLate,
    risks,
  };
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


function reminderMinutesUntil(value: unknown) {
  const iso = safeText(value);
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.round((time - Date.now()) / 60000);
}

function reminderDateOnly(value: unknown) {
  const text = safeText(value);
  return text ? text.slice(0, 10) : "";
}

function reminderIsInactiveStatus(value: unknown) {
  const status = safeText(value).toLowerCase();
  return ["cancelled", "canceled", "deleted", "archived", "done", "completed", "paid"].includes(status);
}

function reminderStatusText(value: unknown, fallback = "scheduled") {
  return safeText(value, fallback).toLowerCase();
}

async function hasRecentFamilyReminderNotification(
  familyId: string,
  sourceId: string | null,
  notificationType: string,
  cooldownMinutes = 360,
) {
  if (!sourceId) return false;

  const cutoffIso = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
  const snap = await db
    .collection(`families/${familyId}/notification_logs`)
    .where("source_id", "==", sourceId)
    .limit(50)
    .get();

  return snap.docs.some((docSnap) => {
    const row = docSnap.data() ?? {};
    const createdAt = String(row.created_at ?? row.sent_at ?? "");
    const status = String(row.status ?? "");
    return (
      String(row.notification_type ?? "") === notificationType &&
      createdAt >= cutoffIso &&
      ["sent", "queued"].includes(status)
    );
  });
}

type FamilyReminderCandidate = {
  notification_type: string;
  title: string;
  body: string;
  target_url: string;
  source_table: string;
  source_id: string;
  priority: number;
  cooldown_minutes: number;
};

async function buildFamilyReminderCandidates(familyId: string) {
  const candidates: FamilyReminderCandidate[] = [];
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Adelaide",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [eventsSnap, homeworkSnap, paymentsSnap] = await Promise.all([
    db.collection(`families/${familyId}/events`).limit(250).get(),
    db.collection(`families/${familyId}/homework_tasks`).limit(250).get(),
    db.collection(`families/${familyId}/payments`).limit(250).get(),
  ]);

  for (const docSnap of eventsSnap.docs) {
    const row = docSnap.data() ?? {};
    if (reminderIsInactiveStatus(row.status)) continue;

    const minutes = reminderMinutesUntil(row.start_at);
    if (minutes === null) continue;

    const title = safeText(row.title, "Upcoming event");
    const placeLabel = safeText(row.place_label ?? row.location ?? row.place_name);
    const timeLabel = new Date(String(row.start_at)).toLocaleTimeString("en-AU", {
      timeZone: "Australia/Adelaide",
      hour: "2-digit",
      minute: "2-digit",
    });

    if (minutes >= 0 && minutes <= 90) {
      candidates.push({
        notification_type: "event_upcoming_90m",
        title: "Upcoming family event",
        body: `${title} starts at ${timeLabel}${placeLabel ? ` at ${placeLabel}` : ""}.`,
        target_url: "/",
        source_table: "events",
        source_id: docSnap.id,
        priority: 70 - Math.min(minutes, 60),
        cooldown_minutes: 180,
      });
    }

    if (minutes < 0 && minutes >= -30 && reminderStatusText(row.status) === "scheduled") {
      candidates.push({
        notification_type: "event_started_recently",
        title: "Event has started",
        body: `${title} started ${Math.abs(minutes)} minute(s) ago.`,
        target_url: "/",
        source_table: "events",
        source_id: docSnap.id,
        priority: 65,
        cooldown_minutes: 360,
      });
    }
  }

  for (const docSnap of homeworkSnap.docs) {
    const row = docSnap.data() ?? {};
    if (reminderIsInactiveStatus(row.status)) continue;

    const dueAt = row.due_at ?? row.due_date ?? null;
    const minutes = reminderMinutesUntil(dueAt);
    const dueDate = reminderDateOnly(dueAt);
    const title = safeText(row.title, "Homework");

    if (minutes !== null && minutes >= 0 && minutes <= 24 * 60) {
      candidates.push({
        notification_type: "homework_due_24h",
        title: "Homework due soon",
        body: `${title} is due within 24 hours.`,
        target_url: "/",
        source_table: "homework_tasks",
        source_id: docSnap.id,
        priority: 55,
        cooldown_minutes: 720,
      });
    } else if (dueDate && dueDate < today) {
      candidates.push({
        notification_type: "homework_overdue",
        title: "Homework overdue",
        body: `${title} is overdue.`,
        target_url: "/",
        source_table: "homework_tasks",
        source_id: docSnap.id,
        priority: 60,
        cooldown_minutes: 1440,
      });
    }
  }

  for (const docSnap of paymentsSnap.docs) {
    const row = docSnap.data() ?? {};
    if (reminderIsInactiveStatus(row.status)) continue;

    const isPaid = Boolean(row.is_paid ?? row.paid ?? false);
    if (isPaid) continue;

    const dueAt = row.due_at ?? row.due_date ?? null;
    const minutes = reminderMinutesUntil(dueAt);
    const dueDate = reminderDateOnly(dueAt);
    const label = safeText(row.title ?? row.name ?? row.description, "Payment");
    const amount = row.amount ?? row.amount_cents ?? null;
    const amountLabel = typeof amount === "number" && amount > 0
      ? ` (${amount > 1000 && row.amount_cents ? `$${Math.round(amount) / 100}` : `$${amount}`})`
      : "";

    if (minutes !== null && minutes >= 0 && minutes <= 48 * 60) {
      candidates.push({
        notification_type: "payment_due_48h",
        title: "Payment due soon",
        body: `${label}${amountLabel} is due soon.`,
        target_url: "/",
        source_table: "payments",
        source_id: docSnap.id,
        priority: 50,
        cooldown_minutes: 1440,
      });
    } else if (dueDate && dueDate < today) {
      candidates.push({
        notification_type: "payment_overdue",
        title: "Payment overdue",
        body: `${label}${amountLabel} appears overdue.`,
        target_url: "/",
        source_table: "payments",
        source_id: docSnap.id,
        priority: 58,
        cooldown_minutes: 1440,
      });
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.slice(0, 8);
}

async function runFamilyReminderScan(familyId: string, senderUid: string) {
  const candidates = await buildFamilyReminderCandidates(familyId);

  let sent = 0;
  let skippedCooldown = 0;
  let skippedNoCandidate = candidates.length === 0 ? 1 : 0;
  const delivered: Array<Record<string, unknown>> = [];

  for (const candidate of candidates) {
    const cooldownActive = await hasRecentFamilyReminderNotification(
      familyId,
      candidate.source_id,
      candidate.notification_type,
      candidate.cooldown_minutes,
    );

    if (cooldownActive) {
      skippedCooldown += 1;
      continue;
    }

    const result = await sendPushToFamily({
      familyId,
      senderUid,
      payload: {
        notification_type: candidate.notification_type,
        title: candidate.title,
        body: candidate.body,
        target_url: candidate.target_url,
        source_table: candidate.source_table,
        source_id: candidate.source_id,
      },
    });

    sent += Number(result.sent ?? 0);
    delivered.push({
      notification_type: candidate.notification_type,
      source_table: candidate.source_table,
      source_id: candidate.source_id,
      title: candidate.title,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
    });
  }

  return {
    ok: true,
    candidate_count: candidates.length,
    sent,
    skipped_cooldown: skippedCooldown,
    skipped_no_candidate: skippedNoCandidate,
    delivered,
  };
}


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


type ScheduledJobRunSummary = {
  job_id: string;
  job_name: string;
  family_id: string;
  trigger_name: string;
  status: "completed" | "failed" | "skipped";
  summary: Record<string, unknown>;
  error_message: string | null;
};

function getFamilyIdFromScheduledSetting(settingDoc: any, setting: any) {
  const direct = safeText(setting.family_id);
  if (direct) return direct;
  return safeText(settingDoc.ref?.parent?.parent?.id);
}

function shouldRunScheduledSetting(setting: any, triggerName: "route" | "reminder" | "all") {
  if (!setting?.is_enabled) return false;
  const payload = setting.runner_payload ?? {};

  if (triggerName === "route") {
    return Boolean(payload.run_late_risk || payload.run_route_alerts);
  }

  if (triggerName === "reminder") {
    return Boolean(payload.run_family_reminders);
  }

  return true;
}


function minutesUntilFrom(baseMs: number, value: unknown) {
  const iso = safeText(value);
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.round((time - baseMs) / 60000);
}

function classifyScheduledRouteRisk(args: {
  recommended: number | null;
  latestSafe: number | null;
  alertMinutesBefore: number;
  baseRisk?: string | null;
}) {
  if (args.latestSafe !== null && args.latestSafe < 0) return "late";
  if (args.latestSafe !== null && args.latestSafe <= 5) return "high";
  if (args.recommended !== null && args.recommended <= 0) return "high";
  if (args.recommended !== null && args.recommended <= args.alertMinutesBefore) return "medium";
  if (args.baseRisk === "high") return "high";
  if (args.baseRisk === "medium") return "medium";
  return "normal";
}

function buildScheduledRouteRiskMessage(risk: string, label: string, minutesToRecommended: number | null, minutesToLatestSafe: number | null) {
  if (risk === "late") return `You are late for ${label}. Latest safe departure passed ${Math.abs(minutesToLatestSafe ?? 0)} minute(s) ago.`;
  if (risk === "high") return `Leave now for ${label}. Latest safe departure is in ${Math.max(minutesToLatestSafe ?? 0, 0)} minute(s).`;
  if (risk === "medium") return `Prepare to leave for ${label}. Recommended departure is in ${Math.max(minutesToRecommended ?? 0, 0)} minute(s).`;
  return `Route timing for ${label} looks OK.`;
}

async function runScheduledLateRiskScan(familyId: string) {
  const now = new Date(); const baseMs = now.getTime(); const nowIsoValue = now.toISOString(); const routeBuildResult = await buildDailyRouteDeparturePlansInternal({ familyId, date: adelaideDateString(now), createdBy: "system-scheduler", defaultTravelMinutes: 25, bufferMinutes: 10, alertMinutesBefore: 15 }); const routeRefreshResult = await refreshRouteLegTravelTimesInternal({ familyId, date: adelaideDateString(now), limit: 80, allowMissingApiKey: true }); const planSnap = await db .collection(`families/${familyId}/route_departure_plans`)
    .where("status", "==", "active")
    .limit(80)
    .get();

  const risks: Array<{
    plan_id: string;
    leg_id: string | null;
    risk: string;
    message: string;
    minutes_to_recommended: number | null;
    minutes_to_latest_safe: number | null;
  }> = [];

  let checkedPlans = 0;
  let checkedLegs = 0;
  let highOrLate = 0;

  for (const planDoc of planSnap.docs) {
    const plan = planDoc.data() ?? {};
    checkedPlans += 1;

    const alertMinutesBefore = Math.max(1, Math.min(Number(plan.alert_minutes_before ?? 15) || 15, 120));

    const legsSnap = await db
      .collection(`families/${familyId}/route_departure_legs`)
      .where("plan_id", "==", planDoc.id)
      .limit(80)
      .get();

    let worstRisk = "normal";
    let worstMessage = "Route timing looks OK.";
    let worstRecommended: number | null = null;
    let worstLatestSafe: number | null = null;
    let worstLegId: string | null = null;
    const riskRank: Record<string, number> = { normal: 1, low: 1, medium: 2, high: 3, late: 4 };

    for (const legDoc of legsSnap.docs) {
      const leg = legDoc.data() ?? {};
      checkedLegs += 1;

      const minutesToRecommended = minutesUntilFrom(baseMs, leg.recommended_departure_at);
      const minutesToLatestSafe = minutesUntilFrom(baseMs, leg.latest_safe_departure_at);
      const risk = classifyScheduledRouteRisk({
        recommended: minutesToRecommended,
        latestSafe: minutesToLatestSafe,
        alertMinutesBefore,
        baseRisk: leg.risk_level,
      });

      const label = safeText(leg.to_label, safeText(leg.event_title, "next stop"));
      const message = buildScheduledRouteRiskMessage(risk, label, minutesToRecommended, minutesToLatestSafe);

      if ((riskRank[risk] ?? 1) > (riskRank[worstRisk] ?? 1)) {
        worstRisk = risk;
        worstMessage = message;
        worstRecommended = minutesToRecommended;
        worstLatestSafe = minutesToLatestSafe;
        worstLegId = legDoc.id;
      }

      await legDoc.ref.set({
        late_risk_level: risk,
        late_risk_message: message,
        minutes_to_recommended: minutesToRecommended,
        minutes_to_latest_safe: minutesToLatestSafe,
        last_late_risk_check_at: nowIsoValue,
        updated_at: nowIsoValue,
      }, { merge: true });

      if (risk === "medium" || risk === "high" || risk === "late") {
        if (risk === "high" || risk === "late") highOrLate += 1;

        const riskRef = db.collection(`families/${familyId}/route_late_risk_checks`).doc();
        const row = {
          id: riskRef.id,
          family_id: familyId,
          plan_id: planDoc.id,
          leg_id: legDoc.id,
          check_time: nowIsoValue,
          risk_level: risk,
          minutes_to_recommended: minutesToRecommended,
          minutes_to_latest_safe: minutesToLatestSafe,
          message,
          recommendation: risk === "late" || risk === "high" ? "Leave now or adjust pickup plan." : "Get ready to leave soon.",
          status: "active",
          created_at: nowIsoValue,
        };

        await riskRef.set(row);
        risks.push({
          plan_id: planDoc.id,
          leg_id: legDoc.id,
          risk,
          message,
          minutes_to_recommended: minutesToRecommended,
          minutes_to_latest_safe: minutesToLatestSafe,
        });
      }
    }

    if (legsSnap.empty) {
      const minutesToRecommended = minutesUntilFrom(baseMs, plan.recommended_departure_at);
      const minutesToLatestSafe = minutesUntilFrom(baseMs, plan.latest_safe_departure_at);
      worstRisk = classifyScheduledRouteRisk({
        recommended: minutesToRecommended,
        latestSafe: minutesToLatestSafe,
        alertMinutesBefore,
        baseRisk: plan.overall_risk,
      });
      worstMessage = buildScheduledRouteRiskMessage(worstRisk, safeText(plan.title, "route plan"), minutesToRecommended, minutesToLatestSafe);
      worstRecommended = minutesToRecommended;
      worstLatestSafe = minutesToLatestSafe;
    }

    await planDoc.ref.set({
      late_risk_level: worstRisk,
      late_risk_message: worstMessage,
      minutes_to_recommended: worstRecommended,
      minutes_to_latest_safe: worstLatestSafe,
      worst_late_risk_leg_id: worstLegId,
      last_late_risk_check_at: nowIsoValue,
      updated_at: nowIsoValue,
    }, { merge: true });
  }

  return {
    checked_plans: checkedPlans,
    checked_legs: checkedLegs,
    high_or_late: highOrLate,
    risks: risks.slice(0, 20),
    top_risk: risks[0] ?? null,
  };
}



async function hasRecentScheduledRouteNotification(
  familyId: string,
  sourceId: string | null,
  notificationType: string,
  cooldownMinutes = 30,
) {
  if (!sourceId) return false;

  const cutoffIso = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
  const snap = await db
    .collection(`families/${familyId}/notification_logs`)
    .where("source_id", "==", sourceId)
    .limit(50)
    .get();

  return snap.docs.some((docSnap) => {
    const row = docSnap.data() ?? {};
    const createdAt = String(row.created_at ?? row.sent_at ?? "");
    const status = String(row.status ?? "");
    return (
      String(row.notification_type ?? "") === notificationType &&
      createdAt >= cutoffIso &&
      ["sent", "queued"].includes(status)
    );
  });
}


async function runScheduledSetting(settingDoc: any, triggerName: "route" | "reminder" | "all"): Promise<ScheduledJobRunSummary> {
  const setting = settingDoc.data() ?? {};
  const familyId = getFamilyIdFromScheduledSetting(settingDoc, setting);
  const jobName = safeText(setting.job_name, settingDoc.id);
  const now = isoNow();

  if (!familyId) {
    return {
      job_id: settingDoc.id,
      job_name: jobName,
      family_id: "",
      trigger_name: triggerName,
      status: "skipped",
      summary: { reason: "Missing family_id on scheduled job setting." },
      error_message: "Missing family_id.",
    };
  }

  if (!shouldRunScheduledSetting(setting, triggerName)) {
    return {
      job_id: settingDoc.id,
      job_name: jobName,
      family_id: familyId,
      trigger_name: triggerName,
      status: "skipped",
      summary: { reason: "Job disabled or not relevant for this trigger." },
      error_message: null,
    };
  }

  const logRef = db.collection(`families/${familyId}/scheduled_runner_logs`).doc();
  const payload = setting.runner_payload ?? {};
  const summary: Record<string, unknown> = {
    trigger_name: triggerName,
    runner_payload: payload,
    scheduled_job_id: settingDoc.id,
    scheduled_job_name: jobName,
  };

  try {
    await logRef.set({
      id: logRef.id,
      runner_name: "scheduledFamilyRunner",
      trigger_name: triggerName,
      run_mode: "onSchedule",
      family_id: familyId,
      job_setting_id: settingDoc.id,
      job_name: jobName,
      started_at: now,
      finished_at: null,
      status: "running",
      summary,
      error_message: null,
      created_at: now,
      updated_at: now,
    });


    if (payload.run_family_reminders) {
      const reminderResult = await runFamilyReminderScan(familyId, "system-scheduler");
      summary.family_reminders = reminderResult;
    }

    let lateRiskSummary: any = null;

    if (payload.run_late_risk || payload.run_route_alerts) {
      lateRiskSummary = await runScheduledLateRiskScan(familyId);
      summary.late_risk = lateRiskSummary;
    }

    if (payload.run_route_alerts) {
      if (lateRiskSummary?.high_or_late > 0 && lateRiskSummary?.top_risk) {
        const topRisk = lateRiskSummary.top_risk;


        const routeSourceId = topRisk.leg_id ?? topRisk.plan_id;
        const routeNotificationType = `scheduled_route_${topRisk.risk}`;
        const cooldownActive = await hasRecentScheduledRouteNotification(
          familyId,
          routeSourceId,
          routeNotificationType,
          30,
        );

        if (cooldownActive) {
          summary.route_alerts = {
            sent: 0,
            skipped: 1,
            reason: "Cooldown active for this route risk. No duplicate push sent.",
            source_id: routeSourceId,
            notification_type: routeNotificationType,
          };
        } else {
          const pushResult = await sendPushToFamily({
            familyId,
            senderUid: "system-scheduler",
            payload: {
              notification_type: routeNotificationType,
              title: topRisk.risk === "late" ? "Family Dock route is late" : "Family Dock route alert",
              body: topRisk.message,
              target_url: "/",
              source_table: topRisk.leg_id ? "route_departure_legs" : "route_departure_plans",
              source_id: routeSourceId,
            },
          });

          summary.route_alerts = pushResult;
        }

      } else {
        summary.route_alerts = {
          sent: 0,
          skipped: 1,
          reason: "No high or late route risk found.",
        };
      }
    }

const finishedAt = isoNow();
    await logRef.set({
      finished_at: finishedAt,
      status: "completed",
      summary,
      error_message: null,
      updated_at: finishedAt,
    }, { merge: true });

    await settingDoc.ref.set({
      last_scheduled_run_at: finishedAt,
      last_scheduled_result: {
        status: "completed",
        log_id: logRef.id,
        summary,
      },
      updated_at: finishedAt,
    }, { merge: true });

    return {
      job_id: settingDoc.id,
      job_name: jobName,
      family_id: familyId,
      trigger_name: triggerName,
      status: "completed",
      summary,
      error_message: null,
    };
  } catch (error: any) {
    const message = String(error?.message ?? error).slice(0, 800);
    const failedAt = isoNow();

    await logRef.set({
      finished_at: failedAt,
      status: "failed",
      summary,
      error_message: message,
      updated_at: failedAt,
    }, { merge: true });

    await settingDoc.ref.set({
      last_scheduled_run_at: failedAt,
      last_scheduled_result: {
        status: "failed",
        log_id: logRef.id,
        error_message: message,
      },
      updated_at: failedAt,
    }, { merge: true });

    return {
      job_id: settingDoc.id,
      job_name: jobName,
      family_id: familyId,
      trigger_name: triggerName,
      status: "failed",
      summary,
      error_message: message,
    };
  }
}

async function runScheduledFamilySettings(triggerName: "route" | "reminder" | "all") {
  const snap = await db
    .collectionGroup("scheduled_job_settings")
    .where("is_enabled", "==", true)
    .limit(200)
    .get();

  const results: ScheduledJobRunSummary[] = [];

  for (const settingDoc of snap.docs) {
    const result = await runScheduledSetting(settingDoc, triggerName);
    results.push(result);
  }

  const completed = results.filter((item) => item.status === "completed").length;
  const failed = results.filter((item) => item.status === "failed").length;
  const skipped = results.filter((item) => item.status === "skipped").length;

  logger.info("Scheduled Family Dock runner completed", {
    triggerName,
    total: results.length,
    completed,
    failed,
    skipped,
  });

  return { total: results.length, completed, failed, skipped, results };
}

/* scheduledAfternoonRouteRunnerGoogleRoutesBound */ export const scheduledAfternoonRouteRunner = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "Australia/Adelaide",
    region: "us-central1",
    maxInstances: 1,
    secrets: [vapidPublicKey, vapidPrivateKey, vapidSubject, googleMapsApiKey],
  },
  async () => {
    await runScheduledFamilySettings("route");
  },
);

export const scheduledFamilyReminderRunner = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Australia/Adelaide",
    region: "us-central1",
    maxInstances: 1,
    secrets: [vapidPublicKey, vapidPrivateKey, vapidSubject],
  },
  async () => {
    await runScheduledFamilySettings("reminder");
  },
);

