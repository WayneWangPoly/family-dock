# Step 7.18 Scheduled Reminder Runner + Notification Inbox + Device Management

## Fix included

Step 7.17 global dedupe key could skip delivery to multiple devices.

Correct dedupe:

```text
one source reminder per device subscription
```

Implemented by unique index:

```text
(subscription_id, dedupe_key)
```

And function check:

```text
alreadySentForSubscription(subscription_id, dedupe_key)
```

## Notification inbox

The inbox reads `notification_logs`.

Supports:
- sent / failed / skipped
- unread badge
- mark read
- archive
- error message display

## Device management

The device manager reads `push_subscriptions`.

Supports:
- active / disabled
- last seen
- member association
- enable / disable device

## Scheduled reminder runner

`run-scheduled-reminders` is intended for cron.

It:
- validates `x-cron-secret`
- scans families
- invokes `send-family-reminders`
- aggregates results

## Production scale notes

For many families, improve with:
- pagination cursor
- family batching
- notification queue table
- retry/backoff strategy
- DB-backed notification preferences
- per-member targeting
