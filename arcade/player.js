/**
 * ArcadePlayer — third-person character controller
 *
 * A visible character mesh walks the hall. Camera orbits behind it.
 * Mouse drag (or touch right-side) rotates the camera yaw.
 * WASD moves the character relative to camera facing.
 *
 * States:
 *   EXPLORE  — character moves, camera follows, E interacts
 *   ZOOMING  — transition lock
 *   PLAYING  — game iframe open, all arcade input off
 */
window.ArcadePlayer = (() => {
  'use strict';

  const STATE = { EXPLORE: 'EXPLORE', ZOOMING: 'ZOOMING', PLAYING: 'PLAYING' };
  let _state = STATE.EXPLORE;

  const SPEED       = 7;
  const TURN_SPEED  = 2.5;
  const CAM_DIST    = 5;      // how far behind character
  const CAM_HEIGHT  = 3.2;    // camera height above character base
  const CAM_LERP    = 0.12;   // camera smoothing
  const CABINET_FRONT_STOP = 1.42;
  const CABINET_HALF_BLOCK = 1.05;

  const _keys  = {};
  let _yaw     = Math.PI;     // camera yaw (follows character yaw)
  let _x       = 0;
  let _z       = 8;           // player starts near front of room
  let _charYaw = Math.PI;     // character facing (smooth toward movement)
  let _camera  = null;
  let _charGroup = null;
  let _animTime = 0;
  let _scene   = null;

  let in_control = true;

  /* ── Joystick (mobile) ─────────────────────────── */
  const _joy = { dx: 0, dz: 0, active: false, id: -1, cx: 0, cy: 0 };
  const JOY_RADIUS = 48;

  /* ── Build character mesh ───────────────────────── */
  function _buildCharacter(scene) {
    _charGroup = new THREE.Group();

    const bodyCol  = new THREE.MeshLambertMaterial({ color: 0x1a0e3a }); // one dark base for everything
    const darkCol  = bodyCol;                                              // same — no fighting
    const neonCol  = new THREE.MeshBasicMaterial({ color: 0x00eeff });   // one bright cyan accent
    const skinCol  = bodyCol;                                              // same base

    const limbs = { legs: [], arms: [], shoes: [], head: null, visor: null, glow: null };

    // Legs
    [-0.18, 0.18].forEach((lx, i) => {
      const legPivot = new THREE.Group();
      legPivot.position.set(lx, 0.6, 0);

      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.22), darkCol.clone());
      leg.position.y = -0.3;
      legPivot.add(leg);

      // Shoe
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.32), neonCol.clone());
      shoe.position.set(0, -0.54, 0.05);
      legPivot.add(shoe);

      legPivot.userData.walkSign = i === 0 ? 1 : -1;
      _charGroup.add(legPivot);
      limbs.legs.push(legPivot);
      limbs.shoes.push(shoe);
    });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.32), bodyCol.clone());
    torso.position.y = 0.96;
    _charGroup.add(torso);

    // Chest neon stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.33), neonCol.clone());
    stripe.position.y = 1.08;
    _charGroup.add(stripe);

    // Arms
    [-0.42, 0.42].forEach((ax, i) => {
      const armPivot = new THREE.Group();
      armPivot.position.set(ax, 1.15, 0);

      // Upper arm
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), bodyCol.clone());
      arm.position.y = -0.25;
      armPivot.add(arm);

      // Forearm / hand
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.16), skinCol.clone());
      hand.position.y = -0.68;
      armPivot.add(hand);

      armPivot.userData.walkSign = i === 0 ? -1 : 1;
      _charGroup.add(armPivot);
      limbs.arms.push(armPivot);
    });

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 8), skinCol.clone());
    neck.position.y = 1.41;
    _charGroup.add(neck);

    // Head — box shape, more character-like
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.38), skinCol.clone());
    head.position.y = 1.7;
    _charGroup.add(head);
    limbs.head = head;

    // Visor / hat brim
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.44), neonCol.clone());
    visor.position.y = 1.94;
    _charGroup.add(visor);
    limbs.visor = visor;

    // Hat top
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.36), darkCol.clone());
    hat.position.y = 2.09;
    _charGroup.add(hat);

    // Eyes — emissive
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    [-0.1, 0.1].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.05), eyeMat.clone());
      eye.position.set(ex, 1.7, 0.2);
      _charGroup.add(eye);
    });

    // Subtle personal glow
    const pl = new THREE.PointLight(0x00eeff, 0.6, 3.5);
    pl.position.y = 1.2;
    _charGroup.add(pl);
    limbs.glow = pl;
    _charGroup.userData.limbs = limbs;

    _charGroup.position.set(_x, 0, _z);
    _charGroup.rotation.y = _charYaw;
    scene.add(_charGroup);
  }

  /* ── Input ──────────────────────────────────────── */
  function _onKey(e) {
    if (e.type === 'keydown' && e.code === 'Escape') _clearInput();
    _keys[e.code] = (e.type === 'keydown');
    if (!in_control) return;
    if (e.type === 'keydown' && e.code === 'KeyE')
      window.dispatchEvent(new CustomEvent('arcade:interact'));
    if (e.type === 'keydown' && e.code === 'Escape' && _state === STATE.PLAYING)
      window.dispatchEvent(new CustomEvent('arcade:exit-game'));
  }

  const _canvas  = () => document.getElementById('arcade-canvas');
  const _locked  = () => document.pointerLockElement === _canvas();

  function _onMouseMove(/* e */) {
    // Camera rotation is handled by player facing direction, no mouse look.
  }

  let _adPreloadFired   = false;
  let _firstMoveFired   = false;
  function _onCanvasClick() {
    // Trigger ad preload on first arcade entry (requires user gesture)
    if (!_adPreloadFired && window.H5GamesAdsAdapter) {
      _adPreloadFired = true;
      H5GamesAdsAdapter.preload();
    }
  }

  function _clearInput() {
    Object.keys(_keys).forEach(k => { _keys[k] = false; });
    _joy.dx = 0;
    _joy.dz = 0;
    _joy.active = false;
  }

  /* ── Tick ───────────────────────────────────────── */
  function tick(dt) {
    if (!in_control || _state !== STATE.EXPLORE || !_camera || !_charGroup) return;

    const fwd = (_keys['KeyW'] || _keys['ArrowUp']    ? 1 : 0) + Math.max(0, -_joy.dz);
    const bck = (_keys['KeyS'] || _keys['ArrowDown']  ? 1 : 0) + Math.max(0,  _joy.dz);
    const lft = (_keys['KeyA'] || _keys['ArrowLeft']  ? 1 : 0) + Math.max(0, -_joy.dx);
    const rgt = (_keys['KeyD'] || _keys['ArrowRight'] ? 1 : 0) + Math.max(0,  _joy.dx);

    const moveInput = Math.min(1, fwd) - Math.min(1, bck);
    const turnInput = Math.min(1, rgt) - Math.min(1, lft);
    const isMoving = moveInput !== 0;

    if (turnInput !== 0) {
      _charYaw -= turnInput * TURN_SPEED * dt;
    }

    if (isMoving && !_firstMoveFired) {
      _firstMoveFired = true;
      window.dispatchEvent(new CustomEvent('arcade:first-move'));
    }

    if (isMoving) {
      const moveX = Math.sin(_charYaw) * moveInput * SPEED * dt;
      const moveZ = Math.cos(_charYaw) * moveInput * SPEED * dt;

      // Clamp to room bounds; cabinets sit against the back wall (z=-14.3)
      _x = Math.max(-14.8, Math.min(13.5, _x + moveX));
      _z = Math.max(-18, Math.min(13.5, _z + moveZ));
      // Cabinet collision. Keep the player's body far enough forward that the
      // head and hat cannot clip through the protruding control panel.
      if (window.ArcadeCabinets) {
        ArcadeCabinets.CABINETS.forEach(cab => {
          if (Math.abs(_x - cab.position[0]) >= CABINET_HALF_BLOCK) return;

          const frontStopZ = cab.position[2] + CABINET_FRONT_STOP;
          const behindStopZ = cab.position[2] - 1.4;

          if (_z < frontStopZ && _z >= cab.position[2]) _z = frontStopZ;
          if (_z < cab.position[2] && _z > behindStopZ) _z = behindStopZ;
        });
      }
    }

    if (isMoving) _animTime += dt * 10;
    const limbs = _charGroup.userData.limbs;
    const walk = Math.sin(_animTime);
    const stride = isMoving ? 0.55 : 0;
    const sideTilt = isMoving ? Math.sin(_animTime * 0.5) * 0.04 : 0;
    const bodyBob = isMoving ? Math.abs(walk) * 0.08 : 0;

    if (limbs) {
      limbs.legs.forEach(leg => {
        leg.rotation.x = walk * stride * leg.userData.walkSign;
        leg.rotation.z = isMoving ? -sideTilt * leg.userData.walkSign : 0;
      });

      limbs.arms.forEach(arm => {
        arm.rotation.x = walk * stride * 0.75 * arm.userData.walkSign;
        arm.rotation.z = (arm.position.x > 0 ? -0.08 : 0.08) + sideTilt;
      });

      if (limbs.head) {
        limbs.head.rotation.z = sideTilt * 0.8;
        limbs.head.rotation.x = isMoving ? Math.abs(walk) * 0.035 : 0;
      }
      if (limbs.visor) limbs.visor.rotation.z = limbs.head ? limbs.head.rotation.z : 0;
      if (limbs.glow) limbs.glow.intensity = isMoving ? 0.55 + Math.sin(_animTime * 2.4) * 0.12 : 0.6;
    }

    _charGroup.position.set(_x, bodyBob, _z);
    _charGroup.rotation.y = _charYaw;

    // Camera follows behind character based on camera yaw, clamped inside room
    const WALL = 14.2;
    // Camera follows directly behind the player based on character yaw
    _yaw = _charYaw;
    const camX = Math.max(-WALL, Math.min(WALL, _x - Math.sin(_yaw) * CAM_DIST));
    const camZ = Math.max(-WALL, Math.min(WALL, _z - Math.cos(_yaw) * CAM_DIST));
    _camera.position.lerp(
      new THREE.Vector3(camX, CAM_HEIGHT, camZ),
      CAM_LERP
    );
    _camera.lookAt(_x, 1.2, _z);
  }

  /* ── State transitions ─────────────────────────── */
  function enterPlaying() {
    _state = STATE.PLAYING;
    in_control = false;
    _clearInput();
    if (_locked()) document.exitPointerLock();
  }

  function enterExplore() {
    _clearInput();
    _state = STATE.EXPLORE;
    in_control = true;
  }

  function enterZooming() {
    _clearInput();
    _state = STATE.ZOOMING;
    in_control = false;
  }

  /* ── Joystick DOM ───────────────────────────────── */
  function _buildJoystick() {
    const base = document.createElement('div');
    base.id = 'arcade-joy-base';
    base.innerHTML = '<div id="arcade-joy-nub"></div>';
    document.body.appendChild(base);
    const nub = base.querySelector('#arcade-joy-nub');

    function joyStart(e) {
      if (!in_control || _state !== STATE.EXPLORE) return;
      const t = e.changedTouches[0];
      _joy.active = true; _joy.id = t.identifier;
      _joy.cx = t.clientX; _joy.cy = t.clientY;
      e.preventDefault();
    }
    function joyMove(e) {
      if (!_joy.active) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== _joy.id) continue;
        const rx = t.clientX - _joy.cx, ry = t.clientY - _joy.cy;
        const len = Math.sqrt(rx * rx + ry * ry);
        const cl = Math.min(len, JOY_RADIUS);
        const nx = len > 1 ? (rx / len) * cl : 0;
        const ny = len > 1 ? (ry / len) * cl : 0;
        _joy.dx = nx / JOY_RADIUS; _joy.dz = ny / JOY_RADIUS;
        nub.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
        e.preventDefault();
      }
    }
    function joyEnd(e) {
      for (const t of e.changedTouches) {
        if (t.identifier === _joy.id) {
          _joy.active = false; _joy.dx = _joy.dz = 0;
          nub.style.transform = 'translate(-50%, -50%)';
        }
      }
    }
    base.addEventListener('touchstart', joyStart, { passive: false });
    window.addEventListener('touchmove',   joyMove,  { passive: false });
    window.addEventListener('touchend',    joyEnd,   { passive: false });
    window.addEventListener('touchcancel', joyEnd,   { passive: false });

    // Right-side touch look disabled for follow-camera mode.
    window.addEventListener('touchstart', () => {}, { passive: true });
    window.addEventListener('touchmove', () => {}, { passive: true });
    window.addEventListener('touchend', () => {}, { passive: true });
  }

  /* ── Init ───────────────────────────────────────── */
  function init(camera, scene) {
    _camera = camera;
    _scene  = scene;

    // Position the camera behind the player based on starting character yaw.
    camera.position.set(
      _x - Math.sin(_charYaw) * CAM_DIST,
      CAM_HEIGHT,
      _z - Math.cos(_charYaw) * CAM_DIST
    );

    _buildCharacter(scene);

    window.addEventListener('keydown',   _onKey);
    window.addEventListener('keyup',     _onKey);
    window.addEventListener('mousemove', _onMouseMove);
    window.addEventListener('blur',      _clearInput);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) _clearInput();
    });

    const canvas = document.getElementById('arcade-canvas');
    if (canvas) canvas.addEventListener('click', _onCanvasClick);

    _buildJoystick();
  }

  return {
    init, tick, enterPlaying, enterExplore, enterZooming, clearInput: _clearInput,
    get in_control() { return in_control; },
    get state()      { return _state; },
    get STATE()      { return STATE; },
    get position()   { return { x: _x, z: _z }; },
    setPosition(x, z) { _x = x; _z = z; },
  };
})();
