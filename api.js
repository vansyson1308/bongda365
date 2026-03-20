// SofaScore API wrapper - 100% real data
class SofaAPI {
  constructor() {
    this.base = CONFIG.API;
    this.cache = new Map();
    this.ttl = 5000;
  }

  async get(path) {
    const url = this.base + path;
    const c = this.cache.get(url);
    if (c && Date.now() - c.ts < this.ttl) return c.data;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    this.cache.set(url, { data: json, ts: Date.now() });
    // Evict old entries (keep max 100) - single pass O(n)
    if (this.cache.size > 100) {
      const cutoff = Date.now() - this.ttl * 3;
      for (const [k, v] of this.cache) {
        if (v.ts < cutoff) this.cache.delete(k);
        if (this.cache.size <= 80) break;
      }
    }
    return json;
  }

  img(type, id) { return `${this.base}/${type}/${id}/image`; }
  teamImg(id) { return this.img('team', id); }
  tournImg(id) { return this.img('unique-tournament', id); }
  playerImg(id) { return this.img('player', id); }

  // ── Core endpoints ──
  async getLive()            { return this.get('/sport/football/events/live'); }
  async getByDate(date)      { return this.get(`/sport/football/scheduled-events/${date}`); }
  async getStandings(tid,sid){ return this.get(`/unique-tournament/${tid}/season/${sid}/standings/total`); }
  async getStats(eid)        { return this.get(`/event/${eid}/statistics`); }
  async getIncidents(eid)    { return this.get(`/event/${eid}/incidents`); }
  async getLineups(eid)      { return this.get(`/event/${eid}/lineups`); }
  async getH2H(eid)          { return this.get(`/event/${eid}/h2h`); }
  async getOdds(eid)         { return this.get(`/event/${eid}/odds/1/all`); }
  async getGraph(eid)        { return this.get(`/event/${eid}/graph`); }
  async getShotmap(eid)      { return this.get(`/event/${eid}/shotmap`); }
  async getBestPlayers(eid)  { return this.get(`/event/${eid}/best-players`); }
  async getAvgPositions(eid) { return this.get(`/event/${eid}/average-positions`); }
  async getSeasons(tid)      { return this.get(`/unique-tournament/${tid}/seasons`); }
  async getTournaments(catId){ return this.get(`/category/${catId}/unique-tournaments`); }
  async getTopPlayers(tid,sid,type) { return this.get(`/unique-tournament/${tid}/season/${sid}/top-players/${type}`); }
  async getTeamStats(teamId, tournId, seasonId) { return this.get(`/team/${teamId}/unique-tournament/${tournId}/season/${seasonId}/statistics/overall`); }
  async getTeamLastMatches(teamId, page) { return this.get(`/team/${teamId}/events/last/${page||0}`); }
  async getTeamNextMatches(teamId, page) { return this.get(`/team/${teamId}/events/next/${page||0}`); }

  // ── New endpoints for v3 ──
  async getEvent(eid)          { return this.get(`/event/${eid}`); }
  async getTeamDetail(teamId)  { return this.get(`/team/${teamId}`); }
  async getTeamPlayers(teamId) { return this.get(`/team/${teamId}/players`); }
  async getPlayerDetail(pid)   { return this.get(`/player/${pid}`); }
  async getPlayerSeasons(pid)  { return this.get(`/player/${pid}/statistics/seasons`); }
  async getRounds(tid, sid)    { return this.get(`/unique-tournament/${tid}/season/${sid}/rounds`); }
  async search(q)              { return this.get(`/search/all?q=${encodeURIComponent(q)}&page=0`); }

  // ── Mappers ──
  mapEvent(e) {
    const st = e.status || {};
    let status, minute = null;
    if (st.type === 'inprogress') {
      status = 'LIVE';
      if (e.time?.currentPeriodStartTimestamp) {
        const elapsed = Math.floor((Date.now()/1000 - e.time.currentPeriodStartTimestamp) / 60);
        const desc = (st.description || '').toLowerCase();
        if (desc.includes('2nd')) minute = 45 + Math.max(0, elapsed);
        else if (desc.includes('extra')) minute = 90 + Math.max(0, elapsed);
        else minute = Math.max(0, elapsed);
      }
    } else if (st.type === 'finished') status = 'FT';
    else if (st.type === 'notstarted') status = 'NS';
    else status = st.description || st.type || '?';

    const ut = e.tournament?.uniqueTournament || {};
    return {
      id: e.id, slug: e.slug,
      home: { name: e.homeTeam?.name||'?', short: e.homeTeam?.shortName||e.homeTeam?.name||'?', id: e.homeTeam?.id, logo: e.homeTeam?.id ? this.teamImg(e.homeTeam.id) : '' },
      away: { name: e.awayTeam?.name||'?', short: e.awayTeam?.shortName||e.awayTeam?.name||'?', id: e.awayTeam?.id, logo: e.awayTeam?.id ? this.teamImg(e.awayTeam.id) : '' },
      homeScore: e.homeScore?.current ?? null, awayScore: e.awayScore?.current ?? null,
      ht: e.homeScore?.period1 != null ? { h: e.homeScore.period1, a: e.awayScore.period1 } : null,
      league: { id: ut.id||e.tournament?.id, name: ut.name||e.tournament?.name||'', logo: ut.id ? this.tournImg(ut.id) : '', country: e.tournament?.category?.name||'', seasonId: e.season?.id || null },
      round: e.roundInfo?.round, roundName: e.roundInfo?.name||'',
      status, statusDesc: st.description||'', minute,
      startTs: e.startTimestamp, hasStats: !!e.hasEventPlayerStatistics,
      winnerCode: e.winnerCode,
    };
  }

