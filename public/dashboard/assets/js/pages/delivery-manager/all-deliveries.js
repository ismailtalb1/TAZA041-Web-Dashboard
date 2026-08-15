'use strict';

// ══════════════════════════════════════════════
// [3] All Deliveries
// ══════════════════════════════════════════════
async function loadAllDeliveries() {
  const status = document.getElementById('del-status-filter')?.value ?? '';
  const date   = document.getElementById('del-date-filter')?.value   ?? '';
  const driver = document.getElementById('del-driver-filter')?.value ?? '';
  const routeQuality = document.getElementById('del-route-filter')?.value ?? '';
  const minDistance = document.getElementById('del-min-distance-filter')?.value ?? '';
  const maxDistance = document.getElementById('del-max-distance-filter')?.value ?? '';
  const tbody  = document.getElementById('all-deliveries-tbody');
  const isAr   = TAZA.Lang.current === 'ar';

  try {
    const params = {};
    if (status) params.status = status;
    if (date)   params.date   = date;
    if (driver) params.driver_id = driver;
    if (routeQuality) params.route_quality = routeQuality;
    if (minDistance !== '') params.min_distance_km = minDistance;
    if (maxDistance !== '') params.max_distance_km = maxDistance;

    const res         = await TAZA.Http.get(TAZA.API.DELIVERY.LIST, params);
    _allDeliveries    = res?.data?.deliveries ?? [];
    populateDeliveryDriverFilters(_allDeliveries);

    if (!_allDeliveries.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
        <div class="empty-icon">🛵</div>
        <div class="empty-title">${isAr?'لا توجد طلبات':'No deliveries'}</div>
      </div></td></tr>`;
      return;
    }

    tbody.innerHTML = _allDeliveries.map(d => `
      <tr>
        <td style="font-weight:700;color:var(--primary)">#${d.id}</td>
        <td style="font-size:.82rem">${escapeHtml(d.order?.customer?.name ?? (isAr?'زبون':'Guest'))}</td>
        <td style="font-size:.75rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          <i class="fa-solid fa-location-dot"></i> ${escapeHtml(d.delivery_address ?? '—')}
        </td>
        <td style="font-size:.8rem">
          ${d.distance_meters ? (d.distance_meters/1000).toFixed(1)+' كم' : '—'}
          ${d.route ? `<div class="route-quality-badge ${d.route.is_fallback?'fallback':'road'}">${d.route.is_fallback?(isAr?'احتياطي':'Fallback'):(isAr?'فعلي':'Road')}</div>` : ''}
        </td>
        <td><span class="cost-badge">${TAZA.Utils.formatMoney(d.delivery_cost ?? 0)}</span></td>
        <td style="font-size:.82rem">
          ${d.driver?.name
            ? `<div style="display:flex;align-items:center;gap:6px">
                <div class="avatar avatar-sm">${TAZA.Utils.initials(d.driver.name)}</div>
                ${escapeHtml(d.driver.name)}
               </div>`
            : `<span style="color:var(--warning);font-size:.75rem">${isAr?'غير مُعيَّن':'Unassigned'}</span>`
          }
        </td>
        <td>${TAZA.Utils.statusBadge(d.status)}</td>
        <td>
          ${d.driver_rating
            ? `<span style="color:var(--accent)">
                ${'★'.repeat(Math.round(d.driver_rating))} ${d.driver_rating.toFixed(1)}
               </span>`
            : '<span style="color:var(--text-muted)">—</span>'
          }
        </td>
        <td>
          <div style="display:flex;gap:5px">
            ${d.status === 'pending' && !d.driver_id ? `
              <button class="btn btn-primary btn-sm"
                      data-action="assign" data-id="${d.id}">
                <i class="fa-solid fa-user-plus"></i>
              </button>` : ''}
            <button class="btn btn-ghost btn-sm"
                    data-action="notify-customer" data-id="${d.id}">
              <i class="fa-solid fa-bell"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}
