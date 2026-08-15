'use strict';

// ══════════════════════════════════════════════
// [4] Orders — readable cards and record actions
// ══════════════════════════════════════════════
async function loadOrders(page = 1) {
  const type        = document.getElementById('order-type-filter')?.value ?? '';
  const status      = document.getElementById('order-status-filter')?.value ?? '';
  const recordState = document.getElementById('order-record-filter')?.value ?? 'active';
  const date        = document.getElementById('order-date-filter')?.value ?? '';

  try {
    const params = { page, per_page: 12, record_state: recordState };
    if (type) params.type = type;
    if (status) params.status = status;
    if (date) params.date = date;

    const res = await TAZA.Http.get(TAZA.API.ADMIN_ORDERS.LIST, params);
    _orders = res?.data?.orders ?? [];
    _orderPagination = res?.data?.pagination ?? null;
    renderOrdersGrid(_orders);
    renderDataPagination('orders-pagination', _orderPagination, nextPage => loadOrders(nextPage));
  } catch (e) {
    TAZA.Toast.apiError(e);
  }
}

function gmOrderPaymentLabel(payment, isAr) {
  const labels = {
    cash: { ar: 'نقدي', en: 'Cash' },
    loyalty_points: { ar: 'نقاط الولاء', en: 'Loyalty points' },
    test_payment: { ar: 'دفع اختباري', en: 'Test payment' },
    sham_cash: { ar: 'شام كاش', en: 'Sham Cash' },
    syriatel_cash: { ar: 'سيريتل كاش', en: 'Syriatel Cash' },
  };
  const method = payment?.method;
  return labels[method]?.[isAr ? 'ar' : 'en'] ?? method ?? (isAr ? 'غير مسجل' : 'Not recorded');
}

function gmOrderRecordActions(order, isAr) {
  if (!order.can_manage_record) {
    return `<span class="gm-order-lock-note">
      <i class="fa-solid fa-shield-halved"></i>
      ${isAr ? 'يمكن إدارة السجل بعد اكتماله أو إلغائه' : 'Record actions unlock after completion or cancellation'}
    </span>`;
  }

  return `
    ${order.is_archived ? `
      <button class="btn btn-outline btn-sm" data-order-record-action="restore" data-id="${order.id}">
        <i class="fa-solid fa-box-open"></i>
        ${isAr ? 'إعادة للنشطة' : 'Restore'}
      </button>` : `
      <button class="btn btn-outline btn-sm" data-order-record-action="archive" data-id="${order.id}">
        <i class="fa-solid fa-box-archive"></i>
        ${isAr ? 'أرشفة' : 'Archive'}
      </button>`}
    <button class="btn btn-danger btn-sm" data-order-record-action="delete" data-id="${order.id}">
      <i class="fa-solid fa-trash-can"></i>
      ${isAr ? 'حذف من الموقع' : 'Delete globally'}
    </button>`;
}

