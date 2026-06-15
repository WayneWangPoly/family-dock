# Step 7.16 Mobile-first Conflict + Notification System

## Product direction

The app is primarily used on phones, so this step changes the interaction model:

- bottom navigation is primary
- floating quick action is always reachable
- modal becomes bottom sheet on mobile
- child portal is touch-first
- Today page surfaces conflicts and reminders immediately

## Conflict engine

The frontend conflict engine detects:

1. Same child/member overlapping events.
2. Tight transfers between different places.
3. Missing location.
4. Missing end time.

This is intentionally frontend-only for now so it can work immediately.

## Notification centre

This version uses browser Notification API and localStorage preferences.

It is useful for:
- PWA on device
- same-device reminders
- testing reminder UX

For production-grade cross-device notifications, next step should implement server-side push.

## Next recommended step

Step 7.17:

- service worker
- push subscription storage
- Supabase Edge Function notification sender
- scheduled reminders
- push logs
- notification read/unread centre
