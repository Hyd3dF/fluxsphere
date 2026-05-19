-- Run this in the Supabase SQL editor.
-- This schema keeps profile photos out of the database. Authentication stays in
-- Supabase Auth; the public app tables never store passwords or OAuth secrets.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- 1. Public profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  first_name text not null check (char_length(first_name) between 1 and 60),
  middle_name text check (middle_name is null or char_length(middle_name) <= 60),
  last_name text check (last_name is null or char_length(last_name) <= 60),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 1000),
  bio text check (bio is null or char_length(bio) <= 500),
  profile_description text check (profile_description is null or char_length(profile_description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 1000);
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists profile_description text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

update public.profiles
set display_name = coalesce(nullif(display_name, ''), nullif(first_name, ''), 'Photographer')
where display_name is null or display_name = '';

alter table public.profiles alter column display_name set not null;

create index if not exists profiles_display_name_idx on public.profiles using gin (display_name gin_trgm_ops);

-- 2. Private account details
create table if not exists public.user_private (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  email_confirmed_at timestamptz,
  auth_provider text not null default 'google',
  provider_user_id text check (provider_user_id is null or char_length(provider_user_id) <= 255),
  password_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_private add column if not exists auth_provider text not null default 'google';
alter table public.user_private add column if not exists provider_user_id text;

do $$
declare
  long_provider_id_count int;
begin
  select count(*) into long_provider_id_count
  from public.user_private
  where provider_user_id is not null
    and char_length(provider_user_id) > 255;

  if long_provider_id_count = 0 and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_private'::regclass
      and conname = 'user_private_provider_user_id_check'
  ) then
    alter table public.user_private
      add constraint user_private_provider_user_id_check
      check (provider_user_id is null or char_length(provider_user_id) <= 255);
  elsif long_provider_id_count > 0 then
    raise notice 'Skipping provider_user_id check: % oversized values present', long_provider_id_count;
  end if;
end $$;

-- 3. Profile links
create table if not exists public.profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  url text not null check (char_length(url) <= 300 and url ~* '^https?://'),
  position int not null default 0 check (position >= 0 and position <= 20),
  created_at timestamptz not null default now(),
  unique (user_id, position)
);

create index if not exists profile_links_user_idx on public.profile_links(user_id, position);

-- 4. Categories and hashtags
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,48}$'),
  created_by uuid references public.profiles(id) on delete set null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists categories_name_idx on public.categories using gin (name gin_trgm_ops);

insert into public.categories (name, slug, is_system)
values
  ('Nature', 'nature', true),
  ('People', 'people', true),
  ('Food', 'food', true),
  ('Travel', 'travel', true),
  ('Animals', 'animals', true),
  ('Art', 'art', true),
  ('Sports', 'sports', true),
  ('Tech', 'tech', true),
  ('Architecture', 'architecture', true),
  ('Other', 'other', true)
on conflict (slug) do update
set name = excluded.name,
    is_system = true;

alter table public.categories alter column created_by drop not null;

create table if not exists public.hashtags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,48}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists hashtags_name_idx on public.hashtags using gin (name gin_trgm_ops);

alter table public.hashtags alter column created_by drop not null;

-- 5. Photo posts. The file itself lives in Storage; this table stores metadata.
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  caption text check (caption is null or char_length(caption) <= 220),
  description text check (description is null or char_length(description) <= 2000),
  category_id uuid references public.categories(id) on delete set null,
  category text check (category is null or char_length(category) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.photos add column if not exists caption text;
alter table public.photos add column if not exists category_id uuid references public.categories(id) on delete set null;
alter table public.photos add column if not exists updated_at timestamptz not null default now();

create index if not exists photos_user_idx on public.photos(user_id);
create index if not exists photos_category_idx on public.photos(category);
create index if not exists photos_category_id_idx on public.photos(category_id);
create index if not exists photos_created_idx on public.photos(created_at desc);
create index if not exists photos_search_idx on public.photos using gin (
  to_tsvector('english', coalesce(caption, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, ''))
);

create or replace function public.validate_photo_storage_path()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if split_part(new.storage_path, '/', 1) <> new.user_id::text then
    raise exception 'Photo storage path must start with the owning user id';
  end if;

  return new;
end; $$;

drop trigger if exists photos_validate_storage_path on public.photos;
create trigger photos_validate_storage_path
  before insert or update of user_id, storage_path on public.photos
  for each row execute function public.validate_photo_storage_path();

update public.photos p
set category_id = c.id
from public.categories c
where p.category_id is null
  and p.category is not null
  and lower(p.category) = lower(c.name);

create table if not exists public.photo_hashtags (
  photo_id uuid not null references public.photos(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, hashtag_id)
);

create index if not exists photo_hashtags_hashtag_idx on public.photo_hashtags(hashtag_id);

-- 6. Likes
create table if not exists public.photo_likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, photo_id)
);

