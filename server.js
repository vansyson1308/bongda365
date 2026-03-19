// BongDa365 Server - Event Bus Architecture
// SofaScore -> Detector -> Bus -> [Commentary, Predictions, Chat, UI]

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server: SocketIO } = require('socket.io');
const bus = require('./event-bus');
const detector = require('./event-detector');
const commentary = require('./commentary-engine');
const predictions = require('./prediction-engine');

const PORT = process.env.PORT || 3000;
const POLL_MS = 5000;
const INCIDENT_POLL_MS = 15000; // Fetch incidents every 15s
const STAT_POLL_MS = 30000; // Fetch stats every 30s
const MIME = { '.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.jpg':'image/jpeg','.gif':'image/gif','.woff2':'font/woff2' };

// ── HTTP Server ──
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Cached live data (instant)
  if (req.url === '/api/v1/sport/football/events/live' && cachedLive) {
    res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'public, max-age=3' });
    res.end(cachedLive);
    return;
  }

  // Commentary log endpoint
  if (req.url.startsWith('/api/commentary/')) {
    const matchId = parseInt(req.url.split('/').pop());
    const log = commentary.getLog(matchId);
    res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8' });
    res.end(JSON.stringify(log));
    return;
  }

  // Predictions endpoint
  if (req.url.startsWith('/api/predictions/')) {
    const matchId = parseInt(req.url.split('/').pop());
    const pred = predictions.get(matchId);
    res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8' });
    res.end(JSON.stringify(pred));
    return;
  }

  // Proxy API
  if (req.url.startsWith('/api/')) {
    try {
      const result = await fetchSofa(req.url);
      if (!result) { res.writeHead(304); res.end(); return; }
      const isImg = req.url.includes('/image');
      const ct = result.headers['content-type'] || (isImg ? 'image/png' : 'application/json');
      res.writeHead(result.status, { 'Content-Type':ct, 'Access-Control-Allow-Origin':'*', 'Cache-Control':isImg?'public, max-age=86400':'public, max-age=10' });
      res.end(result.body);
    } catch (e) {
      res.writeHead(502, { 'Content-Type':'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Static files (with path traversal protection)
  let fp = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  fp = path.join(__dirname, fp);
  if (!fp.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ── Socket.io ──
const io = new SocketIO(server, { cors: { origin: '*' } });

io.on('connection', socket => {
  // Join match room
  socket.on('join_match', matchId => {
    socket.join(`match_${matchId}`);
    // Send recent events for this match
    const recent = bus.getRecent(matchId, 20);
    socket.emit('recent_events', recent);
    const log = commentary.getLog(matchId);
    socket.emit('commentary_log', log);
    const pred = predictions.get(matchId);
    socket.emit('predictions', { matchId, predictions: pred });
  });

  socket.on('leave_match', matchId => socket.leave(`match_${matchId}`));

  // Chat
  socket.on('chat_msg', data => {
    if (!data.matchId || !data.text || data.text.length > 500) return;
    const msg = {
      user: (data.user || 'Ẩn danh').slice(0, 20).replace(/[<>&"']/g, ''),
      text: data.text.replace(/[<>&"']/g, ''), // sanitize HTML
      ts: Date.now(),
      isMascot: false,
    };
    io.to(`match_${data.matchId}`).emit('chat_msg', msg);
  });

  // Emoji reaction
  socket.on('reaction', data => {
    if (!data.matchId || !data.emoji) return;
    io.to(`match_${data.matchId}`).emit('reaction', { emoji: data.emoji, ts: Date.now() });
  });
});

// ── Broadcast: Bus events -> Socket.io ──
bus.on('*', event => {
  const matchId = event.data?.matchId;
  if (matchId) {
    io.to(`match_${matchId}`).emit('match_event', event);
  }
  // Also broadcast to all for live page
  io.emit('live_event', event);
});

// Commentary -> Socket.io
commentary.start(entry => {
  io.to(`match_${entry.matchId}`).emit('commentary', entry);
  io.emit('commentary_global', entry); // For ticker

  // Mascot auto-post in chat for critical events
  if (entry.priority === 'critical') {
    io.to(`match_${entry.matchId}`).emit('chat_msg', {
      user: '🐴 Ngựa Tiên Tri',
      text: entry.text,
      ts: Date.now(),
      isMascot: true,
    });
  }
});

// Predictions -> Socket.io
predictions.start(data => {
  io.to(`match_${data.matchId}`).emit('predictions', data);
});

// ── SofaScore Polling ──
let cachedLive = null;

// Rotate User-Agents to avoid Cloudflare fingerprinting
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
];
let uaIdx = 0;

function fetchSofa(urlPath) {
  return new Promise((resolve, reject) => {
    const ua = USER_AGENTS[uaIdx++ % USER_AGENTS.length];
    const opts = {
      hostname: 'api.sofascore.com',
      path: urlPath,
      headers: {
        'User-Agent': ua,
        'Accept': 'application/json, image/*, */*',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.sofascore.com/',
        'Origin': 'https://www.sofascore.com',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Sec-CH-UA': '"Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
      },
    };
    const req = https.get(opts, res => {
      if (res.statusCode === 304) { resolve(null); return; }

      // Handle gzip/br compressed responses
      const encoding = res.headers['content-encoding'];
      let stream = res;
      if (encoding === 'gzip') {
        const zlib = require('zlib');
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'br') {
        const zlib = require('zlib');
        stream = res.pipe(zlib.createBrotliDecompress());
      } else if (encoding === 'deflate') {
        const zlib = require('zlib');
        stream = res.pipe(zlib.createInflate());
      }

      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Main live poll - every 5s
async function pollLive() {
  try {
    const result = await fetchSofa('/api/v1/sport/football/events/live');
    if (!result || result.status !== 200) return;

    const body = result.body.toString();
    if (body === cachedLive) return; // No change
    cachedLive = body;

    const data = JSON.parse(body);
    const events = data.events || [];

    // Run event detection (emits to bus)
    detector.process(events);

    // Notify all clients to refresh
    io.emit('live_update', { ts: Date.now(), count: events.length });
  } catch (e) { /* silent */ }
}

// Incident poll - cycle through live matches
let incidentIdx = 0;

async function pollIncidents() {
  const liveIds = detector.getLiveMatchIds();
  if (!liveIds.length) return;

  // Fetch 2-3 matches per cycle to avoid rate limiting
  const batch = liveIds.slice(incidentIdx, incidentIdx + 3);
  incidentIdx = (incidentIdx + 3) % Math.max(1, liveIds.length);

  for (const matchId of batch) {
    try {
      const result = await fetchSofa(`/api/v1/event/${matchId}/incidents`);
      if (result && result.status === 200) {
        const data = JSON.parse(result.body.toString());
        const incidents = (data.incidents || []).filter(i =>
          ['goal', 'card', 'substitution', 'varDecision'].includes(i.incidentType));
        detector.processIncidents(matchId, incidents);
      }
    } catch { /* skip */ }
  }
}

// Stats poll - for commentary velocity analysis
let statIdx = 0;

async function pollStats() {
  const liveIds = detector.getLiveMatchIds();
  if (!liveIds.length) return;

  // 1-2 matches per cycle
  const batch = liveIds.slice(statIdx, statIdx + 2);
  statIdx = (statIdx + 2) % Math.max(1, liveIds.length);

  for (const matchId of batch) {
    try {
      const result = await fetchSofa(`/api/v1/event/${matchId}/statistics`);
      if (result && result.status === 200) {
        const data = JSON.parse(result.body.toString());
        const all = data.statistics?.find(s => s.period === 'ALL');
        if (all) {
          const stats = [];
          (all.groups || []).forEach(g => {
            (g.statisticsItems || []).forEach(s => {
              stats.push({ name: s.name, key: s.key, home: s.home, away: s.away, homeValue: s.homeValue, awayValue: s.awayValue });
            });
          });
          detector.processStats(matchId, stats);
        }
      }
    } catch { /* skip */ }
  }
}

// Start all poll loops
setInterval(pollLive, POLL_MS);
setInterval(pollIncidents, INCIDENT_POLL_MS);
setInterval(pollStats, STAT_POLL_MS);
pollLive();

// ── Start ──
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n  ⚠️  Port ${PORT} đang bị chiếm. Đang thử kill process cũ...`);
    const { execSync } = require('child_process');
    try {
      // Windows: find and kill process on port
      execSync(`powershell -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' });
    } catch {}
    setTimeout(() => {
      console.log('  🔄 Thử khởi động lại...');
      server.listen(PORT);
    }, 1500);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ⚽ BongDa365 v3.0 - http://localhost:${PORT}

  Architecture: Event Bus + SPA Router
    SofaScore ──→ Detector ──→ Event Bus ──→ Commentary Engine
                                          ──→ Prediction Engine
                                          ──→ Socket.io (Chat + UI)
                                          ──→ Ngựa Tiên Tri (Mascot)

  Pages: Live | Match Detail | League | Team | Player | Search
  Poll: Live ${POLL_MS/1000}s | Incidents ${INCIDENT_POLL_MS/1000}s | Stats ${STAT_POLL_MS/1000}s
  Features: AI Commentary | Predictions | Chat | Viral Cards
  `);
});
