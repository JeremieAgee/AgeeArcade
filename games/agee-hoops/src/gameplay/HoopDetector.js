/**
 * HoopDetector — Ball collision with rim, backboard, and scoring detection
 */
window.HoopsHoopDetector = (() => {
  'use strict';

  const C = window.HOOPS_CONSTANTS;
  const MATH = window.HOOPS_MATH;

  let ball = null;
  let callbacks = {};
  let lastFrameY = 0;
  let cleanSwish = false;
  let rimContactCount = 0;

  function init(ballObj, cbs = {}) {
    ball = ballObj;
    callbacks = cbs;
    return {
      update: update,
      wasCleanSwish: wasCleanSwish,
    };
  }

  function update() {
    if (!ball || !ball.isFlying) {
      cleanSwish = false;
      rimContactCount = 0;
      return;
    }

    const pos = ball.position;

    // Check rim collision
    checkRimCollision();

    // Check pole collision
    checkPoleCollision();

    // Check net collision
    checkNetCollision();

    // Check backboard collision
    checkBackboardCollision();

    // Check scoring
    checkScore();

    lastFrameY = pos.y;
  }

  function checkScore() {
    const pos = ball.position;
    const rim = C.HOOP_RIM_CENTER;

    const dx = pos.x - rim.x;
    const dz = pos.z - rim.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);

    // Must be inside rim horizontally
    const insideRim = horizontalDist < C.HOOP_RIM_RADIUS * 0.85;

    // Must cross scoring plane from above (last frame above, this frame at or below)
    const scorePlaneY = C.HOOP_SCORE_PLANE_Y;
    const crossingPlane = lastFrameY >= scorePlaneY && pos.y < scorePlaneY;

    // Must not be too far below rim
    const notTooLow = pos.y > (rim.y - 1.5);

    if (insideRim && crossingPlane && notTooLow && !ball.hasScored()) {
      ball.markScoringRim();
      cleanSwish = rimContactCount === 0;

      if (callbacks.onBasketMade) {
        const spotSystem = window.HoopsShotSpots;
        callbacks.onBasketMade(spotSystem.getCurrentSpot());
      }
    }
  }

  function checkRimCollision() {
    const pos = ball.position;
    const rim = C.HOOP_RIM_CENTER;
    const vel = ball.velocity;

    const dx = pos.x - rim.x;
    const dz = pos.z - rim.z;
    const dy = pos.y - rim.y;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);

    const nearRimRadius = Math.abs(horizontalDist - C.HOOP_RIM_RADIUS) < ball.getBallRadius();
    const nearRimHeight = Math.abs(dy) < ball.getBallRadius();

    if (nearRimRadius && nearRimHeight && !ball.hasScored()) {
      rimContactCount++;

      // Bounce normal depends on hit location
      // Hit from above = bounce down into net
      // Hit from below = bounce up and out
      // Hit from side = bounce outward
      let normal = new THREE.Vector3(dx, 0, dz).normalize();

      // If ball is coming from above, add downward component to bounce into net
      if (vel.y < 0 && dy > -0.1) {
        normal.y = -0.5; // Push down into net
        normal.normalize();
      }
      // If ball hits from below, bounce back up
      else if (vel.y > 0) {
        normal.y = 0.6; // Push up and out
        normal.normalize();
      }

      ball.bounce(normal, C.RIM_BOUNCE_DAMPING);

      if (callbacks.onRimHit) {
        callbacks.onRimHit();
      }
    }
  }

  function checkPoleCollision() {
    const pos = ball.position;
    const rim = C.HOOP_RIM_CENTER;
    const vel = ball.velocity;

    const poleRadius = 0.1;
    const poleTopY = rim.y + 0.5;
    const poleBottomY = 0;

    const dx = pos.x - rim.x;
    const dz = pos.z - rim.z;
    const dy = pos.y - rim.y;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);

    // Check if ball is within pole cylinder - directional bounce
    if (horizontalDist < poleRadius && pos.y >= poleBottomY && pos.y <= poleTopY) {
      let normal = new THREE.Vector3(dx, 0, dz).normalize();

      // Vertical component depends on approach direction
      if (vel.y < 0) {
        normal.y = -0.4; // Coming from above, bounce down
      } else if (vel.y > 0) {
        normal.y = 0.4; // Coming from below, bounce up
      }
      normal.normalize();

      ball.bounce(normal, 0.8);
    }
  }

  function checkNetCollision() {
    const pos = ball.position;
    const rim = C.HOOP_RIM_CENTER;

    const netRadius = 0.55;
    const netTopY = rim.y - 0.1;
    const netBottomY = rim.y - 1.5;

    const dx = pos.x - rim.x;
    const dz = pos.z - rim.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);

    // Inside net area - brush through it (slow horizontal drift) + push
    // the net, instead of bouncing off it like a rigid wall. A real net
    // just slows the ball down as it falls through, it doesn't reflect it.
    if (horizontalDist < netRadius && pos.y < netTopY && pos.y > netBottomY) {
      ball.dampHorizontalVelocity(0.8);

      // Push the net
      if (callbacks.onNetHit) {
        const forceX = ball.velocity.x * 0.15;
        const forceZ = ball.velocity.z * 0.15;
        callbacks.onNetHit(forceX, forceZ);
      }
    }
  }

  function checkBackboardCollision() {
    const pos = ball.position;
    const rim = C.HOOP_RIM_CENTER;
    const vel = ball.velocity;

    const backboardX = 0;
    const backboardZ = C.HOOP_BACKBOARD_Z;
    const backboardWidth = 1.05 / 2;
    const backboardHeight = 1.0 / 2;
    const backboardTopY = rim.y + 0.6 + backboardHeight;
    const backboardBottomY = rim.y + 0.6 - backboardHeight;
    const ballRadius = ball.getBallRadius();

    // Check if ball is in the backboard area
    const withinX = Math.abs(pos.x - backboardX) < backboardWidth + ballRadius;
    const withinY = pos.y >= backboardBottomY && pos.y <= backboardTopY;

    // Check if crossing the backboard plane
    const isAtBoard = Math.abs(pos.z - backboardZ) < ballRadius * 2;

    if (withinX && withinY && isAtBoard && vel.z < 0) {
      // Clamp position to backboard surface
      ball.position.z = Math.max(pos.z, backboardZ + ballRadius);

      // Bounce with Z component reversed
      let normal = new THREE.Vector3(0, 0, 1);

      // Bounce angle depends on approach
      if (vel.y < 0) {
        // From above - bounce down
        normal.y = -0.2;
      } else if (vel.y > 0) {
        // From below - bounce up slightly
        normal.y = 0.1;
      }

      // Add small X component if hitting at an angle
      if (Math.abs(vel.x) > 1) {
        normal.x = vel.x > 0 ? -0.2 : 0.2;
      }

      normal.normalize();
      ball.bounce(normal, 0.8);
    }
  }

  function wasCleanSwish() {
    return cleanSwish;
  }

  return { init };
})();
