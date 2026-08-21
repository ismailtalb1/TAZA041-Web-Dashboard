'use strict';

// ═══════════════════════════════════════════
// [1] Overview
// ═══════════════════════════════════════════
function renderOverviewStats() {
  const isAr   = TAZA.Lang.current === 'ar';
  const stats  = _myStats;
  const grid   = document.getElementById('overview-stats');
  const active = _activeDeliveries.length;

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon ${active > 0 ? 'amber' : 'green'}">
        <i class="fa-solid fa-motorcycle"></i>
      </div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'طلبات نشطة':'Active Orders'}</div>
        <div class="stat-value" style="color:${active>0?'var(--warning)':'var(--success)'}">${active}</div>
        <div class="stat-change ${active>0?'down':'up'}">
          <i class="fa-solid fa-circle-dot"></i>
          ${active>0 ? (isAr?'في الطريق':'On the way') : (isAr?'لا يوجد الآن':'None now')}
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green"><i class="fa-solid fa-circle-check"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'مكتملة اليوم':'Completed Today'}</div>
        <div class="stat-value">${stats.today?.delivered ?? 0}</div>
        <div class="stat-change up"><i class="fa-solid fa-arrow-up"></i> ${isAr?'اليوم':'Today'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber"><i class="fa-solid fa-star"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'متوسط تقييمي':'My Rating'}</div>
        <div class="stat-value" style="color:var(--accent)">
          ${(stats.average_rating ?? 0).toFixed(1)} ⭐
        </div>
        <div class="stat-change neutral">
          <i class="fa-solid fa-users"></i>
          ${stats.total_ratings ?? 0} ${isAr?'تقييم':'reviews'}
        </div>
      </div>
    </div>
  `;

  // Update badges
  ['active-badge','sb-active-count','active-count-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = active; el.style.display = active > 0 ? 'inline-block' : 'none'; }
  });
  renderDriverPriority();
}

function renderDriverPriority() {
  const panel = document.getElementById('driver-priority');
  if (!panel) return;
  const isAr = TAZA.Lang.current === 'ar';
  const current = _activeDeliveries[0];
  if (!current) {
    panel.className = 'driver-priority is-clear';
    panel.innerHTML = `<div class="driver-priority-icon"><i class="fa-solid fa-circle-check"></i></div><div class="driver-priority-copy"><strong>${isAr?'لا توجد مهمة معلّقة الآن':'No pending job right now'}</strong><span>${isAr?'أنت مطّلع على جميع الرحلات المسندة إليك.':'You are up to date with all assigned deliveries.'}</span></div><button class="btn btn-outline btn-sm" onclick="switchTab('history')"><i class="fa-solid fa-clock-rotate-left"></i>${isAr?'عرض السجل':'View history'}</button>`;
    return;
  }
  const status = current.status ?? 'assigned';
  const enroute = ['assigned','picked_up','in_delivery'].includes(status);
  const label = isAr?'الطلب في الطريق إلى الزبون':'Order is on the way to the customer';
  panel.className = `driver-priority ${enroute?'is-enroute':'has-job'}`;
  panel.innerHTML = `<div class="driver-priority-icon"><i class="fa-solid ${enroute?'fa-route':'fa-box'}"></i></div><div class="driver-priority-copy"><strong>${label}</strong><span>${isAr?`المهمة #${current.id} هي أولويتك الحالية.`:`Job #${current.id} is your current priority.`}</span></div><button class="btn btn-primary btn-sm" onclick="switchTab('active')"><i class="fa-solid fa-arrow-left-long"></i>${isAr?'فتح المهمة':'Open job'}</button>`;
}

function renderOverviewActiveList(deliveries) {
  const container = document.getElementById('overview-active-list');
  const isAr      = TAZA.Lang.current === 'ar';
  if (!container) return;

  if (!deliveries.length) {
    container.innerHTML = `<div class="empty-state" style="padding:24px">
      <div class="empty-icon">🛵</div>
      <div class="empty-title">${isAr?'لا توجد طلبات نشطة الآن':'No active orders now'}</div>
      <div class="empty-desc">${isAr?'ستظهر الطلبات هنا عند تعيينها لك':'Orders will appear here when assigned to you'}</div>
    </div>`;
    return;
  }

  container.innerHTML = deliveries.map(d => buildMiniDeliveryCard(d)).join('');
}

function getDeliveryCoords(d) {
  const raw = d?.delivery_coordinates ?? d?.coordinates ?? d?.location ?? null;
  const lat = Number(raw?.latitude ?? raw?.lat ?? d?.latitude ?? d?.delivery_latitude ?? d?.customer_latitude);
  const lng = Number(raw?.longitude ?? raw?.lng ?? d?.longitude ?? d?.delivery_longitude ?? d?.customer_longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
}

function buildMapsUrl(d) {
  const coords = getDeliveryCoords(d);
  const origin = d?.route?.origin;
  return coords && origin?.latitude != null && origin?.longitude != null
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${coords.latitude},${coords.longitude}&travelmode=driving`
    : coords
      ? `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.delivery_address ?? '')}`;
}

