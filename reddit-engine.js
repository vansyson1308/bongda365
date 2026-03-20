// BongDa365 — Reddit Community Engine
// Monitors r/soccer for trending topics, transfer scoops, fan reactions
// Uses Reddit's public JSON API (no auth needed for read-only)

const https = require('https');

// ═══ CONFIG ═══
const POLL_INTERVAL = 90 * 1000; // 90 seconds
const MAX_POSTS = 200;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TRANSLATE_DELAY = 2000;

// Subreddits to monitor
const SUBREDDITS = [
  { name: 'soccer', label: 'r/soccer', priority: 1 },
];

// ═══ CATEGORY DETECTION ═══
const REDDIT_CATEGORIES = [
  { pattern: /\[(?:fabrizio romano|romano|ornstein|david ornstein|here we go|comunicado oficial|official)\]/i, category: 'insider', label: 'Tin nội bộ' },
  { pattern: /(?:transfer|sign(?:s|ed|ing)|deal|loan|fee|bid|offer|contract|announcement|confirmed|welcome|joins)/i, category: 'transfers', label: 'Chuyển nhượng' },
  { pattern: /(?:match thread|post.?match|pre.?match|score|FT:|HT:|\d+-\d+)/i, category: 'match', label: 'Trận đấu' },
  { pattern: /(?:goal|assist|hat.?trick|brace|bicycle|volley|free.?kick|penalty|red card)/i, category: 'highlights', label: 'Highlight' },
  { pattern: /(?:injur|sideline|ruled out|miss|surgery|recovery|setback|ACL|hamstring|knee)/i, category: 'injuries', label: 'Chấn thương' },
  { pattern: /(?:sack|fired|resign|appoint|new manager|new coach|take charge)/i, category: 'manager', label: 'HLV' },
  { pattern: /(?:stat|record|first time|most|least|only|ever|history|since \d{4}|consecutive)/i, category: 'stats', label: 'Thống kê' },
  { pattern: /(?:controversy|var|referee|offside|penalty|dive|cheat|disgrace|shambles)/i, category: 'controversy', label: 'Tranh cãi' },
  { pattern: /(?:fan|supporters?|atmosphere|tifo|chant|protest|banner)/i, category: 'fan-culture', label: 'Văn hóa CĐV' },
];

// Detect if post is about a top league
const LEAGUE_PATTERNS = {
  'premier-league': /premier league|epl|man(?:chester)?\s*(?:city|united|utd)|arsenal|chelsea|liverpool|tottenham|spurs|newcastle|aston villa|west ham|brighton|everton|wolves|nottingham|crystal palace/i,
  'la-liga': /la liga|real madrid|barcelona|barca|atletico|athletic bilbao|real sociedad|villarreal|betis|sevilla/i,
  'serie-a': /serie a|juventus|inter|milan|napoli|roma|lazio|atalanta|fiorentina|bologna/i,
  'bundesliga': /bundesliga|bayern|dortmund|leverkusen|leipzig|frankfurt|wolfsburg|stuttgart/i,
  'ligue-1': /ligue 1|psg|paris|marseille|lyon|monaco|lille/i,
  'champions-league': /champions league|ucl|group stage|knockout|quarterfinal|semifinal/i,
};

// ═══ IN-MEMORY STORE ═══
const posts = new Map(); // id -> post
const trendingCache = { posts: [], ts: 0 };
let translateQueue = [];
let translating = false;

