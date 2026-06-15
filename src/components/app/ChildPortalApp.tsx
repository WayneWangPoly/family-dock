import type { CSSProperties } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { formatDateTime, getHomeworkProgress, getMemberName, getPlaceName, todayKey } from "../../lib/familyUiHelpers";
import { getCurrentFamilyRole, signOut } from "../../lib/familyDataApi";
import { updateHomeworkItemDone } from "../../lib/familyMutations";
import { HomeworkUploadBox } from "../forms/HomeworkUploadBox";
import { AttachmentList } from "../forms/AttachmentList";
import { ChildQuickRequestForm } from "../forms/ChildQuickRequestForm";
import type { FamilyRealtimeChange, RealtimeStatus } from "../../lib/familyRealtime";

type Props = {
  data: FamilyData;
  refreshing: boolean;
  realtimeStatus: RealtimeStatus;
  lastRealtimeChange: FamilyRealtimeChange | null;
  onRefresh?: () => Promise<unknown> | unknown;
};

function formatHomeworkType(type: string) {
  if (type === "video_upload") return "Video";
  if (type === "audio_upload") return "Audio";
  if (type === "photo_upload") return "Photo";
  if (type === "file_upload") return "File";
  if (type === "checkbox") return "Check";
  return type.replaceAll("_", " ");
}

export function ChildPortalApp({
  data,
  refreshing: _refreshing,
  realtimeStatus: _realtimeStatus,
  lastRealtimeChange: _lastRealtimeChange,
  onRefresh,
}: Props) {
  const memberId = data.role.member_id;
  const me = data.members.find((member) => member.id === memberId);
  const today = todayKey();

  const myEvents = data.calendarEvents
    .filter((event) => event.child_id === memberId && event.start_at.slice(0, 10) >= today)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, 8);

  const nextEvent = myEvents[0];

  const myHomework = data.homeworkTasks
    .filter((task) => task.child_id === memberId && task.status !== "done" && task.status !== "cancelled")
    .sort((a, b) => String(a.due_at ?? "").localeCompare(String(b.due_at ?? "")));

  const myRequests = data.requests
    .filter((request) => request.requester_id === memberId)
    .slice(0, 8);

  async function toggleItem(itemId: string, isDone: boolean) {
    const role = await getCurrentFamilyRole();
    await updateHomeworkItemDone({
      itemId,
      familyId: data.family.id,
      isDone,
      completedBy: role.member_id,
    });
    await onRefresh?.();
  }

  return (
    <main className="fd-child-portal" style={pageStyle}>
      <header className="fd-child-header">
        <div>
          <div className="fd-mobile-family-name">{data.family.name}</div>
          <h1 style={{ margin: 0 }}>Hi {me?.display_name ?? getMemberName(data, memberId)}</h1>
        </div>
        <button onClick={async () => { await signOut(); location.reload(); }} className="fd-icon-button" aria-label="Sign out">↗</button>
      </header>

      <section className="fd-card raised fd-child-next" style={{ marginBottom: 14 }}>
        <div className="fd-stat-label">Next</div>
        <div className="fd-stat-value" style={{ fontSize: 26 }}>
          {nextEvent ? nextEvent.title : "No upcoming event"}
        </div>
        {nextEvent && (
          <div className="fd-stat-note">
            {formatDateTime(nextEvent.start_at)} · {getPlaceName(data, nextEvent.place_id)}
          </div>
        )}
      </section>

      <div className="fd-grid">
        <section className="fd-card">
          <h2 style={{ marginTop: 0 }}>My schedule</h2>
          {myEvents.length === 0 && <div className="fd-empty">No upcoming events.</div>}
          <div className="fd-grid">
            {myEvents.map((event) => (
              <div key={event.id} className="fd-touch-card">
                <strong>{event.title}</strong>
                <div className="fd-muted">{formatDateTime(event.start_at)} · {getPlaceName(data, event.place_id)}</div>
                {event.teacher_name && <div className="fd-muted">Teacher: {event.teacher_name}</div>}
              </div>
            ))}
          </div>
        </section>

        <ChildQuickRequestForm data={data} onSaved={onRefresh} />

        <section className="fd-card">
          <h2 style={{ marginTop: 0 }}>My homework</h2>
          {myHomework.length === 0 && <div className="fd-empty">No active homework.</div>}

          <div className="fd-grid">
            {myHomework.map((task) => {
              const progress = getHomeworkProgress(task);

              return (
                <section key={task.id} style={homeworkStyle}>
                  <header style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <strong>{task.title}</strong>
                      <div className="fd-muted">Due {formatDateTime(task.due_at)}</div>
                    </div>
                    <span className="fd-badge warning">{progress.done}/{progress.total}</span>
                  </header>

                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {(task.homework_items ?? []).map((item) => (
                      <label key={item.id} style={itemStyle}>
                        <input
                          type="checkbox"
                          checked={item.is_done}
                          onChange={(event) => toggleItem(item.id, event.target.checked)}
                        />
                        <span style={{ flex: 1 }}>{item.label}</span>
                        <span className="fd-badge">{formatHomeworkType(item.item_type)}</span>
                      </label>
                    ))}
                  </div>

                  <HomeworkUploadBox familyId={data.family.id} task={task} onUploaded={onRefresh} />
                  <AttachmentList data={data} task={task} />
                </section>
              );
            })}
          </div>
        </section>

        <section className="fd-card">
          <h2 style={{ marginTop: 0 }}>My requests</h2>
          {myRequests.length === 0 && <div className="fd-empty">No requests yet.</div>}
          <div className="fd-grid">
            {myRequests.map((request) => (
              <div key={request.id} className="fd-touch-card">
                <strong>{request.title}</strong>
                <div className="fd-muted">{request.request_type} · {request.status}</div>
                {request.condition_text && <div className="fd-muted">Condition: {request.condition_text}</div>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "var(--fd-bg)",
  color: "var(--fd-text)",
  fontFamily: "system-ui, sans-serif",
  padding: "14px 14px calc(24px + env(safe-area-inset-bottom, 0px))",
};

const homeworkStyle: CSSProperties = {
  padding: 14,
  borderRadius: 18,
  background: "var(--fd-surface-soft)",
};

const itemStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  padding: 12,
  minHeight: 52,
  borderRadius: 14,
  background: "white",
  cursor: "pointer",
};
