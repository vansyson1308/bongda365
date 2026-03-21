// BongDa365 — News Engine: RSS fetch → parse → translate → cache
// v2: Full article scraping + chunked translation for complete Vietnamese articles
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// ═══ RSS SOURCES ═══
const SOURCES = [
  { key: 'bbc', name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { key: 'espn', name: 'ESPN', url: 'https://www.espn.com/espn/rss/soccer/news' },
  { key: 'sky', name: 'Sky Sports', url: 'https://www.skysports.com/rss/12040' },
  // Sprint 3: Enhanced sources — Google News for insider journalists + Guardian
  { key: 'guardian', name: 'The Guardian', url: 'https://www.theguardian.com/football/rss' },
  { key: 'gnews-romano', name: 'Fabrizio Romano (via GNews)', url: 'https://news.google.com/rss/search?q=%22Fabrizio+Romano%22+football&hl=en&gl=US&ceid=US:en', insider: true },
  { key: 'gnews-ornstein', name: 'David Ornstein (via GNews)', url: 'https://news.google.com/rss/search?q=%22David+Ornstein%22+football&hl=en&gl=US&ceid=US:en', insider: true },
  { key: 'gnews-transfers', name: 'Transfer News (via GNews)', url: 'https://news.google.com/rss/search?q=football+transfer+confirmed+2026&hl=en&gl=US&ceid=US:en' },
];

const POLL_INTERVAL = 15 * 60 * 1000; // 15 minutes
const MAX_ARTICLES = 500;
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
const pendingFullFetch = new Map(); // id -> Promise (dedup concurrent requests)

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
        const loc = res.headers.location;
        const fullLoc = loc.startsWith('http') ? loc : new URL(loc, url).href;
        return fetchURL(fullLoc, timeout).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
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

  // Detect Atom feed (Google News uses Atom)
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');

  if (isAtom) {
    return parseAtomFeed(xml, source);
  }

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
      isInsider: !!source.insider,
      // v2: full article fields (lazy-loaded)
      contentVi: null,       // string[] — Vietnamese paragraphs
      contentStatus: null,   // null | 'fetching' | 'ready' | 'failed'
    });
  }

  return items;
}

// Parse Atom feed (Google News format)
function parseAtomFeed(xml, source) {
  const items = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const rawTitle = extractTag(block, 'title') || '';
    const title = stripHTML(decodeEntities(rawTitle));

    // Atom uses <link href="..."/> (self-closing)
    const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
    const link = linkMatch ? linkMatch[1] : '';

    const published = extractTag(block, 'published') || extractTag(block, 'updated') || '';
    const contentBlock = extractTag(block, 'content') || extractTag(block, 'summary') || '';
    const description = stripHTML(decodeEntities(contentBlock)).slice(0, 300);

    // Google News includes the original source in the title: "Article Title - Source Name"
    let cleanTitle = title;
    let originalSource = '';
    const sourceSplit = title.lastIndexOf(' - ');
    if (sourceSplit > 20) {
      cleanTitle = title.substring(0, sourceSplit).trim();
      originalSource = title.substring(sourceSplit + 3).trim();
    }

    if (!cleanTitle || !link) continue;

    const id = source.key + '-' + crypto.createHash('md5').update(link).digest('hex').slice(0, 10);

    items.push({
      id,
      title: cleanTitle,
      titleVi: null,
      summary: description || cleanTitle,
      summaryVi: null,
      source: originalSource || source.name,
      sourceKey: source.key,
      link,
      imageUrl: null,
      pubDate: published ? new Date(published).getTime() : Date.now(),
      category: detectCategory(cleanTitle + ' ' + description),
      leagueTags: detectLeagues(cleanTitle + ' ' + description),
      fetchedAt: Date.now(),
      isInsider: !!source.insider,
      contentVi: null,
      contentStatus: null,
    });
  }

  return items;
}

function extractTag(block, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
  const cdataMatch = block.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();
  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const plainMatch = block.match(plainRe);
  return plainMatch ? plainMatch[1].trim() : null;
}

function extractGuid(block) { return extractTag(block, 'guid'); }

