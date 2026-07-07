# Agee Arcade Analytics — Database Setup Guide

## 📋 Overview

This directory contains SQL scripts to set up a comprehensive analytics system for Agee Arcade with proper visitor tracking (unique visitors are counted once).

### Files

1. **`COMPLETE_SQL_FINAL.sql`** — Complete table schema, RLS policies, stored procedures, triggers, and reporting functions
2. **`ANALYTICS_JS_UPDATED.js`** — Updated client-side analytics (copy to `js/analytics.js`)

---

## 🚀 Setup Instructions

### Step 1: Reset Database

In Supabase dashboard:
1. Go to **SQL Editor**
2. Run `COMPLETE_SQL_FINAL.sql` to drop and recreate tables, functions, and views

Or from command line (if you have supabase CLI):
```bash
supabase db push
```

### Step 2: Update Client Code

Replace `js/analytics.js` with the content from `ANALYTICS_JS_UPDATED.js`:
```bash
cp sql/ANALYTICS_JS_UPDATED.js js/analytics.js
```

No other code changes needed — the API is identical.

---

## 📊 Schema Overview

### Tables

#### `arcade_visitors` ⭐ **NEW**
Tracks unique individuals across all sessions.

```
visitor_id              UUID (PK)
first_visit            TIMESTAMPTZ
last_visit             TIMESTAMPTZ
visit_count            INT         — incremented per session
session_count          INT         — incremented per game session
total_play_time_seconds INT        — cumulative across all games
primary_source         TEXT        — first referrer source
primary_referrer       TEXT        — full referrer URL
```

**Key**: Each visitor counted **once** at `visitor_id` level.

---

#### `arcade_sessions`
One row per ~30-min user session.

```
session_id      UUID (PK)
visitor_id      UUID (FK → arcade_visitors)
referrer        TEXT
source          TEXT        — linkedin|facebook|google|github_pages|direct|other
landing_page    TEXT
current_page    TEXT
user_agent      TEXT
language        TEXT
platform        TEXT
screen_width    INT
screen_height   INT
is_returning    BOOLEAN     — determined at session init (visitor not new)
created_at      TIMESTAMPTZ
last_seen       TIMESTAMPTZ
```

**Purpose**: Track session context; link to visitor for attribution.

---

#### `arcade_page_views`
One row per page navigation.

```
id              BIGSERIAL (PK)
session_id      UUID (FK)
visitor_id      UUID (FK)
page            TEXT        — location.pathname
title           TEXT        — document.title
referrer        TEXT
source          TEXT
created_at      TIMESTAMPTZ
```

---

#### `arcade_game_sessions`
One row per game play session.

```
id              UUID (PK) — auto-generated
session_id      UUID (FK)
visitor_id      UUID (FK)
game_id         TEXT        — 'depths_of_ashenveil', 'blacktide_bastion', etc.
started_at      TIMESTAMPTZ
ended_at        TIMESTAMPTZ (NULL while playing)
duration_seconds INT
max_floor       INT
max_level       INT
deaths          INT
bosses_defeated INT
chests_opened   INT
enemies_killed  INT
end_reason      TEXT        — death|quit|time_up|fort_destroyed|unknown
```

---

#### `arcade_events`
One row per game/app event.

```
id              BIGSERIAL (PK)
session_id      UUID (FK)
visitor_id      UUID (FK)
game_session_id UUID (FK, nullable)
game_id         TEXT
event_type      TEXT        — 'floor_reached', 'fish_caught', etc.
event_data      JSONB       — custom fields per event
page            TEXT
created_at      TIMESTAMPTZ
```

---

## 🔑 Key Functions

### `upsert_session()`
Called on page load. Creates or updates visitor + session.

**Handles**:
- New visitor detection (first visit)
- Returning visitor tracking (visit_count increment)
- Session creation with is_returning flag

**Returns**: `(session_id, is_returning)`

---

### `start_game_session()`
Called when game begins.

**Returns**: Game session ID → stored in `window.AGEE_CURRENT_GAME_SESSION_ID`

---

### `end_game_session()`
Called when game ends.

**Side effects**:
- Updates `arcade_game_sessions` with final stats
- Triggers `trig_game_session_ended` → updates `arcade_visitors.session_count` + `total_play_time_seconds`

---

### `heartbeat_session()`
Called every 30 seconds to keep session alive.

**Updates**: `last_seen`, `current_page`

---

## 📈 Analytics Views & Reporting Functions

### Views (Pre-built)

```sql
SELECT * FROM vw_daily_visitors;        — New vs returning by day
SELECT * FROM vw_sessions_by_source;    — Sessions by traffic source
SELECT * FROM vw_game_stats;            — Game play statistics
SELECT * FROM vw_event_frequency;       — Event type frequency
SELECT * FROM vw_visitor_retention_7d;  — Active visitors (last 7 days)
```

### Functions (Call with SELECT)

```sql
SELECT get_total_unique_visitors();
SELECT * FROM get_visitor_breakdown(7);   -- Last 7 days: new vs returning
SELECT * FROM get_top_games(10);          -- Top 10 games by plays
SELECT * FROM get_source_engagement();    -- Engagement by referrer source
SELECT * FROM get_retention_status();     -- Daily/weekly/monthly active
```

---

## 🔐 Row Level Security (RLS)

All tables have RLS enabled:

