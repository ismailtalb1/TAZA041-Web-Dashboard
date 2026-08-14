// Customer profile context, cart state, checkout routing
async function refreshCustomerContext() {
  let profile = null;
  try {
    profile = await apiFetch('/customer/profile');
  } catch (error) {
    if ([401, 403].includes(Number(error?.status))) {
      AppState.token = '';
      AppState.loggedIn = false;
      AppState.user = { ...defaultUser };
      persist();
      renderUserHeader();
    }
    return false;
  }
  if (!profile?.customer?.id) return false;
  AppState.user = normalizeUser({ ...profile.customer, loyalty: profile.loyalty || profile.customer.loyalty });
  AppState.loggedIn = true;
  applyLoyaltySnapshot(profile.loyalty, AppState.user);
  const embeddedAddresses = profile.saved_addresses
    ?? profile.addresses
    ?? profile.customer.saved_addresses
    ?? profile.customer.addresses;
  await refreshSavedAddressesContext(embeddedAddresses);
  persist();
  renderUserHeader();
  return true;
}

function renderUserHeader() {
  const user = AppState.user || defaultUser;
  const hasUserIdentity = Boolean(user.id || user.email || user.phone || (user.name && user.name !== defaultUser.name));
  const loadingName = langText('جاري التحميل', 'Loading');
  $$('[data-user-name]').forEach(el => el.textContent = hasUserIdentity ? (user.name || defaultUser.name) : loadingName);
  $$('[data-user-loyalty]').forEach(el => el.textContent = hasUserIdentity ? normalizeNumber(user.loyaltyPoints ?? 0) : '—');
  $$('[data-requires-login]').forEach(el => el.classList.toggle('hidden', !AppState.loggedIn));
}

function cartItemReferenceId(item = {}) {
  const keyReference = String(item.key || '').split(':').at(-1);
  const candidates = [item.reference_id, item.referenceId, item.id, keyReference];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isInteger(value) && value > 0) return value;
  }
  return null;
}

function cartItemType(item = {}) {
  const keyType = String(item.key || '').split(':')[0];
  const type = item.item_type || item.itemType || keyType;
  return ['product', 'offer'].includes(type) ? type : null;
}

function cartItemNames(item = {}) {
  return [item.name, item.nameAr, item.nameEn, item.name_ar, item.name_en]
    .map(value => String(value || '').trim().toLocaleLowerCase())
    .filter(Boolean);
}

function matchingCatalogItem(cartItem = {}) {
  const catalog = AppState.catalog?.allItems || [];
  const type = cartItemType(cartItem);
  const referenceId = cartItemReferenceId(cartItem);
  const directMatch = referenceId
    ? catalog.find(item => cartItemType(item) === type && cartItemReferenceId(item) === referenceId)
    : null;
  if (directMatch) return directMatch;

  const names = new Set(cartItemNames(cartItem));
  if (!names.size) return null;
  return catalog.find(item =>
    cartItemType(item) === type
    && cartItemNames(item).some(name => names.has(name))
  ) || null;
}

function reconcileCartWithCatalog() {
  if (AppState.usingFallback || !AppState.apiOnline) return false;
  const currentCart = AppState.cart || {};
  const nextCart = {};
  let changed = false;

  Object.values(currentCart).forEach(item => {
    const match = matchingCatalogItem(item);
    if (!match) {
      const key = item.key || `unmatched:${Object.keys(nextCart).length}`;
      nextCart[key] = { ...item, key, available: false };
      if (item.available !== false) changed = true;
      return;
    }

    const key = match.key;
    const maxQuantity = Number(match.maxQuantity || match.stockQuantity || 0);
    const normalized = {
      ...item,
      key,
      id: match.id,
      item_type: match.item_type,
      reference_id: match.reference_id,
      name: match.name,
      nameAr: match.nameAr || item.nameAr || null,
      nameEn: match.nameEn || item.nameEn || null,
      price: Number(match.price || item.price || 0),
      imageUrl: match.imageUrl || item.imageUrl || null,
      available: match.available !== false,
      maxQuantity,
      qty: match.available !== false && maxQuantity > 0
        ? Math.min(Number(item.qty || 1), maxQuantity)
        : Number(item.qty || 1)
    };

    if (nextCart[key]) {
      nextCart[key].qty = Math.min(99, Number(nextCart[key].qty || 0) + Number(normalized.qty || 0));
    } else {
      nextCart[key] = normalized;
    }
    if (
      item.key !== key
      || item.reference_id !== normalized.reference_id
      || item.item_type !== normalized.item_type
      || item.available !== normalized.available
      || Number(item.price || 0) !== normalized.price
      || item.imageUrl !== normalized.imageUrl
      || Number(item.qty || 0) !== normalized.qty
    ) changed = true;
  });

  if (!changed) return false;
  AppState.cart = nextCart;
  persist();
  renderCartSummary();
  notifyCartUpdated();
  return true;
}

