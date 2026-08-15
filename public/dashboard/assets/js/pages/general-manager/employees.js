'use strict';

// ══════════════════════════════════════════════
// [2] Employees
// ══════════════════════════════════════════════
let _activeEmployeeRoleFilter = '';

const escapeHtml = TAZA.Utils.escapeHtml;

function renderDataPagination(containerId, pagination, onPage) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.replaceChildren();
  const current = Number(pagination?.current_page ?? 1);
  const last = Number(pagination?.last_page ?? 1);
  const total = Number(pagination?.total ?? 0);
  const from = Number(pagination?.from ?? 0);
  const to = Number(pagination?.to ?? 0);
  const isAr = TAZA.Lang.current === 'ar';

  const summary = document.createElement('span');
  summary.className = 'data-pagination-summary';
  summary.textContent = isAr
    ? `عرض ${from.toLocaleString('ar-SY')}–${to.toLocaleString('ar-SY')} من ${total.toLocaleString('ar-SY')}`
    : `Showing ${from.toLocaleString('en-US')}–${to.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`;
  container.appendChild(summary);

  if (last <= 1) return;

  const controls = document.createElement('div');
  controls.className = 'data-pagination-controls';
  const addButton = (label, targetPage, disabled = false, active = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-sm ${active ? 'btn-primary' : 'btn-outline'}`;
    button.textContent = label;
    button.disabled = disabled;
    if (active) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => onPage(targetPage));
    controls.appendChild(button);
  };

  addButton(isAr ? 'السابق' : 'Previous', current - 1, current <= 1);
  const firstPage = Math.max(1, current - 2);
  const lastPage = Math.min(last, current + 2);
  for (let page = firstPage; page <= lastPage; page += 1) {
    addButton(String(page), page, false, page === current);
  }
  addButton(isAr ? 'التالي' : 'Next', current + 1, current >= last);
  container.appendChild(controls);
}

function normalizeEmployeePayload(isEdit = false) {
  const payload = {
    name:     document.getElementById('emp-name').value.trim(),
    username: document.getElementById('emp-username').value.trim(),
    role:     document.getElementById('emp-role').value,
  };

  const email = document.getElementById('emp-email').value.trim();
  const phone = document.getElementById('emp-phone').value.trim();
  const pass  = document.getElementById('emp-password').value.trim();
  const confirmation = document.getElementById('emp-password-confirmation').value.trim();
  const managerPassword = document.getElementById('emp-manager-password')?.value ?? '';

  payload.email = email || null;
  payload.phone = phone || null;
  if (pass) {
    payload.password = pass;
    payload.password_confirmation = confirmation;
  }
  if (isEdit) payload.is_active = document.getElementById('emp-is-active').value === '1';
  payload.manager_password = managerPassword;

  return { payload, pass, confirmation, managerPassword };
}

function renderEmployeeAvatarPreview(employee = null, previewUrl = '') {
  const preview = document.getElementById('emp-avatar-preview');
  if (!preview) return;

  preview.replaceChildren();
  const source = previewUrl || employee?.avatar || '';
  if (source) {
    const image = document.createElement('img');
    image.src = TAZA.Media.url(source);
    image.alt = employee?.name ?? '';
    image.style.cssText = 'width:100%;height:100%;object-fit:cover';
    image.onerror = () => {
      preview.replaceChildren();
      preview.textContent = TAZA.Utils.initials(employee?.name ?? document.getElementById('emp-name')?.value ?? '');
    };
    preview.appendChild(image);
  } else {
    preview.textContent = TAZA.Utils.initials(employee?.name ?? document.getElementById('emp-name')?.value ?? '');
  }

  const removeButton = document.getElementById('emp-avatar-remove');
  if (removeButton) removeButton.style.display = employee?.avatar ? '' : 'none';
}

function previewEmployeeAvatar(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const isAr = TAZA.Lang.current === 'ar';
  if (!TAZA.Utils.isImageFile(file) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    TAZA.Toast.warning(isAr ? 'اختر صورة JPG أو PNG أو WebP' : 'Choose a JPG, PNG, or WebP image');
    event.target.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    TAZA.Toast.warning(isAr ? 'حجم الصورة يجب ألا يتجاوز 5 ميغابايت' : 'Image size must not exceed 5 MB');
    event.target.value = '';
    return;
  }

  renderEmployeeAvatarPreview(null, URL.createObjectURL(file));
}

async function requestEmployeeUpdate(id, payload) {
  try {
    return await TAZA.Http.put(TAZA.API.EMPLOYEES.UPDATE(id), payload);
  } catch (err) {
    // احتياطي: بعض بيئات التشغيل المحلية أو إعدادات CORS قد تمنع PUT/PATCH.
    if ([405, 419, 0, undefined].includes(err?.status)) {
      return await TAZA.Http.post(TAZA.API.EMPLOYEES.UPDATE(id), payload);
    }
    throw err;
  }
}

async function loadEmployees(role = _activeEmployeeRoleFilter) {
  try {
    _activeEmployeeRoleFilter = role || '';
    const params = _activeEmployeeRoleFilter ? { role: _activeEmployeeRoleFilter } : {};
    const res = await TAZA.Http.get(TAZA.API.EMPLOYEES.LIST, params);
    _employees = res?.data?.all ?? res?.data?.employees ?? [];
    renderEmployees(_employees);
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function renderEmployees(emps) {
  const grid = document.getElementById('employees-grid');
  const countEl = document.getElementById('employee-results-count');
  const isAr = TAZA.Lang.current === 'ar';

  const search = document.getElementById('emp-search')?.value.toLowerCase() ?? '';
  const filtered = search
    ? emps.filter(e => e.name?.toLowerCase().includes(search) || e.username?.toLowerCase().includes(search))
    : emps;

  if (countEl) {
    countEl.textContent = isAr
      ? `${filtered.length.toLocaleString('ar-SY')} موظف${search ? ' مطابق' : ''}`
      : `${filtered.length.toLocaleString('en-US')} employee${filtered.length === 1 ? '' : 's'}${search ? ' found' : ''}`;
  }

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state employee-empty-state" style="grid-column:1/-1">
      <div class="empty-icon"><i class="fa-solid fa-user-group"></i></div>
      <div class="empty-title">${search
        ? (isAr ? 'لا توجد نتائج مطابقة للبحث' : 'No employees match your search')
        : (isAr ? 'لا يوجد موظفون' : 'No employees found')}</div>
      <p>${isAr ? 'جرّب تغيير عبارة البحث أو فلتر الصلاحية.' : 'Try changing the search term or role filter.'}</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(emp => {
    const id = Number(emp.id);
    const name = escapeHtml(emp.name ?? '—');
    const roleLabel = escapeHtml(emp.role_label ?? emp.role ?? '—');
    const phone = escapeHtml(emp.phone ?? '—');
    const email = escapeHtml(emp.email ?? '—');
    const avatar = emp.avatar ? escapeHtml(emp.avatar) : '';
    const username = escapeHtml(emp.username ? `@${emp.username}` : (isAr ? 'بدون اسم مستخدم' : 'No username'));
    const roleIcons = {
      order_manager: 'fa-bag-shopping',
      delivery_manager: 'fa-truck-fast',
      inventory_manager: 'fa-boxes-stacked',
      finance_manager: 'fa-chart-line',
      communication_manager: 'fa-comments',
      driver: 'fa-car-side',
    };
    const roleIcon = roleIcons[emp.role] ?? 'fa-user-tie';

    return `
    <article class="emp-card ${emp.is_active ? 'is-active' : 'is-inactive'}" data-employee-id="${id}" data-role="${escapeHtml(emp.role ?? '')}">
      <div class="emp-card-accent" aria-hidden="true"></div>
      <div class="emp-card-header">
        <div class="avatar avatar-lg emp-avatar">
          ${avatar
            ? `<img src="${avatar}" alt="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <span${avatar ? ' style="display:none"' : ''}>${escapeHtml(TAZA.Utils.initials(emp.name))}</span>
          <span class="emp-presence-dot" title="${emp.is_active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطّل' : 'Inactive')}"></span>
        </div>
        <div class="emp-card-info">
          <h4>${name}</h4>
          <p><i class="fa-solid ${roleIcon}"></i>${roleLabel}</p>
          <span class="emp-username">${username}</span>
        </div>
        <span class="badge emp-status ${emp.is_active ? 'badge-success' : 'badge-danger'}">
          <i class="fa-solid fa-circle"></i>
          ${emp.is_active ? (isAr?'نشط':'Active') : (isAr?'معطّل':'Inactive')}
        </span>
      </div>

      <div class="emp-contact-list">
        <div class="emp-contact" title="${phone}">
          <span class="emp-contact-icon"><i class="fa-solid fa-phone"></i></span>
          <span class="emp-contact-copy"><small>${isAr ? 'رقم الهاتف' : 'Phone'}</small><strong>${phone}</strong></span>
        </div>
        <div class="emp-contact" title="${email}">
          <span class="emp-contact-icon"><i class="fa-regular fa-envelope"></i></span>
          <span class="emp-contact-copy"><small>${isAr ? 'البريد الإلكتروني' : 'Email'}</small><strong>${email}</strong></span>
        </div>
      </div>

      <div class="emp-card-actions">
        <button type="button" class="btn btn-outline btn-sm emp-edit-action" data-emp-action="edit" data-emp-id="${id}">
          <i class="fa-solid fa-pen"></i> ${isAr ? 'تعديل' : 'Edit'}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" data-emp-action="notify" data-emp-id="${id}" title="${isAr ? 'إرسال إشعار' : 'Send notification'}" aria-label="${isAr ? 'إرسال إشعار' : 'Send notification'}">
          <i class="fa-solid fa-bell"></i>
        </button>
        <button type="button" class="btn btn-danger btn-sm" data-emp-action="fire" data-emp-id="${id}" title="${isAr ? 'إنهاء الخدمة' : 'Terminate'}" aria-label="${isAr ? 'إنهاء الخدمة' : 'Terminate'}">
          <i class="fa-solid fa-user-minus"></i>
        </button>
      </div>
    </article>`;
  }).join('');
}

