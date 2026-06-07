window.DEPTHS_SUPABASE_CONFIG = {
  url:     'https://xdvrgeaivfqpcsmuqeyi.supabase.co',
  anonKey: 'sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O',
};

/* ── Supabase JS client + Auth ───────────────────────────────────────────
   Initialised after the SDK loads. Exposes window.DepthsAuth for the rest
   of the game to call without touching Supabase internals directly.
──────────────────────────────────────────────────────────────────────── */
window.DepthsAuth = (() => {
  let _client = null;
  let _user   = null;

  function _emit() {
    document.dispatchEvent(new CustomEvent('depths-auth-change', { detail: { user: _user } }));
  }

  function init() {
    const cfg = window.DEPTHS_SUPABASE_CONFIG;
    if (!cfg.url || !cfg.anonKey) return;
    if (typeof window.supabase === 'undefined') return;

    _client = window.supabase.createClient(cfg.url, cfg.anonKey);

    _client.auth.onAuthStateChange((_event, session) => {
      _user = session?.user ?? null;
      _emit();
    });

    _client.auth.getSession().then(({ data: { session } }) => {
      _user = session?.user ?? null;
      _emit();
    });
  }

  async function signUp(email, password) {
    if (!_client) return { error: 'Supabase not configured.' };
    const { data, error } = await _client.auth.signUp({ email, password });
    if (!error) _user = data?.user ?? null;
    return { data, error: error?.message ?? null };
  }

  async function signIn(email, password) {
    if (!_client) return { error: 'Supabase not configured.' };
    const { data, error } = await _client.auth.signInWithPassword({ email, password });
    if (!error) _user = data?.user ?? null;
    return { data, error: error?.message ?? null };
  }

  async function signOut() {
    if (!_client) return;
    await _client.auth.signOut();
    _user = null;
    _emit();
  }

  async function resetPassword(email) {
    if (!_client) return { error: 'Supabase not configured.' };
    const { error } = await _client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href,
    });
    return { error: error?.message ?? null };
  }

  function getUser()    { return _user; }
  function getUserId()  { return _user?.id ?? null; }
  function getEmail()   { return _user?.email ?? null; }
  function isLoggedIn() { return !!_user; }
  function getClient()  { return _client; }

  async function getAccessToken() {
    if (!_client) return null;
    const { data } = await _client.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  return { signUp, signIn, signOut, resetPassword, getUser, getUserId, getEmail, isLoggedIn, getClient, getAccessToken };
})();
