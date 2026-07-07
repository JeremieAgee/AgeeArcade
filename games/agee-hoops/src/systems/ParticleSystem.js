/**
 * Particle System — Reusable particle effects
 */
window.HoopsParticleSystem = (() => {
  'use strict';

  class Particle {
    constructor() {
      this.position = new THREE.Vector3();
      this.velocity = new THREE.Vector3();
      this.acceleration = new THREE.Vector3();
      this.life = 1;
      this.maxLife = 1;
      this.size = 1;
      this.color = new THREE.Color();
      this.active = false;
    }

    update(dt) {
      if (!this.active) return;

      this.velocity.addScaledVector(this.acceleration, dt);
      this.position.addScaledVector(this.velocity, dt);
      this.life -= dt;

      if (this.life <= 0) {
        this.active = false;
      }
    }

    reset(position, velocity, life, size, color) {
      this.position.copy(position);
      this.velocity.copy(velocity);
      this.life = life;
      this.maxLife = life;
      this.size = size;
      this.color.copy(color);
      this.acceleration.set(0, -9.8, 0);
      this.active = true;
    }
  }

  class ParticleEmitter {
    constructor(scene, maxParticles = 200) {
      this.scene = scene;
      this.particles = [];
      this.geometry = new THREE.BufferGeometry();
      this.positions = new Float32Array(maxParticles * 3);
      this.colors = new Float32Array(maxParticles * 3);
      this.sizes = new Float32Array(maxParticles);

      this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
      this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
      this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

      const material = new THREE.PointsMaterial({
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      });

      this.mesh = new THREE.Points(this.geometry, material);
      this.scene.add(this.mesh);

      for (let i = 0; i < maxParticles; i++) {
        this.particles.push(new Particle());
      }

      this.activeCount = 0;
    }

    emit(position, velocity, life, size, color, count = 1) {
      for (let i = 0; i < count; i++) {
        const particle = this.particles[this.activeCount];
        if (!particle.active) {
          particle.reset(position, velocity, life, size, color);
          this.activeCount++;

          if (this.activeCount >= this.particles.length) {
            this.activeCount = this.particles.length - 1;
          }
        }
      }
    }

    update(dt) {
      let activeIndex = 0;

      for (let i = 0; i < this.particles.length; i++) {
        const particle = this.particles[i];
        particle.update(dt);

        if (particle.active) {
          const idx = activeIndex * 3;
          this.positions[idx] = particle.position.x;
          this.positions[idx + 1] = particle.position.y;
          this.positions[idx + 2] = particle.position.z;

          const alpha = particle.life / particle.maxLife;
          this.colors[idx] = particle.color.r;
          this.colors[idx + 1] = particle.color.g;
          this.colors[idx + 2] = particle.color.b;

          this.sizes[activeIndex] = particle.size * alpha;
          activeIndex++;
        }
      }

      this.activeCount = activeIndex;
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
      this.geometry.attributes.size.needsUpdate = true;
      this.geometry.setDrawRange(0, activeIndex);
    }

    dispose() {
      this.geometry.dispose();
      this.mesh.material.dispose();
      this.scene.remove(this.mesh);
    }
  }

  return { ParticleEmitter };
})();