// Employee search
document.getElementById('emp-search')?.addEventListener('input', () => renderEmployees(_employees));

// Role filter chips
document.getElementById('emp-role-filter')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  document.querySelectorAll('#emp-role-filter .filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  loadEmployees(chip.dataset.role || '');
});

function openAddEmpModal() {
  document.getElementById('emp-modal-id').value   = '';
  document.getElementById('emp-name').value        = '';
  document.getElementById('emp-username').value    = '';
  document.getElementById('emp-password').value    = '';
  document.getElementById('emp-password-confirmation').value = '';
  document.getElementById('emp-manager-password').value = '';
  document.getElementById('emp-role').value        = '';
  document.getElementById('emp-email').value       = '';
  document.getElementById('emp-phone').value       = '';
  document.getElementById('emp-avatar-file').value = '';
  document.getElementById('emp-is-active').value   = '1';
  document.getElementById('emp-active-group').style.display = 'none';
  document.getElementById('emp-modal-title').textContent = TAZA.Lang.current === 'ar' ? 'موظف جديد' : 'New Employee';
  document.getElementById('pass-required').style.display = 'inline';
  document.getElementById('pass-confirm-required').style.display = 'inline';
  renderEmployeeAvatarPreview();
  openModal('emp-modal');
}

async function openEditEmpModal(id) {
  id = Number(id);
  let emp = _employees.find(e => Number(e.id) === id);

  // في حال كانت القائمة مفلترة أو لم تكن محملة، نجلب بيانات الموظف مباشرة من الـ API
  if (!emp) {
    try {
      const res = await TAZA.Http.get(TAZA.API.EMPLOYEES.SHOW(id));
      emp = res?.data?.employee;
    } catch (e) {
      TAZA.Toast.apiError(e);
      return;
    }
  }
  if (!emp) return;

  const isAr = TAZA.Lang.current === 'ar';
  document.getElementById('emp-modal-id').value   = emp.id;
  document.getElementById('emp-name').value        = emp.name     ?? '';
  document.getElementById('emp-username').value    = emp.username ?? '';
  document.getElementById('emp-password').value    = '';
  document.getElementById('emp-password-confirmation').value = '';
  document.getElementById('emp-manager-password').value = '';
  document.getElementById('emp-role').value        = emp.role     ?? '';
  document.getElementById('emp-email').value       = emp.email    ?? '';
  document.getElementById('emp-phone').value       = emp.phone    ?? '';
  document.getElementById('emp-avatar-file').value = '';
  document.getElementById('emp-is-active').value   = emp.is_active ? '1' : '0';
  document.getElementById('emp-active-group').style.display = '';
  document.getElementById('emp-modal-title').textContent = isAr ? 'تعديل موظف' : 'Edit Employee';
  document.getElementById('pass-required').style.display = 'none';
  document.getElementById('pass-confirm-required').style.display = 'none';
  renderEmployeeAvatarPreview(emp);
  openModal('emp-modal');
}

