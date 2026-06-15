# Step 7.33–7.35 Route Execution Pack

## Goal

The previous package generated smart route plans.

This package turns those plans into execution tools:

- map preview
- external navigation
- assigned parent
- per-leg assignment
- leave-now push alerts
- alert logs
- copyable split handoff

## Route page structure

```text
Planner
Map
Execution + alerts
```

## Push behavior

`route-departure-alerts` sends to:

1. assigned parent if plan has `assigned_parent_id`
2. otherwise all parent/guardian subscriptions

It logs every attempt to `route_departure_alerts`.

## Future step

Step 7.36–7.38 should add:

- scheduled cron setup instructions/UI
- live recalculation
- late-risk detection after plan start
- school calendar / term week engine
