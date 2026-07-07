-- ═══════════════════════════════════════════════════════════════════════
-- AGEE ARCADE — COMPLETE SQL
-- Everything in one file, ready to paste into Supabase SQL Editor
--
-- RLS POLICY BREAKDOWN:
-- ├─ Analytics Tables: Admin-only READ, anyone can INSERT/UPDATE
-- └─ Leaderboard Tables: Anyone can READ and WRITE
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1: DROP EXISTING TABLES (Clean Start)
-- ═══════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS arcade_events CASCADE;
DROP TABLE IF EXISTS arcade_page_views CASCADE;
DROP TABLE IF EXISTS arcade_game_sessions CASCADE;
DROP TABLE IF EXISTS arcade_sessions CASCADE;
DROP TABLE IF EXISTS arcade_visitors CASCADE;
DROP TABLE IF EXISTS spear_fisher_leaderboard CASCADE;
DROP TABLE IF EXISTS blacktide_bastion_leaderboard CASCADE;
DROP TABLE IF EXISTS maze_runner_runs CASCADE;
DROP TABLE IF EXISTS depths_leaderboard CASCADE;
DROP TABLE IF EXISTS depths_active_runs CASCADE;
DROP TABLE IF EXISTS depths_meta CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- PART 2: CREATE ANALYTICS TABLES (5 tables)
-- ═══════════════════════════════════════════════════════════════════════