function deliveryRouteLatLngs(delivery) {
  const geometry = delivery?.route?.geometry;
  if (Array.isArray(geometry) && geometry.length > 1) {
    return geometry
      .filter(point => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
      .map(([lng, lat]) => [Number(lat), Number(lng)]);
  }
  const origin = delivery?.route?.origin;
  const destination = getDeliveryCoords(delivery);
  if (origin?.latitude != null && origin?.longitude != null && destination) {
    return [[Number(origin.latitude), Number(origin.longitude)], [destination.latitude, destination.longitude]];
  }
  return [];
}

function openDriverRoute(delivery) {
  const modal = document.getElementById('modal-driver-route');
  const container = document.getElementById('driver-route-map');
  if (!modal || !container || typeof L === 'undefined') return;
  const isAr = TAZA.Lang.current === 'ar';
  const duration = Number(delivery.route?.duration_minutes ?? 0);
  const isFallback = Boolean(delivery.route?.is_fallback);
  document.getElementById('driver-route-title').textContent = `${isAr?'مسار الطلب':'Order route'} #${delivery.id}`;
  document.getElementById('driver-route-summary').innerHTML = `
    <div class="driver-route-metric"><span>${isAr?'المسافة':'Distance'}</span><strong>${(Number(delivery.distance_meters ?? 0)/1000).toFixed(1)} ${isAr?'كم':'km'}</strong></div>
    <div class="driver-route-metric"><span>${isAr?'الوقت المتوقع':'Estimated time'}</span><strong>${duration || '—'} ${duration ? (isAr?'دقيقة':'min') : ''}</strong></div>
    <div class="driver-route-metric"><span>${isAr?'نوع المسار':'Route quality'}</span><strong><span class="route-quality-label ${isFallback?'fallback':''}">${isFallback?(isAr?'تقدير احتياطي':'Fallback estimate'):(isAr?'مسار طرق فعلي':'Road route')}</span></strong></div>`;
  document.getElementById('driver-route-external').href = buildMapsUrl(delivery);

  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
  if (!_driverRouteMap) {
    _driverRouteMap = L.map(container).setView([35.5317, 35.7901], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19,
      attribution:'&copy; OpenStreetMap contributors',
    }).addTo(_driverRouteMap);
    _driverRouteLayer = L.layerGroup().addTo(_driverRouteMap);
  }
  _driverRouteLayer.clearLayers();
  const points = deliveryRouteLatLngs(delivery);
  if (points.length > 1) {
    L.circleMarker(points[0], {radius:9,color:'#7f1d1d',weight:3,fillColor:'#ef4444',fillOpacity:1})
      .bindPopup(isAr?'المطعم':'Restaurant').addTo(_driverRouteLayer);
    L.polyline(points, {color:isFallback?'#f59e0b':'#2563eb',weight:6,opacity:.95,dashArray:isFallback?'8 8':null})
      .addTo(_driverRouteLayer);
    L.circleMarker(points[points.length-1], {radius:8,color:'#1e3a8a',weight:3,fillColor:'#2563eb',fillOpacity:1})
      .bindPopup(escapeHtml(delivery.delivery_address ?? (isAr?'موقع الزبون':'Customer location'))).addTo(_driverRouteLayer);
    _driverRouteMap.fitBounds(points, {padding:[28,28],maxZoom:16});
  }
  setTimeout(() => _driverRouteMap?.invalidateSize(), 0);
}

