/**
 * Player — 3D player character on the court
 */
window.HoopsPlayer = (() => {
  'use strict';

  const C = window.HOOPS_CONSTANTS;

  let position = new THREE.Vector3(0, 0, 2);
  let rotation = 0; // yaw angle in radians
  let mesh = null;
  let scene = null;
  let animationTime = 0;
  let humanoid = null;
  let shootAnimProgress = 0;
  let lastIsMoving = false;

  // X is capped near the court's edge (bleachers start just past it and
  // would otherwise be walkable-through); Z extends out to use the open
  // floor behind both baselines, capped just inside the gym walls.
  const COURT_MIN_X = -7.6;
  const COURT_MAX_X = 7.6;
  const COURT_MIN_Z = -15.4;
  const COURT_MAX_Z = 15.4;

  // Fixed release point for a shot, independent of the animated arm bone.
  const RELEASE_HEIGHT = 1.3;
  const RELEASE_FORWARD = 0.4;

  // Fixed ball-in-hand point for the dribble, independent of the arm's
  // animated swing (roughly where the hand rests with the elbow bent).
  const DRIBBLE_HEIGHT = 0.55;
  const DRIBBLE_FORWARD = 0.34;
  const DRIBBLE_SIDE = 0.25;

  const _handWorldPos = new THREE.Vector3();

  function create(gameScene, skeletonRuntime) {
    scene = gameScene;

    const materials = {
      body: new THREE.MeshStandardMaterial({
        color: 0xff6b00,
        roughness: 0.7,
        metalness: 0.2,
      }),
      eyes: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }),
    };

    humanoid = window.SkeletonEngine.createHumanoid(skeletonRuntime.skeleton, materials);
    mesh = humanoid.group;

    // Position at center court (rig origin sits at ground/feet level)
    position.set(0, 0, 2);
    mesh.position.copy(position);

    scene.add(mesh);

    return {
      update,
      move,
      rotate,
      getPosition,
      getRotation,
      getMesh,
      getShootPosition,
      getBallCarryPosition,
      getShootDirection,
      getThrowPosition,
      startShooting: () => { shootAnimProgress = 0; },
    };
  }

  function update(dt, isMoving = false, isShooting = false) {
    mesh.position.copy(position);
    // Humanoid rig faces local -Z; add PI so the model faces its aim/forward
    // direction (and away from the camera) instead of facing the camera.
    mesh.rotation.y = rotation + Math.PI;

    animationTime += dt;

    const B = window.SkeletonEngine.HumanoidBone;
    const pivots = humanoid.pivots;

    // Smooth transition when movement state changes
    if (isMoving !== lastIsMoving) {
      lastIsMoving = isMoving;
    }

    window.SkeletonEngine.animateHumanoidWalk(humanoid, dt, isMoving);

    if (isShooting) {
      // Shooting animation with wind-up (overrides arms/hips on top of the base pose)
      shootAnimProgress = Math.min(shootAnimProgress + dt * 2, 1);
      const Easing = window.HOOPS_ANIMATIONS.Easing;
      const eased = Easing.easeOutQuad(shootAnimProgress);

      pivots[B.HIPS].pivot.position.y += eased * 0.1;
      pivots[B.UPPER_ARM_R].pivot.rotation.x = Math.PI / 3 + eased * 0.15;
      pivots[B.UPPER_ARM_L].pivot.rotation.x = Math.PI / 3 + eased * 0.15;
      // Bend elbows in, bringing forearms/hands up toward the face
      pivots[B.LOWER_ARM_R].pivot.rotation.x = eased * 1.3;
      pivots[B.LOWER_ARM_L].pivot.rotation.x = eased * 1.3;
    } else {
      shootAnimProgress = 0;

      // Right arm always dribbles when not shooting (overrides the walk swing)
      const dribblePhase = animationTime * 7;
      const dribbleBob = Math.sin(dribblePhase) * 0.25;
      pivots[B.UPPER_ARM_R].pivot.rotation.x = dribbleBob;
      // Bend the elbow so the hand (and the ball riding on it) sits out
      // in front of the body instead of down at the side
      pivots[B.LOWER_ARM_R].pivot.rotation.x = 0.9 + dribbleBob * 0.3;
    }
  }

  function move(direction, magnitude, dt) {
    const moveSpeed = 8; // units per second
    const distance = moveSpeed * magnitude * dt;

    // Calculate movement in world space
    const moveX = Math.sin(direction) * distance;
    const moveZ = Math.cos(direction) * distance;

    // Apply movement with bounds checking
    const newX = position.x + moveX;
    const newZ = position.z + moveZ;

    position.x = Math.max(COURT_MIN_X, Math.min(COURT_MAX_X, newX));
    position.z = Math.max(COURT_MIN_Z, Math.min(COURT_MAX_Z, newZ));
  }

  function rotate(yawAngle) {
    rotation = yawAngle;
  }

  function getPosition() {
    return position.clone();
  }

  function getRotation() {
    return rotation;
  }

  function getMesh() {
    return mesh;
  }

  function getShootPosition() {
    // Ball releases from the player's right hand. The rig has no dedicated
    // hand bone - reach past the forearm's own pivot to the hand mesh's
    // known local offset from it (HumanoidFactory: handR sits at local
    // y = -0.28 under the LOWER_ARM_R pivot) instead of the forearm
    // capsule's own mesh center, which sits much closer to the elbow.
    const B = window.SkeletonEngine.HumanoidBone;
    mesh.updateMatrixWorld(true);
    const elbowPivot = humanoid.pivots[B.LOWER_ARM_R].pivot;
    _handWorldPos.set(0, -0.28, 0);
    elbowPivot.localToWorld(_handWorldPos);
    return _handWorldPos.clone();
  }

  function getBallCarryPosition() {
    // Real dribble bounce: the ball travels all the way from hand height
    // down to the floor and back, instead of just swaying near the hand.
    // Horizontal position stays anchored to the body (to the right and
    // slightly forward, roughly where a bent elbow rests) so the bounce
    // doesn't sway forward/back with the arm's own swing.
    //
    // The bounce uses the exact same phase expression that drives the
    // arm's dribbleBob rotation (see update()), so the ball and the hand
    // always move in sync instead of drifting apart from using separate
    // timers/frequencies.
    const dir = getShootDirection();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);

    const dribblePhase = animationTime * 7;
    // (1 - cos(x)) / 2 has the same full period as the arm's sin(x) swing
    // (abs(sin(x)) would fold every half-cycle, bouncing twice as fast)
    const bounceCycle = (1 - Math.cos(dribblePhase)) / 2; // 0 = floor, 1 = hand height
    const groundY = position.y + C.BALL_RADIUS;
    const handY = position.y + DRIBBLE_HEIGHT;

    return new THREE.Vector3(
      position.x + dir.x * DRIBBLE_FORWARD + right.x * DRIBBLE_SIDE,
      groundY + bounceCycle * (handY - groundY),
      position.z + dir.z * DRIBBLE_FORWARD + right.z * DRIBBLE_SIDE
    );
  }

  function getShootDirection() {
    // Direction player is facing
    return new THREE.Vector3(Math.sin(rotation), 0, Math.cos(rotation));
  }

  function getThrowPosition() {
    // Stable release point for a shot, independent of the arm's animated
    // pose. The shooting windup swings the arm/ball through a wide arc, so
    // computing the throw from the live hand bone meant the ball visually
    // collided with the arm on its way out. This uses the player's own
    // position and facing direction instead, so the release point never
    // depends on exactly where the animated bone happens to be.
    const dir = getShootDirection();
    return new THREE.Vector3(
      position.x + dir.x * RELEASE_FORWARD,
      position.y + RELEASE_HEIGHT,
      position.z + dir.z * RELEASE_FORWARD
    );
  }

  return { create };
})();
