/* ═══════════════════════════════════════════════════
   dungeon.js  —  Procedural dungeon generation
   Exports: Dungeon (namespace)
════════════════════════════════════════════════════ */
const Dungeon = (() => {

  const TILE   = 4;
  const WALL_H = 3.4;
  const T = {
    WALL:       1,
    FLOOR:      2,
    CORRIDOR:   3,
    BOSS_FLOOR: 4,
  };

  /* ── Seeded PRNG (mulberry32) ─────────────────────── */
  function makeRNG(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── Grid helpers ────────────────────────────── */
  function makeGrid(cols, rows) {
    return Array.from({ length: rows }, () => new Uint8Array(cols).fill(T.WALL));
  }

  function carveRect(g, x, y, w, h, tileType = T.FLOOR) {
    for (let row = y; row < y + h; row++)
      for (let col = x; col < x + w; col++)
        g[row][col] = tileType;
  }

  function roomCenter(room) {
    return {
      cx: Math.floor(room.x + room.w / 2),
      cy: Math.floor(room.y + room.h / 2),
    };
  }

  function roomsOverlap(a, b, pad = 2) {
    return (
      a.x < b.x + b.w + pad &&
      a.x + a.w + pad > b.x &&
      a.y < b.y + b.h + pad &&
      a.y + a.h + pad > b.y
    );
  }

  function roomDist(a, b) {
    const ca = roomCenter(a);
    const cb = roomCenter(b);
    return Math.sqrt((ca.cx - cb.cx) ** 2 + (ca.cy - cb.cy) ** 2);
  }

  /* ── Corridor path helpers ───────────────────── */

  // Returns list of [tx, ty] tiles for an L-shaped corridor.
  // variant 0 = horizontal leg first, then vertical.
  // variant 1 = vertical leg first, then horizontal.
  function lShapeTiles(x1, y1, x2, y2, variant) {
    const tiles = [];
    if (variant === 0) {
      for (let cx = x1; cx !== x2; cx += cx < x2 ? 1 : -1) tiles.push([cx, y1]);
      for (let cy = y1; cy !== y2; cy += cy < y2 ? 1 : -1) tiles.push([x2, cy]);
      tiles.push([x2, y2]);
    } else {
      for (let cy = y1; cy !== y2; cy += cy < y2 ? 1 : -1) tiles.push([x1, cy]);
      for (let cx = x1; cx !== x2; cx += cx < x2 ? 1 : -1) tiles.push([cx, y2]);
      tiles.push([x2, y2]);
    }
    return tiles;
  }

  // True if tile [tx, ty] is within room bounds expanded outward by pad tiles.
  function tileInRoom(tx, ty, room, pad) {
    return tx >= room.x - pad && tx < room.x + room.w + pad &&
           ty >= room.y - pad && ty < room.y + room.h + pad;
  }

  // True if the path would:
  //   • come within 1 tile of any regular room other than skip1/skip2
  //     (pad=1 = symmetric 1-tile buffer all sides — prevents corridors hugging walls
  //      while still allowing connections between rooms that are 2+ tiles apart)
  //   • enter the boss room's 2-tile border zone (wider clearance keeps boss walls clean
  //     and prevents any regular corridor from accidentally approaching the boss area)
  // bossRoom may be null to skip the boss-padding check (used for the boss corridor itself).
  function pathIsBlocked(tiles, allRooms, skip1, skip2, bossRoom) {
    for (const [tx, ty] of tiles) {
      if (bossRoom && tileInRoom(tx, ty, bossRoom, 2)) return true;
      for (const r of allRooms) {
        if (r === skip1 || r === skip2) continue;
        if (tileInRoom(tx, ty, r, 1)) return true;
      }
    }
    return false;
  }

  // Carve an array of [tx, ty] tiles — overwrites WALL only.
  function carveTiles(g, tiles) {
    for (const [tx, ty] of tiles) {
      if (g[ty][tx] === T.WALL) g[ty][tx] = T.CORRIDOR;
    }
  }

  // Connect two rooms with a validated L-shaped corridor.
  //   • Tries variant 0 (H-first) then variant 1 (V-first).
  //   • If both variants cross another room or boss padding, force-carves variant 0
  //     when force=true (MST/repair), or skips entirely when force=false (optional loops).
  //   • Sets isConnected = true on both rooms when a corridor is carved.
  function connectRooms(g, ra, rb, allRooms, bossRoom, force = true) {
    const a = roomCenter(ra), b = roomCenter(rb);
    for (const v of [0, 1]) {
      const tiles = lShapeTiles(a.cx, a.cy, b.cx, b.cy, v);
      if (!pathIsBlocked(tiles, allRooms, ra, rb, bossRoom)) {
        carveTiles(g, tiles);
        ra.isConnected = true;
        rb.isConnected = true;
        return true;
      }
    }
    if (force) {
      // Both variants blocked — force-carve to maintain connectivity.
      carveTiles(g, lShapeTiles(a.cx, a.cy, b.cx, b.cy, 0));
      ra.isConnected = true;
      rb.isConnected = true;
      return true;
    }
    return false; // optional corridor skipped
  }

  /* ── BFS through walkable tiles from a room center ── */
  function bfsTileDist(g, cols, rows, startRoom) {
    const { cx, cy } = roomCenter(startRoom);
    const dist  = new Map();
    const queue = [[cx, cy, 0]];
    dist.set(`${cx},${cy}`, 0);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while (queue.length) {
      const [x, y, d] = queue.shift();
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (g[ny][nx] === T.WALL) continue;
        const key = `${nx},${ny}`;
        if (dist.has(key)) continue;
        dist.set(key, d + 1);
        queue.push([nx, ny, d + 1]);
      }
    }
    return dist;
  }

  /* ── Repair connectivity ─────────────────────── */
  // Ensures every room in `rooms` is reachable from rooms[0].
  // Uses connectRooms (force=true) so boss padding may be violated in
  // extreme layouts, but connectivity is always guaranteed.
  function repairConnectivity(g, rooms, cols, rows, bossRoom) {
    for (let pass = 0; pass < rooms.length; pass++) {
      const bfs = bfsTileDist(g, cols, rows, rooms[0]);
      let repaired = false;
      for (const r of rooms) {
        const rc = roomCenter(r);
        if (bfs.has(`${rc.cx},${rc.cy}`)) continue;
        // Disconnected — connect to nearest reachable room
        let best = null, bestD = Infinity;
        for (const other of rooms) {
          if (other === r) continue;
          const oc = roomCenter(other);
          if (!bfs.has(`${oc.cx},${oc.cy}`)) continue;
          const d = roomDist(r, other);
          if (d < bestD) { bestD = d; best = other; }
        }
        if (best) {
          connectRooms(g, r, best, rooms, bossRoom, true);
          repaired = true;
        }
      }
      if (!repaired) break;
    }
  }

  /* ── Lantern placement ───────────────────────── */
  // Room-scoped torch placement. Each room gets enough torches for coverage, with
  // candidates spread around its perimeter instead of randomly capped by wall face.
  function placeLanterns(g, rooms, cols, rows, rand) {
    const TILES_PER_TORCH = 18;
    const lanterns = [];

    function addCandidate(list, seen, x, y, face, offset) {
      const key = `${x},${y}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ x, y, face, offset });
    }

    for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
      const room = rooms[roomIndex];
      const { x, y, w, h } = room;
      const areaCount = Math.ceil((w * h) / TILES_PER_TORCH);
      const widthCount = Math.ceil(w / 5);
      const heightCount = Math.ceil(h / 5);
      const torchCount = Math.min(10, Math.max(2, areaCount, widthCount, heightCount));
      const candidates = [];
      const seen = new Set();

      const horizontalSlots = Math.max(2, Math.ceil(w / 4));
      for (let i = 0; i < horizontalSlots; i++) {
        const tx = x + Math.round(((i + 1) * (w - 1)) / (horizontalSlots + 1));
        addCandidate(candidates, seen, tx, y - 1, 'north', i);
        addCandidate(candidates, seen, tx, y + h, 'south', i);
      }

      const verticalSlots = Math.max(2, Math.ceil(h / 4));
      for (let i = 0; i < verticalSlots; i++) {
        const ty = y + Math.round(((i + 1) * (h - 1)) / (verticalSlots + 1));
        addCandidate(candidates, seen, x - 1, ty, 'west', i);
        addCandidate(candidates, seen, x + w, ty, 'east', i);
      }

      const valid = candidates.filter(c =>
        c.x >= 0 && c.x < cols && c.y >= 0 && c.y < rows &&
        g[c.y][c.x] === T.WALL
      );

      valid.sort((a, b) => {
        if (a.offset !== b.offset) return a.offset - b.offset;
        return a.face.localeCompare(b.face);
      });

      for (let i = valid.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [valid[i], valid[j]] = [valid[j], valid[i]];
      }

      for (const c of valid.slice(0, torchCount)) {
        lanterns.push({ x: c.x, y: c.y, roomIndex });
      }
    }
    return lanterns;
  }

  /* ── Enemy spawn points ──────────────────────── */
  // Each regular room gets one enemy type (pack). Boss room gets a handful of
  // mixed minion guards in addition to the boss itself.
  function enemySpawnPoints(rooms, floor, bossRoom, rand) {
    const ALL_TYPES = ['skeleton', 'goblin', 'wraith', 'troll', 'archer'];
    const spawns = [];

    // Regular rooms — one type per room, 2–(3+floor/2) enemies
    for (let i = 1; i < rooms.length - 1; i++) {
      const r       = rooms[i];
      const typeKey = ALL_TYPES[Math.floor(rand() * ALL_TYPES.length)];
      const roomArea = Math.max(1, (r.w - 2) * (r.h - 2));
      const maxBySize = Math.max(2, Math.floor(roomArea / 3));
      const maxCount  = Math.min(maxBySize, 3 + Math.floor(floor / 2));
      const count = 2 + Math.floor(rand() * Math.max(1, maxCount - 1));
      for (let k = 0; k < count; k++) {
        spawns.push({
          roomIndex: i,
          typeKey,
          gx: r.x + 1 + Math.floor(rand() * Math.max(1, r.w - 2)),
          gy: r.y + 1 + Math.floor(rand() * Math.max(1, r.h - 2)),
        });
      }
    }

    // Boss room — 2–4 mixed minion guards (independent of boss)
    if (bossRoom) {
      const minionCount = 2 + Math.floor(rand() * (1 + Math.min(2, Math.floor(floor / 3))));
      for (let k = 0; k < minionCount; k++) {
        const typeKey = ALL_TYPES[Math.floor(rand() * ALL_TYPES.length)];
        spawns.push({
          isBossRoomMinion: true,
          typeKey,
          gx: bossRoom.x + 1 + Math.floor(rand() * Math.max(1, bossRoom.w - 2)),
          gy: bossRoom.y + 1 + Math.floor(rand() * Math.max(1, bossRoom.h - 2)),
        });
      }
    }

    return spawns;
  }

  /* ── Loot chest positions ────────────────────── */
  function chestPositions(rooms, rand) {
    const eligible = [];
    for (let i = 1; i < rooms.length - 1; i++) eligible.push(i);
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    const count  = Math.max(1, Math.floor(eligible.length / 3));
    const chests = [];
    for (let k = 0; k < count && k < eligible.length; k++) {
      const r = rooms[eligible[k]];
      chests.push({
        gx: r.x + 1 + Math.floor(rand() * (r.w - 2)),
        gy: r.y + 1 + Math.floor(rand() * (r.h - 2)),
        opened: false,
      });
    }
    return chests;
  }

  /* ── Convert grid coords → world coords ─────── */
  function toWorld(gx, gy) {
    return {
      x: gx * TILE + TILE / 2,
      z: gy * TILE + TILE / 2,
    };
  }

  /* ── Find where the single corridor meets the boss room border ── */
  // Scans all 4 sides for an adjacent CORRIDOR tile; returns entrance data.
  function findBossEntrance(g, bossRoom, cols, rows) {
    const { x, y, w, h } = bossRoom;
    for (let col = x; col < x + w; col++) {
      if (y - 1 >= 0 && g[y - 1][col] === T.CORRIDOR)
        return { side: 'north', tx: col, ty: y, wallTx: col, wallTy: y - 1 };
    }
    for (let col = x; col < x + w; col++) {
      if (y + h < rows && g[y + h][col] === T.CORRIDOR)
        return { side: 'south', tx: col, ty: y + h - 1, wallTx: col, wallTy: y + h };
    }
    for (let row = y; row < y + h; row++) {
      if (x - 1 >= 0 && g[row][x - 1] === T.CORRIDOR)
        return { side: 'west', tx: x, ty: row, wallTx: x - 1, wallTy: row };
    }
    for (let row = y; row < y + h; row++) {
      if (x + w < cols && g[row][x + w] === T.CORRIDOR)
        return { side: 'east', tx: x + w - 1, ty: row, wallTx: x + w, wallTy: row };
    }
    const mid = Math.floor(x + w / 2);
    return { side: 'north', tx: mid, ty: y, wallTx: mid, wallTy: y - 1 };
  }

  /* ── Main generate function ──────────────────── */
  function generate(floor, seed) {
    seed = seed ?? (floor * 0x9e3779b9 ^ (Date.now() & 0xffffffff));
    const rand = makeRNG(seed);

    const cols       = Math.min(70, 18 + floor * 2);
    const rows       = cols;
    const BOSS_MIN_W = 9, BOSS_MIN_H = 9;
    const MIN_W = 4, MAX_W = 12;
    const MIN_H = 4, MAX_H = 10;

    const g     = makeGrid(cols, rows);
    const rooms = [];

    function inBounds(r) {
      return r.x >= 2 && r.y >= 2 &&
             r.x + r.w <= cols - 2 && r.y + r.h <= rows - 2;
    }
    function overlapsAny(candidate, pad, extra) {
      if (rooms.some(r => roomsOverlap(r, candidate, pad))) return true;
      if (extra && roomsOverlap(extra, candidate, pad)) return true;
      return false;
    }

    // ── Step 1: Spawn room (top-left third of grid) ──
    let startRoom = null;
    for (let a = 0; a < 200 && !startRoom; a++) {
      const w = MIN_W + Math.floor(rand() * (MAX_W - MIN_W + 1));
      const h = MIN_H + Math.floor(rand() * (MAX_H - MIN_H + 1));
      const x = 2 + Math.floor(rand() * Math.max(1, cols / 3 - w - 2));
      const y = 2 + Math.floor(rand() * Math.max(1, rows / 3 - h - 2));
      const r = { x, y, w, h, isConnected: false };
      if (inBounds(r)) { startRoom = r; }
    }
    if (!startRoom) startRoom = { x: 2, y: 2, w: 6, h: 6, isConnected: false };
    carveRect(g, startRoom.x, startRoom.y, startRoom.w, startRoom.h);
    startRoom.isConnected = true; // spawn room is always the MST root
    rooms.push(startRoom);

    // ── Step 2: Boss room — placed AND carved immediately ──
    // Carved as BOSS_FLOOR so carveTiles (WALL-only) can never enter it.
    // isConnected starts false; set true only after the single explicit corridor.
    const sc = roomCenter(startRoom);
    const MIN_BOSS_DIST = Math.floor(cols * 0.4);
    const MAX_BOSS_DIST = Math.floor(cols * 0.65);
    const bw = BOSS_MIN_W + Math.floor(rand() * 2);
    const bh = BOSS_MIN_H + Math.floor(rand() * 2);

    let bossRoom = null;
    const angles = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2)
      .sort(() => rand() - 0.5);

    for (let di = 0; di < 4 && !bossRoom; di++) {
      const dist = MIN_BOSS_DIST + Math.floor(rand() * (MAX_BOSS_DIST - MIN_BOSS_DIST + 1));
      for (const angle of angles) {
        const cx = Math.round(sc.cx + dist * Math.cos(angle));
        const cy = Math.round(sc.cy + dist * Math.sin(angle));
        const r = { x: cx - Math.floor(bw / 2), y: cy - Math.floor(bh / 2), w: bw, h: bh };
        if (inBounds(r) && !overlapsAny(r, 3, null)) { bossRoom = r; break; }
      }
    }
    if (!bossRoom) bossRoom = { x: cols - bw - 3, y: rows - bh - 3, w: bw, h: bh };
    bossRoom.isBoss       = true;
    bossRoom.isConnected  = false;

    carveRect(g, bossRoom.x, bossRoom.y, bossRoom.w, bossRoom.h, T.BOSS_FLOOR);

    // ── Step 3: Regular rooms (avoid boss area + 2-tile pad) ──
    for (let a = 0; a < 500 && rooms.length < TARGET; a++) {
      const w = MIN_W + Math.floor(rand() * (MAX_W - MIN_W + 1));
      const h = MIN_H + Math.floor(rand() * (MAX_H - MIN_H + 1));
      const x = 2 + Math.floor(rand() * (cols - w - 4));
      const y = 2 + Math.floor(rand() * (rows - h - 4));
      const r = { x, y, w, h, isConnected: false };
      if (!overlapsAny(r, 2, bossRoom)) {
        carveRect(g, x, y, w, h);
        rooms.push(r);
      }
    }
    if (rooms.length < 3) {
      for (const r of [
        { x: 15, y: 5,  w: 7, h: 7, isConnected: false },
        { x: 28, y: 2,  w: 9, h: 9, isConnected: false },
      ]) {
        if (!overlapsAny(r, 2, bossRoom)) { carveRect(g, r.x, r.y, r.w, r.h); rooms.push(r); }
      }
    }

    // ── Step 4: MST corridors between regular rooms ──
    // connectRooms validates both L-shape variants:
    //   • will not route through any other room (no A→C→B shortcuts)
    //   • will not enter the boss room's 2-tile padding zone
    // Forced when no clean path exists (connectivity over aesthetics).
    const connected = new Set([0]);
    while (connected.size < rooms.length) {
      let bestDist = Infinity, bestFrom = -1, bestTo = -1;
      for (const from of connected) {
        for (let to = 0; to < rooms.length; to++) {
          if (connected.has(to)) continue;
          const d = roomDist(rooms[from], rooms[to]);
          if (d < bestDist) { bestDist = d; bestFrom = from; bestTo = to; }
        }
      }
      if (bestTo === -1) break;
      connectRooms(g, rooms[bestFrom], rooms[bestTo], rooms, bossRoom, true);
      connected.add(bestTo);
    }

    repairConnectivity(g, rooms, cols, rows, bossRoom);

    // ── Step 5: Single corridor into boss room ──
    // Nearest regular room connects directly to boss center.
    // bossRoom passed as null so pathIsBlocked won't reject approaching it;
    // still validates the path doesn't cut through any regular room.
    let connector = rooms[0], connDist = Infinity;
    for (const r of rooms) {
      const d = roomDist(r, bossRoom);
      if (d < connDist) { connDist = d; connector = r; }
    }
    connectRooms(g, connector, bossRoom, [...rooms, bossRoom], null, true);
    bossRoom.isConnected = true;

    // Find the corridor tile adjacent to the boss room and seal it with a door-wall.
    const bossEntrance = findBossEntrance(g, bossRoom, cols, rows);
    if (bossEntrance.wallTx >= 0 && bossEntrance.wallTx < cols &&
        bossEntrance.wallTy >= 0 && bossEntrance.wallTy < rows) {
      g[bossEntrance.wallTy][bossEntrance.wallTx] = T.WALL;
    }

    return {
      grid: g,
      rooms,
      startRoom,
      bossRoom,
      bossEntrance,
      lanterns: placeLanterns(g, [...rooms, bossRoom], cols, rows, rand)
        .filter(l => !(l.x === bossEntrance.wallTx && l.y === bossEntrance.wallTy)),
      spawns:   enemySpawnPoints(rooms, floor, bossRoom, rand),
      chests:   chestPositions(rooms, rand),
      TILE,
      WALL_H,
      COLS: cols,
      ROWS: rows,
      toWorld,
      roomCenter,
      seed,
    };
  }

  return { generate, TILE, WALL_H, COLS: 40, ROWS: 40, toWorld, T };
})();
