-- ═══════════════════════════════════════════════════════════════════════
-- AGEE ARCADE ANALYTICS — SIMPLE RESET
-- Keep users, delete all data
-- Just copy this entire file and paste into Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

DELETE FROM arcade_events;
DELETE FROM arcade_game_sessions;
DELETE FROM arcade_page_views;
DELETE FROM arcade_sessions;

UPDATE arcade_visitors
SET
  visit_count = 1,
  session_count = 0,
  total_play_time_seconds = 0,
  last_visit = NOW();

ALTER SEQUENCE arcade_page_views_id_seq RESTART WITH 1;
ALTER SEQUENCE arcade_events_id_seq RESTART WITH 1;

-- ✅ Done! Your users are kept, all data is reset.
