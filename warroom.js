// BongDa365 - Social War Room: Live Polls, MVP Voting, Reaction Wall
// Requires Socket.io (chat.js must be loaded first)

class WarRoom {
  constructor(socket) {
    this.socket = socket;
    this.polls = new Map();       // matchId_pollId -> poll data
    this.mvpVotes = new Map();    // matchId -> { playerId: count }
    this.reactionCounts = {};     // emoji -> count in last 60s
    this.reactionTimers = {};     // emoji -> timestamps[]
    this.stormTracker = {};       // emoji -> timestamps[] for storm detection
    this.lastReactionTime = 0;    // rate limit
    this.setupListeners();
  }

  // ══════════════════════════════════════
  //  POLL TEMPLATES
  // ══════════════════════════════════════
  static POLL_TEMPLATES = {
    nextGoal: (home, away) => ({
      question: 'Ai sẽ ghi bàn tiếp theo?',
      options: [home, away, 'Không có bàn nữa']
    }),
    halftimeResult: (home, away) => ({
      question: 'Kết quả cuối trận sẽ thế nào?',
      options: [`${home} thắng`, 'Hòa', `${away} thắng`]
    }),
    motm: (players) => ({
      question: 'Cầu thủ hay nhất trận?',
      options: players.slice(0, 5)
    }),
    cards: () => ({
      question: 'Trận này có thêm thẻ đỏ không?',
      options: ['Có, chắc chắn!', 'Không đâu', 'Thẻ vàng thôi']
    }),
    drama: () => ({
      question: 'Trận đấu này drama level mấy?',
      options: ['Buồn ngủ', 'Bình thường', 'Nóng', 'CHÁY NỔ']
    })
  };

  // ══════════════════════════════════════
  //  POLLS
  // ══════════════════════════════════════
  createPoll(matchId, question, options) {
    if (!this.socket || !matchId) return;
    this.socket.emit('poll_create', { matchId, question, options });
  }

  votePoll(matchId, pollId, optionIndex) {
    if (!this.socket || !matchId) return;
    const key = `wr_poll_${matchId}_${pollId}`;
    if (localStorage.getItem(key)) return; // already voted
    localStorage.setItem(key, '1');
    this.socket.emit('poll_vote', { matchId, pollId, option: optionIndex });
  }

  renderPoll(container, poll) {
    if (!poll || !container) return;
    const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
    const voted = !!localStorage.getItem(`wr_poll_${poll.matchId}_${poll.id}`);

    let html = `<div class="wr-poll" data-poll-id="${poll.id}">
      <div class="wr-poll-question">${poll.question}</div>
      <div class="wr-poll-options">`;

    poll.options.forEach((opt, i) => {
      const count = poll.votes[i] || 0;
      const pct = totalVotes > 0 ? Math.round(count / totalVotes * 100) : 0;
      html += `<button class="wr-poll-option ${voted ? 'voted' : ''}"
        ${voted ? 'disabled' : ''}
        onclick="warRoom.votePoll('${poll.matchId}', '${poll.id}', ${i})">
        <span class="wr-poll-opt-text">${opt}</span>
        <div class="wr-poll-bar" style="width:${pct}%"></div>
        <span class="wr-poll-pct">${voted ? pct + '%' : ''}</span>
        <span class="wr-poll-count">${voted ? count : ''}</span>
      </button>`;
    });

    html += `</div>
      <div class="wr-poll-total">${totalVotes} phiếu bầu</div>
    </div>`;

    container.innerHTML = html;
  }

