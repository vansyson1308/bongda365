// BongDa365 - Hash-based SPA Router
const router = {
  routes: [],
  currentPage: null,
  beforeLeave: null, // callback before leaving current page

  register(pattern, handler) {
    // Convert pattern like '#/league/:tid/standings' to regex
    const parts = pattern.replace(/:[^/]+/g, '([^/]+)');
    const regex = new RegExp('^' + parts + '$');
    this.routes.push({ pattern, regex, handler });
  },

  navigate(hash) {
    if (window.location.hash === hash) {
      this.resolve(); // force re-render even if same hash
    } else {
      window.location.hash = hash;
    }
  },

  init() {
    window.addEventListener('hashchange', () => this.resolve());
    // Initial route
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '#/';
    }
    this.resolve();
  },

  resolve() {
    const hash = window.location.hash || '#/';
    let path = hash.slice(1) || '/'; // remove '#'
    // Strip query string before route matching (keep it accessible via getQuery())
    const qIdx = path.indexOf('?');
    if (qIdx !== -1) path = path.substring(0, qIdx);

    // Call beforeLeave on previous page
    if (this.beforeLeave) {
      this.beforeLeave();
      this.beforeLeave = null;
    }

    // Try to match routes
    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = match.slice(1); // captured groups
        this.currentPage = route.pattern;
        route.handler(...params);
        // Update active sidebar link
        this._updateActiveLinks(hash);
        return;
      }
    }

    // Fallback: 404 or redirect to home
    const el = document.getElementById('page-content');
    if (el) el.innerHTML = '<div class="empty-state"><div class="icon">404</div><p>Không tìm thấy trang</p></div>';
  },

  _updateActiveLinks(hash) {
    // Update sidebar active states
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === hash);
    });
    // Update header league quick-links
    document.querySelectorAll('.league-quicklink').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === hash);
    });
  },

  // Helper: get query params from hash
  getQuery() {
    const hash = window.location.hash || '';
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return {};
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const obj = {};
    for (const [k, v] of params) obj[k] = v;
    return obj;
  }
};
