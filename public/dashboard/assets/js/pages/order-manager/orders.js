'use strict';

// ══════════════════════════════════════════════
// [2] Orders — build card
// ══════════════════════════════════════════════
const escapeHtml = TAZA.Utils.escapeHtml;

function productNotesFromOrder(order = {}) {
  const notes = String(order.notes || '');
  const marker = notes.match(/(?:ملاحظات المنتجات|Item notes)\s*:/i);
  if (!marker) return {};

  return notes
    .slice((marker.index || 0) + marker[0].length)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .reduce((acc, line) => {
      const separator = line.indexOf(':');
      if (separator <= 0) return acc;
      const name = line.slice(0, separator).trim().toLowerCase();
      const note = line.slice(separator + 1).trim();
      if (name && note) acc[name] = note;
      return acc;
    }, {});
}

function itemProductNote(item = {}, notesMap = {}) {
  const direct = item.special_note || item.specialNote || item.note || item.notes || '';
  if (direct) return direct;
  const name = String(item.name || '').trim().toLowerCase();
  return name ? (notesMap[name] || '') : '';
}

function itemProductNoteHtml(item = {}, notesMap = {}) {
  const note = itemProductNote(item, notesMap);
  if (!note) return '';
  const isAr = TAZA.Lang.current === 'ar';
  return `
    <div class="order-item-note" style="flex:1 0 100%;margin-top:4px;color:var(--warning);font-size:.72rem">
      <i class="fa-solid fa-note-sticky"></i>
      <span>${isAr ? 'تعليق المنتج:' : 'Item note:'}</span>
      ${escapeHtml(note)}
    </div>`;
}

function buildOrderCard(order, urgent = false) {
  const isAr  = TAZA.Lang.current === 'ar';
  const items = order.items ?? [];
  const productNotes = productNotesFromOrder(order);
  const age   = getOrderAge(order.created_at);

  const ageClass = age < 10 ? 'fresh' : age < 25 ? 'normal' : 'late';
  const ageText  = `${age} ${isAr ? 'دقيقة' : 'min'}`;

  const nextStatus   = getNextStatus(order.status);
  const nextLabel    = getManagerStatusLabel(nextStatus, isAr);
  const nextBtnClass = nextStatus === 'ready'
    ? 'btn-success' : nextStatus === 'confirmed'
    ? 'btn-primary' : 'btn-outline';

  return `
    <div class="order-card ${urgent ? 'urgent' : 'normal-type'} ${order.is_archived ? 'is-archived' : ''}">
      <div class="order-card-header">
        <div class="order-card-headline">
          <span class="order-id">#${order.id}</span>
          ${urgent ? `<span class="order-timer ${ageClass}"><i class="fa-regular fa-clock"></i>${ageText}</span>` : ''}
        </div>
        <div class="order-card-summary">
          ${order.is_archived ? `<span class="badge badge-warning"><i class="fa-solid fa-box-archive"></i> ${isAr ? 'مؤرشف' : 'Archived'}</span>` : ''}
          <span class="badge badge-info" style="font-size:.68rem">${order.type_label ?? order.type ?? ''}</span>
          ${TAZA.Utils.statusBadge(order.status)}
          <span class="order-total">
            ${TAZA.Utils.formatMoney(order.final_price)}
          </span>
        </div>
      </div>

      <div class="order-customer-meta">
        <i class="fa-solid fa-user"></i>
        <span>${escapeHtml(order.customer?.name ?? (isAr?'زبون':'Customer'))}</span>
        <span>·</span>
        <i class="fa-regular fa-clock"></i>
        <span>${TAZA.Utils.timeAgo(order.created_at)}</span>
      </div>

      <div class="order-items-list">
        ${items.slice(0, 3).map(item => `
          <div class="order-item-row">
            <span class="order-item-name">${escapeHtml(item.name ?? '—')}</span>
            <span class="order-item-qty">×${item.quantity}</span>
            <span class="order-item-price">
              ${TAZA.Utils.formatMoney(item.subtotal ?? 0)}
            </span>
            ${itemProductNoteHtml(item, productNotes)}
          </div>
        `).join('')}
        ${items.length > 3
          ? `<div class="order-more-items">
              + ${items.length - 3} ${isAr ? 'عناصر أخرى' : 'more items'}
             </div>`
          : ''
        }
      </div>

      ${order.notes ? `
        <div class="order-note">
          <i class="fa-solid fa-note-sticky"></i> ${escapeHtml(order.notes)}
        </div>` : ''}

      <div class="order-actions">
        ${!order.is_archived && nextStatus ? `
          <button class="btn ${nextBtnClass} btn-sm"
                  data-action="change-status"
                  data-id="${order.id}"
                  data-status="${nextStatus}">
            <i class="fa-solid fa-arrow-right-long"></i>
            ${nextLabel}
          </button>` : ''
        }
        <button class="btn btn-ghost btn-sm"
                data-action="view-detail" data-id="${order.id}"
                title="${isAr ? 'التفاصيل' : 'Details'}">
          <i class="fa-solid fa-eye"></i>
        </button>
        ${!order.is_archived ? `<button class="btn btn-ghost btn-sm"
                data-action="notify-customer" data-id="${order.id}"
                title="${isAr ? 'إشعار الزبون' : 'Notify Customer'}">
          <i class="fa-solid fa-bell"></i>
        </button>` : ''}
        ${!order.is_archived && !['completed', 'cancelled'].includes(order.status) ? `
          <button class="btn btn-danger btn-sm"
                  data-action="change-status"
                  data-id="${order.id}"
                  data-status="cancelled">
            <i class="fa-solid fa-xmark"></i>
          </button>` : ''
        }
        ${order.can_manage_record ? (order.is_archived ? `
          <button class="btn btn-outline btn-sm record-action-btn"
                  data-action="restore-record" data-id="${order.id}">
            <i class="fa-solid fa-box-open"></i>
            ${isAr ? 'إعادة للنشطة' : 'Restore'}
          </button>` : `
          <button class="btn btn-outline btn-sm record-action-btn"
                  data-action="archive-record" data-id="${order.id}">
            <i class="fa-solid fa-box-archive"></i>
            ${isAr ? 'أرشفة' : 'Archive'}
          </button>`) : ''}
        ${order.can_manage_record ? `
          <button class="btn btn-danger btn-sm record-action-btn"
                  data-action="delete-record" data-id="${order.id}">
            <i class="fa-solid fa-trash-can"></i>
            ${isAr ? 'حذف' : 'Delete'}
          </button>` : ''}
      </div>
    </div>
  `;
}

