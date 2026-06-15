import { supabase } from "./supabaseClient";

export async function loadUnreadNotificationCount(familyId: string) {
  const { count, error } = await supabase
    .from("notification_logs")
    .select("id", { count: "exact", head: true })
    .eq("family_id", familyId)
    .eq("status", "sent")
    .is("read_at", null)
    .is("archived_at", null);

  if (error) throw error;

  return count ?? 0;
}

export async function markAllNotificationsRead(familyId: string) {
  const { error } = await supabase
    .from("notification_logs")
    .update({ read_at: new Date().toISOString() })
    .eq("family_id", familyId)
    .eq("status", "sent")
    .is("read_at", null)
    .is("archived_at", null);

  if (error) throw error;
}
