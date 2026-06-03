/* ═══════════════════════════════════════════════════
   monster-ai-worker.js  —  Web Worker for enemy AI
   Owns all enemy state; main thread owns meshes only.

   In:  init | tick | damage | addEnemy | addBoss | reset
   Out: spawned | bossCreated | tickResult
════════════════════════════════════════════════════ */

/* ── Type definitions (mirrors enemies.js) ───────── */
const TYPES = {
  skeleton:   { name: 'Skeleton',    color: 0xccccaa, radius: 0.45, height: 1.6, baseHp: 22,  baseAtk: 6,  spd: 1.8, xp: 9,   aggroR: 10, atkR: 1.0, atkCD: 65 },
  goblin:     { name: 'Goblin',      color: 0x44cc44, radius: 0.35, height: 1.2, baseHp: 16,  baseAtk: 8,  spd: 2.4, xp: 11,  aggroR: 12, atkR: 0.9, atkCD: 55 },
  wraith:     { name: 'Wraith',      color: 0x8844ff, radius: 0.5,  height: 1.8, baseHp: 35,  baseAtk: 14, spd: 1.5, xp: 17,  aggroR: 14, atkR: 1.1, atkCD: 70 },
  troll:      { name: 'Troll',       color: 0x885522, radius: 0.8,  height: 2.2, baseHp: 70,  baseAtk: 18, spd: 1.0, xp: 27,  aggroR: 9,  atkR: 1.3, atkCD: 85 },
  archer:     { name: 'Bone Archer', color: 0xccccaa, radius: 0.4,  height: 1.5, baseHp: 14,  baseAtk: 10, spd: 1.6, xp: 14,  aggroR: 14, atkR: 0,   atkCD: 90 },
  shardgolem: { name: 'Stone Shard', color: 0x778866, radius: 0.45, height: 1.4, baseHp: 30,  baseAtk: 10, spd: 2.2, xp: 8,   aggroR: 14, atkR: 0.9, atkCD: 60 },
};

const BOSS_TYPES = [
  { name: 'Dungeon Lord',       bossKind: 'dungeon_lord',  color: 0xff2200, radius: 1.2, height: 3.0, baseHp: 220, baseAtk: 28, spd: 1.2, xp: 100, aggroR: 18, atkR: 1.8, atkCD: 75,  isBoss: true, ability: 'enrage' },
  { name: 'Stone Golem',        bossKind: 'stone_golem',   color: 0x778866, radius: 1.4, height: 3.2, baseHp: 380, baseAtk: 22, spd: 0.55, xp: 120, aggroR: 12, atkR: 1.7, atkCD: 110, isBoss: true, ability: 'earth', _earthSpikeCd: 150, _earthSpikeInterval: 180, _earthSlamCd: 300, _earthSlamInterval: 360 },
  { name: 'Shadow Wraith King', bossKind: 'wraith_king',   color: 0x5500cc, radius: 1.0, height: 3.6, baseHp: 170, baseAtk: 34, spd: 1.8, xp: 125, aggroR: 20, atkR: 2.0, atkCD: 60,  isBoss: true, ability: 'lifedrain' },
  { name: 'Bone Colossus',      bossKind: 'bone_colossus', color: 0xddccaa, radius: 1.1, height: 3.8, baseHp: 300, baseAtk: 24, spd: 0.75, xp: 110, aggroR: 15, atkR: 1.7, atkCD: 90,  isBoss: true, ability: 'bone_summon', regenAmt: 6, regenInterval: 180, _summonCd: 480, _summonInterval: 660 },
  { name: 'Inferno Drake',      bossKind: 'inferno_drake', color: 0xff6600, radius: 1.3, height: 2.6, baseHp: 195, baseAtk: 36, spd: 1.5, xp: 130, aggroR: 16, atkR: 1.5, atkCD: 45,  isBoss: true, ability: 'burst' },
];

/* ── Dungeon state (set on init) ──────────────────── */
let _grid = null;
let _COLS = 0;
let _ROWS = 0;
let _TILE = 2;
const WALL = 1;

/* ── Live enemy map: id → enemy object ───────────── */
const _enemies = new Map();

/* ── ID generator ────────────────────────────────── */
function _uid() { return Math.random().toString(36).slice(2); }

