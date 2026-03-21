// BongDa365 - Challenge a Friend (Thách Bạn Dự Đoán) System
// Viral loop: predict → challenge → share → friend accepts → settle

const challengeSystem = {
  // ── Create Challenge ──
  async createChallenge(matchId, prediction, bet, matchInfo) {
    try {
      const res = await fetch('/api/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          creatorName: predGame.username,
          prediction,
          bet,
          matchInfo,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Lỗi tạo thách đấu' }));
        showToast(err.error || 'Lỗi tạo thách đấu', 'info');
        return null;
      }
      const data = await res.json();
      // Award share bonus
      predGame.claimShareBonus(matchId);
      return data;
    } catch (e) {
      console.error('Challenge create error:', e);
      showToast('Không thể tạo thách đấu. Thử lại sau!', 'info');
      return null;
    }
  },

  // ── Load Challenge Page ──
  async loadChallenge(challengeId) {
    const el = document.getElementById('page-content');
    if (!el) return;
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tải thách đấu...</p></div>';

    try {
      const res = await fetch(`/api/challenge/${challengeId}`);
      if (!res.ok) {
        el.innerHTML = '<div class="empty-state"><div class="icon">404</div><p>Thách đấu không tồn tại hoặc đã hết hạn!</p><a href="#/" class="hero-cta hero-cta-primary" style="display:inline-block;margin-top:12px">← Về trang chủ</a></div>';
        return;
      }
      const challenge = await res.json();
      this.renderChallengePage(el, challenge);
    } catch (e) {
      console.error('Challenge load error:', e);
      el.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>Lỗi tải thách đấu</p></div>';
    }
  },

  // ── Accept Challenge ──
  async acceptChallenge(challengeId, prediction, bet) {
    try {
      const coinData = predGame.getCoinData();
      if (coinData.coins < bet) {
        showToast('Không đủ xu để chấp nhận thách đấu!', 'info');
        return false;
      }

      const res = await fetch(`/api/challenge/${challengeId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengerName: predGame.username,
          prediction,
          bet,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Lỗi' }));
        showToast(err.error || 'Không thể chấp nhận thách đấu', 'info');
        return false;
      }

      // Deduct coins locally
      const cd = predGame.getCoinData();
      cd.coins -= bet;
      cd.totalLost += bet;
      predGame.saveCoinData(cd);
      predGame._emitCoinUpdate();

      showToast('Đã chấp nhận thách đấu! Chờ kết quả trận đấu.', 'info');
      // Reload challenge page
      await this.loadChallenge(challengeId);
      return true;
    } catch (e) {
      console.error('Challenge accept error:', e);
      showToast('Lỗi chấp nhận thách đấu', 'info');
      return false;
    }
  },

  // ── Generate Challenge Card (Canvas) ──
  generateChallengeCard(challenge) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
    grad.addColorStop(0, '#0a0e17');
    grad.addColorStop(0.4, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1080);

    // Gold accent stripes
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 1080, 6);
    ctx.fillRect(0, 1074, 1080, 6);

    // Side accent bars
    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.fillRect(0, 0, 6, 1080);
    ctx.fillRect(1074, 0, 6, 1080);

    // Challenge badge background
    ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
    this._roundRect(ctx, 240, 40, 600, 80, 40);
    ctx.fill();

    // Title
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 48px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THACH DAU DU DOAN', 540, 95);

    // Sword/cross icon decoration
    ctx.fillStyle = '#f59e0b';
    ctx.font = '72px Inter, sans-serif';
    ctx.fillText('\u2694\uFE0F', 540, 200);

    // Match info
    const mi = challenge.matchInfo || {};
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 56px Inter, sans-serif';
    ctx.fillText(mi.home || 'Home', 540, 310);

    ctx.fillStyle = '#6b7280';
    ctx.font = '36px Inter, sans-serif';
    ctx.fillText('vs', 540, 365);

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 56px Inter, sans-serif';
    ctx.fillText(mi.away || 'Away', 540, 420);

    // Divider line
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(190, 470);
    ctx.lineTo(890, 470);
    ctx.stroke();

    // Creator info
    ctx.fillStyle = '#94a3b8';
    ctx.font = '32px Inter, sans-serif';
    ctx.fillText(`${challenge.creatorName} da thach ban:`, 540, 530);

    // Creator's prediction (show or hide)
    if (challenge.status === 'pending') {
      // Show prediction teaser
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 80px Inter, sans-serif';
      ctx.fillText('? ? ?', 540, 640);

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'italic 36px Inter, sans-serif';
      ctx.fillText('"Cuoc ' + challenge.creatorBet + ' xu — Ban dam choi khong?"', 540, 720);
    } else {
      // Show both predictions
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 64px Inter, sans-serif';
      ctx.fillText(
        `${challenge.creatorPrediction.home} - ${challenge.creatorPrediction.away}`,
        540, 630
      );
      ctx.fillStyle = '#94a3b8';
      ctx.font = '28px Inter, sans-serif';
      ctx.fillText(`(Cuoc ${challenge.creatorBet} xu)`, 540, 670);
    }

    // Call-to-action
    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    this._roundRect(ctx, 190, 780, 700, 70, 35);
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 36px Inter, sans-serif';
    ctx.fillText('Nhan thach dau tai BongDa365.xyz', 540, 825);

    // Challenge URL
    ctx.fillStyle = '#64748b';
    ctx.font = '26px Inter, sans-serif';
    ctx.fillText(`bongda365.xyz/challenge/${challenge.id}`, 540, 920);

    // Branding
    ctx.fillStyle = '#5a6580';
    ctx.font = '28px Inter, sans-serif';
    ctx.fillText('BongDa365.xyz — Ngua Tien Tri', 540, 1020);

    return canvas;
  },

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  // ── Share Challenge ──
  async shareChallenge(challengeId, cardCanvas) {
    const shareUrl = `${window.location.origin}/challenge/${challengeId}`;
    const shareText = `\uD83D\uDC34 Tao th\u00E1ch m\u00E0y d\u1EF1 \u0111o\u00E1n tr\u1EADn n\u00E0y! D\u00E1m ch\u01A1i kh\u00F4ng? \uD83D\uDC49 ${shareUrl}`;

    try {
      if (cardCanvas && navigator.canShare) {
        const blob = await new Promise(r => cardCanvas.toBlob(r, 'image/png'));
        const file = new File([blob], 'bongda365-challenge.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Thách Đấu Dự Đoán — BongDa365',
            text: shareText,
            url: shareUrl,
            files: [file],
          });
          return;
        }
      }

      if (navigator.share) {
        await navigator.share({
          title: 'Thách Đấu Dự Đoán — BongDa365',
          text: shareText,
          url: shareUrl,
        });
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return; // User cancelled
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Đã sao chép link thách đấu!', 'info');
    } catch {
      // Last resort: prompt
      prompt('Sao chép link thách đấu:', shareText);
    }
  },

  // ── Show Challenge Dialog (after creating) ──
  async showShareDialog(challenge) {
    const card = this.generateChallengeCard(challenge);

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'challenge-modal-overlay';
    overlay.innerHTML = `
      <div class="challenge-modal">
        <div class="challenge-modal-header">
          <h3>⚔️ Thách Đấu Đã Tạo!</h3>
          <button class="challenge-modal-close" onclick="this.closest('.challenge-modal-overlay').remove()">✕</button>
        </div>
        <div class="challenge-modal-card"></div>
        <div class="challenge-modal-actions">
          <button class="challenge-share-btn challenge-share-primary" id="challengeShareBtn">
            📤 Chia sẻ thách đấu
          </button>
          <button class="challenge-share-btn challenge-share-copy" id="challengeCopyBtn">
            📋 Sao chép link
          </button>
        </div>
        <div class="challenge-modal-url">
          <span>Link: </span>
          <code>${window.location.origin}/challenge/${challenge.id}</code>
        </div>
      </div>
    `;

    // Append card canvas
    const cardContainer = overlay.querySelector('.challenge-modal-card');
    card.style.width = '100%';
    card.style.maxWidth = '400px';
    card.style.height = 'auto';
    card.style.borderRadius = '12px';
    cardContainer.appendChild(card);

    document.body.appendChild(overlay);

    // Share button
    overlay.querySelector('#challengeShareBtn').addEventListener('click', () => {
      this.shareChallenge(challenge.id, card);
    });

    // Copy button
    overlay.querySelector('#challengeCopyBtn').addEventListener('click', async () => {
      const shareUrl = `${window.location.origin}/challenge/${challenge.id}`;
      const shareText = `\uD83D\uDC34 Tao th\u00E1ch m\u00E0y d\u1EF1 \u0111o\u00E1n tr\u1EADn n\u00E0y! D\u00E1m ch\u01A1i kh\u00F4ng? \uD83D\uDC49 ${shareUrl}`;
      try {
        await navigator.clipboard.writeText(shareText);
        showToast('Đã sao chép link thách đấu!', 'info');
      } catch {
        prompt('Sao chép link:', shareText);
      }
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  },

  // ── Render Challenge Page ──
  renderChallengePage(container, challenge) {
    const mi = challenge.matchInfo || {};
    const isExpired = challenge.status === 'pending' && Date.now() > challenge.expiresAt;
    const isCreator = challenge.creatorName === predGame.username;

    let statusHtml = '';
    let actionHtml = '';

    if (isExpired) {
      statusHtml = '<div class="challenge-status challenge-expired">⏰ Thách đấu đã hết hạn</div>';
    } else if (challenge.status === 'pending') {
      statusHtml = '<div class="challenge-status challenge-pending">⏳ Đang chờ đối thủ</div>';
      if (!isCreator) {
        const coinData = predGame.getCoinData();
        actionHtml = `
          <div class="challenge-accept-form">
            <h3>🎯 Nhập dự đoán của bạn</h3>
            <div class="challenge-accept-teams">
              <span class="pred-team-name">${mi.home || 'Chủ nhà'}</span>
              <input type="number" min="0" max="20" value="0" id="challengeHomeScore" class="pred-score-input">
              <span class="pred-vs">-</span>
              <input type="number" min="0" max="20" value="0" id="challengeAwayScore" class="pred-score-input">
              <span class="pred-team-name">${mi.away || 'Khách'}</span>
            </div>
            <div class="bet-selector" id="challengeBetSelector">
              <span class="coin-label" style="align-self:center">Đặt cược:</span>
              ${predGame.BET_OPTIONS.map(b =>
                `<button class="bet-btn ${b === challenge.creatorBet ? 'active' : ''}" onclick="challengeSystem._selectChallengeBet(${b})" data-bet="${b}">${b} xu</button>`
              ).join('')}
            </div>
            <div class="challenge-coins-info">
              🪙 Xu hiện tại: <strong>${coinData.coins.toLocaleString()}</strong>
            </div>
            <button class="challenge-accept-btn" onclick="challengeSystem._onAccept('${challenge.id}')">
              ⚔️ Chấp nhận thách đấu!
            </button>
          </div>
        `;
      } else {
        actionHtml = `
          <div class="challenge-waiting">
            <p>Chia sẻ link để bạn bè tham gia:</p>
            <button class="challenge-share-btn challenge-share-primary" onclick="challengeSystem.shareChallenge('${challenge.id}')">
              📤 Chia sẻ thách đấu
            </button>
          </div>
        `;
      }
    } else if (challenge.status === 'accepted') {
      statusHtml = '<div class="challenge-status challenge-accepted">⚔️ Đã chấp nhận — Chờ kết quả trận đấu!</div>';
      actionHtml = `
        <div class="challenge-predictions-compare">
          <div class="challenge-pred-col">
            <div class="challenge-pred-name">${challenge.creatorName}</div>
            <div class="challenge-pred-score">${challenge.creatorPrediction.home} - ${challenge.creatorPrediction.away}</div>
            <div class="challenge-pred-bet">Cược: ${challenge.creatorBet} xu</div>
          </div>
          <div class="challenge-vs">VS</div>
          <div class="challenge-pred-col">
            <div class="challenge-pred-name">${challenge.challengerName}</div>
            <div class="challenge-pred-score">${challenge.challengerPrediction.home} - ${challenge.challengerPrediction.away}</div>
            <div class="challenge-pred-bet">Cược: ${challenge.challengerBet} xu</div>
          </div>
        </div>
      `;
    } else if (challenge.status === 'settled') {
      const r = challenge.result || {};
      const isWinner = r.winner === predGame.username;
      statusHtml = `<div class="challenge-status challenge-settled">
        🏆 ${r.winner ? r.winner + ' thắng!' : 'Hòa!'}
        ${r.actualScore ? `(KQ: ${r.actualScore.home}-${r.actualScore.away})` : ''}
      </div>`;
      actionHtml = `
        <div class="challenge-predictions-compare">
          <div class="challenge-pred-col ${r.winner === challenge.creatorName ? 'challenge-winner' : 'challenge-loser'}">
            <div class="challenge-pred-name">${challenge.creatorName}</div>
            <div class="challenge-pred-score">${challenge.creatorPrediction.home} - ${challenge.creatorPrediction.away}</div>
            <div class="challenge-pred-bet">${r.winner === challenge.creatorName ? '+' + r.payout : '-' + challenge.creatorBet} xu</div>
          </div>
          <div class="challenge-vs">VS</div>
          <div class="challenge-pred-col ${r.winner === challenge.challengerName ? 'challenge-winner' : 'challenge-loser'}">
            <div class="challenge-pred-name">${challenge.challengerName}</div>
            <div class="challenge-pred-score">${challenge.challengerPrediction.home} - ${challenge.challengerPrediction.away}</div>
            <div class="challenge-pred-bet">${r.winner === challenge.challengerName ? '+' + r.payout : '-' + challenge.challengerBet} xu</div>
          </div>
        </div>
        ${!isWinner && r.loserName === predGame.username ? `
          <div class="challenge-revenge">
            <a href="#/match/${challenge.matchId}" class="challenge-revenge-btn">🔥 Phục thù? Dự đoán trận tiếp!</a>
          </div>
        ` : ''}
      `;
    }

    container.innerHTML = `
      <div class="challenge-page">
        <div class="challenge-header">
          <div class="challenge-badge">⚔️ THÁCH ĐẤU DỰ ĐOÁN</div>
        </div>
        <div class="challenge-match-info">
          <div class="challenge-team challenge-team-home">${mi.home || 'Chủ nhà'}</div>
          <div class="challenge-match-vs">VS</div>
          <div class="challenge-team challenge-team-away">${mi.away || 'Khách'}</div>
        </div>
        ${statusHtml}
        <div class="challenge-creator-info">
          <span>👤 ${challenge.creatorName} đã tạo thách đấu</span>
          <span>🪙 Cược: ${challenge.creatorBet} xu</span>
        </div>
        ${actionHtml}
        <div class="challenge-footer">
          <a href="#/" class="challenge-home-link">← Về trang chủ BongDa365</a>
          <a href="#/match/${challenge.matchId}" class="challenge-match-link">📊 Xem phân tích trận đấu</a>
        </div>
      </div>
    `;
  },

  // ── Internal: Select bet in challenge accept form ──
  _selectChallengeBet(amount) {
    const container = document.getElementById('challengeBetSelector');
    if (!container) return;
    container.querySelectorAll('.bet-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.bet) === amount);
    });
  },

  _getSelectedChallengeBet() {
    const container = document.getElementById('challengeBetSelector');
    if (!container) return 100;
    const active = container.querySelector('.bet-btn.active');
    return active ? parseInt(active.dataset.bet) : 100;
  },

  // ── Internal: Accept handler ──
  async _onAccept(challengeId) {
    const homeEl = document.getElementById('challengeHomeScore');
    const awayEl = document.getElementById('challengeAwayScore');
    if (!homeEl || !awayEl) return;

    const prediction = {
      home: Math.max(0, Math.min(20, parseInt(homeEl.value) || 0)),
      away: Math.max(0, Math.min(20, parseInt(awayEl.value) || 0)),
    };
    const bet = this._getSelectedChallengeBet();

    await this.acceptChallenge(challengeId, prediction, bet);
  },

  // ── Create challenge from prediction form ──
  async onChallengeClick(matchId, homeName, awayName) {
    const pred = predGame.getPrediction(matchId);
    if (!pred) {
      showToast('Hãy dự đoán tỉ số trước khi thách đấu!', 'info');
      return;
    }

    const challenge = await this.createChallenge(
      matchId,
      { home: pred.home, away: pred.away },
      pred.bet || 100,
      { home: homeName, away: awayName }
    );

    if (challenge) {
      // Fetch full challenge data and show dialog
      try {
        const res = await fetch(`/api/challenge/${challenge.id}`);
        const fullChallenge = await res.json();
        this.showShareDialog(fullChallenge);
      } catch {
        this.showShareDialog(challenge);
      }
    }
  },

  // ── Listen for challenge results via socket ──
  initSocket() {
    if (typeof chat !== 'undefined' && chat.socket) {
      chat.socket.on('challenge_result', (data) => {
        if (!data) return;
        const isInvolved = data.creatorName === predGame.username || data.challengerName === predGame.username;
        if (!isInvolved) return;

        const isWinner = data.winner === predGame.username;
        if (isWinner && data.payout) {
          const cd = predGame.getCoinData();
          cd.coins += data.payout;
          cd.totalWon += data.payout;
          predGame.saveCoinData(cd);
          predGame._showCoinAnimation(data.payout, true);
          showToast(`🏆 Thắng thách đấu! +${data.payout} xu!`, 'info');
        } else {
          showToast(`😤 Thua thách đấu! ${data.winner} thắng. Phục thù?`, 'info');
        }
        predGame._emitCoinUpdate();
      });
    }
  },

  // ── Inject CSS styles ──
  _injectStyles() {
    if (document.getElementById('challengeStyles')) return;
    const style = document.createElement('style');
    style.id = 'challengeStyles';
    style.textContent = `
      /* Challenge Modal */
      .challenge-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .challenge-modal {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 24px;
        max-width: 460px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
      }
      .challenge-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .challenge-modal-header h3 {
        color: #f59e0b;
        font-size: 1.3rem;
        margin: 0;
      }
      .challenge-modal-close {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 4px 8px;
      }
      .challenge-modal-card {
        display: flex;
        justify-content: center;
        margin-bottom: 16px;
      }
      .challenge-modal-actions {
        display: flex;
        gap: 10px;
        margin-bottom: 12px;
      }
      .challenge-share-btn {
        flex: 1;
        padding: 12px;
        border-radius: 10px;
        font-size: 1rem;
        font-weight: bold;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }
      .challenge-share-primary {
        background: #f59e0b;
        color: #000;
      }
      .challenge-share-primary:hover {
        background: #d97706;
      }
      .challenge-share-copy {
        background: #1e293b;
        color: #e2e8f0;
        border: 1px solid #334155;
      }
      .challenge-share-copy:hover {
        border-color: #f59e0b;
      }
      .challenge-modal-url {
        text-align: center;
        font-size: 0.85rem;
        color: #64748b;
      }
      .challenge-modal-url code {
        color: #f59e0b;
        background: #1e293b;
        padding: 2px 8px;
        border-radius: 4px;
      }

      /* Challenge Page */
      .challenge-page {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px 16px;
      }
      .challenge-header {
        text-align: center;
        margin-bottom: 20px;
      }
      .challenge-badge {
        display: inline-block;
        background: linear-gradient(135deg, #f59e0b22, #f59e0b11);
        border: 2px solid #f59e0b;
        color: #f59e0b;
        font-size: 1.4rem;
        font-weight: bold;
        padding: 10px 28px;
        border-radius: 50px;
        letter-spacing: 2px;
      }
      .challenge-match-info {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 20px;
        margin: 24px 0;
        padding: 20px;
        background: #1e293b;
        border-radius: 16px;
        border: 1px solid #334155;
      }
      .challenge-team {
        font-size: 1.3rem;
        font-weight: bold;
        flex: 1;
        text-align: center;
      }
      .challenge-team-home { color: #3b82f6; }
      .challenge-team-away { color: #ef4444; }
      .challenge-match-vs {
        color: #64748b;
        font-size: 1.1rem;
        font-weight: bold;
      }
      .challenge-status {
        text-align: center;
        padding: 12px;
        border-radius: 10px;
        font-weight: bold;
        margin: 16px 0;
      }
      .challenge-pending {
        background: #f59e0b22;
        color: #f59e0b;
        border: 1px solid #f59e0b44;
      }
      .challenge-accepted {
        background: #3b82f622;
        color: #3b82f6;
        border: 1px solid #3b82f644;
      }
      .challenge-settled {
        background: #22c55e22;
        color: #22c55e;
        border: 1px solid #22c55e44;
      }
      .challenge-expired {
        background: #ef444422;
        color: #ef4444;
        border: 1px solid #ef444444;
      }
      .challenge-creator-info {
        display: flex;
        justify-content: space-between;
        color: #94a3b8;
        font-size: 0.9rem;
        padding: 10px 0;
        border-bottom: 1px solid #1e293b;
        margin-bottom: 16px;
      }

      /* Accept Form */
      .challenge-accept-form {
        background: #1e293b;
        border-radius: 12px;
        padding: 20px;
        margin: 16px 0;
      }
      .challenge-accept-form h3 {
        color: #f59e0b;
        margin: 0 0 16px 0;
        text-align: center;
      }
      .challenge-accept-teams {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      .challenge-coins-info {
        text-align: center;
        color: #94a3b8;
        font-size: 0.9rem;
        margin: 10px 0;
      }
      .challenge-accept-btn {
        display: block;
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: #000;
        border: none;
        border-radius: 10px;
        font-size: 1.1rem;
        font-weight: bold;
        cursor: pointer;
        margin-top: 12px;
        transition: all 0.2s;
      }
      .challenge-accept-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(245,158,11,0.3);
      }

      /* Predictions Compare */
      .challenge-predictions-compare {
        display: flex;
        align-items: center;
        gap: 16px;
        margin: 20px 0;
        padding: 20px;
        background: #1e293b;
        border-radius: 12px;
      }
      .challenge-pred-col {
        flex: 1;
        text-align: center;
        padding: 12px;
        border-radius: 10px;
        background: #0f172a;
      }
      .challenge-winner {
        border: 2px solid #22c55e;
        background: #22c55e11;
      }
      .challenge-loser {
        border: 2px solid #ef4444;
        background: #ef444411;
      }
      .challenge-pred-name {
        color: #e2e8f0;
        font-weight: bold;
        margin-bottom: 8px;
      }
      .challenge-pred-score {
        color: #fff;
        font-size: 1.8rem;
        font-weight: bold;
      }
      .challenge-pred-bet {
        color: #94a3b8;
        font-size: 0.85rem;
        margin-top: 6px;
      }
      .challenge-vs {
        color: #64748b;
        font-weight: bold;
        font-size: 1.1rem;
      }

      /* Waiting & Revenge */
      .challenge-waiting {
        text-align: center;
        padding: 20px;
        color: #94a3b8;
      }
      .challenge-revenge {
        text-align: center;
        margin-top: 16px;
      }
      .challenge-revenge-btn {
        display: inline-block;
        padding: 12px 24px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: #fff;
        border-radius: 10px;
        text-decoration: none;
        font-weight: bold;
        font-size: 1rem;
        transition: all 0.2s;
      }
      .challenge-revenge-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(239,68,68,0.3);
      }

      /* Footer */
      .challenge-footer {
        display: flex;
        justify-content: space-between;
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #1e293b;
      }
      .challenge-footer a {
        color: #3b82f6;
        text-decoration: none;
        font-size: 0.9rem;
      }
      .challenge-footer a:hover { text-decoration: underline; }

      /* Challenge button in prediction form */
      .challenge-friend-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: linear-gradient(135deg, #f59e0b22, #f59e0b11);
        border: 1px solid #f59e0b;
        color: #f59e0b;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: bold;
        cursor: pointer;
        margin-top: 8px;
        transition: all 0.2s;
        width: 100%;
        justify-content: center;
      }
      .challenge-friend-btn:hover {
        background: #f59e0b;
        color: #000;
      }
    `;
    document.head.appendChild(style);
  },

  init() {
    this._injectStyles();
    // Delayed socket init (wait for chat to connect)
    setTimeout(() => this.initSocket(), 3000);
  },
};

document.addEventListener('DOMContentLoaded', () => challengeSystem.init());