function getNextStatus(current) {
  const flow = {
    pending:   'confirmed',
    confirmed: 'ready',
    ready:     'completed',
  };
  return flow[current] ?? null;
}

function getManagerStatusLabel(status, isAr = TAZA.Lang.current === 'ar') {
  const labels = {
    pending:   { ar: 'معلق', en: 'Pending' },
    confirmed: { ar: 'مؤكد', en: 'Confirmed' },
    ready:     { ar: 'قيد التجهيز', en: 'Preparing' },
    completed: { ar: 'مكتمل', en: 'Completed' },
    cancelled: { ar: 'إلغاء', en: 'Cancel' },
  };
  return labels[status]?.[isAr ? 'ar' : 'en'] ?? status;
}

function getOrderAge(createdAt) {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
}

function cancellationSettlementLabel(refund, isAr = TAZA.Lang.current === 'ar') {
  const restored = Number(refund?.loyalty_points_restored || 0);
  const money = Number(refund?.money_refunded || 0);
  if (restored > 0) return isAr ? `أُعيدت ${restored} نقطة للزبون` : `${restored} points returned`;
  if (money > 0) return isAr ? `تمت تسوية ${TAZA.Utils.formatMoney(money)}` : `${TAZA.Utils.formatMoney(money)} refunded`;
  if (refund?.kind === 'uncollected_cash') return isAr ? 'لم يُحصّل مبلغ نقدي' : 'No cash was collected';
  if (refund?.kind === 'test_payment') return isAr ? 'أُلغي الدفع الاختباري' : 'Test payment reversed';
  return isAr ? 'تمت تسوية الدفع' : 'Payment settled';
}

