self.onmessage = event => {
  const msg = event.data || {};
  if (msg.type !== 'preload' || !msg.url) return;
  enqueue(msg.url);
};

const seen = new Set();
const queue = [];
let running = false;

function enqueue(url) {
  if (seen.has(url)) return;
  seen.add(url);
  queue.push(url);
  drain();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function drain() {
  if (running) return;
  running = true;

  while (queue.length) {
    const url = queue.shift();
    await preloadGame(url);
    await delay(250);
  }

  running = false;
}

async function preloadGame(url) {
  const absoluteUrl = new URL(url, self.location.href).href;
  postPrefetch(absoluteUrl, 'document');

  try {
    const response = await fetch(absoluteUrl, { cache: 'force-cache' });
    const html = await response.text();
    const assets = extractAssets(html, absoluteUrl).slice(0, 40);

    for (const asset of assets) {
      await delay(140);
      if (new URL(asset.href).origin === self.location.origin) {
        fetch(asset.href, { cache: 'force-cache' }).catch(() => {});
      } else {
        postPrefetch(asset.href, asset.as);
      }
    }

    postMessage({ type: 'done', url: absoluteUrl });
  } catch (err) {
    postMessage({ type: 'error', url: absoluteUrl, message: err && err.message ? err.message : String(err) });
  }
}

function postPrefetch(href, as) {
  postMessage({ type: 'prefetch-link', href, as: as || '' });
}

function extractAssets(html, baseUrl) {
  const assets = [];
  const seenAssets = new Set();
  const patterns = [
    { re: /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, as: 'script' },
    { re: /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, as: '' },
    { re: /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, as: 'image' },
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.re.exec(html))) {
      // <link> tags like preconnect/dns-prefetch point at a bare origin
      // (no path) rather than a fetchable resource — skip those or the
      // browser ends up requesting e.g. "https://fonts.googleapis.com/" and 404s.
      if (/<link\b/i.test(match[0]) && /\brel=["'][^"']*(preconnect|dns-prefetch|prerender)/i.test(match[0])) continue;
      try {
        const href = new URL(match[1], baseUrl).href;
        if (seenAssets.has(href)) continue;
        seenAssets.add(href);
        assets.push({ href, as: inferType(match[0], pattern.as) });
      } catch (_) {}
    }
  }

  return assets;
}

function inferType(tag, fallback) {
  const asMatch = tag.match(/\bas=["']([^"']+)["']/i);
  if (asMatch) return asMatch[1].toLowerCase();
  if (/rel=["'][^"']*stylesheet/i.test(tag)) return 'style';
  return fallback || '';
}
