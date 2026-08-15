'use strict';

// ── State ──────────────────────────────────────
let _activeDeliveries = [];
let _allDeliveries    = [];
let _drivers          = [];
let _settings         = {};
let _autoRefresh      = null;
let _deliveryLiveMap  = null;
let _deliveryMapLayer = null;
let _liveMapDeliveries = [];

// ── Init ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  TAZA.initDashboardPage(['delivery_manager', 'general_manager']);
  initTabs();
  initEventListeners();
  loadOverview();
  loadNotificationsPage();
  startAutoRefresh();
  document.querySelectorAll('.lang-btn').forEach(btn => btn.addEventListener('click', refreshActiveTabLanguage));
});

function refreshActiveTabLanguage() {
  const refreshers = { overview:loadOverview, live:loadActiveDeliveries, 'all-deliveries':loadAllDeliveries, drivers:loadDrivers, notifications:loadNotificationsPage, settings:loadSettings, profile:TAZA.loadEmployeeProfile };
  refreshers[_activeTab]?.();
}

const escapeHtml = TAZA.Utils.escapeHtml;

function startAutoRefresh() {
  if (_autoRefresh) return;
  _autoRefresh = TAZA.LiveSync.subscribe(async () => {
    if (_activeTab === 'overview') return loadOverview();
    if (_activeTab === 'live') {
      await Promise.all([loadActiveDeliveries(), loadLiveBoard()]);
      return;
    }
    if (_activeTab === 'all-deliveries') return loadAllDeliveries();
    if (_activeTab === 'drivers') return loadDriversData();
    if (_activeTab === 'notifications') return loadNotificationsPage();
  });
}

let _activeTab = 'overview';

// ── Tabs ───────────────────────────────────────
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
    overview:       {ar:'نظرة عامة',              en:'Overview'},
    live:           {ar:'التوصيل الحي',            en:'Live Delivery'},
    'all-deliveries':{ar:'كل الطلبات',             en:'All Orders'},
    drivers:        {ar:'السائقون',                en:'Drivers'},
    notifications:  {ar:'الإشعارات',              en:'Notifications'},
    settings:       {ar:'إعدادات التوصيل',         en:'Delivery Settings'},
    profile:        {ar:'ملفي الشخصي',             en:'My Profile'},
  };
  const lang = TAZA.Lang.current;
  const pt   = document.getElementById('page-title');
  if (pt && titles[tab]) pt.textContent = titles[tab][lang];

  const loaders = {
    live:            () => { loadActiveDeliveries(); },
    'all-deliveries':() => { _allDeliveries.length || loadAllDeliveries(); },
    drivers:         () => { _drivers.length        || loadDrivers(); },
    notifications:   loadNotificationsPage,
    settings:        loadSettings,
    profile:         TAZA.loadEmployeeProfile,
  };
  loaders[tab]?.();
}

// ── Events ─────────────────────────────────────
function initEventListeners() {
  document.getElementById('refresh-live-btn')
    ?.addEventListener('click', () => { loadActiveDeliveries(); loadLiveBoard(); });
  document.getElementById('refresh-active-btn')
    ?.addEventListener('click', loadActiveDeliveries);

  // All deliveries filters
  document.getElementById('del-status-filter')
    ?.addEventListener('change', loadAllDeliveries);
  document.getElementById('del-date-filter')
    ?.addEventListener('change', loadAllDeliveries);
  document.getElementById('del-driver-filter')
    ?.addEventListener('change', loadAllDeliveries);
  document.getElementById('del-route-filter')
    ?.addEventListener('change', loadAllDeliveries);
  document.getElementById('del-min-distance-filter')
    ?.addEventListener('change', loadAllDeliveries);
  document.getElementById('del-max-distance-filter')
    ?.addEventListener('change', loadAllDeliveries);
  document.getElementById('live-map-status-filter')
    ?.addEventListener('change', renderLiveDeliveryMap);
  document.getElementById('live-map-driver-filter')
    ?.addEventListener('change', renderLiveDeliveryMap);

  // Save settings
  document.getElementById('save-settings-btn')
    ?.addEventListener('click', saveSettings);

  // Calculator
  document.getElementById('calc-distance')
    ?.addEventListener('input', updateCalculator);

  // Modals
  document.getElementById('close-assign-modal')
    ?.addEventListener('click', () => closeModal('modal-assign-driver'));
  document.getElementById('cancel-assign-btn')
    ?.addEventListener('click', () => closeModal('modal-assign-driver'));
  document.getElementById('confirm-assign-btn')
    ?.addEventListener('click', confirmAssignDriver);
  document.getElementById('close-notify-modal')
    ?.addEventListener('click', () => closeModal('modal-notify-cust'));
  document.getElementById('cancel-notify-btn')
    ?.addEventListener('click', () => closeModal('modal-notify-cust'));
  document.getElementById('send-notify-btn')
    ?.addEventListener('click', sendCustomerNotif);

  // Quick message chips
  document.querySelectorAll('[data-quick-msg-ar]').forEach(chip => {
    chip.addEventListener('click', () => {
      const msg = TAZA.Lang.current === 'ar'
        ? chip.dataset.quickMsgAr
        : chip.dataset.quickMsgEn;
      const textarea = document.getElementById('notify-cust-msg');
      if (textarea) textarea.value = msg;
    });
  });

  // Driver select preview
  document.getElementById('assign-driver-select')
    ?.addEventListener('change', updateDriverPreview);

  // Event delegation: Active grid
  document.getElementById('active-deliveries-grid')
    ?.addEventListener('click', handleDeliveryAction);
  document.getElementById('live-board')
    ?.addEventListener('click', handleDeliveryAction);
  document.getElementById('all-deliveries-tbody')
    ?.addEventListener('click', handleDeliveryAction);

  // Notifications
  document.getElementById('mark-all-read-btn')
    ?.addEventListener('click', markAllRead);
  document.getElementById('panel-mark-all')
    ?.addEventListener('click', markAllRead);
  document.getElementById('notif-list-panel')
    ?.addEventListener('click', async (e) => {
      const item = e.target.closest('.notification-item');
      if (!item?.classList.contains('unread')) return;
      const id = Number(item.dataset.id);
      document.querySelectorAll(`[data-id="${id}"]`).forEach(el => el.classList.remove('unread'));
      document.querySelector(`.notif-item-full[data-id="${id}"] .notif-read-action`)?.remove();
      syncNotificationIndicators();
      try { await TAZA.Http.put(TAZA.API.NOTIFICATIONS.MARK_READ(id)); } catch {}
    });

}
