/**
 * Service Worker — Agee Arcade PWA
 * 
 * Caching strategy:
 *  - Shell (HTML, CSS, JS): cache-first + network update
 *  - Images: cache-first, lazy-load
 *  - API calls (Supabase, ads): network-first
 *  - External CDN (Three.js, fonts): cache-first
 */

const CACHE_VERSION = 'agee-arcade-v1';
const SHELL_CACHE = 'agee-arcade-shell-v1';
const RUNTIME_CACHE = 'agee-arcade-runtime-v1';
const IMG_CACHE = 'agee-arcade-images-v1';

// Assets loaded on every app launch
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/main.css',
  '/css/cabinet-3d.css',
  '/js/main.js',
  '/js/games.js',
  '/js/arcade-auth.js',
  '/js/analytics.js',
  '/arcade/game-frame.js',
  '/arcade/cabinets.js',
  '/arcade/player.js',
  '/arcade/scene.js',
];

// External libraries (assumed to be on CDN)
const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/js-base64@3/base64.min.js',
];

// Install: pre-cache shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => {
        return Promise.all([
          cache.addAll(SHELL_ASSETS),
          caches.open(RUNTIME_CACHE).then(rtCache =>
            Promise.all(EXTERNAL_ASSETS.map(url =>
              fetch(url, { credentials: 'omit' })
                .then(resp => resp.ok ? rtCache.put(url, resp) : null)
                .catch(() => null)
            ))
          ),
        ]);
      })
      .catch(err => console.error('SW install error:', err))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name => 
              name !== SHELL_CACHE && 
              name !== RUNTIME_CACHE && 
              name !== IMG_CACHE
            )
            .map(name => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: routing strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin, non-GET
  if (!url.origin.includes(self.location.origin) || request.method !== 'GET') {
    return;
  }

  // Network-first for API calls
  if (url.pathname.includes('/api/') || 
      url.hostname.includes('supabase') ||
      url.hostname.includes('googlesyndication') ||
      url.hostname.includes('doubleclick')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for images
  if (request.destination === 'image') {
    event.respondWith(cacheFirstImg(request));
    return;
  }

  // Cache-first for fonts & external libraries
  if (url.pathname.endsWith('.woff2') || 
      url.pathname.endsWith('.woff') ||
      url.pathname.includes('fonts.googleapis') ||
      url.pathname.includes('cdnjs.cloudflare') ||
      url.pathname.includes('cdn.jsdelivr')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Cache-first with update for HTML/CSS/JS (shell)
  if (request.destination === 'document' || 
      request.destination === 'script' ||
      request.destination === 'style') {
    event.respondWith(cacheFirstWithUpdate(request));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirst(request));
});

// ── Cache strategies ────────────────────────────────────

/** Cache-first: use cache, fall back to network */
function cacheFirst(request) {
  return caches.match(request)
    .then(cached => cached || fetch(request).then(resp => {
      if (!resp.ok) return resp;
      const cache = caches.open(RUNTIME_CACHE);
      cache.then(c => c.put(request, resp.clone()));
      return resp;
    }))
    .catch(() => new Response('Offline', { status: 503 }));
}

/** Cache-first with update: serve cache, update in background */
function cacheFirstWithUpdate(request) {
  return caches.match(request).then(cached => {
    const fetchPromise = fetch(request)
      .then(resp => {
        if (!resp.ok) return resp;
        const cache = caches.open(SHELL_CACHE);
        cache.then(c => c.put(request, resp.clone()));
        // Notify clients of update
        self.clients.matchAll().then(clients =>
          clients.forEach(client =>
            client.postMessage({
              type: 'CACHE_UPDATED',
              url: request.url,
            })
          )
        );
        return resp;
      })
      .catch(() => cached || new Response('Offline', { status: 503 }));

    return cached || fetchPromise;
  });
}

/** Cache-first for images: don't block on network */
function cacheFirstImg(request) {
  return caches.match(request)
    .then(cached => cached || fetch(request).then(resp => {
      if (!resp.ok) return resp;
      caches.open(IMG_CACHE).then(c => c.put(request, resp.clone()));
      return resp;
    }))
    .catch(() => new Response('', { status: 404 }));
}

/** Network-first: fetch, fall back to cache */
function networkFirst(request) {
  return fetch(request)
    .then(resp => {
      if (!resp.ok) throw new Error('Network failed');
      return resp;
    })
    .catch(() => caches.match(request)
      .then(cached => cached || new Response('Offline', { status: 503 }))
    );
}

// ── Message handling for update check ────────────────────

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