create index if not exists photo_likes_photo_idx on public.photo_likes(photo_id);

-- Compatibility for the current app name. New code uses photo_likes.
create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, photo_id)
);

create index if not exists likes_photo_idx on public.likes(photo_id);

insert into public.photo_likes (user_id, photo_id, created_at)
select user_id, photo_id, created_at from public.likes
on conflict (user_id, photo_id) do nothing;

-- 7. Threaded comments and comment likes
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_comment_id is null or parent_comment_id <> id)
);

alter table public.comments add column if not exists parent_comment_id uuid references public.comments(id) on delete cascade;
alter table public.comments add column if not exists updated_at timestamptz not null default now();

create index if not exists comments_photo_idx on public.comments(photo_id, created_at);
create index if not exists comments_parent_idx on public.comments(parent_comment_id, created_at);

create or replace function public.validate_comment_parent()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  parent_photo_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select c.photo_id into parent_photo_id
  from public.comments c
  where c.id = new.parent_comment_id;

  if parent_photo_id is null then
    raise exception 'Parent comment does not exist';
  end if;

  if parent_photo_id <> new.photo_id then
    raise exception 'Parent comment must belong to the same photo';
  end if;

  return new;
end; $$;

drop trigger if exists comments_validate_parent on public.comments;
create trigger comments_validate_parent
  before insert or update of parent_comment_id, photo_id on public.comments
  for each row execute function public.validate_comment_parent();

create table if not exists public.comment_likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index if not exists comment_likes_comment_idx on public.comment_likes(comment_id);

-- 8. Storage bucket for photo files
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 9. Helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists photos_set_updated_at on public.photos;
create trigger photos_set_updated_at
  before update on public.photos
  for each row execute function public.set_updated_at();

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

create or replace function public.slugify(value text)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- 10. Auto-create profile/private account rows on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  provider_name text;
  provider_subject text;
begin
  provider_name := lower(coalesce(
    nullif(new.raw_app_meta_data->>'provider', ''),
    nullif(new.raw_app_meta_data->'providers'->>0, ''),
    'google'
  ));

  provider_subject := nullif(coalesce(
    new.raw_user_meta_data->>'provider_id',
    new.raw_user_meta_data->>'sub'
  ), '');

  insert into public.profiles (id, display_name, first_name, middle_name, last_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), nullif(new.raw_user_meta_data->>'first_name', ''), split_part(new.email, '@', 1), 'Photographer'),
    coalesce(nullif(new.raw_user_meta_data->>'first_name', ''), split_part(coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1), 'Photographer'), ' ', 1), 'Photographer'),
    nullif(new.raw_user_meta_data->>'middle_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'avatar_url', ''), nullif(new.raw_user_meta_data->>'picture', ''))
  )
  on conflict (id) do update set
    display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
    first_name = coalesce(nullif(public.profiles.first_name, ''), excluded.first_name),
    middle_name = coalesce(public.profiles.middle_name, excluded.middle_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  insert into public.user_private (id, email, email_confirmed_at, auth_provider, provider_user_id, password_updated_at)
  values (new.id, coalesce(new.email, ''), new.email_confirmed_at, provider_name, provider_subject, now())
  on conflict (id) do update set
    email = excluded.email,
    email_confirmed_at = excluded.email_confirmed_at,
    auth_provider = excluded.auth_provider,
    provider_user_id = coalesce(excluded.provider_user_id, public.user_private.provider_user_id),
    updated_at = now();

  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profile/private rows for users created before this schema was applied.
insert into public.profiles (id, display_name, first_name, middle_name, last_name, created_at)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), nullif(u.raw_user_meta_data->>'first_name', ''), split_part(u.email, '@', 1), 'Photographer'),
  coalesce(nullif(u.raw_user_meta_data->>'first_name', ''), split_part(coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1), 'Photographer'), ' ', 1), 'Photographer'),
  nullif(u.raw_user_meta_data->>'middle_name', ''),
  nullif(u.raw_user_meta_data->>'last_name', ''),
  coalesce(u.created_at, now())
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