  // ══════════════════════════════════════
  //  MVP VOTING
  // ══════════════════════════════════════
  voteMVP(matchId, playerId, playerName) {
    if (!this.socket || !matchId) return;
    const key = `wr_mvp_${matchId}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, playerId);
    this.socket.emit('mvp_vote', { matchId, playerId, playerName });
  }

  renderMVPVoting(container, matchId, candidates) {
    if (!container || !candidates || !candidates.length) return;
    const votedFor = localStorage.getItem(`wr_mvp_${matchId}`);
    const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
    const medals = ['wr-mvp-gold', 'wr-mvp-silver', 'wr-mvp-bronze'];

    let html = `<div class="wr-mvp">
      <div class="wr-section-title">Cầu thủ xuất sắc nhất trận</div>
      <div class="wr-mvp-list">`;

    sorted.forEach((p, i) => {
      const medalClass = i < 3 ? medals[i] : '';
      const isVoted = votedFor === String(p.id);
      html += `<div class="wr-mvp-card ${medalClass} ${isVoted ? 'wr-mvp-voted' : ''}"
        onclick="${votedFor ? '' : `warRoom.voteMVP('${matchId}', '${p.id}', '${p.name}')`}"
        style="${votedFor ? 'cursor:default' : 'cursor:pointer'}">
        <span class="wr-mvp-rank">${i + 1}</span>
        <span class="wr-mvp-name">${p.name}</span>
        <span class="wr-mvp-votes">${p.votes}</span>
      </div>`;
    });

    html += `</div></div>`;
    container.innerHTML = html;
  }

  // ══════════════════════════════════════
  //  REACTION WALL
  // ══════════════════════════════════════
  sendReaction(matchId, emoji) {
    if (!this.socket || !matchId) return;
    const now = Date.now();
    if (now - this.lastReactionTime < 1000) return; // rate limit: 1/sec
    this.lastReactionTime = now;
    this.socket.emit('reaction', { matchId, emoji });
    this._trackReaction(emoji);
  }

  _trackReaction(emoji) {
    const now = Date.now();
    // Track for storm detection
    if (!this.stormTracker[emoji]) this.stormTracker[emoji] = [];
    this.stormTracker[emoji].push(now);
    this.stormTracker[emoji] = this.stormTracker[emoji].filter(t => now - t < 5000);

    // Track for count display
    if (!this.reactionTimers[emoji]) this.reactionTimers[emoji] = [];
    this.reactionTimers[emoji].push(now);
    this.reactionTimers[emoji] = this.reactionTimers[emoji].filter(t => now - t < 60000);
    this.reactionCounts[emoji] = this.reactionTimers[emoji].length;
  }

  triggerReactionStorm(emoji) {
    const container = document.getElementById('rightPanel') || document.getElementById('page-content');
    if (!container) return;
    // Create canvas overlay for storm
    let canvas = document.getElementById('wr-storm-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'wr-storm-canvas';
      canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999;';
      document.body.appendChild(canvas);
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const particles = [];

    for (let i = 0; i < 25; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 40,
        vx: (Math.random() - 0.5) * 4,
        vy: -(3 + Math.random() * 5),
        size: 24 + Math.random() * 16,
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.1,
        opacity: 1
      });
    }

    let frame = 0;
    const maxFrames = 90;
    const animate = () => {
      if (frame++ > maxFrames) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // gravity
        p.rotation += p.vr;
        p.opacity = Math.max(0, 1 - frame / maxFrames);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;
        ctx.font = `${p.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(emoji, 0, 0);
        ctx.restore();
      });
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  renderReactionBar(container, matchId) {
    if (!container) return;
    const emojis = ['\u26BD', '\uD83D\uDD25', '\uD83D\uDE31', '\uD83D\uDC80', '\uD83C\uDF89', '\uD83D\uDC4F', '\uD83D\uDE24', '\uD83E\uDD23'];
    // ⚽🔥😱💀🎉👏😤🤣
    let html = `<div class="wr-reaction-bar">`;
    emojis.forEach(em => {
      const count = this.reactionCounts[em] || 0;
      html += `<button class="wr-reaction-btn" onclick="warRoom.sendReaction('${matchId}', '${em}')">
        <span class="wr-reaction-emoji">${em}</span>
        ${count > 0 ? `<span class="wr-reaction-count">${count}</span>` : ''}
      </button>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  // ══════════════════════════════════════
  //  DRAMA METER
  // ══════════════════════════════════════
  _calcDramaMeter(matchData) {
    if (!matchData) return 0;
    let drama = 0;
    // Goals add drama
    const goals = (matchData.homeScore || 0) + (matchData.awayScore || 0);
    drama += goals * 12;
    // Close score = more drama
    if (Math.abs((matchData.homeScore || 0) - (matchData.awayScore || 0)) <= 1) drama += 15;
    // Reactions add drama
    const totalReactions = Object.values(this.reactionCounts).reduce((a, b) => a + b, 0);
    drama += Math.min(totalReactions * 2, 30);
    return Math.min(drama, 100);
  }

  _renderDramaMeter(drama) {
    const labels = ['Bình yên', 'Hấp dẫn', 'Kịch tính', 'CHÁY NỔ'];
    const idx = drama < 25 ? 0 : drama < 50 ? 1 : drama < 75 ? 2 : 3;
    return `<div class="wr-drama">
      <div class="wr-section-title">Drama Meter</div>
      <div class="wr-drama-bar">
        <div class="wr-drama-fill" style="width:${drama}%"></div>
      </div>
      <div class="wr-drama-label">${labels[idx]}</div>
    </div>`;
  }

  // ══════════════════════════════════════
  //  MATCH MOOD
  // ══════════════════════════════════════
  _calcMood() {
    const positive = (this.reactionCounts['\uD83C\uDF89'] || 0) + (this.reactionCounts['\uD83D\uDC4F'] || 0) + (this.reactionCounts['\u26BD'] || 0);
    const heated = (this.reactionCounts['\uD83D\uDE24'] || 0) + (this.reactionCounts['\uD83D\uDC80'] || 0) + (this.reactionCounts['\uD83D\uDD25'] || 0);
    const funny = (this.reactionCounts['\uD83E\uDD23'] || 0);
    if (funny > positive && funny > heated) return { icon: '\uD83E\uDD23', label: 'Hài hước' };
    if (heated > positive) return { icon: '\uD83D\uDE24', label: 'Căng thẳng' };
    return { icon: '\uD83D\uDE0A', label: 'Tích cực' };
  }

  // ══════════════════════════════════════
  //  RENDER FULL WAR ROOM
  // ══════════════════════════════════════
  renderWarRoom(container, matchId, matchData) {
    if (!container || !matchId) return;

    let html = '<div class="wr-container">';

    // 1. Reaction bar
    html += '<div id="wr-reaction-section"></div>';

    // 2. Active poll
    const pollKey = [...this.polls.keys()].find(k => k.startsWith(matchId + '_'));
    if (pollKey) {
      html += '<div id="wr-poll-section"></div>';
    } else {
      html += '<div id="wr-poll-section"><div class="wr-empty">Chưa có poll nào</div></div>';
    }

    // 3. Drama meter
    const drama = this._calcDramaMeter(matchData);
    html += this._renderDramaMeter(drama);

    // 4. Match mood
    const mood = this._calcMood();
    html += `<div class="wr-mood">
      <div class="wr-section-title">Tâm trạng trận đấu</div>
      <div class="wr-mood-display">${mood.icon} ${mood.label}</div>
    </div>`;

    // 5. MVP voting section
    html += '<div id="wr-mvp-section"></div>';

    html += '</div>';
    container.innerHTML = html;

    // Render sub-components
    const reactionEl = document.getElementById('wr-reaction-section');
    if (reactionEl) this.renderReactionBar(reactionEl, matchId);

    if (pollKey) {
      const pollEl = document.getElementById('wr-poll-section');
      if (pollEl) this.renderPoll(pollEl, this.polls.get(pollKey));
    }

    // MVP voting
    const mvpData = this.mvpVotes.get(matchId);
    if (mvpData && mvpData.length) {
      const mvpEl = document.getElementById('wr-mvp-section');
      if (mvpEl) this.renderMVPVoting(mvpEl, matchId, mvpData);
    }
  }

  // ══════════════════════════════════════
  //  SOCKET LISTENERS
  // ══════════════════════════════════════
  setupListeners() {
    if (!this.socket) return;

    this.socket.on('poll_update', data => {
      if (!data || !data.poll) return;
      const poll = data.poll;
      this.polls.set(`${poll.matchId}_${poll.id}`, poll);
      const el = document.querySelector(`.wr-poll[data-poll-id="${poll.id}"]`);
      if (el) this.renderPoll(el.parentElement, poll);
      // Also update if war room tab is visible
      const section = document.getElementById('wr-poll-section');
      if (section) this.renderPoll(section, poll);
    });

    this.socket.on('poll_created', data => {
      if (!data || !data.poll) return;
      const poll = data.poll;
      this.polls.set(`${poll.matchId}_${poll.id}`, poll);
      const section = document.getElementById('wr-poll-section');
      if (section) this.renderPoll(section, poll);
    });

    this.socket.on('mvp_update', data => {
      if (!data || !data.matchId) return;
      this.mvpVotes.set(data.matchId, data.candidates);
      const section = document.getElementById('wr-mvp-section');
      if (section) this.renderMVPVoting(section, data.matchId, data.candidates);
    });

    this.socket.on('mvp_started', data => {
      if (!data || !data.matchId) return;
      this.mvpVotes.set(data.matchId, data.candidates);
      const section = document.getElementById('wr-mvp-section');
      if (section) this.renderMVPVoting(section, data.matchId, data.candidates);
    });

    this.socket.on('reaction_storm', data => {
      if (data?.emoji) this.triggerReactionStorm(data.emoji);
    });

    // Track incoming reactions for storm & count
    this.socket.on('reaction', data => {
      if (data?.emoji) this._trackReaction(data.emoji);
      // Update reaction bar if visible
      const bar = document.querySelector('.wr-reaction-bar');
      if (bar) {
        const matchId = chat.currentMatch;
        if (matchId) {
          const section = document.getElementById('wr-reaction-section');
          if (section) this.renderReactionBar(section, matchId);
        }
      }
    });
  }
}

// ── Global instance ──
let warRoom = null;

function initWarRoom() {
  if (warRoom) return;
  if (typeof chat !== 'undefined' && chat.socket) {
    warRoom = new WarRoom(chat.socket);
    console.log('War Room initialized');
  }
}

// Init after chat connects
document.addEventListener('DOMContentLoaded', () => {
  // Wait for chat socket to be ready
  const waitSocket = setInterval(() => {
    if (typeof chat !== 'undefined' && chat.socket && chat.socket.connected) {
      clearInterval(waitSocket);
      initWarRoom();
    }
  }, 500);
  // Stop waiting after 30s
  setTimeout(() => clearInterval(waitSocket), 30000);
});