// ── Handle Order Actions (Event Delegation) ────────
async function handleOrderAction(e) {
  const btn    = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = parseInt(btn.dataset.id);
  const status = btn.dataset.status;
  const isAr   = TAZA.Lang.current === 'ar';

  if (action === 'change-status' && id && status) {
    const label = getManagerStatusLabel(status, isAr);
    TAZA.Confirm.show(
      `${isAr ? 'تغيير حالة الطلب إلى:' : 'Change order status to:'} "${label}" ?`,
      async () => {
        try {
          const response = await TAZA.Http.put(TAZA.API.ORDERS.CHANGE_STATUS(id), { status });
          const settlement = status === 'cancelled'
            ? ` · ${cancellationSettlementLabel(response?.data?.refund, isAr)}`
            : '';
          TAZA.Toast.success(`${isAr ? 'تم تحديث حالة الطلب' : 'Order status updated'} → ${label}${settlement}`);
          // تحديث العرض
          _orders = [];
          if (_activeTab === 'overview') loadPendingOrders();
          else loadAllOrders();
        } catch(err) { TAZA.Toast.apiError(err); }
      },
      { btnText: label, danger: status === 'cancelled' }
    );
  }

  if (action === 'view-detail' && id) {
    openOrderDetail(id);
  }

  if (action === 'notify-customer' && id) {
    openNotifyModal(id);
  }

  if (['archive-record', 'restore-record', 'delete-record'].includes(action) && id) {
    manageOrderRecord(id, action, btn);
  }
}

function manageOrderRecord(id, action, button) {
  const isAr = TAZA.Lang.current === 'ar';
  const copy = {
    'archive-record': {
      question: isAr ? `أرشفة الطلب #${id} وإخفاؤه من السجلات النشطة؟` : `Archive order #${id}?`,
      confirm: isAr ? 'أرشفة' : 'Archive',
      success: isAr ? 'تمت أرشفة الطلب' : 'Order archived',
    },
    'restore-record': {
      question: isAr ? `إعادة الطلب #${id} إلى السجلات النشطة؟` : `Restore order #${id}?`,
      confirm: isAr ? 'إعادة' : 'Restore',
      success: isAr ? 'تمت إعادة الطلب' : 'Order restored',
    },
    'delete-record': {
      question: isAr ? `حذف الطلب #${id} من جميع واجهات الموظفين؟ سيبقى السجل المالي محفوظًا للتدقيق.` : `Delete order #${id} from every staff view? Financial audit data will remain.`,
      confirm: isAr ? 'حذف من الواجهات' : 'Delete from views',
      success: isAr ? 'تم حذف الطلب من جميع الواجهات' : 'Order removed from all views',
    },
  }[action];

  TAZA.Confirm.show(copy.question, async () => {
    try {
      button.disabled = true;
      if (action === 'archive-record') await TAZA.Http.put(TAZA.API.ORDERS.ARCHIVE(id));
      if (action === 'restore-record') await TAZA.Http.put(TAZA.API.ORDERS.RESTORE(id));
      if (action === 'delete-record') await TAZA.Http.delete(TAZA.API.ORDERS.DELETE(id));
      TAZA.Toast.success(copy.success);
      await loadAllOrders();
    } catch (error) {
      button.disabled = false;
      TAZA.Toast.apiError(error);
    }
  }, { btnText: copy.confirm, danger: action === 'delete-record' });
}

