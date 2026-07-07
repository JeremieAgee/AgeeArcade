# 🚀 Analytics Database Reset — START HERE

## What You Have

Complete SQL schema + JavaScript for a professional analytics system that:
- ✅ Tracks **unique visitors** (each person counted once at `visitor_id` level)
- ✅ Distinguishes **new vs returning visitors** at session init
- ✅ Captures all game events and progression
- ✅ Includes pre-built views and reporting functions
- ✅ Uses Supabase RLS for security

---

## 5-Minute Setup

### 1. Go to Supabase Dashboard

https://app.supabase.com → Select your project → SQL Editor

### 2. Run One Script

**Copy the entire content of `COMPLETE_SQL_FINAL.sql` and paste into SQL Editor:**

- Drops old tables (clean start)
- Creates all analytics + leaderboard + Depths save tables
- Sets up RLS policies (admin-only read on analytics, public read/write on leaderboards)
- Creates stored procedures, triggers, views, and reporting functions
- **Time**: ~10 seconds

**Done!** Database is ready.

### 3. Update Client Code

Replace your `js/analytics.js` with `ANALYTICS_JS_UPDATED.js`:

```bash
# In your project root:
cp sql/ANALYTICS_JS_UPDATED.js js/analytics.js
```

Test: Visit your site, play a game. Data should appear in Supabase.

---

## File Guide

| File | Purpose |
|------|---------|
| `COMPLETE_SQL_FINAL.sql` | **Primary** — Tables, indexes, RLS, functions, triggers, views (everything) |
| `ANALYTICS_JS_UPDATED.js` | Copy to `js/analytics.js` |
| `ANALYTICS_QUERIES.sql` | Common queries (analytics, cohorts, funnels) |
| `README.md` | Detailed schema documentation |

---

## How Visitor Tracking Works

### New Visitor (First Visit)
```
localStorage['agee_arcade.visitor_id'] = NEW UUID

→ Page load
→ upsert_session()
→ arcade_visitors: INSERT { visitor_id, visit_count: 1, ... }
→ arcade_sessions: INSERT { is_returning: FALSE, ... }
```

### Returning Visitor (Same day, within 30min OR different day)
```
localStorage['agee_arcade.visitor_id'] = SAME UUID

→ Page load (new session)
→ upsert_session()
→ arcade_visitors: UPDATE { visit_count: 2 (or more), ... }
→ arcade_sessions: INSERT { is_returning: TRUE, ... }
```

### Result: Each Person = One Row in `arcade_visitors`
- `visit_count` = number of times they visited
- `session_count` = number of games they played
- `total_play_time_seconds` = cumulative playtime

---

## Key Tables

### `arcade_visitors` ⭐
**The source of truth for unique people**

```sql
SELECT COUNT(*) FROM arcade_visitors;              -- Unique people ever
SELECT COUNT(*) FROM arcade_visitors 
  WHERE visit_count = 1;                            -- People who visited once
SELECT COUNT(*) FROM arcade_visitors 
  WHERE visit_count > 1;                            -- Returning people
```

### `arcade_sessions`
One row per user session (30-min timeout)
- Links to `arcade_visitors` for attribution
- Tracks `is_returning` flag

### `arcade_game_sessions`
One row per game play
- Final stats (floor reached, score, duration, end reason)
- Trigger auto-updates visitor stats when ended

### `arcade_events`
One row per event (floor_reached, boss_defeated, etc.)
- Linked to game session for context

---

## Quick Queries

### Visitor Summary
```sql
SELECT
  COUNT(*) as unique_visitors,
  COUNT(*) FILTER (WHERE visit_count = 1) as new,
  COUNT(*) FILTER (WHERE visit_count > 1) as returning
FROM arcade_visitors;
```

### Most Popular Game
```sql
SELECT game_id, COUNT(*) as plays
FROM arcade_game_sessions
WHERE ended_at IS NOT NULL
GROUP BY game_id
ORDER BY plays DESC
LIMIT 1;
```

### Active Users (Last 7 Days)
```sql
SELECT COUNT(*)
FROM arcade_visitors
WHERE last_visit >= NOW() - INTERVAL '7 days';
```

### See Pre-built Views
```sql
SELECT * FROM vw_daily_visitors;        -- New vs returning by day
SELECT * FROM vw_game_stats;             -- Game performance
SELECT * FROM vw_sessions_by_source;     -- Traffic breakdown
SELECT * FROM vw_event_frequency;        -- Event frequency
```

---

## What Changed From Old Schema?

| Old | New | Why |
|-----|-----|-----|
| No visitor tracking | `arcade_visitors` table | Know how many unique people |
| Manual session updates | RPC functions + triggers | Automatic, consistent |
| Direct inserts | Stored procedures | Better control, easier to update |
| No RLS | Full RLS + policies | Secure for Supabase auth |
| No views | 5 built-in views | Quick analytics |

**Client code**: Identical API, works without changes (but updated version uses RPC for better performance).

---

## Troubleshooting

### "RLS policy blocked insert"
- Make sure you ran `COMPLETE_SQL_FINAL.sql` (creates RLS policies)
- Verify anon key exists in Supabase

### "Function not found"
- Check exact RPC name spelling (case-sensitive)
- Verify you ran `COMPLETE_SQL_FINAL.sql`

### No data appearing
1. Check browser console for errors in analytics.js
2. Check Supabase dashboard → Logs for DB errors
3. Verify Supabase URL + key are correct in analytics.js
4. Test: Manual insert to `arcade_visitors` to verify connection

### Trigger not updating visitor stats
- Confirm end_reason was set when calling endGameSession()
- Check if trigger is active: `SELECT trigger_name FROM information_schema.triggers WHERE table_name='arcade_game_sessions';`

---

## Next Steps

1. ✅ Run SQL files
2. ✅ Replace `js/analytics.js`
3. ✅ Test: Visit site + play game
4. ✅ Check data: `SELECT COUNT(*) FROM arcade_visitors;`
5. 📊 Run analytics queries (see `ANALYTICS_QUERIES.sql`)
6. 🎯 Build admin dashboard (queries are all here)

---

## Admin Dashboard

To view analytics:

1. Sign in to Supabase dashboard
2. Go to SQL Editor
3. Run queries from `ANALYTICS_QUERIES.sql`
4. Or call reporting functions:
   - `SELECT get_total_unique_visitors();`
   - `SELECT * FROM get_top_games(10);`
   - `SELECT * FROM get_source_engagement();`

For a custom admin page, use these functions/views as data source.

---

## Questions?

Check:
- `README.md` — Full schema documentation
- `ANALYTICS_QUERIES.sql` — Examples of every query type
- `DATA_TRACKING_REVIEW.md` — What events exist

---

**You're all set! 🎉**

Run the SQL, test with a game session, and start collecting data.
