# 📊 Complete Data Tracking & Storage Review

## Overview
Comprehensive review of ALL data collected, tracked, computed, and stored in the Agee Arcade analytics database.

---

## 🎯 PART 1: RAW DATA COLLECTED FROM CLIENT

### A. Session Initialization (Page Load)

**When**: User visits any page, analytics.js loads
**Function**: `upsert_session()`
**Data Captured**:

| Field | Type | Source | Purpose |
|-------|------|--------|---------|
| `visitor_id` | UUID | localStorage['agee_arcade.visitor_id'] | Unique person identifier |
| `session_id` | UUID | sessionStorage['agee_arcade.session_id'] | Unique session identifier (30min) |
| `referrer` | TEXT | document.referrer | What page they came from |
| `source` | TEXT | Parsed from referrer | linkedin/facebook/google/github_pages/direct/other |
| `landing_page` | TEXT | location.pathname | First page of session |
| `user_agent` | TEXT | navigator.userAgent | Browser + OS info |
| `language` | TEXT | navigator.language | Browser language (en-US, etc.) |
| `platform` | TEXT | navigator.platform | OS type (MacIntel, Win32, Linux, etc.) |
| `screen_width` | INT | window.screen.width | Monitor/device width |
| `screen_height` | INT | window.screen.height | Monitor/device height |
| `is_returning` | BOOLEAN | Computed (visit_count > 1) | New vs returning visitor |
| `created_at` | TIMESTAMPTZ | NOW() | Session start time |
| `last_seen` | TIMESTAMPTZ | NOW() | Last activity time |

**Tables Written**:
- `arcade_visitors` (insert/update)
- `arcade_sessions` (insert)
- `arcade_page_views` (insert)

---

### B. Session Heartbeat (Every 30 seconds)

**When**: Background interval fires
**Function**: `heartbeat_session()`
**Data Updated**:

| Field | Value | Purpose |
|-------|-------|---------|
| `current_page` | location.pathname | Track page changes |
| `last_seen` | NOW() | Keep session alive |

**Table Updated**: `arcade_sessions`

---

### C. Page Navigation Events

**When**: User navigates to new page
**Data Captured**:

| Field | Type | Purpose |
|-------|------|---------|
| `page` | TEXT | New page path |
| `title` | TEXT | Page title |
| `referrer` | TEXT | Previous page |
| `source` | TEXT | Traffic source |
| `created_at` | TIMESTAMPTZ | Navigation time |

**Table Written**: `arcade_page_views`

---

### D. Game Session Start

**When**: Player clicks Play button → game begins
**Function**: `startGameSession()`
**Data Captured**:

| Field | Type | Source |
|-------|------|--------|
| `game_id` | TEXT | Hard-coded in each game (e.g., 'depths_of_ashenveil') |
| `started_at` | TIMESTAMPTZ | NOW() |

**Table Written**: `arcade_game_sessions`
**Returns**: Game session ID → stored in `window.AGEE_CURRENT_GAME_SESSION_ID`

---

### E. Game Events (During Play)

**When**: Any tracked game action
**Examples**: floor_reached, boss_defeated, chest_opened, player_died, etc.
**Function**: `trackEvent(eventType, eventData)`
**Data Captured**:

| Field | Type | Purpose |
|-------|------|---------|
| `event_type` | TEXT | 'floor_reached', 'fish_caught', etc. |
| `event_data` | JSONB | Custom fields per event (varies by game) |
| `game_id` | TEXT | Which game fired the event |
| `page` | TEXT | Current page when event fired |
| `created_at` | TIMESTAMPTZ | Event timestamp |

**Table Written**: `arcade_events`

**Event Data Examples**:

```javascript
// Depths of Ashenveil
trackEvent('floor_reached', { floor: 5 })
trackEvent('boss_defeated', { floor: 5 })
trackEvent('upgrade_selected', { upgrade_id: 'damage_boost' })

// Spear Fisher
trackEvent('fish_caught', { fish: 'Tuna', points: 100, catches: 5 })
trackEvent('round_reached', { reached_round: 3, next_goal: 500 })

// Blacktide Bastion
trackEvent('ship_sunk', { ship: 'Galleon', points: 250 })
trackEvent('wave_completed', { wave: 5, ships_sunk: 12 })

// All games
trackEvent('game_started')
trackEvent('game_loaded')
trackEvent('player_died', { floor: 5, level: 3 })
```

