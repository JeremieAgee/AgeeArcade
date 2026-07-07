-- ═══════════════════════════════════════════════════════════════════════
-- AGEE ARCADE LEADERBOARDS — RESET DATA
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- OPTION 1: DELETE ALL LEADERBOARD DATA
-- ───────────────────────────────────────────────────────────────────────

DELETE FROM spear_fisher_leaderboard;
DELETE FROM blacktide_bastion_leaderboard;
DELETE FROM maze_runner_runs;
DELETE FROM depths_leaderboard;

-- Reset sequence counters
ALTER SEQUENCE spear_fisher_leaderboard_id_seq RESTART WITH 1;
ALTER SEQUENCE blacktide_bastion_leaderboard_id_seq RESTART WITH 1;
ALTER SEQUENCE maze_runner_runs_id_seq RESTART WITH 1;
ALTER SEQUENCE depths_leaderboard_id_seq RESTART WITH 1;

-- ───────────────────────────────────────────────────────────────────────
-- OPTION 2: DELETE DATA OLDER THAN 30 DAYS (Archive old scores)
-- ───────────────────────────────────────────────────────────────────────

/*
DELETE FROM spear_fisher_leaderboard WHERE created_at < NOW() - INTERVAL '30 days';
DELETE FROM blacktide_bastion_leaderboard WHERE created_at < NOW() - INTERVAL '30 days';
DELETE FROM maze_runner_runs WHERE created_at < NOW() - INTERVAL '30 days';
DELETE FROM depths_leaderboard WHERE created_at < NOW() - INTERVAL '30 days';
*/

-- ───────────────────────────────────────────────────────────────────────
-- OPTION 3: DELETE SPECIFIC GAME'S SCORES ONLY
-- ───────────────────────────────────────────────────────────────────────

/*
-- Delete only Depths of Ashenveil scores:
DELETE FROM depths_leaderboard;

-- Delete only Maze Runner scores:
DELETE FROM maze_runner_runs;

-- Delete only Blacktide Bastion scores:
DELETE FROM blacktide_bastion_leaderboard;

-- Delete only Spear Fisher scores:
DELETE FROM spear_fisher_leaderboard;
*/

-- ───────────────────────────────────────────────────────────────────────
-- VERIFY RESET
-- ───────────────────────────────────────────────────────────────────────

SELECT
  'depths_leaderboard' as table_name, COUNT(*) as row_count FROM depths_leaderboard
UNION ALL
SELECT 'maze_runner_runs', COUNT(*) FROM maze_runner_runs
UNION ALL
SELECT 'blacktide_bastion_leaderboard', COUNT(*) FROM blacktide_bastion_leaderboard
UNION ALL
SELECT 'spear_fisher_leaderboard', COUNT(*) FROM spear_fisher_leaderboard;

-- ═══════════════════════════════════════════════════════════════════════
-- CLEAR LOCAL BROWSER STORAGE (Run in browser console)
-- ═══════════════════════════════════════════════════════════════════════

/*
// Clear all leaderboard sync keys and local copies:
localStorage.removeItem('spear_fisher_lb');
localStorage.removeItem('spear_fisher_lb.synced.v1');
localStorage.removeItem('maze_runner_lb');
localStorage.removeItem('maze_runner_lb.synced.v1');
localStorage.removeItem('depthsOfAshenveil.leaderboard.v1');
localStorage.removeItem('blacktide_bastion_lb');
localStorage.removeItem('agee_arcade.leaderboard_guest_id');

// Verify cleared:
console.log('Leaderboard sync keys cleared');
*/
