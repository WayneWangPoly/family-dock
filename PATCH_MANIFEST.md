# Family Dock UI Cleanup Pre-deploy Patch

Overlay these files on top of your current project.

## Validation

`npx tsc -b` passed after this patch.

`npm run build` could not complete in the sandbox because the uploaded node_modules is missing Vite/Rolldown optional native dependency. Run a clean install locally before deployment.

## Changed files

- `src/components/app/AppShell.tsx`
- `src/components/app/FamilyDockApp.tsx`
- `src/components/forms/BulkInviteManager.tsx`
- `src/components/maps/RealRouteMap.tsx`
- `src/components/panels/AdminPanel.tsx`
- `src/components/panels/AICopilotPanel.tsx`
- `src/components/panels/CalendarPanel.tsx`
- `src/components/panels/QualityAssurancePanel.tsx`
- `src/components/panels/RouteMapPreviewPanel.tsx`
- `src/components/panels/RoutePanel.tsx`
- `src/components/panels/SmartRouteDeparturePanel.tsx`
- `src/components/panels/TodayPanel.tsx`
- `src/lib/appVersion.ts`
- `src/lib/onboarding.ts`
- `src/lib/reportExport.ts`
- `src/lib/smartRoute.ts`
- `src/pages/LoginPage.tsx`
- `src/styles/fdTheme.css`
- `supabase/migrations/017_cron_late_risk_school_engine.sql`
- `docs/pre_deploy_ui_cleanup_report.md`