---

### F. Game Session End

**When**: Player exits game (death, quit, timeout, completion)
**Function**: `endGameSession(stats)`
**Data Captured**:

| Field | Type | Source | Purpose |
|-------|------|--------|---------|
| `ended_at` | TIMESTAMPTZ | NOW() | When game ended |
| `duration_seconds` | INT | Calculated | How long they played |
| `max_floor` | INT | Game | Furthest progression |
| `max_level` | INT | Game | Highest level/score |
| `deaths` | INT | Game | Death count |
| `bosses_defeated` | INT | Game | Boss kills |
| `chests_opened` | INT | Game | Loot chests opened |
| `enemies_killed` | INT | Game | Enemy kills |
| `end_reason` | TEXT | Game | death/quit/time_up/fort_destroyed/wave_clear/unknown |

**Tables Written/Updated**:
- `arcade_game_sessions` (update)
- `arcade_visitors` (update via trigger)

---

## 📁 PART 2: COMPUTED/DERIVED DATA

### A. Visitor-Level Aggregations (Updated on game session end)

**Table**: `arcade_visitors`

| Field | Computed How | Purpose |
|-------|--------------|---------|
| `visit_count` | Incremented on each new session | How many times person visited |
| `session_count` | Incremented when game session ends | How many games they played |
| `total_play_time_seconds` | SUM of all game durations | Total time spent in games |
| `primary_source` | Set on first visit | Where they came from initially |
| `primary_referrer` | Set on first visit | Full referrer URL |
| `first_visit` | NOW() on first session | When they first arrived |
| `last_visit` | Updated each session | Most recent activity |

---

### B. Views (Pre-computed Analytics)

#### `vw_daily_visitors`
```
Columns: visit_date, new_visitors, returning_visitors, total_unique_visitors, total_visits
Purpose: New vs returning breakdown by day
Updated: Real-time (reads from arcade_visitors)
```

#### `vw_sessions_by_source`
```
Columns: source, session_count, unique_visitors, avg_session_duration_seconds
Purpose: Traffic source analysis
Updated: Real-time (reads from arcade_sessions)
```

#### `vw_game_stats`
```
Columns: game_id, total_plays, unique_players, avg_duration_seconds, avg_max_floor, 
         avg_enemies_killed, deaths_count, quit_count, timeout_count
Purpose: Game performance metrics
Updated: Real-time (reads from arcade_game_sessions)
```

#### `vw_event_frequency`
```
Columns: event_type, event_count, unique_visitors, games_involved, last_occurrence
Purpose: Event frequency analysis
Updated: Real-time (reads from arcade_events)
```

#### `vw_visitor_retention_7d`
```
Columns: visitor_id, first_visit, last_visit, visit_count, session_count, 
         total_play_time_seconds, retention_status
Purpose: Active visitor tracking (last 7 days)
Updated: Real-time (reads from arcade_visitors)
```

---

### C. Reporting Functions (On-Demand Calculations)

| Function | Returns | Purpose |
|----------|---------|---------|
| `get_total_unique_visitors()` | BIGINT | All-time unique visitor count |
| `get_visitor_breakdown(days)` | TABLE | New vs returning for last N days |
| `get_top_games(limit)` | TABLE | Top games by plays, players, completion rate |
| `get_source_engagement()` | TABLE | Engagement metrics by traffic source |
| `get_retention_status()` | TABLE | Active users (today/week/month/inactive) |

---

## 🔐 PART 3: SECURITY & ACCESS CONTROL

### Row Level Security (RLS) Enabled On All Tables

| Table | Anonymous | Authenticated |
|-------|-----------|---------------|
| `arcade_visitors` | INSERT ✅ | SELECT ✅ |
| `arcade_sessions` | INSERT ✅, UPDATE heartbeat ✅ | SELECT ✅, UPDATE ✅ |
| `arcade_page_views` | INSERT ✅ | SELECT ✅ |
| `arcade_game_sessions` | INSERT ✅, UPDATE end session ✅ | SELECT ✅, UPDATE ✅ |
| `arcade_events` | INSERT ✅ | SELECT ✅ |

