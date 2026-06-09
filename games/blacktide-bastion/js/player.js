// player.js — pirate movement along dock, station mounting

const Player = (() => {
  let mesh, bodyMesh, headMesh;

  const state = {
    x: 0,
    speed: 8,           // units/sec — upgradeable
    currentStation: 0,  // index of the station the pirate is nearest
    mounted: false,
    moving: false,
    runTime: 0,
    facing: 1,          // +1 or -1 for left/right direction
  };

  const MOUNT_RADIUS = 1.6; // auto-mount when within this distance

  function init(scene) {
    mesh = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.55, 1.0, 0.32);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2a5a });
    bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 1.05;
    mesh.add(bodyMesh);

    // Coat (slightly wider, darker)
    const coatGeo = new THREE.BoxGeometry(0.64, 0.6, 0.34);
    const coatMat = new THREE.MeshStandardMaterial({ color: 0x0d1a3a });
    const coat = new THREE.Mesh(coatGeo, coatMat);
    coat.position.y = 0.82;
    mesh.add(coat);

    // Head
    const headGeo = new THREE.SphereGeometry(0.28, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd4a07a });
    headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = 1.74;
    mesh.add(headMesh);

    // Pirate hat
    const brimGeo = new THREE.BoxGeometry(0.72, 0.06, 0.52);
    const hatMat  = new THREE.MeshStandardMaterial({ color: 0x0a0808 });
    const brim = new THREE.Mesh(brimGeo, hatMat);
    brim.position.y = 1.98;
    mesh.add(brim);

    const crownGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.34, 8);
    const crown = new THREE.Mesh(crownGeo, hatMat);
    crown.position.y = 2.16;
    mesh.add(crown);

    // Hat feather (orange accent)
    const featherMat = new THREE.MeshStandardMaterial({ color: 0xcc6600 });
    const feather = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), featherMat);
    feather.position.set(0.18, 2.30, 0);
    feather.rotation.z = 0.35;
    mesh.add(feather);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x111820 });
    [-0.14, 0.14].forEach(lx => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.22), legMat);
      leg.position.set(lx, 0.52, 0);
      mesh.add(leg);
    });

    state.x = STATION_X[0];
    mesh.position.set(state.x, 0, 0.5);
    scene.add(mesh);
  }

  function update(dt, inputX) {
    // inputX: -1 = moving left, 0 = stopped, 1 = moving right (from key state)
    if (inputX !== 0) {
      state.facing = inputX;
      state.x += inputX * state.speed * dt;
      state.x = Math.max(-10.5, Math.min(10.5, state.x));
      state.moving = true;
      state.runTime += dt;
    } else {
      state.moving = false;
    }

    // Animate legs and body bob when moving
    if (state.moving) {
      const bob = Math.sin(state.runTime * 8) * 0.04;
      mesh.position.y = bob;
      bodyMesh.rotation.z = Math.sin(state.runTime * 8) * 0.06;
    } else {
      mesh.position.y = 0;
      bodyMesh.rotation.z *= 0.85;
    }

    // Face direction of travel
    mesh.rotation.y = state.facing > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;

    // Sync position
    mesh.position.x = state.x;

    // Check mount: find nearest station within radius
    let bestDist = Infinity;
    let bestIdx  = -1;
    STATION_X.forEach((sx, i) => {
      const d = Math.abs(state.x - sx);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });

    if (bestDist < MOUNT_RADIUS) {
      state.mounted       = true;
      state.currentStation = bestIdx;
      // Face the sea while mounted
      mesh.rotation.y = 0;
    } else {
      state.mounted = false;
    }
  }

  function reset() {
    state.x              = STATION_X[0];
    state.currentStation = 0;
    state.mounted        = false;
    state.moving         = false;
    state.runTime        = 0;
    state.facing         = 1;
    state.speed          = 8;
    if (mesh) mesh.position.set(state.x, 0, 0.5);
  }

  function setVisible(v) {
    if (mesh) mesh.visible = v;
  }

  return { init, update, reset, setVisible, state };
})();