function extractImage(block) {
  const mediaThumbnail = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  if (mediaThumbnail) return mediaThumbnail[1];
  const mediaContent = block.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*medium=["']image["']/i);
  if (mediaContent) return mediaContent[1];
  const mediaAny = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (mediaAny) return mediaAny[1];
  const enclosure = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\//i);
  if (enclosure) return enclosure[1];
  const imgUrl = block.match(/<image>[\s\S]*?<url>([^<]+)<\/url>/i);
  if (imgUrl) return imgUrl[1];
  return null;
}

function stripHTML(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
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

// ═══════════════════════════════════════════════════════
//  FULL ARTICLE SCRAPING (v2)
// ═══════════════════════════════════════════════════════

// ── Source-specific content extractors ──

function extractBBCContent(html) {
  // BBC uses <article> with text blocks containing <p>
  // Also try data-component="text-block" pattern
  let articleBlock = '';
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) articleBlock = articleMatch[1];
  else articleBlock = html; // fallback to full page

  // Extract paragraphs from text-block components or direct <p> in article
  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRegex.exec(articleBlock)) !== null) {
    const text = stripHTML(decodeEntities(m[1])).trim();
    if (text.length > 30) paragraphs.push(text);
  }
  return paragraphs;
}

function extractESPNContent(html) {
  // ESPN: article-body, story-body, or article__body
  let contentBlock = '';
  const bodyMatch = html.match(/<div[^>]*class="[^"]*(?:article-body|story-body|article__body|ArticleBody)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<div[^>]*class="[^"]*(?:article-footer|story-footer))/i);
  if (bodyMatch) contentBlock = bodyMatch[1];
  else {
    // Try broader: find main content area
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) contentBlock = mainMatch[1];
    else contentBlock = html;
  }

  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRegex.exec(contentBlock)) !== null) {
    const text = stripHTML(decodeEntities(m[1])).trim();
    if (text.length > 30) paragraphs.push(text);
  }
  return paragraphs;
}

function extractSkyContent(html) {
  // Sky Sports: sdc-article-body or article__body
  let contentBlock = '';
  const bodyMatch = html.match(/<div[^>]*class="[^"]*(?:sdc-article-body|article__body|sdc-article-main)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (bodyMatch) contentBlock = bodyMatch[1];
  else {
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) contentBlock = articleMatch[1];
    else contentBlock = html;
  }

  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRegex.exec(contentBlock)) !== null) {
    const text = stripHTML(decodeEntities(m[1])).trim();
    if (text.length > 30) paragraphs.push(text);
  }
  return paragraphs;
}

function extractGuardianContent(html) {
  // Guardian uses <div class="article-body-commercial-selector"> or dcr-article
  let contentBlock = '';
  const bodyMatch = html.match(/<div[^>]*class="[^"]*(?:article-body|content__article-body|dcr-)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<aside|<footer|<div[^>]*class="[^"]*(?:after-article|submeta))/i);
  if (bodyMatch) contentBlock = bodyMatch[1];
  else {
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) contentBlock = mainMatch[1];
    else contentBlock = html;
  }

  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRegex.exec(contentBlock)) !== null) {
    const text = stripHTML(decodeEntities(m[1])).trim();
    if (text.length > 30) paragraphs.push(text);
  }
  return paragraphs;
}

// ── Generic fallback: works for any news site ──
function extractGenericContent(html) {
  // 1. Strip non-content elements
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 2. Extract ALL <p> tags
  const allParagraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRegex.exec(clean)) !== null) {
    const text = stripHTML(decodeEntities(m[1])).trim();
    if (text.length > 40) allParagraphs.push(text);
  }

  if (allParagraphs.length === 0) return [];

  // 3. Find the largest cluster of consecutive paragraphs (heuristic for article body)
  // Score paragraphs: longer = more likely content, short = navigation/footer
  const scored = allParagraphs.filter(p => {
    // Filter out common non-content patterns
    if (/^(share|tweet|email|print|subscribe|follow|sign up|copyright|all rights|terms|privacy|cookie)/i.test(p)) return false;
    if (/^(advertisement|sponsored|promoted|related|more from|read more|see also|click here)/i.test(p)) return false;
    return true;
  });

  return scored.length >= 2 ? scored : allParagraphs;
}