function closeDriverRoute() {
  document.getElementById('modal-driver-route')?.classList.remove('show');
  document.body.style.overflow = '';
}

function customerLocationChip(d) {
  const isAr = TAZA.Lang.current === 'ar';
  const coords = getDeliveryCoords(d);
  if (!coords) {
    return `<span class="customer-location-chip missing"><i class="fa-solid fa-triangle-exclamation"></i>${isAr?'لم يصل موقع الخريطة':'No map location'}</span>`;
  }
  return `<span class="customer-location-chip"><i class="fa-solid fa-location-dot"></i>${isAr?'موقع الزبون متاح للسائق':'Customer location available'}</span>
          <div class="coords-line">${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}</div>`;
}

function buildMiniDeliveryCard(d) {
  const isAr   = TAZA.Lang.current === 'ar';
  const status = d.status ?? 'assigned';
  const customerName = escapeHtml(d.order?.customer?.name ?? (isAr?'زبون':'Customer'));
  const address = escapeHtml(d.delivery_address ?? '—');
  const statusEmoji = {
    assigned:'🔵', picked_up:'🟡', in_delivery:'🟣', delivered:'🟢'
  }[status] ?? '⚪';

  return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px;
                background:var(--bg-main);border-radius:8px;margin-bottom:8px">
      <span style="font-size:1.3rem">${statusEmoji}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.85rem">
          #${d.id} — ${customerName}
        </div>
        <div style="font-size:.75rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          <i class="fa-solid fa-location-dot"></i> ${address}
        </div>
        ${customerLocationChip(d)}
      </div>
      <div style="text-align:center;flex-shrink:0">
        <div style="font-weight:700;color:var(--primary);font-size:.85rem">${TAZA.Utils.formatMoney(d.delivery_cost)}</div>
        ${TAZA.Utils.statusBadge(status)}
      </div>
    </div>
  `;
}

function renderWeeklyChart() {
  const isAr   = TAZA.Lang.current === 'ar';
  const weekly = _myStats.weekly_trend ?? [];
  TAZA.Charts.createLine('chart-my-weekly', {
    labels: weekly.map(point => TAZA.Charts.dateLabel(point.date, { weekday: 'short', day: 'numeric' })),
    datasets: [
      { label: isAr ? 'المسندة' : 'Assigned', data: weekly.map(point => Number(point.total ?? 0)) },
      { label: isAr ? 'المسلّمة' : 'Delivered', data: weekly.map(point => Number(point.delivered ?? 0)), color: TAZA.Charts.Colors.success },
    ],
  });
}

async function loadRatingsChart() {
  try {
    if (!_driverId) return;
    const res  = await TAZA.Http.get(TAZA.API.DELIVERY.DRIVER_RATINGS(_driverId));
    const dist = res?.data?.summary?.distribution ?? {};
    TAZA.Charts.createDonut('chart-my-ratings', {
      labels: ['5 ⭐','4 ⭐','3 ⭐','2 ⭐','1 ⭐'],
      data: [
        ratingBucketCount(dist, 5), ratingBucketCount(dist, 4), ratingBucketCount(dist, 3),
        ratingBucketCount(dist, 2), ratingBucketCount(dist, 1),
      ],
    });
  } catch {
    TAZA.Charts.createDonut('chart-my-ratings', {
      labels: ['5 ⭐','4 ⭐','3 ⭐','2 ⭐','1 ⭐'], data: [0, 0, 0, 0, 0],
    });
  }
}

function ratingBucketCount(distribution, rating) {
  const bucket = distribution?.[rating];
  return Number(typeof bucket === 'object' ? bucket?.count : bucket) || 0;
}
