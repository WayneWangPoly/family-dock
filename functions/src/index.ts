import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import OpenAI from "openai";

initializeApp();
const db = getFirestore();
const adminAuth = getAuth();
const openAiApiKey = defineSecret("OPENAI_API_KEY");

function assertAuthed(uid?: string) {
  if (!uid) throw new HttpsError("unauthenticated", "Login required.");
  return uid;
}

async function assertFamilyMember(familyId: string, uid: string) {
  const snap = await db.doc(`families/${familyId}/members/${uid}`).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Not a family member.");
  return snap.data() ?? {};
}

function isoNow() {
  return new Date().toISOString();
}

function normalizeActionType(value: any) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["location", "locations", "place_location", "new_location"].includes(raw)) return "place";
  if (["calendar", "event", "schedule"].includes(raw)) return "calendar_event";
  if (["homework", "task"].includes(raw)) return "homework_task";
  if (["fee", "money"].includes(raw)) return "payment";
  if (["note", "learning_note", "progress_note"].includes(raw)) return "notebook_note";
  if (["meal", "food"].includes(raw)) return "meal_plan";
  return raw;
}

function normalizeOneAction(action: any): any {
  if (!action || typeof action !== "object") return action;
  const type = normalizeActionType(action.type ?? action.action_type ?? action.kind);
  const next = { ...action, type };

  if (type === "place") {
    next.name = next.name ?? next.title ?? next.location_name ?? next.place_name ?? "New place";
    next.title = next.title ?? next.name;
    next.address = next.address ?? next.location ?? next.address_text ?? null;
    next.place_type = next.place_type ?? next.type_of_place ?? "other";
    next.missing_fields = Array.isArray(next.missing_fields)
      ? next.missing_fields
      : next.address
        ? []
        : ["address"];
  }

  return next;
}

function normalizeActions(raw: any): any[] {
  let actions: any[] = [];
  if (Array.isArray(raw)) actions = raw;
  else if (Array.isArray(raw?.actions)) actions = raw.actions;
  else if (raw?.action && typeof raw.action === "object") actions = [raw.action];
  else if (raw?.type || raw?.action_type || raw?.kind) actions = [raw];
  return actions.map(normalizeOneAction).filter((action) => action && typeof action === "object" && action.type);
}

