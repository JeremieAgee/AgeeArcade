# 📑 Analytics & Tracking System — Complete Index

## All Documentation Files

### 🎯 Start Here
- **00_START_HERE.md** — 5-minute quick start guide
- **COMPLETE_SYSTEM_SUMMARY.md** — Overview of all three systems

---

## 📊 System Documentation

### Analytics System (5 Tables)
- **DATA_TRACKING_REVIEW.md** — Complete data inventory & pipeline
- **ANALYTICS_QUERIES.sql** — 50+ pre-built queries for analysis

### Leaderboard System (4 Tables)
- **LEADERBOARD_SYSTEM.md** — High scores, ranking, submission

### Game Tracking System (localStorage + Supabase)
- **GAME_TRACKING.md** — Saves, meta, online/offline sync

---

## 🛠️ SQL Creation & Setup

### Create Everything
- **COMPLETE_SQL_FINAL.sql** — All tables (analytics, leaderboards, Depths saves), RLS, functions, triggers, and views in one script

### Updated Client Code
- **ANALYTICS_JS_UPDATED.js** — Replace js/analytics.js with this

---

## 🔄 Reset & Maintenance

### Analytics Reset
- **RESET_SIMPLE.sql** — ⭐ Quick reset (keep users, delete data)
- **RESET_ALL_DATA.sql** — Reset with options (keep or delete users)
- **RESET_INDIVIDUAL_STATEMENTS.sql** — Step-by-step with verification

### Leaderboard Reset
- **RESET_LEADERBOARDS.sql** — Reset high scores

### Reset Guide
- **RESET_GUIDE.md** — Safe reset instructions, troubleshooting, scenarios

---

## 📋 File Categories

### Quick Reference (Read These First)
| File | Purpose | Read Time |
|------|---------|-----------|
| 00_START_HERE.md | 5-min setup | 3 min |
| COMPLETE_SYSTEM_SUMMARY.md | All systems overview | 5 min |
| RESET_GUIDE.md | How to safely reset | 5 min |

### Deep Dives (Understand the System)
| File | Purpose | Read Time |
|------|---------|-----------|
| DATA_TRACKING_REVIEW.md | Complete data inventory | 15 min |
| LEADERBOARD_SYSTEM.md | Leaderboard mechanics | 10 min |
| GAME_TRACKING.md | Game saves & sync | 10 min |

### SQL Files (Copy & Paste)
| File | Purpose | Rows Affected |
|------|---------|--------------|
| COMPLETE_SQL_FINAL.sql | Create everything (tables, RLS, functions, views) | 0 (schema only) |
| RESET_SIMPLE.sql | Quick reset | All |
| RESET_ALL_DATA.sql | Reset with options | All |
| RESET_INDIVIDUAL_STATEMENTS.sql | Step-by-step reset | All |
| RESET_LEADERBOARDS.sql | Reset scores | Leaderboards only |
| ANALYTICS_QUERIES.sql | Run queries | 0 (read only) |

---

## 🚀 Setup Checklist

- [ ] Read 00_START_HERE.md
- [ ] Run COMPLETE_SQL_FINAL.sql (Supabase)
- [ ] Replace js/analytics.js with ANALYTICS_JS_UPDATED.js
- [ ] Test: Visit site + play game
- [ ] Verify data in Supabase dashboard

---

## 📊 What's Being Tracked

### Three Systems Working Together