insert into public.user_private (id, email, email_confirmed_at, auth_provider, provider_user_id, password_updated_at, created_at)
select
  u.id,
  coalesce(u.email, ''),
  u.email_confirmed_at,
  lower(coalesce(nullif(u.raw_app_meta_data->>'provider', ''), nullif(u.raw_app_meta_data->'providers'->>0, ''), 'google')),
  nullif(coalesce(u.raw_user_meta_data->>'provider_id', u.raw_user_meta_data->>'sub'), ''),
  coalesce(u.updated_at, u.created_at, now()),
  coalesce(u.created_at, now())
from auth.users u
where u.email is not null
  and not exists (select 1 from public.user_private up where up.id = u.id)
on conflict (id) do nothing;

update public.user_private up
set
  email = coalesce(u.email, up.email),
  email_confirmed_at = u.email_confirmed_at,
  auth_provider = lower(coalesce(nullif(u.raw_app_meta_data->>'provider', ''), nullif(u.raw_app_meta_data->'providers'->>0, ''), up.auth_provider, 'google')),
  provider_user_id = coalesce(up.provider_user_id, nullif(coalesce(u.raw_user_meta_data->>'provider_id', u.raw_user_meta_data->>'sub'), ''))
from auth.users u
where up.id = u.id;

-- 11. Row level security
alter table public.profiles enable row level security;
alter table public.user_private enable row level security;
alter table public.profile_links enable row level security;
alter table public.categories enable row level security;
alter table public.hashtags enable row level security;
alter table public.photos enable row level security;
alter table public.photo_hashtags enable row level security;
alter table public.photo_likes enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;

-- Profiles: everyone can read public profile fields, only owner can write.
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select using (true);
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_upsert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "user_private_read_self" on public.user_private;
create policy "user_private_read_self" on public.user_private for select using (auth.uid() = id);
drop policy if exists "user_private_insert_self" on public.user_private;
drop policy if exists "user_private_update_self" on public.user_private;

-- Links: public read, owner manages.
drop policy if exists "profile_links_read" on public.profile_links;
create policy "profile_links_read" on public.profile_links for select using (true);
drop policy if exists "profile_links_insert_self" on public.profile_links;
create policy "profile_links_insert_self" on public.profile_links for insert with check (auth.uid() = user_id);
drop policy if exists "profile_links_update_self" on public.profile_links;
create policy "profile_links_update_self" on public.profile_links for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "profile_links_delete_self" on public.profile_links;
create policy "profile_links_delete_self" on public.profile_links for delete using (auth.uid() = user_id);

-- Categories/hashtags: public read, authenticated users can create custom entries.
drop policy if exists "categories_read" on public.categories;
create policy "categories_read" on public.categories for select using (true);
drop policy if exists "categories_insert_authenticated" on public.categories;
create policy "categories_insert_authenticated" on public.categories for insert
  with check (auth.role() = 'authenticated' and (created_by is null or created_by = auth.uid()));

drop policy if exists "hashtags_read" on public.hashtags;
create policy "hashtags_read" on public.hashtags for select using (true);
drop policy if exists "hashtags_insert_authenticated" on public.hashtags;
create policy "hashtags_insert_authenticated" on public.hashtags for insert
  with check (auth.role() = 'authenticated' and (created_by is null or created_by = auth.uid()));

-- Photos: public read, owner write/delete.
drop policy if exists "photos_read" on public.photos;
create policy "photos_read" on public.photos for select using (true);
drop policy if exists "photos_insert_self" on public.photos;
create policy "photos_insert_self" on public.photos for insert
  with check (auth.uid() = user_id and split_part(storage_path, '/', 1) = auth.uid()::text);
