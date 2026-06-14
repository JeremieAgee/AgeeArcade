/**
 * ArcadeCommentsBoard — in-world comments.
 *
 * Two entry points share one overlay (#comments-overlay):
 *   1. Guestbook board on the front wall — walk up, press E → arcade-wide
 *      comments (pageId 'arcade').
 *   2. Beside each cabinet — cabinets.js calls openFor(cab.id, …) when the
 *      player presses E at the COMMENTS station on the cabinet's side panels
 *      (pageId = cabinet id, same thread as the game page).
 *
 * Each pageId gets its own container div so the ArcadeComments widget is
 * initialized once per thread and threads never clobber each other.
 * While the overlay is open the player is taken out of control
 * (enterZooming) and the scene is paused, so typing never moves the
 * character or launches a cabinet.
 */
window.ArcadeCommentsBoard = (() => {
  'use strict';

  // Guestbook board on the front wall (z=+15), centered
  const BOARD_POS  = [0, 3.6, 14.85];
  const NEAR_X     = 3.2;   // |player.x - board.x| within this
  const NEAR_Z     = 11.0;  // player.z beyond this
  const NEON_HEX   = '#ff2d95';
  const NEON       = 0xff2d95;

  let _near       = false;
  let _promptEl   = null;
  let _overlayEl  = null;
  let _titleEl    = null;
  let _bodyEl     = null;
  let _containers = {};   // pageId → container div (widget inited on create)

  /* ── Board face texture ─────────────────────────── */
  function _makeBoardTex() {
    const w = 512, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#16082e');
    bg.addColorStop(1, '#0a0418');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Neon frame
    ctx.strokeStyle = NEON_HEX;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title
    ctx.shadowColor = NEON_HEX;
    ctx.shadowBlur  = 18;
    ctx.fillStyle   = NEON_HEX;
    ctx.font        = 'bold 52px "Courier New", monospace';
    ctx.fillText('GUESTBOOK', w / 2, h / 2 - 38);

    // Subtitle
    ctx.shadowBlur = 6;
    ctx.fillStyle  = '#c080ff';
    ctx.font       = '22px "Courier New", monospace';
    ctx.fillText('sign the wall · talk to the arcade', w / 2, h / 2 + 18);

    // Prompt line
    ctx.shadowBlur = 0;
    ctx.fillStyle  = 'rgba(200,200,220,0.5)';
    ctx.font       = '18px "Courier New", monospace';
    ctx.fillText('[E] open comments', w / 2, h / 2 + 64);

    return new THREE.CanvasTexture(c);
  }

  /* ── Build guestbook board mesh ─────────────────── */
  function _buildBoard(scene) {
    const [bx, by, bz] = BOARD_POS;

    // Backing panel
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 3.4, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x140a28 })
    );
    backing.position.set(bx, by, bz);
    backing.rotation.y = Math.PI;
    scene.add(backing);

    // Lit face
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(6.3, 3.1),
      new THREE.MeshBasicMaterial({ map: _makeBoardTex() })
    );
    face.position.set(bx, by, bz - 0.07);
    face.rotation.y = Math.PI;
    scene.add(face);

    // Neon trim above and below
    [by + 1.78, by - 1.78].forEach(y => {
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 0.05, 0.05),
        new THREE.MeshBasicMaterial({ color: NEON })
      );
      trim.position.set(bx, y, bz - 0.05);
      scene.add(trim);
    });

    // Soft pink light pooling in front of the board
    const glow = new THREE.PointLight(NEON, 2.2, 9);
    glow.position.set(bx, by, bz - 2);
    scene.add(glow);
  }

  /* ── Proximity prompt (own element, mirrors #interact-prompt) ── */
  function _buildPrompt() {
    const el = document.createElement('div');
    el.id = 'comments-prompt';
    el.style.cssText =
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'background:rgba(8,6,16,0.85);border:1px solid rgba(255,45,149,0.5);' +
      'color:#ff8ac2;font-family:"Courier New",monospace;font-size:1rem;' +
      'padding:0.5rem 1.4rem;border-radius:4px;letter-spacing:0.08em;' +
      'pointer-events:none;z-index:30;text-shadow:0 0 8px #ff2d95;';
    el.textContent = '[E]  Sign the Guestbook';
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }

  /* ── Overlay open/close ─────────────────────────── */
  function openFor(pageId, title) {
    if (!_overlayEl) return;

    if (_titleEl) _titleEl.textContent = title;

    // One container per thread; widget inits once on first open
    Object.values(_containers).forEach(el => { el.style.display = 'none'; });
    let box = _containers[pageId];
    if (!box) {
      box = document.createElement('div');
      box.id = 'arcade-comments-' + pageId;
      _bodyEl.appendChild(box);
      _containers[pageId] = box;
      // ArcadeComments is a top-level const (not a window property)
      if (typeof ArcadeComments !== 'undefined') {
        ArcadeComments.init({ pageId, containerId: box.id, theme: 'arcade' });
      }
    }
    box.style.display = '';

    if (_overlayEl.hidden) {
      if (document.pointerLockElement) document.exitPointerLock();
      _overlayEl.hidden = false;
      if (window.ArcadePlayer) ArcadePlayer.enterZooming();
      if (window.ArcadeScene)  ArcadeScene.pause();
    }
  }

  function close() {
    if (!_overlayEl || _overlayEl.hidden) return;
    _overlayEl.hidden = true;
    if (window.ArcadePlayer) ArcadePlayer.enterExplore();
    if (window.ArcadeScene)  ArcadeScene.resume();
  }

  /* ── Tick — called each frame by scene.js ───────── */
  function tick() {
    const pos = ArcadePlayer.position;
    const near = Math.abs(pos.x - BOARD_POS[0]) < NEAR_X && pos.z > NEAR_Z;
    if (near !== _near) {
      _near = near;
      if (_promptEl) _promptEl.hidden = !near;
    }
  }

  /* ── Init ───────────────────────────────────────── */
  function init(scene) {
    _buildBoard(scene);
    _promptEl  = _buildPrompt();
    _overlayEl = document.getElementById('comments-overlay');
    _titleEl   = document.getElementById('comments-panel-title');
    _bodyEl    = document.getElementById('comments-panel-body');
    if (!_overlayEl) return;

    window.addEventListener('arcade:interact', () => {
      if (_near && _overlayEl.hidden) openFor('arcade', 'ARCADE GUESTBOOK');
    });

    const closeBtn = document.getElementById('comments-overlay-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    // Click on the dark backdrop (not the panel) also closes
    _overlayEl.addEventListener('click', ev => {
      if (ev.target === _overlayEl) close();
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !_overlayEl.hidden) close();
    });
  }

  return { init, tick, openFor, close };
})();
