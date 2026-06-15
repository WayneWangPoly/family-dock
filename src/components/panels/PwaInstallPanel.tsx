import { useEffect, useState } from "react";
import {
  ensurePwaMetadata,
  getPwaInstallPlatformHint,
  isStandaloneMode,
  registerFamilyDockServiceWorkerForPwa,
} from "../../lib/pwaInstall";
import type { BeforeInstallPromptEvent } from "../../lib/pwaInstall";
import { PanelCard, SectionTitle, StatusPill } from "./shared";
import { useToast } from "../app/ToastProvider";

export function PwaInstallPanel() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(() => isStandaloneMode());
  const [swReady, setSwReady] = useState(false);
  const { showToast, showError } = useToast();

  useEffect(() => {
    ensurePwaMetadata();

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    registerFamilyDockServiceWorkerForPwa()
      .then(() => setSwReady(true))
      .catch(() => setSwReady(false));

    const media = window.matchMedia("(display-mode: standalone)");
    const listener = () => setStandalone(isStandaloneMode());
    media.addEventListener?.("change", listener);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      media.removeEventListener?.("change", listener);
    };
  }, []);

  async function install() {
    if (!installEvent) {
      showToast(getPwaInstallPlatformHint(), "info");
      return;
    }

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      showToast(`Install ${choice.outcome}.`, choice.outcome === "accepted" ? "success" : "info");
      setInstallEvent(null);
      setStandalone(isStandaloneMode());
    } catch (error) {
      showError(error);
    }
  }

  return (
    <PanelCard>
      <SectionTitle
        title="PWA install"
        subtitle="让这个家庭工具像手机 App 一样使用"
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatusPill label={standalone ? "installed" : "browser"} tone={standalone ? "success" : "warning"} />
            <StatusPill label={swReady ? "service worker ready" : "service worker pending"} tone={swReady ? "success" : "warning"} />
          </div>
        }
      />

      <div className="fd-grid">
        <div className="fd-alert info">{getPwaInstallPlatformHint()}</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={install} className="fd-button primary">
            {installEvent ? "Install Family Dock" : "Show install instructions"}
          </button>
          <button
            onClick={() => registerFamilyDockServiceWorkerForPwa().then(() => {
              setSwReady(true);
              showToast("Service worker registered.", "success");
            }).catch(showError)}
            className="fd-button"
          >
            Refresh service worker
          </button>
        </div>
      </div>
    </PanelCard>
  );
}
