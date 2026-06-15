import { useState } from "react";
import type { HomeworkTask } from "../../lib/familyDataTypes";
import { uploadHomeworkAttachment } from "../../lib/manualMutations";

type Props = {
  familyId: string;
  task: HomeworkTask;
  onUploaded?: () => Promise<unknown> | unknown;
};

export function HomeworkUploadBox({ familyId, task, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file) return alert("Choose a file first.");

    setBusy(true);
    try {
      await uploadHomeworkAttachment({
        familyId,
        homeworkTaskId: task.id,
        childId: task.child_id,
        file,
        note: note || null,
      });
      setFile(null);
      setNote("");
      await onUploaded?.();
      alert("Uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fd-homework-upload-box">
      <strong>Add evidence</strong>
      <div className="fd-muted">Add a photo, recording, video or file.</div>
      <input type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <input className="fd-input fd-homework-upload-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short note..." />
      <button disabled={busy} onClick={submit} className="fd-button small">{busy ? "Uploading..." : "Upload"}</button>
    </div>
  );
}
