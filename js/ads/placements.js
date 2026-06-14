/**
 * AdPlacements — canonical placement registry for Agee Arcade.
 *
 * This is the single source of truth for every ad slot.
 * AdRouter, overlays, and 3D billboards all reference these keys.
 */
window.AdPlacements = (() => {
  'use strict';

  const TYPES = Object.freeze({
    WALL_BILLBOARD:      'wall_billboard',
    MAIN_SPONSOR:        'main_sponsor',
    CABINET_SPONSOR:     'cabinet_sponsor',
    LOADING_COMMERCIAL:  'loading_commercial',
    INTERSTITIAL:        'interstitial',
    REWARDED:            'rewarded',
    PAUSE_BANNER:        'pause_banner',
    LEADERBOARD_SPONSOR: 'leaderboard_sponsor',
    HOME_BANNER:         'home_banner',
    HOUSE_AD:            'house_ad',
  });

  const REGISTRY = Object.freeze([
    // ── 3D Wall Billboards ─────────────────────────────────────────
    {
      key:            'arcade_wall_left_01',
      name:           'Left Wall Billboard 1',
      type:           'wall_billboard',
      width:          1024, height: 512,
      is3d:           true,
      isClickable:    true,
      requiresOptIn:  false,
    },
    {
      key:            'arcade_wall_left_02',
      name:           'Left Wall Billboard 2',
      type:           'wall_billboard',
      width:          1024, height: 512,
      is3d:           true,
      isClickable:    true,
      requiresOptIn:  false,
    },
    {
      key:            'arcade_wall_right_01',
      name:           'Right Wall Billboard 1',
      type:           'wall_billboard',
      width:          1024, height: 512,
      is3d:           true,
      isClickable:    true,
      requiresOptIn:  false,
    },
    {
      key:            'arcade_wall_main_banner',
      name:           'Main Arcade Banner',
      type:           'main_sponsor',
      width:          1920, height: 256,
      is3d:           true,
      isClickable:    true,
      requiresOptIn:  false,
    },
    {
      key:            'arcade_back_wall_banner',
      name:           'Back Wall Banner',
      type:           'wall_billboard',
      width:          2048, height: 512,
      is3d:           true,
      isClickable:    true,
      requiresOptIn:  false,
    },
    // ── Overlay Placements ────────────────────────────────────────
    {
      key:            'game_loading_commercial',
      name:           'Game Loading Commercial',
      type:           'loading_commercial',
      width:          1280, height: 720,
      is3d:           false,
      isClickable:    true,
      requiresOptIn:  false,
    },
    {
      key:            'game_over_interstitial',
      name:           'Game Over Interstitial',
      type:           'interstitial',
      width:          1280, height: 720,
      is3d:           false,
      isClickable:    true,
      requiresOptIn:  false,
    },
    // ── Rewarded ──────────────────────────────────────────────────
    {
      key:            'rewarded_revive',
      name:           'Rewarded — Revive',
      type:           'rewarded',
      width:          1280, height: 720,
      is3d:           false,
      isClickable:    false,
      requiresOptIn:  true,
      rewardType:     'revive',
    },
    {
      key:            'rewarded_double_coins',
      name:           'Rewarded — Double Coins',
      type:           'rewarded',
      width:          1280, height: 720,
      is3d:           false,
      isClickable:    false,
      requiresOptIn:  true,
      rewardType:     'double_coins',
    },
    {
      key:            'rewarded_continue',
      name:           'Rewarded — Continue',
      type:           'rewarded',
      width:          1280, height: 720,
      is3d:           false,
      isClickable:    false,
      requiresOptIn:  true,
      rewardType:     'continue',
    },
    // ── DOM Overlays ──────────────────────────────────────────────
    {
      key:            'pause_menu_banner',
      name:           'Pause Menu Banner',
      type:           'pause_banner',
      width:          728, height: 90,
      is3d:           false,
      isClickable:    true,
      requiresOptIn:  false,
    },
    {
      key:            'leaderboard_sponsor',
      name:           'Leaderboard Sponsor',
      type:           'leaderboard_sponsor',
      width:          728, height: 90,
      is3d:           false,
      isClickable:    true,
      requiresOptIn:  false,
    },
    // ── Homepage ──────────────────────────────────────────────────
    {
      key:            'home_top_banner',
      name:           'Home Top Banner',
      type:           'home_banner',
      width:          970, height: 250,
      is3d:           false,
      isClickable:    true,
      requiresOptIn:  false,
    },
    {
      key:            'home_side_banner',
      name:           'Home Side Banner',
      type:           'home_banner',
      width:          300, height: 600,
      is3d:           false,
      isClickable:    true,
      requiresOptIn:  false,
    },
  ]);

  // Frequency limits — controls how often overlay ads can fire
  const FREQUENCY = Object.freeze({
    interstitialMinSecondsBetween:       120,
    loadingCommercialMinSecondsBetween:   60,
    pauseBannerMinSecondsBetween:         30,
  });

  // Default durations per overlay type (ms)
  const DURATIONS = Object.freeze({
    loading_commercial:  5000,
    interstitial:        5000,
    rewarded:           15000,
    pause_banner:           0,  // persistent until pause ends
  });

  function get(key) {
    return REGISTRY.find(p => p.key === key) || null;
  }

  function byType(type) {
    return REGISTRY.filter(p => p.type === type);
  }

  return { REGISTRY, TYPES, FREQUENCY, DURATIONS, get, byType };
})();
