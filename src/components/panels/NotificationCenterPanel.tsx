import { useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  buildFamilyReminders,
  defaultNotificationPrefs,
  getNotificationPermissionState,
  loadNotificationPrefs,
  requestNotificationPermission,
  saveNotificationPrefs,
  sendTestNotification,
} from "../../lib/notificationCenter";
import type { NotificationPrefs } from "../../lib/notificationCenter";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";
import { TruePushPanel } from "./TruePushPanel";
import { NotificationInboxPanel } from "./NotificationInboxPanel";
import { PushDeviceManagerPanel } from "./PushDeviceManagerPanel";
import { NotificationPreferencesPanel } from "./NotificationPreferencesPanel";
import { PwaInstallPanel } from "./PwaInstallPanel";
import { SystemHealthPanel } from "./SystemHealthPanel";

type Props = {
  data: FamilyData;
  compact?: boolean;
};

export function NotificationCenterPanel({ data, compact }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadNotificationPrefs());
  const [permission, setPermission] = useState(() => getNotificationPermissionState());
  const { showToast, showError } = useToast();

  const reminders = useMemo(() => {
    const rows = buildFamilyReminders(data, prefs);
    return compact ? rows.slice(0, 5) : rows;
  }, [data, prefs, compact]);

  function updatePrefs(next: Partial<NotificationPrefs>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveNotificationPrefs(merged);
    showToast("Local notification preferences saved.", "success");
  }

  async function enableNotifications() {
    try {
      const nextPermission = await requestNotificationPermission();
      setPermission(nextPermission);
      showToast(`Notification permission: ${nextPermission}`, nextPermission === "granted" ? "success" : "info");
    } catch (error) {
      showError(error);
    }
  }

  function testNotification() {
    try {
      sendTestNotification();
      showToast("Local test notification sent.", "success");
    } catch (error) {
      showError(error);
    }
  }

  return (
    <div className="fd-grid">
      <PanelCard>
        <SectionTitle
          title="Notification centre"
          subtitle={compact ? "本机提醒状态和最近待提醒" : "本机提醒权限、偏好和待提醒清单"}
          right={<StatusPill label={`Permission: ${permission}`} tone={permission === "granted" ? "success" : "warning"} />}
        />

        {!compact && (
          <div className="fd-grid" style={{ marginBottom: 14 }}>
            <div className="fd-alert info">
              Local reminders are still kept here for same-device UX. Server push now uses DB-backed per-member preferences below.
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={enableNotifications} className="fd-button primary">Enable local notifications</button>
              <button onClick={testNotification} className="fd-button">Send local test</button>
              <button onClick={() => updatePrefs(defaultNotificationPrefs)} className="fd-button">Reset local defaults</button>
            </div>

            <div className="fd-grid three">
              <label className="fd-field">
                Event reminder minutes
                <input className="fd-input" type="number" value={prefs.eventReminderMinutes} onChange={(event) => updatePrefs({ eventReminderMinutes: Number(event.target.value) })} />
              </label>
              <label className="fd-field">
                Homework reminder hours
                <input className="fd-input" type="number" value={prefs.homeworkReminderHours} onChange={(event) => updatePrefs({ homeworkReminderHours: Number(event.target.value) })} />
              </label>
              <label className="fd-field">
                Payment reminder days
                <input className="fd-input" type="number" value={prefs.paymentReminderDays} onChange={(event) => updatePrefs({ paymentReminderDays: Number(event.target.value) })} />
              </label>
            </div>
          </div>
        )}

        {reminders.length === 0 ? (
          <EmptyState text="暂无本机待提醒事项。" />
        ) : (
          <div className="fd-grid">
            {reminders.map((reminder) => (
              <article key={reminder.id} className="fd-row wrap">
                <div style={{ flex: 1 }}>
                  <strong>{reminder.title}</strong>
                  <div className="fd-muted">{reminder.detail}</div>
                  <div className="fd-muted">Local reminder: {reminder.dueAt ? new Date(reminder.dueAt).toLocaleString("en-AU") : "not set"}</div>
                </div>
                <StatusPill label={reminder.type} tone={reminder.urgency === "now" ? "danger" : reminder.urgency === "soon" ? "warning" : "info"} />
              </article>
            ))}
          </div>
        )}
      </PanelCard>

      {!compact && (
        <>
          <NotificationPreferencesPanel data={data} />
          <PwaInstallPanel />
          <SystemHealthPanel />
          <TruePushPanel data={data} />
          <PushDeviceManagerPanel data={data} />
          <NotificationInboxPanel data={data} />
        </>
      )}
    </div>
  );
}
