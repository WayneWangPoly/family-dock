import { useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import type { RouteDepartureLeg, RouteDeparturePlan } from "../../lib/smartRoute";
import {
  buildSplitHandoffMessage,
  loadRouteDepartureAlerts,
  runRouteDepartureAlertCheck,
  updateRouteLegExecution,
  updateRoutePlanExecution,
} from "../../lib/routeExecution";
import type { RouteDepartureAlert } from "../../lib/routeExecution";
import { getMemberName } from "../../lib/familyUiHelpers";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { riskTone } from "../../lib/smartRoute";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
  plan: RouteDeparturePlan | null;
  legs: RouteDepartureLeg[];
  onRefreshPlan?: () => Promise<unknown> | unknown;
  onReloadLegs?: () => Promise<unknown> | unknown;
};

export function RouteExecutionPanel({ data, plan, legs, onRefreshPlan, onReloadLegs }: Props) {
  const [alerts, setAlerts] = useState<RouteDepartureAlert[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const { showToast, showError } = useToast();

  const parents = useMemo(() => {
    return data.members.filter((member) => ["parent", "guardian"].includes(member.role));
  }, [data.members]);

  async function refreshAlerts() {
    if (!plan) return;
    try {
      setAlerts(await loadRouteDepartureAlerts(data.family.id, plan.id));
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    refreshAlerts();
  }, [data.family.id, plan?.id]);

  async function runAlerts() {
    if (!plan) return;
    setBusy("alerts");
    try {
      const result = await runRouteDepartureAlertCheck({ data, planId: plan.id });
      await refreshAlerts();
      await onRefreshPlan?.();
      showToast(`Alert check: sent ${result.sent}, failed ${result.failed}, skipped ${result.skipped}.`, result.failed ? "error" : "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function updatePlanPatch(args: {
    assignedParentId?: string | null;
    alertEnabled?: boolean;
    alertMinutesBefore?: number;
    executionStatus?: "planned" | "ready" | "on_the_way" | "completed" | "cancelled";
  }) {
    if (!plan) return;
    try {
      await updateRoutePlanExecution({
        familyId: data.family.id,
        planId: plan.id,
        ...args,
      });
      await onRefreshPlan?.();
      showToast("Route plan updated.", "success");
    } catch (error) {
      showError(error);
    }
  }

  async function updateLegPatch(leg: RouteDepartureLeg, args: {
    assignedParentId?: string | null;
    legStatus?: "planned" | "ready" | "on_the_way" | "arrived" | "completed" | "skipped";
  }) {
    if (!leg.id) return;
    try {
      await updateRouteLegExecution({
        familyId: data.family.id,
        legId: leg.id,
        ...args,
      });
      await onReloadLegs?.();
      showToast("Route leg updated.", "success");
    } catch (error) {
      showError(error);
    }
  }

  function copySplitMessage() {
    if (!plan) return;
    const text = buildSplitHandoffMessage({
      plan,
      legs,
      getMemberName: (id) => getMemberName(data, id ?? null),
    });
    navigator.clipboard.writeText(text);
    showToast("Split handoff copied.", "success");
  }

  if (!plan) {
    return (
      <PanelCard>
        <SectionTitle title="Execution + alerts" subtitle="选择一份 active route plan 后显示执行提醒。" />
        <EmptyState text="No selected plan." />
      </PanelCard>
    );
  }

  return (
    <div className="fd-grid">
      <PanelCard>
        <SectionTitle
          title="Execution + leave alerts"
          subtitle="指定负责家长，运行 leave-now / leave-soon push alert"
          right={<StatusPill label={plan.overall_risk} tone={riskTone(plan.overall_risk) as any} />}
        />

        <div className="fd-grid two">
          <label className="fd-field">
            Assigned parent
            <select
              className="fd-select"
              value={(plan as any).assigned_parent_id ?? ""}
              onChange={(event) => updatePlanPatch({ assignedParentId: event.target.value || null })}
            >
              <option value="">All parents / guardians</option>
              {parents.map((member) => (
                <option key={member.id} value={member.id}>{member.display_name}</option>
              ))}
            </select>
          </label>

          <label className="fd-field">
            Execution status
            <select
              className="fd-select"
              value={(plan as any).execution_status ?? "planned"}
              onChange={(event) => updatePlanPatch({ executionStatus: event.target.value as any })}
            >
              <option value="planned">planned</option>
              <option value="ready">ready</option>
              <option value="on_the_way">on_the_way</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>

          <label className="fd-field">
            Alert minutes before
            <input
              className="fd-input"
              type="number"
              value={(plan as any).alert_minutes_before ?? 15}
              onChange={(event) => updatePlanPatch({ alertMinutesBefore: Number(event.target.value) })}
            />
          </label>

          <label className="fd-field">
            Alert enabled
            <select
              className="fd-select"
              value={(plan as any).alert_enabled ? "yes" : "no"}
              onChange={(event) => updatePlanPatch({ alertEnabled: event.target.value === "yes" })}
            >
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </label>
        </div>

        <div className="fd-alert info" style={{ marginTop: 12 }}>
          Manual alert check 会发送给 assigned parent 的 active push devices；如果未指定，则发送给 parent / guardian。
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button disabled={busy === "alerts"} onClick={runAlerts} className="fd-button primary">
            {busy === "alerts" ? "Checking..." : "Run leave alert check"}
          </button>
          <button onClick={copySplitMessage} className="fd-button">Copy Dad/Mum split</button>
          <button onClick={refreshAlerts} className="fd-button">Refresh alerts</button>
        </div>

        {(plan as any).alert_sent_at && (
          <div className="fd-muted" style={{ marginTop: 8 }}>
            Alert sent at {new Date((plan as any).alert_sent_at).toLocaleString("en-AU")}
          </div>
        )}
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="Assign each leg"
          subtitle="如果爸爸妈妈分头接送，可以逐段分配"
          right={<StatusPill label={`${legs.length} legs`} tone="info" />}
        />

        {legs.length === 0 ? (
          <EmptyState text="No route legs loaded." />
        ) : (
          <div className="fd-grid">
            {legs.map((leg) => (
              <article key={leg.id ?? `${leg.leg_order}-${leg.related_event_id}`} className="fd-card soft">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong>{leg.leg_order}. {leg.from_label} → {leg.to_label}</strong>
                  <StatusPill label={leg.risk_level} tone={riskTone(leg.risk_level) as any} />
                  <StatusPill label={(leg as any).leg_status ?? "planned"} tone="info" />
                </div>

                <div className="fd-muted">
                  {leg.event_title} · {getMemberName(data, leg.child_id)} · assigned {(leg as any).assigned_parent_id ? getMemberName(data, (leg as any).assigned_parent_id) : "not set"}
                </div>

                <div className="fd-grid two" style={{ marginTop: 10 }}>
                  <label className="fd-field">
                    Assigned parent
                    <select
                      className="fd-select"
                      value={(leg as any).assigned_parent_id ?? ""}
                      onChange={(event) => updateLegPatch(leg, { assignedParentId: event.target.value || null })}
                    >
                      <option value="">Use plan default</option>
                      {parents.map((member) => (
                        <option key={member.id} value={member.id}>{member.display_name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="fd-field">
                    Leg status
                    <select
                      className="fd-select"
                      value={(leg as any).leg_status ?? "planned"}
                      onChange={(event) => updateLegPatch(leg, { legStatus: event.target.value as any })}
                    >
                      <option value="planned">planned</option>
                      <option value="ready">ready</option>
                      <option value="on_the_way">on_the_way</option>
                      <option value="arrived">arrived</option>
                      <option value="completed">completed</option>
                      <option value="skipped">skipped</option>
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="Alert logs"
          subtitle="查看 leave alert 是否发出、跳过或失败"
          right={<StatusPill label={`${alerts.length} logs`} tone="info" />}
        />

        {alerts.length === 0 ? (
          <EmptyState text="No route departure alerts yet." />
        ) : (
          <div className="fd-grid">
            {alerts.map((alert) => (
              <article key={alert.id} className="fd-row wrap">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <strong>{alert.title}</strong>
                    <StatusPill label={alert.alert_type} tone="info" />
                    <StatusPill
                      label={alert.status}
                      tone={alert.status === "sent" ? "success" : alert.status === "failed" ? "danger" : "warning"}
                    />
                  </div>
                  <div className="fd-muted">
                    {alert.body}
                  </div>
                  <div className="fd-muted">
                    {alert.sent_at ? `sent ${new Date(alert.sent_at).toLocaleString("en-AU")}` : `created ${new Date(alert.created_at).toLocaleString("en-AU")}`}
                  </div>
                  {alert.error_message && <div className="fd-alert danger" style={{ marginTop: 8 }}>{alert.error_message}</div>}
                </div>
              </article>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}
