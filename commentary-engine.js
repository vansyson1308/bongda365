// Commentary Engine - "Giải thích số, không chỉ hiển thị số"
// Rule-based Vietnamese commentary with stat velocity analysis

const bus = require('./event-bus');

class CommentaryEngine {
  constructor() {
    this.matchNarrative = new Map(); // matchId -> narrative state
    this.commentaryLog = new Map(); // matchId -> [{text, priority, ts}]
    this.matchContext = new Map(); // matchId -> { context narrative, standings info }
    this.matchIncidentSummary = new Map(); // matchId -> { goals, cards, subs, penalties }
    this.onCommentary = null; // callback to broadcast
  }

  start(broadcastFn) {
    this.onCommentary = broadcastFn;

    // ── Layer 1: Instant event commentary ──
    bus.on('goal', d => this._onGoal(d));
    bus.on('red_card', d => this._onRedCard(d));
    bus.on('card', d => this._onCard(d));
    bus.on('halftime', d => this._onHalftime(d));
    bus.on('fulltime', d => { this._onFulltime(d); this._cleanup(d.matchId); });
    bus.on('kickoff', d => this._onKickoff(d));
    bus.on('var', d => this._onVar(d));
    bus.on('substitution', d => this._onSub(d));

    // ── Layer 2: Stat velocity analysis ──
    bus.on('stat_update', d => this._onStatUpdate(d));
  }

  _emit(matchId, text, priority = 'normal', type = 'insight') {
    const entry = { matchId, text, priority, type, ts: Date.now() };
    const log = this.commentaryLog.get(matchId) || [];
    log.push(entry);
    if (log.length > 50) log.shift();
    this.commentaryLog.set(matchId, log);
    if (this.onCommentary) this.onCommentary(entry);
  }

  getLog(matchId) {
    return this.commentaryLog.get(matchId) || [];
  }

  // ═══════════════════════════════════════
  // Layer 1: Instant Event Commentary
  // ═══════════════════════════════════════

  _onGoal(d) {
    const { matchId, teamName, minute, score, prevScore, home, away } = d;
    const total = score.home + score.away;
    const diff = Math.abs(score.home - score.away);
    const templates = [];

    if (minute >= 85) {
      templates.push(
        `⚡ BÀN THẮNG PHÚT CUỐI! ${teamName} ghi bàn phút ${minute}! Kịch tính đến phút chót!`,
        `🔥 DRAMA! ${teamName} phá vỡ thế bế tắc ở phút ${minute}! ${home} ${score.home}-${score.away} ${away}`,
      );
    } else if (minute <= 5) {
      templates.push(
        `⚡ BÀN MỞ TỈ SỐ CHỚP NHOÁNG! ${teamName} ghi bàn chỉ sau ${minute} phút!`,
      );
    }

    if (diff === 0) {
      templates.push(`⚽ GỠ HÒA! ${teamName} cân bằng tỉ số ${score.home}-${score.away} ở phút ${minute}!`);
    } else if (diff >= 3) {
      templates.push(`⚽ ${teamName} nhấn chìm đối thủ! ${home} ${score.home}-${score.away} ${away}. Cách biệt ${diff} bàn!`);
    }

    if (total >= 4) {
      templates.push(`🎯 Trận đấu mưa bàn thắng! Đã có ${total} bàn thắng trong trận!`);
    }

    templates.push(
      `⚽ BÀÀÀN THẮNG! ${teamName} nâng tỉ số lên ${score.home}-${score.away} ở phút ${minute}!`,
      `⚽ VÀO! ${home} ${score.home}-${score.away} ${away} (${minute}')`,
    );

    this._emit(matchId, this._pick(templates), 'critical', 'goal');

    // Track for smart summary
    const summary = this.matchIncidentSummary.get(matchId);
    if (summary) {
      summary.goals++;
      summary.keyMoments.push(`⚽ ${d.player || teamName} (${minute}')`);
      if (d.penalty) summary.penalties++;
    }

    // Follow-up insight
    if (score.home > 0 && score.away > 0) {
      setTimeout(() => {
        this._emit(matchId, `📊 Cả hai đội đều đã ghi bàn. Kèo BTTS (Cả hai ghi bàn) = Có ✅`, 'normal', 'insight');
      }, 3000);
    }
    if (total >= 3 && minute < 70) {
      setTimeout(() => {
        this._emit(matchId, `📈 ${total} bàn trong ${minute} phút. Tốc độ ghi bàn: ${(total/minute*90).toFixed(1)} bàn/90 phút!`, 'normal', 'insight');
      }, 5000);
    }
  }

