import { httpsCallable } from "firebase/functions";
import type { FamilyData } from "./familyDataTypes";
import { firebaseFunctions } from "./firebaseClient";
import { detectAllConflicts } from "./conflictEngine";
import { buildFamilyReminders, loadNotificationPrefs } from "./notificationCenter";
import { getGoogleMapsBrowserKey } from "./googleMaps";
import { getPushSupportState, getVapidPublicKey } from "./pushNotifications";
import { isStandaloneMode } from "./pwaInstall";
import { FAMILY_DOCK_BUILD_LABEL, FAMILY_DOCK_VERSION } from "./appVersion";

export type QaSeverity = "pass" | "info" | "warning" | "fail";

export type QaCheck = {
  id: string;
  group: string;
  label: string;
  severity: QaSeverity;
  detail: string;
  action?: string;
};

export type SystemHealthPayload = {
  ok: boolean;
  checked_at: string;
  env: Record<string, boolean>;
  tables: Array<{
    ok: boolean;
    table: string;
    count: number | null;
    error: string | null;
  }>;
  problem_counts: Record<string, number>;
};

export function severityRank(severity: QaSeverity) {
  return severity === "fail" ? 4 : severity === "warning" ? 3 : severity === "info" ? 2 : 1;
}

function add(checks: QaCheck[], args: QaCheck) {
  checks.push(args);
}

export async function runBackendHealthCheck(familyId: string) {
  const callSystemHealthCheck = httpsCallable<{ family_id: string }, SystemHealthPayload>(
    firebaseFunctions,
    "systemHealthCheck",
  );

  const result = await callSystemHealthCheck({ family_id: familyId });
  return result.data;
}

function boolCheck(args: {
  value: boolean;
  id: string;
  group: string;
  label: string;
  pass: string;
  fail: string;
  action?: string;
}): QaCheck {
  return {
    id: args.id,
    group: args.group,
    label: args.label,
    severity: args.value ? "pass" : "fail",
    detail: args.value ? args.pass : args.fail,
    action: args.value ? undefined : args.action,
  };
}

