/**
 * Animation Utilities — Easing functions and animation helpers
 */
window.HOOPS_ANIMATIONS = (() => {
  'use strict';

  const Easing = {
    linear(t) {
      return t;
    },

    easeInQuad(t) {
      return t * t;
    },

    easeOutQuad(t) {
      return t * (2 - t);
    },

    easeInOutQuad(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    },

    easeInCubic(t) {
      return t * t * t;
    },

    easeOutCubic(t) {
      return (--t) * t * t + 1;
    },

    easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * (t - 2)) * (2 * (t - 2)) + 1;
    },

    easeInSine(t) {
      return 1 - Math.cos((t * Math.PI) / 2);
    },

    easeOutSine(t) {
      return Math.sin((t * Math.PI) / 2);
    },

    easeInOutSine(t) {
      return -(Math.cos(Math.PI * t) - 1) / 2;
    },

    easeOutElastic(t) {
      const c5 = (2 * Math.PI) / 4.5;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c5) + 1;
    },

    easeOutBounce(t) {
      const n1 = 7.5625;
      const d1 = 2.75;

      if (t < 1 / d1) {
        return n1 * t * t;
      } else if (t < 2 / d1) {
        return n1 * (t -= 1.5 / d1) * t + 0.75;
      } else if (t < 2.5 / d1) {
        return n1 * (t -= 2.25 / d1) * t + 0.9375;
      } else {
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
      }
    },
  };

  class Animator {
    constructor(target, properties, duration, easing = Easing.easeInOutQuad) {
      this.target = target;
      this.properties = properties;
      this.duration = duration;
      this.easing = easing;
      this.elapsed = 0;
      this.startValues = {};
      this.finished = false;

      for (const key in properties) {
        this.startValues[key] = target[key];
      }
    }

    update(dt) {
      if (this.finished) return false;

      this.elapsed += dt;
      const progress = Math.min(this.elapsed / this.duration, 1);
      const easedProgress = this.easing(progress);

      for (const key in this.properties) {
        const start = this.startValues[key];
        const end = this.properties[key];
        this.target[key] = start + (end - start) * easedProgress;
      }

      if (progress >= 1) {
        this.finished = true;
        return false;
      }

      return true;
    }
  }

  function oscillate(time, frequency, amplitude, offset = 0) {
    return offset + Math.sin(time * frequency * Math.PI * 2) * amplitude;
  }

  function oscillateCos(time, frequency, amplitude, offset = 0) {
    return offset + Math.cos(time * frequency * Math.PI * 2) * amplitude;
  }

  return {
    Easing,
    Animator,
    oscillate,
    oscillateCos,
  };
})();
