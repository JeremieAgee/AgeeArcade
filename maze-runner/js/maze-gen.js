/* ═══════════════════════════════════════════════════
   maze-gen.js — Recursive-backtracker (DFS) maze generator
   Returns a (2*roomsH+1) × (2*roomsW+1) boolean grid where
   0 = open path, 1 = solid wall.
════════════════════════════════════════════════════ */
window.MazeGen = (() => {

  /* tiny seeded PRNG (mulberry32) */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Fisher-Yates shuffle using provided rng */
  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  /* ── BFS to find farthest reachable room from (0,0) ── */
  function farthestRoom(grid, roomsW, roomsH) {
    const dist = new Int32Array(roomsW * roomsH).fill(-1);
    dist[0] = 0;
    const queue = [0];
    let head = 0, best = 0, bestDist = 0;
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (head < queue.length) {
      const idx = queue[head++];
      const r = Math.floor(idx / roomsW);
      const c = idx % roomsW;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= roomsH || nc < 0 || nc >= roomsW) continue;
        if (dist[nr * roomsW + nc] !== -1) continue;
        /* wall cell between current room and neighbor */
        const wr = r * 2 + 1 + dr;
        const wc = c * 2 + 1 + dc;
        if (grid[wr][wc] !== 0) continue;
        const d = dist[r * roomsW + c] + 1;
        dist[nr * roomsW + nc] = d;
        if (d > bestDist) { bestDist = d; best = nr * roomsW + nc; }
        queue.push(nr * roomsW + nc);
      }
    }
    return { r: Math.floor(best / roomsW), c: best % roomsW };
  }

  /* ── Main generator ── */
  function generate(roomsW, roomsH, seed) {
    seed = seed ?? (Date.now() ^ (Math.random() * 0xffffffff));
    const rand = rng(seed);

    const W = roomsW * 2 + 1;
    const H = roomsH * 2 + 1;

    /* all walls to start */
    const grid = Array.from({ length: H }, () => new Uint8Array(W).fill(1));

    /* carve room cells open */
    for (let r = 0; r < roomsH; r++)
      for (let c = 0; c < roomsW; c++)
        grid[r * 2 + 1][c * 2 + 1] = 0;

    /* DFS */
    const visited = new Uint8Array(roomsW * roomsH);
    visited[0] = 1;
    const stack = [[0, 0]];
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const nbrs = [];
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= roomsH || nc < 0 || nc >= roomsW) continue;
        if (!visited[nr * roomsW + nc]) nbrs.push([nr, nc, dr, dc]);
      }
      if (nbrs.length) {
        const [nr, nc, dr, dc] = nbrs[Math.floor(rand() * nbrs.length)];
        /* carve wall between (r,c) and (nr,nc) */
        grid[r * 2 + 1 + dr][c * 2 + 1 + dc] = 0;
        visited[nr * roomsW + nc] = 1;
        stack.push([nr, nc]);
      } else {
        stack.pop();
      }
    }

    /* place braiding: knock out ~8% of remaining walls to create loops */
    const braidTarget = Math.floor(roomsW * roomsH * 0.08);
    const wallCandidates = [];
    for (let gr = 1; gr < H - 1; gr++) {
      for (let gc = 1; gc < W - 1; gc++) {
        if (grid[gr][gc] !== 1) continue;
        /* horizontal corridor wall */
        if (gr % 2 === 1 && gc % 2 === 0) wallCandidates.push([gr, gc]);
        /* vertical corridor wall */
        if (gr % 2 === 0 && gc % 2 === 1) wallCandidates.push([gr, gc]);
      }
    }
    shuffle(wallCandidates, rand);
    for (let i = 0; i < Math.min(braidTarget, wallCandidates.length); i++) {
      grid[wallCandidates[i][0]][wallCandidates[i][1]] = 0;
    }

    /* start and exit grid positions */
    const start = { gr: 1, gc: 1 };
    const exitRoom = farthestRoom(grid, roomsW, roomsH);
    const exit = { gr: exitRoom.r * 2 + 1, gc: exitRoom.c * 2 + 1 };

    return { grid, W, H, roomsW, roomsH, start, exit, seed };
  }

  return { generate };
})();
