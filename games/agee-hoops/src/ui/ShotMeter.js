/**
 * ShotMeter — Power meter UI
 */
window.HoopsShotMeter = (() => {
  'use strict';

  const meterEl = document.getElementById('shotMeter');
  const fillEl = document.getElementById('meterFill');

  function init() {
    return {
      show,
      hide,
      updateFill,
    };
  }

  function show() {
    if (meterEl) meterEl.hidden = false;
  }

  function hide() {
    if (meterEl) meterEl.hidden = true;
  }

  function updateFill(ratio) {
    if (fillEl) {
      fillEl.style.width = `${Math.round(ratio * 100)}%`;
    }
  }

  return { init };
})();