// ── Main scrape function ──
async function scrapeArticleContent(url, sourceKey) {
  const html = await fetchURL(url, 20000);

  let paragraphs = [];
  switch (sourceKey) {
    case 'bbc': paragraphs = extractBBCContent(html); break;
    case 'espn': paragraphs = extractESPNContent(html); break;
    case 'sky': paragraphs = extractSkyContent(html); break;
    case 'guardian': paragraphs = extractGuardianContent(html); break;
    default: paragraphs = extractGenericContent(html);
  }

  // If source-specific extractor got too few results, try generic
  if (paragraphs.length < 3) {
    const generic = extractGenericContent(html);
    if (generic.length > paragraphs.length) paragraphs = generic;
  }

  // Cap at 30 paragraphs to avoid extremely long articles
  return paragraphs.slice(0, 30);
}

// ═══════════════════════════════════════════════════════
//  CHUNKED TRANSLATION (v2)
// ═══════════════════════════════════════════════════════

async function translateParagraphs(paragraphs) {
  if (!paragraphs || paragraphs.length === 0) return [];

  const CHUNK_LIMIT = 900; // chars per chunk (leave margin under 1000)
  const SEPARATOR = ' ||| ';
  const result = [];

  // Group paragraphs into chunks
  const chunks = [];
  let currentChunk = [];
  let currentLen = 0;

  for (const p of paragraphs) {
    const pLen = p.length + SEPARATOR.length;
    if (currentLen + pLen > CHUNK_LIMIT && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLen = 0;
    }
    // Single paragraph too long? Split it
    if (p.length > CHUNK_LIMIT) {
      if (currentChunk.length > 0) { chunks.push(currentChunk); currentChunk = []; currentLen = 0; }
      // Break long paragraph into ~800 char pieces at sentence boundaries
      const sentences = p.match(/[^.!?]+[.!?]+\s*/g) || [p];
      let piece = '';
      for (const s of sentences) {
        if (piece.length + s.length > 800 && piece.length > 0) {
          chunks.push([piece.trim()]);
          piece = '';
        }
        piece += s;
      }
      if (piece.trim()) chunks.push([piece.trim()]);
      continue;
    }
    currentChunk.push(p);
    currentLen += pLen;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  // Translate each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const combined = chunk.join(SEPARATOR);

    try {
      const translated = await translateText(combined);
      const parts = translated.split(/\s*\|\|\|\s*/);
      // Map translated parts back to paragraphs
      for (let j = 0; j < chunk.length; j++) {
        result.push((parts[j] || chunk[j]).trim());
      }
    } catch (e) {
      // Fallback: keep English for this chunk
      console.log(`[News] Chunk translation failed (${i+1}/${chunks.length}): ${e.message}`);
      for (const p of chunk) result.push(p);
    }

    // Rate limit between chunks
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, TRANSLATE_DELAY));
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════
//  LAZY FULL ARTICLE FETCH (v2)
// ═══════════════════════════════════════════════════════

async function getFullArticle(id) {
  const article = articles.get(id);
  if (!article) return null;

  // Already has full content
  if (article.contentStatus === 'ready') return article;

  // Already being fetched — wait for the same promise (dedup)
  if (pendingFullFetch.has(id)) {
    await pendingFullFetch.get(id);
    return articles.get(id);
  }

  // Start fetching full content
  const fetchPromise = (async () => {
    article.contentStatus = 'fetching';
    try {
      console.log(`[News] Scraping full article: ${article.title.slice(0, 60)}...`);
      const paragraphs = await scrapeArticleContent(article.link, article.sourceKey);

      if (paragraphs.length < 2) {
        // Too little content scraped — mark as failed, use summary
        article.contentStatus = 'failed';
        article.contentVi = [article.summaryVi || article.summary];
        console.log(`[News] Scrape got too few paragraphs (${paragraphs.length}), using summary`);
        return;
      }

      console.log(`[News] Translating ${paragraphs.length} paragraphs (${paragraphs.join('').length} chars)...`);
      const translated = await translateParagraphs(paragraphs);
      article.contentVi = translated;
      // Rewrite full content into unique Vietnamese editorial style
      article.rewritten = false; // Reset so rewriteContent processes contentVi
      rewriteContent(article);
      article.contentStatus = 'ready';
      console.log(`[News] Full article ready (rewritten): ${article.id}`);
    } catch (e) {
      article.contentStatus = 'failed';
      article.contentVi = [article.summaryVi || article.summary];
      console.log(`[News] Full article fetch failed for ${article.id}: ${e.message}`);
    }
  })();

  pendingFullFetch.set(id, fetchPromise);
  await fetchPromise;
  pendingFullFetch.delete(id);

  return articles.get(id);
}

