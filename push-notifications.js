// BongDa365 - Push Notification System
// Only asks permission AFTER user engagement (3+ interactions), never on first visit

const pushNotifications = {
  permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  subscription: null,
  preferences: null,

  init() {
    this.preferences = this._loadPreferences();
    this.permission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
    // Restore subscription state
    if (this.permission === 'granted' && this.preferences.enabled) {
      this.subscription = true;
    }
  },

  _loadPreferences() {
    return JSON.parse(localStorage.getItem('bd365_push_prefs') || JSON.stringify({
      enabled: false,
      matchAlerts: true,      // Goals, red cards
      predictions: true,      // Pre-match predictions
      dailyDigest: true,      // Morning briefing
      favouriteOnly: false,   // Only for favourite teams
    }));
  },

  _savePreferences() {
    localStorage.setItem('bd365_push_prefs', JSON.stringify(this.preferences));
  },

  // ── Permission: Only after user engagement ──

  async requestPermission() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.log('[Push] Not supported in this browser');
      return false;
    }

    const permission = await Notification.requestPermission();
    this.permission = permission;

    if (permission === 'granted') {
      await this._subscribe();
      this.preferences.enabled = true;
      this._savePreferences();
      return true;
    }
    return false;
  },

  async _subscribe() {
    try {
      await navigator.serviceWorker.ready;
      this.subscription = true;
      console.log('[Push] Subscribed to notifications');
    } catch (e) {
      console.warn('[Push] Subscribe failed:', e);
    }
  },

  // ── Show notification via Service Worker (works on mobile) ──

  showNotification(title, body, options = {}) {
    if (this.permission !== 'granted' || !this.preferences.enabled) return;

    // Filter: favourite teams only
    if (this.preferences.favouriteOnly && options.homeId && options.awayId) {
      const isFavHome = favourites.hasTeam(options.homeId);
      const isFavAway = favourites.hasTeam(options.awayId);
      if (!isFavHome && !isFavAway) return;
    }

    const notifOptions = {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [100, 50, 100],
      tag: options.tag || `bd365-${Date.now()}`,
      data: { url: options.url || '/', matchId: options.matchId },
      silent: false,
    };

    // Add action buttons for match notifications
    if (options.matchId) {
      notifOptions.actions = [
        { action: 'view', title: 'Xem tr\u1EADn' },
        { action: 'predict', title: 'D\u1EF1 \u0111o\u00E1n' },
      ];
      notifOptions.data.url = `/#/match/${options.matchId}`;
    }

    // Use service worker for persistent notifications (mobile compatible)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, notifOptions);
      });
    } else {
      // Fallback to basic Notification API
      try {
        const n = new Notification(title, notifOptions);
        n.onclick = () => {
          window.focus();
          if (options.matchId && typeof router !== 'undefined') {
            router.navigate(`#/match/${options.matchId}`);
          }
        };
        setTimeout(() => n.close(), 8000);
      } catch (e) { /* silent */ }
    }
  },

  // ── Notification Templates ──

  notifyGoal(matchId, scorer, homeTeam, awayTeam, homeScore, awayScore, minute, homeId, awayId) {
    if (!this.preferences.matchAlerts) return;
    this.showNotification(
      `\u26BD B\u00C0N TH\u1EAENG! ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`,
      `${scorer || ''} ghi b\u00E0n ph\u00FAt ${minute || ''}'`,
      { matchId, tag: `goal-${matchId}-${homeScore}-${awayScore}`, homeId, awayId }
    );
  },

  notifyRedCard(matchId, player, team, minute, homeId, awayId) {
    if (!this.preferences.matchAlerts) return;
    this.showNotification(
      `\uD83D\uDFE5 TH\u1EBA \u0110\u1ECE!`,
      `${player || ''} (${team || ''}) nh\u1EADn th\u1EBB \u0111\u1ECF ph\u00FAt ${minute || ''}'`,
      { matchId, tag: `red-${matchId}-${minute}`, homeId, awayId }
    );
  },

  notifyKickoff(matchId, homeTeam, awayTeam, prediction, homeId, awayId) {
    if (!this.preferences.predictions) return;
    this.showNotification(
      `\u26BD ${homeTeam} vs ${awayTeam} \u2014 S\u1EAFp b\u1EAFt \u0111\u1EA7u!`,
      prediction ? `\uD83D\uDC34 Ng\u1EF1a Ti\u00EAn Tri: ${prediction}` : 'Tr\u1EADn \u0111\u1EA5u s\u1EAFp b\u1EAFt \u0111\u1EA7u!',
      { matchId, tag: `kickoff-${matchId}`, homeId, awayId }
    );
  },

  notifyFulltime(matchId, homeTeam, awayTeam, homeScore, awayScore, homeId, awayId) {
    if (!this.preferences.matchAlerts) return;
    this.showNotification(
      `\uD83C\uDFC1 K\u1EBET TH\u00DAC: ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`,
      'Xem th\u1ED1ng k\u00EA v\u00E0 d\u1EF1 \u0111o\u00E1n tr\u1EADn ti\u1EBFp theo',
      { matchId, tag: `ft-${matchId}`, homeId, awayId }
    );
  },

  notifyPrediction(matchId, homeTeam, awayTeam, predictedScore, homeId, awayId) {
    if (!this.preferences.predictions) return;
    this.showNotification(
      `\uD83D\uDC34 Ng\u1EF1a Ti\u00EAn Tri D\u1EF1 \u0110o\u00E1n`,
      `${homeTeam} vs ${awayTeam}: ${predictedScore}`,
      { matchId, tag: `pred-${matchId}`, homeId, awayId }
    );
  },

  // ── Permission Prompt UI (non-intrusive bottom banner) ──

  renderPrompt(container) {
    if (this.permission === 'granted' || this.permission === 'denied') return;

    const interactions = parseInt(localStorage.getItem('bd365_interactions') || '0');
    if (interactions < 3) return; // Don't ask too early

    if (localStorage.getItem('bd365_push_dismissed')) return;

    const banner = document.createElement('div');
    banner.className = 'push-prompt';
    banner.innerHTML = `
      <div class="push-prompt-content">
        <span class="push-prompt-icon">\uD83D\uDD14</span>
        <div class="push-prompt-text">
          <strong>Nh\u1EADn th\u00F4ng b\u00E1o b\u00E0n th\u1EAFng & d\u1EF1 \u0111o\u00E1n?</strong>
          <span>Kh\u00F4ng b\u1ECF l\u1EE1 kho\u1EA3nh kh\u1EAFc quan tr\u1ECDng</span>
        </div>
        <button class="push-prompt-yes">B\u1EADt th\u00F4ng b\u00E1o</button>
        <button class="push-prompt-no">\u0110\u1EC3 sau</button>
      </div>
    `;

    banner.querySelector('.push-prompt-yes').onclick = async () => {
      const ok = await this.requestPermission();
      banner.remove();
      if (ok) showToast('\uD83D\uDD14 \u0110\u00E3 b\u1EADt th\u00F4ng b\u00E1o!', 'info');
    };
    banner.querySelector('.push-prompt-no').onclick = () => {
      banner.remove();
      localStorage.setItem('bd365_push_dismissed', String(Date.now()));
    };

    (container || document.body).appendChild(banner);
  },

  // ── Settings Panel ──

  renderSettings(container) {
    if (!container) return;
    const enabled = this.permission === 'granted' && this.preferences.enabled;
    container.innerHTML = `
      <div class="push-settings">
        <h3>\uD83D\uDD14 C\u00E0i \u0111\u1EB7t th\u00F4ng b\u00E1o</h3>
        ${!enabled ? `<button class="push-enable-btn" id="pushEnableBtn">B\u1EADt th\u00F4ng b\u00E1o \u0111\u1EA9y</button>` : ''}
        <label class="push-toggle">
          <input type="checkbox" ${this.preferences.matchAlerts ? 'checked' : ''} data-pref="matchAlerts" ${!enabled ? 'disabled' : ''}>
          <span>B\u00E0n th\u1EAFng & th\u1EBB \u0111\u1ECF</span>
        </label>
        <label class="push-toggle">
          <input type="checkbox" ${this.preferences.predictions ? 'checked' : ''} data-pref="predictions" ${!enabled ? 'disabled' : ''}>
          <span>D\u1EF1 \u0111o\u00E1n Ng\u1EF1a Ti\u00EAn Tri</span>
        </label>
        <label class="push-toggle">
          <input type="checkbox" ${this.preferences.dailyDigest ? 'checked' : ''} data-pref="dailyDigest" ${!enabled ? 'disabled' : ''}>
          <span>L\u1ECBch thi \u0111\u1EA5u h\u00E0ng ng\u00E0y</span>
        </label>
        <label class="push-toggle">
          <input type="checkbox" ${this.preferences.favouriteOnly ? 'checked' : ''} data-pref="favouriteOnly" ${!enabled ? 'disabled' : ''}>
          <span>Ch\u1EC9 \u0111\u1ED9i y\u00EAu th\u00EDch</span>
        </label>
      </div>
    `;

    const enableBtn = container.querySelector('#pushEnableBtn');
    if (enableBtn) {
      enableBtn.onclick = async () => {
        const ok = await this.requestPermission();
        if (ok) {
          this.renderSettings(container); // Re-render with enabled state
          showToast('\uD83D\uDD14 \u0110\u00E3 b\u1EADt th\u00F4ng b\u00E1o!', 'info');
        }
      };
    }

    container.querySelectorAll('input[data-pref]').forEach(input => {
      input.onchange = () => {
        this.preferences[input.dataset.pref] = input.checked;
        this._savePreferences();
      };
    });
  },

  // ── Track user interactions for smart prompt timing ──

  trackInteraction() {
    const count = parseInt(localStorage.getItem('bd365_interactions') || '0') + 1;
    localStorage.setItem('bd365_interactions', String(count));
    // Show prompt after reaching threshold
    if (count === 3) {
      setTimeout(() => this.renderPrompt(document.body), 2000);
    }
  },
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  pushNotifications.init();
});
