/**
 * State — Game state management
 */
window.HoopsState = (() => {
  'use strict';

  const STATES = {
    TITLE: 'title',
    PLAYING: 'playing',
    GAME_OVER: 'gameOver',
  };

  let currentState = STATES.TITLE;
  let previousState = null;

  const listeners = {
    onStateChange: null,
  };

  const gameData = {
    score: 0,
    shotsTaken: 0,
    shotsMade: 0,
    bestStreak: 0,
    currentStreak: 0,
    totalTime: 0,
    bestScore: parseInt(localStorage.getItem('hoops_best_score') || '0', 10),
  };

  return {
    // ── State Control ──────────────────────────────────
    setState(newState) {
      if (!Object.values(STATES).includes(newState)) {
        console.warn(`Invalid state: ${newState}`);
        return;
      }

      previousState = currentState;
      currentState = newState;

      if (listeners.onStateChange) {
        listeners.onStateChange(previousState, currentState);
      }
    },

    getState() {
      return currentState;
    },

    isState(state) {
      return currentState === state;
    },

    // ── Game Data ──────────────────────────────────────
    addScore(points) {
      gameData.score += points;
    },

    recordShot(made = false) {
      gameData.shotsTaken++;
      if (made) {
        gameData.shotsMade++;
        gameData.currentStreak++;
        gameData.bestStreak = Math.max(gameData.bestStreak, gameData.currentStreak);
      } else {
        gameData.currentStreak = 0;
      }
    },

    getScore() {
      return gameData.score;
    },

    getShotsTaken() {
      return gameData.shotsTaken;
    },

    getShotsMade() {
      return gameData.shotsMade;
    },

    getCurrentStreak() {
      return gameData.currentStreak;
    },

    getBestStreak() {
      return gameData.bestStreak;
    },

    getAccuracy() {
      if (gameData.shotsTaken === 0) return 0;
      return Math.round((gameData.shotsMade / gameData.shotsTaken) * 100);
    },

    getBestScore() {
      return gameData.bestScore;
    },

    // ── Game Reset ─────────────────────────────────────
    resetGameData() {
      gameData.score = 0;
      gameData.shotsTaken = 0;
      gameData.shotsMade = 0;
      gameData.bestStreak = 0;
      gameData.currentStreak = 0;
      gameData.totalTime = 0;
    },

    finishGame() {
      // Update best score if beaten
      if (gameData.score > gameData.bestScore) {
        gameData.bestScore = gameData.score;
        localStorage.setItem('hoops_best_score', gameData.bestScore.toString());
      }
    },

    getAllGameData() {
      return {
        score: gameData.score,
        shotsTaken: gameData.shotsTaken,
        shotsMade: gameData.shotsMade,
        currentStreak: gameData.currentStreak,
        bestStreak: gameData.bestStreak,
        accuracy: this.getAccuracy(),
        bestScore: gameData.bestScore,
      };
    },

    // ── Listeners ──────────────────────────────────────
    on(event, callback) {
      if (event === 'stateChange') {
        listeners.onStateChange = callback;
      }
    },

    // ── Constants ──────────────────────────────────────
    STATES,
  };
})();
