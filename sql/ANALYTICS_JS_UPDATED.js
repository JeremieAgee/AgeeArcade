/* ═══════════════════════════════════════════════════════════════════════
   Agee Arcade — Analytics [UPDATED FOR NEW SCHEMA]
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
    try {
      _client = window._ageeSupabaseClient
        || (window._ageeSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
    }
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

  /* ── Session init ─────────────────────────────── */
  async function _initSession() {
    var sb = getClient();
    if (!sb) return;
    try {
      // Call RPC function to upsert session (handles visitor tracking)
      const { data, error } = await sb.rpc('upsert_session', {
        p_session_id:     sessionId,
        p_visitor_id:     visitorId,
        p_referrer:       referrer,
        p_source:         source,
        p_landing_page:   location.pathname,
        p_user_agent:     navigator.userAgent,
        p_language:       navigator.language,
        p_platform:       navigator.platform,
        p_screen_width:   window.screen.width,
        p_screen_height:  window.screen.height
      });

      if (error) {
        console.warn('[Analytics] Session init error:', error);
      }
    } catch (e) {
      console.warn('[Analytics] Session init exception:', e);
    }
    _trackPageView();
  }

  /* ── Heartbeat (every 30 seconds) ──────────── */
  setInterval(async function () {
    var sb = getClient();
    if (!sb) return;
    try {
      await sb.rpc('heartbeat_session', {
        p_session_id:   sessionId,
        p_current_page: location.pathname
      });
    } catch (_) {}
  }, 30000);

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
      const { data, error } = await sb.rpc('start_game_session', {
        p_session_id: sessionId,
        p_visitor_id: visitorId,
        p_game_id:    gameId || GAME_ID
      });

      if (!error && data) {
        window.AGEE_CURRENT_GAME_SESSION_ID = data;
        return data;
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
      await sb.rpc('end_game_session', {
        p_game_session_id: id,
        p_visitor_id:      visitorId,
        p_duration_seconds: s.duration_seconds || 0,
        p_max_floor:        s.max_floor        || 1,
        p_max_level:        s.max_level        || 1,
        p_deaths:           s.deaths           || 0,
        p_bosses_defeated:  s.bosses_defeated  || 0,
        p_chests_opened:    s.chests_opened    || 0,
        p_enemies_killed:   s.enemies_killed   || 0,
        p_end_reason:       s.end_reason       || 'unknown'
      });
    } catch (_) {}
    window.AGEE_CURRENT_GAME_SESSION_ID = null;
  }

  /* ── Unload-safe session end (fetch keepalive) ── */
  function endGameSessionUnload(stats) {
    var id = window.AGEE_CURRENT_GAME_SESSION_ID;
    if (!id) return;
    window.AGEE_CURRENT_GAME_SESSION_ID = null;
    var s = stats || {};
    try {
      // Build JSON body for RPC call
      var body = {
        p_game_session_id: id,
        p_visitor_id:      visitorId,
        p_duration_seconds: s.duration_seconds || 0,
        p_max_floor:        s.max_floor        || 1,
        p_max_level:        s.max_level        || 1,
        p_deaths:           s.deaths           || 0,
        p_bosses_defeated:  s.bosses_defeated  || 0,
        p_chests_opened:    s.chests_opened    || 0,
        p_enemies_killed:   s.enemies_killed   || 0,
        p_end_reason:       s.end_reason       || 'unknown'
      };

      fetch(SUPABASE_URL + '/rest/v1/rpc/end_game_session', {
        method: 'POST',
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(body),
        keepalive: true,
      });
    } catch (_) {}
  }

  /* ── Expose ───────────────────────────────────── */
  window.AgeeAnalytics = {
    trackEvent:             trackEvent,
    trackPageView:          _trackPageView,
    startGameSession:       startGameSession,
    endGameSession:         endGameSession,
    endGameSessionUnload:   endGameSessionUnload,
    sessionId:              sessionId,
    visitorId:              visitorId,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initSession);
  } else {
    _initSession();
  }

})();
