/**
 * ShotSpots — Managing different shooting positions on the court
 */
window.HoopsShotSpots = (() => {
  'use strict';

  const C = window.HOOPS_CONSTANTS;
  const MATH = window.HOOPS_MATH;

  let currentSpot = null;
  let shotCounter = 0;

  return {
    init() {
      currentSpot = C.SHOT_SPOTS[0];
      shotCounter = 0;
      return this;
    },

    setCurrentSpot(spot) {
      currentSpot = spot;
      return currentSpot;
    },

    getCurrentSpot() {
      return currentSpot;
    },

    getPlayerPosition() {
      if (!currentSpot) return { x: 0, y: 1.8, z: 6 };
      return { x: currentSpot.x, y: 1.8, z: currentSpot.z };
    },

    getDistanceToHoop() {
      if (!currentSpot) return 14;
      return MATH.horizontalDistance(
        { x: currentSpot.x, z: currentSpot.z },
        { x: C.HOOP_RIM_CENTER.x, z: C.HOOP_RIM_CENTER.z }
      );
    },

    getPointValue() {
      if (!currentSpot) return 1;
      return currentSpot.points;
    },

    getShotName() {
      if (!currentSpot) return 'Shot';
      return currentSpot.name;
    },

    recordShot() {
      shotCounter++;
      return shotCounter;
    },

    getShotCount() {
      return shotCounter;
    },

    reset() {
      shotCounter = 0;
      currentSpot = C.SHOT_SPOTS[0];
    },
  };
})();
