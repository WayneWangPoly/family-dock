import { deleteObject, ref } from "firebase/storage";
import { collection, deleteDoc, doc, getDocs, orderBy, query } from "firebase/firestore";
import { firebaseStorage, firestore } from "./firebaseClient";

export type HomeworkAttachment = {
  id: string;
  family_id: string;
  homework_task_id: string | null;
  homework_item_id: string | null;
  child_id: string | null;
  uploaded_by: string | null;
  media_type: "photo" | "audio" | "video" | "file";
  file_name: string;
  mime_type: string | null;
  storage_bucket: string;
  storage_path: string;
  public_url: string | null;
  note: string | null;
  created_at: string;
};

export async function loadHomeworkAttachments(familyId: string) {
  const snapshot = await getDocs(query(
    collection(firestore, "families", familyId, "homework_attachments"),
    orderBy("created_at", "desc"),
  ));

  return snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() })) as HomeworkAttachment[];
}

export async function createHomeworkAttachmentSignedUrl(attachment: HomeworkAttachment) {
  return attachment.public_url ?? "";
}

export async function deleteHomeworkAttachment(attachment: HomeworkAttachment) {
  if (attachment.storage_path) {
    await deleteObject(ref(firebaseStorage, attachment.storage_path));
  }
  await deleteDoc(doc(firestore, "families", attachment.family_id, "homework_attachments", attachment.id));
}
