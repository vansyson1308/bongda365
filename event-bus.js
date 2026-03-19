// Event Bus - Central nervous system of BongDa365
// All modules subscribe here. Events flow: SofaScore -> Detector -> Bus -> [Commentary, Chat, Predictions, UI]

const EventEmitter = require('events');

class MatchEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.eventLog = []; // Recent events for new clients
    this.MAX_LOG = 200;
  }

  // Emit and log
  fire(type, data) {
    const event = { type, data, ts: Date.now() };
    this.eventLog.push(event);
    if (this.eventLog.length > this.MAX_LOG) this.eventLog.shift();
    this.emit(type, data);
    this.emit('*', event); // Wildcard listener for broadcasting
  }

  // Get recent events for a match
  getRecent(matchId, limit = 20) {
    return this.eventLog
      .filter(e => !matchId || e.data?.matchId === matchId)
      .slice(-limit);
  }
}

module.exports = new MatchEventBus(); // Singleton
