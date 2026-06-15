import { useEffect, useMemo, useState } from "react";
import type { FamilyData, FamilyMember } from "../../lib/familyDataTypes";
import {
  defaultNotificationPreference,
  ensureNotificationPreferences,
  loadNotificationPreferences,
  upsertNotificationPreference,
} from "../../lib/notificationPreferences";
import type { NotificationPreferenceDraft } from "../../lib/notificationPreferences";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
};

export function NotificationPreferencesPanel({ data }: Props) {
  const [prefs, setPrefs] = useState<Record<string, NotificationPreferenceDraft>>({});
  const [loading, setLoading] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const { showToast, showError } = useToast();

  const sortedMembers = useMemo(() => {
    const roleRank: Record<string, number> = { parent: 1, guardian: 1, child: 2, homestay: 3 };
    return [...data.members].sort((a, b) => {
      const rank = (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9);
      if (rank !== 0) return rank;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [data.members]);

  async function refresh() {
    setLoading(true);
    try {
      const rows = await loadNotificationPreferences(data.family.id);
      const map: Record<string, NotificationPreferenceDraft> = {};
      for (const member of data.members) {
        const existing = rows.find((row) => row.member_id === member.id);
        map[member.id] = existing ?? defaultNotificationPreference(data.family.id, member.id);
      }
      setPrefs(map);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function createMissing() {
    setLoading(true);
    try {
      await ensureNotificationPreferences(data.family.id, data.members.map((member) => member.id));
      await refresh();
      showToast("Notification preferences created for missing members.", "success");
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(memberId: string, patch: Partial<NotificationPreferenceDraft>) {
    setPrefs((prev) => ({
      ...prev,
      [memberId]: {
        ...(prev[memberId] ?? defaultNotificationPreference(data.family.id, memberId)),
        ...patch,
      },
    }));
  }

  async function save(member: FamilyMember) {
    const draft = prefs[member.id] ?? defaultNotificationPreference(data.family.id, member.id);
    setSavingMemberId(member.id);
    try {
      await upsertNotificationPreference(draft);
      showToast(`${member.display_name} notification preference saved.`, "success");
    } catch (error) {
      showError(error);
    } finally {
      setSavingMemberId(null);
    }
  }

  useEffect(() => {
    refresh();
  }, [data.family.id]);

  return (
    <PanelCard>
      <SectionTitle
        title="Notification preferences"
        subtitle="数据库保存的提醒偏好；支持按成员控制谁收到什么提醒"
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={refresh} className="fd-button small">{loading ? "Loading..." : "Refresh"}</button>
            <button onClick={createMissing} className="fd-button small">Create missing</button>
          </div>
        }
      />

      {sortedMembers.length === 0 ? (
        <EmptyState text="No family members." />
      ) : (
        <div className="fd-grid">
          {sortedMembers.map((member) => {
            const pref = prefs[member.id] ?? defaultNotificationPreference(data.family.id, member.id);
            const allDisabled = !pref.events_enabled && !pref.homework_enabled && !pref.payments_enabled;

            return (
              <article key={member.id} className="fd-card soft">
                <header style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <strong>{member.display_name}</strong>
                    <div className="fd-muted">{member.role} · {member.can_login ? "login enabled" : "no login"}</div>
                  </div>
                  <StatusPill label={allDisabled ? "muted" : "active"} tone={allDisabled ? "warning" : "success"} />
                </header>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <label className="fd-button small">
                    <input type="checkbox" checked={pref.events_enabled} onChange={(event) => updateDraft(member.id, { events_enabled: event.target.checked })} />
                    Events
                  </label>
                  <label className="fd-button small">
                    <input type="checkbox" checked={pref.homework_enabled} onChange={(event) => updateDraft(member.id, { homework_enabled: event.target.checked })} />
                    Homework
                  </label>
                  <label className="fd-button small">
                    <input type="checkbox" checked={pref.payments_enabled} onChange={(event) => updateDraft(member.id, { payments_enabled: event.target.checked })} />
                    Payments
                  </label>
                </div>

                <div className="fd-grid three" style={{ marginTop: 12 }}>
                  <label className="fd-field">
                    Event minutes
                    <input
                      type="number"
                      className="fd-input"
                      value={pref.event_reminder_minutes}
                      onChange={(event) => updateDraft(member.id, { event_reminder_minutes: Number(event.target.value) })}
                    />
                  </label>
                  <label className="fd-field">
                    Homework hours
                    <input
                      type="number"
                      className="fd-input"
                      value={pref.homework_reminder_hours}
                      onChange={(event) => updateDraft(member.id, { homework_reminder_hours: Number(event.target.value) })}
                    />
                  </label>
                  <label className="fd-field">
                    Payment days
                    <input
                      type="number"
                      className="fd-input"
                      value={pref.payment_reminder_days}
                      onChange={(event) => updateDraft(member.id, { payment_reminder_days: Number(event.target.value) })}
                    />
                  </label>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
                  <label className="fd-button small">
                    <input type="checkbox" checked={pref.quiet_hours_enabled} onChange={(event) => updateDraft(member.id, { quiet_hours_enabled: event.target.checked })} />
                    Quiet hours
                  </label>
                  <input
                    type="time"
                    className="fd-input"
                    style={{ width: 120 }}
                    value={pref.quiet_start}
                    onChange={(event) => updateDraft(member.id, { quiet_start: event.target.value })}
                  />
                  <span className="fd-muted">to</span>
                  <input
                    type="time"
                    className="fd-input"
                    style={{ width: 120 }}
                    value={pref.quiet_end}
                    onChange={(event) => updateDraft(member.id, { quiet_end: event.target.value })}
                  />
                  <button onClick={() => save(member)} className="fd-button primary small" disabled={savingMemberId === member.id}>
                    {savingMemberId === member.id ? "Saving..." : "Save"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}
