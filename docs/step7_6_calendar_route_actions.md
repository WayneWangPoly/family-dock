# Step 7.6 Calendar / Route / Actions

This step avoids adding new backend. It uses existing RLS-enabled tables:

- calendar_events
- route_stops
- payments
- homework_items
- homework_tasks
- requests

## Why no embedded API map yet

The route preview uses Google Maps iframe URL without an API key. The app already has one-click external navigation. A full embedded route map with ordered pins should be done later with a proper Google Maps API key or Mapbox token.

## Next suggested package

Step 7.7 should add:

- direct create/edit forms for events, payments, homework, and places
- child/homestay simplified request UI
- storage upload UI for homework media
