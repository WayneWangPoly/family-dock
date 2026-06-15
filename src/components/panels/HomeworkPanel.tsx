import { useState } from "react";
import type { FamilyData, HomeworkTask } from "../../lib/familyDataTypes";
import { formatDateTime, getHomeworkProgress, getMemberName } from "../../lib/familyUiHelpers";
import { getCurrentFamilyRole } from "../../lib/familyDataApi";
import { updateHomeworkItemDone, updateHomeworkTaskStatus } from "../../lib/familyMutations";
import { HomeworkFormModal } from "../forms/HomeworkFormModal";
import { HomeworkUploadBox } from "../forms/HomeworkUploadBox";
import { AttachmentList } from "../forms/AttachmentList";
import { PanelCard, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
  onRefresh?: () => Promise<unknown> | unknown;
};

function itemTypeLabel(type: string) {
  if (type === "checkbox") return "Check";
  if (type === "video_upload") return "Video";
  if (type === "audio_upload") return "Audio";
  if (type === "photo_upload") return "Photo";
  if (type === "file_upload") return "File";
  return type.replaceAll("_", " ");
}

export function HomeworkPanel({ data, onRefresh }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const { showToast, showError } = useToast();

  async function toggleItem(itemId: string, isDone: boolean) {
    try {
      const role = await getCurrentFamilyRole();
      await updateHomeworkItemDone({
        itemId,
        familyId: data.family.id,
        isDone,
        completedBy: role.member_id,
      });
      await onRefresh?.();
      showToast(isDone ? "Done." : "Reopened.", "success");
    } catch (error) {
      showError(error);
    }
  }

  async function updateTask(task: HomeworkTask) {
    try {
      const progress = getHomeworkProgress(task);
      const nextStatus = progress.total > 0 && progress.done === progress.total ? "done" : "in_progress";
      await updateHomeworkTaskStatus({
        taskId: task.id,
        familyId: data.family.id,
        status: nextStatus,
      });
      await onRefresh?.();
      showToast(nextStatus === "done" ? "Homework completed." : "Homework kept open.", "success");
    } catch (error) {
      showError(error);
    }
  }

  const activeTasks = data.homeworkTasks.filter((task) => task.status !== "done" && task.status !== "cancelled");
  const doneTasks = data.homeworkTasks.filter((task) => task.status === "done");

  return (
    <>
      <div className="fd-grid">
        <div className="fd-homework-summary">
          <div className="fd-homework-summary-card">
            <span>Open</span>
            <strong>{activeTasks.length}</strong>
            <em>tasks</em>
          </div>
          <div className="fd-homework-summary-card">
            <span>Done</span>
            <strong>{doneTasks.length}</strong>
            <em>completed</em>
          </div>
          <div className="fd-homework-summary-card">
            <span>Evidence</span>
            <strong>＋</strong>
            <em>upload</em>
          </div>
        </div>

        <PanelCard raised>
          <div className="fd-homework-panel-head">
            <div>
              <h2>Homework</h2>
              <div className="fd-muted">Checklist, files and progress</div>
            </div>
            <button onClick={() => setFormOpen(true)} className="fd-button primary">Add homework</button>
          </div>

          {data.homeworkTasks.length === 0 ? (
            <EmptyState text="No homework yet." />
          ) : (
            <div className="fd-grid">
              {data.homeworkTasks.map((task) => {
                const progress = getHomeworkProgress(task);
                const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
                return (
                  <section key={task.id} className="fd-homework-task-card">
                    <header className="fd-homework-task-head">
                      <div>
                        <strong>{task.title}</strong>
                        <div className="fd-muted">
                          {getMemberName(data, task.child_id)} · due {formatDateTime(task.due_at)}
                        </div>
                      </div>
                      <div className="fd-homework-task-actions">
                        <StatusPill label={`${progress.done}/${progress.total}`} tone={percent === 100 ? "success" : "warning"} />
                        <StatusPill label={task.status.replaceAll("_", " ")} tone={task.status === "done" ? "success" : "default"} />
                        <button onClick={() => updateTask(task)} className="fd-button small">Update</button>
                      </div>
                    </header>

                    <div className="fd-homework-progress-track">
                      <div className="fd-homework-progress-bar" style={{ width: `${percent}%` }} />
                    </div>

                    <div className="fd-homework-item-list">
                      {(task.homework_items ?? []).map((item) => (
                        <label key={item.id} className="fd-homework-item-row">
                          <input
                            type="checkbox"
                            checked={item.is_done}
                            onChange={(event) => toggleItem(item.id, event.target.checked)}
                          />
                          <span className="fd-homework-item-label">{item.label}</span>
                          <span className="fd-badge">{itemTypeLabel(item.item_type)}</span>
                        </label>
                      ))}
                    </div>

                    <HomeworkUploadBox familyId={data.family.id} task={task} onUploaded={onRefresh} />
                    <AttachmentList data={data} task={task} />
                  </section>
                );
              })}
            </div>
          )}
        </PanelCard>
      </div>

      <HomeworkFormModal open={formOpen} data={data} onClose={() => setFormOpen(false)} onSaved={onRefresh} />
    </>
  );
}
