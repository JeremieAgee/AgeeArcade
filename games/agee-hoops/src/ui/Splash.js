/**
 * Splash — Floating text for score popups
 */
window.HoopsSplash = (() => {
  'use strict';

  const container = document.getElementById('splashContainer');

  function show(text, x, y, type = 'score') {
    if (!container) return;

    const splash = document.createElement('div');
    splash.className = `splash-text ${type}`;
    splash.textContent = text;
    splash.style.left = x + 'px';
    splash.style.top = y + 'px';

    container.appendChild(splash);

    // Remove after animation
    setTimeout(() => {
      splash.remove();
    }, 1500);
  }

  return { show };
})();
