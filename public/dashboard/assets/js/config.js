/* =====================================================================
   TAZA 041 — Dashboard Config & API Client
   assets/js/config.js
   =====================================================================
   هذا الملف هو المرجع المركزي لكل الـ Dashboard
   يجب تضمينه في كل صفحة قبل أي ملف JS آخر
   ===================================================================== */

   'use strict';

   // ─────────────────────────────────────────────────────────────────────
   // [1] إعدادات الـ API
   // ─────────────────────────────────────────────────────────────────────
   const TAZA_CONFIG = {
     API_BASE:    (() => {
       const { hostname, port, protocol } = window.location;
       if (window.TAZA_API_BASE) return String(window.TAZA_API_BASE).replace(/\/$/, '');

       const frontendDevPorts = ['5500', '5173', '3000', '8080'];
       const storedDevelopmentBase = (protocol === 'file:' || frontendDevPorts.includes(port))
         ? localStorage.getItem('taza_api_base')
         : '';
       if (storedDevelopmentBase) return String(storedDevelopmentBase).replace(/\/$/, '');

       if (protocol === 'file:') {
         return 'http://localhost:8000/api';
       }

       const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
       const isPrivateHost = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
       if ((isLocalHost || isPrivateHost) && frontendDevPorts.includes(port)) {
         return `http://${hostname}:8000/api`;
       }

       return `${window.location.origin}/api`;
     })(),
     APP_NAME:    'TAZA 041',
     VERSION:     '1.0.0',
     TOKEN_KEY:   'taza041_token',
     USER_KEY:    'taza041_user',
     LANG_KEY:    'taza041_lang',
     THEME_KEY:   'taza041_theme',
     THEME_MODE_KEY: 'taza041_theme_mode',
     THEME_OVERRIDE_UNTIL_KEY: 'taza041_theme_override_until',

     // حدود الثيم الزمني
     DAY_START:   6,   // 6:00 صباحاً
     NIGHT_START: 18,  // 6:00 مساءً
   };

   // ─────────────────────────────────────────────────────────────────────
   // [2] كل نقاط الـ API — مطابقة تماماً لـ routes/api.php
   // ─────────────────────────────────────────────────────────────────────
   const API = {

     // ── Health Check ─────────────────────────────────────────────────
     HEALTH: '/health',

     // ── Auth الموظف ──────────────────────────────────────────────────
     AUTH: {
       LOGIN:          '/auth/employee/login',
       LOGOUT:         '/auth/employee/logout',
       ME:             '/auth/employee/me',
       UPDATE_PROFILE: '/auth/employee/profile',
       UPLOAD_AVATAR:  '/auth/employee/avatar',
     },

     // ── Public ───────────────────────────────────────────────────────
     PUBLIC: {
       RESTAURANT:  '/public/restaurant',
       IMAGES:      '/public/restaurant/images',
       PRODUCTS:    '/public/products',
       PRODUCT:     (id) => `/public/products/${id}`,
       OFFERS:      '/public/offers',
       OFFER:       (id) => `/public/offers/${id}`,
       PRICING:     '/public/pricing',
       AI_CHAT:     '/public/ai/chat',
     },

     // ── المدير العام — Employees ──────────────────────────────────────
     EMPLOYEES: {
       LIST:           '/admin/employees',
       STORE:          '/admin/employees',
       SHOW:           (id) => `/admin/employees/${id}`,
       UPDATE:         (id) => `/admin/employees/${id}`,
       DELETE:         (id) => `/admin/employees/${id}`,
       NOTIFY:         (id) => `/admin/employees/${id}/notify`,
       REVIEWS:        (id) => `/admin/employees/${id}/reviews`,
       RATE:           (id) => `/admin/employees/${id}/review`,
       UPLOAD_AVATAR:  (id) => `/admin/employees/${id}/avatar`,
     },

     // ── المدير العام — Customers ──────────────────────────────────────
     CUSTOMERS: {
       LIST:           '/admin/customers',
       SHOW:           (id) => `/admin/customers/${id}`,
       ORDERS:         (id) => `/admin/customers/${id}/orders`,
       BAN:            (id) => `/admin/customers/${id}/ban`,
       UNBAN:          (id) => `/admin/customers/${id}/unban`,
       BROADCAST:      '/admin/customers/broadcast',
     },

     // ── المدير العام — Orders ─────────────────────────────────────────
     ADMIN_ORDERS: {
       LIST:           '/admin/orders',
       STATS:          '/admin/orders/stats',
       SHOW:           (id) => `/admin/orders/${id}`,
     },

     // ── المدير العام — Restaurant Settings ───────────────────────────
     ADMIN_RESTAURANT: {
       SHOW:                   '/admin/restaurant',
       UPDATE_DELIVERY:        '/admin/restaurant/delivery-settings',
       UPDATE_RESERVATION:     '/admin/restaurant/reservation-settings',
       TOGGLE_OPEN:            '/admin/restaurant/toggle-open',
       UPLOAD_LOGO:            '/admin/restaurant/logo',
     },

     // ── المدير العام — Reports ────────────────────────────────────────
     ADMIN_REPORTS: {
       LIST:           '/admin/reports',
       STATS:          '/admin/reports/stats',
       SEND:           (id) => `/admin/reports/${id}/send`,
     },

     // ── مشترك — Orders (مدير الطلبات) ────────────────────────────────
     ORDERS: {
       LIST:           '/orders',
       PENDING:        '/orders/pending',
       SHOW:           (id) => `/orders/${id}`,
       CHANGE_STATUS:  (id) => `/orders/${id}/status`,
       NOTIFY_CUSTOMER:(id) => `/orders/${id}/notify-customer`,
       ARCHIVE:        (id) => `/orders/${id}/archive`,
       RESTORE:        (id) => `/orders/${id}/restore`,
       DELETE:         (id) => `/orders/${id}`,
       NORMAL:         '/orders/normal',
       NORMAL_STATS:   '/orders/normal/stats',
     },

     // ── الحجوزات ──────────────────────────────────────────────────────
     RESERVATIONS: {
       LIST:           '/orders/reservations',
       TODAY:          '/orders/reservations/today',
       UPCOMING:       '/orders/reservations/upcoming',
       SHOW:           (id) => `/orders/reservations/${id}`,
       CHANGE_STATUS:  (id) => `/orders/reservations/${id}/status`,
       TABLES:         '/public/reservations/tables',
       TABLE_CHECK:    (num) => `/orders/reservations/table/${num}/availability`,
     },

     // ── التوصيل ───────────────────────────────────────────────────────
     DELIVERY: {
       LIST:           '/delivery',
       ACTIVE:         '/delivery/active',
       ASSIGNED:       '/delivery/assigned',
       STATS:          '/delivery/stats',
       DRIVERS:        '/delivery/drivers',
       SHOW:           (id) => `/delivery/${id}`,
       ASSIGN_DRIVER:  (id) => `/delivery/${id}/assign`,
       CHANGE_STATUS:  (id) => `/delivery/${id}/status`,
       NOTIFY_CUSTOMER:(id) => `/delivery/${id}/notify-customer`,
       DRIVER_RATINGS: (id) => `/delivery/driver/${id}/ratings`,
       DRIVER_STATS:   (id) => `/delivery/driver/${id}/stats`,
       SETTINGS:       '/delivery/settings',
       UPDATE_SETTINGS:'/delivery/settings',
     },

     // ── المنتجات ──────────────────────────────────────────────────────
     PRODUCTS: {
       LIST:           '/products',
       LOW_STOCK:      '/products/low-stock',
       OUT_OF_STOCK:   '/products/out-of-stock',
       STATS:          '/products/stats',
       SHOW:           (id) => `/products/${id}`,
       STORE:          '/products',
       UPDATE:         (id) => `/products/${id}`,
       UPDATE_PRICE:   (id) => `/products/${id}/price`,
       UPDATE_LOYALTY: (id) => `/products/${id}/loyalty-price`,
       UPDATE_STOCK:   (id) => `/products/${id}/stock`,
       TOGGLE:         (id) => `/products/${id}/toggle`,
       DELETE:         (id) => `/products/${id}`,
       UPLOAD_IMAGE:   (id) => `/products/${id}/image`,
     },

     // ── العروض ───────────────────────────────────────────────────────
     OFFERS: {
       LIST:           '/offers',
       ACTIVE:         '/offers/active',
       EXPIRED:        '/offers/expired',
       UPCOMING:       '/offers/upcoming',
       SHOW:           (id) => `/offers/${id}`,
       STORE:          '/offers',
       UPDATE:         (id) => `/offers/${id}`,
       UPDATE_LOYALTY: (id) => `/offers/${id}/loyalty-price`,
       TOGGLE:         (id) => `/offers/${id}/toggle`,
       ADD_PRODUCT:    (id) => `/offers/${id}/products`,
       REMOVE_PRODUCT: (id, pid) => `/offers/${id}/products/${pid}`,
       BROADCAST:      (id) => `/offers/${id}/broadcast`,
       DELETE:         (id) => `/offers/${id}`,
       UPLOAD_IMAGE:   (id) => `/offers/${id}/image`,
     },

     // ── المدفوعات ─────────────────────────────────────────────────────
     FINANCE: {
       ACCOUNTS:         '/finance/accounts',
       ACCOUNTS_SUMMARY: '/finance/accounts/summary',
       ACCOUNT_SHOW:     (id) => `/finance/accounts/${id}`,
       ACCOUNT_STORE:    '/finance/accounts',
       ACCOUNT_UPDATE:   (id) => `/finance/accounts/${id}`,
       ACCOUNT_BALANCE:  (id) => `/finance/accounts/${id}/balance`,
       ACCOUNT_PRIMARY:  (id) => `/finance/accounts/${id}/primary`,
       ACCOUNT_WITHDRAW: (id) => `/finance/accounts/${id}/withdraw`,
       ACCOUNT_DELETE:   (id) => `/finance/accounts/${id}`,
       PAYMENTS:         '/finance/payments',
       PAYMENT_STATS:    '/finance/payments/stats',
       PAYMENT_SHOW:     (id) => `/finance/payments/${id}`,
       PAYMENT_REFUND:   (id) => `/finance/payments/${id}/refund`,
       REPORT:           '/finance/report',
     },

     // ── الولاء ───────────────────────────────────────────────────────
     LOYALTY: {
       LIST:           '/loyalty',
       STATS:          '/loyalty/stats',
       SETTINGS:       '/loyalty/settings',
       SHOW:           (cid) => `/loyalty/${cid}`,
       TRANSACTIONS:   (cid) => `/loyalty/${cid}/transactions`,
       ADJUST:         (cid) => `/loyalty/${cid}/adjust`,
     },

     // ── الإشعارات ─────────────────────────────────────────────────────
     NOTIFICATIONS: {
       LIST:           '/employee/notifications',
       UNREAD_COUNT:   '/employee/notifications/unread-count',
       MARK_READ:      (id) => `/employee/notifications/${id}/read`,
       MARK_ALL_READ:  '/employee/notifications/read-all',
     },

     // ── التقارير ─────────────────────────────────────────────────────
     REPORTS: {
       LIST:           '/employee/reports',
       SHOW:           (id) => `/employee/reports/${id}`,
       STORE:          '/employee/reports',
       REVIEW:         (id) => `/employee/reports/${id}/review`,
       ARCHIVE:        (id) => `/employee/reports/${id}/archive`,
       RESTORE:        (id) => `/employee/reports/${id}/restore`,
     },

     // ── التواصل ───────────────────────────────────────────────────────
     COMM: {
       RESTAURANT_SHOW:   '/communication/restaurant',
       RESTAURANT_UPDATE: '/communication/restaurant',
       IMAGES_LIST:       '/communication/images',
       IMAGE_UPLOAD:      '/communication/images',
       IMAGE_UPDATE:      (id) => `/communication/images/${id}`,
       IMAGE_REORDER:     (id) => `/communication/images/${id}/order`,
       IMAGE_TOGGLE:      (id) => `/communication/images/${id}/toggle`,
       IMAGE_DELETE:      (id) => `/communication/images/${id}`,
       SUGGESTIONS:       '/communication/meal-suggestions',
       SUGGESTIONS_STATS: '/communication/meal-suggestions/stats',
       SUGGESTION_SHOW:   (id) => `/communication/meal-suggestions/${id}`,
       SUGGESTION_REVIEW: (id) => `/communication/meal-suggestions/${id}/review`,
       SUGGESTION_IMPL:   (id) => `/communication/meal-suggestions/${id}/implement`,
       SUGGESTION_REJECT: (id) => `/communication/meal-suggestions/${id}/reject`,
       AI_REPORTS:        '/communication/ai-reports',
       AI_FORWARD:        (id) => `/communication/ai-reports/${id}/forward`,
     },

     // ── الذكاء الاصطناعي ──────────────────────────────────────────────
     AI: {
       CONVERSATIONS:   '/ai/conversations',
       CONV_STATS:      '/ai/conversations/stats',
       GENERATE_REPORT: '/ai/generate-report',
     },

     // ── التقييمات ─────────────────────────────────────────────────────
     REVIEWS: {
       DRIVERS:         '/reviews/drivers',
       EMPLOYEES:       '/reviews/employees',
       CUSTOMERS:       '/reviews/customers',
       DRIVER_SUMMARY:  (id) => `/reviews/driver/${id}/summary`,
     },

     // ── الرفع ─────────────────────────────────────────────────────────
     UPLOAD: {
       IMAGE:           '/upload/image',
       DELETE:          (path) => `/upload/${encodeURIComponent(path)}`,
       RESTAURANT_IMG:  '/communication/images',
       LOGO:            '/admin/restaurant/logo',
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [3] بناء الـ URL الكامل
   // ─────────────────────────────────────────────────────────────────────
   function buildURL(endpoint) {
     return TAZA_CONFIG.API_BASE + endpoint;
   }

   function buildAssetURL(value) {
     if (!value) return '';
     const raw = String(value).trim();
     if (!raw) return '';
     if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

     try {
       const apiOrigin = new URL(TAZA_CONFIG.API_BASE, window.location.href).origin;
       const parsed = new URL(raw, `${apiOrigin}/`);
       if (parsed.pathname.startsWith('/storage/')) {
         return `${apiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
       }
       return parsed.href;
     } catch {
       return raw;
     }
   }

   // ─────────────────────────────────────────────────────────────────────
   // [4] إدارة التوكن والمستخدم
   // ─────────────────────────────────────────────────────────────────────
   const Auth = {

     // حفظ بيانات تسجيل الدخول
     save(token, user) {
       localStorage.setItem(TAZA_CONFIG.TOKEN_KEY, token);
       localStorage.setItem(TAZA_CONFIG.USER_KEY, JSON.stringify(user));
     },

     // جلب التوكن
     getToken() {
       return localStorage.getItem(TAZA_CONFIG.TOKEN_KEY);
     },

     // جلب بيانات المستخدم
     getUser() {
       try {
         return JSON.parse(localStorage.getItem(TAZA_CONFIG.USER_KEY));
       } catch {
         return null;
       }
     },

     // التحقق من تسجيل الدخول
     isLoggedIn() {
       return !!this.getToken() && !!this.getUser();
     },

     // الدور الحالي
     getRole() {
       return this.getUser()?.role ?? null;
     },

     // تسجيل الخروج
     logout() {
       localStorage.removeItem(TAZA_CONFIG.TOKEN_KEY);
       localStorage.removeItem(TAZA_CONFIG.USER_KEY);
       window.location.href = 'index.html';
     },

     // التحقق من الدور وإعادة التوجيه إن لزم
     requireRole(...allowedRoles) {
       if (!this.isLoggedIn()) {
         window.location.href = 'index.html';
         return false;
       }
       if (allowedRoles.length > 0 && !allowedRoles.includes(this.getRole())) {
         this.redirectToHome();
         return false;
       }
       return true;
     },

     // توجيه كل دور لصفحته الرئيسية
     redirectToHome() {
       const pages = {
         'general_manager':       'general-manager.html',
         'order_manager':         'order-manager.html',
         'delivery_manager':      'delivery-manager.html',
         'inventory_manager':     'inventory-manager.html',
         'finance_manager':       'finance-manager.html',
         'communication_manager': 'communication-manager.html',
         'driver':                'driver.html',
       };
       const page = pages[this.getRole()];
       if (page) window.location.href = page;
       else this.logout();
     },

     // هل المستخدم يملك هذه الصلاحية؟
     can(ability) {
       const abilities = this.getUser()?.abilities ?? [];
       return abilities.includes(ability);
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [5] HTTP Client — طلبات الـ API
   // ─────────────────────────────────────────────────────────────────────
   const Http = {

     // Headers الافتراضية
     _headers(extra = {}) {
       const token = Auth.getToken();
       return {
         'Content-Type':  'application/json',
         'Accept':        'application/json',
         'X-Requested-With': 'XMLHttpRequest',
         ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
         ...extra,
       };
     },

     // Headers بدون Content-Type (لرفع الملفات)
     _headersMultipart() {
       const token = Auth.getToken();
       return {
         'Accept': 'application/json',
         ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
       };
     },

     // معالجة الرد
     async _handle(response) {
       const data = await response.json().catch(() => ({
         success: false,
         message: 'خطأ في قراءة الرد من الخادم',
       }));

       if (response.status === 401) {
         // انتهاء التوكن
         Toast.error('انتهت جلستك — يرجى تسجيل الدخول مجدداً');
         setTimeout(() => Auth.logout(), 1500);
         throw { status: 401, message: data.message };
       }

       if (response.status === 403) {
         Toast.warning(data.message ?? 'غير مصرح لك بهذا الإجراء');
         throw { status: 403, message: data.message };
       }

       if (!response.ok && !data.success) {
         throw { status: response.status, ...data };
       }

       return data;
     },

     // GET
     async get(endpoint, params = {}) {
       let url = buildURL(endpoint);
       if (Object.keys(params).length) {
         url += '?' + new URLSearchParams(
           Object.fromEntries(
             Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== '')
           )
         );
       }
       const res = await fetch(url, {
         method:  'GET',
         headers: this._headers(),
       });
       return this._handle(res);
     },

     // POST
     async post(endpoint, body = {}) {
       const res = await fetch(buildURL(endpoint), {
         method:  'POST',
         headers: this._headers(),
         body:    JSON.stringify(body),
       });
       return this._handle(res);
     },

     // PUT
     async put(endpoint, body = {}) {
       const res = await fetch(buildURL(endpoint), {
         method:  'PUT',
         headers: this._headers(),
         body:    JSON.stringify(body),
       });
       return this._handle(res);
     },

     // PATCH
     async patch(endpoint, body = {}) {
       const res = await fetch(buildURL(endpoint), {
         method:  'PATCH',
         headers: this._headers(),
         body:    JSON.stringify(body),
       });
       return this._handle(res);
     },

     // DELETE
     async delete(endpoint, body = {}) {
       const res = await fetch(buildURL(endpoint), {
         method:  'DELETE',
         headers: this._headers(),
         body:    Object.keys(body).length ? JSON.stringify(body) : undefined,
       });
       return this._handle(res);
     },

     // POST with FormData (رفع الملفات)
     async upload(endpoint, formData) {
       const res = await fetch(buildURL(endpoint), {
         method:  'POST',
         headers: this._headersMultipart(),
         body:    formData,
       });
       return this._handle(res);
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [6] Toast Notifications
   // ─────────────────────────────────────────────────────────────────────
   const Toast = {

     _container: null,

     _getContainer() {
       if (!this._container) {
         this._container = document.getElementById('toast-container');
         if (!this._container) {
           this._container = document.createElement('div');
           this._container.id        = 'toast-container';
           this._container.className = 'toast-container';
           this._container.setAttribute('aria-live', 'polite');
           this._container.setAttribute('aria-relevant', 'additions');
           document.body.appendChild(this._container);
         }
       }
       return this._container;
     },

     _dismiss(toast) {
       if (!toast || toast.classList.contains('removing')) return;
       toast.classList.add('removing');
       setTimeout(() => toast.remove(), 250);
     },

     _show(type, title, message, duration = 4000) {
       const icons = {
         success: 'fa-check',
         error:   'fa-xmark',
         warning: 'fa-exclamation',
         info:    'fa-info',
       };

       const toast = document.createElement('div');
       toast.className = `toast ${type}`;
       toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
       toast.setAttribute('aria-atomic', 'true');
       toast.tabIndex = 0;
       toast.style.setProperty('--toast-duration', `${duration}ms`);
       toast.innerHTML = `
         <span class="toast-icon"><i class="fa-solid ${icons[type]}"></i></span>
         <div class="toast-content">
           <div class="toast-title"></div>
           ${message ? '<div class="toast-message"></div>' : ''}
         </div>
         <button class="toast-close" type="button" aria-label="${(Lang.current ?? 'ar') === 'ar' ? 'إغلاق الإشعار' : 'Dismiss notification'}">
           <i class="fa-solid fa-xmark"></i>
         </button>
         <span class="toast-progress" aria-hidden="true"></span>
       `;

       toast.querySelector('.toast-title').textContent = title ?? '';
       const messageElement = toast.querySelector('.toast-message');
       if (messageElement) messageElement.textContent = message ?? '';
       toast.querySelector('.toast-close').addEventListener('click', () => this._dismiss(toast));

       const container = this._getContainer();
       const visibleToasts = container.querySelectorAll('.toast:not(.removing)');
       if (visibleToasts.length >= 3) this._dismiss(visibleToasts[0]);
       container.appendChild(toast);

       setTimeout(() => {
         this._dismiss(toast);
       }, duration);
     },

     success(title, message = '') { this._show('success', title, message); },
     error(title, message = '')   { this._show('error',   title, message, 5000); },
     warning(title, message = '') { this._show('warning', title, message); },
     info(title, message = '')    { this._show('info',    title, message); },

     // معالجة أخطاء API تلقائياً
     apiError(err) {
       const msg = err?.message ?? err?.data?.message ?? 'حدث خطأ غير متوقع';
       const errors = err?.errors;
       if (errors) {
         const first = Object.values(errors)[0];
         this.error('خطأ في البيانات', Array.isArray(first) ? first[0] : first);
       } else {
         this.error('خطأ', msg);
       }
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [7] نظام الثيم بالوقت
   // ─────────────────────────────────────────────────────────────────────
   const Theme = {

     _interval: null,
     _boundaryTimer: null,
     _active: null,

     // تحديد الثيم الحالي بالوقت
     getCurrent() {
       const hour = new Date().getHours();
       return (hour >= TAZA_CONFIG.DAY_START && hour < TAZA_CONFIG.NIGHT_START)
         ? 'day'
         : 'night';
     },

     // موعد التحويل التالي: 06:00 أو 18:00 حسب الوقت الحالي.
     getNextBoundary(from = new Date()) {
       const next = new Date(from);
       next.setSeconds(0, 0);
       if (from.getHours() < TAZA_CONFIG.DAY_START) {
         next.setHours(TAZA_CONFIG.DAY_START, 0, 0, 0);
       } else if (from.getHours() < TAZA_CONFIG.NIGHT_START) {
         next.setHours(TAZA_CONFIG.NIGHT_START, 0, 0, 0);
       } else {
         next.setDate(next.getDate() + 1);
         next.setHours(TAZA_CONFIG.DAY_START, 0, 0, 0);
       }
       return next;
     },

     // تطبيق الثيم
     apply(theme) {
       const root = document.documentElement;
       if (theme === 'night') {
         root.classList.add('theme-night');
       } else {
         root.classList.remove('theme-night');
       }
       localStorage.setItem(TAZA_CONFIG.THEME_KEY, theme);
       this._active = theme;
       this._updateIndicator(theme);
     },

     // الاختيار اليدوي مؤقت حتى أقرب حد زمني؛ بعدها يعود الوضع التلقائي.
     autoApply() {
       const mode = localStorage.getItem(TAZA_CONFIG.THEME_MODE_KEY) ?? 'auto';
       const overrideUntil = Number(localStorage.getItem(TAZA_CONFIG.THEME_OVERRIDE_UNTIL_KEY) ?? 0);
       const hasActiveOverride = ['day','night'].includes(mode) && overrideUntil > Date.now();

       if (!hasActiveOverride) {
         localStorage.setItem(TAZA_CONFIG.THEME_MODE_KEY, 'auto');
         localStorage.removeItem(TAZA_CONFIG.THEME_OVERRIDE_UNTIL_KEY);
       }

       this.apply(hasActiveOverride ? mode : this.getCurrent());
     },

     toggle() {
       const current = this._active ?? (document.documentElement.classList.contains('theme-night') ? 'night' : 'day');
       const next = current === 'night' ? 'day' : 'night';
       localStorage.setItem(TAZA_CONFIG.THEME_MODE_KEY, next);
       localStorage.setItem(TAZA_CONFIG.THEME_OVERRIDE_UNTIL_KEY, String(this.getNextBoundary().getTime()));
       this.apply(next);
     },

     getActive() {
       return this._active ?? (document.documentElement.classList.contains('theme-night') ? 'night' : 'day');
     },

     // بدء المراقبة التلقائية (كل دقيقة)
     startAutoWatch() {
       this.autoApply();
       if (this._interval) clearInterval(this._interval);
       this._interval = setInterval(() => this.autoApply(), 60_000);
       this._scheduleBoundary();
     },

     _scheduleBoundary() {
       if (this._boundaryTimer) clearTimeout(this._boundaryTimer);
       const delay = Math.max(250, this.getNextBoundary().getTime() - Date.now() + 100);
       this._boundaryTimer = setTimeout(() => {
         localStorage.setItem(TAZA_CONFIG.THEME_MODE_KEY, 'auto');
         localStorage.removeItem(TAZA_CONFIG.THEME_OVERRIDE_UNTIL_KEY);
         this.autoApply();
         this._scheduleBoundary();
       }, delay);
     },

     stopAutoWatch() {
       if (this._interval) clearInterval(this._interval);
       if (this._boundaryTimer) clearTimeout(this._boundaryTimer);
       this._interval = null;
       this._boundaryTimer = null;
     },

     // تحديث مؤشر الثيم في الـ Topbar
     _updateIndicator(theme) {
       const indicator = document.getElementById('theme-indicator-text');
       const dot       = document.getElementById('theme-dot');
       if (!indicator) return;

       const isNight = theme === 'night';
       indicator.textContent = isNight ? (Lang.current === 'ar' ? 'ليلي' : 'Night') : (Lang.current === 'ar' ? 'نهاري' : 'Day');

       const toggle = document.getElementById('theme-toggle');
       if (toggle) {
         const label = isNight
           ? (Lang.current === 'ar' ? 'التبديل إلى المظهر النهاري' : 'Switch to day theme')
           : (Lang.current === 'ar' ? 'التبديل إلى المظهر الليلي' : 'Switch to night theme');
         toggle.setAttribute('aria-label', label);
         toggle.setAttribute('title', label);
         toggle.setAttribute('aria-pressed', isNight ? 'true' : 'false');
       }

       if (dot) {
         dot.style.background   = isNight ? '#F59E0B' : '#2563EB';
         dot.style.boxShadow    = isNight ? '0 0 6px #F59E0B' : '0 0 6px #2563EB';
       }
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [8] نظام اللغة (عربي / إنجليزي)
   // ─────────────────────────────────────────────────────────────────────
   const Lang = {

     current: 'ar',

     // النصوص المترجمة
     _strings: {
       ar: {
         // عام
         loading:        'جارٍ التحميل...',
         save:           'حفظ',
         cancel:         'إلغاء',
         delete:         'حذف',
         edit:           'تعديل',
         add:            'إضافة',
         search:         'بحث...',
         filter:         'فلترة',
         all:            'الكل',
         yes:            'نعم',
         no:             'لا',
         confirm:        'تأكيد',
         close:          'إغلاق',
         back:           'رجوع',
         next:           'التالي',
         prev:           'السابق',
         details:        'التفاصيل',
         actions:        'الإجراءات',
         status:         'الحالة',
         date:           'التاريخ',
         total:          'الإجمالي',
         noData:         'لا توجد بيانات',
         error:          'حدث خطأ',
         success:        'تمت العملية بنجاح',
         logout:         'تسجيل الخروج',
         profile:        'الملف الشخصي',
         settings:       'الإعدادات',
         notifications:  'الإشعارات',
         reports:        'التقارير',
         dashboard:      'لوحة التحكم',
         // حالات الطلب
         pending:        'معلق',
         confirmed:      'مؤكد',
         ready:          'قيد التجهيز',
         completed:      'مكتمل',
         cancelled:      'ملغى',
         // حالات التوصيل
         assigned:       'تم التعيين',
         picked_up:      'مع السائق',
         in_delivery:    'جاري التوصيل',
         delivered:      'تم التسليم',
         // الأدوار
         general_manager:       'المدير العام',
         order_manager:         'مدير الطلبات',
         delivery_manager:      'مدير التوصيل',
         inventory_manager:     'مدير المخزون',
         finance_manager:       'المدير المالي',
         communication_manager: 'مدير التواصل',
         driver:                'سائق',
         // فئات المنتج
         meal:       'وجبات',
         drink:      'مشروبات',
         sandwich:   'سندويشات',
         mixed:      'مختلطة',
         // حالات الحجز
         seated:     'الجلسة قائمة',
         no_show:    'لم يحضر',
         // ثيم الوقت
         day_theme:   'ثيم النهار',
         night_theme: 'ثيم الليل',
       },

       en: {
         loading:        'Loading...',
         save:           'Save',
         cancel:         'Cancel',
         delete:         'Delete',
         edit:           'Edit',
         add:            'Add',
         search:         'Search...',
         filter:         'Filter',
         all:            'All',
         yes:            'Yes',
         no:             'No',
         confirm:        'Confirm',
         close:          'Close',
         back:           'Back',
         next:           'Next',
         prev:           'Previous',
         details:        'Details',
         actions:        'Actions',
         status:         'Status',
         date:           'Date',
         total:          'Total',
         noData:         'No data available',
         error:          'An error occurred',
         success:        'Operation successful',
         logout:         'Logout',
         profile:        'Profile',
         settings:       'Settings',
         notifications:  'Notifications',
         reports:        'Reports',
         dashboard:      'Dashboard',
         pending:        'Pending',
         confirmed:      'Confirmed',
         ready:          'Preparing',
         completed:      'Completed',
         cancelled:      'Cancelled',
         assigned:       'Assigned',
         picked_up:      'Picked Up',
         in_delivery:    'In Delivery',
         delivered:      'Delivered',
         general_manager:       'General Manager',
         order_manager:         'Order Manager',
         delivery_manager:      'Delivery Manager',
         inventory_manager:     'Inventory Manager',
         finance_manager:       'Finance Manager',
         communication_manager: 'Communication Manager',
         driver:                'Driver',
         meal:       'Meals',
         drink:      'Drinks',
         sandwich:   'Sandwiches',
         mixed:      'Mixed',
         seated:     'Session active',
         no_show:    'No Show',
         day_theme:   'Day Theme',
         night_theme: 'Night Theme',
       },
     },

     // جلب نص مترجم
     t(key, fallback = '') {
       return this._strings[this.current]?.[key] ?? fallback ?? key;
     },

     // تطبيق اللغة
     apply(lang) {
       this.current = lang;
       localStorage.setItem(TAZA_CONFIG.LANG_KEY, lang);
       document.documentElement.setAttribute('lang', lang);
       document.body.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
       document.body.classList.toggle('lang-en', lang === 'en');

       // تحديث الأزرار
       document.querySelectorAll('[data-lang-ar]').forEach(el => {
         el.textContent = lang === 'ar'
           ? el.dataset.langAr
           : el.dataset.langEn ?? el.dataset.langAr;
       });

       // تحديث placeholders
       document.querySelectorAll('[data-placeholder-ar]').forEach(el => {
         el.placeholder = lang === 'ar'
           ? el.dataset.placeholderAr
           : el.dataset.placeholderEn ?? el.dataset.placeholderAr;
       });

       // تحديث التسميات المخصصة لقارئات الشاشة دون تغيير النص المرئي.
       document.querySelectorAll('[data-aria-label-ar]').forEach(el => {
         el.setAttribute('aria-label', lang === 'ar'
           ? el.dataset.ariaLabelAr
           : el.dataset.ariaLabelEn ?? el.dataset.ariaLabelAr);
       });

       // تحديث أزرار اللغة
       document.querySelectorAll('.lang-btn').forEach(btn => {
         btn.classList.toggle('active', btn.dataset.lang === lang);
       });

       // تحديث مؤشر الثيم
       Theme._updateIndicator(Theme.getActive());
     },

     // تبديل اللغة
     toggle() {
       this.apply(this.current === 'ar' ? 'en' : 'ar');
     },

     // تهيئة من الذاكرة
     init() {
       const saved = localStorage.getItem(TAZA_CONFIG.LANG_KEY) ?? 'ar';
       this.apply(saved);
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [9] الساعة في الـ Topbar
   // ─────────────────────────────────────────────────────────────────────
   const Clock = {

     _interval: null,

     start() {
       this._tick();
       this._interval = setInterval(() => this._tick(), 1000);
     },

     _tick() {
       const now     = new Date();
       const timeEl  = document.getElementById('topbar-time');
       const dateEl  = document.getElementById('topbar-date');

       if (timeEl) {
         timeEl.textContent = now.toLocaleTimeString(
           Lang.current === 'ar' ? 'ar-SY' : 'en-US',
           { hour: '2-digit', minute: '2-digit', second: '2-digit' }
         );
       }

       if (dateEl) {
         dateEl.textContent = now.toLocaleDateString(
           Lang.current === 'ar' ? 'ar-SY' : 'en-US',
           { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }
         );
       }
     },

     stop() {
       if (this._interval) clearInterval(this._interval);
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [10] عداد الإشعارات غير المقروءة
   // ─────────────────────────────────────────────────────────────────────
   const NotifBadge = {

     _interval: null,

     async refresh() {
       if (!Auth.isLoggedIn()) return;
       try {
         const res = await Http.get(API.NOTIFICATIONS.UNREAD_COUNT);
         const count = res?.data?.unread_count ?? 0;

         document.querySelectorAll('.notif-count').forEach(el => {
           el.textContent = count > 99 ? '99+' : count;
           el.classList.toggle('d-none', count === 0);
         });

         document.querySelectorAll('.notif-count-dot').forEach(el => {
           el.style.display = count > 0 ? 'block' : 'none';
           el.setAttribute('aria-label', count > 0
             ? `${count} ${Lang.current === 'ar' ? 'إشعارات غير مقروءة' : 'unread notifications'}`
             : (Lang.current === 'ar' ? 'لا توجد إشعارات غير مقروءة' : 'No unread notifications'));
         });

         document.dispatchEvent(new CustomEvent('taza:notification-count', {
           detail: { count },
         }));

         // تحديث عنوان الصفحة
         const base = document.title.replace(/^\(\d+\) /, '');
         document.title = count > 0 ? `(${count}) ${base}` : base;

       } catch { /* صامت */ }
     },

     start(intervalMs = 5_000) {
       if (this._interval) return;
       this.refresh();
       this._interval = setInterval(() => this.refresh(), intervalMs);
       window.addEventListener('focus', () => this.refresh());
       document.addEventListener('visibilitychange', () => {
         if (!document.hidden) this.refresh();
       });
     },

     stop() {
       if (this._interval) clearInterval(this._interval);
     },
   };

   // A single foreground-only loop shared by dashboard pages. Page-specific
   // subscribers keep the currently visible operational view fresh without
   // stacking timers or overlapping requests on slow connections.
   const LiveSync = {
     _interval: null,
     _listeners: new Set(),
     _running: false,

     start(intervalMs = 4_000) {
       if (this._interval) return;
       this._interval = setInterval(() => this.trigger(), intervalMs);
       window.addEventListener('focus', () => this.trigger());
       document.addEventListener('visibilitychange', () => {
         if (!document.hidden) this.trigger();
       });
     },

     subscribe(listener) {
       if (typeof listener !== 'function') return () => {};
       this._listeners.add(listener);
       return () => this._listeners.delete(listener);
     },

     async trigger() {
       if (document.hidden || this._running || !Auth.isLoggedIn()) return;
       this._running = true;
       try {
         await Promise.allSettled(
           [...this._listeners].map(listener => Promise.resolve().then(listener))
         );
       } finally {
         this._running = false;
       }
     },

     stop() {
       if (this._interval) clearInterval(this._interval);
       this._interval = null;
       this._listeners.clear();
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [11] أدوات مساعدة عامة
   // ─────────────────────────────────────────────────────────────────────
   const Utils = {

     // تنسيق المبلغ
     formatMoney(amount, currency = null) {
       const isAr = Lang.current === 'ar';
       const unit = currency ?? (isAr ? 'ل.س' : 'SYP');
       return Number(amount ?? 0).toLocaleString(isAr ? 'ar-SY' : 'en-US') + ' ' + unit;
     },

     // تنسيق التاريخ
     formatDate(dateStr, options = {}) {
       if (!dateStr) return '—';
       const usesStylePreset = options.dateStyle || options.timeStyle;
       const formatOptions = usesStylePreset
         ? options
         : { year: 'numeric', month: 'short', day: 'numeric', ...options };
       return new Date(dateStr).toLocaleDateString(
         Lang.current === 'ar' ? 'ar-SY' : 'en-US',
         formatOptions
       );
     },

     // تنسيق الوقت النسبي
     timeAgo(dateStr) {
       if (!dateStr) return '—';
       const diff = Date.now() - new Date(dateStr).getTime();
       const min  = Math.floor(diff / 60_000);
       const hr   = Math.floor(min  / 60);
       const day  = Math.floor(hr   / 24);

       if (Lang.current === 'ar') {
         if (min < 1)   return 'الآن';
         if (min < 60)  return `منذ ${min} دقيقة`;
         if (hr  < 24)  return `منذ ${hr} ساعة`;
         return `منذ ${day} يوم`;
       } else {
         if (min < 1)   return 'Just now';
         if (min < 60)  return `${min}m ago`;
         if (hr  < 24)  return `${hr}h ago`;
         return `${day}d ago`;
       }
     },

     // أول حرف من الاسم (للـ Avatar)
     initials(name = '') {
       return name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
     },

     // ترميز القيم الخارجية قبل إدخالها في قوالب HTML.
     escapeHtml(value = '') {
       return String(value ?? '')
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#039;');
     },

     // لون الحالة
     statusColor(status) {
       const map = {
         pending:     'warning',
         confirmed:   'info',
         ready:       'primary',
         completed:   'success',
         cancelled:   'danger',
         assigned:    'info',
         picked_up:   'primary',
         in_delivery: 'warning',
         delivered:   'success',
         seated:      'success',
         no_show:     'danger',
         active:      'success',
         inactive:    'muted',
         banned:      'danger',
       };
       return map[status] ?? 'muted';
     },

     // نص الحالة بالعربي
     statusLabel(status) {
       return Lang.t(status, status);
     },

     // HTML Badge للحالة
     statusBadge(status) {
       const color = this.statusColor(status);
       const label = this.statusLabel(status);
       return `<span class="badge badge-${color}">${label}</span>`;
     },

     // تحقق من نوع الملف (صورة)
     isImageFile(file) {
       return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
     },

     // معاينة الصورة قبل الرفع
     previewImage(file, imgElement) {
       const reader = new FileReader();
       reader.onload = (e) => { imgElement.src = e.target.result; };
       reader.readAsDataURL(file);
     },

     // تحقق بسيط من الإيميل
     isValidEmail(email) {
       return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
     },

     // نسخ نص للحافظة
     async copyToClipboard(text) {
       try {
         await navigator.clipboard.writeText(text);
         Toast.success(Lang.current === 'ar' ? 'تم النسخ' : 'Copied!');
       } catch {
         Toast.error(Lang.current === 'ar' ? 'فشل النسخ' : 'Copy failed');
       }
     },

     // debounce للبحث
     debounce(fn, ms = 400) {
       let timer;
       return (...args) => {
         clearTimeout(timer);
         timer = setTimeout(() => fn(...args), ms);
       };
     },

     // تحويل FormData لـ Object
     formToObject(form) {
       return Object.fromEntries(new FormData(form));
     },

     // عرض/إخفاء عنصر
     show(el) { if (el) el.classList.remove('d-none'); },
     hide(el) { if (el) el.classList.add('d-none');    },

     // تفعيل/تعطيل زر
     disableBtn(btn, text = null) {
       if (!btn) return;
       btn.disabled = true;
       btn.classList.add('loading');
       if (text) btn.dataset.originalText = btn.textContent, btn.textContent = text;
     },

     enableBtn(btn) {
       if (!btn) return;
       btn.disabled = false;
       btn.classList.remove('loading');
       if (btn.dataset.originalText) {
         btn.textContent = btn.dataset.originalText;
         delete btn.dataset.originalText;
       }
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [12] نظام النوافذ المنبثقة المشترك
   // ─────────────────────────────────────────────────────────────────────
   const Modal = {
     _initialized: false,

     open(id) {
       const modal = document.getElementById(id);
       if (!modal) return false;

       modal.classList.add('show');
       modal.style.opacity = '1';
       modal.style.visibility = 'visible';
       modal.style.pointerEvents = 'auto';
       document.body.style.overflow = 'hidden';
       return true;
     },

     close(id) {
       const modal = typeof id === 'string' ? document.getElementById(id) : id;
       if (!modal) return false;

       modal.classList.remove('show');
       modal.style.opacity = '';
       modal.style.visibility = '';
       modal.style.pointerEvents = '';
       if (!document.querySelector('.modal-overlay.show')) document.body.style.overflow = '';
       return true;
     },

     closeAll() {
       document.querySelectorAll('.modal-overlay.show').forEach(modal => this.close(modal));
       document.body.style.overflow = '';
     },

     init() {
       if (this._initialized) return;
       this._initialized = true;

       document.addEventListener('click', event => {
         if (event.target.classList?.contains('modal-overlay') && event.target.classList.contains('show')) {
           this.close(event.target);
         }
       });
       document.addEventListener('keydown', event => {
         if (event.key === 'Escape') this.closeAll();
       });
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [13] Confirm Dialog بسيط
   // ─────────────────────────────────────────────────────────────────────
   const Confirm = {

     show(message, onConfirm, options = {}) {
       const existing = document.getElementById('taza-confirm-modal');
       if (existing) existing.remove();

       const isAr    = Lang.current === 'ar';
       const title   = options.title   ?? (isAr ? 'تأكيد' : 'Confirm');
       const btnText = options.btnText ?? (isAr ? 'تأكيد' : 'Confirm');
       const btnClass= options.danger  ? 'btn-danger' : 'btn-primary';

       const modal = document.createElement('div');
       modal.id = 'taza-confirm-modal';
       modal.className = 'modal-overlay show';
       modal.innerHTML = `
         <div class="modal-box" style="max-width:420px">
           <div class="modal-header">
             <span class="modal-title"></span>
             <button class="modal-close" onclick="document.getElementById('taza-confirm-modal').remove()">✕</button>
           </div>
           <div class="modal-body">
             <p class="confirm-message" style="color:var(--text-secondary);font-size:.9rem;line-height:1.6"></p>
           </div>
           <div class="modal-footer">
             <button class="btn btn-outline btn-sm" onclick="document.getElementById('taza-confirm-modal').remove()">
               ${isAr ? 'إلغاء' : 'Cancel'}
             </button>
             <button class="btn ${btnClass} btn-sm" id="confirm-ok-btn"></button>
           </div>
         </div>
       `;

       document.body.appendChild(modal);
       modal.querySelector('.modal-title').textContent = title;
       modal.querySelector('.confirm-message').textContent = message;
       modal.querySelector('#confirm-ok-btn').textContent = btnText;

       document.getElementById('confirm-ok-btn').onclick = () => {
         modal.remove();
         onConfirm();
       };

       modal.addEventListener('click', (e) => {
         if (e.target === modal) modal.remove();
       });
     },
   };

   // ─────────────────────────────────────────────────────────────────────
   // [14] تهيئة الصفحة
   // ─────────────────────────────────────────────────────────────────────
   function initDashboardPage(allowedRoles = []) {

     // 1) التحقق من تسجيل الدخول
     if (!Auth.requireRole(...allowedRoles)) return;

     // 2) تطبيق اللغة المحفوظة
     Lang.init();

     // 3) تطبيق الثيم بالوقت
     Theme.startAutoWatch();

     // 4) تشغيل الساعة
     Clock.start();

     // 5) بدء مراقبة الإشعارات
     NotifBadge.start();

     // 6) بدء المزامنة الخفيفة للعرض التشغيلي المفتوح
     LiveSync.start();

     // 7) ربط سلوك النوافذ المنبثقة مرة واحدة لكل صفحة
     Modal.init();

     // 8) ملء بيانات المستخدم في الـ Sidebar
     const user = Auth.getUser();
     if (user) {
       const nameEl   = document.getElementById('sidebar-user-name');
       const roleEl   = document.getElementById('sidebar-user-role');
       const avatarEl = document.getElementById('sidebar-user-avatar');

       if (nameEl)   nameEl.textContent = user.name ?? '';
       if (roleEl)   roleEl.textContent = Utils.statusLabel(user.role) || user.role;
       if (avatarEl) {
         if (user.avatar) {
           const image = document.createElement('img');
           image.src = buildAssetURL(user.avatar);
           image.alt = user.name ?? '';
           image.addEventListener('error', () => {
             avatarEl.textContent = Utils.initials(user.name);
           });
           avatarEl.replaceChildren(image);
         } else {
           avatarEl.textContent = Utils.initials(user.name);
         }
       }
     }

     // 9) زر تسجيل الخروج
     document.getElementById('logout-btn')?.addEventListener('click', () => {
       Confirm.show(
         Lang.current === 'ar' ? 'هل تريد تسجيل الخروج؟' : 'Are you sure you want to logout?',
         async () => {
           try { await Http.post(API.AUTH.LOGOUT); } catch { /* ignore */ }
           Auth.logout();
         },
         { danger: true, btnText: Lang.current === 'ar' ? 'خروج' : 'Logout' }
       );
     });

     // 10) أزرار اللغة
     document.querySelectorAll('.lang-btn').forEach(btn => {
       btn.addEventListener('click', () => Lang.apply(btn.dataset.lang));
     });

     // زر المظهر: يحفظ اختيار الموظف ويُبقي الثيم التلقائي هو الافتراضي للحسابات الجديدة.
     document.getElementById('theme-toggle')?.addEventListener('click', () => Theme.toggle());

     // 11) زر طي/فتح الـ Sidebar
     document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
       document.querySelector('.sidebar')?.classList.toggle('collapsed');
       document.querySelector('.main-content')?.classList.toggle('sidebar-collapsed');
     });

     // 12) لوحة الإشعارات
     document.getElementById('notif-btn')?.addEventListener('click', (e) => {
       e.stopPropagation();
       document.getElementById('notif-panel')?.classList.toggle('show');
     });

     document.addEventListener('click', () => {
       document.getElementById('notif-panel')?.classList.remove('show');
     });
   }

   // ─────────────────────────────────────────────────────────────────────
   // [15] Export — متاح لكل ملفات الـ Dashboard
   // ─────────────────────────────────────────────────────────────────────
   window.TAZA = {
     CONFIG: TAZA_CONFIG,
     API,
     Auth,
     Http,
     Toast,
     Theme,
     Lang,
     Clock,
     NotifBadge,
     LiveSync,
     Utils,
     Modal,
     Confirm,
     Media: { url: buildAssetURL },
     loadEmployeeProfile() {
       return window.TAZA.EmployeeProfile?.load();
     },
     initDashboardPage,
   };

   // إبقاء الأسماء القديمة متاحة للأزرار الموجودة داخل HTML أثناء التفكيك التدريجي.
   window.openModal = id => Modal.open(id);
   window.closeModal = id => Modal.close(id);

   // ─────────────────────────────────────────────────────────────────────
   // [16] تهيئة فورية (تطبيق اللغة قبل أي شيء لتجنب الوميض)
   // ─────────────────────────────────────────────────────────────────────
   (function () {
     const lang = localStorage.getItem(TAZA_CONFIG.LANG_KEY) ?? 'ar';
     document.documentElement.setAttribute('lang', lang);
     document.body?.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

     const mode = localStorage.getItem(TAZA_CONFIG.THEME_MODE_KEY) ?? 'auto';
     const overrideUntil = Number(localStorage.getItem(TAZA_CONFIG.THEME_OVERRIDE_UNTIL_KEY) ?? 0);
     const hour = new Date().getHours();
     const timedTheme = (hour >= TAZA_CONFIG.DAY_START && hour < TAZA_CONFIG.NIGHT_START) ? 'day' : 'night';
     const bootTheme = ['day','night'].includes(mode) && overrideUntil > Date.now() ? mode : timedTheme;
     const isNight = bootTheme === 'night';
     if (isNight) document.documentElement.classList.add('theme-night');
   })();
