-- Family Dock / 家庭联络坞
-- Migration 003: learning_summaries table
-- Run after 001_family_dock_core_schema.sql

begin;

create table if not exists public.learning_summaries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.family_members(id) on delete set null,
  course_name text,
  range_type text not null check (range_type in ('week', 'month', 'term', 'year', 'custom')),
  start_date date not null,
  end_date date not null,
  summary_title text,
  evidence_count int not null default 0,
  overall_summary text,
  progress jsonb not null default '[]'::jsonb,
  recurring_issues jsonb not null default '[]'::jsonb,
  current_bottleneck text,
  next_steps jsonb not null default '[]'::jsonb,
  parent_focus_points jsonb not null default '[]'::jsonb,
  questions_for_teacher jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  ai_model text,
  created_by uuid references public.family_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learning_summaries_family_range
on public.learning_summaries(family_id, start_date, end_date);

create index if not exists idx_learning_summaries_child_course
on public.learning_summaries(child_id, course_name);

drop trigger if exists set_learning_summaries_updated_at on public.learning_summaries;
create trigger set_learning_summaries_updated_at
before update on public.learning_summaries
for each row execute function public.set_updated_at();

alter table public.learning_summaries enable row level security;

drop policy if exists "learning_summaries_select_members" on public.learning_summaries;
create policy "learning_summaries_select_members"
on public.learning_summaries
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "learning_summaries_write_parents" on public.learning_summaries;
create policy "learning_summaries_write_parents"
on public.learning_summaries
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.learning_summaries;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
