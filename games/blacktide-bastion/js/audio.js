// audio.js — procedural Web Audio API sounds (no asset files required)

const GameAudio = (() => {
  let ctx = null;
  let masterGain = null;
  let _enabled = true;

  function init() {
    // Context created on first user gesture (see boot in game.js)
  }

  function _ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.55;
      masterGain.connect(ctx.destination);
      return true;
    } catch (e) {
      return false;
    }
  }

  function setEnabled(v) { _enabled = v; }
  function setVolume(v)  { if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v)); }

  function _osc(type, freq, duration, gainPeak, fadeStart) {
    if (!_enabled || !_ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
    g.gain.setValueAtTime(gainPeak, now + (fadeStart || duration * 0.4));
    g.gain.linearRampToValueAtTime(0, now + duration);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration);
  }

  function _noise(duration, gainPeak, lpFreq) {
    if (!_enabled || !_ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    const now    = ctx.currentTime;
    const len    = Math.ceil(ctx.sampleRate * duration);
    const buf    = ctx.createBuffer(1, len, ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src    = ctx.createBufferSource();
    src.buffer   = buf;

    const filt   = ctx.createBiquadFilter();
    filt.type    = 'lowpass';
    filt.frequency.value = lpFreq || 800;

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainPeak, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filt);
    filt.connect(g);
    g.connect(masterGain);
    src.start(now);
    src.stop(now + duration);
  }

  const SFX = {
    cannon() {
      // Low boom + noise burst
      _osc('sine', 60, 0.32, 0.8, 0.02);
      _osc('sine', 40, 0.45, 0.6, 0.04);
      _noise(0.22, 0.4, 300);
    },
    reload() {
      _osc('square', 200, 0.08, 0.15);
      _osc('square', 260, 0.08, 0.12);
    },
    shipHit() {
      _noise(0.18, 0.5, 1200);
      _osc('sawtooth', 120, 0.15, 0.3, 0.02);
    },
    shipSink() {
      // Descending pitch
      if (!_enabled || !_ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.9);
      g.gain.setValueAtTime(0.5, now);
      g.gain.linearRampToValueAtTime(0, now + 0.9);
      osc.connect(g); g.connect(masterGain);
      osc.start(now); osc.stop(now + 0.9);
      _noise(0.35, 0.3, 600);
    },
    fortHit() {
      _osc('sine', 55, 0.6, 0.9, 0.02);
      _noise(0.4, 0.6, 400);
    },
    waveClear() {
      // Ascending chord
      [440, 550, 660].forEach((f, i) => {
        setTimeout(() => _osc('sine', f, 0.4, 0.35), i * 80);
      });
    },
    gameOver() {
      [220, 180, 140, 100].forEach((f, i) => {
        setTimeout(() => _osc('sine', f, 0.55, 0.4), i * 120);
      });
    },
    upgrade() {
      [330, 440, 550].forEach((f, i) => {
        setTimeout(() => _osc('sine', f, 0.25, 0.3), i * 60);
      });
    },
    splash() {
      _noise(0.25, 0.3, 1500);
    },
  };

  function play(name) {
    if (SFX[name]) SFX[name]();
  }

  return { init, play, setEnabled, setVolume };
})();
