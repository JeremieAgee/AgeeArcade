/* ═══════════════════════════════════════════════════
   engine.js  —  Three.js scene, renderer, lighting,
                 geometry, particles, camera
   Exports: EngineCore (namespace)
════════════════════════════════════════════════════ */
window.EngineCore = (() => {

  /* ── Internal state ──────────────────────────── */
  let renderer, scene, camera;
  let playerMesh, torchLight, ambientLight, hemiLight;
  let _blobMat = null;
  let enemyMeshes   = {};
  let particles     = [];
  let chestMeshes   = [];
  let doorMesh      = null;
  let doorOpen      = false;
  let portalMesh    = null;
  let portalRising  = false;
  let portalRiseY   = -5;
  let arrivalPortal = null;
  let clock         = new THREE.Clock();
  let dungeonGroup  = null;
  let lanternLights = [];
  let wallTorches   = [];
  let carryingTorch = false;
  let carriedTorch  = null;
  let aimAngle      = 0;
  let _dungeonBounds = null;
  let _cameraDungeon = null;
  let bolts          = [];
  let _lastWallTorchCount = 0;
  let _lastTorchFingerprint = 0;
  let _lastLanternPx = null;
  let _lastLanternPz = null;
  let _tileRoomId      = null;
  let _tileRoomCols    = 0;
  let _playerX         = 0;
  let _playerZ         = 0;
  let _cachedRoomId    = undefined;   // last room ID the player was in
  let _scanRoomIds     = new Set();   // rooms in scan range — rebuilt on room change
  let torchInteractAnim = null;
  let chestInteractAnim = null;

  // 4×4 spatial grids for torches and chests — rebuilt on floor load, queried instead of full scans
  let _torchGrid = null;
  let _chestGrid = null;
  let _visibleTorchSet = new Set(); // indices currently marked visible
  let _visibleChestSet = new Set();

  // Cached dungeon textures — generated once, reused across all floor loads
  let _cachedBrickTex    = null;
  let _cachedFloorTex    = null;
  let _cachedBossFloorTex = null;

  function _buildGrid(items, getX, getZ) {
    if (!_dungeonBounds) return null;
    const { minX, maxX, minZ, maxZ } = _dungeonBounds;
    const cellW = (maxX - minX) / 4;
    const cellH = (maxZ - minZ) / 4;
    const cells = Array.from({ length: 16 }, () => []);
    for (let i = 0; i < items.length; i++) {
      const cx = Math.min(3, Math.max(0, Math.floor((getX(items[i]) - minX) / cellW)));
      const cz = Math.min(3, Math.max(0, Math.floor((getZ(items[i]) - minZ) / cellH)));
      cells[cz * 4 + cx].push(i);
    }
    return { cells, minX, minZ, cellW, cellH };
  }

  function _gridQuery(grid, px, pz, radius) {
    const { cells, minX, minZ, cellW, cellH } = grid;
    const cxMin = Math.max(0, Math.floor((px - radius - minX) / cellW));
    const cxMax = Math.min(3, Math.floor((px + radius - minX) / cellW));
    const czMin = Math.max(0, Math.floor((pz - radius - minZ) / cellH));
    const czMax = Math.min(3, Math.floor((pz + radius - minZ) / cellH));
    const result = [];
    for (let cz = czMin; cz <= czMax; cz++)
      for (let cx = cxMin; cx <= cxMax; cx++)
        for (const idx of cells[cz * 4 + cx]) result.push(idx);
    return result;
  }

  // Stair descent animation
  let stairDescending      = false;
  let stairDescentTime     = 0;
  let stairDescentDone     = false;
  let stairDescentCallback = null;
  let stairDescentPhase    = 'walk';
  let stairDescentOrigin   = { x: 0, z: 0 };
  let stairDescentTarget   = { x: 0, z: 0 };

  const LANTERN_COLOR = 0xff7a28;
  const LANTERN_RADIUS = 38;
  const LANTERN_INTENSITY = 6.5;
  const MAX_ACTIVE_LANTERN_LIGHTS = 8;
  const LANTERN_ACTIVE_TILES_X = 10;
  const LANTERN_ACTIVE_TILES_Y = 10;
  const TORCH_FLAME_OFFSET = new THREE.Vector3(0, 0.18, 0);
  const AMBIENT_INT   = 0.55;

  /* ── Init ────────────────────────────────────── */
  function init() {
    const mount = document.getElementById('canvasMount');
    initPointerLock();

    if (!renderer) {
      const _mobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      // Shared arcade engine builds the renderer/scene/camera; we keep our own
      // resize() (also called externally), so autoResize is off.
      const g = ArcadeEngine.create3D({
        mount,
        antialias: !_mobile,
        pixelRatioCap: _mobile ? 1.5 : window.devicePixelRatio,
        clearColor: 0x000000,
        clearColorAlpha: 0.25,
        toneMapping: 'reinhard',
        exposure: 1.15,
        fov: 60, near: 0.1, far: 100,
        fog: { type: 'exp2', color: 0x090604, density: 0.0045 },
        autoResize: false,
      });
      renderer = g.renderer;
      if (!scene)  scene  = g.scene;
      if (!camera) camera = g.camera;
      window.addEventListener('resize', resize);
    }

    if (!scene) {
      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x090604, 0.0045);
    }

    if (!camera) {
      camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 100);
    }

    if (!ambientLight) {
      ambientLight = new THREE.AmbientLight(0x4a3828, AMBIENT_INT);
      scene.add(ambientLight);
    } else {
      ambientLight.intensity = AMBIENT_INT;
    }
    if (hemiLight)    { scene.remove(hemiLight);    hemiLight    = null; }


    resize();
  }

  function resize() {
    const mount = document.getElementById('canvasMount');
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    if (renderer) renderer.setSize(w, h);
    if (camera)   { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }

  function makeFlameCluster(radius = 0.12, coreColor = 0xff7a18, emberColor = 0xffc45a) {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.45, radius * 1.8, 7),
      new THREE.MeshBasicMaterial({ color: coreColor })
    );
    core.position.y = radius * 0.45;
    core.userData.baseScale = core.scale.clone();
    core.userData.baseY = core.position.y;
    group.add(core);

    const ember = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.28, radius * 1.1, 6),
      new THREE.MeshBasicMaterial({ color: emberColor })
    );
    ember.position.y = radius * 0.36;
    ember.userData.baseScale = ember.scale.clone();
    ember.userData.baseY = ember.position.y;
    group.add(ember);

    group.userData.isFlame = true;
    group.userData.baseY = group.position.y;
    group.userData.radius = radius;
    return group;
  }

  function animateFlame(flame, t, offset) {
    if (!flame) return;
    const radius = flame.userData.radius || 0.12;
    const pulse = Math.sin(t * 9.0 + offset) * 0.12 + Math.sin(t * 15.5 + offset * 0.7) * 0.06;
    const lean = Math.sin(t * 6.5 + offset) * radius * 0.18;

    const core = flame.children[0];
    if (core && core.userData.baseScale) {
      core.scale.set(
        core.userData.baseScale.x * (1.0 + pulse * 0.5),
        core.userData.baseScale.y * (1.0 + pulse * 0.9),
        core.userData.baseScale.z * (1.0 - pulse * 0.25)
      );
      core.position.x = lean;
      core.position.y = core.userData.baseY + pulse * radius * 0.45;
    }

    const ember = flame.children[1];
    if (ember && ember.userData.baseScale) {
      ember.scale.setScalar(1.0 + pulse * 0.35);
      ember.position.x = -lean * 0.45;
      ember.position.y = ember.userData.baseY - Math.max(0, pulse) * radius * 0.25;
    }
  }

  function buildWallSconce(x, y, z, rotationY, bracketMat, metalMat) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotationY;

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.14), bracketMat);
    arm.position.set(0, 0.03, -0.07);
    group.add(arm);

    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 0.12, 8, 1, true),
      metalMat
    );
    cup.position.y = -0.1;
    group.add(cup);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.018, 6, 16),
      metalMat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);

    [-0.13, 0, 0.13].forEach(px => {
      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.035), metalMat);
      tine.position.set(px, 0.16, 0);
      group.add(tine);
    });

    group.traverse(child => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });
    return group;
  }

  function buildTorchPiece(x, y, z, rotationY, flame, metalMat) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotationY;

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.055, 0.55, 6),
      new THREE.MeshLambertMaterial({ color: 0x3a1a05 })
    );
    handle.position.y = -0.22;
    group.add(handle);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.16, 0.08, 8),
      metalMat
    );
    collar.position.y = 0.03;
    group.add(collar);

    flame.position.set(0, 0.10, 0);
    group.add(flame);
    group.userData.homeY = y;
    group.userData.homeX = x;
    group.userData.homeZ = z;
    group.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return group;
  }

  function addPerimeterWalls(group, TILE, COLS, ROWS, height, wallMat) {
    const borderMat = wallMat.clone();
    borderMat.fog = false;
    const geo = new THREE.BoxGeometry(TILE, height, TILE);
    const seen = new Set();

    function addWall(col, row) {
      const key = `${col},${row}`;
      if (seen.has(key)) return;
      seen.add(key);

      const wall = new THREE.Mesh(geo, borderMat);
      wall.position.set(col * TILE + TILE / 2, height / 2, row * TILE + TILE / 2);
      wall.castShadow = false;
      wall.receiveShadow = true;
      wall.frustumCulled = false;
      group.add(wall);
    }

    for (let col = 0; col < COLS; col++) {
      addWall(col, 0);
      addWall(col, ROWS - 1);
    }
    for (let row = 1; row < ROWS - 1; row++) {
      addWall(0, row);
      addWall(COLS - 1, row);
    }
  }

  function configurePointTorch(light, baseIntensity, distance, shadowFar, castShadow = true) {
    light.intensity = baseIntensity;
    light.distance = distance;
    light.decay = 1;
    light.castShadow = castShadow;
    if (castShadow) {
      light.shadow.mapSize.set(256, 256);
      light.shadow.camera.near = 0.2;
      light.shadow.camera.far = shadowFar;
      light.shadow.bias = -0.004;
      light.shadow.radius = 2;
    }
    light.userData.baseIntensity = baseIntensity;
    light.userData.flameOffset = Math.random() * Math.PI * 2;
    return light;
  }

  function resetLanternLighting() {
    wallTorches.forEach(t => {
      if (t.light && t.light.parent) t.light.parent.remove(t.light);
      t.light = null;
    });
    lanternLights.forEach(l => { if (l.parent) l.parent.remove(l); });
    lanternLights = [];
    wallTorches = [];
    _torchGrid = null; _visibleTorchSet.clear();
    if (typeof SpatialManager !== 'undefined') SpatialManager.clear('lights');
    _lastWallTorchCount   = 0;
    _lastTorchFingerprint = 0;
    _lastLanternPx        = null;
    _lastLanternPz        = null;
    _cachedRoomId         = undefined;
    _scanRoomIds.clear();
  }

  function registerWallTorch(torchRecord) {
    const _torchIdx = wallTorches.length;
    wallTorches.push(torchRecord);
    if (typeof SpatialManager !== 'undefined') SpatialManager.insert('lights', _torchIdx, [torchRecord.x, torchRecord.z]);

    // Boss room gets red low-intensity torches; all others get standard warm orange
    const isBoss      = torchRecord.roomId === 'room_boss';
    const lightColor  = isBoss ? 0xff2200 : LANTERN_COLOR;
    const lightBase   = isBoss ? 4.5      : LANTERN_INTENSITY;

    // Pre-create the PointLight upfront so no shader recompilation happens during gameplay
    const light = new THREE.PointLight(lightColor, lightBase, LANTERN_RADIUS);
    light.decay = 1;
    light.castShadow = false;
    light.userData.baseIntensity = lightBase;
    light.userData.flameOffset   = Math.random() * Math.PI * 2;
    light.userData.flame         = torchRecord.flame;
    light.userData.torch         = torchRecord;
    light.position.set(torchRecord.x, torchRecord.torch.position.y + TORCH_FLAME_OFFSET.y, torchRecord.z);
    light.visible = true;   // always visible — intensity=0 silences it without shader recompile
    light.intensity = 0;
    light.userData.targetBase  = 0;
    light.userData.currentBase = 0;
    scene.add(light);
    torchRecord.light = light;
    lanternLights.push(light);
  }

  function activateWallTorchLight(torchRecord) {
    if (!torchRecord.light) return;
    torchRecord.light.userData.targetBase = torchRecord.light.userData.baseIntensity;
  }

  function deactivateWallTorchLight(torchRecord) {
    if (!torchRecord.light || torchRecord === carriedTorch) return;
    torchRecord.light.userData.targetBase = 0;
  }

  function setWallTorchBrightNow(torchRecord) {
    if (!torchRecord || !torchRecord.light) return;
    const intensity = torchRecord.light.userData.baseIntensity || 0;
    torchRecord.light.userData.targetBase  = intensity;
    torchRecord.light.userData.currentBase = intensity;
    torchRecord.light.intensity            = intensity;
    if (torchRecord.holder) torchRecord.holder.visible = true;
    if (torchRecord.torch)  torchRecord.torch.visible  = true;
  }

  function countDungeonTileInstances(dungeon, doorTx, doorTy) {
    const { grid, COLS, ROWS } = dungeon;
    const T = Dungeon.T;
    const counts = { wall: 0, floor: 0, corridor: 0, bossFloor: 0 };

    for (let row = 1; row < ROWS - 1; row++) {
      for (let col = 1; col < COLS - 1; col++) {
        const tile = grid[row][col];
        if (tile === T.WALL && col === doorTx && row === doorTy) {
          counts.corridor++;
        } else if (tile === T.WALL) {
          counts.wall++;
        } else if (tile === T.FLOOR) {
          counts.floor++;
        } else if (tile === T.CORRIDOR) {
          counts.corridor++;
        } else if (tile === T.BOSS_FLOOR) {
          counts.bossFloor++;
        }
      }
    }

    return counts;
  }

  function createInstanceBatch(geo, mat, count, castShadow, receiveShadow) {
    if (count <= 0) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.frustumCulled = false;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, hidden);
    mesh.instanceMatrix.needsUpdate = true;
    return { mesh, next: 0 };
  }

  function createDungeonInstanceBatches(dungeon, wallGeo, floorGeo, wallMat, floorMat, corridorMat, bossFloorMat, doorTx, doorTy) {
    const counts = countDungeonTileInstances(dungeon, doorTx, doorTy);
    return {
      wall: createInstanceBatch(wallGeo, wallMat, counts.wall, false, true),
      floor: createInstanceBatch(floorGeo, floorMat, counts.floor, false, true),
      corridor: createInstanceBatch(floorGeo, corridorMat, counts.corridor, false, true),
      bossFloor: createInstanceBatch(floorGeo, bossFloorMat, counts.bossFloor, false, true),
    };
  }

  function addInstance(batch, x, y, z) {
    if (!batch) return;
    const matrix = new THREE.Matrix4();
    matrix.setPosition(x, y, z);
    batch.mesh.setMatrixAt(batch.next, matrix);
    batch.next++;
  }

  function addDungeonInstanceBatches(group, batches) {
    Object.values(batches).forEach(batch => {
      if (!batch) return;
      batch.mesh.instanceMatrix.needsUpdate = true;
      group.add(batch.mesh);
    });
  }

  function torchFlameWorldPosition(x, y, z, rotationY) {
    const offset = TORCH_FLAME_OFFSET.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
    return { x: x + offset.x, y: y + offset.y, z: z + offset.z };
  }

  /* ── Build dungeon geometry ──────────────────── */
 function buildDungeon(dungeon) {
    if (dungeonGroup) scene.remove(dungeonGroup);
    resetLanternLighting();
    carryingTorch = false;
    carriedTorch = null;
    if (doorMesh)  { scene.remove(doorMesh);  doorMesh  = null; doorOpen = false; }
    if (portalMesh){ scene.remove(portalMesh); portalMesh = null; }

    dungeonGroup = new THREE.Group();
    const { TILE, WALL_H, grid, COLS, ROWS } = dungeon;
    _cameraDungeon = dungeon;
    if (typeof RoomManager !== 'undefined') RoomManager.init(dungeon);
    _buildTileRoomIndex(dungeon);
    const T = Dungeon.T;

    // Store door tile position so we can skip rendering a wall there
    const doorTx = dungeon.bossEntrance ? dungeon.bossEntrance.wallTx : -1;
    const doorTy = dungeon.bossEntrance ? dungeon.bossEntrance.wallTy : -1;

    if (!_cachedBrickTex) { _cachedBrickTex = makeBrickTexture(); _cachedBrickTex.wrapS = _cachedBrickTex.wrapT = THREE.RepeatWrapping; }
    if (!_cachedFloorTex) { _cachedFloorTex = makeFloorTexture(); _cachedFloorTex.wrapS = _cachedFloorTex.wrapT = THREE.RepeatWrapping; }
    if (!_cachedBossFloorTex) { _cachedBossFloorTex = makeBossFloorTexture(); _cachedBossFloorTex.wrapS = _cachedBossFloorTex.wrapT = THREE.RepeatWrapping; }
    const wallMat      = new THREE.MeshLambertMaterial({ map: _cachedBrickTex,    color: 0x8a6a4a });
    const floorMat     = new THREE.MeshLambertMaterial({ color: 0x6a5a48, map: _cachedFloorTex });
    const corridorMat  = new THREE.MeshLambertMaterial({ color: 0x4a3a2a, map: _cachedFloorTex });
    const bossFloorMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a, map: _cachedBossFloorTex });

    const BORDER_H      = 14;
    const wallGeo       = new THREE.BoxGeometry(TILE, WALL_H,   TILE);
    const floorGeo      = new THREE.BoxGeometry(TILE, 0.25,     TILE);
    _dungeonBounds = { minX: TILE, maxX: (COLS - 1) * TILE, minZ: TILE, maxZ: (ROWS - 1) * TILE };
    addPerimeterWalls(dungeonGroup, TILE, COLS, ROWS, BORDER_H, wallMat);
    const tileInstances = createDungeonInstanceBatches(
      dungeon, wallGeo, floorGeo, wallMat, floorMat, corridorMat, bossFloorMat, doorTx, doorTy
    );

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const wx   = col * TILE + TILE / 2;
        const wz   = row * TILE + TILE / 2;
        const tile = grid[row][col];
        if (row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1) continue;

        if (tile === T.WALL && col === doorTx && row === doorTy) {
          addInstance(tileInstances.corridor, wx, -0.1, wz);
          continue;
        }
        if      (tile === T.WALL)       addInstance(tileInstances.wall,      wx, WALL_H / 2, wz);
        else if (tile === T.FLOOR)      addInstance(tileInstances.floor,     wx, -0.1,       wz);
        else if (tile === T.CORRIDOR)   addInstance(tileInstances.corridor,  wx, -0.1,       wz);
        else if (tile === T.BOSS_FLOOR) addInstance(tileInstances.bossFloor, wx, -0.1,       wz);
      }
    }
    addDungeonInstanceBatches(dungeonGroup, tileInstances);

    scene.add(dungeonGroup);

    // ── Lanterns ────────────────────────────────
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0x241004, roughness: 0.72, metalness: 0.35 });
    const bracketMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });

    for (const lan of dungeon.lanterns) {
      const gx = lan.x, gy = lan.y;

      if (grid[gy][gx] !== T.WALL) continue;

      const wx = gx * TILE + TILE / 2;
      const wz = gy * TILE + TILE / 2;

      let wallDirection = null, offsetX = 0, offsetZ = 0, rotationY = 0;

      // Offset places lantern just OUTSIDE the wall face so it's visible
      const LO = TILE / 2 + 0.1;
      if      (gy > 0      && grid[gy-1][gx] !== T.WALL) { wallDirection='north'; offsetZ=-LO; rotationY=0; }
      else if (gy < ROWS-1 && grid[gy+1][gx] !== T.WALL) { wallDirection='south'; offsetZ= LO; rotationY=Math.PI; }
      else if (gx > 0      && grid[gy][gx-1] !== T.WALL) { wallDirection='west';  offsetX=-LO; rotationY=Math.PI/2; }
      else if (gx < COLS-1 && grid[gy][gx+1] !== T.WALL) { wallDirection='east';  offsetX= LO; rotationY=-Math.PI/2; }

      if (!wallDirection) continue;

      const lx = wx + offsetX;
      const lz = wz + offsetZ;

      const sconce = buildWallSconce(lx, WALL_H*0.44, lz, rotationY, bracketMat, lanternMat);
      sconce.visible = false;
      dungeonGroup.add(sconce);

      const _rid   = (typeof RoomManager !== 'undefined' ? RoomManager.getRoomIdAtGrid(gx, gy) : null) ?? `room_${lan.roomIndex ?? -1}`;
      const _boss  = _rid === 'room_boss';
      const flame  = makeFlameCluster(0.13, _boss ? 0xcc1100 : 0xff7a18, _boss ? 0xff4422 : 0xffc45a);
      const torchPiece = buildTorchPiece(lx, WALL_H*0.46, lz, rotationY, flame, lanternMat);
      torchPiece.visible = false;
      dungeonGroup.add(torchPiece);

      const torchRecord = { x: lx, z: lz, gridX: gx, gridY: gy, roomId: _rid, holder: sconce, torch: torchPiece, flame, light: null, hasTorch: true };
      registerWallTorch(torchRecord);
    }

    // ── Boss door ────────────────────────────────
    buildBossDoor(dungeon);

    // ── Chests ──────────────────────────────────
    buildChests(dungeon);
  }

  /* ── Chunked dungeon builder ────────────────────────────────────────────
     Builds tile rows in two phases:
       Phase 1 — rows within SPAWN_BAND of the start room  → onSpawnReady()
       Phase 2 — all remaining rows                        → onComplete()
     setTimeout(0) between every CHUNK rows keeps the main thread free.
  ──────────────────────────────────────────────────────────────────────── */
  function buildDungeonChunked(dungeon, onSpawnReady, onComplete) {
    if (dungeonGroup) scene.remove(dungeonGroup);
    resetLanternLighting();
    carryingTorch = false;
    carriedTorch = null;
    if (doorMesh)  { scene.remove(doorMesh);  doorMesh  = null; doorOpen = false; }
    if (portalMesh){ scene.remove(portalMesh); portalMesh = null; }

    dungeonGroup = new THREE.Group();
    scene.add(dungeonGroup);

    const { TILE, WALL_H, grid, COLS, ROWS } = dungeon;
    _cameraDungeon = dungeon;
    if (typeof RoomManager !== 'undefined') RoomManager.init(dungeon);
    _buildTileRoomIndex(dungeon);
    const T = Dungeon.T;

    const doorTx = dungeon.bossEntrance ? dungeon.bossEntrance.wallTx : -1;
    const doorTy = dungeon.bossEntrance ? dungeon.bossEntrance.wallTy : -1;

    if (!_cachedBrickTex) {
      _cachedBrickTex = makeBrickTexture();
      _cachedBrickTex.wrapS = _cachedBrickTex.wrapT = THREE.RepeatWrapping;
    }
    if (!_cachedFloorTex) {
      _cachedFloorTex = makeFloorTexture();
      _cachedFloorTex.wrapS = _cachedFloorTex.wrapT = THREE.RepeatWrapping;
    }
    if (!_cachedBossFloorTex) {
      _cachedBossFloorTex = makeBossFloorTexture();
      _cachedBossFloorTex.wrapS = _cachedBossFloorTex.wrapT = THREE.RepeatWrapping;
    }
    const wallMat      = new THREE.MeshLambertMaterial({ map: _cachedBrickTex, color: 0x8a6a4a });
    const floorMat     = new THREE.MeshLambertMaterial({ color: 0x6a5a48, map: _cachedFloorTex });
    const corridorMat  = new THREE.MeshLambertMaterial({ color: 0x4a3a2a, map: _cachedFloorTex });
    const bossFloorMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a, map: _cachedBossFloorTex });
    const BORDER_H      = 14;
    const wallGeo       = new THREE.BoxGeometry(TILE, WALL_H,   TILE);
    const floorGeo      = new THREE.BoxGeometry(TILE, 0.25,     TILE);
    _dungeonBounds = { minX: TILE, maxX: (COLS - 1) * TILE, minZ: TILE, maxZ: (ROWS - 1) * TILE };
    addPerimeterWalls(dungeonGroup, TILE, COLS, ROWS, BORDER_H, wallMat);
    const tileInstances = createDungeonInstanceBatches(
      dungeon, wallGeo, floorGeo, wallMat, floorMat, corridorMat, bossFloorMat, doorTx, doorTy
    );
    addDungeonInstanceBatches(dungeonGroup, tileInstances);

    function buildRow(r) {
      for (let col = 0; col < COLS; col++) {
        const wx = col * TILE + TILE / 2, wz = r * TILE + TILE / 2;
        const tile = grid[r][col];
        if (r === 0 || r === ROWS - 1 || col === 0 || col === COLS - 1) continue;
        if (tile === T.WALL && col === doorTx && r === doorTy) {
          addInstance(tileInstances.corridor, wx, -0.1, wz);
          continue;
        }
        if (tile === T.WALL) {
          addInstance(tileInstances.wall, wx, WALL_H / 2, wz);
        } else if (tile === T.FLOOR) {
          addInstance(tileInstances.floor, wx, -0.1, wz);
        } else if (tile === T.CORRIDOR) {
          addInstance(tileInstances.corridor, wx, -0.1, wz);
        } else if (tile === T.BOSS_FLOOR) {
          addInstance(tileInstances.bossFloor, wx, -0.1, wz);
        }
      }
      Object.values(tileInstances).forEach(batch => {
        if (batch) batch.mesh.instanceMatrix.needsUpdate = true;
      });
    }

    // Phase 1: rows around spawn (player sees these first) — small chunks, fast
    // Phase 2: remaining rows — idle-time only so gameplay isn't interrupted
    const sc      = dungeon.roomCenter(dungeon.startRoom);
    const BAND    = 10;
    const v0      = Math.max(0, sc.cy - BAND);
    const v1      = Math.min(ROWS, sc.cy + BAND);
    const CHUNK1  = 8;  // phase 1 — spawn area, built before reveal
    const CHUNK2  = 4;  // phase 2 — background rows, still idle-time only

    // Use requestIdleCallback for background work when available
    const _idle = typeof requestIdleCallback === 'function'
      ? (fn) => requestIdleCallback(fn, { timeout: 200 })
      : (fn) => setTimeout(fn, 0);

    const phases = [
      [v0, v1,  onSpawnReady, CHUNK1, false],
      [0,  v0,  null,         CHUNK2, true ],
      [v1, ROWS, null,        CHUNK2, true ],
    ].filter(([a, b]) => a < b);

    let phaseIdx = 0;
    let curRow   = phases[0][0];

    function runChunk() {
      const [, pEnd, pCb, chunk, useIdle] = phases[phaseIdx];
      const end = Math.min(curRow + chunk, pEnd);
      for (let r = curRow; r < end; r++) buildRow(r);
      curRow = end;

      if (curRow < pEnd) {
        useIdle ? _idle(runChunk) : setTimeout(runChunk, 0);
      } else {
        if (pCb) pCb();
        phaseIdx++;
        if (phaseIdx < phases.length) {
          curRow = phases[phaseIdx][0];
          const nextIdle = phases[phaseIdx][4];
          nextIdle ? _idle(runChunk) : setTimeout(runChunk, 0);
        } else {
          buildLanternsChunked();
        }
      }
    }

    function buildLanternsChunked() {
      _buildTileRoomIndex(dungeon);
      const lanternMat = new THREE.MeshStandardMaterial({ color: 0x241004, roughness: 0.72, metalness: 0.35 });
      const bracketMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
      const LO         = TILE / 2 + 0.1;
      const lanterns   = dungeon.lanterns || [];
      const LCHUNK     = 8; // build lanterns in larger idle batches
      let li           = 0;
      const startCenter = dungeon.startRoom ? dungeon.roomCenter(dungeon.startRoom) : null;
      const startWorld  = startCenter ? dungeon.toWorld(startCenter.cx, startCenter.cy) : null;
      const startBrightSq = LANTERN_RADIUS * LANTERN_RADIUS;

      function buildLanternChunk() {
        const end = Math.min(li + LCHUNK, lanterns.length);
        for (; li < end; li++) {
          const lan = lanterns[li];
          const gx = lan.x, gy = lan.y;
          if (grid[gy][gx] !== T.WALL) continue;
          const wx = gx * TILE + TILE / 2, wz = gy * TILE + TILE / 2;
          let dir = null, ox = 0, oz = 0, ry = 0;
          if      (gy > 0      && grid[gy-1][gx] !== T.WALL) { dir='n'; oz=-LO; ry=0; }
          else if (gy < ROWS-1 && grid[gy+1][gx] !== T.WALL) { dir='s'; oz= LO; ry=Math.PI; }
          else if (gx > 0      && grid[gy][gx-1] !== T.WALL) { dir='w'; ox=-LO; ry=Math.PI/2; }
          else if (gx < COLS-1 && grid[gy][gx+1] !== T.WALL) { dir='e'; ox= LO; ry=-Math.PI/2; }
          if (!dir) continue;
          const lx = wx + ox, lz = wz + oz;
          const sconce = buildWallSconce(lx, WALL_H*0.44, lz, ry, bracketMat, lanternMat);
          sconce.visible = false;
          dungeonGroup.add(sconce);
          const _rid  = (typeof RoomManager !== 'undefined' ? RoomManager.getRoomIdAtGrid(gx, gy) : null) ?? `room_${lan.roomIndex ?? -1}`;
          const _boss = _rid === 'room_boss';
          const flame = makeFlameCluster(0.13, _boss ? 0xcc1100 : 0xff7a18, _boss ? 0xff4422 : 0xffc45a);
          const torchPiece = buildTorchPiece(lx, WALL_H*0.46, lz, ry, flame, lanternMat);
          torchPiece.visible = false;
          dungeonGroup.add(torchPiece);
          const torchRecord = { x: lx, z: lz, gridX: gx, gridY: gy, roomId: _rid, holder: sconce, torch: torchPiece, flame, light: null, hasTorch: true };
          registerWallTorch(torchRecord);
          if (startWorld) {
            const dx = lx - startWorld.x;
            const dz = lz - startWorld.z;
            if (dx * dx + dz * dz <= startBrightSq) setWallTorchBrightNow(torchRecord);
          }
        }
        if (li < lanterns.length) {
          _idle(buildLanternChunk);
        } else {
          buildBossDoor(dungeon);
          buildChests(dungeon);
          if (onComplete) onComplete(); // onComplete fires AFTER all lanterns registered
        }
      }
      _idle(buildLanternChunk);
    }

    runChunk();
  }

  /* ── Boss room door ──────────────────────────── */
  // Door sits in the WALL tile just outside the entrance opening,
  // oriented so it fills the gap and blocks passage until opened via E.
  function buildBossDoor(dungeon) {
    const { bossEntrance, TILE, WALL_H } = dungeon;
    if (!bossEntrance) return;

    const wx   = bossEntrance.wallTx * TILE + TILE / 2;
    const wz   = bossEntrance.wallTy * TILE + TILE / 2;
    const side = bossEntrance.side;

    const doorGroup  = new THREE.Group();
    doorGroup.position.set(wx, 0, wz);

    const pivotGroup = new THREE.Group();
    const hingeOffset = TILE / 2 - 0.1;
    pivotGroup.position.set(-hingeOffset, 0, 0);
    doorGroup.add(pivotGroup);

    const doorW = TILE - 0.15;
    const doorH = WALL_H - 0.1;
    const doorD = 0.18;

    const plankMat = new THREE.MeshLambertMaterial({ color: 0x2c1200 });
    const plankGeo = new THREE.BoxGeometry(doorW, doorH, doorD);
    const plank    = new THREE.Mesh(plankGeo, plankMat);
    plank.position.set(doorW / 2, doorH / 2, 0);
    plank.castShadow = true;
    pivotGroup.add(plank);

    const barMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.9, roughness: 0.2 });
    [doorH * 0.25, doorH * 0.5, doorH * 0.75].forEach(barY => {
      const barGeo = new THREE.BoxGeometry(doorW - 0.2, 0.08, doorD + 0.02);
      const bar    = new THREE.Mesh(barGeo, barMat);
      bar.position.set(doorW / 2, barY, 0);
      pivotGroup.add(bar);
    });

    const braceGeo = new THREE.BoxGeometry(0.08, doorH, doorD + 0.02);
    const brace    = new THREE.Mesh(braceGeo, barMat);
    brace.position.set(doorW / 2, doorH / 2, 0);
    pivotGroup.add(brace);

    const studMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 1.0, roughness: 0.1 });
    [[0.3, doorH * 0.25], [doorW - 0.3, doorH * 0.25],
     [0.3, doorH * 0.75], [doorW - 0.3, doorH * 0.75]].forEach(([sx, sy]) => {
      const studGeo = new THREE.SphereGeometry(0.06, 6, 5);
      const stud    = new THREE.Mesh(studGeo, studMat);
      stud.position.set(sx, sy, doorD / 2 + 0.01);
      pivotGroup.add(stud);
    });

    const skullGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const skullMat = new THREE.MeshLambertMaterial({ color: 0xddccaa });
    const skull    = new THREE.Mesh(skullGeo, skullMat);
    skull.position.set(doorW / 2, doorH * 0.82, doorD / 2 + 0.01);
    skull.scale.set(1, 1.15, 0.85);
    pivotGroup.add(skull);

    const doorLight = new THREE.PointLight(0x990000, 1.2, 8);
    doorLight.decay = 2;
    doorLight.castShadow = true;
    doorLight.shadow.mapSize.set(128, 128);
    doorLight.shadow.camera.near = 0.2;
    doorLight.shadow.camera.far = 8;
    doorLight.position.set(doorW / 2, doorH * 0.6, 0.3);
    pivotGroup.add(doorLight);

    doorGroup.rotation.y = (side === 'east' || side === 'west') ? Math.PI / 2 : 0;

    doorGroup.userData.isDoor      = true;
    doorGroup.userData.side        = side;
    doorGroup.userData.pivotGroup  = pivotGroup;
    doorGroup.userData.openAngle   = 0;
    doorGroup.userData.targetAngle = 0;

    scene.add(doorGroup);
    doorMesh = doorGroup;
    doorOpen = false;
  }

  function openBossDoor(dungeon) {
    if (!doorMesh || doorOpen) return;
    doorOpen = true;
    const side = dungeon.bossEntrance.side;
    doorMesh.userData.targetAngle = (side === 'south' || side === 'east') ? -Math.PI / 2 : Math.PI / 2;
    const { wallTx, wallTy } = dungeon.bossEntrance;
    if (wallTx >= 0 && wallTx < dungeon.COLS && wallTy >= 0 && wallTy < dungeon.ROWS) {
      dungeon.grid[wallTy][wallTx] = Dungeon.T.CORRIDOR;
    }
  }

  function updateDoor(dt) {
    if (!doorMesh) return;
    const d = doorMesh.userData;
    if (Math.abs(d.openAngle - d.targetAngle) > 0.001) {
      d.openAngle += (d.targetAngle - d.openAngle) * Math.min(dt * 2.5, 1);
      d.pivotGroup.rotation.y = d.openAngle;
    }
  }

  function updateDoorPrompt(player, dungeon, doorOpened) {
    const el = document.getElementById('doorPrompt');
    if (!el) return;
    if (doorOpened || !dungeon.bossEntrance) { el.style.opacity = '0'; return; }
    const wx = dungeon.bossEntrance.wallTx * dungeon.TILE + dungeon.TILE / 2;
    const wz = dungeon.bossEntrance.wallTy * dungeon.TILE + dungeon.TILE / 2;
    const dx = player.x - wx, dz = player.z - wz;
    el.style.opacity = (dx*dx + dz*dz) < (dungeon.TILE * 2.5) ** 2 ? '1' : '0';
  }
  /* ── Stairs (only built after boss dies) ─────── */
  function buildStairs(dungeon) {
  

    const bc  = dungeon.roomCenter(dungeon.bossRoom);
    const w   = dungeon.toWorld(bc.cx, bc.cy);
    const grp = new THREE.Group();

    // Floor portal — player sinks into this
    const discGeo  = new THREE.CircleGeometry(1.3, 32);
    const discMat  = new THREE.MeshBasicMaterial({ color: 0x6611cc, side: THREE.DoubleSide });
    const disc     = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.04;
    disc.userData.isPortalDisc = true;
    grp.add(disc);

    // Bright inner glow
    const innerGeo = new THREE.CircleGeometry(0.75, 24);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xcc88ff, side: THREE.DoubleSide });
    const inner    = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.05;
    inner.userData.isPortalDisc = true;
    grp.add(inner);

    // Outer spinning ring
    const ringGeo = new THREE.TorusGeometry(1.3, 0.1, 8, 36);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xaa66ff });
    const ring    = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    ring.userData.isPortalRing = true;
    grp.add(ring);

    // Inner counter-spinning ring
    const ring2Geo = new THREE.TorusGeometry(0.75, 0.07, 8, 28);
    const ring2    = new THREE.Mesh(ring2Geo, new THREE.MeshBasicMaterial({ color: 0x8833ee }));
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.1;
    ring2.userData.isPortalRing = true;
    grp.add(ring2);

    // Rising mist columns
    for (let i = 0; i < 6; i++) {
      const angle  = (i / 6) * Math.PI * 2;
      const mistGeo = new THREE.CylinderGeometry(0.06, 0.14, 1.4, 5);
      const mistMat = new THREE.MeshBasicMaterial({ color: 0x9955ff, transparent: true, opacity: 0.35 });
      const mist    = new THREE.Mesh(mistGeo, mistMat);
      mist.position.set(Math.cos(angle) * 0.9, 0.7, Math.sin(angle) * 0.9);
      grp.add(mist);
    }

    // Purple glow light
    const light = new THREE.PointLight(0x7722ff, 4.0, 16);
    light.decay = 2;
    light.castShadow = true;
    light.shadow.mapSize.set(128, 128);
    light.shadow.camera.near = 0.2;
    light.shadow.camera.far = 16;
    light.position.y = 1.0;
    grp.add(light);

    grp.position.set(w.x, -5, w.z);
    grp.userData.isStairs = true;
    scene.add(grp);
    portalMesh = grp;
  }

  /* ── Stair descent animation ─────────────────── */
  function startStairDescent(player, dungeon, onComplete) {
    if (stairDescending) return;
    stairDescending      = true;
    stairDescentTime     = 0;
    stairDescentDone     = false;
    stairDescentPhase    = 'walk';
    stairDescentCallback = onComplete;
    // Snap player to portal center so sinking looks centered
    if (dungeon.bossRoom) {
      const bc = dungeon.roomCenter(dungeon.bossRoom);
      const w  = dungeon.toWorld(bc.cx, bc.cy);
      stairDescentOrigin = { x: player.x, z: player.z };
      stairDescentTarget = { x: w.x, z: w.z };
    } else {
      stairDescentOrigin = { x: player.x, z: player.z };
      stairDescentTarget = { x: player.x, z: player.z };
    }
  }

  function tickStairDescent(player, dt) {
    if (!stairDescending || stairDescentDone) return;
    const WALK_DURATION = 0.75;
    const SINK_DURATION = 1.15;
    const duration = stairDescentPhase === 'walk' ? WALK_DURATION : SINK_DURATION;
    stairDescentTime = Math.min(stairDescentTime + dt, duration);
    const t = stairDescentTime / duration;

    if (stairDescentPhase === 'walk') {
      const walk = 1 - Math.pow(1 - t, 3);
      player._moving = true;
      player._descentY = 0;
      player.x = stairDescentOrigin.x + (stairDescentTarget.x - stairDescentOrigin.x) * walk;
      player.z = stairDescentOrigin.z + (stairDescentTarget.z - stairDescentOrigin.z) * walk;
      if (stairDescentTime >= WALK_DURATION) {
        stairDescentPhase = 'sink';
        stairDescentTime = 0;
        player.x = stairDescentTarget.x;
        player.z = stairDescentTarget.z;
        player._moving = false;
      }
    } else {
      const sink = t * t;
      player._descentY = -sink * 2.9;
      player.x = stairDescentTarget.x;
      player.z = stairDescentTarget.z;
    }

    // Overlay only blacks out in the final 30% to hide the teleport seam
    const overlay = document.getElementById('stairOverlay');
    if (overlay) {
      overlay.style.opacity = stairDescentPhase === 'sink' && t > 0.62
        ? String(Math.min(1, (t - 0.62) / 0.38))
        : '0';
    }

    if (stairDescentPhase === 'sink' && stairDescentTime >= SINK_DURATION) {
      stairDescentDone = true;
      stairDescending  = false;
      stairDescentPhase = 'walk';
      if (stairDescentCallback) stairDescentCallback();
    }
  }

  /* ── Chests ──────────────────────────────────── */
  function buildChests(dungeon) {
    chestMeshes.forEach(m => scene.remove(m));
    chestMeshes = []; _chestGrid = null; _visibleChestSet.clear();
    const chestBodyGeo = new THREE.BoxGeometry(0.7, 0.45, 0.55);
    const chestMat     = new THREE.MeshLambertMaterial({ color: 0x7a4810 });
    const chestLidGeo  = new THREE.BoxGeometry(0.7, 0.20, 0.55);
    const lidMat       = new THREE.MeshLambertMaterial({ color: 0x5a3008 });
    const bandMat      = new THREE.MeshStandardMaterial({ color: 0xb87820, metalness: 0.8, roughness: 0.3 });
    const bandGeo      = new THREE.BoxGeometry(0.72, 0.06, 0.57);
    
    for (const chest of dungeon.chests) {
      const w  = dungeon.toWorld(chest.gx, chest.gy);
      const grp = new THREE.Group();

      const body = new THREE.Mesh(chestBodyGeo, chestMat);
      body.position.y = 0.225;
      body.castShadow = true;
      grp.add(body);

      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(0, 0.25, 0);
      grp.add(band);

      // Lid as direct child — we animate its rotation.x
      // Pivot point is at the back top edge of the body.
      // We position the lid group at the hinge point.
      const lidGroup = new THREE.Group();
      lidGroup.position.set(0, 0.45, 0.275);  // back top edge of chest body
      const lid = new THREE.Mesh(chestLidGeo, lidMat);
      lid.position.set(0, 0, -0.275);          // lid hangs forward from hinge
      lid.castShadow = true;
      lidGroup.add(lid);
      grp.add(lidGroup);

      // Lock
      const lockGeo = new THREE.BoxGeometry(0.12, 0.12, 0.06);
      const lockMat = new THREE.MeshStandardMaterial({ color: 0xd4a010, metalness: 0.9, roughness: 0.2 });
      const lock    = new THREE.Mesh(lockGeo, lockMat);
      lock.position.set(0, 0.3, -0.28);
      grp.add(lock);

      // Resolve StaticItemManager slot so game.js can map spatial query → mesh
      const _simIdx = (typeof StaticItemManager !== 'undefined')
        ? StaticItemManager.indexOf(`${StaticItemManager.TYPES.chest}_${chest.gx}_${chest.gy}`)
        : -1;
      grp.position.set(w.x, 0, w.z);
      grp.userData.chestData      = chest;
      grp.userData.staticItemIdx  = _simIdx;
      grp.userData.lidGroup       = lidGroup;
      grp.userData.lidOpen        = 0;
      grp.userData.isOpening      = false;
      grp.visible = false; // proximity system reveals when player is close enough
      scene.add(grp);
      chestMeshes.push(grp);
    }
  }

