/* ═══════════════════════════════════════════════════
   enemies.js  —  Enemy types, AI, spawning
   Exports: Enemies (namespace)
════════════════════════════════════════════════════ */
const Enemies = (() => {

  /* ── Type definitions ────────────────────────── */
  const TYPES = {
    skeleton: {
      name:    'Skeleton',
      color:   0xccccaa,
      radius:  0.45,
      height:  1.6,
      baseHp:  22,
      baseAtk: 6,
      spd:     1.8,
      xp:      9,
      aggroR:  10,
      atkR:    1.0,
      atkCD:   65,
    },
    goblin: {
      name:    'Goblin',
      color:   0x44cc44,
      radius:  0.35,
      height:  1.2,
      baseHp:  16,
      baseAtk: 8,
      spd:     2.4,
      xp:      11,
      aggroR:  12,
      atkR:    0.9,
      atkCD:   55,
    },
    wraith: {
      name:    'Wraith',
      color:   0x8844ff,
      radius:  0.5,
      height:  1.8,
      baseHp:  35,
      baseAtk: 14,
      spd:     1.5,
      xp:      17,
      aggroR:  14,
      atkR:    1.1,
      atkCD:   70,
    },
    troll: {
      name:    'Troll',
      color:   0x885522,
      radius:  0.8,
      height:  2.2,
      baseHp:  70,
      baseAtk: 18,
      spd:     1.0,
      xp:      27,
      aggroR:  9,
      atkR:    1.3,
      atkCD:   85,
    },
    archer: {
      name:    'Bone Archer',
      color:   0xccccaa,
      radius:  0.4,
      height:  1.5,
      baseHp:  14,
      baseAtk: 10,
      spd:     1.6,
      xp:      14,
      aggroR:  14,
      atkR:    0,
      atkCD:   90,
    },
    shardgolem: {
      name:    'Stone Shard',
      color:   0x778866,
      radius:  0.45,
      height:  1.4,
      baseHp:  30,
      baseAtk: 10,
      spd:     2.2,
      xp:      8,
      aggroR:  14,
      atkR:    0.9,
      atkCD:   60,
    },
  };

  const BOSS_TYPES = [
    {
      name: 'Dungeon Lord', bossKind: 'dungeon_lord',
      color: 0xff2200, radius: 1.2, height: 3.0,
      baseHp: 220, baseAtk: 28, spd: 1.2, xp: 100,
      aggroR: 18, atkR: 1.8, atkCD: 75, isBoss: true,
      ability: 'enrage',
    },
    {
      name: 'Stone Golem', bossKind: 'stone_golem',
      color: 0x778866, radius: 1.4, height: 3.2,
      baseHp: 380, baseAtk: 22, spd: 0.55, xp: 120,
      aggroR: 12, atkR: 1.7, atkCD: 110, isBoss: true,
      ability: 'earth',
      _earthSpikeCd: 150, _earthSpikeInterval: 180,
      _earthSlamCd: 300, _earthSlamInterval: 360,
    },
    {
      name: 'Shadow Wraith King', bossKind: 'wraith_king',
      color: 0x5500cc, radius: 1.0, height: 3.6,
      baseHp: 170, baseAtk: 34, spd: 1.8, xp: 125,
      aggroR: 20, atkR: 2.0, atkCD: 60, isBoss: true,
      ability: 'lifedrain',
    },
    {
      name: 'Bone Colossus', bossKind: 'bone_colossus',
      color: 0xddccaa, radius: 1.1, height: 3.8,
      baseHp: 300, baseAtk: 24, spd: 0.75, xp: 110,
      aggroR: 15, atkR: 1.7, atkCD: 90, isBoss: true,
      ability: 'bone_summon', regenAmt: 6, regenInterval: 180,
      _summonCd: 480, _summonInterval: 660,
    },
    {
      name: 'Inferno Drake', bossKind: 'inferno_drake',
      color: 0xff6600, radius: 1.3, height: 2.6,
      baseHp: 195, baseAtk: 36, spd: 1.5, xp: 130,
      aggroR: 16, atkR: 1.5, atkCD: 45, isBoss: true,
      ability: 'burst',
    },
  ];


  /* ── Create an enemy instance ────────────────── */
  function create(typeKey, gx, gy, floor, dungeon) {
    const def   = TYPES[typeKey] || TYPES.skeleton;
    const scale = 1 + (floor - 1) * 0.22;
    const world = dungeon.toWorld(gx, gy);

    return {
      ...def,
      typeKey,
      x:          world.x,
      y:          0,
      z:          world.z,
      hp:         Math.round(def.baseHp  * scale),
      maxHp:      Math.round(def.baseHp  * scale),
      atk:        Math.round(def.baseAtk * (1 + (floor - 1) * 0.18)),
      xp:         Math.round(def.xp      * (1 + (floor - 1) * 0.1)),
      state:      'idle',
      atkTimer:   0,
      atkAnim:    0,
      hitFlash:   0,
      dead:       false,
      mesh:       null,     // set by engine.js
      id:         Math.random().toString(36).slice(2),
      _prevDist:   undefined,
      _chargeActive: false,
      _chargeDur:  0,
      _chargeCd:   0,
    };
  }

  function createBoss(bossRoom, floor, dungeon) {
    const def   = BOSS_TYPES[Math.floor(Math.random() * BOSS_TYPES.length)];
    const scale = 1 + (floor - 1) * 0.35;
    const { cx, cy } = dungeon.roomCenter(bossRoom);
    const world = dungeon.toWorld(cx, cy);

    return {
      ...def,
      typeKey:    'boss',
      x:          world.x,
      y:          0,
      z:          world.z,
      hp:         Math.round(def.baseHp  * scale),
      maxHp:      Math.round(def.baseHp  * scale),
      atk:        Math.round(def.baseAtk * (1 + (floor - 1) * 0.25)),
      xp:         Math.round(def.xp      * floor),
      state:      'idle',
      atkTimer:   0,
      atkAnim:    0,
      hitFlash:   0,
      enraged:         false,
      regenTimer:      def.regenInterval  || 0,
      _summonCd:       def._summonCd      || 0,
      _summonInterval: def._summonInterval || 0,
      _earthSpikeCd:       def._earthSpikeCd       || 0,
      _earthSpikeInterval: def._earthSpikeInterval || 0,
      _earthSlamCd:        def._earthSlamCd        || 0,
      _earthSlamInterval:  def._earthSlamInterval  || 0,
      _fireballCd:         120,
      dead:       false,
      mesh:       null,
      id:         'boss',
    };
  }

  /* ── Spawn enemies from dungeon spawn list ───── */
  function spawnAll(dungeon, floor) {
    return dungeon.spawns.map(s => create(s.typeKey, s.gx, s.gy, floor, dungeon));
  }

  function createAtWorld(typeKey, worldX, worldZ, floor) {
    const def   = TYPES[typeKey] || TYPES.skeleton;
    const scale = 1 + (floor - 1) * 0.22;

    return {
      ...def,
      typeKey,
      x:          worldX,
      y:          0,
      z:          worldZ,
      hp:         Math.round(def.baseHp  * scale),
      maxHp:      Math.round(def.baseHp  * scale),
      atk:        Math.round(def.baseAtk * (1 + (floor - 1) * 0.18)),
      xp:         Math.round(def.xp      * (1 + (floor - 1) * 0.1)),
      state:      'idle',
      atkTimer:   0,
      atkAnim:    0,
      hitFlash:   0,
      dead:       false,
      mesh:       null,
      id:         Math.random().toString(36).slice(2),
      _prevDist:   undefined,
      _chargeActive: false,
      _chargeDur:  0,
      _chargeCd:   0,
    };
  }

  /* ── Pathfinding: try direct then deflected angles ─ */
  // Attempts to move `enemy` toward (tx, tz) by `spd` units.
  // If the straight path is wall-blocked, tries ±20°, ±40°, ±65° offsets so
  // enemies navigate around corners instead of getting stuck.
  function navigate(enemy, tx, tz, dungeon, spd) {
    const ddx = tx - enemy.x, ddz = tz - enemy.z;
    if (ddx * ddx + ddz * ddz < 0.0001) return;
    const baseAngle = Math.atan2(ddx, ddz);
    const TILE = dungeon.TILE, WALL = 1;
    const offsets = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1];
    for (const off of offsets) {
      const a  = baseAngle + off;
      const nx = enemy.x + Math.sin(a) * spd;
      const nz = enemy.z + Math.cos(a) * spd;
      const txN = Math.floor(nx / TILE), tzN = Math.floor(nz / TILE);
      const txC = Math.floor(enemy.x / TILE), tzC = Math.floor(enemy.z / TILE);
      const okX = txN >= 0 && txN < dungeon.COLS && tzC >= 0 && tzC < dungeon.ROWS && dungeon.grid[tzC][txN] !== WALL;
      const okZ = txC >= 0 && txC < dungeon.COLS && tzN >= 0 && tzN < dungeon.ROWS && dungeon.grid[tzN][txC] !== WALL;
      if (okX || okZ) {
        if (okX) enemy.x = nx;
        if (okZ) enemy.z = nz;
        if (enemy.mesh) { enemy.mesh.position.x = enemy.x; enemy.mesh.position.z = enemy.z; }
        return;
      }
    }
  }

  /* ── AI tick (called each frame) ────────────── */
  // Returns { attacked: bool, dmg: number, lifedrain?: number } if enemy attacks player
  function tick(enemy, player, dungeon, dt) {
    if (enemy.dead) return null;

    if (enemy.atkTimer > 0) enemy.atkTimer -= dt * 60;
    if (enemy.hitFlash > 0) enemy.hitFlash -= dt * 60;
    if (enemy._chargeCd  > 0) enemy._chargeCd -= dt * 60;
    if (enemy._fireballCd > 0) enemy._fireballCd -= dt * 60;
    if (enemy._earthSpikeCd > 0) enemy._earthSpikeCd -= dt * 60;
    if (enemy._earthSlamCd > 0) enemy._earthSlamCd -= dt * 60;

    const dx   = player.x - enemy.x;
    const dz   = player.z - enemy.z;
    const dist = Math.sqrt(dx * dx + dz * dz);


    // ── Boss abilities ────────────────────────────
    if (enemy.isBoss) {
      if (enemy.ability === 'enrage' && !enemy.enraged && enemy.hp <= enemy.maxHp * 0.4) {
        enemy.enraged = true;
        enemy.spd    *= 2.0;
        enemy.atkCD   = Math.floor(enemy.atkCD * 0.45);
      }
      if ((enemy.ability === 'regen' || enemy.ability === 'bone_summon') && enemy.hp < enemy.maxHp) {
        enemy.regenTimer -= dt * 60;
        if (enemy.regenTimer <= 0) {
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.regenAmt);
          enemy.regenTimer = enemy.regenInterval;
        }
      }
      if (enemy.ability === 'bone_summon' && dist < enemy.aggroR && enemy._summonInterval > 0) {
        enemy._summonCd -= dt * 60;
        if (enemy._summonCd <= 0) {
          enemy._summonCd = enemy._summonInterval;
          const count = 1;
          const summoned = [];
          for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i / count) + Math.random() * 0.7;
            const d = enemy.radius * 2.2 + 1.0;
            summoned.push({ typeKey: 'skeleton', worldX: enemy.x + Math.cos(angle) * d, worldZ: enemy.z + Math.sin(angle) * d });
          }
          return { attacked: false, summoned };
        }
      }
      if (enemy.bossKind === 'inferno_drake' && dist < enemy.aggroR && dist > enemy.atkR + 1.0 && enemy._fireballCd <= 0) {
        enemy._fireballCd = enemy.enraged ? 80 : 120;
        enemy.atkAnim = 0.32;
        const inv = dist > 0.001 ? 1 / dist : 0;
        const boltSpd = 7.0;
        return {
          attacked: false,
          boltFired: {
            x: enemy.x,
            z: enemy.z,
            vx: dx * inv * boltSpd,
            vz: dz * inv * boltSpd,
            dmg: Math.round(enemy.atk * 0.8),
            kind: 'fireball',
          },
        };
      }
      if (enemy.ability === 'earth' && dist < enemy.aggroR && dist > enemy.atkR + 0.5 && enemy._earthSpikeCd <= 0) {
        enemy._earthSpikeCd = enemy._earthSpikeInterval;
        enemy.atkAnim = 0.32;
        const inv = dist > 0.001 ? 1 / dist : 0;
        const boltSpd = 6.0;
        return {
          attacked: false,
          boltFired: {
            x: enemy.x,
            z: enemy.z,
            vx: dx * inv * boltSpd,
            vz: dz * inv * boltSpd,
            dmg: Math.round(enemy.atk * 0.65),
            kind: 'earth_spike',
          },
        };
      }
      if (enemy.ability === 'earth' && dist <= 4.2 && enemy._earthSlamCd <= 0) {
        enemy._earthSlamCd = enemy._earthSlamInterval;
        enemy.atkAnim = 0.45;
        return {
          attacked: true,
          dmg: Math.round(enemy.atk * 1.15),
          earthSlam: true,
        };
      }
    }

    // ── Kite detection: player moving away ───────
    const distDelta = (enemy._prevDist !== undefined) ? dist - enemy._prevDist : 0;
    enemy._prevDist = dist;
    const kiting = distDelta > 0.012 && dist > enemy.atkR + 1.5 && !enemy.isBoss;

    // ── Charge: trigger when player kites beyond 4× atkR ─
    if (!enemy.isBoss && !enemy._chargeActive && enemy._chargeCd <= 0
        && kiting && dist > Math.max(enemy.atkR * 4, 3.0)) {
      enemy._chargeActive = true;
      enemy._chargeDur    = 0.55;
      enemy._chargeCd     = 280;
    }
    if (enemy._chargeActive) {
      enemy._chargeDur -= dt;
      if (enemy._chargeDur <= 0) enemy._chargeActive = false;
    }

    // ── Archer AI ────────────────────────────────
    if (enemy.typeKey === 'archer') {
      if (dist < enemy.aggroR) {
        enemy.state = 'chase';
        const inv  = dist > 0.001 ? 1 / dist : 0;

        if (dist < 3.5) {
          // Back away — too close (retreat toward point behind enemy)
          navigate(enemy, enemy.x - dx * inv * 10, enemy.z - dz * inv * 10, dungeon, enemy.spd * dt);
        } else if (dist > 7.5) {
          // Close in — use navigate toward player
          navigate(enemy, player.x, player.z, dungeon, enemy.spd * dt);
        } else {
          // Strafe perpendicular to player
          const sDir = (enemy.id.charCodeAt(0) % 2 === 0) ? 1 : -1;
          const sx = enemy.x + (-dz * inv) * sDir * 10;
          const sz = enemy.z + ( dx * inv) * sDir * 10;
          navigate(enemy, sx, sz, dungeon, enemy.spd * 0.45 * dt);
        }

        if (enemy.mesh) {
          enemy.mesh.position.x = enemy.x;
          enemy.mesh.position.z = enemy.z;
          enemy.mesh.rotation.y = Math.atan2(dx, dz);
        }

        // Fire bolt
        if (dist >= 3.5 && dist <= 10.0 && enemy.atkTimer <= 0) {
          enemy.atkTimer = enemy.atkCD;
          enemy.atkAnim  = 0.25;
          const boltSpd = 9.0;
          return {
            attacked:  false,
            boltFired: {
              x: enemy.x, z: enemy.z,
              vx: (dx / dist) * boltSpd,
              vz: (dz / dist) * boltSpd,
              dmg: enemy.atk,
            },
          };
        }
      } else {
        enemy.state = 'idle';
      }
      return null;
    }

    // ── Standard melee AI ────────────────────────
    if (dist < enemy.aggroR) {
      enemy.state = 'chase';

      if (dist > enemy.atkR + 0.1) {
        const chargeMulti = enemy._chargeActive ? 3.0 : (kiting ? 1.8 : 1.0);
        const spd = enemy.spd * chargeMulti * dt;

        // Flanking offset: each goblin/skeleton approaches from a slightly different angle
        const idHash = enemy.id.charCodeAt(0) + (enemy.id.charCodeAt(1) || 0);
        const flank = (enemy.typeKey === 'goblin' || enemy.typeKey === 'skeleton')
          ? ((idHash % 20) - 10) * 0.018
          : 0;
        const flankAngle = Math.atan2(dx, dz) + flank;
        navigate(enemy,
          enemy.x + Math.sin(flankAngle) * 20,
          enemy.z + Math.cos(flankAngle) * 20,
          dungeon, spd);

        if (enemy.mesh) enemy.mesh.rotation.y = Math.atan2(dx, dz);
      }

      // Attack
      if (dist <= enemy.atkR + 0.1 && enemy.atkTimer <= 0) {
        enemy.atkTimer = enemy.atkCD;
        enemy.atkAnim  = 0.32;
        const result = { attacked: true, dmg: enemy.atk };
        if (enemy.ability === 'lifedrain') {
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.round(enemy.atk * 0.3));
        }
        if (enemy.ability === 'shockwave') {
          result.dmg  = Math.round(enemy.atk * 1.6);
          result.shockwave = true;
        }
        return result;
      }
    } else {
      enemy.state = 'idle';
    }

    return null;
  }

  return { create, createAtWorld, createBoss, spawnAll, tick, TYPES, BOSS_TYPES };

})();
