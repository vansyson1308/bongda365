// BongDa365 v5.0 - Sofascore-style SPA, 100% real data, Vietnamese
// Architecture: Router → Page handlers → API → Render
// Features: AI Insight, Timeline, Form, Tags, Recommendations, Mood Mode

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
    router.register('/news', () => this.pageNews());
    router.register('/news/([^/]+)', (id) => this.pageNewsDetail(id));
    router.register('/worldcup', () => this.pageWorldCup());
    router.register('/search', () => this.pageSearch());
  },

  // SEO: Update page title dynamically
  setTitle(title) {
    document.title = title ? `${title} | BongDa365` : 'BongDa365 - Tỉ Số Trực Tiếp | Dự Đoán AI | Chat Live';
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
    this.setTitle('Trực Tiếp Bóng Đá');
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
      <div class="social-proof-bar" id="socialProofBar">
        <span class="sp-item">📊 <span id="spAnalyzed">0</span> trận phân tích</span>
        <span class="sp-item">🎯 <span id="spAccuracy">--</span>% chính xác</span>
        <span class="sp-item">💬 <span id="spChatters">0</span> fan online</span>
      </div>
      <div class="date-strip" id="dateStrip"></div>
      <div class="filter-bar">
        <button class="filter-btn active" data-filter="live" onclick="app.filterLive('live',this)">🔴 Live</button>
        <button class="filter-btn" data-filter="all" onclick="app.filterLive('all',this)">Tất cả</button>
        <button class="filter-btn" data-filter="fav" onclick="app.filterLive('fav',this)">★ Yêu thích</button>
        <span class="filter-sep">|</span>
        <button class="mood-btn" onclick="app.filterMood('goals',this)">🔥 Nhiều bàn</button>
        <button class="mood-btn" onclick="app.filterMood('tactical',this)">🧠 Chiến thuật</button>
        <button class="mood-btn" onclick="app.filterMood('entertainment',this)">🎯 Giải trí</button>
      </div>
      <div id="liveRecommendations"></div>
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

  _updateLiveFromSocket(events) {
    this.liveMatches = (events || []).map(e => api.mapEvent(e));
    this._renderLiveMatches();
    this._updateTicker(this.liveMatches);
    this._updateLiveCount(this.liveMatches);
  },

  _renderLiveMatches() {
    const el = document.getElementById('liveMatches');
    if (!el) return;
    let matches = this.liveMatches;
    if (this._liveFilter === 'live') matches = matches.filter(m => m.status === 'LIVE');
    else if (this._liveFilter === 'fav') matches = matches.filter(m => favourites.hasLeague(m.league.id) || favourites.hasTeam(m.home.id) || favourites.hasTeam(m.away.id));
    // Apply mood filter
    if (this._currentMood) matches = matches.filter(m => this._matchesMood(m, this._currentMood));

    // Render recommendations
    const recEl = document.getElementById('liveRecommendations');
    if (recEl && !this._currentMood && this._liveFilter === 'live') {
      recEl.innerHTML = this._renderRecommendations(this.liveMatches);
    } else if (recEl) { recEl.innerHTML = ''; }

    if (!matches.length) { el.innerHTML = this._empty('😴', this._liveFilter === 'fav' ? 'Không có trận yêu thích. Thêm ★ vào giải đấu!' : this._currentMood ? 'Không có trận phù hợp mood này.' : 'Không có trận nào.'); return; }

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
    this.setTitle('Trận đấu trực tiếp');
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

      // Fetch team form data
      let homeForm = [], awayForm = [];
      if (match) {
        try {
          const [hFormData, aFormData] = await Promise.all([
            api.getTeamLastMatches(match.home.id, 0).catch(() => ({ events: [] })),
            api.getTeamLastMatches(match.away.id, 0).catch(() => ({ events: [] })),
          ]);
          homeForm = this._computeForm(hFormData.events, match.home.id);
          awayForm = this._computeForm(aFormData.events, match.away.id);
        } catch {}
      }

      el.innerHTML = this._matchPage(match, stats, incidents, lineups, odds, h2h, graph, shotmap, bestPlayers, avgPositions, homeForm, awayForm);

      // Update title with match names
      if (match) this.setTitle(`${match.home.name} vs ${match.away.name}`);

      // Prediction game
      if (match && typeof predGame !== 'undefined') {
        const predSection = document.getElementById('predGameSection');
        if (predSection) {
          predSection.innerHTML = predGame.renderPredictionForm(eid, match.home.short, match.away.short, match.status);
          // Auto-record result for finished matches
          if (match.status === 'FT' && match.homeScore != null) {
            predGame.recordResult(eid, match.homeScore, match.awayScore, `${match.home.short} vs ${match.away.short}`);
          }
        }
      }

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

  _matchPage(m, stats, incidents, lineups, odds, h2h, graph, shotmap, bestPlayers, avgPositions, homeForm, awayForm) {
    homeForm = homeForm || [];
    awayForm = awayForm || [];
    let html = '';

    // Header
    if (m) {
      const live = m.status === 'LIVE';
      const tags = this._classifyMatch(stats, m, incidents);
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
        ${tags.length ? this._renderMatchTags(tags) : ''}
        ${(homeForm.length || awayForm.length) ? this._renderTeamForm(homeForm, awayForm, m.home.short, m.away.short) : ''}
      </div>`;
    }

    // Tabs
    const tabs = [
      { id: 'summary', label: 'Tổng quan', show: true },
      { id: 'timeline', label: 'Timeline', show: incidents.length > 0 },
      { id: 'stats', label: 'Thống kê', show: stats.length > 0 },
      { id: 'lineups', label: 'Đội hình', show: !!(lineups?.home) },
      { id: 'shotmap', label: 'Sút', show: !!(shotmap?.shotmap?.length) },
      { id: 'h2h', label: 'Đối đầu', show: !!h2h },
      { id: 'odds', label: 'Kèo', show: odds.length > 0 },
    ];

    html += `<div class="detail-tabs">${tabs.filter(t => t.show).map((t, i) =>
      `<button class="tab-btn ${i === 0 ? 'active' : ''}" onclick="app._matchTab(this,'mtab-${t.id}')">${t.label}</button>`
    ).join('')}</div>`;

    // Summary tab — AI Insight + incidents + best players + avg positions
    html += `<div id="mtab-summary" class="tab-panel">`;
    html += this._renderMatchInsight(m, h2h, odds, stats, homeForm, awayForm, bestPlayers);
    html += `<div id="probChartContainer"></div>`;
    html += this._renderWhatIf(m);
    html += this._renderIncidents(incidents);
    if (bestPlayers) html += this._renderBestPlayers(bestPlayers, m);
    if (avgPositions) html += this._renderAvgPositions(avgPositions, m);
    // Prediction game section
    html += '<div id="predGameSection"></div>';
    html += '</div>';

    // Timeline tab
    if (incidents.length) {
      html += `<div id="mtab-timeline" class="tab-panel" style="display:none">`;
      html += this._renderTimeline(incidents, graph, m);
      html += '</div>';
    }

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
    let html = '<div class="section-block"><div class="section-label">Cầu thủ nổi bật</div>';

    // Get top 3 players per team from lineups if available
    const renderPlayerCard = (p, side) => {
      if (!p?.player) return '';
      const rating = parseFloat(p.value || 0);
      const rColor = rating >= 7.5 ? 'var(--green)' : rating >= 6.5 ? 'var(--accent)' : 'var(--text-muted)';
      return `<a href="#/player/${p.player.id}" class="best-player-card">
        <img src="${api.playerImg(p.player.id)}" onerror="this.style.display='none'">
        <div><div class="player-name">${p.player.shortName}</div>
        <div class="player-rating" style="color:${rColor}">${rating.toFixed(1)}</div></div></a>`;
    };

    html += `<div class="best-players-side"><div class="best-players-team text-blue">${m?.home?.short || 'Chủ'}</div><div class="best-players-row">`;
    // Show up to 3 home players
    const homePlayers = [homeBest];
    if (bp.bestHomeTeamPlayers) homePlayers.push(...bp.bestHomeTeamPlayers.slice(0, 2));
    const seenHome = new Set();
    homePlayers.forEach(p => {
      if (p?.player?.id && !seenHome.has(p.player.id) && seenHome.size < 3) {
        seenHome.add(p.player.id);
        html += renderPlayerCard(p, 'home');
      }
    });
    html += '</div></div>';

    html += `<div class="best-players-side"><div class="best-players-team text-red">${m?.away?.short || 'Khách'}</div><div class="best-players-row">`;
    const awayPlayers = [awayBest];
    if (bp.bestAwayTeamPlayers) awayPlayers.push(...bp.bestAwayTeamPlayers.slice(0, 2));
    const seenAway = new Set();
    awayPlayers.forEach(p => {
      if (p?.player?.id && !seenAway.has(p.player.id) && seenAway.size < 3) {
        seenAway.add(p.player.id);
        html += renderPlayerCard(p, 'away');
      }
    });
    html += '</div></div>';

    return html + '</div>';
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
    const rating = p?.statistics?.rating ? parseFloat(p.statistics.rating) : 0;
    // Rating color-coding: green >7.5, yellow >6.5, red <6, default = team color
    let rColor = color;
    if (rating >= 7.5) rColor = '#22c55e';
    else if (rating >= 6.5) rColor = '#f59e0b';
    else if (rating > 0 && rating < 6) rColor = '#ef4444';
    const ratingText = rating > 0 ? `<text x="${x}" y="${y - 18}" font-size="9" font-weight="600" fill="${rColor}" text-anchor="middle">${rating.toFixed(1)}</text>` : '';
    return `<circle cx="${x}" cy="${y}" r="14" fill="${color}" opacity="0.9" stroke="${rating >= 7.5 ? '#22c55e' : 'white'}" stroke-width="${rating >= 7.5 ? 2.5 : 1.5}"/>
      <text x="${x}" y="${y + 4}" font-size="10" font-weight="700" fill="white" text-anchor="middle">${num}</text>
      <text x="${x}" y="${y + 25}" font-size="8" fill="white" text-anchor="middle">${name}</text>
      ${ratingText}`;
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
    const homeGoals = homeS.filter(s => s.shotType === 'goal').length;
    const awayGoals = awayS.filter(s => s.shotType === 'goal').length;
    const homeOnTarget = homeS.filter(s => s.shotType === 'save' || s.shotType === 'goal').length;
    const awayOnTarget = awayS.filter(s => s.shotType === 'save' || s.shotType === 'goal').length;
    return `<div class="section-label"><span class="text-blue">${m?.home?.short || ''}: ${homeS.length} sút (xG: ${homeS.reduce((s, x) => s + (x.xg || 0), 0).toFixed(2)})</span>
      <span class="text-red">${m?.away?.short || ''}: ${awayS.length} sút (xG: ${awayS.reduce((s, x) => s + (x.xg || 0), 0).toFixed(2)})</span></div>
      <svg viewBox="0 0 ${w} ${h}" class="shotmap-svg">${svg}</svg>
      <div class="shotmap-legend">
        <span class="shotmap-legend-item"><span class="shotmap-dot" style="background:var(--accent);border:2px solid white"></span> Bàn thắng (${homeGoals + awayGoals})</span>
        <span class="shotmap-legend-item"><span class="shotmap-dot" style="background:var(--blue)"></span> Trúng đích (${homeOnTarget + awayOnTarget})</span>
        <span class="shotmap-legend-item"><span class="shotmap-dot" style="background:var(--text-muted);opacity:0.6"></span> Không trúng</span>
      </div>`;
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
    this.setTitle(lg ? lg.name : 'Giải đấu');
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
    this.setTitle('Lịch Thi Đấu');
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
    this.setTitle('Đội bóng');
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
    this.setTitle('Cầu thủ');
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
    this.setTitle('Dự Đoán & Phân Tích AI');
    this.showPanel(false);
    const el = document.getElementById('page-content');
    el.innerHTML = '<div class="page-header"><h2>🎯 Dự Đoán & Phân Tích</h2></div><div id="predLeaderboard"></div><div id="predContent"><div class="loading-state"><div class="spinner"></div><p>Đang phân tích...</p></div></div>';

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
      // Add leaderboard section
      if (typeof chat !== 'undefined' && chat.socket) {
        chat.socket.emit('get_leaderboard');
      }
    } catch (e) { console.error(e); document.getElementById('predContent').innerHTML = this._err('Lỗi tải dự đoán'); }
  },

  _renderLeaderboard(data) {
    const lbEl = document.getElementById('predLeaderboard');
    if (!lbEl || !data?.leaderboard?.length) return;
    let html = '<div class="section-label">🏆 Bảng Xếp Hạng Dự Đoán</div><div class="leaderboard-list">';
    data.leaderboard.forEach((entry, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const isMe = entry.user === (predGame?.username || '');
      html += `<div class="leaderboard-item ${isMe ? 'is-me' : ''}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-user">${entry.user}</span>
        <span class="lb-score">${entry.score} điểm</span>
        <span class="lb-stats">${entry.exact || 0}🎯 ${entry.correct || 0}✅</span>
      </div>`;
    });
    html += '</div>';
    lbEl.innerHTML = html;
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
      <div class="pred-goals">⚽ Dự đoán: ${pGoals} bàn ${parseFloat(pGoals) >= 2.5 ? '→ Trên 2.5 bàn' : '→ Dưới 2.5 bàn'}</div>
    </div>`;
  },

  // ═══════════════════════════════════════
  //  WORLD CUP 2026 PAGE
  // ═══════════════════════════════════════
  pageWorldCup() {
    this.setTitle('World Cup 2026');
    this.showPanel(false);
    const el = document.getElementById('page-content');
    if (typeof worldcup !== 'undefined') {
      el.innerHTML = worldcup.render();
    } else {
      el.innerHTML = this._empty('🏆', 'World Cup 2026 - Sắp ra mắt!');
    }
  },

  // ═══════════════════════════════════════
  //  SEARCH PAGE
  // ═══════════════════════════════════════
  async pageSearch() {
    this.setTitle('Tìm kiếm');
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
  //  NEWS PAGE
  // ═══════════════════════════════════════
  _newsCurrentPage: 1,
  _newsCategory: null,

  async pageNews() {
    this.setTitle('Tin Tức Bóng Đá');
    this.showPanel(false);
    this._newsCurrentPage = 1;
    this._newsCategory = null;
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header"><h2>📰 Tin Tức Bóng Đá</h2><p class="text-muted">Cập nhật tự động từ BBC Sport, ESPN, Sky Sports</p></div>
      <div class="news-filter-bar" id="newsFilterBar">
        <button class="filter-btn active" data-cat="all">Tất cả</button>
        <button class="filter-btn" data-cat="transfers">Chuyển nhượng</button>
        <button class="filter-btn" data-cat="injuries">Chấn thương</button>
        <button class="filter-btn" data-cat="match-preview">Trước trận</button>
        <button class="filter-btn" data-cat="match-review">Sau trận</button>
        <button class="filter-btn" data-cat="general">Tổng hợp</button>
      </div>
      <div id="newsGrid" class="news-grid"><div class="loading-state"><div class="spinner"></div></div></div>
      <div id="newsLoadMore" style="text-align:center;padding:20px;display:none">
        <button class="btn-loadmore" id="btnLoadMore">Xem thêm</button>
      </div>`;

    // Filter buttons
    document.getElementById('newsFilterBar').addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      document.querySelectorAll('#newsFilterBar .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this._newsCategory = btn.dataset.cat === 'all' ? null : btn.dataset.cat;
      this._newsCurrentPage = 1;
      this._loadNews(false);
    });

    // Load more
    document.getElementById('btnLoadMore').addEventListener('click', () => {
      this._newsCurrentPage++;
      this._loadNews(true);
    });

    this._loadNews(false);
  },

  async _loadNews(append) {
    const grid = document.getElementById('newsGrid');
    const loadMore = document.getElementById('newsLoadMore');
    if (!append) grid.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const data = await api.getNews(this._newsCurrentPage, this._newsCategory);
      const articles = data.articles || [];

      if (!append && articles.length === 0) {
        grid.innerHTML = this._empty('📰', 'Chưa có tin tức. Hệ thống đang thu thập dữ liệu...');
        loadMore.style.display = 'none';
        return;
      }

      const html = articles.map(a => this._newsCard(a)).join('');
      if (append) {
        grid.insertAdjacentHTML('beforeend', html);
      } else {
        grid.innerHTML = html;
      }

      loadMore.style.display = this._newsCurrentPage < data.pages ? '' : 'none';
    } catch (e) {
      if (!append) grid.innerHTML = this._err('Lỗi tải tin tức');
    }
  },

  _newsCard(a) {
    const timeAgo = this._timeAgo(a.pubDate);
    const catVi = { transfers: 'Chuyển nhượng', injuries: 'Chấn thương', 'match-preview': 'Trước trận', 'match-review': 'Sau trận', general: 'Tổng hợp' };
    const imgStyle = a.imageUrl ? `background-image:url(${a.imageUrl})` : 'background:var(--bg-secondary)';
    return `<a href="#/news/${a.id}" class="news-card">
      <div class="news-card-img" style="${imgStyle}"></div>
      <div class="news-card-body">
        <span class="news-tag news-tag-${a.category}">${catVi[a.category] || 'Tổng hợp'}</span>
        <h3 class="news-card-title">${a.titleVi || a.title}</h3>
        <p class="news-card-summary">${a.summaryVi || a.summary}</p>
        <div class="news-card-meta">
          <span class="news-source">${a.source}</span>
          <span class="news-time">${timeAgo}</span>
        </div>
      </div>
    </a>`;
  },

  async pageNewsDetail(id) {
    this.showPanel(false);
    const el = document.getElementById('page-content');
    el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const data = await api.getNewsArticle(id);
      const a = data.article;
      if (!a) { el.innerHTML = this._empty('📰', 'Không tìm thấy bài viết'); return; }

      this.setTitle(a.titleVi || a.title);
      const catVi = { transfers: 'Chuyển nhượng', injuries: 'Chấn thương', 'match-preview': 'Trước trận', 'match-review': 'Sau trận', general: 'Tổng hợp' };
      const pubDate = new Date(a.pubDate).toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const leagueTags = (a.leagueTags || []).map(t => `<span class="news-league-tag">${t.replace(/-/g, ' ')}</span>`).join('');

      el.innerHTML = `
        <div class="news-detail">
          <a href="#/news" class="news-back">&larr; Tất cả tin tức</a>
          <span class="news-tag news-tag-${a.category}">${catVi[a.category] || 'Tổng hợp'}</span>
          <h1 class="news-detail-title">${a.titleVi || a.title}</h1>
          <div class="news-detail-meta">
            <span class="news-source">${a.source}</span>
            <span class="news-time">${pubDate}</span>
          </div>
          ${a.imageUrl ? `<img src="${a.imageUrl}" class="news-detail-img" onerror="this.style.display='none'" alt="${a.titleVi || a.title}">` : ''}
          <p class="news-detail-summary">${a.summaryVi || a.summary}</p>
          ${leagueTags ? `<div class="news-league-tags">${leagueTags}</div>` : ''}
          <a href="${a.link}" target="_blank" rel="noopener noreferrer" class="news-read-original">Đọc bài gốc tại ${a.source} &rarr;</a>
        </div>
        <div class="news-related" id="newsRelated"></div>`;

      // Load related articles
      this._loadRelatedNews(a);
    } catch (e) {
      el.innerHTML = this._err('Lỗi tải bài viết');
    }
  },

  async _loadRelatedNews(current) {
    const container = document.getElementById('newsRelated');
    if (!container) return;
    try {
      const data = await api.getNews(1, current.category);
      const related = (data.articles || []).filter(a => a.id !== current.id).slice(0, 4);
      if (related.length === 0) return;
      container.innerHTML = `<h3 class="section-label">Tin liên quan</h3><div class="news-grid news-grid-related">${related.map(a => this._newsCard(a)).join('')}</div>`;
    } catch {}
  },

  _timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
    return new Date(ts).toLocaleDateString('vi-VN');
  },

  // ═══════════════════════════════════════
  //  LIVE POLLING
  // ═══════════════════════════════════════
  startLivePolling() {
    setInterval(async () => {
      if (router.currentPage === '/' || router.currentPage === '/live') {
        // Only poll via HTTP when Socket.io is disconnected (fallback)
        if (!chat.socket?.connected) await this._loadLive();
      }
    }, CONFIG.REFRESH);
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
  //  MATCH PERSONALITY TAGS
  // ═══════════════════════════════════════
  _classifyMatch(stats, match, incidents) {
    const tags = [];
    if (!match) return tags;
    const totalGoals = (match.homeScore || 0) + (match.awayScore || 0);
    const bothScored = (match.homeScore || 0) > 0 && (match.awayScore || 0) > 0;
    const isTied = match.homeScore === match.awayScore && match.status === 'LIVE';

    if (totalGoals >= 4) tags.push({ icon: '🔥', label: 'Mưa bàn thắng', cls: 'tag-goals' });
    if (bothScored) tags.push({ icon: '🎯', label: 'Mở', cls: 'tag-open' });
    if (isTied && match.minute > 75) tags.push({ icon: '😰', label: 'Kịch tính', cls: 'tag-tense' });

    if (stats && stats.length) {
      const poss = stats.find(s => (s.name || '').toLowerCase().includes('possession'));
      if (poss) {
        const h = parseFloat(String(poss.home || poss.hv || 0).replace('%', ''));
        const a = parseFloat(String(poss.away || poss.av || 0).replace('%', ''));
        if (Math.abs(h - a) >= 25) tags.push({ icon: '🧠', label: 'Chiến thuật', cls: 'tag-tactical' });
      }
      const totalShots = stats.filter(s => (s.name || '').toLowerCase() === 'total shots')
        .reduce((sum, s) => sum + (parseInt(s.home) || 0) + (parseInt(s.away) || 0), 0);
      if (totalShots >= 30) tags.push({ icon: '⚡', label: 'Tấn công', cls: 'tag-attack' });
    }

    const totalCards = (incidents || []).filter(i => i.incidentType === 'card').length;
    if (totalCards >= 6) tags.push({ icon: '💪', label: 'Thể lực', cls: 'tag-physical' });

    return tags.slice(0, 3); // max 3 tags
  },

  _renderMatchTags(tags) {
    if (!tags.length) return '';
    return `<div class="match-tags">${tags.map(t =>
      `<span class="match-tag ${t.cls}">${t.icon} ${t.label}</span>`
    ).join('')}</div>`;
  },

  // ═══════════════════════════════════════
  //  TEAM FORM (Last 5 Matches)
  // ═══════════════════════════════════════
  _computeForm(events, teamId) {
    return (events || []).slice(0, 5).map(e => {
      const isHome = e.homeTeam?.id === teamId;
      const hs = e.homeScore?.current, as = e.awayScore?.current;
      if (hs == null || as == null) return null;
      return (isHome && hs > as) || (!isHome && as > hs) ? 'W' : hs === as ? 'D' : 'L';
    }).filter(Boolean);
  },

  _renderTeamForm(homeForm, awayForm, homeName, awayName) {
    const badge = f => `<span class="form-badge ${f}">${f === 'W' ? 'T' : f === 'D' ? 'H' : 'B'}</span>`;
    return `<div class="team-form-row">
      <div class="team-form-side">
        <span class="team-form-name">${homeName}</span>
        <div class="form-badges">${homeForm.map(badge).join('')}</div>
      </div>
      <span class="form-label">PHONG ĐỘ</span>
      <div class="team-form-side away">
        <div class="form-badges">${awayForm.map(badge).join('')}</div>
        <span class="team-form-name">${awayName}</span>
      </div>
    </div>`;
  },

  // ═══════════════════════════════════════
  //  AI MATCH INSIGHT
  // ═══════════════════════════════════════
  _renderMatchInsight(match, h2h, odds, stats, homeForm, awayForm, bestPlayers) {
    if (!match) return '';
    let dataSources = 0;

    // Base probability
    let hp = 40, dp = 25, ap = 35;

    // Home advantage
    hp += 5; ap -= 5;

    // Form factor
    if (homeForm.length >= 3) {
      dataSources++;
      const hWins = homeForm.filter(f => f === 'W').length;
      const aWins = awayForm.filter(f => f === 'W').length;
      hp += (hWins - 2.5) * 4;
      ap += (aWins - 2.5) * 4;
    }

    // H2H factor
    const td = h2h?.teamDuel;
    let h2hFactors = [];
    if (td && (td.homeWins + td.draws + td.awayWins) >= 3) {
      dataSources++;
      const total = td.homeWins + td.draws + td.awayWins;
      const hRate = td.homeWins / total;
      const aRate = td.awayWins / total;
      hp += (hRate - 0.4) * 20;
      ap += (aRate - 0.35) * 20;
      h2hFactors = [td.homeWins, td.draws, td.awayWins, total];
    }

    // Odds factor
    let oddsText = '';
    if (odds && odds.length) {
      const m1x2 = odds.find(o => o.marketName === 'Full time' || o.marketName === '1X2');
      if (m1x2?.choices?.length === 3) {
        dataSources++;
        const c = m1x2.choices;
        const implied = c.map(ch => {
          const f = ch.fractionalValue;
          if (!f) return 33;
          const p = f.split('/');
          return p.length === 2 ? 100 / (parseInt(p[0]) / parseInt(p[1]) + 1) : 33;
        });
        const iTotal = implied.reduce((s, v) => s + v, 0);
        const norm = implied.map(v => v / iTotal * 100);
        // Blend 50/50 with rule-based
        hp = (hp + norm[0]) / 2;
        dp = (dp + norm[1]) / 2;
        ap = (ap + norm[2]) / 2;
        oddsText = c.map(ch => `${ch.name}: ${this._frac(ch.fractionalValue)}`).join(' | ');
      }
    }

    // Normalize
    const sum = hp + dp + ap;
    hp = Math.round(hp / sum * 100);
    ap = Math.round(ap / sum * 100);
    dp = 100 - hp - ap;
    if (dp < 8) { dp = 8; const r = 92 / (hp + ap || 1); hp = Math.round(hp * r); ap = 92 - hp; }

    if (dataSources < 1) return '';

    // Key factors
    const factors = [];
    factors.push(`🏟️ ${match.home.short} có lợi thế sân nhà`);
    if (homeForm.length >= 3) {
      const hW = homeForm.filter(f => f === 'W').length;
      const aW = awayForm.filter(f => f === 'W').length;
      if (hW >= 3) factors.push(`📈 ${match.home.short} thắng ${hW}/${homeForm.length} trận gần đây`);
      if (aW >= 3) factors.push(`📈 ${match.away.short} thắng ${aW}/${awayForm.length} trận gần đây`);
      if (hW <= 1) factors.push(`📉 ${match.home.short} phong độ kém (${hW} thắng/${homeForm.length} trận)`);
      if (aW <= 1) factors.push(`📉 ${match.away.short} phong độ kém (${aW} thắng/${awayForm.length} trận)`);
    }
    if (h2hFactors.length) {
      factors.push(`⚔️ Đối đầu: ${match.home.short} ${h2hFactors[0]}-${h2hFactors[1]}-${h2hFactors[2]} ${match.away.short} (${h2hFactors[3]} trận)`);
    }
    if (bestPlayers) {
      const hBest = bestPlayers.bestHomeTeamPlayer || bestPlayers.home;
      const aBest = bestPlayers.bestAwayTeamPlayer || bestPlayers.away;
      if (hBest?.player && parseFloat(hBest.value) >= 7.5) factors.push(`⭐ ${hBest.player.shortName} phong độ cao (${parseFloat(hBest.value).toFixed(1)})`);
      if (aBest?.player && parseFloat(aBest.value) >= 7.5) factors.push(`⭐ ${aBest.player.shortName} phong độ cao (${parseFloat(aBest.value).toFixed(1)})`);
    }

    const winner = hp > ap ? match.home.short : ap > hp ? match.away.short : 'Hòa';
    const winProb = Math.max(hp, ap, dp);

    // Oracle quote - Ngựa Tiên Tri personality
    const oracleQuote = this._generateOracleQuote(hp, dp, ap, factors, match);

    // Confidence level based on data sources
    const confidence = dataSources >= 3 ? 3 : dataSources >= 2 ? 2 : 1;
    const stars = '⭐'.repeat(confidence) + '☆'.repeat(3 - confidence);
    const confLabel = confidence >= 3 ? 'Rất tự tin' : confidence >= 2 ? 'Khá tự tin' : 'Tham khảo';

    // Balance indicator
    const balance = Math.abs(hp - ap) < 10 ? 'cân bằng' : hp > ap ? 'lệch chủ' : 'lệch khách';

    return `<div class="tien-tri-card">
      <div class="tt-header">
        <span class="tt-avatar">🐴</span>
        <span class="tt-title">Ngựa Tiên Tri</span>
        <span class="tt-confidence" title="${confLabel}">${stars}</span>
      </div>
      <div class="tt-quote">"${oracleQuote}"</div>
      <div class="tt-probs">
        <div class="tt-team home">
          <img src="${match.home.logo}" class="team-logo-sm" onerror="this.style.display='none'">
          <span class="tt-team-name">${match.home.short}</span>
          <span class="tt-pct text-blue">${hp}%</span>
        </div>
        <div class="tt-team draw">
          <span class="tt-team-name">Hòa</span>
          <span class="tt-pct">${dp}%</span>
        </div>
        <div class="tt-team away">
          <img src="${match.away.logo}" class="team-logo-sm" onerror="this.style.display='none'">
          <span class="tt-team-name">${match.away.short}</span>
          <span class="tt-pct text-red">${ap}%</span>
        </div>
      </div>
      <div class="tt-bar">
        <div class="tt-bar-home" style="width:${hp}%"></div>
        <div class="tt-bar-draw" style="width:${dp}%"></div>
        <div class="tt-bar-away" style="width:${ap}%"></div>
      </div>
      <div class="tt-verdict">
        <span class="tt-balance">${balance}</span>
        🏆 <strong>${winner}</strong> (${winProb}%)
      </div>
      <details class="tt-explain">
        <summary>📊 Tại sao? (${dataSources} nguồn dữ liệu)</summary>
        <div class="tt-factors">
          ${factors.slice(0, 5).map(f => `<div class="tt-factor">${f}</div>`).join('')}
        </div>
      </details>
      <div class="tt-share">
        <button class="tt-share-btn" onclick="app._shareTienTri(${match.id})">📤 Chia sẻ thẻ</button>
      </div>
    </div>`;
  },

  _generateOracleQuote(hp, dp, ap, factors, match) {
    const winner = hp > ap ? 'home' : ap > hp ? 'away' : 'draw';
    const margin = Math.abs(hp - ap);
    const homeName = match.home.short;
    const awayName = match.away.short;
    const hasForm = factors.some(f => f.includes('trận gần'));
    const hasH2H = factors.some(f => f.includes('Đối đầu'));
    const hasStar = factors.some(f => f.includes('phong độ cao'));

    // Troll mode for big margins
    if (margin > 25) {
      const strong = winner === 'home' ? homeName : awayName;
      const weak = winner === 'home' ? awayName : homeName;
      const trolls = [
        `${weak} nghe tên mạnh, nhưng số liệu không bênh nổi`,
        `${strong} chỉ cần thi đấu bình thường là đủ thắng`,
        `Ngựa nói thẳng: ${weak} hôm nay khó lắm`,
      ];
      return trolls[Math.floor(Math.random() * trolls.length)];
    }

    // Draw prediction
    if (winner === 'draw' || dp > 30) {
      const draws = [
        `Trận này mùi hòa khá nồng`,
        `Cả hai đội đều thận trọng, hòa là kết quả hợp lý`,
        `Cân bằng tuyệt đối. Một điểm cho mỗi đội`,
      ];
      return draws[Math.floor(Math.random() * draws.length)];
    }

    // Expert mode with specific factors
    const fav = winner === 'home' ? homeName : awayName;
    const other = winner === 'home' ? awayName : homeName;
    const experts = [];
    if (hasForm && hasH2H) experts.push(`${fav} vừa có phong độ tốt, vừa có lịch sử đối đầu thuận lợi. Cửa sáng!`);
    if (hasStar) experts.push(`Cầu thủ ngôi sao đang cháy — yếu tố quyết định trận đấu`);
    if (winner === 'home') {
      experts.push(`${homeName} mạnh sân nhà, dữ liệu ủng hộ. Nhưng bóng đá luôn có bất ngờ`);
      experts.push(`${homeName} có lợi thế rõ ràng hôm nay, nhưng ${awayName} không dễ buông`);
    } else {
      experts.push(`${awayName} dù đá sân khách nhưng phong độ vượt trội. Cửa khách đáng chú ý`);
      experts.push(`Dữ liệu cho thấy ${awayName} có đủ vũ khí để giành 3 điểm trên sân khách`);
    }
    return experts[Math.floor(Math.random() * experts.length)];
  },

  _shareTienTri(matchId) {
    if (typeof chat !== 'undefined' && chat.generatePredictionCard) {
      const el = document.querySelector('.tien-tri-card');
      if (!el) return;
      const hp = parseInt(el.querySelector('.tt-team.home .tt-pct')?.textContent) || 33;
      const dp = parseInt(el.querySelector('.tt-team.draw .tt-pct')?.textContent) || 34;
      const ap = parseInt(el.querySelector('.tt-team.away .tt-pct')?.textContent) || 33;
      const homeName = el.querySelector('.tt-team.home .tt-team-name')?.textContent || '';
      const awayName = el.querySelector('.tt-team.away .tt-team-name')?.textContent || '';
      const quote = el.querySelector('.tt-quote')?.textContent || '';
      const canvas = chat.generatePredictionCard({ homeName, awayName, hp, dp, ap, quote });
      chat.shareCard(canvas, `🐴 Ngựa Tiên Tri dự đoán: ${homeName} vs ${awayName} — BongDa365`);
    }
  },

  // ═══════════════════════════════════════
  //  PROBABILITY CHART + WHAT-IF
  // ═══════════════════════════════════════
  _renderProbChart(history) {
    if (!history || history.length < 2) return '';
    const w = 640, h = 180, pad = 40;
    const n = history.length;
    const xStep = (w - pad * 2) / Math.max(n - 1, 1);

    const linePath = (key, data) => {
      return data.map((d, i) => `${i === 0 ? 'M' : 'L'}${pad + i * xStep},${pad + (100 - d[key]) * (h - pad * 2) / 100}`).join(' ');
    };

    // Find turning points
    const tpDots = history.filter(d => d.turningPoint).map((d, _, arr) => {
      const idx = history.indexOf(d);
      const x = pad + idx * xStep;
      const y = pad + (100 - d.hp) * (h - pad * 2) / 100;
      return `<circle cx="${x}" cy="${y}" r="6" fill="#f59e0b" stroke="#fff" stroke-width="2"><animate attributeName="r" values="6;8;6" dur="1.5s" repeatCount="indefinite"/></circle>`;
    }).join('');

    return `<div class="prob-chart-section">
      <div class="section-label">📈 Biến động xác suất</div>
      <svg class="prob-chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
        <!-- Grid lines -->
        ${[25, 50, 75].map(v => {
          const y = pad + (100 - v) * (h - pad * 2) / 100;
          return `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="#333" stroke-dasharray="4"/>
            <text x="${pad - 4}" y="${y + 4}" fill="#666" font-size="10" text-anchor="end">${v}%</text>`;
        }).join('')}
        <!-- Lines -->
        <path d="${linePath('hp', history)}" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"/>
        <path d="${linePath('dp', history)}" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="4" stroke-linecap="round"/>
        <path d="${linePath('ap', history)}" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
        ${tpDots}
        <!-- Legend -->
        <circle cx="${pad}" cy="${h - 8}" r="4" fill="#3b82f6"/><text x="${pad + 8}" y="${h - 4}" fill="#999" font-size="10">Chủ</text>
        <circle cx="${pad + 60}" cy="${h - 8}" r="4" fill="#6b7280"/><text x="${pad + 68}" y="${h - 4}" fill="#999" font-size="10">Hòa</text>
        <circle cx="${pad + 110}" cy="${h - 8}" r="4" fill="#ef4444"/><text x="${pad + 118}" y="${h - 4}" fill="#999" font-size="10">Khách</text>
        <circle cx="${pad + 170}" cy="${h - 8}" r="4" fill="#f59e0b"/><text x="${pad + 178}" y="${h - 4}" fill="#999" font-size="10">Bước ngoặt</text>
      </svg>
    </div>`;
  },

  _renderWhatIf(match) {
    if (!match || match.status !== 'LIVE') return '';
    return `<div class="what-if-section">
      <div class="section-label">🔮 Nếu như...?</div>
      <div class="what-if-btns">
        <button class="what-if-btn" onclick="app._simulateEvent(${match.id},'home_goal')">⚽ ${match.home.short} ghi bàn</button>
        <button class="what-if-btn" onclick="app._simulateEvent(${match.id},'away_goal')">⚽ ${match.away.short} ghi bàn</button>
        <button class="what-if-btn" onclick="app._simulateEvent(${match.id},'home_red')">🟥 ${match.home.short} thẻ đỏ</button>
        <button class="what-if-btn" onclick="app._simulateEvent(${match.id},'away_red')">🟥 ${match.away.short} thẻ đỏ</button>
      </div>
      <div id="whatIfResult" style="display:none"></div>
    </div>`;
  },

  _simulateEvent(matchId, event) {
    if (!chat.socket) return;
    chat.socket.emit('simulate', { matchId, event }, (result) => {
      const el = document.getElementById('whatIfResult');
      if (!el || !result) return;
      const current = document.querySelector('.tt-team.home .tt-pct');
      const curHp = parseInt(current?.textContent) || 33;
      const curAp = parseInt(document.querySelector('.tt-team.away .tt-pct')?.textContent) || 33;
      const hpDiff = result.homeWin - curHp;
      const apDiff = result.awayWin - curAp;
      const arrow = (v) => v > 0 ? `<span class="wi-up">↑${v}</span>` : v < 0 ? `<span class="wi-down">↓${Math.abs(v)}</span>` : `<span>→0</span>`;
      el.innerHTML = `<div class="what-if-result">
        <span>Chủ: ${result.homeWin}% ${arrow(hpDiff)}</span>
        <span>Hòa: ${result.draw}%</span>
        <span>Khách: ${result.awayWin}% ${arrow(apDiff)}</span>
      </div>`;
      el.style.display = 'block';
    });
  },

  // ═══════════════════════════════════════
  //  LIVE MATCH TIMELINE
  // ═══════════════════════════════════════
  _renderTimeline(incidents, graph, match) {
    if (!incidents.length && !graph?.graphPoints?.length) return '<div class="empty-state"><div class="icon">📋</div><p>Chưa có diễn biến</p></div>';
    const maxMin = match?.minute || 90;
    const w = 640, h = 200, pad = 40, trackY = h / 2;
    const xScale = (w - pad * 2) / Math.max(maxMin, 45);

    let svg = '';
    // Track line
    svg += `<line x1="${pad}" y1="${trackY}" x2="${w - pad}" y2="${trackY}" stroke="var(--border)" stroke-width="2"/>`;
    // Minute markers
    for (let m = 0; m <= maxMin; m += 15) {
      const x = pad + m * xScale;
      svg += `<line x1="${x}" y1="${trackY - 5}" x2="${x}" y2="${trackY + 5}" stroke="var(--text-muted)" stroke-width="1"/>`;
      svg += `<text x="${x}" y="${h - 5}" fill="var(--text-muted)" font-size="9" text-anchor="middle">${m}'</text>`;
    }
    // HT marker
    if (maxMin > 45) {
      const htX = pad + 45 * xScale;
      svg += `<line x1="${htX}" y1="15" x2="${htX}" y2="${h - 15}" stroke="var(--border)" stroke-dasharray="3"/>`;
      svg += `<text x="${htX}" y="12" fill="var(--text-muted)" font-size="9" text-anchor="middle">HT</text>`;
    }

    // Event markers
    incidents.forEach(inc => {
      const x = pad + Math.min(inc.time, maxMin) * xScale;
      const isHome = inc.isHome;
      const yOffset = isHome ? -25 : 25;
      const textY = isHome ? trackY - 45 : trackY + 55;

      if (inc.incidentType === 'goal') {
        const r = 10;
        svg += `<circle cx="${x}" cy="${trackY + yOffset}" r="${r}" fill="var(--accent)" stroke="white" stroke-width="2"/>`;
        svg += `<text x="${x}" y="${trackY + yOffset + 4}" fill="white" font-size="10" text-anchor="middle" font-weight="bold">⚽</text>`;
        svg += `<text x="${x}" y="${textY}" fill="var(--text-primary)" font-size="8" text-anchor="middle">${inc.player?.shortName || ''}</text>`;
      } else if (inc.incidentType === 'card') {
        const color = inc.incidentClass === 'yellow' ? '#facc15' : '#ef4444';
        svg += `<rect x="${x - 5}" y="${trackY + yOffset - 7}" width="10" height="14" rx="1" fill="${color}" stroke="white" stroke-width="1"/>`;
      } else if (inc.incidentType === 'substitution') {
        svg += `<text x="${x}" y="${trackY + yOffset + 4}" fill="var(--green)" font-size="12" text-anchor="middle">🔄</text>`;
      } else if (inc.incidentType === 'varDecision') {
        svg += `<text x="${x}" y="${trackY + yOffset + 4}" fill="var(--purple)" font-size="12" text-anchor="middle">📺</text>`;
      }
    });

    // Team labels
    svg += `<text x="${pad - 5}" y="${trackY - 25}" fill="var(--blue)" font-size="10" text-anchor="end">${match?.home?.short || ''}</text>`;
    svg += `<text x="${pad - 5}" y="${trackY + 30}" fill="var(--red)" font-size="10" text-anchor="end">${match?.away?.short || ''}</text>`;

    let html = `<div class="section-block">
      <div class="section-label">⏱️ Diễn biến trận đấu</div>
      <svg viewBox="0 0 ${w} ${h}" class="timeline-svg">${svg}</svg>
    </div>`;

    // Momentum bar (simplified from existing graph data)
    if (graph?.graphPoints?.length) {
      html += this._renderMomentum(graph.graphPoints, match);
    }

    return html;
  },

  // ═══════════════════════════════════════
  //  MATCH RECOMMENDATIONS
  // ═══════════════════════════════════════
  _scoreMatchInterest(match) {
    let score = 0;
    // Favorite team/league bonus
    if (favourites.hasLeague(match.league.id)) score += 30;
    if (favourites.hasTeam(match.home.id) || favourites.hasTeam(match.away.id)) score += 50;
    // Top league bonus
    const topLeagues = CONFIG.LEAGUES.map(l => l.id);
    if (topLeagues.includes(match.league.id)) score += 20;
    // Live match bonus
    if (match.status === 'LIVE') score += 15;
    // Many goals = exciting
    const goals = (match.homeScore || 0) + (match.awayScore || 0);
    if (goals >= 3) score += goals * 5;
    // Close match
    if (match.status === 'LIVE' && match.homeScore === match.awayScore) score += 10;
    return score;
  },

  _renderRecommendations(matches) {
    const live = matches.filter(m => m.status === 'LIVE');
    if (live.length < 2) return '';
    const scored = live.map(m => ({ match: m, score: this._scoreMatchInterest(m) }))
      .sort((a, b) => b.score - a.score).slice(0, 3);
    if (scored[0].score < 15) return '';

    // Hero match = top pick
    const hero = scored[0].match;
    const heroTags = this._classifyMatch([], hero, []);
    const heroQuote = this._generateOracleQuote(50, 25, 25, [], hero);
    const rest = scored.slice(1);

    let html = `<div class="recommendations-section">`;

    // Hero card
    html += `<a href="#/match/${hero.id}" class="hero-match">
      <div class="hero-badge">🐴 Trận tâm điểm</div>
      <div class="hero-teams">
        <div class="hero-team">
          <img src="${hero.home.logo}" class="hero-logo" onerror="this.style.display='none'">
          <span>${hero.home.short}</span>
        </div>
        <div class="hero-score">
          <span class="hero-score-num">${hero.homeScore ?? '-'} - ${hero.awayScore ?? '-'}</span>
          <span class="status-live">${hero.minute ? hero.minute + "'" : 'LIVE'}</span>
        </div>
        <div class="hero-team">
          <img src="${hero.away.logo}" class="hero-logo" onerror="this.style.display='none'">
          <span>${hero.away.short}</span>
        </div>
      </div>
      <div class="hero-oracle">"${heroQuote}" 🐴</div>
      ${heroTags.length ? `<div class="hero-tags">${this._renderMatchTags(heroTags)}</div>` : ''}
      <div class="hero-actions">
        <span class="hero-btn">💬 Vào chat</span>
        <span class="hero-btn" onclick="event.preventDefault();event.stopPropagation();app._shareTienTri(${hero.id})">📤 Chia sẻ</span>
      </div>
    </a>`;

    // Remaining cards
    if (rest.length) {
      html += `<div class="rec-grid">${rest.map(s => {
        const m = s.match;
        const tags = this._classifyMatch([], m, []);
        return `<a href="#/match/${m.id}" class="rec-card">
          <div class="rec-teams">
            <img src="${m.home.logo}" class="team-logo-sm" onerror="this.style.display='none'">
            <span>${m.home.short}</span>
            <span class="rec-score">${m.homeScore}-${m.awayScore}</span>
            <span>${m.away.short}</span>
            <img src="${m.away.logo}" class="team-logo-sm" onerror="this.style.display='none'">
          </div>
          <div class="rec-meta">
            <span class="status-live">${m.minute ? m.minute + "'" : 'LIVE'}</span>
            ${tags.length ? this._renderMatchTags(tags) : ''}
          </div>
        </a>`;
      }).join('')}</div>`;
    }

    html += `</div>`;
    return html;
  },

  // ═══════════════════════════════════════
  //  MOOD FILTER
  // ═══════════════════════════════════════
  _currentMood: null,

  filterMood(mood, btn) {
    this._currentMood = this._currentMood === mood ? null : mood;
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
    if (this._currentMood && btn) btn.classList.add('active');
    this._renderLiveMatches();
  },

  _matchesMood(match, mood) {
    const goals = (match.homeScore || 0) + (match.awayScore || 0);
    if (mood === 'goals') return goals >= 2 || match.status === 'NS';
    if (mood === 'tactical') return match.status === 'LIVE' && goals <= 1;
    if (mood === 'entertainment') return goals >= 3 || (match.homeScore !== match.awayScore && match.status === 'LIVE');
    return true;
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

  // ── Analytics: Track events (GA4 compatible) ──
  track(event, params = {}) {
    if (typeof gtag === 'function') {
      gtag('event', event, params);
    }
  },
};

document.addEventListener('DOMContentLoaded', () => app.init());
