'use strict';

// ══════════════════════════════════════════════
// [6] Loyalty
// ══════════════════════════════════════════════
async function loadLoyalty() {
  const isAr = TAZA.Lang.current === 'ar';
  try {
    const res = await TAZA.Http.get(TAZA.API.LOYALTY.STATS);
    const s   = res?.data ?? {};

    renderLoyaltyMultipliers(s.tier_multipliers ?? {});

    // Stats
    const grid = document.getElementById('loyalty-stats-grid');
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon blue"><i class="fa-solid fa-users"></i></div>
        <div class="stat-content">
          <div class="stat-label">${isAr?'حسابات الولاء':'Loyalty Accounts'}</div>
          <div class="stat-value">${s.overview?.total_active_accounts ?? 0}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon amber"><i class="fa-solid fa-star"></i></div>
        <div class="stat-content">
          <div class="stat-label">${isAr?'النقاط في النظام':'Points in System'}</div>
          <div class="stat-value">${s.overview?.total_points_in_system?.toLocaleString('ar-SY') ?? 0}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green"><i class="fa-solid fa-arrow-up"></i></div>
        <div class="stat-content">
          <div class="stat-label">${isAr?'نقاط مكتسبة هذا الشهر':'Earned This Month'}</div>
          <div class="stat-value">${s.this_month?.points_earned?.toLocaleString('ar-SY') ?? 0}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon purple"><i class="fa-solid fa-arrow-down"></i></div>
        <div class="stat-content">
          <div class="stat-label">${isAr?'نقاط مُستردَّة':'Redeemed This Month'}</div>
          <div class="stat-value">${s.this_month?.points_redeemed?.toLocaleString('ar-SY') ?? 0}</div>
        </div>
      </div>
    `;

    // Top Customers
    const topList = document.getElementById('top-loyalty-list');
    const tops    = s.top_customers ?? [];
    if (tops.length) {
      const tierEmojis = { bronze:'🥉', silver:'🥈', gold:'🥇', platinum:'💎' };
      topList.innerHTML = tops.map((c, i) => `
        <div class="loyalty-rank-row">
          <div class="loyalty-rank">${i + 1}</div>
          <div>
            <div class="loyalty-name">${escapeHtml(c.customer_name)}</div>
            <div class="loyalty-tier">${tierEmojis[c.tier] ?? ''} ${c.tier?.toUpperCase()}</div>
          </div>
          <div class="loyalty-points">${c.points?.toLocaleString('ar-SY') ?? 0} ${isAr?'نقطة':'pts'}</div>
        </div>
      `).join('');
    } else {
      topList.innerHTML = `<div class="empty-state" style="padding:20px"><div class="empty-icon">🏆</div></div>`;
    }

    // Tiers Chart
    const byTier = s.overview
      ? {
          labels: ['Bronze 🥉','Silver 🥈','Gold 🥇','Platinum 💎'],
          values: [
            (s.tier_distribution?.bronze ?? 0),
            (s.tier_distribution?.silver ?? 0),
            (s.tier_distribution?.gold   ?? 0),
            (s.tier_distribution?.platinum ?? 0),
          ],
        }
      : null;

    TAZA.Charts.createDonut('chart-loyalty-tiers', {
      labels: byTier?.labels ?? ['Bronze','Silver','Gold','Platinum'],
      data:   byTier?.values ?? [0, 0, 0, 0],
    });

  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function renderLoyaltyMultipliers(multipliers = {}) {
  const defaults = { bronze: 1, silver: 1.2, gold: 1.5, platinum: 2 };
  document.querySelectorAll('[data-loyalty-multiplier]').forEach(input => {
    const tier = input.dataset.loyaltyMultiplier;
    const value = Number(multipliers[tier] ?? defaults[tier]);
    input.value = Number.isFinite(value) ? value : defaults[tier];
  });
}

async function saveLoyaltySettings() {
  const isAr = TAZA.Lang.current === 'ar';
  const button = document.getElementById('save-loyalty-settings-btn');
  const multipliers = {};

  for (const input of document.querySelectorAll('[data-loyalty-multiplier]')) {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0.1 || value > 10) {
      input.focus();
      TAZA.Toast.warning(isAr
        ? 'أدخل معاملاً بين 0.1 و10 لكل مستوى'
        : 'Enter a multiplier between 0.1 and 10 for every tier');
      return;
    }
    multipliers[input.dataset.loyaltyMultiplier] = value;
  }

  button.disabled = true;
  button.classList.add('is-loading');
  try {
    const res = await TAZA.Http.put(TAZA.API.LOYALTY.SETTINGS, { multipliers });
    renderLoyaltyMultipliers(res?.data?.tier_multipliers ?? multipliers);
    TAZA.Toast.success(isAr
      ? 'تم حفظ معاملات مستويات الولاء'
      : 'Loyalty tier multipliers saved');
  } catch (e) {
    TAZA.Toast.apiError(e);
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
  }
}
