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

  function toRoman(n) {
    const vals = [10,9,5,4,1], syms = ['X','IX','V','IV','I'];
    let r = '';
    for (let i = 0; i < vals.length; i++) while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
    return r || String(n);
  }

  /* ── State ───────────────────────────────────── */
  let player  = null;
  let dungeon = null;
  let enemies = [];
  let enemiesById = new Map();
  let traps   = [];
  let trapRooms = [];
  let activeTrapRoom = null;
  let floor   = 1;
  let running = false;

  let bossSpawned  = false;
  let bossDefeated = false;
  let doorOpened   = false;
  let exitOpen     = false;
  let stairActive  = false;

  /* ── Floor Generation Worker ────────────────────── */
  let _floorWorker    = null;
  let _floorCallbacks = {}; // requestId → { resolve, floorNum }

  function _initFloorWorker() {
    if (_floorWorker) return;
    try {
      _floorWorker = new Worker('js/workers/floor-gen-worker.js');
    } catch (err) {
      console.warn('[FloorWorker] unavailable', err);
      _floorWorker = null;
      return;
    }
    _floorWorker.onmessage = function (e) {
      const msg = e.data;
      const cb  = _floorCallbacks[msg.requestId];
      if (!cb) return;
      delete _floorCallbacks[msg.requestId];
      if (msg.type === 'ready') cb.resolve(msg);
      else cb.reject(new Error(msg.message || 'floor-gen-worker error'));
    };
    _floorWorker.onerror = err => {
      console.error('[FloorWorker]', err);
      const pending = _floorCallbacks;
      _floorCallbacks = {};
      Object.values(pending).forEach(cb => {
        if (cb && cb.reject) cb.reject(new Error('floor-gen-worker failed to load'));
      });
      if (_floorWorker) {
        _floorWorker.terminate();
        _floorWorker = null;
      }
    };
  }

  function _workerGenerateFloor(floorNum) {
    return new Promise((resolve, reject) => {
      _initFloorWorker();
      if (!_floorWorker) {
        reject(new Error('floor-gen-worker unavailable'));
        return;
      }
      const requestId = floorNum + '-' + Date.now();
      const timeoutId = setTimeout(() => {
        delete _floorCallbacks[requestId];
        reject(new Error('floor-gen-worker timed out'));
      }, 2500);
      _floorCallbacks[requestId] = {
        floorNum,
        resolve: msg => { clearTimeout(timeoutId); resolve(msg); },
        reject: err => { clearTimeout(timeoutId); reject(err); },
      };
      _floorWorker.postMessage({ type: 'generate', floor: floorNum, requestId });
    });
  }

  /* ── Monster AI Worker ───────────────────────────── */
  let _aiWorker       = null;
  let _workerReady    = false;
  let _aiTickInFlight = false;
  // Latest tick result received from worker (applied next frame)
  let _pendingUpdates = null;
  let _pendingEvents  = null;
  let _pendingDead    = null;

  function _initWorker() {
    if (_aiWorker) { _aiWorker.terminate(); }
    try {
      _aiWorker = new Worker('js/workers/monster-ai-worker.js');
    } catch (err) {
      console.warn('[MonsterWorker] unavailable', err);
      _aiWorker = null;
      _workerReady = false;
      _aiTickInFlight = false;
      return;
    }
    _workerReady = true;
    _aiWorker.onmessage = _onWorkerMessage;
    _aiWorker.onerror   = err => {
      _aiTickInFlight = false;
      console.error('[MonsterWorker]', err);
    };
  }

  function _onWorkerMessage(e) {
    const msg = e.data;
    if (msg.type === 'spawned') {
      // Worker created all enemies — populate enemies[] and build meshes
      enemies = msg.enemies.map(snap => _snapToEnemy(snap));
      preBoss = null; // boss comes separately via addBoss
      rebuildEnemySoa();
      const { cx, cy } = dungeon.roomCenter(dungeon.startRoom);
      const w = dungeon.toWorld(cx, cy);
      buildEnemyMeshesChunked(enemies, w.x, w.z, () => {
        Engine.buildExitPortal(dungeon);
        if (exitOpen) Engine.revealExitPortal();
      });
      return;
    }
    if (msg.type === 'bossCreated') {
      preBoss = _snapToEnemy(msg.boss);
      Engine.buildEnemyMesh(preBoss);
      if (preBoss.mesh) preBoss.mesh.position.y = -5;
      return;
    }
    if (msg.type === 'tickResult') {
      _aiTickInFlight = false;
      _pendingUpdates = msg.updates;
      _pendingEvents  = msg.events;
      _pendingDead    = msg.dead;
    }
  }

  // Convert a worker snapshot into a minimal enemy object the main thread needs
  function _snapToEnemy(snap) {
    return {
      ...snap,
      mesh:    null,
      _walkT:  0,
    };
  }

  // Send dungeon + spawns to worker — worker replies with 'spawned' + 'bossCreated'
  function _workerInit(floorNum, dng) {
    if (!_aiWorker) return;
    const serialGrid = dng.grid.map(row => Array.from(row));
    _aiWorker.postMessage({
      type:   'init',
      floor:  floorNum,
      dungeon: {
        grid:   serialGrid,
        COLS:   dng.COLS,
        ROWS:   dng.ROWS,
        TILE:   dng.TILE,
        spawns: dng.spawns,
      },
    });
    // Kick off boss pre-creation immediately
    if (dng.bossRoom) {
      _aiWorker.postMessage({
        type:    'addBoss',
        bossRoom: dng.bossRoom,
        floor:   floorNum,
        dungeon: { TILE: dng.TILE },
      });
    }
  }

  function _spawnEnemiesSync(floorNum, dng) {
    enemies = Enemies.spawnAll(dng, floorNum);
    preBoss = dng.bossRoom ? Enemies.createBoss(dng.bossRoom, floorNum, dng) : null;
    rebuildEnemySoa();
    if (preBoss) {
      Engine.buildEnemyMesh(preBoss);
      if (preBoss.mesh) preBoss.mesh.position.y = -5;
    }
    buildEnemyMeshesChunked(enemies, player.x, player.z, () => {
      Engine.buildExitPortal(dng);
      if (exitOpen) Engine.revealExitPortal();
    });
  }

  // Per-run analytics counters
  let _runStartTime       = 0;
  let _runDeaths          = 0;
  let _runBossesDefeated  = 0;
  let _runChestsOpened    = 0;
  let _runEnemiesKilled   = 0;

  function _showAdBreak(adType, adName) {
    if (typeof window.adBreak !== 'function') return;
    if (document.hidden) return;
    adBreak({
      type: adType,
      name: adName,
    });
  }

  const keys = {};
  let rafId  = null;
  let aimAngleVal = 0;
  let _lastPromptT = 0;

  // Pre-built game state prepared while title/death screen is showing
  let _prebuilt = null;
  let _prebuiltContinue = null; // pre-built geometry for a saved run, stashed on title screen
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
  const CHUNK_SIZE     = 6;
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
      if (e.key === 'Escape') {
        if (UI.isPauseMenuOpen()) UI.closePauseMenu();
        return;
      }
      if (!running) return;
      if (key === 'i') UI.togglePanel('inv');
      if (key === 'k') UI.togglePanel('skills');
      if (key === 'e') tryInteract();
      if (key === ' ' && !e.repeat) tryBlink();
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
    const p = player;
    return {
      version: 1,
      savedAt: Date.now(),
      floor,
      player: {
        x: p.x, y: p.y, z: p.z,
        hp: p.hp, maxHp: p.maxHp,
        atk: p.atk, def: p.def, speed: p.speed,
        level: p.level, xp: p.xp, xpNext: p.xpNext, skillPoints: p.skillPoints,
        critChance: p.critChance, lifesteal: p.lifesteal, atkSpeed: p.atkSpeed,
        hasBlink: p.hasBlink, hasWhirl: p.hasWhirl, hasRegen: p.hasRegen, hasExecute: p.hasExecute,
        skills: { ...p.skills },
        inventory: p.inventory,
        buffs: p.buffs,
      },
      dungeon: serializeDungeon(dungeon),
      flags: { bossSpawned, bossDefeated, doorOpened, exitOpen },
    };
  }

  function persistActiveRun(force = false) {
    if (typeof Save === 'undefined' || !Save.saveActiveRun) return;
    const now = Date.now();
    if (!force && now - _lastPersistMs < 5000) return;
    _lastPersistMs = now;
    setTimeout(() => {
      const snap = makeActiveRunSnapshot();
      if (snap) Save.saveActiveRun(snap);
    }, 0);
  }

  function loadSavedRun() {
    if (typeof Save === 'undefined' || !Save.loadActiveRun) return null;
    const snap = Save.loadActiveRun();
    if (!snap || !snap.player || snap.player.hp <= 0 || !snap.dungeon) return null;
    return snap;
  }

  function rebuildEnemySoa() {
    enemiesById = new Map();
    if (typeof EnemySoa     !== 'undefined' && EnemySoa.rebuild) EnemySoa.rebuild(enemies);
    if (typeof SpatialManager !== 'undefined') {
      SpatialManager.clear('monsters');
      for (let _i = 0; _i < enemies.length; _i++) {
        const _e = enemies[_i];
        if (_e && _e.id) enemiesById.set(_e.id, _e);
        if (!_e.dead) SpatialManager.insert('monsters', _i, [_e.x, _e.z]);
      }
    } else {
      for (const _e of enemies) {
        if (_e && _e.id) enemiesById.set(_e.id, _e);
      }
    }
  }

  function swapRemoveEnemyAt(i) {
    const lastIdx = enemies.length - 1;
    const removed = enemies[i];
    const moved = enemies[lastIdx];

    if (removed && removed.id) enemiesById.delete(removed.id);

    if (typeof SpatialManager !== 'undefined') {
      SpatialManager.remove('monsters', i);
      if (i !== lastIdx) SpatialManager.remove('monsters', lastIdx);
    }

    if (typeof EnemySoa !== 'undefined' && EnemySoa.removeAtSwap) {
      EnemySoa.removeAtSwap(i);
    }

    if (i !== lastIdx) enemies[i] = moved;
    enemies.pop();

    if (i !== lastIdx && moved && moved.id) {
      enemiesById.set(moved.id, moved);
      if (typeof SpatialManager !== 'undefined' && !moved.dead) {
        SpatialManager.insert('monsters', i, [moved.x, moved.z]);
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
  // Generates floor 1 data on the floor worker (zero main-thread cost).
  // Geometry is built in start() during the entry cinematic.
  function preload() {
    _prebuilt = null;
    _prebuiltContinue = null;
    refreshSaveMeta();
    updateTitleStartLabel();

    const btn    = document.getElementById('titleStartBtn');
    const loadEl = document.getElementById('titleLoading');
    const myGen  = ++_preloadGen;
    if (btn) btn.disabled = false;

    _workerGenerateFloor(1).then(msg => {
      if (_preloadGen !== myGen) return;
      const d = reviveDungeon(msg.dungeon);
      d._preSpawns   = msg.spawns;
      d._preBossData = msg.boss;
      const p = Player.create();
      const { cx, cy } = d.roomCenter(d.startRoom);
      const w = d.toWorld(cx, cy);
      p.x = w.x; p.z = w.z;
      p._descentY = 0;

      // Build geometry on title screen — no game loop competing, so no lag
      if (typeof SpatialManager !== 'undefined') SpatialManager.init(d);
      Engine.init();
      Engine.clearDynamic();
      Engine.buildPlayerMesh(p);
      Engine.buildDungeonChunked(d,
        null, // no spawn-ready callback needed on title screen
        () => {
          if (_preloadGen !== myGen) return;
          Engine.snapLanternsToPlayer(p.x, p.z);
          _prebuilt = { player: p, dungeon: d, geometryReady: true };
          if (btn) btn.disabled = false;
          updateTitleStartLabel();
          if (loadEl) loadEl.style.opacity = '0';
          // After floor 1 is done, pre-build continue floor geometry off-screen
          _prebuildContinueFloor(p, d, myGen);
        }
      );
    }).catch(err => {
      console.warn('[Depths] floor worker failed, falling back to sync', err);
      try {
        const d = Dungeon.generate(1);
        d._preSpawns = Enemies.spawnAll(d, 1);
        const p = Player.create();
        const { cx, cy } = d.roomCenter(d.startRoom);
        const w = d.toWorld(cx, cy);
        p.x = w.x; p.z = w.z;
        p._descentY = 0;
        if (typeof SpatialManager !== 'undefined') SpatialManager.init(d);
        Engine.init();
        Engine.clearDynamic();
        Engine.buildPlayerMesh(p);
        Engine.buildDungeonChunked(d, null, () => {
          Engine.snapLanternsToPlayer(p.x, p.z);
          _prebuilt = { player: p, dungeon: d, geometryReady: true };
          if (btn) btn.disabled = false;
          updateTitleStartLabel();
          if (loadEl) loadEl.style.opacity = '0';
        });
      } catch (_) {
        if (btn) btn.disabled = false;
        updateTitleStartLabel();
        if (loadEl) loadEl.style.opacity = '0';
      }
    });
  }

  /* ── Pre-build continue floor geometry on title screen ── */
  function _prebuildContinueFloor(floor1Player, floor1Dungeon, myGen) {
    _prebuiltContinue = null;
    const saved = loadSavedRun();
    if (!saved) return;
    try {
      const cd = reviveDungeon(saved.dungeon);
      const cp = saved.player;
      if (typeof SpatialManager !== 'undefined') SpatialManager.init(cd);
      // Stash floor 1 state — it stays off-scene while we build the continue floor
      const floor1Snap = Engine.stashDungeonState();
      Engine.buildDungeonChunked(cd, null, () => {
        if (_preloadGen !== myGen) {
          // Preload was cancelled — restore floor 1 and discard
          Engine.stashDungeonState();
          Engine.installDungeonState(floor1Snap);
          Engine.snapLanternsToPlayer(floor1Player.x, floor1Player.z);
          return;
        }
        Engine.snapLanternsToPlayer(cp.x, cp.z);
        const continueSnap = Engine.stashDungeonState();
        _prebuiltContinue = { player: cp, dungeon: cd, dungeonState: continueSnap, geometryReady: true };
        // Restore floor 1 as the visible title screen background
        if (typeof SpatialManager !== 'undefined') SpatialManager.init(floor1Dungeon);
        Engine.installDungeonState(floor1Snap);
        Engine.snapLanternsToPlayer(floor1Player.x, floor1Player.z);
      });
    } catch (err) {
      console.warn('[Depths] continue preload failed', err);
    }
  }

  /* ── Entry cinematic ─────────────────────────── */
  function showEntryCinematic(gen, snap, onReveal) {
    const el = document.getElementById('entryCinematic');
    if (!el) return;
    el.style.display = 'flex';
    setStartupStatus('Entering the dungeon...');
    void el.offsetHeight; // force reflow so the transition starts this frame
    el.classList.add('ec-visible');
    const MIN_MS = snap && snap.geometryReady ? 1800 : 2400;
    const MAX_MS = 3900;
    const t0 = Date.now();
    let revealed = false;
    function tryReveal() {
      if (_startGen !== gen) return;
      const elapsed = Date.now() - t0;
      const ready = !snap || snap.geometryReady || snap.fullyBuilt || elapsed >= MAX_MS;
      if (ready && elapsed >= MIN_MS) {
        if (revealed) return;
        revealed = true;
        if (snap && !snap.geometryReady && !snap.fullyBuilt) {
          console.warn('[Depths startup] forced reveal before preload completed');
          setStartupStatus('Opening early...');
        } else {
          setStartupStatus('Opening dungeon...');
        }
        el.classList.remove('ec-visible');
        setTimeout(() => { el.style.display = 'none'; }, 900);
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
    Engine.startAmbient();
    _showAdBreak('start', 'game-start');

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
    _prebuilt = null; // consumed — will be rebuilt when player dies or quits (die/goToTitle call preload)

    // Show cinematic immediately so the button click feels instant.
    // loop() is deferred to onReveal so the 3D render loop doesn't compete
    // with the CSS animations and cause mid-cinematic jank.
    if (rafId) cancelAnimationFrame(rafId);
    const gen = ++_startGen;
    UI.hideTitleAndDeath();
    showEntryCinematic(gen, snap, () => {
      refreshSaveMeta(Save.recordRunStart());
      persistActiveRun(true);
      loop();
    });

    _pendingUpdates = null; _pendingEvents = null; _pendingDead = null;
    _aiTickInFlight = false;
    if (_aiWorker) _aiWorker.postMessage({ type: 'reset' });
    if (snap && snap.geometryReady) {
      // Geometry already built on title screen — just wire up player/dungeon refs
      player  = snap.player;
      dungeon = snap.dungeon;
      if (typeof SpatialManager !== 'undefined') SpatialManager.init(dungeon);
      Engine.init();
      // SpatialManager.init wiped the lights layer; re-register so torches activate
      Engine.reregisterLights();
      setTimeout(pregenNextFloor, 800);
    } else {
      // Fallback: geometry not ready, build now
      if (snap) { player = snap.player; dungeon = snap.dungeon; }
      else {
        player  = Player.create();
        dungeon = Dungeon.generate(floor);
        const { cx, cy } = dungeon.roomCenter(dungeon.startRoom);
        const w = dungeon.toWorld(cx, cy);
        player.x = w.x; player.z = w.z;
        player._descentY = 0;
      }
      if (typeof SpatialManager !== 'undefined') SpatialManager.init(dungeon);
      Engine.init();
      Engine.clearDynamic();
      Engine.buildPlayerMesh(player);
      Engine.buildDungeonChunked(dungeon,
        null,
        () => { Engine.snapLanternsToPlayer(player.x, player.z); pregenNextFloor(); }
      );
    }

    enemies = [];
    traps = Traps.generateTrapsForFloor(dungeon, floor);
    trapRooms = TrapRooms.designateTrapRooms(dungeon, floor);
    activeTrapRoom = null;
    preBoss = null;
    if (_aiWorker) {
      _workerInit(floor, dungeon);
      rebuildEnemySoa();
    } else {
      _spawnEnemiesSync(floor, dungeon);
    }

    UI.refresh(player);
    persistActiveRun(true);
    UI.setFloor(floor);
    refreshSaveMeta(Save.recordFloorReached(floor, player.level));
    UI.addMsg('You descend into the dungeon...', 'warn');
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
      enemies = [];
      preBoss = null;
      _pendingUpdates = null; _pendingEvents = null; _pendingDead = null;
      _aiTickInFlight = false;
      if (_aiWorker) _aiWorker.postMessage({ type: 'reset' });
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
      if (_prebuiltContinue && _prebuiltContinue.dungeonState) {
        // Geometry was pre-built on the title screen — instant swap, no build during cinematic
        Engine.installDungeonState(_prebuiltContinue.dungeonState);
        Engine.snapLanternsToPlayer(player.x, player.z);
        setTimeout(pregenNextFloor, 800);
      } else {
        // Fallback: build during cinematic
        Engine.buildDungeonChunked(dungeon,
          null,
          () => { Engine.snapLanternsToPlayer(player.x, player.z); pregenNextFloor(); }
        );
      }
      _prebuiltContinue = null; // consumed
      Engine.buildPlayerMesh(player);

      if (_aiWorker) {
        _workerInit(floor, dungeon);
        rebuildEnemySoa();
      } else {
        _spawnEnemiesSync(floor, dungeon);
      }

      UI.refresh(player);
      UI.setFloor(floor);
      UI.addMsg('Run restored.', 'level');

      if (rafId) cancelAnimationFrame(rafId);
      const gen = ++_startGen;
      UI.hideTitleAndDeath();

      // Update cinematic floor text for continue
      const ecFloor = document.querySelector('#entryCinematic .ec-floor');
      if (ecFloor) ecFloor.textContent = `FLOOR ${toRoman(floor)} — CONTINUING YOUR DESCENT`;
      showEntryCinematic(gen, null, () => {
        persistActiveRun(true);
        // restore floor text for future new runs
        if (ecFloor) ecFloor.textContent = 'FLOOR I — YOUR DESCENT BEGINS';
        loop();
        setTimeout(pregenNextFloor, 1000);
      });

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
    _showAdBreak('next', 'floor-advance');
    bossSpawned  = false;
    bossDefeated = false;
    doorOpened   = false;
    exitOpen     = false;
    stairActive  = false;

    // Pull pre-generated dungeon data if ready, otherwise generate synchronously
    dungeon = (_nextFloorNum === floor && _nextDungeon)
      ? _nextDungeon
      : Dungeon.generate(floor);
    _nextDungeon         = null;
    _nextFloorNum        = 0;
    _nextFloorGenerating = false;

    const { cx, cy } = dungeon.roomCenter(dungeon.startRoom);
    const w = dungeon.toWorld(cx, cy);
    player.x = w.x; player.z = w.z;
    player._descentY = 4.5;

    player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.3));

    if (preBoss) { Engine.removeEnemyMesh(preBoss.id); preBoss = null; }
    Engine.clearDynamic();
    if (typeof SpatialManager !== 'undefined') SpatialManager.init(dungeon);

    enemies = [];
    traps = Traps.generateTrapsForFloor(dungeon, floor);
    trapRooms = TrapRooms.designateTrapRooms(dungeon, floor);
    activeTrapRoom = null;
    preBoss = null;
    _aiTickInFlight = false;
    _pendingUpdates = null; _pendingEvents = null; _pendingDead = null;
    if (_aiWorker) {
      rebuildEnemySoa();
      _workerInit(floor, dungeon);
    } else {
      _spawnEnemiesSync(floor, dungeon);
    }

    UI.hideBossBar();
    UI.setFloor(floor);
    refreshSaveMeta(Save.recordFloorReached(floor, player.level));
    UI.addMsg(`Floor ${floor} — you drop through the portal...`, 'warn');
    UI.refresh(player);

    // Build spawn-band geometry first (phase 1), then fade overlay so player
    // sees a ready scene. Phase 2 fills the rest while they walk around.
    Engine.buildDungeonChunked(dungeon,
      () => {
        // Phase 1 done — spawn area ready, reveal the floor
        Engine.buildArrivalPortal(dungeon);
        try { Engine.render(player, 0, 0.016); } catch (_) {}
        showFloorAnnounce(floor);
        if (window.AgeeAnalytics) window.AgeeAnalytics.trackEvent('floor_reached', { floor: floor });
        setTimeout(() => {
          const overlay = document.getElementById('stairOverlay');
          if (overlay) overlay.style.opacity = '0';
        }, 100);
      },
      () => {
        // Phase 2 + lanterns done — snap torches then pre-generate next floor
        Engine.snapLanternsToPlayer(player.x, player.z);
        pregenNextFloor();
      }
    );
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
          // Joystick X → rotate player + camera; Y → forward/backward
          const TURN_SPEED = 2.4;
          aimAngleVal += mc.joyNx * TURN_SPEED * dt;
          Engine.setAimAngleDirect(aimAngleVal);
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
    tickTrapRooms();
    tickTraps(dt);
    tickAttackDamage();

    // ── Dispatch tick to worker (fire-and-forget) ──
    if (_aiWorker && _workerReady && !_aiTickInFlight) {
      _aiTickInFlight = true;
      _aiWorker.postMessage({ type: 'tick', dt, playerX: player.x, playerZ: player.z });
    }

    // ── Apply last worker result ──
    if (_pendingUpdates) {
      const updates = _pendingUpdates;
      const events  = _pendingEvents  || [];
      const dead    = _pendingDead    || [];
      _pendingUpdates = null;
      _pendingEvents  = null;
      _pendingDead    = null;

      // Apply position/state updates to main-thread enemy objects
      for (const u of updates) {
        const e = enemiesById.get(u.id);
        if (!e) continue;
        e.x        = u.x;
        e.z        = u.z;
        e.rotY     = u.rotY;
        e.state    = u.state;
        e.hp       = u.hp;
        e.maxHp    = u.maxHp;
        e.atkAnim  = u.atkAnim;
        e.hitFlash = u.hitFlash;
        if (e.mesh) {
          if (e.atkAnim <= 0) {
            e.mesh.position.x = e.x;
            e.mesh.position.z = e.z;
          }
          e.mesh.rotation.y = e.rotY;
        }
        Engine.updateEnemyHpBar(e, player.x, player.z);
        if (e.isBoss && bossSpawned) UI.updateBossBar(e);
      }

      // Handle events (attacks, bolts, summons)
      for (const ev of events) {
        if (ev.type === 'attack') {
          const dmg = Player.takeDamage(player, ev.dmg);
          if (dmg > 0) {
            UI.addMsg(ev.earthSlam ? `${ev.name}'s earth slam hits you for ${dmg}!` : `${ev.name} hits you for ${dmg}!`, 'combat');
            Engine.playSound('player_hurt');
            const enemy = enemiesById.get(ev.id);
            if (enemy) {
              const kbDX = player.x - enemy.x, kbDZ = player.z - enemy.z;
              const kbD = Math.sqrt(kbDX * kbDX + kbDZ * kbDZ) || 1;
              player.hitStaggerT = 0.2;
              player.hitKnockDX = (kbDX / kbD) * 0.7;
              player.hitKnockDZ = (kbDZ / kbD) * 0.7;
            }
          }
          if (ev.earthSlam) Engine.spawnParticles(player.x, 0.2, player.z, 0x8a6a3a, 22, 3.5, 0.7);
          if (player.hp <= 0) { die(); return; }
        }
        if (ev.type === 'bolt') {
          const b = ev.bolt;
          Engine.fireBolt(b.x, b.z, b.vx, b.vz, b.dmg, b.kind);
        }
        if (ev.type === 'summon') {
          for (const s of ev.summoned) {
            const summoned = { ...Enemies.TYPES[s.typeKey], typeKey: s.typeKey, x: s.worldX, z: s.worldZ, hp: 22, maxHp: 22, atk: 6, xp: 9, state: 'idle', atkTimer: 0, atkAnim: 0, hitFlash: 0, dead: false, id: Math.random().toString(36).slice(2), mesh: null, _walkT: 0 };
            enemies.push(summoned);
            enemiesById.set(summoned.id, summoned);
            Engine.buildEnemyMesh(summoned);
            Engine.spawnParticles(summoned.x, 0.8, summoned.z, summoned.color, 14, 3.2, 0.8);
            if (_aiWorker) _aiWorker.postMessage({ type: 'addEnemy', enemy: summoned });
          }
          rebuildEnemySoa();
        }
      }

      // Remove dead enemies — wait for death animation to finish first
      if (dead.length > 0) {
        const deadSet = new Set(dead);
        for (let i = enemies.length - 1; i >= 0; i--) {
          const de = enemies[i];
          if (deadSet.has(de.id) && (!de.deathAnim || de.deathAnim <= 0)) {
            if (de.mesh) Engine.removeEnemyMesh(de.id);
            swapRemoveEnemyAt(i);
          }
        }
      }
    }

    // Nearby enemy indices — per-frame loops gate on this Set
    const _nearIdx = typeof SpatialManager !== 'undefined'
      ? new Set(SpatialManager.query('monsters', [player.x, player.z], ACTIVE_RADIUS))
      : null;

    // Sync moved positions back into spatial grid (index-keyed)
    if (typeof SpatialManager !== 'undefined' && _nearIdx) {
      for (const i of _nearIdx) {
        const e = enemies[i];
        if (e && !e.dead) SpatialManager.move('monsters', i, [e.x, e.z]);
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const _de = enemies[i];
      if (_de.dead && (!_de.deathAnim || _de.deathAnim <= 0)) {
        if (_de.mesh) Engine.removeEnemyMesh(_de.id);
        swapRemoveEnemyAt(i);
      }
    }

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
    const _nearChestIds = typeof SpatialManager !== 'undefined'
      ? new Set(SpatialManager.query('items', [player.x, player.z], ACTIVE_RADIUS + 2))
      : null;
    const _chestList = _nearChestIds
      ? Engine.chestMeshes.filter(grp => _nearChestIds.has(grp.userData.staticItemIdx))
      : Engine.chestMeshes;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (e.dead) continue;
      if (_nearIdx && !_nearIdx.has(i)) continue;
      for (const grp of _chestList) {
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

    const _animList = _nearList ? _nearList.slice() : enemies;
    if (_nearList) {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e && e.dead && e.deathAnim > 0) _animList.push(e);
      }
    }
    Engine.updateEnemyAnimations(_animList, dt);
    const boltDmg = Engine.updateBolts(dt, player);
    if (boltDmg > 0) {
      const dmg = Player.takeDamage(player, boltDmg);
      if (dmg > 0) { UI.addMsg(`Struck by an arrow for ${dmg}!`, 'combat'); Engine.playSound('player_hurt'); }
      if (player.hp <= 0) { die(); }
    }
    Engine.updateParticles(dt);
    Engine.updateTorchFlicker(t);
    Engine.updateChests(dt);
    if (t - _lastPromptT > 0.12) {
      _lastPromptT = t;
      Engine.updateChestPrompt(player);
      Engine.updateTorchPrompt(player);
      Engine.updateDoorPrompt(player, dungeon, doorOpened);
      Engine.updateStairPrompt(player, exitOpen, dungeon);
    }

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
    Engine.playSound('boss_roar');
    if (window.AgeeAnalytics) window.AgeeAnalytics.trackEvent('boss_reached', { floor });

    const boss = preBoss;
    preBoss = null;
    if (!boss) return; // worker hasn't replied yet — boss entry will retry next frame
    // Reveal pre-built mesh (lift from underground) — shaders already compiled, zero stall
    if (boss.mesh) {
      boss.mesh.position.y = 0;
    } else {
      Engine.buildEnemyMesh(boss);
    }
    enemies.push(boss);
    rebuildEnemySoa();
    UI.showBossBar(boss);
    UI.addMsg(`\u26a0 ${boss.name.toUpperCase()} AWAKENS!`, 'warn');
    Engine.spawnParticles(boss.x, 1.5, boss.z, boss.color, 30, 5, 1.5);
  }

  /* ── Attack ──────────────────────────────────── */
  function doAttack() {
    if (!Player.startAttack(player, aimAngleVal)) return;
    Engine.triggerSwing();
    Engine.playSound('swing');
  }

  function tickTrapRooms() {
    if (!trapRooms || trapRooms.length === 0) return;

    // Check for player entry into a trap room
    if (!activeTrapRoom) {
      const entered = TrapRooms.checkTrapRoomEntry(trapRooms, player.x, player.z);
      if (entered) {
        activeTrapRoom = entered;
        // Capture enemies in this trap room
        const TILE = dungeon.TILE;
        const roomX = entered.x * TILE;
        const roomY = entered.y * TILE;
        const roomW = entered.w * TILE;
        const roomH = entered.h * TILE;

        for (const e of enemies) {
          if (!e.dead && e.x >= roomX && e.x < roomX + roomW &&
              e.z >= roomY && e.z < roomY + roomH) {
            entered.enemies.push(e.id);
            e.isTrapRoomEnemy = true;
          }
        }

        // Add traps to the room
        for (const trap of traps) {
          if (trap.x >= roomX && trap.x < roomX + roomW &&
              trap.z >= roomY && trap.z < roomY + roomH) {
            entered.trapsInRoom.push(trap.id);
          }
        }

        UI.addMsg('⚠ Doors slam shut!', 'warn');
        Engine.playSound('door_open');
        Engine.spawnParticles(player.x, 1.0, player.z, 0xff6644, 20, 3, 0.8);
      }
    }

    // Check if active trap room is cleared
    if (activeTrapRoom) {
      if (TrapRooms.clearTrapRoomCheck(activeTrapRoom, enemies)) {
        UI.addMsg('Room cleared! Doors unlock.', 'level');
        Engine.spawnParticles(player.x, 1.5, player.z, 0x44ff44, 30, 5, 1.0);
        const reward = TrapRooms.spawnReward(activeTrapRoom);
        if (reward) {
          // Generate upgrade reward
          const upgrade = Loot.genUpgrade(floor);
          upgrade.apply(player);
          UI.addMsg(`✦ ${upgrade.name}!`, 'level');
          UI.refresh(player);
          Engine.spawnParticles(reward.x, 0.9, reward.z, 0xffcc44, 25, 3, 0.9);
          activeTrapRoom = null;
        }
      }
    }
  }

  function tickTraps(dt) {
    if (!traps || traps.length === 0) return;
    try {
      const result = Traps.update(traps, player, dt);
      if (!result) return;
      const { hits, events } = result;

      events.forEach(({ type, trap }) => {
        if (type === 'triggered') {
          Engine.spawnParticles(trap.x, 0.3, trap.z, 0xffcc44, 8, 1.5, 0.4);
        } else if (type === 'activated') {
          Engine.spawnParticles(trap.x, 0.8, trap.z, trap.color, 12, 2.0, 0.5);
          Engine.playSound('player_hurt');
        }
      });

      hits.forEach(({ trap, dmg }) => {
        const reduced = Player.takeDamage(player, dmg);
        if (reduced > 0) {
          UI.addMsg(`${trap.name} hits for ${reduced}!`, 'combat');
          Engine.playSound('player_hurt');
          Engine.spawnParticles(player.x, 0.5, player.z, trap.color, 16, 2.5, 0.6);
        }
        if (player.hp <= 0) die();
      });
    } catch (e) {
      console.error('[Traps] Error:', e);
    }
  }

  function tickAttackDamage() {
    try {
      if (player.atkState !== 'active') {
        player._lastAttackFrameDmg = false;
        return;
      }
      if (player._lastAttackFrameDmg) return;
      player._lastAttackFrameDmg = true;

      // Spawn weapon trail during active phase
      const a = player.atkAimAngle || 0;
      const range = Player.atkRange(player) * 1.8;
      Engine.spawnParticles(
        player.x + Math.cos(a) * (range * 0.6), 1.2, player.z + Math.sin(a) * (range * 0.6),
        0xff9944, 12, range * 0.8, 0.4
      );

      const hits = Player.applyAttackDamage(player, enemies);
      hits.forEach(({ enemy, dmg, isCrit, killed }) => {
        if (_aiWorker) _aiWorker.postMessage({ type: 'damage', id: enemy.id, amount: dmg });
        Engine.spawnParticles(
          enemy.x, enemy.height * 0.7, enemy.z,
          isCrit ? 0xffff00 : 0xff3300,
          isCrit ? 14 : 8, isCrit ? 5 : 3, isCrit ? 0.8 : 0.5
        );
        Engine.playSound(killed ? 'enemy_death' : 'hit');
        if (isCrit) UI.addMsg(`Critical! ${dmg} damage`, 'combat');

        if (!killed) {
          const kbDX = enemy.x - player.x, kbDZ = enemy.z - player.z;
          const kbD  = Math.sqrt(kbDX * kbDX + kbDZ * kbDZ) || 1;
          enemy.staggerT = 0.25;
          enemy.knockDX  = kbDX / kbD;
          enemy.knockDZ  = kbDZ / kbD;
        }

        if (killed) {
          enemy.dead      = true;
          enemy.deathAnim = 0.45;
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
            pregenNextFloor();
          }

          const leveled = Player.checkLevelUp(player);
          if (leveled) { Engine.spawnParticles(player.x, 1.0, player.z, 0x4488ff, 24, 5, 1.2); Engine.playSound('level_up'); }
          UI.refresh(player);
        }
      });
    } catch (e) {
      console.error('[Attack] Error:', e);
    }
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
        Engine.playSound('door_open');
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
        Engine.playSound('portal');
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
    _nextDungeon         = null;
    _nextFloorNum        = 0;

    _workerGenerateFloor(nextF).then(msg => {
      if (_nextFloorNum !== 0 && _nextFloorNum !== nextF) return; // superseded
      const d = reviveDungeon(msg.dungeon);
      d._preSpawns         = msg.spawns;
      d._preBossData       = msg.boss;
      _nextDungeon         = d;
      _nextFloorNum        = nextF;
      _nextFloorGenerating = false;
    }).catch(() => {
      _nextFloorGenerating = false;
    });
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
        Engine.playSound('chest_open');

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
    Engine.stopAmbient();
    _runDeaths++;
    updateTitleStartLabel();
    if (Save.clearActiveRun) Save.clearActiveRun();
    refreshSaveMeta(Save.recordDeath(floor, player.level));
    UI.hideBossBar();
    _showAdBreak('reward', 'game-over');
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
    _initFloorWorker();
    _initWorker();
    wireInput();
    Engine.initSound();
    document.addEventListener('depths-save-change', updateTitleStartLabel);
    if (window.AgeeAnalytics) window.AgeeAnalytics.trackEvent('game_loaded', { game_id: 'depths_of_ashenveil' });
    preload(); // data-only, no engine work — title screen stays smooth

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
    Engine.stopAmbient();
    _aiTickInFlight = false;
    if (_aiWorker) _aiWorker.postMessage({ type: 'reset' });
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