// ═══ REDDIT FETCH (public JSON endpoint, no auth needed) ═══
function fetchReddit(path, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(`https://www.reddit.com${path}`);
    // Add raw_json to get unescaped content
    if (!fullUrl.searchParams.has('raw_json')) fullUrl.searchParams.set('raw_json', '1');

    const options = {
      hostname: fullUrl.hostname,
      path: fullUrl.pathname + fullUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'BongDa365:v1.0 (by /u/bongda365bot)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      timeout,
    };

    const req = https.request(options, res => {
      if (res.statusCode === 429) {
        console.log('[Reddit] Rate limited, backing off');
        res.resume();
        return reject(new Error('rate_limited'));
      }
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(null); // Don't follow Reddit redirects
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
        } catch (e) {
          reject(new Error('JSON parse error'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ═══ TRANSLATION (Google Translate) ═══
function translateText(text) {
  return new Promise((resolve, reject) => {
    if (!text || text.length < 5) return resolve(text);
    const encoded = encodeURIComponent(text.slice(0, 1000));
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encoded}`;
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
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
        } catch (e) { reject(e); }
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
    const postId = translateQueue.shift();
    const post = posts.get(postId);
    if (!post || post.titleVi) continue;

    try {
      post.titleVi = await translateText(post.title);
      if (post.selftext) {
        post.selftextVi = await translateText(post.selftext.slice(0, 500));
      }
    } catch (e) {
      post.titleVi = post.title; // Keep English on failure
    }

    await new Promise(r => setTimeout(r, TRANSLATE_DELAY));
  }

  translating = false;
}

// ═══ DETECT CATEGORY & LEAGUES ═══
function detectCategory(title) {
  for (const rule of REDDIT_CATEGORIES) {
    if (rule.pattern.test(title)) return { category: rule.category, label: rule.label };
  }
  return { category: 'general', label: 'Tổng hợp' };
}

function detectLeagues(title) {
  const tags = [];
  for (const [league, pattern] of Object.entries(LEAGUE_PATTERNS)) {
    if (pattern.test(title)) tags.push(league);
  }
  return tags;
}

// ═══ TRENDING DETECTION ═══
// Upvote velocity = score / age_in_hours — measures how fast a post is rising
function calculateTrendScore(post) {
  const ageHours = Math.max(0.1, (Date.now() / 1000 - post.createdUtc) / 3600);
  const upvoteVelocity = post.score / ageHours;
  const commentVelocity = post.numComments / ageHours;

  // Weight: upvotes matter most, comments add bonus
  return upvoteVelocity + commentVelocity * 0.3;
}

function isInsiderScoop(title) {
  return /\[(?:fabrizio romano|romano|ornstein|here we go|comunicado oficial|official|confirmed)\]/i.test(title);
}

// ═══ FETCH & PROCESS ═══
async function fetchSubreddit(sub) {
  try {
    // Fetch hot + new for comprehensive coverage
    const [hot, rising] = await Promise.all([
      fetchReddit(`/r/${sub.name}/hot.json?limit=50`).catch(() => null),
      fetchReddit(`/r/${sub.name}/rising.json?limit=25`).catch(() => null),
    ]);

    let newCount = 0;
    const allData = [];
    if (hot?.data?.children) allData.push(...hot.data.children);
    if (rising?.data?.children) allData.push(...rising.data.children);

    for (const child of allData) {
      const d = child.data;
      if (!d || d.stickied || d.is_self === undefined) continue;

      const id = `reddit_${d.id}`;
      if (posts.has(id)) {
        // Update score for existing posts
        const existing = posts.get(id);
        existing.score = d.score;
        existing.numComments = d.num_comments;
        existing.upvoteRatio = d.upvote_ratio;
        continue;
      }

      const { category, label } = detectCategory(d.title);
      const leagueTags = detectLeagues(d.title);

      const post = {
        id,
        redditId: d.id,
        title: d.title,
        titleVi: null,
        selftext: d.selftext ? d.selftext.slice(0, 500) : '',
        selftextVi: null,
        author: d.author,
        score: d.score,
        numComments: d.num_comments,
        upvoteRatio: d.upvote_ratio || 0,
        url: d.url,
        permalink: `https://www.reddit.com${d.permalink}`,
        thumbnail: d.thumbnail && d.thumbnail.startsWith('http') ? d.thumbnail : null,
        subreddit: sub.name,
        category,
        categoryLabel: label,
        leagueTags,
        isInsider: isInsiderScoop(d.title),
        isNSFW: d.over_18 || false,
        createdUtc: d.created_utc,
        fetchedAt: Date.now(),
        trendScore: 0,
        source: 'reddit',
      };

      // Skip NSFW and very low-quality posts
      if (post.isNSFW) continue;
      if (post.score < 10 && !post.isInsider) continue;

      post.trendScore = calculateTrendScore(post);
      posts.set(id, post);
      translateQueue.push(id);
      newCount++;
    }

    if (newCount > 0) {
      console.log(`[Reddit] r/${sub.name}: +${newCount} new posts (total: ${posts.size})`);
    }

    processTranslateQueue();
  } catch (e) {
    if (e.message === 'rate_limited') {
      console.log('[Reddit] Rate limited, will retry next cycle');
    } else {
      console.log(`[Reddit] Failed to fetch r/${sub.name}: ${e.message}`);
    }
  }
}

// ═══ EVICTION ═══
function evictOld() {
  const now = Date.now();
  let evicted = 0;
  for (const [id, post] of posts) {
    if (now - post.fetchedAt > TTL_MS) {
      posts.delete(id);
      evicted++;
    }
  }
  if (posts.size > MAX_POSTS) {
    const sorted = [...posts.entries()].sort((a, b) => a[1].score - b[1].score);
    const toRemove = sorted.slice(0, posts.size - MAX_POSTS);
    for (const [id] of toRemove) {
      posts.delete(id);
      evicted++;
    }
  }
  if (evicted > 0) console.log(`[Reddit] Evicted ${evicted} old posts (remaining: ${posts.size})`);
}

// ═══ PUBLIC API ═══
function getPosts(opts = {}) {
  const { page = 1, limit = 20, category = null, league = null, sort = 'trending' } = opts;
  let list = [...posts.values()].filter(p => p.titleVi);

  if (category && category !== 'all') {
    list = list.filter(p => p.category === category);
  }
  if (league) {
    list = list.filter(p => p.leagueTags.includes(league));
  }

  // Sort
  if (sort === 'trending') {
    list.sort((a, b) => b.trendScore - a.trendScore);
  } else if (sort === 'hot') {
    list.sort((a, b) => b.score - a.score);
  } else if (sort === 'new') {
    list.sort((a, b) => b.createdUtc - a.createdUtc);
  }

  const total = list.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  return { posts: list.slice(start, start + limit), total, page, pages };
}

function getTrending(limit = 10) {
  // Recalculate trend scores
  for (const [, post] of posts) {
    post.trendScore = calculateTrendScore(post);
  }
  return [...posts.values()]
    .filter(p => p.titleVi)
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, limit);
}

function getInsiderScoops(limit = 10) {
  return [...posts.values()]
    .filter(p => p.isInsider && p.titleVi)
    .sort((a, b) => b.createdUtc - a.createdUtc)
    .slice(0, limit);
}

function getByCategory(category, limit = 20) {
  return [...posts.values()]
    .filter(p => p.category === category && p.titleVi)
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, limit);
}

function getPost(id) {
  return posts.get(id) || null;
}

function getCount() { return posts.size; }

// All unique categories with counts
function getCategories() {
  const counts = {};
  for (const [, post] of posts) {
    const c = post.category;
    counts[c] = (counts[c] || 0) + 1;
  }
  const result = [];
  for (const rule of REDDIT_CATEGORIES) {
    if (counts[rule.category]) {
      result.push({ category: rule.category, label: rule.label, count: counts[rule.category] });
    }
  }
  if (counts.general) {
    result.push({ category: 'general', label: 'Tổng hợp', count: counts.general });
  }
  return result;
}

// ═══ START POLLING ═══
async function start() {
  console.log('[Reddit] Starting community engine...');
  for (const sub of SUBREDDITS) {
    await fetchSubreddit(sub);
  }
  console.log(`[Reddit] Initial fetch complete. ${posts.size} posts loaded.`);

  // Poll every 90 seconds
  setInterval(() => {
    for (const sub of SUBREDDITS) {
      fetchSubreddit(sub);
    }
    evictOld();
  }, POLL_INTERVAL);
}

module.exports = {
  start,
  getPosts,
  getTrending,
  getInsiderScoops,
  getByCategory,
  getPost,
  getCount,
  getCategories,
};
