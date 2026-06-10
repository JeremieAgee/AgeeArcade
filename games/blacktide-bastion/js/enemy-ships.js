// enemy-ships.js — ship spawning, movement, realistic mesh building, HP tracking
//
// Ships are built once per archetype as a template (curved hull, masts, sails,
// rigging, flag) and cloned per spawn so geometry/materials are shared.

const EnemyShips = (() => {
  let _scene;
  const active = new Set();
  const _sinking = new Set();
  let _time = 0;

  const _templates = {};

  function init(scene) {
    _scene = scene;
  }

  // ── HULL SHAPE FUNCTIONS ──────────────────────────────────────
  // t: 0 = stern, 1 = bow

  function _halfWidth(t, beam) {
    let hw;
    const bowStart = 0.60;
    if (t >= bowStart) {
      const k = (t - bowStart) / (1 - bowStart);
      hw = Math.pow(Math.cos(k * Math.PI / 2), 0.85);
    } else {
      const k = t / bowStart;
      hw = 0.80 + 0.20 * Math.sin(k * Math.PI / 2);
    }
    return Math.max(0.035, hw) * beam * 0.5;
  }

  function _railY(t, height) {
    // Sheer line — dips amidships, rises at bow and especially the stern
    const d = (t - 0.55) / 0.55;
    let y = height * (1.0 + 0.30 * d * d);
    if (t < 0.18) y += height * 0.18 * (0.18 - t) / 0.18;
    return y;
  }

  function _keelY(t, height) {
    let rise = 0;
    if (t > 0.78) rise = (t - 0.78) / 0.22 * 0.55;  // bow stem rises
    if (t < 0.12) rise = (0.12 - t) / 0.12 * 0.35;  // stern post rises
    return -height * 0.50 * (1 - rise);
  }

  // ── HULL GEOMETRY ─────────────────────────────────────────────
  function _buildHullGeometry(length, beam, height) {
    const SEG_L = 16, SEG_S = 10;
    const positions = [], uvs = [], indices = [];

    for (let i = 0; i <= SEG_L; i++) {
      const t = i / SEG_L;
      const z = (t - 0.5) * length;
      const hw = _halfWidth(t, beam);
      const rY = _railY(t, height);
      const kY = _keelY(t, height);

      for (let j = 0; j <= SEG_S; j++) {
        const s = -1 + 2 * (j / SEG_S);               // -1 port rail … +1 stbd rail
        const x = hw * Math.sin(s * Math.PI / 2);
        const y = rY - (rY - kY) * Math.pow(Math.cos(s * Math.PI / 2), 0.75);
        positions.push(x, y, z);
        uvs.push(t, j / SEG_S);
      }
    }

    const row = SEG_S + 1;
    for (let i = 0; i < SEG_L; i++) {
      for (let j = 0; j < SEG_S; j++) {
        const a = i * row + j, b = a + row;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }

    // Transom cap (flat stern) — fan from a center point
    const cIdx = positions.length / 3;
    positions.push(0, (_railY(0, height) + _keelY(0, height)) * 0.5, -length / 2);
    uvs.push(0, 0.5);
    for (let j = 0; j < SEG_S; j++) {
      indices.push(cIdx, j + 1, j);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // ── DECK GEOMETRY ─────────────────────────────────────────────
  function _buildDeckGeometry(length, beam, height) {
    const SEG_L = 14;
    const positions = [], uvs = [], indices = [];
    for (let i = 0; i <= SEG_L; i++) {
      const t = i / SEG_L;
      const z = (t - 0.5) * length;
      const hw = _halfWidth(t, beam) * 0.94;
      const y = _railY(t, height) - height * 0.16;
      positions.push(-hw, y, z, hw, y, z);
      uvs.push(0, t * 4, 1, t * 4);
    }
    for (let i = 0; i < SEG_L; i++) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // ── RAIL CAP (tube along the sheer line) ──────────────────────
  function _buildRail(length, beam, height, scale) {
    const pts = [];
    const N = 12;
    // starboard stern → bow
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push(new THREE.Vector3(_halfWidth(t, beam), _railY(t, height) + 0.02, (t - 0.5) * length));
    }
    // bow → port stern
    for (let i = N - 1; i >= 0; i--) {
      const t = i / N;
      pts.push(new THREE.Vector3(-_halfWidth(t, beam), _railY(t, height) + 0.02, (t - 0.5) * length));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 56, 0.035 * scale, 5, false);
  }

  // ── BILLOWED SQUARE SAIL ──────────────────────────────────────
  function _buildSailGeometry(w, h, bulge) {
    const geo = new THREE.PlaneGeometry(w, h, 8, 6);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / w + 0.5;
      const v = pos.getY(i) / h + 0.5;
      // belly: fullest low-center, pinned at the yard (top) and corners
      const belly = Math.sin(u * Math.PI) * (0.35 + 0.65 * (1 - v));
      pos.setZ(i, belly * bulge);
      // foot of the sail curves up slightly at center
      if (v < 0.2) pos.setY(i, pos.getY(i) + Math.sin(u * Math.PI) * h * 0.05);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // ── TEMPLATE BUILDER ──────────────────────────────────────────
  function _buildTemplate(archetype, def) {
    const vis    = def.visual || {};
    const length = def.depth * 1.45;
    const beam   = def.width;
    const height = def.height;
    const scale  = Math.max(0.8, beam / 2.6);

    const g = new THREE.Group();

    // Shared materials
    const hullMat = new THREE.MeshStandardMaterial({
      map: GameTextures.hull(def.hullColor, vis.gunports || 0, !!vis.goldTrim),
      roughness: 0.85,
      side: THREE.DoubleSide,   // inner bulwark wall is visible from above
    });
    const deckMat = new THREE.MeshStandardMaterial({
      map: GameTextures.wood(0x7a5a32),
      roughness: 0.92,
    });
    const sailMat = new THREE.MeshStandardMaterial({
      map: GameTextures.sail(),
      color: def.sailColor,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const mastMat  = new THREE.MeshStandardMaterial({ color: 0x35230e, roughness: 0.9 });
    const trimMat  = new THREE.MeshStandardMaterial({ color: 0x241608, roughness: 0.88 });
    const ropeMat  = new THREE.LineBasicMaterial({ color: 0x191210, transparent: true, opacity: 0.85 });

    // Hull + deck + rail
    const hull = new THREE.Mesh(_buildHullGeometry(length, beam, height), hullMat);
    g.add(hull);
    const deck = new THREE.Mesh(_buildDeckGeometry(length, beam, height), deckMat);
    g.add(deck);
    const rail = new THREE.Mesh(_buildRail(length, beam, height, scale), trimMat);
    g.add(rail);

    // Keel + rudder
    const keel = new THREE.Mesh(new THREE.BoxGeometry(0.07 * scale, height * 0.22, length * 0.62), trimMat);
    keel.position.y = -height * 0.45;
    g.add(keel);
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.06 * scale, height * 0.6, 0.3 * scale), trimMat);
    rudder.position.set(0, -height * 0.15, -length / 2 - 0.1 * scale);
    g.add(rudder);

    // Stern castle (raised cabin) on brigs and galleons
    const sternRailY = _railY(0.1, height);
    if (vis.sternCastle) {
      for (let tier = 0; tier < vis.sternCastle; tier++) {
        const cw = beam * (0.74 - tier * 0.12);
        const ch = height * 0.55;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, length * 0.20), deckMat);
        cabin.position.set(0, sternRailY + ch * (0.5 + tier), -length * 0.385);
        g.add(cabin);
      }
      // Stern windows — warm emissive strip on the transom
      const winMat = new THREE.MeshStandardMaterial({
        color: 0x664411, emissive: 0xffaa33, emissiveIntensity: 0.85,
      });
      for (let w = -1; w <= 1; w++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * scale, 0.12 * scale), winMat);
        win.position.set(w * 0.26 * beam, sternRailY + height * 0.45, -length * 0.487);
        win.rotation.y = Math.PI;
        g.add(win);
      }
      // Stern lantern
      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.09 * scale, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xffc866, emissive: 0xff9922, emissiveIntensity: 1.2 })
      );
      lantern.position.set(0, sternRailY + height * 0.55 * vis.sternCastle + 0.3 * scale, -length * 0.46);
      g.add(lantern);
    }

    // Bowsprit
    const bowY = _railY(1, height);
    const spritLen = length * 0.38;
    const bowsprit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035 * scale, 0.055 * scale, spritLen, 6), mastMat
    );
    bowsprit.rotation.x = -Math.PI * 0.42;
    bowsprit.position.set(0, bowY + spritLen * 0.12, length / 2 + spritLen * 0.42);
    g.add(bowsprit);
    const spritTip = new THREE.Vector3(0, bowY + spritLen * 0.30, length / 2 + spritLen * 0.85);

    // ── MASTS, YARDS, SAILS ─────────────────────────────────────
    const mastCount = vis.masts || 1;
    const mastTs    = mastCount === 1 ? [0.52]
                    : mastCount === 2 ? [0.66, 0.34]
                    :                   [0.70, 0.45, 0.20];
    const mastTops = [];
    const riggingPts = [];

    mastTs.forEach((mt, mi) => {
      const isMain  = mi === (mastCount > 1 ? 1 : 0);
      const mz      = (mt - 0.5) * length;
      const mh      = def.mastHeight * (isMain ? 1.0 : (mi === mastCount - 1 ? 0.8 : 0.9));
      const deckY   = _railY(mt, height) - height * 0.16;

      // Lower mast + topmast
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045 * scale, 0.075 * scale, mh, 7), mastMat
      );
      mast.position.set(0, deckY + mh * 0.5, mz);
      g.add(mast);

      const topmast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022 * scale, 0.04 * scale, mh * 0.45, 6), mastMat
      );
      topmast.position.set(0, deckY + mh + mh * 0.16, mz);
      g.add(topmast);

      const topY = deckY + mh + mh * 0.38;
      mastTops.push(new THREE.Vector3(0, topY, mz));

      // Crow's nest on the main mast
      if (isMain) {
        const nest = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14 * scale, 0.10 * scale, 0.16 * scale, 8, 1, true),
          trimMat
        );
        nest.position.set(0, deckY + mh * 0.98, mz);
        g.add(nest);
      }

      // Square sails: main course + topsail (topsail on bigger ships)
      const tiers = (def.depth > 4.5) ? 2 : (isMain ? 2 : 1);
      for (let tier = 0; tier < tiers; tier++) {
        const sw = beam * (1.45 - tier * 0.35) * (isMain ? 1.0 : 0.85);
        const sh = mh * (tier === 0 ? 0.42 : 0.28);
        const yardY = deckY + mh * (tier === 0 ? 0.78 : 1.12);

        // Yard (horizontal spar)
        const yard = new THREE.Mesh(
          new THREE.CylinderGeometry(0.028 * scale, 0.028 * scale, sw * 1.08, 6), mastMat
        );
        yard.rotation.z = Math.PI / 2;
        yard.position.set(0, yardY, mz);
        g.add(yard);

        // Billowed sail hanging from the yard
        const sail = new THREE.Mesh(_buildSailGeometry(sw, sh, sw * 0.22), sailMat);
        sail.position.set(0, yardY - sh * 0.5, mz + 0.02);
        g.add(sail);
      }
    });

    // Jib — triangular staysail from foremast top to bowsprit
    // (mastTs is ordered bow-most first, so the foremast is index 0)
    const foreTop = mastTops[0].clone();
    const jibShape = new THREE.Shape();
    jibShape.moveTo(0, 0);
    jibShape.lineTo(spritTip.z - foreTop.z, spritTip.y - foreTop.y);
    jibShape.lineTo(spritTip.z - foreTop.z, (spritTip.y - foreTop.y) * 0.25);
    jibShape.lineTo(0, 0);
    const jibGeo = new THREE.ShapeGeometry(jibShape);
    const jib = new THREE.Mesh(jibGeo, sailMat);
    jib.position.copy(foreTop);
    jib.rotation.y = -Math.PI / 2;
    jib.rotation.x = 0;
    g.add(jib);

    // ── RIGGING (one LineSegments draw call) ────────────────────
    const railEdge = (t, side) => new THREE.Vector3(
      side * _halfWidth(t, beam) * 0.95, _railY(t, height), (t - 0.5) * length
    );
    // Forestay + stays between masts + backstays to the stern rail
    riggingPts.push(mastTops[0], spritTip);
    for (let m = 0; m < mastTops.length - 1; m++) {
      riggingPts.push(mastTops[m], mastTops[m + 1]);
    }
    const aftTop = mastTops[mastTops.length - 1];
    riggingPts.push(aftTop, railEdge(0.04, 1));
    riggingPts.push(aftTop, railEdge(0.04, -1));
    // Shrouds — 3 per side per mast
    mastTs.forEach((mt, mi) => {
      const top = mastTops[mi].clone();
      top.y -= def.mastHeight * 0.32;
      for (const side of [-1, 1]) {
        for (let sh = -1; sh <= 1; sh++) {
          riggingPts.push(top, railEdge(mt + sh * 0.07, side));
        }
      }
    });
    const rigGeo = new THREE.BufferGeometry().setFromPoints(riggingPts);
    g.add(new THREE.LineSegments(rigGeo, ropeMat));

    // ── JOLLY ROGER ─────────────────────────────────────────────
    const flagGeo = new THREE.PlaneGeometry(0.9 * scale, 0.55 * scale, 8, 1);
    {
      const fp = flagGeo.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        const u = fp.getX(i) / (0.9 * scale) + 0.5;
        fp.setZ(i, Math.sin(u * Math.PI * 2) * 0.07 * scale);
        fp.setX(i, fp.getX(i) + 0.45 * scale); // pivot at hoist edge
      }
      flagGeo.computeVertexNormals();
    }
    const flagMat = new THREE.MeshBasicMaterial({
      map: GameTextures.flag(), side: THREE.DoubleSide,
    });
    const mainTop = mastTops[mastCount > 1 ? 1 : 0];
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.name = 'flag';
    flag.position.set(0, mainTop.y + 0.30 * scale, mainTop.z);
    flag.rotation.y = -Math.PI / 2; // streams aft
    g.add(flag);

    // ── HP BAR ──────────────────────────────────────────────────
    const hpW = def.width * 1.1;
    const hpY = height + def.mastHeight * 1.45 + 0.6;
    const hpBg = new THREE.Mesh(
      new THREE.BoxGeometry(hpW, 0.14, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x220000 })
    );
    hpBg.name = 'hpBg';
    hpBg.position.y = hpY;
    g.add(hpBg);
    const hpFill = new THREE.Mesh(
      new THREE.BoxGeometry(hpW, 0.14, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x44cc44 })
    );
    hpFill.name = 'hpFill';
    hpFill.position.y = hpY;
    hpFill.position.z = 0.04;
    g.add(hpFill);

    // Shadows (sails + hull cast; lines/flags skipped automatically)
    g.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    hpBg.castShadow = hpFill.castShadow = false;

    return { group: g, hpFullWidth: hpW };
  }

  function _getTemplate(archetype, def) {
    if (!_templates[archetype]) _templates[archetype] = _buildTemplate(archetype, def);
    return _templates[archetype];
  }

  // Clone template; give the clone its own HP-fill material
  function _buildMesh(archetype, def) {
    const tpl = _getTemplate(archetype, def);
    const group = tpl.group.clone();

    let hpFill = null, flag = null;
    group.traverse(c => {
      if (c.name === 'hpFill') { hpFill = c; }
      if (c.name === 'flag')   { flag = c; }
    });
    hpFill.material = hpFill.material.clone();

    return { group, hpFill, flag, fullWidth: tpl.hpFullWidth };
  }

  function spawn(archetype, lane) {
    const def   = SHIP_DEF(archetype);
    const laneX = LANE_X[lane];
    const { group, hpFill, flag, fullWidth } = _buildMesh(archetype, def);

    const spawnZ = 58 + Math.random() * 10;
    group.position.set(laneX, 0, spawnZ);
    group.rotation.y = Math.PI; // bow toward the harbor

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
      flag,
      hpFullWidth: fullWidth,
      slowTimer: 0,       // chain shot slow
      slowFactor: 1.0,
      shooting: false,
      shootTimer: 0,
      sinkT: 0,
      sinkRollDir: 1,
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

      // Zig-zag for sloops — heel into the turn
      let zigzagLean = 0;
      if (ship.def.zigzag) {
        ship.mesh.position.x = ship.laneX +
          Math.sin(ship.age * ship.def.zigzagFreq) * ship.def.zigzagAmp;
        zigzagLean = Math.cos(ship.age * ship.def.zigzagFreq) * 0.18;
      }

      // Ocean motion: bob, roll, pitch
      ship.mesh.position.y  = Math.sin(ship.age * 1.1) * 0.08;
      ship.mesh.rotation.z  = Math.sin(ship.age * 0.9) * 0.035 + zigzagLean * 0.4;
      ship.mesh.rotation.x  = Math.sin(ship.age * 0.7 + 1.3) * 0.022;
      ship.mesh.rotation.y  = Math.PI - zigzagLean;
      ship.age += dt;

      // Flag flutter
      if (ship.flag) {
        ship.flag.rotation.y = -Math.PI / 2 + Math.sin(ship.age * 4.2) * 0.18;
      }

      // HP bar scale
      const pct = Math.max(0, ship.hull / ship.maxHull);
      ship.hpFill.scale.x = pct;
      ship.hpFill.position.x = ship.hpFullWidth * (pct - 1) * 0.5;
      ship.hpFill.material.color.setHex(pct > 0.5 ? 0x44cc44 : (pct > 0.25 ? 0xddaa00 : 0xcc2200));
    }

    // ── Sinking ships — keel over and slip beneath the waves ────
    for (const ship of _sinking) {
      ship.sinkT += dt;
      const t = ship.sinkT;
      ship.mesh.rotation.z += ship.sinkRollDir * dt * (0.25 + t * 0.30);
      ship.mesh.rotation.x += dt * 0.22;                  // bow down
      ship.mesh.position.y -= dt * (0.3 + t * 1.4);
      ship.mesh.position.z -= dt * 0.4;                   // drift
      if (t > 2.6) {
        _scene.remove(ship.mesh);
        _sinking.delete(ship);
      }
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

  // Destroyed by cannon fire — play the sinking animation
  function sinkShip(ship) {
    if (!ship.alive) return;
    ship.alive = false;
    active.delete(ship);
    ship.hpFill.visible = false;
    ship.mesh.traverse(c => { if (c.name === 'hpBg') c.visible = false; });
    ship.sinkT = 0;
    ship.sinkRollDir = Math.random() > 0.5 ? 1 : -1;
    _sinking.add(ship);
  }

  // Instant removal (landings, resets)
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
    for (const ship of [..._sinking]) {
      _scene.remove(ship.mesh);
      _sinking.delete(ship);
    }
  }

  return { init, spawn, update, getHitCenter, damageShip, sinkShip, removeShip, slowShip, clear, active };
})();
