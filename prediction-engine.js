// Prediction Engine - Real-time Polymarket-style probability updates
// Updates on every match event + periodic stat analysis

const bus = require('./event-bus');

class PredictionEngine {
  constructor() {
    this.predictions = new Map(); // matchId -> {homeWin, draw, awayWin, overGoals, btts, nextGoal, overCorners, overCards}
    this.lines = new Map(); // matchId -> {goalLine, cornerLine, cardLine}
    this.history = new Map(); // matchId -> [{ts, hp, dp, ap, event?}]
    this.onUpdate = null;
  }

  start(broadcastFn) {
    this.onUpdate = broadcastFn;

    bus.on('goal', d => this._onGoal(d));
    bus.on('red_card', d => this._onRedCard(d));
    bus.on('halftime', d => this._recalc(d.matchId));
    bus.on('fulltime', d => { setTimeout(() => { this.predictions.delete(d.matchId); this.history.delete(d.matchId); this.lines.delete(d.matchId); }, 600000); });
    bus.on('stat_update', d => this._onStats(d));
    bus.on('kickoff', d => this._initMatch(d));
  }

  get(matchId) {
    return this.predictions.get(matchId) || this._default();
  }

  setLines(matchId, lines) {
    this.lines.set(matchId, lines);
    // Update existing predictions with new lines
    const p = this.predictions.get(matchId);
    if (p) {
      p.goalLine = lines.goalLine;
      p.cornerLine = lines.cornerLine;
      p.cardLine = lines.cardLine;
      this._broadcast(matchId);
    }
  }

  _default() {
    return { homeWin: 33, draw: 34, awayWin: 33, overGoals: 50, btts: 45, nextGoalHome: 50, overCorners: 50, overCards: 50, goalLine: 2.5, cornerLine: 8.5, cardLine: 3.5 };
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

    // Over/Under (dynamic line from bookmaker odds)
    const lines = this.lines.get(d.matchId) || { goalLine: 2.5 };
    const goalLine = lines.goalLine || 2.5;
    const goalRate = total / Math.max(1, 90 - remaining);
    p.overGoals = total > goalLine ? 100 : Math.min(92, Math.round(goalRate * 90 * 20 + (total / goalLine) * 40));
    p.goalLine = goalLine;

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
    p.overCards = Math.min(90, p.overCards + 15);

    this.predictions.set(d.matchId, p);
    this._broadcast(d.matchId);
  }

  _onStats(d) {
    const p = this.predictions.get(d.matchId) || this._default();
    const { currentStats, velocity, minute } = d;
    const lines = this.lines.get(d.matchId) || {};

    // Corners prediction (dynamic line)
    const corners = currentStats['Corner kicks'] || currentStats['cornerKicks'];
    if (corners) {
      const cornerLine = lines.cornerLine || 8.5;
      const totalCorners = (parseInt(corners.home) || 0) + (parseInt(corners.away) || 0);
      const remaining = Math.max(1, 90 - (minute || 45));
      const projectedCorners = totalCorners + (totalCorners / Math.max(1, minute || 1)) * remaining;
      p.overCorners = Math.min(95, Math.round(projectedCorners > cornerLine ? 60 + (projectedCorners - cornerLine) * 8 : 30 + projectedCorners * 3));
      p.cornerLine = cornerLine;
    }

    // Cards prediction (dynamic line)
    const yellows = currentStats['Yellow cards'] || currentStats['yellowCards'];
    if (yellows) {
      const cardLine = lines.cardLine || 3.5;
      const totalCards = (parseInt(yellows.home) || 0) + (parseInt(yellows.away) || 0);
      const remaining = Math.max(1, 90 - (minute || 45));
      const projectedCards = totalCards + (totalCards / Math.max(1, minute || 1)) * remaining;
      p.overCards = Math.min(95, Math.round(projectedCards > cardLine ? 55 + (projectedCards - cardLine) * 10 : 25 + projectedCards * 8));
      p.cardLine = cardLine;
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

  getHistory(matchId) {
    return this.history.get(matchId) || [];
  }

  // Simulate a hypothetical event without broadcasting
  simulate(matchId, fakeEvent) {
    const p = { ...this.get(matchId) };
    const lines = this.lines.get(matchId) || { goalLine: 2.5 };
    if (fakeEvent === 'home_goal') {
      const total = Math.round((p.overGoals / 30) + 1); // approximate
      p.homeWin = Math.min(95, p.homeWin + 15);
      p.awayWin = Math.max(3, p.awayWin - 10);
      p.draw = 100 - p.homeWin - p.awayWin;
      p.overGoals = Math.min(95, p.overGoals + 20);
    } else if (fakeEvent === 'away_goal') {
      p.awayWin = Math.min(95, p.awayWin + 15);
      p.homeWin = Math.max(3, p.homeWin - 10);
      p.draw = 100 - p.homeWin - p.awayWin;
      p.overGoals = Math.min(95, p.overGoals + 20);
    } else if (fakeEvent === 'home_red') {
      p.homeWin = Math.max(5, p.homeWin - 18);
      p.awayWin = Math.min(85, p.awayWin + 12);
      p.draw = 100 - p.homeWin - p.awayWin;
    } else if (fakeEvent === 'away_red') {
      p.awayWin = Math.max(5, p.awayWin - 18);
      p.homeWin = Math.min(85, p.homeWin + 12);
      p.draw = 100 - p.homeWin - p.awayWin;
    }
    // Normalize
    const s = p.homeWin + p.draw + p.awayWin;
    if (s !== 100) { const f = 100 / s; p.homeWin = Math.round(p.homeWin * f); p.awayWin = Math.round(p.awayWin * f); p.draw = 100 - p.homeWin - p.awayWin; }
    return p;
  }

  _broadcast(matchId) {
    const p = this.get(matchId);
    if (!this.onUpdate) return;

    // Track history
    const h = this.history.get(matchId) || [];
    const entry = { ts: Date.now(), hp: p.homeWin, dp: p.draw, ap: p.awayWin };

    // Detect turning point (>15% shift)
    if (h.length > 0) {
      const prev = h[h.length - 1];
      const shift = Math.abs(p.homeWin - prev.hp);
      if (shift > 15) {
        entry.turningPoint = true;
        bus.fire('turning_point', { matchId, before: prev, after: { hp: p.homeWin, dp: p.draw, ap: p.awayWin }, shift });
      }
    }

    h.push(entry);
    if (h.length > 180) h.shift(); // max ~15 min at 5s intervals
    this.history.set(matchId, h);

    this.onUpdate({ matchId, predictions: p, ts: Date.now() });
  }
}

module.exports = new PredictionEngine();
