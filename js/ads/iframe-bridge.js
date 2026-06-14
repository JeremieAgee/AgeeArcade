/**
 * ArcadeIframeBridge — secure postMessage contract between the parent arcade
 * and iframe games.
 *
 * Parent listens for messages from games and decides which ads to show.
 * Parent sends messages back to games after ad flows complete.
 *
 * Game → Parent message types:
 *   GAME_LOADED | GAME_STARTED | GAME_PAUSED | GAME_RESUMED |
 *   GAME_OVER   | LEVEL_COMPLETE | AD_REQUEST | SCORE_SUBMIT
 *
 * Parent → Game message types:
 *   AD_RESULT | AD_DONE | GAME_CAN_RESUME | PAUSE_GAME | RESUME_GAME
 *
 * Security: every inbound message is validated for origin and shape
 * before any action is taken.
 *
 * Depends on: window.AdRouter, window.ArcadeAdOverlays
 */
window.ArcadeIframeBridge = (() => {
  'use strict';

  // ── Allowed game origins ───────────────────────────────────────────
  // Add localhost for dev, production domain for prod.
  const ALLOWED_ORIGINS = [
    window.location.origin,
    'http://localhost',
    'http://localhost:8080',
    'http://127.0.0.1',
    'http://127.0.0.1:8080',
  ];

  // ── Valid placement keys for AD_REQUEST (from iframe) ──────────────
  const ALLOWED_AD_PLACEMENTS = new Set([
    'rewarded_revive',
    'rewarded_double_coins',
    'rewarded_continue',
    'rewarded_bonus_round',
    'game_over_interstitial',
    'pause_menu_banner',
  ]);

  let _iframeEl  = null;   // the <iframe> element
  let _gameId    = null;   // current game id
  let _listeners = [];     // { event, handler } for cleanup

  // ── Validation ────────────────────────────────────────────────────

  function _isAllowedOrigin(origin) {
    // Exact match or same base origin
    return ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o));
  }

  function _isValidMessage(data) {
    return data &&
      typeof data === 'object' &&
      typeof data.type === 'string' &&
      data.type.length > 0;
  }

  // ── Send message to game iframe ────────────────────────────────────

  function sendToGame(msg) {
    if (!_iframeEl) return;
    try {
      const targetOrigin = _iframeEl.src
        ? new URL(_iframeEl.src).origin
        : '*';
      _iframeEl.contentWindow.postMessage(msg, targetOrigin);
    } catch (_) {}
  }

  // ── Handle inbound game events ─────────────────────────────────────

  async function _handleMessage(event) {
    if (!_isAllowedOrigin(event.origin)) return;
    if (!_isValidMessage(event.data)) return;

    const { type, gameId, placementKey, score, level, rewardType } = event.data;

    // Update current gameId from the message if provided
    if (gameId) _gameId = gameId;

    switch (type) {

      case 'GAME_LOADED':
        // Game loaded inside iframe — nothing to do here,
        // loading commercial was already shown by game-frame.js on open.
        AdRouter.trackEvent({ placementKey: 'arcade_lobby', eventType: 'served', gameId: _gameId });
        break;

      case 'GAME_STARTED':
        break;

      case 'GAME_PAUSED': {
        // Show pause banner and send PAUSE_GAME confirmation
        if (window.ArcadeAdOverlays && window.AdRouter.canShowNow('pause_menu_banner')) {
          const ad = await AdRouter.requestAd({ placementKey: 'pause_menu_banner', gameId: _gameId });
          ArcadeAdOverlays.showPauseBanner(ad);
        }
        break;
      }

      case 'GAME_RESUMED':
        if (window.ArcadeAdOverlays) ArcadeAdOverlays.hidePauseBanner();
        break;

      case 'GAME_OVER': {
        if (window.AdRouter && AdRouter.canShowNow('game_over_interstitial')) {
          const ad = await AdRouter.requestAd({
            placementKey: 'game_over_interstitial',
            gameId: _gameId,
          });
          if (ad.filled && ad.network) {
            // Network adapter already showed its own UI
            sendToGame({ type: 'AD_DONE', placementKey: 'game_over_interstitial' });
          } else if (ad.filled && window.ArcadeAdOverlays) {
            ArcadeAdOverlays.showInterstitial(ad, () => {
              sendToGame({ type: 'AD_DONE', placementKey: 'game_over_interstitial' });
            });
          } else {
            sendToGame({ type: 'AD_DONE', placementKey: 'game_over_interstitial' });
          }
        } else {
          sendToGame({ type: 'AD_DONE', placementKey: 'game_over_interstitial' });
        }

        if (score !== undefined) {
          AdRouter.trackEvent({
            placementKey: 'arcade_lobby',
            eventType:    'game_over',
            gameId:       _gameId,
            metadata:     { score },
          });
        }
        break;
      }

      case 'LEVEL_COMPLETE':
        AdRouter.trackEvent({
          placementKey: 'arcade_lobby',
          eventType:    'level_complete',
          gameId:       _gameId,
          metadata:     { level },
        });
        break;

      case 'AD_REQUEST': {
        // Rewarded ad — must be in allowed set
        if (!placementKey || !ALLOWED_AD_PLACEMENTS.has(placementKey)) {
          sendToGame({ type: 'AD_RESULT', placementKey, granted: false, reason: 'invalid_placement' });
          return;
        }

        const placement = window.AdPlacements ? window.AdPlacements.get(placementKey) : null;
        if (!placement) {
          sendToGame({ type: 'AD_RESULT', placementKey, granted: false, reason: 'unknown_placement' });
          return;
        }

        const ad = await AdRouter.requestAd({ placementKey, gameId: _gameId });

        if (ad.network) {
          // Network adapter (H5 Games / AdinPlay) already showed its own UI
          sendToGame({ type: 'AD_RESULT', placementKey, granted: !!ad.granted });
          sendToGame({ type: 'AD_DONE',   placementKey });
        } else if (placement.type === 'rewarded' && window.ArcadeAdOverlays) {
          ArcadeAdOverlays.showRewarded(ad, rewardType || placement.rewardType, (granted) => {
            sendToGame({ type: 'AD_RESULT', placementKey, granted });
            sendToGame({ type: 'AD_DONE',   placementKey });
          });
        } else if (placement.type === 'interstitial' && window.ArcadeAdOverlays) {
          ArcadeAdOverlays.showInterstitial(ad, () => {
            sendToGame({ type: 'AD_RESULT', placementKey, granted: true });
            sendToGame({ type: 'AD_DONE',   placementKey });
          });
        } else {
          sendToGame({ type: 'AD_RESULT', placementKey, granted: false, reason: 'no_fill' });
        }
        break;
      }

      case 'SCORE_SUBMIT':
        // Games can also submit scores via their own Supabase call;
        // this event just gives the parent visibility.
        AdRouter.trackEvent({
          placementKey: 'arcade_lobby',
          eventType:    'score_submit',
          gameId:       _gameId,
          metadata:     { score },
        });
        break;
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  function attach(iframeEl, gameId) {
    detach(); // clean up any previous session
    _iframeEl = iframeEl;
    _gameId   = gameId;

    const handler = (e) => _handleMessage(e);
    window.addEventListener('message', handler);
    _listeners.push({ event: 'message', handler });
  }

  function detach() {
    _listeners.forEach(({ event, handler }) => window.removeEventListener(event, handler));
    _listeners = [];
    _iframeEl  = null;
    _gameId    = null;
    if (window.ArcadeAdOverlays) ArcadeAdOverlays.hidePauseBanner();
  }

  function init() {
    // Listen globally so game-frame.js can call attach() when a game opens
    window.addEventListener('arcade:launch', (e) => {
      const { cabinet } = e.detail;
      const iframe = document.getElementById('game-iframe');
      if (iframe) attach(iframe, cabinet.id);
    });
    window.addEventListener('arcade:exit-game', () => detach());
  }

  return { init, attach, detach, sendToGame };
})();
