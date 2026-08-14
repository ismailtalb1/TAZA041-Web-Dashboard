// Global UI, language, theme, drawers, sliders

function applyTheme() {
  document.documentElement.setAttribute('data-theme', AppState.theme);
  updatePreferenceControls();
  if (typeof TazaCookies !== 'undefined') TazaCookies.refresh?.();
}

function applyLanguage() {
  document.documentElement.lang = AppState.lang;
  document.documentElement.dir = AppState.lang === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('lang-en', AppState.lang === 'en');
  $$('[data-ar][data-en]').forEach(el => {
    el.innerHTML = AppState.lang === 'ar' ? el.dataset.ar : el.dataset.en;
  });
  $$('[data-placeholder-ar][data-placeholder-en]').forEach(el => {
    el.placeholder = AppState.lang === 'ar' ? el.dataset.placeholderAr : el.dataset.placeholderEn;
  });
  $$('[data-label-ar][data-label-en]').forEach(el => {
    const label = AppState.lang === 'ar' ? el.dataset.labelAr : el.dataset.labelEn;
    el.setAttribute('aria-label', label);
    el.title = label;
  });
  $$('.restaurant-status-pill').forEach(el => {
    if (typeof restaurantStatusText === 'function') el.textContent = restaurantStatusText();
  });
  if (typeof renderOrderBadges === 'function') renderOrderBadges();
  if (typeof renderSavedAddressesPanel === 'function') renderSavedAddressesPanel();
  if (typeof window.renderDeliverySavedAddresses === 'function') window.renderDeliverySavedAddresses();
  updatePreferenceControls();
  if (typeof TazaCookies !== 'undefined') TazaCookies.refresh?.();
  setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
}

function updatePreferenceControls() {
  $$('[data-theme-toggle]').forEach(btn => {
    btn.dataset.mode = AppState.theme;
    btn.setAttribute('aria-label', AppState.theme === 'dark' ? langText('تبديل إلى الوضع الفاتح', 'Switch to light mode') : langText('تبديل إلى الوضع الداكن', 'Switch to dark mode'));
    btn.title = AppState.theme === 'dark' ? langText('الوضع الفاتح', 'Light mode') : langText('الوضع الداكن', 'Dark mode');
    if (btn.matches('[data-theme-label]')) btn.textContent = AppState.theme === 'dark' ? '☾' : '☀';
  });

  $$('[data-lang-toggle]').forEach(btn => {
    btn.dataset.lang = AppState.lang;
    btn.textContent = AppState.lang === 'ar' ? 'EN' : 'AR';
    btn.setAttribute('aria-label', AppState.lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
    btn.title = AppState.lang === 'ar' ? 'English' : 'العربية';
  });

  $$('.site-header button').forEach(btn => {
    if (!btn.hasAttribute('type')) btn.type = 'button';
  });
  $$('.header-preferences').forEach(group => group.setAttribute('aria-label', langText('تفضيلات العرض', 'Display preferences')));
  $$('.main-nav').forEach(nav => nav.setAttribute('aria-label', langText('التنقل الرئيسي', 'Main navigation')));
  $$('[data-page-back-nav]').forEach(nav => nav.setAttribute('aria-label', langText('التنقل داخل الصفحة', 'Page navigation')));
  $$('[data-page-back]').forEach(link => link.setAttribute('aria-label', langText('الرجوع', 'Go back')));
  $$('[data-mobile-toggle]').forEach(btn => btn.setAttribute('aria-label', langText('فتح قائمة التنقل', 'Open navigation menu')));
  $$('[data-open-sidebar]').forEach(btn => btn.setAttribute('aria-label', langText('فتح القائمة الجانبية', 'Open side menu')));
  $$('[data-open-cart]').forEach(btn => btn.setAttribute('aria-label', langText('فتح سلة الطلب', 'Open order cart')));
  $$('[data-slide="prev"]').forEach(btn => {
    btn.setAttribute('aria-label', langText('تمرير العروض إلى اليسار', 'Scroll slider left'));
    btn.title = langText('تمرير لليسار', 'Scroll left');
  });
  $$('[data-slide="next"]').forEach(btn => {
    btn.setAttribute('aria-label', langText('تمرير العروض إلى اليمين', 'Scroll slider right'));
    btn.title = langText('تمرير لليمين', 'Scroll right');
  });
}

function initSmartDateTimeInputs(root = document) {
  $$('input[type="date"], input[type="time"]', root).forEach(input => {
    if (input.dataset.smartDateTimeBound === 'true') {
      syncSmartDateTimeInput(input);
      return;
    }

    input.dataset.smartDateTimeBound = 'true';
    input.classList.add('smart-native-date-time');
    input.setAttribute('tabindex', '-1');

    const wrapper = document.createElement('div');
    wrapper.className = `smart-date-time-field smart-${input.type}-field`;
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'smart-date-time-trigger';
    const fieldIcon = input.type === 'time'
      ? '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5v5l3.5 2"></path></svg>'
      : '<svg viewBox="0 0 24 24" focusable="false"><rect x="4" y="5.5" width="16" height="14" rx="3"></rect><path d="M8 3.5v4M16 3.5v4M4 9.5h16"></path></svg>';
    button.innerHTML = `
      <span class="smart-date-time-value"></span>
      <span class="smart-date-time-icon" aria-hidden="true">${fieldIcon}</span>
    `;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      if (input.disabled || input.readOnly) {
        syncSmartDateTimeInput(input);
        return;
      }
      openSmartDateTimePicker(input);
    });
    wrapper.appendChild(button);

    input.addEventListener('change', () => syncSmartDateTimeInput(input));
    input.addEventListener('input', () => syncSmartDateTimeInput(input));
    syncSmartDateTimeInput(input);
  });
}

