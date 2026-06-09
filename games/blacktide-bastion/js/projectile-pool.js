// projectile-pool.js — pooled cannonballs with ballistic arc physics

class ProjectilePool {
  constructor(scene, size = 64) {
    this.scene  = scene;
    this.free   = [];
    this.active = new Set();

    const geo = new THREE.SphereGeometry(0.16, 7, 7);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a1a22,
      roughness: 0.5,
      metalness: 0.7,
    });

    for (let i = 0; i < size; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.free.push({
        mesh,
        vel: new THREE.Vector3(),
        damage: 0,
        splashRadius: 0,
        radius: 0.22,
        alive: false,
        age: 0,
        maxAge: 6,
        doubled: false,  // whether this is part of a double-shot pair
      });
    }
  }

  // Acquire a projectile from the pool.
  // Returns an object with a launch() method, or null if pool is empty.
  acquire() {
    const p = this.free.pop();
    if (!p) return null;
    p.alive   = true;
    p.age     = 0;
    p.mesh.visible = true;
    this.active.add(p);

    return {
      launch: (opts) => {
        p.mesh.position.copy(opts.position);
        p.vel.copy(opts.velocity);
        p.damage       = opts.damage      || 45;
        p.splashRadius = opts.splashRadius || 0;
        p.maxAge       = opts.maxAge       || 6;
      },
      raw: p,
    };
  }

  release(p) {
    if (!p.alive) return;
    p.alive        = false;
    p.mesh.visible = false;
    p.vel.set(0, 0, 0);
    this.active.delete(p);
    this.free.push(p);
  }

  update(dt, onWaterImpact) {
    const GRAVITY = 14;
    for (const p of [...this.active]) {
      p.vel.y -= GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.age += dt;

      if (p.mesh.position.y <= 0 || p.age > p.maxAge) {
        if (onWaterImpact && p.mesh.position.y <= 0) {
          onWaterImpact(p.mesh.position.clone(), p.splashRadius);
        }
        this.release(p);
      }
    }
  }

  clear() {
    for (const p of [...this.active]) this.release(p);
  }
}

// ── HELPER: compute launch velocity for a ballistic arc ──────────
// Fires from `muzzlePos` so the ball lands at `targetPos` (y=0)
// Returns THREE.Vector3 velocity.
function computeLaunchVelocity(muzzlePos, targetPos, gravity) {
  gravity = gravity || 14;
  const dx = targetPos.x - muzzlePos.x;
  const dz = targetPos.z - muzzlePos.z;
  const hDist = Math.sqrt(dx * dx + dz * dz);

  // Choose time of flight based on horizontal distance for arcade feel
  const T = Math.max(0.7, Math.min(3.0, hDist / 18));

  const vx = dx / T;
  const vz = dz / T;
  const vy = (0 - muzzlePos.y) / T + 0.5 * gravity * T;

  return new THREE.Vector3(vx, vy, vz);
}