// ═══════════════════════════════════════════════════════
//  CONTENT UNIQUIFICATION LAYER
//  Transforms translated articles into unique Vietnamese editorial content
// ═══════════════════════════════════════════════════════

const CATEGORY_INTROS = {
  'transfers': [
    'Thị trường chuyển nhượng đang nóng lên với những diễn biến mới nhất.',
    'Tin chuyển nhượng hôm nay tiếp tục mang đến nhiều bất ngờ cho người hâm mộ.',
    'Làng bóng đá lại xôn xao với thông tin chuyển nhượng đáng chú ý.',
    'Những bước ngoặt mới trên thị trường chuyển nhượng vừa được hé lộ.',
    'Cánh cửa chuyển nhượng đang mở ra những cơ hội thú vị cho các đội bóng.',
    'Bản tin chuyển nhượng nóng hổi vừa được cập nhật với nhiều thay đổi đáng kể.',
    'Thị trường chuyển nhượng tiếp tục sôi động với hàng loạt thương vụ mới.',
  ],
  'injuries': [
    'Tin không vui cho người hâm mộ khi có thêm cập nhật về tình hình chấn thương.',
    'Phòng y tế lại truyền đi những tin tức đáng lo ngại cho các đội bóng.',
    'Vấn đề chấn thương tiếp tục là nỗi ám ảnh trong làng bóng đá.',
    'Tình hình nhân sự đang gặp khó khăn khi có thêm tin tức về chấn thương.',
    'Danh sách chấn thương lại dài thêm, ảnh hưởng không nhỏ đến kế hoạch của đội bóng.',
    'Cập nhật mới nhất từ phòng y tế khiến nhiều người hâm mộ lo lắng.',
  ],
  'match-preview': [
    'Trận đấu đáng chú ý sắp diễn ra, hứa hẹn nhiều kịch tính cho người hâm mộ.',
    'Một cuộc đối đầu hấp dẫn đang chờ đợi các cổ động viên trong thời gian tới.',
    'Sân cỏ sắp chứng kiến màn so tài được nhiều người mong chờ.',
    'Trước giờ bóng lăn, nhiều yếu tố thú vị đang được giới chuyên môn phân tích.',
    'Cuộc chạm trán sắp tới đang thu hút sự quan tâm lớn từ cộng đồng bóng đá.',
    'Không khí trước trận đấu đang nóng dần với nhiều dự đoán trái chiều.',
  ],
  'match-review': [
    'Kết quả đáng chú ý vừa được ghi nhận trên sân cỏ.',
    'Trận đấu vừa khép lại với những diễn biến đầy kịch tính.',
    'Sau tiếng còi kết thúc, nhiều điều đáng bàn luận từ trận đấu vừa qua.',
    'Kết quả trận đấu đã mang đến cung bậc cảm xúc khác nhau cho người hâm mộ.',
    'Sân cỏ vừa chứng kiến một trận đấu để lại nhiều dấu ấn.',
    'Những con số sau trận đấu phản ánh rõ nét diễn biến trên sân.',
  ],
  'general': [
    'BongDa365 cập nhật những tin tức bóng đá mới nhất cho bạn đọc.',
    'Tin tức bóng đá hôm nay tiếp tục mang đến những thông tin đáng chú ý.',
    'Thế giới bóng đá lại có thêm những diễn biến mới đáng quan tâm.',
    'Cập nhật nhanh những sự kiện nổi bật trong làng túc cầu.',
    'BongDa365 tổng hợp những thông tin bóng đá quan trọng nhất trong ngày.',
    'Làng bóng đá lại sôi động với những tin tức mới nhất vừa được ghi nhận.',
  ],
};

