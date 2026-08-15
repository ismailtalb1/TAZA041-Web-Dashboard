/* =====================================================================
   TAZA 041 — Shared dashboard chrome
   Renders the sidebar, topbar, and notification panel for every role.
   ===================================================================== */
(function () {
  'use strict';

  const item = (tab, icon, ar, en, badge = null) => ({ tab, icon, ar, en, badge });
  const section = (ar, en) => ({ section: true, ar, en });

  const dashboards = {
    'general-manager': {
      roleAr: 'المدير العام',
      roleEn: 'General Manager',
      logoAr: 'لوحة الإدارة',
      logoEn: 'Admin Panel',
      titleAr: 'نظرة عامة',
      titleEn: 'Overview',
      notificationAr: 'آخر التحديثات المهمة',
      notificationEn: 'Latest important updates',
      notificationListId: 'notif-list',
      markAllId: 'notif-mark-all',
      markAllHandler: 'markAllNotifsRead()',
      navigation: [
        section('القائمة الرئيسية', 'MAIN MENU'),
        item('overview', 'fa-gauge-high', 'نظرة عامة', 'Overview'),
        item('employees', 'fa-users-gear', 'الموظفون', 'Employees'),
        item('customers', 'fa-users', 'الزبائن', 'Customers'),
        item('orders', 'fa-bag-shopping', 'الطلبات', 'Orders', { className: 'notif-pending' }),
        item('reports', 'fa-file-chart-column', 'التقارير', 'Reports', { className: 'notif-reports' }),
        item('loyalty', 'fa-trophy', 'نظام الولاء', 'Loyalty'),
        section('الإعدادات', 'SETTINGS'),
        item('settings', 'fa-sliders', 'إعدادات المطعم', 'Restaurant Settings'),
        item('profile', 'fa-user-pen', 'ملفي الشخصي', 'My Profile'),
      ],
    },
    'order-manager': {
      roleAr: 'مدير الطلبات', roleEn: 'Order Manager',
      titleAr: 'نظرة عامة', titleEn: 'Overview',
      notificationAr: 'تحديثات وردية الطلبات', notificationEn: 'Order shift updates',
      markAllId: 'mark-all-read-btn',
      navigation: [
        section('القائمة', 'MENU'),
        item('overview', 'fa-gauge-high', 'نظرة عامة', 'Overview'),
        item('orders', 'fa-bag-shopping', 'طلبات المطعم', 'Restaurant Orders', { id: 'sb-pending-count' }),
        item('reservations', 'fa-chair', 'الحجوزات', 'Reservations', { id: 'sb-reserv-count' }),
        item('notifications', 'fa-bell', 'الإشعارات', 'Notifications', { id: 'sb-notif-count', className: 'notif-count' }),
        section('حسابي', 'ACCOUNT'),
        item('profile', 'fa-user-pen', 'الملف الشخصي', 'My Profile'),
      ],
    },
    'delivery-manager': {
      roleAr: 'مدير التوصيل', roleEn: 'Delivery Manager',
      titleAr: 'نظرة عامة', titleEn: 'Overview',
      notificationAr: 'تحديثات حركة التوصيل', notificationEn: 'Delivery operation updates',
      navigation: [
        section('القائمة', 'MENU'),
        item('overview', 'fa-gauge-high', 'نظرة عامة', 'Overview'),
        item('live', 'fa-motorcycle', 'التوصيل الحي', 'Live Delivery', { id: 'sb-active-count' }),
        item('all-deliveries', 'fa-list-check', 'كل الطلبات', 'All Orders'),
        item('drivers', 'fa-id-card', 'السائقون', 'Drivers'),
        item('notifications', 'fa-bell', 'الإشعارات', 'Notifications', { id: 'sb-notif-count', className: 'notif-count' }),
        section('الإعدادات', 'SETTINGS'),
        item('settings', 'fa-sliders', 'إعدادات التوصيل', 'Delivery Settings'),
        item('profile', 'fa-user-pen', 'ملفي الشخصي', 'My Profile'),
      ],
    },
    'inventory-manager': {
      roleAr: 'مدير المخزون', roleEn: 'Inventory Manager',
      titleAr: 'نظرة عامة', titleEn: 'Overview',
      notificationAr: 'تحديثات المخزون والمنتجات', notificationEn: 'Inventory and product updates',
      navigation: [
        section('القائمة', 'MENU'),
        item('overview', 'fa-gauge-high', 'نظرة عامة', 'Overview'),
        item('products', 'fa-burger', 'المنتجات', 'Products', { id: 'sb-low-stock', style: 'background:var(--warning)' }),
        item('offers', 'fa-tags', 'العروض', 'Offers'),
        item('notifications', 'fa-bell', 'الإشعارات', 'Notifications', { id: 'sb-notif-count', className: 'notif-count' }),
        section('حسابي', 'ACCOUNT'),
        item('profile', 'fa-user-pen', 'ملفي الشخصي', 'My Profile'),
      ],
    },
    'finance-manager': {
      roleAr: 'المدير المالي', roleEn: 'Finance Manager',
      titleAr: 'نظرة عامة', titleEn: 'Overview',
      notificationAr: 'تحديثات الحركة المالية', notificationEn: 'Financial activity updates',
      navigation: [
        section('القائمة', 'MENU'),
        item('overview', 'fa-gauge-high', 'نظرة عامة', 'Overview'),
        item('accounts', 'fa-landmark', 'حسابات الدفع', 'Payment Accounts', { id: 'sb-near-capacity', value: '!', style: 'background:var(--warning)' }),
        item('transactions', 'fa-receipt', 'المعاملات المالية', 'Transactions'),
        item('reports', 'fa-file-invoice-dollar', 'التقارير المالية', 'Financial Reports'),
        item('notifications', 'fa-bell', 'الإشعارات', 'Notifications', { id: 'sb-notif-count', className: 'notif-count' }),
        section('حسابي', 'ACCOUNT'),
        item('profile', 'fa-user-pen', 'ملفي الشخصي', 'My Profile'),
      ],
    },
    'communication-manager': {
      roleAr: 'مدير التواصل', roleEn: 'Comm. Manager',
      titleAr: 'نظرة عامة', titleEn: 'Overview',
      notificationAr: 'تحديثات المحتوى والتواصل', notificationEn: 'Content and communication updates',
      navigation: [
        section('القائمة', 'MENU'),
        item('overview', 'fa-gauge-high', 'نظرة عامة', 'Overview'),
        item('restaurant-info', 'fa-store', 'معلومات المطعم', 'Restaurant Info'),
        item('gallery', 'fa-images', 'معرض الصور', 'Gallery'),
        item('suggestions', 'fa-lightbulb', 'اقتراحات الوجبات', 'Meal Suggestions', { id: 'sb-suggestions' }),
        item('reviews', 'fa-star-half-stroke', 'تقييمات الزبائن', 'Customer Reviews'),
        item('notifications', 'fa-bell', 'الإشعارات', 'Notifications', { id: 'sb-notif-count', className: 'notif-count' }),
        section('حسابي', 'ACCOUNT'),
        item('profile', 'fa-user-pen', 'ملفي الشخصي', 'My Profile'),
      ],
    },
    driver: {
      roleAr: 'السائق', roleEn: 'Driver',
      footerRoleAr: 'سائق التوصيل', footerRoleEn: 'Delivery Driver',
      titleAr: 'لوحة التحكم', titleEn: 'Dashboard',
      notificationAr: 'تحديثات رحلاتك', notificationEn: 'Your trip updates',
      navigation: [
        section('القائمة', 'MENU'),
        item('overview', 'fa-gauge-high', 'لوحة التحكم', 'Dashboard'),
        item('active', 'fa-motorcycle', 'طلباتي النشطة', 'Active Orders', { id: 'sb-active-count' }),
        item('history', 'fa-clock-rotate-left', 'سجل التوصيلات', 'Delivery History'),
        item('ratings', 'fa-star', 'تقييماتي', 'My Ratings'),
        item('notifications', 'fa-bell', 'الإشعارات', 'Notifications', { id: 'sb-notif-count' }),
        section('حسابي', 'ACCOUNT'),
        item('profile', 'fa-user-pen', 'ملفي الشخصي', 'My Profile'),
      ],
    },
  };

  function badgeMarkup(badge) {
    if (!badge) return '';
    const classes = ['sidebar-badge', badge.className].filter(Boolean).join(' ');
    const id = badge.id ? ` id="${badge.id}"` : '';
    const style = ['display:none', badge.style].filter(Boolean).join(';');
    return `<span class="${classes}"${id} style="${style}">${badge.value ?? '0'}</span>`;
  }

  function navigationMarkup(navigation) {
    return navigation.map((entry) => {
      if (entry.section) {
        return `<div class="sidebar-section-title" data-lang-ar="${entry.ar}" data-lang-en="${entry.en}">${entry.ar}</div>`;
      }
      return `
        <a class="sidebar-item${entry.tab === 'overview' ? ' active' : ''}" data-tab="${entry.tab}" data-tooltip="${entry.ar}" href="#">
          <span class="sidebar-item-icon"><i class="fa-solid ${entry.icon}"></i></span>
          <span class="sidebar-item-text" data-lang-ar="${entry.ar}" data-lang-en="${entry.en}">${entry.ar}</span>
          ${badgeMarkup(entry.badge)}
        </a>`;
    }).join('');
  }

  function renderSidebar(target, config) {
    const logoAr = config.logoAr ?? config.roleAr;
    const logoEn = config.logoEn ?? config.roleEn;
    const footerAr = config.footerRoleAr ?? config.roleAr;
    const footerEn = config.footerRoleEn ?? config.roleEn;
    target.innerHTML = `
      <a href="#" class="sidebar-logo" aria-label="TAZA 041">
        <div class="sidebar-logo-icon"><img src="assets/images/logo.jpg" alt="TAZA"></div>
        <div class="sidebar-logo-text">
          <div class="sidebar-logo-title">TAZA 041</div>
          <div class="sidebar-logo-sub" data-lang-ar="${logoAr}" data-lang-en="${logoEn}">${logoAr}</div>
        </div>
      </a>
      <nav class="sidebar-nav">${navigationMarkup(config.navigation)}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="sidebar-user-avatar" id="sidebar-user-avatar"></div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name" id="sidebar-user-name">—</div>
            <div class="sidebar-user-role" id="sidebar-user-role" data-lang-ar="${footerAr}" data-lang-en="${footerEn}">${footerAr}</div>
          </div>
        </div>
      </div>`;

    target.querySelector('.sidebar-logo')?.addEventListener('click', (event) => event.preventDefault());
    const logoImage = target.querySelector('.sidebar-logo-icon img');
    logoImage?.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'sidebar-logo-fallback';
      fallback.textContent = 'T';
      logoImage.replaceWith(fallback);
    }, { once: true });
  }

  function renderTopbar(target, config) {
    target.innerHTML = `
      <div class="topbar-title">
        <button class="topbar-btn" id="sidebar-toggle" type="button" aria-label="طي القائمة" title="طي القائمة"><i class="fa-solid fa-bars"></i></button>
        <div>
          <div class="topbar-page-title" id="page-title" data-lang-ar="${config.titleAr}" data-lang-en="${config.titleEn}">${config.titleAr}</div>
          <div class="topbar-breadcrumb"><span>TAZA 041</span><span>›</span><span class="current" id="breadcrumb-current" data-lang-ar="${config.roleAr}" data-lang-en="${config.roleEn}">${config.roleAr}</span></div>
        </div>
      </div>
      <div class="topbar-actions">
        <div class="topbar-clock"><div class="topbar-time" id="topbar-time">--:--</div><div class="topbar-date" id="topbar-date"></div></div>
        <button class="theme-indicator" id="theme-toggle" type="button" aria-label="تبديل المظهر"><span class="theme-dot" id="theme-dot"></span><span id="theme-indicator-text"></span></button>
        <div class="lang-toggle"><button class="lang-btn active" data-lang="ar" type="button">ع</button><button class="lang-btn" data-lang="en" type="button">EN</button></div>
        <button class="topbar-btn" id="notif-btn" type="button" aria-label="الإشعارات" title="الإشعارات"><i class="fa-solid fa-bell"></i><span class="badge-dot notif-count-dot" style="display:none"></span></button>
        <button class="topbar-btn" id="logout-btn" type="button" aria-label="تسجيل الخروج" title="تسجيل الخروج"><i class="fa-solid fa-right-from-bracket"></i></button>
      </div>`;
  }

  function renderNotificationPanel(target, config) {
    const listId = config.notificationListId ?? 'notif-list-panel';
    const markAllId = config.markAllId ?? 'panel-mark-all';
    const inlineHandler = config.markAllHandler ? ` onclick="${config.markAllHandler}"` : '';
    target.innerHTML = `
      <div class="notification-panel-header">
        <div class="notification-panel-heading">
          <span class="notification-panel-title" data-lang-ar="الإشعارات" data-lang-en="Notifications">الإشعارات</span>
          <span class="notification-panel-summary" id="notif-panel-summary" data-lang-ar="${config.notificationAr}" data-lang-en="${config.notificationEn}">${config.notificationAr}</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="${markAllId}" type="button"${inlineHandler} data-lang-ar="تعيين الكل مقروء" data-lang-en="Mark all read">تعيين الكل مقروء</button>
      </div>
      <div class="notification-list" id="${listId}">
        <div class="empty-state" style="padding:24px"><div class="empty-icon">🔔</div><div class="empty-desc" data-lang-ar="لا توجد إشعارات" data-lang-en="No notifications">لا توجد إشعارات</div></div>
      </div>`;
  }

  function mount() {
    const dashboardName = document.body?.dataset.dashboard;
    const config = dashboards[dashboardName];
    if (!config) return false;

    const sidebar = document.querySelector('[data-dashboard-sidebar]');
    const topbar = document.querySelector('[data-dashboard-topbar]');
    const notifications = document.querySelector('[data-dashboard-notifications]');
    if (!sidebar || !topbar || !notifications) return false;

    renderSidebar(sidebar, config);
    renderTopbar(topbar, config);
    renderNotificationPanel(notifications, config);
    return true;
  }

  window.TAZA = window.TAZA || {};
  window.TAZA.DashboardComponents = { mount };
  mount();
})();
