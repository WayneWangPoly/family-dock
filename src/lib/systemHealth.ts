import { httpsCallable } from "firebase/functions";
import type { FamilyData } from "./familyDataTypes";
import { firebaseFunctions } from "./firebaseClient";

export type FamilyDockHealthProblem = {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
};

export type FamilyDockHealthCheck = {
  ok: boolean;
  checked_at: string;
  family_id: string;
  score: number;
  secrets: Record<string, boolean>;
  collections: Array<{
    table: string;
    ok: boolean;
    count: number;
    capped: boolean;
    error: string | null;
  }>;
  push: {
    active_subscription_count: number;
  };
  scheduler: {
    enabled_job_count: number;
    enabled_route_job_count: number;
    enabled_reminder_job_count: number;
    recent_log_count: number;
  };
  routes: {
    today_event_count: number;
    today_events_with_place_count: number;
    place_count: number;
    places_with_coordinates: number;
    today_plan_count: number;
    today_leg_count: number;
    google_refreshed_today_leg_count: number;
  };
  reminders: {
    ok: boolean;
    count: number;
    top: Array<Record<string, unknown>>;
    error: string | null;
  };
  notifications: {
    recent_notification_count: number;
  };
  problems: FamilyDockHealthProblem[];
};

export async function runSystemHealthCheck(data: FamilyData) {
  const fn = httpsCallable(firebaseFunctions, "systemHealthCheck");
  const result = await fn({
    family_id: data.family.id,
  });

  return result.data as FamilyDockHealthCheck;
}