const TRANSITIONS = [
  'Cụ thể hơn, ',
  'Đáng chú ý, ',
  'Bên cạnh đó, ',
  'Ngoài ra, ',
  'Theo diễn biến mới nhất, ',
  'Điều đáng nói là ',
  'Không chỉ vậy, ',
  'Một khía cạnh khác cần lưu ý, ',
  'Về phía liên quan, ',
  'Trong bối cảnh đó, ',
];

const CONCLUSIONS = {
  'transfers': [
    'Nhận định BongDa365: Thương vụ này có thể tạo ra bước ngoặt quan trọng cho đội bóng trong thời gian tới. Người hâm mộ hãy tiếp tục theo dõi để cập nhật những diễn biến mới nhất.',
    'Nhận định BongDa365: Động thái chuyển nhượng này cho thấy tham vọng lớn của đội bóng và có thể thay đổi cục diện cạnh tranh ở giải đấu.',
    'Nhận định BongDa365: Nếu thương vụ thành công, đây sẽ là một bản hợp đồng có ý nghĩa chiến lược cả về chuyên môn lẫn thương mại.',
    'Nhận định BongDa365: Thị trường chuyển nhượng luôn đầy biến động, và thương vụ này chắc chắn sẽ còn nhiều diễn biến đáng theo dõi.',
    'Nhận định BongDa365: Đây là minh chứng cho thấy cuộc đua chuyển nhượng ngày càng khốc liệt giữa các đội bóng hàng đầu.',
  ],
  'injuries': [
    'Nhận định BongDa365: Chấn thương này có thể ảnh hưởng đáng kể đến lực lượng và kế hoạch chiến thuật của đội bóng trong các trận đấu tới.',
    'Nhận định BongDa365: Ban huấn luyện cần tìm phương án thay thế hợp lý để lấp vào khoảng trống do chấn thương để lại.',
    'Nhận định BongDa365: Vấn đề y tế trong bóng đá hiện đại ngày càng được quan tâm, và trường hợp này một lần nữa nhấn mạnh tầm quan trọng của việc quản lý thể lực cầu thủ.',
    'Nhận định BongDa365: Người hâm mộ hy vọng cầu thủ sớm hồi phục và trở lại sân cỏ trong trạng thái tốt nhất.',
    'Nhận định BongDa365: Tình hình chấn thương luôn là yếu tố khó lường, và đội bóng cần có chiều sâu đội hình để đối phó với những tình huống như thế này.',
  ],
  'match-preview': [
    'Nhận định BongDa365: Trận đấu này hứa hẹn sẽ rất hấp dẫn và khó đoán trước kết quả. Hãy cùng chờ đợi những diễn biến kịch tính trên sân.',
    'Nhận định BongDa365: Với phong độ hiện tại của cả hai đội, đây chắc chắn sẽ là một màn so tài đáng xem.',
    'Nhận định BongDa365: Yếu tố sân nhà và tinh thần thi đấu sẽ đóng vai trò quan trọng trong việc quyết định kết quả trận đấu.',
    'Nhận định BongDa365: Chiến thuật và sự chuẩn bị của ban huấn luyện sẽ là chìa khóa cho thành công trong trận đấu sắp tới.',
    'Nhận định BongDa365: Người hâm mộ không nên bỏ lỡ trận đấu này vì nó có thể ảnh hưởng lớn đến bảng xếp hạng.',
  ],
  'match-review': [
    'Nhận định BongDa365: Kết quả trận đấu phản ánh rõ sự chênh lệch về phong độ và chiến thuật giữa hai đội. Đây sẽ là bài học quý cho các trận đấu tiếp theo.',
    'Nhận định BongDa365: Trận đấu đã cho thấy nhiều điều về sức mạnh thực sự của các đội bóng và triển vọng của họ trong mùa giải.',
    'Nhận định BongDa365: Những gì diễn ra trên sân là minh chứng cho thấy bóng đá luôn đầy bất ngờ và không có gì là chắc chắn.',
    'Nhận định BongDa365: Kết quả này sẽ có tác động đáng kể đến cuộc đua tại giải đấu và tinh thần của cả hai đội bóng.',
    'Nhận định BongDa365: Sau trận đấu, cả hai đội đều có những bài học để rút ra trước khi bước vào những thử thách tiếp theo.',
  ],
  'general': [
    'Nhận định BongDa365: Đây là thông tin đáng chú ý mà người hâm mộ bóng đá nên theo dõi sát sao trong thời gian tới.',
    'Nhận định BongDa365: Sự kiện này có thể tạo ra những ảnh hưởng nhất định trong làng bóng đá, và BongDa365 sẽ tiếp tục cập nhật.',
    'Nhận định BongDa365: Thế giới bóng đá luôn vận động không ngừng, và chúng tôi sẽ đồng hành cùng bạn đọc để cập nhật mọi diễn biến.',
    'Nhận định BongDa365: Hãy tiếp tục theo dõi BongDa365 để không bỏ lỡ những tin tức bóng đá nóng hổi nhất.',
    'Nhận định BongDa365: Bóng đá không chỉ là trò chơi trên sân, mà còn là câu chuyện đằng sau mỗi sự kiện đáng để suy ngẫm.',
  ],
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Rewrite translated content into unique Vietnamese editorial style.
 * Called after translation for both summary and full articles.
 * @param {object} article - The article object (must have category, source, summaryVi or contentVi)
 * @returns {object} article - Modified in-place with rewritten content
 */
function rewriteContent(article) {
  const cat = article.category || 'general';
  const source = article.source || 'báo nước ngoài';

  // --- Rewrite summaryVi ---
  if (article.summaryVi && !article.rewritten) {
    const intro = pickRandom(CATEGORY_INTROS[cat] || CATEGORY_INTROS['general']);
    const attribution = `Theo nguồn tin từ ${source}, `;
    article.summaryVi = `${intro} ${attribution}${lowercaseFirst(article.summaryVi)}`;
  }

  // --- Rewrite contentVi (full article paragraphs) ---
  if (article.contentVi && article.contentVi.length >= 2) {
    const rewritten = [];

    // 1. Editorial intro paragraph
    const intro = pickRandom(CATEGORY_INTROS[cat] || CATEGORY_INTROS['general']);
    rewritten.push(intro);

    // 2. Source attribution on first content paragraph
    const attribution = `Theo nguồn tin từ ${source}, ${lowercaseFirst(article.contentVi[0])}`;
    rewritten.push(attribution);

    // 3. Restructure body paragraphs — group and interleave with transitions
    const body = article.contentVi.slice(1);

    // Shuffle middle paragraphs slightly (swap adjacent pairs) for uniqueness
    // but keep rough coherence by only doing local swaps
    const shuffled = softShuffle(body);

    for (let i = 0; i < shuffled.length; i++) {
      let para = shuffled[i];
      // Add transition phrase every 2-3 paragraphs
      if (i > 0 && i % 2 === 0 && i < shuffled.length - 1) {
        para = pickRandom(TRANSITIONS) + lowercaseFirst(para);
      }
      rewritten.push(para);
    }

    // 4. BongDa365 branding mid-article (insert after ~40% of content)
    const brandingIdx = Math.max(2, Math.floor(rewritten.length * 0.4));
    const branding = 'BongDa365 tổng hợp và phân tích từ nhiều nguồn tin uy tín để mang đến cho bạn đọc góc nhìn toàn diện nhất.';
    rewritten.splice(brandingIdx, 0, branding);

    // 5. Analytical conclusion
    const conclusion = pickRandom(CONCLUSIONS[cat] || CONCLUSIONS['general']);
    rewritten.push(conclusion);

    article.contentVi = rewritten;
  }

  article.rewritten = true;
  return article;
}

/**
 * Soft-shuffle: swap some adjacent paragraph pairs for structural uniqueness
 * while maintaining general readability flow.
 */
function softShuffle(paragraphs) {
  if (paragraphs.length <= 2) return [...paragraphs];
  const result = [...paragraphs];
  // Swap every other adjacent pair (skip first and last)
  for (let i = 1; i < result.length - 2; i += 3) {
    const temp = result[i];
    result[i] = result[i + 1];
    result[i + 1] = temp;
  }
  return result;
}

/**
 * Lowercase the first character of a string (for Vietnamese sentence joining)
 */
function lowercaseFirst(str) {
  if (!str) return '';
  // Don't lowercase if it starts with a proper noun indicator or special char
  if (/^[A-Z]{2,}|^\[|^[0-9]/.test(str)) return str;
  return str.charAt(0).toLowerCase() + str.slice(1);
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
    if (!article || article.titleVi) continue;

    try {
      const combined = article.title + ' ||| ' + article.summary;
      const translated = await translateText(combined);
      const parts = translated.split(' ||| ');
      article.titleVi = parts[0] || article.title;
      article.summaryVi = (parts[1] || article.summary).trim();
      // Rewrite summary into unique Vietnamese editorial content
      rewriteContent(article);
    } catch (e) {
      article.titleVi = '[EN] ' + article.title;
      article.summaryVi = '[EN] ' + article.summary;
      console.log(`[News] Translation failed for ${articleId}: ${e.message}`);
    }

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
      if (articles.has(item.id)) continue;
      if (isDuplicate(item.title, item.sourceKey)) continue;
      item.confidence = 'low'; // Default: single source
      item.crossRefs = [];
      articles.set(item.id, item);
      translateQueue.push(item.id);
      newCount++;
    }

    if (newCount > 0) {
      console.log(`[News] ${source.name}: +${newCount} new articles (total: ${articles.size})`);
    }

    processTranslateQueue();
  } catch (e) {
    console.log(`[News] Failed to fetch ${source.name}: ${e.message}`);
  }
}

