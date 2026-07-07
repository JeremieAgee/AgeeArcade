/**
 * ScoreSystem — Scoring rules and stats
 */
window.HoopsScoreSystem = (() => {
  'use strict';

  const C = window.HOOPS_CONSTANTS;
  const MATH = window.HOOPS_MATH;

  let ball = null;
  let hoopDetector = null;

  function init(ballObj, hoopDetectorObj) {
    ball = ballObj;
    hoopDetector = hoopDetectorObj;
    return {
      calculateScore,
      calculateMultiplier,
    };
  }

  function calculateScore(shotSpot, streak) {
    const basePoints = shotSpot.points || 1;
    const multiplier = calculateMultiplier(streak);
    const bonus = hoopDetector.wasCleanSwish() ? C.SWISH_BONUS : 0;

    return Math.round(basePoints * multiplier) + bonus;
  }

  function calculateMultiplier(streak) {
    return MATH.getMultiplier(streak);
  }

  return { init };
})();