/* ── Enemy factory ───────────────────────────────── */
function _create(typeKey, worldX, worldZ, floor) {
  const def   = TYPES[typeKey] || TYPES.skeleton;
  const scale = 1 + (floor - 1) * 0.22;
  return {
    ...def,
    typeKey,
    x:   worldX,
    z:   worldZ,
    hp:  Math.round(def.baseHp  * scale),
    maxHp: Math.round(def.baseHp * scale),
    atk: Math.round(def.baseAtk * (1 + (floor - 1) * 0.18)),
    xp:  Math.round(def.xp      * (1 + (floor - 1) * 0.1)),
    state:    'idle',
    atkTimer: 0,
    atkAnim:  0,
    hitFlash: 0,
    dead:     false,
    id:       _uid(),
    rotY:     0,
    _prevDist:     undefined,
    _chargeActive: false,
    _chargeDur:    0,
    _chargeCd:     0,
  };
}

function _createBoss(bossRoom, floor, dungeon) {
  const def   = BOSS_TYPES[Math.floor(Math.random() * BOSS_TYPES.length)];
  const scale = 1 + (floor - 1) * 0.35;
  const cx    = Math.floor(bossRoom.x + bossRoom.w / 2);
  const cy    = Math.floor(bossRoom.y + bossRoom.h / 2);
  const wx    = cx * dungeon.TILE + dungeon.TILE / 2;
  const wz    = cy * dungeon.TILE + dungeon.TILE / 2;
  return {
    ...def,
    typeKey:    'boss',
    x:  wx,
    z:  wz,
    hp:  Math.round(def.baseHp  * scale),
    maxHp: Math.round(def.baseHp * scale),
    atk: Math.round(def.baseAtk * (1 + (floor - 1) * 0.25)),
    xp:  Math.round(def.xp      * floor),
    state:    'idle',
    atkTimer: 0,
    atkAnim:  0,
    hitFlash: 0,
    enraged:  false,
    regenTimer:      def.regenInterval  || 0,
    _summonCd:       def._summonCd      || 0,
    _summonInterval: def._summonInterval || 0,
    _earthSpikeCd:       def._earthSpikeCd       || 0,
    _earthSpikeInterval: def._earthSpikeInterval || 0,
    _earthSlamCd:        def._earthSlamCd        || 0,
    _earthSlamInterval:  def._earthSlamInterval  || 0,
    _fireballCd: 120,
    dead: false,
    id:   'boss',
    rotY: 0,
  };
}

/* ── Pathfinding ──────────────────────────────────── */
function navigate(enemy, tx, tz, spd) {
  const ddx = tx - enemy.x, ddz = tz - enemy.z;
  if (ddx * ddx + ddz * ddz < 0.0001) return;
  const baseAngle = Math.atan2(ddx, ddz);
  const offsets   = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1];
  for (const off of offsets) {
    const a  = baseAngle + off;
    const nx = enemy.x + Math.sin(a) * spd;
    const nz = enemy.z + Math.cos(a) * spd;
    const txN = Math.floor(nx / _TILE), tzN = Math.floor(nz / _TILE);
    const txC = Math.floor(enemy.x / _TILE), tzC = Math.floor(enemy.z / _TILE);
    const okX = txN >= 0 && txN < _COLS && tzC >= 0 && tzC < _ROWS && _grid[tzC][txN] !== WALL;
    const okZ = txC >= 0 && txC < _COLS && tzN >= 0 && tzN < _ROWS && _grid[tzN][txC] !== WALL;
    if (okX || okZ) {
      if (okX) enemy.x = nx;
      if (okZ) enemy.z = nz;
      return;
    }
  }
}

