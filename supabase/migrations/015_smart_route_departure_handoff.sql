-- Family Dock / 家庭联络坞
-- Migration 015: Smart route departure planning + parent handoff

begin;

create table if not exists public.route_departure_plans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  plan_date date not null,
  created_by uuid references public.family_members(id) on delete set null,

  title text not null,
  overall_risk text not null default 'normal'
    check (overall_risk in ('low', 'normal', 'medium', 'high')),
  start_place_id uuid references public.places(id) on delete set null,
  start_label text,

  recommended_departure_at timestamptz,
  latest_safe_departure_at timestamptz,
  total_travel_minutes integer not null default 0,
  total_buffer_minutes integer not null default 0,

  summary text not null default '',
  warnings text[] not null default '{}',
  assumptions text[] not null default '{}',
  raw_plan jsonb not null default '{}'::jsonb,

  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_route_departure_plans_family_date
on public.route_departure_plans(family_id, plan_date desc, created_at desc);

drop trigger if exists set_route_departure_plans_updated_at on public.route_departure_plans;
create trigger set_route_departure_plans_updated_at
before update on public.route_departure_plans
for each row execute function public.set_updated_at();

alter table public.route_departure_plans enable row level security;

drop policy if exists "route_departure_plans_select_members" on public.route_departure_plans;
create policy "route_departure_plans_select_members"
on public.route_departure_plans
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "route_departure_plans_write_parents" on public.route_departure_plans;
create policy "route_departure_plans_write_parents"
on public.route_departure_plans
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create table if not exists public.route_departure_legs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  plan_id uuid not null references public.route_departure_plans(id) on delete cascade,

  leg_order integer not null default 1,
  from_place_id uuid references public.places(id) on delete set null,
  to_place_id uuid references public.places(id) on delete set null,
  from_label text,
  to_label text,

  related_event_id uuid references public.calendar_events(id) on delete set null,
  child_id uuid references public.family_members(id) on delete set null,
  event_title text,
  event_start_at timestamptz,
  event_end_at timestamptz,

  travel_minutes integer not null default 0,
  buffer_minutes integer not null default 0,
  arrival_target_at timestamptz,
  recommended_departure_at timestamptz,
  latest_safe_departure_at timestamptz,

  risk_level text not null default 'normal'
    check (risk_level in ('low', 'normal', 'medium', 'high')),
  warning text,
  created_at timestamptz not null default now()
);

create index if not exists idx_route_departure_legs_plan_order
on public.route_departure_legs(plan_id, leg_order);

alter table public.route_departure_legs enable row level security;

drop policy if exists "route_departure_legs_select_members" on public.route_departure_legs;
create policy "route_departure_legs_select_members"
on public.route_departure_legs
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "route_departure_legs_write_parents" on public.route_departure_legs;
create policy "route_departure_legs_write_parents"
on public.route_departure_legs
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create table if not exists public.parent_handoff_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  plan_id uuid references public.route_departure_plans(id) on delete cascade,
  created_by uuid references public.family_members(id) on delete set null,

  message_date date not null,
  audience text not null default 'parent'
    check (audience in ('parent', 'dad', 'mum', 'guardian', 'driver', 'custom')),
  title text not null,
  message_text text not null,
  language text not null default 'zh'
    check (language in ('zh', 'en', 'bilingual')),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_parent_handoff_messages_family_date
on public.parent_handoff_messages(family_id, message_date desc, created_at desc);

drop trigger if exists set_parent_handoff_messages_updated_at on public.parent_handoff_messages;
create trigger set_parent_handoff_messages_updated_at
before update on public.parent_handoff_messages
for each row execute function public.set_updated_at();

alter table public.parent_handoff_messages enable row level security;

drop policy if exists "parent_handoff_messages_select_members" on public.parent_handoff_messages;
create policy "parent_handoff_messages_select_members"
on public.parent_handoff_messages
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "parent_handoff_messages_write_parents" on public.parent_handoff_messages;
create policy "parent_handoff_messages_write_parents"
on public.parent_handoff_messages
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.route_departure_plans;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.route_departure_legs;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.parent_handoff_messages;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
