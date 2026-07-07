/**
 * Game — Main game controller and orchestrator
 *
 * Brings together:
 * - Graphics context (Three.js via ArcadeEngine)
 * - Input handling
 * - Game state
 * - Scene building
 * - Game loop
 */
window.HoopsGame = (() => {
  'use strict';

  const C = window.HOOPS_CONSTANTS;
  const MATH = window.HOOPS_MATH;
  const State = window.HoopsState;
  const Input = window.HoopsInput;
  const Time = window.HoopsTime;

  // Graphics context
  let gfx = null;
  let renderer, scene, camera, clock;
  let skeletonRuntime = null;

  // Game objects
  let ball = null;
  let player = null;
  let playerController = null;
  let hoop = null;
  let shotController = null;
  let hoopDetector = null;
  let scoreSystem = null;
  let shotSpots = null;

  // UI systems
  let hud = null;
  let shotMeter = null;
  let menu = null;
  let mobileControls = null;

  // Visual effects
  let visualEffects = null;

  // Scene objects
  let court = null;
  let hoopMesh = null;
  let ballMesh = null;
  let netMesh = null;
  let netRotation = { x: 0, z: 0 };
  let isPlayerMoving = false;

  // Animation frame
  let animId = null;
  let running = false;

  /**
   * Initialize the game
   */
  async function init() {
    console.log('Initializing Agee Hoops...');

    // Get canvas
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      throw new Error('Canvas not found');
    }

    // Create graphics context using shared arcade engine
    gfx = ArcadeEngine.create3D({
      canvas: '#gameCanvas',
      pixelRatioCap: 2,
      clearColor: 0x0a0a0f,
      shadows: false,
      toneMapping: 'aces',
      exposure: 1.0,
      fov: 55,
      near: 0.1,
      far: 400,
      fog: { color: 0x0a0a0f, near: 20, far: 100 },
    });

    renderer = gfx.renderer;
    scene = gfx.scene;
    camera = gfx.camera;
    clock = gfx.clock;

    console.log('Graphics context created');

    // Shared humanoid skeleton/physics runtime (used for the player rig)
    skeletonRuntime = await window.SkeletonEngine.create();
    console.log('Skeleton runtime ready');

    // Initialize input
    Input.init(canvas);
    Input.on('angleStart', onAngleStart);
    Input.on('angleRelease', onAngleRelease);
    Input.on('powerStart', onPowerStart);
    Input.on('powerRelease', onPowerRelease);

    // Build scene
    await buildScene();
    console.log('Scene built');

    // Initialize game systems
    initializeGameSystems();
    console.log('Game systems initialized');

    // Initialize UI
    hud = window.HoopsHUD.init();
    shotMeter = window.HoopsShotMeter.init();
    menu = window.HoopsMenu.init({
      onStartGame: startGame,
    });

    // Initialize mobile controls if on mobile (iPadOS Safari reports as
    // "Mac" in the UA string, so it needs the touch-point check too)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
    if (isMobile && window.HoopsMobileControls) {
      mobileControls = window.HoopsMobileControls.init(playerController, shotController, player, camera);
    }

    console.log('UI initialized');

    // Handle window resize
    window.addEventListener('resize', handleResize);

    // Listen for state changes
    State.on('stateChange', handleStateChange);

    // Start game loop
    running = true;
    loop();

    console.log('Agee Hoops ready!');
  }

  /**
   * Build the Three.js scene
   */
  async function buildScene() {
    // Clear scene
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }

    // Create scene components
    window.HoopsSceneBuilder.createLighting(scene);
    window.HoopsSceneBuilder.createGymnasium(scene);
    window.HoopsSceneBuilder.createCourt(scene);
    const { hoop: hoopGroup, ball: ballGroup, net: netGroup } = window.HoopsSceneBuilder.createHoop(scene);

    hoopMesh = hoopGroup;
    ballMesh = ballGroup;
    netMesh = netGroup;

    // Create player
    player = window.HoopsPlayer.create(scene, skeletonRuntime);

    // Initialize camera
    const camPos = C.CAMERA_POSITION;
    camera.position.set(camPos.x, camPos.y, camPos.z);
    camera.lookAt(C.CAMERA_TARGET.x, C.CAMERA_TARGET.y, C.CAMERA_TARGET.z);
  }

  /**
   * Initialize game systems
   */
  function initializeGameSystems() {
    // Ball physics
    ball = window.HoopsBall.create(ballMesh, scene, skeletonRuntime);

    // Hoop detection
    hoopDetector = window.HoopsHoopDetector.init(ball, {
      onBasketMade,
      onRimHit,
      onBackboardHit,
      onNetHit,
    });

    // Player controller for movement
    const canvas = document.getElementById('gameCanvas');
    playerController = window.HoopsPlayerController.init(player, camera, canvas);

    // Shot controller (needs playerController for pitch angle)
    shotController = window.HoopsShotController.init(ball, player, playerController, camera, Input, {
      onShotFired,
    });

    // Score system
    scoreSystem = window.HoopsScoreSystem.init(ball, hoopDetector);

    // Visual effects
    visualEffects = window.HoopsVisualEffects;
    visualEffects.init(scene);

    // Shot spots
    shotSpots = window.HoopsShotSpots.init();
    selectRandomShotSpot();
  }

  /**
   * Select a random shot spot
   */
  function selectRandomShotSpot() {
    const spots = C.SHOT_SPOTS;
    const spot = spots[Math.floor(Math.random() * spots.length)];
    shotSpots.setCurrentSpot(spot);

    // Update HUD
    if (hud) {
      hud.updateShotSpot(spot);
    }
  }

  /**
   * Start the game
   */
  function startGame() {
    console.log('Starting game...');

    State.resetGameData();
    State.setState(State.STATES.PLAYING);

    // Request pointer lock for better mouse control
    if (playerController && playerController.requestPointerLock) {
      playerController.requestPointerLock();
    }

    // Initialize timer
    Time.init(C.GAME_DURATION, onTimeUpdate, onTimeEnd);

    // Reset ball and position at player
    ball.reset();
    if (player) {
      const shootPos = player.getShootPosition();
      ball.position.copy(shootPos);
      ball.mesh.position.copy(shootPos);
    }
    selectRandomShotSpot();

    // Update HUD
    if (hud) {
      hud.show();
    }
  }

  /**
   * Input: Angle start (mouse click)
   */
  function onAngleStart() {
    if (!State.isState(State.STATES.PLAYING)) return;
    if (!shotController) return;

    shotController.startAngle();
  }

  /**
   * Input: Angle release (mouse click release)
   */
  function onAngleRelease() {
    if (!State.isState(State.STATES.PLAYING)) return;
    if (!shotController) return;

    shotController.releaseAngle();
  }

  /**
   * Input: Power start (spacebar down)
   */
  function onPowerStart() {
    if (!State.isState(State.STATES.PLAYING)) return;
    if (!shotController) return;

    shotController.startCharge();
    shotMeter.show();
  }

  /**
   * Input: Power release (spacebar up)
   */
  function onPowerRelease() {
    if (!State.isState(State.STATES.PLAYING)) return;
    if (!shotController) return;

    shotController.releaseShot();
    shotMeter.hide();
  }

  /**
   * Game logic: Shot fired
   */
  function onShotFired() {
    if (!State.isState(State.STATES.PLAYING)) return;

    State.recordShot(false);
    if (hud) {
      hud.updateStats(State.getAllGameData());
    }
  }

  /**
   * Game logic: Basket made
   */
  function onBasketMade(shootingSpot) {
    if (!State.isState(State.STATES.PLAYING)) return;

    const points = shootingSpot.points;
    const streak = State.getCurrentStreak();
    const multiplier = MATH.getMultiplier(streak);
    const finalPoints = Math.round(points * multiplier);

    State.recordShot(true);
    State.addScore(finalPoints);

    // Play feedback
    showSplash(`+${finalPoints}`, 'score');

    // Check for swish
    if (hoopDetector.wasCleanSwish()) {
      showSplash('SWISH!', 'swish');
      State.addScore(1);
      if (visualEffects && ball) {
        visualEffects.playSwish(ball.position);
      }
    }

    // Update HUD
    if (hud) {
      hud.updateStats(State.getAllGameData());
    }

    // Next shot
    setTimeout(() => {
      ball.reset();
      if (player) {
        const shootPos = player.getShootPosition();
        ball.position.copy(shootPos);
        ball.mesh.position.copy(shootPos);
      }
      selectRandomShotSpot();
    }, 500);
  }

  /**
   * Game logic: Ball hit rim
   */
  function onRimHit() {
    if (ball && visualEffects) {
      const rimCenter = C.HOOP_RIM_CENTER;
      const impactPos = ball.position.clone();
      const rimNormal = new THREE.Vector3(0, 1, 0);
      visualEffects.playRimImpact(impactPos, rimNormal);
    }
  }

  /**
   * Game logic: Ball hit backboard
   */
  function onBackboardHit() {
    if (ball && visualEffects) {
      const impactPos = ball.position.clone();
      const backboardNormal = new THREE.Vector3(0, 0, 1);
      visualEffects.playBackboardImpact(impactPos, backboardNormal);
    }
  }

  /**
   * Game logic: Ball hit net
   */
  function onNetHit(forceX, forceZ) {
    if (!netMesh) return;
    netRotation.x += forceZ * 0.02;
    netRotation.z += forceX * 0.02;
  }

  /**
   * Timer: Update callback
   */
  function onTimeUpdate(remaining) {
    if (hud) {
      hud.updateTimer(remaining);
    }
  }

  /**
   * Timer: End of game
   */
  function onTimeEnd() {
    State.finishGame();
    State.setState(State.STATES.GAME_OVER);

    if (menu) {
      menu.showGameOver(State.getAllGameData());
    }
  }

  /**
   * State change handler
   */
  function handleStateChange(prev, next) {
    console.log(`State: ${prev} → ${next}`);

    if (next === State.STATES.PLAYING) {
      if (hud) hud.show();
      if (shotMeter) shotMeter.hide();
      const angleEl = document.getElementById('angleDisplay');
      if (angleEl) angleEl.style.display = 'block';
    } else if (next === State.STATES.GAME_OVER) {
      if (hud) hud.hide();
      if (shotMeter) shotMeter.hide();
      const angleEl = document.getElementById('angleDisplay');
      if (angleEl) angleEl.style.display = 'none';
      Time.stop();
    } else if (next === State.STATES.TITLE) {
      if (menu) menu.showTitle();
      if (hud) hud.hide();
      const angleEl = document.getElementById('angleDisplay');
      if (angleEl) angleEl.style.display = 'none';
    }
  }

  /**
   * Show splash text (score popup)
   */
  function showSplash(text, type = 'score') {
    if (!window.HoopsSplash) return;

    const ballPos = ball.mesh.position;
    const screenPos = new THREE.Vector3(
      ballPos.x,
      ballPos.y,
      ballPos.z
    ).project(camera);

    const width = window.innerWidth;
    const height = window.innerHeight;

    const x = (screenPos.x * 0.5 + 0.5) * width;
    const y = (-screenPos.y * 0.5 + 0.5) * height;

    window.HoopsSplash.show(text, x, y, type);
  }

  /**
   * Handle window resize
   */
  function handleResize() {
    if (gfx && gfx.onResize) {
      gfx.onResize();
    }
  }

  /**
   * Main game loop
   */
  function loop() {
    animId = requestAnimationFrame(loop);

    const dt = Math.min(clock.getDelta(), 0.016); // Cap at 60fps

    // Update systems
    Time.update(dt);

    if (skeletonRuntime) skeletonRuntime.step(dt);

    if (State.isState(State.STATES.PLAYING)) {
      // Update player movement and camera
      if (playerController) playerController.update(dt);

      // Detect if player is moving or shooting
      const isMoving = playerController && playerController.isMoving();
      const isShooting = Input.isSpacebarDown();

      if (player) player.update(dt, isMoving, isShooting);

      // Keep ball in player's hand and handle dribbling
      if (ball && ball.isHeld && player) {
        // Check if player is actually moving (WASD keys)
        const playerIsMoving = playerController && playerController.isMoving();

        if (isShooting) {
          // Charging a shot: bring the ball to a stable point in front of
          // the face instead of tracking the arm through its windup swing,
          // so it never gets caught by the animated bone mid-pose. This is
          // the exact same point the shot releases from, so there's no
          // jump at the moment of the throw either.
          ball.position.copy(player.getThrowPosition());
        } else {
          // Dribbling animation: getBallCarryPosition bounces the ball
          // straight up and down in step with the arm's own swing (both
          // driven by the same phase), so they never drift out of sync.
          ball.position.copy(player.getBallCarryPosition());
        }

        ball.mesh.position.copy(ball.position);
        ball.velocity.set(0, 0, 0);
      }

      // Update physics
      ball.update(dt);

      // Update visual effects
      if (visualEffects) {
        visualEffects.update(dt);
      }

      // Check collisions
      hoopDetector.update();

      // Update shot controller
      shotController.update(dt);

      // Update shot meter display
      if (shotMeter) {
        shotMeter.updateFill(shotController.getChargeRatio());
      }

      // Update net rotation (swing back to rest)
      if (netMesh) {
        netRotation.x *= 0.95;
        netRotation.z *= 0.95;
        netMesh.rotation.x = netRotation.x;
        netMesh.rotation.z = netRotation.z;
      }

      // Update mobile controls
      if (mobileControls) {
        mobileControls.update(dt);
      }

      // Display angle and power during aiming (desktop only)
      if (!mobileControls && shotController) {
        const chargeAngle = shotController.getChargeAngle();
        const angleDisplay = Math.round(chargeAngle * 180 / Math.PI);
        const powerPercent = Math.round(shotController.getChargeRatio() * 100);

        // Update HUD with angle info
        const angleEl = document.getElementById('angleDisplay');
        if (angleEl) {
          angleEl.textContent = `Angle: ${angleDisplay}° | Power: ${powerPercent}%`;
        }
      }
    }

    // Render
    renderer.render(scene, camera);
  }

  /**
   * Destroy the game
   */
  function destroy() {
    running = false;
    if (animId) cancelAnimationFrame(animId);

    if (mobileControls && mobileControls.destroy) {
      mobileControls.destroy();
    }
    if (playerController && playerController.destroy) {
      playerController.destroy();
    }
    Input.destroy();
    window.removeEventListener('resize', handleResize);

    if (gfx && gfx.renderer) {
      gfx.renderer.dispose();
    }
  }

  // Public API
  return {
    init,
    destroy,
    getGraphics() {
      return gfx;
    },
    getScene() {
      return scene;
    },
    getCamera() {
      return camera;
    },
    getBall() {
      return ball;
    },
  };
})();
