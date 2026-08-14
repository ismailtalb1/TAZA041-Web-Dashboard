/* =====================================================================
   TAZA 041 — Shared employee profile features
   Keeps every employee dashboard on the same profile behaviour.
   ===================================================================== */
(function () {
  'use strict';

  if (!window.TAZA) return;

  const Profile = {
    _busy: false,
    _loadPromise: null,
    _networkWarningShown: false,

    init() {
      this.enhanceForm();
      this.render(TAZA.Auth.getUser());

      document.addEventListener('click', (event) => {
        const saveButton = event.target.closest('#save-profile-btn');
        if (saveButton) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.save(saveButton);
          return;
        }

        const removeButton = event.target.closest('#remove-profile-avatar-btn');
        if (removeButton) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.confirmRemoveAvatar();
          return;
        }

        const profileTab = event.target.closest('[data-tab="profile"]');
        if (profileTab) setTimeout(() => this.load(), 0);
      }, true);

      document.addEventListener('change', (event) => {
        if (event.target?.id !== 'avatar-input') return;
        event.stopImmediatePropagation();
        this.uploadAvatar(event.target);
      }, true);

      if (document.getElementById('tab-profile')?.classList.contains('active')) {
        this.load();
      }
    },

    enhanceForm() {
      const profileTab = document.getElementById('tab-profile');
      const layout = profileTab?.querySelector('.profile-layout');
      if (!profileTab || !layout || layout.dataset.unifiedProfile === 'true') return;

      layout.dataset.unifiedProfile = 'true';
      layout.classList.add('employee-profile-layout');
      layout.innerHTML = `
        <aside class="employee-profile-identity">
          <div class="employee-profile-cover" aria-hidden="true"></div>
          <div class="employee-profile-avatar avatar avatar-xl" id="profile-avatar"></div>
          <div class="employee-profile-name" id="profile-name-display">—</div>
          <div class="employee-profile-role" id="profile-role-display">—</div>
          <div class="employee-profile-state" id="profile-account-state"><i class="fa-solid fa-circle-check"></i><span data-lang-ar="حساب نشط" data-lang-en="Active account">حساب نشط</span></div>
          <div class="employee-profile-facts">
            <div><i class="fa-solid fa-at"></i><span data-lang-ar="اسم المستخدم" data-lang-en="Username">اسم المستخدم</span><strong id="profile-username-display">—</strong></div>
            <div><i class="fa-regular fa-calendar"></i><span data-lang-ar="عضو منذ" data-lang-en="Member since">عضو منذ</span><strong id="profile-created-display">—</strong></div>
            <div id="profile-rating-fact" hidden><i class="fa-solid fa-star"></i><span data-lang-ar="التقييم" data-lang-en="Rating">التقييم</span><strong id="profile-rating-display">—</strong></div>
          </div>
          <div class="employee-profile-photo-actions">
            <label class="btn btn-outline" for="avatar-input">
              <i class="fa-solid fa-camera"></i><span data-lang-ar="تغيير الصورة" data-lang-en="Change photo">تغيير الصورة</span>
              <input type="file" id="avatar-input" accept="image/jpeg,image/png,image/webp" hidden>
            </label>
            <button class="btn btn-outline" type="button" id="remove-profile-avatar-btn">
              <i class="fa-solid fa-trash-can"></i><span data-lang-ar="حذف الصورة" data-lang-en="Remove photo">حذف الصورة</span>
            </button>
          </div>
          <p class="employee-profile-photo-hint" data-lang-ar="تغيير الصورة أو حذفها يحتاج كلمة المرور الحالية." data-lang-en="Changing or removing the photo requires your current password.">تغيير الصورة أو حذفها يحتاج كلمة المرور الحالية.</p>
        </aside>

        <div class="employee-profile-editor">
          <div class="employee-profile-intro">
            <span class="employee-profile-intro-icon"><i class="fa-solid fa-shield-halved"></i></span>
            <div><strong data-lang-ar="ملف شخصي موحّد وآمن" data-lang-en="A unified, secure profile">ملف شخصي موحّد وآمن</strong><p data-lang-ar="يمكن لصاحب الحساب تعديل بياناته بعد تأكيد كلمة مروره. يستطيع المدير العام إدارة حسابات الموظفين من شاشة الموظفين فقط." data-lang-en="The account owner can edit these details after confirming their password. The general manager manages staff accounts only from the Employees screen.">يمكن لصاحب الحساب تعديل بياناته بعد تأكيد كلمة مروره. يستطيع المدير العام إدارة حسابات الموظفين من شاشة الموظفين فقط.</p></div>
          </div>

          <section class="employee-profile-section" aria-labelledby="profile-personal-heading">
            <div class="employee-profile-section-heading"><span><i class="fa-solid fa-address-card"></i></span><div><h3 id="profile-personal-heading" data-lang-ar="البيانات الشخصية" data-lang-en="Personal information">البيانات الشخصية</h3><p data-lang-ar="الاسم ووسائل التواصل الخاصة بالحساب" data-lang-en="Name and account contact details">الاسم ووسائل التواصل الخاصة بالحساب</p></div></div>
            <div class="employee-profile-fields">
              <div class="form-group"><label class="form-label" for="profile-name" data-lang-ar="الاسم الكامل" data-lang-en="Full name">الاسم الكامل</label><input type="text" class="form-control" id="profile-name" maxlength="255" autocomplete="name" required></div>
              <div class="form-group"><label class="form-label" for="profile-username" data-lang-ar="اسم المستخدم" data-lang-en="Username">اسم المستخدم</label><input type="text" class="form-control" id="profile-username" readonly aria-readonly="true"><small data-lang-ar="يعدّله المدير العام فقط" data-lang-en="Only the general manager can change it">يعدّله المدير العام فقط</small></div>
              <div class="form-group"><label class="form-label" for="profile-email" data-lang-ar="البريد الإلكتروني" data-lang-en="Email">البريد الإلكتروني</label><input type="email" class="form-control" id="profile-email" autocomplete="email" inputmode="email"></div>
              <div class="form-group"><label class="form-label" for="profile-phone" data-lang-ar="رقم الهاتف" data-lang-en="Phone">رقم الهاتف</label><input type="tel" class="form-control" id="profile-phone" autocomplete="tel" inputmode="tel"></div>
            </div>
          </section>

          <section class="employee-profile-section employee-profile-security" aria-labelledby="profile-security-heading">
            <div class="employee-profile-section-heading"><span><i class="fa-solid fa-lock"></i></span><div><h3 id="profile-security-heading" data-lang-ar="الأمان وكلمة المرور" data-lang-en="Security and password">الأمان وكلمة المرور</h3><p data-lang-ar="أدخل كلمة المرور الحالية لحفظ أي تغيير؛ واترك الجديدة فارغة إن لم ترد تغييرها." data-lang-en="Enter your current password to save any change; leave the new password blank to keep it.">أدخل كلمة المرور الحالية لحفظ أي تغيير؛ واترك الجديدة فارغة إن لم ترد تغييرها.</p></div></div>
            <div class="employee-profile-fields employee-profile-password-fields">
              <div class="form-group"><label class="form-label" for="profile-current-pass" data-lang-ar="كلمة المرور الحالية" data-lang-en="Current password">كلمة المرور الحالية <span class="required">*</span></label><input type="password" class="form-control" id="profile-current-pass" autocomplete="current-password" required></div>
              <div class="form-group"><label class="form-label" for="profile-new-pass" data-lang-ar="كلمة المرور الجديدة" data-lang-en="New password">كلمة المرور الجديدة</label><input type="password" class="form-control" id="profile-new-pass" minlength="6" autocomplete="new-password"></div>
              <div class="form-group"><label class="form-label" for="profile-confirm-pass" data-lang-ar="تأكيد كلمة المرور الجديدة" data-lang-en="Confirm new password">تأكيد كلمة المرور الجديدة</label><input type="password" class="form-control" id="profile-confirm-pass" minlength="6" autocomplete="new-password"></div>
            </div>
          </section>

          <div class="employee-profile-footer"><p><i class="fa-solid fa-key"></i><span data-lang-ar="لن تُرسل كلمة المرور أو تظهر لأي موظف آخر." data-lang-en="Your password is never shown or sent to another employee.">لن تُرسل كلمة المرور أو تظهر لأي موظف آخر.</span></p><button class="btn btn-primary" type="button" id="save-profile-btn"><i class="fa-solid fa-floppy-disk"></i><span data-lang-ar="حفظ التغييرات" data-lang-en="Save changes">حفظ التغييرات</span></button></div>
        </div>
      `;

      TAZA.Lang.apply(TAZA.Lang.current);
    },

    async load() {
      if (!document.getElementById('tab-profile')) return;
      if (this._loadPromise) return this._loadPromise;

      this.render(TAZA.Auth.getUser());
      this._loadPromise = (async () => {
        try {
          const response = await TAZA.Http.get(TAZA.API.AUTH.ME);
          const employee = response?.data?.employee;
          if (employee) {
            TAZA.Auth.save(TAZA.Auth.getToken(), employee);
            this.render(employee, response?.data?.extras ?? {});
          }
          this._networkWarningShown = false;
        } catch (error) {
          if (error?.status === 401) return;
          const isNetworkError = error instanceof TypeError || /failed to fetch|network/i.test(error?.message ?? '');
          if (isNetworkError && !this._networkWarningShown) {
            this._networkWarningShown = true;
            TAZA.Toast.warning(TAZA.Lang.current === 'ar'
              ? 'تعذّر تحديث الملف من الخادم؛ تم عرض آخر بيانات محفوظة. تحقق من الاتصال ثم أعد المحاولة.'
              : 'Could not refresh the profile; the latest saved details are shown. Check the connection and try again.');
          } else if (!isNetworkError) {
            TAZA.Toast.apiError(error);
          }
        } finally {
          this._loadPromise = null;
        }
      })();
      return this._loadPromise;
    },

    render(employee, extras = {}) {
      if (!employee) return;

      const values = {
        'profile-name': employee.name ?? '',
        'profile-username': employee.username ?? '',
        'profile-email': employee.email ?? '',
        'profile-phone': employee.phone ?? '',
      };
      Object.entries(values).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = value;
      });

      ['profile-name-display', 'profile-hero-name', 'sidebar-user-name'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.textContent = employee.name ?? '—';
      });

      ['profile-role-display'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.textContent = employee.role_label ?? employee.role ?? '—';
      });

      const usernameDisplay = document.getElementById('profile-username-display');
      if (usernameDisplay) usernameDisplay.textContent = employee.username ?? '—';
      const createdDisplay = document.getElementById('profile-created-display');
      if (createdDisplay) createdDisplay.textContent = employee.created_at
        ? new Date(employee.created_at).toLocaleDateString(TAZA.Lang.current === 'ar' ? 'ar-SY' : 'en-US', { year: 'numeric', month: 'short' })
        : '—';
      const accountState = document.getElementById('profile-account-state');
      if (accountState) {
        accountState.classList.toggle('is-inactive', !employee.is_active);
        const label = accountState.querySelector('span');
        if (label) label.textContent = employee.is_active
          ? (TAZA.Lang.current === 'ar' ? 'حساب نشط' : 'Active account')
          : (TAZA.Lang.current === 'ar' ? 'حساب معطّل' : 'Inactive account');
      }
      const rating = Number(extras.average_rating ?? employee.average_rating ?? 0);
      const ratingFact = document.getElementById('profile-rating-fact');
      if (ratingFact) ratingFact.hidden = !(employee.role === 'driver' || rating > 0);
      const ratingDisplay = document.getElementById('profile-rating-display');
      if (ratingDisplay) ratingDisplay.textContent = rating > 0 ? `${rating.toFixed(1)} / 5` : '—';

      ['profile-avatar', 'profile-hero-avatar', 'sidebar-user-avatar'].forEach((id) => {
        this.renderAvatar(document.getElementById(id), employee);
      });

      const removeButton = document.getElementById('remove-profile-avatar-btn');
      if (removeButton) removeButton.style.display = employee.avatar ? '' : 'none';
    },

    renderAvatar(container, employee) {
      if (!container) return;

      container.replaceChildren();
      if (!employee.avatar) {
        container.textContent = TAZA.Utils.initials(employee.name ?? '');
        return;
      }

      const image = document.createElement('img');
      image.src = TAZA.Media.url(employee.avatar);
      image.alt = employee.name ?? '';
      image.style.width = '100%';
      image.style.height = '100%';
      image.style.objectFit = 'cover';
      image.onerror = () => {
        container.replaceChildren();
        container.textContent = TAZA.Utils.initials(employee.name ?? '');
      };
      container.appendChild(image);
    },

    async save(button) {
      if (this._busy) return;

      const current = TAZA.Auth.getUser() ?? {};
      const name = document.getElementById('profile-name')?.value.trim() ?? '';
      const email = document.getElementById('profile-email')?.value.trim() ?? '';
      const phone = document.getElementById('profile-phone')?.value.trim() ?? '';
      const currentPassword = document.getElementById('profile-current-pass')?.value ?? '';
      const newPassword = document.getElementById('profile-new-pass')?.value ?? '';
      const confirmation = document.getElementById('profile-confirm-pass')?.value ?? '';
      const isAr = TAZA.Lang.current === 'ar';

      if (!name) {
        TAZA.Toast.warning(isAr ? 'الاسم الكامل مطلوب' : 'Full name is required');
        return;
      }

      if (!currentPassword) {
        TAZA.Toast.warning(isAr ? 'أدخل كلمة المرور الحالية لتأكيد التغييرات' : 'Enter your current password to confirm changes');
        document.getElementById('profile-current-pass')?.focus();
        return;
      }

      const payload = {};
      if (name !== (current.name ?? '')) payload.name = name;
      if (email !== (current.email ?? '')) payload.email = email || null;
      if (phone !== (current.phone ?? '')) payload.phone = phone || null;

      payload.current_password = currentPassword;

      if (newPassword || confirmation) {
        if (newPassword.length < 6) {
          TAZA.Toast.warning(isAr ? 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' : 'New password must be at least 6 characters');
          return;
        }
        if (newPassword !== confirmation) {
          TAZA.Toast.warning(isAr ? 'تأكيد كلمة المرور غير متطابق' : 'Password confirmation does not match');
          return;
        }
        payload.new_password = newPassword;
        payload.new_password_confirmation = confirmation;
      }

      if (Object.keys(payload).length === 1) {
        TAZA.Toast.info(isAr ? 'لا توجد تغييرات جديدة' : 'No new changes');
        return;
      }

      this._busy = true;
      TAZA.Utils.disableBtn(button);
      try {
        const response = await TAZA.Http.put(TAZA.API.AUTH.UPDATE_PROFILE, payload);
        const employee = response?.data?.employee;
        if (employee) {
          TAZA.Auth.save(TAZA.Auth.getToken(), employee);
          this.render(employee);
        }
        this.clearPasswordFields();
        TAZA.Toast.success(isAr ? 'تم تحديث ملفك الشخصي' : 'Profile updated');
      } catch (error) {
        TAZA.Toast.apiError(error);
      } finally {
        this._busy = false;
        TAZA.Utils.enableBtn(button);
      }
    },

    async uploadAvatar(input) {
      const file = input.files?.[0];
      if (!file || this._busy) return;

      const isAr = TAZA.Lang.current === 'ar';
      if (!TAZA.Utils.isImageFile(file) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        TAZA.Toast.warning(isAr ? 'اختر صورة JPG أو PNG أو WebP' : 'Choose a JPG, PNG, or WebP image');
        input.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        TAZA.Toast.warning(isAr ? 'حجم الصورة يجب ألا يتجاوز 5 ميغابايت' : 'Image size must not exceed 5 MB');
        input.value = '';
        return;
      }

      const formData = new FormData();
      formData.append('image', file);
      const currentPassword = document.getElementById('profile-current-pass')?.value ?? '';
      if (!currentPassword) {
        TAZA.Toast.warning(isAr ? 'أدخل كلمة المرور الحالية أولاً لحماية صورتك' : 'Enter your current password first to protect your photo');
        input.value = '';
        document.getElementById('profile-current-pass')?.focus();
        return;
      }
      formData.append('current_password', currentPassword);
      this._busy = true;
      input.disabled = true;
      try {
        const response = await TAZA.Http.upload(TAZA.API.AUTH.UPLOAD_AVATAR, formData);
        const employee = response?.data?.employee;
        if (employee) {
          TAZA.Auth.save(TAZA.Auth.getToken(), employee);
          this.render(employee);
        }
        TAZA.Toast.success(isAr ? 'تم تحديث صورتك الشخصية' : 'Profile photo updated');
      } catch (error) {
        TAZA.Toast.apiError(error);
      } finally {
        this._busy = false;
        input.disabled = false;
        input.value = '';
      }
    },

    confirmRemoveAvatar() {
      const isAr = TAZA.Lang.current === 'ar';
      TAZA.Confirm.show(
        isAr ? 'هل تريد حذف صورتك الشخصية؟' : 'Remove your profile photo?',
        () => this.removeAvatar(),
        { danger: true, btnText: isAr ? 'حذف الصورة' : 'Remove Photo' }
      );
    },

    async removeAvatar() {
      if (this._busy) return;
      const isAr = TAZA.Lang.current === 'ar';
      const currentPassword = document.getElementById('profile-current-pass')?.value ?? '';
      if (!currentPassword) {
        TAZA.Toast.warning(isAr ? 'أدخل كلمة المرور الحالية أولاً لحماية صورتك' : 'Enter your current password first to protect your photo');
        document.getElementById('profile-current-pass')?.focus();
        return;
      }
      this._busy = true;
      try {
        const response = await TAZA.Http.delete(TAZA.API.AUTH.UPLOAD_AVATAR, { current_password: currentPassword });
        const employee = response?.data?.employee;
        if (employee) {
          TAZA.Auth.save(TAZA.Auth.getToken(), employee);
          this.render(employee);
        }
        TAZA.Toast.success(isAr ? 'تم حذف الصورة الشخصية' : 'Profile photo removed');
      } catch (error) {
        TAZA.Toast.apiError(error);
      } finally {
        this._busy = false;
      }
    },

    clearPasswordFields() {
      ['profile-current-pass', 'profile-new-pass', 'profile-confirm-pass'].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.value = '';
      });
    },
  };

  TAZA.EmployeeProfile = Profile;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Profile.init(), { once: true });
  } else {
    Profile.init();
  }
})();
