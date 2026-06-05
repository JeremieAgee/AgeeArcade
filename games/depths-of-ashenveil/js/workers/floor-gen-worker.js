/* ═══════════════════════════════════════════════════
   floor-gen-worker.js — Off-thread floor generation
   Runs Dungeon.generate() + Enemies.spawnAll() on a
   background thread. Three.js geometry stays on the
   main thread (WebGL requires it).

   Messages IN:
     { type: 'generate', floor: N, requestId: string }

   Messages OUT:
     { type: 'ready', floor: N, requestId: string,
       dungeon: <serialized>, spawns: [], boss: {} }
     { type: 'error', floor: N, requestId: string,
       message: string }
════════════════════════════════════════════════════ */
importScripts('../core/dungeon.js', '../systems/enemies.js');

function serializeDungeon(d) {
  return {
    TILE:         d.TILE,
    WALL_H:       d.WALL_H,
    COLS:         d.COLS,
    ROWS:         d.ROWS,
    grid:         d.grid.map(row => Array.from(row)),
    rooms:        d.rooms,
    startRoom:    d.startRoom,
    bossRoom:     d.bossRoom,
    bossEntrance: d.bossEntrance,
    spawns:       d.spawns,
    lanterns:     d.lanterns,
    chests:       d.chests,
  };
}

self.onmessage = function (e) {
  const { type, floor, requestId } = e.data;
  if (type !== 'generate') return;

  try {
    const d      = Dungeon.generate(floor);
    const spawns = Enemies.spawnAll(d, floor);
    const boss   = d.bossRoom ? Enemies.createBoss(d.bossRoom, floor, d) : null;

    self.postMessage({
      type:      'ready',
      floor,
      requestId,
      dungeon:   serializeDungeon(d),
      spawns,
      boss,
    });
  } catch (err) {
    self.postMessage({
      type:      'error',
      floor,
      requestId,
      message:   err && err.message ? err.message : String(err),
    });
  }
};
