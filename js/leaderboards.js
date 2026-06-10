document.addEventListener('DOMContentLoaded', function () {
    setFooterYear();
    populateGameSelect();
    bindLeaderboardEvents();
    renderSelectedLeaderboard();
    hydrateRemoteLeaderboards();
});

const SUPABASE_URL = 'https://xdvrgeaivfqpcsmuqeyi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1UoSYMFfHQerkvlvHvbpRQ_JGIYH14O';
let leaderboardClient = null;
const remoteLeaderboards = {};

const leaderboardProviders = {
    'maze-runner': {
        columns: ['Player', 'Score', 'Floor', 'Time'],
        playUrl: '../games/maze-runner/',
        emptyText: 'No Maze Runner scores yet.',
        getRows: function () {
            return remoteLeaderboards['maze-runner'] || [];
        },
        loadRemote: async function () {
            const client = supabaseClient();
            if (!client) return [];
            const result = await client
                .from('maze_runner_runs')
                .select('user_id, floors, score, time_ms')
                .order('score', { ascending: false })
                .order('floors', { ascending: false })
                .order('time_ms', { ascending: true })
                .limit(20);
            if (result.error) throw result.error;
            return (result.data || []).map(function (row) {
                return {
                    nickname: shortId(row.user_id),
                    score: formatNumber(row.score),
                    floor: 'Floor ' + (Number(row.floors) || 0),
                    time: formatTime(row.time_ms)
                };
            });
        }
    },
    'depths-of-ashenveil': {
        columns: ['Nickname', 'Highest Level', 'Floor'],
        getRows: function () {
            return window.Save && Save.loadLeaderboard
                ? Save.loadLeaderboard().map(function (entry) {
                    return {
                        nickname: entry.nickname,
                        level: 'Level ' + entry.level,
                        floor: 'Floor ' + entry.floor
                    };
                })
                : [];
        },
        playUrl: '../games/depths-of-ashenveil/',
        emptyText: 'No scores yet. Survive a run in Depths of Ashenveil to claim the first spot.'
    },
    'blacktide-bastion': {
        columns: ['Captain', 'Score', 'Wave', 'Date'],
        playUrl: '../games/blacktide-bastion/',
        emptyText: 'No Blacktide Bastion scores yet.',
        getRows: function () {
            return mergeRows(remoteLeaderboards['blacktide-bastion'] || [], localBlacktideRows(), ['nickname', 'scoreValue', 'waveValue', 'dateValue'])
                .sort(function (a, b) {
                    return (b.scoreValue - a.scoreValue) || (b.waveValue - a.waveValue) || (a.dateValue - b.dateValue);
                })
                .slice(0, 20);
        },
        loadRemote: async function () {
            const client = supabaseClient();
            if (!client) return [];
            const result = await client
                .from('blacktide_bastion_leaderboard')
                .select('nickname, score, wave, created_at')
                .order('score', { ascending: false })
                .order('wave', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(20);
            if (result.error) throw result.error;
            return (result.data || []).map(blacktideRow);
        }
    },
    'spear_fisher': {
        columns: ['Fisher', 'Score', 'Date'],
        playUrl: '../games/spear_fisher/',
        emptyText: 'No Spear Fisher scores yet.',
        getRows: function () {
            return mergeRows(remoteLeaderboards.spear_fisher || [], localSpearRows(), ['nickname', 'scoreValue', 'dateValue'])
                .sort(function (a, b) {
                    return (b.scoreValue - a.scoreValue) || (a.dateValue - b.dateValue);
                })
                .slice(0, 20);
        },
        loadRemote: async function () {
            const client = supabaseClient();
            if (!client) return [];
            const result = await client
                .from('spear_fisher_leaderboard')
                .select('nickname, score, created_at')
                .order('score', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(20);
            if (result.error) throw result.error;
            return (result.data || []).map(spearRow);
        }
    }
};

function supabaseClient() {
    if (leaderboardClient) return leaderboardClient;
    if (!window.supabase) return null;
    leaderboardClient = window._ageeSupabaseClient
        || (window._ageeSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
    return leaderboardClient;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatNumber(value) {
    return (Number(value) || 0).toLocaleString();
}

function formatTime(ms) {
    const seconds = Math.floor((Number(ms) || 0) / 1000);
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    return minutes + ':' + (seconds % 60).toString().padStart(2, '0');
}

function formatDate(value) {
    const date = new Date(value || Date.now());
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function shortId(value) {
    const id = String(value || 'guest');
    return id.length > 10 ? id.slice(0, 8) + '...' : id;
}

function readLocalJson(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch (_) { return []; }
}

function blacktideRow(row) {
    const score = Number(row.score) || 0;
    const wave = Number(row.wave) || 0;
    const date = row.created_at || row.date || Date.now();
    return {
        nickname: row.nickname || row.name || 'SAILOR',
        score: formatNumber(score),
        scoreValue: score,
        wave: wave || '-',
        waveValue: wave,
        date: formatDate(date),
        dateValue: new Date(date).getTime() || Date.now()
    };
}

function spearRow(row) {
    const score = Number(row.score) || 0;
    const date = row.created_at || row.date || Date.now();
    return {
        nickname: row.nickname || row.name || 'FISHER',
        score: formatNumber(score),
        scoreValue: score,
        date: formatDate(date),
        dateValue: new Date(date).getTime() || Date.now()
    };
}

function localBlacktideRows() {
    return readLocalJson('blacktide_bastion_lb').map(blacktideRow);
}

function localSpearRows() {
    return readLocalJson('spear_fisher_lb').map(spearRow);
}

function mergeRows(primary, secondary, keys) {
    const seen = new Set();
    return primary.concat(secondary).filter(function (row) {
        const signature = keys.map(function (key) { return row[key]; }).join('|');
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
    });
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

    var options = leaderboardGames().map(function (game) {
        return '<option value="' + escapeHtml(game.id) + '">' + escapeHtml(game.title) + '</option>';
    });

    select.innerHTML = options.length
        ? options.join('')
        : '<option value="">No leaderboards available</option>';
}

function bindLeaderboardEvents() {
    var select = document.getElementById('leaderboardGameSelect');
    if (select) select.addEventListener('change', renderSelectedLeaderboard);

    document.addEventListener('depths-save-change', function (event) {
        if (!event.detail || event.detail.kind === 'leaderboard' || event.detail.kind === 'all') {
            renderSelectedLeaderboard();
        }
    });

    if (window.Save && Save.ready && typeof Save.ready.then === 'function') {
        Save.ready.then(function () {
            renderSelectedLeaderboard();
        }).catch(function () {});
    }

    document.addEventListener('agee-leaderboard-write', hydrateRemoteLeaderboards);
}

function selectedGame() {
    var select = document.getElementById('leaderboardGameSelect');
    var id = select ? select.value : '';
    return games.find(function (game) { return game.id === id; }) || leaderboardGames()[0] || null;
}

function renderSelectedLeaderboard() {
    var game = selectedGame();
    var rowsEl = document.getElementById('leaderboardRows');
    var emptyEl = document.getElementById('leaderboardEmpty');
    var titleEl = document.getElementById('leaderboardGameTitle');
    var genreEl = document.getElementById('leaderboardGameGenre');
    var linkEl = document.getElementById('leaderboardGameLink');
    if (!rowsEl || !emptyEl || !titleEl || !genreEl || !linkEl) return;
    var headRow = document.querySelector('.leaderboards-table thead tr');

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
    var rows = provider ? provider.getRows() : [];
    var columns = provider && provider.columns ? provider.columns : ['Nickname', 'Score'];

    titleEl.textContent = game.title;
    genreEl.textContent = game.genre.join(' / ');
    linkEl.href = provider.playUrl || game.url;
    linkEl.hidden = false;
    if (headRow) {
        headRow.innerHTML = '<th>Rank</th>' + columns.map(function (column) {
            return '<th>' + escapeHtml(column) + '</th>';
        }).join('');
    }

    if (!rows.length) {
        rowsEl.innerHTML = '';
        emptyEl.hidden = false;
        emptyEl.textContent = provider.emptyText || 'No scores yet for this game.';
        return;
    }

    emptyEl.hidden = true;
    rowsEl.innerHTML = rows.map(function (entry, index) {
        return '<tr>' +
            '<td class="leaderboards-rank">#' + (index + 1) + '</td>' +
            rowCells(game.id, entry) +
        '</tr>';
    }).join('');
}

function rowCells(gameId, entry) {
    if (gameId === 'maze-runner') {
        return '<td>' + escapeHtml(entry.nickname) + '</td>' +
            '<td>' + escapeHtml(entry.score) + '</td>' +
            '<td>' + escapeHtml(entry.floor) + '</td>' +
            '<td>' + escapeHtml(entry.time) + '</td>';
    }
    if (gameId === 'depths-of-ashenveil') {
        return '<td>' + escapeHtml(entry.nickname) + '</td>' +
            '<td>' + escapeHtml(entry.level) + '</td>' +
            '<td>' + escapeHtml(entry.floor) + '</td>';
    }
    if (gameId === 'blacktide-bastion') {
        return '<td>' + escapeHtml(entry.nickname) + '</td>' +
            '<td>' + escapeHtml(entry.score) + '</td>' +
            '<td>' + escapeHtml(entry.wave) + '</td>' +
            '<td>' + escapeHtml(entry.date) + '</td>';
    }
    if (gameId === 'spear_fisher') {
        return '<td>' + escapeHtml(entry.nickname) + '</td>' +
            '<td>' + escapeHtml(entry.score) + '</td>' +
            '<td>' + escapeHtml(entry.date) + '</td>';
    }
    return '<td>' + escapeHtml(entry.nickname || 'Player') + '</td>' +
        '<td>' + escapeHtml(entry.score || '') + '</td>';
}

async function hydrateRemoteLeaderboards() {
    await Promise.all(Object.keys(leaderboardProviders).map(async function (id) {
        var provider = leaderboardProviders[id];
        if (!provider.loadRemote) return;
        try {
            remoteLeaderboards[id] = await provider.loadRemote();
        } catch (err) {
            console.warn('[Leaderboards] Failed to load ' + id + '.', err);
        }
    }));
    renderSelectedLeaderboard();
}
