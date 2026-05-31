/* ═══════════════════════════════════════════════════
   spatial-grid.js  —  2-D spatial hash for fast lookup
   Exports: SpatialGrid (factory), and named instances:
     MonsterGrid, ItemGrid, LightGrid

   pos = [X, Z] world units throughout (Y is vertical).

   Cell sizing is ratio-based, not a fixed world-unit value:
     tilesPerCell = ceil(dungeon.COLS / targetCellsPerAxis)
     cellSize     = tilesPerCell * dungeon.TILE  (world units)
   This keeps the cell count ~constant (~targetCellsPerAxis²)
   as the dungeon grows from 40×40 → 52×52 across floors,
   so lookup bucket density stays even regardless of floor depth.

   Default targetCellsPerAxis = 10  → ~100 buckets per grid.
   Call init(dungeon, N) to override per-instance.

   API (per instance):
     init(dungeon, targetCellsPerAxis?)  — call on every floor load
     insert(id, pos)                     — add entity to grid
     remove(id)                          — remove by id, O(1)
     move(id, newPos)                    — update cell if crossed, O(1)
     query(pos, radius)                  — ids in overlapping cells → Array
     cellAt(cx, cz)                      — raw Set for one cell (no alloc)
     toCell(pos)                         — world [X,Z] → cell [cx,cz]
     toCellPos(cx, cz)                   — cell corner → world [X,Z]
     has(id)                             — is id registered?
     getCell(id)                         — cell [cx,cz] for an id
     clear()                             — wipe entries, keep grid shape
     reset()                             — full teardown (floor unload)
════════════════════════════════════════════════════ */
window.SpatialGrid = (() => {

  const DEFAULT_CELLS_PER_AXIS = 10;

  function create() {

    let _cellSize    = 16;   // world units — recomputed in init()
    let _tilesPerCell = 4;   // dungeon tiles — recomputed in init()
    let _numCols     = 0;
    let _numRows     = 0;
    let _cells       = [];   // Array<Set<string>>
    let _idToCell    = new Map(); // id → flat cell index

    /* ── grid math ─────────────────────────────── */
    function _flatIdx(cx, cz) {
      return cz * _numCols + cx;
    }

    function _clampCell(cx, cz) {
      return [
        Math.max(0, Math.min(_numCols - 1, cx)),
        Math.max(0, Math.min(_numRows - 1, cz)),
      ];
    }

    function _worldToCell(worldX, worldZ) {
      return _clampCell(
        Math.floor(worldX / _cellSize),
        Math.floor(worldZ / _cellSize),
      );
    }

    function _posToIdx(pos) {
      const [cx, cz] = _worldToCell(pos[0], pos[1]);
      return _flatIdx(cx, cz);
    }

    /* ── lifecycle ─────────────────────────────── */
    function init(dungeon, targetCellsPerAxis) {
      const target = targetCellsPerAxis || DEFAULT_CELLS_PER_AXIS;

      // Snap cell size to a whole number of dungeon tiles so cell edges
      // align with the tile grid — avoids entities straddling cell seams.
      _tilesPerCell = Math.max(1, Math.ceil(dungeon.COLS / target));
      _cellSize     = _tilesPerCell * dungeon.TILE;

      // Use ceil so the last partial column/row still gets a cell.
      _numCols = Math.max(1, Math.ceil(dungeon.COLS / _tilesPerCell));
      _numRows = Math.max(1, Math.ceil(dungeon.ROWS / _tilesPerCell));

      const total = _numCols * _numRows;
      _cells = Array.from({ length: total }, () => new Set());
      _idToCell.clear();
    }

    // Wipe all entries but keep the grid shape (use between rounds, not floors)
    function clear() {
      for (let i = 0; i < _cells.length; i++) _cells[i].clear();
      _idToCell.clear();
    }

    // Full teardown — call on floor unload
    function reset() {
      _cells    = [];
      _idToCell = new Map();
      _numCols  = 0;
      _numRows  = 0;
    }

    /* ── mutators ──────────────────────────────── */
    function insert(id, pos) {
      // If already tracked, remove from old cell first.
      const oldIdx = _idToCell.get(id);
      if (oldIdx !== undefined) _cells[oldIdx].delete(id);

      const idx = _posToIdx(pos);
      _cells[idx].add(id);
      _idToCell.set(id, idx);
    }

    function remove(id) {
      const idx = _idToCell.get(id);
      if (idx === undefined) return false;
      _cells[idx].delete(id);
      _idToCell.delete(id);
      return true;
    }

    // O(1) — only touches two Sets when the entity crosses a cell boundary.
    function move(id, newPos) {
      const newIdx = _posToIdx(newPos);
      const oldIdx = _idToCell.get(id);
      if (newIdx === oldIdx) return;               // still in same cell
      if (oldIdx !== undefined) _cells[oldIdx].delete(id);
      _cells[newIdx].add(id);
      _idToCell.set(id, newIdx);
    }

    /* ── queries ───────────────────────────────── */
    // Returns all IDs in every cell whose AABB overlaps (pos, radius).
    // Result may contain IDs outside the exact circle — caller filters if needed.
    function query(pos, radius) {
      const minCx = Math.max(0, Math.floor((pos[0] - radius) / _cellSize));
      const maxCx = Math.min(_numCols - 1, Math.floor((pos[0] + radius) / _cellSize));
      const minCz = Math.max(0, Math.floor((pos[1] - radius) / _cellSize));
      const maxCz = Math.min(_numRows - 1, Math.floor((pos[1] + radius) / _cellSize));

      const out = [];
      for (let cz = minCz; cz <= maxCz; cz++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          for (const id of _cells[_flatIdx(cx, cz)]) out.push(id);
        }
      }
      return out;
    }

    // Raw Set for one cell — no allocation, but caller must not mutate it.
    function cellAt(cx, cz) {
      if (cx < 0 || cx >= _numCols || cz < 0 || cz >= _numRows) return null;
      return _cells[_flatIdx(cx, cz)];
    }

    /* ── coordinate helpers ────────────────────── */
    // World [X, Z] → cell [cx, cz]
    function toCell(pos) {
      return _worldToCell(pos[0], pos[1]);
    }

    // Cell [cx, cz] → world-space corner [X, Z] (top-left of cell)
    function toCellPos(cx, cz) {
      return [cx * _cellSize, cz * _cellSize];
    }

    function has(id)     { return _idToCell.has(id); }
    function getCell(id) {
      const idx = _idToCell.get(id);
      if (idx === undefined) return null;
      return [idx % _numCols, Math.floor(idx / _numCols)];
    }

    /* ── debug / introspection ─────────────────── */
    function stats() {
      let max = 0, total = 0;
      for (let i = 0; i < _cells.length; i++) {
        const n = _cells[i].size;
        total += n;
        if (n > max) max = n;
      }
      return {
        numCols: _numCols,
        numRows: _numRows,
        cellSize: _cellSize,
        tilesPerCell: _tilesPerCell,
        totalCells: _numCols * _numRows,
        trackedEntities: _idToCell.size,
        maxBucketSize: max,
        totalEntries: total,
      };
    }

    return {
      init,
      clear,
      reset,
      insert,
      remove,
      move,
      query,
      cellAt,
      toCell,
      toCellPos,
      has,
      getCell,
      stats,
      numCols:      () => _numCols,
      numRows:      () => _numRows,
      cellSize:     () => _cellSize,
      tilesPerCell: () => _tilesPerCell,
      count:        () => _idToCell.size,
    };
  }

  return { create };

})();

/* ── Named grid instances ────────────────────────────
   Each category gets its own grid so a monster query
   never contaminates an item lookup.
   All share the same cell sizing — call init() on each
   at floor load time.
──────────────────────────────────────────────────── */
window.MonsterGrid = window.SpatialGrid.create();
window.ItemGrid    = window.SpatialGrid.create();
window.LightGrid   = window.SpatialGrid.create();
