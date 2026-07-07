import { AGEE, AGEEConfig } from "../external-engine-src/engine/index";

type ElementRef = string | HTMLElement | HTMLCanvasElement;

type ResizeListener = (width: number, height: number) => void;

interface FogOptions {
  color: number;
  near: number;
  far: number;
  type?: "exp2";
  density?: number;
}

interface Create3DOptions {
  mount?: ElementRef;
  canvas?: ElementRef;
  pixelRatioCap?: number;
  clearColor?: number;
  clearColorAlpha?: number;
  shadows?: boolean;
  toneMapping?: "aces" | "reinhard" | "none";
  exposure?: number;
  fov?: number;
  near?: number;
  far?: number;
  fog?: FogOptions;
  autoResize?: boolean;
  renderBackend?: "webgl" | "webgpu";
}

interface Create3DResult {
  renderer: any;
  scene: any;
  camera: any;
  clock: any;
  engine: AGEE;
  resize: () => void;
  onResize: (listener: ResizeListener) => void;
  shake: (amount: number) => void;
  updateShake: (dt: number, basePos: { x: number; y: number; z: number }, lookAt?: any) => void;
}

function _el(ref?: ElementRef): HTMLElement | HTMLCanvasElement | null {
  if (!ref) return null;
  return typeof ref === "string" ? document.querySelector(ref) : ref;
}

function _toNumber(value: any, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function _applyFog(scene: any, fog?: FogOptions) {
  if (!fog) return;
  scene.fog = fog.type === "exp2"
    ? new (window as any).THREE.FogExp2(fog.color, fog.density ?? 0.025)
    : new (window as any).THREE.Fog(fog.color, fog.near, fog.far);
}

function _applyRenderOptions(renderer: any, camera: any, scene: any, opts: Create3DOptions) {
  if (typeof renderer.setPixelRatio === "function") {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.pixelRatioCap ?? 2));
  }

  if (opts.clearColor !== undefined && typeof renderer.setClearColor === "function") {
    renderer.setClearColor(opts.clearColor, opts.clearColorAlpha === undefined ? 1 : opts.clearColorAlpha);
  }

  if (opts.shadows !== undefined && renderer.shadowMap) {
    renderer.shadowMap.enabled = opts.shadows === true;
    if (opts.shadows && renderer.shadowMap.type !== undefined) {
      renderer.shadowMap.type = (window as any).THREE?.PCFSoftShadowMap ?? renderer.shadowMap.type;
    }
  }

  if (opts.toneMapping && renderer.toneMapping !== undefined) {
    if (opts.toneMapping === "aces") renderer.toneMapping = (window as any).THREE?.ACESFilmicToneMapping ?? renderer.toneMapping;
    if (opts.toneMapping === "reinhard") renderer.toneMapping = (window as any).THREE?.ReinhardToneMapping ?? renderer.toneMapping;
    if (opts.toneMapping === "none") renderer.toneMapping = (window as any).THREE?.NoToneMapping ?? renderer.toneMapping;
  }

  if (opts.exposure !== undefined && renderer.toneMappingExposure !== undefined) {
    renderer.toneMappingExposure = opts.exposure;
  }

  if (opts.fov !== undefined) {
    camera.fov = opts.fov;
    camera.updateProjectionMatrix();
  }

  camera.near = _toNumber(opts.near, camera.near);
  camera.far = _toNumber(opts.far, camera.far);
  camera.updateProjectionMatrix();
  _applyFog(scene, opts.fog);
}

function create3D(opts: Create3DOptions = {}): Create3DResult {
  const mount = _el(opts.mount);
  const canvas = _el(opts.canvas) as HTMLCanvasElement | null;
  const targetCanvas = canvas || document.createElement("canvas");

  if (mount && !canvas) {
    mount.appendChild(targetCanvas);
  }

  const config: AGEEConfig = {
    canvas: targetCanvas,
    renderBackend: opts.renderBackend ?? "webgl",
  };

  const engine = new AGEE(config);
  const resizeListeners: ResizeListener[] = [];
  let shakeAmount = 0;
  const basePosition = { x: 0, y: 0, z: 0 };

  function resize() {
    const width = mount ? mount.clientWidth : window.innerWidth;
    const height = mount ? mount.clientHeight : window.innerHeight;
    if (!width || !height) return;
    const renderer = engine.render.renderer;
    if (typeof renderer.setSize === "function") {
      renderer.setSize(width, height);
    }
    const camera = engine.render.camera;
    if (camera) {
      camera.aspect = width / height;
      if (typeof camera.updateProjectionMatrix === "function") {
        camera.updateProjectionMatrix();
      }
    }
    resizeListeners.forEach(fn => fn(width, height));
  }

  function onResize(listener: ResizeListener) {
    resizeListeners.push(listener);
  }

  function shake(amount: number) {
    shakeAmount = Math.max(shakeAmount, amount);
  }

  function updateShake(dt: number, basePos: { x: number; y: number; z: number }, lookAt?: any) {
    const camera = engine.render.camera;
    if (!camera) return;
    if (shakeAmount <= 0) return;
    if (!basePosition.x && !basePosition.y && !basePosition.z) {
      basePosition.x = camera.position.x;
      basePosition.y = camera.position.y;
      basePosition.z = camera.position.z;
    }

    camera.position.set(
      basePos.x + (Math.random() - 0.5) * shakeAmount,
      basePos.y + (Math.random() - 0.5) * shakeAmount * 0.5,
      basePos.z + (Math.random() - 0.5) * shakeAmount
    );
    shakeAmount = Math.max(0, shakeAmount - dt * 6);
    if (shakeAmount <= 0) {
      camera.position.set(basePos.x, basePos.y, basePos.z);
    }
    if (lookAt && typeof camera.lookAt === "function") {
      camera.lookAt(lookAt);
    }
  }

  engine.init().then(() => {
    _applyRenderOptions(engine.render.renderer, engine.render.camera, engine.render.scene, opts);
    resize();
  }).catch(error => {
    console.error("[ArcadeEngine] Error initializing AGEE engine:", error);
  });

  if (opts.autoResize !== false) {
    window.addEventListener("resize", resize);
  }

  return {
    renderer: engine.render.renderer,
    scene: engine.render.scene,
    camera: engine.render.camera,
    clock: engine.clock,
    engine,
    resize,
    onResize,
    shake,
    updateShake,
  };
}

function create2D(opts: { canvas?: ElementRef; mount?: ElementRef; autoResize?: boolean } = {}) {
  const canvas = _el(opts.canvas) as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('[ArcadeEngine] create2D needs an existing <canvas>');
  }
  const mount = _el(opts.mount) || canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const listeners: ResizeListener[] = [];

  function resize() {
    const width = mount ? mount.clientWidth : window.innerWidth;
    const height = mount ? mount.clientHeight : window.innerHeight;
    if (!width || !height) return;
    canvas.width = width;
    canvas.height = height;
    listeners.forEach(fn => fn(width, height));
  }

  function onResize(listener: ResizeListener) {
    listeners.push(listener);
  }

  if (opts.autoResize !== false) {
    window.addEventListener("resize", resize);
  }

  resize();

  return {
    canvas,
    ctx,
    get width() { return canvas.width; },
    get height() { return canvas.height; },
    resize,
    onResize,
  };
}

const ArcadeEngine = {
  create3D,
  create2D,
  get sound() {
    return (window as any).ArcadeSound;
  },
  get settings() {
    return (window as any).ArcadeSoundSettings;
  },
};

(window as any).ArcadeEngine = ArcadeEngine;

export default ArcadeEngine;
export { ArcadeEngine, create3D, create2D };
