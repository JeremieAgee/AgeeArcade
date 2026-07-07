/**
 * Main entry point — Agee Hoops
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('DOM loaded, initializing game...');

    // Check dependencies
    if (typeof THREE === 'undefined') {
      throw new Error('THREE not loaded');
    }
    if (typeof ArcadeEngine === 'undefined') {
      throw new Error('ArcadeEngine not loaded');
    }

    // Initialize game
    await window.HoopsGame.init();

  } catch (error) {
    console.error('Failed to initialize game:', error);
    alert('Error loading game. Check console for details.');
  }
});

// Clean up on unload
window.addEventListener('beforeunload', () => {
  if (window.HoopsGame) {
    window.HoopsGame.destroy();
  }
});
