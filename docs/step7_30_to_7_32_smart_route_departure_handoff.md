# Step 7.30–7.32 Smart Route + Departure Reminder + Parent Handoff

## Why this matters

A normal calendar tells the parent where to be.
A smart route planner tells the parent when to leave.

This is critical for families with:
- multiple children
- multiple locations
- after-school activities
- library / fencing / tutoring sequence
- shared parent responsibilities

## Data model

### route_departure_plans

Stores the overall daily plan:
- risk
- recommended departure
- latest safe departure
- summary
- warnings
- assumptions

### route_departure_legs

Stores each route leg:
- from/to place
- related event
- child
- travel minutes
- buffer
- risk

### parent_handoff_messages

Stores copyable messages for the other parent/guardian.

## Travel time

The Edge Function tries:

1. Google Distance Matrix if `GOOGLE_MAPS_API_KEY` exists.
2. Haversine/coordinate fallback if coordinates exist.
3. 20-minute fallback with warning if no reliable data.

## Future upgrade

Step 7.33 can add:
- push departure reminder
- “leave now” notification
- late-risk recalculation
- parent assignment split
- side-by-side old map + smart route
