// BongDa365 — Cloudflare Worker SofaScore Proxy (v3)
// Deploy: npx wrangler deploy
//
// KEY INSIGHT: api.sofascore.app (mobile API) runs on plain nginx, NOT behind
// Cloudflare's bot detection. Same data format, same endpoints, CORS wide open.
// api.sofascore.com uses Cloudflare WAF → blocks Workers, datacenter IPs, etc.
//
// This Worker uses api.sofascore.app as primary, api.sofascore.com as fallback.

const ALLOWED_ORIGINS = [
  'https://bongda365.onrender.com',
  'https://bongda365.xyz',
  'https://www.bongda365.xyz',
  'http://localhost:3000',
];

// ── API targets (ordered by reliability) ──
const API_TARGETS = [
  {
    name: 'sofascore-app',
    base: 'https://api.sofascore.app',
    // Mobile API: no Cloudflare, no bot detection, CORS: *
    headers: (ua, isImg) => ({
      'User-Agent': ua,
      'Accept': isImg ? 'image/*,*/*' : 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    }),
  },
  {
    name: 'sofascore-com',
    base: 'https://api.sofascore.com',
    // Main API: behind Cloudflare — DON'T send Origin/Referer (CF detects spoofing from Workers)
    headers: (ua, isImg) => ({
      'User-Agent': ua,
      'Accept': isImg ? 'image/*,*/*' : 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    }),
  },
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
];
let uaIdx = 0;

// ── Request coalescing ──
const inflight = new Map();

// ── Rate limiting ──
const RATE_LIMIT = 300;
const rateCounts = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  let entry = rateCounts.get(key);
  if (!entry || now - entry.ts > 60000) {
    entry = { count: 0, ts: now };
    rateCounts.set(key, entry);
  }
  entry.count++;
  if (rateCounts.size > 1000) {
    for (const [k, v] of rateCounts) {
      if (now - v.ts > 60000) rateCounts.delete(k);
      if (rateCounts.size <= 500) break;
    }
  }
  return entry.count <= RATE_LIMIT;
}

// ── Stats ──
let stats = { total: 0, ok: 0, errors: 0, coalesced: 0, rateLimited: 0, byTarget: {}, startTime: Date.now() };

function getCacheTtl(pathname, isImg) {
  if (isImg) return 86400;
  if (pathname.includes('/events/live')) return 5;
  if (pathname.includes('/standings') || pathname.includes('/seasons')) return 300;
  if (pathname.includes('/team/') || pathname.includes('/player/')) return 300;
  if (pathname.includes('/scheduled-events/')) return 60;
  if (pathname.includes('/lineups') || pathname.includes('/h2h')) return 120;
  if (pathname.includes('/incidents') || pathname.includes('/statistics') || pathname.includes('/graph')) return 10;
  return 15;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.find(o => origin.startsWith(o)) || ALLOWED_ORIGINS[0];
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        edge: true,
        uptime: Math.floor((Date.now() - stats.startTime) / 1000),
        ...stats,
        inflight: inflight.size,
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!url.pathname.startsWith('/api/')) {
      return new Response('BongDa365 SofaScore Proxy v3', {
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
      });
    }

    // Rate limit
    const clientIP = request.headers.get('CF-Connecting-IP') || '';
    if (!checkRateLimit(clientIP)) {
      stats.rateLimited++;
      return new Response(JSON.stringify({ error: 'Rate limited' }), {
        status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '10', ...corsHeaders },
      });
    }

    stats.total++;
    const cacheKey = url.pathname + url.search;
    const isImg = url.pathname.includes('/image');

    // Request coalescing
    if (inflight.has(cacheKey)) {
      stats.coalesced++;
      try {
        const shared = await inflight.get(cacheKey);
        return new Response(shared.body, {
          status: shared.status,
          headers: { ...shared.headers, 'X-Coalesced': 'true', ...corsHeaders },
        });
      } catch { /* fall through */ }
    }

    let resolveInflight, rejectInflight;
    const inflightPromise = new Promise((resolve, reject) => {
      resolveInflight = resolve;
      rejectInflight = reject;
    });
    inflight.set(cacheKey, inflightPromise);

    const ua = USER_AGENTS[uaIdx++ % USER_AGENTS.length];
    const cacheTtl = getCacheTtl(url.pathname, isImg);
    let lastError = null;

    // Try each API target in order
    for (const target of API_TARGETS) {
      try {
        const sofaUrl = target.base + url.pathname + url.search;
        const resp = await fetch(sofaUrl, {
          headers: target.headers(ua, isImg),
          cf: { cacheTtl, cacheEverything: true },
        });

        if (resp.status === 403 || resp.status >= 500) {
          stats.byTarget[target.name] = (stats.byTarget[target.name] || { ok: 0, fail: 0 });
          stats.byTarget[target.name].fail++;
          lastError = new Error(`${target.name}: ${resp.status}`);
          continue; // Try next target
        }

        const ct = resp.headers.get('Content-Type') || (isImg ? 'image/png' : 'application/json');
        const body = await resp.arrayBuffer();

        stats.ok++;
        stats.byTarget[target.name] = stats.byTarget[target.name] || { ok: 0, fail: 0 };
        stats.byTarget[target.name].ok++;

        const result = {
          status: resp.status,
          body,
          headers: {
            'Content-Type': ct,
            'Cache-Control': isImg ? 'public, max-age=86400' : `public, max-age=${Math.max(cacheTtl, 5)}`,
            'X-Proxy': 'cf-worker-v3',
            'X-Target': target.name,
          },
        };

        resolveInflight(result);
        setTimeout(() => inflight.delete(cacheKey), 100);

        return new Response(body, {
          status: resp.status,
          headers: { ...result.headers, ...corsHeaders },
        });

      } catch (e) {
        lastError = e;
        stats.byTarget[target.name] = stats.byTarget[target.name] || { ok: 0, fail: 0 };
        stats.byTarget[target.name].fail++;
      }
    }

    // All targets failed
    stats.errors++;
    rejectInflight(lastError);
    inflight.delete(cacheKey);

    return new Response(JSON.stringify({ error: lastError?.message || 'All targets failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
