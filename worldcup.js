// BongDa365 - World Cup 2026 Section (Client-Side)
// 48 teams, 12 groups, 104 matches
// June 11 - July 19, 2026

const worldcup = {
  // World Cup 2026 Groups
  groups: {
    A: { name: 'Bảng A', teams: ['USA', 'Morocco', 'Scotland', 'TBD'] },
    B: { name: 'Bảng B', teams: ['Mexico', 'Nigeria', 'Sweden', 'TBD'] },
    C: { name: 'Bảng C', teams: ['Canada', 'Senegal', 'Serbia', 'TBD'] },
    D: { name: 'Bảng D', teams: ['Brazil', 'Japan', 'Costa Rica', 'TBD'] },
    E: { name: 'Bảng E', teams: ['Argentina', 'Australia', 'Ecuador', 'TBD'] },
    F: { name: 'Bảng F', teams: ['France', 'South Korea', 'Saudi Arabia', 'TBD'] },
    G: { name: 'Bảng G', teams: ['England', 'Iran', 'Panama', 'TBD'] },
    H: { name: 'Bảng H', teams: ['Spain', 'Poland', 'Tunisia', 'TBD'] },
    I: { name: 'Bảng I', teams: ['Germany', 'Ghana', 'Uruguay', 'TBD'] },
    J: { name: 'Bảng J', teams: ['Portugal', 'Cameroon', 'Paraguay', 'TBD'] },
    K: { name: 'Bảng K', teams: ['Netherlands', 'Croatia', 'Qatar', 'TBD'] },
    L: { name: 'Bảng L', teams: ['Italy', 'Colombia', 'Denmark', 'TBD'] },
  },

  dates: {
    start: '2026-06-11', groupEnd: '2026-06-28', r32Start: '2026-06-29',
    r16Start: '2026-07-01', qfStart: '2026-07-04', sfStart: '2026-07-08',
    thirdPlace: '2026-07-18', final: '2026-07-19',
  },

  venues: [
    { city: 'New York/New Jersey', stadium: 'MetLife Stadium', capacity: 82500, country: 'USA' },
    { city: 'Los Angeles', stadium: 'SoFi Stadium', capacity: 70240, country: 'USA' },
    { city: 'Dallas', stadium: 'AT&T Stadium', capacity: 80000, country: 'USA' },
    { city: 'Houston', stadium: 'NRG Stadium', capacity: 72220, country: 'USA' },
    { city: 'Atlanta', stadium: 'Mercedes-Benz Stadium', capacity: 71000, country: 'USA' },
    { city: 'Philadelphia', stadium: 'Lincoln Financial Field', capacity: 69176, country: 'USA' },
    { city: 'Miami', stadium: 'Hard Rock Stadium', capacity: 64767, country: 'USA' },
    { city: 'Seattle', stadium: 'Lumen Field', capacity: 68740, country: 'USA' },
    { city: 'San Francisco/Bay Area', stadium: 'Levi\'s Stadium', capacity: 68500, country: 'USA' },
    { city: 'Kansas City', stadium: 'Arrowhead Stadium', capacity: 76416, country: 'USA' },
    { city: 'Boston/Foxborough', stadium: 'Gillette Stadium', capacity: 65878, country: 'USA' },
    { city: 'Mexico City', stadium: 'Estadio Azteca', capacity: 87523, country: 'Mexico' },
    { city: 'Guadalajara', stadium: 'Estadio Akron', capacity: 49850, country: 'Mexico' },
    { city: 'Monterrey', stadium: 'Estadio BBVA', capacity: 53500, country: 'Mexico' },
    { city: 'Toronto', stadium: 'BMO Field', capacity: 45736, country: 'Canada' },
    { city: 'Vancouver', stadium: 'BC Place', capacity: 54500, country: 'Canada' },
  ],

  flags: {
    'USA': '🇺🇸', 'Mexico': '🇲🇽', 'Canada': '🇨🇦', 'Brazil': '🇧🇷', 'Argentina': '🇦🇷',
    'France': '🇫🇷', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Spain': '🇪🇸', 'Germany': '🇩🇪', 'Portugal': '🇵🇹',
    'Italy': '🇮🇹', 'Netherlands': '🇳🇱', 'Croatia': '🇭🇷', 'Japan': '🇯🇵', 'South Korea': '🇰🇷',
    'Australia': '🇦🇺', 'Morocco': '🇲🇦', 'Senegal': '🇸🇳', 'Nigeria': '🇳🇬', 'Ghana': '🇬🇭',
    'Cameroon': '🇨🇲', 'Tunisia': '🇹🇳', 'Saudi Arabia': '🇸🇦', 'Iran': '🇮🇷', 'Qatar': '🇶🇦',
    'Ecuador': '🇪🇨', 'Uruguay': '🇺🇾', 'Colombia': '🇨🇴', 'Paraguay': '🇵🇾', 'Costa Rica': '🇨🇷',
    'Panama': '🇵🇦', 'Poland': '🇵🇱', 'Serbia': '🇷🇸', 'Denmark': '🇩🇰', 'Sweden': '🇸🇪',
    'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Belgium': '🇧🇪',
  },

  teamNameVi: {
    'USA': 'Mỹ', 'Mexico': 'Mexico', 'Canada': 'Canada', 'Brazil': 'Brazil', 'Argentina': 'Argentina',
    'France': 'Pháp', 'England': 'Anh', 'Spain': 'Tây Ban Nha', 'Germany': 'Đức', 'Portugal': 'Bồ Đào Nha',
    'Italy': 'Ý', 'Netherlands': 'Hà Lan', 'Croatia': 'Croatia', 'Japan': 'Nhật Bản', 'South Korea': 'Hàn Quốc',
    'Australia': 'Úc', 'Morocco': 'Morocco', 'Senegal': 'Senegal', 'Nigeria': 'Nigeria', 'Ghana': 'Ghana',
    'Cameroon': 'Cameroon', 'Tunisia': 'Tunisia', 'Saudi Arabia': 'Ả Rập Saudi', 'Iran': 'Iran', 'Qatar': 'Qatar',
    'Ecuador': 'Ecuador', 'Uruguay': 'Uruguay', 'Colombia': 'Colombia', 'Paraguay': 'Paraguay', 'Costa Rica': 'Costa Rica',
    'Panama': 'Panama', 'Poland': 'Ba Lan', 'Serbia': 'Serbia', 'Denmark': 'Đan Mạch', 'Sweden': 'Thụy Điển',
    'Scotland': 'Scotland', 'Belgium': 'Bỉ',
  },

  teamProfiles: {
    'brazil': { name: 'Brazil', nameVi: 'Brazil', fifaRank: 1, wcTitles: 5, coach: 'Dorival Júnior', keyPlayers: ['Vinícius Jr', 'Rodrygo', 'Endrick'], group: 'D' },
    'argentina': { name: 'Argentina', nameVi: 'Argentina', fifaRank: 2, wcTitles: 3, coach: 'Lionel Scaloni', keyPlayers: ['Lionel Messi', 'Julián Álvarez', 'Enzo Fernández'], group: 'E' },
    'france': { name: 'France', nameVi: 'Pháp', fifaRank: 3, wcTitles: 2, coach: 'Didier Deschamps', keyPlayers: ['Kylian Mbappé', 'Antoine Griezmann', 'Aurélien Tchouaméni'], group: 'F' },
    'england': { name: 'England', nameVi: 'Anh', fifaRank: 4, wcTitles: 1, coach: 'Thomas Tuchel', keyPlayers: ['Jude Bellingham', 'Bukayo Saka', 'Phil Foden'], group: 'G' },
    'germany': { name: 'Germany', nameVi: 'Đức', fifaRank: 5, wcTitles: 4, coach: 'Julian Nagelsmann', keyPlayers: ['Jamal Musiala', 'Florian Wirtz', 'Kai Havertz'], group: 'I' },
    'spain': { name: 'Spain', nameVi: 'Tây Ban Nha', fifaRank: 6, wcTitles: 1, coach: 'Luis de la Fuente', keyPlayers: ['Lamine Yamal', 'Pedri', 'Rodri'], group: 'H' },
    'portugal': { name: 'Portugal', nameVi: 'Bồ Đào Nha', fifaRank: 7, wcTitles: 0, coach: 'Roberto Martínez', keyPlayers: ['Cristiano Ronaldo', 'Bruno Fernandes', 'Rafael Leão'], group: 'J' },
    'netherlands': { name: 'Netherlands', nameVi: 'Hà Lan', fifaRank: 8, wcTitles: 0, coach: 'Ronald Koeman', keyPlayers: ['Virgil van Dijk', 'Cody Gakpo', 'Xavi Simons'], group: 'K' },
    'italy': { name: 'Italy', nameVi: 'Ý', fifaRank: 9, wcTitles: 4, coach: 'Luciano Spalletti', keyPlayers: ['Gianluigi Donnarumma', 'Federico Chiesa', 'Nicolò Barella'], group: 'L' },
    'croatia': { name: 'Croatia', nameVi: 'Croatia', fifaRank: 10, wcTitles: 0, coach: 'Zlatko Dalić', keyPlayers: ['Luka Modrić', 'Joško Gvardiol', 'Mateo Kovačić'], group: 'K' },
    'usa': { name: 'United States', nameVi: 'Mỹ', fifaRank: 11, wcTitles: 0, coach: 'Mauricio Pochettino', keyPlayers: ['Christian Pulisic', 'Gio Reyna', 'Yunus Musah'], group: 'A' },
    'morocco': { name: 'Morocco', nameVi: 'Morocco', fifaRank: 12, wcTitles: 0, coach: 'Walid Regragui', keyPlayers: ['Achraf Hakimi', 'Hakim Ziyech', 'Youssef En-Nesyri'], group: 'A' },
    'mexico': { name: 'Mexico', nameVi: 'Mexico', fifaRank: 14, wcTitles: 0, coach: 'Javier Aguirre', keyPlayers: ['Hirving Lozano', 'Edson Álvarez', 'Santiago Giménez'], group: 'B' },
    'japan': { name: 'Japan', nameVi: 'Nhật Bản', fifaRank: 15, wcTitles: 0, coach: 'Hajime Moriyasu', keyPlayers: ['Takefusa Kubo', 'Kaoru Mitoma', 'Wataru Endo'], group: 'D' },
    'south-korea': { name: 'South Korea', nameVi: 'Hàn Quốc', fifaRank: 22, wcTitles: 0, coach: 'Hong Myung-bo', keyPlayers: ['Son Heung-min', 'Kim Min-jae', 'Lee Kang-in'], group: 'F' },
    'belgium': { name: 'Belgium', nameVi: 'Bỉ', fifaRank: 6, wcTitles: 0, coach: 'Domenico Tedesco', keyPlayers: ['Kevin De Bruyne', 'Jérémy Doku', 'Romelu Lukaku'], group: 'L' },
  },

  getCountdown() {
    const start = new Date('2026-06-11T00:00:00Z');
    const now = new Date();
    const diff = start - now;
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, started: true };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return { days, hours, minutes, started: false };
  },

  _heroHTML() {
    const countdown = this.getCountdown();
    return `
    <div class="wc-hero">
      <div class="wc-hero-inner">
        <h1 class="wc-title">🏆 FIFA World Cup 2026</h1>
        <p class="wc-subtitle">USA • Mexico • Canada</p>
        <div class="wc-countdown">
          ${countdown.started
            ? '<span class="wc-live">🔴 ĐANG DIỄN RA</span>'
            : `<div class="wc-cd-item"><span class="wc-cd-num">${countdown.days}</span><span class="wc-cd-label">Ngày</span></div>
               <div class="wc-cd-item"><span class="wc-cd-num">${countdown.hours}</span><span class="wc-cd-label">Giờ</span></div>
               <div class="wc-cd-item"><span class="wc-cd-num">${countdown.minutes}</span><span class="wc-cd-label">Phút</span></div>`
          }
        </div>
        <p class="wc-info">48 đội • 12 bảng • 104 trận • 16 sân vận động</p>
      </div>
    </div>`;
  },

  _navLinks(active) {
    const links = [
      { href: '#/world-cup-2026', label: 'Tổng quan', id: 'hub' },
      { href: '#/world-cup-2026/lich-thi-dau', label: 'Lịch đấu', id: 'schedule' },
      { href: '#/world-cup-2026/san-van-dong', label: 'Sân VĐ', id: 'venues' },
      { href: '#/world-cup-2026/du-doan', label: 'Dự đoán', id: 'predictions' },
    ];
    return `<div class="detail-tabs">${links.map(l =>
      `<a href="${l.href}" class="tab-btn ${active === l.id ? 'active' : ''}" style="text-decoration:none">${l.label}</a>`
    ).join('')}</div>`;
  },

  // ═══════════════════════════════════════
  //  Legacy render (for /worldcup route)
  // ═══════════════════════════════════════
  render() {
    return this.renderHub();
  },

  // ═══════════════════════════════════════
  //  Hub page: /world-cup-2026
  // ═══════════════════════════════════════
  renderHub() {
    let html = this._heroHTML();
    html += this._navLinks('hub');

    // Groups grid
    html += '<div class="page-header"><h2>12 Bảng đấu World Cup 2026</h2></div>';
    html += '<div class="wc-groups-grid">';
    for (const [key, group] of Object.entries(this.groups)) {
      html += `<a href="#/world-cup-2026/bang/${key.toLowerCase()}" class="wc-group-card" style="text-decoration:none;color:inherit;cursor:pointer">
        <div class="wc-group-name">${group.name}</div>
        <div class="wc-group-teams">`;
      for (const team of group.teams) {
        const flag = this.flags[team] || '🏳️';
        html += `<div class="wc-team-row"><span class="wc-flag">${flag}</span><span class="wc-team-name">${team}</span></div>`;
      }
      html += '</div></a>';
    }
    html += '</div>';

    // Featured teams
    html += '<div class="page-header" style="margin-top:20px"><h2>Đội tuyển nổi bật</h2></div>';
    html += '<div class="wc-groups-grid">';
    for (const [slug, t] of Object.entries(this.teamProfiles).slice(0, 12)) {
      const flag = this.flags[t.name] || '🏳️';
      html += `<a href="#/world-cup-2026/doi-tuyen/${slug}" class="wc-group-card" style="text-decoration:none;color:inherit;cursor:pointer">
        <div class="wc-group-name">${flag} ${t.nameVi}</div>
        <div class="wc-group-teams">
          <div class="wc-team-row"><span class="wc-flag">🏅</span><span class="wc-team-name">FIFA #${t.fifaRank}</span></div>
          <div class="wc-team-row"><span class="wc-flag">🏆</span><span class="wc-team-name">${t.wcTitles} lần VĐ</span></div>
          <div class="wc-team-row"><span class="wc-flag">⭐</span><span class="wc-team-name">${t.keyPlayers[0]}</span></div>
        </div></a>`;
    }
    html += '</div>';

    // Quick links
    html += `<div style="margin-top:20px;padding:12px;background:var(--card-bg);border-radius:8px">
      <h3 style="margin:0 0 8px">Khám phá thêm</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <a href="#/world-cup-2026/lich-thi-dau" class="tab-btn" style="text-decoration:none">📅 Lịch thi đấu</a>
        <a href="#/world-cup-2026/san-van-dong" class="tab-btn" style="text-decoration:none">🏟️ Sân vận động</a>
        <a href="#/world-cup-2026/du-doan" class="tab-btn" style="text-decoration:none">🔮 Dự đoán AI</a>
      </div>
    </div>`;

    return html;
  },

  // ═══════════════════════════════════════
  //  Schedule: /world-cup-2026/lich-thi-dau
  // ═══════════════════════════════════════
  renderSchedule() {
    let html = this._heroHTML();
    html += this._navLinks('schedule');
    html += '<div class="page-header"><h2>📅 Lịch Thi Đấu World Cup 2026 (Giờ Việt Nam)</h2></div>';

    const milestones = [
      { label: 'Khai mạc', date: '11/06/2026', detail: 'Estadio Azteca, Mexico City' },
      { label: 'Vòng bảng', date: '11/06 - 28/06', detail: '3 lượt trận/bảng' },
      { label: 'Vòng 32', date: '29-30/06', detail: '16 trận' },
      { label: 'Vòng 16', date: '01-03/07', detail: '8 trận' },
      { label: 'Tứ kết', date: '04-05/07', detail: '4 trận' },
      { label: 'Bán kết', date: '08-09/07', detail: '2 trận' },
      { label: 'Chung kết', date: '19/07/2026', detail: 'MetLife Stadium, New York' },
    ];

    html += '<div class="wc-groups-grid">';
    for (const m of milestones) {
      html += `<div class="wc-group-card">
        <div class="wc-group-name">${m.label}</div>
        <div class="wc-group-teams">
          <div class="wc-team-row"><span class="wc-flag">📅</span><span class="wc-team-name">${m.date}</span></div>
          <div class="wc-team-row"><span class="wc-flag">📍</span><span class="wc-team-name">${m.detail}</span></div>
        </div></div>`;
    }
    html += '</div>';

    html += `<div style="margin-top:16px;padding:12px;background:var(--card-bg);border-radius:8px">
      <h3>⏰ Lưu ý múi giờ</h3>
      <p style="color:var(--text-secondary)">Do World Cup 2026 diễn ra tại Bắc Mỹ, các trận đấu sẽ bắt đầu từ 23:00 đến 08:00 sáng hôm sau theo giờ Việt Nam (UTC+7). BongDa365 sẽ cập nhật tỉ số trực tiếp cho tất cả 104 trận.</p>
    </div>`;

    return html;
  },

  // ═══════════════════════════════════════
  //  Group page: /world-cup-2026/bang/:letter
  // ═══════════════════════════════════════
  renderGroup(letter) {
    const group = this.groups[letter];
    if (!group) return '<div class="empty-state"><div class="icon">❌</div><p>Không tìm thấy bảng đấu</p></div>';

    let html = this._heroHTML();
    html += this._navLinks('');
    html += `<div class="page-header"><h2>${group.name} - World Cup 2026</h2></div>`;

    // Teams in this group
    html += '<div class="wc-groups-grid">';
    for (const team of group.teams) {
      const flag = this.flags[team] || '🏳️';
      const nameVi = this.teamNameVi[team] || team;
      const profile = Object.entries(this.teamProfiles).find(([, p]) => p.name === team);
      const slug = profile ? profile[0] : null;

      html += `<div class="wc-group-card">
        <div class="wc-group-name">${flag} ${nameVi}</div>
        <div class="wc-group-teams">`;
      if (profile) {
        const p = profile[1];
        html += `<div class="wc-team-row"><span class="wc-flag">🏅</span><span class="wc-team-name">FIFA #${p.fifaRank}</span></div>`;
        html += `<div class="wc-team-row"><span class="wc-flag">👨‍💼</span><span class="wc-team-name">HLV: ${p.coach}</span></div>`;
        html += `<div class="wc-team-row"><span class="wc-flag">⭐</span><span class="wc-team-name">${p.keyPlayers.join(', ')}</span></div>`;
        if (slug) html += `<div class="wc-team-row"><a href="#/world-cup-2026/doi-tuyen/${slug}" style="color:var(--accent)">Xem chi tiết →</a></div>`;
      }
      html += '</div></div>';
    }
    html += '</div>';

    // Other groups nav
    html += `<div style="margin-top:16px;padding:12px;background:var(--card-bg);border-radius:8px">
      <h4>Các bảng đấu khác</h4>
      <div style="display:flex;flex-wrap:wrap;gap:6px">`;
    for (const g of Object.keys(this.groups)) {
      if (g !== letter) {
        html += `<a href="#/world-cup-2026/bang/${g.toLowerCase()}" class="tab-btn ${g === letter ? 'active' : ''}" style="text-decoration:none">Bảng ${g}</a>`;
      }
    }
    html += '</div></div>';

    return html;
  },

  // ═══════════════════════════════════════
  //  Team page: /world-cup-2026/doi-tuyen/:slug
  // ═══════════════════════════════════════
  renderTeam(slug) {
    const team = this.teamProfiles[slug];
    if (!team) return '<div class="empty-state"><div class="icon">❌</div><p>Không tìm thấy đội tuyển</p></div>';

    const flag = this.flags[team.name] || '🏳️';
    let html = this._heroHTML();
    html += this._navLinks('');

    html += `<div class="page-header"><h2>${flag} ${team.nameVi}</h2></div>`;
    html += `<div style="padding:16px;background:var(--card-bg);border-radius:8px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><strong>Xếp hạng FIFA:</strong> #${team.fifaRank}</div>
        <div><strong>Huấn luyện viên:</strong> ${team.coach}</div>
        <div><strong>Vô địch World Cup:</strong> ${team.wcTitles} lần</div>
        <div><strong>Bảng đấu:</strong> <a href="#/world-cup-2026/bang/${team.group.toLowerCase()}">Bảng ${team.group}</a></div>
      </div>
    </div>`;

    html += `<div style="padding:16px;background:var(--card-bg);border-radius:8px;margin-bottom:16px">
      <h3>⭐ Cầu thủ chủ chốt</h3>
      <div class="wc-groups-grid">`;
    for (const player of team.keyPlayers) {
      html += `<div class="wc-group-card"><div class="wc-group-name">${player}</div></div>`;
    }
    html += '</div></div>';

    // Other teams
    html += `<div style="padding:12px;background:var(--card-bg);border-radius:8px">
      <h4>Các đội tuyển khác</h4>
      <div style="display:flex;flex-wrap:wrap;gap:6px">`;
    for (const [s, t] of Object.entries(this.teamProfiles)) {
      if (s !== slug) {
        const f = this.flags[t.name] || '';
        html += `<a href="#/world-cup-2026/doi-tuyen/${s}" class="tab-btn" style="text-decoration:none">${f} ${t.nameVi}</a>`;
      }
    }
    html += '</div></div>';

    return html;
  },

  // ═══════════════════════════════════════
  //  Predictions: /world-cup-2026/du-doan
  // ═══════════════════════════════════════
  renderPredictions() {
    let html = this._heroHTML();
    html += this._navLinks('predictions');

    html += '<div class="page-header"><h2>🔮 Dự đoán nhà vô địch World Cup 2026</h2></div>';
    html += `<p style="color:var(--text-secondary);margin-bottom:12px">Chọn đội bạn nghĩ sẽ vô địch! Chia sẻ dự đoán với bạn bè.</p>`;

    html += '<div class="wc-predict-grid">';
    const favorites = ['Brazil', 'Argentina', 'France', 'England', 'Spain', 'Germany', 'Portugal', 'Italy', 'Netherlands', 'Croatia', 'USA', 'Mexico'];
    for (const team of favorites) {
      const flag = this.flags[team] || '🏳️';
      const saved = localStorage.getItem('bd365_wc_winner');
      html += `<button class="wc-predict-btn ${saved === team ? 'selected' : ''}" onclick="worldcup.pickWinner('${team}', this)">
        <span class="wc-flag-lg">${flag}</span>
        <span>${team}</span>
      </button>`;
    }
    html += '</div>';
    html += '<div id="wcPredictResult" class="wc-predict-result"></div>';

    // AI Analysis
    html += `<div style="margin-top:20px;padding:16px;background:var(--card-bg);border-radius:8px">
      <h3>🤖 Phân tích AI</h3>
      <p style="color:var(--text-secondary)">Hệ thống AI Ngựa Tiên Tri sẽ cung cấp dự đoán chi tiết cho từng trận đấu World Cup 2026, bao gồm xác suất thắng/thua/hòa, tổng bàn thắng dự kiến, và các thống kê nâng cao. Dự đoán sẽ được cập nhật real-time khi giải đấu bắt đầu.</p>
    </div>`;

    return html;
  },

  // ═══════════════════════════════════════
  //  Venues: /world-cup-2026/san-van-dong
  // ═══════════════════════════════════════
  renderVenues() {
    let html = this._heroHTML();
    html += this._navLinks('venues');

    html += '<div class="page-header"><h2>🏟️ 16 Sân Vận Động World Cup 2026</h2></div>';

    const byCountry = { 'USA': [], 'Canada': [], 'Mexico': [] };
    this.venues.forEach(v => { if (byCountry[v.country]) byCountry[v.country].push(v); });

    for (const [country, venues] of Object.entries(byCountry)) {
      const countryVi = country === 'USA' ? 'Mỹ' : country;
      const countryFlag = country === 'USA' ? '🇺🇸' : country === 'Canada' ? '🇨🇦' : '🇲🇽';
      html += `<h3 style="margin:16px 0 8px">${countryFlag} ${countryVi} (${venues.length} sân)</h3>`;
      html += '<div class="wc-venues-grid">';
      for (const v of venues) {
        html += `<div class="wc-venue-card">
          <div class="wc-venue-city">${v.city}</div>
          <div class="wc-venue-stadium">${v.stadium}</div>
          <div class="wc-venue-capacity">${v.capacity.toLocaleString()} chỗ ngồi</div>
        </div>`;
      }
      html += '</div>';
    }

    return html;
  },

  // ═══════════════════════════════════════
  //  Shared functionality
  // ═══════════════════════════════════════
  pickWinner(team, btn) {
    localStorage.setItem('bd365_wc_winner', team);
    document.querySelectorAll('.wc-predict-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const result = document.getElementById('wcPredictResult');
    if (result) {
      result.innerHTML = `<p>Bạn chọn <strong>${this.flags[team] || ''} ${team}</strong> vô địch World Cup 2026!</p>
        <button class="pred-save-btn" style="max-width:200px;margin:8px auto" onclick="worldcup.shareWCPrediction('${team}')">📤 Chia sẻ dự đoán</button>`;
    }
    if (typeof app !== 'undefined') app.track('wc_prediction', { team });
  },

  shareWCPrediction(team) {
    const text = `🏆 Tôi dự đoán ${this.flags[team] || ''} ${team} sẽ vô địch FIFA World Cup 2026! Bạn chọn ai?\n\n🔮 Dự đoán tại BongDa365.xyz`;
    if (navigator.share) {
      navigator.share({ title: 'World Cup 2026 Prediction', text, url: 'https://bongda365.xyz/#/world-cup-2026/du-doan' });
    } else {
      navigator.clipboard.writeText(text).then(() => showToast('Đã copy! Chia sẻ lên Facebook/Zalo nhé!', 'info'));
    }
  },
};