**Policies Created**:
- `anon_insert_visitors`, `anon_insert_sessions`, `anon_insert_page_views`, `anon_insert_game_sessions`, `anon_insert_events` — Allow public to write
- `anon_update_sessions`, `anon_update_game_sessions` — Allow heartbeat + session end updates
- `authenticated_read_*` — Allow admin dashboard to read all data

---

## ⚙️ PART 4: AUTOMATIC PROCESSING

### Trigger: `trig_game_session_ended`

**Fires**: When `arcade_game_sessions.ended_at` changes from NULL → timestamp

**Action**: Calls `update_visitor_stats()`

**Effect**:
```sql
UPDATE arcade_visitors
SET
  session_count = session_count + 1,
  total_play_time_seconds = total_play_time_seconds + p_duration_seconds,
  last_visit = NOW()
WHERE visitor_id = p_visitor_id;
```

**Purpose**: Auto-aggregate visitor stats without client request

---

## 📊 PART 5: FULL DATA PIPELINE

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT SIDE (analytics.js)                                          │
└─────────────────────────────────────────────────────────────────────┘

Page Load
  ↓
analytics.js initializes
  ↓ (fires immediately)
upsert_session(visitor_id, session_id, referrer, source, ...)
  ↓
Heartbeat Interval (every 30s)
  ↓ (while user active)
heartbeat_session(session_id, current_page)
  ↓
User Navigates
  ↓ (on page change)
trackPageView()
  ↓
User Plays Game
  ↓ (clicks play button)
startGameSession(game_id)
  ↓
Game Events (during play)
  ↓ (many times)
trackEvent(event_type, event_data)
  ↓
Game Ends
  ↓ (death/quit/timeout)
endGameSession(stats)

┌─────────────────────────────────────────────────────────────────────┐
│ DATABASE SIDE (Supabase)                                            │
└─────────────────────────────────────────────────────────────────────┘

upsert_session()
  ├─ INSERT/UPDATE arcade_visitors
  └─ INSERT arcade_sessions
     └─ INSERT arcade_page_views

heartbeat_session()
  └─ UPDATE arcade_sessions
     └─ last_seen, current_page

trackEvent()
  └─ INSERT arcade_events
     └─ event_type, event_data, game_id, ...

trackPageView()
  └─ INSERT arcade_page_views
     └─ page, title, referrer, ...

startGameSession()
  └─ INSERT arcade_game_sessions
     └─ RETURN game_session_id

endGameSession()
  ├─ UPDATE arcade_game_sessions
  │  └─ ended_at, duration_seconds, max_floor, ...
  ├─ UPDATE arcade_visitors
  │  └─ session_count, total_play_time_seconds
  └─ [TRIGGER trig_game_session_ended]
     └─ (redundant with endGameSession, but catches edge cases)

VIEWS (read-only, computed real-time)
  ├─ vw_daily_visitors
  ├─ vw_sessions_by_source
  ├─ vw_game_stats
  ├─ vw_event_frequency
  └─ vw_visitor_retention_7d

REPORTING FUNCTIONS (called on-demand)
  ├─ get_total_unique_visitors()
  ├─ get_visitor_breakdown(days)
  ├─ get_top_games(limit)
  ├─ get_source_engagement()
  └─ get_retention_status()
