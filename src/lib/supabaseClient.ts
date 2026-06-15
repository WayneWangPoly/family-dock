// Firebase migration compatibility shim.
//
// The active Family Dock data layer uses Firebase.
// This file catches older Supabase function calls that may still exist in AI components
// and forwards them to the Firebase callable functions.
//
// Supported legacy forwards:
// - ai-parse-command      -> parseAiCommand
// - ai-commit-actions     -> commitAiActions
// - ai-copilot-planner    -> parseAiCommand, then adapt response into the old copilot plan shape
// - ai-copilot-commit     -> commitAiActions, after extracting action.payload

import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebaseClient";

type InvokeOptions = {
  body?: Record<string, any>;
};

function legacyError(): never {
  throw new Error(
    "This old Supabase-only module has not been migrated to Firebase yet. Use the Family / Calendar / AI / Route consumer flow.",
  );
}

function makeActionPreview(action: Record<string, any>) {
  const type = String(action.type ?? "action");
  const title = String(action.title ?? action.name ?? "New item");

  if (type === "calendar_event") {
    return `${title}${action.start_at ? ` · ${action.start_at}` : ""}`;
  }
  if (type === "homework_task") {
    return `${title}${action.due_at ? ` · due ${action.due_at}` : ""}`;
  }
  if (type === "payment") {
    const amount = action.amount != null ? `${action.amount} ${action.currency ?? "AUD"}` : "payment";
    return `${title} · ${amount}`;
  }
  if (type === "request") {
    return `${title}${action.detail ? ` · ${action.detail}` : ""}`;
  }
  if (type === "place") {
    return `${title}${action.address ? ` · ${action.address}` : ""}`;
  }
  return title;
}

function adaptParsedToCopilotPlan(parsed: any) {
  const rawActions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const actions = rawActions.map((action: any, index: number) => {
    const type = String(action?.type ?? "query_answer");
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

  const question =
    parsed?.clarifying_question ??
    (Array.isArray(parsed?.questions) ? parsed.questions[0] : null);

  return {
    language: parsed?.language === "zh" || parsed?.language === "en" || parsed?.language === "mixed"
      ? parsed.language
      : "mixed",
    intent_summary: String(parsed?.draft_summary ?? parsed?.intent ?? "AI plan"),
    confidence: Number(parsed?.confidence ?? 0.75),
    needs_more_info: Boolean(parsed?.needs_clarification ?? false),
    questions: question ? [String(question)] : [],
    actions,
    answer: parsed?.answer ?? null,
    safety_notes: [],
  };
}

async function callFirebaseFunction(name: string, body: Record<string, any>) {
  const callable = httpsCallable(firebaseFunctions, name);
  const result = await callable(body);
  return result.data as any;
}

async function invoke(functionName: string, options?: InvokeOptions) {
  const body = options?.body ?? {};

  if (functionName === "ai-undo-action") {
    return {
      data: { ok: true, undone: false, message: "Undo is disabled in the Firebase consumer app." },
      error: null,
    };
  }

  try {
    if (functionName === "ai-parse-command") {
      const data = await callFirebaseFunction("parseAiCommand", body);
      return { data, error: null };
    }

    if (functionName === "ai-commit-actions") {
      const data = await callFirebaseFunction("commitAiActions", body);
      return { data, error: null };
    }

    if (functionName === "ai-copilot-planner") {
      const data = await callFirebaseFunction("parseAiCommand", {
        family_id: body.family_id,
        transcript: body.command ?? body.transcript ?? "",
        timezone: body.context?.family?.timezone ?? "Australia/Adelaide",
        current_date: new Date().toISOString().slice(0, 10),
      });

      const plan = adaptParsedToCopilotPlan(data?.parsed ?? {});
      return {
        data: {
          ok: true,
          session_id: data?.ai_interaction_id ?? `firebase-ai-${Date.now()}`,
          plan,
        },
        error: null,
      };
    }

    if (functionName === "ai-copilot-commit") {
      const actions = Array.isArray(body.actions)
        ? body.actions
            .filter((action: any) => action?.type !== "query_answer" && action?.type !== "route_review")
            .map((action: any) => ({
              ...(action?.payload ?? {}),
              type: action?.type ?? action?.payload?.type,
              title: action?.title ?? action?.payload?.title,
              client_action_id: action?.id ?? action?.payload?.client_action_id ?? null,
            }))
        : [];

      const data = await callFirebaseFunction("commitAiActions", {
        family_id: body.family_id,
        actions,
      });

      return { data, error: null };
    }

    if (functionName === "create-member-login") {
      const data = await callFirebaseFunction("createMemberLogin", body);
      return { data, error: null };
    }

    return {
      data: null,
      error: new Error(`Legacy Supabase function "${functionName}" has not been migrated to Firebase.`),
    };
  } catch (error) {
    return { data: null, error };
  }
}

export const supabase: any = {
  functions: { invoke },

  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe: () => undefined,
        },
      },
    }),
    signOut: async () => ({ error: null }),
  },

  from: () => ({
    select: legacyError,
    insert: legacyError,
    update: legacyError,
    delete: legacyError,
    upsert: legacyError,
  }),

  storage: {
    from: () => ({
      upload: legacyError,
      download: legacyError,
      getPublicUrl: legacyError,
      remove: legacyError,
    }),
  },
};
