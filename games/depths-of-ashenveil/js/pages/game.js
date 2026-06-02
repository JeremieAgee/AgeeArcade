/* ═══════════════════════════════════════════════════
   game.js  —  Main loop, state, floor transitions,
               input wiring, chest interaction

   Required HTML elements:
     <div id="stairOverlay"></div>
     <div id="chestPrompt">Press E to open chest</div>
     <div id="stairPrompt">Press E to descend the stairs</div>

   Required CSS:s
     #stairOverlay {
       position:fixed; inset:0; background:#000;
       opacity:0; pointer-events:none; z-index:50;
       transition: opacity 0.1s;
     }
     #chestPrompt, #stairPrompt {
       position:fixed; bottom:22%; left:50%;
       transform:translateX(-50%);
       background:rgba(0,0,0,0.72); color:#e8d090;
       font-family:serif; font-size:1.1rem;
       padding:8px 20px; border-radius:4px;
       border:1px solid #7a5a20;
       opacity:0; pointer-events:none; z-index:40;
       transition: opacity 0.25s;
     }
     #stairPrompt { color:#b888ff; border-color:#7744cc; }
════════════════════════════════════════════════════ */
const Game = (() => {

  const _isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  /* ── State ───────────────────────────────────── */
  let player  = null;
  let dungeon = null;
  let enemies = [];
  let floor   = 1;
  let running = false;

  let bossSpawned  = false;
  let bossDefeated = false;
  let doorOpened   = false;
  let exitOpen     = false;
  let stairActive  = false;

  // Per-run analytics counters
  let _runStartTime       = 0;
  let _runDeaths          = 0;
  let _runBossesDefeated  = 0;
  let _runChestsOpened    = 0;
  let _runEnemiesKilled   = 0;

  const keys = {};
  let rafId  = null;
  let aimAngleVal = 0;

  // Pre-built game state prepared while title/death screen is showing
  let _prebuilt = null;
  // Incremented on every start() call — cancels stale warmup RAF chains
  let _startGen = 0;
  // Incremented on every preload() call and on start() — cancels stale preload async chains
  let _preloadGen = 0;
  // Pre-generated dungeon data for the next floor (built during stair descent)
  let _nextDungeon = null;
  let _nextFloorNum = 0;
  let _nextFloorGenerating = false;
  // Boss pre-built with mesh hidden — revealed on room entry with no build cost
  let preBoss = null;
  let _lastPersistMs = 0;

  /* ── Chunked enemy mesh builder ─────────────── */
  // Sorts enemies nearest-first, builds CHUNK_SIZE meshes synchronously,
  // then chains the next batch via setTimeout(0) so the main thread never stalls.
  // A generation counter cancels any pending chain when the floor changes.
  const CHUNK_SIZE     = 4;
  const LAZY_DIST_SQ   = (4 * 20) ** 2;
  const ACTIVE_RADIUS  = 48;   // world units — enemies beyond this skip AI
  let   _buildGen    = 0;

  // onComplete fires (via setTimeout) after the last chunk finishes
  function buildEnemyMeshesChunked(ens, spawnX, spawnZ, onComplete) {
    const gen    = ++_buildGen;
    const sorted = [...ens].sort((a, b) => {
      const da = (a.x - spawnX) ** 2 + (a.z - spawnZ) ** 2;
      const db = (b.x - spawnX) ** 2 + (b.z - spawnZ) ** 2;
      return da - db;
    });

    function buildChunk(idx) {
      if (_buildGen !== gen) return; // floor changed — abandon this chain
      const end = Math.min(idx + CHUNK_SIZE, sorted.length);
      for (let i = idx; i < end; i++) {
        if (!sorted[i].mesh && !sorted[i].dead) Engine.buildEnemyMesh(sorted[i]);
      }
      if (end < sorted.length) {
        setTimeout(() => buildChunk(end), 0);
      } else if (onComplete) {
        setTimeout(onComplete, 0);
      }
    }

    buildChunk(0); // first chunk runs synchronously right now
  }

  /* ── Input ───────────────────────────────────── */
  function wireInput() {
    document.addEventListener('keydown', e => {
      const key = e.key.toLowerCase();
      keys[key] = true;
      if (!running) return;
      if (key === 'i') UI.togglePanel('inv');
      if (key === 'k') UI.togglePanel('skills');
      if (key === 'e') tryInteract();
      if (key === ' ' && !e.repeat) tryBlink();
      if (e.key === 'Escape') {
        // ESC closes the menu. Pointer lock re-entry must come from a click
        // (browsers throw SecurityError if requestPointerLock is called
        //  in the same event chain that caused the lock to exit via ESC).
        if (UI.isPauseMenuOpen()) UI.closePauseMenu();
      }
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))
        e.preventDefault();
    });

    document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

    const mount = document.getElementById('canvasMount');
    mount.addEventListener('mousedown', e => {
      if (e.button === 0 && running && !UI.isPanelOpen() && Engine.isPointerLocked()) doAttack();
    });
  }

  function refreshSaveMeta(meta) {
    if (typeof Save === 'undefined' || typeof UI === 'undefined' || !UI.renderSaveMeta) return;
    UI.renderSaveMeta(meta || Save.loadMeta());
  }

  function hasActiveRun() {
    if (running && player && player.hp > 0) return true;
    return !!(typeof Save !== 'undefined' && Save.hasActiveRun && Save.hasActiveRun());
  }

  function updateTitleStartLabel() {
    const btn = document.getElementById('titleStartBtn');
    const restartBtn = document.getElementById('titleRestartBtn');
    const active = hasActiveRun();
    if (btn) btn.textContent = active ? 'RESUME RUN' : 'START NEW RUN';
    if (restartBtn) restartBtn.hidden = !active;
  }

  function setStartupStatus(text) {
    const loadEl = document.getElementById('titleLoading');
    if (loadEl) {
      loadEl.textContent = text;
      loadEl.style.opacity = '1';
    }
    const floorEl = document.querySelector('#entryCinematic .ec-floor');
    if (floorEl) floorEl.textContent = text.toUpperCase();
    console.log(`[Depths startup] ${text}`);
  }

  function serializeEnemy(enemy) {
    if (!enemy) return null;
    const { mesh, hpBar, ...plain } = enemy;
    return { ...plain, mesh: null };
  }

  function serializeDungeon(source) {
    if (!source) return null;
    return {
      ...source,
      grid: source.grid.map(row => Array.from(row)),
      _preSpawns: undefined,
      _preBossData: undefined,
    };
  }

  function reviveDungeon(source) {
    if (!source) return null;
    return {
      ...source,
      grid: source.grid.map(row => Uint8Array.from(row)),
      toWorld: Dungeon.toWorld,
      roomCenter(room) {
        return {
          cx: Math.floor(room.x + room.w / 2),
          cy: Math.floor(room.y + room.h / 2),
        };
      },
    };
  }

  function makeActiveRunSnapshot() {
    if (!running || !player || !dungeon || player.hp <= 0) return null;
    return {
      version: 1,
      savedAt: Date.now(),
      floor,
      player: JSON.parse(JSON.stringify(player)),
      dungeon: serializeDungeon(dungeon),
      enemies: enemies.map(serializeEnemy).filter(Boolean),
      preBoss: serializeEnemy(preBoss),
      flags: { bossSpawned, bossDefeated, doorOpened, exitOpen },
    };
  }

  function persistActiveRun(force = false) {
    if (typeof Save === 'undefined' || !Save.saveActiveRun) return;
    const now = Date.now();
    if (!force && now - _lastPersistMs < 1200) return;
    _lastPersistMs = now;
    // Snapshot is expensive (full dungeon serialize + JSON clone) — only build after throttle passes
    const snap = makeActiveRunSnapshot();
    if (snap) Save.saveActiveRun(snap);
  }

  function loadSavedRun() {
    if (typeof Save === 'undefined' || !Save.loadActiveRun) return null;
    const snap = Save.loadActiveRun();
    if (!snap || !snap.player || snap.player.hp <= 0 || !snap.dungeon) return null;
    return snap;
  }

  function rebuildEnemySoa() {
    if (typeof EnemySoa     !== 'undefined' && EnemySoa.rebuild) EnemySoa.rebuild(enemies);
    if (typeof SpatialManager !== 'undefined') {
      SpatialManager.clear('monsters');
      for (let _i = 0; _i < enemies.length; _i++) {
        const _e = enemies[_i];
        if (!_e.dead) SpatialManager.insert('monsters', _i, [_e.x, _e.z]);
      }
    }
  }

  function syncEnemySoa() {
    if (typeof EnemySoa !== 'undefined' && EnemySoa.syncFromEnemies) EnemySoa.syncFromEnemies(enemies);
  }

  function tryBlink() {
    if (!running || !player || !dungeon || player.hp <= 0) return;
    if (stairActive || UI.isPanelOpen() || UI.isPauseMenuOpen()) return;
    if (Engine.getChestAnim()) return;

    const oldX = player.x;
    const oldZ = player.z;
    const result = Player.blink(player, aimAngleVal, dungeon);
    const ok = result === true || (result && result.ok);
    if (!ok) return;

    const startX = result.oldX !== undefined ? result.oldX : oldX;
    const startZ = result.oldZ !== undefined ? result.oldZ : oldZ;
    Engine.spawnParticles(startX, 0.8, startZ, 0x8844ff, 16, 5, 0.45);
    Engine.spawnParticles(player.x, 0.8, player.z, 0x8844ff, 20, 5.5, 0.55);
    UI.addMsg('Blink', 'level');
  }

  /* ── Show floor announce overlay ─────────────── */
  function showFloorAnnounce(floorNum) {
    const el    = document.getElementById('floorAnnounce');
    const numEl = document.getElementById('floorAnnounceNum');
    if (!el || !numEl) return;
    numEl.textContent = `FLOOR ${floorNum}`;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2000);
  }

  /* ── Preload ─────────────────────────────────── */
  // Generates dungeon data immediately, then chunks geometry in the background.
  // Phase 1 (spawn-band rows) → enables Enter button.
  // Phase 2 (remaining rows + lanterns) → marks _prebuilt.fullyBuilt = true.
  // start() shows an entry cinematic and waits for fullyBuilt before revealing.
  function preload() {
    _prebuilt = null;
    refreshSaveMeta();
    updateTitleStartLabel();
    setStartupStatus('Preparing dungeon...');

    const btn    = document.getElementById('titleStartBtn');
    const loadEl = document.getElementById('titleLoading');

    const myGen = ++_preloadGen;
    requestAnimationFrame(() => {
      // Abort if start() or a newer preload() has superseded us
      if (_preloadGen !== myGen) return;
      try {
        setStartupStatus('Generating dungeon...');
        const p = Player.create();
        const d = Dungeon.generate(1);
        const { cx, cy } = d.roomCenter(d.startRoom);
        const w = d.toWorld(cx, cy);
        p.x = w.x; p.z = w.z;
        p._descentY = 0;

        Engine.init();
        Engine.clearDynamic();
        Engine.buildPlayerMesh(p);

        setStartupStatus('Placing enemies...');
        const ens = Enemies.spawnAll(d, 1);
        const pb  = Enemies.createBoss(d.bossRoom, 1, d);

        // Set _prebuilt immediately — start() can grab references even before
        // all geometry is built. fullyBuilt = false until Phase 2 completes.
        _prebuilt = { player: p, dungeon: d, enemies: ens, boss: pb, fullyBuilt: false };

        if (typeof SpatialManager !== 'undefined') SpatialManager.init(d);
        Engine.buildDungeonChunked(d,
          // Phase 1 done — spawn area ready, enable button
          () => {
            if (_preloadGen !== myGen) return;
            if (btn)    btn.disabled = false;
            updateTitleStartLabel();
            setStartupStatus('Ready.');
            if (loadEl) loadEl.style.opacity = '0';
          },
          // Phase 2 done — all geometry ready
          () => {
            if (_preloadGen !== myGen) return;
            setStartupStatus('Finishing dungeon...');
            Engine.buildEnemyMesh(pb);
            if (pb.mesh) pb.mesh.position.y = -5;
            _prebuilt.fullyBuilt = true;
            setStartupStatus('Dungeon ready.');
            buildEnemyMeshesChunked(ens, p.x, p.z, () => Engine.buildExitPortal(d));
          }
        );
      } catch (err) {
        console.error('[Depths startup] preload failed', err);
        _prebuilt = null;
        if (btn)    btn.disabled = false;
        updateTitleStartLabel();
        setStartupStatus('Startup fallback ready.');
        if (loadEl) loadEl.style.opacity = '0';
      }
    });
  }

  /* ── Entry cinematic ─────────────────────────── */
  function showEntryCinematic(gen, snap, onReveal) {
    const el = document.getElementById('entryCinematic');
    if (!el) return;
    el.style.display = 'flex';
    setStartupStatus('Entering the dungeon...');
    requestAnimationFrame(() => el.classList.add('ec-visible'));
    const MIN_MS = 3000;
    const MAX_MS = 7000;
    const t0 = Date.now();
    let revealed = false;
    function tryReveal() {
      if (_startGen !== gen) return;
      const elapsed = Date.now() - t0;
      const ready = !snap || snap.fullyBuilt || elapsed >= MAX_MS;
      if (ready && elapsed >= MIN_MS) {
        if (revealed) return;
        revealed = true;
        if (snap && !snap.fullyBuilt) {
          console.warn('[Depths startup] forced reveal before preload completed');
          setStartupStatus('Opening early...');
        } else {
          setStartupStatus('Opening dungeon...');
        }
        el.classList.remove('ec-visible');
        setTimeout(() => { el.style.display = 'none'; }, 800);
        if (onReveal) onReveal();
        if (snap) _prebuilt = null;
      } else {
        setTimeout(tryReveal, 80);
      }
    }
    setTimeout(tryReveal, 80);
  }

  /* ── Start ───────────────────────────────────── */
  function start() {
    ++_preloadGen; // cancel any pending preload rAF/callbacks that haven't fired yet
    UI.clearMessages();
    UI.closePanel();
    UI.hideBossBar();

    floor        = 1;
    bossSpawned  = false;
    bossDefeated = false;
    doorOpened   = false;
    exitOpen     = false;
    stairActive  = false;
    running      = true;
    _nextDungeon = null;
    _nextFloorNum = 0;
    _nextFloorGenerating = false;

    _runStartTime      = Date.now();
    _runDeaths         = 0;
    _runBossesDefeated = 0;
    _runChestsOpened   = 0;
    _runEnemiesKilled  = 0;
    if (window.AgeeAnalytics) {
      window.AgeeAnalytics.startGameSession('depths_of_ashenveil').then(function () {
        window.AgeeAnalytics.trackEvent('game_started', { floor: 1 });
      });
    }

    const snap = _prebuilt;

    if (snap) {
      player  = snap.player;
      dungeon = snap.dungeon;
      enemies = snap.enemies;
      preBoss = snap.boss || null;
    } else {
      player  = Player.create();
      dungeon = Dungeon.generate(floor);
      const { cx, cy } = dungeon.roomCenter(dungeon.startRoom);
      const w = dungeon.toWorld(cx, cy);
      player.x = w.x; player.z = w.z;
      player._descentY = 0;
      Engine.init();
      Engine.clearDynamic();
      if (typeof SpatialManager !== 'undefined') SpatialManager.init(dungeon);
      Engine.buildDungeon(dungeon);
      Engine.buildPlayerMesh(player);
      enemies = Enemies.spawnAll(dungeon, floor);
      preBoss = Enemies.createBoss(dungeon.bossRoom, floor, dungeon);
      Engine.buildEnemyMesh(preBoss);
      if (preBoss.mesh) preBoss.mesh.position.y = -5;
      buildEnemyMeshesChunked(enemies, player.x, player.z, () => Engine.buildExitPortal(dungeon));
    }
    rebuildEnemySoa();

    UI.refresh(player);
    persistActiveRun(true);
    UI.setFloor(floor);
    refreshSaveMeta(Save.recordFloorReached(floor, player.level));
    UI.addMsg('You descend into the dungeon...', 'warn');

    if (rafId) cancelAnimationFrame(rafId);
    const gen = ++_startGen;

    UI.hideTitleAndDeath();
    loop();
    showEntryCinematic(gen, snap, () => {
      refreshSaveMeta(Save.recordRunStart());
      persistActiveRun(true);
    });
  }

  /* ── Next floor ──────────────────────────────── */
  function startOrResume() {
    if (running && player && player.hp > 0) {
      UI.hideTitleAndDeath();
      return;
    }

    const saved = loadSavedRun();
    if (saved && restoreRun(saved)) return;

    start();
  }

  function restartRun() {
    if (typeof Save !== 'undefined' && Save.clearActiveRun) Save.clearActiveRun();
    start();
  }

  function restoreRun(saved) {
    try {
      UI.clearMessages();
      UI.closePanel();
      UI.hideBossBar();

      floor = Math.max(1, Number.parseInt(saved.floor, 10) || 1);
      player = saved.player;
      player._descentY = 0;
      dungeon = reviveDungeon(saved.dungeon);
      enemies = (saved.enemies || []).map(e => ({ ...e, mesh: null })).filter(e => !e.dead);
      preBoss = saved.preBoss ? { ...saved.preBoss, mesh: null } : null;
      rebuildEnemySoa();

      const flags = saved.flags || {};
      bossSpawned = !!flags.bossSpawned;
      bossDefeated = !!flags.bossDefeated;
      doorOpened = !!flags.doorOpened;
      exitOpen = !!flags.exitOpen;
      stairActive = false;
      running = true;
      _nextDungeon = null;
      _nextFloorNum = 0;
      _nextFloorGenerating = false;

      Engine.init();
      Engine.clearDynamic();
      if (typeof SpatialManager !== 'undefined') SpatialManager.init(dungeon);
      Engine.buildDungeon(dungeon);
      Engine.buildPlayerMesh(player);

      if (preBoss) {
        Engine.buildEnemyMesh(preBoss);
        if (preBoss.mesh) preBoss.mesh.position.y = -5;
      }

      buildEnemyMeshesChunked(enemies, player.x, player.z, () => {
        Engine.buildExitPortal(dungeon);
        if (exitOpen) Engine.revealExitPortal();
      });

      UI.refresh(player);
      UI.setFloor(floor);
      UI.addMsg('Run restored.', 'level');
      UI.hideTitleAndDeath();
      if (rafId) cancelAnimationFrame(rafId);
      ++_startGen;
      loop();
      persistActiveRun(true);
      return true;
    } catch (err) {
      console.error('[Depths startup] restore failed', err);
      if (Save.clearActiveRun) Save.clearActiveRun();
      return false;
    }
  }

  function nextFloor() {
    floor++;
    bossSpawned  = false;
    bossDefeated = false;
    doorOpened   = false;
    exitOpen     = false;
    stairActive  = false;

    // Use pre-generated dungeon if it matches this floor number
    dungeon = (_nextFloorNum === floor && _nextDungeon)
      ? _nextDungeon
      : Dungeon.generate(floor);
    _nextDungeon  = null;
    _nextFloorNum = 0;
    _nextFloorGenerating = false;

    const { cx, cy } = dungeon.roomCenter(dungeon.startRoom);
    const w = dungeon.toWorld(cx, cy);
    player.x = w.x; player.z = w.z;
    player._descentY = 4.5;  // player starts above portal (y=3.5), descends through it

    player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.3));

    if (preBoss) { Engine.removeEnemyMesh(preBoss.id); preBoss = null; }
    Engine.clearDynamic();
    if (typeof SpatialManager !== 'undefined') SpatialManager.init(dungeon);
    Engine.buildDungeon(dungeon);
    Engine.buildArrivalPortal(dungeon);

    // Use pre-spawned data from pregenNextFloor() if available
    enemies = dungeon._preSpawns     || Enemies.spawnAll(dungeon, floor);
    preBoss = dungeon._preBossData   || Enemies.createBoss(dungeon.bossRoom, floor, dungeon);
    rebuildEnemySoa();
    Engine.buildEnemyMesh(preBoss);
    if (preBoss.mesh) preBoss.mesh.position.y = -5;
    buildEnemyMeshesChunked(enemies, player.x, player.z, () => {
      Engine.buildExitPortal(dungeon);
      if (bossDefeated) Engine.revealExitPortal();
    });

    try { Engine.render(player, 0, 0.016); } catch (_) {}

    showFloorAnnounce(floor);
    if (window.AgeeAnalytics) window.AgeeAnalytics.trackEvent('floor_reached', { floor: floor });
    // Fade the black overlay out quickly so the player can be seen descending
    // through the arrival portal. The 1.2s CSS transition does the smooth fade.
    setTimeout(() => {
      const overlay = document.getElementById('stairOverlay');
      if (overlay) overlay.style.opacity = '0';
    }, 100);

    UI.hideBossBar();
    UI.setFloor(floor);
    refreshSaveMeta(Save.recordFloorReached(floor, player.level));
    UI.addMsg(`Floor ${floor} — you drop through the portal...`, 'warn');
    UI.refresh(player);
  }

  /* ── Main loop ───────────────────────────────── */
  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!running) return;

    const dt = Math.min(Engine.clock.getDelta(), 0.05);
    const t  = Engine.clock.elapsedTime;

    aimAngleVal = Engine.updateAimFromMouse();

    // Mobile joystick + action buttons
    if (_isMobile) {
      const mc = window._mobileCtrl;
      if (mc) {
        if (mc.active) {
          // Joystick X → rotate camera (like mouse left/right)
          const TURN_SPEED = 2.0; // radians per second — tune up/down to taste
          aimAngleVal += mc.joyNx * TURN_SPEED * dt;
          Engine.setAimAngleDirect(aimAngleVal);
          // Joystick Y → forward / backward (up = forward, down = back)
          keys['w'] = mc.joyNy < -0.15;
          keys['s'] = mc.joyNy >  0.15;
        } else {
          keys['w'] = false;
          keys['s'] = false;
        }
        keys['a'] = false;
        keys['d'] = false;
        // Consume pending actions
        if (mc.attackPending && running && !stairActive && !UI.isPanelOpen() && !UI.isPauseMenuOpen()) {
          mc.attackPending = false;
          doAttack();
        }
        if (mc.interactPending && running && !stairActive) { mc.interactPending = false; tryInteract(); }
        if (mc.blinkPending   && running && !stairActive) { mc.blinkPending   = false; tryBlink(); }
        if (mc.pausePending)                               { mc.pausePending   = false; UI.openPauseMenu(); }
      }
    }

    // Stair descent — freeze everything else
    if (stairActive) {
      Engine.tickStairDescent(player, dt);
      Engine.updateTorchFlicker(t);
      Engine.render(player, t, dt);
      return;
    }

    const _canim = Engine.getChestAnim();
    if (!UI.isPanelOpen() && !_canim) {
      Player.update(player, dungeon, keys, aimAngleVal, dt);
    }
    if (!running) return;

    // Walk player to front of chest during the approach phase (first 32% of animation)
    if (_canim && _canim.targetX !== undefined) {
      const _walkEnd = _canim.duration * 0.32;
      if (_canim.t < _walkEnd) {
        const _p    = _canim.t / _walkEnd;
        const _ease = 1 - (1 - _p) * (1 - _p);
        player.x = _canim.startX + (_canim.targetX - _canim.startX) * _ease;
        player.z = _canim.startZ + (_canim.targetZ - _canim.startZ) * _ease;
        player._moving = _p < 0.90;
      } else {
        player._moving = false;
      }
    }

    // ── Solid collision: push player out of chests and enemies ──
    {
      const _nearChestIds = typeof SpatialManager !== 'undefined'
        ? new Set(SpatialManager.query('items', [player.x, player.z], 2))
        : null;
      for (const grp of Engine.chestMeshes) {
        if (_nearChestIds && !_nearChestIds.has(grp.userData.staticItemIdx)) continue;
        const cdx = player.x - grp.position.x, cdz = player.z - grp.position.z;
        const dSq = cdx * cdx + cdz * cdz, minD = 0.85;
        if (dSq < minD * minD && dSq > 0.0001) {
          const d = Math.sqrt(dSq);
          player.x = grp.position.x + cdx / d * minD;
          player.z = grp.position.z + cdz / d * minD;
        }
      }
    }
    {
      const _collIdxs = typeof SpatialManager !== 'undefined'
        ? SpatialManager.query('monsters', [player.x, player.z], 3)
        : null;
      if (_collIdxs) {
        for (const idx of _collIdxs) {
          const e = enemies[idx]; if (!e || e.dead) continue;
          const edx = player.x - e.x, edz = player.z - e.z;
          const dSq = edx * edx + edz * edz, minD = 0.35 + e.radius;
          if (dSq < minD * minD && dSq > 0.0001) {
            const d = Math.sqrt(dSq);
            player.x = e.x + edx / d * minD;
            player.z = e.z + edz / d * minD;
          }
        }
      } else {
      for (const e of enemies) {
        if (e.dead) continue;
        const edx = player.x - e.x, edz = player.z - e.z;
        const dSq = edx * edx + edz * edz, minD = 0.35 + e.radius;
        if (dSq < minD * minD && dSq > 0.0001) {
          const d = Math.sqrt(dSq);
          player.x = e.x + edx / d * minD;
          player.z = e.z + edz / d * minD;
        }
      }
      } // end else (no SpatialManager)
    }

    if (UI.isPauseMenuOpen()) {
      Engine.render(player, t, dt);
      return;
    }

    // Descend from arrival portal above start room
    if (player._descentY > 0) {
      player._descentY = Math.max(0, player._descentY - dt * 3.2);
      if (player._descentY === 0) Engine.removeArrivalPortal();
    }

    checkBossEntry();

    // Nearby enemy indices — all per-frame loops gate on this Set
    const _nearIdx = typeof SpatialManager !== 'undefined'
      ? new Set(SpatialManager.query('monsters', [player.x, player.z], ACTIVE_RADIUS))
      : null;

    // ── AI tick (nearby only) ──
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      if (_nearIdx && !_nearIdx.has(i)) continue;
      const result = Enemies.tick(e, player, dungeon, dt);
      if (result && result.attacked) {
        const dmg = Player.takeDamage(player, result.dmg);
        if (dmg > 0) UI.addMsg(result.earthSlam ? `${e.name}'s earth slam hits you for ${dmg}!` : `${e.name} hits you for ${dmg}!`, 'combat');
        if (result.earthSlam) Engine.spawnParticles(player.x, 0.2, player.z, 0x8a6a3a, 22, 3.5, 0.7);
        if (player.hp <= 0) { die(); return; }
      }
      if (result && result.boltFired) {
        const b = result.boltFired;
        Engine.fireBolt(b.x, b.z, b.vx, b.vz, b.dmg, b.kind);
      }
      if (result && result.summoned) {
        result.summoned.forEach(s => {
          const summoned = Enemies.createAtWorld(s.typeKey, s.worldX, s.worldZ, floor);
          enemies.push(summoned);
          Engine.buildEnemyMesh(summoned);
          Engine.spawnParticles(summoned.x, 0.8, summoned.z, summoned.color, 14, 3.2, 0.8);
        });
        rebuildEnemySoa(); // once after all summons, not per-summon
      }
      Engine.updateEnemyHpBar(e);
      if (e.isBoss && bossSpawned) UI.updateBossBar(e);
    }

    // Sync moved positions back into spatial grid (index-keyed)
    if (typeof SpatialManager !== 'undefined' && _nearIdx) {
      for (const i of _nearIdx) {
        const e = enemies[i];
        if (e && !e.dead) SpatialManager.move('monsters', i, [e.x, e.z]);
      }
    }

    let _hadDeath = false;
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].dead) {
        if (enemies[i].mesh) Engine.removeEnemyMesh(enemies[i].id);
        enemies[i] = enemies[enemies.length - 1];
        enemies.length--;
        _hadDeath = true;
      }
    }
    if (_hadDeath) rebuildEnemySoa(); // rebuilds index-keyed spatial grid

    // ── Push enemies apart (nearby only, index-keyed) ──
    // Build a flat array of nearby live enemies once so both loops are O(near²) not O(total²)
    // No fallback: without SpatialManager the O(n²) cost is unacceptable at scale
    const _nearList = _nearIdx
      ? [..._nearIdx].reduce((a, i) => { const e = enemies[i]; if (e && !e.dead) a.push(e); return a; }, [])
      : null;
    for (let i = 0; _nearList && i < _nearList.length; i++) {
      const a = _nearList[i];
      for (let j = i + 1; j < _nearList.length; j++) {
        const b = _nearList[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const dSq = dx * dx + dz * dz, minD = a.radius + b.radius;
        if (dSq < minD * minD && dSq > 0.0001) {
          const d = Math.sqrt(dSq), push = (minD - d) * 0.5 / d;
          a.x -= dx * push; a.z -= dz * push;
          b.x += dx * push; b.z += dz * push;
          if (a.mesh) { a.mesh.position.x = a.x; a.mesh.position.z = a.z; }
          if (b.mesh) { b.mesh.position.x = b.x; b.mesh.position.z = b.z; }
        }
      }
    }

    // ── Push enemies away from chests (nearby only, index-keyed) ──
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (e.dead) continue;
      if (_nearIdx && !_nearIdx.has(i)) continue;
      for (const grp of Engine.chestMeshes) {
        const dx = e.x - grp.position.x, dz = e.z - grp.position.z;
        const dSq = dx * dx + dz * dz, minD = e.radius + 0.5;
        if (dSq < minD * minD && dSq > 0.0001) {
          const d = Math.sqrt(dSq);
          e.x = grp.position.x + dx / d * minD;
          e.z = grp.position.z + dz / d * minD;
          if (e.mesh) { e.mesh.position.x = e.x; e.mesh.position.z = e.z; }
        }
      }
    }

    // ── Lazy mesh builder — index lookup O(1) ──
    {
      const _lazyIdxs = typeof SpatialManager !== 'undefined'
        ? SpatialManager.query('monsters', [player.x, player.z], Math.sqrt(LAZY_DIST_SQ))
        : null;
      if (_lazyIdxs) {
        for (const idx of _lazyIdxs) {
          const _le = enemies[idx];
          if (_le && !_le.mesh && !_le.dead) { Engine.buildEnemyMesh(_le); break; }
        }
      } else {
        for (const e of enemies) {
          if (e.mesh || e.dead) continue;
          const dx = e.x - player.x, dz = e.z - player.z;
          if (dx * dx + dz * dz <= LAZY_DIST_SQ) { Engine.buildEnemyMesh(e); break; }
        }
      }
    }

    Engine.updateEnemyAnimations(enemies, dt);
    const boltDmg = Engine.updateBolts(dt, player);
    if (boltDmg > 0) {
      const dmg = Player.takeDamage(player, boltDmg);
      if (dmg > 0) UI.addMsg(`Struck by an arrow for ${dmg}!`, 'combat');
      if (player.hp <= 0) { die(); }
    }
    Engine.updateParticles(dt);
    Engine.updateTorchFlicker(t);
    Engine.updateChests(dt);
    Engine.updateChestPrompt(player);
    Engine.updateTorchPrompt(player);
    Engine.updateDoorPrompt(player, dungeon, doorOpened);
    Engine.updateStairPrompt(player, exitOpen, dungeon);

    Engine.render(player, t, dt);

    if (Math.round(t * 60) % 20 === 0) {
      UI.refresh(player);
      Engine.updatePlayerEquipment(player);
    }
    persistActiveRun();
  }

  /* ── Boss entry ──────────────────────────────── */
  // Triggers when player approaches within 2 tiles of the boss door.
  // The door is blocking entry, so we can't wait for the player to be inside.
  function checkBossEntry() {
    if (bossSpawned) return;
    const gx = Math.floor(player.x / dungeon.TILE);
    const gz = Math.floor(player.z / dungeon.TILE);
    if (gx < 0 || gz < 0 || gx >= dungeon.COLS || gz >= dungeon.ROWS) return;
    if (dungeon.grid[gz][gx] !== 4) return;
    bossSpawned = true;
    if (window.AgeeAnalytics) window.AgeeAnalytics.trackEvent('boss_reached', { floor });

    const boss = preBoss || Enemies.createBoss(dungeon.bossRoom, floor, dungeon);
    preBoss = null;
    // Reveal pre-built mesh (lift from underground) — shaders already compiled, zero stall
    if (boss.mesh) {
      boss.mesh.position.y = 0;
    } else {
      Engine.buildEnemyMesh(boss); // fallback if pre-build didn't happen
    }
    enemies.push(boss);
    rebuildEnemySoa();
    UI.showBossBar(boss);
    UI.addMsg(`\u26a0 ${boss.name.toUpperCase()} AWAKENS!`, 'warn');
    Engine.spawnParticles(boss.x, 1.5, boss.z, boss.color, 30, 5, 1.5);
  }

  /* ── Attack ──────────────────────────────────── */
  function doAttack() {
    Engine.triggerSwing();
    const hits = Player.attack(player, enemies, aimAngleVal);

    hits.forEach(({ enemy, dmg, isCrit, killed }) => {
      Engine.spawnParticles(
        enemy.x, enemy.height * 0.7, enemy.z,
        isCrit ? 0xffff00 : 0xff3300,
        isCrit ? 14 : 8, isCrit ? 5 : 3, isCrit ? 0.8 : 0.5
      );
      if (isCrit) UI.addMsg(`Critical! ${dmg} damage`, 'combat');

      if (killed) {
        enemy.dead = true;
        _runEnemiesKilled++;
        Engine.spawnParticles(enemy.x, 1.0, enemy.z, enemy.color, 20, 4, 1.0);
        player.xp += enemy.xp;
        UI.addMsg(`${enemy.name} slain! +${enemy.xp} XP`, 'combat');

        if (Math.random() < 0.18 + floor * 0.015) {
          const item = Loot.genItem(floor);
          if (player.inventory.length < 24) {
            player.inventory.push(item);
            UI.addMsg(`Found: ${item.name} [${item.rarity}]`, 'loot');
          }
        }

        if (enemy.isBoss) {
          bossDefeated = true;
          _runBossesDefeated++;
          if (window.AgeeAnalytics) window.AgeeAnalytics.trackEvent('boss_defeated', { floor: floor });
          refreshSaveMeta(Save.recordBossDefeated());
          UI.hideBossBar();
          UI.addMsg('Boss defeated! Step into the portal to continue...', 'level');
          Engine.spawnParticles(enemy.x, 1.5, enemy.z, 0x8844ff, 40, 6, 2.0);
          Engine.revealExitPortal();
          exitOpen = true;
          pregenNextFloor(); // next floor generates while player walks to portal
        }

        const leveled = Player.checkLevelUp(player);
        if (leveled) Engine.spawnParticles(player.x, 1.0, player.z, 0x4488ff, 24, 5, 1.2);
        UI.refresh(player);
      }
    });

    const a = aimAngleVal || 0;
    Engine.spawnParticles(
      player.x + Math.cos(a) * 1.5, 1.0, player.z + Math.sin(a) * 1.5,
      0xffcc44, 5, 2.5, 0.3
    );
  }

  /* ── Interact ────────────────────────────────── */
  function tryInteract() {
    const torchResult = Engine.toggleNearbyWallTorch(player);
    if (torchResult === 'picked') {
      UI.addMsg('You take the wall torch.', 'loot');
      return;
    }
    if (torchResult === 'placed') {
      UI.addMsg('You set the torch in the holder.', 'loot');
      return;
    }

    // 0. Open boss door (E key, like a chest)
    if (!doorOpened && !bossSpawned && dungeon.bossEntrance) {
      const wx = dungeon.bossEntrance.wallTx * dungeon.TILE + dungeon.TILE / 2;
      const wz = dungeon.bossEntrance.wallTy * dungeon.TILE + dungeon.TILE / 2;
      const dx = player.x - wx, dz = player.z - wz;
      if (dx*dx + dz*dz < (dungeon.TILE * 2.5) ** 2) {
        doorOpened = true;
        Engine.openBossDoor(dungeon);
        UI.addMsg('The door creaks open...', 'warn');
        return;
      }
    }

    // 1. Stair descent (only if exit is open and stairs exist)
    if (exitOpen && !stairActive && dungeon.bossRoom) {
      const bc   = dungeon.roomCenter(dungeon.bossRoom);
      const w    = dungeon.toWorld(bc.cx, bc.cy);
      const dx   = player.x - w.x;
      const dz   = player.z - w.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < dungeon.TILE * 2.5) {
        stairActive = true;
        pregenNextFloor();
        UI.addMsg('The portal draws you inward...', 'warn');
        Engine.spawnParticles(player.x, 1.0, player.z, 0x8844ff, 20, 4, 1.0);
        Engine.startStairDescent(player, dungeon, () => { nextFloor(); });
        return;
      }
    }

    // 2. Open nearby chest
    openNearbyChest();
  }

  /* ── Pre-generate next floor after boss kill ────────────────────────────
     Runs entirely in background — never touches the current scene.
     Chain: generate dungeon data → yield frame → spawn enemy data → yield
     By the time the player walks to the portal and descends, both dungeon
     layout and enemy lists are ready; nextFloor() just hands them to Engine.
  ──────────────────────────────────────────────────────────────────────── */
  function pregenNextFloor() {
    const nextF = floor + 1;
    if (_nextFloorGenerating) return;
    if (_nextFloorNum === nextF && _nextDungeon) return;
    _nextFloorGenerating = true;
    _nextDungeon  = null;
    _nextFloorNum = 0;

    // Step 1 — generate dungeon grid (CPU-heavy, ~5-15ms)
    setTimeout(() => {
      try {
        const d = Dungeon.generate(nextF);
        // Step 2 — pre-compute enemy spawn list (cheap, but yield a frame first)
        setTimeout(() => {
          try {
            d._preSpawns = Enemies.spawnAll(d, nextF);
            d._preBossData = Enemies.createBoss(d.bossRoom, nextF, d);
            _nextDungeon  = d;
            _nextFloorNum = nextF;
            _nextFloorGenerating = false;
          } catch (_) {
            _nextFloorGenerating = false;
            /* enemy data falls back to sync */
          }
        }, 0);
      } catch (_) {
        _nextFloorGenerating = false;
        /* dungeon falls back to sync in nextFloor() */
      }
    }, 200); // 200ms delay keeps it well clear of boss-death particle burst
  }

  /* ── Chest opening ───────────────────────────── */
  function openNearbyChest() {
    for (const grp of Engine.chestMeshes) {
      const cd = grp.userData.chestData;
      if (cd.opened) continue;
      const dx   = player.x - grp.position.x;
      const dz   = player.z - grp.position.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < dungeon.TILE) {
        cd.opened                 = true;
        grp.userData.isOpening    = true;
        grp.userData.lidOpenT     = 0;
        Engine.startChestOpenAnimation(grp.position.x, grp.position.z, player.x, player.z);

        _runChestsOpened++;
        if (window.AgeeAnalytics) window.AgeeAnalytics.trackEvent('chest_opened', { floor: floor });

        const item = Loot.genItem(floor);
        player.inventory.push(item);
        UI.addMsg(`Chest opened! Found: ${item.name} [${item.rarity}]`, 'loot');
        Engine.spawnParticles(grp.position.x, 0.9, grp.position.z, 0xffcc44, 18, 3, 0.9);
        UI.refresh(player);
        return; // one chest at a time
      }
    }
  }

  /* ── Death ───────────────────────────────────── */
  function die() {
    if (!running) return;
    running = false;
    _runDeaths++;
    updateTitleStartLabel();
    if (Save.clearActiveRun) Save.clearActiveRun();
    refreshSaveMeta(Save.recordDeath(floor, player.level));
    UI.hideBossBar();
    UI.showDeath(floor, player.level);
    if (window.AgeeAnalytics) {
      window.AgeeAnalytics.trackEvent('player_died', { floor: floor, level: player.level });
      window.AgeeAnalytics.endGameSession({
        duration_seconds: Math.round((Date.now() - _runStartTime) / 1000),
        max_floor:        floor,
        max_level:        player.level,
        deaths:           _runDeaths,
        bosses_defeated:  _runBossesDefeated,
        chests_opened:    _runChestsOpened,
        enemies_killed:   _runEnemiesKilled,
        end_reason:       'death',
      });
    }
    if (Save.qualifiesForLeaderboard(player.level, floor)) {
      UI.showLeaderboardPrompt(floor, player.level);
    }
    preload(); // rebuild floor 1 in background while death screen shows
  }

  function getPlayer() { return player; }

  function _init() {
    wireInput();
    document.addEventListener('depths-save-change', updateTitleStartLabel);
    preload();
    if (window.AgeeAnalytics) window.AgeeAnalytics.trackEvent('game_loaded', { game_id: 'depths_of_ashenveil' });

    window.addEventListener('pagehide', function () {
      if (!window.AgeeAnalytics || !window.AGEE_CURRENT_GAME_SESSION_ID) return;
      window.AgeeAnalytics.endGameSessionUnload({
        duration_seconds: Math.round((Date.now() - _runStartTime) / 1000),
        max_floor:        floor,
        max_level:        player ? player.level : 1,
        deaths:           _runDeaths,
        bosses_defeated:  _runBossesDefeated,
        chests_opened:    _runChestsOpened,
        enemies_killed:   _runEnemiesKilled,
        end_reason:       'abandoned',
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  function goToTitle() {
    running = false;
    if (window.AgeeAnalytics && window.AGEE_CURRENT_GAME_SESSION_ID) {
      window.AgeeAnalytics.trackEvent('game_quit', { floor, level: player ? player.level : 1 });
      window.AgeeAnalytics.endGameSession({
        duration_seconds: Math.round((Date.now() - _runStartTime) / 1000),
        max_floor:        floor,
        max_level:        player ? player.level : 1,
        deaths:           _runDeaths,
        bosses_defeated:  _runBossesDefeated,
        chests_opened:    _runChestsOpened,
        enemies_killed:   _runEnemiesKilled,
        end_reason:       'quit',
      });
    }
    preload();
    refreshSaveMeta();
    updateTitleStartLabel();
    UI.showTitle();
  }

  return { start, startOrResume, restartRun, goToTitle, getPlayer };

})();
