# Mobile No-Zoom + Text-only AI Patch

## Changes

- Updated `index.html` viewport to reduce pinch zoom and focus zoom on mobile.
- Added CSS safeguards for width, overflow and 16px mobile inputs.
- Removed visible AI voice / recording controls.
- AI now expects text input only.
- Parents can still use the phone keyboard's built-in dictation to turn speech into text.

## Supabase

No new database tables.
No new Edge Function deployment is required.

The previous `ai-transcribe-audio` function can remain deployed, but this UI no longer calls it.