function updateChests(dt) {
  for (const g of chestMeshes) {
    if (!g.userData.isOpening) continue;
    // Lid waits until arms are fully extended (~50% through animation)
    const lidStart = chestInteractAnim ? chestInteractAnim.duration * 0.50 : 0;
    if (chestInteractAnim && chestInteractAnim.t < lidStart) continue;
    g.userData.lidOpenT = Math.min((g.userData.lidOpenT || 0) + dt * 1.6, 1);
    const t    = g.userData.lidOpenT;
    const ease = 1 - Math.pow(1 - t, 3);
    const lg   = g.userData.lidGroup;
    if (lg) lg.rotation.x = -ease * (Math.PI * 0.85);
    if (t >= 1) g.userData.isOpening = false;
  }
}
  /* ── Proximity prompts ───────────────────────── */
  function updateChestPrompt(player) {
    const el = document.getElementById('chestPrompt');
    if (!el) return;
    if (!_chestGrid) _chestGrid = _buildGrid(chestMeshes, m => m.position.x, m => m.position.z);
    const candidates = _chestGrid ? _gridQuery(_chestGrid, player.x, player.z, 2.5) : chestMeshes.map((_, i) => i);
    let near = false;
    for (const i of candidates) {
      const g = chestMeshes[i];
      if (g.userData.chestData.opened) continue;
      const dx = player.x - g.position.x, dz = player.z - g.position.z;
      if (dx*dx + dz*dz < 6.25) { near = true; break; }
    }
    el.style.opacity = near ? '1' : '0';
  }

  function nearbyWallTorch(player) {
    if (!_torchGrid) _torchGrid = _buildGrid(wallTorches, t => t.x, t => t.z);
    const candidates = _torchGrid ? _gridQuery(_torchGrid, player.x, player.z, 2.5) : wallTorches.map((_, i) => i);
    let best = null, bestD = Infinity;
    for (const i of candidates) {
      const t = wallTorches[i];
      const dx = player.x - t.x, dz = player.z - t.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < 6.25 && dSq < bestD) { best = t; bestD = dSq; }
    }
    return best;
  }

  function startTorchInteractionAnim(t, mode, player) {
    const awayX = player ? (player.x - t.x) * 0.08 : 0;
    const awayZ = player ? (player.z - t.z) * 0.08 : 0;
    t.torch.visible = true;
    t.torch.userData.anim = {
      mode,
      t: 0,
      duration: 0.65,
      lift: 0.42,
      awayX: Math.max(-0.35, Math.min(0.35, awayX)),
      awayZ: Math.max(-0.35, Math.min(0.35, awayZ)),
      done: false,
    };
    torchInteractAnim = { t: 0, duration: 0.65, mode };
  }

  function toggleNearbyWallTorch(player) {
    const t = nearbyWallTorch(player);
    if (!t) return null;
    if (torchInteractAnim !== null) return null;   // cooldown: wait for pick/place anim to finish

    if (carryingTorch) {
      if (t.hasTorch) return null;
      const held = carriedTorch;
      carryingTorch = false;
      carriedTorch = null;
      if (held) {
        held.torch.visible = false;
        deactivateWallTorchLight(held);
      }
      t.hasTorch = true;
      t.torch.visible = true;
      startTorchInteractionAnim(t, 'place', player);
        _lastTorchFingerprint = 0;
      return 'placed';
    }

    if (!t.hasTorch) return null;
    carryingTorch = true;
    carriedTorch = t;
    t.hasTorch = false;
    startTorchInteractionAnim(t, 'pick', player);
    activateWallTorchLight(t);
    _lastTorchFingerprint = 0;
    return 'picked';
  }

  function updateTorchPrompt(player) {
    const el = document.getElementById('torchPrompt');
    if (!el) return;
    const t = nearbyWallTorch(player);
    if (!t) { el.style.opacity = '0'; return; }
    if (carryingTorch && !t.hasTorch) {
      el.textContent = 'Press E to place torch';
      el.style.opacity = '1';
      return;
    }
    if (!carryingTorch && t.hasTorch) {
      el.textContent = 'Press E to take torch';
      el.style.opacity = '1';
      return;
    }
    el.style.opacity = '0';
  }

  function updateStairPrompt(player, exitOpen, dungeon) {
    const el = document.getElementById('stairPrompt');
    if (!el) return;
    if (!exitOpen || !portalMesh || !dungeon.bossRoom) { el.style.opacity = '0'; return; }
    const bc = dungeon.roomCenter(dungeon.bossRoom);
    const w  = dungeon.toWorld(bc.cx, bc.cy);
    const dx = player.x - w.x, dz = player.z - w.z;
    el.style.opacity = (dx*dx + dz*dz) < (dungeon.TILE * 2.5) ** 2 ? '1' : '0';
  }

  /* ── Rarity → armor color ───────────────────── */
  function rarityArmorColor(rarity) {
    switch (rarity) {
      case 'uncommon': return 0xa0a8b0;
      case 'rare':     return 0x4477aa;
      case 'epic':     return 0x8a6010;
      default:         return 0x707080; // common
    }
  }

  /* ── Weapon mesh inside a group ─────────────── */
  function buildWeaponMesh(wg, player) {
    while (wg.children.length) wg.remove(wg.children[0]);
    const w = player && player.inventory
      ? player.inventory.find(i => i.type === 'weapon' && i.equipped)
      : null;
    if (!w) return;

    const RARITY_BLADE = { common: 0x999999, uncommon: 0x55cc55, rare: 0x4488ff, epic: 0xcc44ff };
    const bladeMat  = new THREE.MeshStandardMaterial({ color: RARITY_BLADE[w.rarity] || 0x999999, metalness: 0.9, roughness: 0.1 });
    const guardMat  = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 });
    const handleMat = new THREE.MeshLambertMaterial({ color: 0x5a3a20 });
    const darkMat   = new THREE.MeshStandardMaterial({ color: 0x2a2520, metalness: 0.85, roughness: 0.35 });
    const fireMat   = new THREE.MeshBasicMaterial({ color: 0xff5a18 });
    const boneMat   = new THREE.MeshLambertMaterial({ color: 0xd8c89a });

    // wg origin = wrist/hand; weapon extends downward in local -Y
    const name = (w.name || '').toLowerCase();

    function addGrip(len = 0.24, y = -0.12, r = 0.04) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), handleMat);
      h.position.set(0, y, 0);
      wg.add(h);
      return h;
    }

    function addGuard(width = 0.22, y = -0.25) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(width, 0.055, 0.07), guardMat);
      g.position.set(0, y, 0);
      wg.add(g);
      return g;
    }

    if (name.includes('dagger')) {
      addGrip(0.16, -0.08, 0.035);
      addGuard(0.14, -0.18);
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.32, 4), bladeMat);
      blade.position.set(0, -0.38, 0);
      blade.rotation.z = Math.PI;
      wg.add(blade);
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 7, 5), darkMat);
      pommel.position.set(0, 0.02, 0);
      wg.add(pommel);
    } else if (name.includes('rapier')) {
      addGrip(0.20, -0.10, 0.03);
      const basket = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 6, 18), guardMat);
      basket.position.set(0, -0.22, 0);
      basket.rotation.x = Math.PI / 2;
      wg.add(basket);
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.82, 6), bladeMat);
      blade.position.set(0, -0.66, 0);
      wg.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.12, 6), bladeMat);
      tip.position.set(0, -1.13, 0);
      tip.rotation.z = Math.PI;
      wg.add(tip);
      const quillon = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.025, 0.04), guardMat);
      quillon.position.set(0, -0.25, 0);
      wg.add(quillon);
    } else if (name.includes('spear')) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.05, 7), handleMat);
      shaft.position.set(0, -0.52, 0);
      wg.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 7), boneMat);
      head.position.set(0, -1.16, 0);
      head.rotation.z = Math.PI;
      wg.add(head);
      const lashing = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 5, 10), guardMat);
      lashing.position.set(0, -1.02, 0);
      lashing.rotation.x = Math.PI / 2;
      wg.add(lashing);
    } else if (name.includes('hammer')) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 6), handleMat);
      shaft.position.set(0, -0.31, 0);
      wg.add(shaft);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.18), darkMat);
      head.position.set(0, -0.68, 0);
      wg.add(head);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.2), guardMat);
      cap.position.set(0, -0.68, 0);
      wg.add(cap);
      [-1, 1].forEach(s => {
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.045, 8), guardMat);
        face.position.set(s * 0.22, -0.68, 0);
        face.rotation.z = Math.PI / 2;
        wg.add(face);
      });
    } else if (name.includes('flail')) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.46, 6), handleMat);
      shaft.position.set(0, -0.23, 0);
      wg.add(shaft);
      for (let i = 0; i < 3; i++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 5, 10), darkMat);
        link.position.set(0, -0.50 - i * 0.075, 0);
        link.rotation.x = i % 2 ? Math.PI / 2 : 0;
        wg.add(link);
      }
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), darkMat);
      ball.position.set(0, -0.78, 0);
      wg.add(ball);
      [-1, 1].forEach(s => {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 5), darkMat);
        spike.position.set(s * 0.11, -0.78, 0);
        spike.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        wg.add(spike);
      });
    } else if (name.includes('axe')) {
      const hndl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.68, 6), handleMat);
      hndl.position.set(0, -0.34, 0);
      wg.add(hndl);
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.085), darkMat);
      collar.position.set(0, -0.58, 0);
      wg.add(collar);
      const axeShape = new THREE.Shape();
      axeShape.moveTo(0.02, 0.18);
      axeShape.quadraticCurveTo(-0.25, 0.16, -0.34, 0.02);
      axeShape.quadraticCurveTo(-0.24, -0.14, 0.02, -0.18);
      axeShape.quadraticCurveTo(-0.08, 0, 0.02, 0.18);
      const axeGeo = new THREE.ExtrudeGeometry(axeShape, { depth: 0.055, bevelEnabled: false });
      axeGeo.translate(0, 0, -0.0275);
      const head = new THREE.Mesh(axeGeo, bladeMat);
      head.position.set(-0.02, -0.58, 0);
      wg.add(head);
      const rearSpike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 5), bladeMat);
      rearSpike.position.set(0.13, -0.58, 0);
      rearSpike.rotation.z = -Math.PI / 2;
      wg.add(rearSpike);
    } else if (name.includes('greatsword')) {
      addGrip(0.34, -0.17, 0.045);
      addGuard(0.34, -0.36);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.92, 0.07), bladeMat);
      blade.position.set(0, -0.84, 0);
      wg.add(blade);
      const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.7, 0.074), darkMat);
      fuller.position.set(0, -0.79, 0);
      wg.add(fuller);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), bladeMat);
      tip.position.set(0, -1.38, 0);
      tip.rotation.z = Math.PI;
      wg.add(tip);
    } else if (name.includes('flame')) {
      addGrip(0.24, -0.12, 0.04);
      addGuard(0.24, -0.26);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.58, 0.06), bladeMat);
      blade.position.set(0, -0.58, 0);
      wg.add(blade);
      for (let i = 0; i < 3; i++) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 6), fireMat);
        flame.position.set((i - 1) * 0.045, -0.43 - i * 0.1, 0.04);
        flame.rotation.z = Math.PI;
        wg.add(flame);
      }
    } else if (name.includes('rusty')) {
      const rustMat = new THREE.MeshStandardMaterial({ color: 0x7d5a3a, metalness: 0.45, roughness: 0.85 });
      addGrip(0.22, -0.11, 0.04);
      addGuard(0.2, -0.25);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.48, 0.045), rustMat);
      blade.position.set(0, -0.52, 0);
      blade.rotation.z = 0.06;
      wg.add(blade);
      const chip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.1, 0.048), darkMat);
      chip.position.set(0.035, -0.72, 0);
      chip.rotation.z = 0.35;
      wg.add(chip);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), rustMat);
      tip.position.set(0.012, -0.81, 0);
      tip.rotation.z = Math.PI + 0.06;
      wg.add(tip);
    } else if (name.includes('short sword')) {
      addGrip(0.2, -0.1, 0.04);
      addGuard(0.26, -0.24);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.44, 0.055), bladeMat);
      blade.position.set(0, -0.49, 0);
      wg.add(blade);
      const edgeL = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.42, 0.06), darkMat);
      edgeL.position.set(-0.035, -0.49, 0);
      wg.add(edgeL);
      const edgeR = edgeL.clone();
      edgeR.position.x = 0.035;
      wg.add(edgeR);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.12, 4), bladeMat);
      tip.position.set(0, -0.77, 0);
      tip.rotation.z = Math.PI;
      wg.add(tip);
    } else {
      addGrip(0.22, -0.11, 0.04);
      addGuard(0.22, -0.25);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.06), bladeMat);
      blade.position.set(0, -0.54, 0);
      wg.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 4), bladeMat);
      tip.position.set(0, -0.86, 0);
      tip.rotation.z = Math.PI;
      wg.add(tip);
    }

    wg.children.forEach(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  /* ── Blob shadow ─────────────────────────────── */
  function makeBlobShadow(radius) {
    if (!_blobMat) {
      _blobMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.38,
        depthWrite: false, side: THREE.FrontSide,
      });
    }
    const geo  = new THREE.CircleGeometry(radius, 16);
    const mesh = new THREE.Mesh(geo, _blobMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;   // just above floor
    mesh.renderOrder = 1;
    mesh.userData.isBlob = true;
    return mesh;
  }

  /* ── Player mesh ─────────────────────────────── */
  function buildPlayerMesh(player) {
    if (playerMesh) scene.remove(playerMesh);

    const group   = new THREE.Group();
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xd4a060 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x1a0e06, roughness: 0.9 });
    const legMat  = new THREE.MeshLambertMaterial({ color: 0x2a1a0a });

    // Thighs + shins + boots — in pivot groups so they swing when walking
    ['left', 'right'].forEach((side, i) => {
      const lx = i === 0 ? -0.13 : 0.13;
      const legPivot = new THREE.Group();
      legPivot.position.set(lx, 0.76, 0); // hip pivot
      legPivot.userData.isLeg = side;

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.38, 7), legMat);
      thigh.position.set(0, -0.19, 0); legPivot.add(thigh);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.095, 0.34, 7), legMat);
      shin.position.set(0, -0.54, 0); legPivot.add(shin);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.28), bootMat);
      boot.position.set(0, -0.68, 0.04); legPivot.add(boot);

      group.add(legPivot);
    });

    // Belt
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x3a2208, roughness: 0.7, metalness: 0.3 });
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.1, 10), beltMat);
    belt.position.y = 0.77; group.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 }));
    buckle.position.set(0, 0.77, 0.31); group.add(buckle);

    // Torso
    const armor    = player && player.inventory
      ? player.inventory.find(i => i.type === 'armor' && i.equipped) : null;
    const armorCol = rarityArmorColor(armor ? armor.rarity : 'common');
    const armorMat = new THREE.MeshStandardMaterial({ color: armorCol, metalness: 0.7, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.9, 10), armorMat);
    body.position.y = 1.07; body.castShadow = true; group.add(body);

    // Chest plate ridge
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.06), armorMat);
    chest.position.set(0, 1.1, 0.26); group.add(chest);

    // Pauldrons
    [-0.34, 0.34].forEach(px => {
      const pauMesh = new THREE.Mesh(new THREE.SphereGeometry(0.145, 7, 5), armorMat);
      pauMesh.position.set(px, 1.26, 0); pauMesh.scale.set(1.1, 0.72, 0.95); group.add(pauMesh);
    });

    // Cape
    const capeMat = new THREE.MeshLambertMaterial({ color: 0x2a1800, side: THREE.DoubleSide });
    const cape    = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.86), capeMat);
    cape.position.set(0, 1.02, -0.29); group.add(cape);

    // Head
    const helmCol = armorCol;
    const helmMat = new THREE.MeshStandardMaterial({ color: helmCol, metalness: 0.78, roughness: 0.25 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skinMat);
    head.position.y = 1.68; group.add(head);
    // Helmet bowl + brim + nasal guard
    const helmBowl = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), helmMat);
    helmBowl.position.y = 1.72; group.add(helmBowl);
    const helmBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10), helmMat);
    helmBrim.position.y = 1.62; group.add(helmBrim);
    const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.06), helmMat);
    nasal.position.set(0, 1.64, 0.27); group.add(nasal);

    // Right arm + torch — pivot group at shoulder so arm swings when walking
    const torchArmGroup = new THREE.Group();
    torchArmGroup.position.set(0.38, 1.30, 0);
    torchArmGroup.userData.isTorchArm = true;

    const rUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.3, 7), armorMat);
    rUpperArm.position.set(0, -0.12, 0); rUpperArm.rotation.z = 0.2; torchArmGroup.add(rUpperArm);
    const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.3, 7), skinMat);
    rForearm.position.set(0.06, -0.34, 0); rForearm.rotation.z = 0.15; torchArmGroup.add(rForearm);

    group.add(torchArmGroup);

    // Left weapon arm — shoulder pivot for swing animation
    const weaponArmGroup = new THREE.Group();
    weaponArmGroup.position.set(-0.38, 1.38, 0);
    weaponArmGroup.rotation.z = -0.15;
    weaponArmGroup.userData.isWeaponArm = true;
    weaponArmGroup.userData.swinging    = false;
    weaponArmGroup.userData.swingT      = 0;
    const wUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.3, 7), armorMat);
    wUpperArm.position.set(0, -0.15, 0); weaponArmGroup.add(wUpperArm);
    const wForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.3, 7), skinMat);
    wForearm.position.set(0, -0.42, 0); weaponArmGroup.add(wForearm);
    const wg = new THREE.Group(); wg.userData.isWeaponGroup = true;
    wg.position.set(0, -0.58, 0);
    wg.rotation.x = -Math.PI / 2;
    buildWeaponMesh(wg, player);
    weaponArmGroup.add(wg);
    group.add(weaponArmGroup);

    group.userData.armorMat  = armorMat;
    group.userData.helmMat   = helmMat;
    group.userData.torchArm  = torchArmGroup;
    group.userData.weaponArm = weaponArmGroup;

    playerMesh = group;
    playerMesh.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });
    group.add(makeBlobShadow(0.38));
    scene.add(playerMesh);

    if (torchLight) scene.remove(torchLight);
    torchLight = null;

    return playerMesh;
  }

  /* ── Refresh weapon/armor visuals on equip ───── */
  function updatePlayerEquipment(player) {
    if (!playerMesh) return;
    const arm = playerMesh.userData.weaponArm;
    if (arm) {
      const wg = arm.children.find(c => c.userData.isWeaponGroup);
      if (wg) buildWeaponMesh(wg, player);
    }
    const armor = player && player.inventory
      ? player.inventory.find(i => i.type === 'armor' && i.equipped) : null;
    const col   = rarityArmorColor(armor ? armor.rarity : 'common');
    if (playerMesh.userData.armorMat) playerMesh.userData.armorMat.color.setHex(col);
    if (playerMesh.userData.helmMat)  playerMesh.userData.helmMat.color.setHex(col);
  }

  /* ── Trigger weapon swing animation ─────────── */
  function triggerSwing() {
    if (!playerMesh) return;
    const arm = playerMesh.userData.weaponArm;
    if (arm && !arm.userData.swinging) {
      arm.userData.swinging = true;
      arm.userData.swingT   = 0;
    }
  }

  /* ── Archer: skeleton frame + bow ───────────── */
  function buildArcherShape(group, enemy) {
    // Reuse skeleton body
    buildSkeletonShape(group, enemy);
    const h   = enemy.height;
    const r   = enemy.radius;
    const bow = new THREE.MeshLambertMaterial({ color: 0x4a2e08 });
    // Bow arc on left side
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(h * 0.21, 0.025, 5, 12, Math.PI * 1.25),
      bow
    );
    arc.position.set(-r * 0.55, h * 0.54, r * 0.28);
    arc.rotation.set(0.25, -0.5, 0.55);
    group.add(arc);
    // Bowstring
    const pts = [new THREE.Vector3(0, -h * 0.21, 0), new THREE.Vector3(0, h * 0.21, 0)];
    const str = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xddddcc })
    );
    str.position.copy(arc.position);
    str.rotation.copy(arc.rotation);
    group.add(str);
  }

  /* ── Enemy mesh ──────────────────────────────── */
  function buildEnemyMesh(enemy) {
    const group = new THREE.Group();
    switch (enemy.typeKey) {
      case 'skeleton': buildSkeletonShape(group, enemy); break;
      case 'goblin':   buildGoblinShape(group, enemy);   break;
      case 'wraith':   buildWraithShape(group, enemy);   break;
      case 'troll':    buildTrollShape(group, enemy);    break;
      case 'archer':   buildArcherShape(group, enemy);   break;
      default:         buildBossShape(group, enemy);     break;
    }
    // HP bar sprite
    const canvas  = document.createElement('canvas');
    canvas.width  = 128; canvas.height = 16;
    const ctx2    = canvas.getContext('2d');
    ctx2.fillStyle = '#300'; ctx2.fillRect(0, 0, 128, 16);
    ctx2.fillStyle = enemy.isBoss ? '#ff2200' : '#cc2200';
    ctx2.fillRect(1, 1, 126, 14);
    const hpTex    = new THREE.CanvasTexture(canvas);
    const hpMat    = new THREE.SpriteMaterial({ map: hpTex, depthTest: false, transparent: true, opacity: 0 });
    const hpSprite = new THREE.Sprite(hpMat);
    hpSprite.scale.set(enemy.isBoss ? 2.4 : 1.4, 0.22, 1);
    hpSprite.position.y = enemy.height + 0.4;
    hpSprite.userData  = { isHpBar: true, hpTex, canvas, ctx: ctx2, enemy };
    group.add(hpSprite);
    group.add(makeBlobShadow((enemy.radius || 0.35) * 1.4));
    group.position.set(enemy.x, 0, enemy.z);
    scene.add(group);
    enemyMeshes[enemy.id] = group;
    enemy.mesh = group;
    return group;
  }

  /* ── Skeleton: bony frame, skull, ribs, limbs, rusty sword ── */
  function buildSkeletonShape(group, enemy) {
  const h = enemy.height;
  const r = enemy.radius;

  const bone = new THREE.MeshStandardMaterial({
    color: 0xd8d0b0,
    roughness: 0.95,
    metalness: 0.05
  });

  const dark = new THREE.MeshStandardMaterial({ color: 0x111111 });

  // ── Spine (segmented + curved)
  for (let i = 0; i < 5; i++) {
    const geo = new THREE.SphereGeometry(0.05 + Math.random()*0.01, 6, 5);
    distortGeometry(geo, 0.02);
    const seg = new THREE.Mesh(geo, bone);
    seg.position.set(
      Math.sin(i * 0.3) * 0.03,
      h * (0.35 + i * 0.07),
      0
    );
    group.add(seg);
  }

  // ── Ribs (non-uniform)
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.TorusGeometry(
      r * (0.22 + i * 0.02),
      0.02 + Math.random()*0.01,
      4,
      10
    );
    distortGeometry(geo, 0.02);

    const rib = new THREE.Mesh(geo, bone);
    rib.position.y = h * (0.52 - i * 0.06);
    rib.rotation.x = Math.PI / 2;
    rib.rotation.z = (Math.random() - 0.5) * 0.2;
    group.add(rib);
  }

  // ── Skull
  const skullGeo = new THREE.SphereGeometry(r * 0.4, 10, 8);
  distortGeometry(skullGeo, 0.03);

  const skull = new THREE.Mesh(skullGeo, bone);
  skull.position.y = h * 0.85;
  skull.scale.set(0.9, 1.05, 0.85);
  group.add(skull);

  // Eyes
  [-1, 1].forEach(side => {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 5),
      dark
    );
    eye.position.set(side * 0.12, h * 0.87, r * 0.25);
    group.add(eye);
  });

  // Jaw
  const jawGeo = new THREE.BoxGeometry(r * 0.5, 0.05, r * 0.3);
  distortGeometry(jawGeo, 0.02);

  const jaw = new THREE.Mesh(jawGeo, bone);
  jaw.position.set(0, h * 0.80, r * 0.08);
  group.add(jaw);

  // ── Legs (pivot groups for animation compatibility)
  [[-1, 'left'], [1, 'right']].forEach(([side, label]) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * r * 0.25, h * 0.3, 0);
    pivot.userData.isSkelLeg = label;

    const legGeo = new THREE.CylinderGeometry(0.05, 0.05, h * 0.35, 6);
    distortGeometry(legGeo, 0.02);

    const leg = new THREE.Mesh(legGeo, bone);
    leg.position.y = -h * 0.18;

    pivot.add(leg);
    group.add(pivot);
  });

  // ── Right attack arm
  const arm = new THREE.Group();
  arm.position.set(r * 0.45, h * 0.55, 0);
  group.userData.attackArm = arm;

  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, h * 0.22, 6),
    bone
  );
  upper.position.y = -h * 0.1;
  arm.add(upper);

  const lower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, h * 0.22, 6),
    bone
  );
  lower.position.y = -h * 0.28;
  arm.add(lower);

  group.add(arm);

  // ── Left arm (static)
  const la = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, h * 0.25, 6),
    bone
  );
  la.position.set(-r * 0.45, h * 0.5, 0);
  la.rotation.z = -0.6;
  group.add(la);
}

  /* ── Goblin: squat body, huge ears, glowing eyes */
  function buildGoblinShape(group, enemy) {
  const h = enemy.height;
  const r = enemy.radius;

  const skin = new THREE.MeshStandardMaterial({
    color: 0x3d9a32,
    roughness: 0.92
  });
  const darkSkin = new THREE.MeshStandardMaterial({ color: 0x23651f, roughness: 0.95 });
  const leather  = new THREE.MeshStandardMaterial({ color: 0x4a2a12, roughness: 0.9 });
  const clawMat  = new THREE.MeshStandardMaterial({ color: 0xd8c88f, roughness: 0.75 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x140806, roughness: 1.0 });

  // Body
  const bodyGeo = new THREE.SphereGeometry(r * 0.76, 14, 10);
  distortGeometry(bodyGeo, 0.045);

  const body = new THREE.Mesh(bodyGeo, skin);
  body.position.y = h * 0.36;
  body.scale.set(0.95, 0.86, 1.18);
  body.rotation.x = -0.16;
  group.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(r * 0.46, 10, 7), darkSkin);
  belly.position.set(0, h * 0.3, r * 0.22);
  belly.scale.set(1.05, 0.7, 0.45);
  group.add(belly);

  // Head
  const headGeo = new THREE.SphereGeometry(r * 0.55, 14, 10);
  distortGeometry(headGeo, 0.035);

  const head = new THREE.Mesh(headGeo, skin);
  head.position.set(0, h * 0.75, r * 0.08);
  head.scale.set(1.15, 0.85, 0.95);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.26, r * 0.38, 8), darkSkin);
  snout.position.set(0, h * 0.71, r * 0.42);
  snout.rotation.x = Math.PI / 2;
  group.add(snout);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(r * 0.11, 7, 5), mouthMat);
  nose.position.set(0, h * 0.75, r * 0.62);
  nose.scale.set(1.15, 0.75, 0.55);
  group.add(nose);

  const brow = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.07, r * 0.09, r * 0.72, 7), darkSkin);
  brow.position.set(0, h * 0.81, r * 0.36);
  brow.rotation.z = Math.PI / 2;
  brow.rotation.x = 0.12;
  group.add(brow);

  // Ears
  [-1, 1].forEach(side => {
    const earGeo = new THREE.ConeGeometry(r * 0.16, h * 0.34, 8);
    distortGeometry(earGeo, 0.015);
    const ear = new THREE.Mesh(earGeo, skin);
    ear.position.set(side * r * 0.58, h * 0.78, r * 0.02);
    ear.scale.set(0.55, 1.0, 0.22);
    ear.rotation.z = side * 1.42;
    ear.rotation.y = side * 0.28;
    group.add(ear);

    const cheek = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 8, 6), darkSkin);
    cheek.position.set(side * r * 0.25, h * 0.68, r * 0.36);
    cheek.scale.set(0.9, 0.65, 0.5);
    group.add(cheek);
  });

  // Eyes
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xbaff22,
    emissive: 0x88ff00,
    emissiveIntensity: 1.6
  });

  [-1, 1].forEach(side => {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 7, 5),
      eyeMat
    );
    eye.position.set(side * r * 0.22, h * 0.77, r * 0.43);
    eye.scale.set(1.25, 0.72, 0.55);
    group.add(eye);
  });

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(r * 0.32, h * 0.035, r * 0.035), mouthMat);
  mouth.position.set(0, h * 0.65, r * 0.58);
  group.add(mouth);

  [-1, 1].forEach(side => {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(r * 0.035, h * 0.09, 5), clawMat);
    tusk.position.set(side * r * 0.1, h * 0.62, r * 0.6);
    tusk.rotation.x = Math.PI;
    group.add(tusk);
  });

  const rag = new THREE.Mesh(new THREE.ConeGeometry(r * 0.46, h * 0.28, 7, 1, true), leather);
  rag.position.y = h * 0.26;
  rag.rotation.y = 0.25;
  group.add(rag);

  [-1, 1].forEach(side => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.11, r * 0.09, h * 0.27, 7), darkSkin);
    leg.position.set(side * r * 0.24, h * 0.13, 0);
    leg.rotation.z = side * 0.18;
    group.add(leg);
  });

  // Attack arm
  const arm = new THREE.Group();
  arm.position.set(r * 0.58, h * 0.57, r * 0.02);
  group.userData.attackArm = arm;

  const armGeo = new THREE.CylinderGeometry(r * 0.09, r * 0.075, h * 0.32, 7);
  distortGeometry(armGeo, 0.02);

  const mesh = new THREE.Mesh(armGeo, skin);
  mesh.position.y = -h * 0.16;
  mesh.rotation.z = -0.18;

  arm.add(mesh);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 8, 6), darkSkin);
  hand.position.set(0, -h * 0.34, r * 0.03);
  hand.scale.set(1.0, 0.72, 1.0);
  arm.add(hand);

  [-1, 0, 1].forEach(i => {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(r * 0.025, h * 0.12, 5), clawMat);
    claw.position.set(i * r * 0.055, -h * 0.38, r * 0.08);
    claw.rotation.x = Math.PI / 2;
    arm.add(claw);
  });

  const offArm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.075, r * 0.065, h * 0.26, 7), skin);
  offArm.position.set(-r * 0.52, h * 0.46, r * 0.04);
  offArm.rotation.z = 0.65;
  offArm.rotation.x = -0.22;
  group.add(offArm);
  group.add(arm);
}

  /* ── Wraith: floating robe, glowing eyes, tendrils, spectral claw */
 function buildWraithShape(group, enemy) {
  const h = enemy.height;
  const r = enemy.radius;

  const mat = new THREE.MeshStandardMaterial({
    color: 0x6b39dd,
    transparent: true,
    opacity: 0.72,
    emissive: 0x24105f,
    emissiveIntensity: 0.55,
    roughness: 0.92,
    side: THREE.DoubleSide
  });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xb68cff, transparent: true, opacity: 0.34 });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x130821,
    transparent: true,
    opacity: 0.82,
    emissive: 0x090018,
    emissiveIntensity: 0.4,
    roughness: 1.0
  });

  const robeGeo = new THREE.ConeGeometry(r * 0.95, h * 0.78, 18, 3, true);
  distortGeometry(robeGeo, 0.08);

  const robe = new THREE.Mesh(robeGeo, mat);
  robe.position.y = h * 0.38;
  robe.scale.set(0.95, 1.0, 1.1);
  group.add(robe);

  const inner = new THREE.Mesh(new THREE.ConeGeometry(r * 0.58, h * 0.56, 14, 1, true), coreMat);
  inner.position.y = h * 0.42;
  inner.rotation.y = 0.35;
  group.add(inner);

  const hoodGeo = new THREE.SphereGeometry(r * 0.52, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.82);
  distortGeometry(hoodGeo, 0.035);
  const hood = new THREE.Mesh(hoodGeo, mat);
  hood.position.set(0, h * 0.86, r * 0.02);
  hood.scale.set(1.05, 1.12, 0.86);
  group.add(hood);

  const face = new THREE.Mesh(new THREE.SphereGeometry(r * 0.31, 10, 7), darkMat);
  face.position.set(0, h * 0.82, r * 0.22);
  face.scale.set(0.9, 1.05, 0.42);
  group.add(face);

  // Eyes
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xcc88ff,
    emissiveIntensity: 2.2
  });

  [-1, 1].forEach(side => {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 7, 5),
      eyeMat
    );
    eye.position.set(side * r * 0.15, h * 0.84, r * 0.43);
    eye.scale.set(1.15, 0.72, 0.45);
    group.add(eye);
  });

  for (let i = 0; i < 7; i++) {
    const side = i - 3;
    const tendril = new THREE.Mesh(new THREE.ConeGeometry(r * (0.07 + (i % 2) * 0.02), h * (0.28 + (i % 3) * 0.05), 6, 1, true), mat);
    tendril.position.set(side * r * 0.18, h * 0.08, Math.sin(i * 1.7) * r * 0.16);
    tendril.rotation.x = Math.PI + Math.sin(i) * 0.25;
    tendril.rotation.z = side * 0.12;
    group.add(tendril);
  }

  [-1, 1].forEach(side => {
    const sleeve = new THREE.Mesh(new THREE.ConeGeometry(r * 0.13, h * 0.44, 7, 1, true), mat);
    sleeve.position.set(side * r * 0.58, h * 0.57, r * 0.02);
    sleeve.rotation.z = side * 0.72;
    sleeve.rotation.x = -0.2;
    group.add(sleeve);
  });

  // Attack arm
  const arm = new THREE.Group();
  arm.position.set(r * 0.62, h * 0.6, r * 0.04);
  group.userData.attackArm = arm;

  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.045, r * 0.085, h * 0.28, 7), mat);
  forearm.position.y = -h * 0.14;
  forearm.rotation.z = -0.2;
  arm.add(forearm);

  [-1, 0, 1].forEach(i => {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(r * 0.035, h * 0.18, 5), coreMat);
    claw.position.set(i * r * 0.055, -h * 0.31, r * 0.04);
    claw.rotation.x = Math.PI;
    claw.rotation.z = i * 0.16;
    arm.add(claw);
  });
  group.add(arm);

  for (let i = 0; i < 4; i++) {
    const wisp = new THREE.Mesh(new THREE.SphereGeometry(r * 0.06, 7, 5), coreMat);
    const a = i * Math.PI * 0.5 + 0.4;
    wisp.position.set(Math.cos(a) * r * 0.68, h * (0.35 + i * 0.11), Math.sin(a) * r * 0.42);
    group.add(wisp);
  }
}

  /* ── Troll: massive boulder body, huge slab arms, stone maul ─ */
  function buildTrollShape(group, enemy) {
    const h     = enemy.height;
    const r     = enemy.radius;
    const rock  = new THREE.MeshStandardMaterial({ color: 0x885522, roughness: 1.0, metalness: 0.1 });
    const dark  = new THREE.MeshStandardMaterial({ color: 0x3a2010 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h * 0.58, 8), rock);
    body.position.y = h * 0.36; body.castShadow = true; group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 8, 7), rock);
    head.position.y = h * 0.82; head.scale.set(1.0, 0.8, 0.9); group.add(head);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(r * 0.7, 0.1, 0.12), dark);
    brow.position.set(0, h * 0.87, r * 0.3); group.add(brow);

    [[-0.14, r * 0.33], [0.14, r * 0.33]].forEach(([ox, oz]) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), dark);
      eye.position.set(ox, h * 0.84, oz); group.add(eye);
    });

    // Left arm (static)
    const la = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.32, h * 0.4, 7), rock);
    la.position.set(-r * 1.1, h * 0.42, 0); la.rotation.z = -0.35; group.add(la);
    const lfist = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 7, 6), rock);
    lfist.position.set(-r * 1.3, h * 0.19, 0.05); lfist.scale.set(1.1, 0.9, 1.0); group.add(lfist);

    // Right arm — attackArm Group with stone maul
    const arm = new THREE.Group();
    arm.position.set(r * 0.95, h * 0.62, 0);
    group.userData.attackArm = arm;

    const ra = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.30, r * 0.28, h * 0.40, 7), rock);
    ra.position.y = -h * 0.20; arm.add(ra);
    const rFist = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 7, 6), rock);
    rFist.position.y = -h * 0.42; rFist.scale.set(1.1, 0.9, 1.0); arm.add(rFist);

    group.add(arm);
  }

  /* ── Boss shape dispatcher ───────────────────── */
  function buildBossShape(group, enemy) {
    switch (enemy.bossKind) {
      case 'stone_golem':   buildGolemShape(group, enemy);        break;
      case 'wraith_king':   buildWraithKingShape(group, enemy);   break;
      case 'bone_colossus': buildBoneColossusShape(group, enemy); break;
      case 'inferno_drake': buildInfernoDrakeShape(group, enemy); break;
      default:              buildDungeonLordShape(group, enemy);  break;
    }
  }

  /* ── Boss: Dungeon Lord — demonic humanoid, horns, wings */
  function buildDungeonLordShape(group, enemy) {
    const h = enemy.height, r = enemy.radius;
    const flesh = new THREE.MeshStandardMaterial({ color: 0x7a1100, roughness: 0.88, metalness: 0.10, emissive: 0x180000, emissiveIntensity: 0.3 });
    const plate = new THREE.MeshStandardMaterial({ color: 0x110003, roughness: 0.55, metalness: 0.70 });
    const hornM = new THREE.MeshStandardMaterial({ color: 0x060001, roughness: 0.45, metalness: 0.55 });
    const eyeM  = new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xff2200, emissiveIntensity: 2.8 });
    const wingM = new THREE.MeshStandardMaterial({ color: 0x2a0006, side: THREE.DoubleSide, transparent: true, opacity: 0.82, roughness: 0.92 });

    function mk(geo, mat, px, py, pz, rx, ry, rz, def) {
      if (def) distortGeometry(geo, def);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px||0, py||0, pz||0);
      if (rx||ry||rz) m.rotation.set(rx||0, ry||0, rz||0);
      m.castShadow = true; group.add(m); return m;
    }

    // 4-segment torso (wide pelvis tapering to narrow shoulders)
    mk(new THREE.CylinderGeometry(r*.92,r*.98,h*.13,9,2),  flesh, 0,h*.09,0, 0,0,0, .06);
    mk(new THREE.CylinderGeometry(r*.82,r*.92,h*.15,10,2), flesh, 0,h*.22,0, 0,0,0, .05);
    mk(new THREE.CylinderGeometry(r*.74,r*.82,h*.15,10,2), flesh, 0,h*.35,0, 0,0,0, .045);
    mk(new THREE.CylinderGeometry(r*.68,r*.74,h*.13,9,2),  flesh, 0,h*.47,0, 0,0,0, .04);
    // Chest armour plate + shoulder pauldrons with spikes
    mk(new THREE.BoxGeometry(r*1.55,h*.17,r*.28), plate, 0,h*.34,r*.46, 0,0,0, .025);
    [-1,1].forEach(s => {
      mk(new THREE.SphereGeometry(r*.40,8,6,0,Math.PI*2,0,Math.PI*.62), plate, s*r*.96,h*.49,0, 0,0,s*.28, .05);
      mk(new THREE.ConeGeometry(.052,h*.13,5), hornM, s*r*.97,h*.60,0, 0,0,s*.28, .018);
    });
    // Neck
    mk(new THREE.CylinderGeometry(r*.24,r*.32,h*.10,8,2), flesh, 0,h*.60,0, 0,0,0, .022);
    // Head (distorted sphere + brow + cheeks + jaw + teeth)
    const hG = new THREE.SphereGeometry(r*.50,10,8); distortGeometry(hG,.045);
    const hd = new THREE.Mesh(hG, flesh); hd.position.set(0,h*.75,0); hd.scale.set(.90,1.06,.88); hd.castShadow=true; group.add(hd);
    mk(new THREE.BoxGeometry(r*.90,.09,.13), plate, 0,h*.80,r*.37, 0,0,0, .022);
    [-1,1].forEach(s => mk(new THREE.SphereGeometry(r*.16,6,5), flesh, s*r*.36,h*.76,r*.32, 0,0,0, .035));
    mk(new THREE.BoxGeometry(r*.58,.09,r*.34), flesh, 0,h*.70,r*.10, .18,0,0, .025);
    for (let i=0;i<4;i++) mk(new THREE.ConeGeometry(.025,.07,4), new THREE.MeshLambertMaterial({color:0xddccaa}), (i-1.5)*.12,h*.665,r*.24, Math.PI,0,0, .01);
    // Deep-set eye sockets + glowing eyes
    [[-0.17,r*.36],[0.17,r*.36]].forEach(([ox,oz]) => {
      mk(new THREE.SphereGeometry(.095,7,6), plate, ox,h*.778,oz, 0,0,0, .02);
      mk(new THREE.SphereGeometry(.065,6,5), eyeM,  ox,h*.778,oz+.02, 0,0,0, 0);
    });
    // Curved 2-segment horns
    [-1,1].forEach(s => {
      mk(new THREE.CylinderGeometry(.052,.092,h*.16,6,2), hornM, s*r*.22,h*.88,0, -.12,0,s*.28, .018);
      mk(new THREE.ConeGeometry(.030,h*.21,5,2), hornM, s*(r*.22+Math.sin(.28)*h*.09),h*1.00,-h*.04, -.22,0,s*.54, .015);
    });
    // 5 spinal spikes
    for (let i=0;i<5;i++) mk(new THREE.ConeGeometry(.042-i*.004,h*(.12-i*.01),5), hornM, 0,h*(.46+i*.07),-r*.70, .55,0,0, .015);
    // 3-panel wings + bone struts per side
    [-1,1].forEach(s => {
      for (let p=0;p<3;p++) {
        const pG=new THREE.PlaneGeometry(r*(1.6-p*.35),h*(.50-p*.10),4,5); distortGeometry(pG,.07);
        const pm=new THREE.Mesh(pG,wingM); pm.position.set(s*(r*.80+p*r*.55),h*(.45-p*.06),-.08); pm.rotation.set(0,s*.12,s*(.14+p*.10)); group.add(pm);
      }
      const sm=new THREE.Mesh(new THREE.CylinderGeometry(.036,.026,r*2.2,5),hornM);
      sm.position.set(s*r*1.0,h*.46,-.05); sm.rotation.z=s*(Math.PI/2-.18); group.add(sm);
    });
    // Static left arm (2 segments)
    mk(new THREE.CylinderGeometry(r*.17,r*.20,h*.25,7,2), flesh, -r*1.10,h*.40,0, 0,0,-.30, .035);
    mk(new THREE.CylinderGeometry(r*.14,r*.17,h*.22,6,2), flesh, -r*1.28,h*.18,.04, 0,0,-.55, .03);
    // Right attackArm + clawed fingers
    const arm=new THREE.Group(); arm.position.set(r*.95,h*.52,0); group.userData.attackArm=arm;
    [h*.14,h*.36].forEach((y,i) => { const ag=new THREE.CylinderGeometry(r*(.16-i*.02),r*(.19-i*.02),h*.22,7,2); distortGeometry(ag,.03); const am=new THREE.Mesh(ag,flesh); am.position.y=-y; am.castShadow=true; arm.add(am); });
    for (let c=-1;c<=1;c++) { const cg=new THREE.ConeGeometry(.030,h*.09,4); distortGeometry(cg,.01); const cm=new THREE.Mesh(cg,hornM); cm.position.set(c*.10,-h*.52,.06); cm.rotation.x=.45; arm.add(cm); }
    group.add(arm);
  }

  /* ── Boss: Stone Golem — boulder-cluster body, crystal core, moss detail */
  function buildGolemShape(group, enemy) {
    const h = enemy.height, r = enemy.radius;
    const stone   = new THREE.MeshStandardMaterial({ color: 0x6a7a5a, roughness: 0.97, metalness: 0.08 });
    const darkSt  = new THREE.MeshStandardMaterial({ color: 0x2e3e28, roughness: 1.0 });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x3a6a28, roughness: 1.0, emissive: 0x0a1a04, emissiveIntensity: 0.3 });
    const crystal = new THREE.MeshStandardMaterial({ color: 0x44ff88, emissive: 0x22aa44, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.5 });

    function rock(r2, px, py, pz, sx, sy, sz, rx, ry, rz) {
      const g = new THREE.DodecahedronGeometry(r2, 1); distortGeometry(g, r2*.10);
      const m = new THREE.Mesh(g, stone); m.position.set(px,py,pz);
      m.scale.set(sx||1,sy||1,sz||1); if(rx||ry||rz) m.rotation.set(rx||0,ry||0,rz||0);
      m.castShadow=true; group.add(m); return m;
    }

    // Pelvis cluster + side hip masses
    rock(r*.55,  0,h*.18,0,        1.30,.74,.98,  .04,.22,-.07);
    rock(r*.30,  r*.42,h*.14,r*.10, .90,.72,.85,  0,.40,.08);
    rock(r*.30, -r*.42,h*.14,r*.10, .90,.72,.85,  0,-.30,-.08);
    // Multi-boulder torso + back mass
    rock(r*.80,  0,h*.42,0,         1.22,1.02,.92, -.06,-.14,.08);
    rock(r*.42,  r*.68,h*.40,.04,   .85,.92,.80,   .10,.25,.14);
    rock(r*.42, -r*.68,h*.40,.04,   .85,.92,.80,   .10,-.22,-.14);
    rock(r*.50,  0,h*.30,-r*.38,    1.0,.88,.70,   .12,.05,0);
    // Dark chest plate patch
    const cpG=new THREE.DodecahedronGeometry(r*.40,1); distortGeometry(cpG,.045);
    const cp=new THREE.Mesh(cpG,darkSt); cp.position.set(0,h*.46,r*.48); cp.scale.set(1.4,.60,.40); cp.castShadow=true; group.add(cp);
    // Shoulder boulders
    [-1,1].forEach(s => rock(r*.34, s*r*.92,h*.57,.02, 1.0,.80,.90, .12,s*.22,s*.12));
    // Head — layered boulders with brow & jaw overhangs
    rock(r*.48,  0,h*.72,r*.04,    1.10,.76,.92, .02,.18,-.04);
    rock(r*.22,  r*.52,h*.70,r*.02, .90,.75,.88, .08,.20,.12);
    rock(r*.22, -r*.52,h*.70,r*.02, .90,.75,.88, .08,-.20,-.12);
    const browG=new THREE.DodecahedronGeometry(r*.24,1); distortGeometry(browG,.04);
    const brow=new THREE.Mesh(browG,darkSt); brow.position.set(0,h*.80,r*.42); brow.scale.set(2.0,.36,.52); group.add(brow);
    const jawG=new THREE.DodecahedronGeometry(r*.28,1); distortGeometry(jawG,.04);
    const jaw=new THREE.Mesh(jawG,stone); jaw.position.set(0,h*.63,r*.14); jaw.scale.set(1.62,.52,1.0); group.add(jaw);
    // Crystal eyes
    [[-r*.22,r*.40],[r*.22,r*.40]].forEach(([ox,oz]) => {
      const em=new THREE.Mesh(new THREE.SphereGeometry(r*.072,8,6),crystal); em.position.set(ox,h*.73,oz); em.scale.set(1.1,.80,.56); group.add(em);
    });
    // Crystal core cluster in chest
    for (let i=0;i<5;i++) {
      const ang=(i/5)*Math.PI*2; const cG=new THREE.ConeGeometry(.07+Math.random()*.04,h*(.14+Math.random()*.08),5);
      const cr=new THREE.Mesh(cG,crystal); cr.position.set(Math.cos(ang)*r*.26,h*(.38+Math.random()*.08),Math.sin(ang)*r*.26); cr.rotation.set((Math.random()-.5)*.4,ang,(Math.random()-.5)*.3); group.add(cr);
    }
    // Moss patches + crack fissures for surface texture
    for (let i=0;i<4;i++) { const mG=new THREE.SphereGeometry(r*.13,5,4); const mm=new THREE.Mesh(mG,mossMat); mm.position.set((Math.random()-.5)*r*1.1,h*(.2+Math.random()*.4),(Math.random()-.5)*r*.8); mm.scale.set(1.2,.28,1.0); group.add(mm); }
    for (let i=0;i<5;i++) { const crG=new THREE.BoxGeometry(.026,h*(.06+Math.random()*.08),.026); const crm=new THREE.Mesh(crG,darkSt); crm.position.set((Math.random()-.5)*r*1.1,h*(.22+Math.random()*.30),(Math.random()-.5)*r*.9); crm.rotation.y=Math.random()*Math.PI; group.add(crm); }
    // Left arm slabs
    const laG=new THREE.DodecahedronGeometry(r*.36,1); distortGeometry(laG,.06);
    const la=new THREE.Mesh(laG,stone); la.position.set(-r*1.24,h*.32,0); la.scale.set(.72,1.28,.76); la.rotation.z=-.22; la.castShadow=true; group.add(la);
    const lfG=new THREE.DodecahedronGeometry(r*.40,1); distortGeometry(lfG,.07);
    const lf=new THREE.Mesh(lfG,stone); lf.position.set(-r*1.30,h*.09,r*.08); lf.scale.set(1.05,.80,1.02); lf.rotation.set(.18,.28,-.12); group.add(lf);
    // Right attackArm + crystal knuckle spikes
    const gArm=new THREE.Group(); gArm.position.set(r*1.02,h*.55,0); group.userData.attackArm=gArm;
    const raG=new THREE.DodecahedronGeometry(r*.36,1); distortGeometry(raG,.06); const ra=new THREE.Mesh(raG,stone); ra.position.y=-h*.22; ra.scale.set(.76,1.25,.78); ra.rotation.z=.14; ra.castShadow=true; gArm.add(ra);
    const rfG=new THREE.DodecahedronGeometry(r*.44,1); distortGeometry(rfG,.07); const rf=new THREE.Mesh(rfG,stone); rf.position.set(0,-h*.48,r*.08); rf.scale.set(1.10,.82,1.02); rf.rotation.set(-.08,-.2,.18); gArm.add(rf);
    for (let i=0;i<3;i++) { const kg=new THREE.ConeGeometry(.065,h*.10,5); const km=new THREE.Mesh(kg,crystal); km.position.set((i-1)*.18*r,-h*.58,r*.28); gArm.add(km); }
    group.add(gArm);
    // Leg stumps
    [-1,1].forEach(s => { const lgG=new THREE.DodecahedronGeometry(r*.32,1); distortGeometry(lgG,.05); const lg=new THREE.Mesh(lgG,stone); lg.position.set(s*r*.36,h*.05,0); lg.scale.set(.9,1.0,.85); group.add(lg); });
  }

  /* ── Boss: Shadow Wraith King — layered spectral robe, skull, bone crown */
  function buildWraithKingShape(group, enemy) {
    const h = enemy.height, r = enemy.radius;
    const robe1  = new THREE.MeshStandardMaterial({ color: 0x1e0055, roughness: 0.95, transparent: true, opacity: 0.90, emissive: 0x080022, emissiveIntensity: 0.5 });
    const robe2  = new THREE.MeshStandardMaterial({ color: 0x100038, roughness: 0.95, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const robe3  = new THREE.MeshStandardMaterial({ color: 0x3300aa, roughness: 0.90, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const crownM = new THREE.MeshStandardMaterial({ color: 0x0a0030, roughness: 0.4, metalness: 0.8 });
    const eyeM   = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcc88ff, emissiveIntensity: 2.8 });
    const boneM  = new THREE.MeshStandardMaterial({ color: 0xd4ccbb, roughness: 0.88 });

    const sg = new THREE.Group(); sg.position.y = 0.35; group.add(sg);

    // 3-layer robe (outermost to innermost)
    [[r*1.20,h*.82,robe3,.07],[r*.98,h*.74,robe2,.055],[r*.78,h*.66,robe1,.045]].forEach(([rad,ht,mat,def]) => {
      const g=new THREE.ConeGeometry(rad,ht,14,3,true); distortGeometry(g,def);
      const m=new THREE.Mesh(g,mat); m.position.y=ht*.5; sg.add(m);
    });
    // Ground tendrils / wisps
    for (let i=0;i<9;i++) {
      const ang=(i/9)*Math.PI*2;
      const tG=new THREE.CylinderGeometry(.035+Math.random()*.025,.015,h*(.16+Math.random()*.12),5); distortGeometry(tG,.025);
      const t=new THREE.Mesh(tG,robe2); t.position.set(Math.cos(ang)*r*.72,h*(.03+Math.random()*.05),Math.sin(ang)*r*.72); t.rotation.set((Math.random()-.5)*.3,0,(Math.random()-.5)*.2); sg.add(t);
    }
    // Torso bulge
    const torsoG=new THREE.CylinderGeometry(r*.55,r*.72,h*.32,10,2); distortGeometry(torsoG,.04);
    const torso=new THREE.Mesh(torsoG,robe1); torso.position.y=h*.60; sg.add(torso);
    // Neck stub
    const neckG=new THREE.CylinderGeometry(r*.18,r*.22,h*.07,7); distortGeometry(neckG,.02);
    const neck=new THREE.Mesh(neckG,boneM); neck.position.y=h*.83; sg.add(neck);
    // Skull + forehead protrusion + brow ridge
    const skG=new THREE.SphereGeometry(r*.46,10,8); distortGeometry(skG,.04);
    const sk=new THREE.Mesh(skG,robe1); sk.position.y=h*.95; sk.scale.set(.94,1.10,.88); sg.add(sk);
    const foreG=new THREE.SphereGeometry(r*.28,8,6); distortGeometry(foreG,.03);
    const fore=new THREE.Mesh(foreG,robe2); fore.position.set(0,h*1.00,r*.22); sg.add(fore);
    const browBG=new THREE.BoxGeometry(r*.78,.09,.12); distortGeometry(browBG,.02);
    const browB=new THREE.Mesh(browBG,boneM); browB.position.set(0,h*1.00,r*.36); sg.add(browB);
    // Jaw + teeth
    const jawG=new THREE.BoxGeometry(r*.46,h*.055,r*.28); distortGeometry(jawG,.02);
    const jaw=new THREE.Mesh(jawG,boneM); jaw.position.set(0,h*.88,r*.14); sg.add(jaw);
    for (let i=0;i<5;i++) { const tg=new THREE.ConeGeometry(.022,.06,4); const tm=new THREE.Mesh(tg,new THREE.MeshLambertMaterial({color:0xddd5bb})); tm.position.set((i-2)*.10,h*.86,r*.24); tm.rotation.x=Math.PI; sg.add(tm); }
    // 4 glowing eye pairs
    [[-0.17,r*.30,h*.96],[0.17,r*.30,h*.96],[-0.07,r*.24,h*.90],[0.07,r*.24,h*.90]].forEach(([ox,oz,oy]) => {
      const eg=new THREE.SphereGeometry(.072,6,5); const em=new THREE.Mesh(eg,eyeM); em.position.set(ox,oy,oz); sg.add(em);
    });
    // Crown — 6 outer spikes + 4 inner ring
    for (let i=0;i<6;i++) { const ang=(i/6)*Math.PI*2; const spG=new THREE.ConeGeometry(.068,h*.22,5); distortGeometry(spG,.02); const sp=new THREE.Mesh(spG,crownM); sp.position.set(Math.cos(ang)*r*.40,h*1.08,Math.sin(ang)*r*.40); sp.rotation.x=Math.cos(ang)*.2; sp.rotation.z=Math.sin(ang)*-.2; sg.add(sp); }
    for (let i=0;i<4;i++) { const ang=(i/4)*Math.PI*2+Math.PI/4; const spG=new THREE.ConeGeometry(.042,h*.13,4); distortGeometry(spG,.015); const sp=new THREE.Mesh(spG,crownM); sp.position.set(Math.cos(ang)*r*.24,h*1.04,Math.sin(ang)*r*.24); sg.add(sp); }
    // Wispy arms + bony fingers
    [-1,1].forEach(s => {
      const a1G=new THREE.CylinderGeometry(r*.10,r*.14,h*.38,7,2); distortGeometry(a1G,.04);
      const a1=new THREE.Mesh(a1G,robe2); a1.position.set(s*r*.90,h*.65,0); a1.rotation.z=s*.55; sg.add(a1);
      const a2G=new THREE.CylinderGeometry(r*.07,r*.10,h*.30,6,2); distortGeometry(a2G,.035);
      const a2=new THREE.Mesh(a2G,robe3); a2.position.set(s*r*1.22,h*.48,0); a2.rotation.z=s*.85; sg.add(a2);
      for (let c=0;c<3;c++) { const cg=new THREE.ConeGeometry(.024,h*.07,4); distortGeometry(cg,.01); const cm=new THREE.Mesh(cg,boneM); cm.position.set(s*(r*1.38+(c-1)*.09),h*.36,.06); cm.rotation.set(.5,0,s*.8); sg.add(cm); }
    });
  }

  /* ── Boss: Bone Colossus — individual vertebrae, ribcage pairs, detailed skull */
  function buildBoneColossusShape(group, enemy) {
    const h = enemy.height, r = enemy.radius;
    const bone     = new THREE.MeshStandardMaterial({ color: 0xddd4b5, roughness: 0.90, metalness: 0.04 });
    const darkBone = new THREE.MeshStandardMaterial({ color: 0x9b9070, roughness: 0.95 });
    const glow     = new THREE.MeshStandardMaterial({ color: 0x88ff44, emissive: 0x44cc22, emissiveIntensity: 1.4 });
    const marrow   = new THREE.MeshStandardMaterial({ color: 0x55dd22, emissive: 0x33aa11, emissiveIntensity: 1.0, transparent: true, opacity: 0.68 });

    // Pelvis + iliac crests
    const hipG=new THREE.CylinderGeometry(r*.72,r*.78,h*.09,8,1); distortGeometry(hipG,.04);
    const hip=new THREE.Mesh(hipG,darkBone); hip.position.y=h*.08; hip.castShadow=true; group.add(hip);
    [-1,1].forEach(s => { const ilG=new THREE.SphereGeometry(r*.36,7,6); distortGeometry(ilG,.04); const il=new THREE.Mesh(ilG,bone); il.position.set(s*r*.66,h*.10,0); il.scale.set(.82,.62,.96); group.add(il); });
    // 7 individual vertebrae with transverse processes
    for (let i=0;i<7;i++) {
      const vy=h*(.14+i*.075), vr=r*(.12-i*.008);
      const vG=new THREE.CylinderGeometry(vr,vr*1.12,h*.05,7); distortGeometry(vG,.018);
      const vm=new THREE.Mesh(vG,bone); vm.position.set(Math.sin(i*.35)*.03,vy,0); vm.castShadow=true; group.add(vm);
      [-1,1].forEach(s => { const pG=new THREE.BoxGeometry(.06,.04,h*.04); distortGeometry(pG,.01); const pm=new THREE.Mesh(pG,bone); pm.position.set(s*vr*1.8,vy,0); group.add(pm); });
    }
    // 5 pairs of individual torus ribs
    for (let i=0;i<5;i++) {
      const ribY=h*(.28+i*.07), ribR=r*(.52-i*.055);
      [-1,1].forEach(s => {
        const ribG=new THREE.TorusGeometry(ribR,.028+Math.random()*.007,4,10,Math.PI*1.12); distortGeometry(ribG,.022);
        const rib=new THREE.Mesh(ribG,bone); rib.position.y=ribY; rib.rotation.x=Math.PI/2; rib.rotation.y=s<0?0:Math.PI; rib.rotation.z=(Math.random()-.5)*.08; rib.castShadow=true; group.add(rib);
      });
    }
    for (let i=0;i<3;i++) { const mg=new THREE.SphereGeometry(r*.08,5,4); const mm=new THREE.Mesh(mg,marrow); mm.position.set(0,h*(.34+i*.09),0); group.add(mm); }
    // Skull — cranium + cheeks + brow + jaw + teeth
    const cranG=new THREE.SphereGeometry(r*.50,10,8); distortGeometry(cranG,.045);
    const cran=new THREE.Mesh(cranG,bone); cran.position.y=h*.87; cran.scale.set(.88,1.04,.84); cran.castShadow=true; group.add(cran);
    [-1,1].forEach(s => { const ckG=new THREE.SphereGeometry(r*.17,6,5); distortGeometry(ckG,.03); const ck=new THREE.Mesh(ckG,bone); ck.position.set(s*r*.34,h*.85,r*.28); group.add(ck); });
    const browBG=new THREE.BoxGeometry(r*.82,.10,.13); distortGeometry(browBG,.022);
    const browB=new THREE.Mesh(browBG,darkBone); browB.position.set(0,h*.92,r*.34); group.add(browB);
    [[-r*.21,r*.37],[r*.21,r*.37]].forEach(([ox,oz]) => {
      const sG=new THREE.SphereGeometry(.105,7,6); const sm=new THREE.Mesh(sG,darkBone); sm.position.set(ox,h*.88,oz); sm.scale.set(.82,.86,.62); group.add(sm);
      const eG=new THREE.SphereGeometry(.075,6,5); const em=new THREE.Mesh(eG,glow); em.position.set(ox,h*.88,oz+.02); group.add(em);
    });
    const jawBG=new THREE.BoxGeometry(r*.62,h*.06,r*.38); distortGeometry(jawBG,.025);
    const jawB=new THREE.Mesh(jawBG,bone); jawB.position.set(0,h*.78,r*.10); jawB.rotation.x=.15; group.add(jawB);
    for (let i=0;i<6;i++) { const tg=new THREE.CylinderGeometry(.019,.024,.08,4); distortGeometry(tg,.01); const tm=new THREE.Mesh(tg,darkBone); tm.position.set((i-2.5)*.09,h*.74,r*.24); tm.rotation.x=Math.PI; group.add(tm); }
    for (let i=0;i<3;i++) { const sg=new THREE.ConeGeometry(.036,h*.11,4); distortGeometry(sg,.015); const sm=new THREE.Mesh(sg,darkBone); sm.position.set((i-1)*.18*r,h*.94,-r*.38); sm.rotation.x=-.5; group.add(sm); }
    // Leg bones — femur + tibia + knee joint
    [-1,1].forEach(s => {
      const femG=new THREE.CylinderGeometry(r*.092,r*.112,h*.32,7); distortGeometry(femG,.022); const fem=new THREE.Mesh(femG,bone); fem.position.set(s*r*.30,h*.06,0); fem.rotation.z=s*.04; group.add(fem);
      const tibG=new THREE.CylinderGeometry(r*.078,r*.092,h*.26,6); distortGeometry(tibG,.020); const tib=new THREE.Mesh(tibG,bone); tib.position.set(s*r*.30,-h*.12,0); group.add(tib);
      const kjG=new THREE.SphereGeometry(r*.11,6,5); distortGeometry(kjG,.03); const kj=new THREE.Mesh(kjG,bone); kj.position.set(s*r*.30,h*.005,0); group.add(kj);
    });
    // Right attackArm + finger bones; static left arm
    const arm=new THREE.Group(); arm.position.set(r*.52,h*.55,0); group.userData.attackArm=arm;
    [0,-h*.16,-h*.35].forEach((y,i) => { const ag=new THREE.CylinderGeometry(r*(.10-i*.01),r*(.12-i*.01),h*.22,7); distortGeometry(ag,.022); const am=new THREE.Mesh(ag,bone); am.position.y=y; am.castShadow=true; arm.add(am); });
    for (let c=0;c<4;c++) { const fg=new THREE.CylinderGeometry(.018,.022,h*.10,4); distortGeometry(fg,.01); const fm=new THREE.Mesh(fg,darkBone); fm.position.set((c-1.5)*.08,-h*.50,0); fm.rotation.x=.3; arm.add(fm); }
    const laG=new THREE.CylinderGeometry(r*.09,r*.11,h*.34,6); distortGeometry(laG,.025); const la=new THREE.Mesh(laG,bone); la.position.set(-r*.52,h*.52,0); la.rotation.z=-.60; group.add(la);
    const la2G=new THREE.CylinderGeometry(r*.07,r*.09,h*.28,5); distortGeometry(la2G,.022); const la2=new THREE.Mesh(la2G,bone); la2.position.set(-r*.72,h*.34,0); la2.rotation.z=-1.0; group.add(la2);
    group.add(arm);
  }

  /* ── Boss: Inferno Drake — multi-segment dragon, scaled body, clawed wings */
  function buildInfernoDrakeShape(group, enemy) {
    const h = enemy.height, r = enemy.radius;
    const scaleM = new THREE.MeshStandardMaterial({ color: 0xcc4400, roughness: 0.72, metalness: 0.22, emissive: 0x551100, emissiveIntensity: 0.35 });
    const bellyM = new THREE.MeshStandardMaterial({ color: 0xdd7733, roughness: 0.85, emissive: 0x220800, emissiveIntensity: 0.18 });
    const darkM  = new THREE.MeshStandardMaterial({ color: 0x1a0500, roughness: 0.80 });
    const eyeM   = new THREE.MeshStandardMaterial({ color: 0xffee00, emissive: 0xff8800, emissiveIntensity: 2.0 });
    const wingM  = new THREE.MeshStandardMaterial({ color: 0x881500, side: THREE.DoubleSide, transparent: true, opacity: 0.88, roughness: 0.90 });
    const hornM  = new THREE.MeshStandardMaterial({ color: 0x0f0200, roughness: 0.55, metalness: 0.4 });
    const fireGlowM = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 3.0, transparent: true, opacity: .65 });

    function drk(geo, mat, px, py, pz, rx, ry, rz, def) {
      if (def) organicDeform(geo, def);
      const m=new THREE.Mesh(geo, mat||scaleM); m.position.set(px||0,py||0,pz||0);
      if (rx||ry||rz) m.rotation.set(rx||0,ry||0,rz||0); m.castShadow=true; group.add(m); return m;
    }

    // 5-segment body (rear-wide tapering to shoulders)
    [[r*.92,r*.80,h*.20,0,h*.22,r*.04],[r*.80,r*.72,h*.19,0,h*.36,r*.02],[r*.70,r*.64,h*.18,0,h*.48,0],[r*.56,r*.50,h*.16,0,h*.58,-r*.02],[r*.42,r*.38,h*.14,0,h*.66,-r*.06]].forEach(([rb,rt,ht,px,py,pz]) => {
      const g=new THREE.CylinderGeometry(rt,rb,ht,10,3); organicDeform(g,.04); const m=new THREE.Mesh(g,scaleM); m.position.set(px,py,pz); m.castShadow=true; group.add(m);
    });
    // Belly plate strips
    for (let i=0;i<4;i++) { const bg=new THREE.BoxGeometry(r*.58,h*.05,r*.42); organicDeform(bg,.02); const bm=new THREE.Mesh(bg,bellyM); bm.position.set(0,h*(.22+i*.10),r*.36); bm.rotation.x=-.2; group.add(bm); }
    // Dorsal spine ridge
    for (let i=0;i<7;i++) { const sg=new THREE.ConeGeometry(.048-i*.004,h*(.13-i*.01),5); organicDeform(sg,.018); const sm=new THREE.Mesh(sg,darkM); sm.position.set(0,h*(.34+i*.06),-r*.66); sm.rotation.x=.50+i*.03; group.add(sm); }

    // 4-section tapering tail
    [[r*.55,r*.62,h*.16],[r*.36,r*.55,h*.14],[r*.20,r*.36,h*.14],[r*.08,r*.20,h*.15]].forEach(([rt,rb,ht],i) => {
      const tg=new THREE.CylinderGeometry(rt,rb,ht,8,2); organicDeform(tg,.045);
      const tm=new THREE.Mesh(tg,scaleM); tm.position.set(0,h*(.09-i*.02),-r*(.55+i*.55)); tm.rotation.x=.3+i*.15; tm.castShadow=true; group.add(tm);
    });
    drk(new THREE.ConeGeometry(.06,h*.14,5), darkM, 0,-h*.04,-r*2.48, .90,0,0, .02);

    // 3-segment neck
    [[r*.44,h*.18,-r*.08],[r*.36,h*.16,-r*.12],[r*.28,h*.14,-r*.08]].forEach(([rad,ht,zOff],i) => {
      const ng=new THREE.CylinderGeometry(rad*.82,rad,ht,8,2); organicDeform(ng,.04);
      const nm=new THREE.Mesh(ng,scaleM); nm.position.set(0,h*(.72+i*.14),zOff+i*r*.30); nm.rotation.x=-.35-i*.12; nm.castShadow=true; group.add(nm);
    });

    // Head + snout + lower jaw + eye ridges + eyes + nostrils + teeth + horns
    const headG=new THREE.SphereGeometry(r*.44,10,8); organicDeform(headG,.04);
    const head=new THREE.Mesh(headG,scaleM); head.position.set(0,h*.86,r*.54); head.scale.set(1.08,.82,1.28); head.castShadow=true; group.add(head);
    drk(new THREE.CylinderGeometry(r*.18,r*.26,h*.26,7,2), scaleM, 0,h*.78,r*.86, Math.PI/2,0,0, .032);
    drk(new THREE.CylinderGeometry(r*.16,r*.24,h*.22,7,2), bellyM, 0,h*.71,r*.86, Math.PI/2,0,0, .028);
    [-1,1].forEach(s => { const erg=new THREE.BoxGeometry(.14,r*.06,.10); organicDeform(erg,.02); const erm=new THREE.Mesh(erg,darkM); erm.position.set(s*r*.24,h*.90,r*.46); erm.rotation.z=s*.25; group.add(erm); });
    [-1,1].forEach(s => { const eg=new THREE.SphereGeometry(.092,7,6); const em=new THREE.Mesh(eg,eyeM); em.position.set(s*r*.24,h*.88,r*.46); group.add(em); });
    [-1,1].forEach(s => { const ng=new THREE.SphereGeometry(.04,5,4); const nm=new THREE.Mesh(ng,darkM); nm.position.set(s*.10,h*.82,r*1.04); group.add(nm); });
    for (let i=0;i<5;i++) { const tg=new THREE.ConeGeometry(.032,.09,4); const tm=new THREE.Mesh(tg,new THREE.MeshLambertMaterial({color:0xeeddbb})); tm.position.set((i-2)*.13,h*.70,r*.84); tm.rotation.x=Math.PI; group.add(tm); }
    [-1,1].forEach(s => { const hrG=new THREE.ConeGeometry(.045,h*.18,5); organicDeform(hrG,.02); const hrM=new THREE.Mesh(hrG,hornM); hrM.position.set(s*r*.30,h*.96,r*.30); hrM.rotation.set(-.20,0,s*.30); group.add(hrM); });

    // Wings — bone struts + 2 membrane panels per side
    [-1,1].forEach(s => {
      [[r*.10,r*1.80],[r*.062,r*1.40],[r*.040,r*1.00]].forEach(([srad,slen],i) => { const sg=new THREE.CylinderGeometry(srad*.6,srad,slen,5); const sm=new THREE.Mesh(sg,hornM); sm.position.set(s*(r*.6+i*r*.56),h*(.57-i*.08),-r*.08); sm.rotation.z=s*(Math.PI/2-.22-i*.12); sm.rotation.x=i*.08; group.add(sm); });
      for (let p=0;p<2;p++) { const pw=r*(1.6-p*.4),ph=h*(.42-p*.08); const pg=new THREE.PlaneGeometry(pw,ph,5,6); distortGeometry(pg,.06); const pm=new THREE.Mesh(pg,wingM); pm.position.set(s*(r*.80+p*r*.60),h*(.50-p*.07),-r*.06); pm.rotation.set(0,s*.15,s*(.16+p*.12)); group.add(pm); }
    });

    // Legs + foot + talons
    [-1,1].forEach(s => {
      const lgG=new THREE.CylinderGeometry(r*.22,r*.26,h*.25,7); organicDeform(lgG,.04); const lg=new THREE.Mesh(lgG,scaleM); lg.position.set(s*r*.75,h*.12,r*.10); lg.rotation.z=s*.25; lg.castShadow=true; group.add(lg);
      const ftG=new THREE.SphereGeometry(r*.22,7,6); organicDeform(ftG,.05); const ft=new THREE.Mesh(ftG,darkM); ft.position.set(s*r*.88,h*.02,r*.22); ft.scale.set(1,.65,1.2); group.add(ft);
      for (let c=0;c<3;c++) { const cg=new THREE.ConeGeometry(.04,h*.08,4); organicDeform(cg,.01); const cm=new THREE.Mesh(cg,hornM); cm.position.set(s*(r*.82+(c-1)*.12),0,r*(.35+c*.06)); cm.rotation.x=.5; group.add(cm); }
    });

    // Right attackArm + claws
    const arm=new THREE.Group(); arm.position.set(r*.88,h*.56,0); group.userData.attackArm=arm;
    const ra1G=new THREE.CylinderGeometry(r*.18,r*.22,h*.24,7,2); organicDeform(ra1G,.04); const ra1=new THREE.Mesh(ra1G,scaleM); ra1.position.y=-h*.13; arm.add(ra1);
    const ra2G=new THREE.CylinderGeometry(r*.12,r*.18,h*.20,6,2); organicDeform(ra2G,.04); const ra2=new THREE.Mesh(ra2G,scaleM); ra2.position.y=-h*.35; arm.add(ra2);
    for (let c=0;c<3;c++) { const cg=new THREE.ConeGeometry(.04,h*.09,4); organicDeform(cg,.01); const cm=new THREE.Mesh(cg,hornM); cm.position.set((c-1)*.12,-h*.48,.08); cm.rotation.x=.5; arm.add(cm); }
    // Fire breath glow at mouth
    const fg=new THREE.Mesh(new THREE.SphereGeometry(r*.14,6,5),fireGlowM); fg.position.set(0,h*.75,r*1.04); group.add(fg);
    group.add(arm);
  }

  function updateEnemyHpBar(enemy, playerX, playerZ) {
    const group = enemyMeshes[enemy.id];
    if (!group) return;
    const sprite = group.children.find(c => c.userData.isHpBar);
    if (!sprite) return;
    const { canvas, ctx, hpTex } = sprite.userData;
    const pct = Math.max(0, enemy.hp / enemy.maxHp);
    ctx.fillStyle = '#300'; ctx.fillRect(0, 0, 128, 16);
    ctx.fillStyle = enemy.isBoss ? '#ff2200' : '#882200';
    ctx.fillRect(1, 1, Math.round(126 * pct), 14);
    hpTex.needsUpdate = true;

    // Proximity opacity: invisible beyond 10 units, fully visible within 4
    if (playerX !== undefined && playerZ !== undefined) {
      const dx   = enemy.x - playerX;
      const dz   = enemy.z - playerZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      sprite.material.opacity = Math.max(0, Math.min(1, (10 - dist) / 6));
    }
  }

  function removeEnemyMesh(id) {
    const m = enemyMeshes[id];
    if (m) { scene.remove(m); delete enemyMeshes[id]; }
  }

  /* ── Per-type attack duration ── */
  function _atkDur(typeKey) {
    if (typeKey === 'troll')  return 0.55;
    if (typeKey === 'goblin') return 0.20;
    if (typeKey === 'wraith') return 0.28;
    return 0.32;
  }

  /* ── Enemy animations: wind-up, swing, stagger, death, walk ── */
  function updateEnemyAnimations(enemies, dt) {
    enemies.forEach(e => {
      const mesh = enemyMeshes[e.id];
      if (!mesh) return;

      // ── Death animation ──
      if (e.dead) {
        if ((e.deathAnim || 0) > 0) {
          e.deathAnim -= dt;
          const p = 1.0 - Math.max(0, e.deathAnim) / 0.45;
          mesh.rotation.x = p * 1.5;
          mesh.position.y = -p * 0.45;
          const hpSprite = mesh.children.find(c => c.userData.isHpBar);
          if (hpSprite) hpSprite.visible = false;
        }
        return;
      }

      // ── HP bar blink on hit ──
      const hpSprite = mesh.children.find(c => c.userData.isHpBar);
      if (hpSprite) {
        hpSprite.visible = e.hitFlash <= 0 || (Math.floor(e.hitFlash) % 2 === 0);
      }

      // ── Decrement timers ──
      if (e.atkAnim  > 0) e.atkAnim  = Math.max(0, e.atkAnim  - dt);
      if (e.staggerT > 0) e.staggerT = Math.max(0, e.staggerT - dt);

      const arm = mesh.userData.attackArm;

      // ── Stagger / knockback (takes priority) ──
      if (e.staggerT > 0) {
        const p = e.staggerT / 0.25;
        mesh.position.x = e.x + (e.knockDX || 0) * p * 0.55;
        mesh.position.z = e.z + (e.knockDZ || 0) * p * 0.55;
        mesh.rotation.x = -p * 0.4;
        mesh.position.y  = p * 0.07;
        return;
      }

      // Ease stagger rotation back
      if (Math.abs(mesh.rotation.x) > 0.01) mesh.rotation.x *= 0.72;
      else mesh.rotation.x = 0;

      // ── Attack animation (wind-up → strike) ──
      if (e.atkAnim > 0) {
        const dur      = _atkDur(e.typeKey);
        const progress = 1.0 - (e.atkAnim / dur);

        if (progress < 0.35) {
          // Wind-up phase: arm pulls back, enemy crouches slightly
          const wp = progress / 0.35;
          mesh.position.x = e.x;
          mesh.position.z = e.z;
          mesh.rotation.x = wp * 0.18;
          mesh.position.y = wp * 0.06;
          if (arm) arm.rotation.x = 1.0 + wp * 0.9;
        } else {
          // Strike phase: drive forward with type-specific style
          const sp    = (progress - 0.35) / 0.65;
          const swing = Math.sin(sp * Math.PI);

          if (e.typeKey === 'troll') {
            // Heavy overhead slam — huge lunge, exaggerated arm
            const lunge = swing * 0.75;
            mesh.position.x = e.x + Math.sin(mesh.rotation.y) * lunge;
            mesh.position.z = e.z + Math.cos(mesh.rotation.y) * lunge;
            mesh.position.y = swing * 0.08;
            mesh.rotation.x = -swing * 0.25;
            if (arm) arm.rotation.x = 1.9 - swing * 3.8;

          } else if (e.typeKey === 'goblin') {
            // Quick side swipe
            const lunge = swing * 0.28;
            mesh.position.x = e.x + Math.sin(mesh.rotation.y) * lunge;
            mesh.position.z = e.z + Math.cos(mesh.rotation.y) * lunge;
            mesh.rotation.x = 0;
            if (arm) {
              arm.rotation.x = 0.4 - swing * 1.8;
              arm.rotation.z = swing * 0.7;
            }

          } else if (e.typeKey === 'wraith') {
            // Gliding phase lunge — rises up then dives
            const lunge = swing * 0.6;
            mesh.position.x = e.x + Math.sin(mesh.rotation.y) * lunge;
            mesh.position.z = e.z + Math.cos(mesh.rotation.y) * lunge;
            mesh.position.y = 0.1 + swing * 0.3;
            if (arm) arm.rotation.x = -swing * 1.6;

          } else {
            // Default overhand chop (skeleton, shardgolem, archer)
            const lunge = swing * 0.45;
            mesh.position.x = e.x + Math.sin(mesh.rotation.y) * lunge;
            mesh.position.z = e.z + Math.cos(mesh.rotation.y) * lunge;
            mesh.position.y = 0;
            if (arm) arm.rotation.x = 1.0 - swing * 2.2;
          }
        }
        return;
      }

      // ── Idle / walk animation ──
      mesh.position.x = e.x;
      mesh.position.z = e.z;

      if (e.state === 'chase') {
        e._walkT = (e._walkT || 0) + dt;

        if (e.typeKey === 'troll') {
          const s = Math.sin(e._walkT * 4.5);
          mesh.position.y = Math.abs(s) * 0.13;
          if (arm) arm.rotation.x = s * 0.45;

        } else if (e.typeKey === 'wraith') {
          mesh.position.y = 0.2 + Math.sin(e._walkT * 3.0) * 0.09;
          if (arm) arm.rotation.x = Math.sin(e._walkT * 3.0) * 0.12;

        } else {
          const step = Math.sin(e._walkT * 8);
          mesh.position.y = Math.abs(step) * 0.06;
          if (arm) arm.rotation.x = step * 0.28;

          if (e.typeKey === 'skeleton' || e.typeKey === 'archer') {
            const legL = mesh.children.find(c => c.userData.isSkelLeg === 'left');
            const legR = mesh.children.find(c => c.userData.isSkelLeg === 'right');
            if (legL) legL.rotation.x =  step * 0.55;
            if (legR) legR.rotation.x = -step * 0.55;
          }
        }
        if (arm) arm.rotation.z *= 0.8;

      } else {
        // Idle — settle back to rest
        if (e.typeKey === 'wraith') {
          e._walkT = (e._walkT || 0) + dt;
          mesh.position.y = 0.15 + Math.sin(e._walkT * 2.0) * 0.05;
        } else {
          mesh.position.y *= 0.88;
        }
        if (arm) {
          arm.rotation.x *= 0.75;
          arm.rotation.z *= 0.75;
          if (Math.abs(arm.rotation.x) < 0.01) arm.rotation.x = 0;
        }
        if (e.typeKey === 'skeleton' || e.typeKey === 'archer') {
          const legL = mesh.children.find(c => c.userData.isSkelLeg === 'left');
          const legR = mesh.children.find(c => c.userData.isSkelLeg === 'right');
          if (legL) legL.rotation.x *= 0.8;
          if (legR) legR.rotation.x *= 0.8;
        }
      }
    });
  }
  function distortGeometry(geometry, amount = 0.05) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + (Math.random() - 0.5) * amount,
      pos.getY(i) + (Math.random() - 0.5) * amount,
      pos.getZ(i) + (Math.random() - 0.5) * amount
    );
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}
  /* ── Exit (build stairs after boss dies) ─────── */
  function buildExitPortal(dungeon) {
    buildStairs(dungeon);
  }

  function removeExitPortal() {
    if (portalMesh) { scene.remove(portalMesh); portalMesh = null; }
  }

  function revealExitPortal() {
    if (!portalMesh) return;
    portalRiseY  = -5;
    portalRising = true;
    portalMesh.position.y = portalRiseY;
  }

  /* ── Arrival portal (above start room on floor entry) ── */
  function buildArrivalPortal(dungeon) {
    if (arrivalPortal) { scene.remove(arrivalPortal); arrivalPortal = null; }
    const sc  = dungeon.roomCenter(dungeon.startRoom);
    const w   = dungeon.toWorld(sc.cx, sc.cy);
    const grp = new THREE.Group();

    const discGeo = new THREE.CircleGeometry(1.3, 32);
    const disc    = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0x6611cc, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    grp.add(disc);

    const innerGeo = new THREE.CircleGeometry(0.75, 24);
    const inner    = new THREE.Mesh(innerGeo, new THREE.MeshBasicMaterial({ color: 0xcc88ff, side: THREE.DoubleSide }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.02;
    grp.add(inner);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.1, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0xaa66ff })
    );
    ring.rotation.x = Math.PI / 2;
    grp.add(ring);

    const light = new THREE.PointLight(0x7722ff, 3.0, 12);
    light.decay = 2;
    light.castShadow = true;
    light.shadow.mapSize.set(128, 128);
    light.shadow.camera.near = 0.2;
    light.shadow.camera.far = 12;
    grp.add(light);

    grp.position.set(w.x, 3.5, w.z);
    scene.add(grp);
    arrivalPortal = grp;
  }

  function removeArrivalPortal() {
    if (arrivalPortal) { scene.remove(arrivalPortal); arrivalPortal = null; }
  }

  /* ── Particles ───────────────────────────────── */
  function spawnParticles(x, y, z, color, count = 8, speed = 3, life = 0.6) {
    for (let i = 0; i < count; i++) {
      const geo  = new THREE.SphereGeometry(0.06 + Math.random()*0.08, 4, 3);
      const mat  = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      const a  = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * Math.PI;
      const s  = speed * (0.5 + Math.random() * 0.8);
      mesh.userData = {
        vx: Math.cos(a)*Math.cos(el)*s,
        vy: Math.sin(el)*s + 2,
        vz: Math.sin(a)*Math.cos(el)*s,
        life, maxL: life,
      };
      scene.add(mesh);
      particles.push(mesh);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.userData.life -= dt;
      if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); continue; }
      p.position.x += p.userData.vx * dt;
      p.position.y += p.userData.vy * dt;
      p.position.z += p.userData.vz * dt;
      p.userData.vy -= 6 * dt;
      p.scale.setScalar(p.userData.life / p.userData.maxL);
    }
  }

  /* ── Torch / lantern flicker ─────────────────── */
  let _flickerFrame = 0;
  function updateTorchFlicker(t) {
    _flickerFrame++;
    const doFlame = (_flickerFrame % 2) === 0;

    for (const l of lanternLights) {
      const ud        = l.userData;
      const isCarried = ud.torch === carriedTorch;
      const target    = ud.targetBase ?? 0;

      // Lerp currentBase toward target — smooth room transitions and distance fade
      let cur = ud.currentBase ?? 0;
      cur += (target - cur) * 0.1;
      if (Math.abs(cur - target) < 0.01) cur = target;
      ud.currentBase = cur;

      // Skip completely inactive lights (not fading, not carried)
      if (cur === 0 && !isCarried) { l.intensity = 0; continue; }

      // Distance-based scale — updates every frame as player moves
      let distScale = 1.0;
      if (!isCarried && cur > 0) {
        const dx   = l.position.x - _playerX;
        const dz   = l.position.z - _playerZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        distScale  = Math.max(0.15, 1.0 - (dist / LANTERN_RADIUS) * 0.85);
      }

      const base = isCarried ? LANTERN_INTENSITY * 1.5 : cur * distScale;

      // Flicker on top of distance-scaled base
      const f = Math.sin(t * 3.5 + ud.flameOffset) * 0.12 +
                Math.sin(t * 6.2 + ud.flameOffset) * 0.06;
      l.intensity = Math.max(0, base + f * 1.4);

      if (doFlame) animateFlame(ud.flame, t, ud.flameOffset);
    }
  }

  /* ── Tile → room index (O(1) lookup) ────────── */
  function _buildTileRoomIndex(dungeon) {
    const { COLS, ROWS } = dungeon;
    _tileRoomCols = COLS;
    _tileRoomId   = new Array(COLS * ROWS).fill(null);
    if (typeof RoomManager === 'undefined') return;
    const rm = RoomManager.arrays();
    for (let ri = 0; ri < rm.count; ri++) {
      const ox = rm.originX[ri], oz = rm.originZ[ri];
      const w  = rm.width[ri],   h  = rm.length[ri];
      const id = rm.ids[ri];
      for (let rz = oz; rz < oz + h; rz++) {
        for (let rx = ox; rx < ox + w; rx++) {
          _tileRoomId[rz * COLS + rx] = id;
        }
      }
    }
  }

  function _getTileRoomId(worldX, worldZ, tile) {
    if (!_tileRoomId) return null;
    const gx = Math.floor(worldX / tile);
    const gz = Math.floor(worldZ / tile);
    const idx = gz * _tileRoomCols + gx;
    if (idx < 0 || idx >= _tileRoomId.length) return null;
    return _tileRoomId[idx];
  }

  // Rebuild the set of room IDs whose torches should be considered.
  // Called only when the player moves into a new room or tile zone.
  // Includes the current room + any room whose bounds touch the player's range box.
  function _rebuildScanRooms(pgx, pgz, currentRoomId) {
    _scanRoomIds.clear();
    if (currentRoomId !== null) _scanRoomIds.add(currentRoomId);
    if (typeof RoomManager === 'undefined') return;
    const rm = RoomManager.arrays();
    const R  = LANTERN_ACTIVE_TILES_X;
    for (let i = 0; i < rm.count; i++) {
      const id = rm.ids[i];
      if (_scanRoomIds.has(id)) continue;
      // AABB overlap between player range box and room bounds
      const ox = rm.originX[i], oz = rm.originZ[i];
      const ex = ox + rm.width[i], ez = oz + rm.length[i];
      if (pgx + R >= ox && pgx - R < ex && pgz + R >= oz && pgz - R < ez) {
        _scanRoomIds.add(id);
      }
    }
  }

  /* ── Lantern activation ──────────────────────── */
  function updateActiveLanternLights(player, dt) {
    if (!player) return;

    const tile = _cameraDungeon ? _cameraDungeon.TILE : 4;
    const px = player.x, pz = player.z;
    const pgx = Math.floor(px / tile);
    const pgz = Math.floor(pz / tile);

    const currentRoomId = _getTileRoomId(px, pz, tile);
    if (currentRoomId !== _cachedRoomId) {
      _cachedRoomId = currentRoomId;
      _rebuildScanRooms(pgx, pgz, currentRoomId);
      if (typeof RoomManager !== 'undefined') RoomManager.updateShadows(_scanRoomIds);
    }

    if (typeof SpatialManager === 'undefined') return;

    // Skip spatial query if player hasn't moved meaningfully since last update
    const _dxL = px - (_lastLanternPx ?? px + 1);
    const _dzL = pz - (_lastLanternPz ?? pz + 1);
    if (_dxL * _dxL + _dzL * _dzL < 0.09 && _lastTorchFingerprint !== 0) return;
    _lastLanternPx = px;
    _lastLanternPz = pz;

    // Proximity visibility — show/hide sconces and chests using 4×4 spatial grid.
    // Runs only when player has moved. Grid query replaces full O(n) scan.
    if (!_torchGrid) _torchGrid = _buildGrid(wallTorches, t => t.x, t => t.z);
    if (!_chestGrid) _chestGrid = _buildGrid(chestMeshes, m => m.position.x, m => m.position.z);

    const _SCONCE_R   = LANTERN_RADIUS + 14; // ~52 world units
    const _SCONCE_RSQ = _SCONCE_R * _SCONCE_R;
    if (_torchGrid) {
      const _nowVisible = new Set(_gridQuery(_torchGrid, px, pz, _SCONCE_R));
      // hide torches that left range
      for (const _vi of _visibleTorchSet) {
        if (!_nowVisible.has(_vi)) {
          const _t = wallTorches[_vi];
          if (_t.holder) _t.holder.visible = false;
          if (_t.torch && _t !== carriedTorch) _t.torch.visible = false;
        }
      }
      // show torches newly in range (with distance check since cells can straddle boundary)
      for (const _vi of _nowVisible) {
        const _t = wallTorches[_vi];
        const _dx = _t.x - px, _dz = _t.z - pz;
        const _vis = _dx * _dx + _dz * _dz <= _SCONCE_RSQ;
        if (_t.holder  && _t.holder.visible  !== _vis) _t.holder.visible  = _vis;
        if (_t.torch   && _t !== carriedTorch && _t.torch.visible !== _vis) _t.torch.visible = _vis;
        if (_vis) _nowVisible.add(_vi); else _nowVisible.delete(_vi);
      }
      _visibleTorchSet.clear();
      for (const _vi of _nowVisible) _visibleTorchSet.add(_vi);
    }

    const _CHEST_R   = LANTERN_RADIUS * 2; // ~76 world units
    const _CHEST_RSQ = _CHEST_R * _CHEST_R;
    if (_chestGrid) {
      const _nowVisible = new Set(_gridQuery(_chestGrid, px, pz, _CHEST_R));
      for (const _ci of _visibleChestSet) {
        if (!_nowVisible.has(_ci)) { const _g = chestMeshes[_ci]; if (_g.visible) _g.visible = false; }
      }
      for (const _ci of _nowVisible) {
        const _g = chestMeshes[_ci];
        const _dx = _g.position.x - px, _dz = _g.position.z - pz;
        const _vis = _dx * _dx + _dz * _dz <= _CHEST_RSQ;
        if (_g.visible !== _vis) _g.visible = _vis;
        if (_vis) _nowVisible.add(_ci); else _nowVisible.delete(_ci);
      }
      _visibleChestSet.clear();
      for (const _ci of _nowVisible) _visibleChestSet.add(_ci);
    }

    // Query nearby light indices — wallTorches[i] aligns with LightManager slot i
    let candidates = SpatialManager.query('lights', [px, pz], LANTERN_RADIUS)
      .filter(i => { const t = wallTorches[i]; return t && t.hasTorch && t !== carriedTorch; });

    // Cap to nearest MAX_ACTIVE_LANTERN_LIGHTS, sort by distance first
    if (candidates.length > MAX_ACTIVE_LANTERN_LIGHTS) {
      candidates = candidates
        .map(i => { const t = wallTorches[i]; const dx = t.x - px, dz = t.z - pz; return { i, d2: dx * dx + dz * dz }; })
        .sort((a, b) => a.d2 - b.d2)
        .slice(0, MAX_ACTIVE_LANTERN_LIGHTS)
        .map(x => x.i);
    }

    // FNV-1a fingerprint on sorted indices for stable change detection
    let fp = 2166136261;
    for (let k = 0; k < candidates.length; k++) {
      fp ^= candidates[k];
      fp  = Math.imul(fp, 16777619) >>> 0;
    }
    if (fp === _lastTorchFingerprint && wallTorches.length === _lastWallTorchCount) return;
    _lastTorchFingerprint = fp;
    _lastWallTorchCount   = wallTorches.length;

    const activeSet = new Set(candidates);
    for (let i = 0; i < wallTorches.length; i++) {
      const t = wallTorches[i];
      if (t === carriedTorch) continue;
      if (activeSet.has(i)) activateWallTorchLight(t);
      else                  deactivateWallTorchLight(t);
    }
  }

  // Snap nearby lanterns to full brightness instantly — call once after dungeon loads
  // so spawn-area torches don't fade in from dark.
  function snapLanternsToPlayer(px, pz) {
    if (typeof SpatialManager === 'undefined') return;
    const candidates = SpatialManager.query('lights', [px, pz], LANTERN_RADIUS)
      .filter(i => { const t = wallTorches[i]; return t && t.hasTorch; });
    const activeSet = new Set(candidates);
    for (let i = 0; i < wallTorches.length; i++) {
      const t = wallTorches[i];
      if (!t.light) continue;
      if (activeSet.has(i)) {
        setWallTorchBrightNow(t);
      }
    }
    _lastLanternPx = null; // force a full re-query next frame
    _lastTorchFingerprint = 0;
  }

