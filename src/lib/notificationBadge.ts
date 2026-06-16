import { collection, getDocs, query, where, writeBatch, doc } from "firebase/firestore";
import { firestore } from "./firebaseClient";

export async function loadUnreadNotificationCount(familyId: string) {
  const snap = await getDocs(query(collection(firestore, "families", familyId, "notification_logs"), where("status", "==", "sent"), where("read_at", "==", null), where("archived_at", "==", null)));
  return snap.size;
}

export async function markAllNotificationsRead(familyId: string) {
  const snap = await getDocs(query(collection(firestore, "families", familyId, "notification_logs"), where("status", "==", "sent"), where("read_at", "==", null), where("archived_at", "==", null)));
  const batch = writeBatch(firestore);
  const now = new Date().toISOString();
  snap.docs.forEach((item) => batch.update(doc(firestore, "families", familyId, "notification_logs", item.id), { read_at: now }));
  await batch.commit();
}
