-- Family Dock / 家庭联络坞
-- Migration 009: DB-backed notification preferences and per-member targeting

begin;

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  events_enabled boolean not null default true,
  homework_enabled boolean not null default true,
  payments_enabled boolean not null default true,
  event_reminder_minutes integer not null default 60 check (event_reminder_minutes between 0 and 10080),
  homework_reminder_hours integer not null default 24 check (homework_reminder_hours between 0 and 720),
  payment_reminder_days integer not null default 3 check (payment_reminder_days between 0 and 90),
  quiet_hours_enabled boolean not null default false,
  quiet_start text not null default '21:00',
  quiet_end text not null default '07:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(family_id, member_id)
);

create index if not exists idx_notification_preferences_family_member
on public.notification_preferences(family_id, member_id);

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_family" on public.notification_preferences;
create policy "notification_preferences_select_family"
on public.notification_preferences
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "notification_preferences_insert_own_or_parent" on public.notification_preferences;
create policy "notification_preferences_insert_own_or_parent"
on public.notification_preferences
for insert
to authenticated
with check (
  public.is_family_parent(family_id)
  or exists (
    select 1
    from public.family_user_roles fur
    where fur.family_id = notification_preferences.family_id
      and fur.member_id = notification_preferences.member_id
      and fur.auth_user_id = auth.uid()
  )
);

drop policy if exists "notification_preferences_update_own_or_parent" on public.notification_preferences;
create policy "notification_preferences_update_own_or_parent"
on public.notification_preferences
for update
to authenticated
using (
  public.is_family_parent(family_id)
  or exists (
    select 1
    from public.family_user_roles fur
    where fur.family_id = notification_preferences.family_id
      and fur.member_id = notification_preferences.member_id
      and fur.auth_user_id = auth.uid()
  )
)
with check (
  public.is_family_parent(family_id)
  or exists (
    select 1
    from public.family_user_roles fur
    where fur.family_id = notification_preferences.family_id
      and fur.member_id = notification_preferences.member_id
      and fur.auth_user_id = auth.uid()
  )
);

alter table public.notification_logs
add column if not exists recipient_member_id uuid references public.family_members(id) on delete set null;

create index if not exists idx_notification_logs_recipient_created
on public.notification_logs(family_id, recipient_member_id, created_at desc);

-- Backfill default preferences for existing members.
insert into public.notification_preferences (family_id, member_id)
select fm.family_id, fm.id
from public.family_members fm
where not exists (
  select 1
  from public.notification_preferences np
  where np.family_id = fm.family_id
    and np.member_id = fm.id
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.notification_preferences;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
