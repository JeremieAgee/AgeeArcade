/* ═══════════════════════════════════════════════════
   floor-manager.js  —  Floor-level state flags
   Exports: FloorManager (window global)

   Tracks which events have fired on the current floor
   (boss spawned, door opened, exit revealed, etc.).
   game.js owns the authoritative booleans today;
   FloorManager mirrors them so managers & systems
   can read floor state without coupling to game.js.
════════════════════════════════════════════════════ */
window.FloorManager = (() => {

  let _floor = 0;

  const _flags = {
    bossSpawned:  false,
    bossDefeated: false,
    doorOpened:   false,
    exitOpen:     false,
    stairActive:  false,
  };

  /* ── lifecycle ───────────────────────────────── */
  function init(floorNum) {
    _floor = floorNum;
    for (const k in _flags) _flags[k] = false;
  }

  function clear() {
    _floor = 0;
    for (const k in _flags) _flags[k] = false;
  }

  /* ── flags ───────────────────────────────────── */
  function setFlag(name, val) {
    if (name in _flags) _flags[name] = !!val;
  }

  function getFlag(name) {
    return _flags[name] ?? false;
  }

  /* ── snapshot / restore (for save system) ────── */
  function snapshot() {
    return { floor: _floor, flags: { ..._flags } };
  }

  function restore(snap) {
    _floor = Math.max(1, Number.parseInt(snap.floor, 10) || 1);
    const f = snap.flags || {};
    for (const k in _flags) _flags[k] = !!(f[k]);
  }

  /* ── public ──────────────────────────────────── */
  return {
    init,
    clear,
    setFlag,
    getFlag,
    floor:    () => _floor,
    snapshot,
    restore,
  };

})();