function updateTorchInteractionAnimations(dt) {
    const step = dt || 0.016;
    if (torchInteractAnim) {
      torchInteractAnim.t += step;
      if (torchInteractAnim.t >= torchInteractAnim.duration) torchInteractAnim = null;
    }
    if (chestInteractAnim) {
      chestInteractAnim.t += step;
      if (chestInteractAnim.t >= chestInteractAnim.duration) chestInteractAnim = null;
    }

    for (const t of wallTorches) {
      const anim = t.torch.userData.anim;
      if (!anim) continue;
      anim.t = Math.min(anim.duration, anim.t + step);

      if (anim.mode === 'pick') {
        // Position lerp (wall → hand) is handled entirely by updateCarriedTorch; just track timer
        t.torch.visible = true;
        if (anim.t >= anim.duration) t.torch.userData.anim = null;
      } else {
        // 'place': animate the sconce torch from raised position back down to the wall mount
        const p  = anim.t / anim.duration;
        const ease = p < 0.5 ? 2*p*p : 1-Math.pow(-2*p+2,2)/2;
        const lift = 1 - ease;
        t.torch.position.x = t.torch.userData.homeX + anim.awayX * lift;
        t.torch.position.y = t.torch.userData.homeY + anim.lift * lift;
        t.torch.position.z = t.torch.userData.homeZ + anim.awayZ * lift;
        t.torch.rotation.x = -0.35 * lift;
        if (anim.t >= anim.duration) {
          t.torch.userData.anim = null;
          t.torch.position.set(t.torch.userData.homeX, t.torch.userData.homeY, t.torch.userData.homeZ);
          t.torch.rotation.x = 0;
        }
      }
    }
  }

  function updateCarriedTorch(player) {
    if (!carriedTorch || !player) return;
    const carriedLight = carriedTorch.light;
    if (!carriedLight) return;

    // Compute target hand position (forearm tip via localToWorld)
    let hx, hy, hz;
    if (playerMesh) {
      const torchArm = playerMesh.userData.torchArm;
      if (torchArm) {
        playerMesh.updateMatrixWorld(true);
        const tip = new THREE.Vector3(0.08, -0.49, 0);
        torchArm.localToWorld(tip);
        hx = tip.x; hy = tip.y; hz = tip.z;
      }
    }
    if (hx === undefined) {
      hx = player.x + Math.sin(aimAngle)*0.40 + Math.cos(aimAngle)*0.14;
      hz = player.z - Math.cos(aimAngle)*0.40 + Math.sin(aimAngle)*0.14;
      hy = (player._descentY || 0) + 0.85;
    }
    // Hand grips handle bottom; torch origin is at collar, so offset up by handle length
    const tx = hx, ty = hy + 0.50, tz = hz;

    const anim = carriedTorch.torch.userData.anim;
    if (anim && anim.mode === 'pick') {
      // Smooth grab: lerp torch from wall-mount position to hand over the anim duration
      const p    = anim.t / anim.duration;
      const ease = p < 0.5 ? 2*p*p : 1-Math.pow(-2*p+2,2)/2;
      const wx   = carriedTorch.torch.userData.homeX;
      const wy   = carriedTorch.torch.userData.homeY;
      const wz   = carriedTorch.torch.userData.homeZ;
      const x = wx + (tx - wx) * ease;
      const y = wy + (ty - wy) * ease;
      const z = wz + (tz - wz) * ease;
      carriedTorch.torch.visible = true;
      carriedTorch.torch.position.set(x, y, z);
      const torchRotation = -aimAngle + Math.PI / 2;
      carriedTorch.torch.rotation.y = torchRotation;
      carriedTorch.torch.rotation.x = 0;
      const flamePos = torchFlameWorldPosition(x, y, z, torchRotation);
      carriedLight.position.set(flamePos.x, flamePos.y, flamePos.z);
      carriedLight.visible = true;
      return;
    }

    // Steady carry: torch upright at hand position
    carriedTorch.torch.visible = true;
    carriedTorch.torch.position.set(tx, ty, tz);
    const torchRotation = -aimAngle + Math.PI / 2;
    carriedTorch.torch.rotation.y = torchRotation;
    carriedTorch.torch.rotation.x = 0;
    const flamePos = torchFlameWorldPosition(tx, ty, tz, torchRotation);
    carriedLight.position.set(flamePos.x, flamePos.y, flamePos.z);
    carriedLight.visible = true;
  }

  function startChestOpenAnimation(chestX, chestZ, playerX, playerZ) {
    const dx = playerX - chestX, dz = playerZ - chestZ;
    const d  = Math.sqrt(dx * dx + dz * dz) || 1;
    chestInteractAnim = {
      t: 0, duration: 1.25,
      chestX, chestZ,
      startX: playerX, startZ: playerZ,
      // Stand 0.72 units in front of the chest (between player and chest)
      targetX: chestX + (dx / d) * 0.72,
      targetZ: chestZ + (dz / d) * 0.72,
      // Aim the player toward the chest during the approach
      aimStart: aimAngle,
      aimTarget: Math.atan2(-dz / d, -dx / d),
    };
  }

  function torchReachAmount() {
    if (!torchInteractAnim) return 0;
    const p = Math.min(1, torchInteractAnim.t / torchInteractAnim.duration);
    if (p < 0.35) return p / 0.35;
    if (p > 0.72) return 1 - (p - 0.72) / 0.28;
    return 1;
  }

  function chestOpenAmount() {
    if (!chestInteractAnim) return 0;
    const p = Math.min(1, chestInteractAnim.t / chestInteractAnim.duration);
    // walk 0-0.30 | arms reach 0.30-0.50 | hold+push 0.50-0.85 | retract 0.85-1.0
    if (p < 0.30) return 0;
    if (p < 0.50) return (p - 0.30) / 0.20;
    if (p > 0.85) return 1 - (p - 0.85) / 0.15;
    return 1;
  }

  function updateCamera(player) {
    const camDist  = 4.2;   // orbit radius behind player
    const camH     = 3.8;   // camera height
    const descentY = player._descentY || 0;
    const clampedY = Math.min(descentY, 0);

    const camX = player.x - Math.cos(aimAngle) * camDist;
    const camZ = player.z - Math.sin(aimAngle) * camDist;

    camera.position.set(camX, camH + clampedY, camZ);
    camera.lookAt(player.x + Math.cos(aimAngle) * 1.5, 0.9 + clampedY, player.z + Math.sin(aimAngle) * 1.5);
  }

  /* ── Flash player ────────────────────────────── */
  function flashPlayer(on) {
    if (!playerMesh) return;
    playerMesh.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.emissive          = on ? new THREE.Color(0xff0000) : new THREE.Color(0x000000);
        child.material.emissiveIntensity = on ? 0.9 : 0;
      }
    });
  }

  /* ── Main render ─────────────────────────────── */
  function render(player, t, dt) {
    if (player) { _playerX = player.x; _playerZ = player.z; }
    updateTorchInteractionAnimations(dt || 0.016);
    updateActiveLanternLights(player, dt || 0.016);

    if (playerMesh) {
      const dy = player._descentY || 0;
      playerMesh.visible = dy < 1.2; // hide while inside arrival portal (y≈3.5), emerge below it
      playerMesh.position.set(player.x, dy, player.z);
      playerMesh.rotation.y = -aimAngle + Math.PI / 2;

      // ── Walking leg & arm animation ───────────────
      if (player._moving) player._walkT = (player._walkT || 0) + (dt || 0.016) * 7.5;
      const walkSwing = player._moving ? Math.sin(player._walkT) * 0.42 : 0;
      playerMesh.children.forEach(c => {
        if (!c.userData.isLeg) return;
        const target = c.userData.isLeg === 'left' ? walkSwing : -walkSwing;
        c.rotation.x += (target - c.rotation.x) * 0.25;
      });
      const torchArmMesh  = playerMesh.userData.torchArm;
      const weaponArmMesh = playerMesh.userData.weaponArm;
      const chestReach = chestOpenAmount();
      // Blend aimAngle toward chest during the walk phase so player faces it
      if (chestInteractAnim && chestInteractAnim.aimTarget !== undefined) {
        const walkEnd = chestInteractAnim.duration * 0.32;
        if (chestInteractAnim.t < walkEnd) {
          const wp = chestInteractAnim.t / walkEnd;
          let diff = chestInteractAnim.aimTarget - chestInteractAnim.aimStart;
          while (diff >  Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          aimAngle = chestInteractAnim.aimStart + diff * (1 - (1 - wp) * (1 - wp));
        }
      }

      if (torchArmMesh) {
        const reach = torchReachAmount();
        const carry = carryingTorch ? 1.4 : 0;
        // chestReach negative = forward for torchArm; inward on z (positive brings arm toward center)
        const torchTarget = -walkSwing * 0.35 - reach * 1.15 - carry * 0.55 - chestReach * 0.82;
        torchArmMesh.rotation.x += (torchTarget - torchArmMesh.rotation.x) * 0.2;
        torchArmMesh.rotation.z += (reach * 0.55 + carry * 0.28 + chestReach * 0.26 - torchArmMesh.rotation.z) * 0.18;
      }
      if (weaponArmMesh && !weaponArmMesh.userData.swinging) {
        // chestReach positive = forward for weaponArm; inward on z (positive from -0.15 base)
        const wArmTarget = walkSwing * 0.3 + chestReach * 0.85;
        weaponArmMesh.rotation.x += (wArmTarget - weaponArmMesh.rotation.x) * 0.2;
        weaponArmMesh.rotation.z += (-0.15 + chestReach * 0.28 - weaponArmMesh.rotation.z) * 0.18;
      }

      // Weapon arm swing — 3-phase overhead: windup → strike → recover
      const arm = playerMesh.userData.weaponArm;
      if (arm && arm.userData.swinging) {
        arm.userData.swingT = Math.min(1, arm.userData.swingT + (dt || 0.016) * 3.8);
        const st = arm.userData.swingT;
        if (st < 0.25) {
          // Windup: pull arm back
          const p = st / 0.25;
          arm.rotation.x = -1.0 * (p * p);
          arm.rotation.z = -0.15 - 0.35 * (p * p);
        } else if (st < 0.72) {
          // Strike: swing arm hard forward (ease-out)
          const p = (st - 0.25) / 0.47;
          const e = 1 - (1 - p) * (1 - p);
          arm.rotation.x = -1.0 + 2.6 * e;
          arm.rotation.z = -0.5  + 0.5 * e;
        } else {
          // Recover: return to rest
          const p = (st - 0.72) / 0.28;
          arm.rotation.x = 1.6 * (1 - p * p);
          arm.rotation.z = -0.15;
        }
        if (arm.userData.swingT >= 1) {
          arm.userData.swinging = false;
          arm.rotation.x = 0;
          arm.rotation.z = -0.15;
        }
      }
    }

    // Spin stair portal
   /* if (portalMesh) {
      portalMesh.children.forEach(c => {
        if (c.userData.isPortalDisc) c.rotation.z += 0.02;
        if (c.userData.isPortalRing) c.rotation.z -= 0.015;
      });
    }
*/
    // Portal rise: eases up from y=-5 to y=0 over ~2.5s after boss dies
    if (portalRising && portalMesh) {
      portalRiseY = Math.min(0, portalRiseY + (dt || 0.016) * 2.2);
      portalMesh.position.y = portalRiseY;
      if (portalRiseY >= 0) portalRising = false;
    }

    // Spin portal rings while visible
    if (portalMesh && portalMesh.position.y > -4) {
      portalMesh.children.forEach(c => {
        if (c.userData.isPortalDisc) c.rotation.z += 0.018;
        if (c.userData.isPortalRing) c.rotation.z -= 0.012;
      });
    }

    updateDoor(dt || 0.016);
    updateCamera(player);
    // Carried torch runs last so it reads this frame's arm pose via localToWorld
    updateCarriedTorch(player);
    renderer.render(scene, camera);
  }

  /* ── Projectile bolts (Bone Archer) ─────────── */
  function fireBolt(bx, bz, vx, vz, dmg, kind = 'arrow') {
    let mesh;
    let hitRadius = 0.28;
    if (kind === 'fireball') {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xff4a12 })
      );
      const glow = new THREE.PointLight(0xff6a18, 0.9, 4);
      mesh.add(glow);
      hitRadius = 0.42;
    } else if (kind === 'earth_spike') {
      mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.55, 5),
        new THREE.MeshLambertMaterial({ color: 0x7a6040 })
      );
      mesh.rotation.x = Math.PI / 2;
      hitRadius = 0.36;
    } else {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.38, 5),
        new THREE.MeshBasicMaterial({ color: 0xccccaa })
      );
      mesh.rotation.z = Math.PI / 2;
    }
    mesh.rotation.y = Math.atan2(vx, vz);
    mesh.position.set(bx, 1.1, bz);
    scene.add(mesh);
    bolts.push({ x: bx, z: bz, vx, vz, dmg, kind, hitRadius, life: 3.0, mesh });
  }

  function updateBolts(dt, player) {
    let dmgDealt = 0;
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.mesh.position.x = b.x;
      b.mesh.position.z = b.z;
      // Rotate bolt to face travel direction
      b.mesh.rotation.y = Math.atan2(b.vx, b.vz);
      const dx = player.x - b.x, dz = player.z - b.z;
      const hitR = b.hitRadius || 0.28;
      const hit = b.life > 0 && (dx * dx + dz * dz) < hitR * hitR;
      if (b.life <= 0 || hit) {
        scene.remove(b.mesh);
        if (hit) dmgDealt += b.dmg;
        bolts.splice(i, 1);
      }
    }
    return dmgDealt;
  }

  /* ── Clear dynamic objects ───────────────────── */
  function clearDynamic() {
    Object.values(enemyMeshes).forEach(m => scene.remove(m));
    enemyMeshes = {};
    chestMeshes.forEach(m => scene.remove(m));
    chestMeshes = []; _chestGrid = null; _visibleChestSet.clear();
    particles.forEach(p => scene.remove(p));
    particles = [];
    if (portalMesh) { scene.remove(portalMesh); portalMesh = null; }
    if (doorMesh)   { scene.remove(doorMesh);   doorMesh  = null; doorOpen = false; }
    bolts.forEach(b => scene.remove(b.mesh));
    bolts = [];
    portalRising = false;
    portalRiseY  = -5;
    stairDescending  = false;
    stairDescentDone = false;
    stairDescentPhase = 'walk';
  }

  /* ── Texture helpers ─────────────────────────── */
  function makeBrickTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a0d06'; ctx.fillRect(0, 0, 128, 128);
    const bW = 32, bH = 16;
    for (let row = 0; row < 8; row++) {
      const off = (row % 2) * 16;
      for (let col = -1; col < 5; col++) {
        const shade = 20 + Math.floor(Math.random() * 25);
        ctx.fillStyle = `rgb(${55+shade},${30+shade},${15+shade})`;
        ctx.fillRect(col*bW+off+1, row*bH+1, bW-2, bH-2);
      }
    }
    ctx.strokeStyle = '#0f0805'; ctx.lineWidth = 1;
    for (let row = 0; row <= 8; row++) { ctx.beginPath(); ctx.moveTo(0,row*bH); ctx.lineTo(128,row*bH); ctx.stroke(); }
    return new THREE.CanvasTexture(c);
  }

  function makeFloorTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5a4a38'; ctx.fillRect(0, 0, 256, 256);
    const ts = 32;
    for (let y = 0; y < 256; y += ts) {
      for (let x = 0; x < 256; x += ts) {
        const shade = 50 + Math.floor(Math.random() * 50);
        ctx.fillStyle = `rgb(${88+shade},${68+shade},${48+shade})`;
        ctx.fillRect(x+1, y+1, ts-2, ts-2);
      }
    }
    ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += ts) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(256,y); ctx.stroke(); }
    for (let x = 0; x <= 256; x += ts) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,256); ctx.stroke(); }
    for (let i = 0; i < 60; i++) {
      const x = Math.random()*256, y = Math.random()*256, sz = 8+Math.random()*14;
      ctx.fillStyle = `rgba(70,110,50,${0.3+Math.random()*0.3})`;
      ctx.beginPath(); ctx.arc(x,y,sz,0,Math.PI*2); ctx.fill();
    }
    return new THREE.CanvasTexture(c);
  }

  function makeBossFloorTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a1208'; ctx.fillRect(0, 0, 256, 256);
    const ts = 40;
    for (let y = 0; y < 256; y += ts) {
      for (let x = 0; x < 256; x += ts) {
        const shade = Math.floor(Math.random()*20);
        ctx.fillStyle = `rgb(${28+shade},${18+shade},${10+shade})`;
        ctx.fillRect(x+1, y+1, ts-2, ts-2);
      }
    }
    ctx.strokeStyle = '#3a0808'; ctx.lineWidth = 1.5;
    for (let y = 0; y <= 256; y += ts) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(256,y); ctx.stroke(); }
    for (let x = 0; x <= 256; x += ts) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,256); ctx.stroke(); }
    ctx.fillStyle = 'rgba(120,0,0,0.18)';
    ctx.beginPath(); ctx.arc(128,128,60,0,Math.PI*2); ctx.fill();
    return new THREE.CanvasTexture(c);
  }


  /* ── Pointer lock ────────────────────────────── */
  let mouseDX = 0;

  function updateAimFromMouse() {
    aimAngle += mouseDX * 0.008;
    mouseDX = 0;
    return aimAngle;
  }

  function initPointerLock() {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
    const mount = document.getElementById('canvasMount');
    mount.addEventListener('click', () => {
      if (!document.pointerLockElement) mount.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === mount) {
        // Lock acquired — resume mouse tracking and close pause menu
        document.addEventListener('mousemove', onLockedMouseMove);
        if (typeof UI !== 'undefined') UI.closePauseMenu();
      } else {
        // Lock lost — stop mouse tracking; open pause menu if game is active
        document.removeEventListener('mousemove', onLockedMouseMove);
        mouseDX = 0;
        if (typeof UI !== 'undefined' && typeof Game !== 'undefined' && Game.getPlayer()) {
          UI.openPauseMenu();
        }
      }
    });
  }
 function organicDeform(mesh, intensity = 0.05) {
  const g = mesh.geometry;
  const pos = g.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const noise =
      Math.sin(x * 3.1 + y * 2.3 + z * 1.7) * intensity +
      Math.sin(y * 7.7) * intensity * 0.4;

    pos.setXYZ(i, x + noise, y + noise * 0.6, z + noise);
  }

  pos.needsUpdate = true;
  g.computeVertexNormals();
}

