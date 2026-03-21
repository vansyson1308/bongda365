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
const newsEngine = require('./news-engine');
const statsEngine = require('./stats-engine');
const redditEngine = require('./reddit-engine');

const PORT = process.env.PORT || 3000;
const POLL_MS = 5000;

// ── Image cache: serve team/league logos from memory (instant response) ──
const imgCache = new Map();
// 1x1 transparent PNG (68 bytes) — fallback for missing/broken images
const TRANSPARENT_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==', 'base64');
const INCIDENT_POLL_MS = 10000; // Fetch incidents every 10s
const STAT_POLL_MS = 30000; // Fetch stats every 30s
const MIME = { '.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.jpg':'image/jpeg','.gif':'image/gif','.woff2':'font/woff2','.webmanifest':'application/manifest+json','.xml':'application/xml','.txt':'text/plain' };
const SITE_URL = 'https://bongda365.xyz';

// ── SEO: Bot Detection ──
const BOT_UA = /googlebot|bingbot|yandex|baiduspider|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora|pinterest|slackbot|vkshare|W3C_Validator|whatsapp|telegram|discord/i;
function isBot(ua) { return BOT_UA.test(ua || ''); }

// ── SEO: Generate meta HTML for bots ──
function seoHTML(opts) {
  const { title, desc, url, type = 'website', image } = opts;
  const fullUrl = SITE_URL + (url || '/');
  const ogImage = image || SITE_URL + '/og-default.png';
  return `<!DOCTYPE html><html lang="vi"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${fullUrl}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${fullUrl}">
<meta property="og:type" content="${type}">
<meta property="og:image" content="${ogImage}">
<meta property="og:site_name" content="BongDa365">
<meta property="og:locale" content="vi_VN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${ogImage}">
<script type="application/ld+json">${JSON.stringify(opts.jsonLd || {})}</script>
</head><body>
<h1>${title}</h1><p>${desc}</p>
${opts.body || ''}
<a href="${fullUrl}">Xem tại BongDa365</a>
</body></html>`;
}

