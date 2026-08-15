'use strict';

// ══════════════════════════════════════════════
// [1] Overview
// ══════════════════════════════════════════════
async function loadOverview() {
  try {
    const [meRes, statsRes] = await Promise.all([
      TAZA.Http.get(TAZA.API.AUTH.ME),
      TAZA.Http.get(TAZA.API.ORDERS.NORMAL_STATS),
    ]);

    renderOverviewStats(meRes?.data?.extras ?? {}, statsRes?.data ?? {});
    loadPendingOrders();
    renderHourlyChart(statsRes?.data ?? {});
    renderStatusChart(statsRes?.data ?? {});

  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function renderOverviewStats(extras, stats) {
  const isAr  = TAZA.Lang.current === 'ar';
  const today = stats.today ?? {};
  const grid  = document.getElementById('overview-stats');

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon amber"><i class="fa-solid fa-clock"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr ? 'طلبات معلقة' : 'Pending Orders'}</div>
        <div class="stat-value" style="color:${(today.pending??0)>0?'var(--warning)':'var(--success)'}">
          ${today.pending ?? 0}
        </div>
        <div class="stat-change ${(today.pending??0)>0?'down':'up'}">
          <i class="fa-solid fa-circle-dot"></i>
          ${(today.pending??0)>0 ? (isAr?'تحتاج معالجة':'Needs action') : (isAr?'لا شيء معلق':'All clear')}
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue"><i class="fa-solid fa-bags-shopping"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr ? 'طلبات اليوم' : 'Today\'s Orders'}</div>
        <div class="stat-value">${today.total ?? 0}</div>
        <div class="stat-change neutral"><i class="fa-solid fa-calendar"></i> ${isAr?'هذا اليوم':'Today'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green"><i class="fa-solid fa-circle-check"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr ? 'مكتملة اليوم' : 'Completed Today'}</div>
        <div class="stat-value">${today.completed ?? 0}</div>
        <div class="stat-change up"><i class="fa-solid fa-arrow-up"></i> ${isAr?'مكتملة':'Done'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green"><i class="fa-solid fa-sack-dollar"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr ? 'إيرادات اليوم' : 'Today Revenue'}</div>
        <div class="stat-value" style="font-size:1.1rem">${TAZA.Utils.formatMoney(today.revenue ?? 0)}</div>
        <div class="stat-change up"><i class="fa-solid fa-arrow-up"></i> ${isAr?'اليوم':'Today'}</div>
      </div>
    </div>
  `;

  // Update badges
  const pendingCount = today.pending ?? 0;
  ['tab-pending-badge','sb-pending-count'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = pendingCount; el.style.display = pendingCount > 0 ? 'inline-block' : 'none'; }
  });
  const pendingBadge = document.getElementById('pending-count-badge');
  if (pendingBadge) {
    pendingBadge.textContent = pendingCount;
    pendingBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
  }

  renderShiftStatus(today);
}

function renderShiftStatus(today = {}) {
  const panel = document.getElementById('shift-status');
  if (!panel) return;

  const isAr = TAZA.Lang.current === 'ar';
  const pending = Number(today.pending ?? 0);
  const total = Number(today.total ?? 0);
  const completed = Number(today.completed ?? 0);
  const isCritical = pending >= 5;
  const hasAlerts = pending > 0;

  const stateClass = isCritical ? 'is-critical' : hasAlerts ? 'has-alerts' : 'is-clear';
  const icon = isCritical ? 'fa-triangle-exclamation' : hasAlerts ? 'fa-clock' : 'fa-circle-check';
  const title = isCritical
    ? (isAr ? `${pending} طلبات تحتاج تدخلاً سريعاً` : `${pending} orders need quick action`)
    : hasAlerts
      ? (isAr ? `ابدأ بـ ${pending} ${pending === 1 ? 'طلب معلق' : 'طلبات معلقة'}` : `Start with ${pending} pending order${pending === 1 ? '' : 's'}`)
      : (isAr ? 'طابور الطلبات تحت السيطرة' : 'The order queue is under control');
  const description = hasAlerts
    ? (isAr ? 'رتبت لك الطلبات حسب وقت الانتظار؛ عالج الأقدم أولاً.' : 'Orders are arranged by waiting time; handle the oldest first.')
    : total > 0
      ? (isAr ? `اكتمل ${completed} من أصل ${total} طلباً اليوم.` : `${completed} of ${total} orders are complete today.`)
      : (isAr ? 'لا توجد طلبات حالية، راقب الحجوزات القادمة.' : 'No current orders; keep an eye on upcoming reservations.');

  panel.className = `shift-status ${stateClass}`;
  panel.innerHTML = `
    <div class="shift-status-icon"><i class="fa-solid ${icon}"></i></div>
    <div class="shift-status-copy">
      <strong>${title}</strong>
      <span>${description}</span>
    </div>
    <button type="button" class="btn btn-outline btn-sm shift-status-action" onclick="switchTab('${hasAlerts ? 'orders' : 'reservations'}')">
      <i class="fa-solid ${hasAlerts ? 'fa-list-check' : 'fa-calendar-check'}"></i>
      <span>${hasAlerts ? (isAr ? 'فتح طابور العمل' : 'Open work queue') : (isAr ? 'مراجعة الحجوزات' : 'Review reservations')}</span>
    </button>`;
}

async function loadPendingOrders() {
  const container = document.getElementById('pending-orders-list');
  if (!container) return;
  const isAr = TAZA.Lang.current === 'ar';

  try {
    const res   = await TAZA.Http.get(TAZA.API.ORDERS.PENDING);
    const orders = res?.data?.orders ?? [];

    if (!orders.length) {
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">✅</div>
        <div class="empty-title">${isAr ? 'لا توجد طلبات معلقة — رائع!' : 'No pending orders — Great!'}</div>
      </div>`;
      return;
    }

    container.innerHTML = orders.map(o => buildOrderCard(o, true)).join('');

  } catch(e) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">⚠️</div>
      <div class="empty-desc">${isAr?'تعذر تحميل الطلبات':'Failed to load orders'}</div>
    </div>`;
  }
}

function renderHourlyChart(stats) {
  const hourly = stats.hourly_today ?? [];
  TAZA.Charts.dashboard.ordersHourly('chart-hourly', {
    labels: hourly.map(point => point.label),
    values: hourly.map(point => Number(point.value ?? 0)),
  });
}

function renderStatusChart(stats) {
  const isAr = TAZA.Lang.current === 'ar';
  const counts = stats.status_counts ?? {};
  TAZA.Charts.dashboard.orderStatuses('chart-statuses', {
    labels: [
      isAr ? 'معلق' : 'Pending',
      isAr ? 'مؤكد' : 'Confirmed',
      isAr ? 'قيد التجهيز' : 'Preparing',
      isAr ? 'مكتمل' : 'Completed',
      isAr ? 'ملغى' : 'Cancelled',
    ],
    values: ['pending', 'confirmed', 'ready', 'completed', 'cancelled']
      .map(status => Number(counts[status] ?? 0)),
  });
}
