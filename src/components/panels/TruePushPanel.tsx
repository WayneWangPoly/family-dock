import { useEffect, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  deactivateCurrentDevicePush,
  getExistingPushSubscription,
  getPushSupportState,
  runDueReminderCheck,
  sendManualTestPush,
  subscribeCurrentDevice,
} from "../../lib/pushNotifications";
import { PanelCard, SectionTitle, StatusPill } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
  compact?: boolean;
};

type BusyAction = "enable" | "disable" | "test" | "check" | null;

type PushActionResult = {
  sent?: number;
  [key: string]: unknown;
};

export function TruePushPanel({ data, compact }: Props) {
  const [support, setSupport] = useState(() => getPushSupportState());
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const { showToast, showError } = useToast();

  async function refreshState() {
    setSupport(getPushSupportState());

    try {
      const subscription = await getExistingPushSubscription();
      setSubscribed(Boolean(subscription));
    } catch {
      setSubscribed(false);
    }
  }

  async function enablePush() {
    setBusy("enable");

    try {
      const result = await subscribeCurrentDevice({
        familyId: data.family.id,
        memberId: data.role.member_id,
        deviceLabel: "Current device",
      });

      setLastResult(result);
      await refreshState();
      showToast("Push notifications enabled on this device.", "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function disablePush() {
    setBusy("disable");

    try {
      const result = await deactivateCurrentDevicePush({
        familyId: data.family.id,
      });

      setLastResult(result);
      await refreshState();
      showToast("Push notifications disabled on this device.", "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");

    try {
      const result = await sendManualTestPush({ familyId: data.family.id }) as PushActionResult;
      setLastResult(result);
      showToast(`Push test sent: ${result.sent ?? 0}`, "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function runCheck() {
    setBusy("check");

    try {
      const result = await runDueReminderCheck({ familyId: data.family.id }) as PushActionResult;
      setLastResult(result);
      showToast(`Reminder check done. Sent ${result.sent ?? 0}.`, "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void refreshState();
  }, []);

  return (
    <PanelCard>
      <SectionTitle
        title="True push notifications"
        subtitle={compact ? "Cross-device push status" : "Service worker + VAPID + Firebase Functions"}
        right={<StatusPill label={subscribed ? "subscribed" : "not subscribed"} tone={subscribed ? "success" : "warning"} />}
      />

      {!support.supported && (
        <div className="fd-alert warning">
          This browser does not support web push. iPhone requires the app to be installed as a PWA and opened from the home screen.
        </div>
      )}

      {!compact && (
        <div className="fd-grid">
          <div className="fd-card soft">
            <strong>Permission</strong>
            <div>{support.permission}</div>
            <div className="fd-muted">browser notification permission</div>
          </div>

          <div className="fd-card soft">
            <strong>Service worker</strong>
            <div>{support.hasServiceWorker ? "yes" : "no"}</div>
            <div className="fd-muted">required for push</div>
          </div>

          <div className="fd-card soft">
            <strong>Push manager</strong>
            <div>{support.hasPushManager ? "yes" : "no"}</div>
            <div className="fd-muted">browser push API</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button disabled={busy === "enable"} onClick={enablePush} className="fd-button primary">
          {busy === "enable" ? "Enabling..." : subscribed ? "Refresh subscription" : "Enable push"}
        </button>

        <button disabled={busy === "disable" || !subscribed} onClick={disablePush} className="fd-button">
          {busy === "disable" ? "Disabling..." : "Disable this device"}
        </button>

        <button disabled={busy === "test"} onClick={sendTest} className="fd-button">
          {busy === "test" ? "Sending..." : "Send push test"}
        </button>

        <button disabled={busy === "check"} onClick={runCheck} className="fd-button">
          {busy === "check" ? "Checking..." : "Run reminder check"}
        </button>
      </div>

      {!compact && lastResult !== null && (
        <pre className="fd-code" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(lastResult, null, 2)}
        </pre>
      )}
    </PanelCard>
  );
}
