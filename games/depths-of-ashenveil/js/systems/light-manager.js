/* ═══════════════════════════════════════════════════
   light-manager.js  —  SOA for wall torches / lanterns
   Exports: LightManager (window global)

   pos = [X, Z] world units.
   gridPos = [GX, GZ] tile coordinates.
   wallDir  — which face the sconce is mounted on.
   isLit / hasTorch — runtime toggle state.
   intensity — base brightness (0–1). Default 1.0.
   lightRange — world-unit radius of influence. Default 10.
   meshSlot — future instanced-mesh batch index (-1 = unassigned).

   Cell intensity map (spatial-aware lighting):
     After init(), call buildCellMap(lightGrid) once per floor.
     This pre-computes a Float32Array of ambient intensity for
     every spatial grid cell, accumulating contributions from
     every lit torch within range of that cell's centre.

     getCellIntensity(cx, cz)          — lookup one cell
     getAmbientAt([X,Z], lightGrid)    — lookup by world pos
     getColorAt([X,Z], lightGrid)      — packed 0xRRGGBB blend
════════════════════════════════════════════════════ */
window.LightManager = (() => {

  const DIR = { north: 0, south: 1, east: 2, west: 3 };

  /* ── Default torch parameters ────────────────── */
  const DEFAULT_INTENSITY = 1.0;
  const DEFAULT_RANGE     = 10.0;    // world units
  const DEFAULT_COLOR     = 0xff8833; // warm orange

  /* ── SOA arrays ──────────────────────────────── */
  let count     = 0;
  let capacity  = 0;
  let ids       = [];
  let posX      = new Float32Array(0);
  let posZ      = new Float32Array(0);
  let gridX     = new Uint16Array(0);
  let gridZ     = new Uint16Array(0);
  let wallDir   = new Uint8Array(0);
  let isLit     = new Uint8Array(0);
  let hasTorch  = new Uint8Array(0);
  let intensity = new Float32Array(0);   // per-torch brightness 0–1
  let lightRange = new Float32Array(0);  // per-torch world-unit radius
  let colorR    = new Uint8Array(0);     // per-torch RGB components
  let colorG    = new Uint8Array(0);
  let colorB    = new Uint8Array(0);
  let meshSlot  = new Int16Array(0);

  /* ── Per-cell precomputed map ────────────────── */
  let _cellIntensity = new Float32Array(0); // flat [cz * numCols + cx]
  let _cellR         = new Float32Array(0); // accumulated R
  let _cellG         = new Float32Array(0); // accumulated G
  let _cellB         = new Float32Array(0); // accumulated B
  let _mapCols       = 0;
  let _mapRows       = 0;
  let _mapCellSize   = 1;

  /* ── Capacity ────────────────────────────────── */
  function _nextCap(size) {
    let n = Math.max(16, capacity);
    while (n < size) n *= 2;
    return n;
  }

  function _ensureCap(size) {
    if (size <= capacity) return;
    capacity   = _nextCap(size);
    posX       = new Float32Array(capacity);
    posZ       = new Float32Array(capacity);
    gridX      = new Uint16Array(capacity);
    gridZ      = new Uint16Array(capacity);
    wallDir    = new Uint8Array(capacity);
    isLit      = new Uint8Array(capacity);
    hasTorch   = new Uint8Array(capacity);
    intensity  = new Float32Array(capacity);
    lightRange = new Float32Array(capacity);
    colorR     = new Uint8Array(capacity);
    colorG     = new Uint8Array(capacity);
    colorB     = new Uint8Array(capacity);
    meshSlot   = new Int16Array(capacity);
    meshSlot.fill(-1);
  }

  /* ── Lifecycle ───────────────────────────────── */
  function init(dungeon) {
    const lans = dungeon.lanterns || [];
    count = lans.length;
    _ensureCap(count);
    ids = new Array(count);

    for (let i = 0; i < count; i++) {
      const lan    = lans[i];
      const w      = dungeon.toWorld(lan.x, lan.y);
      ids[i]       = `light_${i}`;
      posX[i]      = w.x;
      posZ[i]      = w.z;
      gridX[i]     = lan.x;
      gridZ[i]     = lan.y;
      wallDir[i]   = 0;              // engine fills real direction on build
      isLit[i]     = 1;
      hasTorch[i]  = 1;
      intensity[i] = DEFAULT_INTENSITY;
      lightRange[i] = DEFAULT_RANGE;
      colorR[i]    = (DEFAULT_COLOR >> 16) & 0xff;
      colorG[i]    = (DEFAULT_COLOR >>  8) & 0xff;
      colorB[i]    = (DEFAULT_COLOR      ) & 0xff;
      meshSlot[i]  = -1;
    }

    // Clear stale cell map until buildCellMap() is called.
    _cellIntensity = new Float32Array(0);
  }

  function clear() {
    count = 0;
    ids   = [];
    _cellIntensity = new Float32Array(0);
    _mapCols = 0; _mapRows = 0;
  }

  /* ── Cell intensity map ──────────────────────── */
  // Call once after init() + LightGrid.init().
  // Walks every lit torch and splats its falloff contribution onto
  // every grid cell whose centre falls within lightRange.
  // Intensity uses inverse-linear falloff:  contrib = 1 - (dist / range)
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

      const lx  = posX[li];
      const lz  = posZ[li];
      const rng = lightRange[li];
      const itv = intensity[li];
      const lr  = colorR[li] / 255;
      const lg  = colorG[li] / 255;
      const lb  = colorB[li] / 255;

      // Bounding box of cells this torch can affect
      const minCx = Math.max(0,           Math.floor((lx - rng) / _mapCellSize));
      const maxCx = Math.min(_mapCols - 1, Math.floor((lx + rng) / _mapCellSize));
      const minCz = Math.max(0,           Math.floor((lz - rng) / _mapCellSize));
      const maxCz = Math.min(_mapRows - 1, Math.floor((lz + rng) / _mapCellSize));

      for (let cz = minCz; cz <= maxCz; cz++) {
        const cellCz = cz * _mapCellSize + halfCell;
        for (let cx = minCx; cx <= maxCx; cx++) {
          const cellCx = cx * _mapCellSize + halfCell;
          const dx     = lx - cellCx;
          const dz     = lz - cellCz;
          const dist   = Math.sqrt(dx * dx + dz * dz);
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

  /* ── Per-cell & world-pos queries ────────────── */
  function getCellIntensity(cx, cz) {
    if (_mapCols === 0 || cx < 0 || cx >= _mapCols || cz < 0 || cz >= _mapRows) return 0;
    return _cellIntensity[cz * _mapCols + cx];
  }

  // World [X,Z] → ambient intensity 0–1 at that position.
  function getAmbientAt(pos, lightGrid) {
    if (!lightGrid || _mapCols === 0) return 0;
    const [cx, cz] = lightGrid.toCell(pos);
    return getCellIntensity(cx, cz);
  }

  // World [X,Z] → blended torch color as 0xRRGGBB integer.
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

  /* ── Per-slot setters ────────────────────────── */
  function getPos(i)              { return [posX[i], posZ[i]]; }
  function getGridPos(i)          { return [gridX[i], gridZ[i]]; }
  function setDir(i, dir)         { wallDir[i]    = dir; }
  function setLit(i, val)         { isLit[i]      = val ? 1 : 0; }
  function setHasTorch(i, v)      { hasTorch[i]   = v   ? 1 : 0; }
  function setIntensity(i, v)     { intensity[i]  = Math.max(0, Math.min(1, v)); }
  function setRange(i, r)         { lightRange[i] = Math.max(0, r); }
  function setColor(i, hex) {
    colorR[i] = (hex >> 16) & 0xff;
    colorG[i] = (hex >>  8) & 0xff;
    colorB[i] = (hex      ) & 0xff;
  }

  function indexOf(id) { return ids.indexOf(id); }

  /* ── Bulk read ───────────────────────────────── */
  function arrays() {
    return {
      count, capacity, ids,
      posX, posZ,
      gridX, gridZ,
      wallDir, isLit, hasTorch,
      intensity, lightRange,
      colorR, colorG, colorB,
      meshSlot,
    };
  }

  /* ── Public ──────────────────────────────────── */
  return {
    DIR,
    DEFAULT_INTENSITY,
    DEFAULT_RANGE,
    DEFAULT_COLOR,
    init,
    clear,
    // Cell map
    buildCellMap,
    getCellIntensity,
    getAmbientAt,
    getColorAt,
    // Per-slot
    getPos,
    getGridPos,
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