/* ── AI tick ──────────────────────────────────────── */
function tick(enemy, playerX, playerZ, dt) {
  if (enemy.dead) return null;

  if (enemy.atkTimer    > 0) enemy.atkTimer    -= dt * 60;
  if (enemy.hitFlash    > 0) enemy.hitFlash    -= dt * 60;
  if (enemy._chargeCd   > 0) enemy._chargeCd   -= dt * 60;
  if (enemy._fireballCd > 0) enemy._fireballCd -= dt * 60;
  if (enemy._earthSpikeCd > 0) enemy._earthSpikeCd -= dt * 60;
  if (enemy._earthSlamCd  > 0) enemy._earthSlamCd  -= dt * 60;

  const dx   = playerX - enemy.x;
  const dz   = playerZ - enemy.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // ── Boss abilities ──
  if (enemy.isBoss) {
    if (enemy.ability === 'enrage' && !enemy.enraged && enemy.hp <= enemy.maxHp * 0.4) {
      enemy.enraged = true;
      enemy.spd    *= 2.0;
      enemy.atkCD   = Math.floor(enemy.atkCD * 0.45);
    }
    if ((enemy.ability === 'regen' || enemy.ability === 'bone_summon') && enemy.hp < enemy.maxHp) {
      enemy.regenTimer -= dt * 60;
      if (enemy.regenTimer <= 0) {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + (enemy.regenAmt || 0));
        enemy.regenTimer = enemy.regenInterval;
      }
    }
    if (enemy.ability === 'bone_summon' && dist < enemy.aggroR && enemy._summonInterval > 0) {
      enemy._summonCd -= dt * 60;
      if (enemy._summonCd <= 0) {
        enemy._summonCd = enemy._summonInterval;
        const angle = Math.random() * Math.PI * 2;
        const d     = enemy.radius * 2.2 + 1.0;
        return { attacked: false, summoned: [{ typeKey: 'skeleton', worldX: enemy.x + Math.cos(angle) * d, worldZ: enemy.z + Math.sin(angle) * d }] };
      }
    }
    if (enemy.bossKind === 'inferno_drake' && dist < enemy.aggroR && dist > enemy.atkR + 1.0 && enemy._fireballCd <= 0) {
      enemy._fireballCd = enemy.enraged ? 80 : 120;
      enemy.atkAnim = 0.32;
      const inv = dist > 0.001 ? 1 / dist : 0;
      return { attacked: false, boltFired: { x: enemy.x, z: enemy.z, vx: dx * inv * 7.0, vz: dz * inv * 7.0, dmg: Math.round(enemy.atk * 0.8), kind: 'fireball' } };
    }
    if (enemy.ability === 'earth' && dist < enemy.aggroR && dist > enemy.atkR + 0.5 && enemy._earthSpikeCd <= 0) {
      enemy._earthSpikeCd = enemy._earthSpikeInterval;
      enemy.atkAnim = 0.32;
      const inv = dist > 0.001 ? 1 / dist : 0;
      return { attacked: false, boltFired: { x: enemy.x, z: enemy.z, vx: dx * inv * 6.0, vz: dz * inv * 6.0, dmg: Math.round(enemy.atk * 0.65), kind: 'earth_spike' } };
    }
    if (enemy.ability === 'earth' && dist <= 4.2 && enemy._earthSlamCd <= 0) {
      enemy._earthSlamCd = enemy._earthSlamInterval;
      enemy.atkAnim = 0.45;
      return { attacked: true, dmg: Math.round(enemy.atk * 1.15), earthSlam: true };
    }
  }

  // ── Kite / charge ──
  const distDelta    = enemy._prevDist !== undefined ? dist - enemy._prevDist : 0;
  enemy._prevDist    = dist;
  const kiting       = distDelta > 0.012 && dist > enemy.atkR + 1.5 && !enemy.isBoss;

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

  // ── Archer AI ──
  if (enemy.typeKey === 'archer') {
    if (dist < enemy.aggroR) {
      enemy.state  = 'chase';
      enemy.rotY   = Math.atan2(dx, dz);
      const inv    = dist > 0.001 ? 1 / dist : 0;
      if (dist < 3.5) {
        navigate(enemy, enemy.x - dx * inv * 10, enemy.z - dz * inv * 10, enemy.spd * dt);
      } else if (dist > 7.5) {
        navigate(enemy, playerX, playerZ, enemy.spd * dt);
      } else {
        const sDir = (enemy.id.charCodeAt(0) % 2 === 0) ? 1 : -1;
        navigate(enemy, enemy.x + (-dz * inv) * sDir * 10, enemy.z + (dx * inv) * sDir * 10, enemy.spd * 0.45 * dt);
      }
      if (dist >= 3.5 && dist <= 10.0 && enemy.atkTimer <= 0) {
        enemy.atkTimer = enemy.atkCD;
        enemy.atkAnim  = 0.25;
        return { attacked: false, boltFired: { x: enemy.x, z: enemy.z, vx: (dx / dist) * 9.0, vz: (dz / dist) * 9.0, dmg: enemy.atk } };
      }
    } else {
      enemy.state = 'idle';
    }
    return null;
  }

  // ── Standard melee AI ──
  if (dist < enemy.aggroR) {
    enemy.state = 'chase';
    if (dist > enemy.atkR + 0.1) {
      const chargeMulti = enemy._chargeActive ? 3.0 : (kiting ? 1.8 : 1.0);
      const spd         = enemy.spd * chargeMulti * dt;
      const idHash      = enemy.id.charCodeAt(0) + (enemy.id.charCodeAt(1) || 0);
      const flank       = (enemy.typeKey === 'goblin' || enemy.typeKey === 'skeleton')
        ? ((idHash % 20) - 10) * 0.018 : 0;
      const flankAngle  = Math.atan2(dx, dz) + flank;
      navigate(enemy, enemy.x + Math.sin(flankAngle) * 20, enemy.z + Math.cos(flankAngle) * 20, spd);
      enemy.rotY = Math.atan2(dx, dz);
    }
    if (dist <= enemy.atkR + 0.1 && enemy.atkTimer <= 0) {
      enemy.atkTimer = enemy.atkCD;
      enemy.atkAnim  = 0.32;
      const result = { attacked: true, dmg: enemy.atk };
      if (enemy.ability === 'lifedrain') enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.round(enemy.atk * 0.3));
      if (enemy.ability === 'shockwave') { result.dmg = Math.round(enemy.atk * 1.6); result.shockwave = true; }
      return result;
    }
  } else {
    enemy.state = 'idle';
  }
  return null;
}

