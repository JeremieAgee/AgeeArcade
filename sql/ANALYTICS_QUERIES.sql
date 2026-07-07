-- ═══════════════════════════════════════════════════════════════════════
-- AGEE ARCADE — COMMON ANALYTICS QUERIES
-- Copy & paste into Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- VISITOR OVERVIEW
-- ═══════════════════════════════════════════════════════════════════════

-- Total unique visitors (all time)
SELECT
  COUNT(*) as total_unique_visitors,
  COUNT(*) FILTER (WHERE visit_count = 1) as new_visitors,
  COUNT(*) FILTER (WHERE visit_count > 1) as returning_visitors,
  ROUND(100.0 * COUNT(*) FILTER (WHERE visit_count > 1) / COUNT(*), 1) as return_rate_pct
FROM arcade_visitors;

-- New vs Returning by date (last 30 days)
SELECT
  DATE(first_visit) as visit_date,
  COUNT(*) FILTER (WHERE visit_count = 1) as new_visitors,
  COUNT(*) FILTER (WHERE visit_count > 1) as returning_visitors,
  SUM(visit_count) as total_visits,
  COUNT(*) as unique_visitors_active
FROM arcade_visitors
WHERE first_visit >= NOW() - INTERVAL '30 days'
GROUP BY DATE(first_visit)
ORDER BY visit_date DESC;

-- Daily/Weekly/Monthly active users
SELECT * FROM get_retention_status();

-- Top returning visitors (by play time)
SELECT
  visitor_id,
  visit_count,
  session_count,
  total_play_time_seconds,
  ROUND(total_play_time_seconds::NUMERIC / 60, 1) as total_play_time_minutes,
  first_visit,
  last_visit,
  ROUND(total_play_time_seconds::NUMERIC / NULLIF(session_count, 0), 1)::INT as avg_playtime_per_session
FROM arcade_visitors
WHERE visit_count > 1
ORDER BY total_play_time_seconds DESC
LIMIT 20;

-- ═══════════════════════════════════════════════════════════════════════
-- SESSION ANALYSIS
-- ═══════════════════════════════════════════════════════════════════════

-- Sessions by traffic source (with engagement metrics)
SELECT * FROM get_source_engagement();

-- Hourly session volume (last 7 days)
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as sessions,
  COUNT(DISTINCT visitor_id) as unique_visitors,
  AVG(EXTRACT(EPOCH FROM (last_seen - created_at)))::INT as avg_session_duration_seconds
FROM arcade_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- Most common landing pages
SELECT
  landing_page,
  COUNT(DISTINCT visitor_id) as unique_visitors,
  COUNT(*) as session_count,
  COUNT(*) FILTER (WHERE is_returning = FALSE) as new_user_sessions,
  COUNT(*) FILTER (WHERE is_returning = TRUE) as returning_user_sessions
FROM arcade_sessions
GROUP BY landing_page
ORDER BY session_count DESC;

-- Session depth by source (page view count per session)
SELECT
  source,
  COUNT(DISTINCT s.session_id) as sessions,
  AVG(pv_count.page_view_count)::NUMERIC(10,1) as avg_pages_per_session,
  MAX(pv_count.page_view_count) as max_pages_in_session
FROM arcade_sessions s
LEFT JOIN (
  SELECT session_id, COUNT(*) as page_view_count
  FROM arcade_page_views
  GROUP BY session_id
) pv_count ON s.session_id = pv_count.session_id
GROUP BY source
ORDER BY sessions DESC;

-- ═══════════════════════════════════════════════════════════════════════
-- GAME ANALYTICS
-- ═══════════════════════════════════════════════════════════════════════

-- Game stats overview
SELECT * FROM vw_game_stats;

-- Top games (detailed)
SELECT * FROM get_top_games(10);

-- Game engagement by visitor (daily players per game)
SELECT
  DATE(gs.started_at) as play_date,
  gs.game_id,
  COUNT(*) as plays,
  COUNT(DISTINCT gs.visitor_id) as unique_players,
  ROUND(AVG(gs.duration_seconds)::NUMERIC, 0)::INT as avg_duration_seconds,
  COUNT(*) FILTER (WHERE gs.end_reason = 'death') as death_count,
  COUNT(*) FILTER (WHERE gs.end_reason = 'quit') as quit_count
FROM arcade_game_sessions gs
WHERE gs.ended_at IS NOT NULL
GROUP BY DATE(gs.started_at), gs.game_id
ORDER BY play_date DESC, plays DESC;

