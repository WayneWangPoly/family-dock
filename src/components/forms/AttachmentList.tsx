import { useEffect, useMemo, useState } from "react";
import type { HomeworkAttachment } from "../../lib/homeworkAttachments";
import {
  createHomeworkAttachmentSignedUrl,
  deleteHomeworkAttachment,
  loadHomeworkAttachments,
} from "../../lib/homeworkAttachments";
import { getMemberName } from "../../lib/familyUiHelpers";
import type { FamilyData, HomeworkTask } from "../../lib/familyDataTypes";

type Props = {
  data: FamilyData;
  task: HomeworkTask;
};

export function AttachmentList({ data, task }: Props) {
  const [attachments, setAttachments] = useState<HomeworkAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const taskAttachments = useMemo(() => {
    return attachments.filter((attachment) => attachment.homework_task_id === task.id);
  }, [attachments, task.id]);

  async function refresh() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const rows = await loadHomeworkAttachments(data.family.id);
      setAttachments(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  async function openAttachment(attachment: HomeworkAttachment) {
    setBusyId(attachment.id);
    setErrorMessage(null);

    try {
      const url = await createHomeworkAttachmentSignedUrl(attachment);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      setErrorMessage(message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeAttachment(attachment: HomeworkAttachment) {
    const confirmed = window.confirm(`Delete ${attachment.file_name}?`);
    if (!confirmed) return;

    setBusyId(attachment.id);
    setErrorMessage(null);

    try {
      await deleteHomeworkAttachment(attachment);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      setErrorMessage(message);
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    refresh();
  }, [data.family.id]);

  if (loading && attachments.length === 0) {
    return <div className="fd-muted">Loading attachments...</div>;
  }

  return (
    <div className="fd-attachment-box">
      <header className="fd-row wrap" style={{ padding: 0, background: "transparent" }}>
        <strong style={{ flex: 1 }}>Uploaded evidence</strong>
        <button onClick={refresh} className="fd-button small">Refresh</button>
      </header>

      {errorMessage && <div className="fd-alert danger">{errorMessage}</div>}

      {taskAttachments.length === 0 && (
        <div className="fd-muted">No uploads yet.</div>
      )}

      <div className="fd-grid" style={{ gap: 8 }}>
        {taskAttachments.map((attachment) => (
          <div key={attachment.id} className="fd-attachment-row">
            <div className="fd-attachment-main">
              <strong>{iconForMedia(attachment.media_type)} {attachment.file_name}</strong>
              <div className="fd-muted">
                {attachment.media_type} · by {getMemberName(data, attachment.uploaded_by)} · {new Date(attachment.created_at).toLocaleString("en-AU")}
              </div>
              {attachment.note && <div className="fd-muted">{attachment.note}</div>}
            </div>
            <div className="fd-attachment-actions">
              <button disabled={busyId === attachment.id} onClick={() => openAttachment(attachment)} className="fd-button small">View</button>
              <button disabled={busyId === attachment.id} onClick={() => removeAttachment(attachment)} className="fd-button small">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function iconForMedia(mediaType: HomeworkAttachment["media_type"]) {
  if (mediaType === "photo") return "🖼️";
  if (mediaType === "audio") return "🎧";
  if (mediaType === "video") return "🎬";
  return "📎";
}
