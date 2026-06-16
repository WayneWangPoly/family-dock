import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { firestore } from "./firebaseClient";
import { getCurrentFamilyRole } from "./familyDataApi";

export type EditingLock = {
  id: string;
  family_id: string;
  target_table: string;
  target_id: string;
  locked_by: string | null;
  locked_at: string;
  expires_at: string;
  family_members?: {
    id: string;
    display_name: string;
    role: string;
  } | null;
};

export type LockTarget = {
  familyId: string;
  targetTable: string;
  targetId: string;
};

export function getLockExpiry(seconds = 75): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function lockId(target: LockTarget) {
  return `${target.targetTable}_${target.targetId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function lockRef(target: LockTarget) {
  return doc(firestore, "families", target.familyId, "editing_locks", lockId(target));
}

async function hydrateMember(lock: EditingLock): Promise<EditingLock> {
  if (!lock.locked_by) return { ...lock, family_members: null };
  const memberSnap = await getDoc(doc(firestore, "families", lock.family_id, "members", lock.locked_by));
  if (!memberSnap.exists()) return { ...lock, family_members: null };
  const member = memberSnap.data() as any;
  return {
    ...lock,
    family_members: {
      id: memberSnap.id,
      display_name: member.display_name ?? "Someone",
      role: member.role ?? "member",
    },
  };
}

export async function cleanupExpiredEditingLocks(familyId: string) {
  const ref = collection(firestore, "families", familyId, "editing_locks");
  const snapshot = await getDocs(query(ref, where("expires_at", "<", new Date().toISOString())));
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
}

export async function loadEditingLock(target: LockTarget): Promise<EditingLock | null> {
  const snap = await getDoc(lockRef(target));
  if (!snap.exists()) return null;
  const data = { id: snap.id, ...snap.data() } as EditingLock;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await deleteDoc(snap.ref);
    return null;
  }
  return hydrateMember(data);
}

export async function acquireEditingLock(target: LockTarget): Promise<EditingLock> {
  const role = await getCurrentFamilyRole();
  const existing = await loadEditingLock(target);
  if (existing && existing.locked_by && existing.locked_by !== role.member_id) {
    throw new Error(`${existing.family_members?.display_name ?? "Someone"} is editing this item.`);
  }

  const payload: EditingLock = {
    id: lockId(target),
    family_id: target.familyId,
    target_table: target.targetTable,
    target_id: target.targetId,
    locked_by: role.member_id,
    locked_at: new Date().toISOString(),
    expires_at: getLockExpiry(),
  };

  await setDoc(lockRef(target), payload, { merge: true });
  return hydrateMember(payload);
}

export async function heartbeatEditingLock(target: LockTarget): Promise<EditingLock | null> {
  const role = await getCurrentFamilyRole();
  if (!role.member_id) return null;
  const existing = await loadEditingLock(target);
  if (!existing || existing.locked_by !== role.member_id) return null;
  await updateDoc(lockRef(target), { expires_at: getLockExpiry() });
  return loadEditingLock(target);
}

export async function releaseEditingLock(target: LockTarget) {
  const role = await getCurrentFamilyRole();
  if (!role.member_id) return;
  const existing = await loadEditingLock(target);
  if (existing?.locked_by === role.member_id) {
    await deleteDoc(lockRef(target));
  }
}