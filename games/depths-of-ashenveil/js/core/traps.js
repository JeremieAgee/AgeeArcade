/* ═══════════════════════════════════════════════════
   traps.js  —  Trap placement, triggering, damage
   Exports: Traps (namespace)
════════════════════════════════════════════════════ */
const Traps = (() => {

  const TRAP_TYPES = {
    spike: {
      name: 'Pressure Spike',
      damage: 8,
      triggerDelay: 0.2,  // delay before spike rises
      activeTime: 0.4,    // how long spikes stay up
      radius: 1.2,
      color: 0xcc3333,
    },
    dart: {
      name: 'Dart Launcher',
      damage: 6,
      triggerDelay: 0.15,
      activeTime: 0.2,
      radius: 1.0,
      color: 0x8866cc,
    },
    flame: {
      name: 'Flame Jet',
      damage: 12,
      triggerDelay: 0.3,
      activeTime: 0.6,
      radius: 1.5,
      color: 0xff6600,
    },
    block: {
      name: 'Falling Block',
      damage: 15,
      triggerDelay: 0.4,
      activeTime: 0.3,
      radius: 1.8,
      color: 0x888888,
    },
  };

  function createTrap(x, z, typeKey) {
    const type = TRAP_TYPES[typeKey];
    if (!type) return null;
    return {
      id: Math.random().toString(36).slice(2),
      type: typeKey,
      x, z,
      state: 'idle',       // idle | triggered | active | cooldown
      timer: 0,
      triggered: false,
      hasHitPlayer: false, // prevent multiple hits per activation
      ...type,
    };
  }

  // Place traps in corridors based on floor number
  function generateTrapsForFloor(dungeon, floor) {
    const traps = [];
    if (!dungeon || !dungeon.grid) return traps;

    const TILE = dungeon.TILE || 4;
    const rooms = dungeon.rooms || [];

    // Scale trap density with floor
    const trapDensity = Math.min(0.12 + floor * 0.015, 0.25);

    // Determine which trap types to use
    const availableTypes = ['spike'];
    if (floor >= 2) availableTypes.push('dart');
    if (floor >= 4) availableTypes.push('flame');
    if (floor >= 6) availableTypes.push('block');

    // Scan corridors for trap placement
    for (let ty = 0; ty < dungeon.ROWS; ty++) {
      for (let tx = 0; tx < dungeon.COLS; tx++) {
        if (dungeon.grid[ty][tx] !== 3) continue; // only corridors

        // Don't place traps too close to rooms
        let nearRoom = false;
        for (const room of rooms) {
          const dx = tx - (room.x + room.w / 2);
          const dz = ty - (room.y + room.h / 2);
          if (Math.abs(dx) < 3 && Math.abs(dz) < 3) { nearRoom = true; break; }
        }
        if (nearRoom) continue;

        // Random placement
        if (Math.random() > trapDensity) continue;

        const typeKey = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        const wx = tx * TILE + TILE / 2;
        const wz = ty * TILE + TILE / 2;
        traps.push(createTrap(wx, wz, typeKey));
      }
    }

    return traps;
  }

  // Update trap state and check for activation
  function update(traps, player, dt) {
    const hits = [];
    const events = [];

    for (const trap of traps) {
      if (trap.state === 'idle') {
        const dx = player.x - trap.x;
        const dz = player.z - trap.z;
        const distSq = dx * dx + dz * dz;

        // Check if player is in trigger radius
        if (distSq < (trap.radius * 1.5) ** 2) {
          trap.state = 'triggered';
          trap.timer = 0;
          trap.triggered = true;
          trap.hasHitPlayer = false;
          events.push({ type: 'triggered', trap });
        }
      } else if (trap.state === 'triggered') {
        trap.timer += dt;
        if (trap.timer >= trap.triggerDelay) {
          trap.state = 'active';
          trap.timer = 0;
          events.push({ type: 'activated', trap });
        }
      } else if (trap.state === 'active') {
        trap.timer += dt;

        // Check collision with player during active phase
        if (!trap.hasHitPlayer) {
          const dx = player.x - trap.x;
          const dz = player.z - trap.z;
          const distSq = dx * dx + dz * dz;

          if (distSq < trap.radius * trap.radius) {
            trap.hasHitPlayer = true;
            hits.push({ trap, dmg: trap.damage });
          }
        }

        // End active phase
        if (trap.timer >= trap.activeTime) {
          trap.state = 'cooldown';
          trap.timer = 0;
        }
      } else if (trap.state === 'cooldown') {
        trap.timer += dt;
        if (trap.timer >= 3.0) {
          trap.state = 'idle';
          trap.timer = 0;
          trap.triggered = false;
          trap.hasHitPlayer = false;
        }
      }
    }

    return { hits, events };
  }

  return {
    TRAP_TYPES,
    createTrap,
    generateTrapsForFloor,
    update,
  };

})();