// ── SEO: Route-specific meta for bots ──
function seoForPath(urlPath) {
  // Home / Live
  if (urlPath === '/' || urlPath === '/live') {
    return seoHTML({
      title: 'BongDa365 - Tỉ Số Trực Tiếp Bóng Đá | Live Score',
      desc: 'Xem tỉ số trực tiếp bóng đá, dự đoán AI Ngựa Tiên Tri, chat live, xác suất real-time. Premier League, La Liga, Serie A, V-League và 500+ giải đấu.',
      url: '/',
      jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'BongDa365', url: SITE_URL, description: 'Tỉ số trực tiếp bóng đá, dự đoán AI, chat live', potentialAction: { '@type': 'SearchAction', target: SITE_URL + '/search?q={search_term_string}', 'query-input': 'required name=search_term_string' } },
    });
  }
  // Schedule
  const schedMatch = urlPath.match(/^\/schedule(?:\/(\d{4}-\d{2}-\d{2}))?$/);
  if (schedMatch) {
    const date = schedMatch[1] || new Date().toISOString().slice(0, 10);
    return seoHTML({
      title: `Lịch Thi Đấu Bóng Đá ${date} | BongDa365`,
      desc: `Lịch thi đấu bóng đá ngày ${date}. Xem giờ đá, đội hình, dự đoán tỉ số cho tất cả các trận.`,
      url: `/schedule/${date}`,
    });
  }
  // League
  const leagueMatch = urlPath.match(/^\/league\/(\d+)/);
  if (leagueMatch) {
    const leagueNames = { 17: 'Premier League', 8: 'La Liga', 23: 'Serie A', 35: 'Bundesliga', 34: 'Ligue 1', 7: 'Champions League', 679: 'Europa League', 626: 'V-League 1' };
    const name = leagueNames[leagueMatch[1]] || `Giải đấu #${leagueMatch[1]}`;
    return seoHTML({
      title: `${name} - Bảng Xếp Hạng, Lịch Đấu, Kết Quả | BongDa365`,
      desc: `Bảng xếp hạng ${name} mùa giải 2025-2026. Kết quả, lịch đấu, thống kê cầu thủ, dự đoán AI.`,
      url: `/league/${leagueMatch[1]}`,
      jsonLd: { '@context': 'https://schema.org', '@type': 'SportsOrganization', name, sport: 'Football' },
    });
  }
  // Match
  const matchMatch = urlPath.match(/^\/match\/(\d+)/);
  if (matchMatch) {
    const matchId = matchMatch[1];
    // Try to get match data from cached live events
    let matchTitle = `Trận đấu #${matchId}`;
    let matchDesc = 'Xem tỉ số trực tiếp, thống kê, đội hình, dự đoán AI';
    let matchJsonLd = {};
    if (cachedLive) {
      try {
        const data = JSON.parse(cachedLive);
        const ev = (data.events || []).find(e => e.id == matchId);
        if (ev) {
          const home = ev.homeTeam?.name || '?';
          const away = ev.awayTeam?.name || '?';
          const score = ev.homeScore?.current != null ? `${ev.homeScore.current}-${ev.awayScore.current}` : 'vs';
          matchTitle = `${home} ${score} ${away} - Trực Tiếp | BongDa365`;
          matchDesc = `${home} vs ${away}: tỉ số trực tiếp, thống kê, đội hình, chat live, dự đoán AI Ngựa Tiên Tri.`;
          matchJsonLd = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${home} vs ${away}`, homeTeam: { '@type': 'SportsTeam', name: home }, awayTeam: { '@type': 'SportsTeam', name: away }, sport: 'Football' };
        }
      } catch {}
    }
    return seoHTML({ title: matchTitle, desc: matchDesc, url: `/match/${matchId}`, jsonLd: matchJsonLd });
  }
  // Predictions
  if (urlPath === '/predictions') {
    return seoHTML({
      title: 'Dự Đoán Bóng Đá AI - Xác Suất Real-Time | BongDa365',
      desc: 'Dự đoán tỉ số bóng đá bằng AI Ngựa Tiên Tri. Xác suất thắng/thua/hòa, tổng bàn thắng, BTTS cập nhật real-time.',
      url: '/predictions',
    });
  }
  // World Cup
  if (urlPath === '/worldcup') {
    return seoHTML({
      title: 'FIFA World Cup 2026 - Lịch Đấu, Bảng Đấu, Dự Đoán | BongDa365',
      desc: 'World Cup 2026 tại USA, Mexico, Canada. 48 đội, 12 bảng, 104 trận. Xem lịch đấu, bảng xếp hạng, dự đoán nhà vô địch.',
      url: '/worldcup',
      jsonLd: { '@context': 'https://schema.org', '@type': 'SportsEvent', name: 'FIFA World Cup 2026', startDate: '2026-06-11', endDate: '2026-07-19', location: { '@type': 'Place', name: 'USA, Mexico, Canada' }, sport: 'Football' },
    });
  }
  // News listing
  if (urlPath === '/news') {
    const latest = newsEngine.getLatest(5);
    const articleList = latest.map(a => `<h2><a href="${SITE_URL}/news/${a.id}">${a.titleVi || a.title}</a></h2><p>${a.summaryVi || a.summary}</p>`).join('');
    return seoHTML({
      title: 'Tin Tức Bóng Đá Mới Nhất | BongDa365',
      desc: 'Cập nhật tin tức bóng đá mới nhất: chuyển nhượng, chấn thương, trước trận, kết quả. Premier League, La Liga, Serie A, V-League.',
      url: '/news',
      body: articleList,
    });
  }
  // News article detail
  const newsMatch = urlPath.match(/^\/news\/([a-z0-9-]+)$/);
  if (newsMatch) {
    const article = newsEngine.getArticle(newsMatch[1]);
    if (article) {
      // Include full content if available for SEO
      const bodyParagraphs = (article.contentVi && article.contentVi.length > 0)
        ? article.contentVi.map(p => `<p>${p}</p>`).join('')
        : `<p>${article.summaryVi || article.summary}</p>`;
      const articleBody = (article.contentVi && article.contentVi.length > 0)
        ? article.contentVi.join(' ')
        : (article.summaryVi || article.summary);
      return seoHTML({
        title: `${article.titleVi || article.title} | BongDa365`,
        desc: article.summaryVi || article.summary,
        url: `/news/${article.id}`,
        image: article.imageUrl,
        body: bodyParagraphs + `<p class="news-source">Nguồn: ${article.source}</p>`,
        jsonLd: { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: article.titleVi || article.title, description: article.summaryVi || article.summary, articleBody, image: article.imageUrl || '', datePublished: new Date(article.pubDate).toISOString(), publisher: { '@type': 'Organization', name: 'BongDa365' }, mainEntityOfPage: `${SITE_URL}/news/${article.id}` },
      });
    }
  }
  return null; // Not a known SEO route
}

// ── Sitemap & Robots ──
function generateSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const leagues = [
    { id: 17, name: 'premier-league' }, { id: 8, name: 'la-liga' },
    { id: 23, name: 'serie-a' }, { id: 35, name: 'bundesliga' },
    { id: 34, name: 'ligue-1' }, { id: 7, name: 'champions-league' },
    { id: 679, name: 'europa-league' }, { id: 626, name: 'v-league' },
  ];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  // Home
  xml += `<url><loc>${SITE_URL}/</loc><changefreq>always</changefreq><priority>1.0</priority><lastmod>${today}</lastmod></url>\n`;
  xml += `<url><loc>${SITE_URL}/live</loc><changefreq>always</changefreq><priority>0.9</priority></url>\n`;
  xml += `<url><loc>${SITE_URL}/predictions</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>\n`;
  xml += `<url><loc>${SITE_URL}/schedule</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
  xml += `<url><loc>${SITE_URL}/worldcup</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n`;
  xml += `<url><loc>${SITE_URL}/privacy</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>\n`;
  xml += `<url><loc>${SITE_URL}/terms</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>\n`;
  // Leagues
  for (const lg of leagues) {
    xml += `<url><loc>${SITE_URL}/league/${lg.id}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
  }
  // News
  xml += `<url><loc>${SITE_URL}/news</loc><changefreq>daily</changefreq><priority>0.8</priority><lastmod>${today}</lastmod></url>\n`;
  const newsArticles = newsEngine.getLatest(50);
  for (const a of newsArticles) {
    xml += `<url><loc>${SITE_URL}/news/${a.id}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>\n`;
  }
  // Live matches (dynamic)
  if (cachedLive) {
    try {
      const data = JSON.parse(cachedLive);
      for (const ev of (data.events || []).slice(0, 100)) {
        xml += `<url><loc>${SITE_URL}/match/${ev.id}</loc><changefreq>always</changefreq><priority>0.7</priority></url>\n`;
      }
    } catch {}
  }
  xml += `</urlset>`;
  return xml;
}

const ROBOTS_TXT = `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`;

// ── Static Pages ──
function privacyPage() {
  return seoHTML({
    title: 'Chính Sách Bảo Mật | BongDa365',
    desc: 'Chính sách bảo mật của BongDa365.xyz',
    url: '/privacy',
    body: `<h2>Chính Sách Bảo Mật</h2>
<p>Cập nhật lần cuối: 20/03/2026</p>
<h3>1. Thu thập dữ liệu</h3><p>BongDa365 thu thập dữ liệu ẩn danh về việc sử dụng website bao gồm: trang được xem, thời gian truy cập, loại thiết bị. Chúng tôi không thu thập thông tin cá nhân trừ khi bạn tự nguyện cung cấp (ví dụ: đăng ký tài khoản).</p>
<h3>2. Cookie</h3><p>Website sử dụng cookie để cải thiện trải nghiệm người dùng và phục vụ quảng cáo phù hợp. Bạn có thể tắt cookie trong cài đặt trình duyệt.</p>
<h3>3. Quảng cáo</h3><p>Chúng tôi sử dụng các dịch vụ quảng cáo của bên thứ ba (Google AdSense). Các dịch vụ này có thể sử dụng cookie để hiển thị quảng cáo dựa trên lịch sử duyệt web.</p>
<h3>4. Chia sẻ dữ liệu</h3><p>Chúng tôi không bán hoặc chia sẻ dữ liệu cá nhân với bên thứ ba ngoài mục đích phân tích và quảng cáo.</p>
<h3>5. Liên hệ</h3><p>Nếu có thắc mắc, liên hệ: contact@bongda365.xyz</p>`,
  });
}

function termsPage() {
  return seoHTML({
    title: 'Điều Khoản Sử Dụng | BongDa365',
    desc: 'Điều khoản sử dụng của BongDa365.xyz',
    url: '/terms',
    body: `<h2>Điều Khoản Sử Dụng</h2>
<p>Cập nhật lần cuối: 20/03/2026</p>
<h3>1. Chấp nhận điều khoản</h3><p>Bằng việc sử dụng BongDa365, bạn đồng ý với các điều khoản dưới đây.</p>
<h3>2. Dịch vụ</h3><p>BongDa365 cung cấp thông tin tỉ số bóng đá trực tiếp, thống kê, dự đoán AI mang tính chất giải trí. Thông tin dự đoán không phải lời khuyên cá cược.</p>
<h3>3. Miễn trừ trách nhiệm</h3><p>Dữ liệu tỉ số và thống kê được cung cấp "nguyên trạng" và có thể có độ trễ. BongDa365 không chịu trách nhiệm cho bất kỳ quyết định nào dựa trên thông tin trên website.</p>
<h3>4. Nội dung người dùng</h3><p>Tin nhắn chat phải tuân thủ pháp luật Việt Nam. Nội dung vi phạm sẽ bị xóa không thông báo.</p>
<h3>5. Sở hữu trí tuệ</h3><p>Nội dung, thiết kế và mã nguồn thuộc quyền sở hữu của BongDa365. Dữ liệu bóng đá được cung cấp bởi SofaScore.</p>`,
  });
}

// ── API Response Cache — prevents repeated identical requests to SofaScore ──
const apiCache = new Map();
const API_CACHE_TTL = 15000; // 15s for most endpoints
const API_CACHE_TTL_STATIC = 300000; // 5min for standings, teams, players

function getApiCacheTTL(url) {
  if (url.includes('/events/live')) return 0; // Live data handled separately via polling
  if (url.includes('/image')) return 0; // Images handled by imgCache
  if (url.includes('/standings') || url.includes('/team/') || url.includes('/player/') || url.includes('/seasons')) return API_CACHE_TTL_STATIC;
  if (url.includes('/scheduled-events/')) return 60000; // 1min for schedule
  return API_CACHE_TTL;
}

// ── HTTP Server ──
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health/status endpoint — shows fetch strategy performance
  if (req.url === '/health') {
    const status = {
      uptime: Math.floor(process.uptime()),
      fetchStats,
      strategies: {
        direct: Date.now() > directSkipUntil ? 'active' : `backoff (${Math.round((directSkipUntil - Date.now()) / 1000)}s)`,
        cfWorker: CF_WORKER_URL ? (Date.now() > cfWorkerSkipUntil ? 'active' : `backoff (${Math.round((cfWorkerSkipUntil - Date.now()) / 1000)}s)`) : 'not configured',
        proxy: SOFA_PROXY_URL ? (Date.now() > proxySkipUntil ? 'active' : `backoff (${Math.round((proxySkipUntil - Date.now()) / 1000)}s)`) : 'not configured',
        curl: 'always available (sofascore.app → sofascore.com)',
        staleCache: staleCache.size + ' entries',
      },
      lastLiveFetch: lastLiveFetchOk ? new Date(lastLiveFetchOk).toISOString() : 'never',
      staleSinceLastLive: lastLiveFetchOk ? Math.round((Date.now() - lastLiveFetchOk) / 1000) + 's' : 'n/a',
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(status, null, 2));
    return;
  }

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

  // Advanced Stats API
  if (req.url.startsWith('/api/stats')) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);

    // League stats: /api/stats/league/17
    const leagueMatch = req.url.match(/^\/api\/stats\/league\/(\d+)$/);
    if (leagueMatch) {
      const data = statsEngine.getAPIData(parseInt(leagueMatch[1]));
      res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
      res.end(JSON.stringify(data || { error: 'League not found or stats not loaded yet' }));
      return;
    }

    // Match analysis: /api/stats/match-analysis?home=Arsenal&away=Chelsea&league=17
    if (req.url.startsWith('/api/stats/match-analysis')) {
      const home = urlObj.searchParams.get('home');
      const away = urlObj.searchParams.get('away');
      const league = parseInt(urlObj.searchParams.get('league')) || 0;
      const analysis = statsEngine.getMatchAnalysis(home, away, league);
      res.writeHead(analysis ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
      res.end(JSON.stringify(analysis || { error: 'No stats available for these teams' }));
      return;
    }

    // Stats engine status: /api/stats/status
    if (req.url === '/api/stats/status') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(statsEngine.getStatus()));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown stats endpoint' }));
    return;
  }

  // Reddit Community API
  if (req.url.startsWith('/api/reddit')) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);

    // Trending: /api/reddit/trending?limit=10
    if (req.url.startsWith('/api/reddit/trending')) {
      const limit = parseInt(urlObj.searchParams.get('limit')) || 10;
      const data = redditEngine.getTrending(limit);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' });
      res.end(JSON.stringify({ posts: data }));
      return;
    }

    // Insider scoops: /api/reddit/insider?limit=10
    if (req.url.startsWith('/api/reddit/insider')) {
      const limit = parseInt(urlObj.searchParams.get('limit')) || 10;
      const data = redditEngine.getInsiderScoops(limit);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' });
      res.end(JSON.stringify({ posts: data }));
      return;
    }

    // Categories: /api/reddit/categories
    if (req.url === '/api/reddit/categories') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
      res.end(JSON.stringify({ categories: redditEngine.getCategories() }));
      return;
    }

    // Posts list: /api/reddit?page=1&limit=20&category=transfers&sort=trending&league=premier-league
    const page = parseInt(urlObj.searchParams.get('page')) || 1;
    const limit = Math.min(parseInt(urlObj.searchParams.get('limit')) || 20, 50);
    const category = urlObj.searchParams.get('category') || null;
    const league = urlObj.searchParams.get('league') || null;
    const sort = urlObj.searchParams.get('sort') || 'trending';
    const result = redditEngine.getPosts({ page, limit, category, league, sort });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' });
    res.end(JSON.stringify(result));
    return;
  }

  // News API
  if (req.url.startsWith('/api/news')) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);

    // Named sub-routes FIRST (before single article regex catches them)
    // Insider scoops: /api/news/insider
    if (req.url.startsWith('/api/news/insider')) {
      const limit = parseInt(urlObj.searchParams.get('limit')) || 10;
      const data = newsEngine.getInsiderScoops(limit);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' });
      res.end(JSON.stringify({ articles: data }));
      return;
    }
    // Confirmed (multi-source): /api/news/confirmed
    if (req.url.startsWith('/api/news/confirmed')) {
      const data = newsEngine.getConfirmed(10);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
      res.end(JSON.stringify({ articles: data }));
      return;
    }
    // Source stats: /api/news/sources
    if (req.url === '/api/news/sources') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
      res.end(JSON.stringify({ sources: newsEngine.getSourceStats() }));
      return;
    }
    // Single article: /api/news/bbc-a1b2c3
    const idMatch = req.url.match(/^\/api\/news\/([a-z0-9-]+)$/);
    if (idMatch) {
      // Lazy-load full article content (scrape + translate on demand)
      try {
        const article = await Promise.race([
          newsEngine.getFullArticle(idMatch[1]),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 35000))
        ]);
        if (!article) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        const cacheTime = article.contentStatus === 'ready' ? 'public, max-age=300' : 'no-cache';
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheTime });
        res.end(JSON.stringify({ article }));
      } catch (e) {
        // Timeout or error — return article with summary fallback
        const article = newsEngine.getArticle(idMatch[1]);
        res.writeHead(article ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(article ? { article } : { error: 'not found' }));
      }
      return;
    }
    // List: /api/news?page=1&limit=20&category=transfers
    const page = parseInt(urlObj.searchParams.get('page')) || 1;
    const limit = Math.min(parseInt(urlObj.searchParams.get('limit')) || 20, 50);
    const category = urlObj.searchParams.get('category') || null;
    const result = newsEngine.getArticles({ page, limit, category });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
    res.end(JSON.stringify(result));
    return;
  }

  // Proxy API — with in-memory image cache
  if (req.url.startsWith('/api/')) {
    const isImg = req.url.includes('/image');
    // Serve cached API responses (non-image, non-live)
    const cacheTTL = getApiCacheTTL(req.url);
    if (!isImg && cacheTTL > 0) {
      const ac = apiCache.get(req.url);
      if (ac && Date.now() - ac.ts < cacheTTL) {
        res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*', 'Cache-Control':`public, max-age=${Math.floor(cacheTTL/1000)}`, 'X-Cache':'HIT' });
        res.end(ac.body);
        return;
      }
    }
    // Serve cached images instantly (avoid re-proxying)
    if (isImg && imgCache.has(req.url)) {
      const cached = imgCache.get(req.url);
      // Pending = another request is already fetching this image
      if (cached.pending) {
        cached.pending.push(res);
        return;
      }
      if (cached.status === 404) {
        res.writeHead(200, { 'Content-Type':'image/png', 'Cache-Control':'public, max-age=86400', 'Access-Control-Allow-Origin':'*' });
        res.end(TRANSPARENT_1PX);
        return;
      }
      res.writeHead(200, { 'Content-Type': cached.ct, 'Cache-Control':'public, max-age=86400', 'Access-Control-Allow-Origin':'*' });
      res.end(cached.body);
      return;
    }
    if (isImg) {
      // Mark as pending to prevent parallel fetches for same image
      imgCache.set(req.url, { pending: [] });
    }
    try {
      const result = await fetchSofa(req.url);
      if (!result) { res.writeHead(304); res.end(); return; }
      const ct = result.headers['content-type'] || (isImg ? 'image/png' : 'application/json');
      // Cache images in memory (24h effective, evicted when server restarts)
      if (isImg) {
        const pending = imgCache.get(req.url)?.pending || [];
        if (result.status !== 200) {
          imgCache.set(req.url, { status: 404 });
          const h = { 'Content-Type':'image/png', 'Cache-Control':'public, max-age=86400', 'Access-Control-Allow-Origin':'*' };
          res.writeHead(200, h); res.end(TRANSPARENT_1PX);
          pending.forEach(r => { try { r.writeHead(200, h); r.end(TRANSPARENT_1PX); } catch {} });
          return;
        }
        imgCache.set(req.url, { body: result.body, ct });
        const h = { 'Content-Type': ct, 'Cache-Control':'public, max-age=86400', 'Access-Control-Allow-Origin':'*' };
        res.writeHead(200, h); res.end(result.body);
        pending.forEach(r => { try { r.writeHead(200, h); r.end(result.body); } catch {} });
        // Evict old entries if cache grows too large (max 500 images ~25MB)
        if (imgCache.size > 500) {
          const first = imgCache.keys().next().value;
          imgCache.delete(first);
        }
        return;
      }
      // If SofaScore returned a Cloudflare block (403) or server error, return clean error JSON
      if (result.status === 403 || result.status >= 500) {
        res.writeHead(502, { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*' });
        res.end(JSON.stringify({ error: `SofaScore returned ${result.status}` }));
        return;
      }
      // Cache successful JSON responses
      if (result.status === 200 && cacheTTL > 0) {
        apiCache.set(req.url, { body: result.body, ts: Date.now() });
        // Evict old entries
        if (apiCache.size > 200) {
          const now = Date.now();
          for (const [k, v] of apiCache) {
            if (now - v.ts > getApiCacheTTL(k)) apiCache.delete(k);
            if (apiCache.size <= 150) break;
          }
        }
      }
      res.writeHead(result.status, { 'Content-Type':ct, 'Access-Control-Allow-Origin':'*', 'Cache-Control':'public, max-age=10' });
      res.end(result.body);
    } catch (e) {
      // For images, return transparent pixel on error instead of 502
      if (isImg) {
        const pending = imgCache.get(req.url)?.pending || [];
        imgCache.set(req.url, { status: 404 });
        const h = { 'Content-Type':'image/png', 'Cache-Control':'public, max-age=300', 'Access-Control-Allow-Origin':'*' };
        res.writeHead(200, h); res.end(TRANSPARENT_1PX);
        pending.forEach(r => { try { r.writeHead(200, h); r.end(TRANSPARENT_1PX); } catch {} });
        return;
      }
      res.writeHead(502, { 'Content-Type':'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── SEO: robots.txt ──
  if (req.url === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(ROBOTS_TXT);
    return;
  }

  // ── SEO: sitemap.xml ──
  if (req.url === '/sitemap.xml') {
    res.writeHead(200, { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' });
    res.end(generateSitemap());
    return;
  }

  // ── Static pages ──
  if (req.url === '/privacy' || req.url === '/privacy/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(privacyPage());
    return;
  }
  if (req.url === '/terms' || req.url === '/terms/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(termsPage());
    return;
  }

  // ── SEO: Bot pre-rendering ──
  const ua = req.headers['user-agent'] || '';
  const cleanPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (isBot(ua) && !cleanPath.includes('.')) {
    const seoPage = seoForPath(cleanPath);
    if (seoPage) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(seoPage);
      return;
    }
  }

  // Static files (with path traversal protection)
  let fp = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  // SPA: serve index.html for clean URLs (non-file paths)
  if (!fp.includes('.') && !fp.startsWith('/api/')) fp = '/index.html';
  fp = path.join(__dirname, fp);
  if (!fp.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ── Social Proof Counters ──
const socialProof = { analyzed: 0, correct: 0, total: 0, shared: 0 };
const analyzedMatches = new Set();

bus.on('kickoff', d => {
  if (d.matchId && !analyzedMatches.has(d.matchId)) {
    analyzedMatches.add(d.matchId);
    socialProof.analyzed++;
  }
});

bus.on('fulltime', d => {
  if (!d.matchId) return;
  socialProof.total++;
  // Compare prediction with actual result
  const pred = predictions.get(d.matchId);
  if (pred && d.score) {
    const predWinner = pred.homeWin > pred.awayWin ? 'home' : pred.awayWin > pred.homeWin ? 'away' : 'draw';
    const actual = d.score.home > d.score.away ? 'home' : d.score.away > d.score.home ? 'away' : 'draw';
    if (predWinner === actual) socialProof.correct++;
  }
  analyzedMatches.delete(d.matchId);
});

function getSocialProof() {
  const chatters = new Set();
  for (const [, sockets] of io.sockets.adapter.rooms) {
    sockets.forEach(id => chatters.add(id));
  }
  return { ...socialProof, chatters: chatters.size, accuracy: socialProof.total > 0 ? Math.round(socialProof.correct / socialProof.total * 100) : 0 };
}

setInterval(() => io.emit('social_proof', getSocialProof()), 60000);

// ── Prediction Leaderboard (in-memory, resets on restart) ──
const predLeaderboard = new Map();

function getLeaderboardTop() {
  return [...predLeaderboard.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

function broadcastLeaderboard() {
  io.emit('leaderboard', { leaderboard: getLeaderboardTop() });
}

// ── Socket.io ──
const io = new SocketIO(server, {
  cors: { origin: '*' },
  perMessageDeflate: { threshold: 1024 },
});

io.on('connection', socket => {
  // Send social proof on connect
  socket.emit('social_proof', getSocialProof());

  // Card shared tracking
  socket.on('card_shared', () => { socialProof.shared++; });

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
    // Send probability history for chart
    const history = predictions.getHistory(matchId);
    if (history.length) socket.emit('prediction_history', { matchId, history });
  });

  // What-if simulation
  socket.on('simulate', (data, cb) => {
    if (!data?.matchId || !data?.event) return;
    const result = predictions.simulate(data.matchId, data.event);
    if (typeof cb === 'function') cb(result);
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

  // ── Prediction Leaderboard (Sprint 7) ──
  socket.on('pred_score', data => {
    if (!data?.user || data.score == null) return;
    const user = String(data.user).slice(0, 20);
    const entry = predLeaderboard.get(user) || { user, score: 0, exact: 0, correct: 0, wrong: 0 };
    entry.score += (data.points || 0);
    if (data.points === 3) entry.exact++;
    else if (data.points === 1) entry.correct++;
    else entry.wrong++;
    predLeaderboard.set(user, entry);
    broadcastLeaderboard();
  });

  socket.on('get_leaderboard', () => {
    socket.emit('leaderboard', { leaderboard: getLeaderboardTop() });
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

  // Mascot auto-post in chat for critical + high events
  if (entry.priority === 'critical' || entry.priority === 'high') {
    io.to(`match_${entry.matchId}`).emit('chat_msg', {
      user: '🐴 Ngựa Tiên Tri',
      text: entry.text,
      ts: Date.now(),
      isMascot: true,
    });
  }

  // Bot engagement prompts after critical events
  if (entry.priority === 'critical' && (entry.type === 'goal' || entry.type === 'red_card' || entry.type === 'var')) {
    const mascotVoice = require('./mascot-voice');
    setTimeout(() => {
      const prompt = mascotVoice.engagementPrompt(entry.type, {});
      io.to(`match_${entry.matchId}`).emit('chat_msg', {
        user: '🐴 Ngựa Tiên Tri',
        text: prompt,
        ts: Date.now(),
        isMascot: true,
      });
    }, 4000);
  }
});

// Predictions -> Socket.io
predictions.start(data => {
  io.to(`match_${data.matchId}`).emit('predictions', data);
});

// ── Match Context Builder (Sprint 6) ──
// Build narrative context on kickoff using standings + form
async function buildMatchContext(matchId, home, away, leagueId, seasonId) {
  try {
    if (!leagueId || !seasonId) return;
    const result = await fetchSofa(`/api/v1/unique-tournament/${leagueId}/season/${seasonId}/standings/total`);
    if (!result || result.status !== 200) return;
    const data = JSON.parse(result.body.toString());
    const rows = data.standings?.[0]?.rows || [];
    if (!rows.length) return;

    const homeRow = rows.find(r => r.team?.name === home || r.team?.shortName === home);
    const awayRow = rows.find(r => r.team?.name === away || r.team?.shortName === away);

    const narratives = [];

    if (homeRow && awayRow) {
      const hPos = homeRow.position || rows.indexOf(homeRow) + 1;
      const aPos = awayRow.position || rows.indexOf(awayRow) + 1;

      // Title race
      if (hPos <= 2 && aPos <= 2) {
        narratives.push(`Đại chiến ngôi đầu! Cả hai đội đều trong top 2 bảng xếp hạng.`);
      }
      // Top vs bottom
      else if (hPos <= 4 && aPos >= rows.length - 3) {
        narratives.push(`${home} (hạng ${hPos}) tiếp đón ${away} (hạng ${aPos}). Chênh lệch đẳng cấp rõ rệt.`);
      }
      else if (aPos <= 4 && hPos >= rows.length - 3) {
        narratives.push(`${away} (hạng ${aPos}) hành quân đến sân ${home} (hạng ${hPos}). Cơ hội lớn cho đội khách.`);
      }
      // Relegation battle
      if (hPos >= rows.length - 3 && aPos >= rows.length - 3) {
        narratives.push(`Trận chiến trụ hạng! Cả ${home} và ${away} đang trong vùng nguy hiểm.`);
      }
      // Must win
      if (hPos >= 15 && aPos <= 5) {
        narratives.push(`${home} buộc phải thắng để cải thiện vị trí trên BXH.`);
      }
    }

    if (narratives.length > 0) {
      commentary.setMatchContext(matchId, { narrative: narratives[0] });
    }
  } catch { /* silent */ }
}

// Listen for kickoff to build context + attach advanced stats
bus.on('kickoff', d => {
  if (d.matchId && d.home && d.away) {
    // Try to extract league info from cached live data
    let leagueId, seasonId;
    if (cachedLive) {
      try {
        const data = JSON.parse(cachedLive);
        const ev = (data.events || []).find(e => e.id == d.matchId);
        if (ev?.tournament?.uniqueTournament?.id) {
          leagueId = ev.tournament.uniqueTournament.id;
          seasonId = ev.season?.id;
        }
      } catch {}
    }
    buildMatchContext(d.matchId, d.home, d.away, leagueId, seasonId);

    // Attach advanced stats analysis at kickoff
    if (leagueId) {
      const analysis = statsEngine.getMatchAnalysis(d.home, d.away, leagueId);
      if (analysis && analysis.insights.length > 0) {
        // Send top insight as commentary
        const topInsight = analysis.insights[0];
        setTimeout(() => {
          commentary.setMatchContext(d.matchId, { narrative: topInsight.vi, advancedStats: analysis });
          // Broadcast first xG insight after kickoff
          io.to(`match_${d.matchId}`).emit('commentary', {
            matchId: d.matchId,
            text: `📊 ${topInsight.vi}`,
            priority: 'normal',
            type: 'xg_insight',
            ts: Date.now(),
          });
          // Send full analysis to match room
          io.to(`match_${d.matchId}`).emit('match_analysis', { matchId: d.matchId, analysis });
        }, 8000); // Delay 8s after kickoff so it doesn't overlap
      }
    }
  }
});

// ── SofaScore Polling ──
let cachedLive = null;

// ── SofaScore Fetch Strategy Chain ──
// Priority: Direct api.sofascore.app → CF Worker → Local Proxy → curl → Stale cache
//
// KEY DISCOVERY: api.sofascore.app (mobile API) runs on plain nginx, NOT behind Cloudflare.
// Same data, same endpoints, CORS: *. No bot detection, no JA3/JA4 checks, no IP reputation.
// This is the most reliable strategy from any IP (datacenter or residential).
const CF_WORKER_URL = process.env.CF_WORKER_URL || null;
const SOFA_PROXY_URL = process.env.SOFA_PROXY_URL || null;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15',
];
let uaIdx = 0;

// Track health per strategy
let cfWorkerFailures = 0;
let proxyConsecutiveFailures = 0;
const MAX_FAILURES_BEFORE_SKIP = 5; // Skip a strategy temporarily after 5 consecutive failures
let cfWorkerSkipUntil = 0; // Timestamp — skip CF Worker until this time (backoff)
let proxySkipUntil = 0;

// Stale data cache — serves last-known-good data when all strategies fail
const staleCache = new Map();
const STALE_MAX_AGE = 600000; // Serve stale data up to 10 minutes old

// Stats for logging
let fetchStats = { direct: 0, directOk: 0, cfWorker: 0, cfWorkerOk: 0, proxy: 0, proxyOk: 0, curl: 0, curlOk: 0, stale: 0 };
let directConsecutiveFailures = 0;
let directSkipUntil = 0;

async function fetchSofa(urlPath) {
  let result = null;
  let lastError = null;
  const now = Date.now();

  // Strategy 0: Direct to api.sofascore.app (mobile API — NO Cloudflare, plain nginx)
  if (now > directSkipUntil) {
    try {
      fetchStats.direct++;
      result = await fetchDirect(urlPath);
      if (result && result.status === 200) {
        directConsecutiveFailures = 0;
        fetchStats.directOk++;
      } else if (result && (result.status === 403 || result.status >= 500)) {
        directConsecutiveFailures++;
        if (directConsecutiveFailures >= MAX_FAILURES_BEFORE_SKIP) {
          directSkipUntil = now + Math.min(directConsecutiveFailures * 60000, 600000);
          console.log(`[WARN] Direct api.sofascore.app: ${directConsecutiveFailures} failures, skip ${Math.round((directSkipUntil - now) / 1000)}s`);
        }
        result = null;
      }
    } catch (e) {
      directConsecutiveFailures++;
      lastError = e;
      if (directConsecutiveFailures >= MAX_FAILURES_BEFORE_SKIP) {
        directSkipUntil = now + Math.min(directConsecutiveFailures * 60000, 600000);
      }
      console.log(`[WARN] Direct failed (${directConsecutiveFailures}): ${e.message}`);
    }
  }

  // Strategy 1: Cloudflare Worker
  if (!result && CF_WORKER_URL && now > cfWorkerSkipUntil) {
    try {
      fetchStats.cfWorker++;
      result = await fetchViaCFWorker(urlPath);
      if (result && result.status === 200) {
        cfWorkerFailures = 0;
        fetchStats.cfWorkerOk++;
      } else if (result && (result.status === 403 || result.status >= 500)) {
        cfWorkerFailures++;
        if (cfWorkerFailures >= MAX_FAILURES_BEFORE_SKIP) {
          cfWorkerSkipUntil = now + Math.min(cfWorkerFailures * 30000, 300000); // Backoff: 30s, 60s, ... max 5min
          console.log(`[WARN] CF Worker: ${cfWorkerFailures} failures, skipping for ${Math.round((cfWorkerSkipUntil - now) / 1000)}s`);
        }
        result = null;
      }
    } catch (e) {
      cfWorkerFailures++;
      lastError = e;
      if (cfWorkerFailures >= MAX_FAILURES_BEFORE_SKIP) {
        cfWorkerSkipUntil = now + Math.min(cfWorkerFailures * 30000, 300000);
      }
      console.log(`[WARN] CF Worker failed (${cfWorkerFailures}): ${e.message}`);
    }
  }

  // Strategy 2: Local proxy (home IP via Cloudflare Tunnel)
  if (!result && SOFA_PROXY_URL && now > proxySkipUntil) {
    try {
      fetchStats.proxy++;
      result = await fetchViaProxy(urlPath);
      if (result && result.status === 200) {
        proxyConsecutiveFailures = 0;
        fetchStats.proxyOk++;
      } else if (result && (result.status === 403 || result.status >= 500)) {
        proxyConsecutiveFailures++;
        result = null;
      }
    } catch (e) {
      proxyConsecutiveFailures++;
      lastError = lastError || e;
      if (proxyConsecutiveFailures >= MAX_FAILURES_BEFORE_SKIP) {
        proxySkipUntil = now + 60000; // Skip proxy for 1min
      }
      console.log(`[WARN] Proxy failed (${proxyConsecutiveFailures}): ${e.message}`);
    }
  }

  // Strategy 3: curl (OpenSSL TLS fingerprint — different JA3 from Node.js)
  if (!result) {
    try {
      fetchStats.curl++;
      result = await fetchViaCurl(urlPath);
      if (result && (result.status === 403 || result.status >= 500)) {
        console.log(`[WARN] curl returned ${result.status} for ${urlPath}`);
        result = null;
      } else if (result && result.status === 200) {
        fetchStats.curlOk++;
      }
    } catch (e2) {
      lastError = lastError || e2;
      console.log(`[WARN] curl failed: ${e2.message}`);
    }
  }

  // Success — cache for stale fallback
  if (result && result.status === 200) {
    staleCache.set(urlPath, { body: result.body, headers: result.headers, ts: Date.now() });
    return result;
  }

  // Strategy 4: serve stale cached data if recent enough
  if (!result || result.status !== 200) {
    const stale = staleCache.get(urlPath);
    if (stale && Date.now() - stale.ts < STALE_MAX_AGE) {
      fetchStats.stale++;
      console.log(`[STALE] Serving cached data for ${urlPath} (age: ${Math.round((Date.now() - stale.ts) / 1000)}s)`);
      return { status: 200, headers: stale.headers, body: stale.body };
    }
  }

  if (result) return result;
  throw lastError || new Error('All fetch strategies failed');
}

// ── Strategy 0: Direct to api.sofascore.app (mobile API) ──
// This is NOT behind Cloudflare (plain nginx). No bot detection, no JA3/JA4.
// Works from any IP. Same data format as api.sofascore.com.
function fetchDirect(urlPath) {
  return new Promise((resolve, reject) => {
    const ua = USER_AGENTS[uaIdx++ % USER_AGENTS.length];
    const isImg = urlPath.includes('/image');
    const opts = {
      hostname: 'api.sofascore.app',
      path: urlPath,
      timeout: 12000,
      headers: {
        'User-Agent': ua,
        'Accept': isImg ? 'image/*,*/*' : 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    };

    const req = https.get(opts, res => {
      // Decompress
      const encoding = res.headers['content-encoding'];
      let stream = res;
      const zlib = require('zlib');
      if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());

      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
      stream.on('error', e => reject(new Error(`direct stream: ${e.message}`)));
    });
    req.on('error', e => reject(new Error(`direct: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('direct: timeout')); });
  });
}

