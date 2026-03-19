// BongDa365 - Live Chat + Reactions + Viral Cards
// Uses Socket.io for real-time communication

const chat = {
  socket: null,
  currentMatch: null,
  initialized: false,
  username: 'Fan_' + Math.random().toString(36).substr(2, 4),

  init() {
    if (this.initialized) return; // Prevent duplicate listeners
    this.initialized = true;
    try {
      this.socket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 10000,
      });
      this.socket.on('connect', () => {
        console.log('Socket.io connected');
        if (typeof app !== 'undefined') app._loadLive();
      });
      this.socket.on('disconnect', (reason) => {
        console.log('Socket.io disconnected:', reason);
      });
    } catch { console.warn('Socket.io not available'); return; }
    this.socket.on('chat_msg', msg => this.addMessage(msg));
    this.socket.on('reaction', data => this.showReaction(data?.emoji));
    this.socket.on('commentary', entry => this.addCommentary(entry));
    this.socket.on('commentary_log', log => { if (Array.isArray(log)) log.forEach(e => this.addCommentary(e)); });
    this.socket.on('predictions', data => this.updatePredictions(data));
    this.socket.on('match_event', event => this.onMatchEvent(event));
    this.socket.on('live_event', event => this.onLiveEvent(event));
    this.socket.on('live_update', (data) => {
      if (typeof app !== 'undefined' && typeof router !== 'undefined'
          && (router.currentPage === '/' || router.currentPage === '/live')) {
        if (data?.events) {
          app._updateLiveFromSocket(data.events);
        } else {
          app._loadLive();
        }
      }
    });
  },

  joinMatch(matchId) {
    if (!this.socket || matchId == null) return;
    if (this.currentMatch !== null) this.socket.emit('leave_match', this.currentMatch);
    this.currentMatch = matchId;
    this.socket.emit('join_match', matchId);
  },

  leaveMatch() {
    if (!this.socket) return;
    if (this.currentMatch !== null) {
      this.socket.emit('leave_match', this.currentMatch);
      this.currentMatch = null;
    }
  },

  sendMessage(text) {
    if (!text.trim() || !this.currentMatch) return;
    this.socket.emit('chat_msg', { matchId: this.currentMatch, text: text.trim(), user: this.username });
  },

  sendReaction(emoji) {
    if (!this.currentMatch) return;
    this.socket.emit('reaction', { matchId: this.currentMatch, emoji });
  },

  // ── UI ──
  addMessage(msg) {
    const el = document.getElementById('chatMessages');
    if (!el) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${msg.isMascot ? 'mascot' : ''}`;
    const time = new Date(msg.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `<span class="chat-user ${msg.isMascot?'mascot-name':''}">${msg.user}</span>
      <span class="chat-text">${msg.text}</span>
      <span class="chat-time">${time}</span>`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  },

  addCommentary(entry) {
    const el = document.getElementById('commentaryFeed');
    if (!el) return;
    const div = document.createElement('div');
    div.className = `commentary-item priority-${entry.priority}`;
    div.innerHTML = `<span class="commentary-text">${entry.text}</span>`;
    div.style.animation = 'fadeSlideUp 0.3s ease';
    el.prepend(div);
    // Keep max 30 items
    while (el.children.length > 30) el.lastChild.remove();

    // Toast for critical events
    if (entry.priority === 'critical') showToast(entry.text, entry.type);
  },

  updatePredictions(data) {
    const el = document.getElementById('livePredictions');
    if (!el || !data?.predictions) return;
    const p = data.predictions;
    const v = (key) => p[key] ?? 50; // Default 50 if missing
    const row = (label, key, color) =>
      `<div class="pred-bar-row"><span class="pred-label">${label}</span><div class="pred-bar"><div class="pred-fill ${color}" style="width:${v(key)}%"></div></div><span class="pred-pct">${v(key)}%</span></div>`;
    el.innerHTML =
      row('Chủ thắng', 'homeWin', 'blue') +
      row('Hòa', 'draw', 'gray') +
      row('Khách thắng', 'awayWin', 'red') +
      row('Tài 2.5', 'over25', 'green') +
      row('BTTS', 'btts', 'orange') +
      row('Góc T8.5', 'cornersOver85', 'purple') +
      row('Thẻ T3.5', 'cardsOver35', 'yellow');
  },

  showReaction(emoji) {
    const container = document.getElementById('rightPanel') || document.getElementById('page-content');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'flying-emoji';
    el.textContent = emoji;
    el.style.left = (20 + Math.random() * 60) + '%';
    el.style.animationDuration = (1.5 + Math.random()) + 's';
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  },

  onMatchEvent(event) {
    // Score bounce animation
    if (event.type === 'goal') {
      document.querySelectorAll('.modal-score-big').forEach(el => {
        el.classList.add('score-bounce');
        setTimeout(() => el.classList.remove('score-bounce'), 800);
      });
    }
  },

  onLiveEvent(event) {
    // Animate score change on live cards
    if (event.type === 'goal' && event.data?.matchId) {
      const card = document.querySelector(`[data-match-id="${event.data.matchId}"] .match-score`);
      if (card) {
        card.classList.add('score-bounce');
        setTimeout(() => card.classList.remove('score-bounce'), 800);
      }
      // Global toast
      showToast(
        `⚽ ${event.data.home} ${event.data.score.home}-${event.data.score.away} ${event.data.away}`,
        'goal'
      );
    }
    if (event.type === 'red_card') {
      showToast(`🟥 Thẻ đỏ: ${event.data.player} (${event.data.team})`, 'red_card');
    }
  },

  // ── Viral Card Generator ──
  generateCard(matchData, eventText) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
    grad.addColorStop(0, '#0a0e17');
    grad.addColorStop(1, '#1a2236');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1080);

    // Accent stripe
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 1080, 6);
    ctx.fillRect(0, 1074, 1080, 6);

    // Score
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 120px Inter, sans-serif';
    ctx.textAlign = 'center';
    const score = matchData ? `${matchData.homeScore} - ${matchData.awayScore}` : '? - ?';
    ctx.fillText(score, 540, 420);

    // Team names
    ctx.font = 'bold 48px Inter, sans-serif';
    ctx.fillStyle = '#3b82f6';
    ctx.fillText(matchData?.home?.name || 'Home', 540, 320);
    ctx.fillStyle = '#ef4444';
    ctx.fillText(matchData?.away?.name || 'Away', 540, 490);

    // Event text
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 36px Inter, sans-serif';
    const lines = this.wrapText(ctx, eventText || '', 900);
    lines.forEach((line, i) => ctx.fillText(line, 540, 600 + i * 50));

    // Branding
    ctx.fillStyle = '#5a6580';
    ctx.font = '28px Inter, sans-serif';
    ctx.fillText('⚽ BongDa365.com', 540, 1020);

    return canvas;
  },

  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line.trim());
        line = word + ' ';
      } else line = test;
    }
    if (line) lines.push(line.trim());
    return lines.slice(0, 3);
  },

  async shareCard(canvas, caption) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'bongda365-goal.png', { type: 'image/png' });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'BongDa365', text: caption || '' });
    } else {
      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'bongda365-goal.png';
      a.click();
      URL.revokeObjectURL(url);
    }
  }
};

// ── Toast Notifications ──
function showToast(text, type = 'info') {
  const container = document.getElementById('toastContainer') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = text;
  container.prepend(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 6000);
}

function createToastContainer() {
  const c = document.createElement('div');
  c.id = 'toastContainer';
  c.style.cssText = 'position:fixed;top:70px;right:16px;z-index:1000;display:flex;flex-direction:column;gap:8px;max-width:400px;';
  document.body.appendChild(c);
  return c;
}

document.addEventListener('DOMContentLoaded', () => chat.init());
