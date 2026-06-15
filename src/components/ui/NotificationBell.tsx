import { useEffect, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { loadUnreadNotificationCount, markAllNotificationsRead } from "../../lib/notificationBadge";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
  onOpen: () => void;
};

export function NotificationBell({ data, onOpen }: Props) {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const { showToast, showError } = useToast();

  async function refresh() {
    try {
      setCount(await loadUnreadNotificationCount(data.family.id));
    } catch {
      setCount(0);
    }
  }

  async function markRead() {
    setBusy(true);
    try {
      await markAllNotificationsRead(data.family.id);
      await refresh();
      showToast("All notifications marked read.", "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [data.family.id]);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button onClick={onOpen} className="fd-button" style={{ position: "relative" }}>
        🔔
        {count > 0 && (
          <span
            className="fd-badge danger"
            style={{
              position: "absolute",
              top: -8,
              right: -8,
              minWidth: 24,
              height: 24,
              padding: "0 6px",
            }}
          >
            {count}
          </span>
        )}
      </button>
      {count > 0 && (
        <button disabled={busy} onClick={markRead} className="fd-button small">
          {busy ? "..." : "Read"}
        </button>
      )}
    </div>
  );
}