function getCartItems() {
  const items = Object.values(AppState.cart || {});
  let repaired = false;
  items.forEach(item => {
    const referenceId = cartItemReferenceId(item);
    if (referenceId && item.reference_id !== referenceId) {
      item.reference_id = referenceId;
      repaired = true;
    }
    const itemType = cartItemType(item);
    if (itemType && item.item_type !== itemType) {
      item.item_type = itemType;
      repaired = true;
    }
  });
  if (repaired) persist();
  return items;
}
function cartTotal() { return getCartItems().reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0); }
function cartCount() { return getCartItems().reduce((sum, item) => sum + Number(item.qty || 0), 0); }

function notifyCartUpdated() {
  window.dispatchEvent(new CustomEvent('taza:cart-updated'));
}

function addToCart(item, options = {}) {
  if (!item || !item.available) {
    const unavailableName = item ? catalogItemName(item) : '';
    return showToast(
      langText(
        unavailableName ? `«${unavailableName}» غير متوفر حالياً` : 'هذا العنصر غير متاح حالياً',
        unavailableName ? `“${unavailableName}” is not available now` : 'This item is not available now'
      ),
      { kind: 'warning', title: langText('غير متوفر الآن', 'Currently unavailable') }
    );
  }
  const key = item.key || `${item.item_type}:${item.id}`;
  const existing = AppState.cart[key];
  const referenceId = cartItemReferenceId(item);
  const itemType = cartItemType(item);
  if (!referenceId || !itemType) {
    return showToast(langText('تعذر ربط هذا العنصر بقائمة المطعم الحالية', 'This item could not be linked to the current restaurant menu'), { kind: 'error' });
  }
  const quantity = Math.max(1, Math.min(99, Number(options.qty || options.quantity || 1) || 1));
  const currentQuantity = Number(existing?.qty || 0);
  const maxQuantity = Number(item.maxQuantity || item.stockQuantity || 0);
  if (maxQuantity > 0 && currentQuantity + quantity > maxQuantity) {
    const remainingQuantity = Math.max(0, maxQuantity - currentQuantity);
    const itemName = catalogItemName(item);
    const messageAr = remainingQuantity > 0
      ? `لا يمكن إضافة هذه الكمية من «${itemName}». المتبقي المتوفر في المطعم ${remainingQuantity} فقط.`
      : `أضفت كامل الكمية المتوفرة من «${itemName}». لا توجد وحدات إضافية في المطعم حالياً.`;
    const messageEn = remainingQuantity > 0
      ? `This quantity of “${itemName}” cannot be added. Only ${remainingQuantity} more available.`
      : `You have added all available units of “${itemName}”. No more are available right now.`;
    showToast(langText(messageAr, messageEn), {
      kind: 'warning',
      title: langText('الكمية المتوفرة محدودة', 'Limited availability'),
      duration: 5200
    });
    return false;
  }
  const specialNote = String(options.note || options.specialNote || '').trim().slice(0, 220);
  if (existing) {
    existing.qty += quantity;
    if (referenceId) existing.reference_id = referenceId;
    if (!existing.item_type) existing.item_type = itemType;
    if (specialNote) {
      const notes = String(existing.specialNote || '').split('\n').map(note => note.trim()).filter(Boolean);
      if (!notes.includes(specialNote)) notes.push(specialNote);
      existing.specialNote = notes.join('\n').slice(0, 500);
    }
  }
  else AppState.cart[key] = {
    key,
    id: item.id,
    item_type: itemType,
    reference_id: referenceId,
    name: item.name,
    nameAr: item.nameAr || item.name_ar || null,
    nameEn: item.nameEn || item.name_en || null,
    price: Number(item.price || 0),
    qty: quantity,
    imageUrl: item.imageUrl || null,
    available: item.available !== false,
    maxQuantity,
    stockQuantity: Number(item.stockQuantity || maxQuantity || 0),
    specialNote
  };
  persist();
  renderCartSummary();
  notifyCartUpdated();
  showToast(langText('تمت إضافة العنصر إلى السلة', 'Item added to cart'), { kind: item.offer ? 'offer' : 'cart' });
  return true;
}