function smartDateTimeLocale() {
  return AppState.lang === 'ar' ? 'ar-SY' : 'en-US';
}

function smartDateTimePlaceholder(input) {
  if (input.type === 'time') return langText('اختر الوقت', 'Choose time');
  return langText('اختر التاريخ', 'Choose date');
}

function formatSmartDateValue(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(smartDateTimeLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(year, month - 1, day));
}

function formatSmartTimeValue(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  return new Intl.DateTimeFormat(smartDateTimeLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date(2026, 0, 1, hour, minute));
}

function syncSmartDateTimeInput(input) {
  const wrapper = input.closest('.smart-date-time-field');
  const valueEl = wrapper?.querySelector('.smart-date-time-value');
  const trigger = wrapper?.querySelector('.smart-date-time-trigger');
  if (!valueEl) return;
  const formatted = input.type === 'time' ? formatSmartTimeValue(input.value) : formatSmartDateValue(input.value);
  if (wrapper) wrapper.dir = AppState.lang === 'ar' ? 'rtl' : 'ltr';
  valueEl.textContent = formatted || smartDateTimePlaceholder(input);
  valueEl.classList.toggle('is-placeholder', !formatted);
  if (trigger) {
    const locked = Boolean(input.disabled || input.readOnly);
    trigger.disabled = locked;
    trigger.setAttribute('aria-disabled', String(locked));
    trigger.setAttribute('aria-label', `${smartDateTimePlaceholder(input)}: ${formatted || smartDateTimePlaceholder(input)}`);
    if (locked) trigger.setAttribute('aria-expanded', 'false');
  }
}

