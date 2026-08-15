'use strict';

let _accounts      = [];
let _transactions  = [];
let _finStats      = {};
let _activeTab     = 'overview';

document.addEventListener('DOMContentLoaded', () => {
  TAZA.initDashboardPage(['finance_manager', 'general_manager']);
  initTabs();
  initEventListeners();
  loadOverview();
  loadNotificationsPage();
  startAutoRefresh();
  document.querySelectorAll('.lang-btn').forEach(btn => btn.addEventListener('click', refreshActiveTabLanguage));
});

function refreshActiveTabLanguage() {
  const refreshers = { overview:loadOverview, accounts:loadAccounts, transactions:loadTransactions, reports:loadReports, notifications:loadNotificationsPage, profile:TAZA.loadEmployeeProfile };
  refreshers[_activeTab]?.();
}

function startAutoRefresh() {
  TAZA.LiveSync.subscribe(async () => {
    if (_activeTab === 'overview') return loadOverview();
    if (_activeTab === 'accounts') return loadAccounts();
    if (_activeTab === 'transactions') return loadTransactions();
    if (_activeTab === 'reports') return loadReports();
    if (_activeTab === 'notifications') return loadNotificationsPage();
  });
}

const escapeHtml = TAZA.Utils.escapeHtml;

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
    overview:     {ar:'نظرة عامة',         en:'Overview'},
    accounts:     {ar:'حسابات الدفع',      en:'Payment Accounts'},
    transactions: {ar:'المعاملات المالية',  en:'Transactions'},
    reports:      {ar:'التقارير المالية',   en:'Financial Reports'},
    notifications:{ar:'الإشعارات',         en:'Notifications'},
    profile:      {ar:'ملفي الشخصي',       en:'My Profile'},
  };
  const lang = TAZA.Lang.current;
  const pt   = document.getElementById('page-title');
  if (pt && titles[tab]) pt.textContent = titles[tab][lang];

  const loaders = {
    accounts:     () => { _accounts.length ? renderAccountsGrid(_accounts) : loadAccounts(); },
    transactions: () => { _transactions.length || loadTransactions(); },
    reports:      loadReports,
    notifications: loadNotificationsPage,
    profile:      TAZA.loadEmployeeProfile,
  };
  loaders[tab]?.();
}

// ── Events ────────────────────────────────────
function initEventListeners() {
  // Accounts
  document.getElementById('btn-add-account')
    ?.addEventListener('click', openAddAccountModal);
  document.getElementById('accounts-grid')
    ?.addEventListener('click', handleAccountAction);
  document.getElementById('accounts-quick-grid')
    ?.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) switchTab('accounts');
    });

  // Account Modal
  document.getElementById('close-account-modal')
    ?.addEventListener('click', () => closeModal('modal-account'));
  document.getElementById('cancel-account-btn')
    ?.addEventListener('click', () => closeModal('modal-account'));
  document.getElementById('save-account-btn')
    ?.addEventListener('click', saveAccount);

  // Balance Modal
  document.getElementById('close-balance-modal')
    ?.addEventListener('click', () => closeModal('modal-balance'));
  document.getElementById('cancel-balance-btn')
    ?.addEventListener('click', () => closeModal('modal-balance'));
  document.getElementById('save-balance-btn')
    ?.addEventListener('click', saveBalance);

  // Withdraw Modal
  document.getElementById('close-withdraw-modal')
    ?.addEventListener('click', () => closeModal('modal-withdraw'));
  document.getElementById('cancel-withdraw-btn')
    ?.addEventListener('click', () => closeModal('modal-withdraw'));
  document.getElementById('confirm-withdraw-btn')
    ?.addEventListener('click', confirmWithdraw);

  // Transactions filters
  document.getElementById('tx-method-filter')
    ?.addEventListener('change', loadTransactions);
  document.getElementById('tx-status-filter')
    ?.addEventListener('change', loadTransactions);
  document.getElementById('tx-date-filter')
    ?.addEventListener('change', loadTransactions);
  document.getElementById('transactions-tbody')
    ?.addEventListener('click', handleTxAction);

  // Reports
  document.getElementById('generate-report-btn')
    ?.addEventListener('click', generateReport);

  // Revenue period tabs
  document.querySelectorAll('.rev-tab').forEach(btn =>
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.rev-tab').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      updateHeroRevenue(e.currentTarget.dataset.period);
    }));

  // Notifications
  document.getElementById('mark-all-read-btn')
    ?.addEventListener('click', markAllRead);
  document.getElementById('panel-mark-all')
    ?.addEventListener('click', markAllRead);

}
