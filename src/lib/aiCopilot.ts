import type { FamilyData } from "./familyDataTypes";
import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebaseClient";
import { getHomeworkProgress } from "./familyUiHelpers";

export type AICopilotAction = {
  id: string;
  type:
    | "calendar_event"
    | "homework_task"
    | "payment"
    | "request"
    | "place"
    | "notebook_note"
    | "meal_plan"
    | "route_review"
    | "query_answer";
  title: string;
  preview: string;
  confidence: number;
  missing_fields: string[];
  payload: Record<string, any>;
};

export type AICopilotPlan = {
  language: "zh" | "en" | "mixed";
  intent_summary: string;
  confidence: number;
  needs_more_info: boolean;
  questions: string[];
  actions: AICopilotAction[];
  answer: string | null;
  safety_notes: string[];
};

export type PlannerResult = {
  ok: boolean;
  session_id: string;
  plan: AICopilotPlan;
};

function makeActionPreview(action: Record<string, any>) {
  const type = String(action.type ?? "action");
  const title = String(action.title ?? action.name ?? "New item");

  if (type === "calendar_event") return `${title}${action.start_at ? ` · ${action.start_at}` : ""}`;
  if (type === "homework_task") return `${title}${action.due_at ? ` · due ${action.due_at}` : ""}`;
  if (type === "payment") {
    const amount = action.amount != null ? `${action.amount} ${action.currency ?? "AUD"}` : "payment";
    return `${title} · ${amount}`;
  }
  if (type === "request") return `${title}${action.detail ? ` · ${action.detail}` : ""}`;
  if (type === "place") return `${action.name ?? title}${action.address ? ` · ${action.address}` : ""}`;
  if (type === "meal_plan") return `${title}${action.week_start ? ` · week of ${action.week_start}` : ""}`;
  if (type === "notebook_note") return `${title}${action.lesson_date ? ` · ${action.lesson_date}` : ""}`;
  return title;
}


function normalizeCopilotActionType(value: unknown): AICopilotAction["type"] {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["location", "locations", "place_location", "new_location"].includes(raw)) return "place";
  if (["calendar", "event", "schedule"].includes(raw)) return "calendar_event";
  if (["homework", "task"].includes(raw)) return "homework_task";
  if (["fee", "money"].includes(raw)) return "payment";
  if (["note", "learning_note", "progress_note"].includes(raw)) return "notebook_note";
  if (["meal", "food"].includes(raw)) return "meal_plan";
  return raw as AICopilotAction["type"];
}

