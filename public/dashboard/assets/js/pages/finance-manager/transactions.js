'use strict';

// ═══════════════════════════════════════════
// [3] Transactions
// ═══════════════════════════════════════════
async function loadTransactions() {
  const method = document.getElementById('tx-method-filter')?.value ?? '';
  const status = document.getElementById('tx-status-filter')?.value ?? '';
  const date   = document.getElementById('tx-date-filter')?.value   ?? '';
  const tbody  = document.getElementById('transactions-tbody');
  const isAr   = TAZA.Lang.current === 'ar';

  try {
    const params = {};
    if (method) params.method = method;
    if (status) params.status = status;
    if (date)   params.date   = date;

    const res   = await TAZA.Http.get(TAZA.API.FINANCE.PAYMENTS, params);
    _transactions = res?.data?.payments ?? [];
    const stats   = res?.data?.stats    ?? {};
    renderTxStats(stats);
    renderTransactionsTable(_transactions);
  } catch(e) { TAZA.Toast.apiError(e); }
}

function renderTxStats(stats) {
  const isAr  = TAZA.Lang.current === 'ar';
  const row   = document.getElementById('tx-stats-row');
  if (!row) return;
  row.innerHTML = `
    <div class="stat-card" style="padding:14px">
      <div style="font-size:.72rem;color:var(--text-muted)">${isAr?'إجمالي المعاملات':'Total'}</div>
      <div style="font-size:1.4rem;font-weight:700">${stats.total ?? 0}</div>
    </div>
    <div class="stat-card" style="padding:14px">
      <div style="font-size:.72rem;color:var(--text-muted)">${isAr?'ناجحة':'Completed'}</div>
      <div style="font-size:1.4rem;font-weight:700;color:var(--success)">${stats.completed ?? 0}</div>
    </div>
    <div class="stat-card" style="padding:14px">
      <div style="font-size:.72rem;color:var(--text-muted)">${isAr?'المجموع':'Total Amount'}</div>
      <div style="font-size:1rem;font-weight:700;color:var(--primary)">${TAZA.Utils.formatMoney(stats.total_amount ?? 0)}</div>
    </div>
    <div class="stat-card" style="padding:14px">
      <div style="font-size:.72rem;color:var(--text-muted)">${isAr?'مستردة':'Refunded'}</div>
      <div style="font-size:1.4rem;font-weight:700;color:var(--warning)">${stats.refunded ?? 0}</div>
    </div>
  `;
}

function renderTransactionsTable(txs) {
  const tbody = document.getElementById('transactions-tbody');
  const isAr  = TAZA.Lang.current === 'ar';

  if (!txs.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-title">${isAr?'لا توجد معاملات':'No transactions'}</div>
    </div></td></tr>`;
    return;
  }

  const methodCls = {
    cash:'tx-method-cash', syriatel_cash:'tx-method-syriatel',
    sham_cash:'tx-method-sham', loyalty_points:'tx-method-loyalty',
  };

  tbody.innerHTML = txs.map(tx => `
    <tr>
      <td style="font-weight:700;color:var(--primary)">#${tx.id}</td>
      <td style="font-size:.82rem">#${tx.order_id ?? '—'}</td>
      <td style="font-size:.82rem">${escapeHtml(tx.customer_name ?? (isAr?'زبون':'Customer'))}</td>
      <td>
        <span class="tx-method-badge ${methodCls[tx.method] ?? ''}">
          ${tx.method_label ?? tx.method}
        </span>
      </td>
      <td style="font-weight:700">${TAZA.Utils.formatMoney(tx.amount)}</td>
      <td>${TAZA.Utils.statusBadge(tx.status)}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${TAZA.Utils.timeAgo(tx.created_at)}</td>
      <td>
        ${tx.status === 'completed' ? `
          <button class="btn btn-warning btn-sm"
                  data-action="refund-tx" data-id="${tx.id}">
            <i class="fa-solid fa-rotate-left"></i>
            ${isAr?'استرداد':'Refund'}
          </button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function handleTxAction(e) {
  const btn    = e.target.closest('[data-action]');
  if (!btn || btn.dataset.action !== 'refund-tx') return;
  const id    = parseInt(btn.dataset.id);
  const isAr  = TAZA.Lang.current === 'ar';

  TAZA.Confirm.show(
    isAr ? 'تأكيد استرداد هذه العملية؟' : 'Confirm refund this transaction?',
    async () => {
      try {
        await TAZA.Http.post(TAZA.API.FINANCE.PAYMENT_REFUND(id));
        TAZA.Toast.success(isAr ? 'تم الاسترداد بنجاح' : 'Refund successful');
        _transactions = []; loadTransactions();
      } catch(err) { TAZA.Toast.apiError(err); }
    },
    { danger: true, btnText: isAr ? 'تأكيد الاسترداد' : 'Confirm Refund' }
  );
}
