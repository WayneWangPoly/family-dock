-- Family Dock / 家庭联络坞
-- Migration 008: notification inbox, device management, and dedupe bugfix

begin;

-- Step 7.17 bugfix:
-- Global unique dedupe_key can cause multi-device delivery problems.
-- Correct behavior: the same reminder may be sent once per subscription/device.
drop index if exists public.idx_notification_logs_dedupe_key_unique;

create unique index if not exists idx_notification_logs_subscription_dedupe_unique
on public.notification_logs(subscription_id, dedupe_key)
where dedupe_key is not null and subscription_id is not null;

alter table public.notification_logs
add column if not exists read_at timestamptz,
add column if not exists archived_at timestamptz;

create index if not exists idx_notification_logs_member_read
on public.notification_logs(family_id, member_id, read_at, created_at desc);

create index if not exists idx_notification_logs_status_created
on public.notification_logs(family_id, status, created_at desc);

alter table public.push_subscriptions
add column if not exists platform text,
add column if not exists browser text,
add column if not exists disabled_at timestamptz,
add column if not exists disabled_by uuid references public.family_members(id) on delete set null;

create index if not exists idx_push_subscriptions_member_active
on public.push_subscriptions(family_id, member_id, is_active);

drop policy if exists "notification_logs_update_own_or_parent" on public.notification_logs;
create policy "notification_logs_update_own_or_parent"
on public.notification_logs
for update
to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_family_parent(family_id)
)
with check (
  auth_user_id = auth.uid()
  or public.is_family_parent(family_id)
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.notification_logs;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.push_subscriptions;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
