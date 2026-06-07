-- ============================================================
-- RhythmWeaver — Supabase SQL Schema
-- Run this entire file in your Supabase SQL Editor (supabase.com)
-- ============================================================

-- ── 1. PROFILES ─────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  avatar_url  text,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);


-- ── 2. LIKED SONGS ──────────────────────────────────────────
create table if not exists public.liked_songs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  song_id         text not null,
  song_title      text not null,
  song_artist     text not null,
  song_album      text,
  song_album_art  text,
  song_audio_url  text not null,
  song_duration   integer,
  liked_at        timestamptz default now() not null,
  unique (user_id, song_id)
);

alter table public.liked_songs enable row level security;

create policy "Users manage their own liked songs"
  on public.liked_songs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists liked_songs_user_id_idx on public.liked_songs(user_id);


-- ── 3. RECENTLY PLAYED ──────────────────────────────────────
create table if not exists public.recently_played (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  song_id         text not null,
  song_title      text not null,
  song_artist     text not null,
  song_album      text,
  song_album_art  text,
  song_audio_url  text not null,
  song_duration   integer,
  played_at       timestamptz default now() not null,
  unique (user_id, song_id)
);

alter table public.recently_played enable row level security;

create policy "Users manage their own recently played"
  on public.recently_played for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists recently_played_user_id_idx on public.recently_played(user_id);
create index if not exists recently_played_played_at_idx on public.recently_played(played_at desc);


-- ── 4. PLAYLISTS ────────────────────────────────────────────
create table if not exists public.playlists (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  description  text,
  cover_art    text,
  is_public    boolean default false,
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);

alter table public.playlists enable row level security;

create policy "Users manage their own playlists"
  on public.playlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Public playlists are viewable by everyone"
  on public.playlists for select
  using (is_public = true);

create index if not exists playlists_user_id_idx on public.playlists(user_id);


-- ── 5. PLAYLIST SONGS ───────────────────────────────────────
create table if not exists public.playlist_songs (
  id              uuid primary key default gen_random_uuid(),
  playlist_id     uuid not null references public.playlists(id) on delete cascade,
  song_id         text not null,
  song_title      text not null,
  song_artist     text not null,
  song_album      text,
  song_album_art  text,
  song_audio_url  text not null,
  song_duration   integer,
  position        integer default 0,
  added_at        timestamptz default now() not null,
  unique (playlist_id, song_id)
);

alter table public.playlist_songs enable row level security;

-- Users can manage songs in their own playlists
create policy "Users manage songs in their own playlists"
  on public.playlist_songs for all
  using (
    exists (
      select 1 from public.playlists
      where playlists.id = playlist_songs.playlist_id
        and playlists.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.playlists
      where playlists.id = playlist_songs.playlist_id
        and playlists.user_id = auth.uid()
    )
  );

-- Public playlist songs are viewable
create policy "Public playlist songs are viewable"
  on public.playlist_songs for select
  using (
    exists (
      select 1 from public.playlists
      where playlists.id = playlist_songs.playlist_id
        and playlists.is_public = true
    )
  );

create index if not exists playlist_songs_playlist_id_idx on public.playlist_songs(playlist_id);


-- ── 6. AUTO-UPDATE updated_at ────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create trigger playlists_updated_at
  before update on public.playlists
  for each row execute procedure public.handle_updated_at();


-- ── 7. AUTO-CREATE PROFILE ON SIGNUP ─────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();