drop policy if exists "photos_delete_self" on public.photos;
create policy "photos_delete_self" on public.photos for delete using (auth.uid() = user_id);
drop policy if exists "photos_update_self" on public.photos;
create policy "photos_update_self" on public.photos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "photo_hashtags_read" on public.photo_hashtags;
create policy "photo_hashtags_read" on public.photo_hashtags for select using (true);
drop policy if exists "photo_hashtags_insert_owner" on public.photo_hashtags;
create policy "photo_hashtags_insert_owner" on public.photo_hashtags for insert with check (
  exists (select 1 from public.photos p where p.id = photo_id and p.user_id = auth.uid())
);
drop policy if exists "photo_hashtags_delete_owner" on public.photo_hashtags;
create policy "photo_hashtags_delete_owner" on public.photo_hashtags for delete using (
  exists (select 1 from public.photos p where p.id = photo_id and p.user_id = auth.uid())
);

-- Likes: public read, only own row insert/delete.
drop policy if exists "photo_likes_read" on public.photo_likes;
create policy "photo_likes_read" on public.photo_likes for select using (true);
drop policy if exists "photo_likes_insert_self" on public.photo_likes;
create policy "photo_likes_insert_self" on public.photo_likes for insert with check (auth.uid() = user_id);
drop policy if exists "photo_likes_delete_self" on public.photo_likes;
create policy "photo_likes_delete_self" on public.photo_likes for delete using (auth.uid() = user_id);

drop policy if exists "likes_read" on public.likes;
create policy "likes_read" on public.likes for select using (true);
drop policy if exists "likes_insert_self" on public.likes;
create policy "likes_insert_self" on public.likes for insert with check (auth.uid() = user_id);
drop policy if exists "likes_delete_self" on public.likes;
create policy "likes_delete_self" on public.likes for delete using (auth.uid() = user_id);

-- Comments: public read, owner write/delete.
drop policy if exists "comments_read" on public.comments;
create policy "comments_read" on public.comments for select using (true);
drop policy if exists "comments_insert_self" on public.comments;
create policy "comments_insert_self" on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists "comments_delete_self" on public.comments;
create policy "comments_delete_self" on public.comments for delete using (auth.uid() = user_id);

drop policy if exists "comment_likes_read" on public.comment_likes;
create policy "comment_likes_read" on public.comment_likes for select using (true);
drop policy if exists "comment_likes_insert_self" on public.comment_likes;
create policy "comment_likes_insert_self" on public.comment_likes for insert with check (auth.uid() = user_id);
drop policy if exists "comment_likes_delete_self" on public.comment_likes;
create policy "comment_likes_delete_self" on public.comment_likes for delete using (auth.uid() = user_id);

-- Storage policies: anyone can read photos bucket; authenticated users can upload/manage own files.
drop policy if exists "photos_storage_read" on storage.objects;
create policy "photos_storage_read" on storage.objects for select using (bucket_id = 'photos');