| Table group | INSERT | UPDATE | SELECT |
|-------------|--------|--------|--------|
| Analytics (`arcade_*`) | ✅ Anyone | ✅ `arcade_sessions` (heartbeat), `arcade_game_sessions` (end session) | ❌ Admin only |
| Leaderboards (`*_leaderboard`, `maze_runner_runs`) | ✅ Anyone | — | ✅ Anyone |
| Depths saves (`depths_meta`, `depths_active_runs`) | ✅ Anyone | ✅ Own row (`player_id = auth.uid()`) | ✅ Own row or admin |

**For Admin Dashboard**: Sign in with an account that has `app_metadata.role = 'admin'` in Supabase Auth.

---

## 🔄 Data Flow: Example (Depths of Ashenveil)

```
1. User visits /games/depths-of-ashenveil/
   → analytics.js loads
   → _initSession()
   → RPC: upsert_session({ visitor_id, source: 'direct', ... })
     ├─ Check if visitor exists
     ├─ If not: INSERT arcade_visitors (first_visit = NOW, visit_count = 1)
     ├─ If yes: UPDATE arcade_visitors SET visit_count += 1
     └─ is_returning = (visit_count > 1)
   → INSERT arcade_page_views
   → Page renders

2. User clicks Play
   → game.js startGameSession('depths_of_ashenveil')
   → RPC: start_game_session(...)
     └─ INSERT arcade_game_sessions RETURNING id
   → window.AGEE_CURRENT_GAME_SESSION_ID = <uuid>
   → trackEvent('game_started', { floor: 1 })
   → INSERT arcade_events

3. User descends to floor 2
   → trackEvent('floor_reached', { floor: 2 })
   → INSERT arcade_events

4. User dies at floor 5
   → trackEvent('player_died', { floor: 5, level: 3 })
   → INSERT arcade_events
   → endGameSession({
       duration_seconds: 145,
       max_floor: 5,
       max_level: 3,
       enemies_killed: 42,
       end_reason: 'death'
     })
   → RPC: end_game_session(...)
     ├─ UPDATE arcade_game_sessions SET ended_at, duration_seconds, ...
     └─ [TRIGGER] trig_game_session_ended()
        └─ UPDATE arcade_visitors SET session_count += 1, total_play_time += 145

5. Page unload
   → beforeunload listener
   → endGameSessionUnload(...) via fetch + keepalive
```

---

## 🔍 Quick Queries

### How many unique visitors?
```sql
SELECT COUNT(*) FROM arcade_visitors;
```

### New vs returning (last 7 days)?
```sql
SELECT * FROM get_visitor_breakdown(7);
```

### Which game is most popular?
```sql
SELECT game_id, total_plays, unique_players 
FROM vw_game_stats 
ORDER BY total_plays DESC LIMIT 1;
```

### Daily active users?
```sql
SELECT * FROM get_retention_status();
```

### Average session duration by source?
```sql
SELECT source, avg_session_duration_seconds 
FROM vw_sessions_by_source 
ORDER BY avg_session_duration_seconds DESC;
```

---

## ⚠️ Important: Visitor Tracking Logic

The system ensures **each person is counted once** at the visitor level:

1. **First visit**:
   - `visitor_id` created
   - `visit_count = 1`
   - `is_returning = FALSE` (in session)

2. **Subsequent visits** (within 30 min or new session):
   - Same `visitor_id` (persistent localStorage)
   - `visit_count += 1`
   - `is_returning = TRUE` (in session)

3. **Reporting**:
   - "Unique visitors" = `COUNT(DISTINCT visitor_id)` from `arcade_visitors`
   - "New visitors" = `COUNT(*) WHERE visit_count = 1` in `arcade_visitors`
   - "Returning visitors" = `COUNT(*) WHERE visit_count > 1` in `arcade_visitors`

---

## 🚨 Troubleshooting

### RLS Policy Errors
If you get "new row violates row-level security policy":
- Ensure RLS policies are created (run `COMPLETE_SQL_FINAL.sql`)
- Check that anon key has INSERT permissions

### Function Calls Fail
- Verify RPC function names match exactly (Supabase is case-sensitive)
- Check function parameters: `p_` prefix is required in Supabase RPC

### No Data Appearing
- Check browser console for errors in analytics.js
- Verify Supabase URL and anon key are correct in analytics.js
- Check Supabase dashboard → Logs for actual errors

### Trigger Not Firing
- Confirm trigger was created: `SELECT trigger_name FROM information_schema.triggers WHERE table_name='arcade_game_sessions';`
- Triggers fire on UPDATE of `arcade_game_sessions` after `ended_at` is set

---

## 📝 Migration Notes (from old schema)

### Changes
- ✅ New `arcade_visitors` table for unique visitor tracking
- ✅ RLS policies enforced (anon can INSERT, authenticated can SELECT)
- ✅ Stored procedures replace direct SQL calls
- ✅ Triggers auto-update visitor stats on game session end
- ✅ Views and reporting functions pre-built

### Compatibility
- Old analytics.js calls `trackEvent()`, `startGameSession()`, `endGameSession()` — **all work the same**
- Updated analytics.js uses RPC instead of direct inserts (better performance + consistency)

### Data Loss?
- Completely fresh database → no data loss, clean start
- If migrating: export old `arcade_events`, `arcade_game_sessions` first, then migrate

---

## 🎯 Success Checklist

- [ ] Run `COMPLETE_SQL_FINAL.sql` (tables, functions, and views created, no errors)
- [ ] Replace `js/analytics.js` with updated version
- [ ] Test: Visit homepage, should see `arcade_page_views` entry
- [ ] Test: Play a game, should see `arcade_game_sessions` entry + `arcade_events` entries
- [ ] Query: `SELECT COUNT(*) FROM arcade_visitors;` → should be > 0
- [ ] Admin dashboard can sign in and see data

---

