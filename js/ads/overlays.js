/**
 * ArcadeAdOverlays — all full-screen and DOM ad overlay UI for Agee Arcade.
 *
 * Surfaces:
 *   showLoadingCommercial(ad, onDone)  — before a game loads
 *   showInterstitial(ad, onDone)       — after GAME_OVER
 *   showRewarded(ad, rewardType, cb)   — opt-in rewarded flow; cb(granted)
 *   showPauseBanner(ad)                — banner visible on pause screen
 *   hidePauseBanner()
 *
 * All overlays inject their own DOM on first call (lazy, no preloaded HTML
 * required). Tracks: served, visible_2_seconds, completed, skipped, click.
 *
 * Depends on: window.AdRouter
 */
window.ArcadeAdOverlays = (() => {
  'use strict';

  // ── Shared helpers ─────────────────────────────────────────────────

  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function _el(id) { return document.getElementById(id); }

  function _openLink(url) {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Inject a style block once
  function _injectStyles() {
    if (_el('aa-overlay-styles')) return;
    const s = document.createElement('style');
    s.id = 'aa-overlay-styles';
    s.textContent = `
/* ── Agee Arcade Ad Overlay Base ─── */
.aa-overlay {
  position: fixed; inset: 0; z-index: 200;
  display: flex; align-items: center; justify-content: center;
  background: rgba(4,2,14,0.95);
  animation: aa-fade-in 0.2s ease;
}
@keyframes aa-fade-in { from { opacity:0 } to { opacity:1 } }

.aa-card {
  position: relative;
  max-width: 640px; width: 92%;
  background: #0c0820;
  border: 1px solid rgba(160,80,255,0.4);
  border-radius: 6px;
  box-shadow: 0 0 40px rgba(120,60,200,0.3);
  overflow: hidden;
  display: flex; flex-direction: column;
}

.aa-label {
  padding: 6px 14px;
  background: rgba(0,0,0,0.5);
  font-family: 'Courier New', monospace;
  font-size: 10px;
  letter-spacing: 2px;
  color: rgba(160,80,255,0.7);
  text-transform: uppercase;
  text-align: right;
}

.aa-image-wrap {
  width: 100%; aspect-ratio: 16/9;
  overflow: hidden; position: relative;
  background: #050210;
  cursor: pointer;
}
.aa-image-wrap img {
  width: 100%; height: 100%; object-fit: cover;
  display: block;
}
.aa-image-fallback {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Orbitron', 'Courier New', monospace;
  font-size: 18px; color: rgba(160,80,255,0.5);
  letter-spacing: 3px;
}

.aa-body {
  padding: 18px 20px 14px;
}
.aa-title {
  font-family: 'Orbitron', 'Courier New', monospace;
  font-size: 15px; font-weight: 700;
  color: #e0c0ff; margin: 0 0 6px;
}
.aa-desc {
  font-size: 12px; color: rgba(200,180,255,0.5);
  margin: 0 0 16px; line-height: 1.5;
}

.aa-footer {
  display: flex; align-items: center;
  gap: 10px; padding: 12px 20px;
  background: rgba(0,0,0,0.3);
  border-top: 1px solid rgba(100,50,200,0.2);
}

.aa-btn {
  padding: 8px 20px;
  font-family: 'Courier New', monospace;
  font-size: 12px; font-weight: bold;
  letter-spacing: 1px;
  border-radius: 3px; cursor: pointer;
  border: none; transition: opacity 0.15s;
}
.aa-btn:hover { opacity: 0.85; }
.aa-btn-primary {
  background: linear-gradient(135deg,#7730d0,#4a1880);
  color: #fff; border: 1px solid rgba(160,80,255,0.5);
}
.aa-btn-secondary {
  background: transparent;
  color: rgba(160,80,255,0.6);
  border: 1px solid rgba(160,80,255,0.25);
}
.aa-btn:disabled { opacity: 0.35; cursor: default; }

.aa-countdown {
  font-family: 'Courier New', monospace;
  font-size: 12px; color: rgba(160,80,255,0.5);
  margin-left: auto;
}

/* ── Rewarded opt-in prompt ── */
.aa-reward-prompt {
  text-align: center; padding: 30px 24px;
}
.aa-reward-icon {
  font-size: 40px; margin-bottom: 12px;
}
.aa-reward-msg {
  font-family: 'Orbitron', 'Courier New', monospace;
  font-size: 16px; color: #e0c0ff;
  margin-bottom: 8px;
}
.aa-reward-sub {
  font-size: 12px; color: rgba(200,180,255,0.5);
  margin-bottom: 24px; line-height: 1.5;
}

/* ── Pause banner ── */
#aa-pause-banner {
  display: none;
  width: 100%; max-width: 728px;
  height: 90px;
  margin: 12px auto 0;
  position: relative;
  border: 1px solid rgba(160,80,255,0.25);
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  background: #050210;
}
#aa-pause-banner.visible { display: block; }
#aa-pause-banner img {
  width: 100%; height: 100%; object-fit: cover;
}
#aa-pause-banner .aa-label {
  position: absolute; bottom: 0; right: 0;
  padding: 3px 8px;
}
`;
    document.head.appendChild(s);
  }

  // ── Generic overlay mount/unmount ─────────────────────────────────

  function _mount(html) {
    const wrap = document.createElement('div');
    wrap.className = 'aa-overlay';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    return wrap;
  }

  function _unmount(wrap) {
    if (wrap && wrap.parentNode) {
      wrap.style.animation = 'aa-fade-in 0.15s ease reverse';
      setTimeout(() => wrap.parentNode && wrap.parentNode.removeChild(wrap), 150);
    }
  }

  // ── Image with fallback ────────────────────────────────────────────

  function _imageHtml(imageUrl, title) {
    if (imageUrl) {
      return `<img src="${_esc(imageUrl)}" alt="${_esc(title)}"
                   onerror="this.parentNode.innerHTML='<div class=aa-image-fallback>SPONSORED</div>'">`;
    }
    return `<div class="aa-image-fallback">SPONSORED</div>`;
  }

  // ══════════════════════════════════════════════════════════════════
  // Loading Commercial
  // ══════════════════════════════════════════════════════════════════

  function showLoadingCommercial(ad, onDone) {
    _injectStyles();
    if (!ad || !ad.filled) { onDone && onDone(); return; }

    const duration = ad.durationMs || 5000;
    let secondsLeft = Math.ceil(duration / 1000);
    let canSkip = false;
    let interval, visTimer, done = false;

    const wrap = _mount(`
      <div class="aa-card" style="max-width:680px">
        <div class="aa-label">Advertisement — Loading your game</div>
        <div class="aa-image-wrap" id="aa-lc-img">
          ${_imageHtml(ad.imageUrl, ad.title)}
        </div>
        <div class="aa-body">
          <p class="aa-title">${_esc(ad.title)}</p>
          <p class="aa-desc">${_esc(ad.description || '')}</p>
        </div>
        <div class="aa-footer">
          ${ad.clickUrl ? `<button class="aa-btn aa-btn-secondary" id="aa-lc-visit">Visit Sponsor</button>` : ''}
          <span class="aa-countdown" id="aa-lc-cd">Continue in ${secondsLeft}…</span>
          <button class="aa-btn aa-btn-primary" id="aa-lc-skip" disabled>Continue</button>
        </div>
      </div>
    `);

    const skipBtn = _el('aa-lc-skip');
    const cdEl    = _el('aa-lc-cd');
    const imgWrap = _el('aa-lc-img');

    // Sponsor click
    if (ad.clickUrl) {
      _el('aa-lc-visit').addEventListener('click', () => {
        AdRouter.trackClick({ campaignId: ad.campaignId, placementKey: ad.placementKey });
        _openLink(ad.clickUrl);
      });
    }
    imgWrap.addEventListener('click', () => {
      if (ad.clickUrl) {
        AdRouter.trackClick({ campaignId: ad.campaignId, placementKey: ad.placementKey });
        _openLink(ad.clickUrl);
      }
    });

    function finish(eventType) {
      if (done) return;
      done = true;
      clearInterval(interval);
      clearTimeout(visTimer);
      AdRouter.trackEvent({ campaignId: ad.campaignId, placementKey: ad.placementKey, eventType });
      _unmount(wrap);
      onDone && onDone();
    }

    skipBtn.addEventListener('click', () => {
      if (canSkip) finish('completed');
    });

    // Countdown
    interval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(interval);
        cdEl.textContent = '';
        canSkip = true;
        skipBtn.disabled = false;
        finish('completed');
      } else {
        cdEl.textContent = `Continue in ${secondsLeft}…`;
      }
    }, 1000);

    // 2-second visibility
    visTimer = setTimeout(() => {
      AdRouter.trackVisible2s({ campaignId: ad.campaignId, placementKey: ad.placementKey });
    }, 2000);
  }

  // ══════════════════════════════════════════════════════════════════
  // Game-Over Interstitial
  // ══════════════════════════════════════════════════════════════════

  function showInterstitial(ad, onDone) {
    _injectStyles();
    if (!ad || !ad.filled) { onDone && onDone(); return; }

    const duration = ad.durationMs || 5000;
    let secondsLeft = Math.ceil(duration / 1000);
    let interval, visTimer, done = false;

    const wrap = _mount(`
      <div class="aa-card">
        <div class="aa-label">Advertisement</div>
        <div class="aa-image-wrap" id="aa-int-img">
          ${_imageHtml(ad.imageUrl, ad.title)}
        </div>
        <div class="aa-body">
          <p class="aa-title">${_esc(ad.title)}</p>
          <p class="aa-desc">${_esc(ad.description || '')}</p>
        </div>
        <div class="aa-footer">
          ${ad.clickUrl ? `<button class="aa-btn aa-btn-secondary" id="aa-int-visit">Visit Sponsor</button>` : ''}
          <span class="aa-countdown" id="aa-int-cd">Close in ${secondsLeft}…</span>
          <button class="aa-btn aa-btn-primary" id="aa-int-close" disabled>Close</button>
        </div>
      </div>
    `);

    const closeBtn = _el('aa-int-close');
    const cdEl     = _el('aa-int-cd');
    const imgWrap  = _el('aa-int-img');
    let canClose = false;

    if (ad.clickUrl) {
      _el('aa-int-visit').addEventListener('click', () => {
        AdRouter.trackClick({ campaignId: ad.campaignId, placementKey: ad.placementKey });
        _openLink(ad.clickUrl);
      });
    }
    imgWrap.addEventListener('click', () => {
      if (ad.clickUrl) {
        AdRouter.trackClick({ campaignId: ad.campaignId, placementKey: ad.placementKey });
        _openLink(ad.clickUrl);
      }
    });

    function finish(eventType) {
      if (done) return;
      done = true;
      clearInterval(interval);
      clearTimeout(visTimer);
      AdRouter.trackEvent({ campaignId: ad.campaignId, placementKey: ad.placementKey, eventType });
      _unmount(wrap);
      onDone && onDone();
    }

    closeBtn.addEventListener('click', () => { if (canClose) finish('completed'); });

    interval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(interval);
        cdEl.textContent = '';
        canClose = true;
        closeBtn.disabled = false;
      } else {
        cdEl.textContent = `Close in ${secondsLeft}…`;
      }
    }, 1000);

    visTimer = setTimeout(() => {
      AdRouter.trackVisible2s({ campaignId: ad.campaignId, placementKey: ad.placementKey });
    }, 2000);

    // Auto-close after grace period (player shouldn't be trapped)
    setTimeout(() => finish('completed'), duration + 8000);
  }

  // ══════════════════════════════════════════════════════════════════
  // Rewarded Ad
  // ══════════════════════════════════════════════════════════════════

  const REWARD_LABELS = {
    revive:       { icon: '❤️', msg: 'Watch to Revive',       sub: 'Watch a short sponsor message and get a free revive.' },
    double_coins: { icon: '💰', msg: 'Watch to Double Coins',  sub: 'Watch a short sponsor message and double your coins.' },
    continue:     { icon: '▶️', msg: 'Watch to Continue',      sub: 'Watch a short sponsor message and keep playing.' },
    bonus_round:  { icon: '⭐', msg: 'Unlock Bonus Round',     sub: 'Watch a short sponsor message to unlock a bonus round.' },
  };

  function showRewarded(ad, rewardType, callback) {
    _injectStyles();

    const labels = REWARD_LABELS[rewardType] || REWARD_LABELS['continue'];
    let phase = 'prompt'; // prompt → watching → done
    let wrap, interval, visTimer;

    function renderPrompt() {
      wrap = _mount(`
        <div class="aa-card">
          <div class="aa-label">Rewarded — Opt In Required</div>
          <div class="aa-reward-prompt">
            <div class="aa-reward-icon">${labels.icon}</div>
            <p class="aa-reward-msg">${_esc(labels.msg)}</p>
            <p class="aa-reward-sub">${_esc(labels.sub)}</p>
            <div style="display:flex;gap:12px;justify-content:center">
              <button class="aa-btn aa-btn-secondary" id="aa-rew-no">No Thanks</button>
              <button class="aa-btn aa-btn-primary"   id="aa-rew-yes">
                ${ad && ad.filled ? 'Watch Ad' : 'Watch (House)'}
              </button>
            </div>
          </div>
        </div>
      `);

      _el('aa-rew-no').addEventListener('click', () => {
        if (ad && ad.filled) AdRouter.trackEvent({ campaignId: ad.campaignId, placementKey: ad.placementKey, eventType: 'reward_denied' });
        _unmount(wrap); wrap = null;
        callback && callback(false);
      });

      _el('aa-rew-yes').addEventListener('click', () => {
        _unmount(wrap); wrap = null;
        if (ad && ad.filled) renderWatching();
        else { callback && callback(true); } // no ad, grant immediately (house)
      });
    }

    function renderWatching() {
      if (!ad || !ad.filled) { callback && callback(true); return; }

      const duration = ad.durationMs || 15000;
      let secondsLeft = Math.ceil(duration / 1000);
      let done = false;

      wrap = _mount(`
        <div class="aa-card">
          <div class="aa-label">Sponsored — Watch to earn your reward</div>
          <div class="aa-image-wrap" id="aa-rew-img">
            ${_imageHtml(ad.imageUrl, ad.title)}
          </div>
          <div class="aa-body">
            <p class="aa-title">${_esc(ad.title)}</p>
            <p class="aa-desc">${_esc(ad.description || '')}</p>
          </div>
          <div class="aa-footer">
            <span style="font-family:'Courier New',monospace;font-size:11px;color:rgba(200,180,255,0.5)">
              ${labels.icon} ${_esc(labels.msg)}
            </span>
            <span class="aa-countdown" id="aa-rew-cd">Earning in ${secondsLeft}…</span>
            <button class="aa-btn aa-btn-primary" id="aa-rew-claim" disabled>Claim Reward</button>
          </div>
        </div>
      `);

      const claimBtn = _el('aa-rew-claim');
      const cdEl     = _el('aa-rew-cd');

      visTimer = setTimeout(() => {
        AdRouter.trackVisible2s({ campaignId: ad.campaignId, placementKey: ad.placementKey });
      }, 2000);

      interval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          clearInterval(interval);
          cdEl.textContent = '';
          claimBtn.disabled = false;
          claimBtn.textContent = `Claim ${labels.icon}`;
        } else {
          cdEl.textContent = `Earning in ${secondsLeft}…`;
        }
      }, 1000);

      claimBtn.addEventListener('click', () => {
        if (done) return; done = true;
        clearInterval(interval); clearTimeout(visTimer);
        AdRouter.trackEvent({ campaignId: ad.campaignId, placementKey: ad.placementKey, eventType: 'reward_granted' });
        AdRouter.trackEvent({ campaignId: ad.campaignId, placementKey: ad.placementKey, eventType: 'completed' });
        _unmount(wrap); wrap = null;
        callback && callback(true);
      });
    }

    renderPrompt();
  }

  // ══════════════════════════════════════════════════════════════════
  // Pause Banner (DOM — not a WebGL texture)
  // ══════════════════════════════════════════════════════════════════

  let _pauseBannerEl = null;
  let _currentPauseAd = null;

  function _ensurePauseBanner() {
    if (_pauseBannerEl) return;
    _injectStyles();
    _pauseBannerEl = document.createElement('div');
    _pauseBannerEl.id = 'aa-pause-banner';
    _pauseBannerEl.innerHTML = `
      <img src="" alt="Sponsored" id="aa-pb-img">
      <div class="aa-label">Sponsored</div>
    `;
    _pauseBannerEl.addEventListener('click', () => {
      if (_currentPauseAd && _currentPauseAd.clickUrl) {
        AdRouter.trackClick({ campaignId: _currentPauseAd.campaignId, placementKey: _currentPauseAd.placementKey });
        _openLink(_currentPauseAd.clickUrl);
      }
    });
    // Caller appends it to the pause menu container
  }

  function showPauseBanner(ad, containerEl) {
    _ensurePauseBanner();
    _currentPauseAd = ad;
    // Append first so getElementById can find child elements
    if (containerEl) containerEl.appendChild(_pauseBannerEl);
    else document.body.appendChild(_pauseBannerEl);
    const img = _el('aa-pb-img');
    if (img) {
      if (ad && ad.filled && ad.imageUrl) {
        img.src = ad.imageUrl;
        img.style.display = 'block';
      } else {
        img.style.display = 'none';
      }
    }
    _pauseBannerEl.classList.add('visible');

    if (ad && ad.filled) {
      AdRouter.trackEvent({ campaignId: ad.campaignId, placementKey: ad.placementKey, eventType: 'served' });
      setTimeout(() => {
        AdRouter.trackVisible2s({ campaignId: ad.campaignId, placementKey: ad.placementKey });
      }, 2000);
    }
  }

  function hidePauseBanner() {
    if (_pauseBannerEl) _pauseBannerEl.classList.remove('visible');
    _currentPauseAd = null;
  }

  return {
    showLoadingCommercial,
    showInterstitial,
    showRewarded,
    showPauseBanner,
    hidePauseBanner,
  };
})();
