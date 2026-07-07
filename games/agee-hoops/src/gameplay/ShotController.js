/**
 * ShotController — Aiming, charging, and shooting mechanics
 */
window.HoopsShotController = (() => {
  'use strict';

  const C = window.HOOPS_CONSTANTS;
  const MATH = window.HOOPS_MATH;

  let ball = null;
  let player = null;
  let playerController = null;
  let camera = null;
  let input = null;
  let callbacks = {};

  let isChargingAngle = false;
  let isChargingPower = false;
  let chargeTime = 0;
  let chargeAngle = 0;

  function init(ballObj, playerObj, playerControllerObj, cameraObj, inputObj, cbs = {}) {
    ball = ballObj;
    player = playerObj;
    playerController = playerControllerObj;
    camera = cameraObj;
    input = inputObj;
    callbacks = cbs;
    return {
      startAngle,
      releaseAngle,
      startCharge,
      releaseShot,
      update,
      getChargeRatio,
      getChargeAngle,
    };
  }

  function startAngle() {
    if (!ball.isHeld) return;
    isChargingAngle = true;
    chargeAngle = 0;
  }

  function releaseAngle() {
    isChargingAngle = false;
  }

  function startCharge() {
    if (!ball.isHeld) return;
    isChargingPower = true;
    chargeTime = 0;
  }

  function releaseShot() {
    if (!isChargingPower) return;
    isChargingPower = false;

    const powerRatio = Math.max(chargeTime / C.MAX_CHARGE_TIME, C.INITIAL_SHOT_POWER);
    shootBall(powerRatio, chargeAngle);

    if (callbacks.onShotFired) {
      callbacks.onShotFired();
    }
  }

  function update(dt) {
    if (isChargingAngle) {
      chargeAngle += dt * 0.25;
      chargeAngle = Math.min(chargeAngle, Math.PI / 3);
    }

    if (isChargingPower) {
      chargeTime += dt;
      chargeTime = Math.min(chargeTime, C.MAX_CHARGE_TIME);
    }
  }

  function getChargeRatio() {
    return Math.min(chargeTime / C.MAX_CHARGE_TIME, 1.0);
  }

  function getChargeAngle() {
    return chargeAngle;
  }

  function shootBall(powerRatio, shotAngle) {
    if (!player) return;

    const startPos = player.getThrowPosition();
    const playerYaw = player.getRotation();

    // Horizontal direction (from player aim)
    const horizontalDir = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));

    // Get base power
    const arcPower = MATH.calculateShotArc(0, powerRatio);

    // Shot angle affects both horizontal distance and vertical force
    const angleInfluence = Math.cos(shotAngle);
    const verticalInfluence = Math.sin(shotAngle);

    const horizontalDistance = arcPower.horizontal * angleInfluence;
    const verticalForce = verticalInfluence * arcPower.vertical * 0.28 + arcPower.vertical * 0.2;

    // Apply velocity from player position
    const velocity = new THREE.Vector3();
    velocity.copy(horizontalDir).multiplyScalar(horizontalDistance);
    velocity.y = Math.max(verticalForce, 2);

    ball.setVelocity(velocity.x, velocity.y, velocity.z);
    ball.position.copy(startPos);
  }

  return { init };
})();
