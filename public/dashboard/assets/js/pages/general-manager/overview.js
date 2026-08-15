'use strict';

// ══════════════════════════════════════════════
// [1] Overview
// ══════════════════════════════════════════════
async function loadOverview() {
  try {
    const [meRes, statsRes] = await Promise.all([
      TAZA.Http.get(TAZA.API.AUTH.ME),
      TAZA.Http.get(TAZA.API.ADMIN_ORDERS.STATS),
    ]);

    const extras = meRes?.data?.extras ?? {};
    const stats  = statsRes?.data ?? {};

    renderOverviewStats(extras, stats);
    loadRevenueChart(stats);
    loadOrderTypesChart(stats);
    loadTopProductsChart();
    loadPaymentMethodsChart();

    // تحديث الـ badge للطلبات المعلقة في الـ sidebar
    const pending = extras.pending_orders ?? 0;
    document.querySelectorAll('.notif-pending').forEach(el => {
      el.textContent = pending;
      el.style.display = pending > 0 ? 'inline-block' : 'none';
    });

    // تحديث الـ badge للتقارير
    const reportsBadge = extras.pending_reports ?? 0;
    document.querySelectorAll('.notif-reports').forEach(el => {
      el.textContent = reportsBadge;
      el.style.display = reportsBadge > 0 ? 'inline-block' : 'none';
    });

  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function renderOverviewStats(extras, stats) {
  const isAr = TAZA.Lang.current === 'ar';
  const grid  = document.getElementById('overview-stats');
  const todayRevenue = stats.revenue?.today ?? 0;

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon blue"><i class="fa-solid fa-users-gear"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr ? 'الموظفون النشطون' : 'Active Employees'}</div>
        <div class="stat-value">${extras.total_employees ?? '—'}</div>
        <div class="stat-change neutral"><i class="fa-solid fa-circle-info"></i> ${isAr ? 'إجمالي الموظفين' : 'Total staff'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green"><i class="fa-solid fa-users"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr ? 'الزبائن المسجلون' : 'Registered Customers'}</div>
        <div class="stat-value">${extras.total_customers ?? '—'}</div>
        <div class="stat-change up"><i class="fa-solid fa-arrow-up"></i> ${isAr ? 'نشطون' : 'Active'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber"><i class="fa-solid fa-clock"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr ? 'طلبات معلقة' : 'Pending Orders'}</div>
        <div class="stat-value" style="color:${(extras.pending_orders??0)>0?'var(--warning)':'var(--text-primary)'}">${extras.pending_orders ?? 0}</div>
        <div class="stat-change ${(extras.pending_orders??0)>0?'down':'neutral'}">
          <i class="fa-solid fa-circle-dot"></i> ${isAr ? 'تحتاج معالجة' : 'Needs attention'}
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green"><i class="fa-solid fa-money-bill-wave"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr ? 'إيرادات اليوم' : 'Today\'s Revenue'}</div>
        <div class="stat-value" style="font-size:1.2rem">${TAZA.Utils.formatMoney(todayRevenue)}</div>
        <div class="stat-change up"><i class="fa-solid fa-arrow-up"></i> ${isAr ? 'هذا اليوم' : 'Today'}</div>
      </div>
    </div>
  `;

  renderOverviewPriority(extras);
}

function renderOverviewPriority(extras = {}) {
  const panel   = document.getElementById('overview-priority');
  if (!panel) return;

  const isAr          = TAZA.Lang.current === 'ar';
  const pendingOrders = Number(extras.pending_orders ?? 0);
  const pendingReports= Number(extras.pending_reports ?? 0);
  const hasAlerts     = pendingOrders > 0 || pendingReports > 0;

  panel.className = `attention-panel ${hasAlerts ? 'has-alerts' : 'is-clear'}`;
  panel.innerHTML = `
    <div class="attention-icon">
      <i class="fa-solid ${hasAlerts ? 'fa-bolt' : 'fa-circle-check'}"></i>
    </div>
    <div class="attention-copy">
      <strong>${hasAlerts
        ? (isAr ? 'هناك عناصر تحتاج مراجعتك' : 'Items need your review')
        : (isAr ? 'العمل يسير بصورة طبيعية' : 'Operations are running normally')}</strong>
      <span>${hasAlerts
        ? (isAr ? 'ابدأ بالعناصر المعلقة للحفاظ على انسيابية العمل.' : 'Start with pending items to keep operations moving.')
        : (isAr ? 'لا توجد طلبات أو تقارير معلقة حالياً.' : 'There are no pending orders or reports right now.')}</span>
    </div>
    ${hasAlerts ? `<div class="attention-actions">
      ${pendingOrders > 0 ? `<button type="button" class="attention-action" onclick="switchTab('orders')">
        <i class="fa-solid fa-bag-shopping"></i> ${pendingOrders} ${isAr ? 'طلبات' : 'orders'}
      </button>` : ''}
      ${pendingReports > 0 ? `<button type="button" class="attention-action" onclick="switchTab('reports')">
        <i class="fa-solid fa-file-lines"></i> ${pendingReports} ${isAr ? 'تقارير' : 'reports'}
      </button>` : ''}
    </div>` : ''}
  `;
}

async function loadRevenueChart(cachedStats = null) {
  try {
    const period = Number(document.getElementById('revenue-period')?.value ?? 7);
    const stats = cachedStats?.period_days === period
      ? cachedStats
      : (await TAZA.Http.get(TAZA.API.ADMIN_ORDERS.STATS, { period }))?.data ?? {};
    const trend = stats.revenue_trend ?? [];
    TAZA.Charts.dashboard.revenueWeekly('chart-revenue', {
      labels: trend.map(point => TAZA.Charts.dateLabel(point.date, { day: 'numeric', month: 'short' })),
      revenues: trend.map(point => Number(point.revenue ?? 0)),
    });
  } catch {
    TAZA.Charts.dashboard.revenueWeekly('chart-revenue', null);
  }
}

function loadOrderTypesChart(stats = {}) {
  const isAr = TAZA.Lang.current === 'ar';
  const values = [stats.by_type?.normal, stats.by_type?.delivery, stats.by_type?.reservation]
    .map(value => Number(value ?? 0));
  TAZA.Charts.dashboard.ordersByType('chart-order-types', {
    labels: [isAr ? 'عادي' : 'Normal', isAr ? 'توصيل' : 'Delivery', isAr ? 'حجز' : 'Reservation'],
    values,
    total: values.reduce((sum, value) => sum + value, 0),
  });
}

async function loadTopProductsChart() {
  try {
    const res = await TAZA.Http.get(TAZA.API.PRODUCTS.STATS);
    const products = res?.data?.most_ordered ?? [];
    TAZA.Charts.dashboard.topProducts('chart-top-products', {
      labels: products.map(product => product.name),
      values: products.map(product => Number(product.ordered_quantity ?? product.order_count ?? 0)),
    });
  } catch {
    TAZA.Charts.dashboard.topProducts('chart-top-products', null);
  }
}

async function loadPaymentMethodsChart() {
  try {
    const res = await TAZA.Http.get(TAZA.API.FINANCE.PAYMENT_STATS);
    const methods = res?.data?.by_method ?? [];
    TAZA.Charts.dashboard.paymentMethods('chart-payments', {
      labels: methods.map(method => method.label),
      values: methods.map(method => Number(method.count ?? 0)),
    });
  } catch {
    TAZA.Charts.dashboard.paymentMethods('chart-payments', null);
  }
}
