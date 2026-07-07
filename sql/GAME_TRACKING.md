# 🎮 Game-Level Tracking — Complete Overview

## Three Layers of Tracking

Your arcade has **THREE different tracking layers** that work together:

1. **Analytics** (Supabase) — Behavioral data for all players
2. **Game Saves** (localStorage) — Player progress & stats
3. **Leaderboards** (Supabase + localStorage) — High scores

---

## 🎮 Game Saves (localStorage)

### **Depths of Ashenveil** (Most Complex Save System)

**Saved Data**:

#### Meta (Player Stats)
```javascript
{
  bestFloor:      INT,    // Highest floor ever reached
  bestLevel:      INT,    // Highest level/XP achieved
  totalRuns:      INT,    // Total play attempts
  totalDeaths:    INT,    // Total times died
  bossesDefeated: INT,    // Total bosses ever defeated
  updated_at:     TIMESTAMP
}
```

#### Active Run (Current Game Session)
```javascript
{
  // Full game state snapshot:
  floor:          INT,
  playerLevel:    INT,
  health:         INT,
  inventory:      ARRAY,
  equipment:      ARRAY,
  enemies:        ARRAY,
  roomState:      OBJECT,
  timestamp:      TIMESTAMP
}
```

#### Leaderboard (Local High Scores)
```javascript
[
  { nickname, floor, level, date },
  { nickname, floor, level, date },
  // ... up to 10 entries
]
```

**localStorage Keys**:
```
depthsOfAshenveil.meta.v1           → Player stats
depthsOfAshenveil.activeRun.v1      → Current game state
depthsOfAshenveil.leaderboard.v1    → Top 10 local scores
depthsOfAshenveil.leaderboard.synced.v1 → Sync tracker
depthsOfAshenveil.playerId.v1       → Player UUID
```

**Synced to Supabase?**: 
- ✅ Meta (stats) → depths_meta table
- ✅ Active run → depths_active_runs table
- ✅ Leaderboard → depths_leaderboard table

**Size**: ~2-5 KB per player

---

### **Spear Fisher** (Leaderboard Only)

**Saved Data**:
```javascript
{
  nickname: TEXT,
  score:    INT,
  date:     TIMESTAMP
}
```

**localStorage Keys**:
```
sf_hi                           → Personal high score
spear_fisher_lb                 → Local leaderboard (top scores)
spear_fisher_lb.synced.v1       → Sync tracker
agee_arcade.leaderboard_guest_id → Guest player ID
```

**Synced to Supabase?**: 
- ✅ Leaderboard → spear_fisher_leaderboard table

**Size**: ~100 bytes per entry

---

### **Maze Runner** (Leaderboard Only)

**Saved Data**:
```javascript
{
  user_id: UUID,
  floors:  INT,
  score:   INT,
  time_ms: INT,
  date:    TIMESTAMP
}
```

**localStorage Keys**:
```
maze_runner_lb          → Local leaderboard
maze_runner_lb.synced.v1 → Sync tracker
```

**Synced to Supabase?**: 
- ✅ Leaderboard → maze_runner_runs table

**Size**: ~100 bytes per entry

---

### **Blacktide Bastion** (Leaderboard Only)

**Saved Data**:
```javascript
{
  nickname: TEXT,
  score:    INT,
  wave:     INT,
  date:     TIMESTAMP
}
```

**localStorage Keys**:
```
blacktide_bastion_lb    → Local leaderboard
```

**Synced to Supabase?**: 
- ✅ Leaderboard → blacktide_bastion_leaderboard table

**Size**: ~100 bytes per entry

---

## 🔄 Data Flow Between Layers

```
ANALYTICS
(Automatic, comprehensive)
    ↓
    ├─ Tracks all events
    ├─ Updates on every action
    ├─ Fire-and-forget to Supabase
    └─ Full session context
    
GAME SAVES
(Manual, checkpoint-based)
    ↓
    ├─ Saves on game load/save point
    ├─ Updates every few actions (Depths)
    ├─ Stored in localStorage first
    └─ Synced to Supabase when online
    
LEADERBOARDS
(Manual, end-of-session only)
    ↓
    ├─ Submits on game over
    ├─ Only if score qualifies
    ├─ Stored in localStorage first
    └─ Synced to Supabase when online
```

---

## 📊 Comparison: All Three Systems

