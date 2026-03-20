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
      desc: 'Dự đoán tỉ số bóng đá bằng AI Ngựa Tiên Tri. Xác suất thắng/thua/hòa, tài/xỉu, BTTS cập nhật real-time.',
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

// Listen for kickoff to build context
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
  }
});

// ── SofaScore Polling ──
let cachedLive = null;

// Proxy URL: if SOFA_PROXY_URL is set, route API calls through local proxy (bypasses Cloudflare)
// Otherwise fall back to direct SofaScore API (works from home IP, blocked from datacenter IPs)
const SOFA_PROXY_URL = process.env.SOFA_PROXY_URL || null;

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
  // If SOFA_PROXY_URL is set, route through local proxy (home IP, not blocked)
  if (SOFA_PROXY_URL) return fetchViaProxy(urlPath);
  return fetchDirect(urlPath);
}

// Route through local Cloudflare Tunnel proxy
function fetchViaProxy(urlPath) {
  return new Promise((resolve, reject) => {
    const proxyUrl = new URL(SOFA_PROXY_URL + urlPath);
    const mod = proxyUrl.protocol === 'https:' ? https : http;
    const req = mod.get(proxyUrl.href, { headers: { 'Accept': '*/*' } }, res => {
      if (res.statusCode === 304) { resolve(null); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('proxy timeout')); });
  });
}

// Direct to SofaScore (works from home IP, blocked from datacenter)
function fetchDirect(urlPath) {
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
      const encoding = res.headers['content-encoding'];
      let stream = res;
      if (encoding === 'gzip') { const zlib = require('zlib'); stream = res.pipe(zlib.createGunzip()); }
      else if (encoding === 'br') { const zlib = require('zlib'); stream = res.pipe(zlib.createBrotliDecompress()); }
      else if (encoding === 'deflate') { const zlib = require('zlib'); stream = res.pipe(zlib.createInflate()); }
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

    // Push full data to all clients (no re-fetch needed)
    io.emit('live_update', { ts: Date.now(), count: events.length, events });
  } catch (e) { /* silent */ }
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
  ⚽ BongDa365 v5.0 - http://localhost:${PORT}

  Architecture: Event Bus + SPA Router
    SofaScore ──→ Detector ──→ Event Bus ──→ Commentary Engine
                                          ──→ Prediction Engine
                                          ──→ Socket.io (Chat + UI)
                                          ──→ Ngựa Tiên Tri (Mascot)

  Pages: Live | Match Detail | League | Team | Player | Search
  Poll: Live ${POLL_MS/1000}s | Incidents ${INCIDENT_POLL_MS/1000}s | Stats ${STAT_POLL_MS/1000}s
  Optimized: Socket.io push + perMessageDeflate + priority incident polling
  Features: AI Commentary | Predictions | Chat | Viral Cards
  `);
});
