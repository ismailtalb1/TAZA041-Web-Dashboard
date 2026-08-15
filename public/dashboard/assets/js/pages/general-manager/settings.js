'use strict';

// ══════════════════════════════════════════════
// [7] Settings
// ══════════════════════════════════════════════
async function loadSettings() {
  try {
    const res = await TAZA.Http.get(TAZA.API.ADMIN_RESTAURANT.SHOW);
    _restaurantInfo = res?.data?.restaurant ?? {};

    const ds = _restaurantInfo.delivery_settings ?? {};
    const rs = _restaurantInfo.reservation_settings ?? {};

    document.getElementById('delivery-cost').value        = ds.cost_per_100m       ?? '';
    document.getElementById('delivery-max-distance').value= ds.max_distance_meters ?? '';
    document.getElementById('vip-cost').value             = rs.vip_extra_cost      ?? '';
    document.getElementById('free-seats').value           = rs.free_seats_count    ?? '';
    document.getElementById('extra-seat-cost').value      = rs.cost_per_extra_seat ?? '';

    updateOpenStatusBadge(_restaurantInfo.is_open);
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function updateOpenStatusBadge(isOpen) {
  const badge     = document.getElementById('restaurant-open-badge');
  const toggleBtn = document.getElementById('toggle-open-text');
  const isAr      = TAZA.Lang.current === 'ar';
  if (!badge) return;

  badge.className = `open-badge ${isOpen ? 'open' : 'closed'}`;
  badge.innerHTML = isOpen
    ? `<i class="fa-solid fa-circle-check"></i> ${isAr?'مفتوح':'Open'}`
    : `<i class="fa-solid fa-circle-xmark"></i> ${isAr?'مغلق':'Closed'}`;

  if (toggleBtn) {
    toggleBtn.textContent = isOpen
      ? (isAr ? 'إغلاق المطعم' : 'Close Restaurant')
      : (isAr ? 'فتح المطعم'   : 'Open Restaurant');
  }
}

async function toggleRestaurantOpen() {
  const isOpen = _restaurantInfo?.is_open ?? true;
  const isAr   = TAZA.Lang.current === 'ar';

  TAZA.Confirm.show(
    isOpen
      ? (isAr ? 'هل تريد إغلاق المطعم؟' : 'Close the restaurant?')
      : (isAr ? 'هل تريد فتح المطعم؟'   : 'Open the restaurant?'),
    async () => {
      try {
        await TAZA.Http.put(TAZA.API.ADMIN_RESTAURANT.TOGGLE_OPEN, { is_open: !isOpen });
        _restaurantInfo.is_open = !isOpen;
        updateOpenStatusBadge(!isOpen);
        TAZA.Toast.success(isAr
          ? (!isOpen ? 'تم فتح المطعم' : 'تم إغلاق المطعم')
          : (!isOpen ? 'Restaurant opened' : 'Restaurant closed')
        );
      } catch(e) {
        TAZA.Toast.apiError(e);
      }
    },
    { danger: isOpen }
  );
}

async function saveDeliverySettings() {
  const cost    = document.getElementById('delivery-cost').value;
  const maxDist = document.getElementById('delivery-max-distance').value;
  const isAr    = TAZA.Lang.current === 'ar';

  if (!cost || !maxDist) {
    TAZA.Toast.warning(isAr ? 'يرجى ملء الحقول' : 'Please fill fields');
    return;
  }

  try {
    await TAZA.Http.put(TAZA.API.ADMIN_RESTAURANT.UPDATE_DELIVERY, {
      cost_per_100m:       parseFloat(cost),
      max_distance_meters: parseInt(maxDist),
    });
    const res = await TAZA.Http.get(TAZA.API.ADMIN_RESTAURANT.SHOW);
    _restaurantInfo = res?.data?.restaurant ?? _restaurantInfo;
    TAZA.Toast.success(isAr ? 'تم حفظ إعدادات التوصيل' : 'Delivery settings saved');
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

async function saveReservationSettings() {
  const vipCost   = document.getElementById('vip-cost').value;
  const freeSeats = document.getElementById('free-seats').value;
  const extraSeat = document.getElementById('extra-seat-cost').value;
  const isAr      = TAZA.Lang.current === 'ar';

  if (!vipCost || !freeSeats || !extraSeat) {
    TAZA.Toast.warning(isAr ? 'يرجى ملء الحقول' : 'Please fill fields');
    return;
  }

  try {
    await TAZA.Http.put(TAZA.API.ADMIN_RESTAURANT.UPDATE_RESERVATION, {
      vip_extra_cost:      parseFloat(vipCost),
      seats_above:         parseInt(freeSeats),
      cost_per_extra_seat: parseFloat(extraSeat),
    });
    TAZA.Toast.success(isAr ? 'تم حفظ إعدادات الحجز' : 'Reservation settings saved');
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}
