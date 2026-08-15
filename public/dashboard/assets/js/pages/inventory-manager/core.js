'use strict';

// ── State ───────────────────────────────────────
let _products       = [];
let _offers         = [];
let _offerProducts  = []; // products added to current offer modal
let _activeTab      = 'overview';
let _stockOperation = 'set';
let _notificationUnreadCount = null;

// ── Init ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  TAZA.initDashboardPage(['inventory_manager', 'general_manager']);
  initTabs();
  initEventListeners();
  loadOverview();
  loadNotificationsPage();
  TAZA.LiveSync.subscribe(async () => {
    if (_activeTab === 'overview') return loadOverview();
    if (_activeTab === 'products') return loadProducts();
    if (_activeTab === 'offers') return loadOffers();
    if (_activeTab === 'notifications') return loadNotificationsPage();
  });
  document.querySelectorAll('.lang-btn').forEach(btn => btn.addEventListener('click', refreshActiveTabLanguage));
});

function refreshActiveTabLanguage() {
  const refreshers = { overview:loadOverview, products:loadProducts, offers:loadOffers, notifications:loadNotificationsPage, profile:TAZA.loadEmployeeProfile };
  refreshers[_activeTab]?.();
  if (document.getElementById('modal-product')?.classList.contains('show')) updateProductEditorState(false);
  if (document.getElementById('modal-offer')?.classList.contains('show')) {
    populateProductsSelect();
    renderOfferProductsList();
    updateOfferEditorState(false);
  }
}

const escapeHtml = TAZA.Utils.escapeHtml;

// ── Tabs ────────────────────────────────────────
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
    overview:     {ar:'نظرة عامة',      en:'Overview'},
    products:     {ar:'المنتجات',        en:'Products'},
    offers:       {ar:'العروض',          en:'Offers'},
    notifications:{ar:'الإشعارات',      en:'Notifications'},
    profile:      {ar:'ملفي الشخصي',    en:'My Profile'},
  };
  const lang = TAZA.Lang.current;
  const pt   = document.getElementById('page-title');
  if (pt && titles[tab]) pt.textContent = titles[tab][lang];

  const loaders = {
    products:     () => { _products.length || loadProducts(); },
    offers:       () => { _offers.length   || loadOffers();   },
    notifications: loadNotificationsPage,
    profile:      TAZA.loadEmployeeProfile,
  };
  loaders[tab]?.();
}

// ── Event Listeners ────────────────────────────
function initEventListeners() {
  // Products
  document.getElementById('btn-add-product')
    ?.addEventListener('click', openAddProductModal);
  document.getElementById('prod-search')
    ?.addEventListener('input', TAZA.Utils.debounce(filterProductsLocally, 350));
  document.getElementById('prod-cat-filter')
    ?.addEventListener('change', loadProducts);
  document.getElementById('prod-stock-filter')
    ?.addEventListener('change', loadProducts);
  document.getElementById('products-grid')
    ?.addEventListener('click', handleProductAction);

  // Product Modal
  document.getElementById('close-product-modal')
    ?.addEventListener('click', () => closeModal('modal-product'));
  document.getElementById('cancel-product-btn')
    ?.addEventListener('click', () => closeModal('modal-product'));
  document.getElementById('save-product-btn')
    ?.addEventListener('click', saveProduct);
  document.getElementById('product-image-input')
    ?.addEventListener('change', previewProductImage);
  ['product-name','product-category','product-price','product-stock','product-loyalty-price','product-description','product-is-active']
    .forEach(id => {
      const field = document.getElementById(id);
      field?.addEventListener('input', () => updateProductEditorState(false));
      field?.addEventListener('change', () => updateProductEditorState(false));
    });
  document.getElementById('modal-product')
    ?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveProduct();
      }
    });

  // Stock Modal
  document.getElementById('close-stock-modal')
    ?.addEventListener('click', () => closeModal('modal-stock'));
  document.getElementById('cancel-stock-btn')
    ?.addEventListener('click', () => closeModal('modal-stock'));
  document.getElementById('save-stock-btn')
    ?.addEventListener('click', saveStock);
  ['op-set','op-add','op-subtract'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      document.querySelectorAll('[data-op]').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      _stockOperation = e.currentTarget.dataset.op;
      const isAr = TAZA.Lang.current === 'ar';
      const lbl  = document.getElementById('stock-qty-label');
      if (lbl) lbl.textContent = _stockOperation === 'set'
        ? (isAr?'الكمية الجديدة':'New Quantity')
        : _stockOperation === 'add'
        ? (isAr?'الكمية المضافة':'Quantity to Add')
        : (isAr?'الكمية المخصومة':'Quantity to Subtract');
    });
  });

  // Offers
  document.getElementById('btn-add-offer')
    ?.addEventListener('click', openAddOfferModal);
  document.getElementById('close-offer-modal')
    ?.addEventListener('click', () => closeModal('modal-offer'));
  document.getElementById('cancel-offer-btn')
    ?.addEventListener('click', () => closeModal('modal-offer'));
  document.getElementById('save-offer-btn')
    ?.addEventListener('click', saveOffer);
  document.getElementById('add-product-to-offer-btn')
    ?.addEventListener('click', addProductToOfferList);
  document.getElementById('offer-image-input')
    ?.addEventListener('change', previewOfferImage);
  ['offer-name','offer-category','offer-price','offer-loyalty-price','offer-description','offer-start-date','offer-end-date']
    .forEach(id => {
      const field = document.getElementById(id);
      field?.addEventListener('input', () => updateOfferEditorState(false));
      field?.addEventListener('change', () => updateOfferEditorState(false));
    });
  document.getElementById('modal-offer')
    ?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveOffer();
      }
    });
  document.getElementById('offers-grid')
    ?.addEventListener('click', handleOfferAction);
  document.getElementById('offer-status-filter')
    ?.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      document.querySelectorAll('#offer-status-filter .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      loadOffers(chip.dataset.filter);
    });

  // Notifications
  document.getElementById('mark-all-read-btn')
    ?.addEventListener('click', markAllRead);
  document.getElementById('panel-mark-all')
    ?.addEventListener('click', markAllRead);
  document.getElementById('notif-btn')
    ?.addEventListener('click', loadNotificationsPage);
  document.getElementById('notif-list-panel')
    ?.addEventListener('click', (e) => {
      const item = e.target.closest('.notification-item.unread');
      if (item) markOneRead(Number(item.dataset.id), item);
    });
  document.getElementById('notif-list-panel')
    ?.addEventListener('keydown', (e) => {
      if (!['Enter', ' '].includes(e.key)) return;
      const item = e.target.closest('.notification-item.unread');
      if (!item) return;
      e.preventDefault();
      markOneRead(Number(item.dataset.id), item);
    });
  document.addEventListener('taza:notification-count', (e) => {
    const count = Number(e.detail?.count ?? 0);
    if (_notificationUnreadCount !== null && count !== _notificationUnreadCount) {
      loadNotificationsPage();
    }
  });

}
