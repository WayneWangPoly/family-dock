import type { FamilyData } from "./familyDataTypes";
import {
  formatDateTime,
  getActiveHomework,
  getOpenPayments,
  getStopsForDate,
  todayKey,
} from "./familyUiHelpers";
import { detectAllConflicts } from "./conflictEngine";

export type DailyBriefItem = {
  tone: "success" | "warning" | "danger" | "info";
  title: string;
  detail: string;
};

export function buildDailyBrief(data: FamilyData): DailyBriefItem[] {
  const today = todayKey();
  const stops = getStopsForDate(data.routeStops, today);
  const conflicts = detectAllConflicts(data, 7);
  const homework = getActiveHomework(data.homeworkTasks);
  const payments = getOpenPayments(data.payments);
  const items: DailyBriefItem[] = [];

  if (conflicts.length > 0) {
    items.push({
      tone: "danger",
      title: `${conflicts.length} schedule risk${conflicts.length > 1 ? "s" : ""}`,
      detail: conflicts[0].detail,
    });
  }

  if (stops.length > 0) {
    items.push({
      tone: "info",
      title: `${stops.length} route stop${stops.length > 1 ? "s" : ""} today`,
      detail: "Open Route when you are ready to leave.",
    });
  }

  if (homework.length > 0) {
    const first = homework[0];
    items.push({
      tone: "warning",
      title: `${homework.length} active homework task${homework.length > 1 ? "s" : ""}`,
      detail: `${first.title}${first.due_at ? ` · due ${formatDateTime(first.due_at)}` : ""}`,
    });
  }

  if (payments.length > 0) {
    const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    items.push({
      tone: "warning",
      title: `$${total.toFixed(0)} unpaid payments`,
      detail: `${payments.length} payment item${payments.length > 1 ? "s" : ""} still open.`,
    });
  }

  return items;
}
