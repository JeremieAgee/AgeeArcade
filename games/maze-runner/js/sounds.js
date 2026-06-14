/**
 * SFX — Maze Runner sound adapter.
 * High-quality procedural synthesis for platformer gameplay.
 * Music remains procedurally generated (arcade style).
 */
window.SFX = (() => {
  let _ready        = false;
  let _footstepOn   = false;
  let _footstepMaterial = 'maze_stone';
  let _footstepIntensity = 1.0;
  let _ambientRequested = false;
  let _stepTimer    = 0;
  const STEP_INTERVAL = 460; // ms between footsteps while moving

  // High-quality SFX with physical modeling
  function _registerMazeSFX() {
    const { resonance, plate, noise, impact, fire } = window.ArcadeSound._internal;

    // Jump — ascending spring/launch energy
    ArcadeSound.registerSFX('jump', 0.28, (o, n) => {
      resonance(o, n, 500, 7, 0.25, 0.20, 0.25);
    });

    // Land — ground impact (stone material, varies by intensity)
    ArcadeSound.registerSFX('land', 0.42, (o, n) => {
      // Stone ground impact with realistic decay
      impact(o, n, 'stone', 0.8, 'medium');
    });

    // Lava — hot, bubbling danger (fire crackle + intense heat)
    ArcadeSound.registerSFX('lava', 0.65, (o, n) => {
      // Lava is hot, bubbly, aggressive
      fire(o, n, 0.65, 0.9);  // Intense fire/boil sound
    });

    // Fall — descending air/wind rush
    ArcadeSound.registerSFX('fall', 0.55, (o, n) => {
      noise(o, n, 0.45, 0.55, 0.001, 2500, 'highpass');
      resonance(o, n, 300, 6, 0.50, 0.25, 0.50);
    });

    // Loot — bright metallic coin chime
    ArcadeSound.registerSFX('loot', 0.25, (o, n) => {
      resonance(o, n, 1100, 8, 0.22, 0.18, 0.22);
    });

    // Life Up — healing resonance (positive reinforcement)
    ArcadeSound.registerSFX('lifeup', 0.32, (o, n) => {
      resonance(o, n, 700, 7, 0.28, 0.22, 0.28);
    });

    // Exit — victory! (triumphant double resonance)
    ArcadeSound.registerSFX('exit', 0.40, (o, n) => {
      resonance(o, n, 900, 7, 0.30, 0.24, 0.30);
      resonance(o, n, 600, 6, 0.28, 0.20, 0.28);
    });

    // Game Over — heavy, solid impact defeat
    ArcadeSound.registerSFX('gameover', 0.60, (o, n) => {
      // Stone impact (solid, heavy, final)
      impact(o, n, 'stone', 1.0, 'large');
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
