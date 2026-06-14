/**
 * ArcadeScene — Three.js 3D arcade hall
 *
 * Room: 30 wide × 30 deep × 5 tall
 * Player starts at (0, 0, 8) facing -Z toward cabinets
 */
window.ArcadeScene = (() => {
  'use strict';

  let _renderer, _scene, _camera, _clock;
  let _running = false;
  let _rafId   = null;
  let _signGlow  = null;   // animated in _loop
  let _glowPools = [];     // per-cabinet floor glow, animated in _loop

  /* ── Floor carpet texture — classic 80s arcade carpet ── */
  function _makeCarpetTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0d0a1e';
    ctx.fillRect(0, 0, size, size);

    // Carpet weave noise
    for (let i = 0; i < 2600; i++) {
      const x = (i * 73) % size, y = (i * 151) % size;
      ctx.fillStyle = (i % 3 === 0) ? 'rgba(40,28,80,0.5)' : 'rgba(10,6,30,0.5)';
      ctx.fillRect(x, y, 2, 2);
    }

    const NEON = ['#ff2d95', '#00e5ff', '#ffe600', '#7b2dff', '#00ff88'];
    // Deterministic pseudo-random scatter so tiling repeats cleanly
    const rnd = (n, m) => ((n * 2654435761 + m * 40503) % 1000) / 1000;

    // Confetti squiggles
    for (let i = 0; i < 26; i++) {
      const x = rnd(i, 1) * size, y = rnd(i, 2) * size;
      const col = NEON[i % NEON.length];
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth   = 4;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      const len = 24 + rnd(i, 3) * 30;
      const dir = rnd(i, 4) * Math.PI * 2;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(dir) * len * 0.5 + (rnd(i, 5) - 0.5) * 26,
        y + Math.sin(dir) * len * 0.5 + (rnd(i, 6) - 0.5) * 26,
        x + Math.cos(dir) * len,
        y + Math.sin(dir) * len
      );
      ctx.stroke();
    }

    // Confetti triangles + dots
    for (let i = 0; i < 22; i++) {
      const x = rnd(i, 7) * size, y = rnd(i, 8) * size;
      const col = NEON[(i + 2) % NEON.length];
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.7;
      if (i % 2 === 0) {
        const s = 8 + rnd(i, 9) * 8;
        const a = rnd(i, 10) * Math.PI * 2;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const ang = a + k * (Math.PI * 2 / 3);
          const px = x + Math.cos(ang) * s, py = y + Math.sin(ang) * s;
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 3.5 + rnd(i, 11) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 5);
    return tex;
  }

  /* ── Wall texture ───────────────────────────────── */
  function _makeWallTexture() {
    const w = 512, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0f0c20';
    ctx.fillRect(0, 0, w, h);

    // Horizontal panel lines
    ctx.strokeStyle = 'rgba(100,50,200,0.2)';
    ctx.lineWidth = 1;
    for (let y = 40; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // Vertical panel lines
    for (let x = 64; x < w; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    // Subtle gradient fade at top
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(80,30,180,0.15)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 1);
    return tex;
  }

  /* ── Neon sign texture ──────────────────────────── */
  function _makeSignTexture() {
    const w = 1024, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0a0818';
    ctx.fillRect(0, 0, w, h);

    // Outer glow
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0,   'rgba(130,50,255,0)');
    grad.addColorStop(0.2, 'rgba(130,50,255,0.2)');
    grad.addColorStop(0.8, 'rgba(130,50,255,0.2)');
    grad.addColorStop(1,   'rgba(130,50,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Main text — multiple glow passes
    for (let i = 3; i >= 0; i--) {
      ctx.shadowColor = '#cc88ff';
      ctx.shadowBlur  = 8 + i * 20;
      ctx.fillStyle   = i === 0 ? '#ffffff' : `rgba(220,160,255,${0.3 + i * 0.15})`;
      ctx.font        = 'bold 108px "Courier New", monospace';
      ctx.fillText('AGEE  ARCADE', w / 2, h / 2 - 18);
    }

    ctx.shadowBlur  = 12;
    ctx.shadowColor = '#9933ff';
    ctx.fillStyle   = '#cc99ff';
    ctx.font        = '34px "Courier New", monospace';
    ctx.fillText('— INSERT COIN —', w / 2, h / 2 + 62);

    return new THREE.CanvasTexture(c);
  }

  /* ── Room ───────────────────────────────────────── */
  function _buildRoom(scene) {
    const floorTex = _makeCarpetTexture();
    const wallTex  = _makeWallTexture();

    // Floor — segmented so point lights shade smoothly across it
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30, 40, 40),
      new THREE.MeshLambertMaterial({ map: floorTex })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const CEIL_Y = 9;

    // Ceiling
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30, 20, 20),
      new THREE.MeshLambertMaterial({ color: 0x060510 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, CEIL_Y, 0);
    scene.add(ceil);

    // Walls — tall panels, texture repeats vertically twice
    const wallTex2 = wallTex.clone();
    wallTex2.needsUpdate = true;
    wallTex2.repeat.set(4, 2);
    const wallMatT = () => new THREE.MeshLambertMaterial({ map: wallTex2 });
    const wallGeo  = () => new THREE.PlaneGeometry(30, CEIL_Y, 30, 9);

    const back = new THREE.Mesh(wallGeo(), wallMatT());
    back.position.set(0, CEIL_Y / 2, -15);
    scene.add(back);

    const front = new THREE.Mesh(wallGeo(), wallMatT());
    front.position.set(0, CEIL_Y / 2, 15);
    front.rotation.y = Math.PI;
    scene.add(front);

    const left = new THREE.Mesh(wallGeo(), wallMatT());
    left.position.set(-15, CEIL_Y / 2, 0);
    left.rotation.y = Math.PI / 2;
    scene.add(left);

    const right = new THREE.Mesh(wallGeo(), wallMatT());
    right.position.set(15, CEIL_Y / 2, 0);
    right.rotation.y = -Math.PI / 2;
    scene.add(right);

    // Neon sign — high on the back wall, large
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 3.5),
      new THREE.MeshBasicMaterial({ map: _makeSignTexture(), transparent: true })
    );
    sign.position.set(0, 7.2, -14.9);
    scene.add(sign);

    // Baseboard neon strips (floor level)
    const mkStrip = (geo, x, y, z) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x7722ee }));
      m.position.set(x, y, z);
      scene.add(m);
    };
    mkStrip(new THREE.BoxGeometry(30, 0.06, 0.06), 0, 0.03, -14.97);
    mkStrip(new THREE.BoxGeometry(30, 0.06, 0.06), 0, 0.03,  14.97);
    mkStrip(new THREE.BoxGeometry(0.06, 0.06, 30), -14.97, 0.03, 0);
    mkStrip(new THREE.BoxGeometry(0.06, 0.06, 30),  14.97, 0.03, 0);

    // Mid-wall horizontal accent strip
    mkStrip(new THREE.BoxGeometry(30, 0.06, 0.06), 0, 3.5, -14.97);
    mkStrip(new THREE.BoxGeometry(0.06, 0.06, 30), -14.97, 3.5, 0);
    mkStrip(new THREE.BoxGeometry(0.06, 0.06, 30),  14.97, 3.5, 0);

    // Ceiling trim strips
    mkStrip(new THREE.BoxGeometry(30, 0.06, 0.06), 0, CEIL_Y - 0.03, -14.97);
    mkStrip(new THREE.BoxGeometry(30, 0.06, 0.06), 0, CEIL_Y - 0.03,  14.97);
    mkStrip(new THREE.BoxGeometry(0.06, 0.06, 30), -14.97, CEIL_Y - 0.03, 0);
    mkStrip(new THREE.BoxGeometry(0.06, 0.06, 30),  14.97, CEIL_Y - 0.03, 0);

    // Ceiling light fixtures — long bars over each cabinet column
    [-12, -6, 0, 6, 12].forEach(x => {
      const fixture = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.1, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xeeddff })
      );
      fixture.position.set(x, CEIL_Y - 0.08, 0);
      scene.add(fixture);
    });

    // Ceiling neon rails — two long magenta/cyan strips running the room
    [{ z: -6, color: 0xff2d95 }, { z: 6, color: 0x00e5ff }].forEach(({ z, color }) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(28, 0.05, 0.05),
        new THREE.MeshBasicMaterial({ color })
      );
      rail.position.set(0, CEIL_Y - 0.05, z);
      scene.add(rail);
    });

    // Neon glow pools on the carpet in front of each cabinet
    const cabs = window.ArcadeCabinets ? ArcadeCabinets.CABINETS : [];
    cabs.forEach(cab => {
      const w = 256;
      const c = document.createElement('canvas');
      c.width = c.height = w;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(w/2, w/2, 0, w/2, w/2, w/2);
      g.addColorStop(0, cab.neonHex);
      g.addColorStop(0.5, cab.neonHex + '44');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, w);

      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 3.4),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(c),
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(cab.position[0], 0.01, cab.position[2] + 2.2);
      scene.add(pool);
      _glowPools.push({ mesh: pool, phase: cab.position[0] });
    });
  }

  /* ── Lighting ───────────────────────────────────── */
  function _buildLights(scene) {
    // Ambient — enough to see everything, purple-tinted
    scene.add(new THREE.AmbientLight(0x4433aa, 2.4));

    // Hemisphere — warm top, cool bottom
    scene.add(new THREE.HemisphereLight(0x6644cc, 0x221144, 1.5));

    // Sign glow — bright, positioned below sign; pulsed in _loop
    _signGlow = new THREE.PointLight(0xcc66ff, 5, 18);
    _signGlow.position.set(0, 7.5, -12);
    scene.add(_signGlow);

    // Ceiling strip lights — drop down from ceiling height 9
    [-8, 0, 8].forEach(x => {
      const strip = new THREE.PointLight(0xaa88ff, 3, 18);
      strip.position.set(x, 8.5, 0);
      scene.add(strip);
    });

    // Cabinet accent lights — one per cabinet in its own neon color,
    // positions/colors come straight from the cabinet roster
    const cabs = window.ArcadeCabinets ? ArcadeCabinets.CABINETS : [];
    cabs.forEach(cab => {
      const pl = new THREE.PointLight(cab.neon, 3.2, 9);
      pl.position.set(cab.position[0], 3.2, cab.position[2] + 1);
      scene.add(pl);
    });

    // Front of room lights so player area is lit
    [-6, 6].forEach(x => {
      const pl = new THREE.PointLight(0x8866cc, 1.5, 12);
      pl.position.set(x, 3.5, 6);
      scene.add(pl);
    });

    // Billboard accent lights — illuminate the ad frames on the side walls
    [
      { pos: [-12, 4.5,  1],  color: 0xaa66ff },
      { pos: [ 12, 4.5,  1],  color: 0xaa66ff },
      { pos: [-12, 4.5, -6],  color: 0xaa66ff },
    ].forEach(({ pos, color }) => {
      const pl = new THREE.PointLight(color, 2.5, 8);
      pl.position.set(...pos);
      scene.add(pl);
    });
  }

  /* ── RAF loop ───────────────────────────────────── */
  function _loop() {
    if (!_running) return;
    _rafId = requestAnimationFrame(_loop);
    const dt = Math.min(_clock.getDelta(), 0.05);
    const t  = _clock.elapsedTime;

    // Neon breathing — sign hum + carpet glow pools shimmer
    if (_signGlow) _signGlow.intensity = 5 + Math.sin(t * 2.1) * 0.6 + Math.sin(t * 13.7) * 0.18;
    for (const p of _glowPools) {
      p.mesh.material.opacity = 0.22 + Math.sin(t * 1.6 + p.phase) * 0.06;
    }

    ArcadePlayer.tick(dt);
    if (window.ArcadeCabinets)      ArcadeCabinets.tick();
    if (window.ArcadeAds)           ArcadeAds.tick();
    if (window.ArcadeCommentsBoard) ArcadeCommentsBoard.tick();
    _renderer.render(_scene, _camera);
  }

  /* ── Init ───────────────────────────────────────── */
  function init() {
    const canvas = document.getElementById('arcade-canvas');
    if (!canvas) { console.error('[ArcadeScene] #arcade-canvas not found'); return; }

    _renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(window.innerWidth, window.innerHeight);

    _scene = new THREE.Scene();
    _scene.background = new THREE.Color(0x090716);
    _scene.fog = new THREE.Fog(0x090716, 24, 42);

    _camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 60);
    _clock  = new THREE.Clock();

    _buildRoom(_scene);
    _buildLights(_scene);

    // Pass scene so player can add character mesh
    ArcadePlayer.init(_camera, _scene);
    if (window.ArcadeCabinets)      ArcadeCabinets.init(_scene);
    if (window.ArcadeAds)           ArcadeAds.init(_scene, _camera, _renderer);
    if (window.ArcadeCommentsBoard) ArcadeCommentsBoard.init(_scene);

    window.addEventListener('resize', () => {
      _camera.aspect = window.innerWidth / window.innerHeight;
      _camera.updateProjectionMatrix();
      _renderer.setSize(window.innerWidth, window.innerHeight);
    });

    _running = true;
    _loop();
  }

  function pause()  { _running = false; cancelAnimationFrame(_rafId); }
  function resume() { if (!_running) { _running = true; _clock.getDelta(); _loop(); } }

  return { init, pause, resume };
})();
