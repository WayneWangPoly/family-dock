-- Family Dock / 家庭联络坞
-- Migration 017: Scheduled runner logs, route late-risk checks, school term engine

begin;

create table if not exists public.scheduled_runner_logs (
  id uuid primary key default gen_random_uuid(),
  runner_name text not null,
  run_mode text not null default 'manual' check (run_mode in ('manual', 'cron', 'test')),
  family_id uuid references public.families(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'skipped')),
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_scheduled_runner_logs_name_created
on public.scheduled_runner_logs(runner_name, created_at desc);

alter table public.scheduled_runner_logs enable row level security;

drop policy if exists "scheduled_runner_logs_select_parents" on public.scheduled_runner_logs;
create policy "scheduled_runner_logs_select_parents"
on public.scheduled_runner_logs
for select
to authenticated
using (
  family_id is null
  or public.is_family_parent(family_id)
);

drop policy if exists "scheduled_runner_logs_write_parents" on public.scheduled_runner_logs;
create policy "scheduled_runner_logs_write_parents"
on public.scheduled_runner_logs
for all
to authenticated
using (
  family_id is null
  or public.is_family_parent(family_id)
)
with check (
  family_id is null
  or public.is_family_parent(family_id)
);

create table if not exists public.route_late_risk_checks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  plan_id uuid not null references public.route_departure_plans(id) on delete cascade,
  leg_id uuid references public.route_departure_legs(id) on delete cascade,
  check_time timestamptz not null default now(),
  risk_level text not null default 'normal'
    check (risk_level in ('low', 'normal', 'medium', 'high', 'late')),
  minutes_to_recommended integer,
  minutes_to_latest_safe integer,
  message text not null,
  recommendation text,
  status text not null default 'active'
    check (status in ('active', 'resolved', 'ignored')),
  created_at timestamptz not null default now()
);

create index if not exists idx_route_late_risk_checks_plan_created
on public.route_late_risk_checks(plan_id, created_at desc);

create index if not exists idx_route_late_risk_checks_family_created
on public.route_late_risk_checks(family_id, created_at desc);

alter table public.route_late_risk_checks enable row level security;

drop policy if exists "route_late_risk_checks_select_members" on public.route_late_risk_checks;
create policy "route_late_risk_checks_select_members"
on public.route_late_risk_checks
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "route_late_risk_checks_write_parents" on public.route_late_risk_checks;
create policy "route_late_risk_checks_write_parents"
on public.route_late_risk_checks
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

alter table public.route_departure_plans
add column if not exists late_risk_level text not null default 'normal'
  check (late_risk_level in ('low', 'normal', 'medium', 'high', 'late')),
add column if not exists late_risk_message text,
add column if not exists last_late_risk_check_at timestamptz;

alter table public.route_departure_legs
add column if not exists late_risk_level text not null default 'normal'
  check (late_risk_level in ('low', 'normal', 'medium', 'high', 'late')),
add column if not exists late_risk_message text,
add column if not exists last_late_risk_check_at timestamptz;

create table if not exists public.family_calendar_settings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  state_code text not null default 'SA'
    check (state_code in ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')),
  school_level text not null default 'primary'
    check (school_level in ('primary', 'secondary', 'mixed', 'custom')),
  school_year integer not null default extract(year from now())::integer,
  term_week1_start date,
  week_starts_on integer not null default 1 check (week_starts_on between 0 and 6),
  public_school_baseline boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, school_year)
);

create index if not exists idx_family_calendar_settings_family_year
on public.family_calendar_settings(family_id, school_year desc);

drop trigger if exists set_family_calendar_settings_updated_at on public.family_calendar_settings;
create trigger set_family_calendar_settings_updated_at
before update on public.family_calendar_settings
for each row execute function public.set_updated_at();

alter table public.family_calendar_settings enable row level security;

drop policy if exists "family_calendar_settings_select_members" on public.family_calendar_settings;
create policy "family_calendar_settings_select_members"
on public.family_calendar_settings
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "family_calendar_settings_write_parents" on public.family_calendar_settings;
create policy "family_calendar_settings_write_parents"
on public.family_calendar_settings
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create table if not exists public.school_term_periods (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  school_year integer not null,
  term_number integer not null check (term_number between 1 and 4),
  term_start date not null,
  term_end date not null,
  label text,
  is_public_school_baseline boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, school_year, term_number)
);

create index if not exists idx_school_term_periods_family_year
on public.school_term_periods(family_id, school_year, term_number);

drop trigger if exists set_school_term_periods_updated_at on public.school_term_periods;
create trigger set_school_term_periods_updated_at
before update on public.school_term_periods
for each row execute function public.set_updated_at();

alter table public.school_term_periods enable row level security;

drop policy if exists "school_term_periods_select_members" on public.school_term_periods;
create policy "school_term_periods_select_members"
on public.school_term_periods
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "school_term_periods_write_parents" on public.school_term_periods;
create policy "school_term_periods_write_parents"
on public.school_term_periods
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create table if not exists public.calendar_day_overrides (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  override_date date not null,
  override_type text not null
    check (override_type in ('public_holiday', 'school_holiday', 'pupil_free_day', 'exam_day', 'school_day', 'custom')),
  title text not null,
  state_code text,
  applies_to_member_id uuid references public.family_members(id) on delete cascade,
  color_tag text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_calendar_day_overrides_family_date
on public.calendar_day_overrides(family_id, override_date);

create unique index if not exists idx_calendar_day_overrides_unique_member_scope
on public.calendar_day_overrides(
  family_id,
  override_date,
  override_type,
  coalesce(applies_to_member_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

drop trigger if exists set_calendar_day_overrides_updated_at on public.calendar_day_overrides;
create trigger set_calendar_day_overrides_updated_at
before update on public.calendar_day_overrides
for each row execute function public.set_updated_at();

alter table public.calendar_day_overrides enable row level security;

drop policy if exists "calendar_day_overrides_select_members" on public.calendar_day_overrides;
create policy "calendar_day_overrides_select_members"
on public.calendar_day_overrides
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "calendar_day_overrides_write_parents" on public.calendar_day_overrides;
create policy "calendar_day_overrides_write_parents"
on public.calendar_day_overrides
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.scheduled_runner_logs;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.route_late_risk_checks;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.family_calendar_settings;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.school_term_periods;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.calendar_day_overrides;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
