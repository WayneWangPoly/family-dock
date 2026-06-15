import { useMemo } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import type { RouteDepartureLeg } from "../../lib/smartRoute";
import { getGoogleMapsBrowserKey } from "../../lib/googleMaps";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";

type Props = {
  data: FamilyData;
  legs: RouteDepartureLeg[];
};

function getPlace(data: FamilyData, placeId?: string | null) {
  if (!placeId) return null;
  return (data.places as any[]).find((place) => place.id === placeId) ?? null;
}

export function RouteMapPreviewPanel({ data, legs }: Props) {
  const mapsKey = getGoogleMapsBrowserKey();

  const points = useMemo(() => {
    return legs
      .map((leg) => getPlace(data, leg.to_place_id))
      .filter((place) => place && typeof place.lat === "number" && typeof place.lng === "number");
  }, [data, legs]);

  const mapUrl = useMemo(() => {
    if (!mapsKey || points.length === 0) return null;

    const center = `${points[0].lat},${points[0].lng}`;
    const markers = points
      .slice(0, 10)
      .map((place, index) => `markers=color:red%7Clabel:${index + 1}%7C${place.lat},${place.lng}`)
      .join("&");

    const path = points.length > 1
      ? `&path=color:0x31535cff|weight:4|${points.map((place) => `${place.lat},${place.lng}`).join("|")}`
      : "";

    return `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=12&size=640x360&scale=2&${markers}${path}&key=${mapsKey}`;
  }, [mapsKey, points]);

  function openGoogleMaps() {
    if (points.length === 0) return;

    if (points.length === 1) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${points[0].lat},${points[0].lng}`, "_blank");
      return;
    }

    const origin = `${points[0].lat},${points[0].lng}`;
    const destination = `${points[points.length - 1].lat},${points[points.length - 1].lng}`;
    const waypoints = points.slice(1, -1).map((place) => `${place.lat},${place.lng}`).join("|");

    const params = new URLSearchParams({
      api: "1",
      origin,
      destination,
      travelmode: "driving",
    });
    if (waypoints) params.set("waypoints", waypoints);

    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank");
  }

  return (
    <PanelCard>
      <SectionTitle
        title="Route map preview"
        subtitle="地图预览和外部 Google Maps 导航"
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatusPill label={mapsKey ? "maps key ready" : "maps key missing"} tone={mapsKey ? "success" : "warning"} />
            <StatusPill label={`${points.length} mapped`} tone="info" />
          </div>
        }
      />

      {points.length === 0 ? (
        <EmptyState text="No coordinates available for route map preview." />
      ) : (
        <div className="fd-grid">
          {mapUrl ? (
            <img
              src={mapUrl}
              alt="Route preview"
              style={{
                width: "100%",
                borderRadius: 22,
                border: "1px solid var(--fd-border)",
                objectFit: "cover",
              }}
            />
          ) : (
            <div className="fd-alert warning">
              VITE_GOOGLE_MAPS_BROWSER_KEY is missing. You can still open external maps if coordinates exist.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={openGoogleMaps} className="fd-button primary">Open in Google Maps</button>
          </div>
        </div>
      )}
    </PanelCard>
  );
}
