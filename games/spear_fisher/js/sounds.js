/**
 * SFX — Spear Fisher sound adapter.
 * High-quality procedural synthesis for oceanic fishing.
 * Music remains procedurally generated (ocean theme).
 */
window.SFX = (() => {
  let _ready = false;
  let _ambientRequested = false;

  // High-quality SFX with physical modeling
  function _registerSFX() {
    const { resonance, plate, noise, impact } = ArcadeSound._internal;

    // Spear throw — whoosh air movement
    ArcadeSound.registerSFX('sf_throw', 0.24, (o, n) => {
      noise(o, n, 0.20, 0.30, 0.001, 3000, 'highpass');
    });

    // Splash — water body impact (realistic splash texture + resonance)
    ArcadeSound.registerSFX('sf_splash', 0.55, (o, n) => {
      // Water splash: low texture + resonance + spray
      noise(o, n, 0.35, 0.45, 0.001, 600, 'lowpass');    // Splash texture
      resonance(o, n, 200, 5, 0.35, 0.25, 0.35);          // Water resonance
      noise(o, n, 0.15, 0.10, 0.001, 1500, 'highpass');   // Spray/aeration
    });

    // Spear strike — impact on fish/water (sharp water impact)
    ArcadeSound.registerSFX('sf_stick', 0.40, (o, n) => {
      // Spear hitting water: sharp transient + impact
      impact(o, n, 'rubber', 0.9, 'small');  // Fish is soft/rubbery
    });

    // Reel tension — rope strain and resistance
    ArcadeSound.registerSFX('sf_pull', 0.26, (o, n) => {
      noise(o, n, 0.18, 0.32, 0.001, 1200, 'bandpass');
      resonance(o, n, 280, 6, 0.24, 0.18, 0.24);
    });

    // Fish caught — victory chime (success!)
    ArcadeSound.registerSFX('sf_catch', 0.35, (o, n) => {
      resonance(o, n, 800, 7, 0.28, 0.22, 0.28);
      resonance(o, n, 600, 6, 0.26, 0.18, 0.26);
    });

    // Game Over — session end, solid impact
    ArcadeSound.registerSFX('sf_gameover', 0.50, (o, n) => {
      // Stone impact (solid, final)
      impact(o, n, 'stone', 0.85, 'medium');
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
