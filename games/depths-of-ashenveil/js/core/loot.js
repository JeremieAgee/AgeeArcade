/* ═══════════════════════════════════════════════════
   loot.js  —  Item generation, inventory, skill tree
   Exports: Loot (namespace)
════════════════════════════════════════════════════ */
const Loot = (() => {

  /* ── Weapon base table ───────────────────────── */
  const WEAPONS = [
    { name: 'Rusty Sword',       atk: 8,  spd:  0,   range: 1.5 },
    { name: 'Short Sword',       atk: 12, spd:  0,   range: 1.6 },
    { name: 'Battle Axe',        atk: 20, spd: -0.4, range: 1.7 },
    { name: 'Rapier',            atk: 10, spd:  1.2, range: 1.8 },
    { name: 'War Hammer',        atk: 28, spd: -1.0, range: 1.6 },
    { name: 'Flame Blade',       atk: 18, spd:  0.2, range: 1.7 },
    { name: 'Shadow Dagger',     atk: 13, spd:  1.8, range: 1.4 },
    { name: 'Runic Greatsword',  atk: 32, spd: -0.6, range: 2.0 },
    { name: 'Bone Spear',        atk: 15, spd:  0.5, range: 2.2 },
    { name: 'Cursed Flail',      atk: 22, spd: -0.2, range: 1.9 },
  ];

  /* ── Armor base table ────────────────────────── */
  const ARMORS = [
    { name: 'Tattered Cloth',  def: 2 },
    { name: 'Leather Vest',    def: 5 },
    { name: 'Studded Leather', def: 8 },
    { name: 'Chain Mail',      def: 12 },
    { name: 'Iron Plate',      def: 17 },
    { name: 'Shadow Cloak',    def: 9  },
    { name: 'Dragon Scale',    def: 22 },
    { name: 'Mithril Hauberk', def: 20 },
  ];

  /* ── Consumable table ────────────────────────── */
  // duration is in seconds
  const CONSUMABLES = [
    { name: 'Health Potion',   effect: 'heal',  value: 40 },
    { name: 'Greater Potion',  effect: 'heal',  value: 80 },
    // ATK buffs
    { name: 'Rage Elixir',     effect: 'buff', icon: '⚔', stat: 'atk',   value: 10, duration: 15 },
    { name: 'War Brew',        effect: 'buff', icon: '⚔', stat: 'atk',   value: 18, duration:  8 },
    { name: 'Berserker Draught',effect:'buff', icon: '⚔', stat: 'atk',   value: 28, duration:  5 },
    // DEF buffs
    { name: 'Stone Skin',      effect: 'buff', icon: '🛡', stat: 'def',   value:  7, duration: 15 },
    { name: 'Iron Will',       effect: 'buff', icon: '🛡', stat: 'def',   value: 12, duration:  8 },
    { name: 'Fortress Tonic',  effect: 'buff', icon: '🛡', stat: 'def',   value: 20, duration:  5 },
    // Speed buffs
    { name: 'Swift Tonic',     effect: 'buff', icon: '💨', stat: 'speed', value: 2.0, duration: 12 },
    { name: 'Phantom Rush',    effect: 'buff', icon: '💨', stat: 'speed', value: 3.5, duration:  6 },
  ];

  /* ── Rarity definitions ──────────────────────── */
  const RARITIES = ['common', 'uncommon', 'rare', 'epic'];
  const RARITY_MULT = { common: 1.0, uncommon: 1.35, rare: 1.8, epic: 2.6 };
  const RARITY_COLOR = { common: '#aaaaaa', uncommon: '#44cc44', rare: '#4488ff', epic: '#cc44ff' };

  function rollRarity(floor) {
    const r     = Math.random();
    const boost = Math.min((floor - 1) * 0.035, 0.32);
    if (r < 0.02 + boost * 0.5)   return 'epic';
    if (r < 0.08 + boost * 0.9)   return 'rare';
    if (r < 0.28 + boost)         return 'uncommon';
    return 'common';
  }

  /* ── Generate a random item ──────────────────── */
  function genItem(floor) {
    const rarity = rollRarity(floor);
    const mult   = RARITY_MULT[rarity];
    const roll   = Math.random();

    if (roll < 0.45) {
      // Weapon
      const base = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
      return {
        type:     'weapon',
        name:     base.name,
        rarity,
        atk:      Math.round(base.atk * mult + floor * 1.0),
        spd:      base.spd,
        range:    base.range,
        equipped: false,
        id:       uid(),
      };
    } else if (roll < 0.75) {
      // Armor
      const base = ARMORS[Math.floor(Math.random() * ARMORS.length)];
      return {
        type:     'armor',
        name:     base.name,
        rarity,
        def:      Math.round(base.def * mult + floor * 0.7),
        equipped: false,
        id:       uid(),
      };
    } else {
      // Consumable
      const base = CONSUMABLES[Math.floor(Math.random() * CONSUMABLES.length)];
      return { ...base, type: 'consumable', rarity: 'common', id: uid() };
    }
  }

  /* ── Generate permanent upgrade ──────────────────── */
  function genUpgrade(floor) {
    const upgrades = [
      { name: '+2 Damage',          apply: p => { p.atk += 2; } },
      { name: '+8 Max Health',      apply: p => { p.maxHp += 8; p.hp = Math.min(p.hp + 8, p.maxHp); } },
      { name: '+1.5 Attack Speed',  apply: p => { p.atkSpeed *= 0.8; } },
      { name: '+4 Defense',         apply: p => { p.def += 4; } },
      { name: '+1 Movement Speed',  apply: p => { p.speed += 1.0; } },
      { name: '+10% Crit Chance',   apply: p => { p.critChance += 0.1; } },
    ];
    const upgrade = upgrades[Math.floor(Math.random() * upgrades.length)];
    return {
      type: 'upgrade',
      name: upgrade.name,
      apply: upgrade.apply,
      rarity: 'rare',
      id: uid(),
    };
  }

  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }

  /* ── Starting equipment ──────────────────────── */
  function startingInventory() {
    return [
      { type: 'weapon', name: 'Rusty Sword',     rarity: 'common', atk: 8,  spd: 0,   range: 1.5, equipped: true,  id: uid() },
      { type: 'armor',  name: 'Tattered Cloth',  rarity: 'common', def: 2,             equipped: true,  id: uid() },
      { type: 'consumable', name: 'Health Potion', effect: 'heal', value: 40, rarity: 'common', id: uid() },
    ];
  }

  /* ── Skill tree ──────────────────────────────── */
  const SKILLS = [
    {
      id: 'fury',   icon: '⚔',  name: 'Battle Fury',
      desc: 'Attack speed +25%',
      cost: 1, requires: null, tier: 1,
      apply: p => { p.atkSpeed *= 0.75; },
    },
    {
      id: 'iron',   icon: '🛡',  name: 'Iron Hide',
      desc: '+6 Defense permanently',
      cost: 1, requires: null, tier: 1,
      apply: p => { p.def += 6; },
    },
    {
      id: 'dash',   icon: '💨',  name: 'Shadow Step',
      desc: 'Movement speed +1.5',
      cost: 1, requires: null, tier: 1,
      apply: p => { p.speed += 1.5; },
    },
    {
      id: 'crit',   icon: '🎯',  name: 'Critical Eye',
      desc: '25% critical strike chance',
      cost: 2, requires: 'fury', tier: 2,
      apply: p => { p.critChance += 0.25; },
    },
    {
      id: 'vamp',   icon: '🩸',  name: 'Vampiric Blade',
      desc: '18% lifesteal on hit',
      cost: 2, requires: 'fury', tier: 2,
      apply: p => { p.lifesteal += 0.18; },
    },
    {
      id: 'fort',   icon: '🏰',  name: 'Fortitude',
      desc: 'Max HP +40',
      cost: 2, requires: 'iron', tier: 2,
      apply: p => { p.maxHp += 40; p.hp = Math.min(p.hp + 40, p.maxHp); },
    },
    {
      id: 'blink',  icon: '⚡',  name: 'Blink Strike',
      desc: 'Space: dash toward cursor',
      cost: 2, requires: 'dash', tier: 2,
      apply: p => { p.hasBlink = true; },
    },
    {
      id: 'whirl',  icon: '🌀',  name: 'Whirlwind',
      desc: 'Attack hits all nearby enemies',
      cost: 3, requires: 'crit', tier: 3,
      apply: p => { p.hasWhirl = true; },
    },
    {
      id: 'regen',  icon: '💚',  name: 'Regeneration',
      desc: 'Slowly regenerate HP in combat',
      cost: 3, requires: 'fort', tier: 3,
      apply: p => { p.hasRegen = true; },
    },
    {
      id: 'execute',icon: '💀',  name: 'Execute',
      desc: 'Double damage on enemies below 25% HP',
      cost: 3, requires: 'vamp', tier: 3,
      apply: p => { p.hasExecute = true; },
    },
  ];

  return {
    genItem,
    genUpgrade,
    startingInventory,
    SKILLS,
    RARITY_COLOR,
    RARITY_MULT,
    rollRarity,
  };

})();
