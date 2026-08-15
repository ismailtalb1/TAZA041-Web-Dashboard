'use strict';

// ═══════════════════════════════════════════
// [2] Accounts
// ═══════════════════════════════════════════
async function loadAccounts() {
  try {
    const res  = await TAZA.Http.get(TAZA.API.FINANCE.ACCOUNTS);
    _accounts  = res?.data?.accounts ?? res?.accounts ?? [];
    renderAccountsGrid(_accounts);
    checkNearCapacityAlert(res?.data ?? {});
  } catch(e) { TAZA.Toast.apiError(e); }
}

function renderAccountsGrid(accounts) {
  const grid = document.getElementById('accounts-grid');
  if (!accounts.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🏦</div>
      <div class="empty-title">${TAZA.Lang.current === 'ar' ? 'لا توجد حسابات بعد' : 'No accounts yet'}</div>
    </div>`;
    return;
  }
  grid.innerHTML = accounts.map(a => buildAccountCard(a)).join('');
}

function buildAccountCard(acc, compact = false) {
  const isAr    = TAZA.Lang.current === 'ar';
  const pct     = acc.max_balance > 0
    ? Math.round((acc.current_balance / acc.max_balance) * 100)
    : 0;
  const near    = pct >= 80;
  const barColor= pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--primary)';

  const typeIcons = {
    syriatel_cash: { icon:'📱', cls:'syriatel', label: isAr?'سيريتل كاش':'Syriatel Cash' },
    sham_cash:     { icon:'💳', cls:'sham',     label: isAr?'شام كاش':'Sham Cash' },
  };
  const ti = typeIcons[acc.type] ?? { icon:'💰', cls:'syriatel', label: acc.type };

  return `
    <div class="account-card ${acc.is_primary ? 'primary-account' : ''} ${near ? 'near-capacity' : ''}">
      <div class="account-header">
        <div class="account-type-icon ${ti.cls}">${ti.icon}</div>
        <div style="flex:1;min-width:0">
          <div class="account-name">${escapeHtml(acc.account_name)}</div>
          <div class="account-number">${escapeHtml(acc.account_number)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${acc.is_primary ? `<span class="badge badge-primary" style="font-size:.62rem">
            ⭐ ${isAr?'أساسي':'Primary'}</span>` : ''}
          <span class="badge ${acc.is_active?'badge-success':'badge-danger'}" style="font-size:.62rem">
            ${acc.is_active ? (isAr?'نشط':'Active') : (isAr?'معطّل':'Inactive')}
          </span>
        </div>
      </div>

      <div class="account-balance">${TAZA.Utils.formatMoney(acc.current_balance)}</div>
      <div class="balance-label">
        ${isAr?'من':'from'} ${TAZA.Utils.formatMoney(acc.max_balance)}
        ${near ? `<span style="color:var(--warning);font-weight:600;margin-right:6px">⚠️ ${isAr?'قريب من الامتلاء':'Near capacity'}</span>` : ''}
      </div>

      <div class="capacity-bar">
        <div class="capacity-pct">
          <span>${ti.label}</span>
          <span style="color:${barColor};font-weight:700">${pct}%</span>
        </div>
        <div class="progress" style="height:6px">
          <div class="progress-bar" style="width:${pct}%;background:${barColor}"></div>
        </div>
      </div>

      ${!compact ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
          <button class="btn btn-outline btn-sm" style="flex:1"
                  data-action="edit-account" data-id="${acc.id}">
            <i class="fa-solid fa-pen"></i> ${isAr?'تعديل':'Edit'}
          </button>
          <button class="btn btn-ghost btn-sm"
                  data-action="update-balance" data-id="${acc.id}"
                  data-name="${acc.account_name}" data-balance="${acc.current_balance}"
                  title="${isAr?'تحديث الرصيد':'Update Balance'}">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn btn-ghost btn-sm"
                  data-action="withdraw" data-id="${acc.id}"
                  data-name="${acc.account_name}" data-balance="${acc.current_balance}"
                  title="${isAr?'سحب':'Withdraw'}">
            <i class="fa-solid fa-money-bill-transfer"></i>
          </button>
          ${!acc.is_primary ? `
            <button class="btn btn-ghost btn-sm"
                    data-action="make-primary" data-id="${acc.id}"
                    title="${isAr?'جعله أساسي':'Make Primary'}">
              <i class="fa-solid fa-star"></i>
            </button>
            <button class="btn btn-danger btn-sm"
                    data-action="delete-account" data-id="${acc.id}" data-name="${acc.account_name}">
              <i class="fa-solid fa-trash"></i>
            </button>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

async function handleAccountAction(e) {
  const btn    = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = parseInt(btn.dataset.id);
  const isAr   = TAZA.Lang.current === 'ar';

  if (action === 'edit-account')  openEditAccountModal(id);
  if (action === 'update-balance') openBalanceModal(id, btn.dataset.name, parseFloat(btn.dataset.balance));
  if (action === 'withdraw')      openWithdrawModal(id, btn.dataset.name, parseFloat(btn.dataset.balance));
  if (action === 'make-primary') {
    try {
      await TAZA.Http.patch(TAZA.API.FINANCE.ACCOUNT_PRIMARY(id));
      TAZA.Toast.success(isAr ? 'تم تعيينه كحساب أساسي' : 'Set as primary account');
      _accounts = []; loadAccounts();
    } catch(err) { TAZA.Toast.apiError(err); }
  }
  if (action === 'delete-account') {
    TAZA.Confirm.show(
      `${isAr?'حذف حساب':'Delete account'} "${btn.dataset.name}"?`,
      async () => {
        try {
          await TAZA.Http.delete(TAZA.API.FINANCE.ACCOUNT_DELETE(id));
          TAZA.Toast.success(isAr ? 'تم حذف الحساب' : 'Account deleted');
          _accounts = []; loadAccounts();
        } catch(err) { TAZA.Toast.apiError(err); }
      },
      { danger: true }
    );
  }
}

// Account CRUD Modals
function openAddAccountModal() {
  document.getElementById('account-modal-id').value       = '';
  document.getElementById('account-type').value           = '';
  document.getElementById('account-name').value           = '';
  document.getElementById('account-number').value         = '';
  document.getElementById('account-max-balance').value    = '';
  document.getElementById('account-current-balance').value= '';
  document.getElementById('account-type').disabled        = false;
  document.getElementById('account-modal-title').textContent =
    TAZA.Lang.current === 'ar' ? 'حساب جديد' : 'New Account';
  openModal('modal-account');
}

function openEditAccountModal(id) {
  const acc  = _accounts.find(a => a.id === id);
  if (!acc) return;
  const isAr = TAZA.Lang.current === 'ar';
  document.getElementById('account-modal-id').value       = acc.id;
  document.getElementById('account-type').value           = acc.type;
  document.getElementById('account-type').disabled        = true;
  document.getElementById('account-name').value           = acc.account_name   ?? '';
  document.getElementById('account-number').value         = acc.account_number ?? '';
  document.getElementById('account-max-balance').value    = acc.max_balance    ?? '';
  document.getElementById('account-current-balance').value= '';
  document.getElementById('account-modal-title').textContent = isAr ? 'تعديل حساب' : 'Edit Account';
  openModal('modal-account');
}

async function saveAccount() {
  const id     = document.getElementById('account-modal-id').value;
  const isEdit = !!id;
  const isAr   = TAZA.Lang.current === 'ar';
  const btn    = document.getElementById('save-account-btn');

  const payload = {
    account_name:   document.getElementById('account-name').value.trim(),
    account_number: document.getElementById('account-number').value.trim(),
    max_balance:    parseFloat(document.getElementById('account-max-balance').value),
  };
  if (!isEdit) {
    payload.type = document.getElementById('account-type').value;
    const curr   = document.getElementById('account-current-balance').value;
    if (curr) payload.current_balance = parseFloat(curr);
  }

  if (!payload.account_name || !payload.account_number || isNaN(payload.max_balance) ||
      (!isEdit && !payload.type)) {
    TAZA.Toast.warning(isAr ? 'يرجى ملء الحقول المطلوبة' : 'Fill required fields');
    return;
  }

  TAZA.Utils.disableBtn(btn);
  try {
    if (isEdit) {
      await TAZA.Http.put(TAZA.API.FINANCE.ACCOUNT_UPDATE(id), payload);
      TAZA.Toast.success(isAr ? 'تم تحديث الحساب' : 'Account updated');
    } else {
      await TAZA.Http.post(TAZA.API.FINANCE.ACCOUNT_STORE, payload);
      TAZA.Toast.success(isAr ? 'تم إضافة الحساب' : 'Account added');
    }
    closeModal('modal-account');
    _accounts = []; loadAccounts(); loadOverview();
  } catch(e) { TAZA.Toast.apiError(e); }
  finally    { TAZA.Utils.enableBtn(btn); }
}

function openBalanceModal(id, name, current) {
  document.getElementById('balance-account-id').value   = id;
  document.getElementById('balance-account-name').textContent = name;
  document.getElementById('balance-current').textContent  = TAZA.Utils.formatMoney(current);
  document.getElementById('balance-new-value').value     = current;
  openModal('modal-balance');
}

async function saveBalance() {
  const id  = parseInt(document.getElementById('balance-account-id').value);
  const val = parseFloat(document.getElementById('balance-new-value').value);
  const isAr = TAZA.Lang.current === 'ar';
  const btn  = document.getElementById('save-balance-btn');

  if (isNaN(val) || val < 0) {
    TAZA.Toast.warning(isAr ? 'أدخل قيمة صحيحة' : 'Enter valid value');
    return;
  }
  TAZA.Utils.disableBtn(btn);
  try {
    await TAZA.Http.patch(TAZA.API.FINANCE.ACCOUNT_BALANCE(id), { balance: val });
    TAZA.Toast.success(isAr ? 'تم تحديث الرصيد' : 'Balance updated');
    closeModal('modal-balance');
    _accounts = []; loadAccounts(); loadOverview();
  } catch(e) { TAZA.Toast.apiError(e); }
  finally    { TAZA.Utils.enableBtn(btn); }
}

function openWithdrawModal(id, name, balance) {
  document.getElementById('withdraw-account-id').value          = id;
  document.getElementById('withdraw-account-name').textContent  = name;
  document.getElementById('withdraw-available').textContent     = TAZA.Utils.formatMoney(balance);
  document.getElementById('withdraw-amount').value              = '';
  document.getElementById('withdraw-reason').value              = '';
  openModal('modal-withdraw');
}

async function confirmWithdraw() {
  const id     = parseInt(document.getElementById('withdraw-account-id').value);
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  const isAr   = TAZA.Lang.current === 'ar';
  const btn    = document.getElementById('confirm-withdraw-btn');

  if (isNaN(amount) || amount <= 0) {
    TAZA.Toast.warning(isAr ? 'أدخل مبلغ صحيح' : 'Enter valid amount');
    return;
  }
  TAZA.Utils.disableBtn(btn);
  try {
    await TAZA.Http.post(TAZA.API.FINANCE.ACCOUNT_WITHDRAW(id), { amount });
    TAZA.Toast.success(`${isAr?'تم سحب':'Withdrew'} ${TAZA.Utils.formatMoney(amount)}`);
    closeModal('modal-withdraw');
    _accounts = []; loadAccounts(); loadOverview();
  } catch(e) { TAZA.Toast.apiError(e); }
  finally    { TAZA.Utils.enableBtn(btn); }
}
