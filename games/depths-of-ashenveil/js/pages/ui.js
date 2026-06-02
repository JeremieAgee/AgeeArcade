/* ═══════════════════════════════════════════════════
   ui.js  —  HUD, panels, messages, inventory, skills
   Exports: UI (namespace)
════════════════════════════════════════════════════ */
const UI = (() => {

  let messages = [];
  let activePanel = null;
  let pendingLeaderboardScore = null;

  /* ── Cached DOM refs (set once on first refresh) ─ */
  let _dom = null;
  let _lastBuffKey = '';

  function _initDom() {
    if (_dom) return;
    _dom = {
      hpFill:   document.getElementById('hpFill'),
      hpText:   document.getElementById('hpText'),
      xpFill:   document.getElementById('xpFill'),
      xpText:   document.getElementById('xpText'),
      hudLevel: document.getElementById('hudLevel'),
      hudAtk:   document.getElementById('hudAtk'),
      hudDef:   document.getElementById('hudDef'),
      hudSpd:   document.getElementById('hudSpd'),
      buffBar:  document.getElementById('buffBar'),
      eqWeapon: document.getElementById('eqWeapon'),
      eqArmor:  document.getElementById('eqArmor'),
      skillPts: document.getElementById('skillPts'),
      msgLog:   document.getElementById('msgLog'),
    };
  }

  /* ── Message log ─────────────────────────────── */
  function addMsg(text, type = '') {
    messages.unshift({ text, type });
    if (messages.length > 3) messages.pop();
    _initDom();
    const log = _dom.msgLog;
    log.innerHTML = messages
      .map(m => `<div class="msg ${m.type}">${m.text}</div>`)
      .join('');
  }

  /* ── Refresh all HUD elements ────────────────── */
  function refresh(player) {
    const p = player;
    if (!p) return;
    _initDom();
    const d = _dom;

    // HP bar
    const hpPct = Math.max(0, p.hp / p.maxHp * 100);
    d.hpFill.style.width   = hpPct + '%';
    d.hpText.textContent   = `${Math.ceil(p.hp)}/${p.maxHp}`;

    // XP bar
    const xpPct = p.xp / p.xpNext * 100;
    d.xpFill.style.width   = xpPct + '%';
    d.xpText.textContent   = `${p.xp}/${p.xpNext}`;

    // Stats
    d.hudLevel.textContent = `LVL ${p.level}`;
    d.hudAtk.textContent   = Player.totalAtk(p);
    d.hudDef.textContent   = Player.totalDef(p);
    d.hudSpd.textContent   = Player.totalSpeed(p).toFixed(1);

    // Active buff pills — only rebuild HTML when buff state changes
    if (d.buffBar) {
      const buffKey = p.buffs.map(b => `${b.name}:${Math.ceil(b.remaining)}`).join('|');
      if (buffKey !== _lastBuffKey) {
        _lastBuffKey = buffKey;
        if (p.buffs.length === 0) {
          d.buffBar.innerHTML = '';
        } else {
          d.buffBar.innerHTML = p.buffs.map(b => {
            const secs = Math.ceil(b.remaining);
            const pct  = Math.max(0, b.remaining / b.duration * 100);
            return `<span class="buff-pill">
              <span class="buff-icon">${b.icon || '✦'}</span>
              <span class="buff-name">${b.name}</span>
              <span class="buff-timer">${secs}s</span>
              <span class="buff-track"><span class="buff-fill" style="width:${pct}%"></span></span>
            </span>`;
          }).join('');
        }
      }
    }

    // Equipped gear names
    const w = Player.equippedWeapon(p);
    const a = Player.equippedArmor(p);
    d.eqWeapon.textContent = w ? w.name : '—';
    d.eqArmor.textContent  = a ? a.name : '—';

    // Skill points badge
    d.skillPts.textContent = p.skillPoints > 0 ? `✦ ${p.skillPoints} skill pts` : '';

    // Panel refresh if open
    if (activePanel === 'inv')    renderInventory(p);
    if (activePanel === 'skills') renderSkills(p);
  }

  /* ── Floor label ─────────────────────────────── */
  function setFloor(n) {
    document.getElementById('hudFloor').textContent = `FLOOR ${n}`;
  }

  function renderSaveMeta(meta) {
    const data = meta || (typeof Save !== 'undefined' ? Save.loadMeta() : null);
    if (!data) return;

    const bestFloor = document.getElementById('meta-best-floor');
    const bestLevel = document.getElementById('meta-best-level');
    const totalRuns = document.getElementById('meta-total-runs');

    if (bestFloor) bestFloor.textContent = data.bestFloor;
    if (bestLevel) bestLevel.textContent = data.bestLevel;
    if (totalRuns) totalRuns.textContent = data.totalRuns;
  }

  /* ── Boss bar ────────────────────────────────── */
  function showBossBar(enemy) {
    let bar = document.getElementById('bossBarWrap');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bossBarWrap';
      bar.innerHTML = `
        <div id="bossName">${enemy.name}</div>
        <div id="bossHpBar"><div id="bossHpFill" style="width:100%"></div></div>`;
      bar.style.cssText = `
        position:absolute;top:8px;left:50%;transform:translateX(-50%);
        width:300px;display:flex;flex-direction:column;align-items:center;gap:4px;
        z-index:10;pointer-events:none;`;
      document.getElementById('canvasMount').style.position = 'relative';
      document.getElementById('canvasMount').appendChild(bar);
      // Style the bar
      const hpBar = document.getElementById('bossHpBar');
      hpBar.style.cssText = 'width:100%;height:10px;background:#2a0000;border:1px solid #8a0000;border-radius:2px;overflow:hidden;';
      const fill = document.getElementById('bossHpFill');
      fill.style.cssText = 'height:100%;background:linear-gradient(90deg,#660000,#ff2200);box-shadow:0 0 8px #ff000099;transition:width 0.3s;';
      const name = document.getElementById('bossName');
      name.style.cssText = 'font-family:Cinzel,serif;font-size:13px;color:#ff4422;text-shadow:0 0 10px #ff000088;letter-spacing:2px;';
    }
    // Always refresh name (bar is reused across floors)
    const nameEl = document.getElementById('bossName');
    if (nameEl) nameEl.textContent = enemy.name;
    bar.style.display = 'flex';
    updateBossBar(enemy);
  }

  function updateBossBar(enemy) {
    const fill = document.getElementById('bossHpFill');
    if (fill) fill.style.width = Math.max(0, enemy.hp / enemy.maxHp * 100) + '%';
  }

  function hideBossBar() {
    const bar = document.getElementById('bossBarWrap');
    if (bar) bar.style.display = 'none';
  }

  /* ── Panel toggle ────────────────────────────── */
  function togglePanel(id) {
    if (activePanel === id) {
      closePanel();
    } else {
      closePanel();
      activePanel = id;
      const panel = document.getElementById(id === 'inv' ? 'invPanel' : 'skillsPanel');
      panel.classList.add('open');
    }
  }

  function closePanel() {
    document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
    activePanel = null;
  }

  function isPanelOpen() { return activePanel !== null; }

  /* ── Inventory panel ─────────────────────────── */
  function renderInventory(p) {
    const list = document.getElementById('invList');
    if (!p || !list) return;

    list.innerHTML = p.inventory.map(item => {
      let statTxt = '';
      if (item.type === 'weapon')     statTxt = `ATK +${item.atk}`;
      else if (item.type === 'armor') statTxt = `DEF +${item.def}`;
      else                            statTxt = item.effect === 'heal' ? `Heal ${item.value} HP` : `Buff +${item.value}`;

      return `<div class="inv-item ${item.equipped ? 'equipped' : ''}"
                   onclick="UI.equipItemById('${item.id}')">
        <div>
          <div class="item-name">${item.equipped ? '[E] ' : ''}${item.name}</div>
          <div class="item-stat">${statTxt}</div>
        </div>
        <div class="item-rarity rarity-${item.rarity}">${item.rarity.toUpperCase()}</div>
      </div>`;
    }).join('');
  }

  function equipItemById(id) {
    const p = Game.getPlayer();
    if (!p) return;
    Player.equip(p, id);
    refresh(p);
    addMsg('Equipped item', 'loot');
  }

  /* ── Skill tree panel ────────────────────────── */
  function renderSkills(p) {
    const list = document.getElementById('skillList');
    if (!p || !list) return;

    list.innerHTML = Loot.SKILLS.map(sk => {
      const unlocked  = !!p.skills[sk.id];
      const reqMet    = !sk.requires || !!p.skills[sk.requires];
      const canAfford = p.skillPoints >= sk.cost;
      const cls       = unlocked ? 'unlocked' : (!reqMet || !canAfford) ? 'locked' : '';
      const reqLabel  = sk.requires && !p.skills[sk.requires]
        ? `<span style="color:#cc4422;font-size:9px;">Requires: ${sk.requires}</span>` : '';

      return `<div class="skill-node ${cls}" onclick="UI.unlockSkill('${sk.id}')">
        <div class="skill-icon">${sk.icon}</div>
        <div class="skill-info">
          <h3>${sk.name}</h3>
          <p>${sk.desc}</p>
          ${reqLabel}
          <span class="skill-cost">${unlocked ? '✓ Unlocked' : `Cost: ${sk.cost} pts`}</span>
        </div>
      </div>`;
    }).join('');
  }

  function unlockSkill(id) {
    const p = Game.getPlayer();
    if (!p) return;
    const sk = Loot.SKILLS.find(s => s.id === id);
    if (!sk || p.skills[id]) return;
    if (sk.requires && !p.skills[sk.requires]) { addMsg('Prerequisite not met', 'warn'); return; }
    if (p.skillPoints < sk.cost)               { addMsg('Not enough skill points', 'warn'); return; }
    p.skillPoints  -= sk.cost;
    p.skills[sk.id] = true;
    sk.apply(p);
    addMsg(`Learned: ${sk.name}`, 'level');
    refresh(p);
  }

  /* ── Screen transitions ──────────────────────── */
  function _setAdBanner(visible) {
    const b = document.getElementById('adBanner');
    if (b) b.style.display = visible ? '' : 'none';
  }

  function showTitle() {
    document.getElementById('titleScreen').classList.add('active');
    document.getElementById('deathScreen').classList.remove('active');
    _setAdBanner(true);
  }

  function showDeath(floor, level) {
    document.getElementById('deathScreen').classList.add('active');
    _setAdBanner(true);
    document.getElementById('deathMsg').textContent =
      `Fell on Floor ${floor} at Level ${level}. The dungeon claims another soul...`;
  }

  function showLeaderboardPrompt(floor, level) {
    const prompt = document.getElementById('leaderboardPrompt');
    const input = document.getElementById('leaderboardNickname');
    const error = document.getElementById('leaderboardPromptError');
    if (!prompt || !input || typeof Save === 'undefined') return;

    pendingLeaderboardScore = { floor, level };
    prompt.hidden = false;
    input.value = '';
    input.onkeydown = event => {
      if (event.key === 'Enter') submitLeaderboardNickname();
    };
    if (error) error.textContent = '';
    setTimeout(() => input.focus(), 0);
  }

  function hideLeaderboardPrompt() {
    const prompt = document.getElementById('leaderboardPrompt');
    if (prompt) prompt.hidden = true;
    pendingLeaderboardScore = null;
  }

  function submitLeaderboardNickname() {
    const input = document.getElementById('leaderboardNickname');
    const error = document.getElementById('leaderboardPromptError');
    if (!pendingLeaderboardScore || !input || typeof Save === 'undefined') return;

    const result = Save.submitLeaderboardScore(
      input.value,
      pendingLeaderboardScore.floor,
      pendingLeaderboardScore.level
    );

    if (!result.ok) {
      if (error) error.textContent = result.error;
      return;
    }

    hideLeaderboardPrompt();
  }

  function hideTitleAndDeath() {
    document.getElementById('titleScreen').classList.remove('active');
    document.getElementById('deathScreen').classList.remove('active');
    hideLeaderboardPrompt();
    _setAdBanner(false);
  }
  /* ── Pause Menu ──────────────────────────────── */
function buildPauseMenu() {
  if (document.getElementById('pauseMenu')) return;

  const menu = document.createElement('div');
  menu.id = 'pauseMenu';
 menu.style.cssText = `
  display:none;position:fixed;inset:0;z-index:100;
  background:rgba(28,15,6,0.68);
  backdrop-filter:blur(6px);
  -webkit-backdrop-filter:blur(6px);
  flex-direction:column;align-items:stretch;justify-content:flex-start;
  font-family:'Cinzel',serif;
`;

  menu.innerHTML =  `
  <div id="pauseMain" style="flex:1;display:flex;flex-direction:row;align-items:stretch;justify-content:center;min-height:0;overflow:hidden;">
    <div id="pauseSidebar" style="
    width:200px;background:#3a2615;border-right:2px solid #7a4a18;
    display:flex;flex-direction:column;padding:1.2rem 0;gap:2px;
    min-height:0;overflow-y:auto;">
      <div style="color:#ffffff;font-size:14px;letter-spacing:4px;padding:0 1.5rem 1rem;font-weight:700;">PAUSED</div>
      <button class="pmenu-resume" onclick="UI.resumeGame()">&#9654; RESUME</button>
      <div style="height:10px"></div>
      <button class="pmenu-tab active" data-tab="items"    onclick="UI.pauseTab('items')">⚔ Items</button>
      <button class="pmenu-tab"        data-tab="skills"   onclick="UI.pauseTab('skills')">✦ Skills</button>
      <button class="pmenu-tab"        data-tab="upgrades" onclick="UI.pauseTab('upgrades')">▲ Upgrades</button>
      <div style="flex:1"></div>
      <button class="pmenu-exit" onclick="UI.closePauseMenu();Game.restartRun()">↺ Restart</button>
      <button class="pmenu-exit danger" onclick="location.reload()">✕ Quit</button>
    </div>
    <div id="pauseContent" style="
    flex:1;max-width:600px;overflow-y:auto;padding:2rem;
    color:#f4dfb0;font-family:inherit;background:#2d1b0d;
    min-height:0;">
    </div>
  </div>
  <div id="pauseAdBanner" style="
    flex:0 0 90px;display:flex;align-items:center;justify-content:center;
    background:#0d0d16;border-top:1px solid #1a1a2e;">
    <!-- ADSENSE SLOT: gamePauseBanner — replace with <ins> tag when ready -->
    <span style="font-size:11px;color:#3a3a5a;letter-spacing:1px;border:1px dashed #2a2a3e;padding:6px 16px;border-radius:3px;">Advertisement</span>
  </div>
`;

  document.body.appendChild(menu);

  const style = document.createElement('style');
  style.textContent = `
  .pmenu-resume {
    background:#c8922a;border:none;color:#0a0500;
    font-family:'Cinzel',serif;font-size:13px;font-weight:700;letter-spacing:2px;
    padding:0.7rem 1.5rem;text-align:center;cursor:pointer;
    margin:0 1rem 0.2rem;border-radius:2px;
    transition:background 0.15s;width:calc(100% - 2rem);
  }
  .pmenu-resume:hover { background:#ff9900; }
  .pmenu-tab {
    background:none;border:none;color:#aaaaaa;
    font-family:'Cinzel',serif;font-size:13px;letter-spacing:1px;
    padding:0.8rem 1.5rem;text-align:left;cursor:pointer;
    border-left:3px solid transparent;transition:all 0.15s;
    width:100%;
  }
  .pmenu-tab:hover  { color:#ffffff;background:rgba(255,255,255,0.08); }
  .pmenu-tab.active { color:#f0c060;border-left-color:#f0c060;background:rgba(240,192,96,0.1); }
  .pmenu-exit {
    background:none;border:none;color:#888;
    font-family:'Cinzel',serif;font-size:12px;letter-spacing:1px;
    padding:0.6rem 1.5rem;text-align:left;cursor:pointer;
    transition:color 0.15s;width:100%;
  }
  .pmenu-exit:hover { color:#ffffff; }
  .pmenu-exit.danger:hover { color:#ff4444; }
  #pauseContent h2 {
    color:#f0c060;font-size:14px;letter-spacing:2px;
    margin:0 0 1rem;border-bottom:1px solid #444;padding-bottom:0.6rem;
  }
  .pm-item {
    display:flex;justify-content:space-between;align-items:center;
    padding:0.7rem 0.9rem;margin-bottom:5px;
    background:#3a2615;border:1px solid #7a4a18;cursor:pointer;
    transition:border-color 0.15s;border-radius:3px;
  }
  .pm-item:hover    { border-color:#f0c060;background:#4a321b; }
  .pm-item.equipped { border-color:#66bb66;background:#314323; }
  .pm-item .iname   { font-size:13px;color:#e8e8e8; }
  .pm-item .istat   { font-size:11px;color:#aaaaaa;margin-top:2px; }
  .pm-item .irarity { font-size:10px;letter-spacing:1px; }
  .rarity-common    { color:#aaaaaa; }
  .rarity-uncommon  { color:#66dd66; }
  .rarity-rare      { color:#6699ff; }
  .rarity-epic      { color:#cc66ff; }
  .rarity-legendary { color:#ffaa33; }
  .pm-skill {
    display:flex;gap:1rem;padding:0.8rem;margin-bottom:6px;
    background:#3a2615;border:1px solid #7a4a18;border-radius:3px;cursor:pointer;
    transition:border-color 0.15s;
  }
  .pm-skill:hover:not(.locked) { border-color:#f0c060; }
  .pm-skill.unlocked { border-color:#66bb66;background:#314323; }
  .pm-skill.locked   { opacity:0.4;cursor:not-allowed; }
  .pm-skill .sicon   { font-size:24px;line-height:1;min-width:28px; }
  .pm-skill .sname   { font-size:13px;color:#e8e8e8;margin-bottom:3px; }
  .pm-skill .sdesc   { font-size:11px;color:#aaaaaa; }
  .pm-skill .scost   { font-size:11px;color:#f0c060;margin-top:4px; }
  .pm-upgrade {
    display:flex;justify-content:space-between;align-items:center;
    padding:0.8rem;margin-bottom:6px;
    background:#3a2615;border:1px solid #7a4a18;border-radius:3px;
  }
  .pm-upgrade .uinfo { font-size:13px;color:#e8e8e8; }
  .pm-upgrade .udesc { font-size:11px;color:#aaaaaa;margin-top:3px; }
  .pm-upgrade button {
    background:#4a321b;border:1px solid #f0c060;color:#f0c060;
    font-family:'Cinzel',serif;font-size:11px;letter-spacing:1px;
    padding:6px 14px;cursor:pointer;white-space:nowrap;
    transition:all 0.15s;border-radius:2px;
  }
  .pm-upgrade button:hover    { background:#f0c060;color:#000; }
  .pm-upgrade button:disabled { border-color:#555;color:#555;cursor:default;background:none; }
`;
  document.head.appendChild(style);
}

let pauseActiveTab = 'items';

function openPauseMenu() {
  buildPauseMenu();
  document.getElementById('pauseMenu').style.display = 'flex';
  pauseTab(pauseActiveTab);
  _setAdBanner(true);
}

function closePauseMenu() {
  const m = document.getElementById('pauseMenu');
  if (m) m.style.display = 'none';
  _setAdBanner(false);
}

function resumeGame() {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    closePauseMenu();
  } else {
    const mount = document.getElementById('canvasMount');
    if (mount) mount.requestPointerLock();
  }
}

