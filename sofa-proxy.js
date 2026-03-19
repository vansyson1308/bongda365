// BongDa365 - Local SofaScore API Proxy
// Runs on your local machine, exposed via Cloudflare Tunnel
// Your home IP is not blocked by SofaScore's Cloudflare

const http = require('http');
const https = require('https');
const zlib = require('zlib');

const PORT = 3001;
const ALLOWED_ORIGINS = [
  'https://bongda365.onrender.com',
  'https://bongda365.xyz',
  'https://www.bongda365.xyz',
  'http://localhost:3000',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
];
let uaIdx = 0;

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 15000; // 15s for live data
const CACHE_TTL_STATIC = 300000; // 5min for static data (teams, players, standings)

function getCacheTTL(path) {
  if (path.includes('/events/live')) return CACHE_TTL;
  if (path.includes('/image')) return 86400000; // 24h for images
  if (path.includes('/team/') || path.includes('/player/') || path.includes('/standings')) return CACHE_TTL_STATIC;
  return CACHE_TTL;
}

const server = http.createServer((req, res) => {
  // CORS
  const origin = req.headers.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.find(o => origin.startsWith(o)) || ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Only allow /api/ paths
  if (!req.url.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('BongDa365 SofaScore Proxy - OK');
    return;
  }

  // Check cache
  const cached = cache.get(req.url);
  if (cached && Date.now() - cached.ts < getCacheTTL(req.url)) {
    const isImg = req.url.includes('/image');
    res.writeHead(200, {
      'Content-Type': isImg ? (cached.ct || 'image/png') : 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': allowedOrigin,
      'Cache-Control': isImg ? 'public, max-age=86400' : 'public, max-age=10',
      'X-Cache': 'HIT',
    });
    res.end(cached.body);
    return;
  }

  // Fetch from SofaScore
  const ua = USER_AGENTS[uaIdx++ % USER_AGENTS.length];
  const opts = {
    hostname: 'api.sofascore.com',
    path: req.url,
    headers: {
      'User-Agent': ua,
      'Accept': 'application/json, image/*, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.sofascore.com/',
      'Origin': 'https://www.sofascore.com',
      'Cache-Control': 'no-cache',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
    },
  };

  const proxyReq = https.get(opts, proxyRes => {
    // Decompress
    const encoding = proxyRes.headers['content-encoding'];
    let stream = proxyRes;
    if (encoding === 'gzip') stream = proxyRes.pipe(zlib.createGunzip());
    else if (encoding === 'br') stream = proxyRes.pipe(zlib.createBrotliDecompress());
    else if (encoding === 'deflate') stream = proxyRes.pipe(zlib.createInflate());

    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => {
      const body = Buffer.concat(chunks);
      const isImg = req.url.includes('/image');
      const ct = proxyRes.headers['content-type'] || (isImg ? 'image/png' : 'application/json');

      // Cache successful responses
      if (proxyRes.statusCode === 200) {
        cache.set(req.url, { body, ct, ts: Date.now() });
        // Evict old cache entries
        if (cache.size > 500) {
          const now = Date.now();
          for (const [k, v] of cache) {
            if (now - v.ts > getCacheTTL(k) * 2) cache.delete(k);
            if (cache.size <= 300) break;
          }
        }
      }

      res.writeHead(proxyRes.statusCode, {
        'Content-Type': ct,
        'Access-Control-Allow-Origin': allowedOrigin,
        'Cache-Control': isImg ? 'public, max-age=86400' : 'public, max-age=10',
        'X-Cache': 'MISS',
      });
      res.end(body);
    });
    stream.on('error', () => {
      res.writeHead(502); res.end('Proxy stream error');
    });
  });

  proxyReq.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  });
  proxyReq.setTimeout(15000, () => { proxyReq.destroy(); });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🔌 BongDa365 SofaScore Proxy
  http://localhost:${PORT}

  This proxy runs on your local machine (home IP).
  Expose via Cloudflare Tunnel:
    cloudflared tunnel --url http://localhost:${PORT}

  Then set SOFA_PROXY_URL on Render to the tunnel URL.
  `);
});
