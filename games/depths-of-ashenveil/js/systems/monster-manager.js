/* ═══════════════════════════════════════════════════
   monster-manager.js  —  Per-type SOA monster managers
   Exports: MonsterManager (factory), and named globals:
     SkeletonManager  — skeleton + archer (both undead)
     GoblinManager    — goblin
     WraithManager    — wraith
     TrollManager     — troll
     ShardGolemManager — shardgolem
     BossManager      — boss (all boss variants)

   pos = [X, Z] world units via getPos(i) / setPos(i, [X,Z]).
   Each manager owns only its type(s) — sync() filters the
   shared enemies[] array and writes only matching slots.
════════════════════════════════════════════════════ */
window.MonsterManager = (() => {

  const STATE_IDS = { idle: 0, chase: 1, attack: 2, dead: 255 };

  /* ── factory ─────────────────────────────────── */
  // typeKeys — array of enemy.typeKey strings this manager owns.
  function create(typeKeys) {
    const _keys = new Set(Array.isArray(typeKeys) ? typeKeys : [typeKeys]);

    let count     = 0;
    let capacity  = 0;
    let ids       = [];
    let indexById = new Map();

    let posX     = new Float32Array(0);
    let posZ     = new Float32Array(0);
    let rotY     = new Float32Array(0);
    let state    = new Uint8Array(0);
    let hp       = new Float32Array(0);
    let maxHp    = new Float32Array(0);
    let animTime = new Float32Array(0);
    let atkTime  = new Float32Array(0);
    let hitFlash = new Float32Array(0);
    let meshSlot = new Int16Array(0);
    let roomId   = [];              // string room ID from RoomManager

    /* ── capacity ──────────────────────────────── */
    function _nextCap(size) {
      let n = Math.max(16, capacity);
      while (n < size) n *= 2;
      return n;
    }

    function _ensureCap(size) {
      if (size <= capacity) return;
      const nc    = _nextCap(size);
      // Preserve animTime across realloc so animation doesn't reset mid-fight.
      const oldAT = animTime;
      const oldN  = Math.min(count, nc);
      posX     = new Float32Array(nc);
      posZ     = new Float32Array(nc);
      rotY     = new Float32Array(nc);
      state    = new Uint8Array(nc);
      hp       = new Float32Array(nc);
      maxHp    = new Float32Array(nc);
      animTime = new Float32Array(nc);
      atkTime  = new Float32Array(nc);
      hitFlash = new Float32Array(nc);
      meshSlot = new Int16Array(nc);
      animTime.set(oldAT.subarray(0, oldN));
      meshSlot.fill(-1);
      capacity = nc;
    }

    /* ── write one enemy slot ──────────────────── */
    function _stateId(e) {
      if (e.dead) return STATE_IDS.dead;
      return STATE_IDS[e.state] ?? STATE_IDS.idle;
    }

    function _write(i, e) {
      ids[i]      = e.id;
      indexById.set(e.id, i);
      posX[i]     = e.x || 0;
      posZ[i]     = e.z || 0;
      rotY[i]     = e.mesh ? e.mesh.rotation.y : 0;
      state[i]    = _stateId(e);
      hp[i]       = e.hp     || 0;
      maxHp[i]    = e.maxHp  || 0;
      animTime[i] += 1;
      atkTime[i]  = e.atkAnim  || 0;
      hitFlash[i] = e.hitFlash || 0;
      roomId[i]   = e.roomId   || null;
    }

    /* ── full rebuild from enemies[] (floor load only) ── */
    function sync(allEnemies) {
      const mine = Array.isArray(allEnemies)
        ? allEnemies.filter(e => _keys.has(e.typeKey) && !e.dead)
        : [];
      count     = mine.length;
      _ensureCap(count);
      ids       = new Array(count);
      indexById = new Map();
      roomId    = new Array(count).fill(null);
      meshSlot.fill(-1, 0, count);
      for (let i = 0; i < mine.length; i++) _write(i, mine[i]);
      return count;
    }

    /* ── swap-delete removal — O(1) ───────────── */
    // Swaps slot i with the last slot and decrements count.
    // All arrays stay index-aligned. Callers must re-lookup
    // the moved entity (previously at 'last') by id after removal.
    function removeAt(i) {
      if (i < 0 || i >= count) return;
      const last   = count - 1;
      const deadId = ids[i];
      if (i !== last) {
        ids[i]      = ids[last];
        posX[i]     = posX[last];
        posZ[i]     = posZ[last];
        rotY[i]     = rotY[last];
        state[i]    = state[last];
        hp[i]       = hp[last];
        maxHp[i]    = maxHp[last];
        animTime[i] = animTime[last];
        atkTime[i]  = atkTime[last];
        hitFlash[i] = hitFlash[last];
        meshSlot[i] = meshSlot[last];
        roomId[i]   = roomId[last];
        indexById.set(ids[i], i);
      }
      indexById.delete(deadId);
      ids.length    = last;
      roomId.length = last;
      count = last;
    }

    /* ── per-slot API ──────────────────────────── */
    function getPos(i)          { return [posX[i], posZ[i]]; }
    function setPos(i, pos)     { posX[i] = pos[0]; posZ[i] = pos[1]; }
    function getRoomId(i)       { return roomId[i]; }
    function setRoomId(i, id)   { roomId[i] = id; }
    function indexOf(id)        { return indexById.get(id) ?? -1; }
    function owns(typeKey)      { return _keys.has(typeKey); }

    /* ── bulk read ─────────────────────────────── */
    function arrays() {
      return {
        typeKeys: [..._keys],
        count, capacity, ids, roomId,
        posX, posZ, rotY,
        state, hp, maxHp,
        animTime, atkTime, hitFlash,
        meshSlot,
      };
    }

    return { typeKeys: [..._keys], sync, removeAt, getPos, setPos, getRoomId, setRoomId, indexOf, owns, arrays, count: () => count };
  }

  /* ── syncAll helper ──────────────────────────── */
  // Called once per frame after enemies[] is updated.
  function syncAll(allEnemies) {
    for (const mgr of MonsterManager.ALL) mgr.sync(allEnemies);
  }

  return { create, syncAll, STATE_IDS };

})();

/* ── Named per-type manager instances ────────────────
   Skeleton + Archer share one manager (both undead).
──────────────────────────────────────────────────── */
window.SkeletonManager   = window.MonsterManager.create(['skeleton', 'archer']);
window.GoblinManager     = window.MonsterManager.create(['goblin']);
window.WraithManager     = window.MonsterManager.create(['wraith']);
window.TrollManager      = window.MonsterManager.create(['troll']);
window.ShardGolemManager = window.MonsterManager.create(['shardgolem']);
window.BossManager       = window.MonsterManager.create(['boss']);

/* Ordered list for iteration (e.g. syncAll, instanced draw calls). */
window.MonsterManager.ALL = [
  window.SkeletonManager,
  window.GoblinManager,
  window.WraithManager,
  window.TrollManager,
  window.ShardGolemManager,
  window.BossManager,
];
