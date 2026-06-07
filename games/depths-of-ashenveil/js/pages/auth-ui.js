/* ═══════════════════════════════════════════════════
   auth-ui.js — Login / Sign-up modal for Depths of Ashenveil
════════════════════════════════════════════════════ */
const AuthUI = (() => {

  let modal = null;
  let mode  = 'login'; // 'login' | 'signup' | 'reset'

  /* ── Build modal DOM (once) ──────────────────── */
  function build() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'authModal';
    modal.innerHTML = `
      <div class="auth-box">
        <div class="auth-header">
          <span class="auth-logo">⚔</span>
          <h2 class="auth-title" id="authTitle">SIGN IN</h2>
          <p  class="auth-sub"   id="authSub">Save your progress across devices</p>
        </div>
        <div class="auth-body">
          <p class="auth-error" id="authError"></p>
          <p class="auth-info"  id="authInfo"></p>
          <input class="auth-input" id="authEmail"    type="email"    placeholder="Email address"  autocomplete="email" />
          <input class="auth-input" id="authPassword" type="password" placeholder="Password (min 6 chars)" autocomplete="current-password" />
          <button class="auth-btn-primary" id="authSubmit">SIGN IN</button>
          <div class="auth-divider"><span>or</span></div>
          <button class="auth-btn-ghost" id="authGuest">PLAY AS GUEST</button>
          <div class="auth-switch" id="authSwitch">
            No account? <a href="#" id="authSwitchLink">Create one</a>
          </div>
          <div class="auth-forgot" id="authForgot">
            <a href="#" id="authForgotLink">Forgot password?</a>
          </div>
          <div class="auth-back" id="authBack" style="display:none">
            <a href="#" id="authBackLink">← Back to sign in</a>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('authSubmit').addEventListener('click', handleSubmit);
    document.getElementById('authGuest').addEventListener('click', () => hide());
    document.getElementById('authSwitchLink').addEventListener('click', e => { e.preventDefault(); setMode(mode === 'login' ? 'signup' : 'login'); });
    document.getElementById('authForgotLink').addEventListener('click', e => { e.preventDefault(); setMode('reset'); });
    document.getElementById('authBackLink').addEventListener('click',   e => { e.preventDefault(); setMode('login'); });

    // Submit on Enter
    [document.getElementById('authEmail'), document.getElementById('authPassword')].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') handleSubmit(); });
    });

    // Listen for auth changes to update the title screen
    document.addEventListener('arcade-auth-change', updateTitleScreenUser);
  }

  /* ── Mode switching ──────────────────────────── */
  function setMode(m) {
    mode = m;
    clearMessages();
    const title    = document.getElementById('authTitle');
    const sub      = document.getElementById('authSub');
    const submit   = document.getElementById('authSubmit');
    const pw       = document.getElementById('authPassword');
    const sw       = document.getElementById('authSwitch');
    const swLink   = document.getElementById('authSwitchLink');
    const forgot   = document.getElementById('authForgot');
    const back     = document.getElementById('authBack');

    if (m === 'login') {
      title.textContent   = 'SIGN IN';
      sub.textContent     = 'Save your progress across devices';
      submit.textContent  = 'SIGN IN';
      pw.style.display    = '';
      sw.style.display    = '';
      swLink.textContent  = 'Create one';
      document.getElementById('authSwitch').firstChild.textContent = 'No account? ';
      forgot.style.display = '';
      back.style.display   = 'none';
    } else if (m === 'signup') {
      title.textContent   = 'CREATE ACCOUNT';
      sub.textContent     = 'Join the leaderboard';
      submit.textContent  = 'CREATE ACCOUNT';
      pw.style.display    = '';
      sw.style.display    = '';
      swLink.textContent  = 'Sign in instead';
      document.getElementById('authSwitch').firstChild.textContent = 'Already have one? ';
      forgot.style.display = 'none';
      back.style.display   = 'none';
    } else if (m === 'reset') {
      title.textContent   = 'RESET PASSWORD';
      sub.textContent     = 'We\'ll send you a reset link';
      submit.textContent  = 'SEND RESET LINK';
      pw.style.display    = 'none';
      sw.style.display    = 'none';
      forgot.style.display = 'none';
      back.style.display   = '';
    }
  }

  /* ── Submit handler ──────────────────────────── */
  async function handleSubmit() {
    clearMessages();
    const email    = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const submit   = document.getElementById('authSubmit');

    if (!email) { showError('Please enter your email.'); return; }
    if (mode !== 'reset' && password.length < 6) { showError('Password must be at least 6 characters.'); return; }

    submit.disabled = true;
    submit.textContent = '...';

    try {
      if (mode === 'login') {
        const { error } = await ArcadeAuth.signIn(email, password);
        if (error) { showError(error); }
        else        { hide(); }

      } else if (mode === 'signup') {
        const { error } = await ArcadeAuth.signUp(email, password);
        if (error) { showError(error); }
        else {
          showInfo('Account created! Check your email to confirm, then sign in.');
          setMode('login');
        }

      } else if (mode === 'reset') {
        const { error } = await ArcadeAuth.resetPassword(email);
        if (error) { showError(error); }
        else        { showInfo('Reset link sent — check your inbox.'); }
      }
    } finally {
      submit.disabled = false;
      setMode(mode); // restore button text
    }
  }

  /* ── Helpers ─────────────────────────────────── */
  function showError(msg) { document.getElementById('authError').textContent = msg; }
  function showInfo(msg)  { document.getElementById('authInfo').textContent  = msg; }
  function clearMessages() {
    document.getElementById('authError').textContent = '';
    document.getElementById('authInfo').textContent  = '';
  }

  /* ── Show / hide ─────────────────────────────── */
  function show(startMode = 'login') {
    build();
    setMode(startMode);
    modal.classList.add('auth-visible');
    setTimeout(() => document.getElementById('authEmail').focus(), 50);
  }

  function hide() {
    if (modal) modal.classList.remove('auth-visible');
  }

  /* ── Title screen integration ────────────────── */
  function updateTitleScreenUser() {
    const user    = ArcadeAuth.getUser();
    const email   = ArcadeAuth.getEmail();
    let   el      = document.getElementById('authTitleStatus');

    if (!el) {
      el = document.createElement('div');
      el.id = 'authTitleStatus';
      el.className = 'auth-title-status';
      const inner = document.querySelector('.title-inner');
      if (inner) inner.insertBefore(el, inner.firstChild);
    }

    if (user) {
      el.innerHTML = `<span class="auth-status-name">⚔ ${email}</span>
        <a href="#" class="auth-status-link" id="authSignOutBtn">Sign out</a>`;
      document.getElementById('authSignOutBtn').addEventListener('click', async e => {
        e.preventDefault();
        await ArcadeAuth.signOut();
      });
      hide();
    } else {
      el.innerHTML = `<a href="#" class="auth-status-link" id="authSignInBtn">Sign in / Create account</a>`;
      document.getElementById('authSignInBtn').addEventListener('click', e => {
        e.preventDefault();
        show('login');
      });
    }
  }

  // Wire up once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { build(); updateTitleScreenUser(); });
  } else {
    build();
    updateTitleScreenUser();
  }

  return { show, hide };
})();
