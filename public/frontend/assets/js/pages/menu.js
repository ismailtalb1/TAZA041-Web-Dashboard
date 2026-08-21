// Menu filters, product cards, and order payload helpers
function initMenuPage() {
  $('[data-product-detail-modal]')?.remove();
  const params = new URLSearchParams(location.search);
  if (params.get('type')) setOrderType(params.get('type'));
  else persist();
  const badge = $('[data-order-badge]');
  if (badge) {
    renderOrderBadges();
  }

  setMedia($('.hero-panel .placeholder-media'), getImage('food') || getImage('banner'), 'Menu');

  const sidebarSummary = $('.summary-card');
  const orderPathHtml = () => `
      <div class="order-type-head">
        <span class="section-tag">${langText('مسار الطلب', 'Order path')}</span>
        <strong>${langText('نوع الطلب', 'Order type')}</strong>
      </div>
      <select class="select visually-hidden" data-order-select aria-label="${langText('نوع الطلب', 'Order type')}">
        <option value="">${langText('اختر نوع الطلب', 'Choose order type')}</option>
        <option value="ordinary">${langText('طلب عادي', 'Ordinary order')}</option>
        <option value="delivery">${langText('طلب توصيل', 'Delivery order')}</option>
        <option value="reservation">${langText('حجز طاولة', 'Table reservation')}</option>
      </select>
      <div class="order-choice-grid" role="group" aria-label="${langText('نوع الطلب', 'Order type')}">
        <button type="button" class="order-choice" data-order-choice="ordinary"><span class="order-choice-icon" aria-hidden="true">01</span><span class="order-choice-copy"><span>${langText('طلب عادي', 'Ordinary')}</span><small>${langText('استلام من المطعم', 'Restaurant pickup')}</small></span><i aria-hidden="true"></i></button>
        <button type="button" class="order-choice" data-order-choice="delivery"><span class="order-choice-icon" aria-hidden="true">02</span><span class="order-choice-copy"><span>${langText('طلب توصيل', 'Delivery')}</span><small>${langText('مع تحديد الموقع', 'With location')}</small></span><i aria-hidden="true"></i></button>
        <button type="button" class="order-choice" data-order-choice="reservation"><span class="order-choice-icon" aria-hidden="true">03</span><span class="order-choice-copy"><span>${langText('حجز طاولة', 'Reservation')}</span><small>${langText('طاولة ووقت', 'Table and time')}</small></span><i aria-hidden="true"></i></button>
      </div>`;

  if (sidebarSummary) {
    let selector = sidebarSummary.querySelector('.order-type-selector');
    if (!selector) {
      selector = document.createElement('div');
      selector.className = 'summary-item order-type-selector';
      const totalBox = sidebarSummary.querySelector('[data-cart-total]')?.closest('.summary-item');
      totalBox?.insertAdjacentElement('afterend', selector);
    }
    selector.innerHTML = orderPathHtml();
  }
  $$('[data-order-select]').forEach(el => { el.value = AppState.orderType || ''; });
  const syncOrderChoices = () => {
    $$('[data-order-choice]').forEach(btn => {
      const active = btn.dataset.orderChoice === AppState.orderType;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  };
  $$('[data-order-choice]').forEach(btn => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => {
      setOrderType(btn.dataset.orderChoice);
      syncOrderChoices();
    });
  });
  $$('[data-order-select]').forEach(el => {
    if (el.dataset.choiceSyncBound === 'true') return;
    el.dataset.choiceSyncBound = 'true';
    el.addEventListener('change', syncOrderChoices);
  });
  syncOrderChoices();

  const search = $('[data-menu-search]');
  const suggestions = $('[data-suggestions]');
  let activeCategory = 'all';
  const maxProductPrice = 1000;
  const filters = { maxPrice: maxProductPrice, topRated: false, available: false, offersOnly: false };
  const range = $('[data-max-price]');
  let activeDetailItem = null;
  if (range) {
    range.max = String(maxProductPrice);
    range.value = String(maxProductPrice);
  }
  const priceValue = $('[data-price-value]');
  if (priceValue) priceValue.textContent = formatCurrency(maxProductPrice);

  const findCatalogItem = (key) => [
    ...AppState.catalog.allItems,
    ...AppState.catalog.offers,
    ...AppState.catalog.products
  ].find(item => item.key === key);

  const closeProductDetail = () => {
    const modal = $('[data-product-detail-modal]');
    modal?.classList.remove('active');
    if (!$('[data-cart-drawer]')?.classList.contains('active') && !$('[data-auth-modal]')?.classList.contains('active') && !$('[data-sidebar]')?.classList.contains('active')) {
      $('[data-overlay]')?.classList.remove('active');
    }
  };

  const ensureProductDetailModal = () => {
    let modal = $('[data-product-detail-modal]');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'detail-modal product-detail-modal';
    modal.dataset.productDetailModal = '';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);

    modal.addEventListener('click', (event) => {
      const qtyInput = $('[data-detail-qty]', modal);
      const itemLimit = () => Math.max(1, Math.min(99, Number(activeDetailItem?.maxQuantity || activeDetailItem?.stockQuantity || 99) || 99));
      const currentQty = () => Math.max(1, Math.min(itemLimit(), Number(qtyInput?.value || 1) || 1));
      const setQty = (value) => {
        if (qtyInput) qtyInput.value = String(Math.max(1, Math.min(itemLimit(), Number(value) || 1)));
      };

      if (event.target.closest('[data-close-product-detail]')) {
        closeProductDetail();
        return;
      }
      if (event.target.closest('[data-detail-qty-down]')) {
        setQty(currentQty() - 1);
        return;
      }
      if (event.target.closest('[data-detail-qty-up]')) {
        setQty(currentQty() + 1);
        return;
      }
      if (event.target.closest('[data-detail-add]')) {
        if (!activeDetailItem) return;
        const note = $('[data-product-special-note]', modal)?.value || '';
        if (addToCart(activeDetailItem, { qty: currentQty(), note })) closeProductDetail();
        return;
      }
      const reportButton = event.target.closest('[data-report-unavailable]');
      if (reportButton && activeDetailItem) {
        reportUnavailableProduct(activeDetailItem, reportButton);
      }
    });

    modal.addEventListener('input', (event) => {
      if (!event.target.matches('[data-detail-qty]')) return;
      const limit = Math.max(1, Math.min(99, Number(activeDetailItem?.maxQuantity || activeDetailItem?.stockQuantity || 99) || 99));
      event.target.value = String(Math.max(1, Math.min(limit, Number(event.target.value || 1) || 1)));
    });

    if (document.documentElement.dataset.productDetailEscapeBound !== 'true') {
      document.documentElement.dataset.productDetailEscapeBound = 'true';
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeProductDetail();
      });
    }
    return modal;
  };

  const openProductDetail = (item) => {
    if (!item) return;
    activeDetailItem = item;
    const itemName = catalogItemName(item);
    const itemDescription = catalogItemDescription(item) || langText('اختيار مميز من قائمة TAZA', 'A premium TAZA selection');
    const modal = ensureProductDetailModal();
    const qtyInCart = AppState.cart[item.key]?.qty || 0;
    const existingNote = AppState.cart[item.key]?.specialNote || '';
    const stars = item.rating ? '★'.repeat(Math.max(1, Math.min(5, Math.round(item.rating)))) : '★';
    const categoryLabel = {
      meals: langText('وجبة', 'Meal'),
      sandwiches: langText('ساندويش', 'Sandwich'),
      drinks: langText('مشروب', 'Drink'),
      offers: langText('عرض', 'Offer')
    }[item.category] || langText('منتج', 'Item');
    const canReportUnavailable = item.item_type === 'product' && !item.available;
    const alreadyReported = canReportUnavailable && unavailableProductWasReported(item.reference_id);
    const quantityLimit = Math.max(1, Math.min(99, Number(item.maxQuantity || item.stockQuantity || 99) || 99));

    modal.setAttribute('aria-label', itemName);
    modal.innerHTML = `
      <button class="close-btn product-detail-close" type="button" data-close-product-detail aria-label="${esc(langText('إغلاق تفاصيل المنتج', 'Close product details'))}">×</button>
      <div class="product-detail-shell">
        <div class="product-detail-media">
          ${mediaHtml(item, itemName)}
          <div class="product-badges">
            <span class="badge">${esc(categoryLabel)}</span>
            ${item.offer && item.discount ? `<span class="badge discount-badge">-${esc(item.discount)}%</span>` : ''}
          </div>
          <div class="product-detail-media-caption">
            <span>${esc(categoryLabel)}</span>
            <strong>${esc(itemName)}</strong>
          </div>
        </div>
        <div class="product-detail-content">
          <div class="product-detail-heading">
            <span class="section-tag">${esc(langText('تفاصيل المنتج', 'Item details'))}</span>
            <h2>${esc(itemName)}</h2>
            <p class="muted">${esc(itemDescription)}</p>
          </div>
          <div class="product-detail-price-panel">
            <div class="product-detail-price-copy">
              <span>${esc(langText('السعر', 'Price'))}</span>
              <strong>${formatCurrency(item.price)}</strong>
              ${item.oldPrice ? `<small>${formatCurrency(item.oldPrice)}</small>` : ''}
            </div>
            <div class="product-detail-rating">
              <span>${esc(langText('التقييم', 'Rating'))}</span>
              <strong class="rating">${stars}<small>${item.rating ? Number(item.rating).toFixed(1) : langText('جديد', 'New')}</small></strong>
            </div>
          </div>
          <div class="product-detail-meta">
            <div><span>${esc(langText('الحالة', 'Status'))}</span><strong>${esc(item.available ? langText('متاح الآن', 'Available now') : langText('غير متوفر الآن', 'Currently unavailable'))}</strong></div>
            <div><span>${esc(langText('في السلة', 'In cart'))}</span><strong data-detail-cart-count>${qtyInCart}</strong></div>
          </div>
          <div class="product-detail-order-panel">
            <div class="product-detail-controls">
              <label class="label">${esc(langText('الكمية المراد إضافتها', 'Quantity to add'))}</label>
              <div class="detail-quantity-stepper">
                <button class="qty-btn" type="button" data-detail-qty-down aria-label="${esc(langText('إنقاص الكمية', 'Decrease quantity'))}">−</button>
                <input class="input" type="number" min="1" max="${quantityLimit}" value="1" inputmode="numeric" data-detail-qty aria-label="${esc(langText('كمية المنتج', 'Item quantity'))}">
                <button class="qty-btn" type="button" data-detail-qty-up aria-label="${esc(langText('زيادة الكمية', 'Increase quantity'))}">+</button>
              </div>
            </div>
            <div class="product-detail-note">
              <label class="label" for="product-special-note">${esc(langText('ملاحظات خاصة', 'Special notes'))}</label>
              <textarea id="product-special-note" class="textarea" rows="3" maxlength="220" data-product-special-note placeholder="${esc(langText('مثال: بدون صوص، زيادة جبنة، تقطيع الساندويش', 'Example: no sauce, extra cheese, cut the sandwich'))}">${esc(existingNote)}</textarea>
            </div>
          </div>
          <button class="btn btn-primary product-detail-add" type="button" data-detail-add ${item.available ? '' : 'disabled'}>${esc(item.available ? langText('إضافة الكمية إلى السلة', 'Add quantity to cart') : langText('غير متاح حالياً', 'Currently unavailable'))}</button>
          ${canReportUnavailable ? `<button class="btn btn-secondary unavailable-report-btn" type="button" data-report-unavailable ${alreadyReported ? 'disabled' : ''}>${esc(alreadyReported ? langText('تم إبلاغ مدير المخزون', 'Inventory manager notified') : langText('إبلاغ مدير المخزون', 'Notify inventory manager'))}</button>` : ''}
        </div>
      </div>`;
    $('[data-overlay]')?.classList.add('active');
    modal.classList.add('active');
    $('[data-detail-qty]', modal)?.focus();
  };

  const syncCategoryTabs = () => {
    $$('[data-category]').forEach(btn => {
      const active = btn.dataset.category === activeCategory;
      btn.classList.toggle('active', active);
      btn.classList.toggle('btn-primary', active);
      btn.classList.toggle('btn-secondary', !active);
      btn.setAttribute('aria-pressed', String(active));
    });
  };

  const renderProducts = () => {
    const q = normalizeCatalogSearch(search?.value || '');
    const wantsOffers = activeCategory === 'offers' || filters.offersOnly;
    let items = wantsOffers
      ? AppState.catalog.offers
      : AppState.catalog.allItems.filter(item => activeCategory === 'all' ? true : item.category === activeCategory);
    if (q) items = smartCatalogSearch(items, q).map(match => match.item);
    items = items.filter(item => Number(item.price) <= filters.maxPrice);
    if (filters.topRated) items = items.filter(item => item.rating >= 4.5);
    if (filters.available) items = items.filter(item => item.available);
    const grid = $('[data-products-grid]');
    if (!grid) return;
    grid.classList.toggle('is-empty', !items.length);
    if (!items.length) {
      const emptyType = q ? 'search' : (wantsOffers ? 'offers' : 'products');
      grid.innerHTML = emptyStateHtml(emptyType);
      return;
    }
    grid.innerHTML = items.map(item => productCardHtml(item)).join('');
    $$('[data-open-product]', grid).forEach(el => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openProductDetail(findCatalogItem(el.dataset.openProduct));
      });
    });
    $$('[data-quick-increase]', grid).forEach(el => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const item = findCatalogItem(el.dataset.quickIncrease);
        if (item?.available) addToCart(item);
      });
    });
    $$('[data-quick-decrease]', grid).forEach(el => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const key = el.dataset.quickDecrease;
        if ((AppState.cart[key]?.qty || 0) > 0) removeFromCart(key);
      });
    });
    $$('[data-report-unavailable]', grid).forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        reportUnavailableProduct(findCatalogItem(button.dataset.reportUnavailable), button);
      });
    });
    $$('[data-product-card]', grid).forEach(card => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('button, input, textarea, select, a')) return;
        openProductDetail(findCatalogItem(card.dataset.productCard));
      });
      card.addEventListener('keydown', (event) => {
        if (event.target !== card) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openProductDetail(findCatalogItem(card.dataset.productCard));
      });
    });
    updateProductQuantities(grid);
  };

  const updateProductQuantities = (scope = $('[data-products-grid]')) => {
    if (!scope) return;
    $$('[data-product-qty]', scope).forEach(el => {
      const qty = AppState.cart[el.dataset.productQty]?.qty || 0;
      el.textContent = qty;
      el.setAttribute('aria-label', langText(`الكمية في السلة ${qty}`, `Quantity in cart ${qty}`));
    });
    $$('[data-quick-decrease]', scope).forEach(el => {
      const qty = AppState.cart[el.dataset.quickDecrease]?.qty || 0;
      el.disabled = qty <= 0;
    });
    const detailCount = $('[data-product-detail-modal].active [data-detail-cart-count]');
    if (detailCount && activeDetailItem) detailCount.textContent = AppState.cart[activeDetailItem.key]?.qty || 0;
  };

  if (document.documentElement.dataset.menuCartUpdateBound !== 'true') {
    document.documentElement.dataset.menuCartUpdateBound = 'true';
    window.addEventListener('taza:cart-updated', () => updateProductQuantities());
  }

  $$('[data-category]').forEach(btn => btn.addEventListener('click', () => {
    activeCategory = btn.dataset.category || 'all';
    syncCategoryTabs();
    renderProducts();
  }));
  syncCategoryTabs();
  range?.addEventListener('input', event => {
    filters.maxPrice = Number(event.target.value);
    if (priceValue) priceValue.textContent = formatCurrency(filters.maxPrice);
    renderProducts();
  });
  $$('[data-filter-flag]').forEach(chk => chk.addEventListener('change', () => {
    filters[chk.dataset.filterFlag] = chk.checked;
    renderProducts();
  }));
  search?.addEventListener('input', () => {
    const val = normalizeCatalogSearch(search.value);
    if (val.length >= 2) {
      const matches = smartCatalogSearch(AppState.catalog.allItems, val).slice(0, 5);
      const correction = matches[0]?.fuzzy
        ? `<div class="suggestion-item" style="pointer-events:none;font-weight:700;color:var(--primary)">${esc(langText('هل تقصد؟', 'Did you mean?'))}</div>`
        : '';
      suggestions.innerHTML = correction + matches.map(({ item }) => {
        const itemName = catalogItemName(item);
        return `<div class="suggestion-item" data-suggest="${esc(itemName)}">${esc(itemName)}</div>`;
      }).join('');
      suggestions.classList.toggle('active', matches.length > 0);
      $$('[data-suggest]', suggestions).forEach(el => el.onclick = () => {
        search.value = el.dataset.suggest;
        suggestions.classList.remove('active');
        renderProducts();
      });
    } else {
      suggestions?.classList.remove('active');
    }
    renderProducts();
  });
  $('[data-continue-order]')?.addEventListener('click', () => {
    proceedWithCurrentOrder();
  });
  renderProducts();

  window.addEventListener('taza:public-data-updated', event => {
    if (!event.detail?.catalog) return;
    renderProducts();
    renderCartSummary();
    if (!activeDetailItem || !$('[data-product-detail-modal].active')) return;
    const refreshedItem = findCatalogItem(activeDetailItem.key);
    if (refreshedItem) {
      openProductDetail(refreshedItem);
    } else {
      closeProductDetail();
      showToast(langText('لم يعد هذا العنصر متاحاً في المنيو', 'This item is no longer available in the menu'), { kind: 'warning' });
    }
  });

  const linkedItemKey = params.get('item');
  if (linkedItemKey) {
    const linkedItem = findCatalogItem(linkedItemKey);
    if (linkedItem) {
      if (linkedItem.offer) {
        activeCategory = 'offers';
        syncCategoryTabs();
        renderProducts();
      }
      requestAnimationFrame(() => {
        const card = $(`[data-product-card="${CSS.escape(linkedItem.key)}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        openProductDetail(linkedItem);
      });
    } else {
      showToast(langText('لم يعد هذا العنصر متاحاً في المنيو.', 'This item is no longer available in the menu.'), { kind: 'warning' });
    }
  }
}

function productCardHtml(item) {
  const qty = AppState.cart[item.key]?.qty || 0;
  const itemName = catalogItemName(item);
  const itemDescription = catalogItemDescription(item) || langText('اختيار مميز من قائمة TAZA', 'A premium TAZA selection');
  const stars = item.rating ? '★'.repeat(Math.max(1, Math.min(5, Math.round(item.rating)))) : '★';
  const categoryLabel = {
    meals: langText('وجبة', 'Meal'),
    sandwiches: langText('ساندويش', 'Sandwich'),
    drinks: langText('مشروب', 'Drink'),
    offers: langText('عرض', 'Offer')
  }[item.category] || langText('منتج', 'Item');
  const canReportUnavailable = item.item_type === 'product' && !item.available;
  const alreadyReported = canReportUnavailable && unavailableProductWasReported(item.reference_id);
  return `
    <article class="product-card card-item ${item.offer ? 'offer-card' : ''} ${item.available ? '' : 'is-unavailable'}" data-product-card="${esc(item.key)}" tabindex="0" aria-label="${esc(langText('عرض تفاصيل ', 'View details for ') + itemName)}">
      <div class="product-media-wrap">
        ${mediaHtml(item, itemName)}
        <div class="product-badges">
          <span class="badge">${esc(categoryLabel)}</span>
          ${item.offer && item.discount ? `<span class="badge discount-badge">-${esc(item.discount)}%</span>` : ''}
          ${item.available ? '' : `<span class="badge unavailable-badge">${esc(langText('غير متوفر الآن', 'Currently unavailable'))}</span>`}
        </div>
      </div>
      <div class="product-card-body">
        <div class="row-between product-title-row"><h3>${esc(itemName)}</h3><span class="rating" aria-label="${esc(langText('التقييم', 'Rating'))} ${item.rating ? Number(item.rating).toFixed(1) : langText('جديد', 'New')}">${stars}<small>${item.rating ? Number(item.rating).toFixed(1) : langText('جديد', 'New')}</small></span></div>
        <p class="muted">${esc(itemDescription)}</p>
      </div>
      <div class="product-card-footer">
        <div class="product-card-price">
          <span>${esc(langText('السعر', 'Price'))}</span>
          <div class="price-main">${formatCurrency(item.price)}</div>
          ${item.oldPrice ? `<div class="price-old">${formatCurrency(item.oldPrice)}</div>` : ''}
        </div>
        ${item.available ? `<div class="product-quick-pick" role="group" aria-label="${esc(langText(`اختيار سريع لـ ${itemName}`, `Quick add ${itemName}`))}">
          <span class="product-quick-label">${esc(langText('اختيار سريع', 'Quick add'))}</span>
          <div class="product-quick-stepper">
            <button class="quick-qty-btn" type="button" data-quick-decrease="${esc(item.key)}" aria-label="${esc(langText(`إزالة ${itemName} من السلة`, `Remove ${itemName} from cart`))}" ${qty > 0 ? '' : 'disabled'}>−</button>
            <span class="product-quick-count" data-product-qty="${esc(item.key)}" aria-live="polite">${qty}</span>
            <button class="quick-qty-btn quick-qty-add" type="button" data-quick-increase="${esc(item.key)}" aria-label="${esc(langText(`إضافة ${itemName} إلى السلة`, `Add ${itemName} to cart`))}" ${item.available ? '' : 'disabled'}>+</button>
          </div>
        </div>` : `<div class="product-unavailable-actions"><strong>${esc(langText('غير متوفر الآن', 'Currently unavailable'))}</strong>${canReportUnavailable ? `<button class="btn btn-secondary" type="button" data-report-unavailable="${esc(item.key)}" ${alreadyReported ? 'disabled' : ''}>${esc(alreadyReported ? langText('تم الإبلاغ', 'Reported') : langText('إبلاغ المخزون', 'Notify inventory'))}</button>` : ''}</div>`}
      </div>
      <button class="product-detail-trigger" type="button" data-open-product="${esc(item.key)}">${esc(langText('التفاصيل والملاحظات', 'Details & notes'))}<span aria-hidden="true">↗</span></button>
    </article>`;
}

function renderPaymentSummary(target) {
  if (!target) return cartTotal();
  const subtotal = cartTotal();
  const deliveryFee = Number(AppState.deliveryMeta?.fee || 0);
  const reservationFee = Number(AppState.reservationMeta?.fee || 0);
  const total = subtotal + deliveryFee + reservationFee;
  target.innerHTML = `
    <div class="summary-item"><div class="row-between"><strong>${langText('مجموع المنتجات', 'Items subtotal')}</strong><span>${formatCurrency(subtotal)}</span></div></div>
    ${deliveryFee ? `<div class="summary-item"><div class="row-between"><strong>${langText('أجور التوصيل', 'Delivery fee')}</strong><span>${formatCurrency(deliveryFee)}</span></div></div>` : ''}
    ${reservationFee ? `<div class="summary-item"><div class="row-between"><strong>${langText('رسوم الحجز', 'Reservation fee')}</strong><span>${formatCurrency(reservationFee)}</span></div></div>` : ''}
    <div class="summary-item order-notes-panel">
      <label class="label">${langText('ملاحظة على الطلب', 'Order note')}</label>
      <textarea class="textarea" rows="3" maxlength="500" data-order-notes placeholder="${langText('مثال: بدون مخلل، زيادة صوص', 'Example: no pickles, extra sauce')}">${esc(AppState.orderNotes || '')}</textarea>
    </div>
    <div class="summary-item"><div class="row-between"><strong>${langText('الإجمالي النهائي', 'Grand total')}</strong><span>${formatCurrency(total)}</span></div></div>`;
  $('[data-payment-total]')?.replaceChildren(document.createTextNode(formatCurrency(total)));
  return total;
}

function apiOrderType() {
  return AppState.orderType === 'ordinary' ? 'normal' : AppState.orderType;
}

function buildOrderPayload() {
  const type = apiOrderType();
  const cartItems = getCartItems();
  const normalizedItems = cartItems.map(item => ({
    item_type: cartItemType(item),
    reference_id: cartItemReferenceId(item),
    quantity: Number(item.qty)
  }));
  const invalidItem = normalizedItems.find(item =>
    !['product', 'offer'].includes(item.item_type)
    || !Number.isInteger(item.reference_id)
    || item.reference_id <= 0
    || !Number.isInteger(item.quantity)
    || item.quantity <= 0
  );
  if (invalidItem) {
    throw new Error(langText(
      'تعذر ربط أحد عناصر السلة ببيانات قائمة المطعم الحالية. حدّث القائمة ثم أعد إضافته.',
      'A cart item could not be linked to the current restaurant menu. Refresh the menu, then add it again.'
    ));
  }
  const itemNotes = cartItems
    .filter(item => String(item.specialNote || '').trim())
    .map(item => `${catalogItemName(item)}: ${String(item.specialNote || '').trim()}`)
    .join('\n');
  const notes = [
    (AppState.orderNotes || '').trim(),
    itemNotes ? `${langText('ملاحظات المنتجات:', 'Item notes:')}\n${itemNotes}` : ''
  ].filter(Boolean).join('\n\n');
  const payload = {
    type,
    notes,
    items: normalizedItems
  };
  if (type === 'delivery') {
    payload.delivery_address = AppState.deliveryMeta?.address || langText('موقع محدد على الخريطة', 'Map selected location');
    payload.latitude = AppState.deliveryMeta?.latitude;
    payload.longitude = AppState.deliveryMeta?.longitude;
  }
  if (type === 'reservation') {
    payload.table_number = Number(AppState.reservationMeta?.tableNumber);
    payload.table_type = AppState.reservationMeta?.tableType || 'normal';
    payload.seats_count = Number(AppState.reservationMeta?.seats || 1);
    payload.reservation_time = AppState.reservationMeta?.reservationTime;
    payload.duration_minutes = Number(AppState.reservationMeta?.durationMinutes || 60);
    payload.special_notes = AppState.reservationMeta?.notes || '';
  }
  return payload;
}

function paymentMethodPayload(method, total) {
  const map = { seriatel: 'syriatel_cash', sham: 'sham_cash', loyalty: 'loyalty_points', cash: 'cash' };
  const visibleForm = $(`[data-payment-form="${method}"]`);
  const inputs = $$('input', visibleForm);
  const body = { method: map[method] || method };
  if (method === 'seriatel' || method === 'sham') {
    body.phone = normalizePhone(inputs[0]?.value || AppState.user.phone || '');
    body.pin_code = inputs[1]?.value.trim() || '0000';
  }
  if (method === 'loyalty') body.points_required = loyaltyPointsRequired(total);
  if (method === 'cash') body.notes = langText('دفع يدوي أو كاش عند الاستلام', 'Manual / cash on delivery');
  return body;
}
