// Event Detector - Diffs SofaScore data between polls to detect match events
// Emits: goal, card, red_card, halftime, fulltime, kickoff, stat_update

const bus = require('./event-bus');

class EventDetector {
  constructor() {
    this.prev = new Map(); // matchId -> snapshot
    this.incidentCache = new Map(); // matchId -> Set of incident keys
    this.statHistory = new Map(); // matchId -> [{stats, ts}] ring buffer
  }

  // Called every poll with new live events from SofaScore
  process(events) {
    const liveIds = new Set();

    for (const e of events) {
      const id = e.id;
      liveIds.add(id);

      const hs = e.homeScore?.current ?? null;
      const as = e.awayScore?.current ?? null;
      const status = e.status?.type || '';
      const desc = e.status?.description || '';
      const home = e.homeTeam?.shortName || e.homeTeam?.name || '?';
      const away = e.awayTeam?.shortName || e.awayTeam?.name || '?';
      const homeId = e.homeTeam?.id;
      const awayId = e.awayTeam?.id;
      const league = e.tournament?.uniqueTournament?.name || e.tournament?.name || '';
      const minute = this._calcMinute(e);

      const snap = { hs, as, status, desc, home, away, homeId, awayId, league, minute };
      const old = this.prev.get(id);

      if (!old) {
        // New match appeared
        if (status === 'inprogress') {
          bus.fire('kickoff', { matchId: id, home, away, homeId, awayId, league, minute });
        }
        this.prev.set(id, snap);
        continue;
      }

      // ── Score change = GOAL ──
      if (hs !== null && as !== null) {
        if (old.hs !== null && (hs !== old.hs || as !== old.as)) {
          const scoringTeam = hs > old.hs ? 'home' : 'away';
          const teamName = scoringTeam === 'home' ? home : away;
          bus.fire('goal', {
            matchId: id, team: scoringTeam, teamName, minute,
            home, away, homeId, awayId, league,
            score: { home: hs, away: as },
            prevScore: { home: old.hs, away: old.as },
          });
        }
      }

      // ── Status transitions ──
      if (old.status !== status || old.desc !== desc) {
        const dl = desc.toLowerCase();
        if (dl.includes('halftime') || dl === 'ht') {
          bus.fire('halftime', { matchId: id, home, away, score: { home: hs, away: as }, league });
        }
        if (old.desc?.toLowerCase().includes('halftime') && dl.includes('2nd')) {
          bus.fire('secondhalf', { matchId: id, home, away, league });
        }
        if (status === 'finished' && old.status !== 'finished') {
          const winner = hs > as ? home : as > hs ? away : null;
          bus.fire('fulltime', { matchId: id, home, away, homeId, awayId, league, score: { home: hs, away: as }, winner });
        }
      }

      this.prev.set(id, snap);
    }

    // Clean up finished/disappeared matches after a while
    for (const [id, snap] of this.prev) {
      if (!liveIds.has(id) && snap.status === 'finished') {
        // Keep for 5 minutes then remove
        if (!snap._removeAt) snap._removeAt = Date.now() + 300000;
        if (Date.now() > snap._removeAt) {
          this.prev.delete(id);
          this.incidentCache.delete(id);
          this.statHistory.delete(id);
        }
      }
    }

    return liveIds;
  }

  // Process incidents for a specific match (fetched separately)
  processIncidents(matchId, incidents) {
    const cached = this.incidentCache.get(matchId) || new Set();
    const snap = this.prev.get(matchId);
    if (!snap) return;

    for (const inc of incidents) {
      if (!inc.incidentType || !inc.time) continue;
      const key = `${inc.incidentType}_${inc.time}_${inc.isHome}_${inc.player?.id || inc.playerName || ''}`;

      if (!cached.has(key)) {
        cached.add(key);

        if (inc.incidentType === 'card') {
          const isRed = inc.incidentClass === 'red' || inc.incidentClass === 'yellowred';
          const player = inc.playerName || inc.player?.shortName || inc.player?.name || '';
          const team = inc.isHome ? snap.home : snap.away;
          const eventType = isRed ? 'red_card' : 'card';

          bus.fire(eventType, {
            matchId, team, player, minute: inc.time,
            cardType: inc.incidentClass, reason: inc.reason || '',
            home: snap.home, away: snap.away, league: snap.league,
          });
        }

        if (inc.incidentType === 'substitution') {
          bus.fire('substitution', {
            matchId,
            team: inc.isHome ? snap.home : snap.away,
            playerIn: inc.playerIn?.shortName || '',
            playerOut: inc.playerOut?.shortName || '',
            minute: inc.time,
            home: snap.home, away: snap.away,
          });
        }

        if (inc.incidentType === 'varDecision') {
          bus.fire('var', {
            matchId, decision: inc.incidentClass,
            confirmed: inc.confirmed, minute: inc.time,
            home: snap.home, away: snap.away,
          });
        }
      }
    }

    this.incidentCache.set(matchId, cached);
  }

  // Process stats and track velocity
  processStats(matchId, stats) {
    const history = this.statHistory.get(matchId) || [];
    const entry = { ts: Date.now(), stats: {} };

    for (const s of stats) {
      entry.stats[s.key || s.name] = { home: s.homeValue || s.home, away: s.awayValue || s.away };
    }

    history.push(entry);
    if (history.length > 12) history.shift(); // ~60s of data at 5s intervals
    this.statHistory.set(matchId, history);

    // Calculate velocity (rate of change over last ~60s)
    if (history.length >= 3) {
      const oldest = history[0];
      const newest = history[history.length - 1];
      const dtMin = (newest.ts - oldest.ts) / 60000; // minutes
      if (dtMin > 0) {
        const velocity = {};
        for (const key of Object.keys(newest.stats)) {
          if (oldest.stats[key]) {
            const hDiff = (parseFloat(newest.stats[key].home) || 0) - (parseFloat(oldest.stats[key].home) || 0);
            const aDiff = (parseFloat(newest.stats[key].away) || 0) - (parseFloat(oldest.stats[key].away) || 0);
            if (hDiff !== 0 || aDiff !== 0) {
              velocity[key] = { home: hDiff / dtMin, away: aDiff / dtMin, homeDiff: hDiff, awayDiff: aDiff };
            }
          }
        }

        const snap = this.prev.get(matchId);
        if (snap && Object.keys(velocity).length > 0) {
          bus.fire('stat_update', {
            matchId, velocity, currentStats: newest.stats,
            home: snap.home, away: snap.away, league: snap.league,
            minute: snap.minute,
          });
        }
      }
    }
  }

  _calcMinute(e) {
    const st = e.status || {};
    if (st.type !== 'inprogress' || !e.time?.currentPeriodStartTimestamp) return null;
    const elapsed = Math.floor((Date.now() / 1000 - e.time.currentPeriodStartTimestamp) / 60);
    const desc = (st.description || '').toLowerCase();
    if (desc.includes('2nd')) return 45 + Math.max(0, elapsed);
    if (desc.includes('extra')) return 90 + Math.max(0, elapsed);
    return Math.max(0, elapsed);
  }

  // Get live match IDs for incident polling
  getLiveMatchIds() {
    const ids = [];
    for (const [id, snap] of this.prev) {
      if (snap.status === 'inprogress') ids.push(id);
    }
    return ids;
  }
}

module.exports = new EventDetector();
