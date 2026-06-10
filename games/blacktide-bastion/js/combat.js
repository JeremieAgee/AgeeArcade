// combat.js — projectile-ship collision and ship landing detection

const Combat = (() => {
  const _pSphere = new THREE.Sphere();
  const _sSphere = new THREE.Sphere();

  // Check every active projectile against every active ship.
  // onHit(ship, projectile) called when a hit is detected.
  function resolveHits(projectilePool, enemyShips, onHit) {
    for (const p of [...projectilePool.active]) {
      _pSphere.center.copy(p.mesh.position);
      _pSphere.radius = p.radius;

      for (const ship of enemyShips.active) {
        if (!ship.alive) continue;

        _sSphere.center.copy(enemyShips.getHitCenter(ship));
        _sSphere.radius = ship.def.hitRadius;

        if (_pSphere.intersectsSphere(_sSphere)) {
          // Check splash for adjacent ships if splashRadius > 0
          if (p.splashRadius > 0) {
            _resolveSplash(p, enemyShips, onHit);
          } else {
            onHit(ship, p);
          }
          projectilePool.release(p);
          break;
        }
      }
    }
  }

  function _resolveSplash(p, enemyShips, onHit) {
    const splashSphere = new THREE.Sphere(p.mesh.position.clone(), p.splashRadius);
    for (const ship of [...enemyShips.active]) {
      if (!ship.alive) continue;
      _sSphere.center.copy(enemyShips.getHitCenter(ship));
      _sSphere.radius = ship.def.hitRadius;
      if (splashSphere.intersectsSphere(_sSphere)) {
        onHit(ship, p);
      }
    }
  }

  // Check if any ship has reached the harbor landing zone.
  // onLand(ship) called when a ship reaches shore.
  function resolveLandings(enemyShips, onLand) {
    const LANDING_Z = 1.8;
    for (const ship of [...enemyShips.active]) {
      if (!ship.alive || ship.landed) continue;
      if (ship.mesh.position.z <= LANDING_Z) {
        ship.landed = true;
        onLand(ship);
      }
    }
  }

  return { resolveHits, resolveLandings };
})();
