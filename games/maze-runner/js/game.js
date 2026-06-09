/* ═══════════════════════════════════════════════════
   game.js — Maze Runner  ·  Three.js r128 game engine
   Depends on: three.min.js, maze-gen.js
════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ─── Tuning constants ──────────────────────────────
  const CELL         = 2.0;
  const WALL_H       = 2.8;
  const PLAYER_R     = 0.38;
  const PLAYER_SPEED = 5.2;
  const LIVES_START  = 3;
  const HP_MAX       = 100;
  const CAM_DIST      = 11.5;  // orbit radius
  const CAM_LERP      = 0.13;
  const CAM_PITCH_MIN = 0.18;  // ~10° above horizon
  const CAM_PITCH_MAX = 1.45;  // ~83° (nearly top-down)

  // ─── Module state ──────────────────────────────────
  let renderer, scene, camera, clock;
  let state = 'title'; // title | playing | dying | floor-complete | game-over
  let keys  = {};

  let px = 0, pz = 0;
  let gd = {};
  let md = {};

  let wallMesh    = null;
  let lavaMesh        = null;
  let fallMesh        = null;
  let fallRimMesh     = null;
  let fallDeepMesh    = null;
  let fallDeepRimMesh = null;
  let floorMesh   = null;
  let exitMesh    = null;
  let lootGroup   = null;
  let playerGroup = null;  // humanoid THREE.Group
  let playerParts = {};    // { head, torso, armL, armR, legL, legR }
  let playerMats  = [];    // individual material instances (for death color anim)

  let playerLight, exitLight, lavaLight;

  // Damage traps (spikes + blades)
  let damageTrapObjects = [];
  let damageCooldown    = 0;
  const DAMAGE_PER_HIT  = 25;

  // Knockback from swing traps
  let knockVX = 0, knockVZ = 0;
  let _swingHit = DAMAGE_PER_HIT; // damage override for swing traps

  // Death animation state
  let deathAnim   = null; // { type:'lava'|'fall', timer, duration, origY }

  // Walk animation
  let walkCycle = 0;
  let isMoving  = false;

  // Post-respawn immunity (prevents re-triggering trap or exit immediately)
  let respawnImmunity = 0;

  // Jump physics
  const JUMP_VY = 7.5;
  const GRAVITY = 22.0;
  let playerY   = 0;   // current height above ground
  let playerVY  = 0;   // vertical velocity
  let isGrounded = true;
  let jumpShadow = null; // disc shown under player when airborne

  // Camera (fixed angle, yaw-only orbit removed)
  let camYaw   = 0;
  let camPitch = 1.13; // ~65° — dungeon angle

  let MAT = {};
  let mmCanvas, mmCtx;
  let visited = null;

  // Analog joystick values from mobile d-pad (-1..+1)
  let _joyAx = 0, _joyAy = 0;

  // ─── Helpers ───────────────────────────────────────
  function cellKey(gr, gc) { return gr * 10000 + gc; }
  function worldCenter(gr, gc) { return { x: gc * CELL + CELL / 2, z: gr * CELL + CELL / 2 }; }
  function gridOf(wx, wz) { return { gc: Math.floor(wx / CELL), gr: Math.floor(wz / CELL) }; }
  function footstepMaterialAt(wx, wz) {
    if (!md || !md.grid) return 'maze_stone';
    const { gr, gc } = gridOf(wx, wz);
    if (gc < 0 || gc >= md.W || gr < 0 || gr >= md.H || md.grid[gr][gc] === 1) return null;

    const key = cellKey(gr, gc);
    const trap = md.traps && md.traps.get(key);
    if (trap === 'lava' || trap === 'fall' || trap === 'fall-deep') return null;

    const damageTrap = md.damageTraps && md.damageTraps.get(key);
    if (damageTrap && damageTrap.type === 'plate') return 'maze_plate';

    return 'maze_stone';
  }
  function dist2D(ar, ac, br, bc) { return Math.abs(ar - br) + Math.abs(ac - bc); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ─── Materials (created once) ──────────────────────
  function buildMaterials() {
    MAT.wall    = new THREE.MeshLambertMaterial({ color: 0x4a5e72 });
    MAT.wallTop = new THREE.MeshLambertMaterial({ color: 0x566880 });
    MAT.floor   = new THREE.MeshLambertMaterial({ color: 0x282840 });

    // Lava: deep glowing pool
    MAT.lava = new THREE.MeshStandardMaterial({
      color: 0xff3300, emissive: 0xff2200, emissiveIntensity: 2.4,
      roughness: 0.85, metalness: 0.0,
    });
    MAT.lavaCrust = new THREE.MeshStandardMaterial({
      color: 0x3a0000, emissive: 0x1a0000, emissiveIntensity: 0.6,
      roughness: 1.0, metalness: 0.0,
    });

    // Fall holes
    MAT.fallHole = new THREE.MeshStandardMaterial({
      color: 0x010101, roughness: 1.0, metalness: 0.0,
    });
    MAT.fallRim = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a, emissive: 0x0a0a0a, roughness: 0.75, metalness: 0.3,
    });
    MAT.fallDeepRim = new THREE.MeshStandardMaterial({
      color: 0x1a1a28, emissive: 0x0a0814, emissiveIntensity: 0.6, roughness: 0.7, metalness: 0.4,
    });

    MAT.loot = new THREE.MeshStandardMaterial({
      color: 0xffbb00, emissive: 0x553300, emissiveIntensity: 0.8,
      roughness: 0.35, metalness: 0.7,
    });
    MAT.exit = new THREE.MeshStandardMaterial({
      color: 0x00ff99, emissive: 0x004433, emissiveIntensity: 1.2,
      roughness: 0.3, metalness: 0.5,
    });
  }

  function makePlayerMaterials() {
    // Returns fresh material instances (so death animation can tint them)
    return {
      armor:  new THREE.MeshStandardMaterial({ color: 0x2255dd, roughness: 0.35, metalness: 0.75 }),
      suit:   new THREE.MeshStandardMaterial({ color: 0x112266, roughness: 0.5, metalness: 0.5 }),
      skin:   new THREE.MeshStandardMaterial({ color: 0xddaa88, roughness: 0.8, metalness: 0.0 }),
      visor:  new THREE.MeshStandardMaterial({ color: 0x553300, roughness: 0.3, metalness: 0.0 }),
      boot:   new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.6, metalness: 0.6 }),
    };
  }

  // ─── Renderer & Scene ─────────────────────────────
  function initRenderer() {
    const canvas = document.getElementById('gameCanvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x02020a);
    renderer.shadowMap.enabled   = false;
    renderer.outputEncoding      = THREE.sRGBEncoding;
    renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02020a, 0.025);

    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 120);
    clock  = new THREE.Clock();

    // Flat ambient — dim base so deep-dungeon corners stay dark
    scene.add(new THREE.AmbientLight(0x4a5870, 0.6));

    // Torch — warm point light that follows the player
    playerLight = new THREE.PointLight(0xffaa44, 4.0, 18);
    scene.add(playerLight);

    // Exit portal light — starts at 0, enabled when exit is placed
    exitLight = new THREE.PointLight(0x00ff88, 0.0, 20);
    scene.add(exitLight);

    // Lava glow — starts at 0, enabled near lava tiles
    lavaLight = new THREE.PointLight(0xff4400, 0.0, 18);
    scene.add(lavaLight);
  }

  // ─── Floor size / trap count ───────────────────────
  function getRoomSize(floor) { return Math.min(18, 10 + Math.floor((floor - 1) / 5) * 2); }
  function getTrapCount(floor) { return Math.min(35, 5 + Math.floor(floor * 1.8)); }

  // ─── Build a floor ─────────────────────────────────
  function buildFloor(floorNum) {
    clearFloorObjects();

    const rooms  = getRoomSize(floorNum);
    const result = MazeGen.generate(rooms, rooms);
    const { grid, W, H, start, exit } = result;

    md = {
      grid, W, H,
      startGR: start.gr, startGC: start.gc,
      exitGR:  exit.gr,  exitGC:  exit.gc,
      traps: new Map(),        // cellKey → 'lava' | 'fall' | 'fall-deep'
      damageTraps: new Map(), // cellKey → { type:'spike'|'blade', phase }
      loots: new Map(),
    };

    visited = new Uint8Array(W * H);

    placeEntities(grid, W, H, start, exit, floorNum);
    buildWalls(grid, W, H);
    buildFloorPlane(W, H);
    buildTraps();
    buildDamageTraps();
    buildExit(exit.gr, exit.gc);
    buildLoot();
    buildPlayer();
    respawn();
  }

  function clearFloorObjects() {
    const rm = obj => { if (!obj) return; scene.remove(obj); if (obj.geometry) obj.geometry.dispose(); };
    rm(wallMesh);    wallMesh    = null;
    rm(lavaMesh);        lavaMesh        = null;
    rm(fallMesh);        fallMesh        = null;
    rm(fallRimMesh);     fallRimMesh     = null;
    rm(fallDeepMesh);    fallDeepMesh    = null;
    rm(fallDeepRimMesh); fallDeepRimMesh = null;
    rm(floorMesh);   floorMesh   = null;
    rm(exitMesh);    exitMesh    = null;
    damageTrapObjects.forEach(o => scene.remove(o.group));
    damageTrapObjects = [];
    damageCooldown    = 0;
    if (lootGroup)   { scene.remove(lootGroup);   lootGroup   = null; }
    if (playerGroup) { scene.remove(playerGroup); playerGroup = null; }
    if (jumpShadow)  { scene.remove(jumpShadow);  jumpShadow  = null; }
    exitLight.intensity = 0;
    lavaLight.intensity = 0;
    deathAnim = null;
    playerParts = {};
    playerMats  = [];
  }

  // ─── Entity placement ──────────────────────────────
  function placeEntities(grid, W, H, start, exit, floor) {
    const rooms = [];
    for (let gr = 1; gr < H; gr += 2)
      for (let gc = 1; gc < W; gc += 2) {
        if (gr === start.gr && gc === start.gc) continue;
        if (gr === exit.gr  && gc === exit.gc)  continue;
        rooms.push({ gr, gc });
      }

    const corridors = [];
    for (let gr = 0; gr < H; gr++)
      for (let gc = 0; gc < W; gc++) {
        if (grid[gr][gc] !== 0) continue;
        if (gr === start.gr && gc === start.gc) continue;
        if (gr === exit.gr  && gc === exit.gc)  continue;
        if (dist2D(gr, gc, start.gr, start.gc) < 4) continue;
        corridors.push({ gr, gc });
      }

    seededShuffle(corridors);
    const trapCount = getTrapCount(floor);
    let placed = 0;
    const DIRS4 = [[-1,0],[1,0],[0,-1],[0,1]];
    const isLava = t => t === 'lava';
    const isFall = t => t === 'fall' || t === 'fall-deep';
    for (const c of corridors) {
      if (placed >= trapCount) break;
      // ~40% lava, ~35% regular fall, ~25% deep fall
      const r = placed % 4;
      const type = r === 0 || r === 3 ? 'lava' : r === 1 ? 'fall' : 'fall-deep';
      // Reject if any orthogonal neighbor already has a trap of the same kind
      // (lava next to lava, or fall/fall-deep next to fall/fall-deep or lava)
      let blocked = false;
      for (const [dr, dc] of DIRS4) {
        const neighbor = md.traps.get(cellKey(c.gr + dr, c.gc + dc));
        if (!neighbor) continue;
        if (isLava(type) && isLava(neighbor)) { blocked = true; break; }
        if (isFall(type) && isFall(neighbor)) { blocked = true; break; }
        if (isLava(type) && isFall(neighbor)) { blocked = true; break; }
        if (isFall(type) && isLava(neighbor)) { blocked = true; break; }
      }
      if (blocked) continue;
      md.traps.set(cellKey(c.gr, c.gc), type);
      placed++;
    }

    // Damage traps in remaining corridor cells (after lava/fall placed)
    const dmgCount = Math.min(20, 3 + Math.floor(floor * 1.2));
    let dmgPlaced = 0;
    for (const c of corridors) {
      if (dmgPlaced >= dmgCount) break;
      const k = cellKey(c.gr, c.gc);
      if (md.traps.has(k)) continue;
      if (dist2D(c.gr, c.gc, start.gr, start.gc) < 3) continue;
      const types = ['spike', 'blade', 'axe', 'plate', 'flame', 'ball'];
      const type  = types[dmgPlaced % types.length];
      // Axe requires walls on both sides of one axis so the blade spans wall-to-wall
      if (type === 'axe') {
        const wallN = c.gr - 1 < 0      || md.grid[c.gr - 1][c.gc] === 1;
        const wallS = c.gr + 1 >= md.H  || md.grid[c.gr + 1][c.gc] === 1;
        const wallE = c.gc + 1 >= md.W  || md.grid[c.gr][c.gc + 1] === 1;
        const wallW = c.gc - 1 < 0      || md.grid[c.gr][c.gc - 1] === 1;
        if (!(wallN && wallS) && !(wallE && wallW)) continue;
      }
      const phase = Math.random() * Math.PI * 2;
      md.damageTraps.set(k, { type, phase });
      dmgPlaced++;
    }

    const lootRooms = rooms
      .filter(c => !md.traps.has(cellKey(c.gr, c.gc)))
      .sort((a, b) => dist2D(b.gr, b.gc, start.gr, start.gc) - dist2D(a.gr, a.gc, start.gr, start.gc));
    const lootCount = Math.min(3, Math.max(1, Math.floor(lootRooms.length * 0.08)));
    for (let i = 0; i < lootCount && i < lootRooms.length; i++) {
      const cell   = lootRooms[i];
      const isLife = Math.random() < 0.15;
      md.loots.set(cellKey(cell.gr, cell.gc), { type: isLife ? 'life' : 'hp', amount: 40, gr: cell.gr, gc: cell.gc });
    }
  }

  function seededShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ─── Walls ─────────────────────────────────────────
  function buildWalls(grid, W, H) {
    let count = 0;
    for (let gr = 0; gr < H; gr++)
      for (let gc = 0; gc < W; gc++)
        if (grid[gr][gc] === 1) count++;

    const geo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    wallMesh = new THREE.InstancedMesh(geo, MAT.wall, count);
    wallMesh.castShadow    = true;
    wallMesh.receiveShadow = true;

    const m = new THREE.Matrix4();
    let i = 0;
    for (let gr = 0; gr < H; gr++)
      for (let gc = 0; gc < W; gc++) {
        if (grid[gr][gc] !== 1) continue;
        m.makeTranslation(gc * CELL + CELL / 2, WALL_H / 2, gr * CELL + CELL / 2);
        wallMesh.setMatrixAt(i++, m);
      }
    wallMesh.instanceMatrix.needsUpdate = true;
    scene.add(wallMesh);
  }

  // ─── Floor plane ───────────────────────────────────
  function buildFloorPlane(W, H) {
    const geo = new THREE.PlaneGeometry(W * CELL, H * CELL);
    floorMesh = new THREE.Mesh(geo, MAT.floor);
    floorMesh.rotation.x   = -Math.PI / 2;
    floorMesh.position.set(W * CELL / 2, -0.01, H * CELL / 2);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
  }

  // ─── Traps ─────────────────────────────────────────
  function buildTraps() {
    const lavaKeys     = [];
    const fallKeys     = [];
    const fallDeepKeys = [];
    for (const [k, type] of md.traps) {
      if (type === 'lava')      lavaKeys.push(k);
      else if (type === 'fall') fallKeys.push(k);
      else                      fallDeepKeys.push(k);
    }

    // ── Lava pits ──
    if (lavaKeys.length > 0) {
      // Glowing lava surface slab
      const lavaGeo = new THREE.BoxGeometry(CELL * 0.90, 0.10, CELL * 0.90);
      lavaMesh = new THREE.InstancedMesh(lavaGeo, MAT.lava, lavaKeys.length);

      // Dark crust border frame (slightly larger, sits just below lava)
      const crustGeo = new THREE.BoxGeometry(CELL * 0.96, 0.06, CELL * 0.96);
      const crustMesh = new THREE.InstancedMesh(crustGeo, MAT.lavaCrust, lavaKeys.length);

      const m = new THREE.Matrix4();
      lavaKeys.forEach((k, i) => {
        const gr = Math.floor(k / 10000);
        const gc = k % 10000;
        const wx = gc * CELL + CELL / 2;
        const wz = gr * CELL + CELL / 2;
        m.makeTranslation(wx, 0.05, wz);
        lavaMesh.setMatrixAt(i, m);
        m.makeTranslation(wx, 0.03, wz);
        crustMesh.setMatrixAt(i, m);
      });
      lavaMesh.instanceMatrix.needsUpdate  = true;
      crustMesh.instanceMatrix.needsUpdate = true;
      scene.add(lavaMesh);
      scene.add(crustMesh);
      lavaLight.intensity = 2.0;
    }

    // ── Fall holes ──
    if (fallKeys.length > 0) {
      // Rim (grey crumbling edge)
      const rimGeo = new THREE.BoxGeometry(CELL * 0.95, 0.10, CELL * 0.95);
      fallRimMesh = new THREE.InstancedMesh(rimGeo, MAT.fallRim, fallKeys.length);

      // Pit floor (deep black)
      const pitGeo = new THREE.BoxGeometry(CELL * 0.82, 0.04, CELL * 0.82);
      fallMesh = new THREE.InstancedMesh(pitGeo, MAT.fallHole, fallKeys.length);

      const m = new THREE.Matrix4();
      fallKeys.forEach((k, i) => {
        const gr = Math.floor(k / 10000);
        const gc = k % 10000;
        const wx = gc * CELL + CELL / 2;
        const wz = gr * CELL + CELL / 2;
        m.makeTranslation(wx, 0.05, wz);
        fallRimMesh.setMatrixAt(i, m);
        m.makeTranslation(wx, -0.20, wz); // visually recessed into ground
        fallMesh.setMatrixAt(i, m);
      });
      fallRimMesh.instanceMatrix.needsUpdate = true;
      fallMesh.instanceMatrix.needsUpdate    = true;
      scene.add(fallRimMesh);
      scene.add(fallMesh);
    }

    // ── Deep fall holes (subtle blue-purple rim) ──
    if (fallDeepKeys.length > 0) {
      const deepRimGeo = new THREE.BoxGeometry(CELL * 0.95, 0.10, CELL * 0.95);
      fallDeepRimMesh = new THREE.InstancedMesh(deepRimGeo, MAT.fallDeepRim, fallDeepKeys.length);
      const deepPitGeo = new THREE.BoxGeometry(CELL * 0.82, 0.04, CELL * 0.82);
      fallDeepMesh = new THREE.InstancedMesh(deepPitGeo, MAT.fallHole, fallDeepKeys.length);

      const m = new THREE.Matrix4();
      fallDeepKeys.forEach((k, i) => {
        const gr = Math.floor(k / 10000);
        const gc = k % 10000;
        const wx = gc * CELL + CELL / 2;
        const wz = gr * CELL + CELL / 2;
        m.makeTranslation(wx, 0.05, wz);
        fallDeepRimMesh.setMatrixAt(i, m);
        m.makeTranslation(wx, -0.20, wz);
        fallDeepMesh.setMatrixAt(i, m);
      });
      fallDeepRimMesh.instanceMatrix.needsUpdate = true;
      fallDeepMesh.instanceMatrix.needsUpdate    = true;
      scene.add(fallDeepRimMesh);
      scene.add(fallDeepMesh);
    }
  }

  // ─── Damage traps ──────────────────────────────────
  function buildDamageTraps() {
    // Shared materials
    const matMetal  = new THREE.MeshStandardMaterial({ color: 0x99aabb, roughness: 0.25, metalness: 0.92 });
    const matDark   = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.9,  metalness: 0.2 });
    const matWood   = new THREE.MeshStandardMaterial({ color: 0x5c3a1a, roughness: 0.9,  metalness: 0.0 });
    const matFlame  = new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xff3300, emissiveIntensity: 2.5, roughness: 1.0 });
    const matStone  = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.85, metalness: 0.1 });
    const matBall   = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.5,  metalness: 0.6 });
    const matPlate  = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.7,  metalness: 0.3 });
    const matArrow  = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.6,  metalness: 0.2 });

    for (const [k, trap] of md.damageTraps) {
      const gr = Math.floor(k / 10000);
      const gc = k % 10000;
      const wx = gc * CELL + CELL / 2;
      const wz = gr * CELL + CELL / 2;
      const group = new THREE.Group();
      group.position.set(wx, 0, wz);
      const obj = { group, type: trap.type, phase: trap.phase, wx, wz, parts: {}, triggered: false };

      if (trap.type === 'spike') {
        // ── Floor spikes ──
        const base = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.9, 0.06, CELL * 0.9), matDark);
        base.position.y = 0.03;
        group.add(base);
        const spikeGroup = new THREE.Group();
        const sGeo = new THREE.ConeGeometry(0.07, 0.60, 5);
        [[-0.45,-0.45],[0.45,-0.45],[-0.45,0.45],[0.45,0.45],[0,0]].forEach(([ox, oz]) => {
          const s = new THREE.Mesh(sGeo, matMetal);
          s.position.set(ox, 0, oz);
          s.castShadow = true;
          spikeGroup.add(s);
        });
        spikeGroup.position.y = -0.35;
        group.add(spikeGroup);
        obj.parts.spikeGroup = spikeGroup;

      } else if (trap.type === 'blade') {
        // ── Wall-mounted sweeping blade ──
        // Mounts on the -X wall, rotates on Y axis sweeping across corridor
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.22), matStone);
        mount.position.set(-CELL * 0.46, 0.95, 0);
        group.add(mount);

        const pivot = new THREE.Group();
        pivot.position.set(-CELL * 0.46, 0.95, 0);
        group.add(pivot);

        // Blade: long, thin, wide — sweeps across the corridor
        const bladeGeo = new THREE.BoxGeometry(CELL * 0.95, 0.07, 0.18);
        const blade = new THREE.Mesh(bladeGeo, matMetal);
        blade.position.x = CELL * 0.47; // blade extends from pivot into corridor
        blade.castShadow = true;
        pivot.add(blade);

        // Slightly tapered tip
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.07, 0.10), matMetal);
        tip.position.x = CELL * 0.96;
        pivot.add(tip);

        pivot.rotation.y = Math.PI / 2; // start flush with wall (inside)
        obj.parts.pivot = pivot;

      } else if (trap.type === 'axe') {
        // ── Ceiling pendulum axe — swings perpendicular to corridor ──
        // Detect which axis has walls on BOTH sides — blade spans those two walls
        const wallN = gr - 1 < 0    || md.grid[gr - 1][gc] === 1;
        const wallS = gr + 1 >= md.H || md.grid[gr + 1][gc] === 1;
        const wallE = gc + 1 >= md.W || md.grid[gr][gc + 1] === 1;
        const wallW = gc - 1 < 0    || md.grid[gr][gc - 1] === 1;
        // ewWalls → corridor N-S, blade wide on X, swings along Z (rotation.x)
        // nsWalls → corridor E-W, blade wide on Z, swings along X (rotation.z)
        const swingAxis = (wallE && wallW) ? 'x' : 'z';
        obj.swingAxis = swingAxis;

        // Chain links from ceiling
        for (let i = 0; i < 4; i++) {
          const link = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 5, 7), matMetal);
          link.position.y = WALL_H - 0.1 - i * 0.17;
          if (i % 2 === 0) link.rotation.y = Math.PI / 2;
          group.add(link);
        }

        // Pivot at ceiling
        const pivot = new THREE.Group();
        pivot.position.set(0, WALL_H - 0.05, 0);
        group.add(pivot);

        // Thick wooden shaft
        const shaftGeo = new THREE.CylinderGeometry(0.038, 0.030, 1.9, 8);
        const shaft = new THREE.Mesh(shaftGeo, matWood);
        shaft.position.y = -0.95;
        shaft.castShadow = true;
        pivot.add(shaft);

        // Metal collar where shaft meets axe head
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.12, 8), matMetal);
        collar.position.y = -1.84;
        pivot.add(collar);

        // Axe head group at bottom of shaft
        const axeHead = new THREE.Group();
        axeHead.position.y = -1.9;
        pivot.add(axeHead);

        // Blade fills corridor width perpendicular to the walls
        const bladeW = swingAxis === 'z' ? 0.10 : CELL * 0.82;
        const bladeD = swingAxis === 'x' ? 0.10 : CELL * 0.82;

        // Main blade body
        const bladeMain = new THREE.Mesh(new THREE.BoxGeometry(bladeW, 0.72, bladeD), matMetal);
        bladeMain.castShadow = true;
        axeHead.add(bladeMain);

        // Thinner cutting-edge overlay (slightly recessed on one face for bevel look)
        const bevelW = swingAxis === 'z' ? 0.04 : CELL * 0.78;
        const bevelD = swingAxis === 'x' ? 0.04 : CELL * 0.78;
        const bevel = new THREE.Mesh(new THREE.BoxGeometry(bevelW, 0.60, bevelD), matMetal);
        bevel.position.y = 0.04;
        axeHead.add(bevel);

        // Decorative boss disc at center
        const bossGeo = new THREE.CylinderGeometry(0.10, 0.10, swingAxis === 'z' ? bladeD + 0.01 : bladeW + 0.01, 8);
        const boss = new THREE.Mesh(bossGeo, matMetal);
        if (swingAxis === 'z') boss.rotation.z = Math.PI / 2;
        axeHead.add(boss);

        // Top spike
        const spikeTop = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.38, 5), matMetal);
        spikeTop.position.y = 0.49;
        axeHead.add(spikeTop);

        // Bottom hook spike
        const spikeBot = new THREE.Mesh(new THREE.ConeGeometry(0.060, 0.30, 5), matMetal);
        spikeBot.rotation.z = Math.PI;
        spikeBot.position.y = -0.49;
        axeHead.add(spikeBot);

        obj.parts.pivot = pivot;

      } else if (trap.type === 'plate') {
        // ── Pressure plate → shoots arrow ──
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.04, 0.60), matPlate);
        plate.position.y = 0.02;
        group.add(plate);
        // Arrow starts hidden against one wall
        const arrowGroup = new THREE.Group();
        // Shaft
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), matArrow);
        shaft.rotation.z = Math.PI / 2;
        arrowGroup.add(shaft);
        // Head
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 5), matMetal);
        head.rotation.z = Math.PI / 2;
        head.position.x = 0.72;
        arrowGroup.add(head);
        // Feathers
        const fGeo = new THREE.BoxGeometry(0.04, 0.18, 0.10);
        [-0.58, -0.65].forEach(ax => {
          const f = new THREE.Mesh(fGeo, matWood);
          f.position.set(ax, 0.09, 0);
          arrowGroup.add(f);
        });
        arrowGroup.position.set(-CELL * 1.2, 0.8, 0); // hidden in wall
        arrowGroup.visible = false;
        group.add(arrowGroup);
        obj.parts.plate  = plate;
        obj.parts.arrow  = arrowGroup;
        obj.arrowTimer   = 0;
        obj.arrowActive  = false;

      } else if (trap.type === 'flame') {
        // ── Wall flame jet ──
        const wallSide = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), matStone);
        wallSide.position.set(-CELL * 0.45, 0.7, 0);
        group.add(wallSide);
        // Flame cone points outward (+X)
        const flameGeo = new THREE.ConeGeometry(0.14, 0.60, 7);
        const flameMesh = new THREE.Mesh(flameGeo, matFlame);
        flameMesh.rotation.z = -Math.PI / 2; // point in +X direction
        flameMesh.position.set(-CELL * 0.30, 0.7, 0);
        flameMesh.scale.setScalar(0.01); // starts invisible
        group.add(flameMesh);
        obj.parts.flameMesh = flameMesh;

      } else if (trap.type === 'ball') {
        // ── Rolling boulder ──
        const ballGeo = new THREE.SphereGeometry(0.45, 10, 10);
        const ball    = new THREE.Mesh(ballGeo, matBall);
        ball.position.y = 0.45;
        ball.castShadow = true;
        group.add(ball);
        // Roll direction: random X or Z axis
        obj.parts.ball = ball;
        obj.ballDir    = Math.random() < 0.5 ? 'x' : 'z';
        obj.ballRange  = CELL * 1.4; // distance it travels each direction
        obj.ballOffset = 0;
      }

      scene.add(group);
      damageTrapObjects.push(obj);
    }
  }

  // ─── Exit portal ───────────────────────────────────
  let exitAngle = 0;
  function buildExit(gr, gc) {
    const { x: wx, z: wz } = worldCenter(gr, gc);
    const geo   = new THREE.TorusGeometry(0.58, 0.14, 10, 24);
    exitMesh = new THREE.Mesh(geo, MAT.exit);
    exitMesh.position.set(wx, 0.85, wz);
    exitMesh.rotation.x = Math.PI / 2;
    scene.add(exitMesh);
    exitLight.position.set(wx, 2, wz);
    exitLight.intensity = 4.5;
  }

  // ─── Loot chests ───────────────────────────────────
  function buildLoot() {
    lootGroup = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.52, 0.46, 0.46);
    for (const [, loot] of md.loots) {
      const { x: wx, z: wz } = worldCenter(loot.gr, loot.gc);
      const mat = new THREE.MeshStandardMaterial({
        color:    loot.type === 'life' ? 0xff66cc : 0xffbb00,
        emissive: loot.type === 'life' ? 0x440022 : 0x553300,
        emissiveIntensity: 0.7,
        roughness: 0.3, metalness: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.position.set(wx, 0.38, wz);
      mesh.userData.key = cellKey(loot.gr, loot.gc);
      lootGroup.add(mesh);
    }
    scene.add(lootGroup);
  }

  // ─── Humanoid player ───────────────────────────────
  function buildPlayer() {
    const pm = makePlayerMaterials();
    playerMats = Object.values(pm); // store for death animation

    playerGroup = new THREE.Group();

    // Torso (armored chest plate)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.58, 0.30), pm.armor);
    torso.position.set(0, 0.82, 0);
    torso.castShadow = true;
    playerGroup.add(torso);
    playerParts.torso = torso;

    // Shoulder pads
    const padGeo = new THREE.BoxGeometry(0.20, 0.16, 0.24);
    const padL = new THREE.Mesh(padGeo, pm.armor);
    padL.position.set(-0.36, 1.04, 0);
    padL.castShadow = true;
    playerGroup.add(padL);
    const padR = new THREE.Mesh(padGeo, pm.armor);
    padR.position.set(0.36, 1.04, 0);
    padR.castShadow = true;
    playerGroup.add(padR);

    // Head
    const headGeo = new THREE.BoxGeometry(0.36, 0.36, 0.34);
    const head = new THREE.Mesh(headGeo, pm.armor);
    head.position.set(0, 1.28, 0);
    head.castShadow = true;
    playerGroup.add(head);
    playerParts.head = head;

    // Visor (face plate — slightly in front)
    const visorGeo = new THREE.BoxGeometry(0.28, 0.14, 0.06);
    const visor = new THREE.Mesh(visorGeo, pm.visor);
    visor.position.set(0, 1.30, 0.20);
    playerGroup.add(visor);

    // Upper arms
    const uArmGeo = new THREE.BoxGeometry(0.18, 0.32, 0.18);
    const armL = new THREE.Mesh(uArmGeo, pm.suit);
    armL.position.set(-0.38, 0.76, 0);
    armL.castShadow = true;
    playerGroup.add(armL);
    playerParts.armL = armL;

    // Right upper arm — hangs straight down from shoulder
    const armR = new THREE.Mesh(uArmGeo, pm.suit);
    armR.position.set(0.38, 0.76, 0);  // center; top=0.92, bottom(elbow)=0.60
    armR.castShadow = true;
    playerGroup.add(armR);
    playerParts.armR = armR;

    // Forearms / gauntlets
    const fArmGeo = new THREE.BoxGeometry(0.16, 0.26, 0.16);
    const fArmL = new THREE.Mesh(fArmGeo, pm.armor);
    fArmL.position.set(-0.38, 0.48, 0);
    playerGroup.add(fArmL);
    playerParts.fArmL = fArmL;

    // Right forearm — 90° from upper arm, extends forward in +Z from elbow
    const fArmR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.30), pm.armor);
    fArmR.position.set(0.38, 0.60, 0.15);  // elbow at z=0, hand at z=0.30
    playerGroup.add(fArmR);
    playerParts.fArmR = fArmR;

    // Hips / belt
    const hipGeo = new THREE.BoxGeometry(0.50, 0.16, 0.28);
    const hips = new THREE.Mesh(hipGeo, pm.suit);
    hips.position.set(0, 0.50, 0);
    playerGroup.add(hips);

    // Thighs
    const thighGeo = new THREE.BoxGeometry(0.20, 0.30, 0.22);
    const legL = new THREE.Mesh(thighGeo, pm.suit);
    legL.position.set(-0.15, 0.30, 0);
    legL.castShadow = true;
    playerGroup.add(legL);
    playerParts.legL = legL;

    const legR = new THREE.Mesh(thighGeo, pm.suit);
    legR.position.set(0.15, 0.30, 0);
    legR.castShadow = true;
    playerGroup.add(legR);
    playerParts.legR = legR;

    // Shins / boots
    const shinGeo = new THREE.BoxGeometry(0.18, 0.26, 0.20);
    const shinL = new THREE.Mesh(shinGeo, pm.boot);
    shinL.position.set(-0.15, 0.08, 0);
    playerGroup.add(shinL);
    playerParts.shinL = shinL;

    const shinR = new THREE.Mesh(shinGeo, pm.boot);
    shinR.position.set(0.15, 0.08, 0);
    playerGroup.add(shinR);
    playerParts.shinR = shinR;

    // ── Torch (held in right hand) ──────────────────
    const torchGroup = new THREE.Group();
    // Wooden handle
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x5c3010, roughness: 0.95, metalness: 0.0 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.55, 6), handleMat);
    handle.castShadow = true;
    torchGroup.add(handle);
    // Rag wrap at top
    const ragMat = new THREE.MeshStandardMaterial({ color: 0x3a1800, roughness: 1.0, metalness: 0.0 });
    const rag = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, 0.14, 6), ragMat);
    rag.position.y = 0.34;
    torchGroup.add(rag);
    // Flame core
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 4.0, roughness: 1.0, metalness: 0.0,
    });
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 7), flameMat);
    flame.position.y = 0.48;
    torchGroup.add(flame);
    // Flame tip
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xffdd00, emissive: 0xffbb00, emissiveIntensity: 5.0, roughness: 1.0, metalness: 0.0,
    });
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 5), tipMat);
    tip.position.y = 0.58;
    torchGroup.add(tip);

    // Torch at hand — end of forearm, pointing straight up (90° from forearm)
    torchGroup.position.set(0.38, 0.60, 0.32);
    torchGroup.rotation.set(0, 0, 0);  // fully upright
    playerGroup.add(torchGroup);
    playerParts.torchGroup = torchGroup;
    playerParts.flame      = flame;
    playerParts.flameTip   = tip;
    playerParts.flameMat   = flameMat;
    playerParts.tipMat     = tipMat;

    scene.add(playerGroup);

    // Jump shadow — dark disc that stays on the floor when airborne
    if (jumpShadow) scene.remove(jumpShadow);
    const shadowMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0, transparent: true, opacity: 0.45 });
    jumpShadow = new THREE.Mesh(new THREE.CircleGeometry(0.38, 14), shadowMat);
    jumpShadow.rotation.x = -Math.PI / 2;
    jumpShadow.position.y = 0.02;
    jumpShadow.visible = false;
    scene.add(jumpShadow);
  }

  // ─── Respawn ───────────────────────────────────────
  function respawn() {
    const { x, z } = worldCenter(md.startGR, md.startGC);
    px = x;
    pz = z;

    playerY         = 0;
    playerVY        = 0;
    isGrounded      = true;
    respawnImmunity = 1.2;
    damageCooldown  = 0;
    knockVX         = 0;
    knockVZ         = 0;

    if (playerGroup) {
      playerGroup.position.set(px, 0, pz);
      playerGroup.rotation.y = 0;
      playerGroup.scale.set(1, 1, 1);
      resetPlayerAppearance();
    }

    playerLight.position.set(px + 0.45, 1.15, pz + 0.09);

    // Snap camera to current orbit position
    const snapDist = CAM_DIST;
    camera.position.set(
      px + Math.sin(camYaw) * Math.cos(camPitch) * snapDist,
      0.6 + Math.sin(camPitch) * snapDist,
      pz + Math.cos(camYaw) * Math.cos(camPitch) * snapDist
    );
    camera.lookAt(px, 1.0, pz);
  }

  function resetPlayerAppearance() {
    if (!playerGroup) return;
    playerGroup.scale.set(1, 1, 1);
    playerGroup.position.y = 0;

    // Rebuild fresh materials to clear any death tinting
    const pm = makePlayerMaterials();
    playerMats = Object.values(pm);
    playerParts.torso  && (playerParts.torso.material  = pm.armor);
    playerParts.head   && (playerParts.head.material   = pm.armor);
    playerParts.armL   && (playerParts.armL.material   = pm.suit);
    playerParts.armR   && (playerParts.armR.material   = pm.suit);
    playerParts.fArmL  && (playerParts.fArmL.material  = pm.armor);
    playerParts.fArmR  && (playerParts.fArmR.material  = pm.armor);
    playerParts.legL   && (playerParts.legL.material   = pm.suit);
    playerParts.legR   && (playerParts.legR.material   = pm.suit);
    playerParts.shinL  && (playerParts.shinL.material  = pm.boot);
    playerParts.shinR  && (playerParts.shinR.material  = pm.boot);
  }

  // ─── Collision ─────────────────────────────────────
  function isWall(wx, wz) {
    const { grid, W, H } = md;
    const gc = Math.floor(wx / CELL);
    const gr = Math.floor(wz / CELL);
    if (gc < 0 || gc >= W || gr < 0 || gr >= H) return true;
    return grid[gr][gc] === 1;
  }

  function blocked(wx, wz) {
    const r = PLAYER_R;
    return isWall(wx - r, wz - r) || isWall(wx + r, wz - r)
        || isWall(wx - r, wz + r) || isWall(wx + r, wz + r);
  }

  // ─── Movement ──────────────────────────────────────
  function movePlayer(dt) {
    if (state === 'dying') {
      isMoving = false;
      return;
    }

    // Camera-relative forward/right vectors (flat, ignore pitch)
    const fwdX =  Math.sin(camYaw);
    const fwdZ =  Math.cos(camYaw);
    const rgtX =  Math.cos(camYaw);
    const rgtZ = -Math.sin(camYaw);

    let dx = 0, dz = 0;
    if (_joyAx !== 0 || _joyAy !== 0) {
      // Analog joystick: smooth 360° movement, speed proportional to push distance
      dx = fwdX * _joyAy + rgtX * _joyAx;
      dz = fwdZ * _joyAy + rgtZ * _joyAx;
    } else {
      if (keys['KeyW'] || keys['ArrowUp'])    { dx -= fwdX; dz -= fwdZ; }
      if (keys['KeyS'] || keys['ArrowDown'])  { dx += fwdX; dz += fwdZ; }
      if (keys['KeyA'] || keys['ArrowLeft'])  { dx -= rgtX; dz -= rgtZ; }
      if (keys['KeyD'] || keys['ArrowRight']) { dx += rgtX; dz += rgtZ; }
    }

    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 1) { dx /= len; dz /= len; }
    isMoving = len > 0.01;

    dx *= PLAYER_SPEED * dt;
    dz *= PLAYER_SPEED * dt;

    if (!blocked(px + dx, pz))      px += dx;
    if (!blocked(px,       pz + dz)) pz += dz;

    // Apply knockback from swing traps
    if (Math.abs(knockVX) > 0.01 || Math.abs(knockVZ) > 0.01) {
      if (!blocked(px + knockVX * dt, pz)) px += knockVX * dt;
      if (!blocked(px, pz + knockVZ * dt)) pz += knockVZ * dt;
      knockVX *= 1 - dt * 8;
      knockVZ *= 1 - dt * 8;
    } else {
      knockVX = 0; knockVZ = 0;
    }

    // ── Jump ──────────────────────────────────────────
    if (keys['Space'] && isGrounded) {
      playerVY   = JUMP_VY;
      isGrounded = false;
      if (window.SFX) SFX.once('jump');
    }
    playerVY -= GRAVITY * dt;
    playerY  += playerVY  * dt;
    if (playerY <= 0) {
      const wasAirborne = !isGrounded;
      playerY    = 0;
      playerVY   = 0;
      isGrounded = true;
      if (wasAirborne && window.SFX) SFX.once('land');
    }

    if (playerGroup) {
      playerGroup.position.set(px, playerY, pz);
      if (isMoving) playerGroup.rotation.y = Math.atan2(dx, dz);
    }

    // Jump shadow: visible + scales down the higher the player is
    if (jumpShadow) {
      jumpShadow.position.set(px, 0.02, pz);
      if (!isGrounded) {
        jumpShadow.visible = true;
        const shrink = Math.max(0.3, 1.0 - playerY * 0.12);
        jumpShadow.scale.setScalar(shrink);
        jumpShadow.material.opacity = 0.45 * shrink;
      } else {
        jumpShadow.visible = false;
      }
    }

    // Torch light follows the torch world position
    const pa = playerGroup ? playerGroup.rotation.y : 0;
    if (window.SFX) SFX.setFootsteps(false);

    playerLight.position.set(
      px + Math.cos(pa) * 0.50 * 0.9,
      1.15,
      pz + Math.sin(pa) * 0.50 * 0.9
    );

    // Walk cycle leg/arm swing
    if (isMoving) {
      walkCycle += dt * 8.0;
      const swing = Math.sin(walkCycle) * 0.45;
      if (playerParts.legL)  playerParts.legL.rotation.x  =  swing;
      if (playerParts.legR)  playerParts.legR.rotation.x  = -swing;
      if (playerParts.shinL) playerParts.shinL.rotation.x =  Math.max(0, swing) * 0.8;
      if (playerParts.shinR) playerParts.shinR.rotation.x =  Math.max(0, -swing) * 0.8;
      if (playerParts.armL)  playerParts.armL.rotation.x  = -swing * 0.6;
      if (playerParts.armR)  playerParts.armR.rotation.x  =  swing * 0.6;
      if (playerParts.fArmL) playerParts.fArmL.rotation.x = -swing * 0.4;
      if (playerParts.fArmR) playerParts.fArmR.rotation.x =  swing * 0.4;
    } else {
      walkCycle = 0;
      ['legL','legR','shinL','shinR','armL','armR','fArmL','fArmR'].forEach(k => {
        if (playerParts[k]) playerParts[k].rotation.x = 0;
      });
    }

    // Minimap
    const { gc, gr } = gridOf(px, pz);
    if (gc >= 0 && gc < md.W && gr >= 0 && gr < md.H) {
      visited[gr * md.W + gc] = 1;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) {
          const vr = gr + dr, vc = gc + dc;
          if (vr >= 0 && vr < md.H && vc >= 0 && vc < md.W)
            visited[vr * md.W + vc] = 1;
        }
    }
  }

  // ─── Camera ────────────────────────────────────────
  function updateCamera() {
    let pitch = camPitch;
    let lookY = 1.0;

    if (deathAnim) {
      if (deathAnim.type === 'lava') {
        lookY = Math.max(-0.5, 1.0 - deathAnim.timer * 1.2);
      } else if (deathAnim.type === 'fall' || deathAnim.type === 'fall-deep') {
        pitch = Math.min(CAM_PITCH_MAX, pitch + deathAnim.timer * 0.4);
        lookY = Math.max(-2, 1.0 - deathAnim.timer * 3.0);
      }
    }

    const dist = CAM_DIST;
    const tx   = px + Math.sin(camYaw) * Math.cos(pitch) * dist;
    const ty   = 0.6 + Math.sin(pitch) * dist;
    const tz   = pz + Math.cos(camYaw) * Math.cos(pitch) * dist;

    camera.position.x += (tx - camera.position.x) * CAM_LERP;
    camera.position.y  = ty;   // fixed height — no lerp, no tilt with movement
    camera.position.z += (tz - camera.position.z) * CAM_LERP;
    camera.lookAt(px, lookY, pz);
  }

  // ─── Interactions ──────────────────────────────────
  function checkInteractions() {
    if (state === 'dying') return;
    if (respawnImmunity > 0) return;

    const { gc, gr } = gridOf(px, pz);
    const k = cellKey(gr, gc);

    // Traps only fire when grounded — airborne player clears them
    if (md.traps.has(k) && isGrounded) {
      const trapType = md.traps.get(k);
      startDeathAnim(trapType);
      return;
    }

    if (md.loots.has(k)) collectLoot(k);

    const { x: ex, z: ez } = worldCenter(md.exitGR, md.exitGC);
    if (Math.abs(px - ex) < 0.9 && Math.abs(pz - ez) < 0.9) onFloorComplete();
  }

  // ─── Death animation ───────────────────────────────
  function startDeathAnim(type) {
    if (deathAnim || state === 'dying') return;
    state = 'dying';
    deathAnim = {
      type,
      timer: 0,
      duration: type === 'lava' ? 2.0 : 1.4,
      // fall-deep uses same animation as fall
    };

    if (type === 'lava') {
      showFlash('🌋  FALLING INTO LAVA…', '#ff4400');
      if (window.SFX) SFX.once('lava');
    } else {
      showFlash('💀  FALLING…', '#8888ff');
      if (window.SFX) SFX.once('fall');
    }
  }

  function updateDeathAnim(dt) {
    if (!deathAnim || !playerGroup) return;
    deathAnim.timer += dt;
    const t = Math.min(1.0, deathAnim.timer / deathAnim.duration);

    if (deathAnim.type === 'lava') {
      // Sink into floor and squish/melt
      const sinkDepth = lerp(0, -1.6, t * t);
      playerGroup.position.y = sinkDepth;
      // Squish down as if melting into lava
      const squishY = Math.max(0.05, 1.0 - t * 0.92);
      const squishXZ = 1.0 + t * 0.5; // spread outward
      playerGroup.scale.set(squishXZ, squishY, squishXZ);

      // Shift color to orange-red glow as player melts
      const heat = t;
      playerMats.forEach(mat => {
        mat.color.setRGB(lerp(mat.color.r, 1.0, heat * 0.9), lerp(mat.color.g, 0.12, heat * 0.9), lerp(mat.color.b, 0.0, heat * 0.9));
        mat.emissive.setRGB(heat * 0.8, 0, 0);
        mat.emissiveIntensity = heat * 2.5;
      });
      // Intensify lava light near player during melt
      lavaLight.position.set(px, 0.5, pz);
      lavaLight.intensity = 2.0 + heat * 4.0;

    } else if (deathAnim.type === 'fall' || deathAnim.type === 'fall-deep') {
      // Gravity-accurate drop: t² gives immediate acceleration like real freefall
      const fallDepth = -6.0 * t * t;
      playerGroup.position.y = fallDepth;
      // Shrink as they disappear into the hole
      const shrink = Math.max(0.01, 1.0 - t * 0.92);
      playerGroup.scale.set(shrink, shrink, shrink);
      // Darken into the dark pit
      const dark = t * 0.85;
      playerMats.forEach(mat => {
        mat.color.setRGB(
          Math.max(0, mat.color.r - dark),
          Math.max(0, mat.color.g - dark),
          Math.max(0, mat.color.b - dark)
        );
      });
    }

    if (deathAnim.timer >= deathAnim.duration) {
      onDeathAnimComplete();
    }
  }

  function onDeathAnimComplete() {
    const type = deathAnim.type;
    deathAnim = null;

    if (type === 'fall-deep') {
      // Deep fall → next floor, lose a heart + 50% HP
      gd.lives--;
      const hpLost = Math.max(50, Math.floor(gd.hp * 0.5));
      gd.hp = Math.max(0, gd.hp - hpLost);
      updateHUD();
      if (gd.lives <= 0 || gd.hp <= 0) {
        state = 'playing';
        onGameOver();
      } else {
        showFlash('⬇  FELL DEEPER — FLOOR ' + (gd.floor + 1) + '  −1 LIFE  −' + hpLost + ' HP', '#9988ff');
        state = 'playing';
        nextFloor();
      }
    } else {
      // Lava or regular fall → lose a life, respawn same floor
      gd.lives--;
      updateHUD();
      if (gd.lives <= 0) {
        state = 'playing';
        onGameOver();
      } else {
        state  = 'playing';
        gd.hp  = HP_MAX; // HP resets to full on lava/fall death
        showFlash(type === 'lava' ? '☠  MELTED BY LAVA' : '☠  FELL — BACK TO START', type === 'lava' ? '#ff3300' : '#aaaaff');
        resetPlayerAppearance();
        respawn();
        updateHUD();
      }
    }
  }

  // ─── Loot ──────────────────────────────────────────
  function collectLoot(k) {
    const loot = md.loots.get(k);
    md.loots.delete(k);
    const child = lootGroup.children.find(m => m.userData.key === k);
    if (child) lootGroup.remove(child);

    if (loot.type === 'hp') {
      const gained = Math.min(loot.amount, HP_MAX - gd.hp);
      gd.hp = Math.min(HP_MAX, gd.hp + loot.amount);
      showFlash(`+${gained} HP`, '#00ff88');
      if (window.SFX) SFX.once('loot');
    } else {
      gd.lives++;
      showFlash('+ EXTRA LIFE!', '#ff88ff');
      if (window.SFX) SFX.once('lifeup');
    }
    gd.score += 50;
    updateHUD();
  }

  // ─── Floor complete / Game over ────────────────────
  function onFloorComplete() {
    if (state !== 'playing') return;
    state = 'floor-complete';
    if (window.SFX) SFX.once('exit');
    if (window.SFX) SFX.stopAmbient();
    const bonus = Math.max(0, Math.floor(10000 / (gd.floorTime + 1)));
    gd.score += gd.floor * 100 + bonus;
    updateFloorSummary();
    showScreen('floor-complete');
  }

  function onGameOver() {
    if (state !== 'playing') return;
    state = 'game-over';
    clearSave();
    if (window.SFX) SFX.once('gameover');
    if (window.SFX) SFX.stopAmbient();
    updateGameOverSummary();
    showScreen('game-over');
    trySubmitScore();
  }

  // ─── HUD ───────────────────────────────────────────
  function updateHUD() {
    const hpPct  = Math.max(0, (gd.hp / HP_MAX) * 100);
    const hpFill = document.getElementById('hpFill');
    const hpText = document.getElementById('hpText');
    if (hpFill) hpFill.style.width    = hpPct + '%';
    if (hpText) hpText.textContent    = gd.hp + ' / ' + HP_MAX;

    const lvEl = document.getElementById('hudLives');
    if (lvEl) lvEl.textContent = '♥'.repeat(Math.max(0, gd.lives)) + '♡'.repeat(Math.max(0, LIVES_START - gd.lives));

    const flEl = document.getElementById('hudFloor');
    if (flEl) flEl.textContent = 'FLOOR ' + gd.floor;

    const scEl = document.getElementById('hudScore');
    if (scEl) scEl.textContent = 'SCORE ' + gd.score;

    const elapsed = Math.floor(gd.floorTime);
    const mins    = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs    = (elapsed % 60).toString().padStart(2, '0');
    const tmEl    = document.getElementById('hudTime');
    if (tmEl) tmEl.textContent = mins + ':' + secs;
  }

  // ─── Minimap ───────────────────────────────────────
  function drawMinimap() {
    if (!mmCtx || !md.grid) return;
    const { grid, W, H } = md;
    const SIZE    = Math.min(180, Math.floor(window.innerWidth * 0.18));
    const CELL_PX = Math.floor(SIZE / Math.max(W, H));
    if (CELL_PX < 1) return;

    mmCanvas.width  = W * CELL_PX;
    mmCanvas.height = H * CELL_PX;
    mmCanvas.style.width  = (W * CELL_PX) + 'px';
    mmCanvas.style.height = (H * CELL_PX) + 'px';

    const ctx = mmCtx;
    ctx.fillStyle = '#06060f';
    ctx.fillRect(0, 0, mmCanvas.width, mmCanvas.height);

    for (let gr = 0; gr < H; gr++)
      for (let gc = 0; gc < W; gc++) {
        if (!visited[gr * W + gc]) continue;
        ctx.fillStyle = grid[gr][gc] === 1 ? '#1a2535' : '#2a3550';
        ctx.fillRect(gc * CELL_PX, gr * CELL_PX, CELL_PX, CELL_PX);
      }

    // Lava traps (orange)
    for (const [k, type] of md.traps) {
      const gr = Math.floor(k / 10000);
      const gc = k % 10000;
      if (!visited[gr * W + gc]) continue;
      ctx.fillStyle = type === 'lava' ? '#ff4400' : type === 'fall-deep' ? '#3322aa' : '#333355';
      ctx.fillRect(gc * CELL_PX + 1, gr * CELL_PX + 1, CELL_PX - 1, CELL_PX - 1);
    }

    for (const [k] of md.loots) {
      const gr = Math.floor(k / 10000);
      const gc = k % 10000;
      if (visited[gr * W + gc]) {
        ctx.fillStyle = '#ffbb00';
        ctx.fillRect(gc * CELL_PX + 1, gr * CELL_PX + 1, CELL_PX - 1, CELL_PX - 1);
      }
    }

    if (visited[md.exitGR * W + md.exitGC]) {
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(md.exitGC * CELL_PX, md.exitGR * CELL_PX, CELL_PX, CELL_PX);
    }

    const { gc: pgc, gr: pgr } = gridOf(px, pz);
    ctx.fillStyle = '#55aaff';
    ctx.beginPath();
    ctx.arc(
      pgc * CELL_PX + CELL_PX / 2,
      pgr * CELL_PX + CELL_PX / 2,
      Math.max(2, CELL_PX * 0.6),
      0, Math.PI * 2
    );
    ctx.fill();
  }

  // ─── Screen management ─────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.game-screen').forEach(s => s.classList.remove('active'));
    if (id) {
      const el = document.getElementById('screen-' + id);
      if (el) el.classList.add('active');
    }
    const startBtn = document.getElementById('btnStart');
    if (startBtn) startBtn.textContent = state === 'paused' ? 'RESUME RUN' : 'START RUN';
    const mobileControlsVisible = state === 'playing' || state === 'dying';
    ['mobile-wasd', 'btn-jump', 'btn-mobile-pause'].forEach(controlId => {
      const control = document.getElementById(controlId);
      if (!control) return;
      control.style.visibility = mobileControlsVisible ? 'visible' : 'hidden';
      control.style.pointerEvents = mobileControlsVisible ? '' : 'none';
    });
  }

  function showFlash(text, color) {
    const el = document.getElementById('flash');
    if (!el) return;
    el.textContent   = text;
    el.style.color   = color || '#ffffff';
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 2200);
  }

  function updateFloorSummary() {
    setText('sum-floor',  'Floor ' + gd.floor + ' Complete!');
    setText('sum-time',   fmtTime(gd.floorTime));
    setText('sum-hp',     gd.hp + ' / ' + HP_MAX);
    setText('sum-lives',  gd.lives.toString());
    setText('sum-score',  gd.score.toString());
  }

  function updateGameOverSummary() {
    setText('go-floor', gd.floor.toString());
    setText('go-score', gd.score.toString());
    setText('go-time',  fmtTime(gd.totalTime + gd.floorTime));
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function fmtTime(secs) {
    secs = Math.floor(secs);
    return Math.floor(secs / 60).toString().padStart(2, '0') + ':' + (secs % 60).toString().padStart(2, '0');
  }

  // ─── Leaderboard ───────────────────────────────────
  function getMazeRunnerGuestId() {
    const key = 'mazeRunner.guestPlayerId';
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : 'guest-' + Date.now() + '-' + Math.random().toString(16).slice(2);
        localStorage.setItem(key, id);
      }
      return id;
    } catch (_) {
      return crypto.randomUUID ? crypto.randomUUID() : 'guest-' + Date.now();
    }
  }

  async function trySubmitScore() {
    const client = window._ageeSupabaseClient;
    if (!client) return;
    try {
      const { data: { session } } = await client.auth.getSession();
      await client.from('maze_runner_runs').insert({
        user_id:    session?.user?.id || getMazeRunnerGuestId(),
        floors:     gd.floor,
        score:      gd.score,
        time_ms:    Math.floor((gd.totalTime + gd.floorTime) * 1000),
        lives_left: gd.lives,
        hp_left:    gd.hp,
      });
    } catch (e) {
      console.warn('[MazeRunner] Score submit failed:', e.message);
    }
  }

  async function loadLeaderboard() {
    const client = window._ageeSupabaseClient;
    const el     = document.getElementById('lb-body');
    if (!client || !el) return;
    el.innerHTML = '<tr><td colspan="4" style="text-align:center;opacity:.5">Loading…</td></tr>';
    try {
      const { data, error } = await client
        .from('maze_runner_runs')
        .select('user_id, floors, score, time_ms')
        .order('score', { ascending: false })
        .limit(10);
      if (error) throw error;
      if (!data || data.length === 0) {
        el.innerHTML = '<tr><td colspan="4" style="text-align:center;opacity:.5">No scores yet. Be the first!</td></tr>';
        return;
      }
      el.innerHTML = data.map((row, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="lb-name">${row.user_id.slice(0, 8)}…</td>
          <td>${row.score}</td>
          <td>Floor ${row.floors}</td>
        </tr>`).join('');
    } catch (e) {
      el.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#f44">Could not load leaderboard</td></tr>';
    }
  }

  // ─── Save / Continue ───────────────────────────────
  const SAVE_KEY = 'mazeRunner.activeRun.v1';

  function saveRun() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        gd: { ...gd },
        px, pz,
      }));
    } catch (_) {}
    updateContinueBtn();
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
    updateContinueBtn();
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.version !== 1 || !s.gd || s.gd.floor < 1) return null;
      return s;
    } catch (_) { return null; }
  }

  function updateContinueBtn() {
    const save = loadSave();
    const btn  = document.getElementById('btnContinue');
    if (!btn) return;
    if (save) {
      btn.hidden = false;
      btn.textContent = `CONTINUE (FLOOR ${save.gd.floor})`;
    } else {
      btn.hidden = true;
    }
  }

  // ─── Game flow ─────────────────────────────────────
  function startGame() {
    document.activeElement && document.activeElement.blur();
    if (window.SFX) SFX.init(); // unlock audio on first user gesture
    if (window.SFX) SFX.startAmbient();
    clearSave();
    gd = { hp: HP_MAX, lives: LIVES_START, floor: 1, score: 0, totalTime: 0, floorTime: 0 };
    buildFloor(1);
    state = 'playing';
    showScreen(null);
    updateHUD();
    saveRun();
  }

  function continueGame() {
    const save = loadSave();
    if (!save) { startGame(); return; }
    document.activeElement && document.activeElement.blur();
    if (window.SFX) SFX.init();
    if (window.SFX) SFX.startAmbient();
    gd = { ...save.gd };
    buildFloor(gd.floor);
    // Player position is restored after buildFloor places them at start;
    // restore saved position only if it looks valid (non-zero and on the floor)
    if (save.px && save.pz) { px = save.px; pz = save.pz; }
    state = 'playing';
    showScreen(null);
    updateHUD();
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].forEach(code => { keys[code] = false; });
    document.querySelectorAll('.wasd-btn.is-down').forEach(btn => btn.classList.remove('is-down'));
    if (window.SFX) SFX.stopAmbient();
    showScreen('title');
  }

  function resumeGame() {
    if (state !== 'paused') return;
    document.activeElement && document.activeElement.blur();
    state = 'playing';
    if (window.SFX) SFX.startAmbient();
    showScreen(null);
  }

  function startOrResumeGame() {
    if (state === 'paused') resumeGame();
    else if (loadSave()) continueGame();
    else startGame();
  }

  function nextFloor() {
    gd.totalTime += gd.floorTime;
    gd.floorTime  = 0;
    gd.floor++;
    buildFloor(gd.floor);
    state = 'playing';
    if (window.SFX) SFX.startAmbient();
    showScreen(null);
    updateHUD();
    saveRun();
  }

  function restartGame() { startGame(); }

  // ─── Damage trap animation + collision ────────────
  function animateDamageTraps(dt) {
    const t = Date.now() * 0.001;
    damageTrapObjects.forEach(obj => {
      const { type, phase, parts } = obj;

      if (type === 'spike') {
        // Sine wave: -0.35 (retracted) to 0.40 (extended)
        const s = Math.sin(t * 2.2 + phase);
        parts.spikeGroup.position.y = -0.35 + (s * 0.5 + 0.5) * 0.75;

      } else if (type === 'blade') {
        // Sweeps from inside wall (PI/2) through corridor (0) to other side (-PI/2)
        parts.pivot.rotation.y = Math.sin(t * 1.6 + phase) * (Math.PI / 2 + 0.15);

      } else if (type === 'axe') {
        const arc = Math.sin(t * 1.5 + phase) * 0.72;
        if (obj.swingAxis === 'x') {
          parts.pivot.rotation.x = arc;
          parts.pivot.rotation.z = 0;
        } else {
          parts.pivot.rotation.z = arc;
          parts.pivot.rotation.x = 0;
        }

      } else if (type === 'plate') {
        // Arrow logic handled in checkDamageTraps
        if (obj.arrowActive) {
          obj.arrowTimer += dt;
          // Arrow flies across CELL * 2.4 in 0.5s
          const progress = Math.min(1, obj.arrowTimer / 0.50);
          parts.arrow.position.x = lerp(-CELL * 1.2, CELL * 1.2, progress);
          if (obj.arrowTimer > 0.55) {
            obj.arrowActive = false;
            parts.arrow.visible = false;
            obj.triggered = false;
          }
        }

      } else if (type === 'flame') {
        // 2s on, 1.5s off cycle
        const cycle = (t + phase) % 3.5;
        if (cycle < 2.0) {
          const flicker = 0.85 + 0.18 * Math.sin(t * 14 + phase);
          parts.flameMesh.scale.set(flicker, 1.0 + 0.3 * Math.sin(t * 8), flicker);
          // Flicker the emissive
          parts.flameMesh.material.emissiveIntensity = 2.0 + Math.sin(t * 11) * 1.0;
        } else {
          parts.flameMesh.scale.setScalar(0.01);
        }

      } else if (type === 'ball') {
        // Roll back and forth
        obj.ballOffset = Math.sin(t * 1.4 + phase) * obj.ballRange;
        if (obj.ballDir === 'x') {
          parts.ball.position.x = obj.ballOffset;
          parts.ball.rotation.z = -(obj.ballOffset / 0.45); // roll rotation
        } else {
          parts.ball.position.z = obj.ballOffset;
          parts.ball.rotation.x = (obj.ballOffset / 0.45);
        }
      }
    });
  }

  function checkDamageTraps() {
    if (damageCooldown > 0 || state === 'dying') return;

    damageTrapObjects.forEach(obj => {
      const { type, parts, wx, wz } = obj;
      const distX = Math.abs(px - wx);
      const distZ = Math.abs(pz - wz);
      const nearby = distX < 0.85 && distZ < 0.85;

      let hit = false;

      if (type === 'spike') {
        // Hit when spikes are up (spikeGroup.y > 0.25)
        hit = nearby && parts.spikeGroup.position.y > 0.25;

      } else if (type === 'blade') {
        // Angular velocity of blade (Y axis): cos gives speed & direction
        const tNow = Date.now() * 0.001;
        const angVel = Math.cos(tNow * 1.6 + obj.phase) * (Math.PI / 2 + 0.15) * 1.6;
        const bladeAngle = Math.abs(parts.pivot.rotation.y);
        if (nearby && bladeAngle < 1.05) {
          hit = true;
          // Blade sweeps in Z direction — push player along Z by swing direction
          const speed = Math.abs(angVel);
          const dmgScale = 0.4 + 0.6 * speed / 2.6;
          _swingHit = Math.round(DAMAGE_PER_HIT * dmgScale);
          knockVZ += Math.sign(angVel) * speed * 4.5;
        }

      } else if (type === 'axe') {
        const tNow = Date.now() * 0.001;
        const angVel = Math.cos(tNow * 1.5 + obj.phase) * 0.72 * 1.5;
        // Blade fills corridor width — hit when player is within the cell and axe head passes through
        if (obj.swingAxis === 'x') {
          // Swings forward/back along Z; blade is wide on X (fills corridor)
          const axeZ = wz + Math.sin(parts.pivot.rotation.x) * 1.9;
          if (distX < CELL * 0.42 && Math.abs(pz - axeZ) < 0.38) {
            hit = true;
            const speed = Math.abs(angVel);
            _swingHit = Math.round(DAMAGE_PER_HIT * (0.4 + 0.6 * speed / 1.08));
            knockVZ += Math.sign(angVel) * speed * 4.5;
          }
        } else {
          // Swings left/right along X; blade is wide on Z (fills corridor)
          const axeX = wx + Math.sin(parts.pivot.rotation.z) * 1.9;
          if (distZ < CELL * 0.42 && Math.abs(px - axeX) < 0.38) {
            hit = true;
            const speed = Math.abs(angVel);
            _swingHit = Math.round(DAMAGE_PER_HIT * (0.4 + 0.6 * speed / 1.08));
            knockVX += Math.sign(angVel) * speed * 4.5;
          }
        }

      } else if (type === 'plate') {
        // Only trigger when player is directly on the plate (tight radius)
        const onPlate = distX < 0.28 && distZ < 0.28;
        if (onPlate && !obj.triggered) {
          obj.triggered    = true;
          obj.arrowActive  = true;
          obj.arrowTimer   = 0;
          parts.arrow.position.x = -CELL * 1.2;
          parts.arrow.visible    = true;
        }
        // Arrow damages if player is in its path while flying
        if (obj.arrowActive) {
          const arrowX = wx + parts.arrow.position.x;
          hit = Math.abs(px - arrowX) < 0.55 && Math.abs(pz - wz) < 0.55;
        }

      } else if (type === 'flame') {
        const cycle = (Date.now() * 0.001 + obj.phase) % 3.5;
        const flameOn = cycle < 2.0;
        // Flame extends in +X direction from -CELL*0.45 to +CELL*0.30
        const inFlame = px > wx - CELL * 0.45 && px < wx + 0.30 && distZ < 0.45;
        hit = flameOn && inFlame;

      } else if (type === 'ball') {
        const bx = wx + (obj.ballDir === 'x' ? obj.ballOffset : 0);
        const bz = wz + (obj.ballDir === 'z' ? obj.ballOffset : 0);
        const bd = Math.sqrt((px - bx) ** 2 + (pz - bz) ** 2);
        hit = bd < 0.55;
      }

      if (hit) onDamageHit();
    });
  }

  function onDamageHit() {
    if (damageCooldown > 0) return;
    damageCooldown = 1.0;
    const dmg = _swingHit;
    _swingHit = DAMAGE_PER_HIT; // reset for next hit
    gd.hp = Math.max(0, gd.hp - dmg);
    updateHUD();
    showFlash(`−${dmg} HP`, '#ff4444');
    // Flash player red
    playerMats.forEach(mat => {
      const orig = mat.color.clone();
      mat.color.setHex(0xff2200);
      setTimeout(() => mat.color.copy(orig), 300);
    });
    if (gd.hp <= 0) {
      state = 'playing';
      onGameOver();
    }
  }

  // ─── Animate scene objects ─────────────────────────
  function animateObjects(dt) {
    const t = Date.now() * 0.001;

    // Exit portal spin
    if (exitMesh) {
      exitAngle += dt * 2.4;
      exitMesh.rotation.z = exitAngle;
      const pulse = 1 + 0.14 * Math.sin(exitAngle * 1.9);
      exitMesh.scale.setScalar(pulse);
    }
    if (exitLight.intensity > 0) {
      exitLight.intensity = 3.0 + 1.0 * Math.sin(t * 3.0);
    }

    // Lava pulse — shared material so all tiles pulse together
    if (lavaMesh) {
      const lavaFlicker = 2.0 + 0.8 * Math.sin(t * 4.2) + 0.4 * Math.sin(t * 11.3);
      MAT.lava.emissiveIntensity = lavaFlicker;
      // Lava color shift between orange-red and bright orange
      const heatShift = 0.5 + 0.5 * Math.sin(t * 2.7);
      MAT.lava.emissive.setRGB(1.0, 0.08 + heatShift * 0.18, 0.0);

      // Lava point light follows nearest lava (approximated at player pos)
      if (!deathAnim) {
        lavaLight.position.set(px, 0.8, pz);
        lavaLight.intensity = 2.0 + 0.8 * Math.sin(t * 3.5);
      }
    }

    // Loot chest bob + spin
    if (lootGroup) {
      lootGroup.children.forEach((m, i) => {
        m.position.y  = 0.38 + 0.09 * Math.sin(t * 2.0 + i * 1.3);
        m.rotation.y += dt * 0.9;
      });
    }

    // Player idle bob (only when standing still, not dying, not jumping)
    if (playerGroup && !deathAnim && !isMoving && isGrounded) {
      playerGroup.position.y = playerY + 0.03 * Math.sin(t * 1.8);
    }
    // Airborne: tuck legs up slightly
    if (playerGroup && !isGrounded) {
      if (playerParts.legL)  playerParts.legL.rotation.x  = -0.5;
      if (playerParts.legR)  playerParts.legR.rotation.x  = -0.5;
      if (playerParts.shinL) playerParts.shinL.rotation.x =  0.8;
      if (playerParts.shinR) playerParts.shinR.rotation.x =  0.8;
    }

    // Torch light always flickers — not gated on playerParts so it works from frame 1
    playerLight.intensity = 3.5 + 0.7 * Math.sin(t * 11.5) + 0.4 * Math.sin(t * 6.9);

    // Flame mesh animation — only when the player torch exists
    if (playerParts.flame && playerParts.flameMat) {
      const flicker  = 0.85 + 0.18 * Math.sin(t * 14.3) + 0.10 * Math.sin(t * 9.1) + 0.07 * Math.sin(t * 23.7);
      playerParts.flame.scale.setScalar(flicker);
      playerParts.flame.position.y   = 0.48 + 0.04 * Math.sin(t * 11.0);
      playerParts.flameMat.emissiveIntensity = 3.5 + 2.0 * Math.sin(t * 12.0) + 1.0 * Math.sin(t * 7.3);
      if (playerParts.tipMat) {
        playerParts.tipMat.emissiveIntensity = 4.0 + 2.5 * Math.sin(t * 15.0);
      }
    }
  }

  // ─── Main loop ─────────────────────────────────────
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (respawnImmunity > 0) respawnImmunity -= dt;
    if (damageCooldown  > 0) damageCooldown  -= dt;

    if (state === 'playing' || state === 'dying') {
      if (state === 'playing') gd.floorTime += dt;
      movePlayer(dt);
      updateCamera();
      if (state === 'playing') {
        checkInteractions();
        checkDamageTraps();
      }
      if (state === 'dying') updateDeathAnim(dt);
      if (state === 'playing') { updateHUD(); drawMinimap(); }
    }

    animateDamageTraps(dt);
    animateObjects(dt);
    renderer.render(scene, camera);
  }

  // ─── Input ─────────────────────────────────────────
  function initInput() {
    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      // Prevent spacebar from clicking focused buttons during play
      if (e.code === 'Space' && (state === 'playing' || state === 'dying')) {
        e.preventDefault();
      }
      if (e.code === 'Escape' && state === 'playing') {
        state = 'paused';
        showScreen('title');
      }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    // ── D-pad sliding controller ──────────────────────
    const dpad = document.getElementById('dpad');
    const nub  = document.getElementById('dpad-nub');
    const DPAD_DEAD = 10; // px dead zone
    const DPAD_MAX  = 52; // max nub travel px
    let dpadTouchId = null;

    function dpadUpdate(cx, cy) {
      const rect = dpad.getBoundingClientRect();
      const ox = cx - (rect.left + rect.width  / 2);
      const oy = cy - (rect.top  + rect.height / 2);
      const dist = Math.sqrt(ox * ox + oy * oy);

      if (dist < DPAD_DEAD) {
        dpadClear();
        return;
      }

      const nx = ox / dist, ny = oy / dist;
      const travel = Math.min(dist, DPAD_MAX);
      const mag = (travel - DPAD_DEAD) / (DPAD_MAX - DPAD_DEAD); // 0→1 after dead zone

      // Analog values for smooth movement
      _joyAx = nx * mag;
      _joyAy = ny * mag;

      // Move nub visually
      if (nub) nub.style.transform = `translate(calc(-50% + ${nx * travel}px), calc(-50% + ${ny * travel}px))`;
    }

    function dpadClear() {
      _joyAx = 0; _joyAy = 0;
      if (nub) nub.style.transform = 'translate(-50%, -50%)';
    }

    // Show mobile controls on any touch-capable device
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      if (dpad) dpad.style.display = 'block';
      const jb = document.getElementById('btn-jump');
      if (jb) jb.style.display = 'flex';
    }

    if (dpad) {
      dpad.addEventListener('touchstart', e => {
        e.preventDefault();
        if (dpadTouchId !== null) return;
        const t = e.changedTouches[0];
        dpadTouchId = t.identifier;
        dpadUpdate(t.clientX, t.clientY);
      }, { passive: false });

      dpad.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === dpadTouchId) dpadUpdate(t.clientX, t.clientY);
        }
      }, { passive: false });

      const dpadEnd = e => {
        for (const t of e.changedTouches) {
          if (t.identifier === dpadTouchId) { dpadTouchId = null; dpadClear(); }
        }
      };
      dpad.addEventListener('touchend',    dpadEnd, { passive: false });
      dpad.addEventListener('touchcancel', dpadEnd, { passive: false });
    }

    // ── Mobile jump button ────────────────────────────
    const btnJump = document.getElementById('btn-jump');
    if (btnJump) {
      btnJump.addEventListener('touchstart', e => {
        if (state !== 'playing') return;
        e.preventDefault();
        keys['Space'] = true;
      }, { passive: false });
      btnJump.addEventListener('touchend', e => {
        e.preventDefault();
        keys['Space'] = false;
      }, { passive: false });
    }

    const btnPause = document.getElementById('btn-mobile-pause');
    if (btnPause) {
      btnPause.addEventListener('touchstart', e => {
        e.preventDefault();
        pauseGame();
      }, { passive: false });
      btnPause.addEventListener('click', e => {
        e.preventDefault();
        pauseGame();
      });
    }

    window.addEventListener('resize', () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    });
  }

  // ─── Bootstrap ─────────────────────────────────────
  function init() {
    initRenderer();
    buildMaterials();
    initInput();

    mmCanvas = document.getElementById('minimap');
    mmCtx    = mmCanvas ? mmCanvas.getContext('2d') : null;

    const btn = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    btn('btnStart',    startGame);
    btn('btnContinue', continueGame);
    btn('btnNextFloor', nextFloor);
    btn('btnRestart',   restartGame);
    updateContinueBtn();
    let lbReturnScreen = 'title';
    btn('btnLB',      () => { lbReturnScreen = 'title';     loadLeaderboard(); showScreen('leaderboard'); });
    btn('btnLBBack',  () => { lbReturnScreen = 'game-over'; loadLeaderboard(); showScreen('leaderboard'); });
    btn('btnLBClose', () => showScreen(lbReturnScreen));

    showScreen('title');
    loop();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
