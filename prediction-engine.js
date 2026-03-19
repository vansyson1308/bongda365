// Prediction Engine - Real-time Polymarket-style probability updates
// Updates on every match event + periodic stat analysis

const bus = require('./event-bus');

class PredictionEngine {
  constructor() {
    this.predictions = new Map(); // matchId -> {homeWin, draw, awayWin, over25, btts, nextGoal, corners, cards}
    this.onUpdate = null;
  }

  start(broadcastFn) {
    this.onUpdate = broadcastFn;

    bus.on('goal', d => this._onGoal(d));
    bus.on('red_card', d => this._onRedCard(d));
    bus.on('halftime', d => this._recalc(d.matchId));
    bus.on('fulltime', d => { setTimeout(() => this.predictions.delete(d.matchId), 600000); });
    bus.on('stat_update', d => this._onStats(d));
    bus.on('kickoff', d => this._initMatch(d));
  }

  get(matchId) {
    return this.predictions.get(matchId) || this._default();
  }

  _default() {
    return { homeWin: 33, draw: 34, awayWin: 33, over25: 50, btts: 45, nextGoalHome: 50, cornersOver85: 50, cardsOver35: 50 };
  }

  _initMatch(d) {
    this.predictions.set(d.matchId, this._default());
    this._broadcast(d.matchId);
  }

  _onGoal(d) {
    const p = this.predictions.get(d.matchId) || this._default();
    const { score, minute } = d;
    const diff = score.home - score.away;
    const total = score.home + score.away;
    const remaining = Math.max(1, 90 - (minute || 45));

    // Win probability shift based on lead + time remaining
    if (diff > 0) {
      const leadBonus = Math.min(40, diff * 15 + (90 - remaining) * 0.3);
      p.homeWin = Math.min(95, 50 + leadBonus);
      p.awayWin = Math.max(2, 50 - leadBonus - 10);
      p.draw = 100 - p.homeWin - p.awayWin;
    } else if (diff < 0) {
      const leadBonus = Math.min(40, Math.abs(diff) * 15 + (90 - remaining) * 0.3);
      p.awayWin = Math.min(95, 50 + leadBonus);
      p.homeWin = Math.max(2, 50 - leadBonus - 10);
      p.draw = 100 - p.homeWin - p.awayWin;
    } else {
      p.draw = Math.min(50, 25 + remaining * 0.15);
      p.homeWin = (100 - p.draw) / 2;
      p.awayWin = p.homeWin;
    }

    // Over/Under
    const goalRate = total / Math.max(1, 90 - remaining);
    p.over25 = total >= 3 ? 100 : Math.min(92, Math.round(goalRate * 90 * 20 + total * 15));

    // BTTS
    p.btts = (score.home > 0 && score.away > 0) ? 100 : Math.min(75, p.btts + 5);

    // Next goal
    if (d.team === 'home') {
      p.nextGoalHome = Math.min(65, p.nextGoalHome + 5); // Momentum
    } else {
      p.nextGoalHome = Math.max(35, p.nextGoalHome - 5);
    }

    this.predictions.set(d.matchId, p);
    this._broadcast(d.matchId);
  }

  _onRedCard(d) {
    const p = this.predictions.get(d.matchId) || this._default();
    // Red card: affected team's win probability drops ~20%
    if (d.team === d.home) {
      p.homeWin = Math.max(5, p.homeWin - 18);
      p.awayWin = Math.min(85, p.awayWin + 12);
      p.draw += 6;
      p.nextGoalHome = Math.max(25, p.nextGoalHome - 12);
    } else {
      p.awayWin = Math.max(5, p.awayWin - 18);
      p.homeWin = Math.min(85, p.homeWin + 12);
      p.draw += 6;
      p.nextGoalHome = Math.min(75, p.nextGoalHome + 12);
    }
    p.cardsOver35 = Math.min(90, p.cardsOver35 + 15);

    this.predictions.set(d.matchId, p);
    this._broadcast(d.matchId);
  }

  _onStats(d) {
    const p = this.predictions.get(d.matchId) || this._default();
    const { currentStats, velocity, minute } = d;

    // Corners prediction
    const corners = currentStats['Corner kicks'] || currentStats['cornerKicks'];
    if (corners) {
      const totalCorners = (parseInt(corners.home) || 0) + (parseInt(corners.away) || 0);
      const remaining = Math.max(1, 90 - (minute || 45));
      const projectedCorners = totalCorners + (totalCorners / Math.max(1, minute || 1)) * remaining;
      p.cornersOver85 = Math.min(95, Math.round(projectedCorners > 8.5 ? 60 + (projectedCorners - 8.5) * 8 : 30 + projectedCorners * 3));
    }

    // Cards prediction
    const yellows = currentStats['Yellow cards'] || currentStats['yellowCards'];
    if (yellows) {
      const totalCards = (parseInt(yellows.home) || 0) + (parseInt(yellows.away) || 0);
      const remaining = Math.max(1, 90 - (minute || 45));
      const projectedCards = totalCards + (totalCards / Math.max(1, minute || 1)) * remaining;
      p.cardsOver35 = Math.min(95, Math.round(projectedCards > 3.5 ? 55 + (projectedCards - 3.5) * 10 : 25 + projectedCards * 8));
    }

    // Possession-based win adjustment (gentle)
    const poss = currentStats['Ball possession'] || currentStats['ballPossession'];
    if (poss) {
      const hPoss = parseFloat(poss.home) || 50;
      if (hPoss > 60) { p.homeWin = Math.min(p.homeWin + 2, 80); p.awayWin = Math.max(p.awayWin - 1, 5); }
      if (hPoss < 40) { p.awayWin = Math.min(p.awayWin + 2, 80); p.homeWin = Math.max(p.homeWin - 1, 5); }
    }

    // Normalize
    const total = p.homeWin + p.draw + p.awayWin;
    if (total !== 100) {
      const f = 100 / total;
      p.homeWin = Math.round(p.homeWin * f);
      p.awayWin = Math.round(p.awayWin * f);
      p.draw = 100 - p.homeWin - p.awayWin;
    }

    this.predictions.set(d.matchId, p);
    this._broadcast(d.matchId);
  }

  _recalc(matchId) {
    this._broadcast(matchId);
  }

  _broadcast(matchId) {
    if (this.onUpdate) {
      this.onUpdate({ matchId, predictions: this.get(matchId), ts: Date.now() });
    }
  }
}

module.exports = new PredictionEngine();
