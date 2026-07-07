-- ═══════════════════════════════════════════════════════════════════════
-- AGEE ARCADE ANALYTICS — INDIVIDUAL RESET STATEMENTS
-- Copy & run each one separately to see results
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- STEP 1: DELETE ALL EVENTS (individual game/app events)
-- ───────────────────────────────────────────────────────────────────────

DELETE FROM arcade_events;

-- Verify:
SELECT 'arcade_events' as table_name, COUNT(*) as remaining_rows FROM arcade_events;

-- ───────────────────────────────────────────────────────────────────────
-- STEP 2: DELETE ALL GAME SESSIONS (game play records)
-- ───────────────────────────────────────────────────────────────────────

DELETE FROM arcade_game_sessions;

-- Verify:
SELECT 'arcade_game_sessions' as table_name, COUNT(*) as remaining_rows FROM arcade_game_sessions;

-- ───────────────────────────────────────────────────────────────────────
-- STEP 3: DELETE ALL PAGE VIEWS (navigation events)
-- ───────────────────────────────────────────────────────────────────────

DELETE FROM arcade_page_views;

-- Verify:
SELECT 'arcade_page_views' as table_name, COUNT(*) as remaining_rows FROM arcade_page_views;

-- ───────────────────────────────────────────────────────────────────────
-- STEP 4: DELETE ALL SESSIONS (user sessions)
-- ───────────────────────────────────────────────────────────────────────

DELETE FROM arcade_sessions;

-- Verify:
SELECT 'arcade_sessions' as table_name, COUNT(*) as remaining_rows FROM arcade_sessions;

-- ───────────────────────────────────────────────────────────────────────
-- STEP 5: RESET VISITOR STATISTICS (keep users, reset their stats)
-- ───────────────────────────────────────────────────────────────────────

UPDATE arcade_visitors
SET
  visit_count = 1,
  session_count = 0,
  total_play_time_seconds = 0,
  last_visit = NOW();

-- Verify:
SELECT 'arcade_visitors' as table_name, COUNT(*) as remaining_rows FROM arcade_visitors;

-- Show sample visitor data:
-- SELECT
--   COUNT(*) as total_users,
--   ROUND(AVG(visit_count), 1) as avg_visits,
--   ROUND(AVG(session_count), 1) as avg_game_sessions,
--   SUM(total_play_time_seconds) as total_playtime_seconds
-- FROM arcade_visitors;

-- ───────────────────────────────────────────────────────────────────────
-- STEP 6: RESET SEQUENCE COUNTERS (for auto-incrementing IDs)
-- ───────────────────────────────────────────────────────────────────────

-- Reset arcade_page_views ID counter
ALTER SEQUENCE arcade_page_views_id_seq RESTART WITH 1;

-- Reset arcade_events ID counter
ALTER SEQUENCE arcade_events_id_seq RESTART WITH 1;

-- ───────────────────────────────────────────────────────────────────────
-- FINAL: COMPLETE STATUS CHECK
-- ───────────────────────────────────────────────────────────────────────

SELECT
  'arcade_visitors' as table_name, COUNT(*) as rows, 'KEPT - Users preserved' as status FROM arcade_visitors
UNION ALL
SELECT 'arcade_sessions', COUNT(*), 'CLEARED' FROM arcade_sessions
UNION ALL
SELECT 'arcade_page_views', COUNT(*), 'CLEARED' FROM arcade_page_views
UNION ALL
SELECT 'arcade_game_sessions', COUNT(*), 'CLEARED' FROM arcade_game_sessions
UNION ALL
SELECT 'arcade_events', COUNT(*), 'CLEARED' FROM arcade_events
ORDER BY table_name;

-- ═══════════════════════════════════════════════════════════════════════
-- ALTERNATIVE: DELETE EVERYTHING INCLUDING USERS
-- ═══════════════════════════════════════════════════════════════════════

/*
-- Only run this if you want complete wipe (including user records)

DELETE FROM arcade_events;
DELETE FROM arcade_game_sessions;
DELETE FROM arcade_page_views;
DELETE FROM arcade_sessions;
DELETE FROM arcade_visitors;

-- Reset all sequences
ALTER SEQUENCE arcade_page_views_id_seq RESTART WITH 1;
ALTER SEQUENCE arcade_events_id_seq RESTART WITH 1;

-- Result: Completely empty database like fresh install
*/

-- ═══════════════════════════════════════════════════════════════════════
-- CLEANUP: RESET IDENTITIES FOR SPECIFIC GAMES
-- (Run these only if you want to reset data for specific games)
-- ═══════════════════════════════════════════════════════════════════════

/*
-- Delete only Depths of Ashenveil game sessions:
DELETE FROM arcade_events WHERE game_id = 'depths_of_ashenveil';
DELETE FROM arcade_game_sessions WHERE game_id = 'depths_of_ashenveil';

-- Delete only Blacktide Bastion game sessions:
DELETE FROM arcade_events WHERE game_id = 'blacktide_bastion';
DELETE FROM arcade_game_sessions WHERE game_id = 'blacktide_bastion';

-- Delete only Maze Runner game sessions:
DELETE FROM arcade_events WHERE game_id = 'maze_runner';
DELETE FROM arcade_game_sessions WHERE game_id = 'maze_runner';

-- Delete only Spear Fisher game sessions:
DELETE FROM arcade_events WHERE game_id = 'spear_fisher';
DELETE FROM arcade_game_sessions WHERE game_id = 'spear_fisher';
*/

-- ═══════════════════════════════════════════════════════════════════════
-- CLEANUP: RESET DATA OLDER THAN X DAYS
-- (Use to archive old data while keeping recent)
-- ═══════════════════════════════════════════════════════════════════════

/*
-- Delete events older than 30 days:
DELETE FROM arcade_events WHERE created_at < NOW() - INTERVAL '30 days';

-- Delete game sessions older than 30 days:
DELETE FROM arcade_game_sessions WHERE started_at < NOW() - INTERVAL '30 days';

-- Delete page views older than 30 days:
DELETE FROM arcade_page_views WHERE created_at < NOW() - INTERVAL '30 days';

-- Delete sessions older than 30 days:
DELETE FROM arcade_sessions WHERE created_at < NOW() - INTERVAL '30 days';
*/

-- ═══════════════════════════════════════════════════════════════════════
-- EXPORT BEFORE DELETE (Optional: Save data as CSV first)
-- ═══════════════════════════════════════════════════════════════════════

/*
-- Copy all events to CSV (run in Supabase SQL, then export):
SELECT * FROM arcade_events ORDER BY created_at DESC;

-- Copy all game sessions to CSV:
SELECT * FROM arcade_game_sessions ORDER BY started_at DESC;

-- Copy all sessions to CSV:
SELECT * FROM arcade_sessions ORDER BY created_at DESC;

-- Copy all visitors to CSV:
SELECT * FROM arcade_visitors ORDER BY last_visit DESC;
*/
