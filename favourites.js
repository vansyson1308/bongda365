// BongDa365 - Favourites Manager (localStorage)
const favourites = {
  _leagues: null,
  _teams: null,

  get leagues() {
    if (!this._leagues) this._leagues = JSON.parse(localStorage.getItem('fav_leagues') || '[]');
    return this._leagues;
  },
  get teams() {
    if (!this._teams) this._teams = JSON.parse(localStorage.getItem('fav_teams') || '[]');
    return this._teams;
  },

  hasLeague(id) { return this.leagues.includes(Number(id)); },
  hasTeam(id) { return this.teams.includes(Number(id)); },

  toggleLeague(id) {
    id = Number(id);
    const idx = this.leagues.indexOf(id);
    if (idx >= 0) this.leagues.splice(idx, 1);
    else this.leagues.push(id);
    localStorage.setItem('fav_leagues', JSON.stringify(this.leagues));
    if (typeof sidebar !== 'undefined') sidebar.render();
  },

  toggleTeam(id) {
    id = Number(id);
    const idx = this.teams.indexOf(id);
    if (idx >= 0) this.teams.splice(idx, 1);
    else this.teams.push(id);
    localStorage.setItem('fav_teams', JSON.stringify(this.teams));
  },

  starIcon(type, id) {
    const has = type === 'league' ? this.hasLeague(id) : this.hasTeam(id);
    const fn = type === 'league' ? 'toggleLeague' : 'toggleTeam';
    return `<span class="fav-star ${has ? 'active' : ''}" onclick="event.stopPropagation();favourites.${fn}(${id})">${has ? '★' : '☆'}</span>`;
  }
};
