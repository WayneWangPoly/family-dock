# Step 7.36–7.38 Cron + Late-risk + School Term Engine

## Goal

Previous steps created route plans, map preview, parent assignment and leave-now alerts.

This pack connects three missing production pieces:

1. scheduled runner
2. late-risk recalculation
3. configurable school calendar engine

## Late-risk logic

For each plan and leg:

```text
minutes_to_recommended = recommended_departure_at - now
minutes_to_latest_safe = latest_safe_departure_at - now
```

Risk:

```text
late: past latest safe departure
high: past recommended departure
medium: within 5 minutes
normal: within 15 minutes
low: otherwise
```

## School calendar engine

It is configurable, not hardcoded.

Reason:
- Australian public holiday dates can change by year/state
- school term dates differ by state
- private schools differ from public schools
- families may need custom pupil-free days or exam days

Data tables:

```text
family_calendar_settings
school_term_periods
calendar_day_overrides
```

## Scheduled runner

`scheduled-family-runner` is a wrapper that can call:

```text
route-late-risk-check
route-departure-alerts
run-scheduled-reminders
```

It writes `scheduled_runner_logs`.

## Next recommended step

Step 7.39–7.41:
- mount SchoolCalendarEnginePanel properly into Calendar settings
- show Week 1/2/3 labels inside month/week calendar cells
- add scheduled cron setup guide with exact Supabase command/options
