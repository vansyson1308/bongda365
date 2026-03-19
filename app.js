// BongDa365 v3.0 - Sofascore-style SPA, 100% real data, Vietnamese
// Architecture: Router → Page handlers → API → Render

const app = {
  tickerTimer: null,
  liveTimer: null,
  liveMatches: [], // cached for ticker

  init() {
    this.setupHeader();
    this.setupSearch();
    sidebar.init();
    this.registerRoutes();
    router.init();
    this.startLivePolling();
  },

  // ═══════════════════════════════════════
  //  HEADER
  // ═══════════════════════════════════════
  setupHeader() {
    document.getElementById('currentDate').textContent =
      new Date().toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' });
    // League quicklinks
    const nav = document.getElementById('leagueQuicklinks');
    if (nav) {
      nav.innerHTML = CONFIG.LEAGUES.map(lg =>
        `<a href="#/league/${lg.id}" class="league-quicklink">
          <img src="${api.tournImg(lg.id)}" onerror="this.style.display='none'" style="height:16px;width:16px;vertical-align:middle">
          <span>${lg.name.replace('League','').replace('Champions ','CL ').trim()}</span>
        </a>`
      ).join('');
    }
  },

  setupSearch() {
    const input = document.getElementById('searchInput');
    const dropdown = document.getElementById('searchDropdown');
    if (!input || !dropdown) return;
    let debounce = null;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      if (q.length < 2) { dropdown.style.display = 'none'; return; }
      debounce = setTimeout(async () => {
        try {
          const data = await api.search(q);
          const results = [...(data.teams || []).slice(0, 5), ...(data.players || []).slice(0, 5)];
          if (!results.length) { dropdown.style.display = 'none'; return; }
          dropdown.innerHTML = results.map(r => {
            if (r.team) return `<a class="search-result" href="#/team/${r.team.id}" onclick="document.getElementById('searchDropdown').style.display='none'">
              <img src="${api.teamImg(r.team.id)}" onerror="this.style.display='none'"><span>${r.team.name}</span><small>Đội</small></a>`;
            if (r.player) return `<a class="search-result" href="#/player/${r.player.id}" onclick="document.getElementById('searchDropdown').style.display='none'">
              <img src="${api.playerImg(r.player.id)}" onerror="this.style.display='none'"><span>${r.player.name}</span><small>${r.player.team?.name||''}</small></a>`;
            return '';
          }).join('');
          dropdown.style.display = 'block';
        } catch { dropdown.style.display = 'none'; }
      }, 300);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && input.value.trim()) {
        router.navigate('#/search?q=' + encodeURIComponent(input.value.trim()));
        dropdown.style.display = 'none';
      }
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.header-search')) dropdown.style.display = 'none';
    });
  },

  // ═══════════════════════════════════════
  //  ROUTES
  // ═══════════════════════════════════════
  registerRoutes() {
    router.register('/', () => this.pageLive());
    router.register('/live', () => this.pageLive());
    router.register('/schedule', () => this.pageSchedule());
    router.register('/schedule/([^/]+)', (date) => this.pageSchedule(date));
    router.register('/league/([^/]+)', (tid) => this.pageLeague(tid, 'overview'));
    router.register('/league/([^/]+)/matches', (tid) => this.pageLeague(tid, 'matches'));
    router.register('/league/([^/]+)/standings', (tid) => this.pageLeague(tid, 'standings'));
    router.register('/league/([^/]+)/players', (tid) => this.pageLeague(tid, 'players'));
    router.register('/match/([^/]+)', (eid) => this.pageMatch(eid));
    router.register('/team/([^/]+)', (tid) => this.pageTeam(tid));
    router.register('/player/([^/]+)', (pid) => this.pagePlayer(pid));
    router.register('/predictions', () => this.pagePredictions());
    router.register('/search', () => this.pageSearch());
  },

  // Show/hide right panel
  showPanel(show) {
    const panel = document.getElementById('rightPanel');
    const layout = document.getElementById('appLayout');
    if (panel) panel.style.display = show ? '' : 'none';
    if (layout) layout.classList.toggle('with-panel', show);
  },

  // ═══════════════════════════════════════
  //  LIVE PAGE
  // ═══════════════════════════════════════
  async pageLive() {
    this.showPanel(false);
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header">
        <h2><span class="pulse-dot"></span> Trực Tiếp</h2>
        <div class="live-stats-bar">
          <div class="stat-item"><span class="stat-number" id="statLive">0</span><span class="stat-label">Live</span></div>
          <div class="stat-item"><span class="stat-number" id="statGoals">0</span><span class="stat-label">Bàn</span></div>
          <div class="stat-item"><span class="stat-number" id="statLeagues">0</span><span class="stat-label">Giải</span></div>
        </div>
      </div>
      <div class="date-strip" id="dateStrip"></div>
      <div class="filter-bar">
        <button class="filter-btn active" data-filter="live" onclick="app.filterLive('live',this)">🔴 Live</button>
        <button class="filter-btn" data-filter="all" onclick="app.filterLive('all',this)">Tất cả</button>
        <button class="filter-btn" data-filter="fav" onclick="app.filterLive('fav',this)">★ Yêu thích</button>
      </div>
      <div id="liveMatches"><div class="loading-state"><div class="spinner"></div></div></div>`;
    this._renderDateStrip(0);
    await this._loadLive();
  },

  _liveFilter: 'live',
  _liveDateOffset: 0,

  filterLive(f, btn) {
    this._liveFilter = f;
    document.querySelectorAll('.filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this._renderLiveMatches();
  },

  _renderDateStrip(centerOffset) {
    const strip = document.getElementById('dateStrip');
    if (!strip) return;
    let html = '';
    for (let i = -3; i <= 3; i++) {
      const d = new Date(); d.setDate(d.getDate() + centerOffset + i);
      const label = i === -centerOffset ? 'Hôm nay' : d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' });
      const dateStr = d.toISOString().split('T')[0];
      html += `<button class="date-btn ${i===0?'active':''}" onclick="app._loadByDate('${dateStr}',${centerOffset + i})">${label}</button>`;
    }
    strip.innerHTML = html;
  },

  async _loadByDate(date, offset) {
    this._liveDateOffset = offset;
    this._liveFilter = 'all';
    const el = document.getElementById('liveMatches');
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
    try {
      const data = await api.getByDate(date);
      this.liveMatches = (data.events || []).map(e => api.mapEvent(e));
      this._renderLiveMatches();
    } catch { el.innerHTML = this._err('Lỗi tải dữ liệu'); }
  },

  async _loadLive() {
    const el = document.getElementById('liveMatches');
    try {
      const data = await api.getLive();
      this.liveMatches = (data.events || []).map(e => api.mapEvent(e));
      this._renderLiveMatches();
      this._updateTicker(this.liveMatches);
      this._updateLiveCount(this.liveMatches);
    } catch { if (el) el.innerHTML = this._err('Không thể kết nối. Hãy chắc chắn server.js đang chạy.'); }
  },

  _renderLiveMatches() {
    const el = document.getElementById('liveMatches');
    if (!el) return;
    let matches = this.liveMatches;
    if (this._liveFilter === 'live') matches = matches.filter(m => m.status === 'LIVE');
    else if (this._liveFilter === 'fav') matches = matches.filter(m => favourites.hasLeague(m.league.id) || favourites.hasTeam(m.home.id) || favourites.hasTeam(m.away.id));

    if (!matches.length) { el.innerHTML = this._empty('😴', this._liveFilter === 'fav' ? 'Không có trận yêu thích. Thêm ★ vào giải đấu!' : 'Không có trận nào.'); return; }

    const groups = this._groupByLeague(matches);
    let html = '';
    for (const [, g] of groups) {
      html += `<div class="league-group"><div class="league-group-header">
        <img src="${g.logo}" class="league-icon" onerror="this.outerHTML='⚽'">
        <a href="#/league/${g.id}" class="league-name">${g.name}</a>
        <span class="league-country">${g.country}</span>
        ${favourites.starIcon('league', g.id)}
        <span class="league-count">${g.matches.length}</span>
      </div>`;
      g.matches.forEach(m => { html += this._matchCard(m); });
      html += '</div>';
    }
    el.innerHTML = html;

    // Update stats
    const live = this.liveMatches.filter(m => m.status === 'LIVE');
    const goals = live.reduce((s, m) => s + (m.homeScore || 0) + (m.awayScore || 0), 0);
    const leagues = new Set(live.map(m => m.league.name)).size;
    const slEl = document.getElementById('statLive');
    if (slEl) slEl.textContent = live.length;
    const sgEl = document.getElementById('statGoals');
    if (sgEl) sgEl.textContent = goals;
    const slgEl = document.getElementById('statLeagues');
    if (slgEl) slgEl.textContent = leagues;
  },

  // ═══════════════════════════════════════
  //  MATCH CARD (reused everywhere)
  // ═══════════════════════════════════════
  _matchCard(m) {
    const live = m.status === 'LIVE';
    const ft = m.status === 'FT';
    const ns = m.status === 'NS';

    let badge;
    if (live) {
      const txt = m.minute != null ? `${m.minute}'` : (VI.status[m.statusDesc] || m.statusDesc);
      badge = `<span class="match-status status-live">${txt}</span>`;
    } else if (ft) badge = `<span class="match-status status-ft">${VI.status[m.statusDesc] || 'FT'}</span>`;
    else if (ns) {
      const t = m.startTs ? new Date(m.startTs * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'TBD';
      badge = `<span class="match-status status-ns">${t}</span>`;
    } else badge = `<span class="match-status">${VI.status[m.statusDesc] || m.statusDesc || m.status}</span>`;

    const ht = m.ht ? `<div class="match-ht">HT: ${m.ht.h}-${m.ht.a}</div>` : '';

    return `<a href="#/match/${m.id}" class="match-card ${live ? 'is-live' : ft ? 'is-finished' : ''}" data-match-id="${m.id}">
      <div class="match-team home"><span>${m.home.short}</span>
        <img class="team-logo" src="${m.home.logo}" onerror="this.style.display='none'"></div>
      <div class="match-center">
        <div class="match-score ${live ? 'live' : ''}">${m.homeScore ?? '-'} - ${m.awayScore ?? '-'}</div>
        ${badge}${ht}</div>
      <div class="match-team away">
        <img class="team-logo" src="${m.away.logo}" onerror="this.style.display='none'">
        <span>${m.away.short}</span></div>
    </a>`;
  },

  // ═══════════════════════════════════════
  //  MATCH DETAIL PAGE
  // ═══════════════════════════════════════
  async pageMatch(eid) {
    eid = parseInt(eid);
    this.showPanel(true);
    const el = document.getElementById('page-content');
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tải trận đấu...</p></div>';

    // Clear chat & commentary
    const chatEl = document.getElementById('chatMessages');
    const commEl = document.getElementById('commentaryFeed');
    if (chatEl) chatEl.innerHTML = '';
    if (commEl) commEl.innerHTML = '';
    chat.joinMatch(eid);
    router.beforeLeave = () => { chat.leaveMatch(); this.showPanel(false); };

    try {
      const [statsData, incData, linData, oddsData, h2hData, graphData, shotData, bestData, avgPosData] = await Promise.all([
        api.getStats(eid).catch(() => ({})),
        api.getIncidents(eid).catch(() => ({ incidents: [] })),
        api.getLineups(eid).catch(() => null),
        api.getOdds(eid).catch(() => ({ markets: [] })),
        api.getH2H(eid).catch(() => null),
        api.getGraph(eid).catch(() => null),
        api.getShotmap(eid).catch(() => null),
        api.getBestPlayers(eid).catch(() => null),
        api.getAvgPositions(eid).catch(() => null),
      ]);

      const stats = api.mapStats(statsData);
      const incidents = (incData.incidents || []).filter(i => ['goal', 'card', 'substitution', 'varDecision'].includes(i.incidentType));
      const lineups = linData;
      const odds = oddsData.markets || [];
      const h2h = h2hData;
      const graph = graphData;
      const shotmap = shotData;
      const bestPlayers = bestData;
      const avgPositions = avgPosData;

      // Find match info
      let match = null;
      for (const dateOffset of [null, 0, -1, 1]) {
        try {
          let data;
          if (dateOffset === null) data = await api.getLive();
          else { const d = new Date(); d.setDate(d.getDate() + dateOffset); data = await api.getByDate(d.toISOString().split('T')[0]); }
          const raw = (data.events || []).find(e => e.id === eid);
          if (raw) { match = api.mapEvent(raw); break; }
        } catch {}
      }

      el.innerHTML = this._matchPage(match, stats, incidents, lineups, odds, h2h, graph, shotmap, bestPlayers, avgPositions);

      // Viral card
      const viralEl = document.getElementById('viralCardSection');
      if (viralEl && match && (match.status === 'LIVE' || match.status === 'FT')) {
        viralEl.style.display = 'block';
        const canvas = chat.generateCard(match, `${match.homeScore}-${match.awayScore}`);
        const targetCanvas = document.getElementById('viralCanvas');
        if (targetCanvas && canvas) { targetCanvas.width = canvas.width; targetCanvas.height = canvas.height; targetCanvas.getContext('2d').drawImage(canvas, 0, 0); }
      }
    } catch (e) { console.error(e); el.innerHTML = this._err('Lỗi tải chi tiết trận đấu'); }
  },

  _matchPage(m, stats, incidents, lineups, odds, h2h, graph, shotmap, bestPlayers, avgPositions) {
    let html = '';

    // Header
    if (m) {
      const live = m.status === 'LIVE';
      html += `<div class="match-header-page">
        <div class="match-header-league">
          <img src="${m.league.logo}" class="league-icon" onerror="this.style.display='none'">
          <a href="#/league/${m.league.id}">${m.league.name}</a>
          ${m.round ? '- Vòng ' + m.round : m.roundName ? '- ' + m.roundName : ''}
        </div>
        <div class="match-header-teams">
          <div class="match-header-team">
            <a href="#/team/${m.home.id}"><img src="${m.home.logo}" class="team-logo-lg"></a>
            <a href="#/team/${m.home.id}" class="team-name-lg">${m.home.name}</a>
          </div>
          <div class="match-header-score ${live ? 'live' : ''}">
            <div class="score-big">${m.homeScore ?? '-'} - ${m.awayScore ?? '-'}</div>
            ${m.ht ? `<div class="score-ht">HT: ${m.ht.h}-${m.ht.a}</div>` : ''}
            <div class="match-status-big">${live ? `<span class="status-live">${m.minute ? m.minute + "'" : m.statusDesc}</span>` : `<span class="status-ft">${VI.status[m.statusDesc] || m.statusDesc || m.status}</span>`}</div>
          </div>
          <div class="match-header-team">
            <a href="#/team/${m.away.id}"><img src="${m.away.logo}" class="team-logo-lg"></a>
            <a href="#/team/${m.away.id}" class="team-name-lg">${m.away.name}</a>
          </div>
        </div>
      </div>`;
    }

    // Tabs
    const tabs = [
      { id: 'summary', label: 'Tổng quan', show: true },
      { id: 'stats', label: 'Thống kê', show: stats.length > 0 },
      { id: 'lineups', label: 'Đội hình', show: !!(lineups?.home) },
      { id: 'shotmap', label: 'Sút', show: !!(shotmap?.shotmap?.length) },
      { id: 'h2h', label: 'Đối đầu', show: !!h2h },
      { id: 'odds', label: 'Kèo', show: odds.length > 0 },
    ];

    html += `<div class="detail-tabs">${tabs.filter(t => t.show).map((t, i) =>
      `<button class="tab-btn ${i === 0 ? 'active' : ''}" onclick="app._matchTab(this,'mtab-${t.id}')">${t.label}</button>`
    ).join('')}</div>`;

    // Summary tab (incidents + momentum + best players + avg positions)
    html += `<div id="mtab-summary" class="tab-panel">`;
    html += this._renderIncidents(incidents);
    if (graph?.graphPoints?.length) html += this._renderMomentum(graph.graphPoints, m);
    if (bestPlayers) html += this._renderBestPlayers(bestPlayers, m);
    if (avgPositions) html += this._renderAvgPositions(avgPositions, m);
    html += '</div>';

    // Stats tab
    if (stats.length) {
      html += `<div id="mtab-stats" class="tab-panel" style="display:none">`;
      html += this._renderStats(stats);
      html += '</div>';
    }

    // Lineups tab
    if (lineups?.home) {
      html += `<div id="mtab-lineups" class="tab-panel" style="display:none">`;
      html += this._renderLineups(lineups, m);
      html += '</div>';
    }

    // Shotmap tab
    if (shotmap?.shotmap?.length) {
      html += `<div id="mtab-shotmap" class="tab-panel" style="display:none">`;
      html += this._renderShotmap(shotmap.shotmap, m);
      html += '</div>';
    }

    // H2H tab
    if (h2h) {
      html += `<div id="mtab-h2h" class="tab-panel" style="display:none">`;
      html += this._renderH2H(h2h, m);
      html += '</div>';
    }

    // Odds tab
    if (odds.length) {
      html += `<div id="mtab-odds" class="tab-panel" style="display:none">`;
      html += this._renderOdds(odds);
      html += '</div>';
    }

    return html;
  },

  _matchTab(btn, id) {
    btn.closest('.detail-tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn.closest('.content-area')?.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'block';
  },

  // ═══════════════════════════════════════
  //  MATCH DETAIL RENDERERS
  // ═══════════════════════════════════════
  _renderIncidents(incidents) {
    if (!incidents.length) return this._empty('📋', 'Chưa có diễn biến');
    let html = '<div class="incidents-list">';
    incidents.forEach(inc => {
      let icon = '', text = '';
      if (inc.incidentType === 'goal') {
        icon = inc.incidentClass === 'ownGoal' ? '🔴' : '⚽';
        text = `<strong>${inc.player?.shortName || ''}</strong>`;
        if (inc.assist1) text += ` <span class="text-muted">(${inc.assist1.shortName})</span>`;
        if (inc.from === 'penalty') text += ' <span class="text-blue">(Pen)</span>';
        if (inc.incidentClass === 'ownGoal') text += ' <span class="text-red">(PL)</span>';
      } else if (inc.incidentType === 'card') {
        icon = inc.incidentClass === 'yellow' ? '🟨' : inc.incidentClass === 'yellowred' ? '🟨🟥' : '🟥';
        text = `${inc.playerName || inc.player?.shortName || ''}`;
      } else if (inc.incidentType === 'substitution') {
        icon = '🔄';
        text = `<span class="text-green">${inc.playerIn?.shortName || ''}</span> ↔ <span class="text-red">${inc.playerOut?.shortName || ''}</span>`;
      } else if (inc.incidentType === 'varDecision') {
        icon = '📺';
        text = `VAR: ${inc.incidentClass} ${inc.confirmed ? '✅' : '❌'}`;
      }
      const side = inc.isHome ? 'home' : 'away';
      html += `<div class="incident-row ${side}">
        ${inc.isHome ? `<span class="incident-time">${inc.time}'</span>${icon} ${text}` :
          `${text} ${icon}<span class="incident-time">${inc.time}'</span>`}
      </div>`;
    });
    return html + '</div>';
  },

  _renderStats(stats) {
    let html = '';
    stats.forEach(s => {
      const h = parseFloat(String(s.hv || s.home || 0).replace('%', '')) || 0;
      const a = parseFloat(String(s.av || s.away || 0).replace('%', '')) || 0;
      const tot = h + a || 1;
      const hp = Math.round(h / tot * 100);
      html += `<div class="stat-row">
        <div class="stat-val home">${s.home}</div>
        <div class="stat-name">${VI.stats[s.name] || s.name}</div>
        <div class="stat-val away">${s.away}</div>
      </div>
      <div class="stat-bar"><div class="stat-bar-home" style="width:${hp}%"></div><div class="stat-bar-away" style="width:${100 - hp}%"></div></div>`;
    });
    return html;
  },

  _renderMomentum(points, m) {
    const w = 640, h = 180, pad = 30;
    const maxVal = Math.max(...points.map(p => Math.abs(p.value)), 1);
    const midY = h / 2;
    const xScale = (w - pad * 2) / 90;
    let pathD = '';
    let fillHome = 'M' + pad + ',' + midY + ' ';
    let fillAway = 'M' + pad + ',' + midY + ' ';
    points.forEach((p, i) => {
      const x = pad + p.minute * xScale;
      const y = midY - (p.value / maxVal) * (h / 2 - 10);
      pathD += (i === 0 ? 'M' : 'L') + `${x},${y} `;
      if (p.value >= 0) { fillHome += `L${x},${y} `; fillAway += `L${x},${midY} `; }
      else { fillAway += `L${x},${y} `; fillHome += `L${x},${midY} `; }
    });
    const lastX = pad + (points[points.length - 1]?.minute || 90) * xScale;
    fillHome += `L${lastX},${midY} Z`;
    fillAway += `L${lastX},${midY} Z`;

    return `<div class="section-block">
      <div class="section-label"><span class="text-blue">${m?.home?.short || 'Chủ'} ↑</span> Áp lực <span class="text-red">↓ ${m?.away?.short || 'Khách'}</span></div>
      <svg viewBox="0 0 ${w} ${h}" class="momentum-svg">
        <path d="${fillHome}" fill="rgba(59,130,246,0.15)"/>
        <path d="${fillAway}" fill="rgba(239,68,68,0.15)"/>
        <line x1="${pad}" y1="${midY}" x2="${w - pad}" y2="${midY}" stroke="var(--border)" stroke-dasharray="4"/>
        <line x1="${pad + 45 * xScale}" y1="5" x2="${pad + 45 * xScale}" y2="${h - 5}" stroke="var(--border)" stroke-dasharray="2"/>
        <text x="${pad + 45 * xScale}" y="12" fill="var(--text-muted)" font-size="10" text-anchor="middle">HT</text>
        <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2"/>
        <text x="${pad}" y="${h - 3}" fill="var(--text-muted)" font-size="10">0'</text>
        <text x="${w - pad}" y="${h - 3}" fill="var(--text-muted)" font-size="10" text-anchor="end">90'</text>
      </svg></div>`;
  },

  _renderBestPlayers(bp, m) {
    const homeBest = bp.bestHomeTeamPlayer || bp.home;
    const awayBest = bp.bestAwayTeamPlayer || bp.away;
    if (!homeBest?.player && !awayBest?.player) return '';
    let html = '<div class="section-block"><div class="section-label">Cầu thủ nổi bật</div><div class="best-players-row">';
    if (homeBest?.player) {
      html += `<a href="#/player/${homeBest.player.id}" class="best-player-card">
        <img src="${api.playerImg(homeBest.player.id)}" onerror="this.style.display='none'">
        <div><div class="player-name">${homeBest.player.shortName}</div><div class="player-rating">${parseFloat(homeBest.value).toFixed(1)}</div></div></a>`;
    }
    if (awayBest?.player) {
      html += `<a href="#/player/${awayBest.player.id}" class="best-player-card">
        <img src="${api.playerImg(awayBest.player.id)}" onerror="this.style.display='none'">
        <div><div class="player-name">${awayBest.player.shortName}</div><div class="player-rating">${parseFloat(awayBest.value).toFixed(1)}</div></div></a>`;
    }
    return html + '</div></div>';
  },

  _renderAvgPositions(data, m) {
    const home = data.home || data.homeTeam || [];
    const away = data.away || data.awayTeam || [];
    if (!home.length && !away.length) return '';
    const w = 460, h = 640;
    let svg = `<rect x="0" y="0" width="${w}" height="${h}" fill="#1a472a" rx="8"/>
      <rect x="15" y="15" width="${w - 30}" height="${h - 30}" fill="none" stroke="rgba(255,255,255,0.25)" rx="4"/>
      <line x1="15" y1="${h / 2}" x2="${w - 15}" y2="${h / 2}" stroke="rgba(255,255,255,0.25)"/>
      <circle cx="${w / 2}" cy="${h / 2}" r="45" fill="none" stroke="rgba(255,255,255,0.2)"/>`;
    const dot = (x, y, num, name, color) => `<circle cx="${x}" cy="${y}" r="13" fill="${color}" opacity="0.85" stroke="white" stroke-width="1.5"/>
      <text x="${x}" y="${y + 4}" font-size="10" font-weight="700" fill="white" text-anchor="middle">${num}</text>
      <text x="${x}" y="${y + 24}" font-size="8" fill="white" text-anchor="middle">${name}</text>`;
    home.forEach(p => {
      const pos = p.averagePosition || p.position || {};
      if (pos.x == null && pos.y == null) return;
      svg += dot(15 + (pos.y / 100) * (w - 30), 15 + (pos.x / 100) * (h - 30), p.player?.jerseyNumber || '', (p.player?.shortName || '').split(' ').pop(), 'var(--blue)');
    });
    away.forEach(p => {
      const pos = p.averagePosition || p.position || {};
      if (pos.x == null && pos.y == null) return;
      svg += dot(15 + (pos.y / 100) * (w - 30), 15 + ((100 - pos.x) / 100) * (h - 30), p.player?.jerseyNumber || '', (p.player?.shortName || '').split(' ').pop(), 'var(--red)');
    });
    return `<div class="section-block"><div class="section-label"><span class="text-blue">${m?.home?.short || ''}</span> Vị trí TB <span class="text-red">${m?.away?.short || ''}</span></div>
      <div class="pitch-container"><svg class="pitch-svg" viewBox="0 0 ${w} ${h}">${svg}</svg></div></div>`;
  },

  _renderLineups(lineups, m) {
    let html = this._renderFormationPitch(lineups, m);
    ['home', 'away'].forEach(side => {
      const l = lineups[side];
      if (!l) return;
      const teamName = m ? m[side].name : (side === 'home' ? 'Chủ nhà' : 'Khách');
      const color = side === 'home' ? 'var(--blue)' : 'var(--red)';
      html += `<h4 style="font-size:14px;margin:16px 0 8px;color:${color}">${teamName} ${l.formation ? `(${l.formation})` : ''}</h4>`;
      const starters = (l.players || []).filter(p => !p.substitute);
      const subs = (l.players || []).filter(p => p.substitute);
      starters.forEach(p => {
        const rating = p.statistics?.rating;
        const rColor = rating >= 7.5 ? 'var(--green)' : rating >= 6.5 ? 'var(--accent)' : 'var(--text-muted)';
        html += `<a href="#/player/${p.player?.id}" class="lineup-player">
          <img src="${api.playerImg(p.player?.id)}" class="lineup-player-img" onerror="this.style.display='none'">
          <span class="lineup-num">${p.player?.jerseyNumber || ''}</span>
          <span class="lineup-name">${p.player?.shortName || ''}</span>
          <span class="lineup-pos">${this._posVi(p.player?.position)}</span>
          ${rating ? `<span class="lineup-rating" style="color:${rColor}">${parseFloat(rating).toFixed(1)}</span>` : ''}
          ${p.statistics?.goals ? '<span>⚽</span>' : ''}
        </a>`;
      });
      if (subs.length) {
        html += '<div style="margin:12px 0 6px;font-size:11px;color:var(--text-muted);font-weight:600">DỰ BỊ</div>';
        subs.forEach(p => {
          html += `<a href="#/player/${p.player?.id}" class="lineup-player sub">
            <span class="lineup-num">${p.player?.jerseyNumber || ''}</span>
            <span class="lineup-name">${p.player?.shortName || ''}</span>
            ${p.statistics?.rating ? `<span class="lineup-rating">${parseFloat(p.statistics.rating).toFixed(1)}</span>` : ''}
          </a>`;
        });
      }
      if (l.missingPlayers?.length) {
        html += '<div style="margin:12px 0 6px;font-size:11px;color:var(--red);font-weight:600">VẮNG MẶT</div>';
        l.missingPlayers.forEach(p => { html += `<div style="font-size:12px;color:var(--text-muted);padding:2px 0">🏥 ${p.player?.shortName || p.player?.name} - ${p.reason || ''}</div>`; });
      }
    });
    return html;
  },

  _renderFormationPitch(lineups, m) {
    const homeF = lineups.home?.formation;
    const awayF = lineups.away?.formation;
    if (!homeF && !awayF) return '';
    const w = 460, h = 640;
    let svg = `<rect x="0" y="0" width="${w}" height="${h}" fill="#1a472a" rx="8"/>
      <rect x="15" y="15" width="${w - 30}" height="${h - 30}" fill="none" stroke="rgba(255,255,255,0.25)" rx="4"/>
      <line x1="15" y1="${h / 2}" x2="${w - 15}" y2="${h / 2}" stroke="rgba(255,255,255,0.25)"/>
      <circle cx="${w / 2}" cy="${h / 2}" r="45" fill="none" stroke="rgba(255,255,255,0.2)"/>
      <rect x="${w / 2 - 70}" y="15" width="140" height="55" fill="none" stroke="rgba(255,255,255,0.18)" rx="2"/>
      <rect x="${w / 2 - 70}" y="${h - 70}" width="140" height="55" fill="none" stroke="rgba(255,255,255,0.18)" rx="2"/>`;
    const parseFm = fm => fm ? fm.split('-').map(Number) : [];
    const placePlayers = (formation, players, color, isHome) => {
      const lines = parseFm(formation);
      const starters = (players || []).filter(p => !p.substitute);
      let idx = 0;
      const gkY = isHome ? 42 : h - 42;
      if (starters[idx]) { svg += this._pitchDot(w / 2, gkY, starters[idx], color); idx++; }
      const total = lines.length;
      lines.forEach((count, li) => {
        const baseY = isHome ? 42 + ((li + 1) / (total + 1)) * (h / 2 - 60) : h - 42 - ((li + 1) / (total + 1)) * (h / 2 - 60);
        for (let i = 0; i < count && idx < starters.length; i++) {
          const x = 35 + ((i + 1) / (count + 1)) * (w - 70);
          svg += this._pitchDot(x, baseY, starters[idx], color);
          idx++;
        }
      });
    };
    if (homeF) placePlayers(homeF, lineups.home.players, 'var(--blue)', true);
    if (awayF) placePlayers(awayF, lineups.away.players, 'var(--red)', false);
    return `<div class="pitch-container">
      <div class="section-label"><span class="text-blue">${m?.home?.short || ''} ${homeF || ''}</span> vs <span class="text-red">${m?.away?.short || ''} ${awayF || ''}</span></div>
      <svg class="pitch-svg" viewBox="0 0 ${w} ${h}">${svg}</svg></div>`;
  },

  _pitchDot(x, y, p, color) {
    const num = p?.player?.jerseyNumber || '';
    const name = (p?.player?.shortName || '').split(' ').pop();
    return `<circle cx="${x}" cy="${y}" r="14" fill="${color}" opacity="0.9" stroke="white" stroke-width="1.5"/>
      <text x="${x}" y="${y + 4}" font-size="10" font-weight="700" fill="white" text-anchor="middle">${num}</text>
      <text x="${x}" y="${y + 25}" font-size="8" fill="white" text-anchor="middle">${name}</text>`;
  },

  _renderShotmap(shots, m) {
    const w = 580, h = 380;
    let svg = `<rect x="15" y="15" width="${w - 30}" height="${h - 30}" fill="none" stroke="var(--border)" rx="4"/>
      <line x1="15" y1="${h / 2}" x2="${w - 15}" y2="${h / 2}" stroke="var(--border)" stroke-dasharray="4"/>
      <rect x="${w / 2 - 45}" y="15" width="90" height="28" fill="none" stroke="var(--text-muted)" rx="2"/>
      <rect x="${w / 2 - 110}" y="15" width="220" height="70" fill="none" stroke="var(--border)" rx="2"/>`;
    shots.forEach(s => {
      if (!s.playerCoordinates) return;
      const x = 15 + (s.playerCoordinates.y / 100) * (w - 30);
      const y = 15 + (s.playerCoordinates.x / 100) * (h - 30);
      const r = 4 + (s.xg || 0.1) * 14;
      const isGoal = s.shotType === 'goal';
      const color = isGoal ? 'var(--accent)' : s.isHome ? 'var(--blue)' : 'var(--red)';
      svg += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${isGoal ? 1 : 0.6}" stroke="${isGoal ? 'white' : 'none'}" stroke-width="${isGoal ? 2 : 0}">
        <title>${s.player?.shortName || ''} ${s.time}' xG:${(s.xg || 0).toFixed(2)}</title></circle>`;
    });
    const homeS = shots.filter(s => s.isHome), awayS = shots.filter(s => !s.isHome);
    return `<div class="section-label"><span class="text-blue">${m?.home?.short || ''}: ${homeS.length} sút (xG: ${homeS.reduce((s, x) => s + (x.xg || 0), 0).toFixed(2)})</span>
      <span class="text-red">${m?.away?.short || ''}: ${awayS.length} sút (xG: ${awayS.reduce((s, x) => s + (x.xg || 0), 0).toFixed(2)})</span></div>
      <svg viewBox="0 0 ${w} ${h}" class="shotmap-svg">${svg}</svg>`;
  },

  _renderH2H(h2h, m) {
    let html = '';
    const td = h2h.teamDuel;
    if (td) {
      const total = (td.homeWins || 0) + (td.draws || 0) + (td.awayWins || 0);
      html += `<div class="h2h-summary">
        <div class="h2h-count">${total} trận đối đầu</div>
        <div class="h2h-bars">
          <div class="h2h-item"><div class="h2h-num text-blue">${td.homeWins || 0}</div><div class="h2h-label">${m?.home?.short || 'Chủ'}</div></div>
          <div class="h2h-item"><div class="h2h-num">${td.draws || 0}</div><div class="h2h-label">Hòa</div></div>
          <div class="h2h-item"><div class="h2h-num text-red">${td.awayWins || 0}</div><div class="h2h-label">${m?.away?.short || 'Khách'}</div></div>
        </div></div>`;
    }
    const prev = h2h.managerDuel?.events || h2h.events || [];
    if (prev.length) {
      html += '<div class="h2h-matches"><h4 class="section-label">Các trận gần đây</h4>';
      prev.slice(0, 10).forEach(ev => {
        const date = ev.startTimestamp ? new Date(ev.startTimestamp * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
        html += `<div class="h2h-match-item">
          <span class="h2h-match-date">${date}</span>
          <span class="h2h-match-teams">${ev.homeTeam?.shortName || '?'}</span>
          <span class="h2h-match-score">${ev.homeScore?.current ?? '-'} - ${ev.awayScore?.current ?? '-'}</span>
          <span class="h2h-match-teams" style="text-align:right">${ev.awayTeam?.shortName || '?'}</span>
        </div>`;
      });
      html += '</div>';
    }
    return html;
  },

  _renderOdds(odds) {
    let html = '';
    odds.forEach(market => {
      const choices = market.choices || [];
      if (!choices.length) return;
      html += `<h4 class="section-label">${VI.markets[market.marketName] || market.marketName}</h4>
        <div class="odds-grid" style="grid-template-columns:repeat(${Math.min(choices.length, 3)},1fr)">`;
      choices.forEach(c => {
        const dec = this._frac(c.fractionalValue);
        html += `<div class="odds-cell"><div class="odds-name">${c.name}</div><div class="odds-val">${dec}</div></div>`;
      });
      html += '</div>';
    });
    return html;
  },

  // ═══════════════════════════════════════
  //  LEAGUE PAGE
  // ═══════════════════════════════════════
  async pageLeague(tid, tab) {
    tid = parseInt(tid);
    this.showPanel(false);
    const el = document.getElementById('page-content');
    const lg = CONFIG.LEAGUES.find(l => l.id === tid);
    const lgName = lg?.name || 'Giải đấu';
    const sid = lg?.seasonId;

    el.innerHTML = `
      <div class="page-header"><h2><img src="${api.tournImg(tid)}" class="league-icon" onerror="this.style.display='none'"> ${lgName}</h2></div>
      <div class="detail-tabs">
        <button class="tab-btn ${tab === 'overview' ? 'active' : ''}" onclick="router.navigate('#/league/${tid}')">Tổng quan</button>
        <button class="tab-btn ${tab === 'matches' ? 'active' : ''}" onclick="router.navigate('#/league/${tid}/matches')">Trận đấu</button>
        <button class="tab-btn ${tab === 'standings' ? 'active' : ''}" onclick="router.navigate('#/league/${tid}/standings')">BXH</button>
        <button class="tab-btn ${tab === 'players' ? 'active' : ''}" onclick="router.navigate('#/league/${tid}/players')">Cầu thủ</button>
      </div>
      <div id="leagueContent"><div class="loading-state"><div class="spinner"></div></div></div>`;

    if (!sid) { document.getElementById('leagueContent').innerHTML = this._empty('📊', 'Chưa có mùa giải'); return; }

    try {
      if (tab === 'overview') await this._leagueOverview(tid, sid);
      else if (tab === 'matches') await this._leagueMatches(tid, sid);
      else if (tab === 'standings') await this._leagueStandings(tid, sid);
      else if (tab === 'players') await this._leaguePlayers(tid, sid);
    } catch (e) { console.error(e); document.getElementById('leagueContent').innerHTML = this._err('Lỗi tải dữ liệu giải đấu'); }
  },

  async _leagueOverview(tid, sid) {
    const el = document.getElementById('leagueContent');
    const [standingsData, todayData] = await Promise.all([
      api.getStandings(tid, sid).catch(() => ({})),
      api.getByDate(new Date().toISOString().split('T')[0]).catch(() => ({ events: [] })),
    ]);
    const rows = standingsData.standings?.[0]?.rows || [];
    const matches = (todayData.events || []).map(e => api.mapEvent(e)).filter(m => m.league.id === tid);

    let html = '<div class="league-overview">';
    // Mini standings
    if (rows.length) {
      html += '<div class="section-block"><h4 class="section-label">Bảng xếp hạng</h4><table class="standings-table mini">';
      html += '<thead><tr><th>#</th><th>Đội</th><th>Tr</th><th>T</th><th>H</th><th>B</th><th>Đ</th></tr></thead><tbody>';
      rows.slice(0, 6).forEach(r => {
        html += `<tr><td class="pos">${r.position}</td>
          <td><a href="#/team/${r.team.id}" class="team-cell"><img class="team-logo-sm" src="${api.teamImg(r.team.id)}" onerror="this.style.display='none'">${r.team.shortName || r.team.name}</a></td>
          <td>${r.matches}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td><td><strong>${r.points}</strong></td></tr>`;
      });
      html += '</tbody></table><a href="#/league/' + tid + '/standings" class="view-all-link">Xem đầy đủ →</a></div>';
    }
    // Today's matches
    if (matches.length) {
      html += '<div class="section-block"><h4 class="section-label">Trận đấu hôm nay</h4>';
      matches.forEach(m => { html += this._matchCard(m); });
      html += '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  },

  async _leagueMatches(tid, sid) {
    const el = document.getElementById('leagueContent');
    const today = new Date().toISOString().split('T')[0];
    const data = await api.getByDate(today);
    const matches = (data.events || []).map(e => api.mapEvent(e)).filter(m => m.league.id === tid);
    if (!matches.length) { el.innerHTML = this._empty('📅', 'Không có trận hôm nay'); return; }
    el.innerHTML = matches.map(m => this._matchCard(m)).join('');
  },

  async _leagueStandings(tid, sid) {
    const el = document.getElementById('leagueContent');
    const data = await api.getStandings(tid, sid);
    const rows = data.standings?.[0]?.rows || [];
    if (!rows.length) { el.innerHTML = this._empty('📊', 'Chưa có dữ liệu'); return; }

    // Batch form fetches
    const formMap = {};
    for (let i = 0; i < rows.length; i += 4) {
      await Promise.all(rows.slice(i, i + 4).map(async r => {
        try {
          const d = await api.getTeamLastMatches(r.team.id, 0);
          formMap[r.team.id] = (d.events || []).slice(0, 5).map(e => {
            const isHome = e.homeTeam?.id === r.team.id;
            const hs = e.homeScore?.current, as = e.awayScore?.current;
            if (hs == null || as == null) return null;
            return (isHome && hs > as) || (!isHome && as > hs) ? 'W' : hs === as ? 'D' : 'L';
          }).filter(Boolean);
        } catch { formMap[r.team.id] = []; }
      }));
    }

    el.innerHTML = `<table class="standings-table">
      <thead><tr><th>#</th><th>Đội</th><th>Tr</th><th>T</th><th>H</th><th>B</th><th>BT</th><th>BB</th><th>HS</th><th>Đ</th><th>Form</th></tr></thead>
      <tbody>${rows.map(r => {
        let pc = '';
        const p = (r.promotion?.text || '').toLowerCase();
        if (p.includes('champions league')) pc = 'pos-champions';
        else if (p.includes('europa') || p.includes('conference')) pc = 'pos-europa';
        else if (p.includes('relegation')) pc = 'pos-relegation';
        const form = (formMap[r.team.id] || []).map(f => `<span class="form-badge ${f}">${f}</span>`).join('');
        return `<tr class="${pc}">
          <td class="pos">${r.position}</td>
          <td><a href="#/team/${r.team.id}" class="team-cell"><img class="team-logo-sm" src="${api.teamImg(r.team.id)}" onerror="this.style.display='none'">${r.team.name}</a></td>
          <td>${r.matches}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td>
          <td>${r.scoresFor}</td><td>${r.scoresAgainst}</td><td>${r.scoreDiffFormatted || ''}</td>
          <td><strong>${r.points}</strong></td><td><div class="form-badges">${form}</div></td></tr>`;
      }).join('')}</tbody></table>`;
  },

  async _leaguePlayers(tid, sid) {
    const el = document.getElementById('leagueContent');
    el.innerHTML = `<div class="detail-tabs" style="margin-bottom:12px">
      <button class="tab-btn active" onclick="app._loadTopPlayers(${tid},${sid},'goals','⚽ Vua phá lưới',this)">⚽ Bàn thắng</button>
      <button class="tab-btn" onclick="app._loadTopPlayers(${tid},${sid},'assists','🎯 Kiến tạo',this)">🎯 Kiến tạo</button>
      <button class="tab-btn" onclick="app._loadTopPlayers(${tid},${sid},'rating','⭐ Rating',this)">⭐ Rating</button>
    </div><div id="topPlayersContent"><div class="loading-state"><div class="spinner"></div></div></div>`;
    await this._loadTopPlayers(tid, sid, 'goals', '⚽ Vua phá lưới');
  },

  async _loadTopPlayers(tid, sid, type, title, btn) {
    if (btn) {
      btn.closest('.detail-tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    const el = document.getElementById('topPlayersContent');
    if (!el) return;
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
    try {
      const data = await api.getTopPlayers(tid, sid, type);
      const players = data.topPlayers || [];
      if (!players.length) { el.innerHTML = this._empty('👤', 'Chưa có dữ liệu'); return; }
      el.innerHTML = `<div class="top-players-list">${players.slice(0, 20).map((p, i) => {
        const player = p.player || {};
        const team = p.team || player.team || {};
        const stat = p.statistics?.[type] ?? '-';
        const display = type === 'rating' ? parseFloat(stat).toFixed(2) : stat;
        const cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        return `<a href="#/player/${player.id}" class="top-player-row">
          <div class="top-player-rank ${cls}">${i + 1}</div>
          <img class="top-player-img" src="${api.playerImg(player.id)}" onerror="this.style.display='none'">
          <div class="top-player-info"><div class="top-player-name">${player.shortName || player.name || '?'}</div>
            <div class="top-player-team"><img src="${api.teamImg(team.id)}" onerror="this.style.display='none'">${team.shortName || team.name || ''}</div></div>
          <div class="top-player-stat">${display}</div></a>`;
      }).join('')}</div>`;
    } catch { el.innerHTML = this._err('Lỗi tải dữ liệu'); }
  },

  // ═══════════════════════════════════════
  //  SCHEDULE PAGE
  // ═══════════════════════════════════════
  async pageSchedule(date) {
    this.showPanel(false);
    const el = document.getElementById('page-content');
    if (!date) date = new Date().toISOString().split('T')[0];
    el.innerHTML = `<div class="page-header"><h2>📅 Lịch Thi Đấu</h2></div>
      <div class="date-strip" id="scheduleDateStrip"></div>
      <div id="scheduleMatches"><div class="loading-state"><div class="spinner"></div></div></div>`;
    // Date strip
    const strip = document.getElementById('scheduleDateStrip');
    const center = new Date(date);
    let stripHtml = '';
    for (let i = -3; i <= 3; i++) {
      const d = new Date(center); d.setDate(d.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      const label = ds === new Date().toISOString().split('T')[0] ? 'Hôm nay' : d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' });
      stripHtml += `<button class="date-btn ${i === 0 ? 'active' : ''}" onclick="router.navigate('#/schedule/${ds}')">${label}</button>`;
    }
    strip.innerHTML = stripHtml;

    try {
      const data = await api.getByDate(date);
      const matches = (data.events || []).map(e => api.mapEvent(e));
      const container = document.getElementById('scheduleMatches');
      if (!matches.length) { container.innerHTML = this._empty('📭', 'Không có trận đấu ngày ' + date); return; }
      const groups = this._groupByLeague(matches);
      let html = '';
      for (const [, g] of groups) {
        html += `<div class="league-group"><div class="league-group-header">
          <img src="${g.logo}" class="league-icon" onerror="this.outerHTML='⚽'">
          <a href="#/league/${g.id}" class="league-name">${g.name}</a>
          <span class="league-country">${g.country}</span>
          <span class="league-count">${g.matches.length}</span>
        </div>`;
        g.matches.forEach(m => { html += this._matchCard(m); });
        html += '</div>';
      }
      container.innerHTML = html;
    } catch { document.getElementById('scheduleMatches').innerHTML = this._err('Lỗi tải lịch'); }
  },

  // ═══════════════════════════════════════
  //  TEAM PAGE
  // ═══════════════════════════════════════
  async pageTeam(teamId) {
    teamId = parseInt(teamId);
    this.showPanel(false);
    const el = document.getElementById('page-content');
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tải đội bóng...</p></div>';

    try {
      const [teamData, lastData, nextData] = await Promise.all([
        api.getTeamDetail(teamId).catch(() => null),
        api.getTeamLastMatches(teamId, 0).catch(() => ({ events: [] })),
        api.getTeamNextMatches(teamId, 0).catch(() => ({ events: [] })),
      ]);

      const team = teamData?.team;
      const last = (lastData.events || []).slice(0, 10).map(e => api.mapEvent(e));
      const next = (nextData.events || []).slice(0, 10).map(e => api.mapEvent(e));

      let html = `<div class="team-header">
        <img src="${api.teamImg(teamId)}" class="team-logo-xl" onerror="this.style.display='none'">
        <div>
          <h2>${team?.name || 'Đội bóng'}</h2>
          ${team?.venue ? `<div class="text-muted">🏟️ ${team.venue.stadium?.name || team.venue.name || ''} ${team.venue.stadium?.capacity ? '(' + team.venue.stadium.capacity.toLocaleString() + ')' : ''}</div>` : ''}
          ${team?.manager ? `<div class="text-muted">👔 ${team.manager.name}</div>` : ''}
          ${team?.country ? `<div class="text-muted">📍 ${team.country.name || ''}</div>` : ''}
        </div>
      </div>`;

      // Upcoming matches
      if (next.length) {
        html += '<div class="section-block"><h4 class="section-label">Sắp tới</h4>';
        next.slice(0, 5).forEach(m => { html += this._matchCard(m); });
        html += '</div>';
      }

      // Recent results
      if (last.length) {
        html += '<div class="section-block"><h4 class="section-label">Kết quả gần đây</h4>';
        last.slice(0, 5).forEach(m => { html += this._matchCard(m); });
        html += '</div>';
      }

      el.innerHTML = html;
    } catch (e) { console.error(e); el.innerHTML = this._err('Lỗi tải thông tin đội bóng'); }
  },

  // ═══════════════════════════════════════
  //  PLAYER PAGE
  // ═══════════════════════════════════════
  async pagePlayer(playerId) {
    playerId = parseInt(playerId);
    this.showPanel(false);
    const el = document.getElementById('page-content');
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const data = await api.getPlayerDetail(playerId);
      const p = data?.player;
      if (!p) { el.innerHTML = this._empty('👤', 'Không tìm thấy cầu thủ'); return; }

      const age = p.dateOfBirthTimestamp ? Math.floor((Date.now() / 1000 - p.dateOfBirthTimestamp) / 31557600) : null;
      const value = p.proposedMarketValueRaw ? (p.proposedMarketValueRaw.value / 1e6).toFixed(1) + 'M €' : '';

      el.innerHTML = `<div class="player-header">
        <img src="${api.playerImg(playerId)}" class="player-photo" onerror="this.style.display='none'">
        <div class="player-info">
          <h2>${p.name}</h2>
          ${p.team ? `<a href="#/team/${p.team.id}" class="player-team"><img src="${api.teamImg(p.team.id)}" style="height:20px" onerror="this.style.display='none'"> ${p.team.name}</a>` : ''}
          <div class="player-meta">
            ${p.position ? `<span>📍 ${this._posVi(p.position)}</span>` : ''}
            ${p.shirtNumber ? `<span>#${p.shirtNumber}</span>` : ''}
            ${age ? `<span>🎂 ${age} tuổi</span>` : ''}
            ${p.height ? `<span>📏 ${p.height}cm</span>` : ''}
            ${p.preferredFoot ? `<span>🦶 ${p.preferredFoot === 'Right' ? 'Phải' : p.preferredFoot === 'Left' ? 'Trái' : 'Cả hai'}</span>` : ''}
            ${p.country ? `<span>🌍 ${p.country.name}</span>` : ''}
            ${value ? `<span>💰 ${value}</span>` : ''}
            ${p.contractUntilTimestamp ? `<span>📋 HĐ đến ${new Date(p.contractUntilTimestamp * 1000).getFullYear()}</span>` : ''}
          </div>
        </div>
      </div>`;
    } catch (e) { console.error(e); el.innerHTML = this._err('Lỗi tải thông tin cầu thủ'); }
  },

  // ═══════════════════════════════════════
  //  PREDICTIONS PAGE
  // ═══════════════════════════════════════
  async pagePredictions() {
    this.showPanel(false);
    const el = document.getElementById('page-content');
    el.innerHTML = '<div class="page-header"><h2>🎯 Dự Đoán & Phân Tích</h2></div><div id="predContent"><div class="loading-state"><div class="spinner"></div><p>Đang phân tích...</p></div></div>';

    try {
      const today = new Date().toISOString().split('T')[0];
      const tmr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const [d1, d2] = await Promise.all([api.getByDate(today), api.getByDate(tmr)]);
      const upcoming = [...(d1.events || []), ...(d2.events || [])].map(e => api.mapEvent(e)).filter(m => m.status === 'NS').slice(0, 10);

      if (!upcoming.length) { document.getElementById('predContent').innerHTML = this._empty('🎯', 'Không có trận sắp tới'); return; }

      // Fetch standings
      const leagueSeasons = new Map();
      upcoming.forEach(m => { const tid = m.league?.id, sid = m.league?.seasonId; if (tid && sid) leagueSeasons.set(`${tid}_${sid}`, { tid, sid }); });
      const sMap = {};
      await Promise.all([...leagueSeasons.values()].slice(0, 15).map(async ({ tid, sid }) => {
        try { const d = await api.getStandings(tid, sid); (d.standings?.[0]?.rows || []).forEach(r => { sMap[r.team.name] = r; }); } catch {}
      }));

      // Fetch team stats
      const tsMap = {};
      const fetches = [];
      upcoming.forEach(m => {
        const tid = m.league?.id, sid = m.league?.seasonId;
        if (!tid || !sid) return;
        [m.home, m.away].forEach(team => {
          if (team.id && !tsMap[team.id]) {
            tsMap[team.id] = null;
            fetches.push(api.getTeamStats(team.id, tid, sid).then(d => { tsMap[team.id] = d.statistics || null; }).catch(() => {}));
          }
        });
      });
      await Promise.all(fetches);

      document.getElementById('predContent').innerHTML = upcoming.map(m => this._predCard(m, sMap, tsMap)).join('');
    } catch (e) { console.error(e); document.getElementById('predContent').innerHTML = this._err('Lỗi tải dự đoán'); }
  },

  _predCard(m, sMap, tsMap) {
    const ht = sMap[m.home.name], at = sMap[m.away.name];
    const hs = tsMap[m.home.id], as = tsMap[m.away.id];
    const hM = ht?.matches || 1, aM = at?.matches || 1;
    const hGpM = (ht?.scoresFor || 0) / hM, aGpM = (at?.scoresFor || 0) / aM;
    const pGoals = ((hGpM + (at?.scoresAgainst || 0) / aM) / 2 + (aGpM + (ht?.scoresAgainst || 0) / hM) / 2).toFixed(1);

    let hScore = 0, aScore = 0;
    if (ht && at) { hScore += (ht.points / hM) * 10; aScore += (at.points / aM) * 10; }
    hScore += 3; // home advantage
    const total = Math.max(hScore + aScore, 1);
    let hp = Math.round((hScore / total) * 100), ap = Math.round((aScore / total) * 100);
    let dp = 100 - hp - ap;
    if (dp < 12) { dp = 12; hp = Math.round(hp * 88 / (hp + ap || 1)); ap = 88 - hp; }

    const kickoff = m.startTs ? new Date(m.startTs * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';

    return `<div class="prediction-card">
      <div class="pred-header">
        <a href="#/match/${m.id}" class="pred-match">
          <img src="${m.home.logo}" class="team-logo-sm" onerror="this.style.display='none'"> ${m.home.name} vs ${m.away.name} <img src="${m.away.logo}" class="team-logo-sm" onerror="this.style.display='none'">
        </a>
        <div class="pred-league"><img src="${m.league.logo}" style="height:14px" onerror="this.style.display='none'"> ${m.league.name} | ${kickoff}</div>
      </div>
      <div class="pred-body">
        <div class="pred-stat"><div class="pred-stat-label">Chủ${ht ? ' (H' + ht.position + ')' : ''}</div><div class="pred-stat-value text-blue">${hp}%</div></div>
        <div class="pred-stat"><div class="pred-stat-label">Hòa</div><div class="pred-stat-value">${dp}%</div></div>
        <div class="pred-stat"><div class="pred-stat-label">Khách${at ? ' (H' + at.position + ')' : ''}</div><div class="pred-stat-value text-red">${ap}%</div></div>
      </div>
      <div class="pred-goals">⚽ Dự đoán: ${pGoals} bàn ${parseFloat(pGoals) >= 2.5 ? '→ Tài 2.5' : '→ Xỉu 2.5'}</div>
    </div>`;
  },

  // ═══════════════════════════════════════
  //  SEARCH PAGE
  // ═══════════════════════════════════════
  async pageSearch() {
    this.showPanel(false);
    const q = router.getQuery().q || '';
    const el = document.getElementById('page-content');
    if (!q) { el.innerHTML = this._empty('🔍', 'Nhập từ khóa tìm kiếm'); return; }
    el.innerHTML = `<div class="page-header"><h2>🔍 Kết quả: "${q}"</h2></div><div id="searchResults"><div class="loading-state"><div class="spinner"></div></div></div>`;
    try {
      const data = await api.search(q);
      const teams = data.teams || [];
      const players = data.players || [];
      let html = '';
      if (teams.length) {
        html += '<h4 class="section-label">Đội bóng</h4>';
        teams.slice(0, 10).forEach(r => {
          const t = r.team || r;
          html += `<a href="#/team/${t.id}" class="search-result-row"><img src="${api.teamImg(t.id)}" class="team-logo-sm" onerror="this.style.display='none'"><span>${t.name}</span></a>`;
        });
      }
      if (players.length) {
        html += '<h4 class="section-label">Cầu thủ</h4>';
        players.slice(0, 10).forEach(r => {
          const p = r.player || r;
          html += `<a href="#/player/${p.id}" class="search-result-row"><img src="${api.playerImg(p.id)}" class="team-logo-sm" onerror="this.style.display='none'"><span>${p.name}</span><small class="text-muted">${p.team?.name || ''}</small></a>`;
        });
      }
      if (!html) html = this._empty('🔍', 'Không tìm thấy kết quả');
      document.getElementById('searchResults').innerHTML = html;
    } catch { document.getElementById('searchResults').innerHTML = this._err('Lỗi tìm kiếm'); }
  },

  // ═══════════════════════════════════════
  //  LIVE POLLING
  // ═══════════════════════════════════════
  startLivePolling() {
    setInterval(async () => {
      if (router.currentPage === '/' || router.currentPage === '/live') {
        await this._loadLive();
      }
    }, 30000);
  },

  _updateTicker(matches) {
    const el = document.getElementById('tickerContent');
    if (!el) return;
    const live = matches.filter(m => m.status === 'LIVE');
    if (!live.length) { el.innerHTML = '<span class="ticker-item">Không có trận live</span>'; return; }
    const items = live.slice(0, 15).map(m => {
      const t = m.minute != null ? m.minute + "'" : '';
      return `<span class="ticker-item"><span class="live-badge">LIVE</span> ${m.home.short} <span class="score">${m.homeScore}-${m.awayScore}</span> ${m.away.short} <span>(${t})</span></span>`;
    }).join('');
    el.innerHTML = items + items;
  },

  _updateLiveCount(matches) {
    const el = document.getElementById('liveCount');
    if (el) el.textContent = matches.filter(m => m.status === 'LIVE').length;
  },

  // ═══════════════════════════════════════
  //  SHARED UTILITIES
  // ═══════════════════════════════════════
  _groupByLeague(matches) {
    const map = new Map();
    matches.forEach(m => {
      const k = m.league.name || 'Khác';
      if (!map.has(k)) map.set(k, { name: k, id: m.league.id, logo: m.league.logo, country: m.league.country, matches: [] });
      map.get(k).matches.push(m);
    });
    return map;
  },

  _posVi(pos) { return { G: 'Thủ môn', D: 'Hậu vệ', M: 'Tiền vệ', F: 'Tiền đạo' }[pos] || pos || ''; },
  _frac(f) { if (!f) return '-'; const p = f.split('/'); if (p.length === 2) { const num = parseInt(p[0]), den = parseInt(p[1]); return den ? (num / den + 1).toFixed(2) : '-'; } return f; },
  _empty(icon, msg) { return `<div class="empty-state"><div class="icon">${icon}</div><p>${msg}</p></div>`; },
  _err(msg) { return `<div class="empty-state"><div class="icon">❌</div><p>${msg}</p></div>`; },
};

document.addEventListener('DOMContentLoaded', () => app.init());