// ── Strategy 1: Cloudflare Worker ──
function fetchViaCFWorker(urlPath) {
  return new Promise((resolve, reject) => {
    const workerUrl = new URL(CF_WORKER_URL + urlPath);
    const mod = workerUrl.protocol === 'https:' ? https : http;
    const req = mod.get(workerUrl.href, {
      headers: {
        'Accept': urlPath.includes('/image') ? 'image/*,*/*' : 'application/json',
        'X-Source': 'bongda365-server',
      },
      timeout: 12000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('cf-worker timeout')); });
  });
}

// ── Strategy 2: Local Proxy (Cloudflare Tunnel) ──
function fetchViaProxy(urlPath) {
  return new Promise((resolve, reject) => {
    const proxyUrl = new URL(SOFA_PROXY_URL + urlPath);
    const mod = proxyUrl.protocol === 'https:' ? https : http;
    const req = mod.get(proxyUrl.href, { headers: { 'Accept': '*/*' }, timeout: 15000 }, res => {
      if (res.statusCode === 304) { resolve(null); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('proxy timeout')); });
  });
}

// ── Strategy 3: curl — try api.sofascore.app (no Cloudflare) first, then api.sofascore.com ──
const { execFile } = require('child_process');

// api.sofascore.app: mobile API, plain nginx, no bot detection, CORS: *
// api.sofascore.com: main API, behind Cloudflare WAF
const CURL_TARGETS = [
  'https://api.sofascore.app',
  'https://api.sofascore.com',
];

