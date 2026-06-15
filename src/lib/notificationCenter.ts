import type { FamilyData } from "./familyDataTypes";
import {
  formatDateTime,
  getActiveHomework,
  getOpenPayments,
  getUpcomingEvents,
  getPlaceName,
} from "./familyUiHelpers";

export type NotificationPrefs = {
  eventReminderMinutes: number;
  homeworkReminderHours: number;
  paymentReminderDays: number;
  enabledEvents: boolean;
  enabledHomework: boolean;
  enabledPayments: boolean;
};

export type FamilyReminder = {
  id: string;
  type: "event" | "homework" | "payment";
  title: string;
  detail: string;
  dueAt: string | null;
  urgency: "now" | "soon" | "later";
};

const STORAGE_KEY = "family-dock-notification-prefs-v1";

export const defaultNotificationPrefs: NotificationPrefs = {
  eventReminderMinutes: 45,
  homeworkReminderHours: 24,
  paymentReminderDays: 3,
  enabledEvents: true,
  enabledHomework: true,
  enabledPayments: true,
};

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultNotificationPrefs;
    return {
      ...defaultNotificationPrefs,
      ...JSON.parse(raw),
    };
  } catch {
    return defaultNotificationPrefs;
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function getNotificationPermissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.requestPermission();
}

function urgencyFromMs(ms: number) {
  if (ms <= 0) return "now";
  if (ms <= 1000 * 60 * 60 * 24) return "soon";
  return "later";
}

export function buildFamilyReminders(data: FamilyData, prefs: NotificationPrefs) {
  const now = Date.now();
  const reminders: FamilyReminder[] = [];

  if (prefs.enabledEvents) {
    const upcoming = getUpcomingEvents(data.calendarEvents, 14);

    for (const event of upcoming) {
      const startMs = new Date(event.start_at).getTime();
      const remindMs = startMs - prefs.eventReminderMinutes * 60 * 1000;

      if (startMs >= now) {
        reminders.push({
          id: `event-${event.id}`,
          type: "event",
          title: event.title,
          detail: `${formatDateTime(event.start_at)} · ${getPlaceName(data, event.place_id)}`,
          dueAt: new Date(remindMs).toISOString(),
          urgency: urgencyFromMs(remindMs - now),
        });
      }
    }
  }

  if (prefs.enabledHomework) {
    for (const task of getActiveHomework(data.homeworkTasks)) {
      if (!task.due_at) continue;

      const dueMs = new Date(task.due_at).getTime();
      const remindMs = dueMs - prefs.homeworkReminderHours * 60 * 60 * 1000;

      if (dueMs >= now) {
        reminders.push({
          id: `homework-${task.id}`,
          type: "homework",
          title: task.title,
          detail: `Homework due ${formatDateTime(task.due_at)}`,
          dueAt: new Date(remindMs).toISOString(),
          urgency: urgencyFromMs(remindMs - now),
        });
      }
    }
  }

  if (prefs.enabledPayments) {
    for (const payment of getOpenPayments(data.payments)) {
      if (!payment.due_date) continue;

      const dueMs = new Date(`${payment.due_date}T09:00:00`).getTime();
      const remindMs = dueMs - prefs.paymentReminderDays * 24 * 60 * 60 * 1000;

      if (dueMs >= now) {
        reminders.push({
          id: `payment-${payment.id}`,
          type: "payment",
          title: payment.title,
          detail: `Payment due ${payment.due_date} · $${payment.amount}`,
          dueAt: new Date(remindMs).toISOString(),
          urgency: urgencyFromMs(remindMs - now),
        });
      }
    }
  }

  return reminders.sort((a, b) => String(a.dueAt ?? "").localeCompare(String(b.dueAt ?? "")));
}

export function sendTestNotification() {
  if (!("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }

  if (Notification.permission !== "granted") {
    throw new Error("Notification permission is not granted.");
  }

  new Notification("Family Dock reminder", {
    body: "This is a test reminder from Family Dock.",
  });
}