function renderOrdersGrid(orders) {
  const grid = document.getElementById('general-orders-grid');
  const isAr = TAZA.Lang.current === 'ar';
  if (!grid) return;

  if (!orders.length) {
    grid.innerHTML = `<div class="empty-state gm-orders-empty">
      <div class="empty-icon">📋</div>
      <div class="empty-title">${isAr ? 'لا توجد طلبات ضمن هذا القسم' : 'No orders in this section'}</div>
      <div class="empty-desc">${isAr ? 'جرّب تغيير حالة السجل أو الفلاتر.' : 'Try changing the record state or filters.'}</div>
    </div>`;
    return;
  }

  const typeIcons = { normal: 'fa-utensils', delivery: 'fa-car-side', reservation: 'fa-chair' };
  grid.innerHTML = orders.map(order => {
    const items = order.items ?? [];
    return `
      <article class="gm-order-card ${order.is_archived ? 'is-archived' : ''}">
        <header class="gm-order-card-header">
          <div class="gm-order-identity">
            <span class="gm-order-icon"><i class="fa-solid ${typeIcons[order.type] ?? 'fa-receipt'}"></i></span>
            <div>
              <span class="gm-order-eyebrow">${isAr ? 'رقم الطلب' : 'Order number'}</span>
              <h2>#${order.id}</h2>
            </div>
          </div>
          <div class="gm-order-badges">
            ${order.is_archived ? `<span class="badge badge-warning"><i class="fa-solid fa-box-archive"></i> ${isAr ? 'مؤرشف' : 'Archived'}</span>` : ''}
            ${TAZA.Utils.statusBadge(order.status)}
          </div>
        </header>

        <div class="gm-order-primary">
          <div class="gm-order-customer">
            <span class="gm-order-label">${isAr ? 'الزبون' : 'Customer'}</span>
            <strong>${TAZA.Utils.escapeHtml(order.customer?.name ?? (isAr ? 'زائر' : 'Guest'))}</strong>
            ${order.customer?.phone ? `<span dir="ltr">${TAZA.Utils.escapeHtml(order.customer.phone)}</span>` : ''}
          </div>
          <div class="gm-order-total">
            <span class="gm-order-label">${isAr ? 'الإجمالي' : 'Total'}</span>
            <strong>${TAZA.Utils.formatMoney(order.final_price)}</strong>
          </div>
        </div>

        <dl class="gm-order-meta">
          <div><dt>${isAr ? 'النوع' : 'Type'}</dt><dd>${TAZA.Utils.escapeHtml(order.type_label ?? order.type)}</dd></div>
          <div><dt>${isAr ? 'الدفع' : 'Payment'}</dt><dd>${TAZA.Utils.escapeHtml(gmOrderPaymentLabel(order.payment, isAr))}</dd></div>
          <div><dt>${isAr ? 'التاريخ' : 'Date'}</dt><dd>${TAZA.Utils.formatDate(order.created_at, { hour: '2-digit', minute: '2-digit' })}</dd></div>
        </dl>

        <section class="gm-order-items">
          <div class="gm-order-section-title">
            <span><i class="fa-solid fa-basket-shopping"></i> ${isAr ? 'محتويات الطلب' : 'Order items'}</span>
            <span>${items.length}</span>
          </div>
          ${items.length ? items.slice(0, 4).map(item => `
            <div class="gm-order-item">
              <span>${TAZA.Utils.escapeHtml(item.name ?? '—')}</span>
              <strong>×${Number(item.quantity ?? 0)}</strong>
              <span>${TAZA.Utils.formatMoney(item.subtotal ?? 0)}</span>
            </div>`).join('') : `<div class="gm-order-no-items">${isAr ? 'لا توجد عناصر مسجلة' : 'No recorded items'}</div>`}
          ${items.length > 4 ? `<div class="gm-order-more">+${items.length - 4} ${isAr ? 'عناصر أخرى' : 'more items'}</div>` : ''}
        </section>

        ${order.notes ? `<div class="gm-order-note"><i class="fa-solid fa-note-sticky"></i><span>${TAZA.Utils.escapeHtml(order.notes)}</span></div>` : ''}

        <footer class="gm-order-card-actions">
          ${gmOrderRecordActions(order, isAr)}
        </footer>
      </article>`;
  }).join('');
}

async function handleGeneralOrderAction(event) {
  const button = event.target.closest('[data-order-record-action]');
  if (!button) return;

  const id = Number(button.dataset.id);
  const action = button.dataset.orderRecordAction;
  const isAr = TAZA.Lang.current === 'ar';
  const copy = {
    archive: {
      question: isAr ? `أرشفة الطلب #${id} وإخفاؤه من السجلات النشطة؟` : `Archive order #${id}?`,
      success: isAr ? 'تمت أرشفة الطلب' : 'Order archived',
      confirm: isAr ? 'أرشفة' : 'Archive',
    },
    restore: {
      question: isAr ? `إعادة الطلب #${id} إلى السجلات النشطة؟` : `Restore order #${id}?`,
      success: isAr ? 'تمت إعادة الطلب' : 'Order restored',
      confirm: isAr ? 'إعادة' : 'Restore',
    },
    delete: {
      question: isAr ? `حذف الطلب #${id} من جميع واجهات الموظفين؟ سيبقى أثره المالي محفوظًا للتدقيق.` : `Delete order #${id} from all staff views? Financial audit data will remain.`,
      success: isAr ? 'تم حذف الطلب من جميع الواجهات' : 'Order removed from all views',
      confirm: isAr ? 'حذف نهائي من الواجهات' : 'Delete from views',
    },
  }[action];
  if (!copy || !id) return;

  TAZA.Confirm.show(copy.question, async () => {
    try {
      button.disabled = true;
      if (action === 'archive') await TAZA.Http.put(TAZA.API.ORDERS.ARCHIVE(id));
      if (action === 'restore') await TAZA.Http.put(TAZA.API.ORDERS.RESTORE(id));
      if (action === 'delete') await TAZA.Http.delete(TAZA.API.ORDERS.DELETE(id));
      TAZA.Toast.success(copy.success);
      await loadOrders(_orderPagination?.current_page ?? 1);
    } catch (error) {
      button.disabled = false;
      TAZA.Toast.apiError(error);
    }
  }, { btnText: copy.confirm, danger: action === 'delete' });
}
