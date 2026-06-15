import { useMemo, useState } from "react";
import type { FamilyData } from "../lib/familyDataTypes";
import { parseFamilyCommand } from "../lib/aiParseCommand";
import { commitFamilyActions } from "../lib/aiCommitActions";
import { getRequiredFieldsForAction, isMissing } from "../lib/aiActionLabels";

export type AiActionDraft = Record<string, any>;

export type AiParseResult = {
  ok?: boolean;
  ai_interaction_id?: string | null;
  parsed: {
    intent: string;
    confidence: number;
    language?: string;
    needs_clarification: boolean;
    clarifying_question: string | null;
    missing_fields: string[];
    draft_summary: string;
    actions: AiActionDraft[];
  };
  model?: string;
};

export type AiCommitResult = {
  ok: boolean;
  committed: Array<{
    client_action_id?: string | null;
    type: string;
    table: string;
    id: string;
    action_log_id: string;
  }>;
  count: number;
};

export type UndoableCommittedAction = {
  actionLogId: string;
  label: string;
  type: string;
  table: string;
  targetId: string;
};

export type LastUndoableAction = {
  actions: UndoableCommittedAction[];
  label: string;
  commitResult: AiCommitResult | null;
};

type Args = {
  familyData: FamilyData;
  activePage?: string;
  onRefresh?: () => Promise<unknown> | unknown;
};

export function useAiCommandFlow({ familyData, activePage, onRefresh }: Args) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const undoing = false;
  const [parseResult, setParseResult] = useState<AiParseResult | null>(null);
  const [editableActions, setEditableActions] = useState<AiActionDraft[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUndoable, setLastUndoable] = useState<LastUndoableAction | null>(null);

  const localMissingFields = useMemo(() => {
    const missing: string[] = [];
    for (const action of editableActions) {
      for (const field of getRequiredFieldsForAction(action.type)) {
        if (isMissing(action[field])) missing.push(`${action.type}.${field}`);
      }
    }
    return missing;
  }, [editableActions]);

  const canCommit = Boolean(parseResult) && editableActions.length > 0 && localMissingFields.length === 0 && !parsing && !committing;

  function resetFlow() {
    setTranscript("");
    setParseResult(null);
    setEditableActions([]);
    setErrorMessage(null);
  }

  function close() {
    setOpen(false);
  }

  function updateAction(index: number, key: string, value: unknown) {
    setEditableActions((prev) => prev.map((action, i) => (i === index ? { ...action, [key]: value } : action)));
  }

  function removeAction(index: number) {
    setEditableActions((prev) => prev.filter((_, i) => i !== index));
  }

  async function parse(text = transcript) {
    const clean = text.trim();
    if (!clean) {
      setErrorMessage("请先输入一句话。");
      return null;
    }

    setParsing(true);
    setErrorMessage(null);

    try {
      const result = (await parseFamilyCommand(null, {
        familyId: familyData.family.id,
        transcript: clean,
        inputType: "text",
        activePage: activePage ?? "global_ai_assistant",
        timezone: familyData.family.timezone ?? "Australia/Adelaide",
      })) as AiParseResult;

      setParseResult(result);
      setEditableActions(result.parsed.actions ?? []);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      setErrorMessage(message);
      throw error;
    } finally {
      setParsing(false);
    }
  }

  async function commit() {
    if (!parseResult) {
      setErrorMessage("请先让 AI 解析。");
      return null;
    }
    if (editableActions.length === 0) {
      setErrorMessage("没有可执行的动作。");
      return null;
    }
    if (localMissingFields.length > 0) {
      setErrorMessage(`仍有必填字段缺失：${localMissingFields.join("、")}`);
      return null;
    }

    setCommitting(true);
    setErrorMessage(null);

    try {
      const result = (await commitFamilyActions(null, {
        familyId: familyData.family.id,
        aiInteractionId: parseResult.ai_interaction_id ?? null,
        actions: editableActions,
      })) as AiCommitResult;

      const undoActions = (result.committed ?? [])
        .filter((item) => item.action_log_id)
        .map((item) => ({
          actionLogId: item.action_log_id,
          label: `${item.type} → ${item.table}`,
          type: item.type,
          table: item.table,
          targetId: item.id,
        }));

      setLastUndoable({
        actions: undoActions,
        label: result.count > 1 ? `已执行 ${result.count} 个 AI 动作` : `已执行 ${result.committed?.[0]?.type ?? "AI 动作"}`,
        commitResult: result,
      });

      await onRefresh?.();
      setOpen(false);
      setParseResult(null);
      setEditableActions([]);
      setTranscript("");
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      setErrorMessage(message);
      throw error;
    } finally {
      setCommitting(false);
    }
  }

  async function undoLast() {
    setLastUndoable(null);
    return null;
  }


  function startVoice() {
    setErrorMessage("请直接输入文字，或使用手机输入法自带语音转文字后提交。");
  }

  return {
    open, setOpen, close,
    transcript, setTranscript,
    listening: false, parsing, committing, undoing,
    parseResult, editableActions,
    updateAction, removeAction,
    errorMessage, setErrorMessage,
    localMissingFields, canCommit,
    lastUndoable, setLastUndoable,
    resetFlow, parse, commit, undoLast, startVoice,
  };
}
