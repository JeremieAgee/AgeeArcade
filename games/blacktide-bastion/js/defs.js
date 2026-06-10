// defs.js — game data: cannons, ships, waves, upgrades

const CANNON_DEFS = {
  swivel: {
    name: 'Deck Swivel',
    damage: 20,
    fireRate: 1.8,
    splashRadius: 0,
    muzzleVelocity: 32,
    color: 0x999999,
  },
  longnine: {
    name: 'Long Nine',
    damage: 45,
    fireRate: 0.85,
    splashRadius: 0.5,
    muzzleVelocity: 26,
    color: 0x777777,
  },
  mortar: {
    name: 'Bombard Mortar',
    damage: 90,
    fireRate: 0.35,
    splashRadius: 2.2,
    muzzleVelocity: 18,
    color: 0x555555,
  },
};

const SHIP_DEFS = {
  sloop: {
    name: 'Raider Sloop',
    hull: 40,
    speed: 6.5,
    landDamage: 15,
    score: 100,
    gold: 10,
    xp: 12,
    hitRadius: 1.8,
    width: 2.2,
    height: 1.0,
    depth: 3.6,
    mastHeight: 3.2,
    hullColor: 0xc89030,
    sailColor: 0xeebb55,
    zigzag: true,
    zigzagAmp: 2.2,
    zigzagFreq: 1.4,
    visual: { masts: 1, gunports: 0, sternCastle: 0, goldTrim: false },
  },
  brig: {
    name: 'Boarding Brig',
    hull: 90,
    speed: 4.0,
    landDamage: 28,
    score: 250,
    gold: 20,
    xp: 28,
    canShoot: true,
    shootRange: 30,
    shootRate: 0.45,
    shotDamage: 12,
    hitRadius: 2.5,
    width: 3.2,
    height: 1.3,
    depth: 5.0,
    mastHeight: 4.2,
    hullColor: 0x7a5028,
    sailColor: 0xbb9955,
    zigzag: false,
    zigzagAmp: 0,
    zigzagFreq: 0,
    visual: { masts: 2, gunports: 4, sternCastle: 1, goldTrim: false },
  },
  galleon: {
    name: 'Iron Galleon',
    hull: 180,
    speed: 2.2,
    landDamage: 50,
    score: 500,
    gold: 38,
    xp: 55,
    canShoot: true,
    shootRange: 40,
    shootRate: 0.28,
    shotDamage: 22,
    hitRadius: 3.4,
    width: 4.6,
    height: 1.7,
    depth: 6.8,
    mastHeight: 5.2,
    hullColor: 0x5a3818,
    sailColor: 0x886633,
    zigzag: false,
    zigzagAmp: 0,
    zigzagFreq: 0,
    visual: { masts: 3, gunports: 6, sternCastle: 2, goldTrim: true },
  },
};

// X position of each ship lane and player station
const LANE_X    = [-7, 0, 7];
const STATION_X = [0];

// Budget cost per ship archetype
const SHIP_COST = { sloop: 1, brig: 3, galleon: 6 };

// Wave budget formula
function waveBudget(wave) {
  return 6 + Math.round(2.8 * Math.pow(wave, 1.2));
}

// Seconds between spawn ticks
function spawnInterval(wave) {
  return Math.max(1.4, 5.5 - wave * 0.32);
}

// Build weighted spawn composition for a given wave
function buildComposition(budget, wave) {
  const ships = [];
  let remaining = budget;

  // Introduce galleons from wave 5, brigs from wave 2
  const allowGalleon = wave >= 5;
  const allowBrig    = wave >= 2;

  while (remaining > 0) {
    if (allowGalleon && remaining >= 6 && Math.random() < 0.22) {
      ships.push('galleon');
      remaining -= 6;
    } else if (allowBrig && remaining >= 3 && Math.random() < 0.40) {
      ships.push('brig');
      remaining -= 3;
    } else {
      ships.push('sloop');
      remaining -= 1;
    }
  }

  // Shuffle so ship types are interleaved
  for (let i = ships.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ships[i], ships[j]] = [ships[j], ships[i]];
  }
  return ships;
}

