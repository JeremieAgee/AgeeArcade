/**
 * Math Utilities — Agee Hoops
 */
window.HOOPS_MATH = {
  /**
   * Calculate distance between two points
   */
  distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  },

  /**
   * Calculate horizontal distance (ignoring Y)
   */
  horizontalDistance(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  },

  /**
   * Lerp between two values
   */
  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  /**
   * Clamp value between min and max
   */
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  /**
   * Map value from one range to another
   */
  map(value, inMin, inMax, outMin, outMax) {
    return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
  },

  /**
   * Smooth step interpolation
   */
  smoothstep(edge0, edge1, x) {
    const t = this.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  },

  /**
   * Calculate shot arc physics
   * Returns ideal power needed to reach target at given distance
   */
  calculateShotArc(distanceToHoop, chargeRatio) {
    const baseHorizontalPower = 12;
    const baseVerticalPower = 21;

    return {
      horizontal: baseHorizontalPower * chargeRatio,
      vertical: baseVerticalPower * chargeRatio,
    };
  },

  /**
   * Add aim error based on distance
   */
  getAimError(distanceToHoop, chargeRatio) {
    // Harder shots = more error possible
    const baseError = distanceToHoop * 0.08;
    const chargeError = (1 - chargeRatio) * 0.15; // Better charge = better accuracy
    return baseError + chargeError;
  },

  /**
   * Check if point is inside sphere
   */
  isPointInSphere(point, sphereCenter, sphereRadius) {
    const dx = point.x - sphereCenter.x;
    const dy = point.y - sphereCenter.y;
    const dz = point.z - sphereCenter.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    return distSq < sphereRadius * sphereRadius;
  },

  /**
   * Check if point is inside cylinder (by horizontal distance)
   */
  isPointInCylinder(point, cylinderCenter, cylinderRadius, minY, maxY) {
    const dx = point.x - cylinderCenter.x;
    const dz = point.z - cylinderCenter.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);

    return (
      horizontalDist < cylinderRadius &&
      point.y >= minY &&
      point.y <= maxY
    );
  },

  /**
   * Get multiplier based on streak
   */
  getMultiplier(streak) {
    if (streak >= 5) return 2.0;
    if (streak >= 3) return 1.5;
    return 1.0;
  },

  /**
   * Format time MM:SS
   */
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  /**
   * Random number between min and max
   */
  random(min, max) {
    return Math.random() * (max - min) + min;
  },

  /**
   * Random integer between min and max (inclusive)
   */
  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
};
