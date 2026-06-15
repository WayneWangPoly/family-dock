-- Family Dock / 家庭联络坞
-- Migration 007: True PWA push notification foundation

begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id uuid not null,
  member_id uuid references public.family_members(id) on delete set null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  device_label text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_family_active
on public.push_subscriptions(family_id, is_active);

create index if not exists idx_push_subscriptions_auth_user
on public.push_subscriptions(auth_user_id);

drop trigger if exists set_push_subscriptions_updated_at on public.push_subscriptions;
create trigger set_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_members" on public.push_subscriptions;
create policy "push_subscriptions_select_members"
on public.push_subscriptions
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "push_subscriptions_insert_members" on public.push_subscriptions;
create policy "push_subscriptions_insert_members"
on public.push_subscriptions
for insert
to authenticated
with check (
  public.is_family_member(family_id)
  and auth_user_id = auth.uid()
);

drop policy if exists "push_subscriptions_update_own_or_parent" on public.push_subscriptions;
create policy "push_subscriptions_update_own_or_parent"
on public.push_subscriptions
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

drop policy if exists "push_subscriptions_delete_own_or_parent" on public.push_subscriptions;
create policy "push_subscriptions_delete_own_or_parent"
on public.push_subscriptions
for delete
to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_family_parent(family_id)
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id uuid,
  member_id uuid references public.family_members(id) on delete set null,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  notification_type text not null,
  title text not null,
  body text,
  target_url text,
  source_table text,
  source_id uuid,
  dedupe_key text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_logs_family_created
on public.notification_logs(family_id, created_at desc);

create unique index if not exists idx_notification_logs_dedupe_key_unique
on public.notification_logs(dedupe_key)
where dedupe_key is not null;

alter table public.notification_logs enable row level security;

drop policy if exists "notification_logs_select_members" on public.notification_logs;
create policy "notification_logs_select_members"
on public.notification_logs
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "notification_logs_write_parents" on public.notification_logs;
create policy "notification_logs_write_parents"
on public.notification_logs
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.push_subscriptions;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.notification_logs;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