-- Game progression (average max floor by game)
SELECT
  game_id,
  COUNT(*) as total_plays,
  ROUND(AVG(max_floor)::NUMERIC, 1) as avg_max_floor,
  MAX(max_floor) as highest_floor_reached,
  ROUND(AVG(max_level)::NUMERIC, 1) as avg_max_level,
  MAX(max_level) as highest_level_reached,
  ROUND(AVG(enemies_killed)::NUMERIC, 1) as avg_enemies_killed
FROM arcade_game_sessions
WHERE ended_at IS NOT NULL
GROUP BY game_id
ORDER BY total_plays DESC;

-- Time spent in each game (total)
SELECT
  game_id,
  COUNT(*) as play_sessions,
  SUM(duration_seconds) as total_seconds,
  ROUND(SUM(duration_seconds) / 3600.0, 1) as total_hours,
  ROUND(AVG(duration_seconds)::NUMERIC, 0)::INT as avg_session_duration
FROM arcade_game_sessions
WHERE ended_at IS NOT NULL
GROUP BY game_id
ORDER BY total_seconds DESC;

-- ═══════════════════════════════════════════════════════════════════════
-- EVENT ANALYSIS
-- ═══════════════════════════════════════════════════════════════════════

-- Event frequency
SELECT * FROM vw_event_frequency;

-- Game events breakdown (which events are most common)
SELECT
  event_type,
  COUNT(*) as occurrences,
  COUNT(DISTINCT visitor_id) as unique_users,
  COUNT(DISTINCT game_id) as games_affected,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage_of_all_events
FROM arcade_events
WHERE game_id IS NOT NULL
GROUP BY event_type
ORDER BY occurrences DESC;

-- Event timeline (last 24 hours by hour)
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  event_type,
  COUNT(*) as count
FROM arcade_events
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), event_type
ORDER BY hour DESC, count DESC;

-- Specific game events (e.g., all Depths events)
SELECT
  event_type,
  COUNT(*) as count,
  DATE_TRUNC('hour', MAX(created_at))::TEXT as last_occurrence,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct_of_depths_events
FROM arcade_events
WHERE game_id = 'depths_of_ashenveil'
GROUP BY event_type
ORDER BY count DESC;

-- ═══════════════════════════════════════════════════════════════════════
-- FUNNELS & CONVERSION
-- ═══════════════════════════════════════════════════════════════════════

-- Homepage → Play funnel (last 7 days)
WITH homepage_visits AS (
  SELECT DISTINCT visitor_id, DATE(created_at) as visit_date
  FROM arcade_page_views
  WHERE page = '/' AND created_at >= NOW() - INTERVAL '7 days'
),
plays AS (
  SELECT DISTINCT visitor_id, DATE(started_at) as play_date
  FROM arcade_game_sessions
  WHERE started_at >= NOW() - INTERVAL '7 days'
)
SELECT
  COUNT(DISTINCT h.visitor_id) as homepage_visitors,
  COUNT(DISTINCT p.visitor_id) as converted_to_play,
  ROUND(100.0 * COUNT(DISTINCT p.visitor_id) / COUNT(DISTINCT h.visitor_id), 1) as conversion_rate_pct
FROM homepage_visits h
LEFT JOIN plays p ON h.visitor_id = p.visitor_id;

-- Game completion rate (end_reason = 'completion' or similar)
SELECT
  game_id,
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE end_reason = 'death') as endings_death,
  COUNT(*) FILTER (WHERE end_reason = 'quit') as endings_quit,
  COUNT(*) FILTER (WHERE end_reason = 'time_up') as endings_timeout,
  COUNT(*) FILTER (WHERE end_reason = 'unknown') as endings_unknown,
  ROUND(100.0 * COUNT(*) FILTER (WHERE end_reason != 'quit') / COUNT(*), 1) as completion_rate_pct
FROM arcade_game_sessions
WHERE ended_at IS NOT NULL
GROUP BY game_id
ORDER BY total_sessions DESC;

-- ═══════════════════════════════════════════════════════════════════════
-- COHORT ANALYSIS
-- ═══════════════════════════════════════════════════════════════════════

