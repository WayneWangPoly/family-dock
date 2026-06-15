# Mobile Consumer Refactor v3

## Goal

Make Family Dock feel like a family phone app instead of an ERP/admin system.

## Changes

- Bottom navigation is now exactly five tabs: Today, Calendar, AI, Route, Family.
- Homework, Notes, Meals, Payments, Requests and People are bundled under Family.
- Admin remains available inside Family → Settings and desktop menu, but is no longer part of daily mobile navigation.
- Header is simplified: no realtime badge, no technical setup/status text.
- Floating Global AI button removed from daily UI.
- Visible Undo UI removed. Undo backend files may remain but are no longer called from the normal app.
- Today page is converted from heavy dashboard blocks to a clean feed.
- Calendar mobile pattern is Weekly Strip + Agenda. Month grid remains only for desktop.
- Route page hides technical options under Route settings and uses consumer wording.
- Full-width colored alert blocks are visually reduced: white cards with subtle left accents.
- Touch targets are pushed toward 44px minimum on mobile.

## Supabase

No new database tables.
No new Edge Functions.
No Supabase deployment required.

## Build validation

`npx tsc -b` passed in the sandbox.

Full `npm run build` could not complete in the sandbox because the uploaded `node_modules` is missing the Rolldown optional native binding. Run locally:

```bash
npm install
npm run build
```
