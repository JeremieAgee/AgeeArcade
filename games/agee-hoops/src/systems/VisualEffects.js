/**
 * Visual Effects — Score, impact, and swish effects
 */
window.HoopsVisualEffects = (() => {
  'use strict';

  let swishEmitter = null;
  let impactEmitter = null;

  function init(scene) {
    swishEmitter = new window.HoopsParticleSystem.ParticleEmitter(scene, 100);
    impactEmitter = new window.HoopsParticleSystem.ParticleEmitter(scene, 150);
  }

  function playSwish(position) {
    const swishColor = new THREE.Color(0x00ff88);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * 4,
        Math.sin(angle) * 4,
        0
      );
      swishEmitter.emit(position, velocity, 0.6, 0.4, swishColor, 1);
    }
  }

  function playRimImpact(position, normal) {
    const impactColor = new THREE.Color(0xffd700);
    const velocity = normal.clone().multiplyScalar(3);

    for (let i = 0; i < 5; i++) {
      const scatter = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      );
      impactEmitter.emit(
        position,
        velocity.clone().add(scatter),
        0.5,
        0.3,
        impactColor,
        1
      );
    }
  }

  function playBackboardImpact(position, normal) {
    const impactColor = new THREE.Color(0xffffff).multiplyScalar(0.8);
    const velocity = normal.clone().multiplyScalar(2);

    for (let i = 0; i < 4; i++) {
      const scatter = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5
      );
      impactEmitter.emit(
        position,
        velocity.clone().add(scatter),
        0.4,
        0.25,
        impactColor,
        1
      );
    }
  }

  function update(dt) {
    swishEmitter.update(dt);
    impactEmitter.update(dt);
  }

  return {
    init,
    playSwish,
    playRimImpact,
    playBackboardImpact,
    update,
  };
})();
