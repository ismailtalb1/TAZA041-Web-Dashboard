'use strict';

// ══════════════════════════════════════════════
// [4] Drivers
// ══════════════════════════════════════════════
async function loadDrivers() {
  await loadDriversData();
  renderDriversGrid();
}

async function loadDriversData() {
    try {
      const res  = await TAZA.Http.get(TAZA.API.DELIVERY.DRIVERS);
      const list = res?.data?.all ?? [];

      _drivers = list.map(emp => ({
        driver: emp,
        stats: {
          average_rating:    parseFloat(emp.average_rating ?? 0),
          active_deliveries: emp.active_deliveries ?? 0,
          total_completed:   emp.total_completed   ?? 0,
          total_ratings:     emp.total_ratings     ?? 0,
        }
      }));
      populateDeliveryDriverFilters(_liveMapDeliveries);
    } catch(e) {
      console.error('[TAZA] loadDriversData failed:', e);
      _drivers = [];
    }
  }

function renderDriversGrid() {
  const grid = document.getElementById('drivers-grid');
  const isAr = TAZA.Lang.current === 'ar';

  if (!_drivers.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🏍️</div>
      <div class="empty-title">${isAr?'لا يوجد سائقون مسجلون':'No registered drivers'}</div>
    </div>`;
    return;
  }

  grid.innerHTML = _drivers.map(item => {
    const driver  = item.driver;
    const stats   = item.stats;
    const avgRating = parseFloat(stats?.average_rating ?? 0);
    const filledStars = Math.round(avgRating);

    const ratingColor = avgRating >= 4.5 ? 'var(--success)'
                      : avgRating >= 3.5 ? 'var(--warning)'
                      : 'var(--danger)';

    return `
      <div class="driver-card">
        <div class="driver-identity">
          <div class="avatar avatar-xl" style="background:var(--primary-soft);color:var(--primary);font-size:1.3rem">
            ${driver.avatar
              ? `<img src="${TAZA.Media.url(driver.avatar)}" alt="${escapeHtml(driver.name)}"
                      onerror="this.style.display='none';this.parentElement.textContent='${TAZA.Utils.initials(driver.name)}'">`
              : TAZA.Utils.initials(driver.name)
            }
          </div>
          <div>
            <div class="driver-name">${escapeHtml(driver.name)}</div>
            <div class="badge badge-info" style="font-size:.65rem">${escapeHtml(driver.role_label ?? (isAr?'سائق':'Driver'))}</div>
          </div>
        </div>

        <div class="driver-rating-summary">
          <div class="driver-stars" style="font-size:1.1rem;color:${ratingColor}">
            ${'★'.repeat(filledStars)}${'☆'.repeat(5 - filledStars)}
          </div>
          <div style="text-align:end">
            <div style="font-size:.8rem;font-weight:700;color:${ratingColor}">${avgRating.toFixed(1)} / 5</div>
            <div style="font-size:.66rem;color:var(--text-muted)">${stats?.total_ratings ?? 0} ${isAr?'تقييم':'ratings'}</div>
          </div>
        </div>

        <div class="driver-stats-grid">
          <div class="driver-stat-box">
            <div class="driver-stat-val">${stats?.total_completed ?? 0}</div>
            <div class="driver-stat-lbl">${isAr?'إجمالي التوصيل':'Completed'}</div>
          </div>
          <div class="driver-stat-box">
            <div class="driver-stat-val" style="color:${(stats?.active_deliveries??0)>0?'var(--primary)':'var(--text-muted)'}">
              ${stats?.active_deliveries ?? 0}
            </div>
            <div class="driver-stat-lbl">${isAr?'نشط الآن':'Active Now'}</div>
          </div>
        </div>

        <div class="driver-card-actions">
          <button class="btn btn-outline btn-sm" style="flex:1"
                  onclick="viewDriverRatings(${driver.id},'${escapeHtml(driver.name)}')">
            <i class="fa-solid fa-star-half-stroke"></i>
            ${isAr?'التقييمات':'Ratings'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function viewDriverRatings(driverId, driverName) {
  const isAr = TAZA.Lang.current === 'ar';
  try {
    const res  = await TAZA.Http.get(TAZA.API.DELIVERY.DRIVER_RATINGS(driverId));
    const data = res?.data ?? {};
    const dist = data.summary?.distribution ?? {};

    const distHtml = Object.entries(dist).reverse().map(([star, info]) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:.78rem;color:var(--accent);width:20px">${star}★</span>
        <div class="progress" style="flex:1;height:8px">
          <div class="progress-bar" style="width:${info.percent ?? 0}%;background:var(--accent)"></div>
        </div>
        <span style="font-size:.72rem;color:var(--text-muted);width:28px">${info.count}</span>
      </div>
    `).join('');

    TAZA.Confirm.show(
      `<div>
        <div style="font-weight:700;font-size:.95rem;margin-bottom:8px">
          ${isAr?'تقييمات':'Ratings for'} ${driverName}
        </div>
        <div style="font-size:1.4rem;color:var(--accent);font-weight:700;margin-bottom:6px">
          ⭐ ${(data.summary?.average_rating ?? 0).toFixed(1)} / 5
        </div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">
          ${data.summary?.total_ratings ?? 0} ${isAr?'تقييم':'total ratings'}
        </div>
        ${distHtml}
      </div>`,
      () => {},
      { btnText: isAr ? 'إغلاق' : 'Close', danger: false }
    );
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}