function cleanAiText(value: string) {
  return value.replace(/^["'“”‘’]+|["'“”‘’。,.，\s]+$/g, "").trim();
}

function extractBetween(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanAiText(match[1]);
  }
  return "";
}

function normalizeRawAction(action: any) {
  if (!action || typeof action !== "object") return action;
  const type = normalizeCopilotActionType(action.type ?? action.action_type ?? action.kind);
  const next: any = { ...action, type };
  if (type === "place") {
    next.name = next.name ?? next.title ?? next.location_name ?? next.place_name ?? "New place";
    next.title = next.title ?? next.name;
    next.address = next.address ?? next.location ?? next.address_text ?? null;
    next.place_type = next.place_type ?? next.type_of_place ?? "other";
    next.missing_fields = Array.isArray(next.missing_fields) ? next.missing_fields : next.address ? [] : ["address"];
  }
  return next;
}

function normaliseRawActions(parsed: any) {
  let rawActions: any[] = [];
  if (Array.isArray(parsed)) rawActions = parsed;
  else if (Array.isArray(parsed?.actions)) rawActions = parsed.actions;
  else if (parsed?.action && typeof parsed.action === "object") rawActions = [parsed.action];
  else if (parsed?.type || parsed?.action_type || parsed?.kind) rawActions = [parsed];
  return rawActions.map(normalizeRawAction).filter((action) => action && action.type);
}

function buildClientFallbackPlan(transcript: string): AICopilotPlan | null {
  const text = transcript.trim();
  const lower = text.toLowerCase();
  const isPlace = /地点|地址|位置|location|place|address|school|club|home|学校|俱乐部|家/i.test(text) && /添加|新增|增加|加入|保存|add|create|save|new/i.test(text);
  if (!isPlace) return null;

  let name = extractBetween(text, [
    /(?:名字|名称|地点名|name|named|called)\s*(?:叫|为|是|is|:|：)?\s*["“]?([^"“”'，,。；;\n]+)["”]?/i,
    /(?:添加|新增|增加|加入|保存|add|create|save|new)\s*(?:一个|a|new)?\s*(?:地点|位置|location|place)?\s*["“]?([^"“”'，,。；;\n]+?)["”]?\s*(?:，|,|。|地址|address|at|$)/i,
  ]);
  const address = extractBetween(text, [
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

  const missing = address ? [] : ["address"];
  return {
    language: /[\u4e00-\u9fff]/.test(text) ? "zh" : "en",
    intent_summary: `Add place: ${name}`,
    confidence: address ? 0.9 : 0.65,
    needs_more_info: missing.length > 0,
    questions: missing.length > 0 ? ["这个地点的地址是什么？"] : [],
    answer: null,
    safety_notes: [],
    actions: [
      {
        id: `client-place-${Date.now()}`,
        type: "place",
        title: name,
        preview: `${name}${address ? ` · ${address}` : ""}`,
        confidence: address ? 0.9 : 0.65,
        missing_fields: missing,
        payload: {
          type: "place",
          title: name,
          name,
          address,
          place_type: lower.includes("school") || text.includes("学校") ? "school" : lower.includes("club") || text.includes("俱乐部") ? "club" : lower.includes("home") || text.includes("家") ? "home" : "other",
          missing_fields: missing,
        },
      },
    ],
  };
}

function adaptParsedToCopilotPlan(parsed: any): AICopilotPlan {
  const rawActions = normaliseRawActions(parsed);
  const actions = rawActions.map((action: any, index: number): AICopilotAction => {
    const type = normalizeCopilotActionType(action?.type ?? "query_answer");
    const title = String(action?.title ?? action?.name ?? `Action ${index + 1}`);
    const missing = Array.isArray(action?.missing_fields)
      ? action.missing_fields
      : Array.isArray(parsed?.missing_fields)
        ? parsed.missing_fields
        : [];

    return {
      id: action?.client_action_id ?? action?.id ?? `firebase-ai-${Date.now()}-${index}`,
      type,
      title,
      preview: action?.preview ?? makeActionPreview(action),
      confidence: Number(action?.confidence ?? parsed?.confidence ?? 0.75),
      missing_fields: missing,
      payload: action,
    };
  });

  const question = parsed?.clarifying_question ?? (Array.isArray(parsed?.questions) ? parsed.questions[0] : null);

  return {
    language: parsed?.language === "zh" || parsed?.language === "en" || parsed?.language === "mixed" ? parsed.language : "mixed",
    intent_summary: String(parsed?.draft_summary ?? parsed?.intent ?? "AI plan"),
    confidence: Number(parsed?.confidence ?? 0.75),
    needs_more_info: Boolean(parsed?.needs_clarification ?? false),
    questions: question ? [String(question)] : [],
    actions,
    answer: parsed?.answer ?? null,
    safety_notes: [],
  };
}

export function buildCopilotContext(data: FamilyData) {
  const upcomingEvents = [...data.calendarEvents]
    .filter((event) => event.status !== "cancelled")
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, 80)
    .map((event) => ({
      id: event.id,
      title: event.title,
      child_id: event.child_id,
      place_id: event.place_id,
      event_type: event.event_type,
      start_at: event.start_at,
      end_at: event.end_at,
      teacher_name: event.teacher_name,
      status: event.status,
    }));

  const homework = data.homeworkTasks
    .filter((task) => task.status !== "done" && task.status !== "cancelled")
    .slice(0, 40)
    .map((task) => ({
      id: task.id,
      title: task.title,
      child_id: task.child_id,
      due_at: task.due_at,
      status: task.status,
      progress: getHomeworkProgress(task),
    }));

  return {
    family: {
      id: data.family.id,
      name: data.family.name,
      timezone: (data.family as any).timezone ?? "Australia/Adelaide",
    },
    actor: data.role,
    today: new Date().toISOString(),
    members: data.members.map((member) => ({
      id: member.id,
      display_name: member.display_name,
      role: member.role,
      can_login: member.can_login,
    })),
    places: data.places.map((place: any) => ({
      id: place.id,
      name: place.name,
      address: place.address,
      lat: place.lat ?? null,
      lng: place.lng ?? null,
      place_type: place.place_type ?? null,
    })),
    upcoming_events: upcomingEvents,
    open_homework: homework,
    open_payments: data.payments
      .filter((payment) => payment.status !== "paid")
      .slice(0, 40)
      .map((payment) => ({
        id: payment.id,
        title: payment.title,
        child_id: payment.child_id,
        amount: payment.amount,
        currency: payment.currency,
        due_date: payment.due_date,
        status: payment.status,
      })),
    open_requests: data.requests
      .filter((request) => request.status === "pending")
      .slice(0, 30)
      .map((request) => ({
        id: request.id,
        title: request.title,
        requester_id: request.requester_id,
        request_type: request.request_type,
        detail: request.detail,
        status: request.status,
      })),
  };
}

export function getCommittedActionTypes() {
  return new Set([
    "calendar_event",
    "homework_task",
    "payment",
    "request",
    "place",
    "notebook_note",
    "meal_plan",
  ]);
}

export function actionIsCommitReady(action: AICopilotAction) {
  if (!getCommittedActionTypes().has(action.type)) return false;
  return (action.missing_fields ?? []).length === 0;
}

export async function planCopilotCommand(args: {
  data: FamilyData;
  command: string;
  activePage: string;
  extraDetail?: string | null;
  previousPlan?: AICopilotPlan | null;
}) {
  const callable = httpsCallable(firebaseFunctions, "parseAiCommand");
  const transcript = [args.command, args.extraDetail].filter(Boolean).join("\n\nExtra details: ");
  const result = await callable({
    family_id: args.data.family.id,
    transcript,
    input_type: "text",
    active_page: args.activePage,
    timezone: args.data.family.timezone ?? "Australia/Adelaide",
    current_date: new Date().toISOString().slice(0, 10),
    context: buildCopilotContext(args.data),
    previous_plan: args.previousPlan ?? null,
  });

  const data = result.data as any;
  let plan = adaptParsedToCopilotPlan(data?.parsed ?? {});
  if (plan.actions.length === 0) {
    const fallback = buildClientFallbackPlan(transcript);
    if (fallback) plan = fallback;
  }

  return {
    ok: Boolean(data?.ok ?? true),
    session_id: data?.ai_interaction_id ?? `firebase-ai-${Date.now()}`,
    plan,
  } satisfies PlannerResult;
}

export async function commitCopilotActions(args: {
  data: FamilyData;
  sessionId: string;
  actions: AICopilotAction[];
}) {
  const callable = httpsCallable(firebaseFunctions, "commitAiActions");
  const actions = args.actions
    .filter(actionIsCommitReady)
    .map((action) => ({
      ...(action.payload ?? {}),
      type: action.type,
      title: action.title,
      client_action_id: action.id,
    }));

  const result = await callable({
    family_id: args.data.family.id,
    ai_interaction_id: args.sessionId,
    confirmed: true,
    actions,
  });

  return result.data as any;
}

export function getCopilotPromptExamples() {
  return [
    "添加一个地点，名字叫 Fencing Club，地址是 123 Main Road, Adelaide。",
    "给大女儿加一个作业：周五前完成 spelling 和 reading，需要上传朗读录音。",
    "提醒我下周三前交击剑费用 180 刀，reference 是 Emily fencing term fee。",
    "记录一下：今天击剑课大女儿步伐进步明显，但最后体力下降，下次重点练节奏。",
  ];
}