| Aspect | Analytics | Game Saves | Leaderboards |
|--------|-----------|-----------|--------------|
| **Purpose** | Track behavior | Resume progress | Rank players |
| **Trigger** | Automatic | Manual/periodic | On game end |
| **Data Frequency** | Dozens per play | Every few moves | Once per game |
| **Contains PII** | No | No | Yes (nickname) |
| **Players see it** | No (admin only) | Yes (in game UI) | Yes (public) |
| **Local storage** | No | Yes (localStorage) | Yes (localStorage) |
| **Supabase tables** | 5 tables | Game-specific | 4 tables |
| **Monthly size** | ~6 MB | Variable | ~50 KB |
| **Can resume game** | No | Yes (Depths only) | No |

---

## 🎯 What Each Game Tracks

### **Depths of Ashenveil**
```
ANALYTICS:
├─ game_started { floor: 1 }
├─ floor_reached { floor: 2, 3, 4... }
├─ boss_reached { floor }
├─ boss_defeated { floor }
├─ chest_opened { floor }
├─ upgrade_selected { upgrade_id }
├─ player_died { floor, level }
└─ game_quit { floor, level }

GAME SAVES:
├─ bestFloor, bestLevel, totalRuns, totalDeaths
├─ Full game state (player, enemies, inventory, etc.)
└─ Active run snapshot (resume capability)

LEADERBOARDS:
├─ Nickname, floor, level, date
└─ Top 10 local + top global
```

### **Spear Fisher**
```
ANALYTICS:
├─ game_started
├─ spear_thrown { throws }
├─ fish_speared { fish }
├─ fish_caught { fish, points, catches }
├─ spear_missed { throws }
├─ round_reached { reached_round, next_goal }
└─ game_over { throws, catches, final_score, final_round }

GAME SAVES:
├─ Personal high score only (no mid-game save)
└─ No active run tracking

LEADERBOARDS:
├─ Nickname, score, date
└─ Top scores only
```

### **Maze Runner**
```
ANALYTICS:
├─ game_started
├─ floor_started { floor }
├─ floor_reached { completed_floor, next_floor, bonus }
└─ player_died

GAME SAVES:
├─ No save system (procedural maze each time)
└─ No active run tracking

LEADERBOARDS:
├─ Nickname, score, floors, time
└─ Best attempts only
```

### **Blacktide Bastion**
```
ANALYTICS:
├─ game_started
├─ wave_started { wave }
├─ ship_sunk { ship, points }
├─ wave_completed { wave, ships_sunk }
└─ game_over { ships_sunk }

GAME SAVES:
├─ No save system (waves restart each session)
└─ No active run tracking

LEADERBOARDS:
├─ Nickname, score, wave
└─ Best attempts only
```

---

## 💾 Depths of Ashenveil Save System (Detailed)

### File Structure
```
depthsOfAshenveil.meta.v1
└─ {
    bestFloor: 12,
    bestLevel: 15,
    totalRuns: 47,
    totalDeaths: 189,
    bossesDefeated: 8,
    updated_at: "2026-06-22T14:30:00Z"
  }

depthsOfAshenveil.activeRun.v1 (while playing)
└─ {
    floor: 5,
    playerLevel: 8,
    health: 65,
    maxHealth: 100,
    xp: 340,
    equipment: [{ id: "sword_bronze", level: 2 }, ...],
    inventory: [{ id: "potion", qty: 3 }, ...],
    enemies: [{ id: "goblin_1", hp: 8, ... }, ...],
    rooms: { "1_1": { cleared: true, exits: [...] }, ... },
    timestamp: "2026-06-22T14:30:15Z"
  }

depthsOfAshenveil.leaderboard.v1
└─ [
    { nickname: "Adventurer", floor: 12, level: 15, date: "2026-06-22T14:15:00Z" },
    { nickname: "Knight", floor: 10, level: 12, date: "2026-06-22T14:00:00Z" },
    // ... up to 10 entries
  ]

depthsOfAshenveil.leaderboard.synced.v1
└─ [
    "payload_hash_1",
    "payload_hash_2",
    // ... hashes of synced entries
  ]
```

### Sync Behavior
```
Player loads game
  ↓
Check Supabase for latest meta/runs/leaderboard
  ├─ If online: Load from Supabase
  ├─ If offline: Use localStorage
  └─ Merge if both available

During play
  ├─ Save activeRun to localStorage (auto-save)
  └─ Emit 'depths-save-change' event

Game ends
  ├─ Update meta in localStorage
  ├─ Clear activeRun (game over)
  ├─ Add entry to local leaderboard
  └─ Sync all to Supabase (if online)

On sync:
  ├─ Mark entry as synced (prevent duplicates)
  ├─ Merge Supabase data with local
  └─ Keep latest version of each
```

