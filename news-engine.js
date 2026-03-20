// BongDa365 — News Engine: RSS fetch → parse → translate → cache
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// ═══ RSS SOURCES ═══
const SOURCES = [
  { key: 'bbc', name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { key: 'espn', name: 'ESPN', url: 'https://www.espn.com/espn/rss/soccer/news' },
  { key: 'sky', name: 'Sky Sports', url: 'https://www.skysports.com/rss/12040' },
];

const POLL_INTERVAL = 15 * 60 * 1000; // 15 minutes
const MAX_ARTICLES = 200;
const TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
const TRANSLATE_DELAY = 2000; // 2s between translation calls

// ═══ CATEGORY DETECTION ═══
const CATEGORY_RULES = [
  { pattern: /transfer|sign(s|ed|ing)|deal|move[sd]?|bid|offer|loan|fee|contract|swap|departure|arrival|target|pursuit|swap/i, category: 'transfers' },
  { pattern: /injur|hurt|sideline[d]?|miss(es|ing)?|fitness|knee|hamstring|ankle|muscle|surgery|recovery|setback|blow|ruled out|doubt/i, category: 'injuries' },
  { pattern: /preview|ahead|build.?up|face[sd]?|host[sd]?|travel|clash|showdown|derby|fixture|upcoming|prepare/i, category: 'match-preview' },
  { pattern: /result|recap|beat|defeat(ed)?|win[s]?|won|draw[sn]?|drew|los[et]|thrash|rout|hammer|cruise|edge|snatch|stun/i, category: 'match-review' },
];

const CATEGORY_VI = {
  'transfers': 'Chuyển nhượng',
  'injuries': 'Chấn thương',
  'match-preview': 'Trước trận',
  'match-review': 'Sau trận',
  'general': 'Tổng hợp',
};

// ═══ LEAGUE TAGGING ═══
const LEAGUE_KEYWORDS = {
  'premier-league': /premier league|epl|english premier|man(chester)?\s*(city|united|utd)|arsenal|chelsea|liverpool|tottenham|spurs|newcastle|aston villa|west ham|brighton|everton|wolves|fulham|bournemouth|crystal palace|brentford|nottingham forest|ipswich|leicester|southampton/i,
  'la-liga': /la liga|spanish|real madrid|barcelona|barca|atletico madrid|athletic bilbao|real sociedad|villarreal|betis|sevilla|valencia|celta vigo|getafe|osasuna|mallorca|cadiz|almeria|alaves|las palmas|girona/i,
  'serie-a': /serie a|italian|juventus|inter milan|ac milan|napoli|roma|lazio|atalanta|fiorentina|torino|bologna|monza|udinese|sassuolo|empoli|cagliari|frosinone|lecce|genoa|verona|salernitana/i,
  'bundesliga': /bundesliga|german|bayern munich|borussia dortmund|bvb|rb leipzig|bayer leverkusen|eintracht frankfurt|wolfsburg|freiburg|hoffenheim|union berlin|stuttgart|werder bremen|augsburg|mainz|gladbach|koln|heidenheim|darmstadt/i,
  'ligue-1': /ligue 1|french|psg|paris saint.germain|marseille|lyon|monaco|lille|nice|lens|rennes|strasbourg|toulouse|montpellier|reims|nantes|lorient|metz|clermont|le havre|brest/i,
  'champions-league': /champions league|ucl|european cup|group stage|knockout|quarter.?final|semi.?final|round of 16/i,
  'europa-league': /europa league|uel|conference league|uecl/i,
};

// ═══ IN-MEMORY STORE ═══
const articles = new Map(); // id -> article
let translateQueue = [];
let translating = false;

// ═══ HTTP FETCH ═══
function fetchURL(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/xml, application/rss+xml, application/xml, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout,
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location, timeout).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ═══ RSS XML PARSER ═══
function parseRSS(xml, source) {
  const items = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link') || extractGuid(block);
    const description = stripHTML(extractTag(block, 'description') || '');
    const pubDate = extractTag(block, 'pubDate');
    const imageUrl = extractImage(block);

    if (!title || !link) continue;

    const id = source.key + '-' + crypto.createHash('md5').update(link).digest('hex').slice(0, 10);
    const summary = description.slice(0, 300);

    items.push({
      id,
      title: decodeEntities(title),
      titleVi: null,
      summary: decodeEntities(summary),
      summaryVi: null,
      source: source.name,
      sourceKey: source.key,
      link,
      imageUrl,
      pubDate: pubDate ? new Date(pubDate).getTime() : Date.now(),
      category: detectCategory(title + ' ' + summary),
      leagueTags: detectLeagues(title + ' ' + summary),
      fetchedAt: Date.now(),
    });
  }

  return items;
}

function extractTag(block, tag) {
  // Handle CDATA: <title><![CDATA[...]]></title>
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
  const cdataMatch = block.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();

  // Plain text
  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const plainMatch = block.match(plainRe);
  return plainMatch ? plainMatch[1].trim() : null;
}

function extractGuid(block) {
  return extractTag(block, 'guid');
}

