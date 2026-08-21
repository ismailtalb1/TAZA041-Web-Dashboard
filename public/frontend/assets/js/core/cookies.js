// Cookie consent and lightweight cookie utilities for TAZA 041.
const TazaCookies = (function () {
  const COOKIE_VERSION = '2026-07';
  const DEFAULT_CONSENT = {
    necessary: true,
    preferences: false,
    analytics: false,
    marketing: false
  };

  const COOKIE_NAMES = {
    consent: 'taza_cookie_consent',
    session: 'taza_session_id',
    policy: 'taza_cookie_policy',
    preferences: 'taza_preferences'
  };

  const consentMaxAge = 60 * 60 * 24 * 180;
  const sessionMaxAge = 60 * 60 * 24 * 30;
  const preferenceMaxAge = 60 * 60 * 24 * 180;

  let initialized = false;
  let panel = null;
  let trigger = null;
  let triggerDelegationBound = false;

  function appState() {
    return typeof AppState !== 'undefined' ? AppState : null;
  }

  function activeLang() {
    return appState()?.lang === 'en' ? 'en' : 'ar';
  }

  function text(ar, en) {
    return activeLang() === 'ar' ? ar : en;
  }

  function cookieOptions(maxAge) {
    const parts = ['path=/', `max-age=${maxAge}`, 'SameSite=Lax'];
    if (location.protocol === 'https:') parts.push('Secure');
    return parts.join('; ');
  }

  function setCookie(name, value, maxAge = consentMaxAge) {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${cookieOptions(maxAge)}`;
  }

  function getCookie(name) {
    const key = `${encodeURIComponent(name)}=`;
    return document.cookie
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(key))
      ?.slice(key.length) || '';
  }

  function removeCookie(name) {
    document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=Lax`;
  }

  function storageGet(name) {
    try {
      return window.localStorage?.getItem(name) || null;
    } catch (_) {
      return null;
    }
  }

  function storageSet(name, value) {
    try {
      window.localStorage?.setItem(name, value);
    } catch (_) {}
  }

  function storageRemove(name) {
    try {
      window.localStorage?.removeItem(name);
    } catch (_) {}
  }

  function readJsonCookie(name, fallback = null) {
    try {
      const raw = getCookie(name);
      return raw ? JSON.parse(decodeURIComponent(raw)) : fallback;
    } catch (_) {
      removeCookie(name);
      return fallback;
    }
  }

  function storedConsent() {
    const cookieConsent = readJsonCookie(COOKIE_NAMES.consent);
    if (cookieConsent?.version === COOKIE_VERSION) {
      return { ...DEFAULT_CONSENT, ...cookieConsent.categories };
    }

    try {
      const raw = storageGet(COOKIE_NAMES.consent);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.version === COOKIE_VERSION) return { ...DEFAULT_CONSENT, ...parsed.categories };
    } catch (_) {
      storageRemove(COOKIE_NAMES.consent);
    }

    return null;
  }

  function hasDecision() {
    return Boolean(storedConsent());
  }

  function writeConsent(categories) {
    const normalized = { ...DEFAULT_CONSENT, ...categories, necessary: true };
    const payload = JSON.stringify({
      version: COOKIE_VERSION,
      savedAt: new Date().toISOString(),
      categories: normalized
    });

    setCookie(COOKIE_NAMES.consent, payload, consentMaxAge);
    setCookie(COOKIE_NAMES.policy, COOKIE_VERSION, consentMaxAge);
    storageSet(COOKIE_NAMES.consent, payload);

    if (normalized.preferences) syncPreferences();
    else removeCookie(COOKIE_NAMES.preferences);

    document.dispatchEvent(new CustomEvent('taza:cookies-updated', { detail: normalized }));
    return normalized;
  }

  function currentConsent() {
    return storedConsent() || { ...DEFAULT_CONSENT };
  }

  function isAllowed(category) {
    return category === 'necessary' || Boolean(currentConsent()[category]);
  }

  function ensureNecessaryCookies() {
    if (!getCookie(COOKIE_NAMES.session)) {
      const value = window.crypto?.randomUUID?.() || `taza-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setCookie(COOKIE_NAMES.session, value, sessionMaxAge);
    }
    setCookie(COOKIE_NAMES.policy, COOKIE_VERSION, consentMaxAge);
  }

  function syncPreferences() {
    if (!isAllowed('preferences')) return;
    const preferences = {
      lang: appState()?.lang || document.documentElement.lang || 'ar',
      theme: appState()?.theme || document.documentElement.dataset.theme || 'dark',
      orderType: appState()?.orderType || ''
    };
    setCookie(COOKIE_NAMES.preferences, JSON.stringify(preferences), preferenceMaxAge);
  }

  function categoryRows() {
    const consent = currentConsent();
    const rows = [
      {
        id: 'necessary',
        locked: true,
        title: text('ضرورية', 'Necessary'),
        body: text('تشغّل الجلسة، الأمان، وسير الطلب الأساسي.', 'Keeps sessions, security, and core ordering running.')
      },
      {
        id: 'preferences',
        title: text('التفضيلات', 'Preferences'),
        body: text('تحفظ اللغة، الثيم، ونوع الطلب المفضل.', 'Remembers language, theme, and preferred order type.')
      },
      {
        id: 'analytics',
        title: text('التحليلات', 'Analytics'),
        body: text('تساعدنا لاحقا على فهم الصفحات الأكثر استخداما.', 'Helps us later understand which pages are most useful.')
      },
      {
        id: 'marketing',
        title: text('التسويق', 'Marketing'),
        body: text('تدعم العروض والحملات عند إضافتها مستقبلا.', 'Supports offers and campaigns if added later.')
      }
    ];

    return rows.map(item => `
      <label class="cookie-option${item.locked ? ' is-locked' : ''}">
        <span>
          <strong>${item.title}</strong>
          <small>${item.body}</small>
        </span>
        <input type="checkbox" data-cookie-category="${item.id}" ${consent[item.id] ? 'checked' : ''} ${item.locked ? 'disabled' : ''}>
        <i aria-hidden="true"></i>
      </label>
    `).join('');
  }

  function renderPanel() {
    destroyPanel();

    panel = document.createElement('section');
    panel.className = 'cookie-consent';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-label', text('إعدادات ملفات تعريف الارتباط', 'Cookie settings'));
    panel.innerHTML = `
      <button class="cookie-consent__close" type="button" data-cookie-close aria-label="${text('إغلاق إعدادات الكوكيز', 'Close cookie settings')}" title="${text('إغلاق', 'Close')}">&times;</button>
      <div class="cookie-consent__mark" aria-hidden="true">i</div>
      <div class="cookie-consent__body">
        <span class="section-tag">${text('خصوصية واضحة', 'Clear privacy')}</span>
        <h2>${text('ملفات تعريف الارتباط في TAZA 041', 'Cookies at TAZA 041')}</h2>
        <p>${text('نستخدم الكوكيز الضرورية لتشغيل الموقع، ويمكنك اختيار السماح بالتفضيلات والتحليلات والتسويق الآن أو لاحقا.', 'We use necessary cookies to run the site. You can allow preferences, analytics, and marketing now or later.')}</p>
        <div class="cookie-consent__options" data-cookie-options hidden>${categoryRows()}</div>
      </div>
      <div class="cookie-consent__actions">
        <button class="btn btn-primary" type="button" data-cookie-accept-all>${text('قبول الكل', 'Accept all')}</button>
        <button class="btn btn-secondary" type="button" data-cookie-necessary>${text('الضروري فقط', 'Necessary only')}</button>
        <button class="btn btn-ghost" type="button" data-cookie-customize aria-expanded="false">${text('تخصيص', 'Customize')}</button>
        <button class="btn btn-primary cookie-save" type="button" data-cookie-save hidden>${text('حفظ الاختيارات', 'Save choices')}</button>
      </div>
    `;

    document.body.appendChild(panel);
    bindPanel();
    syncTriggerState(true);
    requestAnimationFrame(() => panel?.classList.add('is-visible'));
  }

  function destroyPanel() {
    panel?.remove();
    panel = null;
    syncTriggerState(false);
  }

  function panelIsVisible() {
    return Boolean(panel?.isConnected && panel.classList.contains('is-visible'));
  }

  function selectedCategories() {
    const categories = { necessary: true };
    panel?.querySelectorAll('[data-cookie-category]').forEach(input => {
      categories[input.dataset.cookieCategory] = input.checked || input.disabled;
    });
    return categories;
  }

  function closePanel(categories) {
    writeConsent(categories);
    panel?.classList.remove('is-visible');
    setTimeout(destroyPanel, 220);
    renderTrigger();
    if (typeof showToast === 'function') {
      showToast(text('تم حفظ تفضيلات الكوكيز', 'Cookie preferences saved'));
    }
  }

  function dismissPanel() {
    if (!hasDecision()) {
      closePanel({ necessary: true, preferences: false, analytics: false, marketing: false });
      return;
    }

    panel?.classList.remove('is-visible');
    setTimeout(destroyPanel, 220);
  }

  function bindPanel() {
    panel.querySelector('[data-cookie-close]')?.addEventListener('click', dismissPanel);
    panel.querySelector('[data-cookie-accept-all]')?.addEventListener('click', () => {
      closePanel({ necessary: true, preferences: true, analytics: true, marketing: true });
    });
    panel.querySelector('[data-cookie-necessary]')?.addEventListener('click', () => {
      closePanel({ necessary: true, preferences: false, analytics: false, marketing: false });
    });
    panel.querySelector('[data-cookie-save]')?.addEventListener('click', () => closePanel(selectedCategories()));
    panel.querySelector('[data-cookie-customize]')?.addEventListener('click', event => {
      const options = panel.querySelector('[data-cookie-options]');
      const save = panel.querySelector('[data-cookie-save]');
      const expanded = options.hidden;
      options.hidden = !expanded;
      save.hidden = !expanded;
      event.currentTarget.setAttribute('aria-expanded', String(expanded));
      panel.classList.toggle('is-expanded', expanded);
    });
  }

  function togglePanel() {
    if (panelIsVisible()) {
      dismissPanel();
      return;
    }

    if (panel) destroyPanel();
    renderPanel();
  }

  function bindTriggerDelegation() {
    if (triggerDelegationBound) return;
    triggerDelegationBound = true;

    document.addEventListener('click', event => {
      const button = event.target?.closest?.('.cookie-preferences-btn');
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      togglePanel();
    }, true);
  }

  function renderTrigger() {
    trigger?.remove();
    trigger = null;

    const sidebarLinks = document.querySelector('.sidebar-links');
    const chatLink = sidebarLinks?.querySelector('a[href="ai-suggestion.html"]');
    const logoutLink = sidebarLinks?.querySelector('[onclick*="taza_logged_in"], [data-customer-logout]');
    const customerSidebarMenu = Boolean(sidebarLinks && logoutLink);

    if (!customerSidebarMenu) return;

    trigger = document.createElement('button');
    trigger.className = 'sidebar-link cookie-preferences-btn cookie-preferences-menu-item';
    trigger.type = 'button';
    trigger.setAttribute('aria-label', text('إدارة تفضيلات الكوكيز', 'Manage cookie preferences'));
    trigger.setAttribute('data-label', text('إعدادات الكوكيز', 'Cookie settings'));
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `<span class="cookie-preferences-btn__icon" aria-hidden="true">🍪</span><span>${text('إعدادات الكوكيز', 'Cookie settings')}</span>`;

    if (chatLink) chatLink.insertAdjacentElement('afterend', trigger);
    else sidebarLinks.insertBefore(trigger, logoutLink);
    syncTriggerState(panelIsVisible());
  }

  function syncTriggerState(isOpen) {
    if (!trigger) return;
    trigger.setAttribute('aria-expanded', String(isOpen));
    trigger.classList.toggle('is-active', isOpen);
  }

  function refresh() {
    if (panel) {
      const wasExpanded = panel.classList.contains('is-expanded');
      renderPanel();
      if (wasExpanded) panel.querySelector('[data-cookie-customize]')?.click();
    }
    renderTrigger();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    ensureNecessaryCookies();
    bindTriggerDelegation();
    renderTrigger();
    if (hasDecision()) {
      syncPreferences();
    } else {
      renderPanel();
    }
  }

  return {
    init,
    refresh,
    syncPreferences,
    getConsent: currentConsent,
    hasConsent: hasDecision,
    isAllowed,
    setCookie,
    getCookie: name => {
      const value = getCookie(name);
      return value ? decodeURIComponent(value) : '';
    },
    removeCookie,
    saveConsent: writeConsent,
    names: { ...COOKIE_NAMES },
    version: COOKIE_VERSION
  };
})();