function applyVertexColor(mesh, baseColor) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const colors = [];

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const shade = 0.85 + y * 0.15;

    colors.push(
      baseColor.r * shade,
      baseColor.g * shade,
      baseColor.b * shade
    );
  }

  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  mesh.material.vertexColors = true;
}

function buildSegmentedWing(r, h, mat, side) {
  const wing = new THREE.Group();

  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(
      new THREE.ConeGeometry(r * (1.2 - i * 0.3), h * 0.25, 4, 1, true),
      mat
    );

    seg.position.x = side * i * r * 0.4;
    seg.rotation.z = side * (-0.4 + i * 0.2);

    organicDeform(seg, 0.04);
    wing.add(seg);
  }

  return wing;
}
  function onLockedMouseMove(e) { mouseDX += e.movementX; }
  function isPointerLocked() {
    return document.pointerLockElement === document.getElementById('canvasMount');
  }
  function setAimAngleDirect(a) { aimAngle = a; }

  /* ── Dungeon state stash / install ───────────────
     Allows pre-building a dungeon on the title screen
     and swapping it in instantly on game start.
  ─────────────────────────────────────────────────── */
  function reregisterLights() {
    if (typeof SpatialManager === 'undefined') return;
    SpatialManager.clear('lights');
    wallTorches.forEach((t, i) => SpatialManager.insert('lights', i, [t.x, t.z]));
  }

  function stashDungeonState() {
    const snap = {
      group:         dungeonGroup,
      wallTorches:   wallTorches.slice(),
      lanternLights: lanternLights.slice(),
      cameraDungeon: _cameraDungeon,
      dungeonBounds: _dungeonBounds,
      tileRoomId:    _tileRoomId,
      tileRoomCols:  _tileRoomCols,
    };
    if (dungeonGroup) scene.remove(dungeonGroup);
    lanternLights.forEach(l => { if (l.parent) l.parent.remove(l); });
    dungeonGroup   = null;
    wallTorches    = [];
    lanternLights  = [];
    _cameraDungeon = null;
    _dungeonBounds = null;
    _tileRoomId    = null;
    _tileRoomCols  = 0;
    _torchGrid     = null;
    _visibleTorchSet.clear();
    _lastWallTorchCount   = 0;
    _lastTorchFingerprint = 0;
    _lastLanternPx  = null;
    _lastLanternPz  = null;
    _cachedRoomId   = undefined;
    _scanRoomIds.clear();
    return snap;
  }

  function installDungeonState(snap) {
    if (dungeonGroup) scene.remove(dungeonGroup);
    lanternLights.forEach(l => { if (l.parent) l.parent.remove(l); });
    dungeonGroup   = snap.group;
    wallTorches    = snap.wallTorches;
    lanternLights  = snap.lanternLights;
    _cameraDungeon = snap.cameraDungeon;
    _dungeonBounds = snap.dungeonBounds;
    _tileRoomId    = snap.tileRoomId;
    _tileRoomCols  = snap.tileRoomCols;
    _torchGrid     = null; // rebuilt lazily on first query
    _visibleTorchSet.clear();
    _lastWallTorchCount   = 0;
    _lastTorchFingerprint = 0;
    _lastLanternPx  = null;
    _lastLanternPz  = null;
    _cachedRoomId   = undefined;
    _scanRoomIds.clear();
    if (dungeonGroup) scene.add(dungeonGroup);
    lanternLights.forEach(l => scene.add(l));
    // Re-populate SpatialManager lights layer — SpatialManager.init() was called before
    // this, wiping it, but we skip buildDungeonChunked so registerWallTorch never re-runs.
    if (typeof SpatialManager !== 'undefined') {
      SpatialManager.clear('lights');
      wallTorches.forEach((t, i) => SpatialManager.insert('lights', i, [t.x, t.z]));
    }
  }

  return {
    init, resize,
    buildDungeon, buildDungeonChunked,
    buildPlayerMesh, updatePlayerEquipment, triggerSwing,
    buildEnemyMesh, updateEnemyHpBar, removeEnemyMesh, updateEnemyAnimations,
    buildExitPortal, removeExitPortal, revealExitPortal,
    buildArrivalPortal, removeArrivalPortal,
    openBossDoor, updateDoorPrompt,
    startStairDescent, tickStairDescent,
    updateChests, updateChestPrompt, updateTorchPrompt, updateStairPrompt,
    startChestOpenAnimation,
    getChestAnim: () => chestInteractAnim,
    toggleNearbyWallTorch,
    spawnParticles, updateParticles,
    fireBolt, updateBolts,
    updateTorchFlicker, updateActiveLanternLights, snapLanternsToPlayer,
    flashPlayer,
    render,
    clearDynamic,
    updateAimFromMouse,
    getAimAngle: () => aimAngle,
    setAimAngleDirect,
    isPointerLocked,
    reregisterLights, stashDungeonState, installDungeonState,
    get chestMeshes() { return chestMeshes; },
    scene, camera, renderer, clock,
  };

})();
