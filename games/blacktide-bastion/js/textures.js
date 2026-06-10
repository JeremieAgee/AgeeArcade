// textures.js — procedural canvas textures (wood, hull planking, sails, flags, FX sprites)
// All generated at runtime; no external assets.

const GameTextures = (() => {
  const _cache = {};

  function _canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function _hexToRgb(hex) {
    return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
  }

  function _rgbStr(c, mul = 1) {
    const r = Math.min(255, Math.round(c.r * mul));
    const g = Math.min(255, Math.round(c.g * mul));
    const b = Math.min(255, Math.round(c.b * mul));
    return `rgb(${r},${g},${b})`;
  }

  function _tex(canvas, repeatX = 1, repeatY = 1) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 4;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // ── GENERIC WOOD PLANKS (decks, dock, carriages) ─────────────
  function wood(baseHex = 0x6b4a26, key = null) {
    const k = key || ('wood_' + baseHex);
    if (_cache[k]) return _cache[k];

    const W = 256, H = 256;
    const cv = _canvas(W, H);
    const ctx = cv.getContext('2d');
    const base = _hexToRgb(baseHex);

    const rows = 8;
    const rowH = H / rows;
    for (let r = 0; r < rows; r++) {
      const shade = 0.78 + Math.random() * 0.42;
      ctx.fillStyle = _rgbStr(base, shade);
      ctx.fillRect(0, r * rowH, W, rowH);

      // grain streaks
      ctx.globalAlpha = 0.18;
      for (let g = 0; g < 9; g++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
        const gy = r * rowH + Math.random() * rowH;
        ctx.fillRect(0, gy, W, 1);
      }
      ctx.globalAlpha = 1;

      // seam between planks
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, r * rowH, W, 2);

      // butt joints
      const joints = 1 + Math.floor(Math.random() * 2);
      for (let j = 0; j < joints; j++) {
        const jx = Math.random() * W;
        ctx.fillRect(jx, r * rowH, 2, rowH);
      }
    }

    // nail dots
    ctx.fillStyle = 'rgba(20,14,8,0.6)';
    for (let n = 0; n < 40; n++) {
      ctx.beginPath();
      ctx.arc(Math.random() * W, Math.random() * H, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    _cache[k] = _tex(cv, 2, 2);
    return _cache[k];
  }

  // ── STONE BLOCKS (fort walls, platforms) ─────────────────────
  function stone(baseHex = 0x4a443a) {
    const k = 'stone_' + baseHex;
    if (_cache[k]) return _cache[k];

    const W = 256, H = 256;
    const cv = _canvas(W, H);
    const ctx = cv.getContext('2d');
    const base = _hexToRgb(baseHex);

    ctx.fillStyle = _rgbStr(base, 0.55);
    ctx.fillRect(0, 0, W, H);

    const rows = 6, bw = 64;
    const rowH = H / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw * 0.5;
      for (let bx = -1; bx < W / bw + 1; bx++) {
        const shade = 0.8 + Math.random() * 0.4;
        ctx.fillStyle = _rgbStr(base, shade);
        ctx.fillRect(bx * bw + off + 2, r * rowH + 2, bw - 4, rowH - 4);
        // chips and pits
        ctx.globalAlpha = 0.15;
        for (let p = 0; p < 5; p++) {
          ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
          ctx.beginPath();
          ctx.arc(bx * bw + off + Math.random() * bw, r * rowH + Math.random() * rowH,
                  1 + Math.random() * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    _cache[k] = _tex(cv, 2, 1);
    return _cache[k];
  }

  // ── SHIP HULL SIDE ───────────────────────────────────────────
  // UV layout: u = stern→bow, v = 0 port rail → 0.5 keel → 1 starboard rail.
  // Vertically mirrored: rails at both edges, tarred waterline in the middle.
  function hull(baseHex, gunports = 0, goldTrim = false) {
    const k = `hull_${baseHex}_${gunports}_${goldTrim}`;
    if (_cache[k]) return _cache[k];

    const W = 512, H = 256;
    const cv = _canvas(W, H);
    const ctx = cv.getContext('2d');
    const base = _hexToRgb(baseHex);

    // Plank strakes — drawn mirrored around the middle (keel line)
    const half = H / 2;
    const strakes = 10;
    const sH = half / strakes;
    for (const side of [0, 1]) {
      for (let s = 0; s < strakes; s++) {
        const shade = 0.75 + Math.random() * 0.45;
        ctx.fillStyle = _rgbStr(base, shade);
        const y = side === 0 ? s * sH : H - (s + 1) * sH;
        ctx.fillRect(0, y, W, sH);

        ctx.globalAlpha = 0.16;
        for (let g = 0; g < 6; g++) {
          ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
          ctx.fillRect(0, y + Math.random() * sH, W, 1);
        }
        ctx.globalAlpha = 1;

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, y, W, 2);
        for (let j = 0; j < 3; j++) {
          ctx.fillRect(Math.random() * W, y, 2, sH);
        }
      }
    }

    // Tarred lower hull / waterline band (middle of texture = keel)
    const wlH = H * 0.20;
    const grad = ctx.createLinearGradient(0, half - wlH, 0, half + wlH);
    grad.addColorStop(0, 'rgba(10,8,6,0)');
    grad.addColorStop(0.25, 'rgba(12,10,8,0.92)');
    grad.addColorStop(0.75, 'rgba(12,10,8,0.92)');
    grad.addColorStop(1, 'rgba(10,8,6,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, half - wlH, W, wlH * 2);

    // Wales — heavy dark rubbing strakes near each rail
    for (const wy of [H * 0.085, H * 0.915]) {
      ctx.fillStyle = 'rgba(15,10,5,0.85)';
      ctx.fillRect(0, wy - 5, W, 10);
      ctx.fillStyle = 'rgba(255,235,180,0.10)';
      ctx.fillRect(0, wy - 5, W, 2);
    }

    // Gold trim line below the rails (galleons)
    if (goldTrim) {
      ctx.fillStyle = 'rgba(212,168,70,0.85)';
      ctx.fillRect(0, H * 0.035, W, 3);
      ctx.fillRect(0, H * 0.965 - 3, W, 3);
    }

    // Gunports — square ports with lighter lids, mirrored on both rail bands
    if (gunports > 0) {
      const pw = 26, ph = 22;
      for (let p = 0; p < gunports; p++) {
        const px = W * (0.16 + (p / Math.max(1, gunports - 1)) * 0.62) - pw / 2;
        for (const py of [H * 0.155 - ph / 2, H * 0.845 - ph / 2]) {
          // lid frame
          ctx.fillStyle = _rgbStr(base, 1.25);
          ctx.fillRect(px - 3, py - 3, pw + 6, ph + 6);
          // dark opening
          ctx.fillStyle = 'rgb(8,6,4)';
          ctx.fillRect(px, py, pw, ph);
          // hint of a cannon muzzle inside
          ctx.fillStyle = 'rgb(30,30,34)';
          ctx.beginPath();
          ctx.arc(px + pw / 2, py + ph / 2, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Weathering blotches
    ctx.globalAlpha = 0.08;
    for (let b = 0; b < 26; b++) {
      ctx.fillStyle = Math.random() > 0.4 ? '#000' : '#fff';
      ctx.beginPath();
      ctx.arc(Math.random() * W, Math.random() * H, 6 + Math.random() * 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    _cache[k] = _tex(cv);
    return _cache[k];
  }

  // ── SAIL CANVAS ──────────────────────────────────────────────
  function sail(tintHex = 0xd8cfb4) {
    const k = 'sail_' + tintHex;
    if (_cache[k]) return _cache[k];

    const W = 256, H = 256;
    const cv = _canvas(W, H);
    const ctx = cv.getContext('2d');
    const base = _hexToRgb(tintHex);

    ctx.fillStyle = _rgbStr(base);
    ctx.fillRect(0, 0, W, H);

    // Horizontal cloth seams
    for (let y = 0; y < H; y += 34) {
      ctx.fillStyle = 'rgba(60,48,30,0.30)';
      ctx.fillRect(0, y, W, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, y + 2, W, 1);
    }

    // Weather stains and patches
    ctx.globalAlpha = 0.10;
    for (let s = 0; s < 22; s++) {
      ctx.fillStyle = '#5a4828';
      ctx.beginPath();
      ctx.arc(Math.random() * W, Math.random() * H, 8 + Math.random() * 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // A few stitched patch squares
    ctx.globalAlpha = 0.25;
    for (let p = 0; p < 3; p++) {
      const px = Math.random() * (W - 40), py = Math.random() * (H - 40);
      ctx.fillStyle = '#9a8a68';
      ctx.fillRect(px, py, 26 + Math.random() * 16, 22 + Math.random() * 14);
    }
    ctx.globalAlpha = 1;

    _cache[k] = _tex(cv);
    return _cache[k];
  }

  // ── JOLLY ROGER FLAG ─────────────────────────────────────────
  function flag() {
    if (_cache.flag) return _cache.flag;

    const W = 128, H = 80;
    const cv = _canvas(W, H);
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#0c0c10';
    ctx.fillRect(0, 0, W, H);

    // Ragged fly edge
    ctx.fillStyle = '#0c0c10';
    ctx.clearRect(W - 6, 0, 6, H);
    for (let y = 0; y < H; y += 8) {
      ctx.fillRect(W - 6, y, 6, 5);
    }

    const cx = W / 2, cy = H / 2 - 6;
    ctx.fillStyle = '#e8e4da';

    // Crossbones
    ctx.save();
    ctx.translate(cx, cy + 18);
    for (const a of [-0.6, 0.6]) {
      ctx.save();
      ctx.rotate(a);
      ctx.fillRect(-26, -3.5, 52, 7);
      for (const ex of [-26, 26]) {
        ctx.beginPath();
        ctx.arc(ex, -4, 4.5, 0, Math.PI * 2);
        ctx.arc(ex, 4, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();

    // Skull
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 9, cy + 9, 18, 9);

    // Eyes + nose
    ctx.fillStyle = '#0c0c10';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 2, 4, 0, Math.PI * 2);
    ctx.arc(cx + 6, cy - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy + 4);
    ctx.lineTo(cx - 3, cy + 9);
    ctx.lineTo(cx + 3, cy + 9);
    ctx.fill();

    // Teeth lines
    ctx.fillRect(cx - 6, cy + 11, 1.5, 6);
    ctx.fillRect(cx - 1, cy + 11, 1.5, 6);
    ctx.fillRect(cx + 4, cy + 11, 1.5, 6);

    _cache.flag = _tex(cv);
    _cache.flag.wrapS = _cache.flag.wrapT = THREE.ClampToEdgeWrapping;
    return _cache.flag;
  }

  // ── RADIAL SPRITES (smoke, flash, glow) ──────────────────────
  function _radial(key, stops, size = 128) {
    if (_cache[key]) return _cache[key];
    const cv = _canvas(size, size);
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(cv);
    _cache[key] = t;
    return t;
  }

  function smoke() {
    return _radial('smoke', [
      [0, 'rgba(200,195,185,0.65)'],
      [0.45, 'rgba(160,155,148,0.38)'],
      [1, 'rgba(120,115,110,0)'],
    ]);
  }

  function flash() {
    return _radial('flash', [
      [0, 'rgba(255,250,220,1)'],
      [0.25, 'rgba(255,190,80,0.9)'],
      [0.6, 'rgba(255,110,20,0.45)'],
      [1, 'rgba(255,60,0,0)'],
    ]);
  }

  function glow(key = 'glow', inner = 'rgba(220,232,255,0.55)') {
    return _radial(key, [
      [0, inner],
      [0.4, inner.replace(/[\d.]+\)$/, '0.18)')],
      [1, 'rgba(120,150,255,0)'],
    ], 256);
  }

  function ember() {
    return _radial('ember', [
      [0, 'rgba(255,230,170,1)'],
      [0.4, 'rgba(255,140,40,0.8)'],
      [1, 'rgba(200,60,0,0)'],
    ], 64);
  }

  return { wood, stone, hull, sail, flag, smoke, flash, glow, ember };
})();
