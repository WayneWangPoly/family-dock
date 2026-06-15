-- Family Dock / 家庭联络坞
-- Migration 018: Calendar display preferences + scheduled job settings UI support

begin;

alter table public.family_calendar_settings
add column if not exists show_week_labels boolean not null default true,
add column if not exists show_school_day_badges boolean not null default true,
add column if not exists show_overrides boolean not null default true,
add column if not exists calendar_accent_mode text not null default 'soft'
  check (calendar_accent_mode in ('soft', 'strong', 'minimal'));

create table if not exists public.scheduled_job_settings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  job_name text not null,
  is_enabled boolean not null default false,
  cron_expression text,
  cadence_label text,
  function_name text not null,
  runner_payload jsonb not null default '{}'::jsonb,
  run_window_label text,
  notes text,
  last_manual_run_at timestamptz,
  last_manual_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, job_name)
);

create index if not exists idx_scheduled_job_settings_family
on public.scheduled_job_settings(family_id, job_name);

drop trigger if exists set_scheduled_job_settings_updated_at on public.scheduled_job_settings;
create trigger set_scheduled_job_settings_updated_at
before update on public.scheduled_job_settings
for each row execute function public.set_updated_at();

alter table public.scheduled_job_settings enable row level security;

drop policy if exists "scheduled_job_settings_select_parents" on public.scheduled_job_settings;
create policy "scheduled_job_settings_select_parents"
on public.scheduled_job_settings
for select
to authenticated
using (
  family_id is null
  or public.is_family_parent(family_id)
);

drop policy if exists "scheduled_job_settings_write_parents" on public.scheduled_job_settings;
create policy "scheduled_job_settings_write_parents"
on public.scheduled_job_settings
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

do $$
begin
  begin
    alter publication supabase_realtime add table public.scheduled_job_settings;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
