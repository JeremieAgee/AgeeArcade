-- ═══════════════════════════════════════════════════════════════════
-- Agee Arcade — Ad System Seed Data
-- Run AFTER ads-schema.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── Default Placements ────────────────────────────────────────────────
insert into ad_placements (key, name, type, width, height, is_3d, is_clickable, requires_opt_in) values
  ('arcade_wall_left_01',     'Left Wall Billboard 1',       'wall_billboard',       1024, 512,  true,  true,  false),
  ('arcade_wall_left_02',     'Left Wall Billboard 2',       'wall_billboard',       1024, 512,  true,  true,  false),
  ('arcade_wall_right_01',    'Right Wall Billboard 1',      'wall_billboard',       1024, 512,  true,  true,  false),
  ('arcade_wall_main_banner', 'Main Arcade Banner',          'main_sponsor',         1920, 256,  true,  true,  false),
  ('arcade_back_wall_banner', 'Back Wall Banner',            'wall_billboard',       2048, 512,  true,  true,  false),
  ('arcade_cabinet_marquee',  'Cabinet Marquee Sponsor',     'cabinet_sponsor',       512, 128,  true,  false, false),
  ('game_loading_commercial', 'Game Loading Commercial',     'loading_commercial',   1280, 720,  false, true,  false),
  ('game_over_interstitial',  'Game Over Interstitial',      'interstitial',         1280, 720,  false, true,  false),
  ('rewarded_revive',         'Rewarded — Revive',           'rewarded',             1280, 720,  false, false, true),
  ('rewarded_double_coins',   'Rewarded — Double Coins',     'rewarded',             1280, 720,  false, false, true),
  ('rewarded_continue',       'Rewarded — Continue',         'rewarded',             1280, 720,  false, false, true),
  ('pause_menu_banner',       'Pause Menu Banner',           'pause_banner',          728,  90,  false, true,  false),
  ('leaderboard_sponsor',     'Leaderboard Sponsor',         'leaderboard_sponsor',   728,  90,  false, true,  false),
  ('home_top_banner',         'Home Top Banner',             'home_banner',           970, 250,  false, true,  false),
  ('home_side_banner',        'Home Side Banner',            'home_banner',           300, 600,  false, true,  false),
  ('advertise_page_example',  'Advertise Page Example',      'house_ad',             1024, 512,  false, true,  false)
on conflict (key) do nothing;

-- ── House Ad Campaigns ────────────────────────────────────────────────
-- These ensure no placement is ever empty.
-- Replace image_url values with real assets once created.

insert into campaigns
  (placement_key, title, description, image_url, click_url, priority, active, is_house_ad)
values
  -- Wall billboards
  ('arcade_wall_left_01',
   'Advertise Here',
   'Reach players in a 3D web arcade. Wall billboard slot available.',
   '/ads/house/advertise-here-wall.png',
   '/advertise',
   -10, true, true),

  ('arcade_wall_left_02',
   'New Game Coming Soon',
   'Stay tuned for the next game dropping at Agee Arcade.',
   '/ads/house/coming-soon.png',
   '/',
   -10, true, true),

  ('arcade_wall_right_01',
   'Support Agee Arcade',
   'Play free, always. Help keep the arcade running.',
   '/ads/house/support-arcade.png',
   '/advertise',
   -10, true, true),

  -- Loading commercial
  ('game_loading_commercial',
   'Agee Arcade — Free Browser Games',
   'Play free 3D browser games. No download required.',
   '/ads/house/house-loading.png',
   '/',
   -10, true, true),

  -- Game over interstitial
  ('game_over_interstitial',
   'Try Another Game',
   'More free games waiting in the arcade.',
   '/ads/house/try-another-game.png',
   '/',
   -10, true, true),

  -- Rewarded slots
  ('rewarded_revive',
   'Watch to Revive',
   'A sponsor message — thank a sponsor, keep playing.',
   '/ads/house/house-rewarded.png',
   '/advertise',
   -10, true, true),

  ('rewarded_double_coins',
   'Watch to Double Coins',
   'A sponsor message — thank a sponsor, double your coins.',
   '/ads/house/house-rewarded.png',
   '/advertise',
   -10, true, true),

  ('rewarded_continue',
   'Watch to Continue',
   'A sponsor message — thank a sponsor, continue playing.',
   '/ads/house/house-rewarded.png',
   '/advertise',
   -10, true, true),

  -- Pause banner
  ('pause_menu_banner',
   'Agee Arcade — Free Browser Games',
   'More games available in the arcade lobby.',
   '/ads/house/house-banner.png',
   '/',
   -10, true, true),

  -- Leaderboard
  ('leaderboard_sponsor',
   'Sponsor This Leaderboard',
   'Put your brand next to the top players.',
   '/ads/house/sponsor-leaderboard.png',
   '/advertise',
   -10, true, true),

  -- Home banners
  ('home_top_banner',
   'Advertise on Agee Arcade',
   'Reach players inside a 3D web arcade.',
   '/ads/house/house-home-banner.png',
   '/advertise',
   -10, true, true),

  ('home_side_banner',
   'New Game Coming Soon',
   'Next game drops soon at Agee Arcade.',
   '/ads/house/coming-soon-tall.png',
   '/',
   -10, true, true);
