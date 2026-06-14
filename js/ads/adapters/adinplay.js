/**
 * AdinPlayAdapter — AdinPlay browser game ad integration.
 *
 * Sign up at https://www.adinplay.com — they'll give you:
 *   - PUBLISHER_ID  (e.g. "AGEEARCADE-001")
 *   - GAME_ID       (per-game, assigned in their dashboard)
 *
 * Fill those in below, then add the SDK script tag to index.html:
 *   <script src="https://api.adinplay.com/libs/aiptag/pub/PUBLISHER_ID/aip.js"></script>
 *
 * Supports: preroll, midroll (interstitial), rewarded video.
 * AdinPlay shows its own full-screen UI — do NOT stack ArcadeAdOverlays on top.
 *
 * Registers itself into window.ArcadeAdAdapters on load.
 */
window.AdinPlayAdapter = (() => {
  'use strict';

  // ── TODO: fill these in after AdinPlay account approval ───────────
  const PUBLISHER_ID = 'YOUR_ADINPLAY_PUBLISHER_ID';   // e.g. 'AGEEARCADE-001'
  const GAME_ID      = 'YOUR_ADINPLAY_GAME_ID';        // assigned per game

  const INTERSTITIAL_KEYS = new Set([
    'game_loading_commercial',
    'game_over_interstitial',
    'pause_menu_banner',
  ]);

  const REWARDED_KEYS = new Set([
    'rewarded_revive',
    'rewarded_double_coins',
    'rewarded_continue',
    'rewarded_bonus_round',
  ]);

  let _sdkReady = false;

  // ── Init: wait for aiptag SDK to be available ──────────────────────
  function init() {
    window.aiptag = window.aiptag || { cmd: { player: [] } };
    window.aiptag.cmd = window.aiptag.cmd || {};
    window.aiptag.cmd.player = window.aiptag.cmd.player || [];

    // Signal SDK we're a game
    window.aiptag.gameId = GAME_ID;

    // Queue init — SDK calls this once it's loaded
    window.aiptag.cmd.player.push(() => {
      window.aiptag.adPlayer = new window.aiptag.adPlayer({
        id:         GAME_ID,
        publisherId: PUBLISHER_ID,
        gdpr: 0,      // set to 1 if you add GDPR consent UI
        adBreak: _onAdBreakDone,
      });
      _sdkReady = true;
    });
  }

  let _currentCallback = null;

  function _onAdBreakDone(adFinished) {
    if (_currentCallback) {
      _currentCallback({
        filled:  adFinished,
        granted: adFinished,
        source:  'adinplay',
        network: true,
      });
      _currentCallback = null;
    }
  }

  // ── canServe ───────────────────────────────────────────────────────
  function canServe(placementKey) {
    if (!_sdkReady) return false;
    if (PUBLISHER_ID === 'YOUR_ADINPLAY_PUBLISHER_ID') return false; // not configured
    return INTERSTITIAL_KEYS.has(placementKey) || REWARDED_KEYS.has(placementKey);
  }

  // ── show ──────────────────────────────────────────────────────────
  function show({ placementKey, gameId, onComplete }) {
    if (!_sdkReady || !window.aiptag?.adPlayer) {
      onComplete({ filled: false, source: 'adinplay', network: true });
      return;
    }

    _currentCallback = onComplete;

    if (REWARDED_KEYS.has(placementKey)) {
      window.aiptag.cmd.player.push(() => {
        window.aiptag.adPlayer.startRewardedAd(
          () => {},             // adStarted
          (finished) => _onAdBreakDone(finished)
        );
      });
    } else {
      window.aiptag.cmd.player.push(() => {
        window.aiptag.adPlayer.startPreRollAd(
          () => {},             // adStarted
          (finished) => _onAdBreakDone(finished)
        );
      });
    }
  }

  // ── Self-register (lower priority than H5Games — listed second) ───
  function _register() {
    window.ArcadeAdAdapters = window.ArcadeAdAdapters || [];
    window.ArcadeAdAdapters.push({ name: 'adinplay', canServe, show });
  }

  init();
  _register();

  return { name: 'adinplay', canServe, show, init };
})();
