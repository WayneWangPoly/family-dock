import type { FamilyData, RouteStop } from "../../lib/familyDataTypes";
import type { RouteLegSummary } from "../../lib/routePlanner";
import { computeRouteConflicts } from "../../lib/routePlanner";

type Props = {
  data: FamilyData;
  stops: RouteStop[];
  legs: RouteLegSummary[];
};

export function RouteConflictWarnings({ data, stops, legs }: Props) {
  const conflicts = computeRouteConflicts({
    data,
    stops,
    legs,
    bufferMinutes: 10,
  });

  if (conflicts.length === 0) {
    return (
      <div className="fd-alert success">
        No tight travel-time conflicts detected from the current route legs.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {conflicts.map((conflict) => (
        <div key={`${conflict.fromStopId}-${conflict.toStopId}`} className="fd-alert warning">
          {conflict.message}
        </div>
      ))}
    </div>
  );
}
