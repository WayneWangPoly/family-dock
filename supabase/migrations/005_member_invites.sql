-- Family Dock / 家庭联络坞
-- Migration 005: member invite codes for child/homestay self registration

begin;

create table if not exists public.family_member_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  invite_code text not null unique,
  intended_role text not null check (intended_role in ('child', 'homestay', 'parent', 'guardian')),
  created_by uuid references public.family_members(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_family_member_invites_family_member
on public.family_member_invites(family_id, member_id);

create index if not exists idx_family_member_invites_code
on public.family_member_invites(invite_code);

drop trigger if exists set_family_member_invites_updated_at on public.family_member_invites;
create trigger set_family_member_invites_updated_at
before update on public.family_member_invites
for each row execute function public.set_updated_at();

alter table public.family_member_invites enable row level security;

drop policy if exists "family_member_invites_select_parents" on public.family_member_invites;
create policy "family_member_invites_select_parents"
on public.family_member_invites
for select
to authenticated
using (public.is_family_parent(family_id));

drop policy if exists "family_member_invites_write_parents" on public.family_member_invites;
create policy "family_member_invites_write_parents"
on public.family_member_invites
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.family_member_invites;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
