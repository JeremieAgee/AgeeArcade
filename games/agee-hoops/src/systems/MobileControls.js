/**
 * MobileControls — Touch-based controls for mobile devices
 */
window.HoopsMobileControls = (() => {
  'use strict';

  let playerController = null;
  let shotController = null;
  let player = null;
  let camera = null;

  let touchStartY = 0;
  let angleAdjustment = 0;
  let isChargingPower = false;
  let lastTouchTime = 0;

  const C = window.HOOPS_CONSTANTS;

  function init(playerCtrl, shotCtrl, playerObj, cameraObj) {
    playerController = playerCtrl;
    shotController = shotCtrl;
    player = playerObj;
    camera = cameraObj;

    createMobileUI();
    attachTouchHandlers();

    return {
      update,
      destroy,
      getAngleAdjustment: () => angleAdjustment,
    };
  }

  function createMobileUI() {
    const html = `
      <div id="mobileUI" style="display: none; position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 100;">

        <!-- Joystick Container -->
        <div id="joystickContainer" style="width: 120px; height: 120px; background: rgba(0,0,0,0.5); border: 2px solid #ffcc00; border-radius: 50%; position: absolute; bottom: 180px; left: -60px;">
          <div id="joystickStick" style="width: 40px; height: 40px; background: #ffcc00; border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);"></div>
        </div>

        <!-- Angle Display -->
        <div id="angleText" style="color: #ffcc00; font-size: 20px; font-family: Cinzel; margin-bottom: 20px; text-align: center;">ANGLE: 0°</div>

        <!-- Power Display -->
        <div id="powerBar" style="width: 200px; height: 20px; background: rgba(0,0,0,0.7); border: 2px solid #ffcc00; margin-bottom: 20px;">
          <div id="powerFill" style="width: 0%; height: 100%; background: #ffcc00; transition: width 0.05s;"></div>
        </div>

        <!-- Buttons -->
        <button id="aimAtGoalBtn" style="padding: 10px 20px; background: #ff6600; color: white; border: none; margin-right: 10px; font-family: Cinzel; cursor: pointer; font-size: 14px;">AIM AT GOAL</button>
        <button id="shootBtn" style="padding: 10px 30px; background: #00aa00; color: white; border: none; font-family: Cinzel; cursor: pointer; font-size: 16px; font-weight: bold;">HOLD TO SHOOT</button>
      </div>
    `;

    const container = document.getElementById('gameContainer');
    if (container) {
      const mobileDiv = document.createElement('div');
      mobileDiv.innerHTML = html;
      container.appendChild(mobileDiv);
    }
  }

  function attachTouchHandlers() {
    const canvas = document.querySelector('#gameCanvas');
    if (!canvas) return;

    // Joystick controls
    const joystickContainer = document.getElementById('joystickContainer');
    canvas.addEventListener('touchstart', handleJoystickStart);
    canvas.addEventListener('touchmove', handleJoystickMove);
    canvas.addEventListener('touchend', handleJoystickEnd);

    // Angle adjustment (up/down swipe)
    canvas.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    });
    canvas.addEventListener('touchmove', (e) => {
      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;
      angleAdjustment += deltaY * 0.001;
      angleAdjustment = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, angleAdjustment));
      touchStartY = touchY;
      updateAngleDisplay();
    });

    // Aim at goal button
    const aimBtn = document.getElementById('aimAtGoalBtn');
    if (aimBtn) {
      aimBtn.addEventListener('click', autoAimAtGoal);
    }

    // Power button
    const shootBtn = document.getElementById('shootBtn');
    if (shootBtn) {
      shootBtn.addEventListener('touchstart', startCharging);
      shootBtn.addEventListener('touchend', releaseShot);
      shootBtn.addEventListener('mousedown', startCharging);
      shootBtn.addEventListener('mouseup', releaseShot);
    }
  }

  function handleJoystickStart(e) {
    if (e.target.id !== 'gameCanvas') return;
    const touch = e.touches[0];
    moveJoystick(touch.clientX, touch.clientY);
  }

  function handleJoystickMove(e) {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      moveJoystick(touch.clientX, touch.clientY);
    }
  }

  function handleJoystickEnd(e) {
    // Center joystick
    const stick = document.getElementById('joystickStick');
    if (stick) {
      stick.style.transform = 'translate(-50%, -50%)';
    }
  }

  function moveJoystick(x, y) {
    const canvas = document.querySelector('#gameCanvas');
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = 100;

    if (dist < maxDist) {
      const stick = document.getElementById('joystickStick');
      if (stick) {
        stick.style.transform = `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2}px))`;
      }

      // Move player based on joystick
      if (playerController && dist > 10) {
        const angle = Math.atan2(dy, dx);
        playerController.moveWithAngle(angle, dist / maxDist);
      }
    }
  }

  function autoAimAtGoal() {
    if (!player) return;
    const playerPos = player.getPosition();
    const hoopPos = C.HOOP_RIM_CENTER;

    // Calculate angle to hoop
    const dx = hoopPos.x - playerPos.x;
    const dz = hoopPos.z - playerPos.z;
    const aimAngle = Math.atan2(dx, dz);

    player.rotate(aimAngle);
    updateAngleDisplay();
  }

  function startCharging() {
    if (!shotController) return;
    isChargingPower = true;
    shotController.startCharge();
    updatePowerDisplay();
  }

  function releaseShot() {
    if (!shotController || !isChargingPower) return;
    isChargingPower = false;
    shotController.releaseShot();
  }

  function updateAngleDisplay() {
    const angleEl = document.getElementById('angleText');
    if (angleEl) {
      const degrees = Math.round((angleAdjustment || 0) * 180 / Math.PI);
      angleEl.textContent = `ANGLE: ${degrees}°`;
    }
  }

  function updatePowerDisplay() {
    if (!shotController) return;
    const powerEl = document.getElementById('powerFill');
    if (powerEl) {
      const ratio = shotController.getChargeRatio();
      powerEl.style.width = (ratio * 100) + '%';
    }
  }

  function update(dt) {
    updateAngleDisplay();
    if (isChargingPower) {
      updatePowerDisplay();
    }
  }

  function destroy() {
    const mobileUI = document.getElementById('mobileUI');
    if (mobileUI) mobileUI.remove();
  }

  return { init };
})();