---

## 🔌 Sync Keys (Prevent Duplicates)

```javascript
// Each system uses sync keys to track what's been submitted

DEPTHS:
depthsOfAshenveil.leaderboard.synced.v1
└─ [payload_hash_1, payload_hash_2, ...]
   (prevents resubmitting same score if sync fails)

SPEAR FISHER:
spear_fisher_lb.synced.v1
└─ [payload_hash_1, ...]

MAZE RUNNER:
maze_runner_lb.synced.v1
└─ [payload_hash_1, ...]

BLACKTIDE:
(No explicit sync key tracking)
```

---

## 🌐 Online vs Offline

### Online Behavior
```
Game Load
  ├─ Fetch latest from Supabase
  ├─ Merge with localStorage
  └─ Use Supabase version if newer

Game Save/Leaderboard
  ├─ Save to localStorage
  └─ Immediately sync to Supabase (fire-and-forget)

Game Sync
  ├─ Upload localStorage to Supabase
  ├─ Mark as synced (prevent duplicates)
  └─ Merge Supabase data back
```

### Offline Behavior
```
Game Load
  ├─ Supabase fetch fails
  └─ Use localStorage as fallback

Game Save/Leaderboard
  ├─ Save to localStorage only
  ├─ Mark for later sync
  └─ Continue playing

When Back Online
  ├─ Sync queued entries to Supabase
  ├─ Mark as synced
  └─ Resolve conflicts (newer version wins)
```

---

## 📝 Data Retention

| System | Keep Indefinitely | Archive After |
|--------|-------------------|------------------|
| Analytics | All events & sessions | Never |
| Game Saves (Depths) | Active run + meta | All-time best stays |
| Leaderboards | Top scores | Never (all-time high scores) |

---

## 🗑️ Reset Options

### Reset Analytics Only
```sql
DELETE FROM arcade_events;
DELETE FROM arcade_game_sessions;
DELETE FROM arcade_page_views;
DELETE FROM arcade_sessions;
-- Keeps arcade_visitors
```

### Reset Game Saves Only
```javascript
// In browser console:
localStorage.removeItem('depthsOfAshenveil.meta.v1');
localStorage.removeItem('depthsOfAshenveil.activeRun.v1');
localStorage.removeItem('depthsOfAshenveil.leaderboard.v1');
localStorage.removeItem('depthsOfAshenveil.leaderboard.synced.v1');
```

### Reset Leaderboards Only
```sql
DELETE FROM depths_leaderboard;
DELETE FROM spear_fisher_leaderboard;
DELETE FROM maze_runner_runs;
DELETE FROM blacktide_bastion_leaderboard;
```

### Reset Everything
```sql
-- Analytics
DELETE FROM arcade_events;
DELETE FROM arcade_game_sessions;
DELETE FROM arcade_page_views;
DELETE FROM arcade_sessions;
-- Leaderboards
DELETE FROM depths_leaderboard;
DELETE FROM spear_fisher_leaderboard;
DELETE FROM maze_runner_runs;
DELETE FROM blacktide_bastion_leaderboard;
```

```javascript
// Plus clear all localStorage keys (in browser console)
Object.keys(localStorage)
  .filter(k => k.includes('Depths') || k.includes('spear') || k.includes('maze') || k.includes('blacktide'))
  .forEach(k => localStorage.removeItem(k));
```

---

## 📊 Storage Summary

### Monthly Data Across All Three Systems

| System | Rows | Size | Type |
|--------|------|------|------|
| **Analytics** | 12,800 | 6 MB | Supabase |
| **Game Saves** | Variable | 5-10 KB/player | localStorage → Supabase |
| **Leaderboards** | ~400 | 50 KB | localStorage + Supabase |
| **TOTAL** | ~13,200 | **~6.1 MB** | Mixed |

---

## 🎯 Key Takeaway

**Three independent but complementary systems**:

1. **Analytics** — "What did players do?" (comprehensive behavior tracking)
2. **Game Saves** — "Where did players get?" (save progress, resume games)
3. **Leaderboards** — "Who's winning?" (public high scores)

All three use the same Supabase project but serve different purposes with different update frequencies and retention policies.

---

