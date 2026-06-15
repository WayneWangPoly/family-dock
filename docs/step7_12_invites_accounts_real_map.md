# Step 7.12 Invite Status / Account Control / Real Map

## Real map architecture

Frontend:
- Google Maps JavaScript API renders the map.
- It uses `VITE_GOOGLE_MAPS_BROWSER_KEY`.

Backend:
- Supabase Edge Function uses `GOOGLE_MAPS_API_KEY`.
- It geocodes places and updates `places.lat/lng`.

## Current limitations

- Route line is a straight polyline between stops. Road routing needs Directions API.
- Account disable removes app role binding; Auth user may still exist but cannot load family data.
- QR image uses a public QR image endpoint.
