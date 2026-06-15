import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { FamilyData, RouteStop } from "../../lib/familyDataTypes";
import { getMemberName, getPlace } from "../../lib/familyUiHelpers";
import {
  deleteRouteStop,
  reorderArrayByDrag,
  reorderRouteStops,
  replaceRouteFromCalendarEvents,
} from "../../lib/routePlanner";
import { RouteStopFormModal } from "../forms/RouteStopFormModal";
import { SectionTitle, StatusPill } from "./shared";

type Props = {
  data: FamilyData;
  dateKey: string;
  stops: RouteStop[];
  optimizedStopOrder: string[] | null;
  onRefresh?: () => Promise<unknown> | unknown;
};

export function RouteBuilderPanel({
  data,
  dateKey,
  stops,
  optimizedStopOrder,
  onRefresh,
}: Props) {
  const [draftStops, setDraftStops] = useState<RouteStop[]>(stops);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    setDraftStops(stops);
  }, [stops]);

  const changed = useMemo(() => {
    return draftStops.map((stop) => stop.id).join("|") !== stops.map((stop) => stop.id).join("|");
  }, [draftStops, stops]);

  async function saveOrder(order = draftStops.map((stop) => stop.id)) {
    setSaving(true);

    try {
      await reorderRouteStops({
        familyId: data.family.id,
        orderedStopIds: order,
      });

      await onRefresh?.();
    } finally {
      setSaving(false);
    }
  }

  async function applyOptimized() {
    if (!optimizedStopOrder?.length) {
      alert("No optimized order available. Turn on Optimize preview first.");
      return;
    }

    await saveOrder(optimizedStopOrder);
  }

  async function generateFromCalendar() {
    const confirmed = window.confirm("Replace this day's route stops using calendar events?");
    if (!confirmed) return;

    setSaving(true);

    try {
      await replaceRouteFromCalendarEvents({
        data,
        dateKey,
      });

      await onRefresh?.();
    } finally {
      setSaving(false);
    }
  }

  async function removeStop(stop: RouteStop) {
    const place = getPlace(data, stop.place_id);
    const confirmed = window.confirm(`Delete stop ${place?.name ?? stop.id}?`);
    if (!confirmed) return;

    setSaving(true);

    try {
      await deleteRouteStop({
        familyId: data.family.id,
        stopId: stop.id,
      });

      await onRefresh?.();
    } finally {
      setSaving(false);
    }
  }

  function move(index: number, delta: number) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= draftStops.length) return;
    setDraftStops(reorderArrayByDrag(draftStops, index, nextIndex));
  }

  return (
    <>
      <section className="fd-card">
        <SectionTitle
          title="Route builder"
          subtitle="拖拽/移动顺序，从日程生成路线，应用优化顺序"
          right={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="fd-button primary" onClick={() => setFormOpen(true)}>Add stop</button>
              <button className="fd-button" disabled={saving} onClick={generateFromCalendar}>From calendar</button>
              <button className="fd-button" disabled={saving || !changed} onClick={() => saveOrder()}>
                {saving ? "Saving..." : "Save order"}
              </button>
              <button className="fd-button" disabled={saving || !optimizedStopOrder?.length} onClick={applyOptimized}>
                Apply optimized
              </button>
            </div>
          }
        />

        {draftStops.length === 0 && (
          <div className="fd-empty">No route stops. Add a stop or generate from today's calendar.</div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {draftStops.map((stop, index) => {
            const place = getPlace(data, stop.place_id) as any;
            const hasCoords = typeof place?.lat === "number" && typeof place?.lng === "number";

            return (
              <div
                key={stop.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragIndex === null || dragIndex === index) return;
                  setDraftStops(reorderArrayByDrag(draftStops, dragIndex, index));
                  setDragIndex(null);
                }}
                style={{
                  ...stopRowStyle,
                  opacity: dragIndex === index ? 0.55 : 1,
                }}
              >
                <div style={orderStyle}>{index + 1}</div>

                <div style={{ flex: 1 }}>
                  <strong>{place?.name ?? "未指定地点"}</strong>
                  <div className="fd-muted">
                    {stop.stop_type} · {getMemberName(data, stop.responsible_member_id)}
                  </div>
                  <div className="fd-muted">
                    {hasCoords ? `${place.lat}, ${place.lng}` : "Missing coordinates"}
                  </div>
                  {stop.note && <div className="fd-muted">{stop.note}</div>}
                </div>

                <StatusPill label={stop.status} />

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="fd-button" onClick={() => move(index, -1)}>↑</button>
                  <button className="fd-button" onClick={() => move(index, 1)}>↓</button>
                  <button className="fd-button danger" onClick={() => removeStop(stop)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <RouteStopFormModal
        open={formOpen}
        data={data}
        dateKey={dateKey}
        existingCount={stops.length}
        onClose={() => setFormOpen(false)}
        onSaved={onRefresh}
      />
    </>
  );
}

const stopRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: 12,
  borderRadius: 18,
  background: "var(--fd-surface-soft)",
  border: "1px solid var(--fd-border)",
  flexWrap: "wrap",
  cursor: "grab",
};

const orderStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 12,
  background: "var(--fd-brand)",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
};
