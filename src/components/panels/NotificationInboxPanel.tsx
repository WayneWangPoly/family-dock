import { useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { archiveNotification, loadNotificationLogs, markNotificationRead } from "../../lib/notificationInbox";
import type { NotificationLog } from "../../lib/notificationInbox";
import { getMemberName } from "../../lib/familyUiHelpers";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = { data: FamilyData };

export function NotificationInboxPanel({ data }: Props) {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast, showError } = useToast();
  const unreadCount = useMemo(() => logs.filter((log) => !log.read_at && log.status === "sent").length, [logs]);
  const failedCount = useMemo(() => logs.filter((log) => log.status === "failed").length, [logs]);

  async function refresh() {
    setLoading(true);
    try { setLogs(await loadNotificationLogs(data.family.id)); }
    catch (error) { showError(error); }
    finally { setLoading(false); }
  }
  async function markRead(log: NotificationLog) {
    try { await markNotificationRead(log.id, data.family.id); await refresh(); showToast("Notification marked read.", "success"); }
    catch (error) { showError(error); }
  }
  async function archive(log: NotificationLog) {
    try { await archiveNotification(log.id, data.family.id); await refresh(); showToast("Notification archived.", "success"); }
    catch (error) { showError(error); }
  }
  useEffect(() => { refresh(); }, [data.family.id]);

  return (
    <PanelCard>
      <SectionTitle
        title="Notification inbox"
        subtitle="已发送、失败、跳过的通知日志"
        right={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatusPill label={`${unreadCount} unread`} tone={unreadCount ? "warning" : "success"} />
          <StatusPill label={`${failedCount} failed`} tone={failedCount ? "danger" : "success"} />
          <button onClick={refresh} className="fd-button small">{loading ? "Loading..." : "Refresh"}</button>
        </div>}
      />
      {logs.length === 0 ? <EmptyState text="暂无通知日志。" /> : <div className="fd-grid">
        {logs.map((log) => <article key={log.id} className="fd-row wrap">
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <strong>{log.title}</strong>
              <StatusPill label={log.status} tone={log.status === "sent" ? "success" : log.status === "failed" ? "danger" : "info"} />
              {!log.read_at && log.status === "sent" && <StatusPill label="unread" tone="warning" />}
            </div>
            {log.body && <div className="fd-muted">{log.body}</div>}
            <div className="fd-muted">{log.notification_type} · {getMemberName(data, log.member_id)} · {new Date(log.created_at).toLocaleString("en-AU")}</div>
            {log.error_message && <div className="fd-alert danger" style={{ marginTop: 8 }}>{log.error_message}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {!log.read_at && <button onClick={() => markRead(log)} className="fd-button small">Mark read</button>}
            <button onClick={() => archive(log)} className="fd-button small">Archive</button>
          </div>
        </article>)}
      </div>}
    </PanelCard>
  );
}
