export type UndoActionBody = {
  family_id: string;
  action_log_id: string;
};

export type ActionLogRow = {
  id: string;
  family_id: string;
  actor_id: string | null;
  action_type: string;
  target_table: string | null;
  target_id: string | null;
  before_data: unknown | null;
  after_data: unknown | null;
  can_undo: boolean;
  undone: boolean;
  undone_at: string | null;
  created_at: string;
};

export const UNDOABLE_TARGET_TABLES = [
  "calendar_events",
  "homework_tasks",
  "requests",
  "payments",
  "meal_plans",
  "learning_records",
] as const;

export const CREATE_ACTION_TYPES = [
  "create_calendar_event",
  "create_homework_task",
  "create_request",
  "create_payment",
  "create_meal_or_recipe",
  "create_learning_record",
] as const;

export function isUndoableCreateAction(actionType: string): boolean {
  return (CREATE_ACTION_TYPES as readonly string[]).includes(actionType);
}

export function isUndoableTargetTable(table: string | null): table is typeof UNDOABLE_TARGET_TABLES[number] {
  if (!table) return false;
  return (UNDOABLE_TARGET_TABLES as readonly string[]).includes(table);
}
