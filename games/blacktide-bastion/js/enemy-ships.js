// enemy-ships.js — ship spawning, movement, mesh building, HP tracking

const EnemyShips = (() => {
  let _scene;
  const active = new Set();
  let _time = 0;

  // Re-usable hit-sphere for collision
  const _hitSphere = new THREE.Sphere();

  function init(scene) {
    _scene = scene;
  }

  // Build a ship mesh group for the given archetype def
  function _buildMesh(def) {
    const g = new THREE.Group();

    const hullMat = new THREE.MeshStandardMaterial({ color: def.hullColor, roughness: 0.88 });
    const sailMat = new THREE.MeshStandardMaterial({ color: def.sailColor, roughness: 0.82 });
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 0.9 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x3a2810, roughness: 0.9 });

    // Hull
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(def.width, def.height, def.depth),
      hullMat
    );
    hull.position.y = def.height * 0.5;
    g.add(hull);

    // Deck
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(def.width * 0.85, 0.12, def.depth * 0.75),
      deckMat
    );
    deck.position.y = def.height + 0.06;
    g.add(deck);

    // Mast
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, def.mastHeight, 7),
      mastMat
    );
    mast.position.y = def.height + def.mastHeight * 0.5;
    g.add(mast);

    // Main sail
    const sail = new THREE.Mesh(
      new THREE.BoxGeometry(def.width * 0.82, def.mastHeight * 0.62, 0.06),
      sailMat
    );
    sail.position.y = def.height + def.mastHeight * 0.62;
    sail.position.z = -0.15;
    g.add(sail);

    // Bowsprit (front spar)
    const bowsprit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, def.depth * 0.4, 6),
      mastMat
    );
    bowsprit.rotation.x = -Math.PI * 0.38;
    bowsprit.position.set(0, def.height + def.mastHeight * 0.18, def.depth * 0.42);
    g.add(bowsprit);

    // HP bar (shown above ship)
    const hpBgMat  = new THREE.MeshBasicMaterial({ color: 0x220000 });
    const hpFillMat = new THREE.MeshBasicMaterial({ color: 0x44cc44 });
    const hpBg    = new THREE.Mesh(new THREE.BoxGeometry(def.width * 0.9, 0.12, 0.06), hpBgMat);
    const hpFill  = new THREE.Mesh(new THREE.BoxGeometry(def.width * 0.9, 0.12, 0.06), hpFillMat);
    hpBg.position.y   = def.height + def.mastHeight + 0.5;
    hpFill.position.y = def.height + def.mastHeight + 0.5;
    hpFill.position.z = 0.04;
    g.add(hpBg);
    g.add(hpFill);

    g.traverse(child => {
      if (child.isMesh) {
        child.castShadow    = true;
        child.receiveShadow = true;
      }
    });

    return { group: g, hpFill, fullWidth: def.width * 0.9 };
  }

  function spawn(archetype, lane) {
    const def     = SHIP_DEF(archetype);
    const laneX   = LANE_X[lane];
    const { group, hpFill, fullWidth } = _buildMesh(def);

    // Start off-screen on the sea
    const spawnZ  = 58 + Math.random() * 10;
    group.position.set(laneX, 0, spawnZ);

    _scene.add(group);

    const ship = {
      mesh: group,
      archetype,
      def,
      lane,
      laneX,
      hull: def.hull,
      maxHull: def.hull,
      speed: def.speed * (0.9 + Math.random() * 0.2),
      age: Math.random() * 100,
      alive: true,
      landed: false,
      hpFill,
      hpFullWidth: fullWidth,
      slowTimer: 0,       // chain shot slow
      slowFactor: 1.0,
      shooting: false,
      shootTimer: 0,
    };

    active.add(ship);
    return ship;
  }

  // Returns current def — allows cannon upgrades to mutate at runtime
  function SHIP_DEF(archetype) {
    return SHIP_DEFS[archetype];
  }

  function update(dt, onEnemyShot) {
    _time += dt;

    for (const ship of active) {
      if (!ship.alive) continue;

      // Slow timer
      if (ship.slowTimer > 0) {
        ship.slowTimer -= dt;
        if (ship.slowTimer <= 0) ship.slowFactor = 1.0;
      }

      const effectiveSpeed = ship.speed * ship.slowFactor;

      // Shooting ships stop and fire once in range
      if (ship.def.canShoot && ship.mesh.position.z <= ship.def.shootRange) {
        ship.mesh.position.z = ship.def.shootRange;
        ship.shooting = true;
        ship.shootTimer -= dt;
        if (ship.shootTimer <= 0) {
          ship.shootTimer = 1 / ship.def.shootRate;
          if (onEnemyShot) onEnemyShot(ship.mesh.position.clone(), ship.def.shotDamage);
        }
      } else {
        // Advance toward shore
        ship.mesh.position.z -= effectiveSpeed * dt;
      }

      // Zig-zag for sloops
      if (ship.def.zigzag) {
        ship.mesh.position.x = ship.laneX +
          Math.sin(ship.age * ship.def.zigzagFreq) * ship.def.zigzagAmp;
      }

      // Bob on the water
      ship.mesh.position.y = Math.sin(ship.age * 1.1) * 0.08;
      ship.age += dt;

      // HP bar scale
      const pct = Math.max(0, ship.hull / ship.maxHull);
      ship.hpFill.scale.x = pct;
      ship.hpFill.position.x = ship.hpFullWidth * (pct - 1) * 0.5;
      ship.hpFill.material.color.setHex(pct > 0.5 ? 0x44cc44 : (pct > 0.25 ? 0xddaa00 : 0xcc2200));

      // Face direction of travel (ships come toward camera, so face -Z)
      ship.mesh.rotation.y = Math.PI;
    }
  }

  function getHitCenter(ship) {
    const p = ship.mesh.position;
    return new THREE.Vector3(p.x, p.y + ship.def.height * 0.5, p.z);
  }

  function damageShip(ship, amount) {
    ship.hull -= amount;
    return ship.hull <= 0;
  }

  function removeShip(ship) {
    ship.alive = false;
    _scene.remove(ship.mesh);
    active.delete(ship);
  }

  function slowShip(ship, factor, duration) {
    ship.slowFactor = factor;
    ship.slowTimer  = duration;
  }

  function clear() {
    for (const ship of [...active]) removeShip(ship);
  }

  return { init, spawn, update, getHitCenter, damageShip, removeShip, slowShip, clear, active };
})();