function fetchViaCurl(urlPath) {
  return new Promise(async (resolve, reject) => {
    for (const baseUrl of CURL_TARGETS) {
      try {
        const result = await curlRequest(baseUrl + urlPath, urlPath.includes('/image'));
        if (result.status === 200) return resolve(result);
        if (result.status !== 403) return resolve(result); // Non-403 errors still returned
      } catch (e) {
        // Try next target
      }
    }
    reject(new Error('curl: all targets failed'));
  });
}

function curlRequest(url, isImg) {
  return new Promise((resolve, reject) => {
    const ua = USER_AGENTS[uaIdx++ % USER_AGENTS.length];
    const args = [
      '-s', '-L', '--compressed',
      '--max-time', '12',
      '-H', `User-Agent: ${ua}`,
      '-H', `Accept: ${isImg ? 'image/*,*/*' : 'application/json'}`,
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-w', '\n__HTTP_STATUS__%{http_code}',
      url,
    ];

    execFile('curl', args, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024, timeout: 15000 }, (err, stdout) => {
      if (err) return reject(new Error(`curl: ${err.message}`));

      const output = stdout;
      const marker = Buffer.from('\n__HTTP_STATUS__');
      const markerIdx = output.lastIndexOf(marker);

      if (markerIdx === -1) return reject(new Error('curl: no status marker'));

      const statusStr = output.slice(markerIdx + marker.length).toString().trim();
      const status = parseInt(statusStr) || 0;
      const body = output.slice(0, markerIdx);

      resolve({
        status,
        headers: { 'content-type': isImg ? 'image/png' : 'application/json' },
        body,
      });
    });
  });
}

