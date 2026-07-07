/**
 * PlayerController — Handles player movement and rotation
 */
window.HoopsPlayerController = (() => {
  'use strict';

  let player = null;
  let camera = null;

  const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
  };

  let aimYaw = Math.PI;
  let aimPitch = 0;
  let canvas = null;
  let autoAimTarget = null;
  let externalMoveActive = false;

  function init(playerObj, cameraObj, canvasElement) {
    player = playerObj;
    camera = cameraObj;
    canvas = canvasElement;

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', requestPointerLock);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    window.addEventListener('resize', handleResize);

    return {
      update,
      destroy,
      requestPointerLock,
      getAimPitch: () => aimPitch,
      getAimYaw: () => aimYaw,
      isMoving: () => keys.w || keys.s || keys.a || keys.d || externalMoveActive,
      // Auto-aim keeps the player facing a fixed world point (used on mobile,
      // where there's no mouse to drive aimYaw via look deltas).
      setAutoAimTarget: (target) => { autoAimTarget = target; },
      moveWithAngle: (angle, magnitude, dt = 0.016) => {
        if (!player) return;
        externalMoveActive = magnitude > 0.1;
        player.move(angle, magnitude, dt);
      },
    };
  }

  function requestPointerLock() {
    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
    canvas.requestPointerLock();
  }

  function handlePointerLockChange() {
    const locked = document.pointerLockElement === canvas || document.mozPointerLockElement === canvas;
    console.log('Pointer lock:', locked ? 'enabled' : 'disabled');
  }

  function handleKeyDown(e) {
    const key = e.key.toLowerCase();
    if (key === 'w') keys.w = true;
    if (key === 'a') keys.a = true;
    if (key === 's') keys.s = true;
    if (key === 'd') keys.d = true;
  }

  function handleKeyUp(e) {
    const key = e.key.toLowerCase();
    if (key === 'w') keys.w = false;
    if (key === 'a') keys.a = false;
    if (key === 's') keys.s = false;
    if (key === 'd') keys.d = false;
  }

  function handleMouseMove(e) {
    // Use movement deltas for pointer lock
    const movementX = e.movementX || e.mozMovementX || 0;
    const movementY = e.movementY || e.mozMovementY || 0;

    const sensitivity = 0.005;
    aimYaw -= movementX * sensitivity;
    aimPitch -= movementY * sensitivity;
    aimPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, aimPitch));
  }

  function handleResize() {
    // Canvas resize handled by graphics engine
  }

  function update(dt) {
    if (!player || !camera) return;

    const playerPos = player.getPosition();

    if (autoAimTarget) {
      aimYaw = Math.atan2(autoAimTarget.x - playerPos.x, autoAimTarget.z - playerPos.z);
    }

    // Determine movement direction and magnitude
    let moveDirection = 0;
    let moveMagnitude = 0;

    if (keys.w) {
      moveDirection = aimYaw;
      moveMagnitude = 1;
    }
    if (keys.s) {
      moveDirection = aimYaw + Math.PI;
      moveMagnitude = 1;
    }
    if (keys.a) {
      moveDirection = aimYaw + Math.PI / 2;
      moveMagnitude = 1;
    }
    if (keys.d) {
      moveDirection = aimYaw - Math.PI / 2;
      moveMagnitude = 1;
    }

    // Handle diagonal movement
    if ((keys.w || keys.s) && (keys.a || keys.d)) {
      moveMagnitude = Math.sqrt(2) / 2; // Normalize diagonal
    }

    // Move player
    if (moveMagnitude > 0) {
      player.move(moveDirection, moveMagnitude, dt);
    }

    // Check backboard collision (prevent walking through)
    const C = window.HOOPS_CONSTANTS;
    const pos = player.getPosition();
    const backboardZ = C.HOOP_BACKBOARD_Z;
    const backboardWidth = 1.05 / 2;
    const playerRadius = 0.35;

    if (Math.abs(pos.x) < backboardWidth + playerRadius &&
        pos.z < backboardZ + playerRadius) {
      // Push player back from backboard
      pos.z = backboardZ + playerRadius;
    }

    // Mouse controls player aim direction
    player.rotate(aimYaw);

    // Update camera to follow player
    updateCameraFollow(playerPos, aimYaw);
  }

  function updateCameraFollow(playerPos, playerYaw) {
    if (!camera) return;

    const cameraDistance = 5;
    const cameraHeight = 2.0;

    // Chase camera: stays behind the player at a fixed distance/height,
    // rotating with their aim direction.
    const offsetX = -Math.sin(playerYaw) * cameraDistance;
    const offsetZ = -Math.cos(playerYaw) * cameraDistance;

    camera.position.x = playerPos.x + offsetX;
    camera.position.y = playerPos.y + cameraHeight;
    camera.position.z = playerPos.z + offsetZ;

    // Look at a point ahead of the player (toward the hoop)
    const lookAhead = 8;
    const lookAtX = playerPos.x + Math.sin(playerYaw) * lookAhead;
    const lookAtZ = playerPos.z + Math.cos(playerYaw) * lookAhead;

    camera.lookAt(lookAtX, playerPos.y + 1.5, lookAtZ);
  }

  function destroy() {
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('pointerlockchange', handlePointerLockChange);
    if (canvas) {
      canvas.removeEventListener('click', requestPointerLock);
    }
    window.removeEventListener('resize', handleResize);

    // Exit pointer lock
    if (document.pointerLockElement || document.mozPointerLockElement) {
      document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock;
      document.exitPointerLock();
    }
  }

  return { init };
})();
