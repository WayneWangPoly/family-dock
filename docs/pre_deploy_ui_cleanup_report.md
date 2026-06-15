# Pre-deploy UI Cleanup Report

## What was checked

Checked the uploaded project structure, primary app shell, navigation, AI page, Today page, Calendar page, Route page, Admin/Health page, TypeScript types, and the current Supabase migration set.

## Main issues found

1. The app was exposing too much development language in daily screens: QA, payloads, backend/cron wording, setup notes, and long instructional blocks.
2. Mobile bottom navigation included Health, which makes the app feel like a developer console instead of a parent-facing app.
3. AI page was overloaded: assistant, progress reports, deep AI outputs, commit coverage, payload JSON, and safety notes were all visible in one long flow.
4. Calendar showed conflict and notification panels directly under the calendar, making the main schedule page too heavy.
5. Route page used technical labels like leave-now push alert and late risk in the main title area.
6. Health/QA included long manual checklists and RLS notes directly on page load.
7. TypeScript build had several real compile blockers.
8. Migration 017 still contained the old PostgreSQL expression `unique (...)` syntax error.

## UI changes made

- Grouped desktop navigation into Daily, Family, and Admin.
- Removed Health from mobile bottom navigation. Mobile bottom now focuses on Today, AI, Calendar, Route, Homework.
- Renamed Health to Admin.
- Added AdminPanel with tabs for Health, Calendar setup, and Release tools.
- Simplified topbar subtitles.
- Simplified Today copy and section headings.
- Reworked AI page into three tabs: Assistant, Progress reports, AI history.
- Removed always-visible AI commit coverage block.
- Moved prompt examples into a collapsible section.
- Renamed Payload to Advanced details.
- Calendar warnings/reminders moved into a collapsible section.
- Route labels simplified to Plan, Map, Handoff, Timing.
- Smart route Google Maps setup notes moved into a collapsible setup section.
- Health manual QA checklist and permission notes moved into collapsible sections.
- Added shared segmented-control and disclosure styles.

## Build fixes made

- Fixed BulkInviteManager member role typing.
- Added explicit parseMemberCsv return type.
- Removed unused imports in RealRouteMap and SmartRouteDeparturePanel.
- Removed unused variable in RouteMapPreviewPanel.
- Removed unused variable in reportExport.ts.
- Added route execution fields to RouteDeparturePlan / RouteDepartureLeg types.
- Fixed LoginPage type-only import for FormEvent.
- Updated appVersion to pre-deploy cleanup build label.

## Supabase migration fix included

Fixed migration 017:

```sql
create unique index if not exists idx_calendar_day_overrides_unique_member_scope
on public.calendar_day_overrides(
  family_id,
  override_date,
  override_type,
  coalesce(applies_to_member_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
```

This replaces the invalid table-level `unique (... coalesce(...))` constraint.

## Validation performed

```bash
npx tsc -b
```

TypeScript passed.

Full `npm run build` could not complete in this sandbox because the uploaded `node_modules` is missing the optional native Rolldown binding required by Vite:

```text
Cannot find module '@rolldown/binding-linux-x64-gnu'
```

This is a dependency install issue, not a TypeScript/code error from this patch. On your machine, run a clean install before build.

## Recommended pre-deploy commands

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

If you prefer keeping package-lock.json:

```bash
rm -rf node_modules
npm ci
npm run build
```

## Supabase commands

No new SQL migration was added in this cleanup patch.

But because your uploaded migration 017 still had the old syntax error, run the fixed migration file if it has not already been successfully applied:

```text
supabase/migrations/017_cron_late_risk_school_engine.sql
```

If all migrations through 019 are already applied successfully in Supabase, you do not need to rerun them.

Deploy functions only if your current Supabase project is missing any of them:

```bash
npx supabase functions deploy route-late-risk-check --project-ref uicdrdtehdszaeprdawh
npx supabase functions deploy scheduled-family-runner --project-ref uicdrdtehdszaeprdawh
npx supabase functions deploy production-health-audit --project-ref uicdrdtehdszaeprdawh
npx supabase functions deploy family-data-export --project-ref uicdrdtehdszaeprdawh
```

## Important deployment note

Do not upload these to GitHub:

```text
.env
.env.local
.env.production
node_modules
supabase/.temp
```

Your `.gitignore` should cover them before first commit.