  _onRedCard(d) {
    const { matchId, team, player, minute, home, away } = d;
    this._emit(matchId,
      `🟥 THẺ ĐỎ! ${player} (${team}) bị đuổi khỏi sân ở phút ${minute}! ${team} phải chơi thiếu người! Xác suất thắng giảm ~20%.`,
      'critical', 'red_card');

    // Track for smart summary
    const summary = this.matchIncidentSummary.get(matchId);
    if (summary) {
      summary.redCards++;
      summary.cards++;
      summary.keyMoments.push(`🟥 ${player || team} (${minute}')`);
    }

    setTimeout(() => {
      this._emit(matchId,
        `📊 Thống kê: Đội bị thẻ đỏ thua 65% các trận còn lại. ${team} đang ở thế rất khó khăn.`,
        'high', 'insight');
    }, 5000);
  }

  _onCard(d) {
    if (d.cardType === 'red' || d.cardType === 'yellowred') return; // handled by red_card
    const { matchId, team, player, minute } = d;
    this._emit(matchId, `🟨 ${player} (${team}) nhận thẻ vàng phút ${minute}.`, 'low', 'card');

    // Track for smart summary
    const summary = this.matchIncidentSummary.get(matchId);
    if (summary) {
      summary.cards++;
    }
  }

  _onHalftime(d) {
    const { matchId, home, away, score } = d;
    const total = score.home + score.away;
    let insight = '';
    if (total === 0) insight = 'Hiệp 1 không bàn thắng. Thống kê cho thấy 55% trận 0-0 hiệp 1 sẽ có bàn trong hiệp 2.';
    else if (total >= 3) insight = `Hiệp 1 bùng nổ với ${total} bàn! Tốc độ này dự đoán tổng bàn cuối trận: ${Math.round(total * 2.1)}.`;
    else insight = `Tỉ số hiệp 1: ${score.home}-${score.away}. 68% trận có bàn trước nghỉ sẽ có thêm bàn ở hiệp 2.`;

    this._emit(matchId, `⏸️ NGHỈ GIỮA HIỆP: ${home} ${score.home}-${score.away} ${away}. ${insight}`, 'high', 'halftime');
  }

  _onFulltime(d) {
    const { matchId, home, away, score, winner } = d;
    const result = winner ? `${winner} CHIẾN THẮNG!` : 'HÒA!';
    this._emit(matchId,
      `🏁 KẾT THÚC! ${home} ${score.home}-${score.away} ${away}. ${result}`,
      'high', 'fulltime');

    // Smart post-match summary
    const summary = this.matchIncidentSummary.get(matchId);
    if (summary) {
      setTimeout(() => {
        const total = score.home + score.away;
        const parts = [];

        if (total > 0) parts.push(`${total} bàn thắng`);
        if (summary.redCards > 0) parts.push(`${summary.redCards} thẻ đỏ`);
        if (summary.cards > 0) parts.push(`${summary.cards} thẻ phạt`);
        if (summary.penalties > 0) parts.push(`${summary.penalties} penalty`);

        let summaryText = '';
        if (parts.length > 0) {
          summaryText = `📋 Tóm tắt: ${parts.join(', ')} trong 90 phút`;
          if (total >= 4) summaryText += ' điên rồ';
          summaryText += '.';
        }

        // Add key moments highlight
        if (summary.keyMoments.length > 0) {
          const lastMoment = summary.keyMoments[summary.keyMoments.length - 1];
          if (total >= 3 || summary.redCards > 0) {
            summaryText += ` Sự kiện nổi bật: ${summary.keyMoments.slice(-3).join(', ')}.`;
          }
        }

        if (summaryText) {
          this._emit(matchId, summaryText, 'normal', 'summary');
        }
      }, 3000);
    }
  }

  _onKickoff(d) {
    // Generate context narrative if available
    const ctx = this.matchContext.get(d.matchId);
    let contextText = '';
    if (ctx?.narrative) {
      contextText = ' ' + ctx.narrative;
    }
    this._emit(d.matchId,
      `🟢 TIẾNG CÒI KHAI CUỘC! ${d.home} vs ${d.away} (${d.league}). Trận đấu bắt đầu!${contextText}`,
      'normal', 'kickoff');
    // Track incidents for smart summary
    this.matchIncidentSummary.set(d.matchId, { goals: 0, cards: 0, redCards: 0, subs: 0, penalties: 0, keyMoments: [] });
  }

  setMatchContext(matchId, context) {
    this.matchContext.set(matchId, context);
  }

  _onVar(d) {
    const decision = d.confirmed ? 'XÁC NHẬN' : 'HỦY BỎ';
    this._emit(d.matchId,
      `📺 VAR: ${decision} - ${d.decision} (phút ${d.minute})`,
      'high', 'var');
  }

  _onSub(d) {
    this._emit(d.matchId,
      `🔄 ${d.team}: ${d.playerIn} ↔ ${d.playerOut} (${d.minute}')`,
      'low', 'substitution');

    // Track for smart summary
    const summary = this.matchIncidentSummary.get(d.matchId);
    if (summary) summary.subs++;
  }

  // ═══════════════════════════════════════
  // Layer 2: Stat Velocity Analysis
  // ═══════════════════════════════════════

