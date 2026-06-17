// game.js — main controller: init, game loop, input, economy, screens

const Game = (() => {
  // ── ENGINE REFERENCES ─────────────────────────────────────────
  let scene, camera, renderer, clock, stations;

  // ── SUBSYSTEMS ────────────────────────────────────────────────
  let projectilePool;
  let _aimLine = null;

  // ── GAME STATE ────────────────────────────────────────────────
  const gs = {
    running:           false,
    paused:            false,
    wave:              0,
    betweenWaves:      false,
    fortHP:            100,
    fortMaxHP:         100,
    gold:              0,
    score:             0,
    multiplier:        1.0,
    streak:            0,
    shotsFired:        0,
    shotsHit:          0,
    // Leveling
    playerLevel:       1,
    xp:                0,
    xpToNext:          80,
    // Upgrade modifiers
    reloadMult:        1.0,
    damageMult:        1.0,
    goldMult:          1.0,
    projectileSpeedMult: 1.0,
    playerSpeed:       8,
    doubleShotCharges: 0,
    aimSnapRadius:     2.0,
    chainShotEnabled:  false,
    waveStartSalvo:    false,
    usedUpgradeIds:    [],
  };

  // ── INPUT STATE ───────────────────────────────────────────────
  let _runStartedAt = 0;
  let _shipsSunk = 0;
  let _analyticsSessionActive = false;

  function _trackEvent(type, data) {
    if (!window.AgeeAnalytics || !AgeeAnalytics.trackEvent) return;
    AgeeAnalytics.trackEvent(type, Object.assign({
      wave: gs.wave || 0,
      score: gs.score || 0,
      fort_hp: gs.fortHP || 0,
    }, data || {}));
  }

  function _sessionStats(endReason) {
    return {
      duration_seconds: _runStartedAt ? Math.max(0, Math.round((Date.now() - _runStartedAt) / 1000)) : 0,
      max_floor: gs.wave || 1,
      max_level: gs.score || 0,
      enemies_killed: _shipsSunk,
      end_reason: endReason || 'unknown',
    };
  }

  function _startAnalyticsSession() {
    _runStartedAt = Date.now();
    _shipsSunk = 0;
    _analyticsSessionActive = false;
    if (window.AgeeAnalytics && AgeeAnalytics.startGameSession) {
      AgeeAnalytics.startGameSession('blacktide_bastion').then(() => {
        _analyticsSessionActive = true;
        _trackEvent('game_started');
      });
    } else {
      _trackEvent('game_started');
    }
  }

  function _endAnalyticsSession(endReason, unload) {
    if (!_analyticsSessionActive || !window.AgeeAnalytics) return;
    const stats = _sessionStats(endReason);
    if (unload && AgeeAnalytics.endGameSessionUnload) AgeeAnalytics.endGameSessionUnload(stats);
    else if (AgeeAnalytics.endGameSession) AgeeAnalytics.endGameSession(stats);
    _analyticsSessionActive = false;
  }

  function _showAdBreak(adType, adName) {
    if (typeof window.adBreak !== 'function') return;
    if (document.hidden) return;
    adBreak({
      type: adType,
      name: adName,
    });
  }

  const keys       = {};
  const mouse      = { ndc: new THREE.Vector2(), world: new THREE.Vector3(), down: false };
  let   firePending = false;

  // Raycaster
  const raycaster = new THREE.Raycaster();
  const tmpHit    = new THREE.Vector3();

  // ── ENEMY CANNONBALL POOL ─────────────────────────────────────
  const enemyProjectiles = [];
  const _eBallGeo = new THREE.SphereGeometry(0.22, 8, 8);
  const _eBallMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.55, metalness: 0.5 });

  function _onEnemyShot(fromPos, damage) {
    const mesh = new THREE.Mesh(_eBallGeo, _eBallMat);
    const start = fromPos.clone();
    start.y += 1.5;
    mesh.position.copy(start);
    scene.add(mesh);
    enemyProjectiles.push({ mesh, damage, start, t: 0, duration: 1.8 });

    // Broadside flash from the ship's bow guns
    const toFort = new THREE.Vector3(0, 2.5, -10).sub(start).normalize();
    FX.muzzleFlash(start.clone().addScaledVector(toFort, 1.2), toFort);
    GameAudio.play('cannon');
  }

  function _updateEnemyProjectiles(dt) {
    const fortTarget = new THREE.Vector3(0, 2.5, -10);
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const p = enemyProjectiles[i];
      p.t += dt;
      const frac = Math.min(p.t / p.duration, 1);

      p.mesh.position.x = THREE.MathUtils.lerp(p.start.x, fortTarget.x, frac);
      p.mesh.position.z = THREE.MathUtils.lerp(p.start.z, fortTarget.z, frac);
      p.mesh.position.y = THREE.MathUtils.lerp(p.start.y, fortTarget.y, frac)
                        + Math.sin(frac * Math.PI) * 8;

      if (frac >= 1) {
        FX.explosion(p.mesh.position.clone(), 1.1);
        scene.remove(p.mesh);
        enemyProjectiles.splice(i, 1);
        gs.fortHP = Math.max(0, gs.fortHP - p.damage);
        gs.streak     = 0;
        gs.multiplier = 1.0;
        GameAudio.play('fortHit');
        Engine.addShake(0.35);
        HUD.damageFlash();
        if (gs.fortHP <= 0) _gameOver();
      }
    }
  }

  // ── WATER EFFECT: splash meshes pool ─────────────────────────
  const splashPool  = [];
  const splashActive = [];

  function _initSplashes() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x88ccee, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 6), mat.clone());
      m.visible = false;
      scene.add(m);
      splashPool.push({ mesh: m, timer: 0 });
    }
  }

  function _spawnSplash(pos, radius) {
    GameAudio.play('splash');
    const count = radius > 1 ? 3 : 1;
    for (let c = 0; c < count; c++) {
      const s = splashPool.pop();
      if (!s) break;
      s.mesh.position.copy(pos);
      s.mesh.position.x += (Math.random() - 0.5) * radius;
      s.mesh.position.z += (Math.random() - 0.5) * radius;
      s.mesh.position.y = 0.2;
      s.mesh.scale.setScalar(1 + radius);
      s.mesh.visible = true;
      s.timer = 0.4 + Math.random() * 0.2;
      splashActive.push(s);
    }
  }

  function _updateSplashes(dt) {
    for (let i = splashActive.length - 1; i >= 0; i--) {
      const s = splashActive[i];
      s.timer -= dt;
      s.mesh.scale.addScalar(dt * 3);
      s.mesh.material.opacity = Math.max(0, s.timer / 0.5);
      if (s.timer <= 0) {
        s.mesh.visible = false;
        s.mesh.scale.setScalar(1);
        splashActive.splice(i, 1);
        splashPool.push(s);
      }
    }
  }

  // ── BOOT ──────────────────────────────────────────────────────
  function boot() {
    Engine.init();
    scene    = Engine.scene;
    camera   = Engine.camera;
    renderer = Engine.renderer;
    clock    = Engine.clock;
    stations = Engine.stations;

    Player.init(scene);
    EnemyShips.init(scene);
    FX.init(scene);
    projectilePool = new ProjectilePool(scene, 64);
    _initSplashes();

    // Aim line — dashed gold line from cannon muzzle to target point
    const aimGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
    ]);
    const aimMat = new THREE.LineDashedMaterial({
      color:    0xffcc22,
      dashSize: 0.55,
      gapSize:  0.4,
      opacity:  0.72,
      transparent: true,
    });
    _aimLine = new THREE.Line(aimGeo, aimMat);
    _aimLine.computeLineDistances();
    _aimLine.visible = false;
    scene.add(_aimLine);
    HUD.init();
    GameAudio.init();
    _trackEvent('game_loaded');
    window.addEventListener('beforeunload', () => {
      if (gs.running) _endAnalyticsSession('quit', true);
    });

    _bindInput();
    HUD.bindInterWaveButtons(_onRepair, _onContinue);

    HUD.showTitle();
    renderer.setAnimationLoop(_loop);
  }

  // ── INPUT BINDING ─────────────────────────────────────────────
  function _bindInput() {
    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (e.code === 'Escape') {
        if (gs.paused) togglePause();
        else window.dispatchEvent(new Event('arcade:exit-game'));
      }
      if (e.code === 'KeyP') togglePause();
      if (e.code === 'Space') { e.preventDefault(); firePending = true; }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', e => {
      if (e.button === 0) { mouse.down = true; firePending = true; }
    });
    canvas.addEventListener('pointerup', e => {
      if (e.button === 0) mouse.down = false;
    });
    canvas.addEventListener('pointermove', e => {
      const rect = canvas.getBoundingClientRect();
      mouse.ndc.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.ndc.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    });

    // First gesture unlocks AudioContext
    window.addEventListener('pointerdown', () => GameAudio.init(), { once: true });
    window.addEventListener('keydown',     () => GameAudio.init(), { once: true });
  }

  // ── MAIN LOOP ─────────────────────────────────────────────────
  function _loop() {
    const dt = Math.min(clock.getDelta(), 0.1);

    Engine.updateShake(dt);
    Engine.updateScene(dt);
    FX.update(dt);
    HUD.updateFlash(dt);

    if (!gs.running || gs.paused) {
      renderer.render(scene, camera);
      return;
    }

    _updateInput(dt);
    _updateAimKeys(dt);
    _updateFire(dt);
    _updateStations(dt);
    projectilePool.update(dt, _onWaterImpact);
    EnemyShips.update(dt, _onEnemyShot);
    _updateEnemyProjectiles(dt);
    Combat.resolveHits(projectilePool, EnemyShips, _onShipHit);
    Combat.resolveLandings(EnemyShips, _onShipLand);
    WaveDirector.update(dt, EnemyShips.active.size);
    _updateSplashes(dt);

    HUD.sync(gs, Player.state, _activeStation());
    HUD.updateStationRings(stations, Player.state);

    renderer.render(scene, camera);
  }

  // ── INPUT PROCESSING ──────────────────────────────────────────
  function _updateInput(dt) {
    Player.state.speed = gs.playerSpeed;
    Player.update(dt, 0);
  }

  // ── AIM: mouse position mapped to sea plane ──────────────────
  function _updateAimKeys(dt) {
    const st = _activeStation();

    // Hide aim line when not mounted
    if (!st || !_aimLine) {
      if (_aimLine) _aimLine.visible = false;
      return;
    }

    // Raycast the cursor onto the sea plane so the target point sits
    // exactly under the mouse (no screen-mapping approximation).
    raycaster.setFromCamera(mouse.ndc, camera);
    if (raycaster.ray.intersectPlane(Engine.SEA_PLANE, tmpHit)) {
      st.targetPoint.x = THREE.MathUtils.clamp(tmpHit.x, -22, 22);
      st.targetPoint.z = THREE.MathUtils.clamp(tmpHit.z, 8, 78);
    }

    // Train the whole gun (carriage + barrel) toward the target
    const localTarget = st.group.worldToLocal(st.targetPoint.clone());
    const rawYaw = Math.atan2(localTarget.x, localTarget.z);
    st.yawGroup.rotation.y = THREE.MathUtils.clamp(rawYaw, st.minYaw, st.maxYaw);

    const hDist = Math.sqrt(
      Math.pow(st.targetPoint.x - st.group.position.x, 2) +
      Math.pow(st.targetPoint.z - st.group.position.z, 2)
    );
    // Barrel elevates about the trunnions
    st.pitchGroup.rotation.x = THREE.MathUtils.clamp(-0.04 - hDist * 0.01, -0.55, -0.04)
                              + (st.recoilX || 0);

    // Recover recoil: barrel kick + carriage sliding back into battery
    if (st.recoilX) st.recoilX *= 0.82;
    if (st.recoilZ) {
      st.recoilZ *= 0.86;
      st.pitchGroup.position.z = 0.10 - st.recoilZ;
    }

    // Update dashed aim line: muzzle world pos → target point at sea level
    const muzzleWorld = new THREE.Vector3();
    st.muzzle.getWorldPosition(muzzleWorld);
    const targetSea = new THREE.Vector3(st.targetPoint.x, 0.15, st.targetPoint.z);
    const pts = _aimLine.geometry.attributes.position.array;
    pts[0] = muzzleWorld.x; pts[1] = muzzleWorld.y; pts[2] = muzzleWorld.z;
    pts[3] = targetSea.x;   pts[4] = targetSea.y;   pts[5] = targetSea.z;
    _aimLine.geometry.attributes.position.needsUpdate = true;
    _aimLine.computeLineDistances();
    _aimLine.visible = true;
  }

  // ── FIRE ──────────────────────────────────────────────────────
  function _updateFire(dt) {
    // Tick all cooldowns
    stations.forEach(st => {
      st.cooldown = Math.max(0, st.cooldown - dt);
    });

    if (!firePending) return;
    firePending = false;

    if (!Player.state.mounted) return;
    const st = _activeStation();
    if (!st || st.cooldown > 0) return;

    _doFire(st);

    // Double shot
    if (gs.doubleShotCharges > 0) {
      gs.doubleShotCharges--;
      const offsetTarget = st.targetPoint.clone().add(
        new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)
      );
      _doFire(st, offsetTarget);
    }
  }

  function _doFire(st, overrideTarget) {
    const def     = CANNON_DEFS[st.cannonType];
    const acquired = projectilePool.acquire();
    if (!acquired) return;

    const muzzleWorld = new THREE.Vector3();
    st.muzzle.getWorldPosition(muzzleWorld);

    const target = overrideTarget || st.targetPoint;
    // Must match the GRAVITY constant in ProjectilePool.update (14),
    // otherwise the arc lands short or long of the target.
    const vel    = computeLaunchVelocity(muzzleWorld, target, 14, gs.projectileSpeedMult);

    acquired.launch({
      position:     muzzleWorld,
      velocity:     vel,
      damage:       def.damage * gs.damageMult,
      splashRadius: def.splashRadius,
    });

    const cooldown = (1 / def.fireRate) * gs.reloadMult;
    st.cooldown = cooldown;

    // Recoil: barrel kicks up and the gun slides back on its trucks
    st.recoilX = (st.recoilX || 0) - 0.18;
    st.recoilZ = 0.26;

    // Muzzle flash + gunsmoke
    const muzzleDir = new THREE.Vector3();
    st.muzzle.getWorldDirection(muzzleDir);
    FX.muzzleFlash(muzzleWorld, muzzleDir);

    Engine.addShake(0.12);
    GameAudio.play('cannon');
    gs.shotsFired++;
  }

  // ── XP / LEVELING ────────────────────────────────────────────
  function _gainXP(amount) {
    gs.xp += amount;
    while (gs.xp >= gs.xpToNext) {
      gs.xp -= gs.xpToNext;
      gs.playerLevel++;
      gs.xpToNext = xpToNextLevel(gs.playerLevel);
      const bonus = LEVEL_BONUSES[Math.min(gs.playerLevel, LEVEL_BONUSES.length - 1)];
      if (bonus) {
        bonus.apply(gs);
        HUD.showLevelUp(gs.playerLevel, bonus.desc);
      } else {
        HUD.showLevelUp(gs.playerLevel, 'Master of the Seas');
      }
    }
  }

  // ── EVENTS ────────────────────────────────────────────────────
  function _onWaterImpact(pos, splashRadius) {
    _spawnSplash(pos, splashRadius || 0.3);
  }

  function _onShipHit(ship, projectile) {
    const dmg = projectile.damage;
    const destroyed = EnemyShips.damageShip(ship, dmg);
    GameAudio.play('shipHit');
    FX.explosion(projectile.mesh.position.clone(), 0.7);

    if (gs.chainShotEnabled) {
      EnemyShips.slowShip(ship, 0.6, 3.0);
    }

    if (destroyed) {
      const rawGold  = Math.round(ship.def.gold * gs.goldMult);
      const rawScore = Math.round(ship.def.score * gs.multiplier);
      _shipsSunk++;
      gs.gold  += rawGold;
      gs.score += rawScore;
      gs.streak++;
      gs.shotsHit++;
      gs.multiplier = Math.min(2.0, 1.0 + gs.streak * 0.1);
      _gainXP(ship.def.xp || 10);

      // Floating score text
      const wp = EnemyShips.getHitCenter(ship);
      HUD.spawnScoreText(wp, '+' + rawScore, camera, renderer);

      GameAudio.play('shipSink');
      _trackEvent('ship_sunk', {
        ship: ship.def.name || 'ship',
        points: rawScore,
        ships_sunk: _shipsSunk,
      });
      Engine.addShake(0.2);
      FX.explosion(wp, 1.4);
      EnemyShips.sinkShip(ship);
    }
  }

  function _onShipLand(ship) {
    gs.fortHP -= ship.def.landDamage;
    gs.streak  = 0;
    gs.multiplier = 1.0;

    GameAudio.play('fortHit');
    Engine.addShake(0.5);
    HUD.damageFlash();

    EnemyShips.removeShip(ship);

    if (gs.fortHP <= 0) {
      gs.fortHP = 0;
      _gameOver();
    }
  }

  // ── WAVE LIFECYCLE ────────────────────────────────────────────
  function _startNextWave() {
    gs.wave++;
    _trackEvent('wave_started', { wave: gs.wave });
    _showAdBreak('next', 'wave-advance');
    gs.betweenWaves  = false;
    gs.shotsFired    = 0;
    gs.shotsHit      = 0;

    // Salvo upgrade: free shot from all cannons at wave start
    if (gs.waveStartSalvo) {
      gs.waveStartSalvo = false;
      stations.forEach(st => { if (st.cooldown <= 0) _doFire(st); });
    }

    WaveDirector.startWave(gs.wave, _onSpawnShip, _onWaveComplete);
    HUD.showGame();
  }

  function _onSpawnShip(archetype, lane) {
    EnemyShips.spawn(archetype, lane);
  }

  let _currentUpgrades = [];

  function _onWaveComplete() {
    gs.betweenWaves = true;

    // Wave-clear gold stipend
    const stipend = 20 + gs.wave * 5;
    gs.gold += stipend;

    // Accuracy bonus score
    if (gs.shotsFired > 0) {
      const acc   = gs.shotsHit / gs.shotsFired;
      gs.score   += Math.round(acc * 150);
    }

    // Clean wave bonus
    if (EnemyShips.active.size === 0) gs.score += 300;

    GameAudio.play('waveClear');
    _trackEvent('wave_completed', { wave: gs.wave, ships_sunk: _shipsSunk });
    Engine.addShake(0.08);

    _currentUpgrades = pickUpgrades(3, gs.usedUpgradeIds);
    const canRepair  = gs.fortHP < gs.fortMaxHP;
    HUD.showInterWave(gs.wave, gs.gold, _currentUpgrades, canRepair, _onUpgradePick);
  }

  function _onUpgradePick(choice) {
    if (choice.type !== 'upgrade') return;
    const upg = _currentUpgrades[choice.idx];
    if (!upg || gs.gold < upg.cost) return;
    gs.gold -= upg.cost;
    upg.apply(gs);
    gs.usedUpgradeIds.push(upg.id);
    GameAudio.play('upgrade');
    // Refresh panel with updated gold
    _currentUpgrades = pickUpgrades(3, gs.usedUpgradeIds);
    HUD.showInterWave(gs.wave, gs.gold, _currentUpgrades, gs.fortHP < gs.fortMaxHP, _onUpgradePick);
    HUD.bindInterWaveButtons(_onRepair, _onContinue);
  }

  function _onRepair() {
    const cost = 50;
    if (gs.gold < cost || gs.fortHP >= gs.fortMaxHP) return;
    gs.gold   -= cost;
    gs.fortHP  = Math.min(gs.fortMaxHP, gs.fortHP + 25);
    HUD.hideInterWave();
    setTimeout(() => {
      _currentUpgrades = pickUpgrades(3, gs.usedUpgradeIds);
      const canRepair  = gs.fortHP < gs.fortMaxHP;
      HUD.showInterWave(gs.wave, gs.gold, _currentUpgrades, canRepair, _onUpgradePick);
      HUD.bindInterWaveButtons(_onRepair, _onContinue);
    }, 50);
    GameAudio.play('upgrade');
  }

  function _onContinue() {
    HUD.hideInterWave();
    _startNextWave();
  }

  // ── GAME OVER ─────────────────────────────────────────────────
  function _gameOver() {
    gs.running = false;
    _trackEvent('game_over', { end_reason: 'fort_destroyed', ships_sunk: _shipsSunk });
    _endAnalyticsSession('fort_destroyed');
    // Reward ads removed - broken
    // _showAdBreak('reward', 'game-over');
    GameAudio.play('gameOver');
    HUD.incrementRuns();
    setTimeout(() => HUD.showFail(gs), 600);
  }

  // ── STATION HELPER ────────────────────────────────────────────
  function _activeStation() {
    return stations[Player.state.currentStation];
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  function start() {
    if (gs.running) _endAnalyticsSession('restart');
    // Reset run state
    gs.running           = true;
    gs.paused            = false;
    document.getElementById('pauseOverlay')?.classList.remove('active');
    gs.wave              = 0;
    gs.betweenWaves      = false;
    gs.fortHP            = 100;
    gs.fortMaxHP         = 100;
    gs.gold              = 80;    // starting gold
    gs.score             = 0;
    gs.multiplier        = 1.0;
    gs.streak            = 0;
    gs.shotsFired        = 0;
    gs.shotsHit          = 0;
    gs.reloadMult        = 1.0;
    gs.damageMult        = 1.0;
    gs.goldMult          = 1.0;
    gs.projectileSpeedMult = 1.0;
    gs.playerSpeed       = 8;
    gs.doubleShotCharges = 0;
    gs.aimSnapRadius     = 2.0;
    gs.chainShotEnabled  = false;
    gs.waveStartSalvo    = false;
    gs.usedUpgradeIds    = [];
    gs.playerLevel       = 1;
    gs.xp                = 0;
    gs.xpToNext          = 80;
    _startAnalyticsSession();
    _showAdBreak('start', 'game-start');

    WaveDirector.reset();
    EnemyShips.clear();
    projectilePool.clear();
    for (const p of enemyProjectiles) scene.remove(p.mesh);
    enemyProjectiles.length = 0;
    Player.reset();
    Player.setVisible(true);
    FX.clear();
    stations.forEach(st => {
      st.cooldown   = 0;
      st.cannonType = 'longnine';
      st.recoilX    = 0;
      st.recoilZ    = 0;
      st.pitchGroup.position.z = 0.10;
      st.targetPoint.set(st.x, 0, 35);
    });

    HUD.showGame();
    _startNextWave();
  }

  function restart() { start(); }

  function togglePause() {
    if (!gs.running) return;
    gs.paused = !gs.paused;
    const overlay = document.getElementById('pauseOverlay');
    if (overlay) overlay.classList.toggle('active', gs.paused);
  }

  function goToTitle() {
    if (gs.running) _endAnalyticsSession('quit');
    gs.running = false;
    gs.paused  = false;
    document.getElementById('pauseOverlay')?.classList.remove('active');
    EnemyShips.clear();
    projectilePool.clear();
    FX.clear();
    Player.setVisible(false);
    HUD.showTitle();
  }

  function _updateStations(dt) {
    // per-station cooldown ticking is done in _updateFire, nothing extra needed
  }

  // Auto-boot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // Scripts are deferred so DOM is always ready when this runs
    boot();
  }

  return { start, restart, togglePause, goToTitle };
})();
