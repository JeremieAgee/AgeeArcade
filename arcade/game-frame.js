/**
 * ArcadeGameFrame — iframe overlay for playing games inside the arcade.
 *
 * Ad integration:
 *   - Cabinet launch sets the iframe src immediately.
 *   - ArcadeIframeBridge handles all in-game ad events (GAME_OVER, AD_REQUEST…).
 *
 * Opens:  ArcadeGameFrame.open(url, title, cabinetId)
 * Closes: ArcadeGameFrame.close()
 *
 * Background preloading:
 *   Call ArcadeGameFrame.preload(url) to lightly prefetch a game document before
 *   the player interacts. Hidden game iframes are intentionally avoided because
 *   they still run full game engines and can jank the arcade.
 */
window.ArcadeGameFrame = (() => {
  'use strict';

  let _overlay      = null;
  let _iframe       = null;   // currently visible iframe
  let _titleEl      = null;
  let _open         = false;
  let _iframeWindow = null;
  let _pendingUrl   = null;
  let _pendingTitle = null;
  let _pendingId    = null;

  // url → <iframe> preloaded in background
  const _prefetchedUrls = new Set();
  let _preloadWorker = null;

  function _onIframeKeydown(e) {
    if (e.code === 'Escape' || e.key === 'Escape') {
      e.preventDefault();
      if (window.ArcadePlayer && ArcadePlayer.clearInput) ArcadePlayer.clearInput();
      close();
    }
  }

  function _attachKeyListener(frame) {
    if (_iframeWindow) {
      try { _iframeWindow.removeEventListener('keydown', _onIframeKeydown, true); } catch (_) {}
    }
    try {
      _iframeWindow = frame.contentWindow;
      if (_iframeWindow) {
        _iframeWindow.addEventListener('keydown', _onIframeKeydown, true);
        _iframeWindow.addEventListener('keydown', _onIframeKeydown, false);
      }
    } catch (_) { _iframeWindow = null; }
  }

  // ── Background preload ─────────────────────────────────────────────
  // All games preload, but never all at once: requests are queued and
  // loaded one at a time in idle slices, so a game booting its engine
  // never janks the arcade RAF. Loaded frames stay resident for instant
  // open on any cabinet.

  function preload(url) {
    if (!url || _prefetchedUrls.has(url)) return;
    _prefetchedUrls.add(url);
    const worker = _getPreloadWorker();
    if (worker) worker.postMessage({ type: 'preload', url: new URL(url, location.href).href });
    else _prefetchLink(url, 'document');
  }

  function _prefetchLink(url, as) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    if (as) link.as = as;
    link.href = url;
    document.head.appendChild(link);
  }

  function _getPreloadWorker() {
    if (_preloadWorker) return _preloadWorker;
    if (!window.Worker) return null;
    try {
      _preloadWorker = new Worker('./arcade/preload-worker.js');
      _preloadWorker.onmessage = event => {
        const msg = event.data || {};
        if (msg.type === 'prefetch-link' && msg.href) _prefetchLink(msg.href, msg.as);
      };
      _preloadWorker.onerror = () => {
        try { _preloadWorker.terminate(); } catch (_) {}
        _preloadWorker = null;
      };
      return _preloadWorker;
    } catch (_) {
      _preloadWorker = null;
      return null;
    }
  }

  // ── Actually reveal the game after any pre-game ad ─────────────────

  function _revealGame(url, title) {
    _titleEl.textContent = title || '';

    _overlay.hidden = false;
    _iframe.style.visibility = 'visible';
    _iframe.style.pointerEvents = 'auto';

    _attachKeyListener(_iframe);

    _iframe.src = url;

    const onIframeLoad = () => {
      _iframe.removeEventListener('load', onIframeLoad);
      try { _iframe.contentWindow.focus(); } catch (_) {}
    };

    _iframe.addEventListener('load', onIframeLoad);

    // Re-attach the ESC listener after the new game loads so it works immediately.
    // We set up a separate listener that will fire after this game's load.
    _iframe.addEventListener('load', () => {
      _attachKeyListener(_iframe);
    }, { once: true });

    ArcadePlayer.enterPlaying();
    ArcadeScene.pause();
  }

  // ── Open: load the selected game immediately ───────────────────────

  function open(url, title, cabinetId) {
    if (_open) return;
    _open = true;
    _pendingUrl   = url;
    _pendingTitle = title;
    _pendingId    = cabinetId || 'unknown';

    // Attach iframe bridge for this game session
    if (window.ArcadeIframeBridge) {
      ArcadeIframeBridge.attach(
        document.getElementById('game-iframe'),
        _pendingId
      );
    }

    _revealGame(url, title);
  }

  // ── Close ──────────────────────────────────────────────────────────

  function close() {
    if (!_open) return;
    _open = false;

    if (window.ArcadePlayer && ArcadePlayer.clearInput) ArcadePlayer.clearInput();

    if (_iframeWindow) {
      try { _iframeWindow.removeEventListener('keydown', _onIframeKeydown, true); } catch (_) {}
      _iframeWindow = null;
    }

    // Stop the active game so its render/audio loops do not keep running in
    // the background while the player returns to the arcade.
    _iframe.style.visibility = 'hidden';
    _iframe.style.pointerEvents = 'none';

    const onBlankLoad = () => {
      _iframe.removeEventListener('load', onBlankLoad);
      // Reset styles after blank page loads
      const defaultFrame = document.getElementById('game-iframe');
      defaultFrame.style.display = '';
      defaultFrame.style.visibility = '';
      defaultFrame.style.pointerEvents = '';
    };

    _iframe.addEventListener('load', onBlankLoad);
    _iframe.src = 'about:blank';

    _overlay.hidden = true;

    if (window.ArcadeIframeBridge) ArcadeIframeBridge.detach();
    if (window.ArcadeAdOverlays)   ArcadeAdOverlays.hidePauseBanner();

    ArcadePlayer.enterExplore();
    ArcadeScene.resume();

    // Pointer lock is released when iframe is hidden and src set to blank.
    // Don't re-request it here — it requires user interaction anyway.
  }

  // ── Init ───────────────────────────────────────────────────────────

  function init() {
    _overlay = document.getElementById('game-overlay');
    _iframe  = document.getElementById('game-iframe');
    _titleEl = document.getElementById('game-overlay-title');

    if (!_overlay || !_iframe) {
      console.error('[ArcadeGameFrame] overlay/iframe elements missing');
      return;
    }

    window.addEventListener('arcade:exit-game', close);

    window.addEventListener('arcade:launch', (e) => {
      const { cabinet } = e.detail;
      open(cabinet.url, cabinet.title.replace('\n', ' '), cabinet.id);
    });

    // Detect when pointer lock exits (escape key in fullscreen/pointer lock mode)
    document.addEventListener('pointerlockchange', () => {
      if (_open && !document.pointerLockElement) {
        close();
      }
    });

    const btn = document.getElementById('game-overlay-close');
    if (btn) {
      btn.addEventListener('click', () => {
        btn.blur();
        close();
      });
    }
  }

  return { init, open, close, preload, get isOpen() { return _open; } };
})();
