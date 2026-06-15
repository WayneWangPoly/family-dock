import type { RealtimeStatus } from "../lib/familyRealtime";

type RealtimeStatusBadgeProps = {
  status: RealtimeStatus;
  refreshing?: boolean;
  lastTable?: string | null;
};

export function RealtimeStatusBadge({
  status,
  refreshing,
  lastTable,
}: RealtimeStatusBadgeProps) {
  const label =
    status === "subscribed"
      ? "Realtime connected"
      : status === "subscribing"
      ? "Realtime connecting"
      : status === "channel_error"
      ? "Realtime error"
      : status === "timed_out"
      ? "Realtime timed out"
      : status === "closed"
      ? "Realtime closed"
      : "Realtime idle";

  const background =
    status === "subscribed"
      ? "#ecfdf5"
      : status === "channel_error" || status === "timed_out"
      ? "#fef2f2"
      : "#f8fafc";

  const color =
    status === "subscribed"
      ? "#047857"
      : status === "channel_error" || status === "timed_out"
      ? "#b91c1c"
      : "#475569";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 999,
        background,
        color,
        fontSize: 13,
        fontWeight: 800,
      }}
    >
      <span>{refreshing ? "Refreshing..." : label}</span>
      {lastTable && <span style={{ opacity: 0.75 }}>last: {lastTable}</span>}
    </div>
  );
}
