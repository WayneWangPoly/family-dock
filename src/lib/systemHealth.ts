import { getPushSupportState, getVapidPublicKey } from "./pushNotifications";
import { getGoogleMapsBrowserKey } from "./googleMaps";
import { isStandaloneMode } from "./pwaInstall";

export type HealthItem = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

export async function buildSystemHealthItems(): Promise<HealthItem[]> {
  const push = getPushSupportState();
  const serviceWorkerRegistration = "serviceWorker" in navigator
    ? await navigator.serviceWorker.getRegistration("/fd-sw.js").catch(() => null)
    : null;

  return [
    {
      key: "online",
      label: "Network",
      ok: navigator.onLine,
      detail: navigator.onLine ? "Online" : "Offline",
    },
    {
      key: "standalone",
      label: "PWA installed",
      ok: isStandaloneMode(),
      detail: isStandaloneMode() ? "Running as installed PWA" : "Running in browser tab",
    },
    {
      key: "service-worker",
      label: "Service worker",
      ok: Boolean(serviceWorkerRegistration),
      detail: serviceWorkerRegistration ? "Registered" : "Not registered yet",
    },
    {
      key: "push-support",
      label: "Push support",
      ok: push.supported,
      detail: `Permission: ${push.permission}`,
    },
    {
      key: "vapid",
      label: "VAPID public key",
      ok: Boolean(getVapidPublicKey()),
      detail: getVapidPublicKey() ? "Configured" : "Missing VITE_VAPID_PUBLIC_KEY",
    },
    {
      key: "maps",
      label: "Google Maps key",
      ok: Boolean(getGoogleMapsBrowserKey()),
      detail: getGoogleMapsBrowserKey() ? "Configured" : "Missing VITE_GOOGLE_MAPS_BROWSER_KEY",
    },
  ];
}