-- Cohort: visitors by first visit week
WITH visitor_cohorts AS (
  SELECT
    DATE_TRUNC('week', first_visit)::DATE as cohort_week,
    visitor_id,
    DATE_TRUNC('week', last_visit)::DATE as last_visit_week,
    (DATE_TRUNC('week', last_visit) - DATE_TRUNC('week', first_visit)) / INTERVAL '1 week' as weeks_ago
  FROM arcade_visitors
)
SELECT
  cohort_week,
  weeks_ago::INT as weeks_since_first_visit,
  COUNT(*) as cohort_size,
  COUNT(*) FILTER (WHERE weeks_ago::INT = 0) as active_same_week,
  COUNT(*) FILTER (WHERE weeks_ago::INT <= 1 AND weeks_ago::INT >= 0) as active_within_1_week,
  COUNT(*) FILTER (WHERE weeks_ago::INT <= 4 AND weeks_ago::INT >= 0) as active_within_4_weeks
FROM visitor_cohorts
WHERE cohort_week >= NOW() - INTERVAL '16 weeks'
GROUP BY cohort_week, weeks_ago
ORDER BY cohort_week DESC, weeks_ago ASC;

-- ═══════════════════════════════════════════════════════════════════════
-- ENGAGEMENT & CHURN
-- ═══════════════════════════════════════════════════════════════════════

-- Days since last visit distribution
SELECT
  CASE
    WHEN (NOW() - last_visit) < INTERVAL '1 day' THEN '0-24 hours'
    WHEN (NOW() - last_visit) < INTERVAL '7 days' THEN '1-7 days'
    WHEN (NOW() - last_visit) < INTERVAL '30 days' THEN '8-30 days'
    WHEN (NOW() - last_visit) < INTERVAL '90 days' THEN '31-90 days'
    ELSE '90+ days'
  END as days_since_last_visit,
  COUNT(*) as visitor_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as percentage
FROM arcade_visitors
GROUP BY days_since_last_visit
ORDER BY visitor_count DESC;

-- High-engagement users (top 10%)
SELECT
  visitor_id,
  session_count,
  total_play_time_seconds,
  ROUND(total_play_time_seconds::NUMERIC / 3600, 1) as hours_played,
  visit_count,
  ROUND(total_play_time_seconds::NUMERIC / NULLIF(session_count, 0) / 60, 1)::INT as avg_session_minutes
FROM arcade_visitors
WHERE session_count > 0
ORDER BY total_play_time_seconds DESC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════════
-- PLATFORM & DEVICE ANALYSIS
-- ═══════════════════════════════════════════════════════════════════════

-- Screen sizes used
SELECT
  screen_width,
  screen_height,
  COUNT(DISTINCT visitor_id) as unique_users,
  COUNT(*) as session_count
FROM arcade_sessions
GROUP BY screen_width, screen_height
ORDER BY session_count DESC
LIMIT 20;

-- Browser/OS (via user agent parsing - requires more complex extraction)
SELECT
  CASE
    WHEN user_agent ILIKE '%Chrome%' THEN 'Chrome'
    WHEN user_agent ILIKE '%Safari%' THEN 'Safari'
    WHEN user_agent ILIKE '%Firefox%' THEN 'Firefox'
    WHEN user_agent ILIKE '%Edge%' THEN 'Edge'
    ELSE 'Other'
  END as browser,
  COUNT(DISTINCT visitor_id) as users,
  COUNT(*) as sessions
FROM arcade_sessions
WHERE user_agent IS NOT NULL
GROUP BY browser
ORDER BY sessions DESC;

-- Languages
SELECT
  language,
  COUNT(DISTINCT visitor_id) as users,
  COUNT(*) as sessions
FROM arcade_sessions
WHERE language IS NOT NULL
GROUP BY language
ORDER BY sessions DESC;

-- ═══════════════════════════════════════════════════════════════════════
-- PERFORMANCE METRICS
-- ═══════════════════════════════════════════════════════════════════════

-- Average session duration by landing page
SELECT
  landing_page,
  COUNT(*) as sessions,
  ROUND(AVG(EXTRACT(EPOCH FROM (last_seen - created_at)))::NUMERIC, 0)::INT as avg_duration_seconds,
  ROUND(AVG(EXTRACT(EPOCH FROM (last_seen - created_at))) / 60, 1) as avg_duration_minutes
FROM arcade_sessions
GROUP BY landing_page
ORDER BY avg_duration_seconds DESC;

-- Page flow (which pages lead to game sessions)
SELECT
  pv.page,
  COUNT(DISTINCT gs.id) as games_started_afterward,
  COUNT(DISTINCT pv.session_id) as sessions_with_this_page
FROM arcade_page_views pv
LEFT JOIN arcade_game_sessions gs ON pv.session_id = gs.session_id
  AND gs.started_at > pv.created_at
  AND gs.started_at < pv.created_at + INTERVAL '5 minutes'
GROUP BY pv.page
ORDER BY games_started_afterward DESC;
