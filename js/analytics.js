/* ═══════════════════════════════════════════════════════════════════════
   Agee Arcade — Analytics
   Requires window.supabase (Supabase UMD SDK) to be loaded first.
   Sets window.AgeeAnalytics synchronously; all DB ops are fire-and-forget.
═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SUPABASE_URL      = 'https://xdvrgeaivfqpcsmuqeyi.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O';

  let _client = null;

  function getClient() {
    if (_client) return _client;
    if (typeof window.supabase === 'undefined') return null;
    try { _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
    catch (_) {}
    return _client;
  }

  function _uuid() {
    try { return crypto.randomUUID(); } catch (_) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function _local(key) {
    var v = localStorage.getItem(key);
    if (!v) { v = _uuid(); localStorage.setItem(key, v); }
    return v;
  }

  function _source(referrer) {
    var r = (referrer || '').toLowerCase();
    if (r.indexOf('linkedin.com')  !== -1) return 'linkedin';
    if (r.indexOf('facebook.com')  !== -1) return 'facebook';
    if (r.indexOf('google.com')    !== -1) return 'google';
    if (r.indexOf('github.io')     !== -1) return 'github_pages';
    if (!r)                                return 'direct';
    return 'other';
  }

  var GAME_ID     = window.AGEE_GAME_ID || null;
  var visitorId   = _local('agee_arcade.visitor_id');

  /* ── Session — expires after 30 min inactivity ── */
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  function _getOrCreateSession() {
    var stored = sessionStorage.getItem('agee_arcade.session_id');
    var lastTs  = parseInt(localStorage.getItem('agee_arcade.session_ts') || '0', 10);
    var now     = Date.now();
    // Existing session is still fresh
    if (stored && (now - lastTs) < SESSION_TIMEOUT_MS) {
      localStorage.setItem('agee_arcade.session_ts', now);
      return stored;
    }
    // Expired or missing — start a new session
    var id = _uuid();
    sessionStorage.setItem('agee_arcade.session_id', id);
    localStorage.setItem('agee_arcade.session_ts', now);
    return id;
  }

  var sessionId = _getOrCreateSession();

  // Keep the timestamp fresh on any user activity
  ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      localStorage.setItem('agee_arcade.session_ts', Date.now());
    }, { passive: true });
  });

  var referrer    = document.referrer || '';
  var source      = _source(referrer);
  var isReturning = localStorage.getItem('agee_arcade.has_visited') === 'true';
  localStorage.setItem('agee_arcade.has_visited', 'true');

  /* ── Session init ─────────────────────────────── */
  async function _initSession() {
    var sb = getClient();
    if (!sb) return;
    try {
      await sb.from('arcade_sessions').upsert({
        session_id:    sessionId,
        visitor_id:    visitorId,
        referrer:      referrer,
        source:        source,
        landing_page:  location.pathname,
        current_page:  location.pathname,
        user_agent:    navigator.userAgent,
        language:      navigator.language,
        platform:      navigator.platform,
        screen_width:  window.screen.width,
        screen_height: window.screen.height,
        is_returning:  isReturning,
      }, { onConflict: 'session_id' });
    } catch (_) {}
    _trackPageView();
  }

  /* ── Public API ───────────────────────────────── */
  async function _trackPageView() {
    var sb = getClient();
    if (!sb) return;
    try {
      await sb.from('arcade_page_views').insert({
        session_id: sessionId,
        visitor_id: visitorId,
        page:       location.pathname,
        title:      document.title,
        referrer:   referrer,
        source:     source,
      });
    } catch (_) {}
  }

  async function trackEvent(eventType, eventData) {
    var sb = getClient();
    if (!sb) return;
    try {
      await sb.from('arcade_events').insert({
        session_id:      sessionId,
        visitor_id:      visitorId,
        game_session_id: window.AGEE_CURRENT_GAME_SESSION_ID || null,
        game_id:         GAME_ID,
        event_type:      eventType,
        event_data:      eventData || {},
        page:            location.pathname,
      });
    } catch (_) {}
  }

  async function startGameSession(gameId) {
    var sb = getClient();
    if (!sb) return null;
    try {
      var res = await sb.from('arcade_game_sessions').insert({
        session_id: sessionId,
        visitor_id: visitorId,
        game_id:    gameId || GAME_ID,
      }).select('id').single();
      if (!res.error && res.data) {
        window.AGEE_CURRENT_GAME_SESSION_ID = res.data.id;
        return res.data.id;
      }
    } catch (_) {}
    return null;
  }

  async function endGameSession(stats) {
    var id = window.AGEE_CURRENT_GAME_SESSION_ID;
    var sb = getClient();
    if (!id || !sb) return;
    var s = stats || {};
    try {
      await sb.from('arcade_game_sessions').update({
        ended_at:         new Date().toISOString(),
        duration_seconds: s.duration_seconds || 0,
        max_floor:        s.max_floor        || 1,
        max_level:        s.max_level        || 1,
        deaths:           s.deaths           || 0,
        bosses_defeated:  s.bosses_defeated  || 0,
        chests_opened:    s.chests_opened    || 0,
        enemies_killed:   s.enemies_killed   || 0,
        end_reason:       s.end_reason       || 'unknown',
      }).eq('id', id);
    } catch (_) {}
    window.AGEE_CURRENT_GAME_SESSION_ID = null;
  }

  /* ── Heartbeat ────────────────────────────────── */
  setInterval(async function () {
    var sb = getClient();
    if (!sb) return;
    try {
      await sb.from('arcade_sessions').update({
        last_seen:    new Date().toISOString(),
        current_page: location.pathname,
      }).eq('session_id', sessionId);
    } catch (_) {}
  }, 30000);

  /* ── Expose ───────────────────────────────────── */
  window.AgeeAnalytics = {
    trackEvent:       trackEvent,
    trackPageView:    _trackPageView,
    startGameSession: startGameSession,
    endGameSession:   endGameSession,
    sessionId:        sessionId,
    visitorId:        visitorId,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initSession);
  } else {
    _initSession();
  }

})();