function isDuplicate(title, newSource) {
  const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  for (const [, existing] of articles) {
    const existNorm = existing.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const isMatch = existNorm === normalized ||
      (normalized.slice(0, 40) === existNorm.slice(0, 40) && normalized.length > 20);

    if (isMatch) {
      // Cross-reference: same story from different source increases confidence
      if (newSource && newSource !== existing.sourceKey) {
        if (!existing.crossRefs) existing.crossRefs = [];
        if (!existing.crossRefs.includes(newSource)) {
          existing.crossRefs.push(newSource);
        }
        // Confidence: 1 source = 'low', 2 = 'medium', 3+ = 'high'
        const totalSources = 1 + existing.crossRefs.length;
        existing.confidence = totalSources >= 3 ? 'high' : totalSources >= 2 ? 'medium' : 'low';
      }
      return true;
    }
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
    .filter(a => a.titleVi)
    .sort((a, b) => b.pubDate - a.pubDate);
  if (category && category !== 'all') {
    list = list.filter(a => a.category === category);
  }
  const total = list.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  return { articles: list.slice(start, start + limit), total, page, pages };
}

function getArticle(id) { return articles.get(id) || null; }
function getCount() { return articles.size; }

function getLatest(n = 5) {
  return [...articles.values()]
    .filter(a => a.titleVi)
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, n);
}

