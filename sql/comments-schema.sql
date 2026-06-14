-- ═══════════════════════════════════════════════════════════════════
-- Agee Arcade — Comments Schema
-- Run in Supabase SQL editor
--
-- page_id values:
--   'arcade'               → Arcade Room (index.html)
--   'depths-of-ashenveil'  → Depths of Ashenveil game page
--   'maze-runner'          → Maze Runner game page
-- ═══════════════════════════════════════════════════════════════════

create table if not exists comments (
  id           uuid        primary key default gen_random_uuid(),
  page_id      text        not null,
  user_id      uuid        references auth.users(id) on delete set null,
  display_name text        not null default 'Anonymous',
  content      text        not null check (char_length(content) between 1 and 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_comments_page_id    on comments(page_id);
create index if not exists idx_comments_user_id    on comments(user_id);
create index if not exists idx_comments_created_at on comments(created_at desc);

-- One comment per user per page (authenticated users only)
create unique index if not exists uq_comments_user_page
  on comments(user_id, page_id)
  where user_id is not null;

-- Auto-update updated_at
create or replace function update_comments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_comments_updated_at on comments;
create trigger trg_comments_updated_at
  before update on comments
  for each row execute function update_comments_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────
alter table comments enable row level security;

-- Anyone (including anonymous) can insert
create policy "public_insert_comments"
  on comments for insert
  with check (true);

-- Admin can read all comments
create policy "admin_read_comments"
  on comments for select
  using (auth.role() = 'authenticated' and
         (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Authenticated users can read their own comment
create policy "user_read_own_comment"
  on comments for select
  using (auth.uid() = user_id);

-- Authenticated users can update/delete their own comment
create policy "user_update_own_comment"
  on comments for update
  using (auth.uid() = user_id);

create policy "user_delete_own_comment"
  on comments for delete
  using (auth.uid() = user_id);

-- Admin can delete any comment
create policy "admin_delete_any_comment"
  on comments for delete
  using (auth.role() = 'authenticated' and
         (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
