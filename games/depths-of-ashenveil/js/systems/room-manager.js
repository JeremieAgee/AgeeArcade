/* ═══════════════════════════════════════════════════
   room-manager.js  —  SOA room registry
   Exports: RoomManager (window global)

   SOA layout — each index i is one room:
     ids[i]     — string room ID  ('room_0', 'room_boss', …)
     width[i]   — tile width  (x dimension)
     length[i]  — tile length (z dimension)
     centerX[i] — world-unit X of room center
     centerZ[i] — world-unit Z of room center
     originX[i] — grid-tile x origin (top-left corner)
     originZ[i] — grid-tile z origin

   Removal:  removeAt(i) splices every array at index i —
             all indices above i shift down by one.
   Lookup:   getRoomIdAt(worldX, worldZ) → id string or null
════════════════════════════════════════════════════ */
window.RoomManager = (() => {

  /* ── Per-room tile mesh registry ────────────── */
  // roomId → { wall, floor, corridor, bossFloor } THREE.InstancedMesh
  const _meshes = new Map();

  function registerRoomMeshes(roomId, wall, floor, corridor, bossFloor) {
    _meshes.set(roomId, { wall, floor, corridor, bossFloor });
  }

  function clearMeshes() { _meshes.clear(); }

  // Toggle castShadow on nearby rooms. scanRoomIds is the Set from engine-core.
  function updateShadows(scanRoomIds) {
    _meshes.forEach((m, roomId) => {
      const near = roomId !== null && scanRoomIds.has(roomId);
      if (m.wall)      m.wall.castShadow      = near;
      if (m.floor)     m.floor.castShadow     = near;
      if (m.corridor)  m.corridor.castShadow  = near;
      if (m.bossFloor) m.bossFloor.castShadow = near;
    });
  }

  /* ── SOA arrays ──────────────────────────────── */
  let _count   = 0;
  let ids      = [];
  let width    = new Uint16Array(0);
  let length   = new Uint16Array(0);
  let centerX  = new Float32Array(0);
  let centerZ  = new Float32Array(0);
  let originX  = new Uint16Array(0);
  let originZ  = new Uint16Array(0);

  /* ── capacity ────────────────────────────────── */
  let _cap = 0;

  function _ensureCap(need) {
    if (need <= _cap) return;
    _cap = Math.max(need, Math.max(16, _cap * 2));
    const nw = new Uint16Array(_cap);
    const nl = new Uint16Array(_cap);
    const cx = new Float32Array(_cap);
    const cz = new Float32Array(_cap);
    const ox = new Uint16Array(_cap);
    const oz = new Uint16Array(_cap);
    nw.set(width.subarray(0, _count));
    nl.set(length.subarray(0, _count));
    cx.set(centerX.subarray(0, _count));
    cz.set(centerZ.subarray(0, _count));
    ox.set(originX.subarray(0, _count));
    oz.set(originZ.subarray(0, _count));
    width   = nw; length  = nl;
    centerX = cx; centerZ = cz;
    originX = ox; originZ = oz;
  }

  /* ── lifecycle ───────────────────────────────── */
  function clear() {
    _count = 0;
    ids = [];
    _meshes.clear();
  }

  /* ── add ─────────────────────────────────────── */
  // gx, gz  — grid-tile origin (top-left)
  // gw, gh  — width and height in tiles
  // wx, wz  — world-unit center
  function add(id, gx, gz, gw, gh, wx, wz) {
    _ensureCap(_count + 1);
    const i    = _count++;
    ids[i]     = id;
    width[i]   = gw;
    length[i]  = gh;
    centerX[i] = wx;
    centerZ[i] = wz;
    originX[i] = gx;
    originZ[i] = gz;
    return i;
  }

  /* ── remove ──────────────────────────────────── */
  // Swap-delete: copies the last slot into i and decrements count.
  // O(1). Indices above i are NOT shifted — callers must re-lookup
  // after removal if they hold indices into the arrays.
  function removeAt(i) {
    if (i < 0 || i >= _count) return;
    const last = _count - 1;
    if (i !== last) {
      ids[i]      = ids[last];
      width[i]    = width[last];
      length[i]   = length[last];
      centerX[i]  = centerX[last];
      centerZ[i]  = centerZ[last];
      originX[i]  = originX[last];
      originZ[i]  = originZ[last];
    }
    ids.length = last;
    _count = last;
  }

  /* ── lookup ──────────────────────────────────── */
  function indexOf(id) { return ids.indexOf(id); }

  // World position → room ID string, or null if in a corridor / outside.
  // TILE is the dungeon tile size in world units.
  function getRoomIdAt(worldX, worldZ, TILE) {
    const gx = Math.floor(worldX / TILE);
    const gz = Math.floor(worldZ / TILE);
    for (let i = 0; i < _count; i++) {
      if (gx >= originX[i] && gx < originX[i] + width[i] &&
          gz >= originZ[i] && gz < originZ[i] + length[i]) {
        return ids[i];
      }
    }
    return null;
  }

  // Grid coords → room ID string, or null.
  function getRoomIdAtGrid(gx, gz) {
    for (let i = 0; i < _count; i++) {
      if (gx >= originX[i] && gx < originX[i] + width[i] &&
          gz >= originZ[i] && gz < originZ[i] + length[i]) {
        return ids[i];
      }
    }
    return null;
  }

  /* ── init from dungeon object ────────────────── */
  // Call once per floor after Dungeon.generate().
  function init(dungeon) {
    clear();
    const TILE = dungeon.TILE;

    const allRooms = [...(dungeon.rooms || [])];
    if (dungeon.bossRoom) allRooms.push(dungeon.bossRoom);

    for (let i = 0; i < allRooms.length; i++) {
      const r  = allRooms[i];
      const isBoss = i === allRooms.length - 1 && !!dungeon.bossRoom;
      const id = isBoss ? 'room_boss' : `room_${i}`;
      const c  = dungeon.roomCenter(r);
      const wx = c.cx * TILE + TILE / 2;
      const wz = c.cy * TILE + TILE / 2;
      add(id, r.x, r.y, r.w, r.h, wx, wz);
    }
  }

  /* ── per-slot accessors ──────────────────────── */
  function getId(i)     { return ids[i]; }
  function getCenter(i) { return [centerX[i], centerZ[i]]; }
  function getSize(i)   { return [width[i], length[i]]; }
  function getOrigin(i) { return [originX[i], originZ[i]]; }

  /* ── bulk read ───────────────────────────────── */
  function arrays() {
    return {
      count: _count, ids,
      width, length, centerX, centerZ, originX, originZ,
    };
  }

  /* ── public ──────────────────────────────────── */
  return {
    clear,
    init,
    add,
    removeAt,
    indexOf,
    getRoomIdAt,
    getRoomIdAtGrid,
    getId,
    getCenter,
    getSize,
    getOrigin,
    arrays,
    count: () => _count,
    registerRoomMeshes,
    updateShadows,
    clearMeshes,
  };

})();