function cleanAiText(value: string) {
  return value
    .replace(/^["'“”‘’]+|["'“”‘’。,.，\s]+$/g, "")
    .trim();
}

function extractBetween(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanAiText(match[1]);
  }
  return "";
}

function parseLocalFallbackAction(transcript: string, uid: string) {
  const text = transcript.trim();
  const lower = text.toLowerCase();

  const isPlace =
    /地点|地址|位置|location|place|address|school|club|home|学校|俱乐部|家/i.test(text) &&
    /添加|新增|增加|加入|保存|add|create|save|new/i.test(text);

  if (isPlace) {
    let name = extractBetween(text, [
      /(?:名字|名称|地点名|name|named|called)\s*(?:叫|为|是|is|:|：)?\s*["“]?([^"“”'，,。；;\n]+)["”]?/i,
      /(?:添加|新增|增加|加入|保存|add|create|save|new)\s*(?:一个|a|new)?\s*(?:地点|位置|location|place)?\s*["“]?([^"“”'，,。；;\n]+?)["”]?\s*(?:，|,|。|地址|address|at|$)/i,
    ]);

    const address =
      extractBetween(text, [
        /(?:地址|address)\s*(?:是|为|:|：)?\s*([^。；;\n]+)/i,
        /(?:at|located at)\s+([^。；;\n]+)/i,
      ]) || null;

    if (!name && address) {
      name = text
        .replace(/(?:添加|新增|增加|加入|保存|add|create|save|new)\s*(?:一个|a|new)?\s*(?:地点|位置|location|place)?/i, "")
        .replace(/(?:地址|address)\s*(?:是|为|:|：)?.*$/i, "")
        .trim();
    }

    name = cleanAiText(name || "New place");
    if (["一个地点", "地点", "location", "place", "new place"].includes(name.toLowerCase())) name = "New place";

    return {
      intent: "add_place",
      confidence: address ? 0.9 : 0.65,
      language: /[\u4e00-\u9fff]/.test(text) ? "zh" : "en",
      needs_clarification: !address,
      clarifying_question: address ? null : "这个地点的地址是什么？",
      missing_fields: address ? [] : ["address"],
      draft_summary: `Add place: ${name}`,
      actions: [
        {
          type: "place",
          title: name,
          name,
          address,
          place_type: lower.includes("school") || text.includes("学校") ? "school" : lower.includes("club") || text.includes("俱乐部") ? "club" : lower.includes("home") || text.includes("家") ? "home" : "other",
          missing_fields: address ? [] : ["address"],
          client_action_id: `local-place-${Date.now()}`,
        },
      ],
    };
  }

  const isRequest = /申请|request|ask/i.test(text) && /添加|新增|增加|add|create|save|submit/i.test(text);
  if (isRequest) {
    return {
      intent: "add_request",
      confidence: 0.58,
      language: /[\u4e00-\u9fff]/.test(text) ? "zh" : "en",
      needs_clarification: false,
      clarifying_question: null,
      missing_fields: [],
      draft_summary: text,
      actions: [
        {
          type: "request",
          requester_id: uid,
          request_type: "general",
          title: text.slice(0, 60),
          detail: text,
          client_action_id: `local-request-${Date.now()}`,
        },
      ],
    };
  }

  return null;
}

export const parseAiCommand = onCall({ secrets: [openAiApiKey], region: "us-central1" }, async (request) => {
  const uid = assertAuthed(request.auth?.uid);
  const familyId = String(request.data?.family_id ?? "");
  const transcript = String(request.data?.transcript ?? "").trim();
  const timezone = String(request.data?.timezone ?? "Australia/Adelaide");
  const currentDate = String(request.data?.current_date ?? new Date().toISOString().slice(0, 10));

  if (!familyId) throw new HttpsError("invalid-argument", "family_id is required.");
  if (!transcript) throw new HttpsError("invalid-argument", "transcript is required.");
  await assertFamilyMember(familyId, uid);

  const system = `You convert a parent's natural language request into Family Dock JSON actions. Return JSON only. Supported action types: calendar_event, homework_task, payment, request, meal_plan, notebook_note, place. Use snake_case fields. Required examples: calendar_event {type,title,start_at,end_at,child_id,place_id,event_type}; homework_task {type,title,due_at,child_id,items:[{label,item_type,is_required}]}; payment {type,title,amount,currency,due_date,child_id,pay_to,reference}; request {type,title,detail,requester_id,request_type}; place {type,name,address,place_type}. Today's date: ${currentDate}. Timezone: ${timezone}. If information is missing, set needs_clarification true and missing_fields.`;

  let parsed: any;
  try {
    const client = new OpenAI({ apiKey: openAiApiKey.value() });
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
    });
    parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
  } catch (error: any) {
    console.error("parseAiCommand OpenAI/model parse failed", {
      message: error?.message ?? String(error),
      name: error?.name ?? null,
      status: error?.status ?? null,
      code: error?.code ?? null,
    });

    const fallback = parseLocalFallbackAction(transcript, uid);
    parsed = fallback ?? {
      intent: "needs_setup",
      confidence: 0,
      language: "auto",
      needs_clarification: true,
      clarifying_question: "AI is connected, but the model response is not ready. Try adding clear details such as name, date, time, address or amount.",
      missing_fields: ["model_response"],
      draft_summary: transcript,
      actions: [],
    };
  }

  let normalizedActions = normalizeActions(parsed);
  if (normalizedActions.length === 0) {
    const fallback = parseLocalFallbackAction(transcript, uid);
    if (fallback) {
      console.info("parseAiCommand using local fallback action", { intent: fallback.intent });
      parsed = fallback;
      normalizedActions = normalizeActions(parsed);
    }
  }

  const actionMissingFields = normalizedActions.flatMap((action) => Array.isArray(action.missing_fields) ? action.missing_fields : []);
  const missingFields = actionMissingFields.length > 0
    ? Array.from(new Set(actionMissingFields))
    : Array.isArray(parsed.missing_fields) ? parsed.missing_fields : [];

  const normalized = {
    intent: parsed.intent ?? "family_update",
    confidence: Number(parsed.confidence ?? 0.6),
    language: parsed.language ?? "auto",
    needs_clarification: normalizedActions.length > 0 ? missingFields.length > 0 : Boolean(parsed.needs_clarification ?? false),
    clarifying_question: normalizedActions.length > 0 && missingFields.length === 0 ? null : parsed.clarifying_question ?? null,
    missing_fields: missingFields,
    draft_summary: parsed.draft_summary ?? transcript,
    actions: normalizedActions,
  };

  const logRef = await db.collection(`families/${familyId}/ai_logs`).add({
    family_id: familyId,
    user_id: uid,
    transcript,
    parsed: normalized,
    created_at: isoNow(),
  });

  return { ok: true, ai_interaction_id: logRef.id, parsed: normalized, model: "firebase-openai" };
});

export const commitAiActions = onCall({ region: "us-central1" }, async (request) => {
  const uid = assertAuthed(request.auth?.uid);
  const familyId = String(request.data?.family_id ?? "");
  const actions = Array.isArray(request.data?.actions) ? request.data.actions : [];
  if (!familyId) throw new HttpsError("invalid-argument", "family_id is required.");
  await assertFamilyMember(familyId, uid);

  const batch = db.batch();
  const committed: any[] = [];
  const createdAt = isoNow();

  for (const action of actions) {
    const type = normalizeActionType(action?.type ?? "");
    let collectionName: string | null = null;
    let payload: Record<string, any> = {};

    if (type === "calendar_event") {
      collectionName = "events";
      payload = {
        title: action.title ?? "New event",
        event_type: action.event_type ?? "other",
        start_at: action.start_at ?? createdAt,
        end_at: action.end_at ?? null,
        all_day: Boolean(action.all_day ?? false),
        child_id: action.child_id ?? null,
        place_id: action.place_id ?? null,
        teacher_name: action.teacher_name ?? null,
        recurrence_rule: action.recurrence_rule ?? null,
        source: "ai",
        status: "scheduled",
      };
    } else if (type === "homework_task") {
      collectionName = "homework_tasks";
      payload = {
        title: action.title ?? "Homework",
        child_id: action.child_id ?? null,
        course_event_id: action.course_event_id ?? null,
        due_at: action.due_at ?? null,
        status: "not_started",
        source: "ai",
      };
    } else if (type === "payment") {
      collectionName = "payments";
      payload = {
        title: action.title ?? "Payment",
        child_id: action.child_id ?? null,
        amount: Number(action.amount ?? 0),
        currency: action.currency ?? "AUD",
        due_date: action.due_date ?? null,
        pay_to: action.pay_to ?? null,
        reference: action.reference ?? null,
        category: action.category ?? "AI",
        project: action.project ?? action.title ?? "Payment",
        status: "unpaid",
      };
    } else if (type === "request") {
      collectionName = "requests";
      payload = {
        requester_id: action.requester_id ?? uid,
        request_type: action.request_type ?? "general",
        title: action.title ?? "Request",
        detail: action.detail ?? null,
        status: "pending",
        condition_text: null,
      };
    } else if (type === "place") {
      collectionName = "places";
      payload = {
        name: action.name ?? "New place",
        address: action.address ?? null,
        lat: null,
        lng: null,
        place_type: action.place_type ?? "other",
        pickup_note: action.pickup_note ?? null,
        parking_note: action.parking_note ?? null,
        safety_note: action.safety_note ?? null,
      };
    } else if (type === "meal_plan") {
      collectionName = "meal_plans";
      payload = {
        week_start: action.week_start ?? new Date().toISOString().slice(0, 10),
        day_of_week: Number(action.day_of_week ?? 1),
        meal_type: action.meal_type ?? "dinner",
        title: action.title ?? "Meal",
        notes: action.notes ?? null,
        tags: Array.isArray(action.tags) ? action.tags : [],
      };
    } else if (type === "notebook_note") {
      collectionName = "learning_records";
      payload = {
        child_id: action.child_id ?? null,
        course_event_id: action.course_event_id ?? null,
        course_name: action.course_name ?? null,
        lesson_title: action.lesson_title ?? action.title ?? "Note",
        lesson_date: action.lesson_date ?? new Date().toISOString().slice(0, 10),
        child_comment: action.child_comment ?? null,
        parent_comment: action.parent_comment ?? action.detail ?? null,
        teacher_feedback: action.teacher_feedback ?? null,
        summary: action.summary ?? null,
        strengths: Array.isArray(action.strengths) ? action.strengths : [],
        issues: Array.isArray(action.issues) ? action.issues : [],
        next_steps: Array.isArray(action.next_steps) ? action.next_steps : [],
        expectations: Array.isArray(action.expectations) ? action.expectations : [],
        tags: Array.isArray(action.tags) ? action.tags : [],
      };
    }

    if (!collectionName) continue;
    const ref = db.collection(`families/${familyId}/${collectionName}`).doc();
    batch.set(ref, {
      id: ref.id,
      family_id: familyId,
      ...payload,
      created_by: uid,
      created_at: createdAt,
      updated_at: createdAt,
    });
    committed.push({ client_action_id: action.client_action_id ?? null, type, table: collectionName, id: ref.id, action_log_id: "" });

    if (type === "homework_task") {
      const items = Array.isArray(action.items) && action.items.length > 0
        ? action.items
        : [{ label: "完成作业", item_type: "checkbox", is_required: true }];
      items.forEach((item: any, index: number) => {
        const itemRef = db.collection(`families/${familyId}/homework_items`).doc();
        batch.set(itemRef, {
          id: itemRef.id,
          family_id: familyId,
          homework_task_id: ref.id,
          label: item.label ?? "完成作业",
          item_type: item.item_type ?? "checkbox",
          is_required: Boolean(item.is_required ?? true),
          is_done: false,
          sort_order: index + 1,
          created_at: createdAt,
          updated_at: createdAt,
        });
      });
    }
  }

  await batch.commit();
  return { ok: true, committed, count: committed.length };
});


async function assertFamilyParent(familyId: string, uid: string) {
  const member = await assertFamilyMember(familyId, uid);
  const role = String(member.role ?? "");
  if (!["parent", "guardian", "owner"].includes(role)) {
    throw new HttpsError("permission-denied", "Parent or guardian role required.");
  }
  return member;
}

export const createMemberLogin = onCall({ region: "us-central1" }, async (request) => {
  const callerUid = assertAuthed(request.auth?.uid);
  const familyId = String(request.data?.familyId ?? request.data?.family_id ?? "");
  const existingMemberId = request.data?.memberId ? String(request.data.memberId) : null;
  const displayName = String(request.data?.displayName ?? request.data?.display_name ?? "").trim();
  const email = String(request.data?.email ?? "").trim().toLowerCase();
  const password = String(request.data?.password ?? "");
  const role = String(request.data?.role ?? "child");
  const color = request.data?.color ? String(request.data.color) : null;
  const defaultNavigationApp = request.data?.defaultNavigationApp ? String(request.data.defaultNavigationApp) : "google";

  if (!familyId) throw new HttpsError("invalid-argument", "familyId is required.");
  if (!displayName) throw new HttpsError("invalid-argument", "displayName is required.");
  if (!email) throw new HttpsError("invalid-argument", "email is required.");
  if (password.length < 8) throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
  if (!["parent", "guardian", "child", "homestay"].includes(role)) {
    throw new HttpsError("invalid-argument", "Unsupported role.");
  }

  await assertFamilyParent(familyId, callerUid);

  const userRecord = await adminAuth.createUser({
    email,
    password,
    displayName,
    emailVerified: false,
    disabled: false,
  });

  const createdAt = isoNow();
  const memberRef = db.doc(`families/${familyId}/members/${userRecord.uid}`);
  const userRef = db.doc(`users/${userRecord.uid}`);
  const batch = db.batch();

  batch.set(memberRef, {
    id: userRecord.uid,
    family_id: familyId,
    auth_user_id: userRecord.uid,
    display_name: displayName,
    role,
    color,
    avatar_url: null,
    default_navigation_app: defaultNavigationApp,
    can_login: true,
    email,
    active: true,
    created_at: createdAt,
    updated_at: createdAt,
    created_by: callerUid,
  }, { merge: true });

  batch.set(userRef, {
    uid: userRecord.uid,
    email,
    display_name: displayName,
    default_family_id: familyId,
    created_at: createdAt,
    updated_at: createdAt,
  }, { merge: true });

  if (existingMemberId && existingMemberId !== userRecord.uid) {
    batch.delete(db.doc(`families/${familyId}/members/${existingMemberId}`));
  }

  await batch.commit();

  return { ok: true, uid: userRecord.uid, member_id: userRecord.uid };
});
