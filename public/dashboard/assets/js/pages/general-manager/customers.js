'use strict';

// ══════════════════════════════════════════════
// [3] Customers
// ══════════════════════════════════════════════
async function loadCustomers(chipEl = null, page = 1) {
  if (chipEl) {
    document.querySelectorAll('#tab-customers .filter-chip').forEach(c => c.classList.remove('active'));
    chipEl.classList.add('active');
  }

  const activeChip = document.querySelector('#tab-customers .filter-chip.active');
  const filter     = activeChip?.dataset.filter ?? 'all';
  const search     = document.getElementById('cust-search')?.value.trim() ?? '';
  const isAr       = TAZA.Lang.current === 'ar';

  try {
    const params = { filter, page, per_page: 25 };
    if (search) params.search = search;

    const res = await TAZA.Http.get(TAZA.API.CUSTOMERS.LIST, params);
    _customers = res?.data?.customers ?? [];
    _customerPagination = res?.data?.pagination ?? null;
    renderCustomersTable(_customers);
    renderDataPagination('customers-pagination', _customerPagination, nextPage => loadCustomers(null, nextPage));
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

document.getElementById('cust-search')?.addEventListener('input',
  TAZA.Utils.debounce(() => loadCustomers(), 400));

function renderCustomersTable(customers) {
  const tbody = document.getElementById('customers-tbody');
  const isAr  = TAZA.Lang.current === 'ar';

  if (!customers.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <div class="empty-icon">👤</div>
      <div class="empty-title">${isAr ? 'لا يوجد زبائن' : 'No customers'}</div>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = customers.map(c => {
    const securityLabels = {
      safe:      { ar:'آمن', en:'Safe', css:'badge-success', icon:'fa-shield-halved' },
      watch:     { ar:'تحت المراقبة', en:'Watch', css:'badge-warning', icon:'fa-eye' },
      high_risk: { ar:'خطورة عالية', en:'High risk', css:'badge-danger', icon:'fa-triangle-exclamation' },
      blocked:   { ar:'محظور', en:'Blocked', css:'badge-danger', icon:'fa-ban' },
    };
    const security = securityLabels[c.security_status] || securityLabels.safe;
    const ipInfo = c.last_ip_address
      ? `<small style="display:block;margin-top:4px;color:var(--text-muted);direction:ltr">IP: ${escapeHtml(c.last_ip_address)}${c.is_ip_blocked ? ' · blocked' : ''}</small>`
      : '';

    const statusBadge = c.is_banned
      ? `<span class="badge badge-danger">${isAr?'محظور':'Banned'}</span>`
      : `<span class="badge badge-success">${isAr?'نشط':'Active'}</span>`;

    const tierColors = { bronze:'#CD7F32', silver:'#94A3B8', gold:'#F59E0B', platinum:'#A78BFA' };
    const tierColor  = tierColors[c.loyalty_tier] ?? 'var(--text-muted)';

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar avatar-sm">${escapeHtml(TAZA.Utils.initials(c.name))}</div>
          <div>
            <div style="font-weight:600;font-size:.85rem">${escapeHtml(c.name ?? '—')}</div>
            <div style="font-size:.72rem;color:var(--text-muted)">${escapeHtml(c.email ?? '—')}</div>
          </div>
        </div>
      </td>
      <td style="font-size:.82rem">${escapeHtml(c.phone ?? '—')}</td>
      <td><span style="font-weight:700">${c.total_orders ?? 0}</span></td>
      <td style="font-size:.82rem">${TAZA.Utils.formatMoney(c.total_spent ?? 0)}</td>
      <td><span style="font-weight:700;color:var(--primary)">${c.loyalty_points ?? 0} ${isAr?'نقطة':'pts'}</span></td>
      <td><span style="color:${tierColor};font-weight:700;font-size:.8rem">${c.loyalty_tier?.toUpperCase() ?? '—'}</span></td>
      <td><span class="badge ${security.css}"><i class="fa-solid ${security.icon}"></i> ${isAr ? security.ar : security.en}</span>${ipInfo}</td>
      <td>${statusBadge}</td>
      <td>
        <div class="tbl-actions">
          <button class="btn btn-warning btn-sm" onclick="openCustomerWarningModal(${c.id})" title="${isAr?'إرسال تحذير مناسب للحالة':'Send status-aware warning'}">
            <i class="fa-solid fa-triangle-exclamation"></i> ${isAr?'تحذير':'Warn'}
          </button>
          ${c.is_banned
            ? `<button class="btn btn-success btn-sm" onclick="unbanCustomer(${c.id})">
                <i class="fa-solid fa-unlock"></i> ${isAr?'رفع':'Unban'}
               </button>`
            : `<button class="btn btn-danger btn-sm" onclick="openBanModal(${c.id})">
                <i class="fa-solid fa-ban"></i> ${isAr?'حظر':'Ban'}
               </button>`
          }
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openBanModal(id) {
  document.getElementById('ban-cust-id').value = id;
  document.getElementById('ban-reason').value  = '';
  openModal('ban-modal');
}

async function confirmBan() {
  const id     = document.getElementById('ban-cust-id').value;
  const reason = document.getElementById('ban-reason').value.trim();
  const isAr   = TAZA.Lang.current === 'ar';

  if (!reason) {
    TAZA.Toast.warning(isAr ? 'سبب الحظر مطلوب' : 'Reason required');
    return;
  }

  try {
    await TAZA.Http.post(TAZA.API.CUSTOMERS.BAN(id), { reason });
    TAZA.Toast.success(isAr ? 'تم حظر الزبون' : 'Customer banned');
    closeModal('ban-modal');
    _customers = [];
    loadCustomers();
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

async function unbanCustomer(id) {
  const isAr = TAZA.Lang.current === 'ar';
  TAZA.Confirm.show(
    isAr ? 'هل تريد رفع الحظر عن هذا الزبون؟' : 'Unban this customer?',
    async () => {
      try {
        await TAZA.Http.post(TAZA.API.CUSTOMERS.UNBAN(id));
        TAZA.Toast.success(isAr ? 'تم رفع الحظر' : 'Customer unbanned');
        _customers = [];
        loadCustomers();
      } catch(e) {
        TAZA.Toast.apiError(e);
      }
    }
  );
}

function openBroadcastModal() {
  document.getElementById('broadcast-title').value   = '';
  document.getElementById('broadcast-message').value = '';
  openModal('broadcast-modal');
}

async function sendBroadcast() {
  const title   = document.getElementById('broadcast-title').value.trim();
  const message = document.getElementById('broadcast-message').value.trim();
  const isAr    = TAZA.Lang.current === 'ar';

  if (!title || !message) {
    TAZA.Toast.warning(isAr ? 'العنوان والرسالة مطلوبان' : 'Title and message required');
    return;
  }

  try {
    const res = await TAZA.Http.post(TAZA.API.CUSTOMERS.BROADCAST, { title, message });
    TAZA.Toast.success(`${isAr?'تم الإرسال لـ':'Sent to'} ${res?.data?.sent_to ?? 0} ${isAr?'زبون':'customers'}`);
    closeModal('broadcast-modal');
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function openCustomerWarningModal(id) {
  const customer = _customers.find(item => Number(item.id) === Number(id));
  if (!customer) return;
  const isAr = TAZA.Lang.current === 'ar';
  const labels = {
    safe: isAr ? 'آمن' : 'Safe',
    watch: isAr ? 'تحت المراقبة' : 'Watch',
    high_risk: isAr ? 'خطورة عالية' : 'High risk',
    blocked: isAr ? 'محظور' : 'Blocked',
  };
  document.getElementById('warning-cust-id').value = customer.id;
  document.getElementById('warning-title').value = customer.security_warning?.title || '';
  document.getElementById('warning-message').value = customer.security_warning?.message || '';
  document.getElementById('warning-security-status').textContent = labels[customer.security_status] || labels.safe;
  openModal('customer-warning-modal');
}

async function sendCustomerWarning() {
  const id = document.getElementById('warning-cust-id').value;
  const title = document.getElementById('warning-title').value.trim();
  const message = document.getElementById('warning-message').value.trim();
  const isAr = TAZA.Lang.current === 'ar';
  if (!title || message.length < 10) {
    TAZA.Toast.warning(isAr ? 'أكمل عنوان التحذير ونصه' : 'Complete the warning title and message');
    return;
  }
  try {
    await TAZA.Http.post(TAZA.API.CUSTOMERS.WARNING(id), { title, message });
    TAZA.Toast.success(isAr ? 'تم إرسال التحذير للزبون' : 'Warning sent to customer');
    closeModal('customer-warning-modal');
  } catch (e) {
    TAZA.Toast.apiError(e);
  }
}
