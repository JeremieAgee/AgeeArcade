/**
 * Time — Game timer and clock management
 */
window.HoopsTime = (() => {
  'use strict';

  const C = window.HOOPS_CONSTANTS;

  let gameTime = 0;
  let gameTimerActive = false;
  let gameDuration = C.GAME_DURATION;
  let onTimeUpdate = null;
  let onTimeEnd = null;

  return {
    init(duration = C.GAME_DURATION, onUpdate, onEnd) {
      gameDuration = duration;
      gameTime = 0;
      gameTimerActive = true;
      onTimeUpdate = onUpdate;
      onTimeEnd = onEnd;
    },

    update(deltaTime) {
      if (!gameTimerActive) return;

      gameTime += deltaTime;

      if (onTimeUpdate) {
        onTimeUpdate(this.remaining());
      }

      if (gameTime >= gameDuration) {
        gameTimerActive = false;
        if (onTimeEnd) onTimeEnd();
      }
    },

    remaining() {
      return Math.max(0, gameDuration - gameTime);
    },

    isActive() {
      return gameTimerActive;
    },

    stop() {
      gameTimerActive = false;
    },

    reset() {
      gameTime = 0;
      gameTimerActive = false;
    },
  };
})();
