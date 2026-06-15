# Family Dock Step 7.42–7.44 — Production Hardening Pack

## What this adds

This pack adds pre-release and production support tools.

### Step 7.42 — Production Health Audit

Adds:

```text
production_check_runs
production_check_items
production-health-audit Edge Function
```

Checks:

```text
environment secrets
required tables
RLS policy presence
family member count
place count
places without coordinates
events without place
active push devices
enabled scheduled jobs
recent exports
manual device test reminders
service-role function safety reminder
```

### Step 7.43 — RLS / Permission Safety Checklist

The audit checks high-risk tables for policy presence via `pg_policies`.

It also adds release checklist reminders for:

```text
parent account test
child/homestay account test
PWA test
push test
service role review
cross-family data risk
```

### Step 7.44 — Backup / Export / Recovery Tools

Adds:

```text
family_data_export_logs
family-data-export Edge Function
ProductionHardeningPanel
```

The export can download:

```text
family data JSON
summary-only JSON
diagnostic report text
```

## Files

```text
supabase/migrations/019_production_hardening.sql
supabase/functions/production-health-audit/index.ts
supabase/functions/family-data-export/index.ts
src/lib/productionHardening.ts
src/components/panels/ProductionHardeningPanel.tsx
src/components/panels/HealthPanelPatchExample.tsx
docs/step7_42_to_7_44_production_hardening.md
```

## Step 1: Run SQL

```text
supabase/migrations/019_production_hardening.sql
```

## Step 2: Deploy functions

```bash
npx supabase functions deploy production-health-audit --project-ref uicdrdtehdszaeprdawh
npx supabase functions deploy family-data-export --project-ref uicdrdtehdszaeprdawh
```

## Step 3: Mount panel

In your Health page:

```tsx
import { ProductionHardeningPanel } from "./ProductionHardeningPanel";
```

Render:

```tsx
<ProductionHardeningPanel data={data} />
```

## Step 4: Restart frontend

```bash
Ctrl + C
npm run dev
```

## Test

1. Open Production hardening panel.
2. Run production audit.
3. Review fail / warning items.
4. Export JSON.
5. Export summary only.
6. Copy diagnostic report.
7. Check export logs.
8. Complete release checklist.

## Important

This is not a full penetration test. It is a practical operational hardening layer for your current app.
