(function () {
  'use strict';

  const SUPABASE_URL = 'https://xdvrgeaivfqpcsmuqeyi.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O';
  const GUEST_ID_KEY = 'agee_arcade.leaderboard_guest_id';

  let client = null;

  function authProviders() {
    return [window.ArcadeAuth, window.DepthsAuth].filter(Boolean);
  }

  function getAuth() {
    return authProviders().find(auth => auth && auth.isLoggedIn && auth.isLoggedIn()) || null;
  }

  function getUser() {
    const auth = getAuth();
    return auth && auth.getUser ? auth.getUser() : null;
  }

  function cleanName(value, fallback) {
    const name = String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-zA-Z0-9 _.-]/g, '')
      .slice(0, 16);
    return name || fallback || 'Player';
  }

  function displayNameFromUser(user) {
    if (!user) return '';
    const meta = user.user_metadata || {};
    return cleanName(
      meta.username || meta.display_name || meta.name || (user.email || '').split('@')[0],
      ''
    );
  }

  function isLoggedIn() {
    return !!getAuth();
  }

  function playerId() {
    const auth = getAuth();
    if (auth && auth.getUserId && auth.getUserId()) return auth.getUserId();

    try {
      let id = localStorage.getItem(GUEST_ID_KEY);
      if (!id) {
        id = window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(GUEST_ID_KEY, id);
      }
      return id;
    } catch (_) {
      return 'guest-player';
    }
  }

  function submissionName(inputValue, fallback) {
    if (isLoggedIn()) return displayNameFromUser(getUser()) || 'Player';
    return cleanName(inputValue, fallback || 'Player');
  }

  function getClient() {
    if (client) return client;
    if (typeof window.supabase === 'undefined') return null;
    client = window._ageeSupabaseClient
      || (window._ageeSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
    return client;
  }

  async function getAccessToken() {
    try {
      const auth = getAuth();
      if (auth && auth.getAccessToken) {
        const token = await auth.getAccessToken();
        if (token) return token;
      }
      const sb = getClient();
      if (sb && sb.auth && sb.auth.getSession) {
        const { data } = await sb.auth.getSession();
        if (data && data.session && data.session.access_token) return data.session.access_token;
      }
    } catch (_) {}
    return SUPABASE_ANON_KEY;
  }

  function emitWrite(table, payload, error) {
    document.dispatchEvent(new CustomEvent('agee-leaderboard-write', {
      detail: { table, payload, error: error || null },
    }));
  }

  function stableString(value) {
    if (!value || typeof value !== 'object') return String(value);
    return JSON.stringify(Object.keys(value).sort().reduce((out, key) => {
      out[key] = value[key];
      return out;
    }, {}));
  }

  function syncedEntries(syncKey) {
    if (!syncKey) return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(syncKey)) || []); }
    catch (_) { return new Set(); }
  }

  function markSynced(syncKey, payload) {
    if (!syncKey) return;
    try {
      const synced = syncedEntries(syncKey);
      synced.add(stableString(payload));
      localStorage.setItem(syncKey, JSON.stringify([...synced].slice(-250)));
    } catch (_) {}
  }

  function isSynced(syncKey, payload) {
    return !!syncKey && syncedEntries(syncKey).has(stableString(payload));
  }

  async function insert(table, payload, options) {
    const opts = options || {};
    if (isSynced(opts.syncKey, payload)) return { error: null, skipped: true };

    try {
      const token = await getAccessToken();
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = `Supabase ${response.status}: ${await response.text()}`;
        console.warn(`[Leaderboard] Insert failed for ${table}.`, message, payload);
        emitWrite(table, payload, message);
        return { error: message };
      }

      markSynced(opts.syncKey, payload);
      emitWrite(table, payload, null);
      return { error: null };
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.warn(`[Leaderboard] Insert failed for ${table}.`, message, payload);
      emitWrite(table, payload, message);
      return { error: message };
    }
  }

  async function syncLocal(table, entries, toPayload, options) {
    const rows = Array.isArray(entries) ? entries : [];
    const opts = options || {};
    const limit = Number.isFinite(opts.limit) ? opts.limit : 50;
    let uploaded = 0;
    let failed = 0;

    for (const entry of rows.slice(0, limit)) {
      const payload = toPayload(entry);
      if (!payload || isSynced(opts.syncKey, payload)) continue;
      const result = await insert(table, payload, { syncKey: opts.syncKey });
      if (result && result.error) failed++;
      else if (!result.skipped) uploaded++;
    }

    return { uploaded, failed };
  }

  window.AgeeLeaderboard = {
    cleanName,
    displayName: () => displayNameFromUser(getUser()),
    isLoggedIn,
    playerId,
    submissionName,
    insert,
    syncLocal,
  };
})();
