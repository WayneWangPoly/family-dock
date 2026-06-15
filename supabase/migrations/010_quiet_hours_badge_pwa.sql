-- Family Dock / 家庭联络坞
-- Migration 010: quiet-hours enforcement support, notification badge fields, PWA/device diagnostics

begin;

-- Step 7.20:
-- Quiet hours were stored in Step 7.19. This migration adds clearer log fields
-- so skipped reminders are visible in the inbox instead of silently disappearing.
alter table public.notification_logs
add column if not exists delivery_channel text not null default 'push',
add column if not exists suppressed_by_quiet_hours boolean not null default false,
add column if not exists suppression_reason text;

create index if not exists idx_notification_logs_unread_member
on public.notification_logs(family_id, member_id, read_at, archived_at, created_at desc);

create index if not exists idx_notification_logs_recipient_unread
on public.notification_logs(family_id, recipient_member_id, read_at, archived_at, created_at desc);

-- Useful for system/device diagnostics.
alter table public.push_subscriptions
add column if not exists app_version text,
add column if not exists sw_version text;

commit;
