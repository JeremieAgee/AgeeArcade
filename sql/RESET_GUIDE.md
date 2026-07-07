# 🔄 Complete Analytics Data Reset Guide

## Quick Decision Tree

```
Do you want to keep user records (visitor IDs)?
│
├─ YES → Run RESET_ALL_DATA.sql (OPTION 1)
│        Deletes sessions/events/games, but keeps users & recognizes returners
│
└─ NO → Run RESET_ALL_DATA.sql (OPTION 2)
         Complete wipe - everything deleted, starts from scratch
```

---

## 📋 Three Reset Scripts Available

### 1. **RESET_ALL_DATA.sql** (Recommended)
**Purpose**: One-shot reset with both options included

**What it does**:
- ✅ Option 1: Keeps `arcade_visitors` (users), resets all their stats
- ✅ Option 2: Commented out - complete wipe if needed
- ✅ Resets sequence counters (ID generators)
- ✅ Includes verification queries

**Use when**: You want a simple, safe reset

---

### 2. **RESET_INDIVIDUAL_STATEMENTS.sql**
**Purpose**: Run each statement separately to see what's happening

**What it does**:
- ✅ Step-by-step individual DELETE statements
- ✅ Verification queries after each step
- ✅ Includes game-specific resets
- ✅ Includes time-based resets (older than X days)
- ✅ Includes export options (backup before delete)

**Use when**: You want control and visibility into each step

---

## 🎯 Reset Scenarios

### Scenario 1: Keep Users, Reset All Data (MOST COMMON)

**Goal**: Start fresh with analytics but keep tracking who your users are

**Run this**:
```sql
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
```

**Result**:
| Table | Before | After |
|-------|--------|-------|
| arcade_visitors | 500 users | 500 users ✅ |
| arcade_sessions | 5,000 rows | 0 rows |
| arcade_page_views | 20,000 rows | 0 rows |
| arcade_game_sessions | 2,000 rows | 0 rows |
| arcade_events | 100,000 rows | 0 rows |

**Benefit**: Next visitor with same UUID is recognized as returning user

---

### Scenario 2: Complete Wipe (Start Completely Fresh)

**Goal**: Delete everything, like a brand new install

**Run this**:
```sql
DELETE FROM arcade_events;
DELETE FROM arcade_game_sessions;
DELETE FROM arcade_page_views;
DELETE FROM arcade_sessions;
DELETE FROM arcade_visitors;

ALTER SEQUENCE arcade_page_views_id_seq RESTART WITH 1;
ALTER SEQUENCE arcade_events_id_seq RESTART WITH 1;
```

**Result**: All tables empty, database like first install

**Benefit**: Completely clean slate, no history

---

### Scenario 3: Reset Specific Game Only

**Goal**: Delete data for one game, keep others

**Run this**:
```sql
-- Delete only Depths of Ashenveil
DELETE FROM arcade_events WHERE game_id = 'depths_of_ashenveil';
DELETE FROM arcade_game_sessions WHERE game_id = 'depths_of_ashenveil';

-- (repeat for other games as needed)
```

**Result**: Only Depths data deleted, other games kept

---

### Scenario 4: Archive Old Data (Keep Recent, Delete Old)

**Goal**: Delete data older than 30 days, keep recent

**Run this**:
```sql
DELETE FROM arcade_events WHERE created_at < NOW() - INTERVAL '30 days';
DELETE FROM arcade_game_sessions WHERE started_at < NOW() - INTERVAL '30 days';
DELETE FROM arcade_page_views WHERE created_at < NOW() - INTERVAL '30 days';
DELETE FROM arcade_sessions WHERE created_at < NOW() - INTERVAL '30 days';
```

**Result**: Only recent 30 days kept, older data removed

---

## ⚠️ Before You Reset

### Backup Your Data

Option A: Export as CSV (in Supabase SQL Editor)
```sql
SELECT * FROM arcade_visitors ORDER BY last_visit DESC;
SELECT * FROM arcade_game_sessions ORDER BY started_at DESC;
SELECT * FROM arcade_events ORDER BY created_at DESC;
```
Then click **Download** button

Option B: Export entire database
1. Supabase Dashboard → Database → Backups
2. Create manual backup
3. Then run reset

---

## 🔍 Verification Queries

### Check Status After Reset

```sql
-- See how many rows remain in each table
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
```

**Expected output** (if keeping users):
```
table_name              | row_count
------------------------+----------
arcade_visitors         | 500       ← Users kept!
arcade_sessions         | 0
arcade_page_views       | 0
arcade_game_sessions    | 0
arcade_events           | 0
```

---

### Check User Stats

