'use strict';

// ═══════════════════════════════════════════
// [3] History
// ═══════════════════════════════════════════
async function loadHistory() {
  const status = document.getElementById('history-status-filter')?.value ?? '';
  const date   = document.getElementById('history-date-filter')?.value   ?? '';
  const routeQuality = document.getElementById('history-route-filter')?.value ?? '';
  const isAr   = TAZA.Lang.current === 'ar';

  try {
    const params = {};
    if (status) params.status = status;
    if (date)   params.date   = date;
    if (routeQuality) params.route_quality = routeQuality;

    const res         = await TAZA.Http.get(TAZA.API.DELIVERY.LIST, params);
    _historyDeliveries = res?.data?.deliveries ?? [];

    renderHistoryStats(_historyDeliveries);
    renderHistoryList(_historyDeliveries);
  } catch(e) { TAZA.Toast.apiError(e); }
}

function renderHistoryStats(deliveries) {
  const isAr     = TAZA.Lang.current === 'ar';
  const row      = document.getElementById('history-stats');
  const delivered= deliveries.filter(d => d.status === 'delivered').length;
  const totalCost= deliveries.reduce((s,d) => s + (d.delivery_cost ?? 0), 0);
  const avgRating= deliveries.filter(d => d.driver_rating).length > 0
    ? (deliveries.reduce((s,d) => s + (d.driver_rating ?? 0), 0) / deliveries.filter(d => d.driver_rating).length).toFixed(1)
    : '—';
  const totalKm  = deliveries.reduce((s,d) => s + (d.distance_meters ?? 0), 0);

  row.innerHTML = `
    <div class="stat-card" style="padding:14px">
      <div style="font-size:.72rem;color:var(--text-muted)">${isAr?'إجمالي التوصيلات':'Total'}</div>
      <div style="font-size:1.4rem;font-weight:700">${deliveries.length}</div>
    </div>
    <div class="stat-card" style="padding:14px">
      <div style="font-size:.72rem;color:var(--text-muted)">${isAr?'مكتملة':'Completed'}</div>
      <div style="font-size:1.4rem;font-weight:700;color:var(--success)">${delivered}</div>
    </div>
    <div class="stat-card" style="padding:14px">
      <div style="font-size:.72rem;color:var(--text-muted)">${isAr?'إجمالي المسافة':'Total Distance'}</div>
      <div style="font-size:1.1rem;font-weight:700">${(totalKm/1000).toFixed(1)} ${isAr?'كم':'km'}</div>
    </div>
    <div class="stat-card" style="padding:14px">
      <div style="font-size:.72rem;color:var(--text-muted)">${isAr?'متوسط التقييم':'Avg Rating'}</div>
      <div style="font-size:1.2rem;font-weight:700;color:var(--accent)">${avgRating}</div>
    </div>
  `;
}

function renderHistoryList(deliveries) {
  const list = document.getElementById('history-list');
  const isAr = TAZA.Lang.current === 'ar';

  if (!deliveries.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-title">${isAr?'لا توجد توصيلات':'No deliveries found'}</div>
    </div>`;
    return;
  }

  const statusColors = { delivered:'var(--success)', cancelled:'var(--danger)' };

  list.innerHTML = deliveries.map(d => {
    const rating    = d.driver_rating;
    const statusColor = statusColors[d.status] ?? 'var(--text-muted)';

    return `
      <div class="history-item">
        <div class="history-icon"
             style="background:${d.status==='delivered'?'var(--success-light)':'var(--danger-light)'}">
          ${d.status === 'delivered' ? '✅' : '❌'}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.875rem">
            ${isAr?'طلب رقم':'Order'} #${d.id}
            <span style="font-size:.7rem;color:${statusColor};font-weight:600;margin-right:8px">
              ${d.status === 'delivered' ? (isAr?'تم التسليم':'Delivered') : (isAr?'ملغى':'Cancelled')}
            </span>
          </div>
          <div style="font-size:.75rem;color:var(--text-muted)">
            ${escapeHtml(d.order?.customer?.name ?? (isAr?'زبون':'Customer'))}
            &nbsp;·&nbsp;
            ${d.distance_meters ? (d.distance_meters/1000).toFixed(1)+' كم' : '—'}
            &nbsp;·&nbsp;
            ${TAZA.Utils.timeAgo(d.created_at)}
          </div>
        </div>
        <div style="text-align:left;flex-shrink:0">
          <div style="font-weight:700;color:var(--primary);font-size:.9rem">${TAZA.Utils.formatMoney(d.delivery_cost)}</div>
          ${rating ? `<div style="color:var(--accent);font-size:.78rem">⭐ ${rating.toFixed(1)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}
