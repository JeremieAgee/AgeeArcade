/* ═══════════════════════════════════════════════════
   floor-manager.js  —  Floor-level state & coordinator
   Exports: FloorManager (window global)

   Owns floor flags (boss spawned, door opened, etc.)
   and coordinates the per-floor init/clear of all
   room-aware managers:
     RoomManager   — room SOA (IDs, bounds, centers)
     LightManager  — torch SOA (roomId links to RoomManager)
     MonsterManager — monster SOA (roomId links to RoomManager)

   Call FloorManager.init(dungeon, floorNum) once per
   floor immediately after dungeon generation. It will
   init RoomManager first (so LightManager can resolve
   roomIds), then LightManager, then clear MonsterManager.
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
  function init(dungeon, floorNum) {
    _floor = floorNum;
    for (const k in _flags) _flags[k] = false;

    // RoomManager must init first — LightManager reads from it
    if (typeof RoomManager !== 'undefined') RoomManager.init(dungeon);

    // LightManager resolves roomIds via RoomManager
    if (typeof LightManager !== 'undefined') LightManager.init(dungeon);

    // MonsterManager SOA is rebuilt each sync — just clear roomId state
    if (typeof MonsterManager !== 'undefined') MonsterManager.syncAll([]);
  }

  function clear() {
    _floor = 0;
    for (const k in _flags) _flags[k] = false;
    if (typeof RoomManager    !== 'undefined') RoomManager.clear();
    if (typeof LightManager   !== 'undefined') LightManager.clear();
  }

  /* ── flags ───────────────────────────────────── */
  function setFlag(name, val) {
    if (name in _flags) _flags[name] = !!val;
  }

  function getFlag(name) {
    return _flags[name] ?? false;
  }

  /* ── snapshot / restore (save system) ───────── */
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
