# Step 5 — Realtime and Editing Locks

## Goal

Make the two parent accounts feel connected:

```text
Dad changes something
→ Mum sees it shortly after

Mum starts editing a payment
→ Dad sees "Mum is editing"
```

## Realtime strategy

The first stable version does not try to surgically patch every frontend state slice.

Instead:

```text
database change
→ debounce
→ reload family data
```

This is slightly less efficient but safer during product build-out.

Later, once the schema stabilizes, you can optimize table-by-table patching.

## Tables subscribed

- family_members
- places
- calendar_events
- route_stops
- homework_tasks
- homework_items
- requests
- payments
- learning_records
- meal_plans
- shopping_items
- editing_locks

## Editing lock design

Table:

```text
editing_locks
```

Unique target:

```text
family_id + target_table + target_id
```

Flow:

```text
Start editing
→ upsert editing_locks
→ other parent sees lock via realtime
→ heartbeat extends expires_at every 30s
→ Finish editing deletes lock
```

If the browser closes, lock expires automatically because `expires_at` passes.

## Current limitations

- Lock cleanup is client-triggered.
- Heartbeat is every 30 seconds.
- In production, add a scheduled cleanup job or Postgres function.
- Children/Homestay lock permissions are not yet differentiated.

## Recommended next step

Step 6: Course notebook summary AI.

That will use:
- learning_records
- homework_tasks/items
- calendar_events
- media metadata
to create week/month/year learning summaries with evidence.
