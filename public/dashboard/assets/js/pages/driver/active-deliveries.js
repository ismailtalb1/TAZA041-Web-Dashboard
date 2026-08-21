'use strict';

// ═══════════════════════════════════════════
// [2] Active Orders
// ═══════════════════════════════════════════
async function loadActiveDeliveries() {
  const grid = document.getElementById('active-orders-grid');
  const isAr = TAZA.Lang.current === 'ar';

  try {
    const res         = await TAZA.Http.get(TAZA.API.DELIVERY.ACTIVE);
    _activeDeliveries = res?.data?.deliveries ?? [];

    renderOverviewStats();
    renderOverviewActiveList(_activeDeliveries);

    if (!grid) return;

    if (!_activeDeliveries.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:40px">
        <div class="empty-icon">🛵</div>
        <div class="empty-title">${isAr?'لا توجد طلبات نشطة':'No active orders'}</div>
        <div class="empty-desc">${isAr?'ستُعيَّن لك الطلبات من قِبل مدير التوصيل':'Orders will be assigned by delivery manager'}</div>
      </div>`;
      return;
    }

    grid.innerHTML = _activeDeliveries.map(d => buildFullDeliveryCard(d)).join('');

  } catch(e) { TAZA.Toast.apiError(e); }
}

function buildFullDeliveryCard(d) {
  const isAr    = TAZA.Lang.current === 'ar';
  const status  = d.status ?? 'assigned';
  const customerName = escapeHtml(d.order?.customer?.name ?? (isAr?'زبون':'Customer'));
  const customerPhone = escapeHtml(d.order?.customer?.phone ?? '');
  const deliveryAddress = escapeHtml(d.delivery_address ?? (isAr?'لا يوجد عنوان':'No address'));

  const nextStatus = { assigned:'delivered', picked_up:'delivered', in_delivery:'delivered' }[status];
  const nextBtnMap = {
    delivered:  { label: isAr?'✅ تم التسليم للزبون':'✅ Delivered to Customer', cls:'status-btn-delivered' },
  };
  const nextBtn = nextBtnMap[nextStatus];

  // Build Google Maps link from coordinates stored when the customer selects a location.
  const coords = getDeliveryCoords(d);
  const mapsUrl = buildMapsUrl(d);

  return `
    <div class="delivery-card">
      <div class="delivery-status-bar ${status}"></div>
      <div class="delivery-card-body">

        <!-- Header -->
        <div class="delivery-card-meta">
          <div>
            <span class="delivery-card-id">#${d.id}</span>
            <div style="font-size:.72rem;color:var(--text-muted);margin-top:1px">
              <i class="fa-regular fa-clock"></i> ${TAZA.Utils.timeAgo(d.created_at)}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${TAZA.Utils.statusBadge(status)}
            <span style="font-size:1rem;font-weight:800;color:var(--success)">
              ${TAZA.Utils.formatMoney(d.delivery_cost)}
            </span>
          </div>
        </div>

        <!-- Customer Section -->
        <div class="customer-section">
          <div class="customer-section-label"
               data-lang-ar="بيانات الزبون" data-lang-en="Customer Info">
            ${isAr?'بيانات الزبون':'Customer Info'}
          </div>
          <div class="customer-name-big">${customerName}</div>
          ${d.order?.customer?.phone ? `
            <a href="tel:${customerPhone}" class="customer-phone-big"
               style="text-decoration:none">
              <i class="fa-solid fa-phone-flip"></i>
              ${customerPhone}
            </a>` : ''}
        </div>

        <!-- Address Section -->
        <div class="address-section">
          <div class="customer-section-label"
               data-lang-ar="العنوان" data-lang-en="Delivery Address">
            ${isAr?'العنوان':'Delivery Address'}
          </div>
          <div class="address-text"><i class="fa-solid fa-location-dot"></i> ${deliveryAddress}</div>
          ${customerLocationChip(d)}
          <div class="distance-info">
            ${d.distance_meters ? `
              <span class="distance-pill">
                <i class="fa-solid fa-route"></i>
                ${(d.distance_meters/1000).toFixed(1)} ${isAr?'كم':'km'}
              </span>
              <span class="time-pill">
                <i class="fa-regular fa-clock"></i>
                ~${Number(d.route?.duration_minutes ?? Math.round(d.distance_meters/500))} ${isAr?'دقيقة':'min'}
              </span>` : ''}
            <span class="cost-pill">
              <i class="fa-solid fa-money-bill"></i>
              ${TAZA.Utils.formatMoney(d.delivery_cost)}
            </span>
          </div>
        </div>

        <!-- Order Items Summary -->
        ${(d.order?.items ?? []).length > 0 ? `
          <div style="margin-bottom:12px">
            <div class="customer-section-label">${isAr?'محتوى الطلب':'Order Contents'}</div>
            <div style="font-size:.8rem;color:var(--text-secondary)">
              ${(d.order.items ?? []).slice(0, 3).map(i => `${escapeHtml(i.name ?? '')} ×${Number(i.quantity ?? 0)}`).join(' · ')}
              ${(d.order.items ?? []).length > 3 ? ` + ${(d.order.items).length - 3} ${isAr?'أخرى':'more'}` : ''}
            </div>
          </div>` : ''}

        ${TAZA.OrderComment.render(d.order?.notes, { isAr, compact: true })}

        <!-- Action Buttons -->
        <div class="status-flow">
          <button type="button" class="status-btn btn-maps" data-action="view-route" data-id="${d.id}">
            <i class="fa-solid fa-route" style="color:var(--primary)"></i>
            ${isAr?'عرض المسار المعتمد':'View assigned route'}
          </button>
          <!-- Maps Button -->
          <a href="${mapsUrl}" target="_blank" class="status-btn btn-maps" style="text-decoration:none">
            <i class="fa-solid fa-map-location-dot"></i>
            ${isAr?'فتح الخريطة':'Open in Maps'}
          </a>

          <!-- Call Button -->
          ${d.order?.customer?.phone ? `
            <a href="tel:${customerPhone}" class="status-btn btn-maps" style="text-decoration:none">
              <i class="fa-solid fa-phone-flip" style="color:var(--success)"></i>
              ${isAr?'اتصل بالزبون':'Call Customer'}
            </a>` : ''}

          <!-- Next Status Button -->
          ${nextBtn ? `
            <button class="status-btn ${nextBtn.cls}"
                    data-action="change-status"
                    data-id="${d.id}"
                    data-status="${nextStatus}">
              ${nextBtn.label}
            </button>` : `
            <div style="text-align:center;padding:10px;font-size:.85rem;color:var(--success);font-weight:700">
              <i class="fa-solid fa-circle-check"></i>
              ${isAr?'تم تسليم هذا الطلب':'This order was delivered'}
            </div>`
          }
        </div>

      </div>
    </div>
  `;
}

// ── Handle Delivery Actions ────────────────────
async function handleDeliveryAction(e) {
  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn?.dataset.action === 'view-route') {
    const delivery = _activeDeliveries.find(item => Number(item.id) === Number(actionBtn.dataset.id));
    if (delivery) openDriverRoute(delivery);
    return;
  }
  const btn    = e.target.closest('[data-action="change-status"]');
  if (!btn) return;
  const id     = parseInt(btn.dataset.id);
  const status = btn.dataset.status;
  const isAr   = TAZA.Lang.current === 'ar';

  const statusLabels = {
    assigned:   isAr?'في الطريق مع السائق':'On My Way',
    picked_up:  isAr?'في الطريق مع السائق':'On My Way',
    in_delivery:isAr?'في الطريق مع السائق':'On My Way',
    delivered:  isAr?'تم التسليم':'Delivered',
  };

  const isDelivered = status === 'delivered';

  TAZA.Confirm.show(
    isDelivered
      ? (isAr?'تأكيد: تم تسليم الطلب للزبون؟':'Confirm: Order delivered to customer?')
      : `${isAr?'تحديث الحالة إلى:':'Update status to:'} "${statusLabels[status]}"?`,
    async () => {
      const originalHtml = btn.innerHTML;
      btn.innerHTML      = '<div class="loader-ring" style="width:20px;height:20px;border-width:2px"></div>';
      btn.disabled       = true;

      try {
        await TAZA.Http.put(TAZA.API.DELIVERY.CHANGE_STATUS(id), { status });

        if (isDelivered) {
          TAZA.Toast.success(isAr ? 'رائع! تم التسليم بنجاح 🎉' : 'Great! Delivered successfully 🎉');
        } else {
          TAZA.Toast.success(`${statusLabels[status]} ✓`);
        }

        _activeDeliveries = [];
        loadActiveDeliveries();

      } catch(err) {
        TAZA.Toast.apiError(err);
        btn.innerHTML = originalHtml;
        btn.disabled  = false;
      }
    },
    {
      btnText: isDelivered ? (isAr?'نعم، تم التسليم':'Yes, Delivered') : (isAr?'تأكيد':'Confirm'),
      danger:  false,
    }
  );
}