function isPauseMenuOpen() {
  const m = document.getElementById('pauseMenu');
  return m && m.style.display === 'flex';
}

function pauseTab(tab) {
  pauseActiveTab = tab;
  document.querySelectorAll('.pmenu-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  const content = document.getElementById('pauseContent');
  const p = Game.getPlayer();
  if (!p) return;

  if (tab === 'items') {
    content.innerHTML = `<h2>INVENTORY</h2>` + (p.inventory.length === 0 ? '<p style="color:#4a3a2a">Nothing yet.</p>' :
      p.inventory.map(item => {
        let stat = item.type === 'weapon' ? `ATK +${item.atk}` :
                   item.type === 'armor'  ? `DEF +${item.def}` :
                   item.effect === 'heal' ? `Heal ${item.value} HP` : `Buff +${item.value}`;
        return `<div class="pm-item ${item.equipped ? 'equipped' : ''}" onclick="UI.equipItemById('${item.id}');UI.pauseTab('items')">
          <div><div class="iname">${item.equipped ? '[E] ' : ''}${item.name}</div>
               <div class="istat">${stat}</div></div>
          <div class="irarity rarity-${item.rarity}">${item.rarity.toUpperCase()}</div>
        </div>`;
      }).join(''));

  } else if (tab === 'skills') {
    content.innerHTML = `<h2>SKILLS &nbsp;<span style="color:#446644;font-size:11px">${p.skillPoints} point${p.skillPoints !== 1 ? 's' : ''} available</span></h2>` +
      Loot.SKILLS.map(sk => {
        const unlocked  = !!p.skills[sk.id];
        const reqMet    = !sk.requires || !!p.skills[sk.requires];
        const canAfford = p.skillPoints >= sk.cost;
        const cls       = unlocked ? 'unlocked' : (!reqMet || !canAfford) ? 'locked' : '';
        const costLabel = unlocked ? '✓ Unlocked' : `Cost: ${sk.cost} pts`;
        const req       = sk.requires && !p.skills[sk.requires] ? `<span style="color:#cc4422;font-size:10px">Requires: ${sk.requires}</span>` : '';
        return `<div class="pm-skill ${cls}" onclick="UI.unlockSkill('${sk.id}');UI.pauseTab('skills')">
          <div class="sicon">${sk.icon}</div>
          <div><div class="sname">${sk.name}</div>
               <div class="sdesc">${sk.desc}</div>
               ${req}<div class="scost">${costLabel}</div></div>
        </div>`;
      }).join('');

  } else if (tab === 'upgrades') {
    const upgrades = [
      { id:'hp',    label:'Max HP +20',       desc:`Current: ${p.maxHp} HP`,      cost:3, apply: p => { p.maxHp += 20; p.hp = Math.min(p.hp + 20, p.maxHp); } },
      { id:'atk',   label:'Attack +5',        desc:`Current: ${Player.totalAtk(p)} ATK`, cost:3, apply: p => { p.atk += 5; } },
      { id:'def',   label:'Defense +3',       desc:`Current: ${Player.totalDef(p)} DEF`, cost:2, apply: p => { p.def += 3; } },
      { id:'spd',   label:'Speed +0.5',       desc:`Current: ${p.speed.toFixed(1)} SPD`, cost:2, apply: p => { p.speed += 0.5; } },
      { id:'crit',  label:'Crit Chance +5%',  desc:`Current: ${Math.round(p.critChance*100)}%`, cost:3, apply: p => { p.critChance = Math.min(0.75, p.critChance + 0.05); } },
      { id:'life',  label:'Lifesteal +3%',    desc:`Current: ${Math.round(p.lifesteal*100)}%`,  cost:4, apply: p => { p.lifesteal = Math.min(0.3, p.lifesteal + 0.03); } },
    ];
    content.innerHTML = `<h2>UPGRADES &nbsp;<span style="color:#446644;font-size:11px">${p.skillPoints} point${p.skillPoints !== 1 ? 's' : ''} available</span></h2>` +
      upgrades.map(u => `
        <div class="pm-upgrade">
          <div><div class="uinfo">${u.label}</div><div class="udesc">${u.desc}</div></div>
          <button onclick="UI.buyUpgrade('${u.id}')" ${p.skillPoints < u.cost ? 'disabled' : ''}>${u.cost} pts</button>
        </div>`).join('');
  }
}

function buyUpgrade(id) {
  const p = Game.getPlayer();
  if (!p) return;
  const upgrades = {
    hp:   { cost:3, apply: p => { p.maxHp += 20; p.hp = Math.min(p.hp + 20, p.maxHp); } },
    atk:  { cost:3, apply: p => { p.atk += 5; } },
    def:  { cost:2, apply: p => { p.def += 3; } },
    spd:  { cost:2, apply: p => { p.speed += 0.5; } },
    crit: { cost:3, apply: p => { p.critChance = Math.min(0.75, p.critChance + 0.05); } },
    life: { cost:4, apply: p => { p.lifesteal = Math.min(0.3, p.lifesteal + 0.03); } },
  };
  const u = upgrades[id];
  if (!u || p.skillPoints < u.cost) return;
  p.skillPoints -= u.cost;
  u.apply(p);
  addMsg(`Upgraded: ${id}`, 'level');
  if (window.AgeeAnalytics) window.AgeeAnalytics.trackEvent('upgrade_selected', { upgrade_id: id });
  pauseTab('upgrades'); // re-render with new values
  refresh(p);
}
  function clearMessages() { messages = []; document.getElementById('msgLog').innerHTML = ''; }

  return {
    addMsg,
    refresh,
    setFloor,
    renderSaveMeta,
    showBossBar,
    updateBossBar,
    hideBossBar,
    togglePanel,
    closePanel,
    isPanelOpen,
    renderInventory,
    openPauseMenu,
    closePauseMenu,
    resumeGame,
    isPauseMenuOpen,
    pauseTab,
    buyUpgrade,
    renderSkills,
    equipItemById,
    unlockSkill,
    showTitle,
    showDeath,
    showLeaderboardPrompt,
    submitLeaderboardNickname,
    hideTitleAndDeath,
    clearMessages,
  };

})();
