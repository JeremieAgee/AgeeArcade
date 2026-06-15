// ─── Agee Arcade — Site Logic ─────────────────────────────────────────────────
// Depends on: games.js (must be loaded first)
// ──────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    setFooterYear();
    renderFeaturedGame();
    renderGameGrid();
    wireAnalytics();
});

function wireAnalytics() {
    if (typeof window.AgeeAnalytics === 'undefined') return;
    window.AgeeAnalytics.trackEvent('homepage_loaded');

    // Track clicks on any game card or play button
    document.addEventListener('click', function (e) {
        var link = e.target.closest('a.game-card-link, a.btn-primary');
        if (!link) return;
        var card = link.querySelector('[data-id]') || link.closest('[data-id]');
        var gameId = card ? card.getAttribute('data-id') : 'unknown';
        window.AgeeAnalytics.trackEvent('play_button_clicked', { game_id: gameId });
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Featured Game ────────────────────────────────────────────────────────────

function renderFeaturedGame() {
    var container = document.getElementById('featured-game');
    if (!container) return;

    var game = games.find(function (g) { return g.id === featuredGameId; });
    if (!game) return;

    var genreTags = game.genre.map(function (g) {
        return '<span class="genre-tag">' + escapeHtml(g) + '</span>';
    }).join('');

    var playBtn = game.status === 'live'
        ? '<a href="' + escapeHtml(game.url) + '" class="btn-primary">Play Now</a>'
        : '<span class="btn-primary" style="opacity:0.5;cursor:default;">Coming Soon</span>';

    container.innerHTML =
        '<div class="featured-game">' +
            '<div class="featured-game__thumb">' +
                '<img src="' + escapeHtml(game.thumbnail) + '" alt="' + escapeHtml(game.title) + '" loading="eager" onerror="this.style.display=\'none\'">' +
            '</div>' +
            '<div class="featured-game__body">' +
                '<div class="genre-tags">' + genreTags + '</div>' +
                '<h2 class="featured-game__title">' + escapeHtml(game.title) + '</h2>' +
                '<p class="featured-game__desc">' + escapeHtml(game.description) + '</p>' +
                playBtn +
            '</div>' +
        '</div>';
}

// ─── Game Grid ────────────────────────────────────────────────────────────────

function renderGameGrid() {
    var container = document.getElementById('game-grid');
    if (!container) return;

    if (games.length === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary);grid-column:1/-1;text-align:center;padding:2rem;">No games yet — check back soon!</p>';
        return;
    }

    var cards = games.map(function (game) {
        var genreTags = game.genre.map(function (g) {
            return '<span class="genre-tag">' + escapeHtml(g) + '</span>';
        }).join('');

        var badgeLabel = game.status === 'live' ? 'LIVE' : 'COMING SOON';
        var badgeClass = game.status === 'live' ? 'status-badge--live' : 'status-badge--coming-soon';

        var card =
            '<article class="game-card" data-id="' + escapeHtml(game.id) + '" data-status="' + escapeHtml(game.status) + '">' +
                '<div class="game-card__thumb">' +
                    '<img src="' + escapeHtml(game.thumbnail) + '" alt="' + escapeHtml(game.title) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
                    '<span class="status-badge ' + badgeClass + '">' + badgeLabel + '</span>' +
                '</div>' +
                '<div class="game-card__body">' +
                    '<h3 class="game-card__title">' + escapeHtml(game.title) + '</h3>' +
                    '<p class="game-card__desc">' + escapeHtml(game.description) + '</p>' +
                    '<div class="genre-tags">' + genreTags + '</div>' +
                '</div>' +
            '</article>';

        if (game.status === 'live') {
            return '<a href="' + escapeHtml(game.url) + '" class="game-card-link">' + card + '</a>';
        } else {
            return '<div class="game-card-link" style="cursor:default;">' + card + '</div>';
        }
    });

    container.innerHTML = cards.join('');
}