async function loadAllOrders() {
  const status = document.getElementById('orders-status-filter')?.value ?? '';
  const recordState = document.getElementById('orders-record-filter')?.value ?? 'active';
  const date   = document.getElementById('orders-date-filter')?.value   ?? '';
  const grid   = document.getElementById('orders-grid');
  const isAr   = TAZA.Lang.current === 'ar';

  try {
    const params = { record_state: recordState };
    if (status) params.status = status;
    if (date)   params.date   = date;

    const res = await TAZA.Http.get(TAZA.API.ORDERS.LIST, params);
    _orders   = res?.data?.orders ?? [];
    renderOrdersGrid(_orders);
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function filterOrdersLocally() {
  const search = document.getElementById('orders-search')?.value.toLowerCase() ?? '';
  const filtered = search
    ? _orders.filter(o =>
        String(o.id).includes(search) ||
        o.customer?.name?.toLowerCase().includes(search))
    : _orders;
  renderOrdersGrid(filtered);
}

function renderOrdersGrid(orders) {
  const grid = document.getElementById('orders-grid');
  const isAr = TAZA.Lang.current === 'ar';

  if (!orders.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📋</div>
      <div class="empty-title">${isAr ? 'لا توجد طلبات' : 'No orders found'}</div>
    </div>`;
    return;
  }

  grid.innerHTML = orders.map(o => buildOrderCard(o, o.status === 'pending')).join('');
}

// ── Order Detail Modal ─────────────────────────────
async function openOrderDetail(id) {
  const isAr    = TAZA.Lang.current === 'ar';
  const content = document.getElementById('order-detail-content');
  const title   = document.getElementById('detail-modal-title');

  title.textContent = `${isAr ? 'طلب رقم' : 'Order'} #${id}`;
  content.innerHTML = `<div class="flex-center" style="min-height:120px">
    <div class="loader-ring"></div></div>`;
  openModal('modal-order-detail');

  try {
    const res   = await TAZA.Http.get(TAZA.API.ORDERS.SHOW(id));
    const order = res?.data?.order ?? {};
    const items = order.items ?? [];
    const pay   = order.payment_record;
    const productNotes = productNotesFromOrder(order);

    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div>
          <div style="font-size:.75rem;color:var(--text-muted)">${isAr?'الزبون':'Customer'}</div>
          <div style="font-weight:600">${escapeHtml(order.customer?.name ?? '—')}</div>
        </div>
        <div>
          <div style="font-size:.75rem;color:var(--text-muted)">${isAr?'الحالة':'Status'}</div>
          ${TAZA.Utils.statusBadge(order.status)}
        </div>
        <div>
          <div style="font-size:.75rem;color:var(--text-muted)">${isAr?'وقت الطلب':'Order Time'}</div>
          <div style="font-weight:600">${TAZA.Utils.formatDate(order.created_at,{hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <div>
          <div style="font-size:.75rem;color:var(--text-muted)">${isAr?'الإجمالي':'Total'}</div>
          <div style="font-weight:700;color:var(--primary)">${TAZA.Utils.formatMoney(order.final_price)}</div>
        </div>
      </div>
      <div class="divider"></div>
      <div style="font-weight:600;margin-bottom:8px">${isAr?'العناصر':'Items'}</div>
      ${items.map(item => `
        <div class="order-item-row">
          <span class="order-item-name">${escapeHtml(item.name)}</span>
          <span class="order-item-qty">×${Number(item.quantity ?? 0)}</span>
          <span>${TAZA.Utils.formatMoney(item.subtotal)}</span>
          ${itemProductNoteHtml(item, productNotes)}
        </div>`).join('')}
      ${pay ? `
        <div class="divider"></div>
        <div style="display:flex;justify-content:space-between;font-size:.825rem">
          <span style="color:var(--text-muted)">${isAr?'طريقة الدفع':'Payment'}</span>
          <span class="badge badge-${pay.status==='completed'?'success':'warning'}">${escapeHtml(pay.method_label ?? pay.method)}</span>
        </div>` : ''}
      ${order.notes ? `
        <div class="divider"></div>
        <div style="font-size:.8rem;color:var(--text-secondary)">
          <i class="fa-solid fa-note-sticky" style="color:var(--warning)"></i> ${escapeHtml(order.notes)}
        </div>` : ''}
    `;
  } catch(err) {
    content.innerHTML = `<div class="empty-state">
      <div class="empty-icon">❌</div>
      <div class="empty-desc">${isAr?'تعذر تحميل التفاصيل':'Failed to load details'}</div>
    </div>`;
  }
}

// ── Notify Customer Modal ──────────────────────────
function openNotifyModal(orderId) {
  document.getElementById('notify-order-id').value = orderId;
  document.getElementById('notify-cust-title').value   = '';
  document.getElementById('notify-cust-message').value = '';
  openModal('modal-notify-customer');
}

async function sendCustomerNotification() {
  const orderId = document.getElementById('notify-order-id').value;
  const title   = document.getElementById('notify-cust-title').value.trim();
  const message = document.getElementById('notify-cust-message').value.trim();
  const isAr    = TAZA.Lang.current === 'ar';

  if (!title || !message) {
    TAZA.Toast.warning(isAr ? 'العنوان والرسالة مطلوبان' : 'Title and message required');
    return;
  }

  try {
    await TAZA.Http.post(TAZA.API.ORDERS.NOTIFY_CUSTOMER(orderId), { title, message });
    TAZA.Toast.success(isAr ? 'تم إرسال الإشعار للزبون' : 'Notification sent to customer');
    closeModal('modal-notify-customer');
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}
