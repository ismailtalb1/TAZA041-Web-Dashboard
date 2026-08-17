// Page router plus home, login, register, password reset
let pendingRegisterAvatar = null;
const TazaPageScriptRegistry = new Set();

function loadPageScript(src) {
  if (TazaPageScriptRegistry.has(src)) return Promise.resolve();
  const existing = $$('script', document).find(script => (script.getAttribute('src') || '').split('?')[0] === src);
  if (existing) {
    existing.dataset.loaded = 'true';
    TazaPageScriptRegistry.add(src);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${src}?v=20260801-live-delivery-route`;
    script.async = false;
    script.dataset.dynamicPageScript = 'true';
    script.onload = () => {
      script.dataset.loaded = 'true';
      TazaPageScriptRegistry.add(src);
      resolve();
    };
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.body.appendChild(script);
  });
}

async function ensurePageScripts(page) {
  const scripts = {
    register: ['assets/js/pages/account.js?v=20260810-live-sync'],
    auth: ['assets/js/pages/account.js?v=20260810-live-sync'],
    menu: ['assets/js/pages/menu.js'],
    payment: ['assets/js/pages/menu.js', 'assets/js/pages/payment.js'],
    delivery: ['assets/js/pages/menu.js', 'assets/js/pages/delivery.js'],
    reservation: ['assets/js/pages/menu.js', 'assets/js/pages/reservation.js'],
    notifications: ['assets/js/pages/account.js?v=20260810-live-sync'],
    profile: ['assets/js/pages/account.js?v=20260812-loyalty-tiers'],
    orders: ['assets/js/pages/account.js?v=20260810-live-sync'],
    ai: ['assets/js/pages/ai.js']
  }[page] || [];

  for (const src of scripts) await loadPageScript(src);
}

function initUnifiedAuthPage() {
  const tabs = $$('[data-auth-tab]');
  const panes = $$('[data-auth-pane]');
  if (!tabs.length || !panes.length) return;

  const activate = (requested, updateHash = true) => {
    const target = requested === 'register' ? 'register' : 'login';
    tabs.forEach(tab => {
      const selected = tab.dataset.authTab === target;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panes.forEach(pane => {
      const selected = pane.dataset.authPane === target;
      pane.hidden = !selected;
      pane.classList.toggle('active', selected);
    });
    document.body.dataset.authMode = target;
    if (updateHash) history.replaceState(null, '', target === 'register' ? '#register' : '#login');
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab.dataset.authTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      activate(next.dataset.authTab);
      next.focus();
    });
  });
  $$('[data-auth-switch]').forEach(button => button.addEventListener('click', () => {
    activate(button.dataset.authSwitch);
    $('.unified-auth-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  window.addEventListener('hashchange', () => activate(location.hash.slice(1), false));
  activate(location.hash.slice(1), false);
}

async function initPageSpecific() {
  const page = document.body.dataset.page;
  await ensurePageScripts(page);
  if (page === 'guest-home' || page === 'user-home') initHomePage(page);
  if (page === 'login') initLoginPage();
  if (page === 'register') initRegisterPage();
  if (page === 'auth') {
    initUnifiedAuthPage();
    initLoginPage();
    initRegisterPage();
  }
  if (page === 'forgot') initForgotPage();
  if (page === 'menu') initMenuPage();
  if (page === 'payment') initPaymentPage();
  if (page === 'delivery') await initDeliveryPage();
  if (page === 'reservation') initReservationPage();
  if (page === 'notifications') await initNotificationsPage();
  if (page === 'profile') await initProfilePage();
  if (page === 'orders') await initOrdersPage();
  if (page === 'ai') initAIPage();
  if (page === 'reset') initResetPage();
}

function initHomePage(page) {
  const sliders = $$('[data-slider]');
  if (page === 'guest-home') {
    renderCatalogSlider(sliders[0], AppState.catalog.offers, { mode: 'offer', logged: false });
    renderCatalogSlider(sliders[1], AppState.catalog.products.slice(0, 8), { mode: 'product', logged: false });
  }
  if (page === 'user-home') {
    renderCatalogSlider(sliders[0], AppState.catalog.offers, { mode: 'offer', logged: true });
    renderCatalogSlider(sliders[1], AppState.catalog.products.slice(0, 8), { mode: 'product', logged: true });
  }
  sliders.forEach(bindSliderControls);
  if (document.body.dataset.liveHomeBound !== 'true') {
    document.body.dataset.liveHomeBound = 'true';
    window.addEventListener('taza:public-data-updated', event => {
      if (event.detail?.catalog) initHomePage(document.body.dataset.page);
    });
  }
}

function renderCatalogSlider(slider, items, options = {}) {
  if (!slider) return;
  const list = items || [];
  slider.classList.toggle('is-empty', !list.length);
  slider.classList.toggle('is-single', list.length === 1);
  if (!list.length) {
    slider.innerHTML = emptyStateHtml(options.mode === 'offer' ? 'offers' : 'products');
    bindSliderControls(slider);
    return;
  }
  slider.innerHTML = list.map(item => {
    const itemName = catalogItemName(item);
    const itemDescription = catalogItemDescription(item) || langText('اختيار مميز من قائمة TAZA', 'A premium TAZA selection');
    return `
      <article class="card-item ${item.available ? '' : 'is-unavailable'}">
        ${mediaHtml(item, itemName)}
        ${item.available ? '' : `<span class="badge unavailable-badge">${esc(langText('غير متوفر الآن', 'Currently unavailable'))}</span>`}
        <h3>${esc(itemName)}</h3>
        <p class="muted">${esc(itemDescription)}</p>
        <div class="price-row">
          <div><div class="price-main">${formatCurrency(item.price)}</div>${item.oldPrice ? `<div class="price-old">${formatCurrency(item.oldPrice)}</div>` : ''}</div>
          ${item.available
            ? (options.logged ? `<button class="btn btn-primary" data-home-add="${esc(item.key)}">${langText('أضف', 'Add')}</button>` : `<a class="btn btn-primary" href="login.html">${langText('سجّل للطلب', 'Sign in')}</a>`)
            : (options.logged && item.item_type === 'product'
              ? `<button class="btn btn-secondary" data-home-report="${esc(item.key)}" ${unavailableProductWasReported(item.reference_id) ? 'disabled' : ''}>${unavailableProductWasReported(item.reference_id) ? langText('تم الإبلاغ', 'Reported') : langText('إبلاغ المخزون', 'Notify inventory')}</button>`
              : `<strong class="catalog-unavailable-text">${langText('غير متوفر الآن', 'Currently unavailable')}</strong>`)}
        </div>
      </article>`;
  }).join('');
  $$('[data-home-add]', slider).forEach(btn => btn.onclick = () => addToCart(AppState.catalog.allItems.find(item => item.key === btn.dataset.homeAdd)));
  $$('[data-home-report]', slider).forEach(btn => btn.onclick = () => reportUnavailableProduct(AppState.catalog.allItems.find(item => item.key === btn.dataset.homeReport), btn));
  bindSliderControls(slider);
}

function requireCustomerLogin() {
  if (AppState.token && AppState.loggedIn) return true;
  showToast(langText('يرجى تسجيل الدخول أولاً لإكمال العملية', 'Please sign in first'), { kind: 'auth' });
  setTimeout(() => location.href = 'login.html', 650);
  return false;
}

function setAuth(payload) {
  const payloadUser = payload?.customer || payload?.user || {};
  const nextCustomerId = payloadUser?.id ? String(payloadUser.id) : '';
  const currentCustomerId = AppState.user?.id ? String(AppState.user.id) : '';
  const currentStateOwner = localStorage.getItem(STORAGE_KEYS.customerStateOwner) || currentCustomerId;
  if (nextCustomerId && nextCustomerId !== currentStateOwner) {
    switchCustomerOrderState(nextCustomerId);
  }
  AppState.token = payload?.token || '';
  AppState.loggedIn = Boolean(AppState.token);
  AppState.user = normalizeUser({ ...payloadUser, loyalty: payload?.loyalty || payloadUser.loyalty });
  applyLoyaltySnapshot(payload?.loyalty, AppState.user);
  persist();
  renderUserHeader();
}

function bindPasswordToggles(scope = document) {
  $$('[data-password-toggle]', scope).forEach(btn => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    const selector = btn.dataset.passwordToggle;
    const input = selector ? (btn.closest('form')?.querySelector(selector) || $(selector)) : null;
    if (!input) return;
    const labelFor = () => {
      const showing = input.type === 'text';
      const label = showing ? langText('إخفاء كلمة المرور', 'Hide password') : langText('إظهار كلمة المرور', 'Show password');
      btn.setAttribute('aria-label', label);
      btn.title = label;
      btn.setAttribute('aria-pressed', String(showing));
    };
    labelFor();
    btn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      labelFor();
    });
  });
}

function setAuthFormBusy(form, busy) {
  if (!form) return;
  const submit = $('[data-auth-submit]', form);
  form.dataset.submitting = busy ? 'true' : 'false';
  $$('input, button, select, textarea', form).forEach(el => {
    el.disabled = busy;
  });
  submit?.classList.toggle('is-loading', busy);
  submit?.setAttribute('aria-busy', String(busy));
}

function authFormField(form, name) {
  return form?.querySelector(`[name="${name}"]`) || null;
}

function bindAuthSubmission(form, handler) {
  const submit = form?.querySelector('[data-auth-submit]');
  if (!form || !submit || submit.dataset.submitBound === 'true') return;
  form.addEventListener('submit', handler);
  submit.addEventListener('click', handler);
  submit.dataset.submitBound = 'true';
}

function authErrorMessage(error, fallbackAr, fallbackEn) {
  const errors = error?.payload?.errors;
  if (errors && typeof errors === 'object') {
    const first = Object.values(errors).flat().find(Boolean);
    if (first) return String(first);
  }
  return friendlyError(error, fallbackAr, fallbackEn);
}

async function logoutCustomer() {
  if (AppState.token) await safeApi('/customer/auth/logout', { method: 'POST' });
  saveCurrentCustomerOrderState();
  AppState.token = '';
  AppState.loggedIn = false;
  AppState.user = { ...defaultUser };
  AppState.cart = {};
  AppState.orderNotes = '';
  AppState.orderType = '';
  AppState.deliveryMeta = null;
  AppState.reservationMeta = null;
  AppState.savedAddresses = normalizeSavedAddresses();
  AppState.hasPendingSavedAddressMigration = false;
  localStorage.removeItem(STORAGE_KEYS.customerStateOwner);
  localStorage.removeItem(STORAGE_KEYS.savedAddressesOwner);
  localStorage.removeItem(STORAGE_KEYS.savedAddresses);
  try { sessionStorage.removeItem('taza_profile_avatar_preview'); } catch (_) {}
  persist();
}

function initLoginPage() {
  const form = $('[data-login-form]');
  bindPasswordToggles(form || document);
  if (form?.dataset.bound === 'true') return;
  if (form) form.dataset.bound = 'true';
  const submitLogin = async (e) => {
    e.preventDefault();
    if (form.dataset.submitting === 'true') return;
    const identifier = authFormField(form, 'identifier')?.value.trim() || '';
    const password = authFormField(form, 'password')?.value || '';
    $('.error.identifier', form).textContent = identifier ? '' : langText('يرجى إدخال البريد الإلكتروني أو رقم الهاتف', 'Please enter your email or phone');
    $('.error.password', form).textContent = password ? '' : langText('يرجى إدخال كلمة المرور', 'Please enter your password');
    if (!identifier || !password) return;
    const phone = normalizePhone(identifier);
    const body = isEmail(identifier)
      ? { email: identifier, identifier, login: identifier, password }
      : { phone, identifier: phone, login: phone, password };
    try {
      setAuthFormBusy(form, true);
      const data = await apiFetch('/customer/auth/login', { method: 'POST', body });
      setAuth(data);
      showToast(langText('تم تسجيل الدخول بنجاح', 'Logged in successfully'));
      setTimeout(() => location.href = 'home-user.html', 450);
    } catch (error) {
      setAuthFormBusy(form, false);
      showToast(authErrorMessage(error, 'بيانات الدخول غير صحيحة أو غير مكتملة', 'Invalid or incomplete login details'));
    }
  };
  bindAuthSubmission(form, submitLogin);
}

function initRegisterPage() {
  const form = $('[data-register-form]');
  bindPasswordToggles(form || document);
  if (typeof bindProfileImageEditor === 'function') bindProfileImageEditor();
  const upload = $('[data-profile-upload]');
  const preview = $('[data-profile-preview]');
  if (pendingRegisterAvatar) renderRegisterAvatarPreview(pendingRegisterAvatar.previewUrl, pendingRegisterAvatar.name);
  else renderRegisterAvatarEmpty();
  if (upload && upload.dataset.bound !== 'true') {
    upload.dataset.bound = 'true';
    upload.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!preview) return;
      if (!file) {
        if (!pendingRegisterAvatar) renderRegisterAvatarEmpty();
        return;
      }
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) {
        pendingRegisterAvatar = null;
        renderRegisterAvatarEmpty();
        preview.textContent = langText('اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 5MB', 'Choose a JPG, PNG, or WebP image up to 5MB');
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        if (typeof openProfileImageEditor === 'function') {
          openProfileImageEditor(dataUrl, {
            onConfirm: (edited) => {
              pendingRegisterAvatar = { ...edited, name: file.name };
              renderRegisterAvatarPreview(edited.previewUrl, file.name);
              showToast(langText('تم اختيار الصورة بنجاح', 'Image selected successfully'));
            }
          });
        } else {
          pendingRegisterAvatar = { blob: file, previewUrl: dataUrl, name: file.name };
          renderRegisterAvatarPreview(dataUrl, file.name);
        }
      } catch (_) {
        pendingRegisterAvatar = null;
        renderRegisterAvatarEmpty();
        preview.textContent = langText('تعذر قراءة الصورة، حاول مرة أخرى', 'Unable to read the image. Try again');
      }
    });
  }
  if (form?.dataset.bound === 'true') return;
  if (form) form.dataset.bound = 'true';
  const submitRegistration = async (e) => {
    e.preventDefault();
    if (form.dataset.submitting === 'true') return;
    const currentForm = form;
    const name = authFormField(currentForm, 'full_name')?.value.trim() || '';
    const email = authFormField(currentForm, 'register_email')?.value.trim() || '';
    const phone = normalizePhone(authFormField(currentForm, 'register_phone')?.value || '');
    const address = authFormField(currentForm, 'address')?.value.trim() || '';
    const dateOfBirth = authFormField(currentForm, 'date_of_birth')?.value || '';
    const password = authFormField(currentForm, 'register_password')?.value || '';
    const confirm = authFormField(currentForm, 'register_confirm')?.value || '';
    const today = new Date().toISOString().slice(0, 10);
    const emailValid = !email || isEmail(email);
    const birthdayValid = !dateOfBirth || dateOfBirth < today;
    const avatar = pendingRegisterAvatar;
    const imageValid = !avatar || Boolean(avatar.blob);

    $('.error.name', currentForm).textContent = name ? '' : langText('يرجى إدخال الاسم الكامل', 'Please enter your full name');
    $('.error.contact', currentForm).textContent = !emailValid
      ? langText('البريد الإلكتروني غير صحيح', 'Enter a valid email address')
      : ((email || phone) ? '' : langText('أدخل البريد الإلكتروني أو رقم الهاتف على الأقل', 'Enter at least an email or a phone number'));
    $('.error.birthday', currentForm).textContent = birthdayValid ? '' : langText('تاريخ الميلاد يجب أن يكون قبل اليوم', 'Date of birth must be before today');
    $('.error.password', currentForm).textContent = password.length >= 6 ? '' : langText('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'Password must be at least 6 characters');
    $('.error.confirm', currentForm).textContent = confirm === password ? '' : langText('كلمتا المرور غير متطابقتين', 'Passwords do not match');
    if (!imageValid && preview) preview.textContent = langText('اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 5MB', 'Choose a JPG, PNG, or WebP image up to 5MB');
    if (!name || !emailValid || (!email && !phone) || !birthdayValid || !imageValid || password.length < 6 || confirm !== password) return;

    const body = { name, password, password_confirmation: confirm };
    if (email) body.email = email;
    if (phone) body.phone = phone;
    if (address) body.address = address;
    if (dateOfBirth) body.date_of_birth = dateOfBirth;

    try {
      setAuthFormBusy(currentForm, true);
      const data = await apiFetch('/customer/auth/register', { method: 'POST', body });
      setAuth(data);

      if (avatar?.blob) {
        const imageBody = new FormData();
        imageBody.append('image', avatar.blob, 'profile-avatar.jpg');
        imageBody.append('current_password', password);
        const avatarUpload = await safeApi('/customer/avatar', { method: 'POST', body: imageBody });
        const remoteUrl = avatarUpload?.avatar_url || avatarUpload?.avatar;
        if (avatarUpload) {
          sessionStorage.setItem('taza_profile_avatar_preview', avatar.previewUrl);
          if (remoteUrl) {
            AppState.user.avatarUrl = remoteUrl;
            persist();
          }
        }
      }

      pendingRegisterAvatar = null;
      showToast(langText('تم إنشاء الحساب بنجاح', 'Account created successfully'));
      setTimeout(() => location.href = 'home-user.html', 500);
    } catch (error) {
      setAuthFormBusy(currentForm, false);
      showToast(authErrorMessage(error, 'تعذر إنشاء الحساب، تحقق من البيانات وحاول مرة أخرى', 'Unable to create the account. Check your details and try again'));
    }
  };
  bindAuthSubmission(form, submitRegistration);
}

function renderRegisterAvatarEmpty() {
  const holder = $('[data-register-avatar-preview]');
  const image = $('[data-register-avatar-image]', holder || document);
  const preview = $('[data-profile-preview]');
  holder?.classList.add('hidden');
  holder?.setAttribute('aria-hidden', 'true');
  if (image) image.removeAttribute('src');
  if (preview && !pendingRegisterAvatar) preview.textContent = langText('لم يتم اختيار صورة', 'No image selected');
}

function renderRegisterAvatarPreview(url, name = '') {
  const holder = $('[data-register-avatar-preview]');
  const image = $('[data-register-avatar-image]', holder || document);
  const preview = $('[data-profile-preview]');
  if (holder && image && url) {
    holder.classList.remove('hidden');
    holder.setAttribute('aria-hidden', 'false');
    image.src = url;
    image.alt = langText('معاينة الصورة المختارة', 'Selected image preview');
  }
  if (preview) {
    preview.textContent = name
      ? langText(`تم اختيار الصورة: ${name}`, `Image selected: ${name}`)
      : langText('تم اختيار الصورة بنجاح', 'Image selected successfully');
  }
}

function initForgotPage() {
  const form = $('[data-forgot-form]');
  const message = $('[data-forgot-message]');
  const genericMessage = () => langText(
    'إذا كان البريد الإلكتروني مرتبطاً بحساب، فسيتم إرسال رابط استعادة كلمة المرور إليه.',
    'If the email address is linked to an account, a password recovery link will be sent to it.'
  );

  if (form?.dataset.bound === 'true') return;
  if (form) form.dataset.bound = 'true';
  const submitForgotPassword = async (e) => {
    e.preventDefault();
    if (form.dataset.submitting === 'true') return;
    const email = authFormField(form, 'email')?.value.trim() || '';

    $('.error.email', form).textContent = isEmail(email)
      ? ''
      : langText('يرجى إدخال بريد إلكتروني صحيح', 'Please enter a valid email address');
    if (!isEmail(email)) return;

    try {
      setAuthFormBusy(form, true);
      await apiFetch('/customer/auth/forgot-password', {
        method: 'POST',
        body: { email }
      });

      setAuthFormBusy(form, false);
      if (message) {
        message.textContent = genericMessage();
        message.classList.remove('hidden');
      }
      showToast(genericMessage());
    } catch (error) {
      setAuthFormBusy(form, false);
      showToast(friendlyError(error, 'تعذر إرسال طلب الاستعادة، حاول مرة أخرى', 'Unable to send recovery request. Try again'));
    }
  };
  bindAuthSubmission(form, submitForgotPassword);
}

function initResetPage() {
  const form = $('[data-reset-form]');
  bindPasswordToggles(form || document);
  const rawParameters = location.hash.length > 1 ? location.hash.slice(1) : location.search.slice(1);
  const parameters = new URLSearchParams(rawParameters);
  const resetToken = parameters.get('token') || '';
  const resetEmail = parameters.get('email') || '';

  if (form) {
    const tokenField = authFormField(form, 'token');
    const emailField = authFormField(form, 'email');
    if (tokenField) tokenField.value = resetToken;
    if (emailField) emailField.value = resetEmail;
  }

  if (location.search && resetToken && resetEmail) {
    // تحويل أي رابط قديم يستخدم query string إلى fragment حتى لا يصل
    // الرمز إلى الخادم أو السجلات، مع بقائه صالحاً بعد تحديث الصفحة.
    const fragment = new URLSearchParams({ token: resetToken, email: resetEmail });
    history.replaceState(null, document.title, `${location.pathname}#${fragment.toString()}`);
  }

  if (form && (!resetToken || !isEmail(resetEmail))) {
    $('.error.email', form).textContent = langText(
      'رابط الاستعادة غير صالح أو غير مكتمل',
      'The recovery link is invalid or incomplete'
    );
  }

  if (form?.dataset.bound === 'true') return;
  if (form) form.dataset.bound = 'true';
  const submitPasswordReset = async (e) => {
    e.preventDefault();
    if (form.dataset.submitting === 'true') return;
    const email = authFormField(form, 'email')?.value.trim() || '';
    const token = authFormField(form, 'token')?.value || '';
    const password = authFormField(form, 'new_password')?.value || '';
    const confirm = authFormField(form, 'confirm_password')?.value || '';
    const passwordIsStrong = password.length >= 8 && /\p{L}/u.test(password) && /\p{N}/u.test(password);

    $('.error.email', form).textContent = token && isEmail(email) ? '' : langText('رابط الاستعادة غير صالح أو غير مكتمل', 'The recovery link is invalid or incomplete');
    $('.error.password', form).textContent = passwordIsStrong ? '' : langText('استخدم 8 أحرف على الأقل تتضمن حروفاً وأرقاماً', 'Use at least 8 characters including letters and numbers');
    $('.error.confirm', form).textContent = confirm === password ? '' : langText('كلمتا المرور غير متطابقتين', 'Passwords do not match');
    if (!token || !isEmail(email) || !passwordIsStrong || confirm !== password) return;

    try {
      setAuthFormBusy(form, true);
      await apiFetch('/customer/auth/reset-password', {
        method: 'POST',
        body: {
          email,
          token,
          password,
          password_confirmation: confirm
        }
      });

      history.replaceState(null, document.title, location.pathname);
      showToast(langText('تم تغيير كلمة المرور بنجاح', 'Password changed successfully'));
      setTimeout(() => location.href = 'login.html', 900);
    } catch (error) {
      setAuthFormBusy(form, false);
      const message = !error?.status
        ? langText(
            'تعذر الاتصال بالخادم. تأكد من تشغيل خادم Laravel ثم حاول مرة أخرى.',
            'Unable to reach the server. Make sure the Laravel server is running, then try again.'
          )
        : friendlyError(
            error,
            'تعذر حفظ كلمة المرور بسبب خطأ في الخادم. حاول مرة أخرى بعد قليل.',
            'Unable to save the password because of a server error. Try again shortly.'
          );
      showToast(message);
    }
  };
  bindAuthSubmission(form, submitPasswordReset);
}
