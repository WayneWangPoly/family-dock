-- Family Dock / 家庭联络坞
-- Migration 016: route map/alerts/parent assignment foundation

begin;

alter table public.route_departure_plans
add column if not exists alert_enabled boolean not null default true,
add column if not exists alert_minutes_before integer not null default 15,
add column if not exists alert_sent_at timestamptz,
add column if not exists assigned_parent_id uuid references public.family_members(id) on delete set null,
add column if not exists execution_status text not null default 'planned'
  check (execution_status in ('planned', 'ready', 'on_the_way', 'completed', 'cancelled'));

alter table public.route_departure_legs
add column if not exists assigned_parent_id uuid references public.family_members(id) on delete set null,
add column if not exists leg_status text not null default 'planned'
  check (leg_status in ('planned', 'ready', 'on_the_way', 'arrived', 'completed', 'skipped'));

create table if not exists public.route_departure_alerts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  plan_id uuid not null references public.route_departure_plans(id) on delete cascade,
  leg_id uuid references public.route_departure_legs(id) on delete cascade,
  recipient_member_id uuid references public.family_members(id) on delete set null,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,

  alert_type text not null default 'leave_soon'
    check (alert_type in ('leave_soon', 'leave_now', 'high_risk', 'manual_test')),
  title text not null,
  body text not null,
  target_url text,

  scheduled_for timestamptz,
  sent_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  dedupe_key text,

  created_at timestamptz not null default now()
);

create index if not exists idx_route_departure_alerts_family_created
on public.route_departure_alerts(family_id, created_at desc);

create unique index if not exists idx_route_departure_alerts_subscription_dedupe
on public.route_departure_alerts(subscription_id, dedupe_key)
where subscription_id is not null and dedupe_key is not null;

alter table public.route_departure_alerts enable row level security;

drop policy if exists "route_departure_alerts_select_members" on public.route_departure_alerts;
create policy "route_departure_alerts_select_members"
on public.route_departure_alerts
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "route_departure_alerts_write_parents" on public.route_departure_alerts;
create policy "route_departure_alerts_write_parents"
on public.route_departure_alerts
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.route_departure_alerts;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
