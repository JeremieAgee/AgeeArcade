// engine.js — Three.js scene, harbor geometry, realistic naval cannons, camera, lights

const Engine = (() => {
  let renderer, scene, camera, clock;
  let stations = [];
  let waterMesh, waterBase;
  let _sceneTime = 0;
  const _torchFlames = [];
  const _torchLights = [];

  // Camera base position — slightly elevated behind the fort, aimed out to sea
  const BASE_CAM_POS = new THREE.Vector3(0, 22, -18);
  const CAM_LOOK     = new THREE.Vector3(0, 0, 24);

  // Sea plane used for raycasting aim point
  const SEA_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  let _gfx = null;

  function init() {
    // Renderer/scene/camera built by the shared arcade engine
    _gfx = ArcadeEngine.create3D({
      mount: '#canvasMount',
      pixelRatioCap: 1.75,
      clearColor: 0x060c18,
      shadows: true,
      toneMapping: 'aces',
      exposure: 0.95,
      fov: 55, near: 0.1, far: 400,
      fog: { color: 0x060c18, near: 55, far: 110 },
    });
    renderer = _gfx.renderer;
    scene    = _gfx.scene;
    camera   = _gfx.camera;
    clock    = _gfx.clock;

    camera.position.copy(BASE_CAM_POS);
    camera.lookAt(CAM_LOOK);

    _buildLights();
    _buildWater();
    _buildSky();
    _buildDock();
    _buildFortWall();
    _buildStations();
    _buildHorizon();
    _buildMoon();
    _buildDecorations();
  }

  // ── LIGHTS ────────────────────────────────────────────────────
  function _buildLights() {
    // Night ambient — dark blue, just lifts silhouettes off black
    scene.add(new THREE.AmbientLight(0x223a5c, 1.1));

    // Moon — cold white-blue key light reflecting off the water
    const moonPL = new THREE.PointLight(0xd0e8ff, 2.8, 400);
    moonPL.position.set(30, 58, 82);
    moonPL.castShadow = true;
    moonPL.shadow.mapSize.width  = 1024;
    moonPL.shadow.mapSize.height = 1024;
    moonPL.shadow.camera.near = 2;
    moonPL.shadow.camera.far  = 240;
    scene.add(moonPL);

    // Subtle camera-side fill so ship fronts aren't pure black
    const seaFill = new THREE.DirectionalLight(0x2a3d55, 0.6);
    seaFill.position.set(0, 10, -30);
    scene.add(seaFill);
  }

  // ── WATER — animated swell ────────────────────────────────────
  function _buildWater() {
    const geo = new THREE.PlaneGeometry(170, 130, 56, 42);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x071a2a,
      roughness: 0.52,
      metalness: 0.28,
    });
    waterMesh = new THREE.Mesh(geo, mat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(0, -0.08, 42);
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);

    waterBase = geo.attributes.position.array.slice();
  }

  function _updateWater(t) {
    const pos = waterMesh.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      const x = waterBase[i3], y = waterBase[i3 + 1];
      // Swell dies off near the shoreline so waves never wash over the dock
      // (plane local +y maps to world -z; mesh sits at world z=42)
      const worldZ = 42 - y;
      const shore = Math.min(1, Math.max(0, (worldZ - 2) / 12));
      // plane-local z becomes world height after the -90° X rotation
      arr[i3 + 2] = shore * (
        Math.sin(x * 0.22 + t * 1.15) * 0.13 +
        Math.sin(y * 0.28 - t * 0.85) * 0.11 +
        Math.sin((x + y) * 0.11 + t * 0.55) * 0.16
      );
    }
    pos.needsUpdate = true;
    waterMesh.geometry.computeVertexNormals();
  }

  // ── SKY — stars ───────────────────────────────────────────────
  function _buildSky() {
    const starPos = [];
    for (let i = 0; i < 340; i++) {
      const az = Math.random() * Math.PI * 2;
      const el = Math.random() * Math.PI * 0.42 + 0.06;
      const r  = 190;
      starPos.push(
        Math.cos(el) * Math.sin(az) * r,
        Math.sin(el) * r,
        Math.cos(el) * Math.cos(az) * r
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xcdd9ff,
      size: 0.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      fog: false,
    });
    scene.add(new THREE.Points(geo, mat));
  }

  // ── DOCK ──────────────────────────────────────────────────────
  function _buildDock() {
    const woodMat = new THREE.MeshStandardMaterial({
      map: GameTextures.wood(0x4a3018), roughness: 0.94,
    });

    const dock = new THREE.Mesh(new THREE.BoxGeometry(34, 0.6, 11), woodMat);
    dock.position.set(0, -0.3, -4.5);
    dock.receiveShadow = true;
    scene.add(dock);

    // Pilings along the waterfront edge
    const pileMat = new THREE.MeshStandardMaterial({ color: 0x2c1d0c, roughness: 0.95 });
    for (let px = -16; px <= 16; px += 3.2) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 1.6, 7), pileMat);
      pile.position.set(px, 0.15, 1.05);
      pile.castShadow = true;
      scene.add(pile);
    }
  }

  // ── FORT WALL ─────────────────────────────────────────────────
  function _buildFortWall() {
    const stoneMat = new THREE.MeshStandardMaterial({
      map: GameTextures.stone(0x57503f), roughness: 0.94,
    });
    const merlonMat = new THREE.MeshStandardMaterial({
      map: GameTextures.stone(0x645c48), roughness: 0.9,
    });

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
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 7.5, 10), stoneMat);
      tower.position.set(tx, 2.75, -11);
      tower.castShadow = true;
      scene.add(tower);

      // Tower top crenellations
      for (let m = 0; m < 6; m++) {
        const a = (m / 6) * Math.PI * 2;
        const tm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.7), merlonMat);
        tm.position.set(tx + Math.cos(a) * 1.8, 6.85, -11 + Math.sin(a) * 1.8);
        tm.rotation.y = -a;
        scene.add(tm);
      }

      // Conical tower roof
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.0, 1.6, 10),
        new THREE.MeshStandardMaterial({ color: 0x1e2a38, roughness: 0.8 })
      );
      roof.position.set(tx, 7.6, -11);
      scene.add(roof);
    });
  }

  // ── NAVAL CANNON ──────────────────────────────────────────────
  // Lathe-turned barrel: cascabel, breech rings, reinforces, chase, muzzle swell
  function _buildBarrelGeometry() {
    const profile = [
      [0.001, -0.42],
      [0.085, -0.40],  // cascabel knob
      [0.115, -0.33],
      [0.072, -0.26],  // cascabel neck
      [0.165, -0.20],  // breech
      [0.240, -0.12],
      [0.250,  0.05],  // base ring
      [0.215,  0.10],
      [0.205,  0.85],
      [0.228,  0.88],  // first reinforce ring
      [0.228,  0.93],
      [0.190,  0.98],
      [0.180,  1.66],
      [0.205,  1.70],  // second reinforce ring
      [0.205,  1.75],
      [0.165,  1.80],  // chase
      [0.155,  2.20],
      [0.210,  2.30],  // muzzle swell
      [0.215,  2.40],
      [0.150,  2.45],  // muzzle face
      [0.100,  2.45],
      [0.100,  2.36],  // bore
      [0.001,  2.36],
    ].map(p => new THREE.Vector2(p[0], p[1]));
    return new THREE.LatheGeometry(profile, 22);
  }

  // Stepped carriage cheek (classic naval gun carriage side board)
  function _buildCheekGeometry() {
    const s = new THREE.Shape();
    s.moveTo(-0.85, 0);
    s.lineTo(0.85, 0);
    s.lineTo(0.85, 0.26);
    s.lineTo(0.50, 0.30);     // step 1
    s.lineTo(0.45, 0.52);
    s.lineTo(0.10, 0.56);     // step 2
    s.lineTo(0.02, 0.78);
    s.lineTo(-0.60, 0.78);    // trunnion bed at top rear
    s.lineTo(-0.85, 0.55);
    s.lineTo(-0.85, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 0.13, bevelEnabled: false });
  }

  function _buildCannon() {
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x383b40, roughness: 0.38, metalness: 0.82,
    });
    const oakMat = new THREE.MeshStandardMaterial({
      map: GameTextures.wood(0x5a3a1a), roughness: 0.85,
    });
    const darkOakMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x6a5536, roughness: 1.0 });

    // Yaw group — the whole gun (carriage + barrel) trains left/right
    const yawGroup = new THREE.Group();

    // Carriage cheeks
    const cheekGeo = _buildCheekGeometry();
    [-0.34, 0.21].forEach(cx => {
      const cheek = new THREE.Mesh(cheekGeo, oakMat);
      cheek.rotation.y = Math.PI / 2;            // shape length runs along Z
      cheek.position.set(cx, 0.42, 0);
      cheek.castShadow = true;
      yawGroup.add(cheek);
    });

    // Transom (front cross-board) + bed
    const transom = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.10), oakMat);
    transom.position.set(0, 0.56, 0.62);
    yawGroup.add(transom);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 1.5), darkOakMat);
    bed.position.set(0, 0.46, -0.05);
    yawGroup.add(bed);

    // Axles + trucks (wooden wheels with hubs)
    const axleGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.0, 6);
    const truckGeoF = new THREE.CylinderGeometry(0.30, 0.30, 0.16, 12);
    const truckGeoR = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12);
    const hubGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.20, 8);
    [[0.55, 0.30, truckGeoF], [-0.62, 0.24, truckGeoR]].forEach(([az, r, tGeo]) => {
      const axle = new THREE.Mesh(axleGeo, darkOakMat);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, r, az);
      yawGroup.add(axle);
      [-0.48, 0.48].forEach(wx => {
        const truck = new THREE.Mesh(tGeo, oakMat);
        truck.rotation.z = Math.PI / 2;
        truck.position.set(wx, r, az);
        truck.castShadow = true;
        yawGroup.add(truck);
        const hub = new THREE.Mesh(hubGeo, darkOakMat);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(wx, r, az);
        yawGroup.add(hub);
      });
    });

    // Quoin — elevating wedge under the breech
    const quoin = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.16, 0.55), darkOakMat);
    quoin.rotation.x = 0.18;
    quoin.position.set(0, 0.92, -0.48);
    yawGroup.add(quoin);

    // Breech rope sagging behind the gun
    const ropeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.45, 0.78, -0.55),
      new THREE.Vector3(0, 0.55, -1.05),
      new THREE.Vector3(0.45, 0.78, -0.55),
    ]);
    const rope = new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 14, 0.035, 6), ropeMat);
    yawGroup.add(rope);

    // Pitch group — barrel elevates about the trunnions
    const pitchGroup = new THREE.Group();
    pitchGroup.position.set(0, 1.08, 0.10);
    yawGroup.add(pitchGroup);

    const barrel = new THREE.Mesh(_buildBarrelGeometry(), ironMat);
    barrel.rotation.x = Math.PI / 2;             // lathe Y-axis → +Z (out to sea)
    barrel.position.z = -0.55;                   // trunnion point sits at the pivot
    barrel.castShadow = true;
    pitchGroup.add(barrel);

    // Trunnions — cylinder through the barrel resting on the cheeks
    const trunnion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.95, 10), ironMat
    );
    trunnion.rotation.z = Math.PI / 2;
    pitchGroup.add(trunnion);

    // Muzzle anchor (projectile spawn point)
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, 1.90);
    pitchGroup.add(muzzle);

    return { yawGroup, pitchGroup, barrel, muzzle };
  }

  // ── CANNON STATIONS ───────────────────────────────────────────
  function _buildStations() {
    const stoneMat = new THREE.MeshStandardMaterial({
      map: GameTextures.stone(0x4c4536), roughness: 0.92,
    });
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x26262c, roughness: 0.5, metalness: 0.75,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      map: GameTextures.wood(0x4a3018), roughness: 0.9,
    });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xc8922a, transparent: true, opacity: 0 });

    STATION_X.forEach((sx, idx) => {
      const g = new THREE.Group();
      g.position.set(sx, 0, 0.2);

      // Octagonal stone gun platform
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.75, 8), stoneMat);
      base.position.set(0, 0.375, 0);
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);

      // The cannon itself
      const { yawGroup, pitchGroup, barrel, muzzle } = _buildCannon();
      yawGroup.position.set(0, 0.75, 0);
      g.add(yawGroup);

      // Cannonball pyramid beside the gun
      const ballGeo = new THREE.SphereGeometry(0.14, 10, 10);
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.07, 0.75), woodMat);
      rack.position.set(1.55, 0.785, -0.9);
      g.add(rack);
      const stack = [
        [-0.16, 0, -0.16], [0.16, 0, -0.16], [-0.16, 0, 0.16], [0.16, 0, 0.16],
        [0, 0.21, 0],
      ];
      stack.forEach(([bx, by, bz]) => {
        const ball = new THREE.Mesh(ballGeo, ironMat);
        ball.position.set(1.55 + bx, 0.96 + by, -0.9 + bz);
        ball.castShadow = true;
        g.add(ball);
      });

      // Water bucket
      const bucket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.13, 0.26, 9), woodMat
      );
      bucket.position.set(-1.5, 0.88, -0.8);
      g.add(bucket);

      // Station highlight ring (shown when player is near)
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.95, 0.045, 8, 28),
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
        yawGroup,
        pitchGroup,
        barrelGroup: pitchGroup,   // legacy alias
        barrel,
        muzzle,
        ring,
        ringMat: ring.material,
        cannonType: 'longnine',
        cooldown: 0,
        recoilX: 0,
        recoilZ: 0,
        targetPoint: new THREE.Vector3(sx, 0, 35),
        minYaw: -Math.PI * 0.50,
        maxYaw:  Math.PI * 0.50,
      });
    });
  }

  // ── MOON ──────────────────────────────────────────────────────
  function _buildMoon() {
    const moonGeo = new THREE.SphereGeometry(2.4, 24, 24);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xeeeadc,
      emissive: 0xd8d4ba,
      emissiveIntensity: 0.75,
      roughness: 0.9,
      metalness: 0,
      fog: false,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(30, 58, 82);
    scene.add(moonMesh);

    // Soft halo sprite
    const haloMat = new THREE.SpriteMaterial({
      map: GameTextures.glow(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(20, 20, 1);
    halo.position.set(30, 58, 82);
    scene.add(halo);
  }

  // ── HORIZON ───────────────────────────────────────────────────
  function _buildHorizon() {
    const hMat = new THREE.MeshBasicMaterial({ color: 0x060c18 });
    const h    = new THREE.Mesh(new THREE.BoxGeometry(260, 18, 3), hMat);
    h.position.set(0, 6, 98);
    scene.add(h);
  }

  // ── DECORATIVE PROPS ──────────────────────────────────────────
  function _buildDecorations() {
    const barrelMat = new THREE.MeshStandardMaterial({
      map: GameTextures.wood(0x3a2208), roughness: 0.88,
    });
    const bandMat  = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.5, metalness: 0.6 });
    const torchMat = new THREE.MeshStandardMaterial({ color: 0x3a3020, roughness: 0.8 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9933, transparent: true, opacity: 0.95 });

    // Powder barrels near stations
    STATION_X.forEach(sx => {
      [2.6, -2.6].forEach(ox => {
        const brl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.7, 10), barrelMat);
        brl.position.set(sx + ox, 0.35, -1.8);
        brl.castShadow = true;
        scene.add(brl);
        [0.18, -0.18].forEach(by => {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.018, 6, 14), bandMat);
          band.rotation.x = Math.PI / 2;
          band.position.set(sx + ox, 0.35 + by, -1.8);
          scene.add(band);
        });
      });
    });

    // Wall torches with flickering flames
    [-12, -6, 0, 6, 12].forEach(tx => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), torchMat);
      post.position.set(tx, 4.1, -10.3);
      scene.add(post);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 7), flameMat.clone());
      flame.position.set(tx, 4.8, -10.3);
      scene.add(flame);
      _torchFlames.push(flame);
    });

    // Torch point lights (every other torch to keep draw calls reasonable)
    [-12, 0, 12].forEach(tx => {
      const torchLight = new THREE.PointLight(0xff8833, 1.2, 16);
      torchLight.position.set(tx, 5.2, -10.3);
      scene.add(torchLight);
      _torchLights.push(torchLight);
    });
  }

  // ── PER-FRAME SCENE ANIMATION ─────────────────────────────────
  function updateScene(dt) {
    _sceneTime += dt;
    _updateWater(_sceneTime);

    // Torch flicker
    for (let i = 0; i < _torchFlames.length; i++) {
      const f = _torchFlames[i];
      const n = Math.sin(_sceneTime * 11 + i * 2.7) * 0.5 + Math.sin(_sceneTime * 23 + i * 1.3) * 0.5;
      f.scale.set(1 + n * 0.18, 1 + n * 0.3, 1 + n * 0.18);
      f.material.opacity = 0.8 + n * 0.18;
    }
    for (let i = 0; i < _torchLights.length; i++) {
      _torchLights[i].intensity = 1.2 + Math.sin(_sceneTime * 13 + i * 4.1) * 0.25;
    }
  }

  // ── SHAKE — delegated to the shared arcade engine ─────────────
  function addShake(amount) { if (_gfx) _gfx.shake(amount); }
  function updateShake(dt)  { if (_gfx) _gfx.updateShake(dt, BASE_CAM_POS, CAM_LOOK); }

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
    updateScene,
  };
})();