drop policy if exists "photos_storage_insert" on storage.objects;
create policy "photos_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_storage_update_own" on storage.objects;
create policy "photos_storage_update_own" on storage.objects for update
  using (bucket_id = 'photos' and owner = auth.uid())
  with check (
    bucket_id = 'photos'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_storage_delete_own" on storage.objects;
create policy "photos_storage_delete_own" on storage.objects for delete
  using (bucket_id = 'photos' and owner = auth.uid());

drop policy if exists "avatars_storage_read" on storage.objects;
create policy "avatars_storage_read" on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists "avatars_storage_insert_own" on storage.objects;
create policy "avatars_storage_insert_own" on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_storage_update_own" on storage.objects;
create policy "avatars_storage_update_own" on storage.objects for update
  using (bucket_id = 'avatars' and owner = auth.uid())
  with check (
    bucket_id = 'avatars'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_storage_delete_own" on storage.objects;
create policy "avatars_storage_delete_own" on storage.objects for delete
  using (bucket_id = 'avatars' and owner = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 12. Auth hardening migration (idempotent).
-- Captures OAuth provider IDs,
-- tightens unattributed inserts on categories/hashtags, lets comment authors
-- edit their own rows, mirrors the legacy `likes` table into `photo_likes`,
-- and enforces per-user folders on new uploads to the `photos` storage bucket.
-- ─────────────────────────────────────────────────────────────────────────

-- 12.1 Derive auth_provider from Supabase's app metadata, defaulting to Google.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  provider_name text;
  provider_subject text;
begin
  provider_name := lower(coalesce(
    nullif(new.raw_app_meta_data->>'provider', ''),
    nullif(new.raw_app_meta_data->'providers'->>0, ''),
    'google'
  ));

  provider_subject := nullif(coalesce(
    new.raw_user_meta_data->>'provider_id',
    new.raw_user_meta_data->>'sub'
  ), '');

  insert into public.profiles (id, display_name, first_name, middle_name, last_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), nullif(new.raw_user_meta_data->>'first_name', ''), split_part(new.email, '@', 1), 'Photographer'),
    coalesce(nullif(new.raw_user_meta_data->>'first_name', ''), split_part(coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1), 'Photographer'), ' ', 1), 'Photographer'),
    nullif(new.raw_user_meta_data->>'middle_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'avatar_url', ''), nullif(new.raw_user_meta_data->>'picture', ''))
  )
  on conflict (id) do update set
    display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
    first_name = coalesce(nullif(public.profiles.first_name, ''), excluded.first_name),
    middle_name = coalesce(public.profiles.middle_name, excluded.middle_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  insert into public.user_private (id, email, email_confirmed_at, auth_provider, provider_user_id, password_updated_at)
  values (new.id, coalesce(new.email, ''), new.email_confirmed_at, provider_name, provider_subject, now())
  on conflict (id) do update set
    email = excluded.email,
    email_confirmed_at = excluded.email_confirmed_at,
    auth_provider = excluded.auth_provider,
    provider_user_id = coalesce(excluded.provider_user_id, public.user_private.provider_user_id),
    updated_at = now();

  return new;
end; $$;

-- 12.2 set_updated_at trigger on user_private.
drop trigger if exists user_private_set_updated_at on public.user_private;
create trigger user_private_set_updated_at
  before update on public.user_private
  for each row execute function public.set_updated_at();

-- 12.3 Tighten categories/hashtags inserts to require attribution.
drop policy if exists "categories_insert_authenticated" on public.categories;
create policy "categories_insert_authenticated" on public.categories for insert
  with check (auth.role() = 'authenticated' and created_by = auth.uid());

drop policy if exists "hashtags_insert_authenticated" on public.hashtags;
create policy "hashtags_insert_authenticated" on public.hashtags for insert
  with check (auth.role() = 'authenticated' and created_by = auth.uid());

-- 12.4 Let comment authors edit their own comments (was silently failing under RLS).
drop policy if exists "comments_update_self" on public.comments;
create policy "comments_update_self" on public.comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 12.5 Mirror legacy `likes` writes into `photo_likes` so they cannot drift.
create or replace function public.mirror_likes_to_photo_likes()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.photo_likes (user_id, photo_id, created_at)
    values (new.user_id, new.photo_id, coalesce(new.created_at, now()))
    on conflict (user_id, photo_id) do nothing;
    return new;
  elsif (tg_op = 'DELETE') then
    delete from public.photo_likes
     where user_id = old.user_id and photo_id = old.photo_id;
    return old;
  end if;
  return null;
end; $$;

drop trigger if exists likes_mirror_insert on public.likes;
create trigger likes_mirror_insert
  after insert on public.likes
  for each row execute function public.mirror_likes_to_photo_likes();

drop trigger if exists likes_mirror_delete on public.likes;
create trigger likes_mirror_delete
  after delete on public.likes
  for each row execute function public.mirror_likes_to_photo_likes();

-- 12.6 Per-user folder enforcement on new photo uploads.
-- Existing rows are unaffected (this policy governs INSERTs only).
drop policy if exists "photos_storage_insert" on storage.objects;
create policy "photos_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 12.7 Constrain auth_provider to known values, but only if existing data is clean.
do $$
declare
  unknown_count int;
begin
  select count(*) into unknown_count
  from public.user_private
  where auth_provider is not null
    and auth_provider <> 'google';

  if unknown_count = 0 then
    alter table public.user_private drop constraint if exists user_private_auth_provider_check;
    alter table public.user_private
      add constraint user_private_auth_provider_check
      check (auth_provider = 'google');
  else
    raise notice 'Skipping auth_provider check: % unknown values present', unknown_count;
  end if;
end $$;