  _onStatUpdate(d) {
    const { matchId, velocity, currentStats, home, away, minute } = d;
    if (!minute) return;

    // Corner kick pressure analysis
    const corners = velocity['Corner kicks'] || velocity['cornerKicks'];
    if (corners) {
      const pressing = corners.home > corners.away ? home : away;
      const rate = Math.max(corners.homeDiff, corners.awayDiff);
      if (rate >= 2) {
        const prob = Math.min(85, 50 + rate * 12);
        this._emit(matchId,
          `🚩 ${pressing} dồn ép mạnh - ${rate} phạt góc gần đây. Xác suất có thêm phạt góc: ${prob}%`,
          'normal', 'insight');
      }
    }

    // Shot pressure
    const shots = velocity['Total shots'] || velocity['totalShots'];
    if (shots) {
      const hRate = shots.homeDiff || 0;
      const aRate = shots.awayDiff || 0;
      if (hRate >= 3 || aRate >= 3) {
        const pressing = hRate > aRate ? home : away;
        const shotCount = hRate > aRate ? hRate : aRate;
        this._emit(matchId,
          `⚡ ${pressing} tấn công dồn dập! ${shotCount} pha dứt điểm trong vài phút qua.`,
          'normal', 'insight');
      }
    }

    // Possession shift
    const poss = currentStats['Ball possession'] || currentStats['ballPossession'];
    if (poss) {
      const hPoss = parseFloat(poss.home) || 50;
      if (hPoss >= 68) {
        this._emit(matchId,
          `📊 ${home} kiểm soát bóng áp đảo ${hPoss}%. Đối thủ gần như không chạm bóng. Xu hướng: ${home} sẽ ghi bàn.`,
          'normal', 'insight');
      } else if (hPoss <= 32) {
        this._emit(matchId,
          `📊 ${away} hoàn toàn làm chủ thế trận với ${100 - hPoss}% kiểm soát bóng.`,
          'normal', 'insight');
      }
    }

    // Foul escalation
    const fouls = velocity['Fouls'] || velocity['fouls'];
    if (fouls) {
      const totalFouls = (fouls.homeDiff || 0) + (fouls.awayDiff || 0);
      if (totalFouls >= 4) {
        this._emit(matchId,
          `⚠️ Trận đấu nóng lên! ${totalFouls} pha phạm lỗi gần đây. Nguy cơ thẻ phạt cao.`,
          'normal', 'insight');
      }
    }

    // Narrative arc update
    this._updateNarrative(matchId, d);
  }

  // ═══════════════════════════════════════
  // Layer 3: Narrative Arcs
  // ═══════════════════════════════════════

  _updateNarrative(matchId, d) {
    const state = this.matchNarrative.get(matchId) || { arc: 'balanced', lastNarrative: 0 };
    if (Date.now() - state.lastNarrative < 120000) return; // Max 1 narrative per 2 min

    const poss = d.currentStats['Ball possession'] || d.currentStats['ballPossession'];
    const shots = d.currentStats['Total shots'] || d.currentStats['totalShots'];
    const hPoss = parseFloat(poss?.home) || 50;
    const hShots = parseInt(shots?.home) || 0;
    const aShots = parseInt(shots?.away) || 0;

    let newArc = state.arc;

    if (hPoss > 62 && hShots > aShots * 1.8) newArc = 'home_domination';
    else if (hPoss < 38 && aShots > hShots * 1.8) newArc = 'away_domination';
    else if (Math.abs(hPoss - 50) < 8 && Math.abs(hShots - aShots) <= 2) newArc = 'tight';
    else newArc = 'balanced';

    if (newArc !== state.arc) {
      const narratives = {
        home_domination: `📝 ${d.home} hoàn toàn áp đảo thế trận. ${hPoss}% kiểm soát, ${hShots} pha sút. Bàn thắng chỉ là vấn đề thời gian.`,
        away_domination: `📝 ${d.away} đang kiểm soát hoàn toàn trận đấu. ${d.home} gần như không thể thoát ra.`,
        tight: `📝 Trận đấu rất cân bằng và căng thẳng. Cả hai đội đều thận trọng. Một khoảnh khắc cá nhân có thể quyết định tất cả.`,
        balanced: `📝 Thế trận mở rộng, cả hai đội đều có cơ hội. Trận đấu hứa hẹn nhiều bàn thắng.`,
      };
      this._emit(matchId, narratives[newArc] || '', 'normal', 'narrative');
      state.arc = newArc;
      state.lastNarrative = Date.now();
      this.matchNarrative.set(matchId, state);
    }
  }

  // Cleanup finished matches after 10 min
  _cleanup(matchId) {
    setTimeout(() => {
      this.commentaryLog.delete(matchId);
      this.matchNarrative.delete(matchId);
      this.matchContext.delete(matchId);
      this.matchIncidentSummary.delete(matchId);
    }, 600000);
  }

  _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
}

module.exports = new CommentaryEngine();
