-- Family Dock / 家庭联络坞
-- Migration 014: Progress report export/share versions

begin;

create table if not exists public.progress_report_shares (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  summary_id uuid not null references public.learning_progress_summaries(id) on delete cascade,
  child_id uuid references public.family_members(id) on delete set null,
  created_by uuid references public.family_members(id) on delete set null,

  audience text not null default 'teacher'
    check (audience in ('parent', 'teacher', 'coach', 'meeting', 'email', 'custom')),
  language text not null default 'en'
    check (language in ('zh', 'en', 'bilingual')),

  title text not null,
  content_markdown text not null,
  email_subject text,
  email_body text,

  key_points text[] not null default '{}',
  questions text[] not null default '{}',
  action_items text[] not null default '{}',
  privacy_notes text[] not null default '{}',

  status text not null default 'draft' check (status in ('draft', 'final', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_progress_report_shares_family_summary
on public.progress_report_shares(family_id, summary_id, created_at desc);

create index if not exists idx_progress_report_shares_family_child
on public.progress_report_shares(family_id, child_id, created_at desc);

drop trigger if exists set_progress_report_shares_updated_at on public.progress_report_shares;
create trigger set_progress_report_shares_updated_at
before update on public.progress_report_shares
for each row execute function public.set_updated_at();

alter table public.progress_report_shares enable row level security;

drop policy if exists "progress_report_shares_select_members" on public.progress_report_shares;
create policy "progress_report_shares_select_members"
on public.progress_report_shares
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "progress_report_shares_write_parents" on public.progress_report_shares;
create policy "progress_report_shares_write_parents"
on public.progress_report_shares
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.progress_report_shares;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
