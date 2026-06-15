-- Family Dock / 家庭联络坞
-- Migration 004: homework attachments metadata
-- Storage bucket creation is attempted through storage.buckets.
-- Run after core schema.

begin;

create table if not exists public.homework_attachments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  homework_task_id uuid references public.homework_tasks(id) on delete cascade,
  homework_item_id uuid references public.homework_items(id) on delete set null,
  child_id uuid references public.family_members(id) on delete set null,
  uploaded_by uuid references public.family_members(id) on delete set null,
  media_type text not null check (media_type in ('photo', 'audio', 'video', 'file')),
  file_name text not null,
  mime_type text,
  storage_bucket text not null default 'family-homework',
  storage_path text not null,
  public_url text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_homework_attachments_family_task
on public.homework_attachments(family_id, homework_task_id);

alter table public.homework_attachments enable row level security;

drop policy if exists "homework_attachments_select_members" on public.homework_attachments;
create policy "homework_attachments_select_members"
on public.homework_attachments
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "homework_attachments_insert_members" on public.homework_attachments;
create policy "homework_attachments_insert_members"
on public.homework_attachments
for insert
to authenticated
with check (public.is_family_member(family_id));

drop policy if exists "homework_attachments_update_parents" on public.homework_attachments;
create policy "homework_attachments_update_parents"
on public.homework_attachments
for update
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

drop policy if exists "homework_attachments_delete_parents" on public.homework_attachments;
create policy "homework_attachments_delete_parents"
on public.homework_attachments
for delete
to authenticated
using (public.is_family_parent(family_id));

insert into storage.buckets (id, name, public)
values ('family-homework', 'family-homework', false)
on conflict (id) do nothing;

do $$
begin
  begin
    alter publication supabase_realtime add table public.homework_attachments;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
