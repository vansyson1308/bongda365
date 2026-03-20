// BongDa365 - Prediction Game (Dự đoán tỉ số)
// localStorage-based, no user accounts needed

const predGame = {
  STORAGE_KEY: 'bd365_predictions',
  SCORE_KEY: 'bd365_pred_scores',
  USERNAME_KEY: 'bd365_pred_username',

  init() {
    this.username = localStorage.getItem(this.USERNAME_KEY) || chat?.username || ('Fan_' + Math.random().toString(36).substr(2, 4));
    localStorage.setItem(this.USERNAME_KEY, this.username);
  },

  // Save a prediction for a match
  savePrediction(matchId, homeScore, awayScore) {
    const preds = this.getAllPredictions();
    preds[matchId] = {
      home: parseInt(homeScore),
      away: parseInt(awayScore),
      ts: Date.now(),
      user: this.username,
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(preds));
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
    scores.matches.push({
      id: matchId,
      predicted: { home: pred.home, away: pred.away },
      actual: { home: actualHome, away: actualAway },
      points,
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
  },

  // Render prediction form for a match
  renderPredictionForm(matchId, homeName, awayName, status) {
    const pred = this.getPrediction(matchId);
    const scores = this.getScores();
    const isLive = status === 'LIVE';
    const isFT = status === 'FT';
    const canPredict = !isLive && !isFT;

    let html = `<div class="pred-game-card">
      <div class="pred-game-header">
        <span class="pred-game-title">🎯 Dự đoán tỉ số</span>
        <span class="pred-game-score">⭐ ${scores.total} điểm</span>
      </div>`;

    if (canPredict) {
      html += `<div class="pred-game-form">
        <div class="pred-game-teams">
          <span class="pred-team-name">${homeName}</span>
          <input type="number" min="0" max="20" value="${pred ? pred.home : 0}" id="predHome_${matchId}" class="pred-score-input">
          <span class="pred-vs">-</span>
          <input type="number" min="0" max="20" value="${pred ? pred.away : 0}" id="predAway_${matchId}" class="pred-score-input">
          <span class="pred-team-name">${awayName}</span>
        </div>
        <button class="pred-save-btn" onclick="predGame.onSave(${matchId})">
          ${pred ? '✏️ Cập nhật' : '🎯 Dự đoán'}
        </button>
      </div>`;
      if (pred) {
        html += `<div class="pred-game-saved">Đã dự đoán: ${homeName} ${pred.home}-${pred.away} ${awayName}</div>`;
      }
    } else if (pred) {
      html += `<div class="pred-game-result">
        <span>Bạn đoán: <strong>${pred.home}-${pred.away}</strong></span>
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
    </div>`;

    html += '</div>';
    return html;
  },

  onSave(matchId) {
    const h = document.getElementById(`predHome_${matchId}`);
    const a = document.getElementById(`predAway_${matchId}`);
    if (!h || !a) return;
    const hv = Math.max(0, Math.min(20, parseInt(h.value) || 0));
    const av = Math.max(0, Math.min(20, parseInt(a.value) || 0));
    this.savePrediction(matchId, hv, av);
    // Re-render the section
    const container = document.getElementById('predGameSection');
    if (container) {
      const el = container.querySelector('.pred-game-card');
      if (el) {
        el.outerHTML = this.renderPredictionForm(matchId, el.dataset.home, el.dataset.away, el.dataset.status);
      }
    }
    showToast('🎯 Đã lưu dự đoán!', 'info');
    if (typeof app !== 'undefined') app.track('prediction_saved', { matchId });
  },

  // Render leaderboard / history
  renderHistory() {
    const scores = this.getScores();
    if (!scores.matches.length) return '<div class="empty-state"><p>Chưa có lịch sử dự đoán</p></div>';
    let html = `<div class="pred-history">
      <div class="pred-history-summary">
        <div class="pred-stat-big"><span class="pred-stat-num">${scores.total}</span><span class="pred-stat-lbl">Tổng điểm</span></div>
        <div class="pred-stat-big"><span class="pred-stat-num">${scores.exact}</span><span class="pred-stat-lbl">Chính xác</span></div>
        <div class="pred-stat-big"><span class="pred-stat-num">${scores.correct}</span><span class="pred-stat-lbl">Đúng KQ</span></div>
        <div class="pred-stat-big"><span class="pred-stat-num">${scores.matches.length}</span><span class="pred-stat-lbl">Tổng trận</span></div>
      </div>`;
    // Recent matches
    html += '<div class="pred-history-list">';
    for (const m of scores.matches.slice(-10).reverse()) {
      const icon = m.points === 3 ? '🎯' : m.points === 1 ? '✅' : '❌';
      html += `<div class="pred-history-item">
        <span>${icon}</span>
        <span class="pred-history-info">${m.info || `Match #${m.id}`}</span>
        <span>Đoán: ${m.predicted.home}-${m.predicted.away}</span>
        <span>KQ: ${m.actual.home}-${m.actual.away}</span>
        <span class="pred-points">+${m.points}</span>
      </div>`;
    }
    html += '</div></div>';
    return html;
  },
};

document.addEventListener('DOMContentLoaded', () => predGame.init());
