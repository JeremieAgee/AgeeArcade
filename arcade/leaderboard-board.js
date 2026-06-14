/**
 * ArcadeLeaderboardBoard — in-world leaderboard display.
 *
 * Leaderboard board on the back wall — walk up, press E → shows top 10 scores
 * for each arcade game.
 */
window.ArcadeLeaderboardBoard = (() => {
  'use strict';

  const BOARD_POS  = [0, 3.6, -14.85];
  const NEAR_X     = 3.2;
  const NEAR_Z     = 11.0;
  const NEON_HEX   = '#00e5ff';
  const NEON       = 0x00e5ff;

  let _near         = false;
  let _promptEl     = null;
  let _overlayEl    = null;
  let _titleEl      = null;
  let _bodyEl       = null;
  let _currentGame  = null;
  let _navButtons   = {};

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
          sortA: Number(row.level) || 1,
          sortB: Number(row.floor) || 1,
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
          sortA: Number(row.score) || 0,
          sortB: Number(row.floors) || 0,
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
          sortA: Number(row.score) || 0,
          sortB: Number(row.wave) || 0,
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
          sortA: Number(row.score) || 0,
        };
      },
    },
  };

  function _makeBoardTex() {
    const w = 512, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a2e2e');
    bg.addColorStop(1, '#041818');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = NEON_HEX;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = NEON_HEX;
    ctx.shadowBlur  = 18;
    ctx.fillStyle   = NEON_HEX;
    ctx.font        = 'bold 52px "Courier New", monospace';
    ctx.fillText('SCORES', w / 2, h / 2 - 38);

    ctx.shadowBlur = 6;
    ctx.fillStyle  = '#00ffff';
    ctx.font       = '18px "Courier New", monospace';
    ctx.fillText('top 10 · compete globally', w / 2, h / 2 + 18);

    ctx.shadowBlur = 0;
    ctx.fillStyle  = 'rgba(200,220,220,0.5)';
    ctx.font       = '16px "Courier New", monospace';
    ctx.fillText('[E] view leaderboards', w / 2, h / 2 + 64);

    return new THREE.CanvasTexture(c);
  }

  function _buildBoard(scene) {
    const [bx, by, bz] = BOARD_POS;

    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 3.4, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x081428 })
    );
    backing.position.set(bx, by, bz);
    scene.add(backing);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(6.3, 3.1),
      new THREE.MeshBasicMaterial({ map: _makeBoardTex() })
    );
    face.position.set(bx, by, bz + 0.07);
    scene.add(face);

    const neon = new THREE.PointLight(NEON, 3.5, 12);
    neon.position.set(bx, by + 2.2, bz);
    scene.add(neon);
  }

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

  async function displayLeaderboard(gameId) {
    const game = window.games ? window.games.find(g => g.id === gameId) : null;
    const provider = leaderboardProviders[gameId];

    if (!game || !provider) return;

    _currentGame = gameId;
    if (_titleEl) _titleEl.textContent = game.title.replace('\n', ' ');
    if (_bodyEl) _bodyEl.innerHTML = '<div style="padding: 1rem; text-align: center;">Loading scores...</div>';

    try {
      const remote = await fetchRemoteRows(provider);
      const rows = (remote || []).map(row => provider.mapRemote(row));

      if (!rows.length) {
        if (_bodyEl) _bodyEl.innerHTML = '<div style="padding: 1rem; text-align: center; color: rgba(200,220,220,0.6);">No scores yet for this game.</div>';
        return;
      }

      let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">';
      rows.slice(0, 10).forEach((entry, index) => {
        html += `<tr style="border-bottom: 1px solid rgba(0,229,255,0.2);">
          <td style="padding: 0.5rem; text-align: center; color: ${index === 0 ? '#ffcc00' : '#00e5ff'}; font-weight: bold;">#${index + 1}</td>
          <td style="padding: 0.5rem; color: #e8e8f0;">${escapeHtml(entry.nickname)}</td>
          <td style="padding: 0.5rem; text-align: right; color: #00e5ff;">${Number(entry.primary).toLocaleString()}</td>
        </tr>`;
      });
      html += '</table>';

      if (_bodyEl) _bodyEl.innerHTML = html;
    } catch (err) {
      if (_bodyEl) _bodyEl.innerHTML = '<div style="padding: 1rem; text-align: center; color: rgba(200,100,100,0.8);">Error loading scores</div>';
    }
  }

  function openFor(gameId) {
    if (_overlayEl) _overlayEl.hidden = false;
    displayLeaderboard(gameId);
    if (window.ArcadePlayer) ArcadePlayer.enterZooming();
    if (window.ArcadeScene) ArcadeScene.pause();
  }

  function close() {
    if (_overlayEl) _overlayEl.hidden = true;
    _currentGame = null;
    if (window.ArcadePlayer) ArcadePlayer.enterExplore();
    if (window.ArcadeScene) ArcadeScene.resume();
  }

  function tick() {
    const pos = ArcadePlayer.position;
    const dx = pos.x - BOARD_POS[0];
    const dz = pos.z - BOARD_POS[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    const near = dist < 3.5 && Math.abs(dx) < NEAR_X && pos.z < NEAR_Z;

    if (near !== _near) {
      _near = near;
      if (_promptEl) {
        if (_near) {
          _promptEl.textContent = '[E]  View Leaderboards';
          _promptEl.hidden = false;
        } else {
          _promptEl.hidden = true;
        }
      }
    }
  }

  function init(scene) {
    _overlayEl = document.getElementById('leaderboard-overlay');
    _titleEl = document.getElementById('leaderboard-overlay-title');
    _bodyEl = document.getElementById('leaderboard-panel-body');
    _promptEl = document.getElementById('interact-prompt');

    if (!_overlayEl || !_titleEl || !_bodyEl) {
      console.error('[ArcadeLeaderboardBoard] overlay elements missing');
      return;
    }

    _buildBoard(scene);

    const closeBtn = document.getElementById('leaderboard-overlay-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }

    window.addEventListener('arcade:interact', () => {
      const pos = ArcadePlayer.position;
      const dx = pos.x - BOARD_POS[0];
      const dz = pos.z - BOARD_POS[2];
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 3.5 && Math.abs(dx) < NEAR_X && pos.z < NEAR_Z) {
        const cabinetIds = Object.keys(leaderboardProviders);
        const gameId = cabinetIds[Math.floor(Math.random() * cabinetIds.length)];
        openFor(gameId);
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || e.key === 'Escape') && !_overlayEl.hidden) {
        e.preventDefault();
        close();
      }
    });
  }

  return { init, tick, openFor, close };
})();