-- 1. ARCADE_VISITORS (Unique people)
CREATE TABLE arcade_visitors (
  visitor_id UUID PRIMARY KEY,
  first_visit TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_visit TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visit_count INT NOT NULL DEFAULT 1,
  session_count INT NOT NULL DEFAULT 0,
  total_play_time_seconds INT NOT NULL DEFAULT 0,
  primary_source TEXT,
  primary_referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_arcade_visitors_first_visit ON arcade_visitors(first_visit);
CREATE INDEX idx_arcade_visitors_last_visit ON arcade_visitors(last_visit);

-- 2. ARCADE_SESSIONS (30-min user sessions)
CREATE TABLE arcade_sessions (
  session_id UUID PRIMARY KEY,
  visitor_id UUID NOT NULL REFERENCES arcade_visitors(visitor_id) ON DELETE CASCADE,
  referrer TEXT,
  source TEXT,
  landing_page TEXT NOT NULL,
  current_page TEXT NOT NULL,
  user_agent TEXT,
  language TEXT,
  platform TEXT,
  screen_width INT,
  screen_height INT,
  is_returning BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT source_valid CHECK (source IN ('linkedin', 'facebook', 'google', 'github_pages', 'direct', 'other'))
);

CREATE INDEX idx_arcade_sessions_visitor_id ON arcade_sessions(visitor_id);
CREATE INDEX idx_arcade_sessions_created_at ON arcade_sessions(created_at DESC);
CREATE INDEX idx_arcade_sessions_last_seen ON arcade_sessions(last_seen DESC);
CREATE INDEX idx_arcade_sessions_landing_page ON arcade_sessions(landing_page);

-- 3. ARCADE_PAGE_VIEWS (Page navigation)
CREATE TABLE arcade_page_views (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES arcade_sessions(session_id) ON DELETE CASCADE,
  visitor_id UUID NOT NULL REFERENCES arcade_visitors(visitor_id) ON DELETE CASCADE,
  page TEXT NOT NULL,
  title TEXT,
  referrer TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_arcade_page_views_session_id ON arcade_page_views(session_id);
CREATE INDEX idx_arcade_page_views_visitor_id ON arcade_page_views(visitor_id);
CREATE INDEX idx_arcade_page_views_page ON arcade_page_views(page);
CREATE INDEX idx_arcade_page_views_created_at ON arcade_page_views(created_at DESC);

-- 4. ARCADE_GAME_SESSIONS (Game play stats)
CREATE TABLE arcade_game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES arcade_sessions(session_id) ON DELETE CASCADE,
  visitor_id UUID NOT NULL REFERENCES arcade_visitors(visitor_id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT DEFAULT 0,
  max_floor INT DEFAULT 1,
  max_level INT DEFAULT 1,
  deaths INT DEFAULT 0,
  bosses_defeated INT DEFAULT 0,
  chests_opened INT DEFAULT 0,
  enemies_killed INT DEFAULT 0,
  end_reason TEXT,

  CONSTRAINT end_reason_valid CHECK (end_reason IN ('death', 'quit', 'time_up', 'fort_destroyed', 'wave_clear', 'unknown', NULL))
);

CREATE INDEX idx_arcade_game_sessions_session_id ON arcade_game_sessions(session_id);
CREATE INDEX idx_arcade_game_sessions_visitor_id ON arcade_game_sessions(visitor_id);
CREATE INDEX idx_arcade_game_sessions_game_id ON arcade_game_sessions(game_id);
CREATE INDEX idx_arcade_game_sessions_started_at ON arcade_game_sessions(started_at DESC);
CREATE INDEX idx_arcade_game_sessions_game_id_visitor ON arcade_game_sessions(game_id, visitor_id);

-- 5. ARCADE_EVENTS (Game/app events)
CREATE TABLE arcade_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES arcade_sessions(session_id) ON DELETE CASCADE,
  visitor_id UUID NOT NULL REFERENCES arcade_visitors(visitor_id) ON DELETE CASCADE,
  game_session_id UUID REFERENCES arcade_game_sessions(id) ON DELETE SET NULL,
  game_id TEXT,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  page TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_arcade_events_session_id ON arcade_events(session_id);
CREATE INDEX idx_arcade_events_visitor_id ON arcade_events(visitor_id);
CREATE INDEX idx_arcade_events_game_session_id ON arcade_events(game_session_id);
CREATE INDEX idx_arcade_events_event_type ON arcade_events(event_type);
CREATE INDEX idx_arcade_events_game_id ON arcade_events(game_id);
CREATE INDEX idx_arcade_events_created_at ON arcade_events(created_at DESC);
CREATE INDEX idx_arcade_events_event_data ON arcade_events USING GIN (event_data);

-- ═══════════════════════════════════════════════════════════════════════
-- PART 3: CREATE LEADERBOARD TABLES (4 tables)
-- ═══════════════════════════════════════════════════════════════════════

-- 1. DEPTHS_LEADERBOARD
CREATE TABLE depths_leaderboard (
  id BIGSERIAL PRIMARY KEY,
  player_id TEXT,
  nickname TEXT NOT NULL,
  level INT NOT NULL DEFAULT 1,
  floor INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_depths_leaderboard_level ON depths_leaderboard(level DESC, floor DESC, created_at ASC);
CREATE INDEX idx_depths_leaderboard_player_id ON depths_leaderboard(player_id);
CREATE INDEX idx_depths_leaderboard_created_at ON depths_leaderboard(created_at DESC);

-- 2. MAZE_RUNNER_RUNS
CREATE TABLE maze_runner_runs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  nickname TEXT,
  score INT NOT NULL DEFAULT 0,
  floors INT NOT NULL DEFAULT 0,
  time_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maze_runner_runs_score ON maze_runner_runs(score DESC, floors DESC, time_ms ASC);
CREATE INDEX idx_maze_runner_runs_user_id ON maze_runner_runs(user_id);
CREATE INDEX idx_maze_runner_runs_created_at ON maze_runner_runs(created_at DESC);

-- 3. BLACKTIDE_BASTION_LEADERBOARD
CREATE TABLE blacktide_bastion_leaderboard (
  id BIGSERIAL PRIMARY KEY,
  player_id TEXT,
  nickname TEXT,
  name TEXT,
  score INT NOT NULL DEFAULT 0,
  wave INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ,
  date TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blacktide_bastion_leaderboard_score ON blacktide_bastion_leaderboard(score DESC, wave DESC, created_at ASC);
CREATE INDEX idx_blacktide_bastion_leaderboard_player_id ON blacktide_bastion_leaderboard(player_id);
CREATE INDEX idx_blacktide_bastion_leaderboard_created_at ON blacktide_bastion_leaderboard(created_at DESC);

-- 4. SPEAR_FISHER_LEADERBOARD
CREATE TABLE spear_fisher_leaderboard (
  id BIGSERIAL PRIMARY KEY,
  player_id TEXT,
  nickname TEXT,
  name TEXT,
  score INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ,
  date TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_spear_fisher_leaderboard_score ON spear_fisher_leaderboard(score DESC, created_at ASC);
CREATE INDEX idx_spear_fisher_leaderboard_player_id ON spear_fisher_leaderboard(player_id);
CREATE INDEX idx_spear_fisher_leaderboard_created_at ON spear_fisher_leaderboard(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- PART 3B: DEPTHS-SPECIFIC TABLES (Game metadata & save system)
-- ═══════════════════════════════════════════════════════════════════════

-- DEPTHS_META (Player career statistics)
CREATE TABLE depths_meta (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID UNIQUE NOT NULL,
  best_floor INT NOT NULL DEFAULT 1,
  best_level INT NOT NULL DEFAULT 1,
  total_runs INT NOT NULL DEFAULT 0,
  total_deaths INT NOT NULL DEFAULT 0,
  bosses_defeated INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_depths_meta_player_id ON depths_meta(player_id);
CREATE INDEX idx_depths_meta_best_floor ON depths_meta(best_floor DESC, best_level DESC);
CREATE INDEX idx_depths_meta_updated_at ON depths_meta(updated_at DESC);

-- DEPTHS_ACTIVE_RUNS (Active game state for resume functionality)
CREATE TABLE depths_active_runs (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID UNIQUE NOT NULL,
  floor INT NOT NULL DEFAULT 1,
  level INT NOT NULL DEFAULT 1,
  dungeon_seed INT NOT NULL,
  player_state JSONB NOT NULL,
  inventory JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_depths_active_runs_player_id ON depths_active_runs(player_id);
CREATE INDEX idx_depths_active_runs_updated_at ON depths_active_runs(updated_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- PART 4: STORED PROCEDURES & FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Upsert session (called on page load)
CREATE OR REPLACE FUNCTION upsert_session(
  p_session_id UUID,
  p_visitor_id UUID,
  p_referrer TEXT,
  p_source TEXT,
  p_landing_page TEXT,
  p_user_agent TEXT,
  p_language TEXT,
  p_platform TEXT,
  p_screen_width INT,
  p_screen_height INT
)
RETURNS TABLE (
  session_id UUID,
  is_returning BOOLEAN
) AS $$
DECLARE
  v_is_returning BOOLEAN;
  v_visit_count INT;
BEGIN
  INSERT INTO arcade_visitors (visitor_id, first_visit, primary_source, primary_referrer)
  VALUES (p_visitor_id, NOW(), p_source, p_referrer)
  ON CONFLICT (visitor_id) DO UPDATE
  SET
    last_visit = NOW(),
    visit_count = arcade_visitors.visit_count + 1
  RETURNING arcade_visitors.visit_count INTO v_visit_count;

  v_is_returning := v_visit_count > 1;

  INSERT INTO arcade_sessions (
    session_id, visitor_id, referrer, source, landing_page, current_page,
    user_agent, language, platform, screen_width, screen_height, is_returning
  )
  VALUES (
    p_session_id, p_visitor_id, p_referrer, p_source, p_landing_page, p_landing_page,
    p_user_agent, p_language, p_platform, p_screen_width, p_screen_height, v_is_returning
  )
  ON CONFLICT (session_id) DO UPDATE
  SET
    current_page = p_landing_page,
    last_seen = NOW();

  RETURN QUERY SELECT p_session_id, v_is_returning;
END;
$$ LANGUAGE plpgsql;

-- Heartbeat session (every 30 seconds)
CREATE OR REPLACE FUNCTION heartbeat_session(
  p_session_id UUID,
  p_current_page TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE arcade_sessions
  SET
    current_page = p_current_page,
    last_seen = NOW()
  WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Start game session
CREATE OR REPLACE FUNCTION start_game_session(
  p_session_id UUID,
  p_visitor_id UUID,
  p_game_id TEXT
)
RETURNS UUID AS $$
DECLARE
  v_game_session_id UUID;
BEGIN
  INSERT INTO arcade_game_sessions (
    session_id, visitor_id, game_id, started_at
  )
  VALUES (
    p_session_id, p_visitor_id, p_game_id, NOW()
  )
  RETURNING id INTO v_game_session_id;

  RETURN v_game_session_id;
END;
$$ LANGUAGE plpgsql;

-- End game session with stats
CREATE OR REPLACE FUNCTION end_game_session(
  p_game_session_id UUID,
  p_visitor_id UUID,
  p_duration_seconds INT,
  p_max_floor INT,
  p_max_level INT,
  p_deaths INT,
  p_bosses_defeated INT,
  p_chests_opened INT,
  p_enemies_killed INT,
  p_end_reason TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE arcade_game_sessions
  SET
    ended_at = NOW(),
    duration_seconds = p_duration_seconds,
    max_floor = COALESCE(p_max_floor, 1),
    max_level = COALESCE(p_max_level, 1),
    deaths = COALESCE(p_deaths, 0),
    bosses_defeated = COALESCE(p_bosses_defeated, 0),
    chests_opened = COALESCE(p_chests_opened, 0),
    enemies_killed = COALESCE(p_enemies_killed, 0),
    end_reason = p_end_reason
  WHERE id = p_game_session_id;

  UPDATE arcade_visitors
  SET
    session_count = session_count + 1,
    total_play_time_seconds = total_play_time_seconds + COALESCE(p_duration_seconds, 0),
    last_visit = NOW()
  WHERE visitor_id = p_visitor_id;
END;
$$ LANGUAGE plpgsql;

-- Update visitor stats (called by trigger)
CREATE OR REPLACE FUNCTION update_visitor_stats(
  p_visitor_id UUID,
  p_duration_seconds INT
) RETURNS VOID AS $$
BEGIN
  UPDATE arcade_visitors
  SET
    session_count = session_count + 1,
    total_play_time_seconds = total_play_time_seconds + COALESCE(p_duration_seconds, 0),
    last_visit = NOW()
  WHERE visitor_id = p_visitor_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger for game session end
CREATE OR REPLACE FUNCTION trigger_game_session_ended()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    PERFORM update_visitor_stats(NEW.visitor_id, NEW.duration_seconds);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_game_session_ended ON arcade_game_sessions;
CREATE TRIGGER trig_game_session_ended
  AFTER UPDATE ON arcade_game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_game_session_ended();

-- ═══════════════════════════════════════════════════════════════════════
-- PART 5: VIEWS
-- ═══════════════════════════════════════════════════════════════════════

-- Daily visitors breakdown
CREATE OR REPLACE VIEW vw_daily_visitors AS
SELECT
  DATE(v.first_visit) as visit_date,
  COUNT(*) FILTER (WHERE v.visit_count = 1) as new_visitors,
  COUNT(*) FILTER (WHERE v.visit_count > 1) as returning_visitors,
  COUNT(*) as total_unique_visitors,
  SUM(v.visit_count) as total_visits
FROM arcade_visitors v
GROUP BY DATE(v.first_visit)
ORDER BY visit_date DESC;

-- Sessions by source
CREATE OR REPLACE VIEW vw_sessions_by_source AS
SELECT
  source,
  COUNT(*) as session_count,
  COUNT(DISTINCT visitor_id) as unique_visitors,
  AVG(EXTRACT(EPOCH FROM (last_seen - created_at)))::INT as avg_session_duration_seconds
FROM arcade_sessions
GROUP BY source
ORDER BY session_count DESC;

-- Game stats
CREATE OR REPLACE VIEW vw_game_stats AS
SELECT
  game_id,
  COUNT(*) as total_plays,
  COUNT(DISTINCT visitor_id) as unique_players,
  ROUND(AVG(duration_seconds)::NUMERIC, 0)::INT as avg_duration_seconds,
  ROUND(AVG(max_floor)::NUMERIC, 2)::NUMERIC as avg_max_floor,
  ROUND(AVG(enemies_killed)::NUMERIC, 1)::NUMERIC as avg_enemies_killed,
  COUNT(*) FILTER (WHERE end_reason = 'death') as deaths_count,
  COUNT(*) FILTER (WHERE end_reason = 'quit') as quit_count,
  COUNT(*) FILTER (WHERE end_reason = 'time_up') as timeout_count
FROM arcade_game_sessions
WHERE ended_at IS NOT NULL
GROUP BY game_id
ORDER BY total_plays DESC;

-- Event frequency
CREATE OR REPLACE VIEW vw_event_frequency AS
SELECT
  event_type,
  COUNT(*) as event_count,
  COUNT(DISTINCT visitor_id) as unique_visitors,
  COUNT(DISTINCT game_id) as games_involved,
  MAX(created_at) as last_occurrence
FROM arcade_events
GROUP BY event_type
ORDER BY event_count DESC;

-- Visitor retention (7 days)
CREATE OR REPLACE VIEW vw_visitor_retention_7d AS
SELECT
  v.visitor_id,
  v.first_visit,
  v.last_visit,
  v.visit_count,
  v.session_count,
  v.total_play_time_seconds,
  CASE
    WHEN v.last_visit >= NOW() - INTERVAL '1 day' THEN 'active_today'
    WHEN v.last_visit >= NOW() - INTERVAL '7 days' THEN 'active_week'
    ELSE 'inactive'
  END as retention_status
FROM arcade_visitors v
WHERE v.last_visit >= NOW() - INTERVAL '7 days'
ORDER BY v.last_visit DESC;

-- ═══════════════════════════════════════════════════════════════════════
-- PART 6: REPORTING FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_total_unique_visitors()
RETURNS BIGINT AS $$
  SELECT COUNT(*) FROM arcade_visitors;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_visitor_breakdown(p_days INT DEFAULT 7)
RETURNS TABLE (
  period_days INT,
  new_visitors BIGINT,
  returning_visitors BIGINT,
  total_visits BIGINT,
  unique_visitors BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p_days,
    COUNT(*) FILTER (WHERE v.first_visit >= NOW() - (p_days || ' days')::INTERVAL),
    COUNT(*) FILTER (WHERE v.first_visit < NOW() - (p_days || ' days')::INTERVAL),
    COUNT(s.*),
    COUNT(DISTINCT v.visitor_id)
  FROM arcade_visitors v
  LEFT JOIN arcade_sessions s ON v.visitor_id = s.visitor_id
    AND s.created_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_top_games(p_limit INT DEFAULT 10)
RETURNS TABLE (
  game_id TEXT,
  total_plays BIGINT,
  unique_players BIGINT,
  avg_duration_seconds INT,
  avg_max_floor NUMERIC,
  completion_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gs.game_id,
    COUNT(*)::BIGINT as total_plays,
    COUNT(DISTINCT gs.visitor_id)::BIGINT as unique_players,
    ROUND(AVG(gs.duration_seconds))::INT,
    ROUND(AVG(gs.max_floor)::NUMERIC, 2),
    ROUND(
      (COUNT(*) FILTER (WHERE gs.end_reason != 'quit')::NUMERIC / COUNT(*) * 100),
      2
    )
  FROM arcade_game_sessions gs
  WHERE gs.ended_at IS NOT NULL
  GROUP BY gs.game_id
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_source_engagement()
RETURNS TABLE (
  source TEXT,
  unique_visitors BIGINT,
  total_sessions BIGINT,
  avg_sessions_per_visitor NUMERIC,
  avg_session_duration_seconds INT,
  avg_total_playtime_seconds INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.source,
    COUNT(DISTINCT s.visitor_id)::BIGINT,
    COUNT(*)::BIGINT,
    ROUND(COUNT(*)::NUMERIC / COUNT(DISTINCT s.visitor_id), 2),
    ROUND(AVG(EXTRACT(EPOCH FROM (s.last_seen - s.created_at))))::INT,
    ROUND(AVG(v.total_play_time_seconds))::INT
  FROM arcade_sessions s
  JOIN arcade_visitors v ON s.visitor_id = v.visitor_id
  GROUP BY s.source
  ORDER BY COUNT(DISTINCT s.visitor_id) DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_retention_status()
RETURNS TABLE (
  retention_period TEXT,
  visitor_count BIGINT,
  percentage NUMERIC
) AS $$
DECLARE
  v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM arcade_visitors;

  RETURN QUERY
  SELECT
    'active_today'::TEXT,
    COUNT(*)::BIGINT,
    ROUND((COUNT(*)::NUMERIC / v_total * 100), 2)
  FROM arcade_visitors
  WHERE last_visit >= NOW() - INTERVAL '1 day'

  UNION ALL

  SELECT
    'active_this_week'::TEXT,
    COUNT(*)::BIGINT,
    ROUND((COUNT(*)::NUMERIC / v_total * 100), 2)
  FROM arcade_visitors
  WHERE last_visit >= NOW() - INTERVAL '7 days'

  UNION ALL

  SELECT
    'active_this_month'::TEXT,
    COUNT(*)::BIGINT,
    ROUND((COUNT(*)::NUMERIC / v_total * 100), 2)
  FROM arcade_visitors
  WHERE last_visit >= NOW() - INTERVAL '30 days'

  UNION ALL

  SELECT
    'inactive_30_days'::TEXT,
    COUNT(*)::BIGINT,
    ROUND((COUNT(*)::NUMERIC / v_total * 100), 2)
  FROM arcade_visitors
  WHERE last_visit < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- PART 7: ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE arcade_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arcade_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE depths_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE maze_runner_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacktide_bastion_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE spear_fisher_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE depths_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE depths_active_runs ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────────────────
-- ANALYTICS TABLES: ADMIN-ONLY READ, ANYONE CAN WRITE
-- ───────────────────────────────────────────────────────────────────────

-- arcade_visitors
CREATE POLICY anon_insert_visitors ON arcade_visitors FOR INSERT WITH CHECK (TRUE);
CREATE POLICY admin_read_visitors ON arcade_visitors FOR SELECT USING (
  (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
);

-- arcade_sessions
CREATE POLICY anon_insert_sessions ON arcade_sessions FOR INSERT WITH CHECK (TRUE);
CREATE POLICY anon_update_sessions ON arcade_sessions FOR UPDATE USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY admin_read_sessions ON arcade_sessions FOR SELECT USING (
  (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
);

-- arcade_page_views
CREATE POLICY anon_insert_page_views ON arcade_page_views FOR INSERT WITH CHECK (TRUE);
CREATE POLICY admin_read_page_views ON arcade_page_views FOR SELECT USING (
  (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
);

-- arcade_game_sessions
CREATE POLICY anon_insert_game_sessions ON arcade_game_sessions FOR INSERT WITH CHECK (TRUE);
CREATE POLICY anon_update_game_sessions ON arcade_game_sessions FOR UPDATE USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY admin_read_game_sessions ON arcade_game_sessions FOR SELECT USING (
  (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
);

-- arcade_events
CREATE POLICY anon_insert_events ON arcade_events FOR INSERT WITH CHECK (TRUE);
CREATE POLICY admin_read_events ON arcade_events FOR SELECT USING (
  (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
);

-- ───────────────────────────────────────────────────────────────────────
-- LEADERBOARD TABLES: ANYONE CAN READ AND WRITE
-- ───────────────────────────────────────────────────────────────────────

-- depths_leaderboard
CREATE POLICY public_insert_depths ON depths_leaderboard FOR INSERT WITH CHECK (TRUE);
CREATE POLICY public_read_depths ON depths_leaderboard FOR SELECT USING (TRUE);

-- maze_runner_runs
CREATE POLICY public_insert_maze_runner ON maze_runner_runs FOR INSERT WITH CHECK (TRUE);
CREATE POLICY public_read_maze_runner ON maze_runner_runs FOR SELECT USING (TRUE);

-- blacktide_bastion_leaderboard
CREATE POLICY public_insert_blacktide ON blacktide_bastion_leaderboard FOR INSERT WITH CHECK (TRUE);
CREATE POLICY public_read_blacktide ON blacktide_bastion_leaderboard FOR SELECT USING (TRUE);

-- spear_fisher_leaderboard
CREATE POLICY public_insert_spear_fisher ON spear_fisher_leaderboard FOR INSERT WITH CHECK (TRUE);
CREATE POLICY public_read_spear_fisher ON spear_fisher_leaderboard FOR SELECT USING (TRUE);

-- ───────────────────────────────────────────────────────────────────────
-- DEPTHS-SPECIFIC TABLES: PLAYER-OWNED + ADMIN
-- ───────────────────────────────────────────────────────────────────────

-- depths_meta
CREATE POLICY player_read_own_meta ON depths_meta FOR SELECT USING (
  player_id = auth.uid()
  OR (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
);
CREATE POLICY player_write_own_meta ON depths_meta FOR INSERT WITH CHECK (
  player_id = auth.uid()
);
CREATE POLICY player_update_own_meta ON depths_meta FOR UPDATE USING (
  player_id = auth.uid()
);
CREATE POLICY anon_write_meta ON depths_meta FOR INSERT WITH CHECK (TRUE);
CREATE POLICY admin_read_meta ON depths_meta FOR SELECT USING (
  (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
);

-- depths_active_runs
CREATE POLICY player_read_own_run ON depths_active_runs FOR SELECT USING (
  player_id = auth.uid()
  OR (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
);
CREATE POLICY player_write_own_run ON depths_active_runs FOR INSERT WITH CHECK (
  player_id = auth.uid()
);
CREATE POLICY player_update_own_run ON depths_active_runs FOR UPDATE USING (
  player_id = auth.uid()
);
CREATE POLICY anon_write_run ON depths_active_runs FOR INSERT WITH CHECK (TRUE);
CREATE POLICY admin_read_run ON depths_active_runs FOR SELECT USING (
  (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
);

-- ═══════════════════════════════════════════════════════════════════════
-- COMPLETE! DATABASE IS READY
-- ═══════════════════════════════════════════════════════════════════════

-- Summary:
-- ✅ 5 Analytics tables created (arcade_*)
-- ✅ 4 Leaderboard tables created (game_*_leaderboard)
-- ✅ 2 Depths-specific tables created (depths_meta, depths_active_runs)
-- ✅ 5 Stored procedures created
-- ✅ 5 Views created
-- ✅ 6 Reporting functions created
-- ✅ RLS enabled on all tables:
--    - Analytics: Admin-only READ (anyone can INSERT/UPDATE)
--    - Leaderboards: Public READ/WRITE
--    - Depths: Player-owned READ/UPDATE (anyone can INSERT), Admin can READ all
--
-- Next steps:
-- 1. Replace js/analytics.js with ANALYTICS_JS_UPDATED.js
-- 2. Make admin users via Supabase Dashboard:
--    - Go to Authentication → Users
--    - Find user, click Edit
--    - Edit App Metadata: { "role": "admin" }
--    - Save
-- 3. Test: Admin can query analytics, non-admin cannot
-- 4. Done!
