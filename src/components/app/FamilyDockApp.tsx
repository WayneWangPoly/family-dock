import { useState } from "react";
import type { CSSProperties } from "react";
import { AppShell } from "./AppShell";
import { ChildPortalApp } from "./ChildPortalApp";
import { TodayPanel } from "../panels/TodayPanel";
import { AICopilotPanel } from "../panels/AICopilotPanel";
import { CalendarPanel } from "../panels/CalendarPanel";
import { RoutePanel } from "../panels/RoutePanel";
import { FamilyPanel } from "../panels/FamilyPanel";
import { AdminPanel } from "../panels/AdminPanel";
import { useFamilyData } from "../../hooks/useFamilyData";
import { signOut } from "../../lib/familyDataApi";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { useToast } from "./ToastProvider";
import { NotificationBell } from "../ui/NotificationBell";

export type AppTab =
  | "today"
  | "ai"
  | "calendar"
  | "route"
  | "family"
  | "health";

export function FamilyDockApp() {
  const {
    data,
    loading,
    refreshing,
    errorMessage,
    refresh,
    realtimeStatus,
    lastRealtimeChange,
  } = useFamilyData();

  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const { showError } = useToast();

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (errorMessage || !data) {
    return (
      <main className="fd-error-page">
        <section className="fd-error-card">
          <h1 style={{ marginTop: 0 }}>Family Dock could not load data</h1>
          <div className="fd-alert danger">{errorMessage ?? "No data loaded"}</div>
          <button
            onClick={() => refresh().catch((error) => showError(error))}
            className="fd-button primary"
            style={{ marginTop: 14 }}
          >
            Retry
          </button>
        </section>
      </main>
    );
  }

  if (data.role.role === "child" || data.role.role === "homestay") {
    return (
      <ChildPortalApp
        data={data}
        refreshing={refreshing}
        realtimeStatus={realtimeStatus}
        lastRealtimeChange={lastRealtimeChange}
        onRefresh={refresh}
      />
    );
  }

  return (
    <>
      <AppShell
        familyName={data.family.name}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        rightSlot={<NotificationBell data={data} onOpen={() => setActiveTab("calendar")} />}
      >
        {activeTab === "today" && <TodayPanel data={data} />}
        {activeTab === "ai" && <AICopilotPanel data={data} activePage={activeTab} onRefresh={refresh} />}
        {activeTab === "calendar" && <CalendarPanel data={data} onRefresh={refresh} />}
        {activeTab === "route" && <RoutePanel data={data} onRefresh={refresh} />}
        {activeTab === "family" && (
          <FamilyPanel
            data={data}
            onRefresh={refresh}
            realtimeStatus={realtimeStatus}
            onSignOut={async () => {
              await signOut();
              location.reload();
            }}
          />
        )}
        {activeTab === "health" && <AdminPanel data={data} realtimeStatus={realtimeStatus} />}
      </AppShell>

    </>
  );
}

export const buttonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 12,
  border: "1px solid #d6d3d1",
  background: "white",
  fontWeight: 800,
  cursor: "pointer",
};
