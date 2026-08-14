// Delivery page, map selection, range, and fee estimate
async function initDeliveryPage() {
  if (!requireCustomerLogin()) return;
  setOrderType('delivery');
  if (document.body.dataset.deliveryPageReady === 'true') {
    renderPaymentSummary($('[data-delivery-summary]'));
    if (typeof window.renderDeliverySavedAddresses === 'function') window.renderDeliverySavedAddresses();
    return;
  }
  document.body.dataset.deliveryPageReady = 'true';
  const box = $('[data-drivers]');
  if (box) {
    box.innerHTML = `
      <div class="driver-card selected delivery-driver-card">
        <div class="type-icon">🛵</div>
        <div class="delivery-driver-copy">
          <h3>${langText('السائق يحدده مدير التوصيل', 'Driver assigned by delivery manager')}</h3>
          <p class="muted">${langText('بعد تأكيد الطلب، سيتم تعيين السائق الأنسب ومتابعة الحالة ضمن الإشعارات والطلبات.', 'After confirmation, the best driver will be assigned and updates will appear in notifications and orders.')}</p>
        </div>
        <div class="delivery-driver-status">
          <span>${langText('بعد الدفع', 'After payment')}</span>
          <strong>${langText('تعيين تلقائي', 'Auto assignment')}</strong>
        </div>
      </div>`;
    $('[data-delivery-driver-name]') && ($('[data-delivery-driver-name]').textContent = langText('يُعيَّن بعد تأكيد الطلب', 'Assigned after confirmation'));
  }

  const restaurant = AppState.restaurant || {};
  const defaultLat = Number(restaurant.latitude || 35.5317);
  const defaultLng = Number(restaurant.longitude || 35.7901);
  let selected = AppState.deliveryMeta ? { lat: AppState.deliveryMeta.latitude, lng: AppState.deliveryMeta.longitude } : null;
  let selectedDistanceKm = selected?.lat && selected?.lng ? distanceKmBetween(defaultLat, defaultLng, selected.lat, selected.lng) : null;
  let selectedRoute = AppState.deliveryMeta?.route || null;
  let mapReady = false;
  const maxDistanceKm = deliveryMaxDistanceKm();
  $$('[data-delivery-range-label]').forEach(el => {
    el.textContent = langText(`نطاق التوصيل ${maxDistanceKm} كم`, `${maxDistanceKm} km range`);
  });
  const addressInput = $('[data-delivery-address]');
  if (addressInput && AppState.deliveryMeta?.address && !addressInput.value) {
    addressInput.value = AppState.deliveryMeta.address;
  }

  const mapWarning = $('[data-map-warning]');
  const setMapWarning = (message = '') => {
    if (!mapWarning) return;
    mapWarning.textContent = message;
    mapWarning.classList.toggle('hidden', !message);
  };
  const updateMapStatus = () => {
    const status = $('[data-map-status]');
    const title = $('[data-map-status-title]');
    const detail = $('[data-map-status-detail]');
    const distance = $('[data-map-distance]');
    const estimatedFee = $('[data-map-estimated-fee]');
    const estimatedTime = $('[data-map-estimated-time]');
    const saveBtn = $('[data-save-map-location]');
    const hasPoint = Boolean(selected?.lat && selected?.lng);
    const feeEstimate = selectedRoute ? Number(selectedRoute.fee || AppState.deliveryMeta?.fee || 0) : 0;
    status?.classList.toggle('is-ready', hasPoint);
    if (title) title.textContent = hasPoint ? langText('تم اختيار نقطة التوصيل', 'Drop-off point selected') : langText('لم يتم اختيار موقع', 'No location selected');
    if (detail) {
      detail.textContent = hasPoint
        ? `${langText('الإحداثيات', 'Coordinates')}: ${Number(selected.lat).toFixed(5)}, ${Number(selected.lng).toFixed(5)}`
        : langText('اختر نقطة من الخريطة لعرض المسافة', 'Choose a map point to show distance');
    }
    if (distance) distance.textContent = hasPoint && selectedDistanceKm !== null ? `${selectedDistanceKm.toFixed(2)} km` : '—';
    if (estimatedFee) estimatedFee.textContent = selectedRoute ? formatCurrency(feeEstimate) : '—';
    if (estimatedTime) estimatedTime.textContent = selectedRoute?.duration_minutes
      ? `${selectedRoute.duration_minutes} ${langText('دقيقة', 'min')}`
      : '—';
    if (saveBtn) {
      saveBtn.disabled = !hasPoint;
      saveBtn.classList.toggle('is-disabled', !hasPoint);
    }
  };

  const validateDeliveryPoint = (lat, lng, { notify = true } = {}) => {
    const distanceKm = distanceKmBetween(defaultLat, defaultLng, lat, lng);
    if (!TazaDeliveryGeo.isPointOnLand(Number(lat), Number(lng))) {
      const message = langText(
        'هذا الموقع يقع في البحر. اختر نقطة على اليابسة ضمن نطاق التوصيل.',
        'This location is in the sea. Choose a point on land within the delivery range.'
      );
      setMapWarning(message);
      if (notify) showToast(message, { kind: 'error' });
      return { ok: false, distanceKm, message };
    }
    if (distanceKm > maxDistanceKm) {
      const message = langText(
        `الموقع خارج نطاق التوصيل. الحد الأقصى ${maxDistanceKm} كم، والمسافة الحالية ${distanceKm.toFixed(2)} كم.`,
        `Location is outside delivery range. Maximum is ${maxDistanceKm} km, current distance is ${distanceKm.toFixed(2)} km.`
      );
      setMapWarning(message);
      if (notify) showToast(message, { kind: 'error' });
      return { ok: false, distanceKm, message };
    }
    setMapWarning('');
    return { ok: true, distanceKm };
  };

  const renderDeliverySavedAddresses = () => {
    const root = $('[data-delivery-saved-addresses]');
    if (!root) return;
    const addresses = SAVED_ADDRESS_TYPES.map(type => AppState.savedAddresses[type] || emptySavedAddress(type));
    const hasAnyAddress = addresses.some(savedAddressText);
    if (!hasAnyAddress) {
      root.innerHTML = `
        <div class="delivery-saved-empty">
          <strong>${esc(langText('لا توجد عناوين محفوظة بعد', 'No saved addresses yet'))}</strong>
          <a href="profile.html">${esc(langText('إضافة من الملف الشخصي', 'Add in profile'))}</a>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="delivery-saved-head">
        <strong>${esc(langText('اختر من عناوينك المحفوظة', 'Choose a saved address'))}</strong>
        <a href="profile.html">${esc(langText('إدارة العناوين', 'Manage addresses'))}</a>
      </div>
      <div class="delivery-saved-grid">
        ${addresses.map(item => {
          const label = savedAddressLabel(item.type);
          const hasAddress = Boolean(savedAddressText(item));
          const hasCoordinates = savedAddressHasCoordinates(item);
          return `
            <button class="saved-address-choice" type="button" data-apply-saved-address="${esc(item.type)}" ${hasAddress ? '' : 'disabled'}>
              <span class="saved-address-icon" aria-hidden="true">${esc(label.icon)}</span>
              <span class="saved-address-choice-copy">
                <strong>${esc(savedAddressTitle(item))}</strong>
                <small>${esc(hasAddress ? savedAddressText(item) : langText('لم يتم حفظ هذا العنوان', 'This address is not saved'))}</small>
              </span>
              <span class="saved-address-chip ${hasCoordinates ? 'ready' : 'partial'}">${esc(hasCoordinates ? langText('موقع جاهز', 'Pinned') : langText('وصف فقط', 'Text only'))}</span>
            </button>`;
        }).join('')}
      </div>`;

    $$('[data-apply-saved-address]', root).forEach(button => {
      button.addEventListener('click', () => {
        const item = AppState.savedAddresses[button.dataset.applySavedAddress];
        const text = savedAddressText(item);
        if (!text) return;
        if (addressInput) addressInput.value = text;
        if (savedAddressHasCoordinates(item)) {
          const validation = validateDeliveryPoint(Number(item.latitude), Number(item.longitude));
          if (!validation.ok) return;
          const setOnMap = window.__tazaDeliverySetDestination;
          if (typeof setOnMap === 'function') {
            const accepted = setOnMap(Number(item.latitude), Number(item.longitude));
            if (accepted === false) return;
          } else {
            selected = { lat: Number(item.latitude), lng: Number(item.longitude) };
            selectedDistanceKm = validation.distanceKm;
            updatePreview();
            updateMapStatus();
          }
          $('[data-delivery-distance]') && ($('[data-delivery-distance]').textContent = langText('بانتظار التأكيد', 'Waiting confirmation'));
          showToast(langText('تم اختيار العنوان المحفوظ', 'Saved address selected'), { kind: 'location' });
          return;
        }
        showToast(langText('تم تعبئة وصف العنوان. ثبّت النقطة على الخريطة لحساب التكلفة.', 'Address filled. Pin it on the map to calculate the fee.'), { kind: 'warning' });
      });
    });
  };
  window.renderDeliverySavedAddresses = renderDeliverySavedAddresses;

  const updatePreview = () => {
    const preview = $('[data-location-preview]');
    if (!preview) return;
    if (!selected?.lat || !selected?.lng) {
      preview.classList.add('hidden');
      preview.textContent = '';
      updateMapStatus();
      return;
    }
    preview.classList.remove('hidden');
    const distanceLabel = selectedDistanceKm !== null ? `${selectedDistanceKm.toFixed(2)} km` : '—';
    preview.innerHTML = `
      <div class="row-between"><strong>${langText('الموقع المختار', 'Selected location')}</strong><span class="status-badge">${langText('محفوظ', 'Saved')}</span></div>
      <div class="delivery-location-meta">
        <small class="muted">${langText('الإحداثيات', 'Coordinates')}: ${Number(selected.lat).toFixed(5)}, ${Number(selected.lng).toFixed(5)}</small>
        <small class="muted">${langText('المسافة عن المطعم', 'Distance from restaurant')}: ${distanceLabel}</small>
        <small class="muted">${langText('أجرة التوصيل', 'Delivery fee')}: ${selectedRoute ? formatCurrency(selectedRoute.fee || 0) : langText('بانتظار حساب الطريق', 'Waiting for route calculation')}</small>
        ${selectedRoute?.duration_minutes ? `<small class="muted">${langText('الوقت المتوقع', 'Estimated time')}: ${selectedRoute.duration_minutes} ${langText('دقيقة', 'min')}</small>` : ''}
      </div>
    `;
    updateMapStatus();
  };

  const openMap = () => {
    $('[data-overlay]')?.classList.add('active');
    $('[data-map-modal]')?.classList.add('active');
    updateMapStatus();
    if (!mapReady) {
      const persistedRoute = selectedRoute;
      initMap(defaultLat, defaultLng, selected, (lat, lng) => {
        const validation = validateDeliveryPoint(lat, lng);
        if (!validation.ok) return false;
        selected = { lat, lng };
        selectedRoute = null;
        selectedDistanceKm = validation.distanceKm;
        $('[data-delivery-distance]') && ($('[data-delivery-distance]').textContent = langText('بانتظار التأكيد', 'Waiting confirmation'));
        updatePreview();
        updateMapStatus();
        return true;
      });
      mapReady = true;
      selectedRoute = persistedRoute;
    }
    if (selectedRoute?.geometry?.length) {
      window.__tazaDeliverySetRoute?.(selectedRoute.geometry, Boolean(selectedRoute.is_fallback));
    }
    [80, 260, 620].forEach(delay => setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      window.__tazaDeliveryMap?.invalidateSize?.();
    }, delay));
  };

  $('[data-open-map]')?.addEventListener('click', openMap);
  $('[data-close-map]')?.addEventListener('click', () => { $('[data-map-modal]')?.classList.remove('active'); $('[data-overlay]')?.classList.remove('active'); });
  $('[data-use-current-location]')?.addEventListener('click', (event) => {
    const btn = event.currentTarget;
    if (!navigator.geolocation) return showToast(langText('المتصفح لا يدعم تحديد الموقع الحالي', 'Current location is not supported by this browser'), { kind: 'warning' });
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        btn.disabled = false;
        btn.setAttribute('aria-busy', 'false');
        const lat = Number(position.coords.latitude);
        const lng = Number(position.coords.longitude);
        const setOnMap = window.__tazaDeliverySetDestination;
        if (typeof setOnMap === 'function') {
          const accepted = setOnMap(lat, lng);
          if (accepted !== false) showToast(langText('تم تحديد موقعك الحالي على الخريطة', 'Your current location was placed on the map'), { kind: 'location' });
          return;
        }
        const validation = validateDeliveryPoint(lat, lng);
        if (!validation.ok) return;
        selected = { lat, lng };
        selectedRoute = null;
        selectedDistanceKm = validation.distanceKm;
        updatePreview();
        showToast(langText('تم تحديد موقعك الحالي', 'Current location selected'), { kind: 'location' });
      },
      () => {
        btn.disabled = false;
        btn.setAttribute('aria-busy', 'false');
        showToast(langText('لم نتمكن من قراءة موقعك الحالي', 'Unable to read your current location'), { kind: 'warning' });
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  });
  $('[data-save-map-location]')?.addEventListener('click', () => {
    if (!selected?.lat || !selected?.lng) return showToast(langText('اختر الموقع من الخريطة أولاً', 'Choose a location on the map first'), { kind: 'warning' });
    const validation = validateDeliveryPoint(selected.lat, selected.lng);
    if (!validation.ok) return;
    selectedDistanceKm = validation.distanceKm;
    $('[data-map-modal]')?.classList.remove('active');
    $('[data-overlay]')?.classList.remove('active');
    updatePreview();
    updateMapStatus();
    showToast(langText('تم حفظ الموقع المختار', 'Location saved'), { kind: 'location' });
  });

  updatePreview();
  updateMapStatus();
  renderDeliverySavedAddresses();

  $('[data-confirm-location]')?.addEventListener('click', async () => {
    if (!selected?.lat || !selected?.lng) return showToast(langText('افتح الخريطة واختر موقع التوصيل أولاً', 'Open the map and choose delivery location first'), { kind: 'warning' });
    const validation = validateDeliveryPoint(selected.lat, selected.lng);
    if (!validation.ok) return;
    selectedDistanceKm = validation.distanceKm;
    const address = $('[data-delivery-address]')?.value.trim() || langText('موقع محدد على الخريطة', 'Map selected location');
    const quote = await safeApi(`/public/delivery/quote?latitude=${encodeURIComponent(selected.lat)}&longitude=${encodeURIComponent(selected.lng)}`);
    if (!quote) {
      return showToast(langText(
        'تعذر اعتماد أجور التوصيل حالياً. تحقق من الاتصال ثم حاول مجدداً.',
        'Unable to confirm the delivery fee right now. Check your connection and try again.'
      ), { kind: 'error' });
    }
    if (!quote?.is_within_range && quote) return showToast(quote.message || langText('الموقع خارج نطاق التوصيل', 'Location outside delivery range'), { kind: 'error' });

    const fee = Number(quote.delivery_cost);
    const distanceKm = Number(quote.distance_km);
    selectedRoute = {
      ...(quote.route || {}),
      fee,
      distance_km: distanceKm
    };
    selectedDistanceKm = distanceKm;
    window.__tazaDeliverySetRoute?.(selectedRoute.geometry || [], Boolean(selectedRoute.is_fallback));
    AppState.deliveryMeta = {
      driver: null,
      fee,
      distance: `${distanceKm.toFixed(2)} km`,
      latitude: Number(selected.lat),
      longitude: Number(selected.lng),
      address,
      durationMinutes: Number(selectedRoute.duration_minutes || 0),
      route: selectedRoute
    };
    persist();
    $('[data-delivery-fee]') && ($('[data-delivery-fee]').textContent = formatCurrency(fee));
    $('[data-delivery-distance]') && ($('[data-delivery-distance]').textContent = AppState.deliveryMeta.distance);
    $('[data-delivery-duration]') && ($('[data-delivery-duration]').textContent = selectedRoute.duration_minutes ? `${selectedRoute.duration_minutes} ${langText('دقيقة', 'min')}` : '—');
    renderPaymentSummary($('[data-delivery-summary]'));
    updatePreview();
    if (selectedRoute.is_fallback) {
      showToast(langText('تعذّر الوصول إلى خدمة الطرق؛ تم استخدام تقدير احتياطي مؤقت', 'Road routing is unavailable; a temporary fallback estimate was used'), { kind: 'warning' });
    } else {
      showToast(langText('تم حساب الطريق الأقصر وأجور التوصيل', 'Fastest route and delivery fee calculated'), { kind: 'delivery_started' });
    }
  });

  $('[data-go-payment-delivery]')?.addEventListener('click', () => {
    if (!AppState.deliveryMeta) return showToast(langText('أكد موقع التوصيل أولاً', 'Confirm delivery location first'), { kind: 'warning' });
    location.href = 'payment.html?order=delivery';
  });
  if (AppState.deliveryMeta) {
    $('[data-delivery-fee]') && ($('[data-delivery-fee]').textContent = formatCurrency(AppState.deliveryMeta.fee || 0));
    $('[data-delivery-distance]') && ($('[data-delivery-distance]').textContent = AppState.deliveryMeta.distance || '—');
    $('[data-delivery-duration]') && ($('[data-delivery-duration]').textContent = AppState.deliveryMeta.durationMinutes ? `${AppState.deliveryMeta.durationMinutes} ${langText('دقيقة', 'min')}` : '—');
  }
  renderPaymentSummary($('[data-delivery-summary]'));
}

