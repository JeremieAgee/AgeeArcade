-- ═══════════════════════════════════════════════════════════════════
-- Agee Arcade — Ad / Sponsor Revenue System Schema
-- Run in Supabase SQL editor (or via MCP supabase tool)
-- ═══════════════════════════════════════════════════════════════════

-- ── Sponsors ─────────────────────────────────────────────────────────
create table if not exists sponsors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  logo_url      text,
  website_url   text,
  contact_email text,
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Ad Placements (canonical slot registry) ──────────────────────────
create table if not exists ad_placements (
  id               uuid primary key default gen_random_uuid(),
  key              text not null unique,
  name             text not null,
  type             text not null,  -- see types below
  width            integer,
  height           integer,
  is_3d            boolean not null default false,
  is_clickable     boolean not null default true,
  requires_opt_in  boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- placement types: wall_billboard | main_sponsor | cabinet_sponsor |
--   loading_commercial | interstitial | rewarded | pause_banner |
--   leaderboard_sponsor | home_banner | house_ad

-- ── Campaigns ────────────────────────────────────────────────────────
create table if not exists campaigns (
  id                  uuid primary key default gen_random_uuid(),
  sponsor_id          uuid references sponsors(id) on delete set null,
  placement_key       text not null references ad_placements(key),
  title               text not null,
  description         text,
  image_url           text,
  video_url           text,
  click_url           text,
  start_date          timestamptz,
  end_date            timestamptz,
  priority            integer not null default 0,
  max_impressions     integer,
  max_clicks          integer,
  current_impressions integer not null default 0,
  current_clicks      integer not null default 0,
  active              boolean not null default true,
  is_house_ad         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_campaigns_placement_key on campaigns(placement_key);
create index if not exists idx_campaigns_active        on campaigns(active);
create index if not exists idx_campaigns_is_house_ad   on campaigns(is_house_ad);

-- ── Ad Events ────────────────────────────────────────────────────────
-- event_type: requested | served | visible | visible_2_seconds | click |
--   interaction | completed | skipped | failed | reward_granted |
--   reward_denied | no_fill | house_ad_served
create table if not exists ad_events (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references campaigns(id) on delete set null,
  placement_key text not null,
  event_type    text not null,
  game_id       text,
  session_id    text,
  user_id       uuid,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_ad_events_campaign_id   on ad_events(campaign_id);
create index if not exists idx_ad_events_placement_key on ad_events(placement_key);
create index if not exists idx_ad_events_event_type    on ad_events(event_type);
create index if not exists idx_ad_events_created_at    on ad_events(created_at);

-- ── Sponsor Leads (from /advertise contact form) ─────────────────────
create table if not exists sponsor_leads (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  business_name    text,
  email            text not null,
  website          text,
  desired_package  text,
  message          text,
  status           text not null default 'new',  -- new | contacted | closed | rejected
  created_at       timestamptz not null default now()
);

-- ── Auto-update updated_at ────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sponsors_updated_at  on sponsors;
drop trigger if exists trg_campaigns_updated_at on campaigns;

create trigger trg_sponsors_updated_at
  before update on sponsors
  for each row execute function update_updated_at();

create trigger trg_campaigns_updated_at
  before update on campaigns
  for each row execute function update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────
alter table sponsors       enable row level security;
alter table ad_placements  enable row level security;
alter table campaigns      enable row level security;
alter table ad_events      enable row level security;
alter table sponsor_leads  enable row level security;

-- Public can read active placements and campaigns (needed for AdRouter client-side)
create policy "public_read_placements"  on ad_placements  for select using (active = true);
create policy "public_read_campaigns"   on campaigns       for select using (active = true);

-- Anyone can insert ad events (analytics)
create policy "public_insert_ad_events" on ad_events for insert with check (true);

-- Anyone can insert sponsor leads (contact form)
create policy "public_insert_leads"     on sponsor_leads for insert with check (true);

-- Authenticated admin can do everything
create policy "admin_all_sponsors"      on sponsors      for all using (auth.role() = 'authenticated');
create policy "admin_all_placements"    on ad_placements for all using (auth.role() = 'authenticated');
create policy "admin_all_campaigns"     on campaigns     for all using (auth.role() = 'authenticated');
create policy "admin_all_ad_events"     on ad_events     for select using (auth.role() = 'authenticated');
create policy "admin_all_leads"         on sponsor_leads for all using (auth.role() = 'authenticated');

-- Campaigns: allow public to increment counters via rpc (safer than direct update)
create or replace function increment_campaign_impression(p_campaign_id uuid)
returns void language plpgsql security definer as $$
begin
  update campaigns
  set current_impressions = current_impressions + 1
  where id = p_campaign_id;
end;
$$;

create or replace function increment_campaign_click(p_campaign_id uuid)
returns void language plpgsql security definer as $$
begin
  update campaigns
  set current_clicks = current_clicks + 1
  where id = p_campaign_id;
end;
$$;
