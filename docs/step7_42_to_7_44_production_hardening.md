# Step 7.42–7.44 Production Hardening Pack

## Goal

The app now has many modules. The risk is no longer lack of features; the risk is:

- broken environment variables
- missing migrations
- RLS mistakes
- untested child/homestay roles
- no backup before changes
- no diagnostic report when things fail
- push/cron/map/AI configured only partially

This pack adds a production support layer.

## Production audit

The Edge Function `production-health-audit` uses service role, but first authenticates the caller and checks parent/guardian membership.

It checks:
- secrets
- table existence
- RLS policy presence
- data quality
- route readiness
- notification readiness
- cron readiness
- backup history

## Export

`family-data-export` exports family-scoped data.

Default export avoids sensitive auth/push metadata.

Sensitive mode can include more metadata for debugging but should be stored carefully.

## Recommended usage

Before each major patch:

1. Export family JSON.
2. Run production audit.
3. Fix fail-level issues.
4. Invite testers only after child/homestay account tests pass.

## Next recommended step

Step 7.45–7.47:
- automated role test harness
- child/homestay portal hardening
- full release checklist wizard
