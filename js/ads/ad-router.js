/**
 * AdRouter — central ad decision engine for Agee Arcade.
 *
 * Priority chain for every request:
 *   1. Active direct-sponsor campaign (highest priority wins)
 *   2. Network adapter (stub — ready for future integration)
 *   3. House ad (always fills)
 *   4. No fill
 *
 * All ad events (served, click, visible_2_seconds, etc.) flow through
 * trackEvent() so reporting is centralised.
 *
 * Depends on: window._ageeSupabaseClient, window.AdPlacements
 */
window.AdRouter = (() => {
  'use strict';

  // ── Session ────────────────────────────────────────────────────────
  // One session id per page load — used to de-dupe visibility counts.
  const SESSION_ID = 'arc_' + Math.random().toString(36).slice(2, 10) +
                     '_' + Date.now().toString(36);

  // Tracks which (campaignId + placementKey) pairs have already fired
  // visible_2_seconds this session, to avoid double-counting.
  const _visibleFired = new Set();

  // Per-placement last-served timestamps for frequency capping.
  const _lastServed = {};

  // ── Supabase client helper ─────────────────────────────────────────
  function _db() {
    return window._ageeSupabaseClient || null;
  }

  // ── Core: fetch best direct campaign ──────────────────────────────
  async function _getBestDirectCampaign(placementKey, isHouseAd = false) {
    const db = _db();
    if (!db) return null;

    const now = new Date().toISOString();

    let q = db
      .from('campaigns')
      .select('*')
      .eq('placement_key', placementKey)
      .eq('active', true)
      .eq('is_house_ad', isHouseAd)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('priority', { ascending: false })
      .limit(10);

    const { data, error } = await q;
    if (error || !data || data.length === 0) return null;

    // Filter out campaigns that have hit their impression/click caps
    for (const campaign of data) {
      const hitImpressionCap = campaign.max_impressions &&
        campaign.current_impressions >= campaign.max_impressions;
      const hitClickCap = campaign.max_clicks &&
        campaign.current_clicks >= campaign.max_clicks;
      if (!hitImpressionCap && !hitClickCap) return campaign;
    }
    return null;
  }

  // ── Network adapter ────────────────────────────────────────────────
  // Iterates registered adapters in order (first registered = highest priority).
  // Each adapter's show() handles its own display UI and calls onComplete().
  // Returns { filled, granted, source, network:true } or null if no adapter fills.
  function _tryNetworkAdapter(placementKey, gameId) {
    const adapters = window.ArcadeAdAdapters || [];
    for (const adapter of adapters) {
      if (!adapter.canServe(placementKey)) continue;
      return new Promise((resolve) => {
        try {
          adapter.show({ placementKey, gameId, sessionId: SESSION_ID, onComplete: resolve });
        } catch (_) {
          resolve(null);
        }
      });
    }
    return Promise.resolve(null);
  }

  // ── Build normalised AdResponse ────────────────────────────────────
  function _buildResponse(campaign, source, placementKey) {
    const placement = window.AdPlacements ? window.AdPlacements.get(placementKey) : null;
    const durations = window.AdPlacements ? window.AdPlacements.DURATIONS : {};
    return {
      filled:         true,
      source,
      campaignId:     campaign.id,
      placementKey,
      title:          campaign.title,
      description:    campaign.description,
      imageUrl:       campaign.image_url,
      videoUrl:       campaign.video_url,
      clickUrl:       campaign.click_url,
      durationMs:     durations[placement ? placement.type : ''] || 5000,
      requiresOptIn:  placement ? placement.requiresOptIn : false,
      rewardType:     placement ? placement.rewardType : null,
      isHouseAd:      campaign.is_house_ad,
    };
  }

  // ── Public: request an ad ──────────────────────────────────────────
  async function requestAd({ placementKey, gameId = 'arcade_lobby', userId = null } = {}) {
    await trackEvent({ placementKey, eventType: 'requested', gameId });

    // 1. Direct paid sponsor
    const direct = await _getBestDirectCampaign(placementKey, false);
    if (direct) {
      const resp = _buildResponse(direct, 'direct', placementKey);
      await trackEvent({ campaignId: direct.id, placementKey, eventType: 'served', gameId });
      _incrementImpressions(direct.id);
      _lastServed[placementKey] = Date.now();
      return resp;
    }

    // 2. Network adapter (shows its own UI — no overlay needed by caller)
    const network = await _tryNetworkAdapter(placementKey, gameId);
    if (network && network.filled) {
      _lastServed[placementKey] = Date.now();
      await trackEvent({ placementKey, eventType: 'served', gameId, metadata: { source: network.source } });
      return network; // network:true signals caller to skip ArcadeAdOverlays
    }

    // 3. House ad
    const house = await _getBestDirectCampaign(placementKey, true);
    if (house) {
      const resp = _buildResponse(house, 'house', placementKey);
      await trackEvent({ campaignId: house.id, placementKey, eventType: 'house_ad_served', gameId });
      _lastServed[placementKey] = Date.now();
      return resp;
    }

    // 4. No fill
    await trackEvent({ placementKey, eventType: 'no_fill', gameId });
    return { filled: false, source: 'none', placementKey };
  }

  // ── Public: track an event ─────────────────────────────────────────
  async function trackEvent({
    campaignId   = null,
    placementKey,
    eventType,
    gameId       = 'arcade_lobby',
    userId       = null,
    metadata     = null,
  } = {}) {
    const db = _db();
    if (!db) return;
    try {
      await db.from('ad_events').insert({
        campaign_id:   campaignId,
        placement_key: placementKey,
        event_type:    eventType,
        game_id:       gameId,
        session_id:    SESSION_ID,
        user_id:       userId,
        metadata,
      });
    } catch (_) {}
  }

  // ── Public: track a qualified 2-second view (once per session/placement) ──
  async function trackVisible2s({ campaignId, placementKey, gameId = 'arcade_lobby', metadata = null }) {
    const key = `${campaignId}:${placementKey}`;
    if (_visibleFired.has(key)) return;
    _visibleFired.add(key);
    await trackEvent({ campaignId, placementKey, eventType: 'visible_2_seconds', gameId, metadata });
  }

  // ── Public: track a click and return the validated click URL ──────
  async function trackClick({ campaignId, placementKey, gameId = 'arcade_lobby' }) {
    const db = _db();
    if (!db) return null;

    await trackEvent({ campaignId, placementKey, eventType: 'click', gameId });

    // Increment counter via RPC (avoids write policy issues on campaigns row)
    try {
      await db.rpc('increment_campaign_click', { p_campaign_id: campaignId });
    } catch (_) {}

    // Fetch and validate the click URL
    try {
      const { data } = await db
        .from('campaigns')
        .select('click_url, active')
        .eq('id', campaignId)
        .single();
      if (data && data.active && data.click_url) return data.click_url;
    } catch (_) {}
    return null;
  }

  // ── Internal: fire-and-forget impression increment ─────────────────
  function _incrementImpressions(campaignId) {
    const db = _db();
    if (!db) return;
    db.rpc('increment_campaign_impression', { p_campaign_id: campaignId }).catch(() => {});
  }

  // ── Frequency helpers ──────────────────────────────────────────────
  function secondsSinceLastServed(placementKey) {
    const t = _lastServed[placementKey];
    return t ? (Date.now() - t) / 1000 : Infinity;
  }

  function canShowNow(placementKey) {
    const limits = window.AdPlacements ? window.AdPlacements.FREQUENCY : {};
    const placement = window.AdPlacements ? window.AdPlacements.get(placementKey) : null;
    if (!placement) return true;

    const minSeconds = {
      loading_commercial: limits.loadingCommercialMinSecondsBetween || 60,
      interstitial:       limits.interstitialMinSecondsBetween       || 120,
      pause_banner:       limits.pauseBannerMinSecondsBetween        || 30,
    }[placement.type] || 0;

    return secondsSinceLastServed(placementKey) >= minSeconds;
  }

  return {
    SESSION_ID,
    requestAd,
    trackEvent,
    trackVisible2s,
    trackClick,
    canShowNow,
    secondsSinceLastServed,
  };
})();
