// BongDa365 - Prediction Game (Dự đoán tỉ số) with Coin System
// localStorage-based, no user accounts needed

const predGame = {
  STORAGE_KEY: 'bd365_predictions',
  SCORE_KEY: 'bd365_pred_scores',
  USERNAME_KEY: 'bd365_pred_username',
  COIN_KEY: 'bd365_coin_data',
  WEEKLY_KEY: 'bd365_weekly_coins',

  DEFAULT_COINS: 1000,
  BET_OPTIONS: [50, 100, 200, 500],
  DAILY_BONUS: 200,
  SHARE_BONUS: 50,
  STREAK_THRESHOLD: 3,
  STREAK_BONUS: 100,

  init() {
    this.username = localStorage.getItem(this.USERNAME_KEY) || chat?.username || ('Fan_' + Math.random().toString(36).substr(2, 4));
    localStorage.setItem(this.USERNAME_KEY, this.username);
    // Initialize coin data if not present
    if (!localStorage.getItem(this.COIN_KEY)) {
      this.saveCoinData(this.getDefaultCoinData());
    }
    // Inject coin animation styles
    this._injectStyles();
  },

  getDefaultCoinData() {
    return {
      username: this.username,
      coins: this.DEFAULT_COINS,
      totalWon: 0,
      totalLost: 0,
      predictions: [],
      streak: 0,
      bestStreak: 0,
      lastDailyBonus: 0,
      accuracy: { correct: 0, total: 0 },
      sharedMatches: [], // matchIds where share bonus was claimed
      weeklyCoins: 0,
      weekStart: this._getWeekStart(),
    };
  },

  getCoinData() {
    try {
      const data = JSON.parse(localStorage.getItem(this.COIN_KEY));
      if (!data || typeof data.coins !== 'number') return this.getDefaultCoinData();
      // Reset weekly if new week
      if (data.weekStart !== this._getWeekStart()) {
        data.weeklyCoins = 0;
        data.weekStart = this._getWeekStart();
        this.saveCoinData(data);
      }
      return data;
    } catch { return this.getDefaultCoinData(); }
  },

  saveCoinData(data) {
    data.username = this.username;
    localStorage.setItem(this.COIN_KEY, JSON.stringify(data));
  },

  _getWeekStart() {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    return monday.toISOString().split('T')[0];
  },

  // ── Daily Bonus ──
  canClaimDailyBonus() {
    const data = this.getCoinData();
    if (!data.lastDailyBonus) return true;
    const last = new Date(data.lastDailyBonus);
    const now = new Date();
    return now.toDateString() !== last.toDateString();
  },

  claimDailyBonus() {
    if (!this.canClaimDailyBonus()) {
      showToast('Bạn đã nhận thưởng hôm nay rồi!', 'info');
      return false;
    }
    const data = this.getCoinData();
    data.coins += this.DAILY_BONUS;
    data.totalWon += this.DAILY_BONUS;
    data.weeklyCoins += this.DAILY_BONUS;
    data.lastDailyBonus = Date.now();
    this.saveCoinData(data);
    this._showCoinAnimation(this.DAILY_BONUS, true);
    showToast(`🎁 Thưởng hàng ngày: +${this.DAILY_BONUS} xu!`, 'info');
    this._emitCoinUpdate();
    this._refreshUI();
    return true;
  },

  // ── Share Bonus ──
  claimShareBonus(matchId) {
    const data = this.getCoinData();
    if (data.sharedMatches.includes(matchId)) {
      showToast('Đã nhận thưởng chia sẻ trận này!', 'info');
      return false;
    }
    data.coins += this.SHARE_BONUS;
    data.totalWon += this.SHARE_BONUS;
    data.weeklyCoins += this.SHARE_BONUS;
    data.sharedMatches.push(matchId);
    // Keep last 50 shared match IDs
    if (data.sharedMatches.length > 50) data.sharedMatches = data.sharedMatches.slice(-50);
    this.saveCoinData(data);
    this._showCoinAnimation(this.SHARE_BONUS, true);
    showToast(`📤 Thưởng chia sẻ: +${this.SHARE_BONUS} xu!`, 'info');
    this._emitCoinUpdate();
    return true;
  },

  // Save a prediction for a match (with bet amount)
  savePrediction(matchId, homeScore, awayScore, betAmount) {
    const data = this.getCoinData();
    const bet = betAmount || 50;

    // Check if enough coins
    if (data.coins < bet) {
      showToast('Không đủ xu để đặt cược!', 'info');
      return false;
    }

    // Deduct bet
    data.coins -= bet;
    data.totalLost += bet;
    this.saveCoinData(data);

    const preds = this.getAllPredictions();
    // If updating a prediction, refund old bet
    if (preds[matchId] && preds[matchId].bet) {
      data.coins += preds[matchId].bet;
      data.totalLost -= preds[matchId].bet;
      this.saveCoinData(data);
    }

    preds[matchId] = {
      home: parseInt(homeScore),
      away: parseInt(awayScore),
      ts: Date.now(),
      user: this.username,
      bet: bet,
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(preds));
    this._emitCoinUpdate();
    return true;
  },

  // Get prediction for a specific match
  getPrediction(matchId) {
    const preds = this.getAllPredictions();
    return preds[matchId] || null;
  },

  getAllPredictions() {
    try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}'); }
    catch { return {}; }
  },

  // Calculate score for a finished match
  calcPoints(predicted, actualHome, actualAway) {
    if (!predicted) return 0;
    const pH = predicted.home, pA = predicted.away;
    // Exact score: 3 points
    if (pH === actualHome && pA === actualAway) return 3;
    // Correct result (win/draw/loss): 1 point
    const predResult = Math.sign(pH - pA);
    const actualResult = Math.sign(actualHome - actualAway);
    if (predResult === actualResult) return 1;
    return 0;
  },

  // Calculate coin payout based on points and bet
  calcPayout(points, bet) {
    if (points === 3) return bet * 5; // Exact score
    if (points === 1) return bet * 2; // Correct result
    return 0; // Wrong
  },

  // Get total score
  getScores() {
    try { return JSON.parse(localStorage.getItem(this.SCORE_KEY) || '{"total":0,"exact":0,"correct":0,"wrong":0,"matches":[]}'); }
    catch { return { total: 0, exact: 0, correct: 0, wrong: 0, matches: [] }; }
  },

  // Record result for a match
  recordResult(matchId, actualHome, actualAway, matchInfo) {
    const pred = this.getPrediction(matchId);
    if (!pred) return;
    const scores = this.getScores();
    // Don't record same match twice
    if (scores.matches.find(m => m.id === matchId)) return;
    const points = this.calcPoints(pred, actualHome, actualAway);
    scores.total += points;
    if (points === 3) scores.exact++;
    else if (points === 1) scores.correct++;
    else scores.wrong++;

    // ── Coin payout ──
    const bet = pred.bet || 50;
    const payout = this.calcPayout(points, bet);
    const coinData = this.getCoinData();

    if (payout > 0) {
      coinData.coins += payout;
      coinData.totalWon += payout;
      coinData.weeklyCoins += (payout - bet); // net win
      coinData.accuracy.correct++;
      coinData.streak++;
      if (coinData.streak > coinData.bestStreak) coinData.bestStreak = coinData.streak;

      // Streak bonus
      if (coinData.streak > 0 && coinData.streak % this.STREAK_THRESHOLD === 0) {
        coinData.coins += this.STREAK_BONUS;
        coinData.totalWon += this.STREAK_BONUS;
        coinData.weeklyCoins += this.STREAK_BONUS;
        showToast(`🔥 Streak ${coinData.streak}! Thưởng +${this.STREAK_BONUS} xu!`, 'info');
      }

      this._showCoinAnimation(payout, true);
    } else {
      // Lost the bet (coins already deducted at prediction time)
      coinData.streak = 0;
      this._showCoinAnimation(bet, false);
    }
    coinData.accuracy.total++;

    // Save prediction to coin history
    coinData.predictions.push({
      matchId,
      predicted: { home: pred.home, away: pred.away },
      actual: { home: actualHome, away: actualAway },
      bet,
      payout,
      points,
      info: matchInfo || '',
      ts: Date.now(),
    });
    // Keep last 100
    if (coinData.predictions.length > 100) coinData.predictions = coinData.predictions.slice(-100);
    this.saveCoinData(coinData);

    scores.matches.push({
      id: matchId,
      predicted: { home: pred.home, away: pred.away },
      actual: { home: actualHome, away: actualAway },
      points,
      bet,
      payout,
      info: matchInfo || '',
      ts: Date.now(),
    });
    // Keep last 100 matches
    if (scores.matches.length > 100) scores.matches = scores.matches.slice(-100);
    localStorage.setItem(this.SCORE_KEY, JSON.stringify(scores));

    // Emit to server leaderboard
    if (typeof chat !== 'undefined' && chat.socket) {
      chat.socket.emit('pred_score', {
        user: this.username,
        points,
        score: scores.total,
      });
    }
    this._emitCoinUpdate();
  },

  // ── Emit coin update to server ──
  _emitCoinUpdate() {
    if (typeof chat === 'undefined' || !chat.socket) return;
    const coinData = this.getCoinData();
    const acc = coinData.accuracy.total > 0
      ? Math.round(coinData.accuracy.correct / coinData.accuracy.total * 100)
      : 0;
    chat.socket.emit('coin_update', {
      user: this.username,
      coins: coinData.coins,
      totalWon: coinData.totalWon,
      accuracy: acc,
    });
  },

  // ── Coin Animation ──
  _showCoinAnimation(amount, isWin) {
    const container = document.getElementById('predGameSection') || document.getElementById('page-content') || document.body;
    const el = document.createElement('div');
    el.className = `coin-anim ${isWin ? 'coin-win' : 'coin-lose'}`;
    el.textContent = isWin ? `+${amount} xu` : `-${amount} xu`;
    container.style.position = container.style.position || 'relative';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  },

  _injectStyles() {
    if (document.getElementById('predCoinStyles')) return;
    const style = document.createElement('style');
    style.id = 'predCoinStyles';
    style.textContent = `
      .coin-anim {
        position: absolute;
        top: 10px;
        right: 20px;
        font-size: 1.4rem;
        font-weight: bold;
        z-index: 999;
        pointer-events: none;
        animation: coinFloat 1.8s ease-out forwards;
      }
      .coin-win { color: #22c55e; text-shadow: 0 0 8px rgba(34,197,94,0.5); }
      .coin-lose { color: #ef4444; text-shadow: 0 0 8px rgba(239,68,68,0.5); }
      @keyframes coinFloat {
        0% { opacity: 1; transform: translateY(0) scale(1); }
        60% { opacity: 1; transform: translateY(-40px) scale(1.2); }
        100% { opacity: 0; transform: translateY(-80px) scale(0.8); }
      }
      .coin-balance-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: linear-gradient(135deg, #f59e0b22, #f59e0b11);
        border: 1px solid #f59e0b44;
        border-radius: 10px;
        padding: 8px 14px;
        margin-bottom: 10px;
        flex-wrap: wrap;
        gap: 6px;
      }
      .coin-balance-bar .coin-amount {
        font-weight: bold;
        font-size: 1.1rem;
        color: #f59e0b;
      }
      .coin-balance-bar .coin-label { color: #94a3b8; font-size: 0.85rem; }
      .coin-balance-bar .daily-btn {
        background: #f59e0b;
        color: #000;
        border: none;
        border-radius: 6px;
        padding: 4px 12px;
        font-weight: bold;
        cursor: pointer;
        font-size: 0.85rem;
      }
      .coin-balance-bar .daily-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .bet-selector {
        display: flex;
        gap: 6px;
        margin: 8px 0;
        flex-wrap: wrap;
      }
      .bet-btn {
        background: #1e293b;
        color: #e2e8f0;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 4px 12px;
        cursor: pointer;
        font-size: 0.85rem;
        transition: all 0.15s;
      }
      .bet-btn.active {
        background: #f59e0b;
        color: #000;
        border-color: #f59e0b;
        font-weight: bold;
      }
      .bet-btn:hover { border-color: #f59e0b; }
      .pred-coin-history {
        margin-top: 8px;
        max-height: 200px;
        overflow-y: auto;
      }
      .pred-coin-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 8px;
        border-bottom: 1px solid #1e293b;
        font-size: 0.85rem;
      }
      .pred-coin-item .payout-win { color: #22c55e; font-weight: bold; }
      .pred-coin-item .payout-lose { color: #ef4444; font-weight: bold; }
      .pred-streak-badge {
        display: inline-block;
        background: linear-gradient(135deg, #f59e0b, #ef4444);
        color: #fff;
        font-weight: bold;
        border-radius: 12px;
        padding: 2px 10px;
        font-size: 0.8rem;
        margin-left: 6px;
      }
    `;
    document.head.appendChild(style);
  },

  // ── Refresh coin UI after changes ──
  _refreshUI() {
    // Refresh coin balance bar if it exists
    const bar = document.getElementById('coinBalanceBar');
    if (bar) {
      const coinData = this.getCoinData();
      const amountEl = bar.querySelector('.coin-amount');
      if (amountEl) amountEl.textContent = coinData.coins.toLocaleString() + ' xu';
      const dailyBtn = bar.querySelector('.daily-btn');
      if (dailyBtn) dailyBtn.disabled = !this.canClaimDailyBonus();
    }
  },

  // Render prediction form for a match
  renderPredictionForm(matchId, homeName, awayName, status) {
    const pred = this.getPrediction(matchId);
    const scores = this.getScores();
    const coinData = this.getCoinData();
    const isLive = status === 'LIVE';
    const isFT = status === 'FT';
    const canPredict = !isLive && !isFT;
    const acc = coinData.accuracy.total > 0
      ? Math.round(coinData.accuracy.correct / coinData.accuracy.total * 100) : 0;

    // ── Coin Balance Bar ──
    let html = `<div class="pred-game-card" data-home="${homeName}" data-away="${awayName}" data-status="${status}">
      <div id="coinBalanceBar" class="coin-balance-bar">
        <div>
          <span class="coin-label">🪙 Xu:</span>
          <span class="coin-amount">${coinData.coins.toLocaleString()} xu</span>
          ${coinData.streak >= this.STREAK_THRESHOLD ? `<span class="pred-streak-badge">🔥 ${coinData.streak} streak</span>` : ''}
        </div>
        <div>
          <span class="coin-label">Tổng thắng: ${coinData.totalWon.toLocaleString()}</span>
        </div>
        <button class="daily-btn" onclick="predGame.claimDailyBonus()" ${!this.canClaimDailyBonus() ? 'disabled' : ''}>
          🎁 ${this.canClaimDailyBonus() ? 'Nhận +200 xu' : 'Đã nhận'}
        </button>
      </div>
      <div class="pred-game-header">
        <span class="pred-game-title">🎯 Dự đoán tỉ số</span>
        <span class="pred-game-score">⭐ ${scores.total} điểm | 🎯 ${acc}%</span>
      </div>`;

    if (canPredict) {
      const currentBet = pred ? (pred.bet || 50) : 100;
      html += `<div class="pred-game-form">
        <div class="pred-game-teams">
          <span class="pred-team-name">${homeName}</span>
          <input type="number" min="0" max="20" value="${pred ? pred.home : 0}" id="predHome_${matchId}" class="pred-score-input">
          <span class="pred-vs">-</span>
          <input type="number" min="0" max="20" value="${pred ? pred.away : 0}" id="predAway_${matchId}" class="pred-score-input">
          <span class="pred-team-name">${awayName}</span>
        </div>
        <div class="bet-selector" id="betSelector_${matchId}">
          <span class="coin-label" style="align-self:center">Đặt cược:</span>
          ${this.BET_OPTIONS.map(b =>
            `<button class="bet-btn ${b === currentBet ? 'active' : ''}" onclick="predGame._selectBet(${matchId}, ${b})" data-bet="${b}">${b} xu</button>`
          ).join('')}
        </div>
        <button class="pred-save-btn" onclick="predGame.onSave(${matchId})">
          ${pred ? '✏️ Cập nhật' : '🎯 Dự đoán'}
        </button>
      </div>`;
      if (pred) {
        html += `<div class="pred-game-saved">Đã dự đoán: ${homeName} ${pred.home}-${pred.away} ${awayName} (cược ${pred.bet || 50} xu)</div>`;
        html += `<button class="challenge-friend-btn" onclick="challengeSystem.onChallengeClick(${matchId}, '${homeName.replace(/'/g, "\\'")}', '${awayName.replace(/'/g, "\\'")}')">
          ⚔️ Thách bạn bè (+${this.SHARE_BONUS} xu)
        </button>`;
      }
    } else if (pred) {
      html += `<div class="pred-game-result">
        <span>Bạn đoán: <strong>${pred.home}-${pred.away}</strong> (cược ${pred.bet || 50} xu)</span>
        ${isFT ? '<span class="pred-check">Kết quả đã cập nhật</span>' : '<span class="pred-live">Trận đang diễn ra</span>'}
      </div>`;
    } else {
      html += `<div class="pred-game-missed">Bạn chưa dự đoán trận này</div>`;
    }

    // Stats summary
    html += `<div class="pred-game-stats">
      <span title="Đoán chính xác tỉ số">🎯 ${scores.exact}</span>
      <span title="Đoán đúng kết quả">✅ ${scores.correct}</span>
      <span title="Đoán sai">❌ ${scores.wrong}</span>
      <span title="Tổng trận">${scores.matches.length} trận</span>
      <span title="Best streak">🔥 Best: ${coinData.bestStreak}</span>
    </div>`;

    html += '</div>';
    return html;
  },

  _selectBet(matchId, amount) {
    const container = document.getElementById(`betSelector_${matchId}`);
    if (!container) return;
    container.querySelectorAll('.bet-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.bet) === amount);
    });
  },

  _getSelectedBet(matchId) {
    const container = document.getElementById(`betSelector_${matchId}`);
    if (!container) return 100;
    const active = container.querySelector('.bet-btn.active');
    return active ? parseInt(active.dataset.bet) : 100;
  },

  onSave(matchId) {
    const h = document.getElementById(`predHome_${matchId}`);
    const a = document.getElementById(`predAway_${matchId}`);
    if (!h || !a) return;
    const hv = Math.max(0, Math.min(20, parseInt(h.value) || 0));
    const av = Math.max(0, Math.min(20, parseInt(a.value) || 0));
    const bet = this._getSelectedBet(matchId);

    const success = this.savePrediction(matchId, hv, av, bet);
    if (!success) return;

    // Re-render the section
    const container = document.getElementById('predGameSection');
    if (container) {
      const el = container.querySelector('.pred-game-card');
      if (el) {
        el.outerHTML = this.renderPredictionForm(matchId, el.dataset.home, el.dataset.away, el.dataset.status);
      }
    }
    showToast(`🎯 Đã lưu dự đoán! Cược ${bet} xu`, 'info');
    if (typeof app !== 'undefined') app.track('prediction_saved', { matchId, bet });
  },

  // Render leaderboard / history (with coins)
  renderHistory() {
    const scores = this.getScores();
    const coinData = this.getCoinData();
    const acc = coinData.accuracy.total > 0
      ? Math.round(coinData.accuracy.correct / coinData.accuracy.total * 100) : 0;

    let html = `<div class="pred-history">
      <div class="pred-history-summary">
        <div class="pred-stat-big"><span class="pred-stat-num" style="color:#f59e0b">🪙 ${coinData.coins.toLocaleString()}</span><span class="pred-stat-lbl">Xu hiện tại</span></div>
        <div class="pred-stat-big"><span class="pred-stat-num" style="color:#22c55e">${coinData.totalWon.toLocaleString()}</span><span class="pred-stat-lbl">Tổng thắng</span></div>
        <div class="pred-stat-big"><span class="pred-stat-num">${acc}%</span><span class="pred-stat-lbl">Chính xác</span></div>
        <div class="pred-stat-big"><span class="pred-stat-num">🔥 ${coinData.bestStreak}</span><span class="pred-stat-lbl">Best Streak</span></div>
      </div>
      <div class="pred-history-summary" style="margin-top:6px">
        <div class="pred-stat-big"><span class="pred-stat-num">${scores.total}</span><span class="pred-stat-lbl">Tổng điểm</span></div>
        <div class="pred-stat-big"><span class="pred-stat-num">${scores.exact}</span><span class="pred-stat-lbl">Chính xác</span></div>
        <div class="pred-stat-big"><span class="pred-stat-num">${scores.correct}</span><span class="pred-stat-lbl">Đúng KQ</span></div>
        <div class="pred-stat-big"><span class="pred-stat-num">${scores.matches.length}</span><span class="pred-stat-lbl">Tổng trận</span></div>
      </div>`;

    // Coin prediction history
    if (coinData.predictions.length) {
      html += '<h4 style="color:#f59e0b;margin:12px 0 6px">Lịch sử xu</h4>';
      html += '<div class="pred-coin-history">';
      for (const m of coinData.predictions.slice(-10).reverse()) {
        const icon = m.points === 3 ? '🎯' : m.points === 1 ? '✅' : '❌';
        const payoutClass = m.payout > 0 ? 'payout-win' : 'payout-lose';
        const payoutText = m.payout > 0 ? `+${m.payout} xu` : `-${m.bet} xu`;
        html += `<div class="pred-coin-item">
          <span>${icon} ${m.info || `Match #${m.matchId}`}</span>
          <span>Đoán: ${m.predicted.home}-${m.predicted.away} | KQ: ${m.actual.home}-${m.actual.away}</span>
          <span>Cược: ${m.bet}</span>
          <span class="${payoutClass}">${payoutText}</span>
        </div>`;
      }
      html += '</div>';
    }

    // Recent matches (legacy points)
    if (scores.matches.length) {
      html += '<h4 style="margin:12px 0 6px;color:#94a3b8">Lịch sử điểm</h4>';
      html += '<div class="pred-history-list">';
      for (const m of scores.matches.slice(-10).reverse()) {
        const icon = m.points === 3 ? '🎯' : m.points === 1 ? '✅' : '❌';
        html += `<div class="pred-history-item">
          <span>${icon}</span>
          <span class="pred-history-info">${m.info || `Match #${m.id}`}</span>
          <span>Đoán: ${m.predicted.home}-${m.predicted.away}</span>
          <span>KQ: ${m.actual.home}-${m.actual.away}</span>
          <span class="pred-points">+${m.points}${m.bet ? ` | ${m.payout > 0 ? '+' : '-'}${m.payout || m.bet} xu` : ''}</span>
        </div>`;
      }
      html += '</div>';
    }

    if (!scores.matches.length && !coinData.predictions.length) {
      html += '<div class="empty-state"><p>Chưa có lịch sử dự đoán</p></div>';
    }

    html += '</div>';
    return html;
  },
};

document.addEventListener('DOMContentLoaded', () => predGame.init());
