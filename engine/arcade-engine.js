/**
 * ArcadeEngine — AgeeArcade shared game engine bootstrap.
 *
 * One engine for every cabinet in the arcade. Games no longer ship their own
 * renderer/audio plumbing — they ask the arcade for a context and build their
 * world on top of it.
 *
 * Include once per game page (sound first, then this):
 *   <script src="/engine/sound/engine.js"></script>
 *   <script src="/engine/sound/settings.js"></script>
 *   <script src="/engine/arcade-engine.js"></script>
 *
 * 3D (Three.js must already be loaded):
 *   const g = ArcadeEngine.create3D({
 *     mount: '#canvasMount',          // element/selector to append canvas to, OR
 *     canvas: '#gameCanvas',          // an existing canvas (sized to window)
 *     pixelRatioCap: 1.75,
 *     clearColor: 0x060c18,
 *     shadows: true,
 *     toneMapping: 'aces',            // 'aces' | 'reinhard' | 'none'
 *     exposure: 0.95,
 *     fov: 55, near: 0.1, far: 400,
 *     fog: { color: 0x060c18, near: 55, far: 110 },          // linear
 *     // fog: { type: 'exp2', color: 0x02020a, density: 0.025 } // exponential
 *   });
 *   // → { renderer, scene, camera, clock, resize, onResize, shake, updateShake }
 *
 * 2D:
 *   const g = ArcadeEngine.create2D({ canvas: '#gameCanvas', mount: '#canvasMount' });
 *   // → { canvas, ctx, width, height, resize, onResize }
 *
 * Sound (the audio half of the engine):
 *   ArcadeEngine.sound.init(); ArcadeEngine.sound.play('hit'); …
 */
window.ArcadeEngine = (() => {
  'use strict';

  function _el(ref) {
    if (!ref) return null;
    return typeof ref === 'string' ? document.querySelector(ref) : ref;
  }

  /* ─────────────────────────────────────────────────────
     3D context — standardized Three.js bootstrap
  ───────────────────────────────────────────────────── */
  function create3D(opts = {}) {
    if (typeof THREE === 'undefined') {
      throw new Error('[ArcadeEngine] THREE not loaded — include three.js before arcade-engine.js');
    }

    const mount  = _el(opts.mount);
    const canvas = _el(opts.canvas);
    // Existing fullscreen canvas → size to window; mounted canvas → size to mount
    const getSize = () => (mount
      ? { w: mount.clientWidth, h: mount.clientHeight }
      : { w: window.innerWidth, h: window.innerHeight });

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas || undefined,
      antialias: opts.antialias !== false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.pixelRatioCap || 2));
    const size0 = getSize();
    renderer.setSize(size0.w, size0.h);
    if (opts.clearColor !== undefined) {
      renderer.setClearColor(opts.clearColor, opts.clearColorAlpha === undefined ? 1 : opts.clearColorAlpha);
    }
    renderer.shadowMap.enabled = opts.shadows === true;
    if (opts.shadows) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    const toneMapping = opts.toneMapping || 'aces';
    if (toneMapping === 'aces')     renderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (toneMapping === 'reinhard') renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = opts.exposure === undefined ? 1.0 : opts.exposure;
    if (mount && !canvas) mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    if (opts.fog) {
      const f = opts.fog;
      scene.fog = f.type === 'exp2'
        ? new THREE.FogExp2(f.color, f.density)
        : new THREE.Fog(f.color, f.near, f.far);
    }

    const camera = new THREE.PerspectiveCamera(
      opts.fov || 60,
      size0.w / size0.h,
      opts.near === undefined ? 0.1 : opts.near,
      opts.far === undefined ? 400 : opts.far
    );

    const clock = new THREE.Clock();

    // ── Resize ──────────────────────────────────────────
    const _resizeListeners = [];
    function resize() {
      const { w, h } = getSize();
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      _resizeListeners.forEach(fn => { try { fn(w, h); } catch (_) {} });
    }
    function onResize(fn) { _resizeListeners.push(fn); }
    if (opts.autoResize !== false) window.addEventListener('resize', resize);

    // ── Camera shake ────────────────────────────────────
    let _shakeAmt = 0;
    function shake(amount) { _shakeAmt = Math.max(_shakeAmt, amount); }
    function updateShake(dt, basePos, lookAt) {
      if (_shakeAmt <= 0) return;
      camera.position.set(
        basePos.x + (Math.random() - 0.5) * _shakeAmt,
        basePos.y + (Math.random() - 0.5) * _shakeAmt * 0.5,
        basePos.z
      );
      _shakeAmt = Math.max(0, _shakeAmt - dt * 6);
      if (_shakeAmt <= 0) camera.position.copy(basePos);
      if (lookAt) camera.lookAt(lookAt);
    }

    return { renderer, scene, camera, clock, resize, onResize, shake, updateShake };
  }

  /* ─────────────────────────────────────────────────────
     2D context — canvas bootstrap
  ───────────────────────────────────────────────────── */
  function create2D(opts = {}) {
    const canvas = _el(opts.canvas);
    if (!canvas) throw new Error('[ArcadeEngine] create2D needs an existing <canvas>');
    const mount = _el(opts.mount) || canvas.parentElement;
    const ctx = canvas.getContext('2d');

    const _resizeListeners = [];
    const handle = {
      canvas, ctx,
      get width()  { return canvas.width; },
      get height() { return canvas.height; },
      resize, onResize,
    };
    function resize() {
      const w = mount ? mount.clientWidth : window.innerWidth;
      const h = mount ? mount.clientHeight : window.innerHeight;
      if (!w || !h) return;
      canvas.width = w;
      canvas.height = h;
      _resizeListeners.forEach(fn => { try { fn(w, h); } catch (_) {} });
    }
    function onResize(fn) { _resizeListeners.push(fn); }
    if (opts.autoResize !== false) window.addEventListener('resize', resize);
    resize();

    return handle;
  }

  /* ─────────────────────────────────────────────────────
     Sound — the audio half of the engine (/engine/sound/)
  ───────────────────────────────────────────────────── */
  return {
    create3D,
    create2D,
    get sound()    { return window.ArcadeSound; },
    get settings() { return window.ArcadeSoundSettings; },
  };
})();
