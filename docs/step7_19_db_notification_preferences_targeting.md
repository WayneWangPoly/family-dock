# Step 7.19 DB-backed Notification Preferences + Per-member Targeting

## Goal

Move from family-wide push broadcasting to targeted reminders.

A family app should not send every child every other child's homework, payment, or schedule reminder.

## New model

### notification_preferences

One row per family member:

```text
family_id
member_id
events_enabled
homework_enabled
payments_enabled
event_reminder_minutes
homework_reminder_hours
payment_reminder_days
quiet_hours_enabled
quiet_start
quiet_end
```

## Targeting logic

For each source reminder, recipients are resolved by source type.

### Event

```text
parents/guardians + calendar_events.child_id
```

### Homework

```text
parents/guardians + homework_tasks.child_id
```

### Payment

```text
parents/guardians + payments.child_id
```

## Preference logic

Before sending to a subscription:

```text
subscription.member_id must be in recipient list
preference type must be enabled
due time must be within that member's reminder window
subscription_id + dedupe_key must not already be sent
```

## Current limitation

Quiet hours are stored but not yet enforced. They are included now to avoid another schema migration later.

## Next recommended step

Step 7.20:

- enforce quiet hours
- per-member notification inbox filter
- notification read/unread badge in mobile topbar
- notification targeting audit view
- PWA install prompt / iPhone install guidance
