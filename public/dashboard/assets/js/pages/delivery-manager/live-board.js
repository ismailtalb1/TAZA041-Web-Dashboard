'use strict';

// ── Live Board ─────────────────────────────────
async function loadLiveBoard() {
  const board = document.getElementById('live-board');
  const isAr  = TAZA.Lang.current === 'ar';
  if (!board) return;

  try {
    const res  = await TAZA.Http.get(TAZA.API.DELIVERY.ACTIVE);
    const dels = [...(res?.data?.deliveries ?? [])].sort((a, b) => {
      const aAssigned = a.driver_id || a.driver?.id ? 1 : 0;
      const bAssigned = b.driver_id || b.driver?.id ? 1 : 0;
      return aAssigned - bAssigned || new Date(a.created_at) - new Date(b.created_at);
    });
    _liveMapDeliveries = dels;
    populateDeliveryDriverFilters(dels);
    renderLiveDeliveryMap();

    if (!dels.length) {
      board.innerHTML = `<div class="empty-state" style="padding:20px">
        <div class="empty-icon">🛵</div>
        <div class="empty-title">${isAr?'لا توجد طلبات نشطة حالياً':'No active deliveries'}</div>
      </div>`;
      return;
    }

    const statusVisual = {
      pending:{icon:'fa-user-clock', color:'var(--warning)'},
      assigned:{icon:'fa-user-check', color:'var(--info)'},
      picked_up:{icon:'fa-box', color:'var(--primary)'},
      in_delivery:{icon:'fa-motorcycle', color:'var(--accent)'},
      delivered:{icon:'fa-circle-check', color:'var(--success)'}
    };

    board.innerHTML = dels.map(d => {
      const visual = statusVisual[d.status] ?? {icon:'fa-circle', color:'var(--text-muted)'};
      return `
      <div class="live-board-item">
        <span class="live-board-status" style="--status:${visual.color}"><i class="fa-solid ${visual.icon}"></i></span>
        <div class="live-board-copy">
          <div class="live-board-name">
            ${escapeHtml(d.order?.customer?.name ?? (isAr?'زبون':'Customer'))}
          </div>
          <div class="live-board-address">
            <i class="fa-solid fa-location-dot"></i> ${escapeHtml(d.delivery_address ?? '—')}
          </div>
        </div>
        <div class="live-board-meta">
          <div class="live-board-cost">${TAZA.Utils.formatMoney(d.delivery_cost)}</div>
          <div class="live-board-driver">${escapeHtml(d.driver?.name ?? (isAr?'بدون سائق':'No driver'))}</div>
        </div>
        ${!(d.driver_id || d.driver?.id) ? `
          <button class="btn btn-primary btn-sm"
                  data-action="assign" data-id="${d.id}">
            <i class="fa-solid fa-user-plus"></i>
          </button>` : `<span class="badge badge-success" style="font-size:.65rem">${isAr?'تم التعيين':'Assigned'}</span>`
        }
      </div>`;
    }).join('');

  } catch {
    board.innerHTML = `<div class="empty-state" style="padding:20px">
      <div class="empty-desc">${isAr?'تعذر التحميل':'Failed to load'}</div>
    </div>`;
  }
}

function populateDeliveryDriverFilters(deliveries = []) {
  const isAr = TAZA.Lang.current === 'ar';
  const drivers = new Map();
  document.querySelectorAll('#live-map-driver-filter option[value], #del-driver-filter option[value]').forEach(option => {
    if (option.value) drivers.set(option.value, option.textContent.trim());
  });
  [..._drivers.map(item => item.driver ?? item), ...deliveries.map(d => d.driver).filter(Boolean)].forEach(driver => {
    if (driver?.id) drivers.set(String(driver.id), driver.name ?? `${isAr?'سائق':'Driver'} #${driver.id}`);
  });

  ['live-map-driver-filter', 'del-driver-filter'].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    const firstLabel = id === 'live-map-driver-filter'
      ? (isAr ? 'كل السائقين' : 'All drivers')
      : (isAr ? 'كل السائقين' : 'All drivers');
    select.innerHTML = `<option value="">${firstLabel}</option>` + [...drivers.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], isAr ? 'ar' : 'en'))
      .map(([idValue, name]) => `<option value="${escapeHtml(idValue)}">${escapeHtml(name)}</option>`)
      .join('');
    select.value = [...select.options].some(option => option.value === current) ? current : '';
  });
}

