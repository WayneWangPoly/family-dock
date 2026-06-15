# Step 7.13 Road Directions

## Implementation

This step uses Google Maps JavaScript `DirectionsService` and `DirectionsRenderer` to request a driving route with intermediate waypoints.

The saved family order is preserved by default:

```text
origin = current location if available, else first stop
destination = last stop
waypoints = intermediate stops
optimizeWaypoints = false by default
```

## Optimize preview

The UI includes `Optimize preview`, which sets `optimizeWaypoints = true`.

It only previews the order. It does not update `route_stops.stop_order`.

## Next recommended step

Step 7.14:

- Apply optimized order to Supabase
- drag/drop route stop order
- add route stop manually from calendar events
- auto-create today's route from today's schedule
- route conflict warning when travel time is too tight
