-- Family Dock / 家庭联络坞
-- Migration 012: AI deep outputs for notebook, meal plan, route review

begin;

create table if not exists public.learning_notes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.family_members(id) on delete set null,
  created_by uuid references public.family_members(id) on delete set null,
  source_session_id uuid references public.ai_copilot_sessions(id) on delete set null,
  subject text,
  title text not null,
  content text not null,
  tags text[] not null default '{}',
  note_date date not null default current_date,
  note_type text not null default 'general' check (note_type in ('lesson', 'parent_comment', 'child_reflection', 'teacher_feedback', 'ai_summary', 'general')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learning_notes_family_child_date
on public.learning_notes(family_id, child_id, note_date desc);

create index if not exists idx_learning_notes_family_created
on public.learning_notes(family_id, created_at desc);

drop trigger if exists set_learning_notes_updated_at on public.learning_notes;
create trigger set_learning_notes_updated_at
before update on public.learning_notes
for each row execute function public.set_updated_at();

alter table public.learning_notes enable row level security;

drop policy if exists "learning_notes_select_members" on public.learning_notes;
create policy "learning_notes_select_members"
on public.learning_notes
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "learning_notes_write_parents" on public.learning_notes;
create policy "learning_notes_write_parents"
on public.learning_notes
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid references public.family_members(id) on delete set null,
  source_session_id uuid references public.ai_copilot_sessions(id) on delete set null,
  week_start date,
  meal_type text not null default 'both' check (meal_type in ('dinner', 'lunchbox', 'both')),
  title text not null,
  preferences text[] not null default '{}',
  notes text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meal_plans_family_week
on public.meal_plans(family_id, week_start desc);

drop trigger if exists set_meal_plans_updated_at on public.meal_plans;
create trigger set_meal_plans_updated_at
before update on public.meal_plans
for each row execute function public.set_updated_at();

alter table public.meal_plans enable row level security;

drop policy if exists "meal_plans_select_members" on public.meal_plans;
create policy "meal_plans_select_members"
on public.meal_plans
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "meal_plans_write_parents" on public.meal_plans;
create policy "meal_plans_write_parents"
on public.meal_plans
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create table if not exists public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  day_label text,
  meal_slot text not null default 'dinner' check (meal_slot in ('breakfast', 'lunchbox', 'lunch', 'dinner', 'snack', 'other')),
  title text not null,
  description text,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_meal_plan_items_plan_order
on public.meal_plan_items(meal_plan_id, sort_order);

alter table public.meal_plan_items enable row level security;

drop policy if exists "meal_plan_items_select_members" on public.meal_plan_items;
create policy "meal_plan_items_select_members"
on public.meal_plan_items
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "meal_plan_items_write_parents" on public.meal_plan_items;
create policy "meal_plan_items_write_parents"
on public.meal_plan_items
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  meal_plan_id uuid references public.meal_plans(id) on delete cascade,
  name text not null,
  quantity text,
  category text,
  is_checked boolean not null default false,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  checked_at timestamptz
);

create index if not exists idx_shopping_list_items_family_plan
on public.shopping_list_items(family_id, meal_plan_id, sort_order);

alter table public.shopping_list_items enable row level security;

drop policy if exists "shopping_list_items_select_members" on public.shopping_list_items;
create policy "shopping_list_items_select_members"
on public.shopping_list_items
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "shopping_list_items_write_parents" on public.shopping_list_items;
create policy "shopping_list_items_write_parents"
on public.shopping_list_items
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create table if not exists public.ai_route_reviews (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid references public.family_members(id) on delete set null,
  source_session_id uuid references public.ai_copilot_sessions(id) on delete set null,
  review_date date,
  focus text not null default 'general' check (focus in ('conflict', 'travel_time', 'order', 'next_stop', 'general')),
  question text not null,
  analysis text not null,
  risk_level text not null default 'normal' check (risk_level in ('low', 'normal', 'medium', 'high')),
  recommendations text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_route_reviews_family_date
on public.ai_route_reviews(family_id, review_date desc, created_at desc);

alter table public.ai_route_reviews enable row level security;

drop policy if exists "ai_route_reviews_select_members" on public.ai_route_reviews;
create policy "ai_route_reviews_select_members"
on public.ai_route_reviews
for select
to authenticated
using (public.is_family_member(family_id));

drop policy if exists "ai_route_reviews_write_parents" on public.ai_route_reviews;
create policy "ai_route_reviews_write_parents"
on public.ai_route_reviews
for all
to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.learning_notes;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.meal_plans;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.meal_plan_items;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.shopping_list_items;
  exception when duplicate_object then null; when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.ai_route_reviews;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

commit;
