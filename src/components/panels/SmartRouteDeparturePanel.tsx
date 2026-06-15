import { useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  formatTime,
  generateRouteDeparturePlan,
  loadHandoffMessages,
  loadRouteDepartureLegs,
  loadRouteDeparturePlans,
  riskTone,
  todayDateKey,
} from "../../lib/smartRoute";
import type { ParentHandoffMessage, RouteDepartureLeg, RouteDeparturePlan } from "../../lib/smartRoute";
import { getMemberName } from "../../lib/familyUiHelpers";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
};

export function SmartRouteDeparturePanel({ data }: Props) {
  const [planDate, setPlanDate] = useState(todayDateKey());
  const [startPlaceId, setStartPlaceId] = useState("");
  const [startLabel, setStartLabel] = useState("Current location");
  const [bufferMinutes, setBufferMinutes] = useState(10);
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState<RouteDeparturePlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<RouteDeparturePlan | null>(null);
  const [legs, setLegs] = useState<RouteDepartureLeg[]>([]);
  const [handoffs, setHandoffs] = useState<ParentHandoffMessage[]>([]);
  const { showToast, showError } = useToast();

  const placesMissingCoords = useMemo(() => {
    return data.places.filter((place: any) => typeof place.lat !== "number" || typeof place.lng !== "number").length;
  }, [data.places]);

  async function refresh() {
    try {
      const rows = await loadRouteDeparturePlans(data.family.id, 8);
      setPlans(rows);
      if (!selectedPlan && rows[0]) await loadDetails(rows[0]);
      if (selectedPlan) setSelectedPlan(rows.find((row: RouteDeparturePlan) => row.id === selectedPlan.id) ?? selectedPlan);
    } catch (error) {
      showError(error);
    }
  }

  async function loadDetails(plan: RouteDeparturePlan) {
    setSelectedPlan(plan);
    try {
      const [legRows, handoffRows] = await Promise.all([
        loadRouteDepartureLegs(data.family.id, plan.id),
        loadHandoffMessages(data.family.id, plan.id),
      ]);
      setLegs(legRows);
      setHandoffs(handoffRows);
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    refresh();
  }, [data.family.id]);

  function detectCurrentLocation() {
    if (!navigator.geolocation) {
      showToast("Location is not available on this device. You can still plan from saved places.", "error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLat(position.coords.latitude);
        setCurrentLng(position.coords.longitude);
        setUseCurrentLocation(true);
        showToast("Start location is ready.", "success");
      },
      (error) => {
        showToast(error.message || "Could not get current location.", "error");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function generate() {
    setBusy(true);
    try {
      const result = await generateRouteDeparturePlan({
        data,
        planDate,
        startPlaceId: startPlaceId || null,
        startLabel,
        currentLat: useCurrentLocation ? currentLat : null,
        currentLng: useCurrentLocation ? currentLng : null,
        bufferMinutes,
        save: true,
      });

      await refresh();
      setSelectedPlan(result.plan);
      setLegs(result.legs);
      setHandoffs(result.handoff ? [result.handoff] : []);
      showToast("Route is ready.", "success");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string, label = "Copied.") {
    navigator.clipboard.writeText(text);
    showToast(label, "success");
  }

  const firstHandoff = handoffs[0];

  return (
    <div className="fd-grid fd-route-page">
      <PanelCard raised>
        <SectionTitle
          title="Pickup plan"
          subtitle="Choose the day, then let the app work out when to leave"
          right={selectedPlan ? <StatusPill label={selectedPlan.overall_risk} tone={riskTone(selectedPlan.overall_risk) as any} /> : undefined}
        />

        <label className="fd-field">
          Day
          <input className="fd-input" type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} />
        </label>

        <div className="fd-button-row fd-route-primary-actions">
          <button onClick={detectCurrentLocation} className="fd-button">Use my location</button>
          <button disabled={busy} onClick={generate} className="fd-button primary">
            {busy ? "Planning..." : "Plan route"}
          </button>
        </div>

        <details className="fd-disclosure quiet" style={{ marginTop: 12 }}>
          <summary>Route settings</summary>
          <div className="fd-grid two" style={{ marginTop: 10 }}>
            <label className="fd-field">
              Starting from
              <select className="fd-select" value={startPlaceId} onChange={(event) => setStartPlaceId(event.target.value)}>
                <option value="">Current location</option>
                {data.places.map((place) => (
                  <option key={place.id} value={place.id}>{place.name}</option>
                ))}
              </select>
            </label>
            <label className="fd-field">
              Start label
              <input className="fd-input" value={startLabel} onChange={(event) => setStartLabel(event.target.value)} />
            </label>
            <label className="fd-field">
              Extra time before arrival
              <input className="fd-input" type="number" value={bufferMinutes} onChange={(event) => setBufferMinutes(Number(event.target.value))} />
            </label>
          </div>
          {placesMissingCoords > 0 && <div className="fd-muted">{placesMissingCoords} saved place(s) need coordinates for more accurate timing.</div>}
        </details>

        {currentLat && currentLng && <div className="fd-muted">Start location captured.</div>}
      </PanelCard>

      {selectedPlan && (
        <PanelCard>
          <SectionTitle title="Leave time" subtitle="Based on the selected day" />
          <div className="fd-route-time-card">
            <div>
              <span>Recommended</span>
              <strong>{formatTime(selectedPlan.recommended_departure_at)}</strong>
            </div>
            <div>
              <span>Latest</span>
              <strong>{formatTime(selectedPlan.latest_safe_departure_at)}</strong>
            </div>
            <div>
              <span>Travel</span>
              <strong>{selectedPlan.total_travel_minutes}m</strong>
            </div>
          </div>
          {selectedPlan.warnings.length > 0 && (
            <div className="fd-feed-list" style={{ marginTop: 12 }}>
              {selectedPlan.warnings.slice(0, 3).map((warning) => (
                <div key={warning} className="fd-feed-item warning">
                  <div className="fd-feed-icon">!</div>
                  <div className="fd-feed-copy"><strong>{warning}</strong></div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      )}

      <PanelCard>
        <SectionTitle title="Stops" subtitle="Pickup and drop-off sequence" right={legs.length ? <StatusPill label={`${legs.length}`} tone="info" /> : undefined} />
        {legs.length === 0 ? (
          <EmptyState text="Plan a route to see stops." />
        ) : (
          <div className="fd-agenda-list">
            {legs.map((leg) => (
              <article key={`${leg.leg_order}-${leg.related_event_id}`} className="fd-agenda-item">
                <div className="fd-feed-icon">{leg.leg_order}</div>
                <div className="fd-agenda-copy">
                  <strong>{leg.to_label}</strong>
                  <span>{leg.event_title} · {getMemberName(data, leg.child_id)}</span>
                  <span>Leave {formatTime(leg.recommended_departure_at)} · arrive {formatTime(leg.arrival_target_at)}</span>
                </div>
                <StatusPill label={leg.risk_level} tone={riskTone(leg.risk_level) as any} />
              </article>
            ))}
          </div>
        )}
      </PanelCard>

      {firstHandoff && (
        <PanelCard>
          <SectionTitle title="Share with another parent" subtitle="Copyable handoff" />
          <pre className="fd-handoff-preview">{firstHandoff.message_text}</pre>
          <div className="fd-button-row">
            <button onClick={() => copy(firstHandoff.message_text, "Message copied.")} className="fd-button primary">Copy message</button>
            <button onClick={() => window.location.href = `sms:?&body=${encodeURIComponent(firstHandoff.message_text)}`} className="fd-button">Open SMS</button>
          </div>
        </PanelCard>
      )}

      {plans.length > 0 && (
        <details className="fd-disclosure quiet">
          <summary>Previous plans</summary>
          <div className="fd-feed-list" style={{ marginTop: 10 }}>
            {plans.map((plan) => (
              <button key={plan.id} onClick={() => loadDetails(plan)} className="fd-feed-item as-button">
                <div className="fd-feed-icon">➜</div>
                <div className="fd-feed-copy">
                  <strong>{plan.plan_date}</strong>
                  <span>Leave {formatTime(plan.recommended_departure_at)} · {plan.total_travel_minutes} min</span>
                </div>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
