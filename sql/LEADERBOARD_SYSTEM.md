# 🏆 Leaderboard System — Complete Data Tracking Review

## Overview

The **leaderboard system is completely separate** from analytics. While analytics tracks player behavior/events, leaderboards track high scores/accomplishments.

**Key Difference**:
- **Analytics** (arcade_* tables): Behavioral data, all visits, all events
- **Leaderboards** (game-specific tables): High score submissions only

---

## 📊 Leaderboard Tables

### 1. **depths_leaderboard** (Depths of Ashenveil)

**Fields**:
```
id              (auto)
player_id       UUID (Supabase auth user ID or guest UUID)
nickname        TEXT (1-16 chars, alphanumeric + space/-/.)
level           INT  (highest level/xp reached)
floor           INT  (highest floor reached)
created_at      TIMESTAMPTZ (when score submitted)
```

**Sort order**: `level DESC, floor DESC, created_at ASC`

**Columns displayed**: Rank | Nickname | Highest Level | Floor

---

### 2. **maze_runner_runs** (Maze Runner)

**Fields**:
```
id              (auto)
user_id         UUID (player identifier: user ID or guest UUID)
nickname        TEXT (optional - may use user_id directly)
score           INT  (points earned)
floors          INT  (floors escaped)
time_ms         INT  (milliseconds taken)
created_at      TIMESTAMPTZ
```

**Sort order**: `score DESC, floors DESC, time_ms ASC`

**Columns displayed**: Rank | Player | Score | Floor

---

### 3. **blacktide_bastion_leaderboard** (Blacktide Bastion)

**Fields**:
```
id              (auto)
player_id       UUID
nickname        TEXT (1-16 chars)
name            TEXT (alternate field for backward compat)
score           INT  (total points)
wave            INT  (highest wave reached)
created_at      TIMESTAMPTZ
date            TIMESTAMPTZ (alternate field for backward compat)
```

**Sort order**: `score DESC, wave DESC, created_at ASC`

**Columns displayed**: Rank | Captain | Score | Wave

---

### 4. **spear_fisher_leaderboard** (Spear Fisher)

**Fields**:
```
id              (auto)
player_id       UUID
nickname        TEXT (1-16 chars)
name            TEXT (alternate field for backward compat)
score           INT  (points from fish caught)
created_at      TIMESTAMPTZ
date            TIMESTAMPTZ (alternate field for backward compat)
```

**Sort order**: `score DESC, created_at ASC`

**Columns displayed**: Rank | Fisher | Score | Run (date)

---

## 🎮 How Scores Are Submitted

### Depths of Ashenveil
```javascript
// When game ends (player death/quit)
AgeeLeaderboard.insert('depths_leaderboard', {
  player_id: playerId,
  nickname: playerName,
  level: playerLevel,
  floor: maxFloor,
  created_at: NOW()
}, { syncKey: 'depthsOfAshenveil.leaderboard.v1' })
```

### Maze Runner
```javascript
// When game ends
AgeeLeaderboard.insert('maze_runner_runs', {
  user_id: playerId,
  nickname: playerName,
  score: finalScore,
  floors: maxFloors,
  time_ms: durationMs,
  created_at: NOW()
}, { syncKey: 'maze_runner_lb.synced.v1' })
```

### Blacktide Bastion
```javascript
// When game ends
AgeeLeaderboard.insert('blacktide_bastion_leaderboard', {
  player_id: playerId,
  nickname: playerName,
  score: finalScore,
  wave: maxWave,
  created_at: NOW()
}, { syncKey: 'blacktide_bastion_lb' })
```

### Spear Fisher
```javascript
// When game ends (timer expires)
AgeeLeaderboard.insert('spear_fisher_leaderboard', {
  player_id: playerId,
  nickname: playerName,
  score: finalScore,
  created_at: NOW()
}, { syncKey: 'spear_fisher_lb.synced.v1' })
```

---

## 👥 Player Identification

