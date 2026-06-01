/* ═══════════════════════════════════════════════════
   static-item-manager.js  —  SOA for non-enemy statics
   Exports: StaticItemManager (window global)

   Covers: chests, boss door, exit portal, arrival portal.
   pos = [X, Z] world units.
   gridPos = [GX, GZ] tile coordinates.
   state — lifecycle state per STATES enum.
   meshSlot — future instanced-mesh batch index (-1 = unassigned).

   Portals have no grid coord (use gx=gz=0) and are added
   dynamically via StaticItemManager.add() after floor build.
════════════════════════════════════════════════════ */
window.StaticItemManager = (() => {

  const TYPES = {
    chest:          1,
    boss_door:      2,
    exit_portal:    3,
    arrival_portal: 4,
  };

  const STATES = {
    closed:  0,
    open:    1,
    opening: 2,
    active:  3,
  };

  let count     = 0;
  let capacity  = 0;
  let ids       = [];
  let indexById = new Map();
  let type      = new Uint8Array(0);
  let posX      = new Float32Array(0);
  let posZ      = new Float32Array(0);
  let gridX     = new Uint16Array(0);
  let gridZ     = new Uint16Array(0);
  let state     = new Uint8Array(0);
  let meshSlot  = new Int16Array(0);

  /* ── capacity ────────────────────────────────── */
  function _nextCap(size) {
    let n = Math.max(16, capacity);
    while (n < size) n *= 2;
    return n;
  }

  function _ensureCap(size) {
    if (size <= capacity) return;
    capacity = _nextCap(size);
    type     = new Uint8Array(capacity);
    posX     = new Float32Array(capacity);
    posZ     = new Float32Array(capacity);
    gridX    = new Uint16Array(capacity);
    gridZ    = new Uint16Array(capacity);
    state    = new Uint8Array(capacity);
    meshSlot = new Int16Array(capacity);
    meshSlot.fill(-1);
  }

  /* ── internal write ──────────────────────────── */
  function _write(i, itemType, gx, gz, initState, dungeon) {
    const w   = dungeon ? dungeon.toWorld(gx, gz) : { x: 0, z: 0 };
    type[i]     = itemType;
    posX[i]     = w.x;
    posZ[i]     = w.z;
    gridX[i]    = gx;
    gridZ[i]    = gz;
    state[i]    = initState;
    meshSlot[i] = -1;
  }

  /* ── lifecycle ───────────────────────────────── */
  function init(dungeon) {
    const items = [];

    for (const c of (dungeon.chests || [])) {
      items.push({
        t:  TYPES.chest,
        gx: c.gx,
        gz: c.gy,
        s:  c.opened ? STATES.open : STATES.closed,
      });
    }

    if (dungeon.bossEntrance) {
      items.push({
        t:  TYPES.boss_door,
        gx: dungeon.bossEntrance.wallTx,
        gz: dungeon.bossEntrance.wallTy,
        s:  STATES.closed,
      });
    }

    count     = items.length;
    ids       = new Array(count);
    indexById = new Map();
    _ensureCap(count);

    if (typeof SpatialManager !== 'undefined') SpatialManager.clear('items');
    for (let i = 0; i < count; i++) {
      const it  = items[i];
      const key = `${it.t}_${it.gx}_${it.gz}`;
      ids[i]    = key;
      indexById.set(key, i);
      _write(i, it.t, it.gx, it.gz, it.s, dungeon);
      if (typeof SpatialManager !== 'undefined') SpatialManager.insert('items', i, [posX[i], posZ[i]]);
    }
  }

  /* ── dynamic add (portals, runtime items) ────── */
  // Returns the slot index.  No-ops if already registered.
  function add(itemType, worldX, worldZ, initState = STATES.active, gx = 0, gz = 0) {
    const key = `${itemType}_${gx}_${gz}_${Math.round(worldX)}_${Math.round(worldZ)}`;
    if (indexById.has(key)) return indexById.get(key);

    const i = count++;
    _ensureCap(count);
    ids[i] = key;
    indexById.set(key, i);
    type[i]     = itemType;
    posX[i]     = worldX;
    posZ[i]     = worldZ;
    gridX[i]    = gx;
    gridZ[i]    = gz;
    state[i]    = initState;
    meshSlot[i] = -1;
    if (typeof SpatialManager !== 'undefined') SpatialManager.insert('items', i, [worldX, worldZ]);
    return i;
  }

  function clear() {
    count     = 0;
    ids       = [];
    indexById = new Map();
    if (typeof SpatialManager !== 'undefined') SpatialManager.clear('items');
  }

  /* ── per-slot API ────────────────────────────── */
  function getPos(i)      { return [posX[i], posZ[i]]; }
  function getGridPos(i)  { return [gridX[i], gridZ[i]]; }
  function getState(i)    { return state[i]; }
  function setState(i, s) { state[i] = s; }
  function getType(i)     { return type[i]; }
  function indexOf(id)    { return indexById.get(id) ?? -1; }

  function findByType(t) {
    const out = [];
    for (let i = 0; i < count; i++) if (type[i] === t) out.push(i);
    return out;
  }

  /* ── bulk read ───────────────────────────────── */
  function arrays() {
    return {
      count, capacity, ids,
      type, posX, posZ,
      gridX, gridZ,
      state, meshSlot,
    };
  }

  /* ── public ──────────────────────────────────── */
  return {
    TYPES,
    STATES,
    init,
    add,
    clear,
    getPos,
    getGridPos,
    getState,
    setState,
    getType,
    indexOf,
    findByType,
    arrays,
    count: () => count,
  };

})();