```sql
-- See how many users you kept
SELECT COUNT(*) as total_unique_users FROM arcade_visitors;

-- See visitor breakdown
SELECT
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE visit_count = 1) as new_users,
  COUNT(*) FILTER (WHERE visit_count > 1) as returning_users,
  ROUND(AVG(visit_count), 1) as avg_visits_per_user,
  ROUND(AVG(session_count), 1) as avg_sessions_per_user
FROM arcade_visitors;
```

---

## 📊 What Gets Reset

### Deleted Completely

| Table | What's Deleted | Reason |
|-------|---|---|
| arcade_events | ALL rows | Event history cleared |
| arcade_game_sessions | ALL rows | Game play history cleared |
| arcade_page_views | ALL rows | Page navigation cleared |
| arcade_sessions | ALL rows | Session history cleared |

### Updated, Not Deleted

| Table/Field | What Happens | Value After Reset |
|---|---|---|
| arcade_visitors (kept) | Stats reset | visit_count = 1, session_count = 0, total_play_time_seconds = 0 |
| visitor_id | UNCHANGED | Same UUID |
| first_visit | UNCHANGED | Original first visit time |
| primary_source | UNCHANGED | Original source |
| primary_referrer | UNCHANGED | Original referrer |
| last_visit | UPDATED | NOW() (current time) |

---

## ⏮️ What Does NOT Get Reset

- ✅ User IDs (visitor_id UUIDs preserved)
- ✅ First visit timestamps
- ✅ Primary source/referrer
- ✅ Database structure (tables, indexes, functions stay)
- ✅ Views (vw_daily_visitors, vw_game_stats, etc.)
- ✅ Stored procedures
- ✅ RLS policies

---

## 🚀 Step-by-Step Reset (RECOMMENDED)

### Step 1: Backup Current Data
```sql
-- Run these in Supabase SQL Editor to download as CSV:
SELECT * FROM arcade_events ORDER BY created_at DESC;
SELECT * FROM arcade_game_sessions ORDER BY started_at DESC;
SELECT * FROM arcade_sessions ORDER BY created_at DESC;
SELECT * FROM arcade_visitors ORDER BY last_visit DESC;
```
Click **Download** for each query

### Step 2: Run Reset Script
Open `RESET_ALL_DATA.sql`, copy entire content, paste into Supabase SQL Editor, click **Run**

### Step 3: Verify
```sql
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
```

Expected:
- arcade_visitors: X rows (your user count)
- All others: 0 rows

### Step 4: Done!
Next visitor to your site will create fresh session & events

---

## 🛡️ Safety Checks

### Before Running Reset

- [ ] I have backed up my data
- [ ] I understand what will be deleted
- [ ] I know which scenario I'm running (keep users vs complete wipe)
- [ ] I've tested on a non-production database first (if possible)

### After Running Reset

- [ ] Verified correct number of users kept (if applicable)
- [ ] Confirmed all tables have 0 rows (except arcade_visitors)
- [ ] Tested: Can visit site and create new session without errors

---

## 🔧 Troubleshooting

### "Foreign Key Constraint Violation"

**Problem**: Delete failed because of foreign key references

**Solution**: Delete in correct order (already done in scripts):
1. DELETE from arcade_events first
2. DELETE from arcade_game_sessions
3. DELETE from arcade_page_views
4. DELETE from arcade_sessions
5. Then UPDATE arcade_visitors

### "Sequence Not Found"

**Problem**: Alter sequence fails

**Solution**: Check sequence names:
```sql
SELECT sequence_name FROM information_schema.sequences 
WHERE sequence_schema='public';
```

Use exact names in ALTER SEQUENCE commands

### "No Data Removed"

**Problem**: Ran DELETE but no rows affected

**Solution**: Verify table has data first:
```sql
SELECT COUNT(*) FROM arcade_events;
```

If returns 0, table already empty

---

## 📝 Sample Reset Log

```
Starting reset at 2026-06-22 14:30:00

Step 1: Backup created (5 CSV files exported)
Step 2: Deleting arcade_events... ✅ 127,000 rows deleted
Step 3: Deleting arcade_game_sessions... ✅ 2,100 rows deleted
Step 4: Deleting arcade_page_views... ✅ 18,500 rows deleted
Step 5: Deleting arcade_sessions... ✅ 4,200 rows deleted
Step 6: Resetting arcade_visitors stats... ✅ 487 users reset
Step 7: Resetting sequences... ✅ 2 sequences reset
Step 8: Verification... ✅ All correct

FINAL STATE:
- arcade_visitors: 487 rows (KEPT)
- arcade_sessions: 0 rows
- arcade_page_views: 0 rows
- arcade_game_sessions: 0 rows
- arcade_events: 0 rows

Reset complete! ✅ Ready for fresh data collection.
```

---

