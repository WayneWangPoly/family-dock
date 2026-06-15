import type {
  CalendarEvent,
  FamilyData,
  FamilyMember,
  HomeworkTask,
  LearningRecord,
  MealPlan,
  Payment,
  Place,
  RouteStop,
  ShoppingItem,
} from "./familyDataTypes";

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

export function getMemberName(data: FamilyData, memberId?: string | null): string {
  if (!memberId) return "未指定";
  return data.members.find((member) => member.id === memberId)?.display_name ?? "未指定";
}

export function getMemberByName(data: FamilyData, name?: string | null): FamilyMember | undefined {
  if (!name) return undefined;
  return data.members.find((member) => member.display_name === name);
}

export function getPlaceName(data: FamilyData, placeId?: string | null): string {
  if (!placeId) return "未指定地点";
  return data.places.find((place) => place.id === placeId)?.name ?? "未指定地点";
}

export function getPlace(data: FamilyData, placeId?: string | null): Place | undefined {
  if (!placeId) return undefined;
  return data.places.find((place) => place.id === placeId);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "未定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(value?: string | null): string {
  if (!value) return "未定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value?: string | null): string {
  if (!value) return "未定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getEventsForDate(events: CalendarEvent[], dateKey: string): CalendarEvent[] {
  return events
    .filter((event) => event.start_at.slice(0, 10) === dateKey)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function getStopsForDate(stops: RouteStop[], dateKey: string): RouteStop[] {
  return stops
    .filter((stop) => stop.stop_date === dateKey)
    .sort((a, b) => a.stop_order - b.stop_order);
}

export function getUpcomingEvents(events: CalendarEvent[], limit = 8): CalendarEvent[] {
  const now = new Date().toISOString();
  return events
    .filter((event) => event.start_at >= now && event.status !== "cancelled")
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, limit);
}

export function getOpenPayments(payments: Payment[]): Payment[] {
  return payments
    .filter((payment) => payment.status === "unpaid")
    .sort((a, b) => String(a.due_date ?? "").localeCompare(String(b.due_date ?? "")));
}

export function getActiveHomework(tasks: HomeworkTask[]): HomeworkTask[] {
  return tasks
    .filter((task) => task.status !== "done" && task.status !== "cancelled")
    .sort((a, b) => String(a.due_at ?? "").localeCompare(String(b.due_at ?? "")));
}

export function getHomeworkProgress(task: HomeworkTask): { done: number; total: number } {
  const items = task.homework_items ?? [];
  return {
    done: items.filter((item) => item.is_done).length,
    total: items.length,
  };
}

export function sumPayments(payments: Payment[]): number {
  return payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
}

export function buildGoogleMapsUrl(place?: Place): string | null {
  if (!place) return null;
  if (typeof place.lat === "number" && typeof place.lng === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  }
  if (place.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`;
}

export function groupShoppingItems(items: ShoppingItem[]): Record<string, ShoppingItem[]> {
  return items.reduce<Record<string, ShoppingItem[]>>((groups, item) => {
    const key = item.category || "other";
    groups[key] = groups[key] ?? [];
    groups[key].push(item);
    return groups;
  }, {});
}

export function getThisWeekMeals(mealPlans: MealPlan[]): MealPlan[] {
  return [...mealPlans].sort((a, b) => {
    if (a.week_start !== b.week_start) return a.week_start.localeCompare(b.week_start);
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return a.meal_type.localeCompare(b.meal_type);
  });
}

export function getRecentLearningRecords(records: LearningRecord[], limit = 8): LearningRecord[] {
  return [...records]
    .sort((a, b) => b.lesson_date.localeCompare(a.lesson_date))
    .slice(0, limit);
}
