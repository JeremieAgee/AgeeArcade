window.Save = (() => {
  const PLAYER_ID_KEY = 'depthsOfAshenveil.playerId.v1';
  const STORAGE_KEY = 'depthsOfAshenveil.meta.v1';
  const LEADERBOARD_KEY = 'depthsOfAshenveil.leaderboard.v1';
  const ACTIVE_RUN_KEY = 'depthsOfAshenveil.activeRun.v1';
  const LEADERBOARD_LIMIT = 10;
  const BLOCKED_NAME_PARTS = [
    'ass', 'bitch', 'cunt', 'dick', 'fag', 'fuck', 'hitler', 'kkk',
    'nazi', 'nigger', 'nigga', 'penis', 'pussy', 'rape', 'shit', 'slut',
    'whore'
  ];
  const DEFAULT_META = {
    bestFloor: 1,
    bestLevel: 1,
    totalRuns: 0,
    totalDeaths: 0,
    bossesDefeated: 0,
  };

  const config = window.DEPTHS_SUPABASE_CONFIG || {};
  const supabaseUrl = String(config.url || '').replace(/\/$/, '');
  const supabaseAnonKey = String(config.anonKey || '');
  const supabaseEnabled = /^https:\/\/.+\.supabase\.co$/.test(supabaseUrl) && supabaseAnonKey.length > 20;
  const ready = hydrateFromSupabase();

  function cloneDefault() {
    return { ...DEFAULT_META };
  }

  function cleanInt(value, fallback, min) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, n);
  }

  function cleanNickname(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-zA-Z0-9 _.-]/g, '')
      .slice(0, 16);
  }

  function nicknameError(value) {
    const name = cleanNickname(value);
    if (name.length < 3) return 'Nickname must be at least 3 characters.';
    if (!/[a-zA-Z0-9]/.test(name)) return 'Nickname needs a letter or number.';

    const compact = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const blocked = BLOCKED_NAME_PARTS.some(part => compact.includes(part));
    if (blocked) return 'Choose a clean nickname.';

    return '';
  }

  function normalize(meta) {
    const source = meta && typeof meta === 'object' ? meta : {};
    return {
      bestFloor: cleanInt(source.bestFloor ?? source.best_floor, DEFAULT_META.bestFloor, 1),
      bestLevel: cleanInt(source.bestLevel ?? source.best_level, DEFAULT_META.bestLevel, 1),
      totalRuns: cleanInt(source.totalRuns ?? source.total_runs, DEFAULT_META.totalRuns, 0),
      totalDeaths: cleanInt(source.totalDeaths ?? source.total_deaths, DEFAULT_META.totalDeaths, 0),
      bossesDefeated: cleanInt(source.bossesDefeated ?? source.bosses_defeated, DEFAULT_META.bossesDefeated, 0),
    };
  }

  function getStorage() {
    try {
      if (!window.localStorage) return null;
      const probe = `${STORAGE_KEY}.probe`;
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (_) {
      return null;
    }
  }

  function getPlayerId() {
    // Prefer authenticated user ID (from Arcade login or game-level auth)
    const authId = typeof ArcadeAuth !== 'undefined' && ArcadeAuth.getUserId();
    if (authId) return authId;

    // Fall back to anonymous localStorage ID
    const storage = getStorage();
    if (!storage) return 'browser-player';
    let id = storage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      storage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  }

  function setLocalJson(key, value) {
    const storage = getStorage();
    if (!storage) return;
    try {
      if (value === null || value === undefined) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function getLocalJson(key, fallback) {
    const storage = getStorage();
    if (!storage) return fallback;
    try {
      const raw = storage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function emitChange(kind) {
    document.dispatchEvent(new CustomEvent('depths-save-change', { detail: { kind } }));
  }

  async function supabaseRequest(path, options = {}) {
    if (!supabaseEnabled) return null;
    const headers = {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...options, headers });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function metaToDb(meta) {
    const clean = normalize(meta);
    return {
      player_id: getPlayerId(),
      best_floor: clean.bestFloor,
      best_level: clean.bestLevel,
      total_runs: clean.totalRuns,
      total_deaths: clean.totalDeaths,
      bosses_defeated: clean.bossesDefeated,
      updated_at: new Date().toISOString(),
    };
  }

  function entryFromDb(row) {
    return normalizeEntry({
      nickname: row.nickname,
      floor: row.floor,
      level: row.level,
      date: row.created_at,
    });
  }

  function loadMeta() {
    return normalize(getLocalJson(STORAGE_KEY, cloneDefault()));
  }

  function saveMeta(meta) {
    const clean = normalize(meta);
    setLocalJson(STORAGE_KEY, clean);
    upsertMetaRemote(clean);
    return clean;
  }

  function normalizeEntry(entry) {
    const source = entry && typeof entry === 'object' ? entry : {};
    return {
      nickname: cleanNickname(source.nickname) || 'Unknown',
      floor: cleanInt(source.floor, 1, 1),
      level: cleanInt(source.level, 1, 1),
      date: typeof source.date === 'string' ? source.date : new Date().toISOString(),
    };
  }

  function sortEntries(entries) {
    return entries
      .map(normalizeEntry)
      .sort((a, b) => (b.level - a.level) || (b.floor - a.floor) || new Date(a.date) - new Date(b.date))
      .slice(0, LEADERBOARD_LIMIT);
  }

  function loadLeaderboard() {
    return sortEntries(getLocalJson(LEADERBOARD_KEY, []));
  }

  function saveLeaderboard(entries) {
    const clean = sortEntries(entries);
    setLocalJson(LEADERBOARD_KEY, clean);
    return clean;
  }

  function loadActiveRun() {
    const parsed = getLocalJson(ACTIVE_RUN_KEY, null);
    return parsed && typeof parsed === 'object' ? parsed : null;
  }

  function saveActiveRun(snapshot) {
    if (snapshot) setLocalJson(ACTIVE_RUN_KEY, snapshot);
    else setLocalJson(ACTIVE_RUN_KEY, null);
    upsertActiveRunRemote(snapshot);
    return snapshot || null;
  }

  function clearActiveRun() {
    return saveActiveRun(null);
  }

  function hasActiveRun() {
    const run = loadActiveRun();
    return !!(run && run.player && run.player.hp > 0);
  }

  function qualifiesForLeaderboard(level, floor) {
    const score = {
      level: cleanInt(level, 1, 1),
      floor: cleanInt(floor, 1, 1),
    };
    const entries = loadLeaderboard();
    if (entries.length < LEADERBOARD_LIMIT) return true;

    const last = entries[entries.length - 1];
    return score.level > last.level || (score.level === last.level && score.floor > last.floor);
  }

  function submitLeaderboardScore(nickname, floor, level) {
    const error = nicknameError(nickname);
    if (error) return { ok: false, error, entries: loadLeaderboard() };

    const entry = normalizeEntry({
      nickname,
      floor,
      level,
      date: new Date().toISOString(),
    });

    const entries = saveLeaderboard([...loadLeaderboard(), entry]);
    insertLeaderboardRemote(entry);

    return { ok: true, entry, entries };
  }

  function updateMeta(mutator) {
    const meta = loadMeta();
    mutator(meta);
    return saveMeta(meta);
  }

  function recordRunStart() {
    return updateMeta(meta => {
      meta.totalRuns += 1;
    });
  }

  function recordDeath(floor, level) {
    return updateMeta(meta => {
      meta.totalDeaths += 1;
      meta.bestFloor = Math.max(meta.bestFloor, cleanInt(floor, 1, 1));
      meta.bestLevel = Math.max(meta.bestLevel, cleanInt(level, 1, 1));
    });
  }

  function recordFloorReached(floor, level) {
    return updateMeta(meta => {
      meta.bestFloor = Math.max(meta.bestFloor, cleanInt(floor, 1, 1));
      meta.bestLevel = Math.max(meta.bestLevel, cleanInt(level, 1, 1));
    });
  }

  function recordBossDefeated() {
    return updateMeta(meta => {
      meta.bossesDefeated += 1;
    });
  }

  function resetMeta() {
    return saveMeta(cloneDefault());
  }

  function resetAll() {
    setLocalJson(STORAGE_KEY, null);
    setLocalJson(LEADERBOARD_KEY, null);
    setLocalJson(ACTIVE_RUN_KEY, null);
    resetRemoteForPlayer();
    const clean = cloneDefault();
    emitChange('all');
    return clean;
  }

  async function hydrateFromSupabase() {
    if (!supabaseEnabled) return;
    try {
      const playerId = encodeURIComponent(getPlayerId());
      const [metaRows, activeRows, leaderboardRows] = await Promise.all([
        supabaseRequest(`depths_player_meta?player_id=eq.${playerId}&select=*`),
        supabaseRequest(`depths_active_runs?player_id=eq.${playerId}&select=state`),
        supabaseRequest(`depths_leaderboard?select=nickname,floor,level,created_at&order=level.desc&order=floor.desc&order=created_at.asc&limit=${LEADERBOARD_LIMIT}`),
      ]);

      if (metaRows && metaRows[0]) {
        setLocalJson(STORAGE_KEY, normalize(metaRows[0]));
        emitChange('meta');
      }
      if (activeRows && activeRows[0] && activeRows[0].state) {
        setLocalJson(ACTIVE_RUN_KEY, activeRows[0].state);
        emitChange('activeRun');
      }
      if (Array.isArray(leaderboardRows)) {
        saveLeaderboard(leaderboardRows.map(entryFromDb));
        emitChange('leaderboard');
      }
    } catch (err) {
      console.warn('[Depths save] Supabase hydrate failed; using local fallback.', err);
    }
  }

  async function upsertMetaRemote(meta) {
    try {
      await supabaseRequest('depths_player_meta?on_conflict=player_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(metaToDb(meta)),
      });
    } catch (err) {
      console.warn('[Depths save] Supabase meta sync failed.', err);
    }
  }

  async function upsertActiveRunRemote(snapshot) {
    try {
      const playerId = getPlayerId();
      if (!snapshot) {
        await supabaseRequest(`depths_active_runs?player_id=eq.${encodeURIComponent(playerId)}`, { method: 'DELETE' });
        return;
      }
      await supabaseRequest('depths_active_runs?on_conflict=player_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          player_id: playerId,
          state: snapshot,
          updated_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.warn('[Depths save] Supabase active run sync failed.', err);
    }
  }

  async function insertLeaderboardRemote(entry) {
    try {
      await supabaseRequest('depths_leaderboard', {
        method: 'POST',
        body: JSON.stringify({
          player_id: getPlayerId(),
          nickname: entry.nickname,
          floor: entry.floor,
          level: entry.level,
          created_at: entry.date,
        }),
      });
      await hydrateFromSupabase();
    } catch (err) {
      console.warn('[Depths save] Supabase leaderboard sync failed.', err);
    }
  }

  async function resetRemoteForPlayer() {
    try {
      const playerId = encodeURIComponent(getPlayerId());
      await Promise.all([
        supabaseRequest(`depths_player_meta?player_id=eq.${playerId}`, { method: 'DELETE' }),
        supabaseRequest(`depths_active_runs?player_id=eq.${playerId}`, { method: 'DELETE' }),
        supabaseRequest(`depths_leaderboard?player_id=eq.${playerId}`, { method: 'DELETE' }),
      ]);
    } catch (err) {
      console.warn('[Depths save] Supabase reset failed.', err);
    }
  }

  function handleResetRequest() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('resetData') !== '1') return;
      resetAll();
      window.location.replace(window.location.pathname);
    } catch (_) {}
  }

  handleResetRequest();

  return {
    ready,
    supabaseEnabled,
    getPlayerId,
    loadMeta,
    loadLeaderboard,
    loadActiveRun,
    saveActiveRun,
    clearActiveRun,
    hasActiveRun,
    qualifiesForLeaderboard,
    submitLeaderboardScore,
    nicknameError,
    recordRunStart,
    recordDeath,
    recordFloorReached,
    recordBossDefeated,
    resetMeta,
    resetAll,
  };
})();