```
┌─────────────────────────────────────────────────────────┐
│ ANALYTICS (Automatic, Comprehensive)                    │
│ - All user behavior, events, progression                │
│ - 5 Supabase tables                                     │
│ - Monthly: ~6 MB for 100 users                          │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ GAME SAVES (Manual, Checkpoint-Based)                   │
│ - Depths of Ashenveil: Full save system                 │
│ - Others: Leaderboard entries only                      │
│ - localStorage → Supabase sync                          │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ LEADERBOARDS (Manual, End-of-Session)                   │
│ - High scores only (top 10-100)                         │
│ - 4 Supabase tables                                     │
│ - Monthly: ~50 KB for 100 users                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🗂️ File Organization

```
sql/
├── 00_INDEX.md (this file)
├── 00_START_HERE.md
├── COMPLETE_SYSTEM_SUMMARY.md
│
├── COMPLETE_SQL_FINAL.sql
│
├── RESET_SIMPLE.sql
├── RESET_ALL_DATA.sql
├── RESET_INDIVIDUAL_STATEMENTS.sql
├── RESET_LEADERBOARDS.sql
├── RESET_GUIDE.md
│
├── ANALYTICS_QUERIES.sql
├── DATA_TRACKING_REVIEW.md
│
├── LEADERBOARD_SYSTEM.md
├── GAME_TRACKING.md
│
├── RESET_FILES_SUMMARY.md
│
└── ANALYTICS_JS_UPDATED.js (copy to js/analytics.js)
```

---

## 🎯 Common Tasks

### I want to...

#### Set up analytics
→ Read: 00_START_HERE.md
→ Run: COMPLETE_SQL_FINAL.sql
→ Update: js/analytics.js

#### Understand what data is collected
→ Read: DATA_TRACKING_REVIEW.md

#### Reset all data (keep users)
→ Run: RESET_SIMPLE.sql

#### Reset only leaderboards
→ Run: RESET_LEADERBOARDS.sql

#### Reset data older than 30 days
→ Run: RESET_INDIVIDUAL_STATEMENTS.sql (time-based section)

#### Query game statistics
→ Use: ANALYTICS_QUERIES.sql
→ Call: get_top_games(10), get_retention_status(), etc.

#### Understand game save system
→ Read: GAME_TRACKING.md

#### Understand leaderboards
→ Read: LEADERBOARD_SYSTEM.md

---

## 📞 Reference

### Database Tables (Total: 9)

**Analytics (5)**:
- arcade_visitors
- arcade_sessions
- arcade_page_views
- arcade_game_sessions
- arcade_events

**Leaderboards (4)**:
- depths_leaderboard
- maze_runner_runs
- blacktide_bastion_leaderboard
- spear_fisher_leaderboard

### Key Stored Procedures
- upsert_session()
- start_game_session()
- end_game_session()
- heartbeat_session()

### Key Views
- vw_daily_visitors
- vw_sessions_by_source
- vw_game_stats
- vw_event_frequency
- vw_visitor_retention_7d

### Key Functions
- get_total_unique_visitors()
- get_visitor_breakdown()
- get_top_games()
- get_source_engagement()
- get_retention_status()

---

## 💾 Storage Estimates

### Monthly (100 active users, 2 games each)
- Analytics events: 10,000 rows, 5 MB
- Analytics sessions: 500 rows, 0.25 MB
- Game saves: Variable
- Leaderboards: 400 rows, 50 KB
- **Total: ~5.5 MB/month**

### Yearly
- **~67 MB/year** (well under Supabase free tier limit of 500 MB)

---

## ✅ What's Included

- [x] 5 analytics tables
- [x] 4 leaderboard tables
- [x] 5 pre-built views
- [x] 5+ reporting functions
- [x] 50+ analytics queries
- [x] Complete RLS policies
- [x] Reset scripts (multiple options)
- [x] Game save system documentation
- [x] Leaderboard system documentation
- [x] Updated analytics.js
- [x] Setup guides
- [x] Troubleshooting guides

---

## 🆘 Troubleshooting

**Problem**: RLS policy error
→ Check: COMPLETE_SQL_FINAL.sql was run (includes RLS policies)

**Problem**: Function not found
→ Check: COMPLETE_SQL_FINAL.sql was run

**Problem**: No data appearing
→ Check: Browser console for errors in analytics.js
→ Check: Supabase URL and key are correct

**Problem**: Leaderboard entries showing twice
→ Check: Clear localStorage sync keys (see RESET_LEADERBOARDS.sql)

**Problem**: Game won't load saved progress
→ Check: GAME_TRACKING.md section on sync behavior

---

## 📝 Notes

- All SQL is PostgreSQL compatible (Supabase)
- All timestamps use TIMESTAMPTZ (timezone-aware)
- RLS enabled on all tables (anon can insert, authenticated can select)
- Fire-and-forget analytics (async, no blocking)
- Sync keys prevent duplicate leaderboard submissions
- Game saves auto-sync when online, fallback to localStorage offline

---

## 🎓 Learning Path

**New to the system?**
1. Read 00_START_HERE.md
2. Read COMPLETE_SYSTEM_SUMMARY.md
3. Run COMPLETE_SQL_FINAL.sql
4. Browse ANALYTICS_QUERIES.sql for examples
5. Read individual system docs as needed

**Need to reset?**
1. Read RESET_GUIDE.md
2. Choose a reset script
3. Run it in Supabase SQL Editor
4. Verify with one of the verification queries

**Want to understand everything?**
1. Read all system documentation (DATA_TRACKING_REVIEW.md, LEADERBOARD_SYSTEM.md, GAME_TRACKING.md)
2. Study the SQL files
3. Look at actual game code (js/systems/save.js, etc.)

---

**Everything you need to manage Agee Arcade analytics is in this directory.**

Questions? Check the relevant documentation file above.

