import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebaseClient";

declare global {
  interface Window {
    google?: any;
    __familyDockGoogleMapsPromise?: Promise<any>;
  }
}

export function getGoogleMapsBrowserKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
}

export function loadGoogleMaps() {
  const key = getGoogleMapsBrowserKey();
  if (!key) {
    return Promise.reject(new Error("Missing VITE_GOOGLE_MAPS_BROWSER_KEY in .env.local"));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }
  if (window.__familyDockGoogleMapsPromise) {
    return window.__familyDockGoogleMapsPromise;
  }

  window.__familyDockGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=routes`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Failed to load Google Maps script."));
    document.head.appendChild(script);
  });

  return window.__familyDockGoogleMapsPromise;
}

export async function geocodeFamilyPlaces(args: {
  familyId: string;
  placeIds?: string[];
  geocodeMissingOnly?: boolean;
}) {
  const callable = httpsCallable(firebaseFunctions, "geocodeFamilyPlaces");
  const response = await callable({
    familyId: args.familyId,
    placeIds: args.placeIds ?? [],
    geocodeMissingOnly: args.geocodeMissingOnly ?? true,
  });
  return response.data;
}

export function buildGoogleDirectionsUrl(args: {
  origin?: { lat: number; lng: number } | null;
  stops: Array<{ lat: number; lng: number; label?: string }>;
}) {
  if (args.stops.length === 0) return null;
  const encodePoint = (point: { lat: number; lng: number }) => `${point.lat},${point.lng}`;
  const origin = args.origin ? encodePoint(args.origin) : encodePoint(args.stops[0]);
  const destination = encodePoint(args.stops[args.stops.length - 1]);
  const waypointSource = args.origin ? args.stops.slice(0, -1) : args.stops.slice(1, -1);
  const waypoints = waypointSource.map(encodePoint).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving`;
}

export function formatMeters(meters: number) {
  if (!Number.isFinite(meters)) return "N/A";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds)) return "N/A";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}
