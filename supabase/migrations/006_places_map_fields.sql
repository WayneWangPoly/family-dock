-- Family Dock / 家庭联络坞
-- Migration 006: real map support fields

begin;

alter table public.places
add column if not exists lat double precision,
add column if not exists lng double precision,
add column if not exists formatted_address text,
add column if not exists geocoded_at timestamptz,
add column if not exists geocode_provider text;

create index if not exists idx_places_family_lat_lng
on public.places(family_id, lat, lng);

commit;
