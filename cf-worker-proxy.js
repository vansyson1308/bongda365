// BongDa365 — Cloudflare Worker SofaScore Proxy
// Deploy: npx wrangler deploy cf-worker-proxy.js --name sofa-proxy
// Or paste into Cloudflare Dashboard > Workers > Create > Quick Edit
//
// This runs on Cloudflare's edge network (same network as SofaScore's CF),
// so requests are NOT blocked like datacenter IPs.

const ALLOWED_ORIGINS = [
  'https://bongda365.onrender.com',
  'https://bongda365.xyz',
  'https://www.bongda365.xyz',
  'http://localhost:3000',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
];
let uaIdx = 0;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
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

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', edge: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Only proxy /api/ paths
    if (!url.pathname.startsWith('/api/')) {
      return new Response('BongDa365 CF Worker Proxy — OK', {
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
      });
    }

    // Proxy to SofaScore
    const ua = USER_AGENTS[uaIdx++ % USER_AGENTS.length];
    const isImg = url.pathname.includes('/image');
    const sofaUrl = 'https://api.sofascore.com' + url.pathname + url.search;

    try {
      const resp = await fetch(sofaUrl, {
        headers: {
          'User-Agent': ua,
          'Accept': isImg
            ? 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            : 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.sofascore.com/',
          'Origin': 'https://www.sofascore.com',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
        },
        cf: { cacheTtl: isImg ? 86400 : 5 },
      });

      const ct = resp.headers.get('Content-Type') || (isImg ? 'image/png' : 'application/json');
      const cacheControl = isImg ? 'public, max-age=86400' : 'public, max-age=5';
      const body = await resp.arrayBuffer();

      return new Response(body, {
        status: resp.status,
        headers: {
          'Content-Type': ct,
          'Cache-Control': cacheControl,
          'X-Proxy': 'cf-worker',
          ...corsHeaders,
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};
