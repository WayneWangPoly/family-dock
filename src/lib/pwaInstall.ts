export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function ensurePwaMetadata() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.webmanifest";
    document.head.appendChild(manifest);
  }

  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#31535c";
    document.head.appendChild(meta);
  }

  let apple = document.querySelector('meta[name="apple-mobile-web-app-capable"]') as HTMLMetaElement | null;
  if (!apple) {
    apple = document.createElement("meta");
    apple.name = "apple-mobile-web-app-capable";
    apple.content = "yes";
    document.head.appendChild(apple);
  }
}

export function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as any).standalone);
}

export function getPwaInstallPlatformHint() {
  const ua = navigator.userAgent.toLowerCase();

  if (/iphone|ipad/.test(ua)) {
    return "iPhone/iPad: open in Safari, tap Share, then Add to Home Screen.";
  }

  if (/android/.test(ua)) {
    return "Android: tap browser menu, then Install app or Add to Home screen.";
  }

  return "Desktop: use the browser install button in the address bar if available.";
}

export async function registerFamilyDockServiceWorkerForPwa() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service worker is not supported by this browser.");
  }

  const registration = await navigator.serviceWorker.register("/fd-sw.js");
  return registration;
}
