'use strict';

// ── State ──────────────────────────────────────────
let _orders      = [];
let _reservations= [];
let _notifications=[];
let _activeTab   = 'overview';
let _reservSubTab= 'today';
let _autoRefresh = null;

// ── Init ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  TAZA.initDashboardPage(['order_manager', 'general_manager']);
  initTabs();
  initEventListeners();
  loadOverview();
  loadNotificationsPage();
  startAutoRefresh();
  document.querySelectorAll('.lang-btn').forEach(btn => btn.addEventListener('click', refreshActiveTabLanguage));
});

function refreshActiveTabLanguage() {
  const refreshers = { overview:loadOverview, orders:loadAllOrders, reservations:loadReservationsSection, notifications:loadNotificationsPage, profile:TAZA.loadEmployeeProfile };
  refreshers[_activeTab]?.();
}

// ── Live refresh for the visible operational tab ───
function startAutoRefresh() {
  if (_autoRefresh) return;
  _autoRefresh = TAZA.LiveSync.subscribe(async () => {
    if (_activeTab === 'overview') return loadOverview();
    if (_activeTab === 'orders') return loadAllOrders();
    if (_activeTab === 'reservations') {
      if (_reservSubTab === 'all') return loadAllReservations();
      if (_reservSubTab === 'tables') return renderTablesMap();
      return loadTodayReservations();
    }
    if (_activeTab === 'notifications') return loadNotificationsPage();
  });
}

// ── Tab Setup ──────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.nav-tab[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll('.sidebar-item[data-tab]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(el.dataset.tab);
    });
  });
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
    overview:     {ar:'نظرة عامة',       en:'Overview'},
    orders:       {ar:'طلبات المطعم', en:'Restaurant Orders'},
    reservations: {ar:'الحجوزات',        en:'Reservations'},
    notifications:{ar:'الإشعارات',       en:'Notifications'},
    profile:      {ar:'ملفي الشخصي',     en:'My Profile'},
  };
  const lang = TAZA.Lang.current;
  const pt   = document.getElementById('page-title');
  if (pt && titles[tab]) pt.textContent = titles[tab][lang];

  const loaders = {
    orders:       () => { _orders.length || loadAllOrders(); },
    reservations: loadReservationsSection,
    notifications:() => { _notifications.length || loadNotificationsPage(); },
    profile:      TAZA.loadEmployeeProfile,
  };
  loaders[tab]?.();
}

// ── Event Listeners ────────────────────────────────
function initEventListeners() {
  // Refresh pending
  document.getElementById('refresh-pending-btn')
    ?.addEventListener('click', loadPendingOrders);

  // Orders filters
  document.getElementById('orders-status-filter')
    ?.addEventListener('change', loadAllOrders);
  document.getElementById('orders-record-filter')
    ?.addEventListener('change', loadAllOrders);
  document.getElementById('orders-date-filter')
    ?.addEventListener('change', loadAllOrders);
  document.getElementById('orders-search')
    ?.addEventListener('input', TAZA.Utils.debounce(filterOrdersLocally, 350));

  // Reservation sub-tabs
  document.getElementById('reserv-tab-today')
    ?.addEventListener('click', () => switchReservTab('today'));
  document.getElementById('reserv-tab-all')
    ?.addEventListener('click', () => switchReservTab('all'));
  document.getElementById('reserv-tab-tables')
    ?.addEventListener('click', () => switchReservTab('tables'));

  // Table check
  document.getElementById('check-tables-btn')
    ?.addEventListener('click', renderTablesMap);

  // Set default datetime for table check within the allowed 24-hour reservation window
  const dtInput = document.getElementById('table-check-time');
  if (dtInput) {
    const formatLocalDateTime = (date) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };
    const now = new Date();
    const nextSlot = new Date(now.getTime() + 60 * 60 * 1000);
    nextSlot.setMinutes(0, 0, 0);
    const minSlot = new Date(now.getTime() + 60 * 1000);
    const maxSlot = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    dtInput.min = formatLocalDateTime(minSlot);
    dtInput.max = formatLocalDateTime(maxSlot);
    dtInput.value = formatLocalDateTime(nextSlot > maxSlot ? minSlot : nextSlot);
  }

  // Mark all notifications read
  document.getElementById('mark-all-btn')
    ?.addEventListener('click', markAllRead);
  document.getElementById('mark-all-read-btn')
    ?.addEventListener('click', markAllRead);

  // Modal: Notify Customer
  document.getElementById('send-notify-btn')
    ?.addEventListener('click', sendCustomerNotification);
  document.getElementById('close-notify-modal')
    ?.addEventListener('click', () => closeModal('modal-notify-customer'));
  document.getElementById('cancel-notify-btn')
    ?.addEventListener('click', () => closeModal('modal-notify-customer'));
  document.getElementById('close-detail-modal')
    ?.addEventListener('click', () => closeModal('modal-order-detail'));

  // Event Delegation: orders-grid
  document.getElementById('orders-grid')
    ?.addEventListener('click', handleOrderAction);
  document.getElementById('pending-orders-list')
    ?.addEventListener('click', handleOrderAction);

  // Event Delegation: reservations
  document.getElementById('reservations-tbody')
    ?.addEventListener('click', handleReservationAction);
  document.getElementById('today-reservations-list')
    ?.addEventListener('click', handleReservationAction);

  // Notif panel quick read
  document.getElementById('notif-list-panel')
    ?.addEventListener('click', (e) => {
      const item = e.target.closest('.notification-item');
      if (item) {
        const id = parseInt(item.dataset.id);
        if (!isNaN(id)) markOneRead(id, item);
      }
    });
}
