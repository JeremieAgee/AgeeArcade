/**
 * Ball — Basketball physics and state
 *
 * Free-flight motion (gravity, velocity integration) is delegated to the
 * Rapier physics world already running for the player's skeleton. This
 * module still owns the plain position/velocity vectors everything else in
 * the game reads and writes directly (ShotController, Game.js's held-ball
 * logic, HoopDetector's bounces) - it just keeps a Rapier rigid body in
 * sync with them instead of doing the gravity/drag integration by hand.
 */
window.HoopsBall = (() => {
  'use strict';

  const C = window.HOOPS_CONSTANTS;

  function create(mesh, scene, skeletonRuntime) {
    const ball = {
      mesh,
      position: mesh.position.clone(),
      velocity: new THREE.Vector3(0, 0, 0),
      radius: C.BALL_RADIUS,
      isHeld: true,
      isFlying: false,
      hasScored: false,
      lastRimHit: false,
      lastBackboardHit: false,
      transitioning: false,
      transitionTime: 0,
      transitionDuration: 0.15,
      targetPosition: null,
      startPosition: null,
      needsPhysicsSync: true,
    };

    const physicsBall = window.SkeletonEngine.createPhysicsBall(
      skeletonRuntime,
      C.BALL_RADIUS,
      { x: ball.position.x, y: ball.position.y, z: ball.position.z }
    );

    function pushToPhysics() {
      physicsBall.setPosition(ball.position.x, ball.position.y, ball.position.z);
      physicsBall.setVelocity(ball.velocity.x, ball.velocity.y, ball.velocity.z);
    }

    function pullFromPhysics() {
      const p = physicsBall.getPosition();
      const v = physicsBall.getVelocity();
      ball.position.set(p.x, p.y, p.z);
      ball.velocity.set(v.x, v.y, v.z);
    }

    return {
      get mesh() { return ball.mesh; },
      get position() { return ball.position; },
      get velocity() { return ball.velocity; },
      get isFlying() { return ball.isFlying; },
      get isHeld() { return ball.isHeld; },

      reset() {
        ball.isHeld = true;
        ball.isFlying = false;
        ball.hasScored = false;
        ball.lastRimHit = false;
        ball.lastBackboardHit = false;
        ball.velocity.set(0, 0, 0);
        ball.position.set(0, 2.2, 6);
        ball.mesh.position.copy(ball.position);
        pushToPhysics();
      },

      setVelocity(x, y, z) {
        ball.velocity.set(x, y, z);
        ball.isHeld = false;
        ball.isFlying = true;
        ball.needsPhysicsSync = true;
      },

      update(dt) {
        // Handle smooth transitions (unrelated to free-flight physics)
        if (ball.transitioning) {
          ball.transitionTime += dt;
          const progress = Math.min(ball.transitionTime / ball.transitionDuration, 1);
          const Easing = window.HOOPS_ANIMATIONS.Easing;
          const eased = Easing.easeOutQuad(progress);

          ball.position.lerpVectors(ball.startPosition, ball.targetPosition, eased);
          ball.mesh.position.copy(ball.position);
          pushToPhysics();

          if (progress >= 1) {
            ball.transitioning = false;
            ball.position.copy(ball.targetPosition);
            ball.mesh.position.copy(ball.position);
            pushToPhysics();
          }
          return;
        }

        if (ball.isHeld) {
          // Position/velocity are driven directly by the caller every frame
          // (dribble hold, shot windup) - keep the Rapier body pinned to
          // match so it doesn't drift from gravity in between.
          pushToPhysics();
          return;
        }

        if (!ball.isFlying) return;

        if (ball.needsPhysicsSync) {
          // A shot was just released, or a bounce just changed velocity -
          // push our authoritative values in before trusting Rapier's own
          // (otherwise-stale) simulated state.
          pushToPhysics();
          ball.needsPhysicsSync = false;
        } else {
          // Gravity + integration already happened this frame (Rapier was
          // stepped earlier via skeletonRuntime.step). Pull the result back
          // for rendering and for the game's own rim/backboard/net checks.
          pullFromPhysics();
        }

        // Update mesh
        ball.mesh.position.copy(ball.position);

        // Spin is purely cosmetic here - it doesn't feed back into flight
        const spinX = ball.velocity.z * dt * 0.08;
        const spinZ = -ball.velocity.x * dt * 0.08;
        ball.mesh.rotation.x += spinX;
        ball.mesh.rotation.z += spinZ;

        // Out of bounds
        if (ball.position.y < -5 || Math.abs(ball.position.x) > 15 || ball.position.z > 15) {
          this.reset();
          ball.hasScored = false;
        }
      },

      didRimHit() {
        const hit = ball.lastRimHit;
        ball.lastRimHit = false;
        return hit;
      },

      didBackboardHit() {
        const hit = ball.lastBackboardHit;
        ball.lastBackboardHit = false;
        return hit;
      },

      markScoringRim() {
        ball.hasScored = true;
      },

      hasScored() {
        return ball.hasScored;
      },

      bounce(normal, damping = 0.55) {
        // Angle-based damping (more glancing blows lose more energy)
        const dotProduct = Math.abs(ball.velocity.dot(normal));
        const impactAngle = Math.acos(Math.min(dotProduct / ball.velocity.length(), 1));
        const angleDamping = 0.7 + 0.3 * (impactAngle / Math.PI);

        ball.velocity.reflect(normal);
        ball.velocity.multiplyScalar(damping * angleDamping);

        // Push the ball out of the surface it just hit, so it isn't still
        // sitting inside the same collision band next frame - otherwise a
        // heavily-damped bounce can retrigger every frame, killing velocity
        // down to ~0 and looking like the ball got stuck in the rim.
        ball.position.addScaledVector(normal, ball.radius * 1.1);

        ball.needsPhysicsSync = true;
      },

      dampHorizontalVelocity(factor) {
        // For brushing through the net: slows horizontal drift without
        // touching vertical fall, so the ball keeps dropping straight
        // through instead of reflecting off like it hit a rigid wall.
        //
        // This pushes straight to physics rather than setting
        // needsPhysicsSync - it doesn't move position like bounce() does,
        // so if this keeps re-triggering every frame (e.g. grazing the net
        // on a miss), routing it through needsPhysicsSync would make every
        // subsequent frame re-push this same stale state instead of
        // pulling gravity's effect, freezing the ball in place indefinitely.
        ball.velocity.x *= factor;
        ball.velocity.z *= factor;
        physicsBall.setVelocity(ball.velocity.x, ball.velocity.y, ball.velocity.z);
      },

      getBallRadius() {
        return ball.radius;
      },

      getInternalState() {
        return ball;
      },

      smoothMoveTo(targetPos, duration = 0.15) {
        ball.transitioning = true;
        ball.transitionTime = 0;
        ball.transitionDuration = duration;
        ball.startPosition = ball.position.clone();
        ball.targetPosition = targetPos.clone();
      },
    };
  }

  return { create };
})();
