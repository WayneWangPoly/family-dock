# Mobile Overflow Cleanup v4

This patch fixes phone-width overflow found in Family/Homework screens and adds global overflow guards for other pages.

## Changes

- Family section picker changed from large two-column cards to compact horizontal pills on mobile.
- Homework summary cards are now compact 3-up cards instead of huge stacked stats.
- `Add homework` no longer runs off the right edge.
- Homework item badges are shortened: `video_upload` → `Video`, `audio_upload` → `Audio`.
- Removed visible migration text from homework evidence upload.
- Attachment rows now wrap safely and long filenames cannot force horizontal scrolling.
- Added global mobile overflow guards for cards, rows, buttons, badges, section titles and grids.
- Increased mobile bottom padding so Safari/Chrome toolbars and the bottom nav do not cover content as easily.

## Supabase

No SQL or Edge Function deployment required.
