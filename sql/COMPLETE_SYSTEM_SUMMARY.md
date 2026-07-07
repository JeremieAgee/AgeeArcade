# 🎮 Agee Arcade — Complete Data Tracking System Summary

## Two Separate Systems

Your arcade has **TWO completely independent data tracking systems**:

1. **Analytics** — Behavioral data (what players do)
2. **Leaderboards** — High scores (who's winning)

---

## 📊 System Comparison

| Aspect | Analytics | Leaderboards |
|--------|-----------|--------------|
| **Purpose** | Track all user behavior & events | Track top high scores |
| **Tables** | 5 tables (visitor, sessions, events, etc.) | 4 tables (1 per game) |
| **Data per session** | 20-50+ entries | 0 or 1 submission |
| **Automatic** | Yes (JavaScript fires events) | No (manual submission) |
| **Contains player name** | No (anonymous) | Yes (nickname required) |
| **Data lifetime** | Permanent | Permanent |
| **Monthly size (100 users)** | ~6 MB | ~50 KB |
| **Primary metric** | Visits, play time, events | Score, rank |

---

## 🗂️ All 9 Database Tables

### Analytics (5 Tables)
```
arcade_visitors
├─ visitor_id, visit_count, session_count, total_play_time_seconds
├─ primary_source, primary_referrer, first_visit, last_visit

arcade_sessions
├─ session_id, visitor_id, landing_page, current_page
├─ user_agent, language, platform, screen_width/height
├─ is_returning, created_at, last_seen

arcade_page_views
├─ session_id, visitor_id, page, title
├─ referrer, source, created_at

arcade_game_sessions
├─ session_id, visitor_id, game_id
├─ started_at, ended_at, duration_seconds
├─ max_floor, max_level, deaths, bosses_defeated, chests_opened, enemies_killed, end_reason

arcade_events
├─ session_id, visitor_id, game_session_id, game_id
├─ event_type, event_data (JSONB), page, created_at
```

### Leaderboards (4 Tables)
```
depths_leaderboard
├─ player_id, nickname, level, floor, created_at

maze_runner_runs
├─ user_id, nickname, score, floors, time_ms, created_at

blacktide_bastion_leaderboard
├─ player_id, nickname, score, wave, created_at

spear_fisher_leaderboard
├─ player_id, nickname, score, created_at
```

---

## 📈 Data Collection Flow

```
USER VISITS ARCADE
│
├─ Analytics captures:
│  ├─ New visitor or returning? (visit_count)
│  ├─ Where did they come from? (source, referrer)
│  ├─ What device? (screen size, OS, browser)
│  ├─ Which pages visited? (page_views)
│  └─ Session timestamp, language, platform
│
└─ Every 30 seconds: heartbeat updates session

USER PLAYS GAME
│
├─ Analytics captures:
│  ├─ Game start (arcade_game_sessions.started_at)
│  ├─ All events during play (floor_reached, boss_defeated, etc.)
│  └─ Game end stats (duration, max_floor, end_reason)
│
└─ POSSIBLY leaderboards:
   └─ If score is high enough → Submit nickname + score to leaderboard table

GAME SESSION ENDS
│
├─ Analytics:
│  ├─ Update arcade_game_sessions with final stats
│  └─ Trigger auto-updates arcade_visitors (session_count++, playtime += duration)
│
└─ Leaderboards:
   └─ If high enough score → Insert row into game-specific leaderboard
```

---

## 🔍 What Data Points Are Tracked

### ANALYTICS Data Points (~50 fields total)

**Visitor Level**:
- visitor_id, first_visit, last_visit, visit_count, session_count, total_play_time_seconds
- primary_source, primary_referrer

**Session Level**:
- session_id, landing_page, current_page, referrer, source
- user_agent, language, platform, screen_width, screen_height, is_returning
- created_at, last_seen

**Page View Level**:
- page, title, created_at

**Game Session Level**:
- game_id, started_at, ended_at, duration_seconds
- max_floor, max_level, deaths, bosses_defeated, chests_opened, enemies_killed
- end_reason (death/quit/time_up/fort_destroyed/wave_clear)

**Event Level**:
- event_type (50+ types like floor_reached, fish_caught, etc.)
- event_data (custom JSONB per event)
- page, created_at

### LEADERBOARD Data Points (~6 fields per game)

- player_id, nickname, score/level/wave/floor, created_at

---

## 🔧 All SQL Files Available

### Creation
- `COMPLETE_SQL_FINAL.sql` — All tables, RLS, functions, and views (copy & paste)

### Reset
- `RESET_SIMPLE.sql` — Quick reset (keep users, delete data)
- `RESET_ALL_DATA.sql` — Reset analytics with options
- `RESET_INDIVIDUAL_STATEMENTS.sql` — Step-by-step reset
- `RESET_LEADERBOARDS.sql` — Reset leaderboard scores

### Documentation
- `DATA_TRACKING_REVIEW.md` — Complete data inventory
- `LEADERBOARD_SYSTEM.md` — Leaderboard details
- `RESET_GUIDE.md` — How to reset safely

---

## ⚡ Quick Setup

### Step 1: Create Everything
Copy entire `COMPLETE_SQL_FINAL.sql` → Paste into Supabase SQL Editor → Run
(Includes analytics + leaderboard tables, RLS, reporting functions, views, stored procedures)

### Step 2: Update Client Code
Replace `js/analytics.js` with `ANALYTICS_JS_UPDATED.js`

### Step 3: Done!
Start playing games, data will be collected automatically.

---

## 🎯 What You Can Track

### With Analytics
- ✅ Who visits (unique visitors)
- ✅ When they visit (daily/weekly/monthly active)
- ✅ Where they come from (traffic source)
- ✅ How long they play (total time, session duration)
- ✅ Which games they play (play count per game)
- ✅ How far they get (max floor, max level)
- ✅ How they end (death vs quit vs timeout)
- ✅ Return visitor rate

### With Leaderboards
- ✅ Top 100 players per game
- ✅ Player ranks by score
- ✅ Personal bests
- ✅ Progression (highest floor/wave reached)
- ✅ When scores were achieved

### NOT Tracked
- ❌ Real names (no PII)
- ❌ Email addresses
- ❌ Location/IP address
- ❌ Individual keystroke data
- ❌ Mouse movement
- ❌ Payment/purchase data

---

## 📋 Maintenance & Reset

### Reset Everything (Keep Users)
```sql
-- In RESET_SIMPLE.sql
DELETE FROM arcade_events;
DELETE FROM arcade_game_sessions;
DELETE FROM arcade_page_views;
DELETE FROM arcade_sessions;
UPDATE arcade_visitors SET visit_count=1, session_count=0, total_play_time_seconds=0;
```

### Reset Leaderboards Only
```sql
DELETE FROM depths_leaderboard;
DELETE FROM maze_runner_runs;
DELETE FROM blacktide_bastion_leaderboard;
DELETE FROM spear_fisher_leaderboard;
```

### Reset Specific Game Analytics
```sql
DELETE FROM arcade_events WHERE game_id = 'depths_of_ashenveil';
DELETE FROM arcade_game_sessions WHERE game_id = 'depths_of_ashenveil';
```

---

## 📊 Reporting Available

### Analytics Views (Pre-built)
- `vw_daily_visitors` — New vs returning by day
- `vw_sessions_by_source` — Traffic breakdown
- `vw_game_stats` — Game performance
- `vw_event_frequency` — Event popularity
- `vw_visitor_retention_7d` — Active users last 7 days

### Analytics Functions (Call on-demand)
- `get_total_unique_visitors()` — All-time count
- `get_visitor_breakdown(days)` — New vs returning
- `get_top_games(limit)` — Top games by plays
- `get_source_engagement()` — Engagement by source
- `get_retention_status()` — Daily/weekly/monthly active

### Leaderboard Queries
- Direct SQL queries on each leaderboard table
- Ranked by score, filtered by game

---

## 🔐 Security

### Row Level Security (RLS)
- Anonymous users can INSERT analytics & leaderboard data
- Authenticated users can SELECT (read) all data
- Admin dashboard accesses all data

### No PII Collected
- Analytics: No email, no real names, no IP address
- Leaderboards: Player nickname only (self-chosen, 10-16 chars)

### Sync Strategy
- Leaderboard sync keys prevent duplicate submissions
- Fire-and-forget analytics (async, no blocking)

---

## 💾 Storage Estimates

### Monthly (100 active users, 2 games each)

| System | Rows | Size |
|--------|------|------|
| Analytics Events | 10,000 | 5 MB |
| Analytics Sessions | 500 | 0.25 MB |
| Analytics Game Sessions | 200 | 0.2 MB |
| Leaderboard Entries | ~400 | 50 KB |
| **TOTAL** | ~11,000 | **~5.5 MB** |

**Supabase Free Tier**: 500 MB (plenty of room)

### Yearly
- ~66 MB for analytics
- ~600 KB for leaderboards
- Total: **~67 MB/year** (well under Supabase limits)

---

## 🚀 Next Steps

1. ✅ Create all tables, RLS, and functions (1 SQL file)
2. ✅ Update analytics.js (copy from ANALYTICS_JS_UPDATED.js)
3. ✅ Test: Visit site + play game
4. ✅ Verify: Check Supabase dashboard for data
5. 📊 Build reports/dashboard using the views and functions
6. 🎯 Monitor player behavior and leaderboards

---

## 📞 Reference

**All files in `sql/` directory**:
- `COMPLETE_SQL_FINAL.sql` — All tables, RLS, functions & views
- `RESET_SIMPLE.sql` — Quick reset
- `RESET_LEADERBOARDS.sql` — Reset scores
- `DATA_TRACKING_REVIEW.md` — Complete analytics guide
- `LEADERBOARD_SYSTEM.md` — Leaderboard details
- `RESET_GUIDE.md` — Safe reset instructions
- `COMPLETE_SYSTEM_SUMMARY.md` — This file

---

