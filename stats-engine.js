// BongDa365 — Advanced Stats Engine
// Uses SofaScore team season stats + match xG/shotmap for deep analytics
// Provides xG insights for prediction engine + commentary engine

// ═══ CONFIG ═══
const CACHE_TTL = 60 * 60 * 1000; // 1 hour for team stats
const POLL_INTERVAL = 30 * 60 * 1000; // Refresh every 30 min
let fetchSofa = null; // Will be set by server.js

// ═══ LEAGUE CONFIG: SofaScore league IDs + season IDs ═══
const LEAGUE_MAP = {
  17:  { name: 'Premier League',   seasonId: 76986 },
  8:   { name: 'La Liga',          seasonId: 77559 },
  23:  { name: 'Serie A',          seasonId: 76457 },
  35:  { name: 'Bundesliga',       seasonId: 77333 },
  34:  { name: 'Ligue 1',          seasonId: 77356 },
  7:   { name: 'Champions League', seasonId: 76953 },
  679: { name: 'Europa League',    seasonId: 76954 },
  626: { name: 'V-League 1',       seasonId: 78589 },
};

// Top teams with SofaScore team IDs for pre-loading
const TOP_TEAMS = {
  // Premier League
  42: { name: 'Arsenal', league: 17 },
  17: { name: 'Manchester City', league: 17 },
  44: { name: 'Liverpool', league: 17 },
  35: { name: 'Chelsea', league: 17 },
  33: { name: 'Manchester United', league: 17 },
  73: { name: 'Tottenham', league: 17 },
  40: { name: 'Aston Villa', league: 17 },
  80: { name: 'Newcastle United', league: 17 },
  // La Liga
  2836: { name: 'Real Madrid', league: 8 },
  2817: { name: 'Barcelona', league: 8 },
  2672: { name: 'Atletico Madrid', league: 8 },
  // Serie A
  2697: { name: 'Inter', league: 23 },
  2692: { name: 'AC Milan', league: 23 },
  2687: { name: 'Juventus', league: 23 },
  2714: { name: 'Napoli', league: 23 },
  // Bundesliga
  2672: { name: 'Bayern Munich', league: 35 },
  2673: { name: 'Borussia Dortmund', league: 35 },
  2681: { name: 'Bayer Leverkusen', league: 35 },
  // Ligue 1
  1644: { name: 'Paris Saint-Germain', league: 34 },
};

// ═══ IN-MEMORY STORES ═══
const teamStatsCache = new Map();    // "teamId" -> { stats, ts }
const leagueStatsCache = new Map();  // leagueId -> { standings with stats, ts }
const matchXGCache = new Map();      // matchId -> { homeXg, awayXg, shots[], ts }

// ═══ SET FETCH FUNCTION (called from server.js) ═══
function setFetchFn(fn) {
  fetchSofa = fn;
}

// ═══ INTERNAL FETCH ═══
async function apiFetch(path) {
  if (!fetchSofa) throw new Error('fetchSofa not set — call setFetchFn first');
  const result = await fetchSofa(path);
  if (!result || result.status !== 200) return null;
  return JSON.parse(result.body.toString());
}

// ═══════════════════════════════════════
//  TEAM SEASON STATS (SofaScore)
// ═══════════════════════════════════════

