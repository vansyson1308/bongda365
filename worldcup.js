// BongDa365 - World Cup 2026 Section
// 48 teams, 12 groups, 104 matches
// June 11 - July 19, 2026

const worldcup = {
  // World Cup 2026 Groups (FIFA official draw - placeholder until confirmed)
  groups: {
    A: { name: 'Bảng A', teams: ['USA', 'Morocco', 'Scotland', 'TBD A4'] },
    B: { name: 'Bảng B', teams: ['Mexico', 'Nigeria', 'Sweden', 'TBD B4'] },
    C: { name: 'Bảng C', teams: ['Canada', 'Senegal', 'Serbia', 'TBD C4'] },
    D: { name: 'Bảng D', teams: ['Brazil', 'Japan', 'Costa Rica', 'TBD D4'] },
    E: { name: 'Bảng E', teams: ['Argentina', 'Australia', 'Ecuador', 'TBD E4'] },
    F: { name: 'Bảng F', teams: ['France', 'South Korea', 'Saudi Arabia', 'TBD F4'] },
    G: { name: 'Bảng G', teams: ['England', 'Iran', 'Panama', 'TBD G4'] },
    H: { name: 'Bảng H', teams: ['Spain', 'Poland', 'Tunisia', 'TBD H4'] },
    I: { name: 'Bảng I', teams: ['Germany', 'Ghana', 'Uruguay', 'TBD I4'] },
    J: { name: 'Bảng J', teams: ['Portugal', 'Cameroon', 'Paraguay', 'TBD J4'] },
    K: { name: 'Bảng K', teams: ['Netherlands', 'Croatia', 'Qatar', 'TBD K4'] },
    L: { name: 'Bảng L', teams: ['Italy', 'Colombia', 'Denmark', 'TBD L4'] },
  },

  // Key dates
  dates: {
    start: '2026-06-11',
    groupEnd: '2026-06-28',
    r32Start: '2026-06-29',
    r16Start: '2026-07-01',
    qfStart: '2026-07-04',
    sfStart: '2026-07-08',
    thirdPlace: '2026-07-18',
    final: '2026-07-19',
  },

  // Venues
  venues: [
    { city: 'New York/New Jersey', stadium: 'MetLife Stadium', capacity: 82500 },
    { city: 'Los Angeles', stadium: 'SoFi Stadium', capacity: 70240 },
    { city: 'Dallas', stadium: 'AT&T Stadium', capacity: 80000 },
    { city: 'Houston', stadium: 'NRG Stadium', capacity: 72220 },
    { city: 'Atlanta', stadium: 'Mercedes-Benz Stadium', capacity: 71000 },
    { city: 'Philadelphia', stadium: 'Lincoln Financial Field', capacity: 69176 },
    { city: 'Miami', stadium: 'Hard Rock Stadium', capacity: 64767 },
    { city: 'Seattle', stadium: 'Lumen Field', capacity: 69000 },
    { city: 'San Francisco', stadium: 'Levi\'s Stadium', capacity: 68500 },
    { city: 'Kansas City', stadium: 'Arrowhead Stadium', capacity: 76416 },
    { city: 'Boston/Foxborough', stadium: 'Gillette Stadium', capacity: 65878 },
    { city: 'Mexico City', stadium: 'Estadio Azteca', capacity: 87523 },
    { city: 'Guadalajara', stadium: 'Estadio Akron', capacity: 49850 },
    { city: 'Monterrey', stadium: 'Estadio BBVA', capacity: 53500 },
    { city: 'Toronto', stadium: 'BMO Field', capacity: 45500 },
    { city: 'Vancouver', stadium: 'BC Place', capacity: 54500 },
  ],

  // Team flags (emoji)
  flags: {
    'USA': '🇺🇸', 'Mexico': '🇲🇽', 'Canada': '🇨🇦', 'Brazil': '🇧🇷', 'Argentina': '🇦🇷',
    'France': '🇫🇷', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Spain': '🇪🇸', 'Germany': '🇩🇪', 'Portugal': '🇵🇹',
    'Italy': '🇮🇹', 'Netherlands': '🇳🇱', 'Croatia': '🇭🇷', 'Japan': '🇯🇵', 'South Korea': '🇰🇷',
    'Australia': '🇦🇺', 'Morocco': '🇲🇦', 'Senegal': '🇸🇳', 'Nigeria': '🇳🇬', 'Ghana': '🇬🇭',
    'Cameroon': '🇨🇲', 'Tunisia': '🇹🇳', 'Saudi Arabia': '🇸🇦', 'Iran': '🇮🇷', 'Qatar': '🇶🇦',
    'Ecuador': '🇪🇨', 'Uruguay': '🇺🇾', 'Colombia': '🇨🇴', 'Paraguay': '🇵🇾', 'Costa Rica': '🇨🇷',
    'Panama': '🇵🇦', 'Poland': '🇵🇱', 'Serbia': '🇷🇸', 'Denmark': '🇩🇰', 'Sweden': '🇸🇪',
    'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  },

  // Countdown
  getCountdown() {
    const start = new Date('2026-06-11T00:00:00Z');
    const now = new Date();
    const diff = start - now;
    if (diff <= 0) return { days: 0, hours: 0, started: true };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    return { days, hours, started: false };
  },

  // Render World Cup page
  render() {
    const countdown = this.getCountdown();
    let html = `
    <div class="wc-hero">
      <div class="wc-hero-inner">
        <h1 class="wc-title">🏆 FIFA World Cup 2026</h1>
        <p class="wc-subtitle">USA • Mexico • Canada</p>
        <div class="wc-countdown">
          ${countdown.started
            ? '<span class="wc-live">🔴 ĐANG DIỄN RA</span>'
            : `<div class="wc-cd-item"><span class="wc-cd-num">${countdown.days}</span><span class="wc-cd-label">Ngày</span></div>
               <div class="wc-cd-item"><span class="wc-cd-num">${countdown.hours}</span><span class="wc-cd-label">Giờ</span></div>`
          }
        </div>
        <p class="wc-info">48 đội • 12 bảng • 104 trận • 16 sân vận động</p>
      </div>
    </div>`;

    // Tabs
    html += `<div class="detail-tabs">
      <button class="tab-btn active" onclick="app._matchTab(this,'wc-groups')">Bảng đấu</button>
      <button class="tab-btn" onclick="app._matchTab(this,'wc-venues')">Sân vận động</button>
      <button class="tab-btn" onclick="app._matchTab(this,'wc-predict')">Dự đoán</button>
    </div>`;

    // Groups tab
    html += '<div id="wc-groups" class="tab-panel">';
    html += '<div class="wc-groups-grid">';
    for (const [key, group] of Object.entries(this.groups)) {
      html += `<div class="wc-group-card">
        <div class="wc-group-name">${group.name}</div>
        <div class="wc-group-teams">`;
      for (const team of group.teams) {
        const flag = this.flags[team] || '🏳️';
        html += `<div class="wc-team-row"><span class="wc-flag">${flag}</span><span class="wc-team-name">${team}</span></div>`;
      }
      html += '</div></div>';
    }
    html += '</div></div>';

    // Venues tab
    html += '<div id="wc-venues" class="tab-panel" style="display:none">';
    html += '<div class="wc-venues-grid">';
    for (const v of this.venues) {
      html += `<div class="wc-venue-card">
        <div class="wc-venue-city">${v.city}</div>
        <div class="wc-venue-stadium">${v.stadium}</div>
        <div class="wc-venue-capacity">${v.capacity.toLocaleString()} chỗ ngồi</div>
      </div>`;
    }
    html += '</div></div>';

    // Predict tab
    html += '<div id="wc-predict" class="tab-panel" style="display:none">';
    html += `<div class="wc-predict-section">
      <h3>🎯 Dự đoán World Cup 2026</h3>
      <p class="text-muted" style="margin-bottom:12px">Chọn đội bạn nghĩ sẽ vô địch!</p>
      <div class="wc-predict-grid">`;
    const favorites = ['Brazil', 'Argentina', 'France', 'England', 'Spain', 'Germany', 'Portugal', 'Italy', 'Netherlands', 'Croatia', 'USA', 'Mexico'];
    for (const team of favorites) {
      const flag = this.flags[team] || '🏳️';
      const saved = localStorage.getItem('bd365_wc_winner');
      html += `<button class="wc-predict-btn ${saved === team ? 'selected' : ''}" onclick="worldcup.pickWinner('${team}', this)">
        <span class="wc-flag-lg">${flag}</span>
        <span>${team}</span>
      </button>`;
    }
    html += `</div>
      <div id="wcPredictResult" class="wc-predict-result"></div>
    </div>`;
    html += '</div>';

    return html;
  },

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
      navigator.share({ title: 'World Cup 2026 Prediction', text, url: 'https://bongda365.xyz/#/worldcup' });
    } else {
      navigator.clipboard.writeText(text).then(() => showToast('Đã copy! Chia sẻ lên Facebook/Zalo nhé!', 'info'));
    }
  },
};
