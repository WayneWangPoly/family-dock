-- Family Dock / 家庭联络坞
-- Migration 019: Production hardening audit + export logs

begin;

create table if not exists public.production_check_runs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  created_by uuid references public.family_members(id) on delete set null,
  run_type text not null default 'manual'
    check (run_type in ('manual', 'scheduled', 'pre_release', 'support')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_check_runs_family_created
on public.production_check_runs(family_id, created_at desc);

alter table public.production_check_runs enable row level security;

drop policy if exists "production_check_runs_select_parents" on public.production_check_runs;
create policy "production_check_runs_select_parents"
on public.production_check_runs
for select
to authenticated
using (
  family_id is null
  or public.is_family_parent(family_id)
);

drop policy if exists "production_check_runs_write_parents" on public.production_check_runs;
create policy "production_check_runs_write_parents"
on public.production_check_runs
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

create table if not exists public.production_check_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  run_id uuid references public.production_check_runs(id) on delete cascade,
  category text not null,
  check_key text not null,
  severity text not null default 'info'
    check (severity in ('pass', 'info', 'warning', 'fail')),
  status text not null default 'info'
    check (status in ('pass', 'info', 'warning', 'fail')),
  title text not null,
  message text not null,
  recommendation text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_check_items_run
on public.production_check_items(run_id, category, severity);

create index if not exists idx_production_check_items_family_created
on public.production_check_items(family_id, created_at desc);

alter table public.production_check_items enable row level security;

drop policy if exists "production_check_items_select_parents" on public.production_check_items;
create policy "production_check_items_select_parents"
on public.production_check_items
for select
to authenticated
using (
  family_id is null
  or public.is_family_parent(family_id)
);

drop policy if exists "production_check_items_write_parents" on public.production_check_items;
create policy "production_check_items_write_parents"
on public.production_check_items
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

create table if not exists public.family_data_export_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid references public.family_members(id) on delete set null,
  export_type text not null default 'json'
    check (export_type in ('json', 'diagnostic', 'summary')),
  include_sensitive boolean not null default false,
  table_counts jsonb not null default '{}'::jsonb,
  file_name text,
  status text not null default 'created'
    check (status in ('created', 'downloaded', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_family_data_export_logs_family_created
on public.family_data_export_logs(family_id, created_at desc);

alter table public.family_data_export_logs enable row level security;

drop policy if exists "family_data_export_logs_select_parents" on public.family_data_export_logs;
create policy "family_data_export_logs_select_parents"
on public.family_data_export_logs
for select
to authenticated
using (public.is_family_parent(family_id));

drop policy if exists "family_data_export_logs_write_parents" on public.family_data_export_logs;
create policy "family_data_export_logs_write_parents"
on public.family_data_export_logs
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.production_check_runs;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.production_check_items;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.family_data_export_logs;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
