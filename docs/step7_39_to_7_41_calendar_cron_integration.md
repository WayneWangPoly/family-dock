# Step 7.39–7.41 Calendar Integration + Week Labels + Cron Setup UI

## Goal

The previous pack created infrastructure. This pack makes it usable:

- school calendar settings visible
- Week 1/2/3 overlay visible
- cron runner setup visible
- runner logs visible
- production curl/pg_cron snippets copyable

## Why additive panel

Calendar pages are usually fragile because they already contain many views and event modals.
This patch avoids overwriting your existing CalendarPanel by providing:

```text
CalendarIntegrationPanel
```

Mount it inside your existing Calendar page.

## Week labels

The overlay uses:

```text
family_calendar_settings
school_term_periods
calendar_day_overrides
calendar_events
```

to show:
- W1/W2/W3
- Term number
- school day / holiday
- overrides
- event dots

## Cron setup

The app-side table `scheduled_job_settings` stores your intended cron configuration.

It is deliberately separate from actual Supabase scheduled jobs because:
- Supabase scheduling can be pg_cron, Scheduled Functions, external cron, GitHub Actions, etc.
- Free/paid plan capabilities can vary.
- keeping desired config in-app helps inspection and documentation.

## Next recommended step

Step 7.42–7.44:
- mount CalendarIntegrationPanel directly into your real CalendarPanel
- add actual event cells using overlay info
- add in-app production checklist for deployment/RLS/backup
