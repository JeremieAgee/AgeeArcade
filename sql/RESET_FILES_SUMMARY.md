# 📁 Analytics Reset SQL Files — Complete Summary

## 4 Reset Files Available

### 1. **RESET_SIMPLE.sql** ⭐ **START HERE**

**File size**: ~200 bytes  
**Complexity**: ⭐ (Simplest)  
**Time to run**: ~1 second

**What it does**:
- Deletes all sessions, page views, game sessions, events
- Resets visitor stats (keeps user IDs)
- Resets sequence counters
- Done in 5 SQL statements

**Best for**: Quick reset, you know what you're doing

**Copy & paste** the entire file into Supabase SQL Editor → Run

---

### 2. **RESET_ALL_DATA.sql** (Main Script)

**File size**: ~2 KB  
**Complexity**: ⭐⭐ (Clear)  
**Time to run**: ~1 second

**What it does**:
- **Option 1** (uncommented): Keep users, reset all data
- **Option 2** (commented): Complete wipe if needed
- Includes verification queries
- Includes reset guides
- All in one file

**Best for**: Safe reset with options, verification included

**Use when**: You want both options available in one script

---

### 3. **RESET_INDIVIDUAL_STATEMENTS.sql** (Step-by-Step)

**File size**: ~4 KB  
**Complexity**: ⭐⭐⭐ (Granular)  
**Time to run**: Run each one separately

**What it does**:
- 6 main reset steps (one statement each)
- Verification query after each step
- Bonus: Game-specific resets (delete only one game's data)
- Bonus: Time-based resets (delete data older than X days)
- Bonus: Export options (backup before delete)

**Best for**: You want to see results after each step

**Use when**: You want control and visibility

---

### 4. **RESET_GUIDE.md** (Documentation)

**File size**: ~10 KB  
**Complexity**: Reference  
**Time to read**: ~5 minutes

**What it covers**:
- Decision tree (which script to use)
- 4 reset scenarios with examples
- Before/after tables showing what changes
- Backup instructions
- Verification queries
- Troubleshooting
- Safety checklist

**Best for**: Understanding what will happen

**Use when**: You need to decide which option or troubleshoot

---

## 🎯 Quick Decision Matrix

| Your Goal | Use This File |
|-----------|---------------|
| Reset everything, keep users (MOST COMMON) | RESET_SIMPLE.sql |
| Reset everything, keep users with options | RESET_ALL_DATA.sql |
| Step-by-step with verification after each | RESET_INDIVIDUAL_STATEMENTS.sql |
| Just want to understand what happens | RESET_GUIDE.md |
| Reset only one game's data | RESET_INDIVIDUAL_STATEMENTS.sql (game-specific section) |
| Delete data older than 30 days | RESET_INDIVIDUAL_STATEMENTS.sql (time-based section) |
| Complete wipe (delete users too) | RESET_ALL_DATA.sql (Option 2) |

---

## 📊 What Each Script Deletes

| Data | RESET_SIMPLE | RESET_ALL_DATA | RESET_INDIVIDUAL |
|------|--------------|----------------|------------------|
| arcade_visitors | Reset stats only | Reset or Delete* | Delete/Reset option |
| arcade_sessions | Delete all | Delete all | Delete all + verify |
| arcade_page_views | Delete all | Delete all | Delete all + verify |
| arcade_game_sessions | Delete all | Delete all | Delete all + verify |
| arcade_events | Delete all | Delete all | Delete all + verify |
| Sequences | Reset | Reset | Reset |

*Option 2 in RESET_ALL_DATA deletes everything

---

## ⚡ Fastest Reset Path

**If you just want to reset right now:**

1. Open `RESET_SIMPLE.sql`
2. Copy entire content
3. Paste into Supabase SQL Editor
4. Click **Run**
5. Done! ✅

Takes ~10 seconds total.

---

## 🔍 Most Detailed Reset Path

**If you want to see exactly what's happening:**

1. Read `RESET_GUIDE.md` (choose your scenario)
2. Open `RESET_INDIVIDUAL_STATEMENTS.sql`
3. Run each statement one at a time
4. Read the "Verify:" query after each
5. See results before moving to next step

Takes ~2 minutes total.

---

## 📋 What Data Is Kept vs Deleted

### KEPT (Users Preserved)
```
✅ arcade_visitors.visitor_id (unique person identifier)
✅ arcade_visitors.first_visit (when they first arrived)
✅ arcade_visitors.primary_source (where they came from)
✅ arcade_visitors.primary_referrer (full referrer URL)
✅ Database structure (tables, indexes, functions)
✅ Views (vw_game_stats, etc.)
✅ Stored procedures
```

### DELETED (Data Cleared)
```
🗑️  arcade_sessions (all rows)
🗑️  arcade_page_views (all rows)
🗑️  arcade_game_sessions (all rows)
🗑️  arcade_events (all rows)
```

### RESET (Updated to Defaults)
```
⚙️ arcade_visitors.visit_count → 1
⚙️ arcade_visitors.session_count → 0
⚙️ arcade_visitors.total_play_time_seconds → 0
⚙️ arcade_visitors.last_visit → NOW()
⚙️ Sequence counters → 1
```

---

## 💾 File Sizes & Location

```
sql/
├── RESET_SIMPLE.sql                    (~200 bytes)
├── RESET_ALL_DATA.sql                  (~2 KB)
├── RESET_INDIVIDUAL_STATEMENTS.sql     (~4 KB)
├── RESET_GUIDE.md                      (~10 KB)
├── RESET_FILES_SUMMARY.md              (this file)
└── [other files...]
```

---

## ✅ Verification After Reset

**Run this after any reset** to confirm it worked:

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

**Expected output** (if keeping users):
```
table_name              | row_count
------------------------+----------
arcade_visitors         | 487       ← Your user count
arcade_sessions         | 0
arcade_page_views       | 0
arcade_game_sessions    | 0
arcade_events           | 0
```

---

## 🚨 Important Notes

1. **No backup = No recovery** — Delete the backup files first if you have them
2. **Test first** — Run on staging/test database if possible
3. **Users kept** — Returning visitors will still be recognized by their UUID
4. **Sequences reset** — New IDs start from 1 again
5. **Views/Functions** — All database objects stay, only data cleared

---

## 🆘 If Something Goes Wrong

**Table still has data after DELETE?**
```sql
SELECT COUNT(*) FROM arcade_events;  -- Check if really empty
```

**Sequence error on ALTER?**
```sql
SELECT sequence_name FROM information_schema.sequences 
WHERE sequence_schema='public';  -- See exact sequence names
```

**Foreign key constraint error?**
- Make sure you DELETE in this order:
  1. arcade_events
  2. arcade_game_sessions
  3. arcade_page_views
  4. arcade_sessions
  5. THEN update arcade_visitors

---

## 📞 Quick Reference

| Task | File | Time |
|------|------|------|
| Just reset | RESET_SIMPLE.sql | 10 sec |
| Reset with choices | RESET_ALL_DATA.sql | 10 sec |
| Reset with details | RESET_INDIVIDUAL_STATEMENTS.sql | 2 min |
| Understand first | RESET_GUIDE.md | 5 min |

---

