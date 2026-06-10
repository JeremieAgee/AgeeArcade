// fx.js — pooled sprite effects: muzzle flash, gunsmoke, explosions, embers

const FX = (() => {
  let _scene;
  const _free = [];
  const _active = [];
  let _flashLight, _flashTimer = 0;

  const POOL_SIZE = 90;

  function init(scene) {
    _scene = scene;

    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.SpriteMaterial({
        map: GameTextures.smoke(),
        transparent: true,
        depthWrite: false,
        rotation: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      scene.add(sprite);
      _free.push({
        sprite,
        vel: new THREE.Vector3(),
        life: 0, maxLife: 1,
        grow: 0,
        baseOpacity: 1,
        drag: 1,
      });
    }

    // One shared light reused for the most recent flash
    _flashLight = new THREE.PointLight(0xffaa44, 0, 26);
    scene.add(_flashLight);
  }

  function _spawn(opts) {
    const p = _free.pop();
    if (!p) return;
    const s = p.sprite;
    s.material.map = opts.map;
    s.material.blending = opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.material.rotation = Math.random() * Math.PI * 2;
    s.material.opacity = opts.opacity;
    s.position.copy(opts.pos);
    s.scale.setScalar(opts.scale);
    s.visible = true;
    p.vel.copy(opts.vel);
    p.life = 0;
    p.maxLife = opts.life;
    p.grow = opts.grow || 0;
    p.baseOpacity = opts.opacity;
    p.drag = opts.drag !== undefined ? opts.drag : 1;
    _active.push(p);
  }

  // ── CANNON MUZZLE FLASH ───────────────────────────────────────
  // pos: muzzle world position, dir: normalized barrel direction
  function muzzleFlash(pos, dir) {
    // Core flash
    _spawn({
      map: GameTextures.flash(), additive: true,
      pos, vel: new THREE.Vector3(0, 0, 0),
      scale: 2.4, grow: 6, life: 0.13, opacity: 1,
    });

    // Smoke plume blown out along the barrel
    for (let i = 0; i < 6; i++) {
      const v = dir.clone().multiplyScalar(4.5 + Math.random() * 4);
      v.x += (Math.random() - 0.5) * 1.6;
      v.y += 0.6 + Math.random() * 1.2;
      v.z += (Math.random() - 0.5) * 1.6;
      _spawn({
        map: GameTextures.smoke(), additive: false,
        pos: pos.clone().addScaledVector(dir, 0.2 + Math.random() * 0.5),
        vel: v,
        scale: 0.7 + Math.random() * 0.5,
        grow: 1.6 + Math.random(),
        life: 1.1 + Math.random() * 0.8,
        opacity: 0.55,
        drag: 0.92,
      });
    }

    // Sparks
    for (let i = 0; i < 5; i++) {
      const v = dir.clone().multiplyScalar(9 + Math.random() * 7);
      v.x += (Math.random() - 0.5) * 4;
      v.y += (Math.random() - 0.2) * 3;
      _spawn({
        map: GameTextures.ember(), additive: true,
        pos: pos.clone(),
        vel: v,
        scale: 0.22 + Math.random() * 0.15,
        grow: -0.1, life: 0.3 + Math.random() * 0.25, opacity: 1,
      });
    }

    _flashLight.position.copy(pos);
    _flashLight.intensity = 5.5;
    _flashTimer = 0.14;
  }

  // ── HIT / EXPLOSION ───────────────────────────────────────────
  function explosion(pos, size = 1) {
    _spawn({
      map: GameTextures.flash(), additive: true,
      pos, vel: new THREE.Vector3(0, 1.5, 0),
      scale: 1.8 * size, grow: 7 * size, life: 0.18, opacity: 1,
    });

    for (let i = 0; i < 5 + Math.round(3 * size); i++) {
      _spawn({
        map: GameTextures.smoke(), additive: false,
        pos: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * size, Math.random() * 0.6 * size, (Math.random() - 0.5) * size
        )),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 3, 1.2 + Math.random() * 2.2, (Math.random() - 0.5) * 3
        ),
        scale: (0.8 + Math.random() * 0.6) * size,
        grow: (1.4 + Math.random()) * size,
        life: 1.0 + Math.random() * 0.9,
        opacity: 0.6,
        drag: 0.9,
      });
    }

    for (let i = 0; i < 7; i++) {
      _spawn({
        map: GameTextures.ember(), additive: true,
        pos: pos.clone(),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 9, 2 + Math.random() * 6, (Math.random() - 0.5) * 9
        ),
        scale: 0.25 + Math.random() * 0.2,
        grow: -0.12, life: 0.5 + Math.random() * 0.4, opacity: 1,
      });
    }

    _flashLight.position.copy(pos);
    _flashLight.intensity = Math.max(_flashLight.intensity, 4 * size);
    _flashTimer = Math.max(_flashTimer, 0.16);
  }

  // ── UPDATE ────────────────────────────────────────────────────
  function update(dt) {
    for (let i = _active.length - 1; i >= 0; i--) {
      const p = _active[i];
      p.life += dt;
      const frac = p.life / p.maxLife;
      if (frac >= 1) {
        p.sprite.visible = false;
        _active.splice(i, 1);
        _free.push(p);
        continue;
      }
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.vel.y -= (p.drag < 1 ? 0 : 2.5) * dt; // embers fall, smoke rises freely
      p.sprite.position.addScaledVector(p.vel, dt);
      const s = Math.max(0.01, p.sprite.scale.x + p.grow * dt);
      p.sprite.scale.setScalar(s);
      p.sprite.material.opacity = p.baseOpacity * (1 - frac * frac);
    }

    if (_flashTimer > 0) {
      _flashTimer -= dt;
      _flashLight.intensity = Math.max(0, _flashLight.intensity - dt * 42);
      if (_flashTimer <= 0) _flashLight.intensity = 0;
    }
  }

  function clear() {
    for (let i = _active.length - 1; i >= 0; i--) {
      const p = _active[i];
      p.sprite.visible = false;
      _free.push(p);
    }
    _active.length = 0;
    _flashLight.intensity = 0;
  }

  return { init, muzzleFlash, explosion, update, clear };
})();
