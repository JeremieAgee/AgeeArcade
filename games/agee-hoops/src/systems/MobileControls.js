/**
 * MobileControls — Touch controls for mobile: bottom-left joystick to move,
 * plus ANGLE / SHOOT buttons that drive the same charge hooks the desktop
 * mouse/spacebar controls use. Aim is automatic (always faces the hoop)
 * since there's no mouse-look equivalent on touch.
 */
window.HoopsMobileControls = (() => {
  'use strict';

  const C = window.HOOPS_CONSTANTS;
  const JOYSTICK_MAX_DIST = 45;

  let playerController = null;
  let shotController = null;

  let joystickBase = null;
  let joystickStick = null;
  let joystickTouchId = null;
  let joystickDX = 0;
  let joystickDY = 0;

  function init(playerCtrl, shotCtrl, playerObj) {
    playerController = playerCtrl;
    shotController = shotCtrl;

    if (playerController.setAutoAimTarget) {
      playerController.setAutoAimTarget(C.HOOP_RIM_CENTER);
    }

    createMobileUI();
    attachHandlers();
    updateInstructions();

    const mobileUI = document.getElementById('mobileUI');
    if (mobileUI) mobileUI.classList.add('active');

    return { update, destroy };
  }

  function createMobileUI() {
    const container = document.getElementById('gameContainer');
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div id="mobileUI" class="mobile-controls">
        <div id="joystickBase" class="joystick-base">
          <div id="joystickStick" class="joystick-stick"></div>
        </div>
        <div class="mobile-action-buttons">
          <div class="mobile-charge-bars">
            <div class="mobile-charge-track">
              <div id="mobileAngleFill" class="mobile-charge-fill mobile-angle-fill"></div>
            </div>
            <div class="mobile-charge-track">
              <div id="mobilePowerFill" class="mobile-charge-fill mobile-power-fill"></div>
            </div>
          </div>
          <div class="mobile-action-row">
            <button id="angleBtn" class="mobile-btn mobile-btn-angle">ANGLE</button>
            <button id="shootBtn" class="mobile-btn mobile-btn-shoot">SHOOT</button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(wrapper.firstElementChild);

    joystickBase = document.getElementById('joystickBase');
    joystickStick = document.getElementById('joystickStick');
  }

  function attachHandlers() {
    if (joystickBase) {
      joystickBase.addEventListener('touchstart', onJoystickStart, { passive: false });
      joystickBase.addEventListener('touchmove', onJoystickMove, { passive: false });
      joystickBase.addEventListener('touchend', onJoystickEnd, { passive: false });
      joystickBase.addEventListener('touchcancel', onJoystickEnd, { passive: false });
    }

    bindHoldButton('angleBtn', startAngle, releaseAngle);
    bindHoldButton('shootBtn', startCharge, releaseShot);
  }

  function bindHoldButton(id, onStart, onEnd) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(); }, { passive: false });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); onEnd(); }, { passive: false });
    btn.addEventListener('touchcancel', (e) => { e.preventDefault(); onEnd(); }, { passive: false });
  }

  function findTouch(touchList, id) {
    for (let i = 0; i < touchList.length; i++) {
      if (touchList[i].identifier === id) return touchList[i];
    }
    return null;
  }

  function onJoystickStart(e) {
    e.preventDefault();
    if (joystickTouchId !== null) return;
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    updateJoystick(touch.clientX, touch.clientY);
  }

  function onJoystickMove(e) {
    e.preventDefault();
    const touch = findTouch(e.changedTouches, joystickTouchId);
    if (!touch) return;
    updateJoystick(touch.clientX, touch.clientY);
  }

  function onJoystickEnd(e) {
    e.preventDefault();
    const touch = findTouch(e.changedTouches, joystickTouchId);
    if (!touch) return;
    joystickTouchId = null;
    joystickDX = 0;
    joystickDY = 0;
    if (joystickStick) joystickStick.style.transform = 'translate(-50%, -50%)';
  }

  function updateJoystick(clientX, clientY) {
    if (!joystickBase) return;
    const rect = joystickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > JOYSTICK_MAX_DIST) {
      dx = (dx / dist) * JOYSTICK_MAX_DIST;
      dy = (dy / dist) * JOYSTICK_MAX_DIST;
    }

    if (joystickStick) {
      joystickStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }

    joystickDX = dx / JOYSTICK_MAX_DIST;
    joystickDY = dy / JOYSTICK_MAX_DIST;
  }

  function applyMovement(dt) {
    if (!playerController) return;
    const magnitude = Math.min(Math.sqrt(joystickDX * joystickDX + joystickDY * joystickDY), 1);

    // Always call through (even at zero magnitude) so the controller's
    // "is moving" flag clears the instant the stick returns to center.
    if (magnitude <= 0.1) {
      playerController.moveWithAngle(0, 0, dt);
      return;
    }

    // Joystick directions are relative to the way the player is currently
    // facing (auto-aimed at the hoop), matching WASD's forward-is-aimYaw
    // convention: up = toward the hoop, left/right = strafe.
    const localAngle = Math.atan2(-joystickDX, -joystickDY);
    const aimYaw = playerController.getAimYaw ? playerController.getAimYaw() : 0;
    playerController.moveWithAngle(aimYaw + localAngle, magnitude, dt);
  }

  function startAngle() {
    if (shotController) shotController.startAngle();
  }

  function releaseAngle() {
    if (shotController) shotController.releaseAngle();
  }

  function startCharge() {
    if (shotController) shotController.startCharge();
  }

  function releaseShot() {
    if (shotController) shotController.releaseShot();
  }

  function updateInstructions() {
    const instructions = document.querySelector('#titleScreen .instructions');
    if (!instructions) return;
    instructions.innerHTML = `
      <p><strong>Joystick:</strong> Move | <strong>ANGLE:</strong> Hold to raise your shot arc | <strong>SHOOT:</strong> Hold to charge power, release to shoot</p>
      <p>Aim is automatic — get to a shot spot and let it fly!</p>
    `;
  }

  function update(dt) {
    applyMovement(dt);

    if (!shotController) return;

    const angleFill = document.getElementById('mobileAngleFill');
    if (angleFill) {
      const angleRatio = shotController.getChargeAngle() / (Math.PI / 3);
      angleFill.style.width = Math.round(angleRatio * 100) + '%';
    }

    const powerFill = document.getElementById('mobilePowerFill');
    if (powerFill) {
      powerFill.style.width = Math.round(shotController.getChargeRatio() * 100) + '%';
    }
  }

  function destroy() {
    const mobileUI = document.getElementById('mobileUI');
    if (mobileUI) mobileUI.remove();
  }

  return { init };
})();
