'use strict';

let _activeDeliveries = [];
let _historyDeliveries= [];
let _myRatings        = {};
let _myStats          = {};
let _activeTab        = 'overview';
let _driverId         = null;
let _autoRefresh      = null;
let _driverRouteMap   = null;
let _driverRouteLayer = null;

const escapeHtml = TAZA.Utils.escapeHtml;

document.addEventListener('DOMContentLoaded', () => {
  TAZA.initDashboardPage(['driver', 'delivery_manager', 'general_manager']);
  initTabs();
  initEventListeners();
  loadInitialData();
  loadNotificationsPage();
  startAutoRefresh();
  document.querySelectorAll('.lang-btn').forEach(btn => btn.addEventListener('click', refreshActiveTabLanguage));
});

function refreshActiveTabLanguage() {
  const refreshers = { overview:loadInitialData, active:loadActiveDeliveries, history:loadHistory, ratings:loadRatings, notifications:loadNotificationsPage, profile:TAZA.loadEmployeeProfile };
  refreshers[_activeTab]?.();
}

function startAutoRefresh() {
  if (_autoRefresh) return;
  _autoRefresh = TAZA.LiveSync.subscribe(async () => {
    if (_activeTab === 'overview') return loadInitialData();
    if (_activeTab === 'active') return loadActiveDeliveries();
    if (_activeTab === 'history') return loadHistory();
    if (_activeTab === 'ratings') return loadRatings();
    if (_activeTab === 'notifications') return loadNotificationsPage();
  });
}

// ── Tabs ──────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.nav-tab[data-tab]').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.querySelectorAll('.sidebar-item[data-tab]').forEach(el =>
    el.addEventListener('click', (e) => { e.preventDefault(); switchTab(el.dataset.tab); }));
}

function switchTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('.nav-tab[data-tab]').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.sidebar-item[data-tab]').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.section-content').forEach(s =>
    s.classList.toggle('active', s.id === `tab-${tab}`));

  const titles = {
    overview:     {ar:'لوحة التحكم',      en:'Dashboard'},
    active:       {ar:'الطلبات النشطة',   en:'Active Orders'},
    history:      {ar:'سجل التوصيلات',    en:'Delivery History'},
    ratings:      {ar:'تقييماتي',          en:'My Ratings'},
    notifications:{ar:'الإشعارات',        en:'Notifications'},
    profile:      {ar:'ملفي الشخصي',      en:'My Profile'},
  };
  const lang = TAZA.Lang.current;
  const pt   = document.getElementById('page-title');
  if (pt && titles[tab]) pt.textContent = titles[tab][lang];

  const loaders = {
    active:        loadActiveDeliveries,
    history:       () => { _historyDeliveries.length || loadHistory(); },
    ratings:       loadRatings,
    notifications: loadNotificationsPage,
    profile:       TAZA.loadEmployeeProfile,
  };
  loaders[tab]?.();
}

// ── Events ────────────────────────────────────
function initEventListeners() {
  document.getElementById('refresh-overview-btn')
    ?.addEventListener('click', () => { loadActiveDeliveries(); });
  document.getElementById('refresh-active-btn')
    ?.addEventListener('click', loadActiveDeliveries);

  document.getElementById('history-status-filter')
    ?.addEventListener('change', loadHistory);
  document.getElementById('history-date-filter')
    ?.addEventListener('change', loadHistory);
  document.getElementById('history-route-filter')
    ?.addEventListener('change', loadHistory);
  document.getElementById('close-driver-route')
    ?.addEventListener('click', closeDriverRoute);

  // Event delegation
  document.getElementById('active-orders-grid')
    ?.addEventListener('click', handleDeliveryAction);
  document.getElementById('overview-active-list')
    ?.addEventListener('click', handleDeliveryAction);

  document.getElementById('mark-all-read-btn')
    ?.addEventListener('click', markAllRead);
  document.getElementById('panel-mark-all')
    ?.addEventListener('click', markAllRead);

}
