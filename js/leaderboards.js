document.addEventListener('DOMContentLoaded', function () {
    setFooterYear();
    populateGameSelect();
    bindLeaderboardEvents();
    renderSelectedLeaderboard();
});

const SUPABASE_URL = 'https://xdvrgeaivfqpcsmuqeyi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O';

const leaderboardProviders = {
    'depths-of-ashenveil': {
        table: 'depths_leaderboard',
        select: 'nickname,floor,level,created_at',
        order: 'level.desc,floor.desc,created_at.asc',
        localKey: 'depthsOfAshenveil.leaderboard.v1',
        playUrl: '../games/depths-of-ashenveil/',
        emptyText: 'No scores yet. Survive a run in Depths of Ashenveil to claim the first spot.',
        columns: ['Rank', 'Nickname', 'Highest Level', 'Floor'],
        mapRemote: function (row) {
            return {
                nickname: row.nickname || 'Adventurer',
                primary: Number(row.level) || 1,
                detail: 'Floor ' + (Number(row.floor) || 1),
                sortA: Number(row.level) || 1,
                sortB: Number(row.floor) || 1,
                date: row.created_at || '',
            };
        },
        mapLocal: function (row) {
            return this.mapRemote({ nickname: row.nickname, level: row.level, floor: row.floor, created_at: row.date });
        },
    },
    'maze-runner': {
        table: 'maze_runner_runs',
        select: 'user_id,floors,score,time_ms',
        order: 'score.desc,floors.desc,time_ms.asc',
        playUrl: '../games/maze-runner/',
        emptyText: 'No scores yet. Escape a maze to post the first run.',
        columns: ['Rank', 'Player', 'Score', 'Floor'],
        mapRemote: function (row) {
            const user = String(row.user_id || 'guest-player');
            return {
                nickname: user.length > 12 ? user.slice(0, 8) + '...' : user,
                primary: Number(row.score) || 0,
                detail: 'Floor ' + (Number(row.floors) || 0),
                sortA: Number(row.score) || 0,
                sortB: Number(row.floors) || 0,
                sortC: -(Number(row.time_ms) || 0),
            };
        },
    },
    'blacktide-bastion': {
        table: 'blacktide_bastion_leaderboard',
        select: 'nickname,score,wave,created_at',
        order: 'score.desc,wave.desc,created_at.asc',
        localKey: 'blacktide_bastion_lb',
        playUrl: '../games/blacktide-bastion/',
        emptyText: 'No scores yet. Hold the harbor to claim the first spot.',
        columns: ['Rank', 'Captain', 'Score', 'Wave'],
        mapRemote: function (row) {
            return {
                nickname: row.nickname || row.name || 'Captain',
                primary: Number(row.score) || 0,
                detail: 'Wave ' + (Number(row.wave) || 0),
                sortA: Number(row.score) || 0,
                sortB: Number(row.wave) || 0,
                date: row.created_at || row.date || '',
            };
        },
        mapLocal: function (row) {
            return this.mapRemote({ nickname: row.name, score: row.score, wave: row.wave, created_at: row.date });
        },
    },
    'spear_fisher': {
        table: 'spear_fisher_leaderboard',
        select: 'nickname,score,created_at',
        order: 'score.desc,created_at.asc',
        localKey: 'spear_fisher_lb',
        playUrl: '../games/spear_fisher/',
        emptyText: 'No scores yet. Land a catch to claim the first spot.',
        columns: ['Rank', 'Fisher', 'Score', 'Run'],
        mapRemote: function (row) {
            return {
                nickname: row.nickname || row.name || 'Fisher',
                primary: Number(row.score) || 0,
                detail: formatDate(row.created_at || row.date),
                sortA: Number(row.score) || 0,
                sortB: 0,
                date: row.created_at || row.date || '',
            };
        },
        mapLocal: function (row) {
            return this.mapRemote({ nickname: row.name, score: row.score, created_at: row.date });
        },
    },
};

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function setFooterYear() {
    var el = document.getElementById('footer-year');
    if (el) el.textContent = new Date().getFullYear();
}

function leaderboardGames() {
    return games.filter(function (game) {
        return game.status === 'live' && leaderboardProviders[game.id];
    });
}

