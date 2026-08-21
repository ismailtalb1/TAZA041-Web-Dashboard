'use strict';

// ── Active Deliveries Grid ─────────────────────
async function loadActiveDeliveries() {
  const grid = document.getElementById('active-deliveries-grid');
  const isAr = TAZA.Lang.current === 'ar';
  if (!grid) return;

  try {
    const res   = await TAZA.Http.get(TAZA.API.DELIVERY.ACTIVE);
    _activeDeliveries = [...(res?.data?.deliveries ?? [])].sort((a, b) => {
      const aAssigned = a.driver_id || a.driver?.id ? 1 : 0;
      const bAssigned = b.driver_id || b.driver?.id ? 1 : 0;
      return aAssigned - bAssigned || new Date(a.created_at) - new Date(b.created_at);
    });

    if (!_activeDeliveries.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🛵</div>
        <div class="empty-title">${isAr?'لا توجد طلبات توصيل نشطة':'No active delivery orders'}</div>
      </div>`;
      return;
    }

    grid.innerHTML = _activeDeliveries.map(d => buildDeliveryCard(d)).join('');

  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function buildDeliveryCard(d) {
  const isAr    = TAZA.Lang.current === 'ar';
  const status  = d.status ?? 'pending';
  const hasDriver = !!(d.driver_id || d.driver?.id);

  const nextStatus = null;
  const nextLabel = null;

  return `
    <div class="delivery-card">
      <div class="status-strip ${status}"></div>

      <div class="delivery-card-header">
        <div>
          <span class="delivery-id">#${d.id}</span>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px">
            <i class="fa-regular fa-clock"></i> ${TAZA.Utils.timeAgo(d.created_at)}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${TAZA.Utils.statusBadge(status)}
          <span class="cost-badge">
            <i class="fa-solid fa-money-bill-wave"></i>
            ${TAZA.Utils.formatMoney(d.delivery_cost ?? 0)}
          </span>
        </div>
      </div>

      <!-- Customer info -->
      <div class="delivery-customer">
        <div class="avatar avatar-sm">${TAZA.Utils.initials(d.order?.customer?.name ?? 'Z')}</div>
        <div>
          <div class="delivery-customer-name">${escapeHtml(d.order?.customer?.name ?? (isAr?'زبون':'Customer'))}</div>
          <div class="delivery-customer-phone">${escapeHtml(d.order?.customer?.phone ?? '—')}</div>
        </div>
      </div>

      <!-- Route -->
      <div class="delivery-route">
        <div class="route-point">
          <i class="fa-solid fa-location-dot route-dot-restaurant"></i>
          <span data-lang-ar="المطعم" data-lang-en="Restaurant">المطعم</span>
        </div>
        <i class="fa-solid fa-arrow-left route-arrow"></i>
        <div class="route-point" style="flex:1;overflow:hidden">
          <i class="fa-solid fa-location-dot route-dot-customer"></i>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escapeHtml(d.delivery_address ?? (isAr?'العنوان':'Address'))}
          </span>
        </div>
      </div>

      ${d.distance_meters ? `
        <div class="delivery-distance">
          <i class="fa-solid fa-route"></i> ${(d.distance_meters/1000).toFixed(1)} ${isAr?'كم':'km'}
          &nbsp;·&nbsp;
          <i class="fa-regular fa-clock"></i> ~${Math.round(d.distance_meters / 500)} ${isAr?'دقيقة':'min'}
        </div>` : ''}

      <!-- Driver -->
      <div class="delivery-driver ${hasDriver ? '' : 'is-unassigned'}">
        ${hasDriver ? `
          <div style="display:flex;align-items:center;gap:8px">
            <i class="fa-solid fa-motorcycle" style="color:var(--primary)"></i>
            <span style="font-weight:600">${escapeHtml(d.driver?.name ?? (isAr?'السائق':'Driver'))}</span>
            ${d.driver_rating ? `<span class="driver-stars" style="font-size:.8rem">${'★'.repeat(Math.round(d.driver_rating))}</span>` : ''}
          </div>` : `
          <div style="color:var(--warning);font-weight:600;display:flex;align-items:center;gap:6px">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>${isAr?'لم يُعيَّن سائق بعد':'No driver assigned yet'}</span>
          </div>`
        }
      </div>

      ${TAZA.OrderComment.render(d.order?.notes, { isAr, compact: true })}

      <!-- Actions -->
      <div class="delivery-actions ${!hasDriver && nextStatus ? 'has-two-primary' : ''}">
        ${!hasDriver ? `
          <button class="btn btn-primary btn-sm"
                  data-action="assign" data-id="${d.id}">
            <i class="fa-solid fa-user-plus"></i>
            ${isAr?'تعيين سائق':'Assign Driver'}
          </button>` : ''
        }
        ${nextStatus ? `
          <button class="btn btn-success btn-sm"
                  data-action="change-status" data-id="${d.id}" data-status="${nextStatus}">
            <i class="fa-solid fa-arrow-left"></i> ${nextLabel}
          </button>` : ''
        }
        <button class="btn btn-ghost btn-sm"
                data-action="notify-customer" data-id="${d.id}">
          <i class="fa-solid fa-bell"></i>
        </button>
        <button class="btn btn-danger btn-sm"
                data-action="change-status" data-id="${d.id}" data-status="cancelled"
                title="${isAr?'إلغاء التوصيل واسترجاع الدفع':'Cancel delivery and refund'}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  `;
}

// ── Handle Delivery Actions ────────────────────
async function handleDeliveryAction(e) {
  const btn    = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = parseInt(btn.dataset.id);
  const status = btn.dataset.status;
  const isAr   = TAZA.Lang.current === 'ar';

  if (action === 'assign' && id) {
    const current = _activeDeliveries.find(d => Number(d.id) === id);
    if (current && (current.driver_id || current.driver?.id)) {
      TAZA.Toast.info(isAr ? 'تم تعيين سائق لهذا الطلب مسبقاً' : 'A driver is already assigned to this order');
      return;
    }
    openAssignModal(id);
  }

  if (action === 'change-status' && id && status) {
    const labels = {
      assigned:   isAr?'في الطريق مع السائق':'On the way',
      picked_up:  isAr?'في الطريق مع السائق':'On the way',
      in_delivery:isAr?'في الطريق مع السائق':'On the way',
      delivered:  isAr?'تم التسليم':'Delivered',
      cancelled:  isAr?'إلغاء التوصيل واسترجاع الدفع':'Cancel and refund',
    };
    TAZA.Confirm.show(
      `${isAr?'تغيير الحالة إلى:':'Change status to:'} "${labels[status]}"?`,
      async () => {
        try {
          const response = await TAZA.Http.put(TAZA.API.DELIVERY.CHANGE_STATUS(id), { status });
          const refund = response?.data?.refund;
          const restored = Number(refund?.loyalty_points_restored || 0);
          const money = Number(refund?.money_refunded || 0);
          const settlement = status !== 'cancelled' ? ''
            : restored > 0
              ? (isAr ? ` · أُعيدت ${restored} نقطة` : ` · ${restored} points returned`)
              : money > 0
                ? ` · ${TAZA.Utils.formatMoney(money)}`
                : (isAr ? ' · تمت تسوية الدفع' : ' · Payment settled');
          TAZA.Toast.success(`${labels[status]} ✓${settlement}`);
          _activeDeliveries = [];
          _allDeliveries    = [];
          loadActiveDeliveries();
          loadLiveBoard();
        } catch(err) { TAZA.Toast.apiError(err); }
      },
      { danger: status === 'cancelled' }
    );
  }

  if (action === 'notify-customer' && id) {
    document.getElementById('notify-delivery-id').value = id;
    document.getElementById('notify-cust-msg').value    = '';
    openModal('modal-notify-cust');
  }
}
