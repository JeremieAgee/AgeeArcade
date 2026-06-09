/**
 * ArcadeSound — AgeeArcade shared procedural sound engine
 *
 * Include once per page:
 *   <script src="/sound/engine.js"></script>
 *
 * Then call:
 *   await ArcadeSound.init();
 *   ArcadeSound.play('swing');
 *   ArcadeSound.footstep('stone');
 *   ArcadeSound.startAmbient('lofi_dungeon');
 *   ArcadeSound.startEnvironment('fire');
 */
window.ArcadeSound = (() => {
  'use strict';

  // Detect script base so worklet URLs resolve regardless of which game loads this
  const _base = (() => {
    const s = document.querySelector('script[src*="sound/engine"]');
    if (s) return s.src.replace(/engine\.js(\?.*)?$/, '');
    return '/sound/';
  })();

  /* ─────────────────────────────────────────────────────
     AudioContext
  ───────────────────────────────────────────────────── */
  let _ctx         = null;
  let _masterGain  = null;
  let _musicBusGain = null;
  let _sfxGain     = null;
  let _initPromise = null;
  const _volume = { master: 0.7, music: 1, sfx: 1 };

  function _clampVolume(level) {
    const n = Number(level);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function _applyGain(gainNode, level) {
    if (!gainNode || !_ctx) return;
    const value = _clampVolume(level);
    try {
      gainNode.gain.setTargetAtTime(value, _ctx.currentTime, 0.05);
    } catch (_) {
      gainNode.gain.value = value;
    }
  }

  function _applyVolumes() {
    _applyGain(_masterGain, _volume.master);
    _applyGain(_musicBusGain, _volume.music);
    _applyGain(_sfxGain, _volume.sfx);
  }

  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      _masterGain = _ctx.createGain();
      _musicBusGain = _ctx.createGain();
      _sfxGain = _ctx.createGain();
      _masterGain.gain.value = _volume.master;
      _musicBusGain.gain.value = _volume.music;
      _sfxGain.gain.value = _volume.sfx;
      _musicBusGain.connect(_masterGain);
      _sfxGain.connect(_masterGain);
      _masterGain.connect(_ctx.destination);
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  /* ─────────────────────────────────────────────────────
     Worklets
  ───────────────────────────────────────────────────── */
  let _workletsLoaded = false;
  let _footstepNode   = null;
  let _envNode        = null;
  const _footstepConfigs = {};

  async function _loadWorklets() {
    if (_workletsLoaded) return;
    const c = _getCtx();
    await Promise.all([
      c.audioWorklet.addModule(_base + 'worklets/footstep.js'),
      c.audioWorklet.addModule(_base + 'worklets/environment.js'),
    ]);
    _workletsLoaded = true;

    _footstepNode = new AudioWorkletNode(c, 'arcade-footstep');
    _footstepNode.connect(_sfxGain);
    Object.entries(_footstepConfigs).forEach(([material, params]) => {
      _footstepNode.port.postMessage({ config: { material, params } });
    });

    _envNode = new AudioWorkletNode(c, 'arcade-environment', {
      parameterData: { intensity: 0 },
    });
    _envNode.connect(_sfxGain);
  }

  /* ─────────────────────────────────────────────────────
     SFX — OfflineAudioContext pre-render
  ───────────────────────────────────────────────────── */
  const _sfxBuffers = {};
  const _sfxRendering = {};
  let _sfxPreloadStarted = false;

  function _osc(offCtx, type, freq, t0, t1, freqEnd, gPeak, gEnd) {
    const g = offCtx.createGain();
    g.connect(offCtx.destination);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gPeak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gEnd), t1);
    g.gain.setValueAtTime(0, t1 + 0.001);
    const o = offCtx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t1);
    o.connect(g);
    o.start(t0);
    o.stop(t1 + 0.01);
  }

  function _noise(offCtx, noiseBuf, dur, gPeak, gEnd, fFreq, fType) {
    const src = offCtx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = offCtx.createBiquadFilter();
    filt.type      = fType || 'bandpass';
    filt.frequency.value = fFreq || 800;
    filt.Q.value   = 1.2;
    const g = offCtx.createGain();
    g.gain.setValueAtTime(gPeak, 0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gEnd), dur);
    src.connect(filt); filt.connect(g); g.connect(offCtx.destination);
    src.start(0); src.stop(dur);
  }

  function _renderSFX(dur, buildFn) {
    const SR  = 44100;
    const len = Math.ceil(SR * dur);
    const off = new OfflineAudioContext(1, len, SR);
    const nb  = off.createBuffer(1, len, SR);
    const nd  = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    buildFn(off, nb);
    return off.startRendering();
  }

  // ── SFX definitions ──────────────────────────────────
  // Mutable so tuner or registerSFX can add/replace entries
  const _sfxDefs = {
    // Combat
    swing:        (o, n) => { _noise(o, n, 0.18, 0.30, 0.001, 2200, 'highpass'); _osc(o, 'sawtooth', 320, 0, 0.12, 80, 0.10, 0.001); },
    hit:          (o, n) => { _noise(o, n, 0.10, 0.45, 0.001, 900,  'bandpass'); _osc(o, 'square',   180, 0, 0.08, 60, 0.15, 0.001); },
    heavy_hit:    (o, n) => { _noise(o, n, 0.18, 0.60, 0.001, 400,  'bandpass'); _osc(o, 'sawtooth', 120, 0, 0.15, 40, 0.25, 0.001); _osc(o, 'square', 80, 0.02, 0.18, 30, 0.15, 0.001); },
    slash:        (o, n) => { _noise(o, n, 0.12, 0.25, 0.001, 3500, 'highpass'); _osc(o, 'sawtooth', 500, 0, 0.10, 100, 0.08, 0.001); },
    block:        (o, n) => { _noise(o, n, 0.12, 0.35, 0.001, 1500, 'bandpass'); _osc(o, 'square',   300, 0, 0.10, 200, 0.20, 0.001); },
    // Character
    enemy_death:  (o, n) => { _noise(o, n, 0.22, 0.35, 0.001, 400, 'lowpass');  _osc(o, 'sawtooth', 200, 0, 0.20, 40,  0.12, 0.001); },
    player_hurt:  (o)    => { _osc(o, 'sawtooth', 440, 0, 0.06, 220, 0.22, 0.001); _osc(o, 'square', 330, 0.04, 0.14, 110, 0.15, 0.001); },
    player_death: (o, n) => { _osc(o, 'sawtooth', 300, 0, 0.08, 80, 0.30, 0.001); _osc(o, 'square', 200, 0.06, 0.40, 40, 0.20, 0.001); _noise(o, n, 0.45, 0.25, 0.001, 300, 'lowpass'); },
    // UI / Pickups
    level_up:     (o)    => { [261, 329, 392, 523].forEach((f, i) => _osc(o, 'sine', f, i*0.10, i*0.10+0.18, f*1.02, 0.25, 0.001)); _osc(o, 'triangle', 1046, 0.35, 0.70, 880, 0.18, 0.001); },
    coin:         (o)    => { _osc(o, 'sine', 1200, 0, 0.06, 1600, 0.20, 0.001); _osc(o, 'sine', 1800, 0.04, 0.18, 2200, 0.12, 0.001); },
    pickup:       (o)    => { _osc(o, 'sine', 660, 0, 0.08, 880, 0.18, 0.001); _osc(o, 'sine', 990, 0.04, 0.20, 1320, 0.10, 0.001); },
    error:        (o)    => { _osc(o, 'square', 180, 0, 0.08, 120, 0.20, 0.001); _osc(o, 'square', 140, 0.06, 0.20, 100, 0.15, 0.001); },
    // Environment
    chest_open:   (o)    => { _osc(o, 'sawtooth', 180, 0, 0.15, 120, 0.16, 0.001); _osc(o, 'sine', 880, 0.12, 0.48, 1320, 0.12, 0.001); _osc(o, 'sine', 1100, 0.18, 0.52, 1760, 0.09, 0.001); },
    portal:       (o, n) => { _osc(o, 'sine', 60, 0, 1.2, 30, 0.32, 0.001); _osc(o, 'sawtooth', 220, 0, 0.8, 440, 0.10, 0.001); _osc(o, 'sine', 1200, 0.1, 1.0, 2400, 0.09, 0.001); _noise(o, n, 0.9, 0.12, 0.001, 1800, 'highpass'); },
    door_open:    (o, n) => { _osc(o, 'sawtooth', 140, 0, 0.4, 80, 0.18, 0.001); _noise(o, n, 0.30, 0.20, 0.001, 350, 'bandpass'); },
    boss_roar:    (o, n) => { _osc(o, 'sawtooth', 80, 0, 0.6, 40, 0.35, 0.001); _osc(o, 'square', 60, 0.10, 0.8, 30, 0.25, 0.001); _osc(o, 'sawtooth', 160, 0.05, 0.5, 80, 0.18, 0.001); _noise(o, n, 0.65, 0.25, 0.001, 200, 'lowpass'); },
    explosion:    (o, n) => { _noise(o, n, 0.6, 0.8, 0.001, 150, 'lowpass'); _osc(o, 'sawtooth', 60, 0, 0.3, 20, 0.4, 0.001); },
    magic:        (o, n) => { _osc(o, 'sine', 800, 0, 0.5, 1600, 0.15, 0.001); _osc(o, 'sine', 1200, 0.1, 0.6, 2400, 0.10, 0.001); _noise(o, n, 0.4, 0.08, 0.001, 4000, 'highpass'); },
    // Maze Runner
    wall_hit:     (o, n) => { _noise(o, n, 0.10, 0.30, 0.001, 500, 'bandpass'); _osc(o, 'square', 200, 0, 0.08, 100, 0.12, 0.001); },
    goal:         (o)    => { [392, 523, 659, 784].forEach((f, i) => _osc(o, 'sine', f, i*0.08, i*0.08+0.25, f*1.01, 0.20, 0.001)); },
  };

  const _sfxDurations = {
    swing: 0.22, hit: 0.14, heavy_hit: 0.25, slash: 0.16, block: 0.16,
    enemy_death: 0.30, player_hurt: 0.20, player_death: 0.55,
    level_up: 0.80, coin: 0.25, pickup: 0.28, error: 0.28,
    chest_open: 0.60, portal: 1.30, door_open: 0.45, boss_roar: 0.90,
    explosion: 0.70, magic: 0.70, wall_hit: 0.14, goal: 0.70,
  };

  function _scheduleIdle(fn) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn, { timeout: 500 });
    } else {
      setTimeout(fn, 0);
    }
  }

  function _renderSFXCached(name) {
    if (_sfxBuffers[name]) return Promise.resolve(_sfxBuffers[name]);
    if (_sfxRendering[name]) return _sfxRendering[name];
    if (!_sfxDefs[name]) return Promise.resolve(null);

    _sfxRendering[name] = _renderSFX(_sfxDurations[name] || 0.5, _sfxDefs[name])
      .then(buf => {
        _sfxBuffers[name] = buf;
        return buf;
      })
      .finally(() => {
        delete _sfxRendering[name];
      });
    return _sfxRendering[name];
  }

  function _preloadSFX() {
    if (_sfxPreloadStarted) return;
    _sfxPreloadStarted = true;

    const names = Object.keys(_sfxDefs);
    let i = 0;

    const renderNext = () => {
      if (i >= names.length) return;
      const name = names[i++];
      _renderSFXCached(name).finally(() => _scheduleIdle(renderNext));
    };

    _scheduleIdle(renderNext);
  }

  /* ─────────────────────────────────────────────────────
     Music Scheduler — theme-based
  ───────────────────────────────────────────────────── */
  const THEMES = {
    lofi_dungeon: {
      bpm: 78,
      barsPerChord: 2,
      padType: 'sine',
      melType: 'triangle',
      crackle: true,
      chords: [
        { pad: [261.63,311.13,392.00,466.16,587.33], bass: 130.81, mel: [261.63,311.13,392.00,466.16,587.33,523.25] },
        { pad: [207.65,261.63,311.13,392.00],        bass: 207.65, mel: [207.65,261.63,311.13,392.00,466.16,523.25] },
        { pad: [311.13,392.00,466.16,587.33],        bass: 155.56, mel: [311.13,392.00,466.16,587.33,698.46]        },
        { pad: [233.08,293.66,349.23,415.30],        bass: 110.00, mel: [233.08,293.66,349.23,415.30,523.25,622.25] },
      ],
    },
    upbeat_arcade: {
      bpm: 120,
      barsPerChord: 2,
      padType: 'square',
      melType: 'sine',
      crackle: false,
      chords: [
        { pad: [261.63,329.63,392.00,523.25], bass: 130.81, mel: [261.63,329.63,392.00,523.25,659.25] },
        { pad: [220.00,261.63,329.63,440.00], bass: 110.00, mel: [220.00,261.63,329.63,440.00,523.25] },
        { pad: [174.61,261.63,349.23,523.25], bass: 174.61, mel: [261.63,349.23,523.25,698.46]        },
        { pad: [196.00,246.94,392.00,493.88], bass: 196.00, mel: [246.94,392.00,493.88,587.33]        },
      ],
    },
  };

  let _musicGain    = null;
  let _musicTimer   = null;
  let _chordIdx     = 0;
  let _nextT        = 0;
  let _crackleNode  = null;
  let _activeTheme  = null;

  function _schedPad(theme, chord, t0, dur) {
    const c = _getCtx();
    chord.pad.forEach((freq, i) => {
      [-4, 0, 4].forEach(cents => {
        const o = c.createOscillator();
        o.type = theme.padType || 'sine';
        o.frequency.value = freq * Math.pow(2, (cents + (Math.random()-0.5)*3) / 1200);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800 - i*120; lp.Q.value = 0.7;
        const g = c.createGain();
        const atk = 0.6 + i*0.08;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.055, t0 + atk);
        g.gain.setValueAtTime(0.055, t0 + dur - 1.2);
        g.gain.linearRampToValueAtTime(0, t0 + dur);
        o.connect(lp); lp.connect(g); g.connect(_musicGain);
        o.start(t0); o.stop(t0 + dur + 0.05);
      });
    });
  }

  function _schedBass(theme, chord, t0) {
    const c   = _getCtx();
    const bar = (60 / theme.bpm) * 4;
    [[chord.bass, 0], [chord.bass*1.5, bar]].forEach(([freq, off]) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
      const g = c.createGain();
      const t = t0 + off;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + bar - 0.1);
      o.connect(lp); lp.connect(g); g.connect(_musicGain);
      o.start(t); o.stop(t + bar);
    });
  }

  function _schedMel(theme, chord, t0, dur) {
    const c    = _getCtx();
    const beat = 60 / theme.bpm;
    const n    = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const freq = chord.mel[Math.floor(Math.random() * chord.mel.length)];
      const off  = Math.random() * (dur - beat);
      const len  = beat * (0.4 + Math.random() * 0.6);
      const t    = t0 + off;
      const o = c.createOscillator(); o.type = theme.melType || 'triangle'; o.frequency.value = freq;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(lp); lp.connect(g); g.connect(_musicGain);
      o.start(t); o.stop(t + len + 0.05);
    }
  }

  function _startCrackle(theme = {}) {
    const c = _getCtx();
    const SR = c.sampleRate; const len = SR * 4;
    const buf = c.createBuffer(1, len, SR);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    _crackleNode = c.createBufferSource();
    _crackleNode.buffer = buf; _crackleNode.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = c.createGain(); g.gain.value = theme.crackleGain == null ? 0.012 : theme.crackleGain;
    _crackleNode.connect(lp); lp.connect(g); g.connect(_musicGain);
    _crackleNode.start();
  }

  function _scheduleChord() {
    try {
      const c     = _getCtx();
      const theme = _activeTheme;
      const beat  = 60 / theme.bpm;
      const dur   = beat * 4 * theme.barsPerChord;
      const chord = theme.chords[_chordIdx % theme.chords.length];

      _schedPad (theme, chord, _nextT, dur);
      _schedBass(theme, chord, _nextT);
      _schedMel (theme, chord, _nextT, dur);

      _nextT    += dur;
      _chordIdx  = (_chordIdx + 1) % theme.chords.length;

      const delay = (_nextT - c.currentTime - beat) * 1000;
      _musicTimer = setTimeout(_scheduleChord, Math.max(200, delay));
    } catch (e) { console.error('[ArcadeSound] music error', e); }
  }

  /* ─────────────────────────────────────────────────────
     Public API
  ───────────────────────────────────────────────────── */
  async function init(options = {}) {
    const deferWorklets = options.deferWorklets === true;
    const preloadSFX = options.preloadSFX !== false;
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      _getCtx();
      const loadWorklets = async () => {
        try {
          await _loadWorklets();
        } catch (e) {
          console.warn('[ArcadeSound] AudioWorklets unavailable; footstep/env disabled.', e.message);
        }
      };
      if (deferWorklets) {
        loadWorklets();
      } else {
        await loadWorklets();
      }
      if (preloadSFX) _preloadSFX();
    })();
    return _initPromise;
  }

  function play(name) {
    const buf = _sfxBuffers[name];
    if (!buf) {
      _renderSFXCached(name);
      return;
    }
    try {
      const c   = _getCtx();
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(_sfxGain);
      src.start();
    } catch (_) {}
  }

  function footstep(material = 'stone', intensity = 1.0) {
    if (_footstepNode) _footstepNode.port.postMessage({ trigger: true, material, intensity });
  }

  function registerFootstepMaterial(material, params) {
    if (!material || !params) return;
    _footstepConfigs[material] = { ...(_footstepConfigs[material] || {}), ...params };
    if (_footstepNode) {
      _footstepNode.port.postMessage({ config: { material, params: _footstepConfigs[material] } });
    }
  }

  function startEnvironment(type = 'fire', intensity = 1.0) {
    if (!_envNode) return;
    _envNode.port.postMessage({ type });
    _envNode.parameters.get('intensity').setTargetAtTime(intensity, _getCtx().currentTime, 0.5);
  }

  function stopEnvironment() {
    if (!_envNode) return;
    _envNode.parameters.get('intensity').setTargetAtTime(0, _getCtx().currentTime, 0.8);
  }

  function startAmbient(themeName = 'lofi_dungeon') {
    if (_musicGain) return;
    const theme = THEMES[themeName] || THEMES.lofi_dungeon;
    _activeTheme = theme;
    const c = _getCtx();
    _musicGain = c.createGain();
    _musicGain.connect(_musicBusGain);
    _musicGain.gain.setValueAtTime(0, c.currentTime);
    _musicGain.gain.linearRampToValueAtTime(theme.gain == null ? 0.55 : theme.gain, c.currentTime + 3);
    _chordIdx = 0;
    _nextT    = c.currentTime + 0.2;
    if (theme.crackle) _startCrackle(theme);
    _scheduleChord();
  }

  function stopAmbient() {
    clearTimeout(_musicTimer); _musicTimer = null;
    if (_crackleNode) { try { _crackleNode.stop(); } catch (_) {} _crackleNode = null; }
    if (_musicGain) {
      const c = _getCtx();
      const fadingGain = _musicGain;
      fadingGain.gain.setValueAtTime(fadingGain.gain.value, c.currentTime);
      fadingGain.gain.linearRampToValueAtTime(0, c.currentTime + 2);
      _musicGain = null;
      setTimeout(() => { try { fadingGain.disconnect(); } catch (_) {} }, 2100);
    }
  }

  function setVolume(level) {
    setVolumes({ master: level });
  }

  function setVolumes(levels = {}) {
    if (Object.prototype.hasOwnProperty.call(levels, 'master')) _volume.master = _clampVolume(levels.master);
    if (Object.prototype.hasOwnProperty.call(levels, 'music')) _volume.music = _clampVolume(levels.music);
    if (Object.prototype.hasOwnProperty.call(levels, 'sfx')) _volume.sfx = _clampVolume(levels.sfx);
    _applyVolumes();
  }

  function getVolumes() {
    return { ..._volume };
  }

  function stopAll() {
    stopAmbient();
    stopEnvironment();
    clearTimeout(_musicTimer);
    try { if (_ctx) _ctx.close(); } catch (_) {}
    _ctx = null; _masterGain = null; _musicBusGain = null; _sfxGain = null; _footstepNode = null; _envNode = null;
    _musicGain = null; _crackleNode = null; _workletsLoaded = false;
    _initPromise = null; _sfxPreloadStarted = false;
    for (const k in _sfxBuffers) delete _sfxBuffers[k];
    for (const k in _sfxRendering) delete _sfxRendering[k];
  }

  // Allow games to add or replace SFX definitions at runtime
  function registerSFX(name, duration, buildFn) {
    _sfxDefs[name]     = buildFn;
    _sfxDurations[name] = duration;
    delete _sfxBuffers[name];
    _scheduleIdle(() => { _renderSFXCached(name); });
  }

  // Allow games to register custom music themes
  function registerTheme(name, theme) {
    THEMES[name] = theme;
  }

  // Expose internals needed by the tuner and game-specific sound wrappers
  const _internal = {
    get sfxDefs()      { return _sfxDefs; },
    get sfxDurations() { return _sfxDurations; },
    get themes()       { return THEMES; },
    get footstepNode() { return _footstepNode; },
    get envNode()      { return _envNode; },
    osc:       _osc,
    noise:     _noise,
    renderSFX: _renderSFX,
    reloadSFX(name) {
      if (_sfxDefs[name]) {
        _renderSFX(_sfxDurations[name] || 0.5, _sfxDefs[name]).then(buf => { _sfxBuffers[name] = buf; });
      }
    },
    setSFXBuffer(name, buf) { _sfxBuffers[name] = buf; },
  };

  return { init, play, footstep, registerFootstepMaterial, startEnvironment, stopEnvironment, startAmbient, stopAmbient, setVolume, setVolumes, getVolumes, stopAll, registerSFX, registerTheme, _internal };
})();