function closeSmartDateTimePicker() {
  $('.smart-date-time-popover')?.remove();
  $$('.smart-date-time-trigger[aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
}

function positionSmartDateTimePicker(popover, input) {
  const trigger = input.closest('.smart-date-time-field')?.querySelector('.smart-date-time-trigger');
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const gap = 10;
  const width = Math.min(window.innerWidth - 24, Math.max(330, rect.width));
  const height = Math.min(popover.offsetHeight || 420, window.innerHeight - 24);
  const preferredTop = rect.bottom + gap;
  const top = preferredTop + height > window.innerHeight - 12
    ? Math.max(12, rect.top - height - gap)
    : preferredTop;
  const preferredLeft = AppState.lang === 'ar' ? rect.right - width : rect.left;
  popover.style.width = `${width}px`;
  popover.style.left = `${Math.max(12, Math.min(preferredLeft, window.innerWidth - width - 12))}px`;
  popover.style.top = `${top}px`;
  popover.dir = AppState.lang === 'ar' ? 'rtl' : 'ltr';
}

function openSmartDateTimePicker(input) {
  if (input.disabled || input.readOnly) {
    syncSmartDateTimeInput(input);
    return;
  }
  closeSmartDateTimePicker();
  const popover = document.createElement('div');
  popover.className = `smart-date-time-popover smart-${input.type}-popover`;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', input.type === 'time' ? langText('اختيار الوقت', 'Choose time') : langText('اختيار التاريخ', 'Choose date'));
  document.body.appendChild(popover);
  input.closest('.smart-date-time-field')?.querySelector('.smart-date-time-trigger')?.setAttribute('aria-expanded', 'true');
  if (input.type === 'time') renderSmartTimePicker(input, popover);
  else renderSmartDatePicker(input, popover);
  positionSmartDateTimePicker(popover, input);
  requestAnimationFrame(() => popover.classList.add('active'));
}

function smartDateParts(value) {
  const now = new Date();
  if (!value) return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  const [year, month, day] = value.split('-').map(Number);
  return {
    year: year || now.getFullYear(),
    month: month ? month - 1 : now.getMonth(),
    day: day || now.getDate()
  };
}

function renderSmartDatePicker(input, popover, dateState = smartDateParts(input.value)) {
  const monthNames = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(smartDateTimeLocale(), { month: 'long' }).format(new Date(dateState.year, month, 1)));
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear + 21 - 1920 }, (_, index) => 1920 + index);
  const firstDay = new Date(dateState.year, dateState.month, 1);
  const start = new Date(dateState.year, dateState.month, 1 - firstDay.getDay());
  const selected = input.value;
  const todayValue = new Date().toISOString().slice(0, 10);
  const previousIcon = AppState.lang === 'ar' ? '›' : '‹';
  const nextIcon = AppState.lang === 'ar' ? '‹' : '›';
  const dayCells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const outside = date.getMonth() !== dateState.month;
    return `<button type="button" class="smart-date-day ${outside ? 'outside' : ''} ${value === selected ? 'selected' : ''} ${value === todayValue ? 'today' : ''}" data-smart-date="${value}">${date.getDate()}</button>`;
  }).join('');

  popover.innerHTML = `
    <div class="smart-picker-head">
      <div class="smart-picker-selects">
        <select class="smart-picker-select" data-smart-month aria-label="${langText('الشهر', 'Month')}">
          ${monthNames.map((name, index) => `<option value="${index}" ${index === dateState.month ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
        <select class="smart-picker-select" data-smart-year aria-label="${langText('السنة', 'Year')}">
          ${yearOptions.map(year => `<option value="${year}" ${year === dateState.year ? 'selected' : ''}>${year}</option>`).join('')}
        </select>
      </div>
      <div class="smart-picker-nav">
        <button type="button" data-smart-prev aria-label="${langText('الشهر السابق', 'Previous month')}">${previousIcon}</button>
        <button type="button" data-smart-next aria-label="${langText('الشهر التالي', 'Next month')}">${nextIcon}</button>
      </div>
    </div>
    <div class="smart-date-weekdays">
      ${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => `<span>${day}</span>`).join('')}
    </div>
    <div class="smart-date-grid">${dayCells}</div>
    <div class="smart-picker-actions">
      <button type="button" class="smart-picker-link" data-smart-clear>${langText('مسح', 'Clear')}</button>
      <button type="button" class="smart-picker-link" data-smart-today>${langText('اليوم', 'Today')}</button>
    </div>
  `;

  popover.querySelector('[data-smart-month]')?.addEventListener('change', e => renderSmartDatePicker(input, popover, { ...dateState, month: Number(e.target.value) }));
  popover.querySelector('[data-smart-year]')?.addEventListener('change', e => renderSmartDatePicker(input, popover, { ...dateState, year: Number(e.target.value) }));
  popover.querySelector('[data-smart-prev]')?.addEventListener('click', () => {
    const next = new Date(dateState.year, dateState.month - 1, 1);
    renderSmartDatePicker(input, popover, { year: next.getFullYear(), month: next.getMonth(), day: 1 });
  });
  popover.querySelector('[data-smart-next]')?.addEventListener('click', () => {
    const next = new Date(dateState.year, dateState.month + 1, 1);
    renderSmartDatePicker(input, popover, { year: next.getFullYear(), month: next.getMonth(), day: 1 });
  });
  popover.querySelector('[data-smart-clear]')?.addEventListener('click', () => setSmartDateTimeValue(input, ''));
  popover.querySelector('[data-smart-today]')?.addEventListener('click', () => setSmartDateTimeValue(input, todayValue));
  $$('[data-smart-date]', popover).forEach(btn => btn.addEventListener('click', () => setSmartDateTimeValue(input, btn.dataset.smartDate)));
}

function smartTimeParts(value) {
  const [rawHour, rawMinute] = (value || '20:00').split(':').map(Number);
  return {
    hour: Number.isNaN(rawHour) ? 20 : rawHour,
    minute: Number.isNaN(rawMinute) ? 0 : rawMinute
  };
}

function renderSmartTimePicker(input, popover) {
  const parts = smartTimeParts(input.value);
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
  popover.innerHTML = `
    <div class="smart-time-layout">
      <div class="smart-time-column">
        <strong>${langText('الساعة', 'Hour')}</strong>
        <div>${hours.map(hour => `<button type="button" class="smart-time-option ${hour === parts.hour ? 'selected' : ''}" data-smart-hour="${hour}">${String(hour).padStart(2, '0')}</button>`).join('')}</div>
      </div>
      <div class="smart-time-column">
        <strong>${langText('الدقائق', 'Minutes')}</strong>
        <div>${minutes.map(minute => `<button type="button" class="smart-time-option ${minute === parts.minute ? 'selected' : ''}" data-smart-minute="${minute}">${String(minute).padStart(2, '0')}</button>`).join('')}</div>
      </div>
    </div>
    <div class="smart-picker-actions">
      <button type="button" class="smart-picker-link" data-smart-clear>${langText('مسح', 'Clear')}</button>
      <button type="button" class="smart-picker-link smart-picker-done" data-smart-done>${langText('تم', 'Done')}</button>
    </div>
  `;
  $$('[data-smart-hour]', popover).forEach(btn => btn.addEventListener('click', () => {
    parts.hour = Number(btn.dataset.smartHour);
    setSmartDateTimeValue(input, `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`, false);
    renderSmartTimePicker(input, popover);
  }));
  $$('[data-smart-minute]', popover).forEach(btn => btn.addEventListener('click', () => {
    parts.minute = Number(btn.dataset.smartMinute);
    setSmartDateTimeValue(input, `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`, false);
    renderSmartTimePicker(input, popover);
  }));
  popover.querySelector('[data-smart-clear]')?.addEventListener('click', () => setSmartDateTimeValue(input, ''));
  popover.querySelector('[data-smart-done]')?.addEventListener('click', closeSmartDateTimePicker);
}

function setSmartDateTimeValue(input, value, close = true) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  syncSmartDateTimeInput(input);
  if (close) closeSmartDateTimePicker();
}

function animatePreferenceToggle(selector) {
  $$(selector).forEach(btn => {
    btn.classList.remove('is-switching');
    void btn.offsetWidth;
    btn.classList.add('is-switching');
    clearTimeout(btn.__switchTimer);
    btn.__switchTimer = setTimeout(() => btn.classList.remove('is-switching'), 620);
  });
}

const OVERLAY_BACKED_LAYER_SELECTOR = [
  '[data-auth-modal].active',
  '[data-cart-drawer].active',
  '.detail-modal.active',
  '[data-profile-password-dialog].active',
  '[data-profile-image-editor].active',
  '[data-saved-address-map-modal].active',
  '[data-map-modal].active'
].join(',');

const PAGE_LOCK_LAYER_SELECTOR = [
  OVERLAY_BACKED_LAYER_SELECTOR,
  '[data-sidebar].active',
  '[data-mobile-nav].active',
  '.smart-date-time-popover'
].join(',');

function syncPageLayerState() {
  const locked = Boolean(document.querySelector(PAGE_LOCK_LAYER_SELECTOR));
  document.documentElement.classList.toggle('page-layer-open', locked);
  document.body?.classList.toggle('page-layer-open', locked);
}

function syncOverlayState() {
  $('[data-overlay]')?.classList.toggle('active', Boolean(document.querySelector(OVERLAY_BACKED_LAYER_SELECTOR)));
  syncPageLayerState();
}

function initPageLayerObserver() {
  if (!document.body || document.body.dataset.layerObserverBound === 'true') return;
  document.body.dataset.layerObserverBound = 'true';
  const observer = new MutationObserver(syncPageLayerState);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class']
  });
  syncPageLayerState();
}

async function initGlobalUI() {
  applyTheme();
  applyLanguage();
  initPageLayerObserver();
  bindGlobalEvents();
  initNavIndicator();
  ensureNotificationBadges();
  renderUserHeader();
  renderCartSummary();
  renderNotificationBadge();
  if (typeof applyRestaurantBranding === 'function') applyRestaurantBranding();

  await bootstrapPublicData();
  applyRestaurantBranding();
  if (typeof syncRestaurantOrderAvailability === 'function') syncRestaurantOrderAvailability();

  if (AppState.token) {
    const hasAuthenticatedCustomer = await refreshCustomerContext();
    if (hasAuthenticatedCustomer && document.body.dataset.page !== 'notifications' && customerNotificationsAllowed()) {
      await refreshNotificationBadge();
    } else {
      updateNotificationBadgeCount(0);
    }
  } else {
    updateNotificationBadgeCount(0);
  }
  await initPageSpecific();
  startLivePublicDataPolling();
  startCatalogNotificationPolling();
  initSmartDateTimeInputs();
}

function bindGlobalEvents() {
  $$('[data-theme-toggle]').forEach(btn => btn.addEventListener('click', () => {
    animatePreferenceToggle('[data-theme-toggle]');
    AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
    persist();
    applyTheme();
  }));

  $$('[data-lang-toggle]').forEach(btn => btn.addEventListener('click', () => {
    animatePreferenceToggle('[data-lang-toggle]');
    AppState.lang = AppState.lang === 'ar' ? 'en' : 'ar';
    persist();
    applyLanguage();
    if (typeof applyRestaurantBranding === 'function') applyRestaurantBranding();
    renderUserHeader();
    renderCartSummary();
    renderNotificationBadge();
    initPageSpecific().catch(error => {
      console.error(error);
      showToast(langText('تعذر تحديث الصفحة الآن', 'Unable to refresh the page now'));
    }).finally(() => {
      initSmartDateTimeInputs();
    });
  }));

  const mobileToggle = $('[data-mobile-toggle]');
  const mobileNav = $('[data-mobile-nav]');
  mobileToggle?.setAttribute('aria-expanded', 'false');
  mobileToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSidebar();
    const isActive = mobileNav?.classList.toggle('active');
    mobileToggle.setAttribute('aria-expanded', String(Boolean(isActive)));
    mobileToggle.setAttribute('aria-label', isActive ? langText('إغلاق قائمة التنقل', 'Close navigation menu') : langText('فتح قائمة التنقل', 'Open navigation menu'));
  });
  $$('[data-mobile-nav] a').forEach(link => link.addEventListener('click', () => {
    mobileNav?.classList.remove('active');
    mobileToggle?.setAttribute('aria-expanded', 'false');
  }));

  const overlay = $('[data-overlay]');
  $$('[data-open-auth]').forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    overlay?.classList.add('active');
    $('[data-auth-modal]')?.classList.add('active');
  }));
  $$('[data-close-auth]').forEach(btn => btn.addEventListener('click', closeAuth));
  overlay?.addEventListener('click', () => {
    closeAuth(); closeSidebar(); closeCart(); closeDetail();
  });

  const sidebarToggle = $('[data-open-sidebar]');
  const sidebar = $('[data-sidebar]');
  sidebarToggle?.setAttribute('aria-expanded', 'false');
  sidebarToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    mobileNav?.classList.remove('active');
    mobileToggle?.setAttribute('aria-expanded', 'false');
    const isActive = sidebar?.classList.toggle('active');
    sidebarToggle.setAttribute('aria-expanded', String(Boolean(isActive)));
  });
  $('[data-close-sidebar]')?.addEventListener('click', closeSidebar);
  document.addEventListener('click', (e) => {
    if (!e.target?.closest?.('.smart-date-time-field, .smart-date-time-popover')) closeSmartDateTimePicker();
    const target = e.target;
    if (!target?.closest?.('[data-mobile-nav], [data-mobile-toggle], [data-sidebar], [data-open-sidebar]')) {
      mobileNav?.classList.remove('active');
      mobileToggle?.setAttribute('aria-expanded', 'false');
      closeSidebar();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeSmartDateTimePicker();
    mobileNav?.classList.remove('active');
    mobileToggle?.setAttribute('aria-expanded', 'false');
    closeSidebar();
  });
  $('[data-open-cart]')?.addEventListener('click', () => { overlay?.classList.add('active'); $('[data-cart-drawer]')?.classList.add('active'); renderCartSummary(); });
  $('[data-close-cart]')?.addEventListener('click', closeCart);

  document.addEventListener('change', (e) => {
    if (e.target?.matches?.('[data-order-select]')) setOrderType(e.target.value);
  });
  document.addEventListener('input', (e) => {
    if (e.target?.matches?.('[data-order-notes]')) setOrderNotes(e.target.value);
  });
  document.addEventListener('click', (e) => {
    if (e.target?.closest?.('[data-cart-checkout]')) proceedWithCurrentOrder();
  });

  $$('[data-slider]').forEach(slider => bindSliderControls(slider));

  $$('a[onclick*="taza_logged_in"]').forEach(link => {
    link.removeAttribute('onclick');
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      await logoutCustomer();
      location.href = 'index.html';
    });
  });
}

function unreadNotificationsFromList(notifications = []) {
  return notifications.filter(item => !(item?.is_read || item?.read)).length;
}

function notificationBadgeLabel(count = AppState.notificationUnreadCount) {
  const value = normalizeNumber(count);
  return value > 99 ? '99+' : String(value);
}

function ensureNotificationBadges() {
  $$('[data-open-sidebar]').forEach(button => {
    button.classList.add('has-notification-anchor');
    button.setAttribute('aria-label', langText('فتح القائمة الجانبية', 'Open side menu'));
    button.title = langText('القائمة', 'Menu');
    if (!button.querySelector('[data-notification-badge]')) {
      const badge = document.createElement('span');
      badge.className = 'notification-count-badge';
      badge.dataset.notificationBadge = 'menu';
      badge.setAttribute('aria-hidden', 'true');
      button.appendChild(badge);
    }
  });

  $$('[data-sidebar] a[href*="notifications.html"]').forEach(link => {
    link.classList.add('has-notification-anchor');
    if (!link.querySelector('[data-notification-badge]')) {
      const badge = document.createElement('span');
      badge.className = 'notification-count-badge sidebar-notification-count';
      badge.dataset.notificationBadge = 'sidebar';
      badge.setAttribute('aria-hidden', 'true');
      link.appendChild(badge);
    }
  });
}

function renderNotificationBadge(count = AppState.notificationUnreadCount) {
  ensureNotificationBadges();
  const value = normalizeNumber(count);
  const visible = value > 0;
  const label = notificationBadgeLabel(value);
  $$('[data-notification-badge]').forEach(badge => {
    badge.textContent = label;
    badge.hidden = !visible;
  });
  $$('.has-notification-anchor').forEach(anchor => {
    anchor.classList.toggle('has-unread-notifications', visible);
  });
  $$('[data-open-sidebar]').forEach(button => {
    button.setAttribute('aria-label', visible
      ? langText(`فتح القائمة، لديك ${value} إشعار غير مقروء`, `Open menu, ${value} unread notifications`)
      : langText('فتح القائمة الجانبية', 'Open side menu'));
    button.title = visible
      ? langText(`${value} إشعار غير مقروء`, `${value} unread notifications`)
      : langText('القائمة', 'Menu');
  });
}

function updateNotificationBadgeCount(count) {
  AppState.notificationUnreadCount = normalizeNumber(count);
  renderNotificationBadge(AppState.notificationUnreadCount);
}

async function refreshNotificationBadge() {
  if (!customerNotificationsAllowed()) {
    updateNotificationBadgeCount(0);
    return 0;
  }
  const payload = await safeApi('/customer/notifications', { timeoutMs: 5000 });
  if (!payload) return AppState.notificationUnreadCount;
  const count = payload.unread_count ?? unreadNotificationsFromList(payload.notifications || []);
  updateNotificationBadgeCount(count);
  return AppState.notificationUnreadCount;
}

function catalogNotificationTarget(item = {}) {
  const data = item.data && typeof item.data === 'object' ? item.data : {};
  if (data.offer_id) return `menu.html?item=${encodeURIComponent(`offer:${data.offer_id}`)}`;
  if (data.product_id) return `menu.html?item=${encodeURIComponent(`product:${data.product_id}`)}`;
  return '';
}

function isCatalogNotification(item = {}) {
  const data = item.data && typeof item.data === 'object' ? item.data : {};
  return ['new_offer', 'new_product'].includes(String(item.type || ''))
    && Boolean(data.offer_id || data.product_id);
}

function catalogNotificationSeenKey() {
  return `taza_catalog_notifications_seen_${AppState.user.id}`;
}

const CUSTOMER_NOTIFICATION_SILENT_PAGES = new Set(['guest-home', 'auth', 'forgot', 'reset']);

function customerNotificationsAllowed() {
  const page = document.body.dataset.page || '';
  return !CUSTOMER_NOTIFICATION_SILENT_PAGES.has(page)
    && Boolean(AppState.token && AppState.loggedIn && Number(AppState.user?.id) > 0);
}

function canShowCatalogNotifications() {
  return customerNotificationsAllowed();
}

function readSeenCatalogNotificationIds() {
  try {
    const value = JSON.parse(sessionStorage.getItem(catalogNotificationSeenKey()) || '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch (_) {
    return new Set();
  }
}

function saveSeenCatalogNotificationIds(ids) {
  try {
    sessionStorage.setItem(catalogNotificationSeenKey(), JSON.stringify([...ids].slice(-200)));
  } catch (_) {}
}

async function openCatalogNotification(item, target = catalogNotificationTarget(item)) {
  if (!target) return;
  if (!(item.is_read || item.read)) {
    try {
      await safeApi(`/customer/notifications/${item.id}/read`, { method: 'PUT', timeoutMs: 3500 });
      updateNotificationBadgeCount(Math.max(0, AppState.notificationUnreadCount - 1));
    } catch (_) {}
  }
  location.href = target;
}

let catalogNotificationPollTimer = null;
let catalogNotificationPollRunning = false;

async function pollCatalogNotifications() {
  if (catalogNotificationPollRunning || !canShowCatalogNotifications() || document.hidden) return;
  catalogNotificationPollRunning = true;
  try {
    const payload = await safeApi('/customer/notifications?status=unread', { timeoutMs: 5000 });
    if (!payload) return;
    updateNotificationBadgeCount(payload.unread_count ?? unreadNotificationsFromList(payload.notifications || []));

    const seenIds = readSeenCatalogNotificationIds();
    const fresh = (payload.notifications || [])
      .filter(isCatalogNotification)
      .filter(item => !seenIds.has(String(item.id)))
      .slice(0, 4);

    fresh.forEach(item => {
      const target = catalogNotificationTarget(item);
      seenIds.add(String(item.id));
      showToast(item.message || langText('يوجد عنصر جديد في المنيو', 'A new item is available in the menu'), {
        title: item.title || langText('جديد في TAZA 041', 'New at TAZA 041'),
        kind: item.type === 'new_offer' ? 'offer' : 'meal',
        position: 'top',
        duration: 8500,
        onClick: () => openCatalogNotification(item, target)
      });
    });
    saveSeenCatalogNotificationIds(seenIds);
  } catch (error) {
    console.debug('Catalog notification polling is temporarily unavailable.', error);
  } finally {
    catalogNotificationPollRunning = false;
  }
}

function startCatalogNotificationPolling() {
  if (!canShowCatalogNotifications() || catalogNotificationPollTimer) return;
  pollCatalogNotifications();
  catalogNotificationPollTimer = window.setInterval(pollCatalogNotifications, 15000);
  window.addEventListener('focus', pollCatalogNotifications);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollCatalogNotifications();
  });
}

let livePublicDataPollTimer = null;

function startLivePublicDataPolling() {
  if (livePublicDataPollTimer || typeof refreshLivePublicData !== 'function') return;
  livePublicDataPollTimer = window.setInterval(refreshLivePublicData, 5000);
  window.addEventListener('focus', refreshLivePublicData);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshLivePublicData();
  });
}

function bindSliderControls(slider) {
  if (slider.dataset.sliderControlsBound === 'true') {
    updateSliderControls(slider);
    return;
  }
  slider.dataset.sliderControlsBound = 'true';
  const shell = slider.closest('section') || slider.parentElement;
  let sliderShell = slider.closest('.slider-shell');
  if (!sliderShell && slider.parentElement) {
    sliderShell = document.createElement('div');
    sliderShell.className = 'slider-shell';
    slider.parentElement.insertBefore(sliderShell, slider);
    sliderShell.appendChild(slider);
  }
  const controls = shell?.querySelector('.slider-controls') || sliderShell?.querySelector('.slider-controls');
  if (controls && sliderShell && controls.parentElement !== sliderShell) sliderShell.appendChild(controls);
  const prev = controls?.querySelector('[data-slide="prev"]') || shell?.querySelector('[data-slide="prev"]');
  const next = controls?.querySelector('[data-slide="next"]') || shell?.querySelector('[data-slide="next"]');
  const animate = (btn) => {
    btn?.classList.remove('is-sliding');
    if (btn) void btn.offsetWidth;
    btn?.classList.add('is-sliding');
    setTimeout(() => btn?.classList.remove('is-sliding'), 360);
  };
  prev?.setAttribute('aria-label', langText('تمرير العروض إلى اليسار', 'Scroll slider left'));
  next?.setAttribute('aria-label', langText('تمرير العروض إلى اليمين', 'Scroll slider right'));
  prev?.setAttribute('title', langText('تمرير لليسار', 'Scroll left'));
  next?.setAttribute('title', langText('تمرير لليمين', 'Scroll right'));
  prev?.addEventListener('click', () => {
    animate(prev);
    slider.scrollBy({ left: -sliderStep(slider), behavior: 'smooth' });
    setTimeout(() => updateSliderControls(slider), 420);
  });
  next?.addEventListener('click', () => {
    animate(next);
    slider.scrollBy({ left: sliderStep(slider), behavior: 'smooth' });
    setTimeout(() => updateSliderControls(slider), 420);
  });
  slider.addEventListener('scroll', () => requestSliderControlsUpdate(slider), { passive: true });
  window.addEventListener('resize', () => requestSliderControlsUpdate(slider));
  requestSliderControlsUpdate(slider);
}

function sliderStep(slider) {
  const card = slider.querySelector('.card-item, .product-card, .empty-state');
  const gap = parseFloat(getComputedStyle(slider).columnGap || getComputedStyle(slider).gap) || 18;
  return Math.max(260, Math.min(slider.clientWidth * .82, (card?.getBoundingClientRect().width || 340) + gap));
}

function sliderHiddenSides(slider) {
  const tolerance = 3;
  if (slider.classList.contains('is-empty')) return { left: false, right: false };

  const sliderRect = slider.getBoundingClientRect();
  const items = [...slider.children].filter(child => child.getBoundingClientRect().width > 0);
  if (!items.length) return { left: false, right: false };

  const content = items.reduce((bounds, child) => {
    const rect = child.getBoundingClientRect();
    return {
      left: Math.min(bounds.left, rect.left),
      right: Math.max(bounds.right, rect.right)
    };
  }, { left: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY });

  return {
    left: content.left < sliderRect.left - tolerance,
    right: content.right > sliderRect.right + tolerance
  };
}

function setSliderButtonState(button, visible) {
  if (!button) return;
  button.classList.toggle('is-hidden', !visible);
  button.disabled = !visible;
  button.setAttribute('aria-hidden', String(!visible));
  button.tabIndex = visible ? 0 : -1;
}

function updateSliderControls(slider) {
  const sliderShell = slider.closest('.slider-shell') || slider.parentElement;
  const shell = slider.closest('section') || sliderShell;
  const controls = sliderShell?.querySelector('.slider-controls') || shell?.querySelector('.slider-controls');
  const prev = controls?.querySelector('[data-slide="prev"]');
  const next = controls?.querySelector('[data-slide="next"]');
  const sides = sliderHiddenSides(slider);

  setSliderButtonState(prev, sides.left);
  setSliderButtonState(next, sides.right);
  controls?.classList.toggle('is-idle', !sides.left && !sides.right);
}

function requestSliderControlsUpdate(slider) {
  if (slider.__sliderUpdateQueued) return;
  slider.__sliderUpdateQueued = true;
  requestAnimationFrame(() => {
    slider.__sliderUpdateQueued = false;
    updateSliderControls(slider);
  });
}

function emptyStateHtml(type = 'items') {
  const states = {
    offers: {
      icon: '%',
      title: langText('لا توجد عروض اليوم', 'No offers today'),
      body: langText('تابع القائمة؛ سنعرض أي خصومات أو باقات جديدة هنا فور توفرها.', 'Check the menu; new discounts and bundles will appear here as soon as they are available.')
    },
    products: {
      icon: '!',
      title: langText('لا توجد وجبات متاحة الآن', 'No meals available right now'),
      body: langText('جرّب تغيير التصنيف أو البحث، وقد تظهر الوجبات عند تحديث القائمة.', 'Try changing the category or search; meals may appear when the menu is updated.')
    },
    search: {
      icon: '?',
      title: langText('لا توجد نتائج مطابقة', 'No matching results'),
      body: langText('خفّف شروط البحث أو اختر تصنيفاً آخر من القائمة.', 'Relax the filters or choose another menu category.')
    }
  };
  const state = states[type] || states.products;
  return `
    <article class="empty-state empty-state-${esc(type)}">
      <div class="empty-state-icon" aria-hidden="true">${esc(state.icon)}</div>
      <div>
        <h3>${esc(state.title)}</h3>
        <p>${esc(state.body)}</p>
      </div>
    </article>`;
}

function initNavIndicator() {
  const nav = $('.main-nav');
  if (!nav) return;
  const links = $$('a', nav);
  if (!links.length) return;
  $$('.main-nav-indicator', nav).forEach((el, index) => { if (index) el.remove(); });
  let indicator = $('.main-nav-indicator', nav);
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = 'main-nav-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    nav.appendChild(indicator);
  }

  const linkPath = (link) => {
    try { return new URL(link.getAttribute('href'), location.href); }
    catch (_) { return null; }
  };
  const currentFile = () => location.pathname.split('/').pop() || 'index.html';
  const urlFile = (url) => url?.pathname.split('/').pop() || 'index.html';
  const isSamePage = (url) => url && urlFile(url) === currentFile();
  const getBaseActive = () => {
    const currentPath = currentFile();
    const currentHash = location.hash;
    if (currentHash) {
      const hashMatch = links.find(link => {
        const url = linkPath(link);
        return isSamePage(url) && url.hash === currentHash;
      });
      if (hashMatch) return hashMatch;
    }
    const directMatch = links.find(link => {
      const url = linkPath(link);
      return urlFile(url) === currentPath && !url?.hash;
    });
    if (directMatch) return directMatch;
    const page = document.body.dataset.page || '';
    if (page.includes('home')) return links.find(link => linkPath(link)?.hash === '#home') || links[0];
    if (page === 'menu') return links.find(link => linkPath(link)?.hash === '#menu-preview') || links[0];
    if (page === 'about') return links.find(link => urlFile(linkPath(link)) === 'about.html') || links[0];
    return links[0];
  };
  const sectionLinks = links.map(link => {
    const url = linkPath(link);
    if (!url?.hash || !isSamePage(url)) return null;
    const section = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    return section ? { link, section } : null;
  }).filter(Boolean);
  const getScrollActive = () => {
    if (!sectionLinks.length) return null;
    const anchorLine = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 92) + 72;
    const footerEntry = sectionLinks.find(({ section }) => section.id === 'footer');
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const isAtPageBottom = window.scrollY >= maxScroll - 8;

    // The footer is usually shorter than the viewport, so its top may never reach
    // the regular anchor line. Activate its link from the first visible pixel to
    // avoid falling back to Home while crossing the content above it.
    if (footerEntry) {
      const footerRect = footerEntry.section.getBoundingClientRect();
      const footerIsInView = footerRect.top < window.innerHeight
        && footerRect.bottom > anchorLine;
      if (footerIsInView || isAtPageBottom) return footerEntry.link;
    } else if (isAtPageBottom) {
      return sectionLinks[sectionLinks.length - 1]?.link || null;
    }

    let candidate = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    sectionLinks.forEach(({ link, section }) => {
      const rect = section.getBoundingClientRect();
      const visible = rect.bottom > anchorLine && rect.top < window.innerHeight * 0.58;
      if (!visible) return;
      const distance = Math.abs(rect.top - anchorLine);
      if (rect.top <= anchorLine && distance <= bestDistance) {
        candidate = link;
        bestDistance = distance;
      } else if (!candidate && distance <= bestDistance) {
        candidate = link;
        bestDistance = distance;
      }
    });
    return candidate;
  };
  const moveTo = (link) => {
    if (!link) return;
    const width = Math.min(nav.clientWidth, Math.max(28, link.offsetWidth - 30));
    const rawLeft = link.offsetLeft + ((link.offsetWidth - width) / 2);
    const left = Math.max(0, Math.min(rawLeft, nav.clientWidth - width));
    indicator.style.left = `${left}px`;
    indicator.style.width = `${width}px`;
    indicator.style.opacity = '1';
    links.forEach(item => item.classList.toggle('active', item === link));
  };
  const getActive = () => getScrollActive() || getBaseActive();
  const moveToActive = () => requestAnimationFrame(() => moveTo(getActive()));
  let scrollTicking = false;
  const handleScroll = () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      scrollTicking = false;
      moveTo(getActive());
    });
  };

  links.forEach(link => {
    link.addEventListener('mouseenter', () => moveTo(link));
    link.addEventListener('focus', () => moveTo(link));
    link.addEventListener('click', () => setTimeout(moveToActive, 80));
  });
  nav.addEventListener('mouseleave', moveToActive);
  window.addEventListener('hashchange', moveToActive);
  window.addEventListener('resize', moveToActive);
  window.addEventListener('scroll', handleScroll, { passive: true });
  moveToActive();
}

function closeAuth() {
  $('[data-auth-modal]')?.classList.remove('active');
  syncOverlayState();
}
function closeSidebar() {
  $('[data-sidebar]')?.classList.remove('active');
  $('[data-open-sidebar]')?.setAttribute('aria-expanded', 'false');
  syncOverlayState();
}
function closeCart() {
  $('[data-cart-drawer]')?.classList.remove('active');
  syncOverlayState();
}
function closeDetail() {
  $$('.detail-modal').forEach(modal => modal.classList.remove('active'));
  syncOverlayState();
}
