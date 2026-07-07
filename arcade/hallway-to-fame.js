/**
 * HallwayToFame — Corridor connecting main arcade to Hall of Fame room
 */
window.HallwayToFame = (() => {
  'use strict';

  function buildHallway(scene) {
    // Hallway connects arcade (x=-15) to Hall of Fame room (x=-27)
    // Aligned with arcade back wall at z=-15
    const startX = -15.2;   // Right at arcade opening edge
    const endX = -22.5;
    const hallZ = -13.4;    // Centered between z=-15 (arcade back wall) and z=-11.8
    const hallWidth = 3.2;
    const hallHeight = 8.8;
    const hallLength = Math.abs(endX - startX);
    const centerX = (startX + endX) / 2;

    // Remove south wall (will align with arcade back wall at z=-15)
    const skipSouthWall = true;

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(hallLength, hallWidth),
      new THREE.MeshLambertMaterial({ color: 0x0d0a1e })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(centerX, 0, hallZ);
    scene.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(hallLength, hallWidth),
      new THREE.MeshLambertMaterial({ color: 0x0a0515 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(centerX, hallHeight, hallZ);
    scene.add(ceil);

    // South wall: use arcade back wall (z=-15) - no separate wall needed
    // North wall only (runs east-west along the hallway)
    const northWall = new THREE.Mesh(
      new THREE.PlaneGeometry(hallLength, hallHeight),
      new THREE.MeshLambertMaterial({ color: 0x0f0c20 })
    );
    northWall.position.set(centerX, hallHeight / 2, hallZ + hallWidth / 2);
    scene.add(northWall);

    // Cyan neon strips
    const cyanMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });

    // Baseboard
    const baseboard = new THREE.Mesh(
      new THREE.BoxGeometry(hallLength, 0.1, 0.1),
      cyanMat.clone()
    );
    baseboard.position.set(centerX, 0.05, hallZ);
    scene.add(baseboard);

    // Mid-wall accent
    const midwall = new THREE.Mesh(
      new THREE.BoxGeometry(hallLength, 0.08, 0.08),
      cyanMat.clone()
    );
    midwall.position.set(centerX, 4.5, hallZ);
    scene.add(midwall);

    // Ceiling trim
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(hallLength, 0.1, 0.1),
      cyanMat.clone()
    );
    ceiling.position.set(centerX, hallHeight - 0.05, hallZ);
    scene.add(ceiling);

    // Floor glow
    const floorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(hallLength - 0.3, hallWidth - 0.3),
      new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.15,
        depthWrite: false
      })
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.set(centerX, 0.02, hallZ);
    scene.add(floorGlow);

    // Entrance pillars at wall corners (cyan)
    const pillarGeo = new THREE.BoxGeometry(0.3, hallHeight - 1, 0.3);
    const cyanPillarMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });

    // South entrance pillar (at arcade back wall z=-15)
    const entrancePillarS = new THREE.Mesh(pillarGeo, cyanPillarMat.clone());
    entrancePillarS.position.set(startX, hallHeight / 2, -15);
    scene.add(entrancePillarS);

    // North entrance pillar (at north hallway wall)
    const entrancePillarN = new THREE.Mesh(pillarGeo, cyanPillarMat.clone());
    entrancePillarN.position.set(startX, hallHeight / 2, hallZ + hallWidth / 2);
    scene.add(entrancePillarN);

    // Exit pillars at far end (magenta)
    const magentaPillarMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });

    const exitPillarS = new THREE.Mesh(pillarGeo, magentaPillarMat.clone());
    exitPillarS.position.set(endX, hallHeight / 2, -15);
    scene.add(exitPillarS);

    const exitPillarN = new THREE.Mesh(pillarGeo, magentaPillarMat.clone());
    exitPillarN.position.set(endX, hallHeight / 2, hallZ + hallWidth / 2);
    scene.add(exitPillarN);

    // Lighting
    const entranceLight = new THREE.PointLight(0x00e5ff, 2.5, 14);
    entranceLight.position.set(startX, 5.5, hallZ);
    scene.add(entranceLight);

    const midLight = new THREE.PointLight(0x00ccff, 2, 16);
    midLight.position.set(centerX, 5.5, hallZ);
    scene.add(midLight);

    const exitLight = new THREE.PointLight(0xff00ff, 2.5, 14);
    exitLight.position.set(endX, 5.5, hallZ);
    scene.add(exitLight);
  }

  return { buildHallway };
})();