function unavailableReportStorageKey(productId) {
  return `taza_unavailable_report_${AppState.user?.id || 'customer'}_${productId}`;
}

function unavailableProductWasReported(productId) {
  try { return sessionStorage.getItem(unavailableReportStorageKey(productId)) === 'true'; } catch (_) { return false; }
}

async function reportUnavailableProduct(item, button = null) {
  if (!item || item.item_type !== 'product' || item.available) return;
  if (!requireCustomerLogin()) return;
  const productId = cartItemReferenceId(item);
  if (!productId) return;

  if (button) {
    button.disabled = true;
    button.textContent = langText('جاري إرسال البلاغ...', 'Sending report...');
  }
  try {
    await apiFetch(`/customer/products/${productId}/report-unavailable`, { method: 'POST', timeoutMs: 5000 });
    try { sessionStorage.setItem(unavailableReportStorageKey(productId), 'true'); } catch (_) {}
    if (button) button.textContent = langText('تم إبلاغ مدير المخزون', 'Inventory manager notified');
    showToast(langText('تم إرسال بلاغك إلى مدير المخزون', 'Your report was sent to the inventory manager'), { kind: 'success' });
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = langText('إبلاغ مدير المخزون', 'Notify inventory manager');
    }
    showToast(friendlyError(error, 'تعذر إرسال البلاغ الآن', 'Unable to send the report now'), { kind: 'warning' });
  }
}

function removeFromCart(key) {
  if (!AppState.cart[key]) return;
  AppState.cart[key].qty -= 1;
  if (AppState.cart[key].qty <= 0) delete AppState.cart[key];
  persist();
  renderCartSummary();
  notifyCartUpdated();
}

function deleteFromCart(key) {
  delete AppState.cart[key];
  persist();
  renderCartSummary();
  notifyCartUpdated();
}

function ensureCartCheckoutControls() {
  $$('[data-cart-drawer]').forEach(drawer => {
    if (drawer.querySelector('[data-cart-checkout-panel]')) return;
    const panel = document.createElement('div');
    panel.className = 'cart-checkout-panel';
    panel.dataset.cartCheckoutPanel = '';
    panel.innerHTML = `
      <div class="summary-item">
        <label class="label" data-ar="نوع الطلب" data-en="Order type">${langText('نوع الطلب', 'Order type')}</label>
        <select class="select" data-order-select>
          <option value="" data-ar="اختر نوع الطلب" data-en="Choose order type">${langText('اختر نوع الطلب', 'Choose order type')}</option>
          <option value="ordinary" data-ar="طلب عادي" data-en="Ordinary order">${langText('طلب عادي', 'Ordinary order')}</option>
          <option value="delivery" data-ar="طلب توصيل" data-en="Delivery order">${langText('طلب توصيل', 'Delivery order')}</option>
          <option value="reservation" data-ar="حجز طاولة" data-en="Table reservation">${langText('حجز طاولة', 'Table reservation')}</option>
        </select>
      </div>
      <div class="summary-item order-notes-panel">
        <label class="label" data-ar="ملاحظة على الطلب" data-en="Order note">${langText('ملاحظة على الطلب', 'Order note')}</label>
        <textarea class="textarea" rows="3" maxlength="500" data-order-notes placeholder="${langText('مثال: بدون مخلل، زيادة صوص', 'Example: no pickles, extra sauce')}">${esc(AppState.orderNotes || '')}</textarea>
        <small class="muted">${langText('ستصل الملاحظة للمطبخ مع الطلب.', 'This note will be sent to the kitchen with your order.')}</small>
      </div>
      <div class="hero-actions" style="margin-top:12px;">
        <button class="btn btn-primary" type="button" data-cart-checkout>${langText('إكمال الطلب', 'Checkout')}</button>
        <a class="btn btn-secondary" href="menu.html" data-ar="متابعة الاختيار" data-en="Continue browsing">${langText('متابعة الاختيار', 'Continue browsing')}</a>
      </div>`;
    drawer.appendChild(panel);
  });
}

