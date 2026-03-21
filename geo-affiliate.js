// BongDa365 - Geo-targeted Affiliate System
// Vietnamese users: football gear, streaming apps (NO betting/gambling)
// International users: betting affiliates allowed
// Default: VN (safe) if geo detection fails

class GeoAffiliate {
  constructor() {
    this.country = null;
    this.isVN = true; // Default to VN (safe default - Vietnamese law prohibits gambling ads)
    this.loaded = false;
  }

  async detectCountry() {
    try {
      // Method 1: ipapi.co (free, no key, 1000/day)
      const controller1 = new AbortController();
      const timeout1 = setTimeout(() => controller1.abort(), 5000);
      const res = await fetch('https://ipapi.co/json/', { signal: controller1.signal });
      clearTimeout(timeout1);
      const data = await res.json();
      this.country = data.country_code;
      this.isVN = this.country === 'VN';
    } catch {
      try {
        // Method 2: ip-api.com fallback (free, no key)
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 5000);
        const res = await fetch('http://ip-api.com/json/?fields=countryCode', { signal: controller2.signal });
        clearTimeout(timeout2);
        const data = await res.json();
        this.country = data.countryCode;
        this.isVN = this.country === 'VN';
      } catch {
        // Both failed - default to VN (safe)
        this.isVN = true;
        this.country = 'VN';
      }
    }
    this.loaded = true;
    this.renderAffiliates();
  }

  renderAffiliates() {
    const containers = document.querySelectorAll('[data-affiliate]');
    containers.forEach(el => this.fillSlot(el));
  }

  fillSlot(el) {
    const slot = el.dataset.affiliate;

    if (this.isVN) {
      el.innerHTML = this.getVNAffiliate(slot);
    } else {
      el.innerHTML = this.getIntlAffiliate(slot);
    }
  }

  getVNAffiliate(slot) {
    // Vietnamese market: football gear, apps, streaming - NO gambling
    const vnAffiliates = [
      {
        title: 'Ao dau chinh hang',
        desc: 'Mua ao dau World Cup 2026 giam 30%',
        link: '#',
        cta: 'Mua ngay',
        icon: '\u26BD'
      },
      {
        title: 'FPT Play - Xem bong da truc tiep',
        desc: 'Dang ky FPT Play xem World Cup 2026 HD',
        link: '#',
        cta: 'Dang ky',
        icon: '\uD83D\uDCFA'
      },
      {
        title: 'FIFA+ Chinh Thuc',
        desc: 'Tai app FIFA+ xem highlight mien phi',
        link: '#',
        cta: 'Tai app',
        icon: '\uD83D\uDCF1'
      },
      {
        title: 'Giay da bong Nike/Adidas',
        desc: 'Giam gia 40% giay da bong chinh hang',
        link: '#',
        cta: 'Xem ngay',
        icon: '\uD83D\uDC5F'
      }
    ];

    const aff = vnAffiliates[Math.floor(Math.random() * vnAffiliates.length)];
    return this._renderCard(aff, 'vn');
  }

  getIntlAffiliate(slot) {
    // International: betting affiliates allowed
    const intlAffiliates = [
      {
        title: 'Bet on World Cup 2026',
        desc: 'Get $100 free bet on your first deposit',
        link: '#',
        cta: 'Claim Bonus',
        badge: '18+',
        icon: '\uD83C\uDFB0'
      },
      {
        title: 'World Cup Predictions',
        desc: 'Turn your predictions into real winnings',
        link: '#',
        cta: 'Start Betting',
        badge: '18+',
        icon: '\uD83D\uDCB0'
      },
      {
        title: 'Live In-Play Betting',
        desc: 'Best odds on live football matches',
        link: '#',
        cta: 'Bet Now',
        badge: '18+',
        icon: '\u26A1'
      }
    ];

    const aff = intlAffiliates[Math.floor(Math.random() * intlAffiliates.length)];
    return this._renderCard(aff, 'intl');
  }

  _renderCard(aff, type) {
    const badge = aff.badge ? `<span class="aff-badge">${aff.badge}</span>` : '';
    const icon = aff.icon ? `<span class="aff-icon">${aff.icon}</span>` : '';
    const disclaimer = type === 'intl'
      ? 'Sponsored &middot; 18+ &middot; Gamble responsibly'
      : 'Tai tro';

    return `
      <div class="aff-card aff-${type}">
        ${badge}
        <div class="aff-header">
          ${icon}
          <div class="aff-title">${aff.title}</div>
        </div>
        <div class="aff-desc">${aff.desc}</div>
        <a href="${aff.link}" target="_blank" rel="noopener sponsored" class="aff-cta">${aff.cta}</a>
        <div class="aff-disclaimer">${disclaimer}</div>
      </div>
    `;
  }
}

// Initialize
const geoAffiliate = new GeoAffiliate();
document.addEventListener('DOMContentLoaded', () => geoAffiliate.detectCountry());
