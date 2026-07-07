/**
 * Input — Keyboard and mouse input handling
 */
window.HoopsInput = (() => {
  'use strict';

  let canvas = null;
  let mouseX = 0, mouseY = 0;
  let spacebarDown = false;
  let mouseClickDown = false;
  let touchActive = false;
  let touchX = 0, touchY = 0;

  const listeners = {
    onAngleStart: null,
    onAngleRelease: null,
    onPowerStart: null,
    onPowerRelease: null,
  };

  function init(gameCanvas) {
    canvas = gameCanvas;

    // Mouse events
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);

    // Touch events
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);

    // Keyboard
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
  }

  function handleMouseMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return; // left click only
    mouseClickDown = true;
    if (listeners.onAngleStart) {
      listeners.onAngleStart();
    }
  }

  function handleMouseUp(e) {
    if (e.button !== 0) return;
    mouseClickDown = false;
    if (listeners.onAngleRelease) {
      listeners.onAngleRelease();
    }
  }

  function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    touchX = touch.clientX;
    touchY = touch.clientY;
    touchActive = true;

    if (listeners.onShootStart) {
      listeners.onShootStart({ x: touchX, y: touchY, source: 'touch' });
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    touchX = touch.clientX;
    touchY = touch.clientY;
  }

  function handleTouchEnd(e) {
    touchActive = false;

    if (listeners.onShootRelease) {
      listeners.onShootRelease({ x: touchX, y: touchY, source: 'touch' });
    }
  }

  function handleKeyDown(e) {
    if (e.key === ' ') {
      e.preventDefault();
      if (!spacebarDown) {
        spacebarDown = true;
        if (listeners.onPowerStart) {
          listeners.onPowerStart();
        }
      }
    }
    if (e.key === 'Escape') {
      // Pause / escape will be handled by game state
    }
  }

  function handleKeyUp(e) {
    if (e.key === ' ') {
      e.preventDefault();
      spacebarDown = false;
      if (listeners.onPowerRelease) {
        listeners.onPowerRelease();
      }
    }
  }

  return {
    init,

    getMousePosition() {
      return { x: mouseX, y: mouseY };
    },

    isSpacebarDown() {
      return spacebarDown;
    },

    isTouchActive() {
      return touchActive;
    },

    on(event, callback) {
      if (event === 'angleStart') listeners.onAngleStart = callback;
      if (event === 'angleRelease') listeners.onAngleRelease = callback;
      if (event === 'powerStart') listeners.onPowerStart = callback;
      if (event === 'powerRelease') listeners.onPowerRelease = callback;
    },

    destroy() {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('touchcancel', handleTouchEnd);
      }
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    },
  };
})();
