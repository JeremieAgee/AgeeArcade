// audio.js — Blacktide Bastion sound adapter.
// Delegates to the shared ArcadeSound engine (/engine/sound/engine.js) and
// registers the game's cannon/ship/fort SFX there. Keeps the GameAudio API
// so game.js / hud.js call sites need no changes.

const GameAudio = (() => {
  let _enabled = true;
  let _registered = false;

  function _registerSFX() {
    if (_registered || !window.ArcadeSound) return;
    _registered = true;
    const { osc, noise } = ArcadeSound._internal;

    ArcadeSound.registerSFX('cannon', 0.50, (o, n) => {
      osc(o, 'sine', 60, 0, 0.32, 40, 0.44, 0.001);
      osc(o, 'sine', 40, 0.02, 0.45, 30, 0.33, 0.001);
      noise(o, n, 0.22, 0.22, 0.001, 300, 'lowpass');
    });
    ArcadeSound.registerSFX('reload', 0.14, (o) => {
      osc(o, 'square', 200, 0, 0.08, 200, 0.08, 0.001);
      osc(o, 'square', 260, 0.02, 0.10, 260, 0.07, 0.001);
    });
    ArcadeSound.registerSFX('shipHit', 0.22, (o, n) => {
      noise(o, n, 0.18, 0.28, 0.001, 1200, 'lowpass');
      osc(o, 'sawtooth', 120, 0, 0.15, 80, 0.17, 0.001);
    });
    ArcadeSound.registerSFX('shipSink', 0.95, (o, n) => {
      osc(o, 'sine', 320, 0, 0.90, 60, 0.28, 0.001);
      noise(o, n, 0.35, 0.17, 0.001, 600, 'lowpass');
    });
    ArcadeSound.registerSFX('fortHit', 0.65, (o, n) => {
      osc(o, 'sine', 55, 0, 0.60, 45, 0.50, 0.001);
      noise(o, n, 0.40, 0.33, 0.001, 400, 'lowpass');
    });
    ArcadeSound.registerSFX('waveClear', 0.70, (o) => {
      [440, 550, 660].forEach((f, i) => osc(o, 'sine', f, i * 0.08, i * 0.08 + 0.40, f, 0.19, 0.001));
    });
    ArcadeSound.registerSFX('gameOver', 0.95, (o) => {
      [220, 180, 140, 100].forEach((f, i) => osc(o, 'sine', f, i * 0.12, i * 0.12 + 0.55, f, 0.22, 0.001));
    });
    ArcadeSound.registerSFX('upgrade', 0.45, (o) => {
      [330, 440, 550].forEach((f, i) => osc(o, 'sine', f, i * 0.06, i * 0.06 + 0.25, f, 0.17, 0.001));
    });
    ArcadeSound.registerSFX('splash', 0.30, (o, n) => {
      noise(o, n, 0.25, 0.17, 0.001, 1500, 'lowpass');
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
