/**
 * SFX — Maze Runner sound adapter.
 * Delegates to the shared ArcadeSound engine (/engine/sound/engine.js).
 * Registers Maze Runner-specific SFX that aren't in the shared set.
 */
window.SFX = (() => {
  let _ready        = false;
  let _footstepOn   = false;
  let _footstepMaterial = 'maze_stone';
  let _footstepIntensity = 1.0;
  let _ambientRequested = false;
  let _stepTimer    = 0;
  const STEP_INTERVAL = 460; // ms between footsteps while moving

  // Maze Runner SFX definitions — use ArcadeSound._internal helpers
  function _registerMazeSFX() {
    const { osc, noise } = window.ArcadeSound._internal;

    ArcadeSound.registerSFX('jump',     0.30, (o) => {
      osc(o, 'sine',     220, 0,    0.08, 440,  0.18, 0.001);
      osc(o, 'triangle', 330, 0.04, 0.22, 660,  0.08, 0.001);
    });
    ArcadeSound.registerSFX('land',     0.20, (o, n) => {
      noise(o, n, 0.12, 0.40, 0.001, 500, 'bandpass');
      osc(o, 'sine', 120, 0, 0.10, 60, 0.20, 0.001);
    });
    ArcadeSound.registerSFX('lava',     0.40, (o, n) => {
      noise(o, n, 0.35, 0.55, 0.001, 300, 'lowpass');
      osc(o, 'sawtooth', 90, 0, 0.30, 40, 0.25, 0.001);
    });
    ArcadeSound.registerSFX('fall',     0.50, (o) => {
      osc(o, 'sine', 440, 0, 0.40, 110, 0.22, 0.001);
      osc(o, 'triangle', 220, 0.10, 0.45, 55, 0.12, 0.001);
    });
    ArcadeSound.registerSFX('loot',     0.28, (o) => {
      osc(o, 'sine', 880, 0, 0.06, 1320, 0.18, 0.001);
      osc(o, 'sine', 1320, 0.05, 0.22, 1760, 0.10, 0.001);
    });
    ArcadeSound.registerSFX('lifeup',   0.60, (o) => {
      [330, 440, 660, 880].forEach((f, i) => osc(o, 'sine', f, i*0.10, i*0.10+0.18, f*1.02, 0.20, 0.001));
    });
    ArcadeSound.registerSFX('exit',     0.70, (o) => {
      [261, 329, 392, 523, 659].forEach((f, i) => osc(o, 'sine', f, i*0.09, i*0.09+0.20, f*1.01, 0.22, 0.001));
    });
    ArcadeSound.registerSFX('gameover', 0.80, (o, n) => {
      osc(o, 'sawtooth', 220, 0, 0.25, 55, 0.30, 0.001);
      osc(o, 'square',   180, 0.15, 0.60, 40, 0.20, 0.001);
      noise(o, n, 0.60, 0.20, 0.001, 250, 'lowpass');
    });
  }

  function _registerMazeMusic() {
    ArcadeSound.registerTheme('maze_lofi', {
      bpm: 82,
      barsPerChord: 2,
      padType: 'sine',
      melType: 'triangle',
      crackle: true,
      chords: [
        { pad: [220.00, 261.63, 329.63, 392.00], bass: 110.00, mel: [329.63, 392.00, 493.88, 523.25, 659.25] },
        { pad: [196.00, 246.94, 293.66, 392.00], bass: 98.00,  mel: [293.66, 392.00, 440.00, 493.88, 587.33] },
        { pad: [174.61, 220.00, 261.63, 349.23], bass: 87.31,  mel: [261.63, 329.63, 392.00, 440.00, 523.25] },
        { pad: [207.65, 261.63, 311.13, 415.30], bass: 103.83, mel: [311.13, 415.30, 466.16, 523.25, 622.25] },
      ],
    });
  }

  // Footstep ticker — called each frame via setFootsteps(true/false)
  let _lastStepAt = 0;
  function _tickFootsteps() {
    if (!_footstepOn) return;
    const now = performance.now();
    if (now - _lastStepAt >= STEP_INTERVAL) {
      _lastStepAt = now;
      ArcadeSound.footstep(_footstepMaterial, _footstepIntensity);
    }
  }

  /* ── Public API ──────────────────────────────────────── */
  function init() {
    const e = window.ArcadeSound;
    if (!e) { console.warn('[SFX] ArcadeSound not loaded'); return; }
    if (_ready) return;

    if (window.ArcadeSoundTuner) {
      ArcadeSoundTuner.setGame('Maze Runner');
      const u = window.currentUser || window.user;
      if (u) ArcadeSoundTuner.setUser(u);
    }

    e.init().then(() => {
      ArcadeSound.registerFootstepMaterial('maze_stone', {
        freq: 440,
        Q: 0.75,
        heelGain: 0.20,
        toeGain: 0.07,
        decayMs: 118,
        toeDelayMs: 76,
        filter: 'lowpass',
        thumpFreq: 108,
        thumpGain: 0.055
      });
      ArcadeSound.registerFootstepMaterial('maze_plate', {
        freq: 560,
        Q: 0.9,
        heelGain: 0.18,
        toeGain: 0.06,
        decayMs: 110,
        toeDelayMs: 66,
        filter: 'lowpass',
        thumpFreq: 115,
        thumpGain: 0.045
      });
      _registerMazeMusic();
      _registerMazeSFX();
      _ready = true;
      if (_ambientRequested) ArcadeSound.startAmbient('maze_lofi');
    });
  }

  function once(name) {
    if (!_ready) return;
    ArcadeSound.play(name);
  }

  // Pass true while player is moving+grounded; call each frame
  function setFootsteps(active, material = 'maze_stone', intensity = 1.0) {
    _footstepOn = active;
    _footstepMaterial = material;
    _footstepIntensity = intensity;
    if (active) _tickFootsteps();
  }

  function startAmbient() {
    _ambientRequested = true;
    if (!_ready) return;
    ArcadeSound.startAmbient('maze_lofi');
  }

  function stopAmbient() {
    _ambientRequested = false;
    ArcadeSound.stopAmbient?.();
  }

  // For future looping ambient (e.g. wind in maze)
  function play(name)    { ArcadeSound.startEnvironment?.(name); }
  function stop()        { ArcadeSound.stopEnvironment?.(); }

  return { init, once, setFootsteps, startAmbient, stopAmbient, play, stop };
})();
