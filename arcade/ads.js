/**
 * ArcadeAds — 3D sponsor billboard system for Agee Arcade.
 *
 * Each billboard:
 *   1. Requests an ad from AdRouter on init.
 *   2. Loads the ad image as a Three.js texture.
 *   3. Renders it on the wall plane with a neon frame + "Sponsored" label.
 *   4. Tracks visible_2_seconds once per session when:
 *        – billboard is in camera frustum
 *        – player is within MAX_VIEW_DIST
 *        – billboard face is within 70° of camera direction
 *        – continuous visibility >= 2 seconds
 *   5. Tracks click when player presses E while near the billboard.
 *   6. Falls back to house ad → "Advertise Here" placeholder.
 *
 * Depends on: THREE, window.AdRouter, window.AdPlacements
 */
window.ArcadeAds = (() => {
  'use strict';

  const MAX_VIEW_DIST   = 16;   // units — max distance to count a view
  const INTERACT_DIST   = 3.5;  // units — max distance to "click" a billboard
  const VIS_THRESHOLD_S = 2.0;  // seconds of continuous visibility before counting

  // ── Billboard definitions ─────────────────────────────────────────
  // Each billboard maps to one placement key. Positions are in world space;
  // normal points into the room (face direction).
  const BILLBOARD_DEFS = [
    {
      placementKey: 'arcade_wall_left_01',
      pos:          [-14.7, 3.8, 1],
      rotY:         Math.PI / 2,
      normal:       [1, 0, 0],
      frameW: 3.2, frameH: 2.2,
    },
    {
      placementKey: 'arcade_wall_left_02',
      pos:          [-14.7, 3.8, -6],
      rotY:         Math.PI / 2,
      normal:       [1, 0, 0],
      frameW: 3.2, frameH: 2.2,
    },
    {
      placementKey: 'arcade_wall_right_01',
      pos:          [14.7, 3.8, 1],
      rotY:         -Math.PI / 2,
      normal:       [-1, 0, 0],
      frameW: 3.2, frameH: 2.2,
    },
  ];

  let _scene    = null;
  let _camera   = null;
  let _renderer = null;
  let _frustum  = new THREE.Frustum();
  let _boards   = [];    // { def, ad, mesh, worldPos, normal, visSeconds, visFired, interactable }

  // ── Material helpers ───────────────────────────────────────────────

  function _neonMat(color) { return new THREE.MeshBasicMaterial({ color }); }

  // ── Placeholder texture ("Advertise Here" / "Loading Ad…") ────────

  function _makePlaceholderTex(text, subtext) {
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a0520');
    bg.addColorStop(1, '#050210');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(100,50,200,0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y = 0; y < h; y += 64) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    // Border
    ctx.strokeStyle = 'rgba(140,70,255,0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    // Main text
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(160,80,255,0.8)';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = 'rgba(180,120,255,0.9)';
    ctx.font        = 'bold 64px "Courier New", monospace';
    ctx.fillText(text, w / 2, h / 2 - 24);

    ctx.shadowBlur = 6;
    ctx.fillStyle  = 'rgba(120,80,200,0.6)';
    ctx.font       = '28px "Courier New", monospace';
    ctx.fillText(subtext, w / 2, h / 2 + 44);

    return new THREE.CanvasTexture(c);
  }

  // ── Ad image texture ───────────────────────────────────────────────

  function _loadImageTex(url, onLoad) {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => { tex.needsUpdate = true; onLoad(tex); },
      undefined,
      () => { onLoad(null); }   // on error — caller handles null
    );
  }

  // ── "Sponsored" label texture ──────────────────────────────────────

  function _makeSponsoredTex() {
    const w = 512, h = 48;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(4,2,14,0.75)';
    ctx.fillRect(0, 0, w, h);
    ctx.font        = 'bold 18px "Courier New", monospace';
    ctx.fillStyle   = 'rgba(140,80,220,0.8)';
    ctx.textAlign   = 'right';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '3px';
    ctx.fillText('SPONSORED', w - 12, h / 2);
    return new THREE.CanvasTexture(c);
  }

  const _sponsoredTex = { value: null };

  // ── Build one 3D billboard frame ───────────────────────────────────

  function _buildFrame(def) {
    const { pos, rotY, frameW, frameH } = def;
    const group = new THREE.Group();
    group.position.set(...pos);
    group.rotation.y = rotY;

    const W = frameW, H = frameH;
    const BORDER = 0.07;

    // Backing panel (dark) — placeholder until ad loads
    const panelMat = new THREE.MeshLambertMaterial({
      map: _makePlaceholderTex('LOADING…', 'ad loading'),
      color: 0xffffff,
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, H), panelMat);
    panel.position.z = 0.01;
    group.add(panel);

    // Neon border strips (top, bottom, left, right)
    const neon = _neonMat(0x9944ff);
    [
      [W + BORDER * 2, BORDER, 0,              H / 2 + BORDER / 2],
      [W + BORDER * 2, BORDER, 0,             -H / 2 - BORDER / 2],
      [BORDER,         H,     -W / 2 - BORDER / 2, 0             ],
      [BORDER,         H,      W / 2 + BORDER / 2, 0             ],
    ].forEach(([bw, bh, bx, by]) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.05), neon);
      s.position.set(bx, by, 0.005);
      group.add(s);
    });

    // Corner dots
    const dot = _neonMat(0xcc88ff);
    for (const [sx, sy] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), dot);
      d.position.set(sx * (W / 2 + BORDER / 2), sy * (H / 2 + BORDER / 2), 0.02);
      group.add(d);
    }

    // "Sponsored" label strip at bottom
    if (!_sponsoredTex.value) _sponsoredTex.value = _makeSponsoredTex();
    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(W, 0.18),
      new THREE.MeshBasicMaterial({ map: _sponsoredTex.value, transparent: true })
    );
    labelMesh.position.set(0, -(H / 2) - 0.14, 0.01);
    group.add(labelMesh);

    _scene.add(group);
    return { group, panelMesh: panel, panelMat };
  }

  // ── Load ad and apply texture ──────────────────────────────────────

  async function _loadBillboard(def, board) {
    const ad = await AdRouter.requestAd({
      placementKey: def.placementKey,
      gameId:       'arcade_lobby',
    });
    board.ad = ad;

    if (ad.filled && ad.imageUrl) {
      _loadImageTex(ad.imageUrl, (tex) => {
        if (tex) {
          board.panelMat.map = tex;
          board.panelMat.color.set(0xffffff);
          board.panelMat.needsUpdate = true;
        } else {
          // Image failed — use "Advertise Here" placeholder
          board.panelMat.map = _makePlaceholderTex('ADVERTISE', 'ageearcade.com/advertise');
          board.panelMat.needsUpdate = true;
        }
      });
    } else {
      // No fill — show "Advertise Here"
      board.panelMat.map = _makePlaceholderTex('ADVERTISE HERE', '/advertise');
      board.panelMat.needsUpdate = true;
    }
  }

  // ── Per-frame visibility + interaction tick ────────────────────────

  function tick() {
    if (!_camera || _boards.length === 0) return;

    // Update frustum from current camera
    _camera.updateMatrixWorld();
    const proj = new THREE.Matrix4().multiplyMatrices(
      _camera.projectionMatrix,
      _camera.matrixWorldInverse
    );
    _frustum.setFromProjectionMatrix(proj);

    const playerPos = ArcadePlayer ? ArcadePlayer.position : _camera.position;
    const dt = 1 / 60; // approximate — actual delta comes from scene clock but we don't have it here

    for (const board of _boards) {
      if (!board.ad) continue;

      const wPos  = board.worldPos;
      const dist  = wPos.distanceTo(playerPos);
      const norm  = board.normal;

      // Face check: billboard normal dot (billboard→camera) should be < 0 (facing us)
      const toBoard = wPos.clone().sub(_camera.position).normalize();
      const facingUs = norm.dot(toBoard) < -0.2;

      // Frustum check
      const inFrustum = _frustum.containsPoint(wPos);

      const isVisible = inFrustum && facingUs && dist < MAX_VIEW_DIST;

      if (isVisible) {
        board.visSeconds = (board.visSeconds || 0) + dt;
        if (board.visSeconds >= VIS_THRESHOLD_S && !board.visFired && board.ad.filled) {
          board.visFired = true;
          AdRouter.trackVisible2s({
            campaignId:   board.ad.campaignId,
            placementKey: board.ad.placementKey,
            gameId:       'arcade_lobby',
            metadata:     { distance: Math.round(dist * 10) / 10 },
          });
        }
      } else {
        board.visSeconds = 0; // reset if not continuously visible
      }

      // Interaction: E key handled via arcade:interact event (see init)
      board.interactable = facingUs && dist < INTERACT_DIST;
    }
  }

  // ── Init ─────────────────────────────────────────────────────────

  async function init(scene, camera, renderer) {
    _scene    = scene;
    _camera   = camera;
    _renderer = renderer;

    for (const def of BILLBOARD_DEFS) {
      const { group, panelMesh, panelMat } = _buildFrame(def);

      const board = {
        def,
        ad:          null,
        group,
        panelMesh,
        panelMat,
        worldPos:    new THREE.Vector3(...def.pos),
        normal:      new THREE.Vector3(...def.normal),
        visSeconds:  0,
        visFired:    false,
        interactable: false,
      };

      _boards.push(board);
      _loadBillboard(def, board); // async, non-blocking
    }

    // Handle player interaction (E key near billboard → click tracking + open link)
    window.addEventListener('arcade:interact', async () => {
      const nearest = _boards.find(b => b.interactable);
      if (!nearest || !nearest.ad || !nearest.ad.filled) return;

      const url = await AdRouter.trackClick({
        campaignId:   nearest.ad.campaignId,
        placementKey: nearest.ad.placementKey,
        gameId:       'arcade_lobby',
      });

      if (url) {
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
    });
  }

  return { init, tick };
})();
