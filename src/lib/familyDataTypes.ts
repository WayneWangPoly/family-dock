export type FamilyRole = "parent" | "child" | "homestay" | "guardian" | "owner";

export type FamilyUserRole = {
  id: string;
  family_id: string;
  auth_user_id: string;
  member_id: string | null;
  role: FamilyRole;
};

export type Family = {
  id: string;
  name: string;
  timezone: string;
  state_region: string | null;
  school_level: string | null;
  school_week1_start: string | null;
};

export type LearningSummary = {
  id: string;
  family_id: string;
  child_id: string | null;
  course_name: string | null;
  range_type: string;
  start_date: string;
  end_date: string;
  summary_title: string | null;
  evidence_count: number;
  overall_summary: string | null;
  progress: unknown[];
  recurring_issues: unknown[];
  current_bottleneck: string | null;
  next_steps: unknown[];
  parent_focus_points: unknown[];
  questions_for_teacher: unknown[];
  evidence_refs: unknown[];
  created_at: string;
};


export type FamilyMember = {
  id: string;
  family_id: string;
  auth_user_id: string | null;
  display_name: string;
  role: FamilyRole;
  color: string | null;
  avatar_url: string | null;
  default_navigation_app: string | null;
  can_login: boolean;
  email?: string | null;
  active?: boolean | null;
};

export type Place = {
  id: string;
  family_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  place_type: string | null;
  pickup_note: string | null;
  parking_note: string | null;
  safety_note: string | null;
};

export type CalendarEvent = {
  id: string;
  family_id: string;
  child_id: string | null;
  title: string;
  event_type: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  place_id: string | null;
  teacher_name: string | null;
  recurrence_rule: string | null;
  source: string;
  status: string;
};

export type RouteStop = {
  id: string;
  family_id: string;
  calendar_event_id: string | null;
  stop_date: string;
  stop_order: number;
  stop_type: string;
  place_id: string | null;
  responsible_member_id: string | null;
  status: string;
  risk_level: string;
  note: string | null;
};

export type HomeworkTask = {
  id: string;
  family_id: string;
  child_id: string | null;
  course_event_id: string | null;
  title: string;
  due_at: string | null;
  status: string;
  source: string;
  homework_items?: HomeworkItem[];
};

export type HomeworkItem = {
  id: string;
  homework_task_id: string;
  family_id: string;
  label: string;
  item_type: string;
  is_required: boolean;
  is_done: boolean;
  sort_order: number;
};

export type FamilyRequest = {
  id: string;
  family_id: string;
  requester_id: string | null;
  request_type: string;
  title: string;
  detail: string | null;
  status: string;
  condition_text: string | null;
};

export type Payment = {
  id: string;
  family_id: string;
  child_id: string | null;
  title: string;
  category: string | null;
  project: string | null;
  amount: number;
  currency: string;
  due_date: string | null;
  pay_to: string | null;
  reference: string | null;
  status: string;
  paid_by: string | null;
  paid_at: string | null;
};

export type LearningRecord = {
  id: string;
  family_id: string;
  child_id: string | null;
  course_event_id: string | null;
  course_name: string | null;
  lesson_title: string | null;
  lesson_date: string;
  child_comment: string | null;
  parent_comment: string | null;
  teacher_feedback: string | null;
  summary: string | null;
  strengths: string[];
  issues: string[];
  next_steps: string[];
  expectations: string[];
  tags: string[];
};

export type MealPlan = {
  id: string;
  family_id: string;
  week_start: string;
  day_of_week: number;
  meal_type: string;
  title: string;
  notes: string | null;
  tags: string[];
};

export type ShoppingItem = {
  id: string;
  family_id: string;
  week_start: string | null;
  name: string;
  quantity: string | null;
  category: string | null;
  status: string;
  source_meal_plan_id: string | null;
};

export type FamilyData = {
  role: FamilyUserRole;
  family: Family;
  members: FamilyMember[];
  places: Place[];
  calendarEvents: CalendarEvent[];
  routeStops: RouteStop[];
  learningSummaries: LearningSummary[];
  homeworkTasks: HomeworkTask[];
  requests: FamilyRequest[];
  payments: Payment[];
  learningRecords: LearningRecord[];
  mealPlans: MealPlan[];
  shoppingItems: ShoppingItem[];
};
