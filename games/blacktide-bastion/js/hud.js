// hud.js — DOM HUD, screens, inter-wave panel, leaderboard save

const HUD = (() => {
  // Cache DOM refs
  const $ = id => document.getElementById(id);

  // ── INIT ──────────────────────────────────────────────────────
  function init() {
    setTimeout(syncLocalLeaderboard, 0);
  }

  // ── SCREEN MANAGEMENT ─────────────────────────────────────────
  function showScreen(id) {
    ['titleScreen', 'failScreen', 'interWavePanel'].forEach(s => {
      const el = $(s);
      if (el) el.classList.toggle('active', s === id);
    });
  }

  function showTitle()   { showScreen('titleScreen'); _updateTitleStats(); }
  function showGame()    { showScreen(null); }
  function showFail(gs)  {
    showScreen('failScreen');
    $('failWave').textContent  = gs.wave;
    $('failScore').textContent = gs.score.toLocaleString();
    const accuracy = gs.shotsFired > 0 ? Math.round(gs.shotsHit / gs.shotsFired * 100) : 0;
    $('failAccuracy').textContent = accuracy + '%';
    _triggerLeaderboardPrompt(gs);
  }

  // ── INTER-WAVE PANEL ──────────────────────────────────────────
  let _pendingUpgrades = [];
  let _onPick          = null;

  function showInterWave(wave, gold, upgrades, canRepair, onPick) {
    _pendingUpgrades = upgrades;
    _onPick          = onPick;

    $('iwWaveNum').textContent = wave + 1;
    $('iwGold').textContent    = gold;

    const container = $('iwUpgradeCards');
    container.innerHTML = '';

    upgrades.forEach((upg, i) => {
      const card = document.createElement('button');
      card.className = 'iw-card';
      card.innerHTML = `
        <span class="iw-icon">${upg.icon}</span>
        <span class="iw-name">${upg.name}</span>
        <span class="iw-desc">${upg.desc}</span>
        <span class="iw-cost">${upg.cost}g</span>
      `;
      const disabled = gold < upg.cost;
      card.disabled = disabled;
      if (disabled) card.classList.add('disabled');
      card.addEventListener('click', () => _pickUpgrade(i));
      container.appendChild(card);
    });

    // Repair button
    const repairBtn = $('iwRepairBtn');
    const repairCost = 50;
    repairBtn.disabled = !canRepair || gold < repairCost;
    repairBtn.textContent = `REPAIR FORT  (${repairCost}g)`;

    showScreen('interWavePanel');
  }

  function _pickUpgrade(idx) {
    _onPick && _onPick({ type: 'upgrade', idx });
  }

  function hideInterWave() {
    showScreen(null);
  }

  // Patch repair button listener — wired in game.js via data attribute
  function bindInterWaveButtons(onRepair, onContinue) {
    const rBtn = $('iwRepairBtn');
    const cBtn = $('iwContinueBtn');
    if (rBtn) rBtn.onclick = () => onRepair();
    if (cBtn) cBtn.onclick = () => onContinue();
  }

  // ── MAIN HUD SYNC ─────────────────────────────────────────────
  function sync(gs, player, station) {
    // Fort bar
    const fortPct = Math.max(0, gs.fortHP / gs.fortMaxHP);
    $('fortFill').style.width = (fortPct * 100) + '%';
    $('fortFill').style.background = fortPct > 0.5
      ? 'linear-gradient(90deg,#1a6a1a,#44cc44)'
      : fortPct > 0.25
        ? 'linear-gradient(90deg,#8a6600,#ddaa00)'
        : 'linear-gradient(90deg,#8b0000,#cc2200)';
    $('fortText').textContent = Math.ceil(gs.fortHP) + '/' + gs.fortMaxHP;

    // Economy
    $('hudGold').textContent   = gs.gold;
    $('hudWave').textContent   = gs.wave;
    $('hudScore').textContent  = gs.score.toLocaleString();
    $('hudMult').textContent   = 'x' + gs.multiplier.toFixed(1);

    // XP / level bar
    if (gs.xpToNext > 0) {
      const xpPct = Math.min(1, gs.xp / gs.xpToNext);
      $('xpFill').style.width = (xpPct * 100) + '%';
      $('hudLevel').textContent = gs.playerLevel;
      $('xpText').textContent   = gs.xp + '/' + gs.xpToNext;
    }

    // Cannon info
    if (station) {
      const def    = CANNON_DEFS[station.cannonType];
      const maxCD  = 1 / def.fireRate;
      const pct    = Math.max(0, 1 - station.cooldown / maxCD);
      $('cannonName').textContent = def.name;
      $('cannonReload').style.width = (pct * 100) + '%';
      $('mountedIndicator').style.opacity = player.mounted ? '1' : '0.3';
    }

    // Control hints — hide after wave 2
    const hints = $('controlHints');
    if (hints && gs.wave > 2) hints.style.display = 'none';
  }

  // ── STATION RING GLOW ─────────────────────────────────────────
  function updateStationRings(stations, player) {
    stations.forEach((st, i) => {
      const near = (i === player.currentStation && player.mounted);
      st.ringMat.opacity = near ? 0.85 : 0;
    });
  }

  // ── DAMAGE FLASH ──────────────────────────────────────────────
  let _flashTimer = 0;
  function damageFlash() {
    const flash = $('damageFlash');
    if (!flash) return;
    flash.style.opacity = '1';
    _flashTimer = 0.3;
  }
  function updateFlash(dt) {
    if (_flashTimer <= 0) return;
    _flashTimer -= dt;
    const flash = $('damageFlash');
    if (flash) flash.style.opacity = Math.max(0, _flashTimer / 0.3).toString();
  }

  // ── FLOATING SCORE TEXT ───────────────────────────────────────
  function spawnScoreText(worldPos, text, camera, renderer) {
    const el = document.createElement('div');
    el.className     = 'score-pop';
    el.textContent   = text;
    document.getElementById('canvasMount').appendChild(el);

    // Project world position to screen
    const v = worldPos.clone().project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    const sx = (v.x  * 0.5 + 0.5) * rect.width  + rect.left;
    const sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
    el.style.left = sx + 'px';
    el.style.top  = sy + 'px';

    setTimeout(() => el.remove(), 900);
  }

  // ── LEVEL-UP NOTICE ───────────────────────────────────────────
  function showLevelUp(level, desc) {
    const el = $('levelUpNotice');
    if (!el) return;
    el.innerHTML = `LEVEL ${level}<br><span class="lv-bonus">${desc}</span>`;
    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');
  }

  // ── LEADERBOARD ───────────────────────────────────────────────
  const LB_KEY = 'blacktide_bastion_lb';
  const LB_SYNC_KEY = 'blacktide_bastion_lb.synced.v1';

  function _getScores() {
    try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
    catch { return []; }
  }

  function _scorePayload(entry) {
    const dateMs = Number(entry.date) || Date.now();
    return {
      player_id: window.AgeeLeaderboard ? AgeeLeaderboard.playerId() : 'guest-player',
      nickname: window.AgeeLeaderboard
        ? AgeeLeaderboard.cleanName(entry.name, 'SAILOR')
        : String(entry.name || 'SAILOR').trim().substring(0, 16),
      score: Number(entry.score) || 0,
      wave: Number(entry.wave) || 0,
      created_at: new Date(dateMs).toISOString(),
    };
  }

  function syncLocalLeaderboard() {
    if (!window.AgeeLeaderboard || !AgeeLeaderboard.syncLocal) return;
    AgeeLeaderboard.syncLocal(
      'blacktide_bastion_leaderboard',
      _getScores(),
      _scorePayload,
      { syncKey: LB_SYNC_KEY }
    ).then(result => {
      if (result && result.failed) console.warn('[Blacktide leaderboard] Local sync failed for some rows.', result);
    });
  }

  function saveScore(name, score, wave) {
    const nick = window.AgeeLeaderboard && AgeeLeaderboard.submissionName
      ? AgeeLeaderboard.submissionName(name, 'SAILOR')
      : String(name || 'SAILOR').trim().substring(0, 16);
    const date = Date.now();
    const scores = _getScores();
    const entry = {
      name: nick,
      score: Number(score) || 0,
      wave: Number(wave) || 0,
      date,
    };
    scores.push(entry);
    scores.sort((a, b) => (b.score - a.score) || (b.wave - a.wave) || (a.date - b.date));
    scores.splice(20);
    localStorage.setItem(LB_KEY, JSON.stringify(scores));

    if (window.AgeeLeaderboard && AgeeLeaderboard.insert) {
      AgeeLeaderboard.insert('blacktide_bastion_leaderboard', _scorePayload(entry), { syncKey: LB_SYNC_KEY }).then(result => {
        if (result && result.error) console.warn('[Blacktide leaderboard] Supabase insert failed.', result.error);
      });
    }
  }

  function _triggerLeaderboardPrompt(gs) {
    const prompt = $('leaderboardPrompt');
    const scores = _getScores();
    const qualifies = scores.length < 20 || gs.score > (scores[scores.length - 1]?.score || 0);
    if (!qualifies) {
      if (prompt) prompt.style.display = 'none';
      return;
    }

    if (window.AgeeLeaderboard && AgeeLeaderboard.isLoggedIn && AgeeLeaderboard.isLoggedIn()) {
      saveScore('', gs.score, gs.wave);
      if (prompt) prompt.style.display = 'none';
      return;
    }

    if (prompt) prompt.style.display = 'block';

    const saveBtn = $('lbSaveBtn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        const nick = ($('lbNickname').value || 'SAILOR').trim().substring(0, 16);
        saveScore(nick, gs.score, gs.wave);
        $('leaderboardPrompt').style.display = 'none';
        GameAudio.play('upgrade');

        // Show success message
        const successMsg = document.createElement('div');
        successMsg.style.cssText = `
          position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.9); color: #8f8; padding: 12px 24px;
          border-radius: 4px; z-index: 1000; font-size: 14px; border: 1px solid #484;
        `;
        successMsg.textContent = `✓ Score submitted! Captain "${nick}" added to leaderboard.`;
        document.body.appendChild(successMsg);
        setTimeout(() => successMsg.remove(), 3000);

        // Scroll to leaderboard
        const lbSection = $('leaderboardRows') || $('leaderboard');
        if (lbSection) setTimeout(() => lbSection.scrollIntoView({ behavior: 'smooth' }), 300);
      };
    }
  }

  // ── TITLE STATS ───────────────────────────────────────────────
  function _updateTitleStats() {
    const scores  = _getScores();
    const bestScore = scores.length ? scores[0].score : 0;
    const bestWave  = scores.reduce((max, s) => Math.max(max, s.wave), 0);
    const runs      = parseInt(localStorage.getItem('bbt_runs') || '0');

    const bsEl = $('titleBestScore');
    const bwEl = $('titleBestWave');
    const rEl  = $('titleRuns');
    if (bsEl) bsEl.textContent = bestScore.toLocaleString();
    if (bwEl) bwEl.textContent = bestWave;
    if (rEl)  rEl.textContent  = runs;
  }

  function incrementRuns() {
    const runs = parseInt(localStorage.getItem('bbt_runs') || '0') + 1;
    localStorage.setItem('bbt_runs', runs);
  }

  return {
    init,
    showTitle,
    showGame,
    showFail,
    showInterWave,
    hideInterWave,
    bindInterWaveButtons,
    sync,
    updateStationRings,
    damageFlash,
    updateFlash,
    spawnScoreText,
    showLevelUp,
    saveScore,
    incrementRuns,
  };
})();
