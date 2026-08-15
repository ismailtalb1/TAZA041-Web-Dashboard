'use strict';

// ربط أزرار الموظفين بطريقة آمنة حتى لا نعتمد فقط على onclick داخل HTML
document.getElementById('emp-add-btn')?.addEventListener('click', openAddEmpModal);
document.getElementById('employees-grid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-emp-action]');
  if (!btn) return;

  const id = Number(btn.dataset.empId);
  const emp = _employees.find(item => Number(item.id) === id);
  const name = emp?.name ?? '';

  if (btn.dataset.empAction === 'edit') {
    openEditEmpModal(id);
  } else if (btn.dataset.empAction === 'notify') {
    openNotifyEmpModal(id, name);
  } else if (btn.dataset.empAction === 'fire') {
    openFireModal(id, name);
  }
});

// تصدير الدوال المطلوبة للـ inline onclick القديمة الموجودة في الصفحة
Object.assign(window, {
  openAddEmpModal,
  openEditEmpModal,
  saveEmployee,
  openFireModal,
  confirmFire,
  openNotifyEmpModal,
  sendNotifToEmp,
  openModal,
  closeModal,
});

  function openAddEmpModal() {
    console.log('[TAZA] openAddEmpModal called');

    // تحقق من كل عنصر قبل الاستخدام
    const fields = {
      'emp-modal-id': '', 'emp-name': '', 'emp-username': '',
      'emp-password': '', 'emp-password-confirmation': '', 'emp-manager-password': '', 'emp-role': '', 'emp-email': '', 'emp-phone': ''
    };

    for (const [id, val] of Object.entries(fields)) {
      const el = document.getElementById(id);
      if (!el) { console.error('[TAZA] Element missing:', id); continue; }
      el.value = val;
    }

    const titleEl = document.getElementById('emp-modal-title');
    if (titleEl) titleEl.textContent = TAZA.Lang.current === 'ar' ? 'موظف جديد' : 'New Employee';

    const passReq = document.getElementById('pass-required');
    if (passReq) passReq.style.display = 'inline';

    openModal('emp-modal');
  }

  function openEditEmpModal(id) {
    console.log('[TAZA] openEditEmpModal called, id:', id, typeof id);

    const emp = _employees.find(e => e.id === id || e.id === String(id) || String(e.id) === String(id));
    if (!emp) {
      console.error('[TAZA] Employee not found in _employees. Array:', _employees, 'Looking for id:', id);
      return;
    }

    const isAr = TAZA.Lang.current === 'ar';
    const map = {
      'emp-modal-id': emp.id, 'emp-name': emp.name ?? '', 'emp-username': emp.username ?? '',
      'emp-password': '', 'emp-password-confirmation': '', 'emp-manager-password': '', 'emp-role': emp.role ?? '', 'emp-email': emp.email ?? '',
      'emp-phone': emp.phone ?? ''
    };

    for (const [elId, val] of Object.entries(map)) {
      const el = document.getElementById(elId);
      if (el) el.value = val;
    }

    const titleEl = document.getElementById('emp-modal-title');
    if (titleEl) titleEl.textContent = isAr ? 'تعديل موظف' : 'Edit Employee';

    const passReq = document.getElementById('pass-required');
    if (passReq) passReq.style.display = 'none';

    openModal('emp-modal');
  }

// ══ تأكيد التصدير للـ Global Scope ══════════════
window.openModal          = openModal;
window.closeModal         = closeModal;
window.openAddEmpModal    = openAddEmpModal;
window.openEditEmpModal   = openEditEmpModal;
window.openFireModal      = openFireModal;
window.openNotifyEmpModal = openNotifyEmpModal;
window.openBanModal       = openBanModal;
window.openBroadcastModal = openBroadcastModal;
window.openSendReportModal= openSendReportModal;
window.switchTab          = switchTab;

// ══ اختبار فوري ══════════════════════════════════
console.log('[TAZA] Functions exported:', {
  openModal:       typeof window.openModal,
  openAddEmpModal: typeof window.openAddEmpModal,
  emp_modal_exists: !!document.getElementById('emp-modal'),
});
