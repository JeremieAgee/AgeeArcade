'use strict';

// Spear Fisher — full 3D, built on the shared ArcadeEngine (graphics + sound).
// Game logic runs in the original 800×520 virtual space; the 3D layer maps
// virtual (x, y) → world (X, Z) on the water plane.

const Game = (() => {

  // ── Virtual world ──────────────────────────────────────
  const VW = 800, VH = 520;
  const WS = 0.1; // world scale: virtual units → 3D units
  const vx2w = x => (x - VW / 2) * WS;
  const vy2w = y => (y - VH / 2) * WS;
  const FISH_DEPTH = -2.4;   // swim depth below surface
  const SEABED_Y   = -5.2;

  // ── Fishing boat geometry (bow=top/far, stern=bottom/near) ──
  const BOAT = {
    cx:       400,
    bowY:     72,
    sternY:   288,
    maxW:     50,
    sternW:   43,
    cy:       180,
    cabinFY:  106,
    cabinBY:  188,
    cabinHW:  28,
    cockpitY: 238,
  };

  // ── Player fixed at stern ──────────────────────────────
  const P = { x: BOAT.cx, y: BOAT.sternY - 18, angle: Math.PI * 0.5 };

  // ── Spear ──────────────────────────────────────────────
  const SPEAR_SPEED = 440;
  const SPEAR_MAX_D = 320;
  const SP = { state:'held', x:0, y:0, vx:0, vy:0, traveled:0, ang:0, fish:null };
  const ROUND_TIME = 90;
  const ROUND_GOAL_BASE = 250;
  const ROUND_GOAL_GROWTH = 1.55;

  // ── Fish definitions ───────────────────────────────────
  const FISH_DEF = [
    { name:'Perch',  col:0x3a9e5c, hi:0x62d48a, fin:0x1e7a3c, size:16, spd:62,  pts:10,  pulls:2 },
    { name:'Bass',   col:0x4a7a30, hi:0x72b04a, fin:0x2a5510, size:24, spd:80,  pts:25,  pulls:3 },
    { name:'Salmon', col:0xc85838, hi:0xf09070, fin:0xe07848, size:33, spd:102, pts:50,  pulls:5 },
    { name:'Tuna',   col:0x2240aa, hi:0x5080ee, fin:0x3a66dd, size:44, spd:128, pts:100, pulls:8 },
  ];
  const MAX_FISH = 8;
  const MAX_ROUND_FISH = 12;
  let fish = [], spawnTimer = 0;

  // ── Rocks (static underwater obstacles) ────────────────
  const ROCK_CONFIGS = [
    { x:155, y:388, r:28, rot:0.4 }, { x:628, y:355, r:24, rot:1.1 },
    { x:685, y:148, r:19, rot:0.8 }, { x:125, y:182, r:21, rot:2.0 },
    { x:338, y:438, r:32, rot:0.2 }, { x:555, y:455, r:23, rot:1.5 },
    { x:68,  y:316, r:16, rot:0.6 }, { x:732, y:444, r:27, rot:2.4 },
    { x:418, y:464, r:19, rot:1.8 }, { x:248, y:138, r:15, rot:0.9 },
    { x:710, y:265, r:12, rot:1.3 }, { x: 88, y:440, r:18, rot:2.1 },
  ];

  // ── State ──────────────────────────────────────────────
  const S = { TITLE:0, PLAYING:1, REELING:2, OVER:3 };
  let gs = S.TITLE, score = 0, timer = ROUND_TIME, round = 1, roundGoal = ROUND_GOAL_BASE, wt = 0;
  let runStartedAt = 0, throws = 0, catches = 0, analyticsSessionActive = false;
  let hi = +(localStorage.getItem('sf_hi') || 0);
  const LB_KEY = 'spear_fisher_lb';
  const LB_SYNC_KEY = 'spear_fisher_lb.synced.v1';

  // ── 3D context (shared arcade engine) ──────────────────
  let gfx, renderer, scene, camera, clock;
  let waterMesh, waterBase, seabed;
  let boatGroup, playerGroup, spearGroup, ropeLine, aimLine;
  let sun;
  const fishMeshes = new Map();   // fish object → THREE.Group
  let parts = [], popups = [], ripples = [], caustics = [];

  /* ════════════════════════════════════════════════════════
     SCENE BUILD
  ════════════════════════════════════════════════════════ */
  function buildScene() {
    gfx = ArcadeEngine.create3D({
      canvas: '#gameCanvas',
      mount: '#canvasMount',
      pixelRatioCap: 2,
      clearColor: 0x04182e,
      shadows: true,
      toneMapping: 'aces',
      exposure: 1.05,
      fov: 50, near: 0.1, far: 300,
      fog: { color: 0x04182e, near: 90, far: 190 },
    });
    renderer = gfx.renderer;
    scene    = gfx.scene;
    camera   = gfx.camera;
    clock    = gfx.clock;

    camera.position.set(0, 62, 36);
    camera.lookAt(0, 0, 0);

    buildLights();
    buildWater();
    buildSeabed();
    buildRocks();
    buildSeaweed();
    buildCaustics();
    buildBoat();
    buildPlayer();
    buildSpear();
    buildRopeAndAim();
  }

  function buildLights() {
    scene.add(new THREE.AmbientLight(0x4a6a8a, 0.9));
    scene.add(new THREE.HemisphereLight(0x8fc8ff, 0x0a2a44, 0.55));

    sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    sun.position.set(-28, 70, -20);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far  = 160;
    sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
    sun.shadow.camera.top  =  40; sun.shadow.camera.bottom = -40;
    scene.add(sun);
  }

  function buildWater() {
    const geo = new THREE.PlaneGeometry(VW * WS + 40, VH * WS + 40, 64, 48);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a4a7e,
      roughness: 0.32,
      metalness: 0.35,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    waterMesh = new THREE.Mesh(geo, mat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = 0;
    scene.add(waterMesh);
    waterBase = geo.attributes.position.array.slice();
  }

  function updateWater(t) {
    const pos = waterMesh.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      const x = waterBase[i3], y = waterBase[i3 + 1];
      arr[i3 + 2] =
        Math.sin(x * 0.30 + t * 1.1) * 0.16 +
        Math.sin(y * 0.36 - t * 0.8) * 0.13 +
        Math.sin((x + y) * 0.14 + t * 0.5) * 0.18;
    }
    pos.needsUpdate = true;
    waterMesh.geometry.computeVertexNormals();
  }

  function buildSeabed() {
    const geo = new THREE.PlaneGeometry(VW * WS + 60, VH * WS + 60, 32, 24);
    // Gentle dunes on the seafloor
    const arr = geo.attributes.position.array;
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const i3 = i * 3;
      arr[i3 + 2] = Math.sin(arr[i3] * 0.25) * 0.5 + Math.cos(arr[i3 + 1] * 0.3) * 0.4;
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a6f3c, roughness: 1.0 });
    seabed = new THREE.Mesh(geo, mat);
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = SEABED_Y;
    seabed.receiveShadow = true;
    scene.add(seabed);

    // Sandy light patches
    const patchMat = new THREE.MeshStandardMaterial({ color: 0xb89a58, roughness: 1.0 });
    [[82,86,9],[VW-94,VH-82,8.5],[VW-82,102,6.4],[122,VH-70,7.2],[VW*0.5,VH*0.9,8]].forEach(([x,y,r]) => {
      const p = new THREE.Mesh(new THREE.CircleGeometry(r * WS * 10, 18), patchMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(vx2w(x), SEABED_Y + 0.9, vy2w(y));
      scene.add(p);
    });
  }

  function buildRocks() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a5648, roughness: 0.95, flatShading: true });
    const rockMat2 = new THREE.MeshStandardMaterial({ color: 0x6e6850, roughness: 0.95, flatShading: true });
    ROCK_CONFIGS.forEach((r, i) => {
      const size = r.r * WS;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), i % 2 ? rockMat : rockMat2);
      rock.position.set(vx2w(r.x), SEABED_Y + size * 0.55, vy2w(r.y));
      rock.rotation.set(r.rot, r.rot * 1.7, r.rot * 0.6);
      rock.scale.y = 0.72;
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
      // A smaller companion stone
      const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.45, 0), rockMat);
      pebble.position.set(vx2w(r.x) + size * 1.3, SEABED_Y + size * 0.3, vy2w(r.y) + size * 0.6);
      pebble.rotation.set(r.rot * 2, r.rot, 0);
      scene.add(pebble);
    });
  }

  function buildSeaweed() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a6a2e, roughness: 0.9 });
    [[60,VH-56],[VW-60,66],[188,VH-40],[VW-196,VH-44],[VW*0.38,VH-22],[248,160],[700,280]].forEach(([x,y], i) => {
      for (let b = 0; b < 4; b++) {
        const h = 1.6 + Math.random() * 2.2;
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.16, h, 5), mat);
        blade.position.set(
          vx2w(x) + (Math.random() - 0.5) * 1.6,
          SEABED_Y + h / 2 + 0.4,
          vy2w(y) + (Math.random() - 0.5) * 1.6
        );
        blade.rotation.z = (Math.random() - 0.5) * 0.4;
        blade.userData.sway = Math.random() * Math.PI * 2;
        blade.userData.isWeed = true;
        scene.add(blade);
        caustics.push(null); // placeholder no-op to keep arrays simple
        weedBlades.push(blade);
      }
    });
  }
  const weedBlades = [];

  // Soft moving light blobs on the seabed — fake caustics
  let glowTexture = null;
  function makeGlowTexture() {
    if (glowTexture) return glowTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(140,215,255,0.85)');
    grad.addColorStop(1, 'rgba(140,215,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    glowTexture = new THREE.CanvasTexture(c);
    return glowTexture;
  }

  function buildCaustics() {
    caustics = [];
    const tex = makeGlowTexture();
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.10 + Math.random() * 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      const r = 3 + Math.random() * 7;
      s.scale.set(r, r * 0.5, 1);
      s.position.set(
        vx2w(45 + Math.random() * (VW - 90)),
        SEABED_Y + 1.2,
        vy2w(25 + Math.random() * (VH - 50))
      );
      s.userData = { phase: Math.random() * Math.PI * 2, spd: 0.28 + Math.random() * 0.72, baseR: r };
      scene.add(s);
      caustics.push(s);
    }
  }

  function buildBoat() {
    boatGroup = new THREE.Group();

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.8 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xa87844 , roughness: 0.9 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.85 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x3a2a14, roughness: 0.7 });

    // Hull — extruded boat outline (virtual coords → local world units)
    const half = BOAT.maxW * WS;            // 5.0
    const bow = vy2w(BOAT.bowY) - vy2w(BOAT.cy);     // toward -Z
    const stern = vy2w(BOAT.sternY) - vy2w(BOAT.cy); // toward +Z
    const sternHalf = BOAT.sternW * WS;
    const shape = new THREE.Shape();
    shape.moveTo(0, bow);                              // bow tip
    shape.quadraticCurveTo( half, bow + 4,  half, 0);  // starboard flare
    shape.lineTo( sternHalf, stern - 1);
    shape.quadraticCurveTo(0, stern + 0.8, -sternHalf, stern - 1);
    shape.lineTo(-half, 0);
    shape.quadraticCurveTo(-half, bow + 4, 0, bow);    // port flare
    const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.rotation.x = -Math.PI / 2;     // shape XY → world XZ, depth up
    hull.position.y = -0.4;
    hull.castShadow = true;
    boatGroup.add(hull);

    // Deck — slightly inset copy on top
    const deckGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.rotation.x = -Math.PI / 2;
    deck.scale.set(0.9, 0.92, 1);
    deck.position.y = 1.28;
    boatGroup.add(deck);

    // Cabin
    const cabinLen = (BOAT.cabinBY - BOAT.cabinFY) * WS;
    const cabinZ = (vy2w(BOAT.cabinFY) + vy2w(BOAT.cabinBY)) / 2 - vy2w(BOAT.cy);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(BOAT.cabinHW * 2 * WS, 2.0, cabinLen), cabinMat);
    cabin.position.set(0, 2.3, cabinZ);
    cabin.castShadow = true;
    boatGroup.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(BOAT.cabinHW * 2 * WS + 0.5, 0.2, cabinLen + 0.5), trimMat);
    roof.position.set(0, 3.4, cabinZ);
    boatGroup.add(roof);

    // Windows — dark band around cabin
    const winMat = new THREE.MeshStandardMaterial({ color: 0x183048, roughness: 0.2, metalness: 0.4 });
    const win = new THREE.Mesh(new THREE.BoxGeometry(BOAT.cabinHW * 2 * WS + 0.08, 0.6, cabinLen * 0.7), winMat);
    win.position.set(0, 2.7, cabinZ);
    boatGroup.add(win);

    // Mast + boom
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.5, 8), trimMat);
    mast.position.set(0, 5.5, cabinZ - cabinLen / 2 - 0.8);
    boatGroup.add(mast);

    boatGroup.position.set(vx2w(BOAT.cx), 0.15, vy2w(BOAT.cy));
    scene.add(boatGroup);
  }

  function buildPlayer() {
    playerGroup = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xddaa78, roughness: 0.85 });
    const vest = new THREE.MeshStandardMaterial({ color: 0xc8552a, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2a3a55, roughness: 0.9 });

    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.8, 8), pants);
    legs.position.y = 0.4;
    playerGroup.add(legs);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.9, 8), vest);
    torso.position.y = 1.15;
    torso.castShadow = true;
    playerGroup.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), skin);
    head.position.y = 1.95;
    playerGroup.add(head);
    // Throwing arm — points toward aim
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.85, 6), skin);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.5, 1.45, 0);
    playerGroup.add(arm);

    playerGroup.position.set(vx2w(P.x), 1.45, vy2w(P.y));
    scene.add(playerGroup);
  }

  function buildSpear() {
    spearGroup = new THREE.Group();
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8a5c28, roughness: 0.7 });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.3, metalness: 0.8 });
    // Shaft along +X
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.0, 6), shaftMat);
    shaft.rotation.z = Math.PI / 2;
    spearGroup.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), tipMat);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 1.7;
    spearGroup.add(tip);
    spearGroup.visible = false;
    scene.add(spearGroup);
  }

  function buildRopeAndAim() {
    const ropeMat = new THREE.LineBasicMaterial({ color: 0xd8c8a0, transparent: true, opacity: 0.85 });
    ropeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), ropeMat);
    ropeLine.visible = false;
    scene.add(ropeLine);

    const aimMat = new THREE.LineBasicMaterial({ color: 0x9adcff, transparent: true, opacity: 0.35 });
    aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), aimMat);
    scene.add(aimLine);
  }

  /* ── Fish meshes ───────────────────────────────────────── */
  function makeFishMesh(f) {
    const g = new THREE.Group();
    const L = f.size * WS * 1.9;          // body length
    const bodyMat = new THREE.MeshStandardMaterial({ color: f.col, roughness: 0.45, metalness: 0.25 });
    const hiMat   = new THREE.MeshStandardMaterial({ color: f.hi, roughness: 0.5 });
    const finMat  = new THREE.MeshStandardMaterial({ color: f.fin, roughness: 0.6, side: THREE.DoubleSide });

    const body = new THREE.Mesh(new THREE.SphereGeometry(L / 2, 14, 10), bodyMat);
    body.scale.set(1, 0.42, 0.34);
    body.castShadow = true;
    g.add(body);

    // Belly highlight
    const belly = new THREE.Mesh(new THREE.SphereGeometry(L / 2.25, 12, 8), hiMat);
    belly.scale.set(0.95, 0.34, 0.3);
    belly.position.y = -L * 0.05;
    g.add(belly);

    // Tail — wags while swimming
    const tail = new THREE.Mesh(new THREE.ConeGeometry(L * 0.18, L * 0.42, 3), finMat);
    tail.rotation.z = -Math.PI / 2;
    tail.scale.z = 0.25;
    tail.position.x = -L * 0.58;
    g.add(tail);
    g.userData.tail = tail;

    // Dorsal fin
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(L * 0.12, L * 0.28, 3), finMat);
    dorsal.scale.z = 0.25;
    dorsal.position.set(-L * 0.08, L * 0.22, 0);
    g.add(dorsal);

    // Eye
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x101418 });
    [-1, 1].forEach(s => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(L * 0.045, 6, 6), eyeMat);
      eye.position.set(L * 0.3, L * 0.05, s * L * 0.13);
      g.add(eye);
    });

    scene.add(g);
    return g;
  }

  function syncFishMeshes() {
    // Remove meshes for fish that no longer exist
    for (const [f, mesh] of fishMeshes) {
      if (!fish.includes(f)) { scene.remove(mesh); fishMeshes.delete(f); }
    }
    // Add meshes for new fish
    for (const f of fish) {
      if (!fishMeshes.has(f)) fishMeshes.set(f, makeFishMesh(f));
    }
    // Position + animate
    for (const f of fish) {
      const m = fishMeshes.get(f);
      m.position.set(vx2w(f.x), FISH_DEPTH + Math.sin(f.wobble * 0.7) * 0.25, vy2w(f.y));
      m.rotation.y = -f.facing;
      const tail = m.userData.tail;
      if (tail) tail.rotation.y = Math.sin(f.wobble * 2.2) * 0.55;
      if (f.state === 'speared') m.rotation.z = Math.sin(f.wobble * 3) * 0.3;
      else m.rotation.z = 0;
    }
  }

  /* ── Effects: splashes, ripples, popups ─────────────────── */
  function addSplash(x, y, n, type) {
    const col = type === 'gold' ? 0xffcd28 : 0x82cdff;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (28 + Math.random() * 88) * WS;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.07 + Math.random() * 0.14, 6, 6),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 })
      );
      mesh.position.set(vx2w(x), 0.2, vy2w(y));
      scene.add(mesh);
      parts.push({
        mesh,
        vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 1.5 + Math.random() * 2.5,
        life: 1, decay: 1.1 + Math.random() * 0.9,
      });
    }
  }

  function addRipple(x, y) {
    for (const delay of [0, 0.08]) {
      const geo = new THREE.RingGeometry(0.4, 0.55, 24);
      const mat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(vx2w(x), 0.12, vy2w(y));
      mesh.visible = delay === 0;
      scene.add(mesh);
      ripples.push({ mesh, alpha: 0.6, delay });
    }
  }

  function addPopup(x, y, text) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.font = 'bold 52px Cinzel, Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 7;
    g.strokeText(text, 256, 48);
    g.fillStyle = '#ffdd44';
    g.fillText(text, 256, 48);
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(11, 2.1, 1);
    sprite.position.set(vx2w(x), 2.4, vy2w(y));
    scene.add(sprite);
    popups.push({ sprite, alpha: 1.0 });
  }

  function updateEffects(dt) {
    for (const p of parts) {
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.position.y += p.vy * dt;
      p.vy -= 9 * dt;
      p.vx *= 1 - 3.8 * dt; p.vz *= 1 - 3.8 * dt;
      p.life -= p.decay * dt;
      p.mesh.material.opacity = Math.max(0, p.life);
    }
    parts = parts.filter(p => {
      if (p.life > 0) return true;
      scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
      return false;
    });

    for (const r of ripples) {
      if (r.delay > 0) { r.delay -= dt; if (r.delay <= 0) r.mesh.visible = true; continue; }
      r.mesh.scale.x += 4.5 * dt; r.mesh.scale.y += 4.5 * dt;
      r.alpha -= 1.4 * dt;
      r.mesh.material.opacity = Math.max(0, r.alpha);
    }
    ripples = ripples.filter(r => {
      if (r.alpha > 0) return true;
      scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose();
      return false;
    });

    for (const p of popups) {
      p.sprite.position.y += 2.6 * dt;
      p.alpha -= 0.9 * dt;
      p.sprite.material.opacity = Math.max(0, p.alpha);
    }
    popups = popups.filter(p => {
      if (p.alpha > 0) return true;
      scene.remove(p.sprite); p.sprite.material.map.dispose(); p.sprite.material.dispose();
      return false;
    });
  }

  /* ════════════════════════════════════════════════════════
     INPUT — raycast mouse/touch onto the water plane
  ════════════════════════════════════════════════════════ */
  let mx = VW / 2, my = VH / 2, touchStart = null;
  const _raycaster = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FISH_DEPTH); // aim at fish depth
  const _hit = new THREE.Vector3();

  function screenToVirtual(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    _ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    _raycaster.setFromCamera(_ndc, camera);
    if (_raycaster.ray.intersectPlane(_waterPlane, _hit)) {
      mx = _hit.x / WS + VW / 2;
      my = _hit.z / WS + VH / 2;
    }
  }

  function onMouseMove(e) {
    screenToVirtual(e.clientX, e.clientY);
    if (gs === S.PLAYING || gs === S.REELING) updateAngle();
  }
  function onMouseClick() { handleAction(); }
  function onTouchStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchStart = { cx: t.clientX, cy: t.clientY, ts: Date.now(), id: t.identifier };
    screenToVirtual(t.clientX, t.clientY);
    if (gs === S.PLAYING || gs === S.REELING) updateAngle();
  }
  function onTouchEnd(e) {
    e.preventDefault();
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.cx, dy = t.clientY - touchStart.cy;
    if (Math.sqrt(dx * dx + dy * dy) < 18 && (Date.now() - touchStart.ts) < 320) handleAction();
    touchStart = null;
  }
  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (touchStart && t.identifier === touchStart.id) {
        screenToVirtual(t.clientX, t.clientY);
        if (gs === S.PLAYING || gs === S.REELING) updateAngle();
      }
    }
  }
  function updateAngle() { P.angle = Math.atan2(my - P.y, mx - P.x); }
  function handleAction() {
    if (gs === S.TITLE || gs === S.OVER) { startGame(); return; }
    if (gs === S.PLAYING)  throwSpear();
    else if (gs === S.REELING) pullFish();
  }

  /* ════════════════════════════════════════════════════════
     GAME LOGIC (unchanged from the 2D version)
  ════════════════════════════════════════════════════════ */
  function boatDist(x, y) {
    const dx = (x - BOAT.cx) / (BOAT.maxW * 1.2);
    const dy = (y - BOAT.cy) / ((BOAT.sternY - BOAT.bowY) / 1.8);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function rockMinDist(x, y) {
    let min = Infinity;
    for (const r of ROCK_CONFIGS) {
      const d = dst(x, y, r.x, r.y) - r.r;
      if (d < min) min = d;
    }
    return min;
  }
  function roundRequirement(r) {
    return Math.round(ROUND_GOAL_BASE * Math.pow(ROUND_GOAL_GROWTH, Math.max(0, r - 1)));
  }
  function roundSpeedScale() {
    return 1 + (round - 1) * 0.16;
  }
  function roundPointScale() {
    return 1 + (round - 1) * 0.25;
  }
  function roundFishLimit() {
    return Math.min(MAX_ROUND_FISH, MAX_FISH + Math.floor((round - 1) / 2));
  }
  function spawnDelay() {
    return Math.max(0.45, 2.2 - (round - 1) * 0.16);
  }
  function refillFish() {
    while (fish.length < roundFishLimit()) fish.push(makeFish());
  }

  function trackEvent(type, data) {
    if (!window.AgeeAnalytics || !AgeeAnalytics.trackEvent) return;
    AgeeAnalytics.trackEvent(type, Object.assign({
      score,
      round,
      time_left: Math.ceil(timer),
    }, data || {}));
  }

  function gameSessionStats(endReason) {
    return {
      duration_seconds: runStartedAt ? Math.max(0, Math.round((Date.now() - runStartedAt) / 1000)) : 0,
      max_floor: round,
      max_level: score,
      deaths: 0,
      enemies_killed: catches,
      end_reason: endReason || 'time_up',
    };
  }

  function endAnalyticsSession(endReason, unload) {
    if (!analyticsSessionActive || !window.AgeeAnalytics) return;
    const stats = gameSessionStats(endReason);
    if (unload && AgeeAnalytics.endGameSessionUnload) AgeeAnalytics.endGameSessionUnload(stats);
    else if (AgeeAnalytics.endGameSession) AgeeAnalytics.endGameSession(stats);
    analyticsSessionActive = false;
  }

  function makeFish() {
    const def = FISH_DEF[Math.floor(Math.random() * FISH_DEF.length)];
    const spd = Math.round(def.spd * roundSpeedScale());
    const pts = Math.round(def.pts * roundPointScale());
    const pulls = def.pulls + Math.floor((round - 1) / 3);
    let x, y, attempts = 0;
    do {
      x = 45 + Math.random() * (VW - 90);
      y = 30 + Math.random() * (VH - 60);
      attempts++;
    } while ((boatDist(x, y) < 1.35 || rockMinDist(x, y) < 22) && attempts < 60);
    const ang = Math.random() * Math.PI * 2;
    return { ...def, spd, pts, pulls, x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, facing: ang,
             wobble: Math.random() * Math.PI * 2, wanderT: 0.8 + Math.random() * 2, state: 'free', pullsLeft: pulls };
  }

  function throwSpear() {
    if (SP.state !== 'held') return;
    const ang = Math.atan2(my - P.y, mx - P.x);
    Object.assign(SP, { state: 'flying', x: P.x, y: P.y, vx: Math.cos(ang) * SPEAR_SPEED,
                        vy: Math.sin(ang) * SPEAR_SPEED, traveled: 0, ang, fish: null });
    throws++;
    trackEvent('spear_thrown', { throws });
    addSplash(P.x, P.y, 4, 'water');
    SFX.once('sf_throw');
  }

  function pullFish() {
    if (SP.state !== 'stuck' || !SP.fish) return;
    const f = SP.fish;
    f.pullsLeft--;
    addSplash(f.x, f.y, 5, 'water'); addRipple(f.x, f.y);
    SFX.once('sf_pull');
    if (f.pullsLeft <= 0) {
      score += f.pts;
      catches++;
      if (score > hi) { hi = score; localStorage.setItem('sf_hi', String(hi)); }
      addSplash(f.x, f.y, 16, 'gold');
      SFX.once('sf_catch');
      addPopup(f.x, f.y - 24, '+' + f.pts + ' ' + f.name + '!');
      trackEvent('fish_caught', {
        fish: f.name,
        points: f.pts,
        catches,
      });
      fish = fish.filter(ff => ff !== f);
      SP.state = 'held'; SP.fish = null; gs = S.PLAYING;
      spawnTimer = spawnDelay();
      checkRoundAdvance();
      updateHUD();
    } else {
      const fAng = Math.random() * Math.PI * 2;
      f.x = Math.max(22, Math.min(VW - 22, f.x + Math.cos(fAng) * 38));
      f.y = Math.max(14, Math.min(VH - 14, f.y + Math.sin(fAng) * 38));
    }
  }

  function startGame() {
    SFX.init();
    SFX.startAmbient();
    score = 0; timer = ROUND_TIME; round = 1; roundGoal = ROUND_GOAL_BASE; gs = S.PLAYING;
    runStartedAt = Date.now();
    throws = 0;
    catches = 0;
    analyticsSessionActive = false;
    if (window.AgeeAnalytics && AgeeAnalytics.startGameSession) {
      AgeeAnalytics.startGameSession('spear_fisher').then(() => {
        analyticsSessionActive = true;
        trackEvent('game_started');
      });
    } else {
      trackEvent('game_started');
    }
    SP.state = 'held'; SP.fish = null;
    fish = [];
    refillFish();
    spawnTimer = 0;
    document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
    updateHUD();
  }

  function checkRoundAdvance() {
    if (score < roundGoal) return;

    round++;
    timer = ROUND_TIME;
    roundGoal += roundRequirement(round);
    SP.state = 'held';
    SP.fish = null;
    gs = S.PLAYING;
    fish = fish.filter(f => f.state === 'free');
    refillFish();
    addPopup(P.x, P.y - 42, 'ROUND ' + round + '!');
    trackEvent('round_reached', { reached_round: round, next_goal: roundGoal });
    SFX.once('sf_catch');
  }

  function loadLeaderboardScores() {
    try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
    catch (_) { return []; }
  }

  function leaderboardPayload(entry) {
    const dateMs = Number(entry.date) || Date.now();
    return {
      player_id: window.AgeeLeaderboard ? AgeeLeaderboard.playerId() : 'guest-player',
      nickname: window.AgeeLeaderboard
        ? AgeeLeaderboard.cleanName(entry.name, 'FISHER')
        : String(entry.name || 'FISHER').trim().substring(0, 16),
      score: Number(entry.score) || 0,
      created_at: new Date(dateMs).toISOString(),
    };
  }

  function syncLocalLeaderboard() {
    if (!window.AgeeLeaderboard || !AgeeLeaderboard.syncLocal) return;
    AgeeLeaderboard.syncLocal(
      'spear_fisher_leaderboard',
      loadLeaderboardScores(),
      leaderboardPayload,
      { syncKey: LB_SYNC_KEY }
    ).then(result => {
      if (result && result.failed) console.warn('[Spear Fisher leaderboard] Local sync failed for some rows.', result);
    });
  }

  function saveLeaderboardScore(name) {
    const nick = window.AgeeLeaderboard && AgeeLeaderboard.submissionName
      ? AgeeLeaderboard.submissionName(name, 'FISHER')
      : String(name || 'FISHER').trim().substring(0, 16);
    const date = Date.now();
    const rows = loadLeaderboardScores();
    const entry = {
      name: nick,
      score: Number(score) || 0,
      date,
    };
    rows.push(entry);
    rows.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || (Number(a.date) || 0) - (Number(b.date) || 0));
    rows.splice(20);
    localStorage.setItem(LB_KEY, JSON.stringify(rows));

    if (window.AgeeLeaderboard && AgeeLeaderboard.insert) {
      AgeeLeaderboard.insert('spear_fisher_leaderboard', leaderboardPayload(entry), { syncKey: LB_SYNC_KEY }).then(result => {
        if (result && result.error) console.warn('[Spear Fisher leaderboard] Supabase insert failed.', result.error);
      });
    }
  }

  function triggerLeaderboardPrompt() {
    const prompt = document.getElementById('leaderboardPrompt');
    const rows = loadLeaderboardScores();
    const qualifies = rows.length < 20 || score > (Number(rows[rows.length - 1]?.score) || 0);
    if (!qualifies) {
      if (prompt) prompt.style.display = 'none';
      return;
    }

    if (window.AgeeLeaderboard && AgeeLeaderboard.isLoggedIn && AgeeLeaderboard.isLoggedIn()) {
      saveLeaderboardScore('');
      if (prompt) prompt.style.display = 'none';
      return;
    }

    if (prompt) prompt.style.display = 'block';
    const saveBtn = document.getElementById('lbSaveBtn');
    const input = document.getElementById('lbNickname');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 0);
      input.onkeydown = event => {
        if (event.key === 'Enter' && saveBtn) saveBtn.click();
      };
    }
    if (saveBtn) {
      saveBtn.onclick = () => {
        saveLeaderboardScore(input ? input.value : 'FISHER');
        if (prompt) prompt.style.display = 'none';
      };
    }
  }

  function endGame() {
    gs = S.OVER;
    trackEvent('game_over', {
      end_reason: 'time_up',
      throws,
      catches,
      final_score: score,
      final_round: round,
    });
    endAnalyticsSession('time_up');
    SFX.once('sf_gameover');
    SFX.stopAmbient();
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalHigh').textContent = hi;
    const msgs = ['Good haul!', 'The sea provides!', 'A worthy catch!', 'The ocean remembers.', 'You are one with the water.'];
    document.getElementById('finalMsg').textContent = msgs[Math.floor(Math.random() * msgs.length)] + ' Round ' + round + '.';
    document.getElementById('gameoverScreen').classList.add('active');
    triggerLeaderboardPrompt();
  }

  function dst(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  function update(dt) {
    wt += dt;
    if (gs !== S.PLAYING && gs !== S.REELING) return;

    timer -= dt;
    if (timer <= 0) { timer = 0; endGame(); return; }

    // Spear flight
    if (SP.state === 'flying') {
      const fdx = SP.vx * dt, fdy = SP.vy * dt;
      SP.x += fdx; SP.y += fdy;
      SP.traveled += Math.sqrt(fdx * fdx + fdy * fdy);
      for (const f of fish) {
        if (f.state !== 'free') continue;
        if (dst(SP.x, SP.y, f.x, f.y) < f.size * 0.88) {
          SP.state = 'stuck'; SP.fish = f; f.state = 'speared'; f.vx = f.vy = 0;
          gs = S.REELING; addSplash(SP.x, SP.y, 10, 'water'); addRipple(SP.x, SP.y);
          trackEvent('fish_speared', { fish: f.name });
          SFX.once('sf_stick'); break;
        }
      }
      if (SP.state === 'flying' && (SP.traveled > SPEAR_MAX_D || SP.x < -10 || SP.x > VW + 10 || SP.y < -10 || SP.y > VH + 10)) {
        addSplash(SP.x, SP.y, 7, 'water'); addRipple(SP.x, SP.y); SP.state = 'held';
        trackEvent('spear_missed', { throws });
        SFX.once('sf_splash');
      }
    }

    // Stuck fish slowly drifts away
    if (SP.state === 'stuck' && SP.fish) {
      const f = SP.fish;
      const awayAng = Math.atan2(f.y - P.y, f.x - P.x);
      f.x = Math.max(18, Math.min(VW - 18, f.x + Math.cos(awayAng) * 18 * dt));
      f.y = Math.max(12, Math.min(VH - 12, f.y + Math.sin(awayAng) * 18 * dt));
      SP.x = f.x; SP.y = f.y; f.wobble += dt * 15;
    }

    // Fish AI
    for (const f of fish) {
      if (f.state !== 'free') continue;
      f.wanderT -= dt;
      if (f.wanderT <= 0) {
        f.facing += (Math.random() - 0.5) * 1.6;
        f.vx = Math.cos(f.facing) * f.spd; f.vy = Math.sin(f.facing) * f.spd;
        f.wanderT = 0.9 + Math.random() * 2.5;
      }
      if (boatDist(f.x, f.y) < 1.3) {
        const av = Math.atan2(f.y - BOAT.cy, f.x - BOAT.cx);
        f.vx += Math.cos(av) * 130 * dt; f.vy += Math.sin(av) * 130 * dt;
        const spd = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
        if (spd > f.spd * 1.6) { f.vx = (f.vx / spd) * f.spd * 1.6; f.vy = (f.vy / spd) * f.spd * 1.6; }
      }
      for (const r of ROCK_CONFIGS) {
        const rd = dst(f.x, f.y, r.x, r.y);
        if (rd < r.r + f.size + 10) {
          const av = Math.atan2(f.y - r.y, f.x - r.x);
          f.vx += Math.cos(av) * 110 * dt; f.vy += Math.sin(av) * 110 * dt;
        }
      }
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.facing = Math.atan2(f.vy, f.vx);
      if (f.x < 28)      { f.x = 28;      f.vx =  Math.abs(f.vx); f.facing = Math.atan2(f.vy, f.vx); }
      if (f.x > VW - 28) { f.x = VW - 28; f.vx = -Math.abs(f.vx); f.facing = Math.atan2(f.vy, f.vx); }
      if (f.y < 18)      { f.y = 18;      f.vy =  Math.abs(f.vy); f.facing = Math.atan2(f.vy, f.vx); }
      if (f.y > VH - 18) { f.y = VH - 18; f.vy = -Math.abs(f.vy); f.facing = Math.atan2(f.vy, f.vx); }
      f.wobble += dt * 5.8;
    }

    if (fish.length < roundFishLimit()) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        fish.push(makeFish());
        spawnTimer = spawnDelay();
      }
    }

    updateHUD();
  }

  // ── HUD ────────────────────────────────────────────────
  function updateHUD() {
    document.getElementById('hudScore').textContent = score;
    document.getElementById('hudHigh').textContent = hi;
    document.getElementById('hudRound').textContent = round;
    document.getElementById('hudGoal').textContent = roundGoal;
    document.getElementById('hudTime').textContent = Math.ceil(timer);
    const rp = document.getElementById('reelPrompt'), st = document.getElementById('hudStatus');
    if (gs === S.REELING && SP.fish) {
      rp.textContent = 'REEL IT IN! — ' + SP.fish.name + ' (' + SP.fish.pullsLeft + ' pull' + (SP.fish.pullsLeft !== 1 ? 's' : '') + ' left)';
      rp.style.opacity = '1'; st.textContent = 'REEL!';
    } else if (gs === S.PLAYING) {
      rp.style.opacity = '0';
      st.textContent = 'Round ' + round + ' - ' + Math.max(0, roundGoal - score) + ' to advance';
    }
  }

  /* ════════════════════════════════════════════════════════
     3D RENDER SYNC
  ════════════════════════════════════════════════════════ */
  const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3();

  function syncScene(dt) {
    updateWater(wt);

    // Boat + player bob on the swell
    const bob = Math.sin(wt * 0.9) * 0.18;
    boatGroup.position.y = 0.15 + bob;
    boatGroup.rotation.z = Math.sin(wt * 0.7) * 0.018;
    boatGroup.rotation.x = Math.sin(wt * 0.55 + 1.2) * 0.014;
    playerGroup.position.set(vx2w(P.x), 1.45 + bob, vy2w(P.y));
    playerGroup.rotation.y = -P.angle + Math.PI / 2;

    // Seaweed sway
    for (const w of weedBlades) {
      w.rotation.x = Math.sin(wt * 1.2 + w.userData.sway) * 0.12;
    }

    // Caustic shimmer
    for (const c of caustics) {
      if (!c || !c.userData) continue;
      const u = c.userData;
      const pulse = Math.sin(wt * u.spd + u.phase);
      c.scale.set(u.baseR * (1 + pulse * 0.28), u.baseR * 0.5 * (1 + pulse * 0.28), 1);
      c.position.x += Math.sin(wt * 0.38 + u.phase) * 0.01;
      c.position.z += Math.cos(wt * 0.28 + u.phase) * 0.008;
    }

    syncFishMeshes();

    // Spear
    const playing = gs === S.PLAYING || gs === S.REELING;
    if (playing && SP.state !== 'held') {
      spearGroup.visible = true;
      spearGroup.position.set(vx2w(SP.x), FISH_DEPTH + 0.3, vy2w(SP.y));
      spearGroup.rotation.y = -SP.ang;
    } else {
      spearGroup.visible = false;
    }

    // Rope: player hand → spear
    if (playing && SP.state !== 'held') {
      ropeLine.visible = true;
      _v0.set(vx2w(P.x), 1.6 + bob, vy2w(P.y));
      _v1.set(vx2w(SP.x), FISH_DEPTH + 0.3, vy2w(SP.y));
      ropeLine.geometry.setFromPoints([_v0, _v1]);
    } else {
      ropeLine.visible = false;
    }

    // Aim guide while holding the spear
    if (playing && SP.state === 'held') {
      aimLine.visible = true;
      const reach = SPEAR_MAX_D * WS;
      _v0.set(vx2w(P.x), 0.25, vy2w(P.y));
      _v1.set(
        vx2w(P.x) + Math.cos(P.angle) * reach,
        FISH_DEPTH + 0.3,
        vy2w(P.y) + Math.sin(P.angle) * reach
      );
      aimLine.geometry.setFromPoints([_v0, _v1]);
    } else {
      aimLine.visible = false;
    }

    updateEffects(dt);
  }

  // ── Game loop ──────────────────────────────────────────
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.1);
    update(dt);
    syncScene(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  // ── Init ───────────────────────────────────────────────
  function init() {
    buildScene();
    setTimeout(syncLocalLeaderboard, 0);
    trackEvent('game_loaded');
    window.addEventListener('beforeunload', () => {
      if (gs === S.PLAYING || gs === S.REELING) endAnalyticsSession('quit', true);
    });
    window.addEventListener('pointerdown', () => SFX.init(), { once: true });
    window.addEventListener('keydown', (e) => {
      SFX.init();
      if (e.code === 'Escape') {
        window.dispatchEvent(new Event('arcade:exit-game'));
      }
    }, { once: false });
    const el = renderer.domElement;
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('click', onMouseClick);
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: false });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    document.getElementById('titleStartBtn').addEventListener('click', startGame);
    document.getElementById('restartBtn').addEventListener('click', startGame);
    if (hi > 0) { document.getElementById('titleHi').textContent = hi; document.getElementById('titleBest').style.display = 'flex'; }
    document.getElementById('hudHigh').textContent = hi;
    fish = [];
    refillFish();
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
  return { startGame, endGame };
})();
