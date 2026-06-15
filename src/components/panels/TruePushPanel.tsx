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

export function TruePushPanel({ data, compact }: Props) {
  const [support, setSupport] = useState(() => getPushSupportState());
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any | null>(null);
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
      const result = await sendManualTestPush({
        familyId: data.family.id,
      });

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
      const result = await runDueReminderCheck({
        familyId: data.family.id,
      });

      setLastResult(result);
      showToast(`Reminder check done. Sent ${result.sent ?? 0}.`, "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    refreshState();
  }, []);

  return (
    <PanelCard>
      <SectionTitle
        title="True push notifications"
        subtitle={compact ? "跨设备 push 基础状态" : "Service worker + VAPID + Supabase Edge Function"}
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatusPill
              label={support.supported ? "supported" : "unsupported"}
              tone={support.supported ? "success" : "danger"}
            />
            <StatusPill
              label={subscribed ? "subscribed" : "not subscribed"}
              tone={subscribed ? "success" : "warning"}
            />
          </div>
        }
      />

      {!support.supported && (
        <div className="fd-alert danger">
          This browser does not support web push. iPhone requires the app to be installed as a PWA and opened from the home screen.
        </div>
      )}

      {!compact && (
        <div className="fd-grid">
          <div className="fd-alert info">
            这是跨设备 push 的基础链路。当前设备订阅后，Edge Function 可以向这个设备发送通知。
          </div>

          <div className="fd-grid three">
            <div className="fd-stat">
              <div className="fd-stat-label">Permission</div>
              <div className="fd-stat-value" style={{ fontSize: 24 }}>{support.permission}</div>
              <div className="fd-stat-note">browser notification permission</div>
            </div>
            <div className="fd-stat">
              <div className="fd-stat-label">Service worker</div>
              <div className="fd-stat-value" style={{ fontSize: 24 }}>{support.hasServiceWorker ? "yes" : "no"}</div>
              <div className="fd-stat-note">required for push</div>
            </div>
            <div className="fd-stat">
              <div className="fd-stat-label">Push manager</div>
              <div className="fd-stat-value" style={{ fontSize: 24 }}>{support.hasPushManager ? "yes" : "no"}</div>
              <div className="fd-stat-note">browser push API</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: compact ? 0 : 14 }}>
        <button disabled={Boolean(busy) || !support.supported} onClick={enablePush} className="fd-button primary">
          {busy === "enable" ? "Enabling..." : subscribed ? "Refresh subscription" : "Enable push"}
        </button>

        <button disabled={Boolean(busy) || !subscribed} onClick={disablePush} className="fd-button">
          {busy === "disable" ? "Disabling..." : "Disable this device"}
        </button>

        <button disabled={Boolean(busy) || !subscribed} onClick={sendTest} className="fd-button">
          {busy === "test" ? "Sending..." : "Send push test"}
        </button>

        <button disabled={Boolean(busy) || !subscribed} onClick={runCheck} className="fd-button">
          {busy === "check" ? "Checking..." : "Run reminder check"}
        </button>
      </div>

      {!compact && lastResult && (
        <pre style={{ marginTop: 14, whiteSpace: "pre-wrap", fontSize: 12 }} className="fd-alert info">
          {JSON.stringify(lastResult, null, 2)}
        </pre>
      )}
    </PanelCard>
  );
}
