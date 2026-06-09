// engine.js — Three.js scene, harbor geometry, camera, lights

const Engine = (() => {
  let renderer, scene, camera, clock;
  let stations = [];
  let waterMesh;

  // Camera base position — slightly elevated behind the fort, aimed out to sea
  const BASE_CAM_POS = new THREE.Vector3(0, 22, -18);
  const CAM_LOOK     = new THREE.Vector3(0, 0, 24);

  // Sea plane used for raycasting aim point
  const SEA_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function init() {
    const mount = document.getElementById('canvasMount');

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x08101e);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x08101e, 55, 110);

    camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 300);
    camera.position.copy(BASE_CAM_POS);
    camera.lookAt(CAM_LOOK);

    clock = new THREE.Clock();

    _buildLights();
    _buildWater();
    _buildDock();
    _buildFortWall();
    _buildStations();
    _buildHorizon();
    _buildMoon();
    _buildDecorations();

    window.addEventListener('resize', _onResize);
  }

  // ── LIGHTS ────────────────────────────────────────────────────
  function _buildLights() {
    // Night ambient — dark blue, just lifts silhouettes off black
    scene.add(new THREE.AmbientLight(0x1a3050, 1.4));

    // Moon — cold white-blue key light reflecting off the water
    const moonPL = new THREE.PointLight(0xd0e8ff, 3.2, 300);
    moonPL.position.set(30, 58, 82);
    moonPL.castShadow = true;
    moonPL.shadow.mapSize.width  = 1024;
    moonPL.shadow.mapSize.height = 1024;
    moonPL.shadow.camera.near = 2;
    moonPL.shadow.camera.far  = 240;
    scene.add(moonPL);

    // Subtle camera-side fill so ship fronts aren't pure black
    const seaFill = new THREE.DirectionalLight(0x2a3d55, 0.5);
    seaFill.position.set(0, 10, -30);
    scene.add(seaFill);
  }

  // ── WATER ─────────────────────────────────────────────────────
  function _buildWater() {
    const geo = new THREE.PlaneGeometry(160, 120, 2, 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x071c2e,
      roughness: 0.18,
      metalness: 0.22,
    });
    waterMesh = new THREE.Mesh(geo, mat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(0, -0.08, 42);
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);
  }

  // ── DOCK ──────────────────────────────────────────────────────
  function _buildDock() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.92 });
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.96 });

    const dock = new THREE.Mesh(new THREE.BoxGeometry(34, 0.6, 11), woodMat);
    dock.position.set(0, -0.3, -4.5);
    dock.receiveShadow = true;
    scene.add(dock);

    for (let px = -16; px <= 16; px += 1.6) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 11), plankMat);
      plank.position.set(px, -0.29, -4.5);
      scene.add(plank);
    }
  }

  // ── FORT WALL ─────────────────────────────────────────────────
  function _buildFortWall() {
    const stoneMat   = new THREE.MeshStandardMaterial({ color: 0x2e2820, roughness: 0.94 });
    const merlonMat  = new THREE.MeshStandardMaterial({ color: 0x383228, roughness: 0.9 });

    const wall = new THREE.Mesh(new THREE.BoxGeometry(36, 4.5, 1.8), stoneMat);
    wall.position.set(0, 2.0, -11);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    for (let mx = -15; mx <= 15; mx += 2.4) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.8), merlonMat);
      merlon.position.set(mx, 4.75, -11);
      scene.add(merlon);
    }

    [-18.5, 18.5].forEach(tx => {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(3.5, 7, 3.5), stoneMat);
      tower.position.set(tx, 2.5, -11);
      scene.add(tower);

      // Tower top crenellations
      for (let m = -1; m <= 1; m++) {
        const tm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 3.5), merlonMat);
        tm.position.set(tx + m * 1.25, 6.45, -11);
        scene.add(tm);
      }
    });
  }

  // ── CANNON STATIONS ───────────────────────────────────────────
  function _buildStations() {
    const stoneMat   = new THREE.MeshStandardMaterial({ color: 0x28241a, roughness: 0.92 });
    const woodMat    = new THREE.MeshStandardMaterial({ color: 0x4a3010, roughness: 0.82 });
    const metalMat   = new THREE.MeshStandardMaterial({ color: 0x2e2e38, roughness: 0.45, metalness: 0.7 });
    const wheelMat   = new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 0.88 });
    const ringMat    = new THREE.MeshBasicMaterial({ color: 0xc8922a, transparent: true, opacity: 0 });

    STATION_X.forEach((sx, idx) => {
      const g = new THREE.Group();
      g.position.set(sx, 0, 0.2);

      // Stone platform
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.75, 3.2), stoneMat);
      base.position.set(0, 0.375, 0);
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);

      // Carriage body
      const carriage = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.42, 2.0), woodMat);
      carriage.position.set(0, 0.96, 0.2);
      g.add(carriage);

      // Wheels (4)
      const wGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.18, 10);
      [-0.62, 0.62].forEach(wx => [-0.56, 0.56].forEach(wz => {
        const w = new THREE.Mesh(wGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(wx, 0.74, wz);
        g.add(w);
      }));

      // Barrel pivot group (rotates to aim)
      const barrelGroup = new THREE.Group();
      barrelGroup.position.set(0, 1.15, 0.3);
      g.add(barrelGroup);

      const barrelGeo = new THREE.CylinderGeometry(0.21, 0.30, 2.5, 10);
      const barrel    = new THREE.Mesh(barrelGeo, metalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0, 1.0);
      barrelGroup.add(barrel);

      // Muzzle anchor (for projectile spawn point)
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, 2.25);
      barrelGroup.add(muzzle);

      // Station highlight ring (shown when player is near)
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.75, 0.045, 8, 28),
        ringMat.clone()
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.77, 0);
      g.add(ring);

      scene.add(g);

      stations.push({
        index: idx,
        x: sx,
        group: g,
        barrelGroup,
        barrel,
        muzzle,
        ring,
        ringMat: ring.material,
        cannonType: 'longnine',
        cooldown: 0,
        targetPoint: new THREE.Vector3(sx, 0, 35),
        minYaw: -Math.PI * 0.50,
        maxYaw:  Math.PI * 0.50,
      });
    });
  }

  // ── MOON ──────────────────────────────────────────────────────
  function _buildMoon() {
    // Small distant moon — emissive so it glows without casting extra light
    const moonGeo = new THREE.SphereGeometry(2.2, 20, 20);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xeeeadc,
      emissive: 0xc8c4aa,
      emissiveIntensity: 0.55,
      roughness: 0.90,
      metalness: 0,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(30, 58, 82);
    scene.add(moonMesh);
  }

  // ── HORIZON ───────────────────────────────────────────────────
  function _buildHorizon() {
    // Horizon backdrop — matches fog color so it blends cleanly
    const hMat = new THREE.MeshBasicMaterial({ color: 0x08101e });
    const h    = new THREE.Mesh(new THREE.BoxGeometry(220, 18, 3), hMat);
    h.position.set(0, 6, 95);
    scene.add(h);
  }

  // ── DECORATIVE PROPS ──────────────────────────────────────────
  function _buildDecorations() {
    const barrelMat  = new THREE.MeshStandardMaterial({ color: 0x3a2208, roughness: 0.88 });
    const torchMat   = new THREE.MeshStandardMaterial({ color: 0x3a3020, roughness: 0.8 });
    const flameMat   = new THREE.MeshBasicMaterial({ color: 0xff8800 });

    // Barrels near stations
    STATION_X.forEach(sx => {
      [1.6, -1.6].forEach(ox => {
        const brl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.7, 8), barrelMat);
        brl.position.set(sx + ox, 0.35, -1.8);
        scene.add(brl);
      });
    });

    // Wall torches
    [-12, -6, 0, 6, 12].forEach(tx => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), torchMat);
      post.position.set(tx, 4.1, -10.3);
      scene.add(post);

      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), flameMat);
      flame.position.set(tx, 4.7, -10.3);
      scene.add(flame);
    });

    // Torch point lights (every other torch to keep draw calls reasonable)
    [-12, 0, 12].forEach(tx => {
      const torchLight = new THREE.PointLight(0xff8833, 1.1, 16);
      torchLight.position.set(tx, 5.2, -10.3);
      scene.add(torchLight);
    });
  }

  // ── RESIZE ────────────────────────────────────────────────────
  function _onResize() {
    const mount = document.getElementById('canvasMount');
    if (!mount || !renderer) return;
    const w = mount.clientWidth, h = mount.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // ── SHAKE ─────────────────────────────────────────────────────
  let _shakeAmt = 0;
  function addShake(amount) { _shakeAmt = Math.max(_shakeAmt, amount); }
  function updateShake(dt) {
    if (_shakeAmt <= 0) return;
    camera.position.set(
      BASE_CAM_POS.x + (Math.random() - 0.5) * _shakeAmt,
      BASE_CAM_POS.y + (Math.random() - 0.5) * _shakeAmt * 0.5,
      BASE_CAM_POS.z
    );
    _shakeAmt = Math.max(0, _shakeAmt - dt * 6);
    if (_shakeAmt <= 0) camera.position.copy(BASE_CAM_POS);
    camera.lookAt(CAM_LOOK);
  }

  return {
    init,
    get renderer() { return renderer; },
    get scene()    { return scene;    },
    get camera()   { return camera;   },
    get clock()    { return clock;    },
    get stations() { return stations; },
    get water()    { return waterMesh;},
    SEA_PLANE,
    BASE_CAM_POS,
    CAM_LOOK,
    addShake,
    updateShake,
  };
})();
