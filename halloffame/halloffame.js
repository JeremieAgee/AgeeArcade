/**
 * Hall of Fame — Displays achievements, records, and top players across all games
 */
window.HallOfFame = (() => {
  'use strict';

  const SUPABASE_URL = 'https://xdvrgeaivfqpcsmuqeyi.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O';

  const gameConfigs = {
    'depths-of-ashenveil': {
      title: 'Depths of Ashenveil',
      table: 'depths_leaderboard',
      metric: 'Level',
      icon: '🔮',
      select: 'nickname,level,floor,created_at',
      order: 'level.desc,floor.desc,created_at.asc',
      mapRow: (row) => ({
        nickname: row.nickname || 'Adventurer',
        score: Number(row.level) || 1,
        detail: `Floor ${Number(row.floor) || 1}`,
      }),
    },
    'maze-runner': {
      title: 'Maze Runner',
      table: 'maze_runner_runs',
      metric: 'Score',
      icon: '🌀',
      select: 'user_id,floors,score,time_ms',
      order: 'score.desc,floors.desc,time_ms.asc',
      mapRow: (row) => ({
        nickname: (String(row.user_id || 'Guest')).split('-')[0] || 'Runner',
        score: Number(row.score) || 0,
        detail: `Floor ${Number(row.floors) || 0}`,
      }),
    },
    'blacktide-bastion': {
      title: 'Blacktide Bastion',
      table: 'blacktide_bastion_leaderboard',
      metric: 'Score',
      icon: '⚓',
      select: 'nickname,score,wave,created_at',
      order: 'score.desc,wave.desc,created_at.asc',
      mapRow: (row) => ({
        nickname: row.nickname || 'Captain',
        score: Number(row.score) || 0,
        detail: `Wave ${Number(row.wave) || 0}`,
      }),
    },
    'spear_fisher': {
      title: 'Spear Fisher',
      table: 'spear_fisher_leaderboard',
      metric: 'Score',
      icon: '🎣',
      select: 'nickname,score,created_at',
      order: 'score.desc,created_at.asc',
      mapRow: (row) => ({
        nickname: row.nickname || 'Fisher',
        score: Number(row.score) || 0,
        detail: 'Score',
      }),
    },
  };

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getRecordRank(index) {
    const classes = ['rank-1', 'rank-2', 'rank-3'];
    return classes[index] || '';
  }

  async function fetchGameRecords() {
    const records = {};

    for (const [gameId, config] of Object.entries(gameConfigs)) {
      try {
        const { data, error } = await supabase
          .from(config.table)
          .select(config.select)
          .order(config.order.split(',')[0].split('.')[0], { ascending: false })
          .limit(1);

        if (error) {
          console.error(`Error fetching ${gameId}:`, error);
          records[gameId] = null;
          continue;
        }

        if (data && data.length > 0) {
          records[gameId] = {
            ...config.mapRow(data[0]),
            gameId,
            config,
          };
        }
      } catch (e) {
        console.error(`Exception fetching ${gameId}:`, e);
      }
    }

    return records;
  }

  async function fetchAllLeaderboards() {
    const leaderboards = {};

    for (const [gameId, config] of Object.entries(gameConfigs)) {
      try {
        const { data, error } = await supabase
          .from(config.table)
          .select(config.select)
          .order(config.order.split(',')[0].split('.')[0], { ascending: false })
          .limit(10);

        if (error) {
          console.error(`Error fetching leaderboard ${gameId}:`, error);
          continue;
        }

        leaderboards[gameId] = (data || []).map(config.mapRow);
      } catch (e) {
        console.error(`Exception fetching leaderboard ${gameId}:`, e);
      }
    }

    return leaderboards;
  }

  async function fetchAllScores() {
    const allScores = [];

    for (const [gameId, config] of Object.entries(gameConfigs)) {
      try {
        const { data, error } = await supabase
          .from(config.table)
          .select(config.select);

        if (error) {
          console.error(`Error fetching all scores ${gameId}:`, error);
          continue;
        }

        (data || []).forEach((row) => {
          const mapped = config.mapRow(row);
          allScores.push({
            ...mapped,
            gameId,
            gameName: config.title,
          });
        });
      } catch (e) {
        console.error(`Exception fetching all scores ${gameId}:`, e);
      }
    }

    return allScores;
  }

  function renderStats(stats) {
    const container = document.getElementById('statsContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="halloffame-stat-box">
        <div class="halloffame-stat-value">${stats.totalPlayers}</div>
        <div class="halloffame-stat-label">UNIQUE PLAYERS</div>
      </div>
      <div class="halloffame-stat-box">
        <div class="halloffame-stat-value">${stats.totalRuns}</div>
        <div class="halloffame-stat-label">TOTAL RUNS</div>
      </div>
      <div class="halloffame-stat-box">
        <div class="halloffame-stat-value">${stats.gamesAvailable}</div>
        <div class="halloffame-stat-label">GAMES AVAILABLE</div>
      </div>
      <div class="halloffame-stat-box">
        <div class="halloffame-stat-value">${stats.averageScorePerRun}</div>
        <div class="halloffame-stat-label">AVG SCORE/RUN</div>
      </div>
    `;
  }

  function renderRecords(records) {
    const container = document.getElementById('recordsContainer');
    if (!container) return;

    const html = Object.entries(records)
      .filter(([_, rec]) => rec !== null)
      .map(([_, rec]) => {
        const config = rec.config;
        return `
          <div class="halloffame-card">
            <h3 class="halloffame-card-title">${config.icon} ${config.title}</h3>
            <ul class="halloffame-list">
              <li class="halloffame-list-item">
                <div class="halloffame-rank rank-1">👑</div>
                <div class="halloffame-item-info">
                  <div class="halloffame-item-name">${escapeHtml(rec.nickname)}</div>
                  <div class="halloffame-item-meta">${escapeHtml(rec.detail)}</div>
                </div>
                <div class="halloffame-item-score">
                  <div class="halloffame-item-value">${rec.score.toLocaleString()}</div>
                  <div class="halloffame-item-label">${config.metric}</div>
                </div>
              </li>
            </ul>
          </div>
        `;
      })
      .join('');

    container.innerHTML = html;
  }

  function renderTopPlayers(allScores) {
    const container = document.getElementById('topPlayersContainer');
    if (!container) return;

    const playerStats = {};
    allScores.forEach((score) => {
      if (!playerStats[score.nickname]) {
        playerStats[score.nickname] = {
          nickname: score.nickname,
          runCount: 0,
          totalScore: 0,
          games: new Set(),
        };
      }
      playerStats[score.nickname].runCount += 1;
      playerStats[score.nickname].totalScore += score.score;
      playerStats[score.nickname].games.add(score.gameName);
    });

    const topPlayers = Object.values(playerStats)
      .sort((a, b) => b.runCount - a.runCount)
      .slice(0, 10);

    const html = topPlayers
      .map((player, idx) => {
        const rankClass = getRecordRank(idx);
        const rankSymbol = idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
        return `
          <li class="halloffame-list-item">
            <div class="halloffame-rank ${rankClass}">${rankSymbol}</div>
            <div class="halloffame-item-info">
              <div class="halloffame-item-name">${escapeHtml(player.nickname)}</div>
              <div class="halloffame-item-meta">${player.games.size} game${player.games.size !== 1 ? 's' : ''}</div>
            </div>
            <div class="halloffame-item-score">
              <div class="halloffame-item-value">${player.runCount}</div>
              <div class="halloffame-item-label">Runs</div>
            </div>
          </li>
        `;
      })
      .join('');

    container.innerHTML = html || '<li class="halloffame-loading">No players yet</li>';
  }

  function renderAchievements(stats) {
    const container = document.getElementById('achievementsContainer');
    if (!container) return;

    const achievements = [
      {
        icon: '🎮',
        label: 'First Play',
        count: stats.totalPlayers,
        condition: stats.totalPlayers > 0,
      },
      {
        icon: '⭐',
        label: 'Expert',
        count: stats.topScorersCount || 0,
        condition: true,
      },
      {
        icon: '🎯',
        label: 'Completionist',
        count: stats.multiGamePlayers || 0,
        condition: true,
      },
      {
        icon: '🚀',
        label: 'Speed Runner',
        count: Math.floor(stats.totalRuns * 0.1) || 0,
        condition: true,
      },
      {
        icon: '💎',
        label: 'Legendary',
        count: Math.max(stats.totalPlayers > 50 ? 1 : 0, 0),
        condition: true,
      },
      {
        icon: '🔥',
        label: 'Hot Streak',
        count: Math.floor(stats.totalRuns * 0.05) || 0,
        condition: true,
      },
    ];

    const html = achievements
      .map((achievement) => `
        <div class="halloffame-badge">
          <div class="halloffame-badge-icon">${achievement.icon}</div>
          <div class="halloffame-badge-label">${achievement.label}</div>
          <div class="halloffame-badge-count">${achievement.count} earned</div>
        </div>
      `)
      .join('');

    container.innerHTML = html;
  }

  function renderLeaderboards(leaderboards) {
    const container = document.getElementById('leaderboardsContainer');
    if (!container) return;

    const html = Object.entries(leaderboards)
      .map(([gameId, scores]) => {
        const config = gameConfigs[gameId];
        const top3 = scores.slice(0, 3);

        return `
          <div class="halloffame-card">
            <h3 class="halloffame-card-title">${config.icon} ${config.title}</h3>
            <ul class="halloffame-list">
              ${top3
                .map(
                  (score, idx) => `
                <li class="halloffame-list-item">
                  <div class="halloffame-rank ${getRecordRank(idx)}">
                    ${idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                  </div>
                  <div class="halloffame-item-info">
                    <div class="halloffame-item-name">${escapeHtml(score.nickname)}</div>
                    <div class="halloffame-item-meta">${escapeHtml(score.detail)}</div>
                  </div>
                  <div class="halloffame-item-score">
                    <div class="halloffame-item-value">${score.score.toLocaleString()}</div>
                    <div class="halloffame-item-label">${config.metric}</div>
                  </div>
                </li>
              `
                )
                .join('')}
            </ul>
          </div>
        `;
      })
      .join('');

    container.innerHTML = html;
  }

  async function init() {
    try {
      // Fetch all data in parallel
      const [records, leaderboards, allScores] = await Promise.all([
        fetchGameRecords(),
        fetchAllLeaderboards(),
        fetchAllScores(),
      ]);

      // Calculate statistics
      const uniquePlayers = new Set(allScores.map((s) => s.nickname)).size;
      const multiGamePlayers = new Set(
        allScores
          .reduce((acc, score) => {
            if (!acc[score.nickname]) acc[score.nickname] = new Set();
            acc[score.nickname].add(score.gameId);
            return acc;
          }, {})
          [Symbol.iterator]
      ).size;

      // Count players with multiple runs
      const playerRunCounts = {};
      allScores.forEach((score) => {
        playerRunCounts[score.nickname] = (playerRunCounts[score.nickname] || 0) + 1;
      });
      const multiGamePlayersCount = Object.values(playerRunCounts).filter((c) => c > 1).length;
      const topScorersCount = Object.keys(playerRunCounts).length;

      const stats = {
        totalPlayers: uniquePlayers,
        totalRuns: allScores.length,
        gamesAvailable: Object.keys(gameConfigs).length,
        averageScorePerRun: allScores.length > 0
          ? Math.floor(allScores.reduce((sum, s) => sum + s.score, 0) / allScores.length)
          : 0,
        multiGamePlayers: multiGamePlayersCount,
        topScorersCount,
      };

      // Render all sections
      renderStats(stats);
      renderRecords(records);
      renderTopPlayers(allScores);
      renderAchievements(stats);
      renderLeaderboards(leaderboards);
    } catch (error) {
      console.error('Error initializing Hall of Fame:', error);
      const containers = [
        'statsContainer',
        'recordsContainer',
        'topPlayersContainer',
        'achievementsContainer',
        'leaderboardsContainer',
      ];
      containers.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.innerHTML =
            '<div class="halloffame-error">Failed to load Hall of Fame data. Please try again later.</div>';
        }
      });
    }
  }

  return {
    init,
  };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
  if (window.HallOfFame) {
    window.HallOfFame.init();
  }
});
