/**
 * ArcadeCabinets — cabinet meshes styled to match the CSS 3D cabinet design
 *
 * Cabinet positions (backed up against the back wall, z=-14.3):
 *   x=-12 Depths of Ashenveil
 *   x=-6  Maze Runner
 *   x=0   Blacktide Bastion
 *   x=6   Spear Fisher
 *   x=12  Coming Soon
 *
 * Standing in FRONT of a cabinet, E plays the game. Standing to the SIDE,
 * E opens that game's comments (the side panels carry the COMMENTS station).
 *
 * Fires window event 'arcade:launch' with { cabinet } when player presses E near one.
 * Listens for window event 'arcade:interact' from player.js.
 */
window.ArcadeCabinets = (() => {
  'use strict';

  const INTERACT_DIST = 3.5;

  const CABINETS = [
    {
      id:       'depths-of-ashenveil',
      title:    'Depths of\nAshenveil',
      marquee:  'ASHENVEIL',
      url:      './games/depths-of-ashenveil/',
      image:    '../images/depths-of-ashenveil.png',
      position: [-12, 0, -14.3],
      neon:     0xd4880a,
      neonHex:  '#d4880a',
      screen:   0x1e0900,
      urls:     [
        './games/depths-of-ashenveil/',
        './games/depths-of-ashenveil/css/layout.css',
        './games/depths-of-ashenveil/css/ui.css',
      ],
    },
    {
      id:       'maze-runner',
      title:    'Maze\nRunner',
      marquee:  'MAZE RUNNER',
      url:      './games/maze-runner/',
      image:    '../images/maze-runner-thumb.jpg',
      position: [-6, 0, -14.3],
      neon:     0x00ff88,
      neonHex:  '#00ff88',
      screen:   0x001a08,
      urls:     [
        './games/maze-runner/',
        './games/maze-runner/css/layout.css',
        './games/maze-runner/css/ui.css',
      ],
    },
    {
      id:       'blacktide-bastion',
      title:    'Blacktide\nBastion',
      marquee:  'BLACKTIDE',
      url:      './games/blacktide-bastion/',
      image:    '../images/blacktide-bastion.png',
      position: [0, 0, -14.3],
      neon:     0xff4433,
      neonHex:  '#ff4433',
      screen:   0x1a0505,
      urls:     [
        './games/blacktide-bastion/',
        './games/blacktide-bastion/css/layout.css',
        './games/blacktide-bastion/css/ui.css',
      ],
    },
    {
      id:       'spear_fisher',
      title:    'Spear\nFisher',
      marquee:  'SPEAR FISHER',
      url:      './games/spear_fisher/',
      image:    '../images/spear_fisher.png',
      position: [6, 0, -14.3],
      neon:     0x00ccff,
      neonHex:  '#00ccff',
      screen:   0x001220,
      urls:     [
        './games/spear_fisher/',
        './games/spear_fisher/css/layout.css',
        './games/spear_fisher/css/ui.css',
      ],
    },
    {
      id:       'agee-hoops',
      title:    'Agee\nHoops',
      marquee:  'AGEE HOOPS',
      url:      './games/agee-hoops/',
      image:    '../images/agee-hoops.png',
      position: [12, 0, -14.3],
      neon:     0xffd700,
      neonHex:  '#ffd700',
      screen:   0x0a0a0f,
      urls:     [
        './games/agee-hoops/',
        './games/agee-hoops/style.css',
      ],
    },
  ];

  // ── Shared cabinet dimensions (mirror CSS design) ─────────────────
  // CSS design (scaled to Three.js units, ~1 unit = 40px):
  //   Body W=145px → 1.45u   Total H=316px → ~3.16u
  //   [A] Marquee  H=44px  → 0.44u   overhang 8px → 0.08u each side
  //   [B] Monitor  H=110px → 1.10u
  //   [C] Ctrl     H=52px  → 0.52u
  //   [D] Base     H=110px → 1.10u
  //   Depth D=115px → 1.15u (side face depth)
  const W  = 1.45;   // cabinet width
  const D  = 1.15;   // cabinet depth
  const MQH = 0.44;  // marquee height
  const MOH = 1.10;  // monitor section height
  const CTH = 0.52;  // control panel height
  const BSH = 1.10;  // base height
  const MQW = W + 0.16; // marquee wider (8px overhang each side)

  // Y positions (bottom of cab = y=0)
  const baseY  = BSH / 2;
  const ctrlY  = BSH + CTH / 2;
  const monY   = BSH + CTH + MOH / 2;
  const mqY    = BSH + CTH + MOH + MQH / 2;

  let _scene      = null;
  let _meshGroups = [];
  let _preloaded  = new Set();
  let _nearIdx    = -1;
  let _nearZone   = 'front';  // 'front' | 'right' (comments station) | 'left'
  let _promptEl   = null;

  // ── Material helpers ───────────────────────────────────────────────

  // Blend the cabinet's neon color into the purple body so each cabinet
  // reads as its own machine from across the room.
  function _tint(base, neon, amt) {
    const b = new THREE.Color(base);
    const n = new THREE.Color(neon);
    return b.lerp(n, amt).getHex();
  }

  function bodyMat(cab)       { return new THREE.MeshLambertMaterial({ color: _tint(0x2a1060, cab.neon, 0.14) }); }
  function bodyDarkMat(cab)   { return new THREE.MeshLambertMaterial({ color: _tint(0x1e0a48, cab.neon, 0.10) }); }
  function bodyDarkerMat(cab) { return new THREE.MeshLambertMaterial({ color: _tint(0x160840, cab.neon, 0.08) }); }
  function neonMat(color)  { return new THREE.MeshBasicMaterial({ color }); }
  function borderMat()     { return new THREE.MeshBasicMaterial({ color: 0x6040c0 }); }

  // ── Screen texture — game screenshot when available, text otherwise ─
  function _makeScreenTex(cab) {
    const w = 256, h = 192;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    function crtOverlay() {
      // CRT scanlines
      for (let y = 0; y < h; y += 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(0, y, w, 2);
      }
      // Vignette
      const vg = ctx.createRadialGradient(w/2, h/2, h*0.2, w/2, h/2, h*0.75);
      vg.addColorStop(0, 'transparent');
      vg.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    function drawTextScreen() {
      ctx.fillStyle = '#' + cab.screen.toString(16).padStart(6, '0');
      ctx.fillRect(0, 0, w, h);
      crtOverlay();

      // Game name marquee text at top of screen
      ctx.shadowColor = cab.neonHex;
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = 'rgba(255,255,255,0.25)';
      ctx.font        = '11px "Courier New", monospace';
      ctx.textAlign   = 'center';
      ctx.fillText(cab.marquee, w / 2, 22);

      // Title text — main game name
      ctx.shadowBlur  = 18;
      ctx.fillStyle   = cab.neonHex;

      const lines    = cab.title.split('\n');
      const fontSize = lines.length > 1 ? 28 : 34;
      const lineH    = lines.length > 1 ? 38 : 44;
      ctx.font       = `bold ${fontSize}px Georgia, serif`;
      const startY   = h / 2 - (lines.length - 1) * (lineH / 2);
      lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lineH));

      // Tagline
      ctx.shadowBlur  = 0;
      ctx.font        = 'italic 14px Georgia, serif';
      ctx.fillStyle   = 'rgba(200,200,200,0.35)';
      if (cab.url) {
        ctx.fillText('press E to play', w / 2, h - 22);
      } else {
        ctx.font      = '16px "Courier New", monospace';
        ctx.fillStyle = 'rgba(180,180,180,0.3)';
        ctx.fillText('coming soon', w / 2, h - 22);
      }
    }

    drawTextScreen();
    const tex = new THREE.CanvasTexture(c);

    // Swap in the real game screenshot once it loads; text version
    // remains as the fallback if the image is missing.
    if (cab.image) {
      const img = new Image();
      img.onload = () => {
        // cover-fit the screenshot
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        crtOverlay();

        // Game name banner along the bottom so the cab is still labeled
        ctx.fillStyle = 'rgba(4,2,10,0.72)';
        ctx.fillRect(0, h - 28, w, 28);
        ctx.shadowColor = cab.neonHex;
        ctx.shadowBlur  = 8;
        ctx.fillStyle   = cab.neonHex;
        ctx.font        = 'bold 14px "Courier New", monospace';
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cab.marquee + (cab.url ? '  ·  [E] PLAY' : ''), w / 2, h - 14);

        tex.needsUpdate = true;
      };
      img.src = cab.image;
    }

    return tex;
  }

  // ── Marquee texture — game name lit in the cabinet's neon color ───
  function _makeMarqueeTex(cab) {
    const w = 512, h = 96;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    // Deep purple background with slight gradient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0c0428');
    bg.addColorStop(0.5, '#180850');
    bg.addColorStop(1, '#0c0428');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Neon border in the cabinet's color
    ctx.strokeStyle = cab.neonHex;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.globalAlpha = 1;

    // Game name — main marquee text
    ctx.shadowColor = cab.neonHex;
    ctx.shadowBlur  = 16;
    ctx.fillStyle   = cab.neonHex;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    const nameSize  = cab.marquee.length > 10 ? 30 : 36;
    ctx.font        = `bold ${nameSize}px "Courier New", monospace`;
    ctx.fillText(cab.marquee, w / 2, h / 2 - 10);

    // ★ AGEE ARCADE ★ sublabel
    ctx.shadowBlur  = 4;
    ctx.shadowColor = 'rgba(120,80,200,0.6)';
    ctx.font        = '13px "Courier New", monospace';
    ctx.fillStyle   = '#8060c0';
    ctx.fillText('★ AGEE ARCADE ★', w / 2, h / 2 + 22);

    return new THREE.CanvasTexture(c);
  }

  // ── Thin neon trim strip ───────────────────────────────────────────
  function _addTrim(group, w, h, d, x, y, z, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), neonMat(color));
    m.position.set(x, y, z);
    group.add(m);
  }

  // ── Build one cabinet ──────────────────────────────────────────────
  function _buildCabinet(cab) {
    const group = new THREE.Group();
    const [cx, , cz] = cab.position;
    group.position.set(cx, 0, cz);

    const frontZ = D / 2;

    // ══════════════════════════════════════════
    // [D] BASE
    // ══════════════════════════════════════════
    const base = new THREE.Mesh(new THREE.BoxGeometry(W, BSH, D), bodyDarkerMat(cab));
    base.position.set(0, baseY, 0);
    group.add(base);

    // Base front border strip (neon top edge of base)
    _addTrim(group, W, 0.025, 0.025, 0, BSH, frontZ, 0x6040c0);

    // Coin box — small protrusion on base front
    const coinBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.04), bodyDarkMat(cab));
    coinBox.position.set(0, BSH * 0.35, frontZ + 0.02);
    group.add(coinBox);

    // Coin slot label texture
    const coinTex = _makeCoinTex(cab);
    const coinScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.64, 0.12),
      new THREE.MeshBasicMaterial({ map: coinTex })
    );
    coinScreen.position.set(0, BSH * 0.35, frontZ + 0.045);
    group.add(coinScreen);

    // ══════════════════════════════════════════
    // [C] CONTROL PANEL — solid body + properly anchored angled surface
    // ══════════════════════════════════════════

    // Solid body box fills the CTH space — no visible gaps
    const ctrlBody = new THREE.Mesh(new THREE.BoxGeometry(W, CTH, D), bodyDarkMat(cab));
    ctrlBody.position.set(0, ctrlY, 0);
    group.add(ctrlBody);

    // Panel group hinges from the top-front edge of the ctrl body.
    // rotation.x = -TILT: local +Z (forward) goes downward in world space.
    const PANEL_TILT = 0.50;  // ~28.6 degrees
    const PANEL_LEN  = 0.52;
    const panelGroup = new THREE.Group();
    panelGroup.position.set(0, BSH + CTH, D / 2);
    panelGroup.rotation.x = PANEL_TILT;
    group.add(panelGroup);

    // Panel board — in panelGroup local space, top surface at local y=0
    const panelBoard = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.06, PANEL_LEN),
      bodyDarkMat(cab)
    );
    panelBoard.position.set(0, -0.03, PANEL_LEN / 2);
    panelGroup.add(panelBoard);

    // Neon trim at the hinge (back edge of panel)
    const hingeTrim = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.018, 0.018),
      neonMat(0x6040c0)
    );
    panelGroup.add(hingeTrim);

    // Joystick — in panelGroup local space (y=0 is panel surface)
    const shaftMat = new THREE.MeshLambertMaterial({ color: 0x2818a0 });
    const ballMat  = new THREE.MeshLambertMaterial({ color: 0xb080f0 });
    const baseMat2 = new THREE.MeshLambertMaterial({ color: 0x2e1880 });

    // Joystick centered on left half (x = -W/4) and vertically centered on panel (z = PANEL_LEN/2)
    const jsX = -(W / 4);
    const jsZ = PANEL_LEN / 2;

    const stickBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.022, 12), baseMat2);
    stickBase.position.set(jsX, 0.011, jsZ);
    panelGroup.add(stickBase);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 10), shaftMat);
    shaft.position.set(jsX, 0.10, jsZ);
    panelGroup.add(shaft);

    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), ballMat);
    ball.position.set(jsX, 0.21, jsZ);
    panelGroup.add(ball);

    // Buttons — 2 rows of 3 centered on right half (x = +W/4) and vertically centered on panel
    // Spacing: 0.11 between columns, 0.13 between rows
    const btnCX = W / 4;         // right half center x
    const btnCZ = PANEL_LEN / 2; // panel vertical center z
    const btnColors = [0xff2020, 0x20e020, 0xffcc00, 0x2050ff, 0xcc00cc, 0xcccccc];
    const btnRows = [
      [[btnCX - 0.11, btnCZ - 0.065], [btnCX, btnCZ - 0.065], [btnCX + 0.11, btnCZ - 0.065]],
      [[btnCX - 0.11, btnCZ + 0.065], [btnCX, btnCZ + 0.065], [btnCX + 0.11, btnCZ + 0.065]],
    ];
    btnRows.forEach((row, rowIdx) => {
      row.forEach(([bx, bz], colIdx) => {
        const col = btnColors[rowIdx * 3 + colIdx] || 0xffffff;
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.032, 0.032, 0.04, 10),
          new THREE.MeshLambertMaterial({ color: Math.floor(col * 0.5) })
        );
        barrel.position.set(bx, 0.015, bz);
        panelGroup.add(barrel);

        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.036, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
          new THREE.MeshLambertMaterial({ color: col })
        );
        cap.position.set(bx, 0.048, bz);
        panelGroup.add(cap);
      });
    });

    // ══════════════════════════════════════════
    // [B] MONITOR SECTION — open-front box
    // ══════════════════════════════════════════
    const monTop    = monY + MOH / 2;
    const monBot    = monY - MOH / 2;
    const backZ     = -D / 2;

    // Back face
    const monBack = new THREE.Mesh(new THREE.PlaneGeometry(W, MOH), bodyMat(cab));
    monBack.rotation.y = Math.PI;
    monBack.position.set(0, monY, backZ);
    group.add(monBack);

    // Top face
    const monTop_ = new THREE.Mesh(new THREE.PlaneGeometry(W, D), bodyDarkMat(cab));
    monTop_.rotation.x = -Math.PI / 2;
    monTop_.position.set(0, monTop, 0);
    group.add(monTop_);

    // Bottom face
    const monBottom = new THREE.Mesh(new THREE.PlaneGeometry(W, D), bodyDarkMat(cab));
    monBottom.rotation.x = Math.PI / 2;
    monBottom.position.set(0, monBot, -0.02);
    group.add(monBottom);

    // Left side
    const monLeft = new THREE.Mesh(new THREE.PlaneGeometry(D, MOH), bodyMat(cab));
    monLeft.rotation.y = Math.PI / 2;
    monLeft.position.set(-W / 2, monY, 0);
    group.add(monLeft);

    // Right side
    const monRight = new THREE.Mesh(new THREE.PlaneGeometry(D, MOH), bodyMat(cab));
    monRight.rotation.y = -Math.PI / 2;
    monRight.position.set(W / 2, monY, 0);
    group.add(monRight);

    // Neon side trim
    _addTrim(group, 0.025, MOH, D, -(W/2), monY, 0, 0x6040c0);
    _addTrim(group, 0.025, MOH, D,  (W/2), monY, 0, 0x6040c0);

    // Tilted screen — pivots from bottom-front of monitor.
    // rotation.x = +SCREEN_TILT: local +Y maps to (0, cos, -sin) so top goes back into cabinet.
    const SCREEN_TILT = 0.15;  // ~8.6 degrees
    const screenGroup = new THREE.Group();
    screenGroup.position.set(0, monBot, D / 2);
    screenGroup.rotation.x = -SCREEN_TILT;
    group.add(screenGroup);

    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.96, MOH * 0.97),
      new THREE.MeshBasicMaterial({ map: _makeScreenTex(cab) })
    );
    screenMesh.position.set(0, MOH / 2, 0.003);
    screenGroup.add(screenMesh);

    // Side panels: left shows leaderboard; right carries the COMMENTS
    // station. Left side opens leaderboard overlay, right side opens comments.
    // Rotations face the plane's front OUTWARD (+x on the right, -x on
    // the left); double-sided as a safety net against culling.
    ['left', 'right'].forEach(side => {
      const isStation = side === 'right' && cab.url;
      const isLeaderboard = side === 'left' && cab.url;
      const sideTex = isStation ? _makeBackTex(cab) : (isLeaderboard ? _makeLeaderboardTex(cab, []) : _makeSideTex(cab));
      const sidePanel = new THREE.Mesh(
        new THREE.PlaneGeometry(D * 0.75, isStation ? (MOH + CTH) * 0.7 : MOH * 0.85),
        new THREE.MeshBasicMaterial({ map: sideTex, side: THREE.DoubleSide })
      );
      sidePanel.rotation.y = side === 'left' ? -Math.PI / 2 : Math.PI / 2;
      sidePanel.position.set(
        side === 'left' ? -(W/2) - 0.02 : (W/2) + 0.02,
        isStation ? BSH + (MOH + CTH) * 0.5 : monY,
        0
      );
      group.add(sidePanel);

      // Fetch and apply leaderboard data to left panel
      if (isLeaderboard) {
        _fetchAndApplyLeaderboard(cab, sidePanel);
      }
    });

    // Back panel — visible when player walks behind
    const backPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.94, (MOH + CTH) * 0.9),
      new THREE.MeshBasicMaterial({ map: _makeBackTex(cab) })
    );
    backPanel.rotation.y = Math.PI;
    backPanel.position.set(0, BSH + (MOH + CTH) * 0.45, backZ - 0.002);
    group.add(backPanel);

    // Back neon trim strip
    _addTrim(group, W, 0.025, 0.025, 0, BSH, backZ, 0x6040c0);
    _addTrim(group, W, 0.03, 0.03, 0, mqY + MQH / 2 + 0.09, backZ, cab.neon);

    // ══════════════════════════════════════════
    // [A] MARQUEE
    // ══════════════════════════════════════════
    const mqBody = new THREE.Mesh(new THREE.BoxGeometry(MQW, MQH, D), bodyMat(cab));
    mqBody.position.set(0, mqY, 0);
    group.add(mqBody);

    // Marquee border
    _addTrim(group, MQW, 0.02, 0.02, 0, mqY + MQH/2, frontZ, 0x6040c0);
    _addTrim(group, MQW, 0.02, 0.02, 0, mqY - MQH/2, frontZ, 0x6040c0);

    // Marquee front face
    const mqMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(MQW * 0.92, MQH * 0.82),
      new THREE.MeshBasicMaterial({ map: _makeMarqueeTex(cab) })
    );
    mqMesh.position.set(0, mqY, frontZ + 0.002);
    group.add(mqMesh);

    // Top cap
    const top = new THREE.Mesh(new THREE.BoxGeometry(MQW, 0.08, D), bodyDarkMat(cab));
    top.position.set(0, mqY + MQH/2 + 0.04, 0);
    group.add(top);

    // Top neon strip
    _addTrim(group, MQW, 0.03, 0.03, 0, mqY + MQH/2 + 0.09, frontZ, cab.neon);

    // ══════════════════════════════════════════
    // Floor glow ring
    // ══════════════════════════════════════════
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.03, 8, 48),
      neonMat(cab.neon)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    group.add(ring);

    _scene.add(group);
    return group;
  }

  // ── Coin panel texture ─────────────────────────────────────────────
  function _makeCoinTex(cab) {
    const w = 256, h = 48;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1a1a2a';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // 25¢ box
    ctx.strokeStyle = '#806030';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(8, 6, 72, h - 12);
    ctx.shadowColor = 'rgba(200,140,0,0.9)';
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = '#c09040';
    ctx.font        = 'bold 20px "Courier New", monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('25¢', 44, h / 2);

    // Insert coin box
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = '#2a1850';
    ctx.strokeRect(92, 6, 80, h - 12);
    ctx.fillStyle   = '#3a2060';
    ctx.font        = '8px "Courier New", monospace';
    ctx.fillText('INSERT', 132, h / 2 - 6);
    ctx.fillText('COIN',   132, h / 2 + 6);

    // Coin slot slit
    ctx.fillStyle   = '#020008';
    ctx.strokeStyle = '#3a2060';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.rect(106, h/2 - 2, 52, 4);
    ctx.fill();
    ctx.stroke();

    return new THREE.CanvasTexture(c);
  }

  // ── Back panel texture — branding at top, COMMENTS station below ──
  function _makeBackTex(cab) {
    const w = 256, h = 320;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#080614';
    ctx.fillRect(0, 0, w, h);

    // Neon border
    ctx.strokeStyle = cab.neonHex;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Branding + game name — top of the panel
    ctx.shadowColor = cab.neonHex;
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = cab.neonHex;
    ctx.globalAlpha = 0.7;
    ctx.font        = 'bold 16px "Courier New", monospace';
    ctx.fillText('AGEE ARCADE', w / 2, 34);
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText(cab.marquee, w / 2, 56);
    ctx.globalAlpha = 1;

    // Divider
    ctx.shadowBlur = 0;
    ctx.strokeStyle = cab.neonHex;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(28, 74);
    ctx.lineTo(w - 28, 74);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (cab.url) {
      // COMMENTS section
      ctx.shadowColor = cab.neonHex;
      ctx.shadowBlur  = 14;
      ctx.fillStyle   = cab.neonHex;
      ctx.font        = 'bold 30px "Courier New", monospace';
      ctx.fillText('COMMENTS', w / 2, 112);

      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(220,210,240,0.7)';
      ctx.font       = '14px "Courier New", monospace';
      ctx.fillText('[E] to leave a comment', w / 2, 144);
    }

    // Vent slats — lower half
    ctx.strokeStyle = 'rgba(60,40,120,0.5)';
    ctx.lineWidth = 1;
    for (let y = 176; y < h - 24; y += 9) {
      ctx.beginPath();
      ctx.moveTo(32, y);
      ctx.lineTo(w - 32, y);
      ctx.stroke();
    }

    return new THREE.CanvasTexture(c);
  }

  // ── Leaderboard providers (same as leaderboards.js) ─────────────────
  const LEADERBOARD_PROVIDERS = {
    'depths-of-ashenveil': {
      table: 'depths_leaderboard',
      select: 'nickname,floor,level,created_at',
      order: 'level.desc,floor.desc,created_at.asc',
      mapRemote: function (row) {
        return {
          nickname: row.nickname || 'Adventurer',
          primary: Number(row.level) || 1,
          detail: 'Floor ' + (Number(row.floor) || 1),
        };
      },
    },
    'maze-runner': {
      table: 'maze_runner_runs',
      select: 'user_id,floors,score,time_ms',
      order: 'score.desc,floors.desc,time_ms.asc',
      mapRemote: function (row) {
        const user = String(row.user_id || 'guest-player');
        return {
          nickname: user.length > 12 ? user.slice(0, 8) + '...' : user,
          primary: Number(row.score) || 0,
          detail: 'Floor ' + (Number(row.floors) || 0),
        };
      },
    },
    'blacktide-bastion': {
      table: 'blacktide_bastion_leaderboard',
      select: 'nickname,score,wave,created_at',
      order: 'score.desc,wave.desc,created_at.asc',
      mapRemote: function (row) {
        return {
          nickname: row.nickname || 'Captain',
          primary: Number(row.score) || 0,
          detail: 'Wave ' + (Number(row.wave) || 0),
        };
      },
    },
    'spear_fisher': {
      table: 'spear_fisher_leaderboard',
      select: 'nickname,score,created_at',
      order: 'score.desc,created_at.asc',
      mapRemote: function (row) {
        return {
          nickname: row.nickname || 'Fisher',
          primary: Number(row.score) || 0,
          detail: 'Score',
        };
      },
    },
  };

  // ── Leaderboard texture for left side panel ────────────────────────
  function _makeLeaderboardTex(cab, rows) {
    const w = 128, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0a0220';
    ctx.fillRect(0, 0, w, h);

    // Top 10 label at top
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.fillStyle = cab.neonHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = cab.neonHex;
    ctx.shadowBlur = 4;
    ctx.fillText('TOP 10', w / 2, 6);

    // Leaderboard entries
    ctx.font = '6px "Courier New", monospace';
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(200,220,220,0.8)';
    ctx.textAlign = 'center';

    (rows || []).slice(0, 10).forEach((entry, i) => {
      const y = 22 + i * 22;
      const rank = (i + 1).toString().padStart(2, ' ');
      const name = (entry.nickname || 'Unknown').slice(0, 8);
      const score = Number(entry.primary || 0).toString();

      ctx.fillText(`${rank}. ${name}`, w / 2, y);
      ctx.fillText(score, w / 2, y + 8);
    });

    return new THREE.CanvasTexture(c);
  }

  // ── Side art texture (left side + coming-soon) ────────────────────
  function _makeSideTex(cab) {
    const w = 128, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    // Dark BG with star dots
    ctx.fillStyle = '#0a0220';
    ctx.fillRect(0, 0, w, h);

    [[18,30],[52,70],[10,110],[60,140],[35,95]].forEach(([sx, sy]) => {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(sx, sy, 1, 1);
    });

    // Planet glow
    const glow = ctx.createRadialGradient(38, 95, 0, 38, 95, 22);
    glow.addColorStop(0, '#2a1070');
    glow.addColorStop(0.6, '#100438');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Vertical text — game name in the cabinet's neon color
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font        = 'bold 11px "Courier New", monospace';
    ctx.fillStyle   = cab.neonHex;
    ctx.globalAlpha = 0.55;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = cab.neonHex;
    ctx.shadowBlur  = 8;
    ctx.fillText(cab.marquee.replace(/ /g, '  '), 0, 0);
    ctx.restore();

    return new THREE.CanvasTexture(c);
  }

  // ── Fetch and apply leaderboard to left panel ───────────────────────
  async function _fetchAndApplyLeaderboard(cab, sidePanel) {
    const provider = LEADERBOARD_PROVIDERS[cab.id];
    if (!provider) return;

    try {
      const url = new URL('https://xdvrgeaivfqpcsmuqeyi.supabase.co/rest/v1/' + provider.table);
      url.searchParams.set('select', provider.select || '*');
      if (provider.order) url.searchParams.set('order', provider.order);
      url.searchParams.set('limit', '10');
      url.searchParams.set('apikey', 'sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O');

      const response = await fetch(url.toString(), {
        headers: {
          apikey: 'sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O',
          Authorization: 'Bearer sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O',
        },
      });

      if (response.ok) {
        const remote = await response.json();
        const rows = (remote || []).map(row => provider.mapRemote(row));
        const tex = _makeLeaderboardTex(cab, rows);
        sidePanel.material.map = tex;
        sidePanel.material.needsUpdate = true;
      }
    } catch (_) {
      // Silently fail, keep default texture
    }
  }

  // ── Preload: start loading the game iframe in the background ──────
  function _preload(cab) {
    if (_preloaded.has(cab.id) || !cab.url) return;
    _preloaded.add(cab.id);
    if (window.ArcadeGameFrame) ArcadeGameFrame.preload(cab.url);
  }

  // ── Proximity prompt ───────────────────────────────────────────────
  function _setPrompt(cab, zone) {
    if (!_promptEl) return;
    if (!cab) { _promptEl.hidden = true; return; }
    if (!cab.url) {
      _promptEl.textContent = 'Coming Soon';
    } else if (zone === 'left') {
      _promptEl.textContent = `[E]  View Scores — ${cab.title.replace('\n', ' ')}`;
    } else if (zone === 'right') {
      _promptEl.textContent = `[E]  Leave a Comment — ${cab.title.replace('\n', ' ')}`;
    } else {
      _promptEl.textContent = `[E]  Play  ${cab.title.replace('\n', ' ')}`;
    }
    _promptEl.hidden = false;
  }

  // ── Tick — called each frame by scene.js ───────────────────────────
  function tick() {
    const pos = ArcadePlayer.position;
    let nearest = -1;
    let nearestDist = INTERACT_DIST;

    CABINETS.forEach((cab, i) => {
      const dx = pos.x - cab.position[0];
      const dz = pos.z - cab.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < INTERACT_DIST + 1.5) _preload(cab);
      if (dist < nearestDist) { nearest = i; nearestDist = dist; }
    });

    // Zones around the nearest cabinet: 'front' E plays, 'right' (where
    // the COMMENTS station panel is) E opens that game's comments,
    // 'left' shows nothing.
    let zone = 'front';
    if (nearest >= 0) {
      const dx = pos.x - CABINETS[nearest].position[0];
      if (dx > 1.1)       zone = 'right';
      else if (dx < -1.1) zone = 'left';
    }

    if (nearest !== _nearIdx || zone !== _nearZone) {
      _nearIdx  = nearest;
      _nearZone = zone;
      _setPrompt(nearest >= 0 ? CABINETS[nearest] : null, zone);
    }
  }

  // ── Init ───────────────────────────────────────────────────────────
  function init(scene) {
    _scene    = scene;
    _promptEl = document.getElementById('interact-prompt');

    CABINETS.forEach(cab => {
      _meshGroups.push(_buildCabinet(cab));
    });

    // Warm game documents/assets as soon as the arcade initializes. This uses
    // ArcadeGameFrame's worker preloader, not hidden iframes, so game engines
    // do not boot in the background.
    setTimeout(() => {
      CABINETS.forEach(cab => _preload(cab));
    }, 0);

    window.addEventListener('arcade:interact', () => {
      if (_nearIdx < 0) return;
      const cab = CABINETS[_nearIdx];
      if (!cab.url) return;
      if (_nearZone === 'left') {
        if (window.ArcadeLeaderboard) {
          ArcadeLeaderboard.openFor(cab.id, cab.title.replace('\n', ' '));
        }
        return;
      }
      if (_nearZone === 'right') {
        if (window.ArcadeCommentsBoard) {
          ArcadeCommentsBoard.openFor(
            cab.id,
            cab.title.replace('\n', ' ').toUpperCase() + ' — COMMENTS'
          );
        }
        return;
      }
      window.dispatchEvent(new CustomEvent('arcade:launch', { detail: { cabinet: cab } }));
    });
  }

  return { init, tick, CABINETS };
})();
