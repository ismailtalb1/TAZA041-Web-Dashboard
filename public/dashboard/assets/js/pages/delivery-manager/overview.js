'use strict';

// ══════════════════════════════════════════════
// [1] Overview
// ══════════════════════════════════════════════
async function loadOverview() {
  try {
    const [statsRes] = await Promise.all([
      TAZA.Http.get(TAZA.API.DELIVERY.STATS),
    ]);
    renderOverviewStats(statsRes?.data ?? {});
    loadActiveDeliveries();
    loadLiveBoard();
    const stats = statsRes?.data ?? {};
    const counts = stats.status_counts ?? {};
    const isAr = TAZA.Lang.current === 'ar';
    TAZA.Charts.dashboard.deliveryStatuses('chart-delivery-status', {
      labels: [isAr?'بانتظار السائق':'Pending', isAr?'في الطريق':'In Delivery', isAr?'تم اليوم':'Delivered Today'],
      values: ['pending', 'in_delivery', 'delivered']
        .map(status => Number(counts[status] ?? 0)),
    });
    renderDriverRatingsChart(stats.drivers ?? []);
    const weekly = stats.weekly_trend ?? [];
    TAZA.Charts.createLine('chart-weekly-del', {
      labels: weekly.map(point => TAZA.Charts.dateLabel(point.date, { weekday: 'short', day: 'numeric' })),
      datasets: [
        { label: isAr ? 'طلبات التوصيل' : 'Delivery Orders', data: weekly.map(point => Number(point.total ?? 0)) },
        { label: isAr ? 'تم تسليمها' : 'Delivered', data: weekly.map(point => Number(point.delivered ?? 0)), color: TAZA.Charts.Colors.success },
      ],
    });
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function renderOverviewStats(data) {
  const isAr = TAZA.Lang.current === 'ar';
  const ov   = data.overview ?? {};
  const grid = document.getElementById('overview-stats');

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon amber"><i class="fa-solid fa-clock"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'بانتظار سائق':'Awaiting Driver'}</div>
        <div class="stat-value" style="color:${(ov.pending_assignment??0)>0?'var(--warning)':'var(--success)'}">
          ${ov.pending_assignment ?? 0}
        </div>
        <div class="stat-change ${(ov.pending_assignment??0)>0?'down':'up'}">
          <i class="fa-solid fa-circle-dot"></i>
          ${(ov.pending_assignment??0)>0 ? (isAr?'تحتاج تعيين':'Need assignment') : (isAr?'لا شيء معلق':'All assigned')}
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon purple"><i class="fa-solid fa-motorcycle"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'جاري التوصيل الآن':'Currently Delivering'}</div>
        <div class="stat-value">${ov.currently_delivering ?? 0}</div>
        <div class="stat-change neutral"><i class="fa-solid fa-rotate"></i> ${isAr?'نشط':'Active'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green"><i class="fa-solid fa-circle-check"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'تم التسليم اليوم':'Delivered Today'}</div>
        <div class="stat-value">${ov.delivered_today ?? 0}</div>
        <div class="stat-change up"><i class="fa-solid fa-arrow-up"></i> ${isAr?'اليوم':'Today'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber"><i class="fa-solid fa-star"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'متوسط التقييم':'Avg. Rating'}</div>
        <div class="stat-value">${(ov.average_rating ?? 0).toFixed(1)} ⭐</div>
        <div class="stat-change up"><i class="fa-solid fa-star"></i> ${isAr?'من 5':'out of 5'}</div>
      </div>
    </div>
  `;

  // Badge
  const pending = ov.pending_assignment ?? 0;
  const activeEl = document.getElementById('sb-active-count');
  if (activeEl) { activeEl.textContent = pending; activeEl.style.display = pending > 0 ? 'inline-block' : 'none'; }
  const liveBadge = document.getElementById('live-count-badge');
  if (liveBadge) { liveBadge.textContent = pending; liveBadge.style.display = pending > 0 ? 'inline-block' : 'none'; }

  // Unassigned banner
  const banner = document.getElementById('unassigned-banner');
  const bannerText = document.getElementById('unassigned-text');
  if (banner) banner.style.display = pending > 0 ? 'block' : 'none';
  if (bannerText && pending > 0) {
    bannerText.textContent = isAr
      ? `${pending} طلب بانتظار تعيين سائق`
      : `${pending} order(s) need driver assignment`;
  }

  renderDispatchStatus(ov);
}

function renderDispatchStatus(overview = {}) {
  const panel = document.getElementById('dispatch-status');
  if (!panel) return;
  const isAr = TAZA.Lang.current === 'ar';
  const pending = Number(overview.pending_assignment ?? 0);
  const delivering = Number(overview.currently_delivering ?? 0);
  const delivered = Number(overview.delivered_today ?? 0);
  const critical = pending >= 4;
  const state = critical ? 'is-critical' : pending > 0 ? 'has-alerts' : 'is-clear';
  const icon = critical ? 'fa-triangle-exclamation' : pending > 0 ? 'fa-user-clock' : 'fa-route';
  const title = critical
    ? (isAr ? `${pending} طلبات بلا سائق تحتاج تدخلاً سريعاً` : `${pending} unassigned orders need immediate action`)
    : pending > 0
      ? (isAr ? `الأولوية الآن: إسناد ${pending} ${pending === 1 ? 'طلب' : 'طلبات'}` : `Current priority: assign ${pending} order${pending === 1 ? '' : 's'}`)
      : delivering > 0
        ? (isAr ? `${delivering} ${delivering === 1 ? 'طلب في الطريق' : 'طلبات في الطريق'} الآن` : `${delivering} deliver${delivering === 1 ? 'y is' : 'ies are'} en route`)
        : (isAr ? 'حركة التوصيل هادئة وتحت السيطرة' : 'Delivery flow is calm and under control');
  const description = pending > 0
    ? (isAr ? 'رتبنا الطلبات غير المسندة أولاً لتقليل وقت انتظار الزبون.' : 'Unassigned orders are shown first to reduce customer wait time.')
    : (isAr ? `تم تسليم ${delivered} طلباً اليوم؛ تابع الحركة الحية لأي تحديث.` : `${delivered} delivered today; watch the live flow for updates.`);

  panel.className = `dispatch-status ${state}`;
  panel.innerHTML = `
    <div class="dispatch-status-icon"><i class="fa-solid ${icon}"></i></div>
    <div class="dispatch-status-copy"><strong>${title}</strong><span>${description}</span></div>
    <button type="button" class="btn btn-outline btn-sm dispatch-status-action" onclick="switchTab('${pending > 0 || delivering > 0 ? 'live' : 'drivers'}')">
      <i class="fa-solid ${pending > 0 ? 'fa-user-plus' : delivering > 0 ? 'fa-tower-broadcast' : 'fa-motorcycle'}"></i>
      <span>${pending > 0 ? (isAr ? 'فتح طابور الإسناد' : 'Open assignment queue') : delivering > 0 ? (isAr ? 'متابعة الطلبات' : 'Track deliveries') : (isAr ? 'مراجعة السائقين' : 'Review drivers')}</span>
    </button>`;
}

function renderDriverRatingsChart(drivers) {
  if (drivers.length) {
    TAZA.Charts.dashboard.driverRatings('chart-driver-ratings', {
      names:   drivers.map(d => d.name?.split(' ')[0] ?? 'سائق'),
      ratings: drivers.map(d => Number(d.average_rating ?? 0)),
    });
  } else {
    TAZA.Charts.dashboard.driverRatings('chart-driver-ratings', null);
  }
}
