// audio.js — Blacktide Bastion sound adapter.
// High-quality procedural synthesis for naval warfare sounds.

const GameAudio = (() => {
  let _enabled = true;
  let _registered = false;

  function _registerSFX() {
    if (_registered || !window.ArcadeSound) return;
    _registered = true;
    const { resonance, chamber, plate, noise, explosion, impact, fire } = ArcadeSound._internal;

    // Cannon — explosive, aggressive artillery boom (not bell-like)
    ArcadeSound.registerSFX('cannon', 0.90, (o, n) => {
      // Full multiband explosion: snap + roar + bass + sub + crackle
      explosion(o, n, 0.90, 85, 1.0);
    });

    // Reload — mechanical metal click
    ArcadeSound.registerSFX('reload', 0.22, (o, n) => {
      // Click impulse
      noise(o, n, 0.06, 0.20, 0.001, 2000, 'highpass');
      // Metal plate resonance
      plate(o, n, 0.20, 300);
    });

    // Ship Hit — sharp crack impact (wood/metal hull getting struck)
    ArcadeSound.registerSFX('shipHit', 0.55, (o, n) => {
      // Sharp transient snap (high-freq wooden crack)
      noise(o, n, 0.08, 0.40, 0.001, 2500, 'highpass');
      // Mid-range impact (wood/metal resonance, but quick decay)
      resonance(o, n, 450, 4, 0.35, 0.25, 0.35);
      // Very short low-end thump (impact weight, quick fade)
      noise(o, n, 0.12, 0.15, 0.001, 150, 'lowpass');
    });

    // Ship Sink — descending catastrophe + water rushing
    ArcadeSound.registerSFX('shipSink', 0.95, (o, n) => {
      // Water intake + structural failure
      noise(o, n, 0.40, 0.45, 0.001, 500, 'lowpass');
      // Sinking resonance (descending from 200Hz to 60Hz)
      chamber(o, n, 0.90, 120, 0.90);
      // Structural groan
      resonance(o, n, 80, 6, 0.88, 0.35, 0.88);
    });

    // Fort Hit — cannon hit on stone fortress (deep boom)
    ArcadeSound.registerSFX('fortHit', 0.85, (o, n) => {
      // Heavy explosion impact
      explosion(o, n, 0.85, 70, 0.95);
    });

    // Splash — chaotic water impact (noise-based, not resonant)
    ArcadeSound.registerSFX('splash', 0.50, (o, n) => {
      // Broad splash impact: white noise burst
      noise(o, n, 0.40, 0.60, 0.001, 800, 'lowpass');   // Initial splash roar
      // Quick secondary spray (aeration)
      noise(o, n, 0.15, 0.15, 0.001, 2000, 'highpass'); // High-freq spray
      // Minimal resonance (just a tiny body, not a drum)
      noise(o, n, 0.20, 0.08, 0.001, 200, 'lowpass');   // Low rumble (brief)
    });

    // Wave Clear — triumphant, victorious
    ArcadeSound.registerSFX('waveClear', 0.50, (o, n) => {
      resonance(o, n, 700, 8, 0.35, 0.28, 0.35);
      resonance(o, n, 1050, 7, 0.32, 0.24, 0.32);
    });

    // Game Over — deep defeat resonance
    ArcadeSound.registerSFX('gameOver', 0.65, (o, n) => {
      chamber(o, n, 0.62, 100, 0.62);
      resonance(o, n, 150, 6, 0.45, 0.20, 0.45);
    });

    // Upgrade — bright confirmation resonance
    ArcadeSound.registerSFX('upgrade', 0.35, (o, n) => {
      resonance(o, n, 800, 7, 0.30, 0.25, 0.30);
      resonance(o, n, 600, 6, 0.28, 0.20, 0.28);
    });
  }

  function init() {
    if (!window.ArcadeSound) {
      console.warn('[GameAudio] ArcadeSound not loaded');
      return;
    }
    if (window.ArcadeSoundTuner) {
      ArcadeSoundTuner.setGame('Blacktide Bastion');
      const u = window.currentUser || window.user;
      if (u) ArcadeSoundTuner.setUser(u);
    }
    ArcadeSound.init({ deferWorklets: true }).then(_registerSFX);
    _registerSFX();
  }

  function play(name) {
    if (!_enabled || !window.ArcadeSound) return;
    ArcadeSound.play(name);
  }

  function setEnabled(v) { _enabled = v; }
  function setVolume(v)  { window.ArcadeSound?.setVolumes({ master: v }); }

  return { init, play, setEnabled, setVolume };
})();
