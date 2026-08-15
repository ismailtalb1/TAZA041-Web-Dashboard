'use strict';

// ── State ──────────────────────────────────────────
let _employees    = [];
let _customers    = [];
let _orders       = [];
let _reports      = [];
let _restaurantInfo = null;
let _activeTab    = 'overview';
let _customerPagination = null;
let _orderPagination = null;

// ── Init ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  TAZA.initDashboardPage(['general_manager']);
  setupTabs();
  loadOverview();
  loadNotifications();
  startAutoRefresh();

  document.getElementById('emp-avatar-file')?.addEventListener('change', previewEmployeeAvatar);
  document.getElementById('general-orders-grid')?.addEventListener('click', handleGeneralOrderAction);

  // إعادة رسم المحتوى الديناميكي بعد تبديل اللغة، من دون تغيير مصادر البيانات.
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', refreshActiveTabLanguage);
  });
});

function startAutoRefresh() {
  TAZA.LiveSync.subscribe(async () => {
    if (_activeTab === 'overview') return loadOverview();
    if (_activeTab === 'orders') return loadOrders();
    if (_activeTab === 'customers') return loadCustomers();
    if (_activeTab === 'loyalty') return loadLoyalty();
  });
}

function refreshActiveTabLanguage() {
  const refreshers = {
    overview:  loadOverview,
    employees: () => renderEmployees(_employees),
    customers: () => {
      renderCustomersTable(_customers);
      renderDataPagination('customers-pagination', _customerPagination, page => loadCustomers(null, page));
    },
    orders:    () => {
      renderOrdersGrid(_orders);
      renderDataPagination('orders-pagination', _orderPagination, loadOrders);
    },
    reports:   () => renderReports(_reports),
    loyalty:   loadLoyalty,
    settings:  () => {
      if (_restaurantInfo) updateOpenStatusBadge(_restaurantInfo.is_open);
    },
  };

  refreshers[_activeTab]?.();
}

// ── Tab Switching ──────────────────────────────────
function setupTabs() {
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = el.dataset.tab;
      if (tab) switchTab(tab);
    });
  });
}

function switchTab(tab) {
  _activeTab = tab;

  // التبويبات في الـ nav
  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );

  // الـ sidebar items
  document.querySelectorAll('.sidebar-item[data-tab]').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );

  // المحتوى
  document.querySelectorAll('.section-content').forEach(s =>
    s.classList.toggle('active', s.id === `tab-${tab}`)
  );

  // تحديث عنوان الصفحة
  const titleMap = {
    overview: { ar:'نظرة عامة', en:'Overview' },
    employees:{ ar:'الموظفون',  en:'Employees' },
    customers:{ ar:'الزبائن',   en:'Customers' },
    orders:   { ar:'الطلبات',   en:'Orders' },
    reports:  { ar:'التقارير',  en:'Reports' },
    loyalty:  { ar:'الولاء',    en:'Loyalty' },
    settings: { ar:'الإعدادات', en:'Settings' },
    profile:  { ar:'ملفي الشخصي', en:'My Profile' },
  };
  const lang = TAZA.Lang.current;
  const pageTitle = document.getElementById('page-title');
  if (pageTitle && titleMap[tab]) {
    pageTitle.textContent = titleMap[tab][lang];
  }

  // تحميل البيانات عند الطلب (Lazy Loading)
  const loaders = {
    employees: () => !_employees.length && loadEmployees(),
    customers: () => !_customers.length && loadCustomers(),
    orders:    () => !_orders.length    && loadOrders(),
    reports:   () => !_reports.length   && loadReports(),
    loyalty:   loadLoyalty,
    settings:  loadSettings,
  };
  loaders[tab]?.();
}