### Logged-In User
```javascript
const playerId = user.id;  // From Supabase Auth
const nickname = user.user_metadata.username || 'Player';
```

### Guest User
```javascript
const playerId = localStorage.getItem('agee_arcade.leaderboard_guest_id');
// OR: generate new UUID if not set
const nickname = promptUserForName();  // Player enters name
```

---

## 🔄 Sync Strategy

Each leaderboard uses a **sync key** to prevent duplicate submissions:

```javascript
syncKey: 'spear_fisher_lb.synced.v1'

// Before inserting, check if already synced:
const synced = JSON.parse(localStorage.getItem(syncKey)) || [];
if (synced.includes(stableString(payload))) {
  return { skipped: true };  // Already submitted
}

// After successful insert:
synced.push(stableString(payload));
localStorage.setItem(syncKey, JSON.stringify(synced.slice(-250)));
```

**Why**: Prevent accidental double-posts, especially if user refreshes after submission

---

## 📈 Data Per Submission

### Depths of Ashenveil
```
Row: {
  nickname: 'Adventurer',
  level: 15,
  floor: 8,
  created_at: '2026-06-22T14:30:00Z'
}
Size: ~150 bytes
```

### Maze Runner
```
Row: {
  user_id: 'guest-1234...',
  floors: 12,
  score: 4200,
  time_ms: 187000
}
Size: ~100 bytes
```

### Blacktide Bastion
```
Row: {
  nickname: 'Captain',
  score: 15000,
  wave: 25,
  created_at: '2026-06-22T14:30:00Z'
}
Size: ~120 bytes
```

### Spear Fisher
```
Row: {
  nickname: 'Fisher',
  score: 8500,
  created_at: '2026-06-22T14:30:00Z'
}
Size: ~100 bytes
```

---

## 🔒 Authentication for Leaderboards

Uses `AgeeLeaderboard` system (separate from `ArcadeAuth`):

```javascript
// Check if logged in
AgeeLeaderboard.isLoggedIn()

// Get player ID (auth user or guest UUID)
const playerId = AgeeLeaderboard.playerId()

// Get submission name (from auth or user input)
const displayName = AgeeLeaderboard.submissionName(inputValue, fallback)

// Get access token (for authenticated inserts)
const token = await AgeeLeaderboard.getAccessToken()
```

---

## 🌐 Local + Remote Sync

Each game has **local leaderboard** (localStorage) + **remote leaderboard** (Supabase):

### Local Leaderboard (Browser Storage)
```javascript
const LB_KEY = 'spear_fisher_lb';  // Main data
const LB_SYNC_KEY = 'spear_fisher_lb.synced.v1';  // Sync tracker

// Stored in localStorage as JSON:
[
  { player_id: 'guest-123', nickname: 'Fisher', score: 8500, date: 1719075000000 },
  { player_id: 'guest-456', nickname: 'Angler', score: 7200, date: 1719074000000 }
]
```

### Remote Leaderboard (Supabase)
```
Same data in Supabase table, synced via AgeeLeaderboard.insert()
```

**Why both?**
- Local: Instant display, works offline
- Remote: Persistent, shared globally
- Sync: Upload local when online

---

## 📊 Volume Estimates

### Monthly Volume (100 games completed per game)

| Game | Rows/Month | Size |
|------|-----------|------|
| Depths of Ashenveil | 100 | 15 KB |
| Maze Runner | 100 | 10 KB |
| Blacktide Bastion | 100 | 12 KB |
| Spear Fisher | 100 | 10 KB |
| **TOTAL** | **400** | **~47 KB** |

Very small! Unlike analytics which tracks all events.

---

## 🔍 Ranking Logic

### Depths of Ashenveil
1. Highest `level` first
2. If tied: Highest `floor`
3. If tied: Earliest `created_at` (who achieved it first)

### Maze Runner
1. Highest `score` first
2. If tied: Most `floors`
3. If tied: Fastest `time_ms`

### Blacktide Bastion
1. Highest `score` first
2. If tied: Highest `wave`
3. If tied: Earliest `created_at`

