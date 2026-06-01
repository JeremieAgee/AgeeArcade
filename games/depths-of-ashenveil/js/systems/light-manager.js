/* ═══════════════════════════════════════════════════
   light-manager.js  —  SOA for wall torches / lanterns
   Exports: LightManager (window global)

   SOA layout — each index i is one light:
     ids[i]       — string ID  ('light_0', …)
     pointX/Z/Y   — world position
     gridX/Z      — tile coordinates
     roomId[i]    — room ID string from RoomManager (null = corridor / unassigned)
     wallDir      — which face the sconce is on
     isLit        — runtime lit state (1 = lit)
     hasTorch     — torch present (1 = yes)
     intensity    — base brightness 0–1
     lightRange   — world-unit radius
     colorR/G/B   — per-light colour

   removeAt(i)  — ordered removal; shifts all arrays down from i.
   init(dungeon) — call after RoomManager.init(dungeon).
════════════════════════════════════════════════════ */
window.LightManager = (() => {

  const DIR = { north: 0, south: 1, east: 2, west: 3 };

  /* ── Defaults ────────────────────────────────── */
  const DEFAULT_INTENSITY = 1.0;
  const DEFAULT_RANGE     = 10.0;
  const DEFAULT_COLOR     = 0xff8833;

  /* ── SOA arrays ──────────────────────────────── */
  let count      = 0;
  let capacity   = 0;
  let ids        = [];
  let roomId     = [];              // string room ID from RoomManager
  let posX       = new Float32Array(0);
  let posZ       = new Float32Array(0);
  let gridX      = new Uint16Array(0);
  let gridZ      = new Uint16Array(0);
  let wallDir    = new Uint8Array(0);
  let isLit      = new Uint8Array(0);
  let hasTorch   = new Uint8Array(0);
  let intensity  = new Float32Array(0);
  let lightRange = new Float32Array(0);
  let colorR     = new Uint8Array(0);
  let colorG     = new Uint8Array(0);
  let colorB     = new Uint8Array(0);
  let meshSlot   = new Int16Array(0);

  /* ── Per-cell precomputed map ────────────────── */
  let _cellIntensity = new Float32Array(0);
  let _cellR         = new Float32Array(0);
  let _cellG         = new Float32Array(0);
  let _cellB         = new Float32Array(0);
  let _mapCols       = 0;
  let _mapRows       = 0;
  let _mapCellSize   = 1;

  /* ── Capacity ────────────────────────────────── */
  function _nextCap(n) {
    let c = Math.max(16, capacity);
    while (c < n) c *= 2;
    return c;
  }

  function _ensureCap(need) {
    if (need <= capacity) return;
    const nc   = _nextCap(need);
    const npX  = new Float32Array(nc);
    const npZ  = new Float32Array(nc);
    const ngX  = new Uint16Array(nc);
    const ngZ  = new Uint16Array(nc);
    const nwd  = new Uint8Array(nc);
    const nlit = new Uint8Array(nc);
    const nht  = new Uint8Array(nc);
    const nint = new Float32Array(nc);
    const nlr  = new Float32Array(nc);
    const ncR  = new Uint8Array(nc);
    const ncG  = new Uint8Array(nc);
    const ncB  = new Uint8Array(nc);
    const nms  = new Int16Array(nc);
    nms.fill(-1);
    npX.set(posX.subarray(0, count));
    npZ.set(posZ.subarray(0, count));
    ngX.set(gridX.subarray(0, count));
    ngZ.set(gridZ.subarray(0, count));
    nwd.set(wallDir.subarray(0, count));
    nlit.set(isLit.subarray(0, count));
    nht.set(hasTorch.subarray(0, count));
    nint.set(intensity.subarray(0, count));
    nlr.set(lightRange.subarray(0, count));
    ncR.set(colorR.subarray(0, count));
    ncG.set(colorG.subarray(0, count));
    ncB.set(colorB.subarray(0, count));
    nms.set(meshSlot.subarray(0, count));
    posX = npX; posZ = npZ; gridX = ngX; gridZ = ngZ;
    wallDir = nwd; isLit = nlit; hasTorch = nht;
    intensity = nint; lightRange = nlr;
    colorR = ncR; colorG = ncG; colorB = ncB;
    meshSlot = nms;
    capacity = nc;
  }

  /* ── Lifecycle ───────────────────────────────── */
  // Call after RoomManager.init(dungeon) so roomId can be resolved.
  function init(dungeon) {
    const lans = dungeon.lanterns || [];
    count = lans.length;
    _ensureCap(count);
    ids    = new Array(count);
    roomId = new Array(count);

    const TILE = dungeon.TILE;

    for (let i = 0; i < count; i++) {
      const lan     = lans[i];
      const w       = dungeon.toWorld(lan.x, lan.y);
      ids[i]        = `light_${i}`;
      // Resolve room ID via RoomManager if available
      roomId[i]     = (typeof RoomManager !== 'undefined')
        ? RoomManager.getRoomIdAtGrid(lan.x, lan.y) ?? `room_${lan.roomIndex ?? -1}`
        : `room_${lan.roomIndex ?? -1}`;
      posX[i]       = w.x;
      posZ[i]       = w.z;
      gridX[i]      = lan.x;
      gridZ[i]      = lan.y;
      wallDir[i]    = 0;
      isLit[i]      = 1;
      hasTorch[i]   = 1;
      intensity[i]  = DEFAULT_INTENSITY;
      lightRange[i] = DEFAULT_RANGE;
      colorR[i]     = (DEFAULT_COLOR >> 16) & 0xff;
      colorG[i]     = (DEFAULT_COLOR >>  8) & 0xff;
      colorB[i]     = (DEFAULT_COLOR      ) & 0xff;
      meshSlot[i]   = -1;
    }

    _cellIntensity = new Float32Array(0);

    if (typeof SpatialManager !== 'undefined') {
      SpatialManager.clear('lights');
      for (let i = 0; i < count; i++) SpatialManager.insert('lights', i, [posX[i], posZ[i]]);
    }
  }

  function clear() {
    count  = 0;
    ids    = [];
    roomId = [];
    _cellIntensity = new Float32Array(0);
    _mapCols = 0; _mapRows = 0;
    if (typeof SpatialManager !== 'undefined') SpatialManager.clear('lights');
  }

  /* ── Swap-delete removal ─────────────────────── */
  // Copies the last slot into i and decrements count — O(1).
  // Callers must re-lookup indices after any removal.
  function removeAt(i) {
    if (i < 0 || i >= count) return;
    const last = count - 1;
    if (typeof SpatialManager !== 'undefined') {
      SpatialManager.remove('lights', last);
      SpatialManager.remove('lights', i);
    }
    if (i !== last) {
      ids[i]        = ids[last];
      roomId[i]     = roomId[last];
      posX[i]       = posX[last];
      posZ[i]       = posZ[last];
      gridX[i]      = gridX[last];
      gridZ[i]      = gridZ[last];
      wallDir[i]    = wallDir[last];
      isLit[i]      = isLit[last];
      hasTorch[i]   = hasTorch[last];
      intensity[i]  = intensity[last];
      lightRange[i] = lightRange[last];
      colorR[i]     = colorR[last];
      colorG[i]     = colorG[last];
      colorB[i]     = colorB[last];
      meshSlot[i]   = meshSlot[last];
      // Re-register the moved slot under its new index
      if (typeof SpatialManager !== 'undefined') SpatialManager.insert('lights', i, [posX[i], posZ[i]]);
    }
    ids.length    = last;
    roomId.length = last;
    count = last;
  }

  /* ── Cell intensity map ──────────────────────── */
  function buildCellMap(lightGrid) {
    _mapCols     = lightGrid.numCols();
    _mapRows     = lightGrid.numRows();
    _mapCellSize = lightGrid.cellSize();

    const total    = _mapCols * _mapRows;
    _cellIntensity = new Float32Array(total);
    _cellR         = new Float32Array(total);
    _cellG         = new Float32Array(total);
    _cellB         = new Float32Array(total);

    const halfCell = _mapCellSize * 0.5;

    for (let li = 0; li < count; li++) {
      if (!isLit[li]) continue;
      const lx  = posX[li], lz = posZ[li];
      const rng = lightRange[li], itv = intensity[li];
      const lr  = colorR[li] / 255, lg = colorG[li] / 255, lb = colorB[li] / 255;

      const minCx = Math.max(0,            Math.floor((lx - rng) / _mapCellSize));
      const maxCx = Math.min(_mapCols - 1, Math.floor((lx + rng) / _mapCellSize));
      const minCz = Math.max(0,            Math.floor((lz - rng) / _mapCellSize));
      const maxCz = Math.min(_mapRows - 1, Math.floor((lz + rng) / _mapCellSize));

      for (let cz = minCz; cz <= maxCz; cz++) {
        const cellCz = cz * _mapCellSize + halfCell;
        for (let cx = minCx; cx <= maxCx; cx++) {
          const dx   = lx - (cx * _mapCellSize + halfCell);
          const dz   = lz - cellCz;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist >= rng) continue;
          const contrib = itv * (1 - dist / rng);
          const idx     = cz * _mapCols + cx;
          _cellIntensity[idx] = Math.min(1, _cellIntensity[idx] + contrib);
          _cellR[idx] = Math.min(1, _cellR[idx] + lr * contrib);
          _cellG[idx] = Math.min(1, _cellG[idx] + lg * contrib);
          _cellB[idx] = Math.min(1, _cellB[idx] + lb * contrib);
        }
      }
    }
  }

  function getCellIntensity(cx, cz) {
    if (_mapCols === 0 || cx < 0 || cx >= _mapCols || cz < 0 || cz >= _mapRows) return 0;
    return _cellIntensity[cz * _mapCols + cx];
  }

  function getAmbientAt(pos, lightGrid) {
    if (!lightGrid || _mapCols === 0) return 0;
    const [cx, cz] = lightGrid.toCell(pos);
    return getCellIntensity(cx, cz);
  }

  function getColorAt(pos, lightGrid) {
    if (!lightGrid || _mapCols === 0) return 0x000000;
    const [cx, cz] = lightGrid.toCell(pos);
    if (cx < 0 || cx >= _mapCols || cz < 0 || cz >= _mapRows) return 0x000000;
    const idx = cz * _mapCols + cx;
    const iv  = _cellIntensity[idx];
    if (iv === 0) return 0x000000;
    const r = Math.round((_cellR[idx] / iv) * 255);
    const g = Math.round((_cellG[idx] / iv) * 255);
    const b = Math.round((_cellB[idx] / iv) * 255);
    return (r << 16) | (g << 8) | b;
  }

  /* ── Per-slot accessors ──────────────────────── */
  function getPos(i)          { return [posX[i], posZ[i]]; }
  function getGridPos(i)      { return [gridX[i], gridZ[i]]; }
  function getRoomId(i)       { return roomId[i]; }
  function setRoomId(i, id)   { roomId[i] = id; }
  function setDir(i, dir)     { wallDir[i]    = dir; }
  function setLit(i, val)     { isLit[i]      = val ? 1 : 0; }
  function setHasTorch(i, v)  { hasTorch[i]   = v   ? 1 : 0; }
  function setIntensity(i, v) { intensity[i]  = Math.max(0, Math.min(1, v)); }
  function setRange(i, r)     { lightRange[i] = Math.max(0, r); }
  function setColor(i, hex) {
    colorR[i] = (hex >> 16) & 0xff;
    colorG[i] = (hex >>  8) & 0xff;
    colorB[i] = (hex      ) & 0xff;
  }

  function indexOf(id) { return ids.indexOf(id); }

  /* ── Bulk read ───────────────────────────────── */
  function arrays() {
    return {
      count, capacity, ids, roomId,
      posX, posZ, gridX, gridZ,
      wallDir, isLit, hasTorch,
      intensity, lightRange,
      colorR, colorG, colorB,
      meshSlot,
    };
  }

  return {
    DIR,
    DEFAULT_INTENSITY,
    DEFAULT_RANGE,
    DEFAULT_COLOR,
    init,
    clear,
    removeAt,
    buildCellMap,
    getCellIntensity,
    getAmbientAt,
    getColorAt,
    getPos,
    getGridPos,
    getRoomId,
    setRoomId,
    setDir,
    setLit,
    setHasTorch,
    setIntensity,
    setRange,
    setColor,
    indexOf,
    arrays,
    count: () => count,
  };

})();
