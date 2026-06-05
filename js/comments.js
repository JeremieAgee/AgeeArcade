/* ═══════════════════════════════════════════════════
   comments.js  —  Shared comments widget for Agee Arcade
   Depends on arcade-auth.js (window._ageeSupabaseClient).

   Alpha behaviour:
   - Any signed-in user can write a comment
   - Only admin can see the comment list
   - Non-admins see a "thank you" confirmation after posting

   Usage:
     ArcadeComments.init({ pageId: 'arcade',              containerId: 'arcade-comments', theme: 'arcade'  })
     ArcadeComments.init({ pageId: 'depths-of-ashenveil', containerId: 'doa-comments',    theme: 'dungeon' })
════════════════════════════════════════════════════ */
const ArcadeComments = (() => {
  const MAX_LEN   = 500;
  const PAGE_SIZE = 30;

  /* ── helpers ──────────────────────────────────── */
  function _client() { return window._ageeSupabaseClient || null; }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    if (d < 30) return d + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  function _displayName(user) {
    if (!user) return 'Anonymous';
    return (
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name     ||
      user.email?.split('@')[0]         ||
      'Player'
    );
  }

  function _isAdmin(user) {
    return user?.app_metadata?.role === 'admin';
  }

  /* ── CSS ──────────────────────────────────────── */
  function _injectStyles() {
    if (document.getElementById('ac-styles')) return;
    const s = document.createElement('style');
    s.id = 'ac-styles';
    s.textContent = `
.ac-wrap {
  max-width: 780px;
  margin: 2.5rem auto;
  padding: 0 1rem 3rem;
  font-family: inherit;
}
.ac-wrap h2 {
  font-size: .95rem;
  letter-spacing: .14em;
  text-transform: uppercase;
  border-bottom: 1px solid;
  padding-bottom: .5rem;
  margin-bottom: 1.25rem;
}

/* Arcade colours */
.ac-theme-arcade             { color: #a090c0; }
.ac-theme-arcade h2          { color: #c0aaff; border-color: #2a1e4a; }
.ac-theme-arcade .ac-author  { color: #9966ff; }
.ac-theme-arcade .ac-meta    { color: #4a3a6a; }
.ac-theme-arcade .ac-textarea {
  background: #0d0a1a; border: 1px solid #2a1e4a; color: #c0b8e0;
}
.ac-theme-arcade .ac-textarea:focus { border-color: #6c3bff; }
.ac-theme-arcade .ac-submit {
  background: #2a1e4a; border: 1px solid #6c3bff; color: #c0aaff;
}
.ac-theme-arcade .ac-submit:hover:not(:disabled) { background: #3a2860; }
.ac-theme-arcade .ac-item    { border-bottom: 1px solid #1a1428; }
.ac-theme-arcade .ac-login-prompt a { color: #9966ff; }
.ac-theme-arcade .ac-posted-msg { color: #6699aa; }
.ac-theme-arcade .ac-empty   { color: #3a2a5a; }
.ac-theme-arcade .ac-del-btn { color: #4a2a2a; }
.ac-theme-arcade .ac-del-btn:hover { color: #cc4444; }

/* Dungeon colours (DoA) */
.ac-theme-dungeon             { color: #c8b89a; }
.ac-theme-dungeon h2          { color: #e8d5a3; border-color: #3a2e1e; }
.ac-theme-dungeon .ac-author  { color: #d4a85a; }
.ac-theme-dungeon .ac-meta    { color: #6a5a40; }
.ac-theme-dungeon .ac-textarea {
  background: #1a140e; border: 1px solid #3a2e1e; color: #c8b89a;
}
.ac-theme-dungeon .ac-textarea:focus { border-color: #6a5030; }
.ac-theme-dungeon .ac-submit {
  background: #2a1e0e; border: 1px solid #6a5030; color: #d4a85a;
}
.ac-theme-dungeon .ac-submit:hover:not(:disabled) { background: #3d2c10; }
.ac-theme-dungeon .ac-item    { border-bottom: 1px solid #2a2016; }
.ac-theme-dungeon .ac-login-prompt a { color: #d4a85a; }
.ac-theme-dungeon .ac-posted-msg { color: #7a9060; }
.ac-theme-dungeon .ac-empty   { color: #5a4a30; }
.ac-theme-dungeon .ac-del-btn { color: #5a3030; }
.ac-theme-dungeon .ac-del-btn:hover { color: #cc4444; }

/* Shared structural */
.ac-list { list-style: none; margin: 0; padding: 0; }
.ac-item {
  padding: .75rem 0;
  display: flex;
  flex-direction: column;
  gap: .3rem;
}
.ac-meta {
  display: flex;
  align-items: center;
  gap: .55rem;
  font-size: .77rem;
}
.ac-author { font-weight: 600; }
.ac-body {
  font-size: .91rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.ac-del-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: .74rem;
  padding: 0 .2rem;
  margin-left: auto;
}
.ac-form { margin-top: 1rem; display: flex; flex-direction: column; gap: .55rem; }
.ac-textarea {
  border-radius: 4px;
  font-family: inherit;
  font-size: .91rem;
  line-height: 1.5;
  min-height: 76px;
  padding: .55rem .7rem;
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
  outline: none;
}
.ac-form-row { display: flex; align-items: center; gap: .65rem; }
.ac-submit {
  border-radius: 3px;
  cursor: pointer;
  font-size: .82rem;
  letter-spacing: .06em;
  padding: .38rem .95rem;
  transition: background .15s;
}
.ac-submit:disabled { opacity: .5; cursor: default; }
.ac-charcount { font-size: .76rem; margin-left: auto; opacity: .65; }
.ac-charcount.ac-over { color: #cc4444 !important; opacity: 1; }
.ac-login-prompt { font-size: .87rem; margin-top: .65rem; }
.ac-login-prompt a { text-decoration: none; }
.ac-login-prompt a:hover { text-decoration: underline; }
.ac-posted-msg { font-size: .87rem; font-style: italic; margin-top: .65rem; }
.ac-empty { font-size: .87rem; font-style: italic; padding: .4rem 0; }
.ac-error { color: #cc5544; font-size: .84rem; margin-top: .25rem; }
.ac-own { margin-top: .5rem; padding: .65rem .75rem; border-radius: 4px; border: 1px solid; }
.ac-theme-arcade  .ac-own { border-color: #2a1e4a; background: #0d0a1a; }
.ac-theme-dungeon .ac-own { border-color: #3a2e1e; background: #1a140e; }
.ac-own-label { font-size: .73rem; text-transform: uppercase; letter-spacing: .1em; opacity: .55; margin-bottom: .35rem; }
.ac-own-body { font-size: .91rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.ac-own-actions { display: flex; align-items: center; gap: .6rem; margin-top: .5rem; font-size: .78rem; }
.ac-own-time { margin-left: auto; opacity: .5; }
.ac-own-edit, .ac-own-delete {
  background: none; border: 1px solid; border-radius: 3px;
  cursor: pointer; font-size: .76rem; padding: 2px 8px;
  font-family: inherit;
}
.ac-theme-arcade  .ac-own-edit  { border-color: #3a2a6a; color: #9966ff; }
.ac-theme-arcade  .ac-own-delete{ border-color: #3a1a1a; color: #884444; }
.ac-theme-dungeon .ac-own-edit  { border-color: #4a3a1a; color: #d4a85a; }
.ac-theme-dungeon .ac-own-delete{ border-color: #3a1a1a; color: #884444; }
.ac-own-edit:hover   { opacity: .8; }
.ac-own-delete:hover { border-color: #cc4444; color: #cc4444; }
.ac-cancel {
  background: none; border: 1px solid; border-radius: 3px;
  cursor: pointer; font-size: .76rem; padding: .38rem .75rem;
  font-family: inherit; opacity: .55;
}
.ac-cancel:hover { opacity: 1; }
`;
    document.head.appendChild(s);
  }

  /* ── state factory ────────────────────────────── */
  function _makeState(pageId, theme) {
    return {
      pageId,
      theme:        theme || 'arcade',
      comments:     [],   // full list (admin only)
      ownComment:   null, // the user's own comment object {id, content, created_at}
      user:         null,
      loading:      true,
      fetchError:   '',
      submitting:   false,
      formError:    '',
      editing:      false, // true when user is editing their own comment
      editError:    '',
    };
  }

  /* ── Supabase queries ─────────────────────────── */
  async function _fetchComments(st) {
    st.loading    = true;
    st.fetchError = '';
    const c = _client();
    if (!c) { st.loading = false; return; }

    /* admin: read all; non-admin: read only own (RLS enforces this server-side) */
    const { data, error } = await c
      .from('comments')
      .select('id, user_id, display_name, content, created_at')
      .eq('page_id', st.pageId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    st.loading = false;
    if (error) { st.fetchError = 'Could not load comments.'; return; }

    const rows = data || [];
    if (_isAdmin(st.user)) {
      st.comments = rows;
    } else {
      /* non-admin only gets their own back (if RLS allows own-read) */
      st.ownComment = rows.find(r => r.user_id === st.user?.id) || st.ownComment;
    }
  }

  async function _fetchOwnComment(st) {
    const c = _client();
    if (!c || !st.user) return;
    const { data } = await c
      .from('comments')
      .select('id, user_id, display_name, content, created_at')
      .eq('page_id', st.pageId)
      .eq('user_id', st.user.id)
      .limit(1)
      .maybeSingle();
    st.ownComment = data || null;
  }

  async function _submit(st, content, render) {
    const c = _client();
    if (!c || !st.user) return;
    st.submitting = true;
    st.formError  = '';
    render();

    const { data, error } = await c.from('comments').insert({
      page_id:      st.pageId,
      user_id:      st.user.id,
      display_name: _displayName(st.user),
      content:      content.trim(),
    }).select('id, user_id, display_name, content, created_at').maybeSingle();

    st.submitting = false;
    if (error) {
      st.formError = 'Failed to post. Please try again.';
      render();
      return;
    }
    /* store the returned comment so the user can see / edit / delete it */
    st.ownComment = data || { user_id: st.user.id, display_name: _displayName(st.user), content: content.trim(), created_at: new Date().toISOString() };
    if (_isAdmin(st.user)) {
      await _fetchComments(st);
    }
    render();
  }

  async function _updateComment(st, id, newContent, render) {
    const c = _client();
    if (!c || !st.user) return;
    st.editError  = '';
    const { data, error } = await c
      .from('comments')
      .update({ content: newContent.trim() })
      .eq('id', id)
      .eq('user_id', st.user.id)
      .select('id, user_id, display_name, content, created_at')
      .maybeSingle();
    if (error) { st.editError = 'Could not save edit.'; render(); return; }
    st.ownComment = data || st.ownComment;
    st.editing    = false;
    /* refresh admin list */
    if (_isAdmin(st.user)) st.comments = st.comments.map(cm => cm.id === id ? (data || cm) : cm);
    render();
  }

  async function _deleteComment(st, id, render) {
    const c = _client();
    if (!c || !st.user) return;
    await c.from('comments').delete().eq('id', id).eq('user_id', st.user.id);
    if (st.ownComment?.id === id) st.ownComment = null;
    st.comments = st.comments.filter(cm => cm.id !== id);
    st.editing  = false;
    render();
  }

  /* ── rendering ────────────────────────────────── */
  function _buildHtml(st) {
    const { comments, loading, fetchError, user, submitting, formError, theme, ownComment, editing, editError } = st;
    const admin = _isAdmin(user);

    /* ── top area: post form or own-comment display ── */
    let topHtml;
    if (!user) {
      topHtml = `<p class="ac-login-prompt">
        <a href="#" class="ac-login-link">Sign in</a> to leave a comment.
      </p>`;
    } else if (ownComment && !editing) {
      /* user already posted — show their comment with edit/delete */
      topHtml = `
        <div class="ac-own">
          <div class="ac-own-label">Your comment</div>
          <div class="ac-own-body">${_esc(ownComment.content)}</div>
          <div class="ac-own-actions">
            <button class="ac-own-edit" data-id="${_esc(ownComment.id)}">Edit</button>
            <button class="ac-own-delete ac-del-btn" data-id="${_esc(ownComment.id)}">Delete</button>
            <span class="ac-own-time">${_esc(_timeAgo(ownComment.created_at))}</span>
          </div>
        </div>`;
    } else if (ownComment && editing) {
      /* inline edit form */
      topHtml = `
        <form class="ac-form" id="ac-edit-form-${st.pageId}">
          <textarea class="ac-textarea" id="ac-edit-text-${st.pageId}"
            maxlength="${MAX_LEN}" rows="3">${_esc(ownComment.content)}</textarea>
          <div class="ac-form-row">
            <button class="ac-submit" type="submit">Save</button>
            <button class="ac-cancel" type="button" id="ac-edit-cancel-${st.pageId}">Cancel</button>
            <span class="ac-charcount" id="ac-edit-cc-${st.pageId}">${ownComment.content.length} / ${MAX_LEN}</span>
          </div>
          ${editError ? `<p class="ac-error">${_esc(editError)}</p>` : ''}
        </form>`;
    } else {
      /* no comment yet — show post form */
      topHtml = `
        <form class="ac-form" id="ac-form-${st.pageId}">
          <textarea class="ac-textarea" id="ac-text-${st.pageId}"
            maxlength="${MAX_LEN}" placeholder="Write a comment..." rows="3"></textarea>
          <div class="ac-form-row">
            <button class="ac-submit" type="submit"${submitting ? ' disabled' : ''}>
              ${submitting ? 'Posting...' : 'Post Comment'}
            </button>
            <span class="ac-charcount" id="ac-cc-${st.pageId}">0 / ${MAX_LEN}</span>
          </div>
          ${formError ? `<p class="ac-error">${_esc(formError)}</p>` : ''}
        </form>`;
    }

    /* ── comment list — admin sees all, non-admin sees nothing extra ── */
    let listHtml = '';
    if (admin) {
      if (loading) {
        listHtml = '<p class="ac-empty">Loading comments...</p>';
      } else if (fetchError) {
        listHtml = `<p class="ac-error">${_esc(fetchError)}</p>`;
      } else if (!comments.length) {
        listHtml = '<p class="ac-empty">No comments yet.</p>';
      } else {
        listHtml = '<ul class="ac-list">' +
          comments.map(cm => `<li class="ac-item">
            <div class="ac-meta">
              <span class="ac-author">${_esc(cm.display_name)}</span>
              <span>${_esc(_timeAgo(cm.created_at))}</span>
              <button class="ac-del-btn" data-id="${_esc(cm.id)}" title="Delete">&#x2715;</button>
            </div>
            <div class="ac-body">${_esc(cm.content)}</div>
          </li>`).join('') +
          '</ul>';
      }
    }

    return `<div class="ac-wrap ac-theme-${_esc(theme)}">
      <h2>Comments</h2>
      ${topHtml}
      ${listHtml}
    </div>`;
  }

  function _bindEvents(container, st, render) {
    if (!st.user) {
      container.querySelector('.ac-login-link')?.addEventListener('click', e => {
        e.preventDefault();
        if (window.ArcadeAuth?.show) window.ArcadeAuth.show('login');
        else document.getElementById('arcadeAuthBtn')?.click();
      });
      return;
    }

    if (st.ownComment && !st.editing) {
      /* own comment actions */
      container.querySelector('.ac-own-edit')?.addEventListener('click', () => {
        st.editing = true;
        render();
      });
    } else if (st.ownComment && st.editing) {
      /* edit form */
      const form      = container.querySelector(`#ac-edit-form-${st.pageId}`);
      const textarea  = container.querySelector(`#ac-edit-text-${st.pageId}`);
      const charcount = container.querySelector(`#ac-edit-cc-${st.pageId}`);
      const cancel    = container.querySelector(`#ac-edit-cancel-${st.pageId}`);

      textarea?.addEventListener('input', () => {
        const len = textarea.value.length;
        charcount.textContent = `${len} / ${MAX_LEN}`;
        charcount.classList.toggle('ac-over', len > MAX_LEN);
      });

      cancel?.addEventListener('click', () => { st.editing = false; render(); });

      form?.addEventListener('submit', e => {
        e.preventDefault();
        const val = textarea?.value?.trim() || '';
        if (!val || val.length > MAX_LEN) return;
        _updateComment(st, st.ownComment.id, val, render);
      });
    } else {
      /* new post form */
      const form      = container.querySelector(`#ac-form-${st.pageId}`);
      const textarea  = container.querySelector(`#ac-text-${st.pageId}`);
      const charcount = container.querySelector(`#ac-cc-${st.pageId}`);

      textarea?.addEventListener('input', () => {
        const len = textarea.value.length;
        charcount.textContent = `${len} / ${MAX_LEN}`;
        charcount.classList.toggle('ac-over', len > MAX_LEN);
      });

      form?.addEventListener('submit', e => {
        e.preventDefault();
        const val = textarea?.value?.trim() || '';
        if (!val || val.length > MAX_LEN) return;
        _submit(st, val, render);
      });
    }

    /* delete — works from both own-comment view and admin list */
    container.querySelectorAll('.ac-del-btn').forEach(btn => {
      btn.addEventListener('click', () => _deleteComment(st, btn.dataset.id, render));
    });
  }

  /* ── public init ──────────────────────────────── */
  async function init({ pageId, containerId, theme }) {
    const container = document.getElementById(containerId);
    if (!container) return;
    _injectStyles();

    const st = _makeState(pageId, theme);

    function render() {
      container.innerHTML = _buildHtml(st);
      _bindEvents(container, st, render);
    }

    /* seed user from current session */
    const c = _client();
    if (c) {
      const { data: { session } } = await c.auth.getSession();
      st.user = session?.user || null;
    }

    /* react to sign-in / sign-out */
    document.addEventListener('arcade-auth-change', e => {
      st.user    = e.detail?.user || null;
      st.editing = false;
      if (!st.user) {
        st.ownComment = null;
        render();
        return;
      }
      const fetches = [_fetchOwnComment(st)];
      if (_isAdmin(st.user)) fetches.push(_fetchComments(st));
      Promise.all(fetches).then(render);
    });

    /* initial fetch */
    const fetches = [_fetchOwnComment(st)];
    if (_isAdmin(st.user)) fetches.push(_fetchComments(st));
    await Promise.all(fetches);
    st.loading = false;
    render();
  }

  return { init };
})();
