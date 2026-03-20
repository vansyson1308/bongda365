// BongDa365 - Sidebar: League tree navigation + Favourites
const sidebar = {
  open: false,

  init() {
    this.render();
    // Hamburger toggle for mobile
    const toggle = document.getElementById('sidebarToggle');
    if (toggle) toggle.addEventListener('click', () => this.toggle());
    // Close sidebar on overlay click (mobile)
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.addEventListener('click', () => this.close());
  },

  toggle() {
    this.open = !this.open;
    document.querySelector('.sidebar')?.classList.toggle('open', this.open);
    document.getElementById('sidebarOverlay')?.classList.toggle('active', this.open);
  },

  close() {
    this.open = false;
    document.querySelector('.sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
  },

  render() {
    const el = document.getElementById('sidebarContent');
    if (!el) return;

    // Group leagues by country
    const groups = new Map();
    CONFIG.LEAGUES.forEach(lg => {
      const country = lg.country || 'Khác';
      if (!groups.has(country)) groups.set(country, []);
      groups.get(country).push(lg);
    });

    // Favourites section
    const favLeagues = CONFIG.LEAGUES.filter(lg => favourites.hasLeague(lg.id));

    let html = '';

    // Favourites
    if (favLeagues.length) {
      html += `<div class="sidebar-section">
        <div class="sidebar-section-title">★ Yêu thích</div>
        ${favLeagues.map(lg => this._leagueLink(lg, true)).join('')}
      </div>`;
    }

    // Main navigation
    html += `<div class="sidebar-section">
      <a href="#/" class="sidebar-link sidebar-nav" data-nav="live">🔴 Trực tiếp</a>
      <a href="#/schedule" class="sidebar-link sidebar-nav" data-nav="schedule">📅 Lịch đấu</a>
      <a href="#/predictions" class="sidebar-link sidebar-nav" data-nav="predictions">🎯 Dự đoán</a>
      <a href="#/news" class="sidebar-link sidebar-nav" data-nav="news">📰 Tin tức</a>
      <a href="#/worldcup" class="sidebar-link sidebar-nav" data-nav="worldcup" style="color:var(--accent);font-weight:700">🏆 World Cup 2026</a>
    </div>`;

    // Country groups
    for (const [country, leagues] of groups) {
      const flag = this._flag(country);
      html += `<div class="sidebar-section">
        <div class="sidebar-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <span>${flag} ${country}</span>
          <span class="sidebar-arrow">▾</span>
        </div>
        <div class="sidebar-group-body">
          ${leagues.map(lg => this._leagueLink(lg, false)).join('')}
        </div>
      </div>`;
    }

    el.innerHTML = html;
  },

  _leagueLink(lg, isFav) {
    const star = favourites.starIcon('league', lg.id);
    return `<a href="#/league/${lg.id}" class="sidebar-link sidebar-league" data-tid="${lg.id}">
      <img src="${api.tournImg(lg.id)}" class="sidebar-league-icon" onerror="this.style.display='none'">
      <span class="sidebar-league-name">${lg.name}</span>
      ${star}
    </a>`;
  },

  _flag(country) {
    const flags = {
      'England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Spain':'🇪🇸','Italy':'🇮🇹','Germany':'🇩🇪',
      'France':'🇫🇷','Europe':'🇪🇺','Việt Nam':'🇻🇳',
    };
    return flags[country] || '🌍';
  }
};
