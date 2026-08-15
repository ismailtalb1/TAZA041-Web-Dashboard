'use strict';

// ── Assign Driver Modal ───────────────────────
async function openAssignModal(deliveryId) {
  document.getElementById('assign-delivery-id').value = deliveryId;
  document.getElementById('driver-preview').style.display = 'none';
  openModal('modal-assign-driver');

  const infoEl = document.getElementById('assign-order-info');
  const selEl  = document.getElementById('assign-driver-select');
  const isAr   = TAZA.Lang.current === 'ar';

  // تفاصيل الطلب
  try {
    const res = await TAZA.Http.get(TAZA.API.DELIVERY.SHOW(deliveryId));
    const d   = res?.data?.delivery ?? {};
    infoEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><span style="color:var(--text-muted);font-size:.72rem">${isAr?'الزبون':'Customer'}</span>
             <div style="font-weight:600">${escapeHtml(d.order?.customer?.name ?? '—')}</div></div>
        <div><span style="color:var(--text-muted);font-size:.72rem">${isAr?'التكلفة':'Cost'}</span>
             <div style="font-weight:600;color:var(--primary)">${TAZA.Utils.formatMoney(d.delivery_cost)}</div></div>
        <div style="grid-column:1/-1"><span style="color:var(--text-muted);font-size:.72rem">${isAr?'العنوان':'Address'}</span>
             <div style="font-weight:600">${escapeHtml(d.delivery_address ?? '—')}</div></div>
      </div>
    `;
  } catch {
    infoEl.innerHTML = `<span style="color:var(--text-muted)">${isAr?'لا يمكن تحميل التفاصيل':'Cannot load details'}</span>`;
  }

  // قائمة السائقين
  if (!_drivers.length) await loadDriversData();

  selEl.innerHTML = `<option value="">${isAr?'اختر سائقاً...':'Choose a driver...'}</option>` +
    _drivers.map(d => `<option value="${Number(d.driver.id)}">
      ${escapeHtml(d.driver.name)} — ⭐${Number(d.stats.average_rating ?? 0)} (${Number(d.stats.active_deliveries ?? 0)} ${isAr?'نشط':'active'})
    </option>`).join('');
}

function updateDriverPreview() {
  const sel      = document.getElementById('assign-driver-select');
  const preview  = document.getElementById('driver-preview');
  const driverId = parseInt(sel.value);

  if (!driverId) { preview.style.display = 'none'; return; }

  const found = _drivers.find(d => d.driver.id === driverId);
  if (!found) return;

  document.getElementById('driver-preview-avatar').textContent = TAZA.Utils.initials(found.driver.name);
  document.getElementById('driver-preview-name').textContent    = found.driver.name;
  document.getElementById('driver-preview-rating').textContent  =
    '★'.repeat(Math.round(found.stats.average_rating ?? 5)) +
    '☆'.repeat(5 - Math.round(found.stats.average_rating ?? 5));
  document.getElementById('driver-preview-active').textContent  = found.stats.active_deliveries ?? 0;
  preview.style.display = 'flex';
}

async function confirmAssignDriver() {
  const deliveryId = parseInt(document.getElementById('assign-delivery-id').value);
  const driverId   = parseInt(document.getElementById('assign-driver-select').value);
  const isAr       = TAZA.Lang.current === 'ar';

  if (!driverId) {
    TAZA.Toast.warning(isAr ? 'يرجى اختيار سائق' : 'Please select a driver');
    return;
  }

  const btn = document.getElementById('confirm-assign-btn');
  TAZA.Utils.disableBtn(btn);

  try {
    await TAZA.Http.put(TAZA.API.DELIVERY.ASSIGN_DRIVER(deliveryId), { driver_id: driverId });
    TAZA.Toast.success(isAr ? 'تم تعيين السائق بنجاح' : 'Driver assigned successfully');
    closeModal('modal-assign-driver');
    _activeDeliveries = [];
    loadActiveDeliveries();
    loadLiveBoard();
  } catch(e) {
    TAZA.Toast.apiError(e);
  } finally {
    TAZA.Utils.enableBtn(btn);
  }
}

async function sendCustomerNotif() {
  const id      = document.getElementById('notify-delivery-id').value;
  const message = document.getElementById('notify-cust-msg').value.trim();
  const isAr    = TAZA.Lang.current === 'ar';

  if (!message) {
    TAZA.Toast.warning(isAr ? 'الرسالة مطلوبة' : 'Message required');
    return;
  }

  try {
    await TAZA.Http.post(TAZA.API.DELIVERY.NOTIFY_CUSTOMER(id), {
      message,
      title: isAr ? 'تحديث توصيلك 🚗' : 'Delivery Update 🚗',
    });
    TAZA.Toast.success(isAr ? 'تم إرسال الإشعار' : 'Notification sent');
    closeModal('modal-notify-cust');
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}