// XP needed to reach the next level from the current one
function xpToNextLevel(level) {
  return Math.round(80 * Math.pow(level, 1.4));
}

// Passive bonuses granted on level-up. Index = the new level reached (0-1 unused).
const LEVEL_BONUSES = [
  null, // 0
  null, // 1 — starting level, no bonus
  { desc: '+8% cannon damage',        apply: gs => { gs.damageMult    *= 1.08; } },
  { desc: 'Fort +10 max HP & +10 HP', apply: gs => { gs.fortMaxHP += 10; gs.fortHP = Math.min(gs.fortHP + 10, gs.fortMaxHP); } },
  { desc: '-10% reload time',         apply: gs => { gs.reloadMult    *= 0.90; } },
  { desc: '+12% gold from ships',     apply: gs => { gs.goldMult      *= 1.12; } },
  { desc: '+8% cannon damage',        apply: gs => { gs.damageMult    *= 1.08; } },
  { desc: 'Fort +10 max HP & +10 HP', apply: gs => { gs.fortMaxHP += 10; gs.fortHP = Math.min(gs.fortHP + 10, gs.fortMaxHP); } },
  { desc: 'Aim snap +25%',            apply: gs => { gs.aimSnapRadius *= 1.25; } },
  { desc: '-10% reload time',         apply: gs => { gs.reloadMult    *= 0.90; } },
  { desc: '+12% cannon damage',       apply: gs => { gs.damageMult    *= 1.12; } },
];

const UPGRADE_POOL = [
  {
    id: 'powder_charge',
    name: 'Powder Charge',
    desc: 'Reload time -20% this run',
    icon: '💨',
    cost: 90,
    apply(gs) { gs.reloadMult *= 0.80; },
  },
  {
    id: 'iron_plating',
    name: 'Iron Plating',
    desc: 'Fort max HP +30, restore 30 HP',
    icon: '🛡',
    cost: 100,
    apply(gs) { gs.fortMaxHP += 30; gs.fortHP = Math.min(gs.fortHP + 30, gs.fortMaxHP); },
  },
  {
    id: 'double_shot',
    name: 'Double Shot',
    desc: '+6 charges: each shot fires two balls',
    icon: '⚫',
    cost: 120,
    apply(gs) { gs.doubleShotCharges += 6; },
  },
  {
    id: 'swift_broadside',
    name: 'Swift Broadside',
    desc: 'Cannon fire rate +30% — faster reloads',
    icon: '⚡',
    cost: 95,
    apply(gs) { gs.reloadMult *= 0.70; },
  },
  {
    id: 'gold_fever',
    name: 'Gold Fever',
    desc: '+25% gold from ship sinks',
    icon: '🪙',
    cost: 70,
    apply(gs) { gs.goldMult *= 1.25; },
  },
  {
    id: 'hot_shot',
    name: 'Hot Shot',
    desc: '+35% damage next wave',
    icon: '🔥',
    cost: 110,
    apply(gs) { gs.damageMult *= 1.35; },
  },
  {
    id: 'steady_aim',
    name: 'Steady Aim',
    desc: 'Aim-snap radius ×1.5 — easier targeting',
    icon: '🎯',
    cost: 60,
    apply(gs) { gs.aimSnapRadius *= 1.5; },
  },
  {
    id: 'corned_powder',
    name: 'Corned Powder',
    desc: 'Cannonball speed +30% — flatter, faster shots',
    icon: '💣',
    cost: 85,
    apply(gs) { gs.projectileSpeedMult *= 1.30; },
  },
  {
    id: 'chain_shot',
    name: 'Chain Shot',
    desc: 'Hits slow enemy speed by 40% for 3s',
    icon: '⛓',
    cost: 115,
    apply(gs) { gs.chainShotEnabled = true; },
  },
];

function pickUpgrades(count, usedIds) {
  const pool = UPGRADE_POOL.filter(u => !usedIds.includes(u.id));
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
