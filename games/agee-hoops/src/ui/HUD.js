/**
 * HUD — Heads-up display with stats
 */
window.HoopsHUD = (() => {
  'use strict';

  const hudEl = document.getElementById('hud');
  const scoreEl = document.getElementById('scoreDisplay');
  const streakEl = document.getElementById('streakDisplay');
  const timerEl = document.getElementById('timerDisplay');
  const shotsEl = document.getElementById('shotsDisplay');
  const accuracyEl = document.getElementById('accuracyDisplay');
  const MATH = window.HOOPS_MATH;

  function init() {
    return {
      show,
      hide,
      updateStats,
      updateTimer,
      updateShotSpot,
    };
  }

  function show() {
    if (hudEl) hudEl.hidden = false;
  }

  function hide() {
    if (hudEl) hudEl.hidden = true;
  }

  function updateStats(gameData) {
    if (scoreEl) {
      scoreEl.textContent = gameData.score;
      scoreEl.classList.remove('stat-pulse');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('stat-pulse');
    }
    if (streakEl) {
      streakEl.textContent = gameData.currentStreak;
      if (gameData.currentStreak > 0) {
        streakEl.classList.remove('stat-pulse');
        void streakEl.offsetWidth;
        streakEl.classList.add('stat-pulse');
      }
    }
    if (shotsEl) shotsEl.textContent = gameData.shotsMade;
    if (accuracyEl) {
      const accuracy = gameData.accuracy || 0;
      accuracyEl.textContent = `${accuracy}%`;
    }
  }

  function updateTimer(remaining) {
    if (timerEl) {
      timerEl.textContent = Math.ceil(remaining);
    }
  }

  function updateShotSpot(spot) {
    // Could update HUD to show current shot spot info
    // For now, just track internally
  }

  return { init };
})();
