document.addEventListener('DOMContentLoaded', function () {
    setFooterYear();
    populateGameSelect();
    bindLeaderboardEvents();
    renderSelectedLeaderboard();
});

const leaderboardProviders = {
    'depths-of-ashenveil': {
        getRows: function () {
            return window.Save && Save.loadLeaderboard ? Save.loadLeaderboard() : [];
        },
        playUrl: '../games/depths-of-ashenveil/',
        emptyText: 'No scores yet. Survive a run in Depths of Ashenveil to claim the first spot.'
    }
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
        Save.ready.then(renderSelectedLeaderboard).catch(function () {});
    }
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

    titleEl.textContent = game.title;
    genreEl.textContent = game.genre.join(' / ');
    linkEl.href = provider.playUrl || game.url;
    linkEl.hidden = false;

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
            '<td>' + escapeHtml(entry.nickname) + '</td>' +
            '<td>' + escapeHtml(entry.level) + '</td>' +
            '<td>' + escapeHtml(entry.floor) + '</td>' +
        '</tr>';
    }).join('');
}
