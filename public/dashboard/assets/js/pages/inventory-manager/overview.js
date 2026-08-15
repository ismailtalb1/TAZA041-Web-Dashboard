'use strict';

// ══════════════════════════════════════════
// [1] Overview
// ══════════════════════════════════════════
async function loadOverview() {
  try {
    const res   = await TAZA.Http.get(TAZA.API.PRODUCTS.STATS);
    const stats = res?.data ?? {};
    renderOverviewStats(stats);
    renderCategoryChart(stats);
    loadStockChart();
    const mostOrdered = stats.most_ordered ?? [];
    TAZA.Charts.dashboard.topProducts('chart-top-products', {
      labels: mostOrdered.map(product => product.name),
      values: mostOrdered.map(product => Number(product.ordered_quantity ?? product.order_count ?? 0)),
    });
    handleLowStockAlert(stats);
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function renderOverviewStats(stats) {
  const isAr = TAZA.Lang.current === 'ar';
  const sum  = stats.summary ?? {};
  const grid = document.getElementById('overview-stats');

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon blue"><i class="fa-solid fa-burger"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'إجمالي المنتجات':'Total Products'}</div>
        <div class="stat-value">${sum.total_products ?? 0}</div>
        <div class="stat-change neutral"><i class="fa-solid fa-circle-info"></i>
          ${sum.active_products ?? 0} ${isAr?'نشط':'active'}
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'مخزون منخفض':'Low Stock'}</div>
        <div class="stat-value" style="color:${(sum.low_stock??0)>0?'var(--warning)':'var(--success)'}">
          ${sum.low_stock ?? 0}
        </div>
        <div class="stat-change ${(sum.low_stock??0)>0?'down':'up'}">
          <i class="fa-solid fa-boxes-stacked"></i>
          ${(sum.low_stock??0)>0 ? (isAr?'تحتاج تجديد':'Need restock') : (isAr?'المخزون جيد':'Stock ok')}
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon red"><i class="fa-solid fa-box-open"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'نفد من المخزون':'Out of Stock'}</div>
        <div class="stat-value" style="color:${(sum.out_of_stock??0)>0?'var(--danger)':'var(--success)'}">
          ${sum.out_of_stock ?? 0}
        </div>
        <div class="stat-change ${(sum.out_of_stock??0)>0?'down':'up'}">
          <i class="fa-solid fa-circle-dot"></i>
          ${(sum.out_of_stock??0)>0 ? (isAr?'يحتاج طلب':'Needs order') : (isAr?'كل شيء متوفر':'All available')}
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green"><i class="fa-solid fa-tags"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'عروض نشطة':'Active Offers'}</div>
        <div class="stat-value" id="active-offers-count">—</div>
        <div class="stat-change up"><i class="fa-solid fa-tag"></i> ${isAr?'عروض حالية':'Current deals'}</div>
      </div>
    </div>
  `;

  // Update badges
  const lowCount = sum.low_stock ?? 0;
  ['low-stock-badge', 'sb-low-stock'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = lowCount; el.style.display = lowCount > 0 ? 'inline-block' : 'none'; }
  });

  // Load offers count
  TAZA.Http.get(TAZA.API.OFFERS.ACTIVE).then(r => {
    const count = r?.data?.count ?? 0;
    const el    = document.getElementById('active-offers-count');
    if (el) el.textContent = count;
  }).catch(() => {});

  renderInventoryStatus(sum);
}

function renderInventoryStatus(summary = {}) {
  const panel = document.getElementById('inventory-status');
  if (!panel) return;
  const isAr = TAZA.Lang.current === 'ar';
  const low = Number(summary.low_stock ?? 0);
  const empty = Number(summary.out_of_stock ?? 0);
  const state = empty > 0 ? 'is-critical' : low > 0 ? 'has-alerts' : 'is-clear';
  const icon = empty > 0 ? 'fa-box-open' : low > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check';
  const title = empty > 0 ? (isAr ? `${empty} منتجات نافدة تحتاج تعبئة فورية` : `${empty} out-of-stock products need immediate restock`) : low > 0 ? (isAr ? `${low} منتجات تقترب من النفاد` : `${low} products are running low`) : (isAr ? 'المخزون بحالة جيدة' : 'Inventory is in good shape');
  const description = empty > 0 ? (isAr ? 'ابدأ بالمنتجات النافدة ثم انتقل إلى الكميات المنخفضة.' : 'Start with out-of-stock products, then handle low quantities.') : low > 0 ? (isAr ? 'راجع الكميات المنخفضة قبل أن تتوقف المنتجات عن الظهور.' : 'Review low quantities before products become unavailable.') : (isAr ? 'لا توجد كميات حرجة الآن؛ راجع الصور والعروض النشطة.' : 'No critical quantities now; review images and active offers.');
  panel.className = `inventory-status ${state}`;
  panel.innerHTML = `<div class="inventory-status-icon"><i class="fa-solid ${icon}"></i></div><div class="inventory-status-copy"><strong>${title}</strong><span>${description}</span></div><button class="btn btn-outline btn-sm" onclick="switchTab('products')"><i class="fa-solid fa-boxes-stacked"></i>${isAr?'فتح المخزون':'Open inventory'}</button>`;
}

function renderCategoryChart(stats) {
  const isAr   = TAZA.Lang.current === 'ar';
  const bycat  = stats.by_category ?? {};
  const labels = Object.values(bycat).map(c => c.label);
  const data   = Object.values(bycat).map(c => c.total);

  TAZA.Charts.createDonut('chart-categories', {
    labels: labels.length ? labels : [isAr?'وجبات':'Meals', isAr?'سندويشات':'Sandwiches', isAr?'مشروبات':'Drinks'],
    data:   data.length   ? data   : [0, 0, 0],
  });
}

async function loadStockChart() {
  try {
    const res  = await TAZA.Http.get(TAZA.API.PRODUCTS.LIST, { is_active: 1 });
    const prods = (res?.data?.products ?? []).slice(0, 8);
    if (prods.length) {
      TAZA.Charts.dashboard.stockLevels('chart-stock', {
        names:  prods.map(p => p.name?.slice(0, 10)),
        stocks: prods.map(p => p.stock_quantity ?? 0),
      });
    } else {
      TAZA.Charts.dashboard.stockLevels('chart-stock', { names: [], stocks: [] });
    }
  } catch {
    TAZA.Charts.dashboard.stockLevels('chart-stock', { names: [], stocks: [] });
  }
}

function handleLowStockAlert(stats) {
  const section   = document.getElementById('low-stock-section');
  const alertText = document.getElementById('low-stock-alert-text');
  const namesEl   = document.getElementById('low-stock-names');
  const lowCount  = stats.summary?.low_stock ?? 0;
  const isAr      = TAZA.Lang.current === 'ar';

  if (!section) return;
  section.style.display = lowCount > 0 ? 'block' : 'none';

  if (lowCount > 0 && alertText) {
    alertText.textContent = `${lowCount} ${isAr ? 'منتج على وشك النفاد' : 'products are running low'}`;
    // Load names
    TAZA.Http.get(TAZA.API.PRODUCTS.LOW_STOCK)
      .then(r => {
        const names = (r?.data?.products ?? []).slice(0, 4).map(p => p.name).join(' · ');
        if (namesEl) namesEl.textContent = names;
      }).catch(() => {});
  }
}