```

---

## 📋 PART 6: DATA INVENTORY BY TABLE

### `arcade_visitors` (1 row per unique person)

**Writes**: 
- Initial insert on first session
- Visit count increment on each new session
- Last visit, play time updates on game session end

**Frequency**: 
- Insert: Once per unique visitor
- Update: Multiple times per visitor (on each session/game)

**Retention**: Permanent (never deleted)

**Size Estimate**: ~1-2KB per visitor (9 fields)

---

### `arcade_sessions` (1 row per ~30min period)

**Writes**: 
- Insert on page load
- Update on heartbeat (every 30s)
- Update on current_page change

**Frequency**: 
- Insert: Once per session
- Update: ~120 times per session (every 30s heartbeat)

**Retention**: Permanent

**Size Estimate**: ~500B per session (14 fields)

---

### `arcade_page_views` (1 row per page navigation)

**Writes**: 
- Insert on page load
- Insert on page change (if tracked)

**Frequency**: 
- Insert: 1-5 times per session

**Retention**: Permanent

**Size Estimate**: ~300B per view (8 fields)

---

### `arcade_game_sessions` (1 row per game play)

**Writes**: 
- Insert when game starts
- Update when game ends (9 fields)

**Frequency**: 
- Insert: Once per game played
- Update: Once when game ends

**Retention**: Permanent

**Size Estimate**: ~1KB per game session (12 fields)

---

### `arcade_events` (1 row per event)

**Writes**: 
- Insert for every tracked event

**Frequency**: 
- Insert: 5-50+ times per game (varies by game)

**Retention**: Permanent

**Size Estimate**: ~500B per event (JSONB varies)

---

## 🧮 PART 7: DATA VOLUME ESTIMATES

### Monthly Volume (Assumption: 100 visitors, 2 plays each)

| Table | Rows/Month | Size (approx) |
|-------|-----------|---------------|
| arcade_visitors | 100 | 0.2 MB |
| arcade_sessions | 500 | 0.25 MB |
| arcade_page_views | 2,000 | 0.6 MB |
| arcade_game_sessions | 200 | 0.2 MB |
| arcade_events | 10,000 | 5 MB |
| **TOTAL** | **12,800** | **~6.25 MB** |

### Yearly Volume

| Table | Rows/Year | Size (approx) |
|-------|----------|---------------|
| arcade_visitors | 1,200 | 2.4 MB |
| arcade_sessions | 6,000 | 3 MB |
| arcade_page_views | 24,000 | 7.2 MB |
| arcade_game_sessions | 2,400 | 2.4 MB |
| arcade_events | 120,000 | 60 MB |
| **TOTAL** | **153,600** | **~75 MB** |

**Note**: Supabase free tier includes 500MB storage. Scales as users grow.

---

## ✅ PART 8: DATA COMPLETENESS CHECKLIST

### Required Fields (Always Populated)

- [x] `visitor_id` — Always set from localStorage
- [x] `session_id` — Always generated at page load
- [x] `landing_page` — Always captured
- [x] `game_id` — Always set by game on start
- [x] `event_type` — Always required for events
- [x] `is_returning` — Computed from visitor data
- [x] `created_at` / `started_at` — Always DEFAULT NOW()

### Optional Fields (May Be NULL)

- [ ] `referrer` — Empty if no referrer
- [ ] `source` — Defaults to 'direct'
- [ ] `user_agent` — Could be truncated
- [ ] `language` — May be generic
- [ ] `platform` — May be generic
- [ ] `screen_width` / `screen_height` — Could fail (rare)
- [ ] `event_data` — Defaults to `{}`
- [ ] `game_session_id` — NULL for non-game events
- [ ] `ended_at` — NULL while game active
- [ ] `end_reason` — NULL if game still running

---

## 🔍 PART 9: WHAT'S NOT TRACKED

❌ Mouse position / cursor movement
❌ Individual keystroke data (only activity detection)
❌ Audio preferences / sound toggle state
❌ Individual minion/enemy deaths (enemy_killed = sum only)
❌ Failed login attempts (auth is separate system)
❌ IP address / geolocation
❌ Precise timing of individual moves (only high-level events)
❌ Frame rate / performance metrics
❌ Payment/purchase data (not applicable)
❌ User demographics (optional signup only)

---

## 🎯 PART 10: SUMMARY TABLE

| Aspect | Details |
|--------|---------|
| **Tables** | 5 (visitors, sessions, page_views, game_sessions, events) |
| **Views** | 5 (daily_visitors, sessions_by_source, game_stats, event_frequency, retention) |
| **Functions** | 5 (upsert, heartbeat, start_game, end_game, 5 reporting functions) |
| **Triggers** | 1 (auto-update visitor stats on game end) |
| **Indexes** | 20+ (optimized for common queries) |
| **RLS Policies** | 10 (anon write, authenticated read) |
| **Data Points Collected** | ~50 fields across all tables |
| **Events Per Game Play** | 5-50+ (varies by game) |
| **Data Lifetime** | Permanent (no expiration) |
| **Privacy** | No PII collected (no email, no names) |

---