// Main live poll - every 5s
let lastLiveFetchOk = 0;

async function pollLive() {
  try {
    const result = await fetchSofa('/api/v1/sport/football/events/live');
    if (!result || result.status !== 200) {
      const age = cachedLive ? Math.round((Date.now() - lastLiveFetchOk) / 1000) : -1;
      console.log(`[POLL] Live fetch returned ${result?.status || 'null'} — serving stale data (${age}s old)`);
      return;
    }

    const body = result.body.toString();
    if (body === cachedLive) return; // No change
    cachedLive = body;
    lastLiveFetchOk = Date.now();

    const data = JSON.parse(body);
    const events = data.events || [];

    // Run event detection (emits to bus)
    detector.process(events);

    // Push full data to all clients (no re-fetch needed)
    io.emit('live_update', { ts: Date.now(), count: events.length, events });
  } catch (e) {
    console.log(`[POLL] Live fetch failed: ${e.message}`);
  }
}

// Incident poll - cycle through live matches
let incidentIdx = 0;

async function pollIncidents() {
  const liveIds = detector.getLiveMatchIds();
  if (!liveIds.length) return;

  // Priority: recently changed matches first, then rotate through rest
  const changed = detector.getRecentlyChanged();
  const regularIds = liveIds.filter(id => !changed.includes(id));
  const batch = [
    ...changed,
    ...regularIds.slice(incidentIdx, incidentIdx + 5)
  ].slice(0, 6); // Max 6 per cycle
  incidentIdx = (incidentIdx + 5) % Math.max(1, regularIds.length || 1);

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

// ── Odds Polling — fetch dynamic over/under lines from bookmakers ──
let oddsIdx = 0;
const matchLines = new Map();

function fracToDecimal(f) {
  if (!f) return 2;
  const p = f.split('/');
  return p.length === 2 ? parseInt(p[0]) / parseInt(p[1]) + 1 : 2;
}

function findPrimaryLine(choices) {
  const byLine = {};
  for (const c of choices) {
    const m = c.name.match(/(Over|Under)\s+([\d.]+)/i);
    if (!m) continue;
    const line = parseFloat(m[2]);
    const side = m[1].toLowerCase();
    if (!byLine[line]) byLine[line] = {};
    byLine[line][side] = fracToDecimal(c.fractionalValue);
  }
  let best = null, bestDiff = Infinity;
  for (const [line, sides] of Object.entries(byLine)) {
    if (sides.over && sides.under) {
      const diff = Math.abs(sides.over - sides.under);
      if (diff < bestDiff) { bestDiff = diff; best = parseFloat(line); }
    }
  }
  return best;
}

function extractLines(markets) {
  const result = { goalLine: 2.5, cornerLine: 8.5, cardLine: 3.5 };
  for (const market of markets) {
    const name = market.marketName;
    const choices = market.choices || [];
    if (!choices.length) continue;
    if (name === 'Match goals' || name === 'Total goals') {
      result.goalLine = findPrimaryLine(choices) || 2.5;
    } else if (name === 'Corners 2-Way' || name === 'Corners') {
      result.cornerLine = findPrimaryLine(choices) || 8.5;
    } else if (name === 'Cards in match') {
      result.cardLine = findPrimaryLine(choices) || 3.5;
    }
  }
  return result;
}

async function pollOdds() {
  const liveIds = detector.getLiveMatchIds();
  if (!liveIds.length) return;
  const batch = liveIds.slice(oddsIdx, oddsIdx + 2);
  oddsIdx = (oddsIdx + 2) % Math.max(1, liveIds.length);

  for (const matchId of batch) {
    try {
      const result = await fetchSofa(`/api/v1/event/${matchId}/odds/1/all`);
      if (result && result.status === 200) {
        const data = JSON.parse(result.body.toString());
        const lines = extractLines(data.markets || []);
        matchLines.set(matchId, lines);
        predictions.setLines(matchId, lines);
      }
    } catch { /* skip */ }
  }
}

// Start all poll loops
setInterval(pollLive, POLL_MS);
setInterval(pollIncidents, INCIDENT_POLL_MS);
setInterval(pollStats, STAT_POLL_MS);
setInterval(pollOdds, 60000); // Odds change slowly, 60s is enough
pollLive();

// Log fetch strategy performance every 5 minutes
setInterval(() => {
  const s = fetchStats;
  const total = s.directOk + s.cfWorkerOk + s.proxyOk + s.curlOk + s.stale;
  if (total === 0) return;
  console.log(`[FETCH STATS] Direct: ${s.directOk}/${s.direct} | CF Worker: ${s.cfWorkerOk}/${s.cfWorker} | Proxy: ${s.proxyOk}/${s.proxy} | curl: ${s.curlOk}/${s.curl} | Stale: ${s.stale}`);
}, 300000);
newsEngine.start();
// Stats engine needs the fetchSofa function to access SofaScore API
statsEngine.setFetchFn(fetchSofa);
statsEngine.start();
redditEngine.start();

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
  const strategies = [];
  strategies.push('Direct api.sofascore.app (no Cloudflare)');
  if (CF_WORKER_URL) strategies.push(`CF Worker: ${CF_WORKER_URL}`);
  if (SOFA_PROXY_URL) strategies.push(`Local Proxy: ${SOFA_PROXY_URL}`);
  strategies.push('curl → sofascore.app/com');
  strategies.push('Stale cache (10min)');

  console.log(`
  ⚽ BongDa365 v5.1 - http://localhost:${PORT}

  SofaScore Fetch Chain (${strategies.length} strategies):
    ${strategies.map((s, i) => `${i + 1}. ${s}`).join('\n    ')}

  Architecture: Event Bus + SPA Router
    SofaScore ──→ Detector ──→ Event Bus ──→ Commentary Engine
                                          ──→ Prediction Engine
                                          ──→ Socket.io (Chat + UI)
                                          ──→ Ngựa Tiên Tri (Mascot)

  Poll: Live ${POLL_MS/1000}s | Incidents ${INCIDENT_POLL_MS/1000}s | Stats ${STAT_POLL_MS/1000}s
  Health: http://localhost:${PORT}/health
  `);
});
