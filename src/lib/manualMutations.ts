import { addDoc, collection, doc, setDoc, writeBatch } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firestore, firebaseStorage } from "./firebaseClient";
import { getCurrentFamilyRole } from "./familyDataApi";

function nowIso() {
  return new Date().toISOString();
}

function familyCollection(familyId: string, name: string) {
  return collection(firestore, "families", familyId, name);
}

export type CreateCalendarEventInput = {
  familyId: string;
  childId?: string | null;
  title: string;
  eventType: string;
  startAt: string;
  endAt?: string | null;
  placeId?: string | null;
  teacherName?: string | null;
  recurrenceRule?: string | null;
};

export async function createCalendarEvent(input: CreateCalendarEventInput) {
  const role = await getCurrentFamilyRole();
  const createdAt = nowIso();
  const ref = await addDoc(familyCollection(input.familyId, "events"), {
    family_id: input.familyId,
    child_id: input.childId ?? null,
    title: input.title,
    event_type: input.eventType,
    start_at: input.startAt,
    end_at: input.endAt ?? null,
    all_day: false,
    place_id: input.placeId ?? null,
    teacher_name: input.teacherName ?? null,
    recurrence_rule: input.recurrenceRule ?? null,
    source: "manual",
    status: "scheduled",
    created_by: role.member_id,
    created_at: createdAt,
    updated_at: createdAt,
  });
  return { id: ref.id, family_id: input.familyId };
}

export type CreatePaymentInput = {
  familyId: string;
  childId?: string | null;
  title: string;
  amount: number;
  currency?: string;
  dueDate?: string | null;
  payTo?: string | null;
  reference?: string | null;
  category?: string | null;
  project?: string | null;
};

export async function createPayment(input: CreatePaymentInput) {
  const role = await getCurrentFamilyRole();
  const createdAt = nowIso();
  const ref = await addDoc(familyCollection(input.familyId, "payments"), {
    family_id: input.familyId,
    child_id: input.childId ?? null,
    title: input.title,
    amount: input.amount,
    currency: input.currency ?? "AUD",
    due_date: input.dueDate || null,
    pay_to: input.payTo ?? null,
    reference: input.reference ?? null,
    category: input.category ?? "Manual",
    project: input.project ?? input.title,
    status: "unpaid",
    created_by: role.member_id,
    created_at: createdAt,
    updated_at: createdAt,
  });
  return { id: ref.id, family_id: input.familyId };
}

export type HomeworkItemDraft = {
  label: string;
  itemType: string;
  isRequired: boolean;
};

export type CreateHomeworkInput = {
  familyId: string;
  childId?: string | null;
  courseEventId?: string | null;
  title: string;
  dueAt?: string | null;
  items: HomeworkItemDraft[];
};

export async function createHomeworkTask(input: CreateHomeworkInput) {
  const role = await getCurrentFamilyRole();
  const createdAt = nowIso();
  const taskRef = doc(familyCollection(input.familyId, "homework_tasks"));
  const itemRows = input.items.length > 0
    ? input.items
    : [{ label: "完成作业", itemType: "checkbox", isRequired: true }];

  const batch = writeBatch(firestore);
  batch.set(taskRef, {
    id: taskRef.id,
    family_id: input.familyId,
    child_id: input.childId ?? null,
    course_event_id: input.courseEventId ?? null,
    title: input.title,
    due_at: input.dueAt ?? null,
    status: "not_started",
    source: "manual",
    created_by: role.member_id,
    created_at: createdAt,
    updated_at: createdAt,
  });

  const items = itemRows.map((item, index) => {
    const itemRef = doc(familyCollection(input.familyId, "homework_items"));
    const row = {
      id: itemRef.id,
      homework_task_id: taskRef.id,
      family_id: input.familyId,
      label: item.label,
      item_type: item.itemType,
      is_required: item.isRequired,
      is_done: false,
      sort_order: index + 1,
      created_at: createdAt,
      updated_at: createdAt,
    };
    batch.set(itemRef, row);
    return row;
  });

  await batch.commit();
  return { task: { id: taskRef.id }, items };
}

