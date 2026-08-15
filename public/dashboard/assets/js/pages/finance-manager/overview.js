'use strict';

// ═══════════════════════════════════════════
// [1] Overview
// ═══════════════════════════════════════════
async function loadOverview() {
  try {
    const [statsRes, accsRes] = await Promise.all([
      TAZA.Http.get(TAZA.API.FINANCE.PAYMENT_STATS),
      TAZA.Http.get(TAZA.API.FINANCE.ACCOUNTS),
    ]);
    _finStats  = statsRes?.data ?? {};
    _accounts  = accsRes?.data?.accounts ?? [];

    renderHeroRevenue(_finStats);
    renderOverviewStats(_finStats, accsRes?.data ?? {});
    renderOverviewCharts(_finStats);
    renderAccountsQuickGrid(_accounts);
    checkNearCapacityAlert(accsRes?.data ?? {});
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function renderHeroRevenue(stats) {
  const rev = stats.revenue ?? {};
  const isAr = TAZA.Lang.current === 'ar';

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = TAZA.Utils.formatMoney(val ?? 0);
  };
  setEl('rev-today', rev.today);
  setEl('rev-week',  rev.this_week);
  setEl('rev-all',   rev.all_time);

  // Default hero = this_month
  const heroEl = document.getElementById('hero-revenue');
  if (heroEl) heroEl.textContent = TAZA.Utils.formatMoney(rev.this_month ?? 0);
}

function updateHeroRevenue(period) {
  const rev    = _finStats.revenue ?? {};
  const heroEl = document.getElementById('hero-revenue');
  const lblEl  = document.getElementById('hero-period-label');
  const isAr   = TAZA.Lang.current === 'ar';

  const vals = {
    today:      { val: rev.today,      ar: 'هذا اليوم',    en: 'Today'      },
    this_week:  { val: rev.this_week,  ar: 'هذا الأسبوع', en: 'This Week'  },
    this_month: { val: rev.this_month, ar: 'هذا الشهر',   en: 'This Month' },
  };
  const chosen = vals[period] ?? vals.this_month;
  if (heroEl) heroEl.textContent = TAZA.Utils.formatMoney(chosen.val ?? 0);
  if (lblEl)  lblEl.textContent  = isAr ? chosen.ar : chosen.en;
}

function renderOverviewStats(stats, accsData) {
  const isAr   = TAZA.Lang.current === 'ar';
  const rev    = stats.revenue ?? {};
  const grid   = document.getElementById('overview-stats');
  const totalBal = accsData.stats?.total_balance ?? accsData.accounts?.reduce((s,a) => s+(a.current_balance??0), 0) ?? 0;

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon green"><i class="fa-solid fa-money-bill-wave"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'إيرادات اليوم':'Today\'s Revenue'}</div>
        <div class="stat-value" style="font-size:1.2rem">${TAZA.Utils.formatMoney(rev.today)}</div>
        <div class="stat-change up"><i class="fa-solid fa-arrow-up"></i> ${isAr?'اليوم':'Today'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue"><i class="fa-solid fa-chart-bar"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'إيرادات الشهر':'Monthly Revenue'}</div>
        <div class="stat-value" style="font-size:1.2rem">${TAZA.Utils.formatMoney(rev.this_month)}</div>
        <div class="stat-change up"><i class="fa-solid fa-calendar"></i> ${isAr?'هذا الشهر':'This month'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber"><i class="fa-solid fa-landmark"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'إجمالي الأرصدة':'Total Balances'}</div>
        <div class="stat-value" style="font-size:1.1rem">${TAZA.Utils.formatMoney(totalBal)}</div>
        <div class="stat-change neutral"><i class="fa-solid fa-circle-info"></i>
          ${accsData.stats?.active_accounts ?? _accounts.length} ${isAr?'حساب':'accounts'}
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon ${(accsData.stats?.near_capacity ?? 0)>0 ? 'red' : 'green'}">
        <i class="fa-solid ${(accsData.stats?.near_capacity ?? 0)>0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
      </div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'حسابات قريبة من الامتلاء':'Near Capacity'}</div>
        <div class="stat-value" style="color:${(accsData.stats?.near_capacity ?? 0)>0?'var(--warning)':'var(--success)'}">
          ${accsData.stats?.near_capacity ?? 0}
        </div>
        <div class="stat-change ${(accsData.stats?.near_capacity ?? 0)>0?'down':'up'}">
          <i class="fa-solid fa-circle-dot"></i>
          ${(accsData.stats?.near_capacity ?? 0)>0
            ? (isAr?'تحتاج مراجعة':'Needs review')
            : (isAr?'كل شيء طبيعي':'All good')}
        </div>
      </div>
    </div>
  `;

  renderFinanceStatus(accsData, stats);
}

function renderFinanceStatus(accsData = {}, stats = {}) {
  const panel = document.getElementById('finance-status');
  if (!panel) return;
  const isAr = TAZA.Lang.current === 'ar';
  const near = Number(accsData.stats?.near_capacity ?? 0);
  const failed = Number(stats.failed ?? stats.payments?.failed ?? 0);
  const needsWork = near > 0 || failed > 0;
  const title = near > 0 ? (isAr ? `${near} ${near === 1 ? 'حساب قريب' : 'حسابات قريبة'} من الحد الأعلى` : `${near} account${near === 1 ? '' : 's'} near capacity`) : failed > 0 ? (isAr ? `${failed} معاملات فاشلة تحتاج مراجعة` : `${failed} failed transactions need review`) : (isAr ? 'الوضع المالي مستقر' : 'Financial status is stable');
  const desc = near > 0 ? (isAr ? 'راجع الأرصدة قبل استقبال عمليات دفع جديدة.' : 'Review balances before receiving new payments.') : (isAr ? 'لا توجد تنبيهات حرجة؛ تابع المعاملات والتقارير الدورية.' : 'No critical alerts; continue monitoring transactions and reports.');
  panel.className = `finance-status ${needsWork ? 'has-alerts' : 'is-clear'}`;
  panel.innerHTML = `<div class="finance-status-icon"><i class="fa-solid ${near > 0 ? 'fa-triangle-exclamation' : failed > 0 ? 'fa-receipt' : 'fa-circle-check'}"></i></div><div class="finance-status-copy"><strong>${title}</strong><span>${desc}</span></div><button class="btn btn-outline btn-sm" onclick="switchTab('${near > 0 ? 'accounts' : 'transactions'}')"><i class="fa-solid fa-arrow-left-long"></i>${isAr?'فتح المراجعة':'Open review'}</button>`;
}

function renderOverviewCharts(stats) {
  const monthly = stats.monthly_revenue ?? [];
  TAZA.Charts.dashboard.monthlyRevenue('chart-monthly-rev', {
    labels: monthly.map(point => TAZA.Charts.dateLabel(point.month, { month: 'short', year: 'numeric' })),
    values: monthly.map(point => Number(point.amount ?? 0)),
  });
  TAZA.Charts.dashboard.paymentMethods('chart-payment-methods',
    stats.by_method ? {
      labels: Object.values(stats.by_method).map(m => m.label),
      values: Object.values(stats.by_method).map(m => m.count),
    } : null
  );
}

function renderAccountsQuickGrid(accounts) {
  const grid = document.getElementById('accounts-quick-grid');
  if (!accounts.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🏦</div>
      <div class="empty-title">لا توجد حسابات</div>
    </div>`;
    return;
  }
  grid.innerHTML = accounts.slice(0, 4).map(a => buildAccountCard(a, true)).join('');
}

function checkNearCapacityAlert(accsData) {
  const near = accsData.near_capacity_alert ?? [];
  ['near-cap-badge','sb-near-capacity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = near.length; el.style.display = near.length > 0 ? 'inline-block' : 'none'; }
  });
}
