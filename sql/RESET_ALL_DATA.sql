-- ═══════════════════════════════════════════════════════════════════════
-- AGEE ARCADE ANALYTICS — COMPLETE DATA RESET
-- Keeps arcade_visitors (users) but resets ALL their stats and all data
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- OPTION 1: KEEP USER RECORDS BUT RESET THEIR STATS
-- (Recommended: Users are preserved for returning visitor tracking)
-- ───────────────────────────────────────────────────────────────────────

-- 1. Delete all events (game/app events)
DELETE FROM arcade_events;

-- 2. Delete all game sessions
DELETE FROM arcade_game_sessions;

-- 3. Delete all page views
DELETE FROM arcade_page_views;

-- 4. Delete all session records
DELETE FROM arcade_sessions;

-- 5. Reset visitor statistics (keep visitor_id, first_visit)
UPDATE arcade_visitors
SET
  visit_count = 1,
  session_count = 0,
  total_play_time_seconds = 0,
  last_visit = NOW();

-- Result: Users still exist but with fresh stats
-- SELECT COUNT(*) FROM arcade_visitors;  -- Shows how many users kept

-- ═══════════════════════════════════════════════════════════════════════
-- OPTION 2: DELETE EVERYTHING (COMPLETE WIPE)
-- (Use only if you want completely fresh start, no user history)
-- ═══════════════════════════════════════════════════════════════════════

/*
-- Uncomment this section if you want COMPLETE reset (delete all users too)

DELETE FROM arcade_events;
DELETE FROM arcade_game_sessions;
DELETE FROM arcade_page_views;
DELETE FROM arcade_sessions;
DELETE FROM arcade_visitors;

-- Result: Database completely empty, like first install
*/

-- ═══════════════════════════════════════════════════════════════════════
-- RESET SEQUENCE COUNTERS (for BIGSERIAL columns)
-- ═══════════════════════════════════════════════════════════════════════

-- Reset arcade_page_views sequence
ALTER SEQUENCE arcade_page_views_id_seq RESTART WITH 1;

-- Reset arcade_events sequence
ALTER SEQUENCE arcade_events_id_seq RESTART WITH 1;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFY RESET
-- ═══════════════════════════════════════════════════════════════════════

SELECT
  'arcade_visitors' as table_name, COUNT(*) as row_count FROM arcade_visitors
UNION ALL
SELECT 'arcade_sessions', COUNT(*) FROM arcade_sessions
UNION ALL
SELECT 'arcade_page_views', COUNT(*) FROM arcade_page_views
UNION ALL
SELECT 'arcade_game_sessions', COUNT(*) FROM arcade_game_sessions
UNION ALL
SELECT 'arcade_events', COUNT(*) FROM arcade_events;

-- ═══════════════════════════════════════════════════════════════════════
-- OPTIONAL: SHOW USER STATS AFTER RESET
-- ═══════════════════════════════════════════════════════════════════════

-- How many unique users remain:
-- SELECT COUNT(*) as total_users FROM arcade_visitors;

-- User breakdown:
-- SELECT
--   COUNT(*) as total_users,
--   COUNT(*) FILTER (WHERE visit_count = 1) as never_visited_after_reset,
--   SUM(visit_count) as total_visits_before_reset,
--   SUM(total_play_time_seconds) as total_playtime_before_reset
-- FROM arcade_visitors;
