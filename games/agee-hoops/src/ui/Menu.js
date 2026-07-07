/**
 * Menu — Title and game over screens
 */
window.HoopsMenu = (() => {
  'use strict';

  const titleScreen = document.getElementById('titleScreen');
  const gameoverScreen = document.getElementById('gameoverScreen');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const saveScoreBtn = document.getElementById('saveScoreBtn');
  const playerNameInput = document.getElementById('playerName');
  const bestScoreDisplay = document.getElementById('bestScoreDisplay');
  const bestScoreValue = document.getElementById('bestScoreValue');
  const finalScoreEl = document.getElementById('finalScore');
  const bestStreakEl = document.getElementById('bestStreak');
  const shotsMadeEl = document.getElementById('shotsMade');
  const finalAccuracyEl = document.getElementById('finalAccuracy');
  const finalMessageEl = document.getElementById('finalMessage');
  const leaderboardPrompt = document.getElementById('leaderboardPrompt');

  let onStartGame = null;
  let currentGameData = null;

  function init(opts = {}) {
    onStartGame = opts.onStartGame;

    if (startBtn) {
      startBtn.addEventListener('click', handleStart);
    }
    if (restartBtn) {
      restartBtn.addEventListener('click', handleStart);
    }
    if (saveScoreBtn) {
      saveScoreBtn.addEventListener('click', handleSaveScore);
    }

    // ESC key to exit
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('gameOverOverlay');
        if (gameoverScreen && !gameoverScreen.hidden) {
          // Go back to title
          showTitle();
        }
      }
    });

    return {
      showTitle,
      showGameOver,
    };
  }

  function handleStart() {
    hideAll();
    if (onStartGame) onStartGame();
  }

  function handleSaveScore() {
    if (!currentGameData || !playerNameInput) return;

    const name = playerNameInput.value.trim() || 'PLAYER';
    const scoreData = {
      player_name: name,
      score: currentGameData.score,
      shots_made: currentGameData.shotsMade,
      shots_taken: currentGameData.shotsTaken,
      accuracy: currentGameData.accuracy,
      best_streak: currentGameData.bestStreak,
      game_id: 'agee_hoops',
    };

    // Use the shared leaderboard system
    if (window.ArcadeLeaderboard) {
      window.ArcadeLeaderboard.saveScore(scoreData).then(() => {
        alert('Score saved!');
      }).catch(err => {
        console.error('Failed to save score:', err);
      });
    }

    // Clear input
    if (playerNameInput) playerNameInput.value = '';
  }

  function showTitle() {
    hideAll();
    if (titleScreen) titleScreen.classList.add('active');

    // Show best score if available
    const bestScore = window.HoopsState.getBestScore();
    if (bestScore > 0) {
      if (bestScoreDisplay) bestScoreDisplay.style.display = 'block';
      if (bestScoreValue) bestScoreValue.textContent = bestScore;
    }
  }

  function showGameOver(gameData) {
    currentGameData = gameData;
    hideAll();

    if (gameoverScreen) {
      gameoverScreen.classList.add('active');
    }

    // Populate stats
    if (finalScoreEl) finalScoreEl.textContent = gameData.score;
    if (bestStreakEl) bestStreakEl.textContent = gameData.bestStreak;
    if (shotsMadeEl) shotsMadeEl.textContent = gameData.shotsMade;
    if (finalAccuracyEl) finalAccuracyEl.textContent = `${gameData.accuracy}%`;

    // Determine message
    let message = 'Nice shooting!';
    if (gameData.score > 100) message = 'Fantastic!';
    if (gameData.score > 200) message = 'Incredible!';
    if (gameData.score > 300) message = 'Unstoppable!';
    if (finalMessageEl) finalMessageEl.textContent = message;

    // Show leaderboard prompt if leaderboard system available
    if (leaderboardPrompt && window.ArcadeLeaderboard) {
      leaderboardPrompt.style.display = 'flex';
    }

    // Focus name input
    if (playerNameInput) {
      playerNameInput.focus();
    }
  }

  function hideAll() {
    if (titleScreen) titleScreen.classList.remove('active');
    if (gameoverScreen) gameoverScreen.classList.remove('active');
  }

  return { init };
})();
