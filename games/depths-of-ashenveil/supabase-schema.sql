-- ═══════════════════════════════════════════════════
-- Depths of Ashenveil — Supabase schema
-- Run this in the Supabase SQL editor (Project → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────

create table if not exists public.depths_player_meta (
  player_id text primary key,
  best_floor integer not null default 1,
  best_level integer not null default 1,
  total_runs integer not null default 0,
  total_deaths integer not null default 0,
  bosses_defeated integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.depths_active_runs (
  player_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.depths_leaderboard (
  id bigserial primary key,
  player_id text not null,
  nickname text not null,
  floor integer not null,
  level integer not null,
  created_at timestamptz not null default now()
);

create index if not exists depths_leaderboard_score_idx
  on public.depths_leaderboard (level desc, floor desc, created_at asc);

-- ── Row Level Security ───────────────────────────

alter table public.depths_player_meta  enable row level security;
alter table public.depths_active_runs  enable row level security;
alter table public.depths_leaderboard  enable row level security;

-- Player meta: each user only sees/writes their own row
drop policy if exists "anon can read depths meta"    on public.depths_player_meta;
drop policy if exists "anon can write depths meta"   on public.depths_player_meta;

create policy "auth users manage own meta"
  on public.depths_player_meta for all
  to authenticated
  using  (player_id = auth.uid()::text)
  with check (player_id = auth.uid()::text);

-- Guests can still write meta using their localStorage id
create policy "anon can write depths meta"
  on public.depths_player_meta for all
  to anon
  using (true)
  with check (true);

-- Active runs: same pattern
drop policy if exists "anon can read depths active runs"  on public.depths_active_runs;
drop policy if exists "anon can write depths active runs" on public.depths_active_runs;

create policy "auth users manage own active run"
  on public.depths_active_runs for all
  to authenticated
  using  (player_id = auth.uid()::text)
  with check (player_id = auth.uid()::text);

create policy "anon can write depths active runs"
  on public.depths_active_runs for all
  to anon
  using (true)
  with check (true);

-- Leaderboard: everyone can read, only authenticated users can insert (stops spam)
drop policy if exists "anon can read depths leaderboard"           on public.depths_leaderboard;
drop policy if exists "anon can insert depths leaderboard"         on public.depths_leaderboard;
drop policy if exists "anon can delete own depths leaderboard rows" on public.depths_leaderboard;

create policy "anyone can read leaderboard"
  on public.depths_leaderboard for select
  to anon, authenticated
  using (true);

create policy "auth users can insert leaderboard"
  on public.depths_leaderboard for insert
  to authenticated
  with check (player_id = auth.uid()::text);

create policy "auth users can delete own leaderboard rows"
  on public.depths_leaderboard for delete
  to authenticated
  using (player_id = auth.uid()::text);
