import { useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { loadPushSubscriptions, setPushSubscriptionActive, summarizeDevice } from "../../lib/notificationInbox";
import type { PushSubscriptionRecord } from "../../lib/notificationInbox";
import { getMemberName } from "../../lib/familyUiHelpers";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = { data: FamilyData };

export function PushDeviceManagerPanel({ data }: Props) {
  const [devices, setDevices] = useState<PushSubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast, showError } = useToast();
  const activeCount = useMemo(() => devices.filter((device) => device.is_active).length, [devices]);
  async function refresh() {
    setLoading(true);
    try { setDevices(await loadPushSubscriptions(data.family.id)); }
    catch (error) { showError(error); }
    finally { setLoading(false); }
  }
  async function setActive(device: PushSubscriptionRecord, active: boolean) {
    try {
      await setPushSubscriptionActive({ familyId: data.family.id, subscriptionId: device.id, active, disabledBy: data.role.member_id });
      await refresh();
      showToast(active ? "Device enabled." : "Device disabled.", "success");
    } catch (error) { showError(error); }
  }
  useEffect(() => { refresh(); }, [data.family.id]);
  return (
    <PanelCard>
      <SectionTitle
        title="Push devices"
        subtitle="管理已订阅 push 的手机、平板、电脑"
        right={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatusPill label={`${activeCount} active`} tone={activeCount ? "success" : "warning"} />
          <button onClick={refresh} className="fd-button small">{loading ? "Loading..." : "Refresh"}</button>
        </div>}
      />
      {devices.length === 0 ? <EmptyState text="暂无 push 设备。先在 Notification centre 里 Enable push。" /> : <div className="fd-grid">
        {devices.map((device) => <article key={device.id} className="fd-row wrap">
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <strong>{device.device_label || summarizeDevice(device.user_agent)}</strong>
              <StatusPill label={device.is_active ? "active" : "disabled"} tone={device.is_active ? "success" : "warning"} />
            </div>
            <div className="fd-muted">{getMemberName(data, device.member_id)} · last seen {new Date(device.last_seen_at).toLocaleString("en-AU")}</div>
            <div className="fd-muted">created {new Date(device.created_at).toLocaleString("en-AU")}</div>
            {device.disabled_at && <div className="fd-muted">disabled {new Date(device.disabled_at).toLocaleString("en-AU")}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {device.is_active ? <button onClick={() => setActive(device, false)} className="fd-button small danger">Disable</button> : <button onClick={() => setActive(device, true)} className="fd-button small primary">Enable</button>}
          </div>
        </article>)}
      </div>}
    </PanelCard>
  );
}