export type CreatePlaceInput = {
  familyId: string;
  name: string;
  address?: string | null;
  placeType?: string | null;
  pickupNote?: string | null;
  parkingNote?: string | null;
  safetyNote?: string | null;
};

export async function createPlace(input: CreatePlaceInput) {
  const role = await getCurrentFamilyRole();
  const createdAt = nowIso();
  const ref = await addDoc(familyCollection(input.familyId, "places"), {
    family_id: input.familyId,
    name: input.name,
    address: input.address ?? null,
    lat: null,
    lng: null,
    place_type: input.placeType ?? "other",
    pickup_note: input.pickupNote ?? null,
    parking_note: input.parkingNote ?? null,
    safety_note: input.safetyNote ?? null,
    created_by: role.member_id,
    created_at: createdAt,
    updated_at: createdAt,
  });
  return { id: ref.id, family_id: input.familyId };
}

export type CreateRequestInput = {
  familyId: string;
  requesterId?: string | null;
  requestType: string;
  title: string;
  detail?: string | null;
};

export async function createRequest(input: CreateRequestInput) {
  const role = await getCurrentFamilyRole();
  const createdAt = nowIso();
  const ref = await addDoc(familyCollection(input.familyId, "requests"), {
    family_id: input.familyId,
    requester_id: input.requesterId ?? role.member_id,
    request_type: input.requestType,
    title: input.title,
    detail: input.detail ?? null,
    status: "pending",
    condition_text: null,
    created_at: createdAt,
    updated_at: createdAt,
  });
  return { id: ref.id, family_id: input.familyId };
}

export type UploadHomeworkAttachmentInput = {
  familyId: string;
  homeworkTaskId: string;
  homeworkItemId?: string | null;
  childId?: string | null;
  file: File;
  note?: string | null;
};

export function detectMediaType(file: File): "photo" | "audio" | "video" | "file" {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

export async function uploadHomeworkAttachment(input: UploadHomeworkAttachmentInput) {
  const role = await getCurrentFamilyRole();
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `families/${input.familyId}/homework/${input.homeworkTaskId}/${Date.now()}_${safeName}`;
  const storageRef = ref(firebaseStorage, storagePath);
  await uploadBytes(storageRef, input.file, { contentType: input.file.type || undefined });
  const publicUrl = await getDownloadURL(storageRef);
  const createdAt = nowIso();

  const refDoc = await addDoc(familyCollection(input.familyId, "homework_attachments"), {
    family_id: input.familyId,
    homework_task_id: input.homeworkTaskId,
    homework_item_id: input.homeworkItemId ?? null,
    child_id: input.childId ?? null,
    uploaded_by: role.member_id,
    media_type: detectMediaType(input.file),
    file_name: input.file.name,
    mime_type: input.file.type || null,
    storage_bucket: "firebase-storage",
    storage_path: storagePath,
    public_url: publicUrl,
    note: input.note ?? null,
    created_at: createdAt,
    updated_at: createdAt,
  });
  return { id: refDoc.id, public_url: publicUrl };
}

export type UpdatePlaceInput = {
  familyId: string;
  placeId: string;
  name: string;
  address?: string | null;
  placeType?: string | null;
  pickupNote?: string | null;
  parkingNote?: string | null;
  safetyNote?: string | null;
};

export async function updatePlace(input: UpdatePlaceInput) {
  const placeRef = doc(firestore, "families", input.familyId, "places", input.placeId);
  await setDoc(placeRef, {
    id: input.placeId,
    family_id: input.familyId,
    name: input.name,
    address: input.address ?? null,
    lat: null,
    lng: null,
    place_type: input.placeType ?? "other",
    pickup_note: input.pickupNote ?? null,
    parking_note: input.parkingNote ?? null,
    safety_note: input.safetyNote ?? null,
    updated_at: nowIso(),
  }, { merge: true });
}

export async function deletePlace(args: { familyId: string; placeId: string }) {
  await import("firebase/firestore").then(({ deleteDoc }) => deleteDoc(doc(firestore, "families", args.familyId, "places", args.placeId)));
}