function routeLatLngs(delivery) {
  const geometry = delivery?.route?.geometry;
  if (Array.isArray(geometry) && geometry.length > 1) {
    return geometry
      .filter(point => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
      .map(([lng, lat]) => [Number(lat), Number(lng)]);
  }

  const origin = delivery?.route?.origin;
  const destination = delivery?.route?.destination ?? delivery?.delivery_coordinates;
  if (origin?.latitude != null && origin?.longitude != null && destination?.latitude != null && destination?.longitude != null) {
    return [
      [Number(origin.latitude), Number(origin.longitude)],
      [Number(destination.latitude), Number(destination.longitude)],
    ];
  }
  return [];
}

function ensureLiveDeliveryMap() {
  const container = document.getElementById('delivery-live-map');
  if (!container || typeof L === 'undefined') return null;
  if (!_deliveryLiveMap) {
    _deliveryLiveMap = L.map(container, { zoomControl: true }).setView([35.5317, 35.7901], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(_deliveryLiveMap);
    _deliveryMapLayer = L.layerGroup().addTo(_deliveryLiveMap);
  }
  setTimeout(() => _deliveryLiveMap?.invalidateSize(), 0);
  return _deliveryLiveMap;
}

function renderLiveDeliveryMap() {
  const map = ensureLiveDeliveryMap();
  if (!map || !_deliveryMapLayer) return;
  _deliveryMapLayer.clearLayers();

  const status = document.getElementById('live-map-status-filter')?.value ?? '';
  const driverId = document.getElementById('live-map-driver-filter')?.value ?? '';
  const deliveries = _liveMapDeliveries.filter(delivery => {
    if (status && delivery.status !== status) return false;
    if (driverId && String(delivery.driver_id ?? delivery.driver?.id ?? '') !== driverId) return false;
    return true;
  });
  const bounds = [];
  const isAr = TAZA.Lang.current === 'ar';
  const colors = { pending:'#f59e0b', assigned:'#3b82f6', picked_up:'#eab308', in_delivery:'#8b5cf6', delivered:'#22c55e' };

  const firstOrigin = deliveries.map(d => d.route?.origin).find(origin => origin?.latitude != null && origin?.longitude != null);
  if (firstOrigin) {
    const restaurantPoint = [Number(firstOrigin.latitude), Number(firstOrigin.longitude)];
    L.circleMarker(restaurantPoint, { radius:9, color:'#7f1d1d', weight:3, fillColor:'#ef4444', fillOpacity:1 })
      .bindPopup(`<strong>${isAr?'المطعم':'Restaurant'}</strong>`)
      .addTo(_deliveryMapLayer);
    bounds.push(restaurantPoint);
  }

  deliveries.forEach(delivery => {
    const latLngs = routeLatLngs(delivery);
    if (latLngs.length < 2) return;
    const color = colors[delivery.status] ?? '#3b82f6';
    const isFallback = Boolean(delivery.route?.is_fallback);
    L.polyline(latLngs, {
      color,
      weight:5,
      opacity:.9,
      dashArray:isFallback ? '8 8' : null,
    }).bindPopup(`
      <div class="delivery-route-popup">
        <strong>#${delivery.id} · ${escapeHtml(delivery.order?.customer?.name ?? (isAr?'زبون':'Customer'))}</strong>
        <span>${Number(delivery.distance_meters ?? 0).toLocaleString(isAr?'ar-SY':'en-US')} ${isAr?'م':'m'} · ${Number(delivery.route?.duration_minutes ?? 0)} ${isAr?'دقيقة':'min'}</span>
        <span>${escapeHtml(delivery.driver?.name ?? (isAr?'بدون سائق':'No driver'))}</span>
        <span class="route-quality-badge ${isFallback?'fallback':'road'}">${isFallback?(isAr?'تقدير احتياطي':'Fallback estimate'):(isAr?'مسار طرق فعلي':'Road route')}</span>
      </div>`).addTo(_deliveryMapLayer);

    const destination = latLngs[latLngs.length - 1];
    L.circleMarker(destination, { radius:7, color:'#1e3a8a', weight:2, fillColor:'#2563eb', fillOpacity:1 })
      .bindTooltip(`#${delivery.id}`)
      .addTo(_deliveryMapLayer);
    bounds.push(...latLngs);
  });

  if (bounds.length > 1) map.fitBounds(bounds, { padding:[24,24], maxZoom:15 });
  else if (bounds.length === 1) map.setView(bounds[0], 14);
  else map.setView([35.5317, 35.7901], 13);
}