// Get insider scoops (from Romano, Ornstein sources)
function getInsiderScoops(n = 10) {
  return [...articles.values()]
    .filter(a => a.isInsider && a.titleVi)
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, n);
}

// Get high-confidence articles (confirmed by multiple sources)
function getConfirmed(n = 10) {
  return [...articles.values()]
    .filter(a => a.confidence === 'high' && a.titleVi)
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, n);
}

// Get sources breakdown
function getSourceStats() {
  const stats = {};
  for (const [, article] of articles) {
    const key = article.sourceKey;
    if (!stats[key]) stats[key] = { source: article.source, key, count: 0 };
    stats[key].count++;
  }
  return Object.values(stats).sort((a, b) => b.count - a.count);
}

// ═══ START POLLING ═══
async function start() {
  console.log('[News] Starting news engine...');
  for (let i = 0; i < SOURCES.length; i++) {
    await fetchSource(SOURCES[i]);
    if (i < SOURCES.length - 1) await new Promise(r => setTimeout(r, 2000));
  }
  console.log(`[News] Initial fetch complete. ${articles.size} articles loaded.`);

  SOURCES.forEach((source, i) => {
    const offset = i * 5 * 60 * 1000;
    setTimeout(() => {
      setInterval(() => { fetchSource(source); evictOld(); }, POLL_INTERVAL);
    }, offset);
  });
}

module.exports = { start, getArticles, getArticle, getFullArticle, getCount, getLatest, getInsiderScoops, getConfirmed, getSourceStats, CATEGORY_VI };