function populateGameSelect() {
    var select = document.getElementById('leaderboardGameSelect');
    if (!select) return;

    var params = new URLSearchParams(window.location.search);
    var requested = params.get('game') || '';
    var options = leaderboardGames().map(function (game) {
        return '<option value="' + escapeHtml(game.id) + '">' + escapeHtml(game.title) + '</option>';
    });

    select.innerHTML = options.length
        ? options.join('')
        : '<option value="">No leaderboards available</option>';

    if (requested && leaderboardProviders[requested]) select.value = requested;
}

function bindLeaderboardEvents() {
    var select = document.getElementById('leaderboardGameSelect');
    if (select) select.addEventListener('change', renderSelectedLeaderboard);
}

function selectedGame() {
    var select = document.getElementById('leaderboardGameSelect');
    var id = select ? select.value : '';
    return games.find(function (game) { return game.id === id; }) || leaderboardGames()[0] || null;
}

async function fetchRemoteRows(provider) {
    if (!provider.table) return [];
    var url = new URL(SUPABASE_URL + '/rest/v1/' + provider.table);
    url.searchParams.set('select', provider.select || '*');
    if (provider.order) url.searchParams.set('order', provider.order);
    url.searchParams.set('limit', '50');
    url.searchParams.set('apikey', SUPABASE_ANON_KEY);

    var response = await fetch(url.toString(), {
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
}

function localRows(provider) {
    if (!provider.localKey || !provider.mapLocal) return [];
    try {
        var rows = JSON.parse(localStorage.getItem(provider.localKey)) || [];
        return rows.map(function (row) { return provider.mapLocal(row); });
    } catch (_) {
        return [];
    }
}

function sortRows(rows) {
    return rows.sort(function (a, b) {
        return ((b.sortA || 0) - (a.sortA || 0))
            || ((b.sortB || 0) - (a.sortB || 0))
            || ((b.sortC || 0) - (a.sortC || 0));
    });
}

function dedupeRows(rows) {
    var seen = new Set();
    return rows.filter(function (row) {
        var key = [row.nickname, row.primary, row.detail, row.date].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function formatDate(value) {
    var date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Run';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function setColumns(provider) {
    var head = document.getElementById('leaderboardHead');
    if (!head) return;
    head.innerHTML = provider.columns.map(function (label) {
        return '<th>' + escapeHtml(label) + '</th>';
    }).join('');
}

async function renderSelectedLeaderboard() {
    var game = selectedGame();
    var rowsEl = document.getElementById('leaderboardRows');
    var emptyEl = document.getElementById('leaderboardEmpty');
    var titleEl = document.getElementById('leaderboardGameTitle');
    var genreEl = document.getElementById('leaderboardGameGenre');
    var linkEl = document.getElementById('leaderboardGameLink');
    if (!rowsEl || !emptyEl || !titleEl || !genreEl || !linkEl) return;

    if (!game) {
        titleEl.textContent = 'No Leaderboards Available';
        genreEl.textContent = '';
        linkEl.hidden = true;
        rowsEl.innerHTML = '';
        emptyEl.hidden = false;
        emptyEl.textContent = 'Leaderboards will appear here as games add score support.';
        return;
    }

    var provider = leaderboardProviders[game.id];
    titleEl.textContent = game.title;
    genreEl.textContent = game.genre.join(' / ');
    linkEl.href = provider.playUrl || game.url;
    linkEl.hidden = false;
    setColumns(provider);

    rowsEl.innerHTML = '';
    emptyEl.hidden = false;
    emptyEl.textContent = 'Loading scores...';

    var rows = localRows(provider);
    try {
        var remote = await fetchRemoteRows(provider);
        rows = rows.concat((remote || []).map(function (row) { return provider.mapRemote(row); }));
    } catch (err) {
        if (!rows.length) {
            emptyEl.textContent = 'Could not load scores for this game yet.';
            return;
        }
    }

    rows = dedupeRows(sortRows(rows)).slice(0, 20);
    if (!rows.length) {
        emptyEl.textContent = provider.emptyText || 'No scores yet for this game.';
        return;
    }

    emptyEl.hidden = true;
    rowsEl.innerHTML = rows.map(function (entry, index) {
        return '<tr>' +
            '<td class="leaderboards-rank">#' + (index + 1) + '</td>' +
            '<td>' + escapeHtml(entry.nickname) + '</td>' +
            '<td>' + escapeHtml(Number(entry.primary).toLocaleString()) + '</td>' +
            '<td>' + escapeHtml(entry.detail) + '</td>' +
        '</tr>';
    }).join('');
}