export function buildFrontendQaChecks(data: FamilyData): QaCheck[] {
  const checks: QaCheck[] = [];
  const push = getPushSupportState();

  add(checks, {
    id: "version",
    group: "App",
    label: "App version",
    severity: "info",
    detail: `${FAMILY_DOCK_BUILD_LABEL} - ${FAMILY_DOCK_VERSION}`,
  });

  add(checks, boolCheck({
    id: "online",
    group: "Device",
    label: "Network",
    value: navigator.onLine,
    pass: "Device is online.",
    fail: "Device is offline.",
    action: "Reconnect before testing realtime, push or maps.",
  }));

  add(checks, boolCheck({
    id: "pwa-standalone",
    group: "PWA",
    label: "Installed mode",
    value: isStandaloneMode(),
    pass: "App is running as installed PWA.",
    fail: "App is running in browser tab.",
    action: "Install to Home Screen for the real phone/PWA experience.",
  }));

  add(checks, boolCheck({
    id: "browser-push",
    group: "Push",
    label: "Browser push support",
    value: push.supported,
    pass: `Push supported. Permission: ${push.permission}.`,
    fail: `Push not supported. ServiceWorker=${push.hasServiceWorker}, PushManager=${push.hasPushManager}.`,
    action: "On iPhone, install as PWA and open from Home Screen.",
  }));

  add(checks, boolCheck({
    id: "vapid-public",
    group: "Push",
    label: "VAPID frontend key",
    value: Boolean(getVapidPublicKey()),
    pass: "VITE_VAPID_PUBLIC_KEY is configured.",
    fail: "VITE_VAPID_PUBLIC_KEY is missing.",
    action: "Add VITE_VAPID_PUBLIC_KEY to .env.local and restart dev server.",
  }));

  add(checks, boolCheck({
    id: "maps-browser",
    group: "Maps",
    label: "Google Maps browser key",
    value: Boolean(getGoogleMapsBrowserKey()),
    pass: "VITE_GOOGLE_MAPS_BROWSER_KEY is configured.",
    fail: "VITE_GOOGLE_MAPS_BROWSER_KEY is missing.",
    action: "Add browser key to .env.local and enable Maps JavaScript API.",
  }));

  const childHomestay = data.members.filter((member) => ["child", "homestay"].includes(member.role));
  const unlinked = childHomestay.filter((member) => !member.can_login || !member.auth_user_id);
  add(checks, {
    id: "members-unlinked",
    group: "Accounts",
    label: "Child / Homestay login accounts",
    severity: unlinked.length ? "warning" : "pass",
    detail: unlinked.length
      ? `${unlinked.length} child/homestay members still do not have login accounts.`
      : "All child/homestay members appear linked.",
    action: unlinked.length ? "Use People -> Bulk invite / Single invite / Account setup." : undefined,
  });

  const eventsWithoutPlace = data.calendarEvents.filter((event) => !event.place_id && event.status !== "cancelled");
  const eventsWithoutEnd = data.calendarEvents.filter((event) => !event.end_at && event.status !== "cancelled");
  add(checks, {
    id: "events-place",
    group: "Calendar",
    label: "Events with places",
    severity: eventsWithoutPlace.length ? "warning" : "pass",
    detail: eventsWithoutPlace.length ? `${eventsWithoutPlace.length} active calendar events have no place.` : "All active events have a place.",
    action: eventsWithoutPlace.length ? "Edit those events so route planning and conflict checks work." : undefined,
  });
  add(checks, {
    id: "events-end",
    group: "Calendar",
    label: "Events with end time",
    severity: eventsWithoutEnd.length ? "info" : "pass",
    detail: eventsWithoutEnd.length ? `${eventsWithoutEnd.length} active calendar events have no end time.` : "All active events have an end time.",
    action: eventsWithoutEnd.length ? "Add end time to improve conflict checks." : undefined,
  });

  const placesWithoutCoords = data.places.filter((place) => typeof place.lat !== "number" || typeof place.lng !== "number");
  add(checks, {
    id: "places-coordinates",
    group: "Route",
    label: "Places with coordinates",
    severity: placesWithoutCoords.length ? "warning" : "pass",
    detail: placesWithoutCoords.length ? `${placesWithoutCoords.length} places are missing lat/lng.` : "All places have coordinates.",
    action: placesWithoutCoords.length ? "Open Route and click Geocode missing." : undefined,
  });

  const routeStopsWithoutPlace = data.routeStops.filter((stop) => !stop.place_id);
  add(checks, {
    id: "route-stops-place",
    group: "Route",
    label: "Route stops with places",
    severity: routeStopsWithoutPlace.length ? "fail" : "pass",
    detail: routeStopsWithoutPlace.length ? `${routeStopsWithoutPlace.length} route stops have no place.` : "All route stops have places.",
    action: routeStopsWithoutPlace.length ? "Regenerate route from Calendar or delete bad stops." : undefined,
  });

  const activeHomeworkNoDue = data.homeworkTasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled" && !task.due_at,
  );
  add(checks, {
    id: "homework-due",
    group: "Homework",
    label: "Homework due dates",
    severity: activeHomeworkNoDue.length ? "info" : "pass",
    detail: activeHomeworkNoDue.length ? `${activeHomeworkNoDue.length} active homework tasks have no due date.` : "All active homework has due date.",
    action: activeHomeworkNoDue.length ? "Add due dates so reminders and daily brief work." : undefined,
  });

  const today = new Date().toISOString().slice(0, 10);
  const overduePayments = data.payments.filter(
    (payment) => payment.status !== "paid" && payment.due_date && payment.due_date < today,
  );
  add(checks, {
    id: "payments-overdue",
    group: "Payments",
    label: "Overdue unpaid payments",
    severity: overduePayments.length ? "warning" : "pass",
    detail: overduePayments.length ? `${overduePayments.length} unpaid payments are overdue.` : "No overdue unpaid payments.",
    action: overduePayments.length ? "Open Payments and mark paid or update due date." : undefined,
  });

  const conflicts = detectAllConflicts(data, 30);
  add(checks, {
    id: "calendar-conflicts",
    group: "Conflicts",
    label: "Calendar conflict scan",
    severity: conflicts.some((item) => item.severity === "high") ? "fail" : conflicts.length ? "warning" : "pass",
    detail: conflicts.length ? `${conflicts.length} conflict/risk items in next 30 days.` : "No major calendar conflict found.",
    action: conflicts.length ? "Open Calendar -> Conflict Centre." : undefined,
  });

  const reminders = buildFamilyReminders(data, loadNotificationPrefs());
  add(checks, {
    id: "reminder-candidates",
    group: "Notifications",
    label: "Reminder candidates",
    severity: reminders.length ? "info" : "pass",
    detail: reminders.length ? `${reminders.length} reminder candidates exist from local preferences.` : "No immediate local reminder candidates.",
  });

  return checks.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function buildBackendQaChecks(payload: SystemHealthPayload | null): QaCheck[] {
  const checks: QaCheck[] = [];

  if (!payload) {
    return [{
      id: "backend-health-missing",
      group: "Backend",
      label: "Backend health check",
      severity: "warning",
      detail: "Backend health check has not been run yet.",
      action: "Click Run backend health.",
    }];
  }

  add(checks, {
    id: "backend-ok",
    group: "Backend",
    label: "Cloud function health",
    severity: payload.ok ? "pass" : "fail",
    detail: payload.ok ? `Checked at ${payload.checked_at}.` : "systemHealthCheck returned not ok.",
  });

  for (const [name, present] of Object.entries(payload.env ?? {})) {
    const required = ["FIREBASE_CONFIG", "OPENAI_API_KEY", "GOOGLE_MAPS_API_KEY", "VAPID_PUBLIC_KEY"].includes(name);
    add(checks, {
      id: `env-${name}`,
      group: "Backend env",
      label: name,
      severity: present ? "pass" : required ? "warning" : "info",
      detail: present ? "Configured." : "Missing.",
      action: present ? undefined : `Set Firebase function secret or environment value for ${name}.`,
    });
  }

  for (const row of payload.tables ?? []) {
    add(checks, {
      id: `table-${row.table}`,
      group: "Firestore collections",
      label: row.table,
      severity: row.ok ? "pass" : "fail",
      detail: row.ok ? `${row.count ?? 0} docs visible.` : row.error ?? "Unknown collection error.",
      action: row.ok ? undefined : "Check Firestore rules, indexes and collection path.",
    });
  }

  for (const [key, count] of Object.entries(payload.problem_counts ?? {})) {
    add(checks, {
      id: `problem-${key}`,
      group: "Backend data audit",
      label: key.replaceAll("_", " "),
      severity: count < 0 ? "fail" : count > 0 ? "warning" : "pass",
      detail: count < 0 ? "Could not query this check." : `${count} item(s).`,
    });
  }

  return checks.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function summarizeChecks(checks: QaCheck[]) {
  return {
    fail: checks.filter((item) => item.severity === "fail").length,
    warning: checks.filter((item) => item.severity === "warning").length,
    info: checks.filter((item) => item.severity === "info").length,
    pass: checks.filter((item) => item.severity === "pass").length,
    total: checks.length,
  };
}
