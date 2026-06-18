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
      await subscribeCurrentDevice({
        familyId: data.family.id,
        memberId: data.role.member_id,
        deviceLabel: "Current device",
      });
      await refreshState();
      showToast("Push enabled.", "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function disablePush() {
    setBusy("disable");
    try {
      await deactivateCurrentDevicePush({
        familyId: data.family.id,
      });
      await refreshState();
      showToast("Push disabled.", "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    try {
      const result = (await sendManualTestPush({ familyId: data.family.id })) as PushActionResult;
      showToast(`Test sent: ${result.sent ?? 0}`, "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function runCheck() {
    setBusy("check");
    try {
      const result = (await runDueReminderCheck({ familyId: data.family.id })) as PushActionResult;
      showToast(`Reminder check: ${result.sent ?? 0}`, "success");
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
        title={compact ? "Push" : "Push notifications"}
        right={<StatusPill label={subscribed ? "Enabled" : "Off"} tone={subscribed ? "success" : "default"} />}
      />

      {!support.supported && <div className="fd-alert warning">Push is not available on this browser.</div>}

      {!compact && (
        <div className="fd-row wrap">
          <StatusPill label={`Permission: ${support.permission}`} tone={support.permission === "granted" ? "success" : "warning"} />
          <StatusPill label={`Service worker: ${support.hasServiceWorker ? "yes" : "no"}`} tone={support.hasServiceWorker ? "success" : "warning"} />
          <StatusPill label={`Push API: ${support.hasPushManager ? "yes" : "no"}`} tone={support.hasPushManager ? "success" : "warning"} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={enablePush} className="fd-button primary" disabled={!support.supported || busy === "enable"}>
          {busy === "enable" ? "Enabling..." : subscribed ? "Refresh" : "Enable"}
        </button>
        <button onClick={disablePush} className="fd-button" disabled={!subscribed || busy === "disable"}>
          {busy === "disable" ? "Disabling..." : "Disable"}
        </button>
        <button onClick={sendTest} className="fd-button" disabled={!subscribed || busy === "test"}>
          {busy === "test" ? "Sending..." : "Send test"}
        </button>
        <button onClick={runCheck} className="fd-button" disabled={!subscribed || busy === "check"}>
          {busy === "check" ? "Checking..." : "Check reminders"}
        </button>
      </div>
    </PanelCard>
  );
}