/* ── Message handler ──────────────────────────────── */
self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'reset') {
    _enemies.clear();
    _grid = null;
    return;
  }

  if (msg.type === 'init') {
    _enemies.clear();
    const { floor, dungeon } = msg;
    _grid = dungeon.grid;
    _COLS = dungeon.COLS;
    _ROWS = dungeon.ROWS;
    _TILE = dungeon.TILE;

    const spawned = [];
    for (const s of dungeon.spawns) {
      const wx = s.gx * _TILE + _TILE / 2;
      const wz = s.gy * _TILE + _TILE / 2;
      const enemy = _create(s.typeKey, wx, wz, floor);
      _enemies.set(enemy.id, enemy);
      spawned.push(_snapshot(enemy));
    }
    self.postMessage({ type: 'spawned', enemies: spawned });
    return;
  }

  if (msg.type === 'addBoss') {
    const { bossRoom, floor, dungeon } = msg;
    const boss = _createBoss(bossRoom, floor, dungeon);
    _enemies.set(boss.id, boss);
    self.postMessage({ type: 'bossCreated', boss: _snapshot(boss) });
    return;
  }

  if (msg.type === 'addEnemy') {
    const e = msg.enemy;
    _enemies.set(e.id, e);
    return;
  }

  if (msg.type === 'damage') {
    const e = _enemies.get(msg.id);
    if (!e) return;
    e.hp = Math.max(0, e.hp - msg.amount);
    e.hitFlash = 8;
    if (e.hp <= 0) e.dead = true;
    return;
  }

  if (msg.type === 'tick') {
    const { dt, playerX, playerZ } = msg;
    const updates = [];
    const events  = [];
    const dead    = [];

    for (const [, enemy] of _enemies) {
      if (enemy.dead) { dead.push(enemy.id); continue; }

      const result = tick(enemy, playerX, playerZ, dt);

      if (result) {
        if (result.attacked)  events.push({ type: 'attack',  id: enemy.id, dmg: result.dmg, earthSlam: result.earthSlam, name: enemy.name });
        if (result.boltFired) events.push({ type: 'bolt',    id: enemy.id, bolt: result.boltFired });
        if (result.summoned)  events.push({ type: 'summon',  id: enemy.id, summoned: result.summoned });
      }

      updates.push(_snapshot(enemy));
    }

    // Remove dead from map after iteration
    for (const id of dead) _enemies.delete(id);

    self.postMessage({ type: 'tickResult', updates, events, dead });
    return;
  }
};

function _snapshot(e) {
  return {
    id:       e.id,
    x:        e.x,
    z:        e.z,
    rotY:     e.rotY,
    state:    e.state,
    hp:       e.hp,
    maxHp:    e.maxHp,
    atkAnim:  e.atkAnim,
    hitFlash: e.hitFlash,
    dead:     e.dead,
    // static fields needed on first spawn (mesh build)
    typeKey:  e.typeKey,
    color:    e.color,
    height:   e.height,
    radius:   e.radius,
    name:     e.name,
    xp:       e.xp,
    atk:      e.atk,
    isBoss:   e.isBoss,
    bossKind: e.bossKind,
    ability:  e.ability,
  };
}
