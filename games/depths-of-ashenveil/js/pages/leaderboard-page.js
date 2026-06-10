(() => {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderLeaderboard() {
    const body = document.getElementById('leaderboardRows');
    const empty = document.getElementById('leaderboardEmpty');
    if (!body || !empty || typeof Save === 'undefined') return;

    const entries = Save.loadLeaderboard();
    empty.hidden = entries.length > 0;
    body.innerHTML = entries.map((entry, index) => `
      <tr>
        <td class="rank-cell">${index + 1}</td>
        <td>${escapeHtml(entry.nickname)}</td>
        <td>Level ${entry.level}</td>
        <td>Floor ${entry.floor}</td>
      </tr>
    `).join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderLeaderboard();
    if (window.Save && Save.ready && typeof Save.ready.then === 'function') {
      Save.ready.then(renderLeaderboard).catch(() => {});
    }
  });
  document.addEventListener('depths-save-change', event => {
    if (!event.detail || event.detail.kind === 'leaderboard' || event.detail.kind === 'all') {
      renderLeaderboard();
    }
  });
})();