### Spear Fisher
1. Highest `score` first
2. If tied: Earliest `created_at` (who achieved it first)

---

## ⚖️ Comparison: Analytics vs Leaderboards

| Aspect | Analytics | Leaderboards |
|--------|-----------|--------------|
| **Purpose** | Track all user behavior | Track top scores only |
| **Entries per session** | Dozens (events + session stats) | 0 or 1 (only if score qualifies) |
| **Who submits** | Automatic (JavaScript) | Manual (player confirms) |
| **Contains PII** | No (no names) | Yes (player name/nickname) |
| **Local storage** | Temporary (30min sessions) | Persistent (leaderboard history) |
| **Tables** | 5 tables | 4 separate tables |
| **Data lifetime** | Permanent (analytics) | Permanent (leaderboard) |
| **Monthly rows (100 users)** | ~12,800 | ~400 |

---

## 🎯 Key Fields vs Analytics

### Leaderboard-Specific Data
- `nickname` — Player-chosen display name (10-16 chars)
- `level` / `wave` / `floor` — Progression metric (varies by game)
- `score` — Primary ranking metric
- `time_ms` — Secondary metric (Maze Runner only)

### NOT Tracked in Leaderboards
- ❌ Device info (screen size, OS, browser)
- ❌ Session duration
- ❌ Page views
- ❌ Event-level details (floor transitions, enemy kills, etc.)
- ❌ Return visitor status
- ❌ Traffic source/referrer
- ❌ Multiple game play attempts (only top score per player)

---

## 📋 Leaderboard Tables Schema Summary

```sql
-- Depths of Ashenveil
CREATE TABLE depths_leaderboard (
  id SERIAL PRIMARY KEY,
  player_id UUID,
  nickname TEXT,
  level INT,
  floor INT,
  created_at TIMESTAMPTZ
);

-- Maze Runner
CREATE TABLE maze_runner_runs (
  id SERIAL PRIMARY KEY,
  user_id UUID,
  nickname TEXT,
  score INT,
  floors INT,
  time_ms INT,
  created_at TIMESTAMPTZ
);

-- Blacktide Bastion
CREATE TABLE blacktide_bastion_leaderboard (
  id SERIAL PRIMARY KEY,
  player_id UUID,
  nickname TEXT,
  name TEXT,
  score INT,
  wave INT,
  created_at TIMESTAMPTZ,
  date TIMESTAMPTZ
);

-- Spear Fisher
CREATE TABLE spear_fisher_leaderboard (
  id SERIAL PRIMARY KEY,
  player_id UUID,
  nickname TEXT,
  name TEXT,
  score INT,
  created_at TIMESTAMPTZ,
  date TIMESTAMPTZ
);
```

---

## 🔄 Resetting Leaderboards

If you want to reset leaderboards:

```sql
-- Delete all leaderboard data
DELETE FROM depths_leaderboard;
DELETE FROM maze_runner_runs;
DELETE FROM blacktide_bastion_leaderboard;
DELETE FROM spear_fisher_leaderboard;

-- Clear local storage keys
-- (in browser console, for each player):
localStorage.removeItem('spear_fisher_lb');
localStorage.removeItem('spear_fisher_lb.synced.v1');
localStorage.removeItem('maze_runner_lb');
localStorage.removeItem('maze_runner_lb.synced.v1');
localStorage.removeItem('depthsOfAshenveil.leaderboard.v1');
localStorage.removeItem('blacktide_bastion_lb');
localStorage.removeItem('agee_arcade.leaderboard_guest_id');
```

---

## 📌 Key Takeaway

**Two completely separate systems**:

1. **Analytics** (5 tables)
   - What: Tracks all user behavior
   - When: Automatic, all the time
   - Data: Device, events, progression
   - Privacy: No PII

2. **Leaderboards** (4 tables)
   - What: Tracks high scores only
   - When: Manual submission on game end
   - Data: Nickname, score, progression
   - Privacy: Includes player name

---

