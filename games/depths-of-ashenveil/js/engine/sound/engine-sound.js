/**
 * EngineSound — Depths of Ashenveil sound adapter.
 * Delegates everything to the shared ArcadeSound engine (/engine/sound/engine.js).
 * Preserves the existing API surface so Engine.* calls need no changes.
 */
window.EngineSound = (() => {
  const _ENGINE = () => window.ArcadeSound;
  let _registered = false;
  let _ambientRequested = false;
  let _envRetryTimer = null;

  function registerDepthsAmbient(e) {
    if (_registered || !e) return;
    _registered = true;
    e.registerTheme('doa_creepy_low', {
      bpm: 58,
      barsPerChord: 4,
      padType: 'sine',
      melType: 'sine',
      crackle: true,
      crackleGain: 0.01,
      gain: 0.46,
      chords: [
        { pad: [65.41, 98.00, 130.81, 196.00],  bass: 32.70, mel: [196.00, 207.65, 246.94, 261.63] },
        { pad: [73.42, 110.00, 146.83, 220.00], bass: 36.71, mel: [174.61, 220.00, 233.08, 293.66] },
        { pad: [61.74, 92.50, 123.47, 185.00],  bass: 30.87, mel: [185.00, 196.00, 246.94, 277.18] },
        { pad: [69.30, 103.83, 138.59, 207.65], bass: 34.65, mel: [207.65, 233.08, 261.63, 311.13] },
      ],
    });
  }

  function init() {
    const e = _ENGINE();
    if (!e) { console.warn('[EngineSound] ArcadeSound not loaded'); return; }
    registerDepthsAmbient(e);
    // Wire the tuner to this game and the current user if available
    if (window.ArcadeSoundTuner) {
      ArcadeSoundTuner.setGame('Depths of Ashenveil');
      const u = window.currentUser || window.user;
      if (u) ArcadeSoundTuner.setUser(u);
    }
    return e.init({ deferWorklets: true, preloadSFX: false });
  }

  function startCaveWhenReady(e, tries = 0) {
    clearTimeout(_envRetryTimer);
    if (!_ambientRequested || !e) return;
    if (e._internal?.envNode) {
      e.startEnvironment('cave', 0.22);
      return;
    }
    if (tries >= 20) return;
    _envRetryTimer = setTimeout(() => startCaveWhenReady(e, tries + 1), 150);
  }

  function play(name)    { _ENGINE()?.play(name); }
  function footstep(material = 'stone', intensity = 1.0) { _ENGINE()?.footstep(material, intensity); }
  function registerFootstepMaterial(material, params) { _ENGINE()?.registerFootstepMaterial(material, params); }
  function stopAll()     { _ENGINE()?.stopAll(); }
  function startAmbient(){
    const e = _ENGINE();
    if (!e) return;
    _ambientRequested = true;
    registerDepthsAmbient(e);
    e.init({ deferWorklets: true, preloadSFX: false }).then(() => {
      if (!_ambientRequested) return;
      e.startAmbient('doa_creepy_low');
      startCaveWhenReady(e);
    });
  }
  function stopAmbient() {
    _ambientRequested = false;
    clearTimeout(_envRetryTimer);
    _envRetryTimer = null;
    const e = _ENGINE();
    e?.stopAmbient();
    e?.stopEnvironment();
  }

  return { init, play, footstep, registerFootstepMaterial, stopAll, startAmbient, stopAmbient };
})();
