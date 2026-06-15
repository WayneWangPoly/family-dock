import { useState } from "react";
import type { ReactNode } from "react";
import type { AppTab } from "./FamilyDockApp";

export type AppShellTab = {
  id: AppTab;
  label: string;
  shortLabel?: string;
  group: "main" | "admin";
  subtitle?: string;
};

type AppShellProps = {
  familyName: string;
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  rightSlot?: ReactNode;
  children: ReactNode;
};

export const appTabs: AppShellTab[] = [
  { id: "today", label: "Today", group: "main", subtitle: "Your day" },
  { id: "calendar", label: "Calendar", group: "main", subtitle: "Schedule" },
  { id: "ai", label: "AI", group: "main", subtitle: "Ask once" },
  { id: "route", label: "Route", group: "main", subtitle: "Pickup timing" },
  { id: "family", label: "Family", group: "main", subtitle: "Homework, meals, payments" },
];

const primaryMobileTabs: AppTab[] = ["today", "calendar", "ai", "route", "family"];

export function AppShell({
  familyName,
  activeTab,
  onTabChange,
  rightSlot,
  children,
}: AppShellProps) {
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const currentTab = appTabs.find((tab) => tab.id === activeTab) ?? appTabs[0];

  function go(tab: AppTab) {
    onTabChange(tab);
    setDesktopMenuOpen(false);
  }

  return (
    <div className="fd-app-shell consumer">
      <header className="fd-topbar consumer">
        <div className="fd-title-block">
          <div className="fd-mobile-brand-row">
            <div>
              <div className="fd-mobile-family-name">{familyName}</div>
              <h1 className="fd-page-title">{currentTab.label}</h1>
            </div>
          </div>
          <div className="fd-desktop-title-block">
            <h1 className="fd-page-title">{currentTab.label}</h1>
            {currentTab.subtitle && <div className="fd-page-subtitle">{currentTab.subtitle}</div>}
          </div>
        </div>

        <div className="fd-topbar-actions">
          {rightSlot}
          <button className="fd-icon-button fd-desktop-menu-button" onClick={() => setDesktopMenuOpen((value) => !value)} aria-label="Open menu">
            ☰
          </button>
        </div>

        {desktopMenuOpen && (
          <div className="fd-desktop-menu">
            {appTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => go(tab.id)}
                className={`fd-desktop-menu-item ${activeTab === tab.id ? "active" : ""}`}
              >
                <strong>{tab.label}</strong>
                <span>{tab.subtitle}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="fd-main consumer">
        <div className="fd-content">{children}</div>
      </main>

      <nav className="fd-bottom-nav" aria-label="Primary navigation">
        {primaryMobileTabs.map((tabId) => {
          const tab = appTabs.find((item) => item.id === tabId);
          if (!tab) return null;
          return (
            <button
              key={tab.id}
              onClick={() => go(tab.id)}
              className={`fd-bottom-button ${activeTab === tab.id ? "active" : ""}`}
            >
              <span className="fd-bottom-icon" aria-hidden="true">{getTabIcon(tab.id)}</span>
              <span>{tab.shortLabel ?? tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function getTabIcon(tab: AppTab) {
  if (tab === "today") return "⌂";
  if (tab === "calendar") return "□";
  if (tab === "ai") return "✦";
  if (tab === "route") return "➜";
  if (tab === "family") return "♡";
  return "•";
}
