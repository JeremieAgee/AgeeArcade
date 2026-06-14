/**
 * H5GamesAdsAdapter — Google H5 Games Ads integration.
 *
 * Uses adBreak() / adConfig() from the H5 Games Ads SDK (same script tag as
 * AdSense — no extra account needed, just register your site at
 * developers.google.com/ad-placement).
 *
 * Placement key → adBreak type mapping:
 *   game_loading_commercial → preroll
 *   game_over_interstitial  → next
 *   pause_menu_banner       → pause
 *   rewarded_*              → reward
 *
 * The adapter shows its own UI (Google's interstitial overlay).
 * Callers must NOT show ArcadeAdOverlays on top — check ad.network === true.
 *
 * Registers itself into window.ArcadeAdAdapters on load.
 */
window.H5GamesAdsAdapter = (() => {
  'use strict';

  const PLACEMENT_MAP = {
    game_loading_commercial: 'preroll',
    game_over_interstitial:  'next',
    pause_menu_banner:       'pause',
    rewarded_revive:         'reward',
    rewarded_double_coins:   'reward',
    rewarded_continue:       'reward',
    rewarded_bonus_round:    'reward',
  };

  let _configured = false;

  // ── Configure SDK (requires a prior user gesture) ─────────────────
  function _ensureConfigured() {
    if (_configured) return;
    _configured = true;
    window.adConfig = window.adConfig || function(o) { (window.adsbygoogle = window.adsbygoogle || []).push(o); };
    window.adBreak  = window.adBreak  || function(o) { (window.adsbygoogle = window.adsbygoogle || []).push(o); };
    adConfig({ preloadAdBreaks: 'on', sound: 'on' });
  }

  // ── preload: call once on first user interaction ──────────────────
  // Gives Google time to fetch an ad before the player launches a game.
  function preload() {
    _ensureConfigured();
  }

  function init() { /* nothing at load time — wait for user gesture */ }

  // ── canServe: only handle mapped placement keys ────────────────────
  function canServe(placementKey) {
    return placementKey in PLACEMENT_MAP;
  }

  // ── show: call adBreak, resolve when done ─────────────────────────
  // onComplete({ filled, granted, source:'h5games', network:true })
  function show({ placementKey, gameId, onComplete }) {
    _ensureConfigured();
    const type = PLACEMENT_MAP[placementKey];

    if (!type || !window.adBreak) {
      onComplete({ filled: false, source: 'h5games', network: true });
      return;
    }

    const isReward = type === 'reward';
    let _rewardGranted = false;

    const config = {
      type,
      name: placementKey,

      // Reward-specific callbacks
      beforeReward: isReward ? (showAdFn) => { showAdFn(); } : undefined,
      adViewed:     isReward ? () => { _rewardGranted = true; } : undefined,
      adDismissed:  isReward ? () => { _rewardGranted = false; } : undefined,

      // Final callback for all types
      adBreakDone: (info) => {
        // breakStatus: 'viewed' | 'dismissed' | 'notReady' | 'noAdPreloaded'
        //              | 'frequencyCapped' | 'ignored' | 'other'
        const viewed = info.breakStatus === 'viewed';
        onComplete({
          filled:  viewed || info.breakStatus === 'dismissed',
          granted: isReward ? _rewardGranted : viewed,
          source:  'h5games',
          network: true,
          breakStatus: info.breakStatus,
        });
      },
    };

    // Remove undefined keys (adBreak is strict about unknown props)
    if (!isReward) {
      delete config.beforeReward;
      delete config.adViewed;
      delete config.adDismissed;
    }

    adBreak(config);
  }

  // ── Self-register into ArcadeAdAdapters ───────────────────────────
  function _register() {
    window.ArcadeAdAdapters = window.ArcadeAdAdapters || [];
    window.ArcadeAdAdapters.push({ name: 'h5games', canServe, show });
  }

  init();
  _register();

  return { name: 'h5games', canServe, show, init, preload };
})();
