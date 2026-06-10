/**
 * SFX — Spear Fisher sound adapter.
 * Delegates to the shared ArcadeSound engine (/engine/sound/engine.js).
 * Registers spear/water SFX and a calm ocean music theme.
 */
window.SFX = (() => {
  let _ready = false;
  let _ambientRequested = false;

  function _registerSFX() {
    const { osc, noise } = ArcadeSound._internal;

    // Spear leaves the hand — airy whoosh rising then gone
    ArcadeSound.registerSFX('sf_throw', 0.25, (o, n) => {
      noise(o, n, 0.20, 0.26, 0.001, 2600, 'highpass');
      osc(o, 'sine', 280, 0, 0.16, 520, 0.10, 0.001);
    });
    // Spear or fish breaks the surface
    ArcadeSound.registerSFX('sf_splash', 0.40, (o, n) => {
      noise(o, n, 0.30, 0.35, 0.001, 1400, 'lowpass');
      noise(o, n, 0.16, 0.20, 0.001, 3200, 'highpass');
      osc(o, 'sine', 180, 0, 0.12, 90, 0.12, 0.001);
    });
    // Spear strikes a fish — wet thunk
    ArcadeSound.registerSFX('sf_stick', 0.22, (o, n) => {
      noise(o, n, 0.12, 0.40, 0.001, 700, 'bandpass');
      osc(o, 'square', 150, 0, 0.10, 70, 0.16, 0.001);
      osc(o, 'sine', 90, 0.02, 0.16, 50, 0.18, 0.001);
    });
    // Reel tug — short rope strain
    ArcadeSound.registerSFX('sf_pull', 0.18, (o, n) => {
      noise(o, n, 0.10, 0.22, 0.001, 900, 'bandpass');
      osc(o, 'triangle', 220, 0, 0.12, 320, 0.14, 0.001);
    });
    // Fish landed — bright little fanfare
    ArcadeSound.registerSFX('sf_catch', 0.60, (o) => {
      [523, 659, 784].forEach((f, i) => osc(o, 'sine', f, i * 0.07, i * 0.07 + 0.22, f * 1.01, 0.20, 0.001));
      osc(o, 'triangle', 1046, 0.22, 0.55, 1318, 0.10, 0.001);
    });
    // Time's up
    ArcadeSound.registerSFX('sf_gameover', 0.90, (o) => {
      [392, 330, 262, 196].forEach((f, i) => osc(o, 'sine', f, i * 0.14, i * 0.14 + 0.40, f, 0.20, 0.001));
    });
  }

  function _registerMusic() {
    ArcadeSound.registerTheme('sf_ocean', {
      bpm: 70,
      barsPerChord: 2,
      padType: 'sine',
      melType: 'sine',
      crackle: false,
      gain: 0.45,
      chords: [
        { pad: [196.00, 246.94, 293.66, 392.00], bass: 98.00,  mel: [392.00, 440.00, 493.88, 587.33] },
        { pad: [174.61, 220.00, 261.63, 349.23], bass: 87.31,  mel: [349.23, 392.00, 440.00, 523.25] },
        { pad: [146.83, 185.00, 220.00, 293.66], bass: 73.42,  mel: [293.66, 349.23, 392.00, 440.00] },
        { pad: [164.81, 207.65, 246.94, 329.63], bass: 82.41,  mel: [329.63, 392.00, 415.30, 493.88] },
      ],
    });
  }

  function init() {
    const e = window.ArcadeSound;
    if (!e) { console.warn('[SFX] ArcadeSound not loaded'); return; }
    if (_ready) return;

    if (window.ArcadeSoundTuner) {
      ArcadeSoundTuner.setGame('Spear Fisher');
      const u = window.currentUser || window.user;
      if (u) ArcadeSoundTuner.setUser(u);
    }

    e.init({ deferWorklets: true }).then(() => {
      _registerSFX();
      _registerMusic();
      _ready = true;
      if (_ambientRequested) _startAmbientNow();
    });
  }

  function _startAmbientNow() {
    ArcadeSound.startAmbient('sf_ocean');
    // Gentle sea breeze under the music once the worklet is up
    let tries = 0;
    (function tryWind() {
      if (!_ambientRequested) return;
      if (ArcadeSound._internal?.envNode) { ArcadeSound.startEnvironment('wind', 0.18); return; }
      if (++tries < 20) setTimeout(tryWind, 150);
    })();
  }

  function once(name) {
    if (!_ready) return;
    ArcadeSound.play(name);
  }

  function startAmbient() {
    _ambientRequested = true;
    if (_ready) _startAmbientNow();
  }

  function stopAmbient() {
    _ambientRequested = false;
    ArcadeSound.stopAmbient?.();
    ArcadeSound.stopEnvironment?.();
  }

  return { init, once, startAmbient, stopAmbient };
})();
