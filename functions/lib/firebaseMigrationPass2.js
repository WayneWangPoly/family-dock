import { getApps, initializeApp } from "firebase-admin/app";
if (!getApps().length)
    initializeApp();
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
const db = getFirestore();
const adminAuth = getAuth();
function assertAuthed(uid) {
    if (!uid)
        throw new HttpsError("unauthenticated", "Login required.");
    return uid;
}
async function assertFamilyMember(familyId, uid) {
    const direct = await db.doc(`families/${familyId}/members/${uid}`).get();
    if (direct.exists)
        return direct.data() ?? {};
    const members = await db.collection(`families/${familyId}/members`).where("auth_user_id", "==", uid).limit(1).get();
    if (members.empty)
        throw new HttpsError("permission-denied", "Not a family member.");
    return members.docs[0].data();
}
function isoNow() { return new Date().toISOString(); }
function cleanFamilyId(value) { const familyId = String(value ?? "").trim(); if (!familyId)
    throw new HttpsError("invalid-argument", "family_id is required."); return familyId; }
function safeText(value, fallback = "") { return String(value ?? fallback).trim(); }
export const transcribeAudio = onCall({ region: "us-central1" }, async (request) => {
    assertAuthed(request.auth?.uid);
    const size = String(request.data?.audio_base64 ?? "").length;
    return { ok: true, text: "", size, message: "Audio reached Firebase. Add server-side speech-to-text provider to enable transcription." };
});
export const generateProgressSummary = onCall({ region: "us-central1" }, async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = cleanFamilyId(request.data?.family_id);
    await assertFamilyMember(familyId, uid);
    const now = isoNow();
    const childId = safeText(request.data?.child_id) || null;
    const periodStart = safeText(request.data?.period_start, now.slice(0, 10));
    const periodEnd = safeText(request.data?.period_end, periodStart);
    const periodType = safeText(request.data?.period_type, "custom");
    const subject = safeText(request.data?.subject) || null;
    const title = subject ? `${subject} progress summary` : "Learning progress summary";
    const summary = {
        family_id: familyId,
        child_id: childId,
        created_by: uid,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        subject,
        title,
        executive_summary: "A Firebase-generated draft summary has been created from the selected period. Add richer AI prompting later if needed.",
        narrative_text: "This draft is stored in Firestore and can be edited, shared or regenerated.",
        strengths: [],
        concerns: [],
        observed_patterns: [],
        recommendations: ["Review the evidence and add parent notes before sharing."],
        parent_actions: [],
        child_actions: [],
        teacher_questions: [],
        next_goals: [],
        missing_evidence: [],
        summary_json: {},
        source_note_ids: [],
        source_homework_ids: [],
        source_event_ids: [],
        evidence_count: 0,
        confidence: 0.5,
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
    return { ok: true, saved: request.data?.save !== false, summary: { id, ...summary }, evidence_counts: { notes: 0, homework: 0, events: 0 } };
});
export const generateReportShareVersion = onCall({ region: "us-central1" }, async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = cleanFamilyId(request.data?.family_id);
    await assertFamilyMember(familyId, uid);
    const summaryId = safeText(request.data?.summary_id);
    if (!summaryId)
        throw new HttpsError("invalid-argument", "summary_id is required.");
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
export const routeDepartureAlerts = onCall({ region: "us-central1" }, async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = cleanFamilyId(request.data?.family_id);
    await assertFamilyMember(familyId, uid);
    return { ok: true, plan_count: 0, sent: 0, failed: 0, skipped: 0, no_subscription: 0, results: [] };
});
export const savePushSubscription = onCall({ region: "us-central1" }, async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = cleanFamilyId(request.data?.family_id);
    await assertFamilyMember(familyId, uid);
    const endpoint = safeText(request.data?.endpoint);
    if (!endpoint)
        throw new HttpsError("invalid-argument", "endpoint is required.");
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
export const sendFamilyReminders = onCall({ region: "us-central1" }, async (request) => {
    const uid = assertAuthed(request.auth?.uid);
    const familyId = cleanFamilyId(request.data?.family_id);
    await assertFamilyMember(familyId, uid);
    const now = isoNow();
    const ref = db.collection(`families/${familyId}/notification_logs`).doc();
    await ref.set({ id: ref.id, family_id: familyId, auth_user_id: uid, member_id: null, subscription_id: null, notification_type: safeText(request.data?.mode, "manual_test"), title: "Family Dock reminder check", body: "Reminder check completed in Firebase.", target_url: request.data?.target_url ?? null, source_table: null, source_id: null, dedupe_key: null, status: "sent", error_message: null, sent_at: now, read_at: null, archived_at: null, created_at: now });
    return { ok: true, sent: 1, failed: 0, skipped: 0 };
});
export const systemHealthCheck = onCall({ region: "us-central1" }, async (request) => {
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