async function fetchTeamSeasonStats(teamId, leagueId) {
  const league = LEAGUE_MAP[leagueId];
  if (!league) return null;

  const cacheKey = `${teamId}_${leagueId}`;
  const cached = teamStatsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const data = await apiFetch(`/api/v1/team/${teamId}/unique-tournament/${leagueId}/season/${league.seasonId}/statistics/overall`);
    if (!data?.statistics) return null;

    const s = data.statistics;
    const mp = s.matches || s.matchesTotal || 1;

    const stats = {
      teamId,
      leagueId,
      matches: mp,
      // Goals
      goalsScored: s.goalsScored || 0,
      goalsConceded: s.goalsConceded || 0,
      goalDiff: (s.goalsScored || 0) - (s.goalsConceded || 0),
      // Shooting
      shots: s.shots || 0,
      shotsOnTarget: s.shotsOnTarget || 0,
      shotsOffTarget: s.shotsOffTarget || 0,
      shotsBlocked: s.blockedScoringAttempt || 0,
      shotsInsideBox: s.shotsFromInsideTheBox || 0,
      shotsOutsideBox: s.shotsFromOutsideTheBox || 0,
      bigChances: s.bigChances || 0,
      bigChancesCreated: s.bigChancesCreated || 0,
      bigChancesMissed: s.bigChancesMissed || 0,
      // Per match averages
      shotsPerMatch: Math.round(((s.shots || 0) / mp) * 10) / 10,
      goalsScoredPerMatch: Math.round(((s.goalsScored || 0) / mp) * 100) / 100,
      goalsConcededPerMatch: Math.round(((s.goalsConceded || 0) / mp) * 100) / 100,
      // Passing
      accuratePasses: s.accuratePasses || 0,
      totalPasses: s.totalPasses || 0,
      passAccuracy: s.totalPasses ? Math.round(((s.accuratePasses || 0) / s.totalPasses) * 100) : 0,
      accurateLongBalls: s.accurateLongBalls || 0,
      totalLongBalls: s.totalLongBalls || 0,
      keyPasses: s.keyPasses || 0,
      // Dribbling
      successfulDribbles: s.successfulDribbles || 0,
      dribbleAttempts: s.dribbleAttempts || 0,
      // Defending
      tackles: s.tackles || 0,
      interceptions: s.interceptions || 0,
      clearances: s.clearances || 0,
      errorLeadToGoal: s.errorLeadToGoal || 0,
      errorLeadToShot: s.errorLeadToShot || 0,
      // Discipline
      yellowCards: s.yellowCards || 0,
      redCards: s.redCards || 0,
      fouls: s.fouls || 0,
      // Set pieces
      penaltyGoals: s.penaltyGoals || 0,
      penaltiesTaken: s.penaltiesTaken || 0,
      freeKickGoals: s.freeKickGoals || 0,
      corners: s.cornerKicks || s.corners || 0,
      // Possession
      averagePossession: s.averageBallPossession || 0,
      // Advanced derived
      conversionRate: s.shots ? Math.round(((s.goalsScored || 0) / s.shots) * 1000) / 10 : 0,
      bigChanceConversion: s.bigChances ? Math.round(((s.bigChances - (s.bigChancesMissed || 0)) / s.bigChances) * 100) : 0,
    };

    teamStatsCache.set(cacheKey, { data: stats, ts: Date.now() });
    return stats;
  } catch (e) {
    console.log(`[Stats] Failed to fetch team ${teamId} stats: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════
//  MATCH xG & SHOTMAP
// ═══════════════════════════════════════

async function fetchMatchXG(matchId) {
  const cached = matchXGCache.get(matchId);
  if (cached && Date.now() - cached.ts < 300000) return cached.data; // 5min cache

  try {
    // Fetch statistics for xG
    const statsData = await apiFetch(`/api/v1/event/${matchId}/statistics`);
    let homeXg = null, awayXg = null;
    if (statsData?.statistics) {
      const all = statsData.statistics.find(s => s.period === 'ALL');
      if (all) {
        for (const g of all.groups || []) {
          for (const item of g.statisticsItems || []) {
            if (item.name === 'Expected goals' || item.key === 'expectedGoals') {
              homeXg = parseFloat(item.homeValue || item.home) || 0;
              awayXg = parseFloat(item.awayValue || item.away) || 0;
            }
          }
        }
      }
    }

    // Fetch shotmap
    let homeShots = [], awayShots = [];
    try {
      const shotData = await apiFetch(`/api/v1/event/${matchId}/shotmap`);
      if (shotData?.shotmap) {
        for (const shot of shotData.shotmap) {
          const s = {
            player: shot.player?.name || shot.player?.shortName || '',
            x: shot.playerCoordinates?.x || 0,
            y: shot.playerCoordinates?.y || 0,
            xg: parseFloat(shot.xg || shot.expectedGoals) || 0,
            goalMouthX: shot.goalMouthLocation?.x || 0,
            goalMouthY: shot.goalMouthLocation?.y || 0,
            type: shot.shotType || '',
            situation: shot.situation || '',
            bodyPart: shot.bodyPart || '',
            isGoal: shot.shotType === 'goal',
            minute: shot.time || 0,
            addedTime: shot.addedTime || 0,
          };
          if (shot.isHome) homeShots.push(s);
          else awayShots.push(s);
        }
      }
    } catch {}

    // Calculate xG from shotmap if not in statistics
    if (homeXg === null && homeShots.length > 0) {
      homeXg = Math.round(homeShots.reduce((sum, s) => sum + s.xg, 0) * 100) / 100;
    }
    if (awayXg === null && awayShots.length > 0) {
      awayXg = Math.round(awayShots.reduce((sum, s) => sum + s.xg, 0) * 100) / 100;
    }

    const result = {
      matchId,
      homeXg: homeXg || 0,
      awayXg: awayXg || 0,
      homeShots,
      awayShots,
      totalShots: homeShots.length + awayShots.length,
    };

    matchXGCache.set(matchId, { data: result, ts: Date.now() });
    return result;
  } catch (e) {
    console.log(`[Stats] Failed to fetch match ${matchId} xG: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════
//  LEAGUE STANDINGS WITH STATS
// ═══════════════════════════════════════

async function fetchLeagueStandings(leagueId) {
  const league = LEAGUE_MAP[leagueId];
  if (!league) return null;

  const cached = leagueStatsCache.get(leagueId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const data = await apiFetch(`/api/v1/unique-tournament/${leagueId}/season/${league.seasonId}/standings/total`);
    if (!data?.standings?.[0]?.rows) return null;

    const teams = data.standings[0].rows.map(row => ({
      position: row.position,
      teamId: row.team?.id,
      name: row.team?.name || '',
      shortName: row.team?.shortName || '',
      played: row.matches || 0,
      wins: row.wins || 0,
      draws: row.draws || 0,
      losses: row.losses || 0,
      goalsFor: row.scoresFor || 0,
      goalsAgainst: row.scoresAgainst || 0,
      points: row.points || 0,
      form: row.descriptions?.map(d => d.text).join('') || '',
    }));

    const result = { leagueId, league: league.name, teams, ts: Date.now() };
    leagueStatsCache.set(leagueId, { data: result, ts: Date.now() });
    return result;
  } catch (e) {
    console.log(`[Stats] Failed to fetch league ${leagueId} standings: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════
//  PUBLIC API: MATCH ANALYSIS
// ═══════════════════════════════════════

function getTeamStats(teamName, leagueId) {
  // Search through cached team stats
  for (const [key, cached] of teamStatsCache) {
    if (!key.endsWith(`_${leagueId}`)) continue;
    if (Date.now() - cached.ts > CACHE_TTL) continue;
    // We don't store team name in the cache key, so we need the standings
    // to match teamName -> teamId
  }

  // Search through league standings for the team
  const standings = leagueStatsCache.get(leagueId);
  if (!standings) return null;

  const nameNorm = teamName.toLowerCase().trim();
  const team = standings.data?.teams?.find(t => {
    const n = t.name.toLowerCase();
    const sn = (t.shortName || '').toLowerCase();
    return n === nameNorm || sn === nameNorm || n.includes(nameNorm) || nameNorm.includes(n) || sn.includes(nameNorm) || nameNorm.includes(sn);
  });

  if (!team?.teamId) return null;

  const cacheKey = `${team.teamId}_${leagueId}`;
  const cached = teamStatsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { ...cached.data, name: team.name, position: team.position, form: team.form };
  }
  return null;
}

// Async version that fetches if not cached
async function getTeamStatsAsync(teamName, leagueId) {
  // First try cache
  const cached = getTeamStats(teamName, leagueId);
  if (cached) return cached;

  // Find teamId from standings
  let standings = leagueStatsCache.get(leagueId)?.data;
  if (!standings) {
    standings = await fetchLeagueStandings(leagueId);
  }
  if (!standings?.teams) return null;

  const nameNorm = teamName.toLowerCase().trim();
  const team = standings.teams.find(t => {
    const n = t.name.toLowerCase();
    const sn = (t.shortName || '').toLowerCase();
    return n === nameNorm || sn === nameNorm || n.includes(nameNorm) || nameNorm.includes(n) || sn.includes(nameNorm) || nameNorm.includes(sn);
  });

  if (!team?.teamId) return null;

  const stats = await fetchTeamSeasonStats(team.teamId, leagueId);
  if (stats) {
    return { ...stats, name: team.name, position: team.position, form: team.form };
  }
  return null;
}

function getMatchAnalysis(homeName, awayName, leagueId) {
  const home = getTeamStats(homeName, leagueId);
  const away = getTeamStats(awayName, leagueId);
  if (!home && !away) return null;

  const analysis = {
    home: home || { name: homeName },
    away: away || { name: awayName },
    insights: [],
  };

  if (home && away) {
    const hGPM = home.goalsScoredPerMatch || 0;
    const aGPM = away.goalsScoredPerMatch || 0;
    const hGCPM = home.goalsConcededPerMatch || 0;
    const aGCPM = away.goalsConcededPerMatch || 0;

    // Attacking comparison
    if (hGPM > aGPM * 1.3 && hGPM > 1.5) {
      analysis.insights.push({
        vi: `${homeName} hiệu quả hơn hẳn trong tấn công (${hGPM} bàn/trận vs ${aGPM})`,
        type: 'attack_advantage', team: 'home',
      });
    } else if (aGPM > hGPM * 1.3 && aGPM > 1.5) {
      analysis.insights.push({
        vi: `${awayName} sắc bén hơn phía trước (${aGPM} bàn/trận vs ${hGPM})`,
        type: 'attack_advantage', team: 'away',
      });
    }

    // Shot efficiency
    if (home.conversionRate && away.conversionRate) {
      if (home.conversionRate > away.conversionRate * 1.3) {
        analysis.insights.push({
          vi: `${homeName} hiệu suất dứt điểm cao hơn (${home.conversionRate}% vs ${away.conversionRate}%)`,
          type: 'efficiency', team: 'home',
        });
      }
    }

    // Big chances
    if (home.bigChancesCreated && away.bigChancesCreated) {
      const hBCPM = home.bigChancesCreated / Math.max(1, home.matches);
      const aBCPM = away.bigChancesCreated / Math.max(1, away.matches);
      if (hBCPM > aBCPM * 1.5 && hBCPM > 2) {
        analysis.insights.push({
          vi: `${homeName} tạo ra ${home.bigChancesCreated} cơ hội lớn (${hBCPM.toFixed(1)}/trận) — hàng công đẳng cấp`,
          type: 'big_chances', team: 'home',
        });
      }
    }

    // Defensive comparison
    if (hGCPM < 1.0 && hGCPM < aGCPM * 0.7) {
      analysis.insights.push({
        vi: `🛡️ ${homeName} phòng ngự cực chắc (${hGCPM} bàn thua/trận) — ${awayName} sẽ rất khó ghi bàn`,
        type: 'defensive_strength', team: 'home',
      });
    }
    if (aGCPM < 1.0 && aGCPM < hGCPM * 0.7) {
      analysis.insights.push({
        vi: `🛡️ ${awayName} phòng ngự chắc chắn (${aGCPM} bàn thua/trận)`,
        type: 'defensive_strength', team: 'away',
      });
    }

    // Goal expectation for the match
    const expectedHome = (hGPM + aGCPM) / 2;
    const expectedAway = (aGPM + hGCPM) / 2;
    const expectedTotal = expectedHome + expectedAway;

    if (expectedTotal > 3.0) {
      analysis.insights.push({
        vi: `📊 Dự kiến tổng bàn thắng: ${expectedTotal.toFixed(1)} — khả năng Over 2.5 rất cao`,
        type: 'over_goals',
      });
    } else if (expectedTotal < 2.0) {
      analysis.insights.push({
        vi: `📊 Dự kiến tổng bàn chỉ ${expectedTotal.toFixed(1)} — trận đấu có thể ít bàn (Under 2.5)`,
        type: 'under_goals',
      });
    }

    // Big chances missed (overperformance proxy)
    if (home.bigChancesMissed > home.bigChances * 0.6 && home.bigChancesMissed > 10) {
      analysis.insights.push({
        vi: `⚠️ ${homeName} bỏ lỡ ${home.bigChancesMissed}/${home.bigChances} cơ hội lớn — đang "phí phạm", có thể bùng nổ`,
        type: 'wasteful', team: 'home',
      });
    }
    if (away.bigChancesMissed > away.bigChances * 0.6 && away.bigChancesMissed > 10) {
      analysis.insights.push({
        vi: `⚠️ ${awayName} lãng phí cơ hội (${away.bigChancesMissed}/${away.bigChances} cơ hội lớn bị bỏ lỡ)`,
        type: 'wasteful', team: 'away',
      });
    }

    // Error-prone defense
    if (home.errorLeadToGoal >= 3) {
      analysis.insights.push({
        vi: `🚨 ${homeName} mắc ${home.errorLeadToGoal} sai lầm dẫn đến bàn thua mùa này — ${awayName} có thể khai thác`,
        type: 'errors', team: 'home',
      });
    }

    // Pressing/Possession style
    if (home.averagePossession && away.averagePossession) {
      if (home.averagePossession > 60 && away.averagePossession > 60) {
        analysis.insights.push({
          vi: `🔥 Trận đấu giữa 2 đội kiểm soát bóng tốt (${home.averagePossession}% vs ${away.averagePossession}%) — cuộc chiến giữa sân rất hấp dẫn`,
          type: 'possession_battle',
        });
      }
    }

    // Discipline (cards prediction)
    const hFouls = (home.fouls || 0) / Math.max(1, home.matches);
    const aFouls = (away.fouls || 0) / Math.max(1, away.matches);
    if (hFouls + aFouls > 25) {
      analysis.insights.push({
        vi: `⚠️ Cả hai đội phạm lỗi nhiều (${hFouls.toFixed(0)}+${aFouls.toFixed(0)}/trận) — trận đấu có thể nhiều thẻ phạt`,
        type: 'high_fouls',
      });
    }

    // Corners prediction
    const hCorners = (home.corners || 0) / Math.max(1, home.matches);
    const aCorners = (away.corners || 0) / Math.max(1, away.matches);
    if (hCorners + aCorners > 12) {
      analysis.insights.push({
        vi: `🚩 Trung bình ${(hCorners + aCorners).toFixed(0)} phạt góc/trận khi hai đội này chơi — Over 9.5 phạt góc đáng cân nhắc`,
        type: 'high_corners',
      });
    }
  }

  return analysis;
}

// Generate xG commentary for a live/finished match
function getXGCommentary(homeName, awayName, homeScore, awayScore, leagueId) {
  const home = getTeamStats(homeName, leagueId);
  const away = getTeamStats(awayName, leagueId);
  if (!home && !away) return null;

  const lines = [];

  if (home && away) {
    const hGPM = home.goalsScoredPerMatch || 0;
    const aGPM = away.goalsScoredPerMatch || 0;
    const total = homeScore + awayScore;

    // Lucky win detection
    if (homeScore > awayScore && hGPM < aGPM * 0.7 && aGPM > 1.5) {
      lines.push(`${homeName} thắng ${homeScore}-${awayScore} dù trung bình chỉ ghi ${hGPM.toFixed(2)} bàn/trận — chiến thắng bất ngờ?`);
    }
    if (awayScore > homeScore && aGPM < hGPM * 0.7 && hGPM > 1.5) {
      lines.push(`${awayName} gây sốc! Thắng ${awayScore}-${homeScore} với trung bình chỉ ${aGPM.toFixed(2)} bàn/trận`);
    }

    // High scoring vs average
    const expectedTotal = (hGPM + aGPM);
    if (total > expectedTotal * 1.5 && total >= 4) {
      lines.push(`${total} bàn — gấp ${(total / expectedTotal).toFixed(1)}x trung bình hai đội (${expectedTotal.toFixed(1)} bàn/trận). Trận đấu mưa bàn thắng!`);
    }
    if (total === 0 && expectedTotal > 2.5) {
      lines.push(`0-0 bất ngờ! Hai đội trung bình ghi ${expectedTotal.toFixed(1)} bàn/trận. Hàng thủ quá xuất sắc hôm nay.`);
    }

    // Big chance conversion context
    if (home.bigChanceConversion && away.bigChanceConversion) {
      if (homeScore >= 3 && home.bigChanceConversion > 50) {
        lines.push(`${homeName} đã tận dụng tốt cơ hội với tỷ lệ chuyển đổi ${home.bigChanceConversion}% cơ hội lớn mùa này`);
      }
    }
  }

  return lines.length > 0 ? lines : null;
}

// ═══ API ENDPOINT DATA ═══
function getAPIData(leagueId) {
  const standings = leagueStatsCache.get(leagueId);
  if (!standings) return null;

  const teams = (standings.data?.teams || []).map(team => {
    const cacheKey = `${team.teamId}_${leagueId}`;
    const stats = teamStatsCache.get(cacheKey);
    return {
      ...team,
      ...(stats?.data || {}),
    };
  });

  return {
    league: LEAGUE_MAP[leagueId]?.name || '',
    leagueId,
    teams,
    lastUpdate: standings.ts,
  };
}

// ═══ STATUS ═══
function getStatus() {
  const leagues = [];
  for (const [id, league] of Object.entries(LEAGUE_MAP)) {
    const cached = leagueStatsCache.get(parseInt(id));
    const teamCount = cached ? cached.data?.teams?.length || 0 : 0;
    // Count teams with detailed stats
    let detailedCount = 0;
    if (cached?.data?.teams) {
      for (const t of cached.data.teams) {
        if (teamStatsCache.has(`${t.teamId}_${id}`)) detailedCount++;
      }
    }
    leagues.push({
      id: parseInt(id),
      name: league.name,
      standings: teamCount > 0 ? { teams: teamCount, age: Math.round((Date.now() - (cached?.ts || 0)) / 60000) + 'min' } : null,
      detailedStats: detailedCount,
    });
  }
  return {
    leagues,
    teamsCached: teamStatsCache.size,
    matchesCached: matchXGCache.size,
    supportedLeagues: Object.keys(LEAGUE_MAP).map(Number),
  };
}

// ═══ STARTUP & POLLING ═══
async function start() {
  if (!fetchSofa) {
    console.log('[Stats] WARNING: fetchSofa not set, stats engine will not load data');
    return;
  }

  console.log('[Stats] Starting advanced stats engine (SofaScore team stats + xG)...');

  // Load standings for all leagues
  for (const leagueId of Object.keys(LEAGUE_MAP)) {
    const id = parseInt(leagueId);
    try {
      await fetchLeagueStandings(id);
    } catch (e) {
      console.log(`[Stats] Standings load failed for ${LEAGUE_MAP[id].name}: ${e.message}`);
    }
  }

  // Load detailed stats for top teams in top 5 leagues
  let loaded = 0;
  for (const leagueId of [17, 8, 23, 35, 34]) {
    const standings = leagueStatsCache.get(leagueId);
    if (!standings?.data?.teams) continue;

    // Load top 10 teams per league
    const top = standings.data.teams.slice(0, 10);
    for (const team of top) {
      if (!team.teamId) continue;
      try {
        await fetchTeamSeasonStats(team.teamId, leagueId);
        loaded++;
      } catch {}
      // Small delay to avoid hammering API
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`[Stats] Initial load complete. ${loaded} team stats loaded, ${leagueStatsCache.size} leagues.`);

  // Periodic refresh
  setInterval(async () => {
    for (const leagueId of Object.keys(LEAGUE_MAP)) {
      try { await fetchLeagueStandings(parseInt(leagueId)); } catch {}
    }
    // Refresh top teams
    for (const leagueId of [17, 8, 23, 35, 34]) {
      const standings = leagueStatsCache.get(leagueId);
      if (!standings?.data?.teams) continue;
      for (const team of standings.data.teams.slice(0, 8)) {
        if (team.teamId) {
          try { await fetchTeamSeasonStats(team.teamId, leagueId); } catch {}
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }
  }, POLL_INTERVAL);
}

module.exports = {
  setFetchFn,
  start,
  getTeamStats,
  getTeamStatsAsync,
  getMatchAnalysis,
  getXGCommentary,
  getAPIData,
  getStatus,
  fetchMatchXG,
  fetchTeamSeasonStats,
  fetchLeagueStandings,
  LEAGUE_MAP,
};
