/**
 * ArcadeLeaderboard — leaderboard overlay for each cabinet
 *
 * Opens a leaderboard overlay showing top 10 scores for the selected game.
 */
window.ArcadeLeaderboard = (() => {
  'use strict';

  const SUPABASE_URL = 'https://xdvrgeaivfqpcsmuqeyi.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O';

  const leaderboardProviders = {
    'depths-of-ashenveil': {
      table: 'depths_leaderboard',
      select: 'nickname,floor,level,created_at',
      order: 'level.desc,floor.desc,created_at.asc',
      mapRemote: function (row) {
        return {
          nickname: row.nickname || 'Adventurer',
          primary: Number(row.level) || 1,
          detail: 'Floor ' + (Number(row.floor) || 1),
        };
      },
    },
    'maze-runner': {
      table: 'maze_runner_runs',
      select: 'user_id,floors,score,time_ms',
      order: 'score.desc,floors.desc,time_ms.asc',
      mapRemote: function (row) {
        const user = String(row.user_id || 'guest-player');
        return {
          nickname: user.length > 12 ? user.slice(0, 8) + '...' : user,
          primary: Number(row.score) || 0,
          detail: 'Floor ' + (Number(row.floors) || 0),
        };
      },
    },
    'blacktide-bastion': {
      table: 'blacktide_bastion_leaderboard',
      select: 'nickname,score,wave,created_at',
      order: 'score.desc,wave.desc,created_at.asc',
      mapRemote: function (row) {
        return {
          nickname: row.nickname || 'Captain',
          primary: Number(row.score) || 0,
          detail: 'Wave ' + (Number(row.wave) || 0),
        };
      },
    },
    'spear_fisher': {
      table: 'spear_fisher_leaderboard',
      select: 'nickname,score,created_at',
      order: 'score.desc,created_at.asc',
      mapRemote: function (row) {
        return {
          nickname: row.nickname || 'Fisher',
          primary: Number(row.score) || 0,
          detail: 'Score',
        };
      },
    },
  };

  let _overlayEl = null;
  let _titleEl = null;
  let _bodyEl = null;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function fetchRemoteRows(provider) {
    if (!provider.table) return [];
    const url = new URL(SUPABASE_URL + '/rest/v1/' + provider.table);
    url.searchParams.set('select', provider.select || '*');
    if (provider.order) url.searchParams.set('order', provider.order);
    url.searchParams.set('limit', '10');
    url.searchParams.set('apikey', SUPABASE_ANON_KEY);

    const response = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function displayLeaderboard(gameId, gameTitle) {
    const provider = leaderboardProviders[gameId];

    if (!provider) {
      if (_bodyEl) _bodyEl.innerHTML = '<div style="padding: 1rem; text-align: center; color: rgba(200,200,200,0.6);">No leaderboard data available.</div>';
      return;
    }

    if (_titleEl) _titleEl.textContent = gameTitle + ' — TOP 10';
    if (_bodyEl) _bodyEl.innerHTML = '<div style="padding: 1rem; text-align: center;">Loading scores...</div>';

    try {
      const remote = await fetchRemoteRows(provider);
      const rows = (remote || []).map(row => provider.mapRemote(row));

      if (!rows.length) {
        if (_bodyEl) _bodyEl.innerHTML = '<div style="padding: 1rem; text-align: center; color: rgba(200,200,200,0.6);">No scores yet. Be the first to play!</div>';
        return;
      }

      let html = '<table style="width: 100%; border-collapse: collapse; font-family: Courier New, monospace; font-size: 0.95rem;">';
      html += '<thead style="border-bottom: 2px solid rgba(100,200,255,0.3);"><tr>';
      html += '<th style="padding: 0.5rem; text-align: left; color: #64c8ff;">Rank</th>';
      html += '<th style="padding: 0.5rem; text-align: left; color: #64c8ff;">Player</th>';
      html += '<th style="padding: 0.5rem; text-align: right; color: #64c8ff;">Score</th>';
      html += '<th style="padding: 0.5rem; text-align: right; color: #64c8ff;">Detail</th>';
      html += '</tr></thead>';
      html += '<tbody>';

      rows.slice(0, 10).forEach((entry, index) => {
        const bgColor = index % 2 === 0 ? 'rgba(100,200,255,0.05)' : 'transparent';
        const rankColor = index === 0 ? '#ffcc00' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : '#64c8ff';
        html += `<tr style="border-bottom: 1px solid rgba(100,200,255,0.1); background: ${bgColor};">
          <td style="padding: 0.5rem; color: ${rankColor}; font-weight: bold;">#${index + 1}</td>
          <td style="padding: 0.5rem; color: #e8e8f0;">${escapeHtml(entry.nickname)}</td>
          <td style="padding: 0.5rem; text-align: right; color: #64c8ff;">${Number(entry.primary).toLocaleString()}</td>
          <td style="padding: 0.5rem; text-align: right; color: #a0a0c0; font-size: 0.9rem;">${escapeHtml(entry.detail)}</td>
        </tr>`;
      });
      html += '</tbody></table>';

      if (_bodyEl) _bodyEl.innerHTML = html;
    } catch (err) {
      if (_bodyEl) _bodyEl.innerHTML = '<div style="padding: 1rem; text-align: center; color: rgba(200,100,100,0.8);">Error loading scores</div>';
    }
  }

  function openFor(gameId, gameTitle) {
    if (_overlayEl) _overlayEl.hidden = false;
    displayLeaderboard(gameId, gameTitle);
    if (window.ArcadePlayer) ArcadePlayer.enterZooming();
    if (window.ArcadeScene) ArcadeScene.pause();
  }

  function close() {
    if (_overlayEl) _overlayEl.hidden = true;
    if (window.ArcadePlayer) ArcadePlayer.enterExplore();
    if (window.ArcadeScene) ArcadeScene.resume();
  }

  function init() {
    _overlayEl = document.getElementById('leaderboard-overlay');
    _titleEl = document.getElementById('leaderboard-panel-title');
    _bodyEl = document.getElementById('leaderboard-panel-body');

    if (!_overlayEl || !_titleEl || !_bodyEl) {
      console.error('[ArcadeLeaderboard] overlay elements missing');
      return;
    }

    const closeBtn = document.getElementById('leaderboard-overlay-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }

    document.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || e.key === 'Escape') && !_overlayEl.hidden) {
        e.preventDefault();
        close();
      }
    });
  }

  return { init, openFor, close };
})();