  mapStats(data) {
    const all = data.statistics?.find(s => s.period === 'ALL');
    if (!all) return [];
    const stats = [];
    (all.groups || []).forEach(g => {
      (g.statisticsItems || []).forEach(s => {
        stats.push({ name: s.name, home: s.home, away: s.away, key: s.key, hv: s.homeValue, av: s.awayValue, type: s.statisticsType, render: s.renderType });
      });
    });
    return stats;
  }
  // ── News API (not proxied through SofaScore) ──
  async getNews(page, category) {
    let url = `/api/news?page=${page || 1}&limit=20`;
    if (category && category !== 'all') url += `&category=${category}`;
    const c = this.cache.get(url);
    if (c && Date.now() - c.ts < 60000) return c.data;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    this.cache.set(url, { data: json, ts: Date.now() });
    return json;
  }

  async getNewsArticle(id) {
    const url = `/api/news/${id}`;
    const c = this.cache.get(url);
    // Short cache (3s) for articles still loading, longer (5min) for ready articles
    const ttl = (c && c.data && c.data.article && c.data.article.contentStatus === 'ready') ? 300000 : 3000;
    if (c && Date.now() - c.ts < ttl) return c.data;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    this.cache.set(url, { data: json, ts: Date.now() });
    return json;
  }
}

const api = new SofaAPI();

// ── Vietnamese translations ──
const VI = {
  stats: {
    'Ball possession':'Kiểm soát bóng','Expected goals':'Bàn thắng kỳ vọng (xG)','Big chances':'Cơ hội lớn',
    'Big chances missed':'Bỏ lỡ cơ hội lớn','Total shots':'Tổng số sút','Shots on target':'Sút trúng đích',
    'Shots off target':'Sút trượt','Blocked shots':'Sút bị chặn','Shots inside box':'Sút trong vòng cấm',
    'Shots outside box':'Sút ngoài vòng cấm','Hit woodwork':'Trúng khung gỗ','Corner kicks':'Phạt góc',
    'Offsides':'Việt vị','Fouls':'Phạm lỗi','Yellow cards':'Thẻ vàng','Red cards':'Thẻ đỏ',
    'Goalkeeper saves':'Cứu thua','Free kicks':'Đá phạt','Throw-ins':'Ném biên','Goal kicks':'Phát bóng',
    'Passes':'Chuyền bóng','Accurate passes':'Chuyền chính xác','Long balls':'Bóng dài',
    'Accurate long balls':'Bóng dài chính xác','Crosses':'Tạt bóng','Accurate crosses':'Tạt chính xác',
    'Dribbles':'Rê bóng','Successful dribbles':'Rê bóng thành công','Tackles':'Tranh chấp',
    'Interceptions':'Đoạt bóng','Clearances':'Phá bóng','Total saves':'Tổng cứu thua',
    'Goals prevented':'Ngăn bàn thua','Final third entries':'Vào 1/3 cuối sân',
    'Duels won':'Thắng đối đầu','Duels lost':'Thua đối đầu','Ground duels won':'Đối đầu mặt đất thắng',
    'Aerial duels won':'Không chiến thắng','Possession lost':'Mất bóng',
  },
  markets: {
    'Full time':'Kết quả 1X2','Double chance':'Cơ hội kép','1st half':'Hiệp 1','Draw no bet':'Hòa hoàn tiền',
    'Both teams to score':'Cả hai ghi bàn (BTTS)','Match goals':'Tổng bàn thắng','Asian handicap':'Kèo chấp châu Á',
    'Cards in match':'Thẻ phạt','Corners 2-Way':'Phạt góc','First team to score':'Ghi bàn trước',
  },
  incident: {
    goal:'Bàn thắng', card:'Thẻ phạt', substitution:'Thay người', varDecision:'VAR', period:'Hiệp',
    yellow:'Thẻ vàng', red:'Thẻ đỏ', yellowred:'Thẻ vàng 2', penalty:'Phạt đền', ownGoal:'Phản lưới',
  },
  status: {
    '1st half':'Hiệp 1','2nd half':'Hiệp 2','Halftime':'Nghỉ giữa hiệp','Ended':'Kết thúc',
    'Not started':'Chưa bắt đầu','Extra time':'Hiệp phụ','Penalties':'Loạt penalty',
    'After extra time':'Sau hiệp phụ','After penalties':'Sau penalty',
  },
  promotion: {
    'Champions League':'Champions League','UEFA Europa League':'Europa League',
    'Conference League':'Conference League','Relegation':'Xuống hạng',
  }
};
