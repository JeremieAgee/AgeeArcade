/* ═══════════════════════════════════════════════════
   mobile-controls.js  —  Fixed joystick + action buttons
   Joystick X → turn camera left/right
   Joystick Y → move forward/backward
════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return;

  /* ── Shared state read by game.js each frame ─────── */
  window._mobileCtrl = {
    active:          false,
    joyNx:           0,     // -1=left … +1=right  (camera turn)
    joyNy:           0,     // -1=up/fwd … +1=down/back
    attackPending:   false,
    interactPending: false,
    blinkPending:    false,
    pausePending:    false,
  };

  /* ── Build overlay DOM ───────────────────────────── */
  const overlay = document.createElement('div');
  overlay.id = 'mobileOverlay';
  overlay.innerHTML = `
    <div id="joyRing"><div id="joyNub"></div></div>
    <div id="mobileRight">
      <button id="mBtnBlink"     class="mob-btn" aria-label="Blink">✦</button>
      <button id="mBtnInteract"  class="mob-btn" aria-label="Interact">E</button>
      <button id="mBtnAttack"    class="mob-btn atk" aria-label="Attack">⚔</button>
      <button id="mBtnInventory" class="mob-btn" aria-label="Inventory">📦</button>
    </div>
    <button id="mBtnPause" aria-label="Pause">❙❙</button>
    <div id="joyZone"></div>
  `;
  document.body.appendChild(overlay);

  const joyRing = document.getElementById('joyRing');
  const joyNub  = document.getElementById('joyNub');
  const joyZone = document.getElementById('joyZone');
  const mobileRight = document.getElementById('mobileRight');

  /* ── Joystick constants ──────────────────────────── */
  const STICK_MAX = 44;
  const JOY_DEAD  = 10;

  let joyTouchId = -1;
  let joyBaseX   = 0;
  let joyBaseY   = 0;
  let controlsEnabled = true;

  function resetJoystick() {
    joyTouchId = -1;
    joyNub.style.transform = 'translate(-50%,-50%)';
    joyRing.style.opacity  = '0.32';
    window._mobileCtrl.joyNx = 0;
    window._mobileCtrl.joyNy = 0;
    window._mobileCtrl.active = false;
  }

  /* ── Get fixed ring center from its CSS position ─── */
  function getRingCenter() {
    const r = joyRing.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ── Joystick touch handlers ─────────────────────── */
  function onJoyStart(e) {
    if (!controlsEnabled) return;
    e.preventDefault();
    if (joyTouchId !== -1) return;
    const t = e.changedTouches[0];
    joyTouchId = t.identifier;

    // Always anchor to ring center — joystick is fixed, not floating
    const c = getRingCenter();
    joyBaseX = c.x;
    joyBaseY = c.y;

    joyRing.style.opacity = '0.80';
    joyNub.style.transform = 'translate(-50%,-50%)';
    window._mobileCtrl.active = false;
  }

  function findJoyTouch(e) {
    for (let i = 0; i < e.changedTouches.length; i++)
      if (e.changedTouches[i].identifier === joyTouchId) return e.changedTouches[i];
    return null;
  }

  function onJoyMove(e) {
    if (!controlsEnabled) return;
    e.preventDefault();
    const t = findJoyTouch(e);
    if (!t) return;

    const dx   = t.clientX - joyBaseX;
    const dy   = t.clientY - joyBaseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamp = Math.min(dist, STICK_MAX);
    const nx = dist > 0 ? dx / dist : 0;  // -1=left, +1=right
    const ny = dist > 0 ? dy / dist : 0;  // -1=up,   +1=down

    joyNub.style.transform =
      `translate(calc(-50% + ${nx * clamp}px), calc(-50% + ${ny * clamp}px))`;

    if (dist > JOY_DEAD) {
      window._mobileCtrl.joyNx = nx;   // handed to game.js for aimAngle rotation
      window._mobileCtrl.joyNy = ny;   // handed to game.js for W/S keys
      window._mobileCtrl.active = true;
    } else {
      window._mobileCtrl.joyNx = 0;
      window._mobileCtrl.joyNy = 0;
      window._mobileCtrl.active = false;
    }
  }

  function onJoyEnd(e) {
    if (findJoyTouch(e)) resetJoystick();
  }

  joyZone.addEventListener('touchstart',  onJoyStart, { passive: false });
  joyZone.addEventListener('touchmove',   onJoyMove,  { passive: false });
  joyZone.addEventListener('touchend',    onJoyEnd,   { passive: false });
  joyZone.addEventListener('touchcancel', onJoyEnd,   { passive: false });

  /* ── Action buttons ──────────────────────────────── */
  function wireBtn(id, flag) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      e.stopPropagation();
      window._mobileCtrl[flag] = true;
      el.classList.add('mob-pressed');
    }, { passive: false });
    el.addEventListener('touchend',   e => { e.preventDefault(); el.classList.remove('mob-pressed'); }, { passive: false });
    el.addEventListener('touchcancel', () => el.classList.remove('mob-pressed'));
  }

  wireBtn('mBtnAttack',   'attackPending');
  wireBtn('mBtnInteract', 'interactPending');
  wireBtn('mBtnBlink',    'blinkPending');
  wireBtn('mBtnPause',    'pausePending');

  const invBtn = document.getElementById('mBtnInventory');
  if (invBtn) {
    invBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof UI !== 'undefined' && UI.togglePanel) UI.togglePanel('inv');
      invBtn.classList.add('mob-pressed');
    }, { passive: false });
    invBtn.addEventListener('touchend', e => {
      e.preventDefault();
      invBtn.classList.remove('mob-pressed');
    }, { passive: false });
    invBtn.addEventListener('touchcancel', () => invBtn.classList.remove('mob-pressed'));
  }

  /* ── Pause / contextual visibility ──────────────── */
  // Cache DOM refs once — querying by ID every 100ms is unnecessary overhead
  const _vis = {
    titleEl:     document.getElementById('titleScreen'),
    deathEl:     document.getElementById('deathScreen'),
    blinkBtn:    document.getElementById('mBtnBlink'),
    interactBtn: document.getElementById('mBtnInteract'),
    chestPrompt: document.getElementById('chestPrompt'),
    torchPrompt: document.getElementById('torchPrompt'),
    doorPrompt:  document.getElementById('doorPrompt'),
    stairPrompt: document.getElementById('stairPrompt'),
  };
  setInterval(() => {
    const onTitle  = !!(_vis.titleEl  && _vis.titleEl.classList.contains('active'));
    const onDeath  = !!(_vis.deathEl  && _vis.deathEl.classList.contains('active'));
    const pauseEl  = document.getElementById('pauseMenu');
    const paused   = !!(pauseEl && pauseEl.style.display === 'flex');
    const inGame   = !onTitle && !onDeath && !paused;
    controlsEnabled = inGame;

    const vis = inGame ? 'visible' : 'hidden';
    overlay.style.pointerEvents = inGame ? 'none' : 'none';
    joyRing.style.visibility     = vis;
    joyZone.style.pointerEvents  = inGame ? 'all' : 'none';
    mobileRight.style.visibility = vis;
    mobileRight.style.pointerEvents = inGame ? 'all' : 'none';
    const pauseBtn = document.getElementById('mBtnPause');
    if (pauseBtn) {
      pauseBtn.style.visibility = vis;
      pauseBtn.style.pointerEvents = inGame ? 'all' : 'none';
    }

    if (!inGame) {
      resetJoystick();
      window._mobileCtrl.attackPending = false;
      window._mobileCtrl.interactPending = false;
      window._mobileCtrl.blinkPending = false;
      window._mobileCtrl.pausePending = false;
    }

    // Blink — only when skill is unlocked
    const p = (typeof Game !== 'undefined') ? Game.getPlayer() : null;
    if (_vis.blinkBtn) _vis.blinkBtn.style.display = (p && p.hasBlink) ? 'flex' : 'none';

    // Interact — only when engine is showing a prompt (chest / torch / door / portal)
    const nearInteractable = !!(_vis.chestPrompt  && parseFloat(_vis.chestPrompt.style.opacity  || '0') > 0.1)
                          || !!(_vis.torchPrompt  && parseFloat(_vis.torchPrompt.style.opacity  || '0') > 0.1)
                          || !!(_vis.doorPrompt   && parseFloat(_vis.doorPrompt.style.opacity   || '0') > 0.1)
                          || !!(_vis.stairPrompt  && parseFloat(_vis.stairPrompt.style.opacity  || '0') > 0.1);
    if (_vis.interactBtn) _vis.interactBtn.style.display = nearInteractable ? 'flex' : 'none';
  }, 100);

  /* ── Block scroll/zoom on canvas ────────────────── */
  const mount = document.getElementById('canvasMount');
  if (mount) {
    mount.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    mount.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });
  }

  /* ── Hide desktop hint, collapse layout on phones ── */
  const desktopCtrl = document.getElementById('controls');
  if (desktopCtrl) desktopCtrl.style.display = 'none';

  const mediaSmall = window.matchMedia('(max-width: 640px)');
  function applySmallLayout(mq) {
    const sidebar = document.getElementById('adSidebar');
    const banner  = document.getElementById('adBanner');
    if (sidebar) sidebar.style.display = mq.matches ? 'none' : '';
    if (banner)  banner.style.display  = mq.matches ? 'none' : '';
  }
  applySmallLayout(mediaSmall);
  mediaSmall.addEventListener('change', applySmallLayout);

})();