function initMap(restaurantLat, restaurantLng, selected, onSelect) {
  const el = $('[data-delivery-map]');
  if (!el) return;

  const applySelection = (lat, lng, updateMarker = () => {}) => {
    const accepted = onSelect(Number(lat), Number(lng));
    if (accepted === false) return false;
    updateMarker();
    const msg = el.querySelector('[data-map-message]');
    if (msg) msg.textContent = langText('تم اختيار الموقع — اضغط حفظ الموقع', 'Location selected — save it');
    return true;
  };

  if (!window.L) {
    window.__tazaDeliverySetDestination = (lat, lng) => applySelection(lat, lng);
    el.addEventListener('click', (event) => {
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      applySelection(restaurantLat + y * 0.08, restaurantLng + x * 0.08);
    });
    return;
  }

  const restaurantIcon = window.TazaMapMarkers?.create('restaurant');
  const destinationIcon = window.TazaMapMarkers?.create('destination');

  el.style.minHeight = '360px';
  el.classList.remove('placeholder-media');
  el.classList.add('delivery-leaflet-map');
  el.innerHTML = '';
  const map = L.map(el, {
    scrollWheelZoom: true,
    wheelDebounceTime: 32,
    wheelPxPerZoomLevel: 70
  }).setView([restaurantLat, restaurantLng], 14);
  window.__tazaDeliveryMap = map;
  const mapShell = el.closest('.map-canvas-shell');
  const finishMapLoading = () => mapShell?.classList.remove('is-map-loading');
  mapShell?.classList.add('is-map-loading');
  mapShell?.setAttribute('data-map-loading-label', langText('جاري تجهيز الخريطة…', 'Preparing map…'));
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    keepBuffer: 4
  }).once('load', finishMapLoading).addTo(map);
  setTimeout(finishMapLoading, 8000);
  const deliveryAreaStyle = {
    color: '#ff9635',
    weight: 2,
    opacity: 0.9,
    fillColor: '#ffc45e',
    fillOpacity: 0.1,
    interactive: false
  };
  const landOnlyDeliveryArea = TazaDeliveryGeo.createLandOnlyArea(restaurantLat, restaurantLng, deliveryMaxDistanceKm());
  if (landOnlyDeliveryArea) {
    L.geoJSON(landOnlyDeliveryArea, { style: deliveryAreaStyle }).addTo(map);
  } else {
    // Keep the range usable if the geometry helper fails to load.
    L.circle([restaurantLat, restaurantLng], {
      ...deliveryAreaStyle,
      radius: deliveryMaxDistanceKm() * 1000
    }).addTo(map);
  }

  // Treat the map as its own scroll surface: the wheel zooms the map and never
  // leaks through to the page behind the modal.
  L.DomEvent.on(el, 'wheel', L.DomEvent.preventDefault);
  map.scrollWheelZoom.enable();

  const restaurantMarker = L.marker([restaurantLat, restaurantLng], restaurantIcon ? { icon: restaurantIcon } : {})
    .addTo(map)
    .bindPopup(langText('موقع المطعم', 'Restaurant location'));
  let destinationMarker = null;
  let routeLine = null;

  const drawRoute = (geometry = [], isFallback = false) => {
    const points = geometry
      .filter(point => Array.isArray(point) && point.length >= 2)
      .map(point => [Number(point[1]), Number(point[0])])
      .filter(point => point.every(Number.isFinite));
    if (points.length < 2) return;
    const style = {
      color: isFallback ? '#f59e0b' : '#2563eb',
      weight: isFallback ? 4 : 6,
      opacity: 0.9,
      dashArray: isFallback ? '9, 9' : null,
      lineCap: 'round',
      lineJoin: 'round'
    };
    if (routeLine) {
      routeLine.setLatLngs(points);
      routeLine.setStyle(style);
    } else {
      routeLine = L.polyline(points, style).addTo(map);
    }
    map.fitBounds(routeLine.getBounds().pad(0.18), { animate: true, maxZoom: 16 });
  };

  const setDestination = (latlng) => applySelection(latlng.lat, latlng.lng, () => {
    if (destinationMarker) destinationMarker.setLatLng(latlng);
    else destinationMarker = L.marker(latlng, destinationIcon ? { icon: destinationIcon } : {})
      .addTo(map)
      .bindPopup(langText('موقع الزبون', 'Customer location'));
    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }
    const bounds = L.latLngBounds([[restaurantLat, restaurantLng], [latlng.lat, latlng.lng]]);
    map.fitBounds(bounds.pad(0.25), { animate: true, maxZoom: 15 });
  });
  window.__tazaDeliverySetDestination = (lat, lng) => setDestination(L.latLng(Number(lat), Number(lng)));
  window.__tazaDeliverySetRoute = drawRoute;

  restaurantMarker.openPopup();
  if (selected?.lat && selected?.lng) setDestination(L.latLng(selected.lat, selected.lng));
  map.on('click', e => setDestination(e.latlng));
  [50, 250, 650].forEach(delay => setTimeout(() => map.invalidateSize(), delay));
}

function distanceKmBetween(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDeliveryCost(lat1, lon1, lat2, lon2) {
  const perKm = deliveryCostPerKm();
  return Math.round(distanceKmBetween(lat1, lon1, lat2, lon2) * perKm);
}
