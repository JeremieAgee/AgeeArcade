/* ═══════════════════════════════════════════════════
   dungeon-manager.js  —  Canonical dungeon metadata
   Exports: DungeonManager (window global)

   pos = [X, Z] in world units throughout.
   Wraps the raw dungeon object so nothing else needs
   to know about the internal {x,y} / toWorld API.
════════════════════════════════════════════════════ */
window.DungeonManager = (() => {

  const TILE_T = {
    WALL:       1,
    FLOOR:      2,
    CORRIDOR:   3,
    BOSS_FLOOR: 4,
  };

  let _raw       = null;
  let _floor     = 0;
  let _cols      = 0;
  let _rows      = 0;
  let _tile      = 4;
  let _startPos  = [0, 0];
  let _bossPos   = [0, 0];
  let _doorPos   = [0, 0];
  let _rooms     = [];

  /* ── helpers ─────────────────────────────────── */
  function _wp(dungeon, gx, gz) {
    const w = dungeon.toWorld(gx, gz);
    return [w.x, w.z];
  }

  /* ── init ────────────────────────────────────── */
  function init(dungeon, floorNum) {
    _raw   = dungeon;
    _floor = floorNum;
    _cols  = dungeon.COLS;
    _rows  = dungeon.ROWS;
    _tile  = dungeon.TILE;

    const sc   = dungeon.roomCenter(dungeon.startRoom);
    _startPos  = _wp(dungeon, sc.cx, sc.cy);

    const bc   = dungeon.roomCenter(dungeon.bossRoom);
    _bossPos   = _wp(dungeon, bc.cx, bc.cy);

    if (dungeon.bossEntrance) {
      _doorPos = _wp(dungeon, dungeon.bossEntrance.wallTx, dungeon.bossEntrance.wallTy);
    } else {
      _doorPos = [0, 0];
    }

    _rooms = dungeon.rooms.map((r, i) => {
      const c = dungeon.roomCenter(r);
      return {
        id:          i,
        pos:         _wp(dungeon, c.cx, c.cy),
        w:           r.w,
        h:           r.h,
        isConnected: r.isConnected || false,
      };
    });
  }

  /* ── clear ───────────────────────────────────── */
  function clear() {
    _raw = null; _floor = 0; _cols = 0; _rows = 0;
    _rooms = []; _startPos = [0, 0]; _bossPos = [0, 0]; _doorPos = [0, 0];
  }

  /* ── coord helpers ───────────────────────────── */
  function toWorld(gx, gz) {
    if (!_raw) return [0, 0];
    return _wp(_raw, gx, gz);
  }

  function toGrid(worldX, worldZ) {
    return [Math.floor(worldX / _tile), Math.floor(worldZ / _tile)];
  }

  function tileAt(gx, gz) {
    if (!_raw || gz < 0 || gz >= _rows || gx < 0 || gx >= _cols) return 0;
    return _raw.grid[gz][gx];
  }

  function isWalkable(gx, gz) {
    const t = tileAt(gx, gz);
    return t === TILE_T.FLOOR || t === TILE_T.CORRIDOR || t === TILE_T.BOSS_FLOOR;
  }

  /* ── public ──────────────────────────────────── */
  return {
    TILE_T,
    init,
    clear,
    toWorld,
    toGrid,
    tileAt,
    isWalkable,
    floor:    () => _floor,
    cols:     () => _cols,
    rows:     () => _rows,
    tile:     () => _tile,
    startPos: () => _startPos,
    bossPos:  () => _bossPos,
    doorPos:  () => _doorPos,
    rooms:    () => _rooms,
    getRoom:  i  => _rooms[i] || null,
    raw:      ()  => _raw,
  };

})();