function extractImage(block) {
  // <media:thumbnail url="..."/>
  const mediaThumbnail = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  if (mediaThumbnail) return mediaThumbnail[1];

  // <media:content url="..." medium="image"/>
  const mediaContent = block.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*medium=["']image["']/i);
  if (mediaContent) return mediaContent[1];

  // <media:content url="..."/> (without medium)
  const mediaAny = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (mediaAny) return mediaAny[1];

  // <enclosure url="..." type="image/..."/>
  const enclosure = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\//i);
  if (enclosure) return enclosure[1];

  // <image><url>...</url></image>
  const imgUrl = block.match(/<image>[\s\S]*?<url>([^<]+)<\/url>/i);
  if (imgUrl) return imgUrl[1];

  return null;
}

function stripHTML(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// ═══ CATEGORY & LEAGUE DETECTION ═══
function detectCategory(text) {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  return 'general';
}

function detectLeagues(text) {
  const tags = [];
  for (const [league, pattern] of Object.entries(LEAGUE_KEYWORDS)) {
    if (pattern.test(text)) tags.push(league);
  }
  return tags;
}

// ═══ TRANSLATION (Google Translate unofficial) ═══
function translateText(text) {
  return new Promise((resolve, reject) => {
    if (!text || text.length < 3) return resolve(text);
    const encoded = encodeURIComponent(text.slice(0, 1000));
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encoded}`;

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          const parsed = JSON.parse(body);
          const translated = parsed[0].map(s => s[0]).join('');
          resolve(translated);
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('translate timeout')); });
  });
}

async function processTranslateQueue() {
  if (translating || translateQueue.length === 0) return;
  translating = true;

  while (translateQueue.length > 0) {
    const articleId = translateQueue.shift();
    const article = articles.get(articleId);
    if (!article || article.titleVi) continue; // already translated or deleted

    try {
      // Combine title + summary with separator for single API call
      const combined = article.title + ' ||| ' + article.summary;
      const translated = await translateText(combined);
      const parts = translated.split(' ||| ');
      article.titleVi = parts[0] || article.title;
      article.summaryVi = (parts[1] || article.summary).trim();
    } catch (e) {
      // Fallback: keep English with prefix
      article.titleVi = '[EN] ' + article.title;
      article.summaryVi = '[EN] ' + article.summary;
      console.log(`[News] Translation failed for ${articleId}: ${e.message}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, TRANSLATE_DELAY));
  }

  translating = false;
}

// ═══ FETCH & PROCESS ONE SOURCE ═══
async function fetchSource(source) {
  try {
    const xml = await fetchURL(source.url);
    const items = parseRSS(xml, source);
    let newCount = 0;

    for (const item of items) {
      if (articles.has(item.id)) continue; // skip duplicates
      // Check title similarity to avoid near-duplicate from different sources
      if (isDuplicate(item.title)) continue;

      articles.set(item.id, item);
      translateQueue.push(item.id);
      newCount++;
    }

    if (newCount > 0) {
      console.log(`[News] ${source.name}: +${newCount} new articles (total: ${articles.size})`);
    }

    // Trigger translation
    processTranslateQueue();
  } catch (e) {
    console.log(`[News] Failed to fetch ${source.name}: ${e.message}`);
  }
}

function isDuplicate(title) {
  const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  for (const [, existing] of articles) {
    const existNorm = existing.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (existNorm === normalized) return true;
    // Simple similarity: first 40 chars match
    if (normalized.slice(0, 40) === existNorm.slice(0, 40) && normalized.length > 20) return true;
  }
  return false;
}

// ═══ EVICTION ═══
function evictOld() {
  const now = Date.now();
  let evicted = 0;
  for (const [id, article] of articles) {
    if (now - article.fetchedAt > TTL_MS) {
      articles.delete(id);
      evicted++;
    }
  }

  // Cap at MAX_ARTICLES: remove oldest first
  if (articles.size > MAX_ARTICLES) {
    const sorted = [...articles.entries()].sort((a, b) => a[1].pubDate - b[1].pubDate);
    const toRemove = sorted.slice(0, articles.size - MAX_ARTICLES);
    for (const [id] of toRemove) {
      articles.delete(id);
      evicted++;
    }
  }

  if (evicted > 0) console.log(`[News] Evicted ${evicted} old articles (remaining: ${articles.size})`);
}

// ═══ PUBLIC API ═══
function getArticles(opts = {}) {
  const { page = 1, limit = 20, category = null } = opts;

  let list = [...articles.values()]
    .filter(a => a.titleVi) // only show translated articles
    .sort((a, b) => b.pubDate - a.pubDate);

  if (category && category !== 'all') {
    list = list.filter(a => a.category === category);
  }

  const total = list.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const pageArticles = list.slice(start, start + limit);

  return {
    articles: pageArticles,
    total,
    page,
    pages,
  };
}

function getArticle(id) {
  return articles.get(id) || null;
}

function getCount() {
  return articles.size;
}

function getLatest(n = 5) {
  return [...articles.values()]
    .filter(a => a.titleVi)
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, n);
}

// ═══ START POLLING ═══
async function start() {
  console.log('[News] Starting news engine...');

  // Fetch all sources immediately on startup (sequential with small gap)
  for (let i = 0; i < SOURCES.length; i++) {
    await fetchSource(SOURCES[i]);
    if (i < SOURCES.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`[News] Initial fetch complete. ${articles.size} articles loaded.`);

  // Stagger polling: each source at different offset
  SOURCES.forEach((source, i) => {
    const offset = i * 5 * 60 * 1000; // 0, 5min, 10min offset
    setTimeout(() => {
      setInterval(() => {
        fetchSource(source);
        evictOld();
      }, POLL_INTERVAL);
    }, offset);
  });
}

module.exports = { start, getArticles, getArticle, getCount, getLatest, CATEGORY_VI };
