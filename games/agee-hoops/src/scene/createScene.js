/**
 * Scene Builder — Agee Hoops
 * Creates lighting, court, hoop, and other scene elements
 */
window.HoopsSceneBuilder = (() => {
  'use strict';

  /**
   * Create lighting for the court
   */
  function createLighting(scene) {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Key light (sun-like)
    const directional = new THREE.DirectionalLight(0xffffff, 0.9);
    directional.position.set(5, 8, 5);
    directional.castShadow = true;
    directional.shadow.camera.left = -20;
    directional.shadow.camera.right = 20;
    directional.shadow.camera.top = 20;
    directional.shadow.camera.bottom = -20;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    scene.add(directional);

    // Fill light (soft blue)
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.4);
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    // Hoop rim glow light
    const hoopLight = new THREE.PointLight(0xff6600, 1, 12);
    hoopLight.position.set(0, 3.5, -8);
    scene.add(hoopLight);

    // Backboard light
    const backboardLight = new THREE.PointLight(0xffffcc, 0.6, 10);
    backboardLight.position.set(0, 3.5, -7.5);
    scene.add(backboardLight);
  }

  /**
   * Procedural hardwood texture (tiled maple planks) for the court floor
   */
  function createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#c9944f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Plank seams
    const plankWidth = 32;
    for (let x = 0; x <= canvas.width; x += plankWidth) {
      ctx.strokeStyle = 'rgba(90, 55, 25, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Subtle grain streaks
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const len = 10 + Math.random() * 30;
      ctx.strokeStyle = `rgba(120, 75, 35, ${0.05 + Math.random() * 0.1})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + len);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 7);
    return texture;
  }

  /**
   * Center-court emblem texture
   */
  function createCenterLogoTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(139, 30, 30, 0.4)';
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 215, 0, 0.85)';
    ctx.font = 'bold 110px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AGEE', size / 2, size / 2);

    return new THREE.CanvasTexture(canvas);
  }

  /**
   * A closed rectangular outline drawn flat on the court (for boundary/lane lines)
   */
  function makeRectOutline(xMin, xMax, zMin, zMax, material, y) {
    const pts = [
      xMin, y, zMin,
      xMax, y, zMin,
      xMax, y, zMax,
      xMin, y, zMax,
      xMin, y, zMin,
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    return new THREE.Line(geometry, material);
  }

  /**
   * A flat, solid-colored rectangle (for the painted key)
   */
  function makeRectFill(xMin, xMax, zMin, zMax, material, y) {
    const geometry = new THREE.PlaneGeometry(xMax - xMin, zMax - zMin);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((xMin + xMax) / 2, y, (zMin + zMax) / 2);
    return mesh;
  }

  /**
   * A single straight segment flat on the court (half-court line, etc.)
   */
  function makeStraightLine(x1, z1, x2, z2, material, y) {
    const points = [x1, y, z1, x2, y, z2];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    return new THREE.Line(geometry, material);
  }

  /**
   * A flat circle outline (center circle, free-throw circle)
   */
  function makeCircleLine(cx, cz, radius, material, y) {
    const segments = 64;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(cx + Math.cos(angle) * radius, y, cz + Math.sin(angle) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    return new THREE.Line(geometry, material);
  }

  /**
   * An arc centered on the hoop with two straight "tabs" running down to the
   * baseline at +/-tabX, used for both the three-point line and could be
   * reused for any other baseline-anchored arc.
   */
  function makeArcWithBaselineTabs(hoopX, hoopZ, radius, tabX, baselineZ, material, y) {
    const dz = Math.sqrt(Math.max(radius * radius - tabX * tabX, 0));
    const tangentZ = hoopZ + dz;
    const rightAngle = Math.atan2(dz, tabX);
    const leftAngle = Math.atan2(dz, -tabX);
    const segments = 48;

    const points = [];
    points.push(-tabX, y, baselineZ);
    points.push(-tabX, y, tangentZ);
    for (let i = 0; i <= segments; i++) {
      const t = leftAngle + (rightAngle - leftAngle) * (i / segments);
      points.push(hoopX + Math.cos(t) * radius, y, hoopZ + Math.sin(t) * radius);
    }
    points.push(tabX, y, tangentZ);
    points.push(tabX, y, baselineZ);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    return new THREE.Line(geometry, material);
  }

  /**
   * Procedural gym wall texture: paneling with a painted accent stripe
   */
  function createWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#d8d2c2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#8b1e1e';
    ctx.fillRect(0, canvas.height * 0.42, canvas.width, canvas.height * 0.09);
    ctx.fillStyle = '#1c2b4a';
    ctx.fillRect(0, canvas.height * 0.51, canvas.width, canvas.height * 0.035);

    const panelWidth = 64;
    for (let x = 0; x <= canvas.width; x += panelWidth) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 1.5);
    return texture;
  }

  /**
   * Create the gymnasium shell (walls, ceiling, overhead lights, bleachers)
   * enclosing the court
   */
  function createGymnasium(scene) {
    const group = new THREE.Group();

    const hallHalfX = 13;
    const hallHalfZ = 16;
    const wallHeight = 9;

    // Surrounding floor filling the gap between the court's hardwood and
    // the walls (sits just below the court floor to avoid z-fighting)
    const surroundFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(hallHalfX * 2, hallHalfZ * 2),
      new THREE.MeshLambertMaterial({ color: 0x9a958c })
    );
    surroundFloor.rotation.x = -Math.PI / 2;
    surroundFloor.position.y = -0.01;
    surroundFloor.receiveShadow = true;
    group.add(surroundFloor);

    const wallMaterial = new THREE.MeshLambertMaterial({ map: createWallTexture() });

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(hallHalfX * 2, wallHeight), wallMaterial);
    backWall.position.set(0, wallHeight / 2, -hallHalfZ);
    group.add(backWall);

    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(hallHalfX * 2, wallHeight), wallMaterial);
    frontWall.position.set(0, wallHeight / 2, hallHalfZ);
    frontWall.rotation.y = Math.PI;
    group.add(frontWall);

    const sideWallGeo = new THREE.PlaneGeometry(hallHalfZ * 2, wallHeight);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMaterial);
    leftWall.position.set(-hallHalfX, wallHeight / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    group.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeo, wallMaterial);
    rightWall.position.set(hallHalfX, wallHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    group.add(rightWall);

    // Ceiling
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(hallHalfX * 2, hallHalfZ * 2),
      new THREE.MeshLambertMaterial({ color: 0x2c2c34 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, wallHeight, 0);
    group.add(ceiling);

    // Overhead light fixtures
    const fixtureMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4d6 });
    const fixturePositions = [
      { x: -4, z: -6 }, { x: 4, z: -6 },
      { x: -4, z: 4 }, { x: 4, z: 4 },
    ];
    fixturePositions.forEach(({ x, z }) => {
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 1), fixtureMaterial);
      fixture.position.set(x, wallHeight - 0.15, z);
      group.add(fixture);

      const light = new THREE.PointLight(0xfff4d6, 0.4, 14);
      light.position.set(x, wallHeight - 0.6, z);
      group.add(light);
    });

    // Bleachers along both long sides (simple ascending stepped rows)
    const bleacherMaterial = new THREE.MeshLambertMaterial({ color: 0x5a1f1f });
    const rows = 4;
    const rowDepth = 0.9;
    const rowHeight = 0.55;
    const bleacherLength = 26;
    const courtHalfWidth = 8;

    [-1, 1].forEach((side) => {
      for (let i = 0; i < rows; i++) {
        const height = rowHeight * (i + 1);
        const rowGeo = new THREE.BoxGeometry(rowDepth, height, bleacherLength);
        const row = new THREE.Mesh(rowGeo, bleacherMaterial);
        row.position.set(
          side * (courtHalfWidth + 0.5 + i * rowDepth),
          height / 2,
          0
        );
        row.castShadow = true;
        row.receiveShadow = true;
        group.add(row);
      }
    });

    scene.add(group);
    return { group };
  }

  /**
   * Create the basketball court
   */
  function createCourt(scene) {
    const C = window.HOOPS_CONSTANTS;
    const courtWidth = 16;
    const courtLength = 28;
    const halfWidth = courtWidth / 2;
    const baselineZ = -courtLength / 2;

    // Hardwood floor
    const floorGeometry = new THREE.PlaneGeometry(courtWidth, courtLength);
    const floorMaterial = new THREE.MeshLambertMaterial({ map: createWoodTexture() });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // Painted key (the lane) in front of the hoop
    const laneHalfWidth = 2.45;
    const freeThrowZ = C.HOOP_RIM_CENTER.z + 4;
    const paintMaterial = new THREE.MeshLambertMaterial({ color: 0x8b1e1e });
    const paint = makeRectFill(-laneHalfWidth, laneHalfWidth, baselineZ, freeThrowZ, paintMaterial, 0.004);
    scene.add(paint);

    // Center court emblem
    const logoGeometry = new THREE.CircleGeometry(1.75, 48);
    const logoMaterial = new THREE.MeshBasicMaterial({ map: createCenterLogoTexture(), transparent: true });
    const logo = new THREE.Mesh(logoGeometry, logoMaterial);
    logo.rotation.x = -Math.PI / 2;
    logo.position.y = 0.005;
    scene.add(logo);

    // All court line markings share one group
    const lineGroup = new THREE.Group();
    const linesMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const lineY = 0.015;

    // Court boundary
    lineGroup.add(makeRectOutline(-halfWidth, halfWidth, -courtLength / 2, courtLength / 2, linesMaterial, lineY));

    // Half-court line
    lineGroup.add(makeStraightLine(-halfWidth, 0, halfWidth, 0, linesMaterial, lineY));

    // Center circle
    lineGroup.add(makeCircleLine(0, 0, 1.8, linesMaterial, lineY));

    // Lane / key outline
    lineGroup.add(makeRectOutline(-laneHalfWidth, laneHalfWidth, baselineZ, freeThrowZ, linesMaterial, lineY));

    // Free-throw circle
    lineGroup.add(makeCircleLine(0, freeThrowZ, 1.8, linesMaterial, lineY));

    // Three-point line
    lineGroup.add(makeArcWithBaselineTabs(
      C.HOOP_RIM_CENTER.x, C.HOOP_RIM_CENTER.z, 6.75, 6.6, baselineZ, linesMaterial, lineY
    ));

    scene.add(lineGroup);

    return { floor, lineGroup };
  }

  /**
   * Create the hoop assembly (rim, backboard, net)
   */
  function createHoop(scene) {
    const C = window.HOOPS_CONSTANTS;
    const group = new THREE.Group();

    // Ceiling-mounted support: the hoop hangs from the gym ceiling instead
    // of a floor-standing pole (matching most indoor gyms), and terminates
    // right at the backboard's top edge - not through its middle - staying
    // behind the backboard rather than overlapping the rim's front face.
    const ceilingY = 9; // matches the gymnasium's wall/ceiling height
    const backboardTopY = C.HOOP_RIM_CENTER.y + 0.6 + 0.5;
    const mountZ = C.HOOP_BACKBOARD_Z - 0.35;
    const poleRadius = 0.12;
    const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });

    const dropLength = ceilingY - backboardTopY;
    const ceilingSupport = new THREE.Mesh(
      new THREE.CylinderGeometry(poleRadius, poleRadius, dropLength, 16),
      poleMaterial
    );
    ceilingSupport.position.set(0, backboardTopY + dropLength / 2, mountZ);
    ceilingSupport.castShadow = true;
    group.add(ceilingSupport);

    // Horizontal arm connecting the ceiling drop to the back of the backboard
    const armLength = Math.abs(mountZ - C.HOOP_BACKBOARD_Z) + 0.05;
    const mountArm = new THREE.Mesh(
      new THREE.CylinderGeometry(poleRadius, poleRadius, armLength, 16),
      poleMaterial
    );
    mountArm.rotation.x = Math.PI / 2;
    mountArm.position.set(0, backboardTopY, (mountZ + C.HOOP_BACKBOARD_Z) / 2);
    mountArm.castShadow = true;
    group.add(mountArm);

    // Backboard frame (dark support structure behind the glass)
    const backboardFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.15, 0.03),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    backboardFrame.position.set(0, C.HOOP_RIM_CENTER.y + 0.6, C.HOOP_BACKBOARD_Z - 0.025);
    backboardFrame.castShadow = true;
    group.add(backboardFrame);

    // Backboard (glass)
    const backboard = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 1.0, 0.05),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
    );
    backboard.position.set(0, C.HOOP_RIM_CENTER.y + 0.6, C.HOOP_BACKBOARD_Z);
    backboard.castShadow = true;
    group.add(backboard);

    // Shooter's square painted on the backboard, sitting just above the rim
    const squareHalfWidth = 0.3;
    const squareBottomY = C.HOOP_RIM_CENTER.y;
    const squareTopY = squareBottomY + 0.45;
    const squareZ = C.HOOP_BACKBOARD_Z + 0.03;
    const squarePoints = [
      -squareHalfWidth, squareBottomY, squareZ,
      squareHalfWidth, squareBottomY, squareZ,
      squareHalfWidth, squareTopY, squareZ,
      -squareHalfWidth, squareTopY, squareZ,
      -squareHalfWidth, squareBottomY, squareZ,
    ];
    const squareGeometry = new THREE.BufferGeometry();
    squareGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(squarePoints), 3));
    const shooterSquare = new THREE.Line(
      squareGeometry,
      new THREE.LineBasicMaterial({ color: 0xff3333 })
    );
    group.add(shooterSquare);

    // Rim (torus - the actual hoop)
    const rimGeometry = new THREE.TorusGeometry(
      C.HOOP_RIM_RADIUS,
      C.HOOP_RIM_TUBE_RADIUS,
      16,
      32
    );
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      metalness: 0.85,
      roughness: 0.15,
      emissive: 0xff6600,
      emissiveIntensity: 0.6,
    });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.position.copy(C.HOOP_RIM_CENTER);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    group.add(rim);

    // Simple net (visual only - doesn't affect physics)
    const netGeometry = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(C.HOOP_RIM_RADIUS * 0.9, 0),
        new THREE.Vector2(C.HOOP_RIM_RADIUS * 0.85, -0.5),
        new THREE.Vector2(C.HOOP_RIM_RADIUS * 0.75, -0.8),
        new THREE.Vector2(C.HOOP_RIM_RADIUS * 0.6, -1),
        new THREE.Vector2(0.1, -1.1),
      ],
      32
    );
    const netMaterial = new THREE.MeshLambertMaterial({
      color: 0xf5f5f0,
      emissive: 0x333333,
      emissiveIntensity: 0.2,
      wireframe: true,
    });
    const net = new THREE.Mesh(netGeometry, netMaterial);
    net.position.copy(C.HOOP_RIM_CENTER);
    net.position.z -= 0.05;
    net.scale.z = -1;
    group.add(net);

    scene.add(group);

    // Basketball
    const ballGeometry = new THREE.SphereGeometry(C.BALL_RADIUS, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      metalness: 0.1,
      roughness: 0.6,
    });
    const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
    ballMesh.castShadow = true;
    ballMesh.position.set(0, 2.2, 6);
    scene.add(ballMesh);

    return {
      hoop: group,
      ball: ballMesh,
      rim,
      backboard,
      net,
    };
  }

  return {
    createLighting,
    createGymnasium,
    createCourt,
    createHoop,
  };
})();
