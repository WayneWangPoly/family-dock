import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { FamilyData, RouteStop } from "../../lib/familyDataTypes";
import { getPlace } from "../../lib/familyUiHelpers";
import {
  buildGoogleDirectionsUrl,
  formatMeters,
  formatSeconds,
  geocodeFamilyPlaces,
  loadGoogleMaps,
} from "../../lib/googleMaps";
import type { RouteLegSummary } from "../../lib/routePlanner";

type Props = {
  data: FamilyData;
  stops: RouteStop[];
  onRefresh?: () => Promise<unknown> | unknown;
  onLegsChange?: (legs: RouteLegSummary[]) => void;
  onOptimizedOrderChange?: (orderedStopIds: string[] | null) => void;
};

type StopPoint = {
  stop: RouteStop;
  place: any;
  lat: number;
  lng: number;
};

export function RealRouteMap({
  data,
  stops,
  onRefresh,
  onLegsChange,
  onOptimizedOrderChange,
}: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const currentLocationMarkerRef = useRef<any>(null);

  const [mapError, setMapError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [optimizeRoute, setOptimizeRoute] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState(0);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState(0);
  const [legSummaries, setLegSummaries] = useState<RouteLegSummary[]>([]);

  const stopPoints = useMemo<StopPoint[]>(() => {
    return stops
      .map((stop) => {
        const place = getPlace(data, stop.place_id) as any;
        if (!place) return null;
        if (typeof place.lat !== "number" || typeof place.lng !== "number") return null;
        return {
          stop,
          place,
          lat: place.lat,
          lng: place.lng,
        };
      })
      .filter(Boolean) as StopPoint[];
  }, [data, stops]);

  const missingPlaces = useMemo(() => {
    const ids = new Set<string>();

    for (const stop of stops) {
      const place = getPlace(data, stop.place_id) as any;
      if (!place) continue;
      if (typeof place.lat !== "number" || typeof place.lng !== "number") {
        ids.add(place.id);
      }
    }

    return Array.from(ids);
  }, [data, stops]);

  const directionsUrl = buildGoogleDirectionsUrl({
    origin: userLocation,
    stops: stopPoints.map((point) => ({
      lat: point.lat,
      lng: point.lng,
      label: point.place.name,
    })),
  });

  async function geocodeMissing() {
    if (missingPlaces.length === 0) return;

    setGeocoding(true);
    setMapError(null);

    try {
      await geocodeFamilyPlaces({
        familyId: data.family.id,
        placeIds: missingPlaces,
        geocodeMissingOnly: true,
      });

      await onRefresh?.();
    } catch (error) {
      setMapError(error instanceof Error ? error.message : JSON.stringify(error));
    } finally {
      setGeocoding(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMapError("This browser does not support geolocation.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        setMapError(error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }

  useEffect(() => {
    if (!mapEl.current) return;

    let disposed = false;

    async function initMap() {
      try {
        const google = await loadGoogleMaps();
        if (disposed || !mapEl.current) return;

        const center = stopPoints[0]
          ? { lat: stopPoints[0].lat, lng: stopPoints[0].lng }
          : { lat: -34.9285, lng: 138.6007 };

        mapRef.current = new google.maps.Map(mapEl.current, {
          center,
          zoom: stopPoints.length ? 12 : 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });

        directionsRendererRef.current = new google.maps.DirectionsRenderer({
          map: mapRef.current,
          suppressMarkers: false,
          preserveViewport: false,
        });

        setMapError(null);
      } catch (error) {
        setMapError(error instanceof Error ? error.message : JSON.stringify(error));
      }
    }

    initMap();

    return () => {
      disposed = true;
      directionsRendererRef.current?.setMap?.(null);
      currentLocationMarkerRef.current?.setMap?.(null);
      directionsRendererRef.current = null;
      currentLocationMarkerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    let disposed = false;

    async function renderRoadRoute() {
      setRouteLoading(true);
      setMapError(null);
      setRouteDistanceMeters(0);
      setRouteDurationSeconds(0);
      setLegSummaries([]);
      onLegsChange?.([]);
      onOptimizedOrderChange?.(null);

      try {
        const google = await loadGoogleMaps();
        if (disposed || !mapRef.current || !directionsRendererRef.current) return;

        if (currentLocationMarkerRef.current) {
          currentLocationMarkerRef.current.setMap(null);
          currentLocationMarkerRef.current = null;
        }

        if (userLocation) {
          currentLocationMarkerRef.current = new google.maps.Marker({
            position: userLocation,
            map: mapRef.current,
            label: "Me",
            title: "Current location",
          });
        }

        if (stopPoints.length === 0) {
          directionsRendererRef.current.setDirections({ routes: [] });
          return;
        }

        if (stopPoints.length === 1 && !userLocation) {
          const only = { lat: stopPoints[0].lat, lng: stopPoints[0].lng };
          mapRef.current.setCenter(only);
          mapRef.current.setZoom(14);
          new google.maps.Marker({
            position: only,
            map: mapRef.current,
            label: "1",
            title: stopPoints[0].place.name,
          });
          return;
        }

        const origin = userLocation
          ? userLocation
          : { lat: stopPoints[0].lat, lng: stopPoints[0].lng };

        const destinationPoint = stopPoints[stopPoints.length - 1];
        const destination = {
          lat: destinationPoint.lat,
          lng: destinationPoint.lng,
        };

        const waypointSource = userLocation
          ? stopPoints.slice(0, -1)
          : stopPoints.slice(1, -1);

        const waypoints = waypointSource.map((point) => ({
          location: new google.maps.LatLng(point.lat, point.lng),
          stopover: true,
        }));

        const directionsService = new google.maps.DirectionsService();

        const response = await directionsService.route({
          origin,
          destination,
          waypoints,
          optimizeWaypoints: optimizeRoute,
          travelMode: google.maps.TravelMode.DRIVING,
          drivingOptions: {
            departureTime: new Date(),
            trafficModel: google.maps.TrafficModel.BEST_GUESS,
          },
        });

        if (disposed) return;

        directionsRendererRef.current.setDirections(response);

        const route = response.routes?.[0];
        if (!route) return;

        if (optimizeRoute && Array.isArray(route.waypoint_order) && route.waypoint_order.length > 0) {
          const prefix = userLocation ? [] : [stopPoints[0]];
          const suffix = [destinationPoint];
          const reorderedWaypoints = route.waypoint_order.map((waypointIndex: number) => waypointSource[waypointIndex]).filter(Boolean);
          const completeOrder = [...prefix, ...reorderedWaypoints, ...suffix].map((point) => point.stop.id);
          onOptimizedOrderChange?.(completeOrder);
        }

        const legs = route.legs ?? [];
        let meters = 0;
        let seconds = 0;

        const summaries: RouteLegSummary[] = legs.map((leg: any, index: number) => {
          const legMeters = Number(leg.distance?.value ?? 0);
          const legSeconds = Number(leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0);

          meters += legMeters;
          seconds += legSeconds;

          return {
            from: index === 0 && userLocation ? "Current location" : leg.start_address ?? `Stop ${index + 1}`,
            to: leg.end_address ?? `Stop ${index + 2}`,
            distanceText: leg.distance?.text ?? formatMeters(legMeters),
            durationText: leg.duration_in_traffic?.text ?? leg.duration?.text ?? formatSeconds(legSeconds),
            distanceMeters: legMeters,
            durationSeconds: legSeconds,
          };
        });

        setRouteDistanceMeters(meters);
        setRouteDurationSeconds(seconds);
        setLegSummaries(summaries);
        onLegsChange?.(summaries);
        setMapError(null);
      } catch (error) {
        setMapError(error instanceof Error ? error.message : JSON.stringify(error));
      } finally {
        if (!disposed) setRouteLoading(false);
      }
    }

    renderRoadRoute();

    return () => {
      disposed = true;
    };
  }, [stopPoints, userLocation, optimizeRoute]);

  return (
    <section style={wrapStyle}>
      <header style={headerStyle}>
        <div>
          <strong>Road driving route</strong>
          <div className="fd-muted">
            {stopPoints.length} mapped stops · {missingPlaces.length} places need coordinates
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={useCurrentLocation} className="fd-button">Use my location</button>
          <button disabled={geocoding || missingPlaces.length === 0} onClick={geocodeMissing} className="fd-button">
            {geocoding ? "Geocoding..." : "Geocode missing"}
          </button>
          <label className="fd-button">
            <input
              type="checkbox"
              checked={optimizeRoute}
              onChange={(event) => setOptimizeRoute(event.target.checked)}
            />
            Optimize preview
          </label>
          {directionsUrl && (
            <a href={directionsUrl} target="_blank" rel="noreferrer" className="fd-button primary">
              Navigate full route
            </a>
          )}
        </div>
      </header>

      {mapError && <div className="fd-alert danger">{mapError}</div>}

      <div ref={mapEl} style={mapStyle} />

      <div style={summaryGridStyle}>
        <div className="fd-card soft">
          <div className="fd-muted">Total distance</div>
          <strong>{routeLoading ? "Calculating..." : formatMeters(routeDistanceMeters)}</strong>
        </div>
        <div className="fd-card soft">
          <div className="fd-muted">Estimated driving time</div>
          <strong>{routeLoading ? "Calculating..." : formatSeconds(routeDurationSeconds)}</strong>
        </div>
        <div className="fd-card soft">
          <div className="fd-muted">Mode</div>
          <strong>{optimizeRoute ? "Optimized preview" : "Family order"}</strong>
        </div>
      </div>

      {optimizeRoute && (
        <div className="fd-alert warning">
          Optimized preview does not change saved stop_order until you click Apply optimized in Route builder.
        </div>
      )}

      {legSummaries.length > 0 && (
        <section className="fd-card soft">
          <strong>Driving legs</strong>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {legSummaries.map((leg, index) => (
              <div key={`${leg.from}-${leg.to}-${index}`} style={legRowStyle}>
                <span style={orderStyle}>{index + 1}</span>
                <div style={{ flex: 1 }}>
                  <strong>{leg.distanceText} · {leg.durationText}</strong>
                  <div className="fd-muted">{leg.from}</div>
                  <div className="fd-muted">→ {leg.to}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

const wrapStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const mapStyle: CSSProperties = {
  height: 440,
  borderRadius: 22,
  overflow: "hidden",
  border: "1px solid var(--fd-border)",
  background: "var(--fd-border)",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const orderStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 10,
  background: "var(--fd-brand)",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
};

const legRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "start",
  padding: 10,
  borderRadius: 14,
  background: "white",
};
