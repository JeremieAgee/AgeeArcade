/* ═══════════════════════════════════════════════════
   arcade-auth.js  —  Site-wide Supabase auth for Agee Arcade
   Runs on every page. Supabase stores the session in localStorage
   so login persists automatically as the player navigates between games.
════════════════════════════════════════════════════ */
const ArcadeAuth = (() => {

  // Same Supabase project used by all games
  const SUPABASE_URL     = 'https://xdvrgeaivfqpcsmuqeyi.supabase.co';
  const SUPABASE_ANON    = 'sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O';

  let _client = null;
  let _user   = null;
  let _modal  = null;
  let _mode   = 'login';

  function _arcadeUrl(path) {
    const script = document.currentScript || document.querySelector('script[src$="js/arcade-auth.js"]');
    const root = script ? new URL('../', script.src) : new URL('./', window.location.href);
    return new URL(path, root).pathname;
  }

  /* ── Init Supabase client ───────────────────── */
  function init() {
    if (typeof window.supabase === 'undefined') return;
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

    _client.auth.onAuthStateChange((_event, session) => {
      _user = session?.user ?? null;
      _renderHeaderUser();
      document.dispatchEvent(new CustomEvent('arcade-auth-change', { detail: { user: _user } }));
    });
    _client.auth.getSession().then(({ data: { session } }) => {
      _user = session?.user ?? null;
      _renderHeaderUser();
      document.dispatchEvent(new CustomEvent('arcade-auth-change', { detail: { user: _user } }));
    });

    _buildHeaderButton();
    _buildModal();
    _injectStyles();
  }

  /* ── Header button ──────────────────────────── */
  function _buildHeaderButton() {
    const nav = document.querySelector('.site-nav');
    if (!nav) return;

    // Admin analytics link — hidden until admin signs in
    const adminLink = document.createElement('a');
    adminLink.id        = 'arcadeAdminBtn';
    adminLink.className = 'arcade-admin-btn';
    adminLink.textContent = '⚡ Analytics';
    adminLink.href      = _arcadeUrl('admin/');
    adminLink.style.display = 'none';
    nav.appendChild(adminLink);

    const btn = document.createElement('button');
    btn.id = 'arcadeAuthBtn';
    btn.className = 'arcade-auth-btn';
    btn.textContent = 'Sign In';
    btn.addEventListener('click', () => {
      if (_user) _renderSignedInMenu(btn);
      else show('login');
    });
    nav.appendChild(btn);
  }

  function _renderHeaderUser() {
    const btn = document.getElementById('arcadeAuthBtn');
    if (!btn) return;
    btn.textContent = _user ? (_user.email.split('@')[0]) : 'Sign In';
    btn.classList.toggle('arcade-auth-btn--signed-in', !!_user);

    const adminBtn = document.getElementById('arcadeAdminBtn');
    if (adminBtn) adminBtn.style.display = _isAdmin() ? 'inline-flex' : 'none';
  }

  function _isAdmin() {
    return _user?.app_metadata?.role === 'admin';
  }

  function _renderSignedInMenu(anchor) {
    const existing = document.getElementById('arcadeUserMenu');
    if (existing) { existing.remove(); return; }

    const adminLink = _isAdmin()
      ? `<a class="aum-item aum-admin" href="${_arcadeUrl('admin/')}">⚡ Analytics</a>`
      : '';

    const menu = document.createElement('div');
    menu.id = 'arcadeUserMenu';
    menu.className = 'arcade-user-menu';
    menu.innerHTML = `
      <div class="aum-email">${_user.email}</div>
      <a class="aum-item" href="${_arcadeUrl('leaderboards/')}">Leaderboards</a>
      ${adminLink}
      <button class="aum-item aum-signout" id="arcadeSignOut">Sign out</button>`;

    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.top   = (rect.bottom + 6) + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';

    document.getElementById('arcadeSignOut').addEventListener('click', async () => {
      await signOut();
      menu.remove();
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function outside(e) {
        if (!menu.contains(e.target) && e.target !== anchor) {
          menu.remove();
          document.removeEventListener('click', outside);
        }
      });
    }, 0);
  }

  /* ── Modal ──────────────────────────────────── */
  function _buildModal() {
    _modal = document.createElement('div');
    _modal.id = 'arcadeAuthModal';
    _modal.innerHTML = `
      <div class="aam-box">
        <button class="aam-close" id="aamClose">✕</button>
        <div class="aam-logo">⚔</div>
        <h2 class="aam-title" id="aamTitle">SIGN IN</h2>
        <p  class="aam-sub"   id="aamSub">Save scores &amp; progress across all games</p>
        <p  class="aam-error" id="aamError"></p>
        <p  class="aam-info"  id="aamInfo"></p>
        <input class="aam-input" id="aamEmail"    type="email"    placeholder="Email address"     autocomplete="email" />
        <input class="aam-input" id="aamPassword" type="password" placeholder="Password (min 6 chars)" autocomplete="current-password" />
        <button class="aam-btn-primary" id="aamSubmit">SIGN IN</button>
        <div class="aam-divider"><span>or</span></div>
        <button class="aam-btn-ghost"   id="aamGuest">CONTINUE AS GUEST</button>
        <p class="aam-switch" id="aamSwitch">No account? <a href="#" id="aamSwitchLink">Create one</a></p>
        <p class="aam-forgot" id="aamForgot"><a href="#" id="aamForgotLink">Forgot password?</a></p>
        <p class="aam-back"   id="aamBack"   style="display:none"><a href="#" id="aamBackLink">← Back to sign in</a></p>
      </div>`;
    document.body.appendChild(_modal);

    document.getElementById('aamClose').addEventListener('click',       () => hide());
    document.getElementById('aamGuest').addEventListener('click',       () => hide());
    document.getElementById('aamSubmit').addEventListener('click',      _handleSubmit);
    document.getElementById('aamSwitchLink').addEventListener('click',  e => { e.preventDefault(); _setMode(_mode === 'login' ? 'signup' : 'login'); });
    document.getElementById('aamForgotLink').addEventListener('click',  e => { e.preventDefault(); _setMode('reset'); });
    document.getElementById('aamBackLink').addEventListener('click',    e => { e.preventDefault(); _setMode('login'); });
    _modal.addEventListener('click', e => { if (e.target === _modal) hide(); });

    ['aamEmail','aamPassword'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') _handleSubmit(); });
    });
  }

  function _setMode(m) {
    _mode = m;
    document.getElementById('aamError').textContent = '';
    document.getElementById('aamInfo').textContent  = '';
    const pw     = document.getElementById('aamPassword');
    const sw     = document.getElementById('aamSwitch');
    const forgot = document.getElementById('aamForgot');
    const back   = document.getElementById('aamBack');

    if (m === 'login') {
      document.getElementById('aamTitle').textContent  = 'SIGN IN';
      document.getElementById('aamSub').textContent    = 'Save scores & progress across all games';
      document.getElementById('aamSubmit').textContent = 'SIGN IN';
      document.getElementById('aamSwitchLink').textContent = 'Create one';
      document.querySelector('#aamSwitch').firstChild.textContent = 'No account? ';
      pw.style.display = ''; sw.style.display = ''; forgot.style.display = ''; back.style.display = 'none';
    } else if (m === 'signup') {
      document.getElementById('aamTitle').textContent  = 'CREATE ACCOUNT';
      document.getElementById('aamSub').textContent    = 'Join the leaderboard';
      document.getElementById('aamSubmit').textContent = 'CREATE ACCOUNT';
      document.getElementById('aamSwitchLink').textContent = 'Sign in instead';
      document.querySelector('#aamSwitch').firstChild.textContent = 'Already have one? ';
      pw.style.display = ''; sw.style.display = ''; forgot.style.display = 'none'; back.style.display = 'none';
    } else {
      document.getElementById('aamTitle').textContent  = 'RESET PASSWORD';
      document.getElementById('aamSub').textContent    = 'We\'ll send a reset link to your email';
      document.getElementById('aamSubmit').textContent = 'SEND RESET LINK';
      pw.style.display = 'none'; sw.style.display = 'none'; forgot.style.display = 'none'; back.style.display = '';
    }
  }

  async function _handleSubmit() {
    const email    = document.getElementById('aamEmail').value.trim();
    const password = document.getElementById('aamPassword').value;
    const btn      = document.getElementById('aamSubmit');
    document.getElementById('aamError').textContent = '';
    document.getElementById('aamInfo').textContent  = '';

    if (!email) { document.getElementById('aamError').textContent = 'Please enter your email.'; return; }
    if (_mode !== 'reset' && password.length < 6) { document.getElementById('aamError').textContent = 'Password must be at least 6 characters.'; return; }

    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = '...';

    try {
      if (_mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) document.getElementById('aamError').textContent = error;
        else hide();
      } else if (_mode === 'signup') {
        const { error } = await signUp(email, password);
        if (error) document.getElementById('aamError').textContent = error;
        else { document.getElementById('aamInfo').textContent = 'Account created! Check your email to confirm, then sign in.'; _setMode('login'); }
      } else {
        const { error } = await resetPassword(email);
        if (error) document.getElementById('aamError').textContent = error;
        else document.getElementById('aamInfo').textContent = 'Reset link sent — check your inbox.';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  /* ── Public auth methods ────────────────────── */
  async function signUp(email, password) {
    if (!_client) return { error: 'Auth not ready.' };
    const { data, error } = await _client.auth.signUp({ email, password });
    return { data, error: error?.message ?? null };
  }

  async function signIn(email, password) {
    if (!_client) return { error: 'Auth not ready.' };
    const { data, error } = await _client.auth.signInWithPassword({ email, password });
    return { data, error: error?.message ?? null };
  }

  async function signOut() {
    if (!_client) return;
    await _client.auth.signOut();
    _user = null;
    _renderHeaderUser();
  }

  async function resetPassword(email) {
    if (!_client) return { error: 'Auth not ready.' };
    const { error } = await _client.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
    return { error: error?.message ?? null };
  }

  function show(m = 'login') {
    _setMode(m);
    _modal.classList.add('aam-visible');
    setTimeout(() => document.getElementById('aamEmail').focus(), 50);
  }

  function hide() {
    _modal.classList.remove('aam-visible');
  }

  function getUser()    { return _user; }
  function getUserId()  { return _user?.id ?? null; }
  function getEmail()   { return _user?.email ?? null; }
  function isLoggedIn() { return !!_user; }

  /* ── Styles ─────────────────────────────────── */
  function _injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
/* Admin analytics nav button */
.arcade-admin-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(108,59,255,0.15); border: 1px solid #6c3bff;
  color: #c0aaff; font-family: 'Orbitron', sans-serif;
  font-size: 10px; letter-spacing: 1px;
  padding: 6px 12px; border-radius: 3px;
  text-decoration: none; transition: all 0.2s;
}
.arcade-admin-btn:hover { background: rgba(108,59,255,0.3); color: #fff; }

/* Arcade auth header button */
.arcade-auth-btn {
  background: none; border: 1px solid #3a2a6a; color: #8888aa;
  font-family: 'Orbitron', sans-serif; font-size: 11px; letter-spacing: 1px;
  padding: 6px 14px; cursor: pointer; transition: all 0.2s; border-radius: 3px;
}
.arcade-auth-btn:hover { border-color: #6c3bff; color: #fff; }
.arcade-auth-btn--signed-in { border-color: #6c3bff; color: #c0aaff; }

/* Signed-in dropdown menu */
.arcade-user-menu {
  position: fixed; z-index: 9999; min-width: 200px;
  background: #12121a; border: 1px solid #2a1e4a;
  border-radius: 6px; box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  overflow: hidden;
}
.aum-email { padding: 12px 16px; font-size: 12px; color: #8888aa; border-bottom: 1px solid #1e1e2e; word-break: break-all; }
.aum-item { display: block; padding: 10px 16px; font-size: 13px; color: #c0c0d8; background: none;
  border: none; border-bottom: 1px solid #1e1e2e; width: 100%; text-align: left;
  cursor: pointer; text-decoration: none; font-family: inherit; transition: background 0.15s; }
.aum-item:hover { background: #1e1e2e; color: #fff; }
.aum-admin { color: #c0aaff !important; border-top: 1px solid #1e1e2e; }
.aum-signout { color: #cc4444 !important; }
.aum-signout:hover { background: #2a1010 !important; }

/* Modal overlay */
#arcadeAuthModal {
  position: fixed; inset: 0; z-index: 9998;
  background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none; transition: opacity 0.2s;
}
#arcadeAuthModal.aam-visible { opacity: 1; pointer-events: all; }

/* Modal box */
.aam-box {
  position: relative; width: min(420px, 92vw);
  background: linear-gradient(180deg, #0d0a1a, #0a0812);
  border: 1px solid #2a1e4a; border-radius: 10px;
  padding: 40px 36px 32px; box-shadow: 0 24px 80px rgba(0,0,0,0.7);
  display: flex; flex-direction: column; gap: 12px;
}
.aam-close {
  position: absolute; top: 14px; right: 14px;
  background: none; border: none; color: #4a3a6a; font-size: 16px;
  cursor: pointer; line-height: 1; padding: 4px 8px;
}
.aam-close:hover { color: #fff; }
.aam-logo { font-size: 28px; text-align: center; margin-bottom: 4px; }
.aam-title {
  font-family: 'Orbitron', sans-serif; font-size: 18px; letter-spacing: 3px;
  color: #c0aaff; text-align: center; margin: 0;
}
.aam-sub { font-size: 12px; color: #6c5a8a; text-align: center; margin: 0; }
.aam-error { font-size: 12px; color: #cc4444; text-align: center; min-height: 16px; margin: 0; }
.aam-info  { font-size: 12px; color: #44aa66; text-align: center; min-height: 16px; margin: 0; }
.aam-input {
  width: 100%; padding: 11px 14px; background: #0a0812;
  border: 1px solid #2a1e4a; border-radius: 4px; color: #e0d8ff;
  font-size: 14px; font-family: inherit; box-sizing: border-box;
  transition: border-color 0.15s; outline: none;
}
.aam-input:focus { border-color: #6c3bff; }
.aam-btn-primary {
  width: 100%; padding: 13px; background: #6c3bff; border: none;
  border-radius: 4px; color: #fff; font-family: 'Orbitron', sans-serif;
  font-size: 13px; letter-spacing: 2px; cursor: pointer; transition: background 0.15s;
}
.aam-btn-primary:hover:not(:disabled) { background: #8a5aff; }
.aam-btn-primary:disabled { opacity: 0.5; cursor: default; }
.aam-btn-ghost {
  width: 100%; padding: 11px; background: none;
  border: 1px solid #2a1e4a; border-radius: 4px; color: #6c5a8a;
  font-family: 'Orbitron', sans-serif; font-size: 11px; letter-spacing: 1px;
  cursor: pointer; transition: all 0.15s;
}
.aam-btn-ghost:hover { border-color: #4a3a7a; color: #a090c8; }
.aam-divider {
  display: flex; align-items: center; gap: 10px; color: #2a1e4a; font-size: 11px;
}
.aam-divider::before, .aam-divider::after {
  content: ''; flex: 1; border-top: 1px solid #2a1e4a;
}
.aam-switch, .aam-forgot, .aam-back {
  font-size: 12px; color: #4a3a6a; text-align: center; margin: 0;
}
.aam-switch a, .aam-forgot a, .aam-back a { color: #8866cc; text-decoration: none; }
.aam-switch a:hover, .aam-forgot a:hover, .aam-back a:hover { color: #c0aaff; }
`;
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { show, hide, signIn, signUp, signOut, getUser, getUserId, getEmail, isLoggedIn, isAdmin: _isAdmin };
})();