function renderCartSummary() {
  ensureCartCheckoutControls();
  $$('[data-cart-count]').forEach(el => el.textContent = cartCount());
  $$('[data-cart-total]').forEach(el => el.textContent = formatCurrency(cartTotal()));
  $$('[data-order-select]').forEach(el => { el.value = AppState.orderType || ''; });
  $$('[data-order-notes]').forEach(el => {
    if (el.value !== (AppState.orderNotes || '')) el.value = AppState.orderNotes || '';
  });
  $$('[data-cart-list]').forEach(list => {
    const items = getCartItems();
    if (!items.length) {
      list.innerHTML = `<div class="summary-item muted">${langText('السلة فارغة حالياً', 'Cart is currently empty')}</div>`;
      return;
    }
    list.innerHTML = items.map(item => `
      <div class="cart-item ${item.available === false ? 'is-unavailable' : ''}">
        <div class="row-between"><strong>${esc(catalogItemName(item))}</strong><button class="close-btn" data-remove-item="${esc(item.key)}">×</button></div>
        <div class="row-between muted"><span>${item.qty} × ${formatCurrency(item.price)}</span><span>${formatCurrency(item.qty * item.price)}</span></div>
        ${item.available === false ? `<strong class="cart-item-unavailable">${langText('غير متوفر الآن — أزله لمتابعة الطلب', 'Currently unavailable — remove it to continue')}</strong>` : ''}
        ${item.specialNote ? `<p class="cart-item-note">${esc(item.specialNote)}</p>` : ''}
      </div>`).join('');
    $$('[data-remove-item]', list).forEach(btn => btn.onclick = () => deleteFromCart(btn.dataset.removeItem));
  });
  syncRestaurantOrderAvailability();
}

function syncRestaurantOrderAvailability() {
  const unavailableItems = getCartItems().filter(item => item.available === false);
  const closed = !restaurantIsOpen();
  $$('[data-cart-checkout], [data-continue-order]').forEach(button => {
    button.disabled = closed || unavailableItems.length > 0;
    button.title = closed
      ? langText('المطعم مغلق الآن', 'The restaurant is currently closed')
      : unavailableItems.length
        ? langText('أزل العناصر غير المتوفرة للمتابعة', 'Remove unavailable items to continue')
        : '';
  });
}

function proceedWithCurrentOrder() {
  if (!cartCount()) return showToast(langText('أضف منتجات أولاً', 'Please add items first'), { kind: 'warning' });
  if (!requireCustomerLogin()) return;
  if (!restaurantIsOpen()) return showToast(langText('المطعم مغلق الآن، لا يمكن إنشاء طلب جديد حالياً', 'The restaurant is closed now; new orders are not available'), { kind: 'warning' });
  if (getCartItems().some(item => item.available === false)) return showToast(langText('تحتوي السلة على وجبة غير متوفرة، أزلها لمتابعة الطلب', 'Your cart contains an unavailable item; remove it to continue'), { kind: 'warning' });
  if (!AppState.orderType) return showToast(langText('اختر نوع الطلب أولاً', 'Choose an order type first'), { kind: 'warning' });
  if (AppState.orderType === 'ordinary') location.href = 'payment.html?order=ordinary';
  if (AppState.orderType === 'delivery') location.href = 'delivery.html';
  if (AppState.orderType === 'reservation') location.href = 'reservation.html';
}
