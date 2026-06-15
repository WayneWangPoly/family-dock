-- Family Dock / 家庭联络坞
-- Migration 011: AI Copilot audit trail

begin;

create table if not exists public.ai_copilot_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id uuid not null,
  member_id uuid references public.family_members(id) on delete set null,
  active_page text,
  raw_input text not null,
  planner_response jsonb,
  status text not null default 'planned' check (status in ('planned', 'committed', 'failed', 'cancelled')),
  error_message text,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create index if not exists idx_ai_copilot_sessions_family_created
on public.ai_copilot_sessions(family_id, created_at desc);

alter table public.ai_copilot_sessions enable row level security;

drop policy if exists "ai_copilot_sessions_select_members" on public.ai_copilot_sessions;
create policy "ai_copilot_sessions_select_members"
on public.ai_copilot_sessions
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "ai_copilot_sessions_insert_members" on public.ai_copilot_sessions;
create policy "ai_copilot_sessions_insert_members"
on public.ai_copilot_sessions
for insert
to authenticated
with check (
  public.is_family_member(family_id)
  and auth_user_id = auth.uid()
);

drop policy if exists "ai_copilot_sessions_update_own_or_parent" on public.ai_copilot_sessions;
create policy "ai_copilot_sessions_update_own_or_parent"
on public.ai_copilot_sessions
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

create table if not exists public.ai_copilot_action_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  session_id uuid references public.ai_copilot_sessions(id) on delete set null,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  target_table text,
  target_id uuid,
  status text not null default 'pending' check (status in ('pending', 'committed', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_copilot_action_logs_family_created
on public.ai_copilot_action_logs(family_id, created_at desc);

alter table public.ai_copilot_action_logs enable row level security;

drop policy if exists "ai_copilot_action_logs_select_members" on public.ai_copilot_action_logs;
create policy "ai_copilot_action_logs_select_members"
on public.ai_copilot_action_logs
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "ai_copilot_action_logs_write_parents" on public.ai_copilot_action_logs;
create policy "ai_copilot_action_logs_write_parents"
on public.ai_copilot_action_logs
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.ai_copilot_sessions;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.ai_copilot_action_logs;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
