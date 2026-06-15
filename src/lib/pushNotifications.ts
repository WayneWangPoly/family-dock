import { supabase } from "./supabaseClient";

export type PushSupportState = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  hasServiceWorker: boolean;
  hasPushManager: boolean;
};

export function getVapidPublicKey() {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
}

export function getPushSupportState(): PushSupportState {
  const hasServiceWorker = "serviceWorker" in navigator;
  const hasPushManager = "PushManager" in window;
  const supported = "Notification" in window && hasServiceWorker && hasPushManager;

  return {
    supported,
    permission: "Notification" in window ? Notification.permission : "unsupported",
    hasServiceWorker,
    hasPushManager,
  };
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function registerFamilyDockServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported on this browser.");
  }

  return navigator.serviceWorker.register("/fd-sw.js");
}

export async function getExistingPushSubscription() {
  if (!("serviceWorker" in navigator)) return null;

  const registration = await navigator.serviceWorker.getRegistration("/fd-sw.js")
    ?? await registerFamilyDockServiceWorker();

  return registration.pushManager.getSubscription();
}

export async function subscribeCurrentDevice(args: {
  familyId: string;
  memberId?: string | null;
  deviceLabel?: string | null;
}) {
  const support = getPushSupportState();

  if (!support.supported) {
    throw new Error("This browser does not support web push notifications.");
  }

  const vapidPublicKey = getVapidPublicKey();
  if (!vapidPublicKey) {
    throw new Error("Missing VITE_VAPID_PUBLIC_KEY in .env.local.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(`Notification permission is ${permission}.`);
  }

  const registration = await registerFamilyDockServiceWorker();

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = subscription.toJSON();

  const { data, error } = await supabase.functions.invoke("save-push-subscription", {
    body: {
      action: "save",
      family_id: args.familyId,
      member_id: args.memberId ?? null,
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
      user_agent: navigator.userAgent,
      device_label: args.deviceLabel ?? null,
    },
  });

  if (error) throw error;

  return data;
}

export async function deactivateCurrentDevicePush(args: {
  familyId: string;
}) {
  const subscription = await getExistingPushSubscription();

  if (!subscription) {
    return {
      ok: true,
      message: "No local subscription found.",
    };
  }

  const endpoint = subscription.endpoint;

  await subscription.unsubscribe();

  const { data, error } = await supabase.functions.invoke("save-push-subscription", {
    body: {
      action: "deactivate",
      family_id: args.familyId,
      endpoint,
    },
  });

  if (error) throw error;

  return data;
}

export async function sendManualTestPush(args: {
  familyId: string;
}) {
  const { data, error } = await supabase.functions.invoke("send-family-reminders", {
    body: {
      family_id: args.familyId,
      mode: "manual_test",
      target_url: window.location.origin,
    },
  });

  if (error) throw error;

  return data;
}

export async function runDueReminderCheck(args: {
  familyId: string;
}) {
  const { data, error } = await supabase.functions.invoke("send-family-reminders", {
    body: {
      family_id: args.familyId,
      mode: "due_reminders",
      target_url: window.location.origin,
    },
  });

  if (error) throw error;

  return data;
}