async function saveEmployee() {
  const id       = document.getElementById('emp-modal-id').value;
  const isEdit   = !!id;
  const isAr     = TAZA.Lang.current === 'ar';
  const btn      = document.getElementById('emp-save-btn');

  const { payload, pass, confirmation, managerPassword } = normalizeEmployeePayload(isEdit);

  if (!payload.name || !payload.username || !payload.role) {
    TAZA.Toast.warning(isAr ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
    return;
  }
  if (!isEdit && !pass) {
    TAZA.Toast.warning(isAr ? 'كلمة المرور مطلوبة' : 'Password is required');
    return;
  }
  if (pass && pass !== confirmation) {
    TAZA.Toast.warning(isAr ? 'تأكيد كلمة المرور غير متطابق' : 'Password confirmation does not match');
    return;
  }
  if (pass && pass.length < 6) {
    TAZA.Toast.warning(isAr ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters');
    return;
  }
  if (!managerPassword) {
    TAZA.Toast.warning(isAr ? 'أدخل كلمة مرور المدير العام لتأكيد العملية' : 'Enter the general manager password to confirm');
    document.getElementById('emp-manager-password')?.focus();
    return;
  }

  TAZA.Utils.disableBtn(btn);
  try {
    let response;
    if (isEdit) {
      response = await requestEmployeeUpdate(id, payload);
    } else {
      response = await TAZA.Http.post(TAZA.API.EMPLOYEES.STORE, payload);
    }

    const employeeId = response?.data?.employee?.id ?? id;
    const avatarFile = document.getElementById('emp-avatar-file').files?.[0];
    if (avatarFile && employeeId) {
      const formData = new FormData();
      formData.append('image', avatarFile);
      formData.append('manager_password', managerPassword);
      await TAZA.Http.upload(TAZA.API.EMPLOYEES.UPLOAD_AVATAR(employeeId), formData);
    }

    TAZA.Toast.success(isEdit
      ? (isAr ? 'تم تحديث بيانات الموظف' : 'Employee updated')
      : (isAr ? 'تم إنشاء الحساب بنجاح' : 'Employee created'));
    closeModal('emp-modal');
    _employees = [];
    await loadEmployees(_activeEmployeeRoleFilter);
  } catch(e) {
    TAZA.Toast.apiError(e);
  } finally {
    TAZA.Utils.enableBtn(btn);
  }
}

function removeEmployeeAvatar() {
  const id = document.getElementById('emp-modal-id').value;
  const isAr = TAZA.Lang.current === 'ar';
  if (!id) {
    document.getElementById('emp-avatar-file').value = '';
    renderEmployeeAvatarPreview();
    return;
  }

  TAZA.Confirm.show(
    isAr ? 'هل تريد حذف صورة هذا الموظف؟' : 'Remove this employee photo?',
    async () => {
      try {
        const managerPassword = document.getElementById('emp-manager-password')?.value ?? '';
        if (!managerPassword) {
          TAZA.Toast.warning(isAr ? 'أدخل كلمة مرور المدير العام أولاً' : 'Enter the general manager password first');
          document.getElementById('emp-manager-password')?.focus();
          return;
        }
        const response = await TAZA.Http.delete(TAZA.API.EMPLOYEES.UPLOAD_AVATAR(id), { manager_password: managerPassword });
        const employee = response?.data?.employee;
        document.getElementById('emp-avatar-file').value = '';
        renderEmployeeAvatarPreview(employee);
        _employees = _employees.map(item => Number(item.id) === Number(id) ? employee : item);
        TAZA.Toast.success(isAr ? 'تم حذف صورة الموظف' : 'Employee photo removed');
      } catch (error) {
        TAZA.Toast.apiError(error);
      }
    },
    { danger: true, btnText: isAr ? 'حذف الصورة' : 'Remove Photo' }
  );
}

function openFireModal(id, name) {
  document.getElementById('fire-emp-id').value = id;
  document.getElementById('fire-reason').value  = '';
  document.getElementById('fire-manager-password').value = '';
  openModal('fire-modal');
}

async function confirmFire() {
  const id     = document.getElementById('fire-emp-id').value;
  const reason = document.getElementById('fire-reason').value.trim();
  const managerPassword = document.getElementById('fire-manager-password')?.value ?? '';
  const isAr   = TAZA.Lang.current === 'ar';

  if (!reason) {
    TAZA.Toast.warning(isAr ? 'سبب الإقالة مطلوب' : 'Reason is required');
    return;
  }
  if (!managerPassword) {
    TAZA.Toast.warning(isAr ? 'أدخل كلمة مرور المدير العام لتأكيد الإقالة' : 'Enter the general manager password to confirm termination');
    document.getElementById('fire-manager-password')?.focus();
    return;
  }

  try {
    await TAZA.Http.delete(TAZA.API.EMPLOYEES.DELETE(id), { reason, manager_password: managerPassword });
    TAZA.Toast.success(isAr ? 'تم إقالة الموظف' : 'Employee fired');
    closeModal('fire-modal');
    _employees = [];
    await loadEmployees(_activeEmployeeRoleFilter);
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function openNotifyEmpModal(id, name) {
  document.getElementById('notify-emp-id').value = id;
  document.getElementById('notify-title').value   = '';
  document.getElementById('notify-message').value = '';
  openModal('notify-emp-modal');
}

async function sendNotifToEmp() {
  const id      = document.getElementById('notify-emp-id').value;
  const title   = document.getElementById('notify-title').value.trim();
  const message = document.getElementById('notify-message').value.trim();
  const isAr    = TAZA.Lang.current === 'ar';

  if (!title || !message) {
    TAZA.Toast.warning(isAr ? 'العنوان والرسالة مطلوبان' : 'Title and message required');
    return;
  }

  try {
    await TAZA.Http.post(TAZA.API.EMPLOYEES.NOTIFY(id), { title, message });
    TAZA.Toast.success(isAr ? 'تم إرسال الإشعار' : 'Notification sent');
    closeModal('notify-emp-modal');
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}
