-- Family Dock / 家庭联络坞
-- Migration 013: Professional AI child progress summaries

begin;

create table if not exists public.learning_progress_summaries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.family_members(id) on delete set null,
  created_by uuid references public.family_members(id) on delete set null,

  period_type text not null default 'month'
    check (period_type in ('week', 'month', 'term', 'custom')),
  period_start date not null,
  period_end date not null,
  subject text,

  title text not null,
  executive_summary text not null,
  narrative_text text not null,

  strengths text[] not null default '{}',
  concerns text[] not null default '{}',
  observed_patterns text[] not null default '{}',
  recommendations text[] not null default '{}',
  parent_actions text[] not null default '{}',
  child_actions text[] not null default '{}',
  teacher_questions text[] not null default '{}',
  next_goals text[] not null default '{}',
  missing_evidence text[] not null default '{}',

  summary_json jsonb not null default '{}'::jsonb,

  source_note_ids uuid[] not null default '{}',
  source_homework_ids uuid[] not null default '{}',
  source_event_ids uuid[] not null default '{}',

  evidence_count integer not null default 0,
  confidence numeric(4,3) not null default 0.5,
  status text not null default 'draft' check (status in ('draft', 'final', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learning_progress_summaries_family_child_period
on public.learning_progress_summaries(family_id, child_id, period_start desc, period_end desc);

create index if not exists idx_learning_progress_summaries_family_created
on public.learning_progress_summaries(family_id, created_at desc);

drop trigger if exists set_learning_progress_summaries_updated_at on public.learning_progress_summaries;
create trigger set_learning_progress_summaries_updated_at
before update on public.learning_progress_summaries
for each row execute function public.set_updated_at();

alter table public.learning_progress_summaries enable row level security;

drop policy if exists "learning_progress_summaries_select_members" on public.learning_progress_summaries;
create policy "learning_progress_summaries_select_members"
on public.learning_progress_summaries
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "learning_progress_summaries_write_parents" on public.learning_progress_summaries;
create policy "learning_progress_summaries_write_parents"
on public.learning_progress_summaries
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.learning_progress_summaries;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
