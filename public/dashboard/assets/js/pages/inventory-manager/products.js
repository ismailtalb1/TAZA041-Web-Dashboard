'use strict';

// ══════════════════════════════════════════
// [2] Products
// ══════════════════════════════════════════
async function loadProducts() {
  const cat    = document.getElementById('prod-cat-filter')?.value    ?? '';
  const stock  = document.getElementById('prod-stock-filter')?.value  ?? '';
  const grid   = document.getElementById('products-grid');
  const isAr   = TAZA.Lang.current === 'ar';

  try {
    let endpoint = TAZA.API.PRODUCTS.LIST;
    if (stock === 'low')   endpoint = TAZA.API.PRODUCTS.LOW_STOCK;
    if (stock === 'empty') endpoint = TAZA.API.PRODUCTS.OUT_OF_STOCK;

    const params = {};
    if (cat && stock === '') params.category = cat;

    const res  = await TAZA.Http.get(endpoint, params);
    _products  = res?.data?.products ?? [];
    renderProductsGrid(_products);
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function filterProductsLocally() {
  const search   = document.getElementById('prod-search')?.value.toLowerCase() ?? '';
  const filtered = search
    ? _products.filter(p => p.name?.toLowerCase().includes(search) ||
                             p.description?.toLowerCase().includes(search))
    : _products;
  renderProductsGrid(filtered);
}

function renderProductsGrid(products) {
  const grid = document.getElementById('products-grid');
  const isAr = TAZA.Lang.current === 'ar';

  if (!products.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🍽️</div>
      <div class="empty-title">${isAr?'لا توجد منتجات':'No products found'}</div>
      <div class="empty-desc">${isAr?'أضف منتجاً جديداً لتبدأ':'Add a new product to get started'}</div>
    </div>`;
    return;
  }

  const catLabels = { meal:isAr?'وجبة':'Meal', sandwich:isAr?'سندويش':'Sandwich', drink:isAr?'مشروب':'Drink' };
  const catIcons  = { meal:'🍽️', sandwich:'🥙', drink:'🥤' };

  grid.innerHTML = products.map(p => {
    const stockClass = p.stock_quantity === 0 ? 'stock-empty'
                     : p.stock_quantity <= 10  ? 'stock-low'
                     : 'stock-ok';
    const stockIcon  = p.stock_quantity === 0 ? '🔴' : p.stock_quantity <= 10 ? '🟡' : '🟢';

    return `
      <div class="product-card ${p.is_active ? '' : 'inactive'}">
        <div class="product-img-wrap" data-action="upload-img" data-id="${p.id}">
          ${p.image_url
            ? `<img src="${TAZA.Media.url(p.image_url)}" alt="${p.name}"
                    onerror="this.style.display='none';this.parentElement.querySelector('.product-img-placeholder').style.display='block'">`
            : ''
          }
          <span class="product-img-placeholder" style="${p.image_url?'display:none':''}">
            ${catIcons[p.category] ?? '🍽️'}
          </span>
          <div class="product-img-overlay">
            <i class="fa-solid fa-camera"></i>
            <span>${isAr?'تغيير الصورة':'Change Image'}</span>
          </div>
          ${!p.is_active ? `
            <div style="position:absolute;top:8px;right:8px">
              <span class="badge badge-danger" style="font-size:.65rem">${isAr?'معطّل':'Inactive'}</span>
            </div>` : ''
          }
        </div>

        <div class="product-card-body">
          <div>
            <span class="badge badge-info" style="font-size:.62rem;margin-bottom:4px">
              ${catIcons[p.category] ?? ''} ${catLabels[p.category] ?? p.category}
            </span>
            <div class="product-name">${escapeHtml(p.name)}</div>
            ${p.description ? `<div class="product-desc">${escapeHtml(p.description)}</div>` : ''}
          </div>

          <div class="product-meta">
            <div>
              <div class="product-price">${TAZA.Utils.formatMoney(p.price)}</div>
              ${p.loyalty_price
                ? `<div class="product-loyalty">🏆 ${p.loyalty_price} ${isAr?'نقطة':'pts'}</div>`
                : ''}
            </div>
            <div class="stock-indicator ${stockClass}">
              ${stockIcon} ${p.stock_quantity}
              <span style="font-weight:400;color:var(--text-muted)">${isAr?'قطعة':'units'}</span>
            </div>
          </div>

          <!-- Progress bar للمخزون -->
          <div class="progress" style="height:4px">
            <div class="progress-bar ${p.stock_quantity===0?'danger':p.stock_quantity<=10?'warning':''}"
                 style="width:${Math.min(100,(p.stock_quantity/100)*100)}%"></div>
          </div>
        </div>

        <div class="product-card-footer">
          <button class="btn btn-outline btn-sm" style="flex:1"
                  data-action="edit-product" data-id="${p.id}">
            <i class="fa-solid fa-pen"></i> ${isAr?'تعديل':'Edit'}
          </button>
          <button class="btn btn-ghost btn-sm"
                  data-action="adjust-stock" data-id="${p.id}"
                  data-name="${p.name}" data-stock="${p.stock_quantity}"
                  title="${isAr?'تعديل المخزون':'Adjust Stock'}">
            <i class="fa-solid fa-boxes-stacked"></i>
          </button>
          <button class="btn btn-ghost btn-sm"
                  data-action="toggle-product" data-id="${p.id}"
                  title="${p.is_active ? (isAr?'تعطيل':'Disable') : (isAr?'تفعيل':'Enable')}">
            <i class="fa-solid ${p.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
          </button>
          <button class="btn btn-danger btn-sm"
                  data-action="delete-product" data-id="${p.id}" data-name="${p.name}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ── Handle Product Actions ─────────────────────
async function handleProductAction(e) {
  const btn    = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = parseInt(btn.dataset.id);
  const isAr   = TAZA.Lang.current === 'ar';

  if (action === 'edit-product')   openEditProductModal(id);
  if (action === 'adjust-stock')   openStockModal(id, btn.dataset.name, parseInt(btn.dataset.stock));
  if (action === 'toggle-product') toggleProduct(id);
  if (action === 'upload-img')     triggerImageUpload(id);
  if (action === 'delete-product') {
    TAZA.Confirm.show(
      `${isAr?'حذف منتج':'Delete product'} "${btn.dataset.name}"?`,
      async () => {
        try {
          await TAZA.Http.delete(TAZA.API.PRODUCTS.DELETE(id));
          TAZA.Toast.success(isAr?'تم حذف المنتج':'Product deleted');
          _products = [];
          loadProducts();
        } catch(err) { TAZA.Toast.apiError(err); }
      },
      { danger: true }
    );
  }
}

// ── Product Modal ─────────────────────────────
function openAddProductModal() {
  document.getElementById('product-modal-id').value         = '';
  document.getElementById('product-name').value             = '';
  document.getElementById('product-category').value         = '';
  document.getElementById('product-price').value            = '';
  document.getElementById('product-stock').value            = '';
  document.getElementById('product-loyalty-price').value    = '';
  document.getElementById('product-description').value      = '';
  document.getElementById('product-is-active').value        = '1';
  resetProductImageEditor();
  const isAr = TAZA.Lang.current === 'ar';
  document.getElementById('product-modal-title').textContent = isAr ? 'إضافة وجبة جديدة' : 'Add a new meal';
  openModal('modal-product');
  updateProductEditorState(false);
  requestAnimationFrame(() => document.getElementById('product-name')?.focus());
}

function openEditProductModal(id) {
  const prod = _products.find(p => p.id === id);
  if (!prod) return;
  const isAr = TAZA.Lang.current === 'ar';

  document.getElementById('product-modal-id').value          = prod.id;
  document.getElementById('product-name').value              = prod.name             ?? '';
  document.getElementById('product-category').value          = prod.category         ?? '';
  document.getElementById('product-price').value             = prod.price            ?? '';
  document.getElementById('product-stock').value             = prod.stock_quantity   ?? '';
  document.getElementById('product-loyalty-price').value     = prod.loyalty_price    ?? '';
  document.getElementById('product-description').value       = prod.description      ?? '';
  document.getElementById('product-is-active').value         = prod.is_active ? '1' : '0';
  resetProductImageEditor(prod.image_url || prod.image_path || '');
  document.getElementById('product-modal-title').textContent  = isAr ? 'تعديل بيانات الوجبة' : 'Edit meal details';
  openModal('modal-product');
  updateProductEditorState(false);
  requestAnimationFrame(() => document.getElementById('product-name')?.focus());
}

function resetProductImageEditor(imageUrl = '') {
  const input       = document.getElementById('product-image-input');
  const img         = document.getElementById('product-img-preview-el');
  const placeholder = document.getElementById('product-image-placeholder');
  const state       = document.getElementById('product-image-state');
  const isAr        = TAZA.Lang.current === 'ar';
  if (input) input.value = '';
  if (!img || !placeholder || !state) return;

  if (imageUrl) {
    img.src = imageUrl;
    img.hidden = false;
    placeholder.hidden = true;
    state.textContent = isAr ? 'الصورة الحالية' : 'Current image';
    state.classList.add('has-image');
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    placeholder.hidden = false;
    state.textContent = isAr ? 'لا توجد صورة' : 'No image';
    state.classList.remove('has-image');
  }
  updateProductEditorState(false);
}

function previewProductImage(e) {
  const file    = e.target.files?.[0];
  const img     = document.getElementById('product-img-preview-el');
  const placeholder = document.getElementById('product-image-placeholder');
  const state   = document.getElementById('product-image-state');
  const isAr    = TAZA.Lang.current === 'ar';
  if (!file || !img || !placeholder || !state) return;
  if (!TAZA.Utils.isImageFile(file) || file.size > 5 * 1024 * 1024) {
    e.target.value = '';
    TAZA.Toast.warning(isAr
      ? 'اختر صورة بصيغة JPG أو PNG أو WebP وبحجم لا يتجاوز 5 MB'
      : 'Choose a JPG, PNG, or WebP image up to 5 MB');
    return;
  }
  TAZA.Utils.previewImage(file, img);
  img.hidden = false;
  placeholder.hidden = true;
  state.textContent = isAr ? 'صورة جديدة جاهزة للحفظ' : 'New image ready to save';
  state.classList.add('has-image');
  updateProductEditorState(false);
}

function updateProductEditorState(showErrors = false) {
  const isAr       = TAZA.Lang.current === 'ar';
  const nameEl     = document.getElementById('product-name');
  const categoryEl = document.getElementById('product-category');
  const priceEl    = document.getElementById('product-price');
  const stockEl    = document.getElementById('product-stock');
  const loyaltyEl  = document.getElementById('product-loyalty-price');
  const descEl     = document.getElementById('product-description');
  const activeEl   = document.getElementById('product-is-active');
  if (!nameEl || !categoryEl || !priceEl || !stockEl || !loyaltyEl || !descEl || !activeEl) {
    return { ready: false, firstInvalid: null };
  }

  const name        = nameEl.value.trim();
  const category    = categoryEl.value;
  const priceRaw    = priceEl.value.trim();
  const stockRaw    = stockEl.value.trim();
  const loyaltyRaw  = loyaltyEl.value.trim();
  const price       = Number(priceRaw);
  const stock       = Number(stockRaw);
  const loyalty     = Number(loyaltyRaw);
  const validity = {
    name: name.length > 0,
    category: category.length > 0,
    price: priceRaw !== '' && Number.isFinite(price) && price >= 0,
    stock: stockRaw !== '' && Number.isInteger(stock) && stock >= 0,
    loyalty: loyaltyRaw === '' || (Number.isInteger(loyalty) && loyalty >= 1),
  };
  const fieldState = new Map([
    [nameEl, validity.name],
    [categoryEl, validity.category],
    [priceEl, validity.price],
    [stockEl, validity.stock],
    [loyaltyEl, validity.loyalty],
  ]);
  fieldState.forEach((valid, field) => {
    const hasValue = field.value.trim() !== '';
    field.classList.toggle('is-invalid', showErrors && !valid);
    field.classList.toggle('is-valid', valid && hasValue);
    field.setAttribute('aria-invalid', showErrors && !valid ? 'true' : 'false');
  });

  const categoryLabel = category
    ? categoryEl.options[categoryEl.selectedIndex]?.textContent?.trim()
    : (isAr ? 'الفئة' : 'Category');
  document.getElementById('product-preview-name').textContent = name || (isAr ? 'اسم الوجبة' : 'Meal name');
  document.getElementById('product-preview-category').textContent = categoryLabel;
  document.getElementById('product-preview-description').textContent = descEl.value.trim()
    || (isAr ? 'أضف وصفاً مختصراً ليظهر هنا' : 'Add a short description to show here');
  document.getElementById('product-preview-price').innerHTML = `${validity.price ? price.toLocaleString(isAr ? 'ar-SY' : 'en-US') : '0'} <small>${isAr ? 'ل.س' : 'SYP'}</small>`;
  document.getElementById('product-preview-stock').textContent = isAr
    ? `المخزون: ${validity.stock ? stock.toLocaleString('ar-SY') : '٠'}`
    : `Stock: ${validity.stock ? stock.toLocaleString('en-US') : '0'}`;

  const previewStatus = document.getElementById('product-preview-status');
  const isActive = activeEl.value === '1';
  previewStatus.textContent = isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'مخفي' : 'Hidden');
  previewStatus.classList.toggle('is-inactive', !isActive);

  const hasIdentity = validity.name && validity.category;
  const hasCommerce = validity.price && validity.stock && validity.loyalty;
  const hasImage    = document.getElementById('product-image-state')?.classList.contains('has-image');
  document.getElementById('product-check-name')?.classList.toggle('is-complete', hasIdentity);
  document.getElementById('product-check-price')?.classList.toggle('is-complete', hasCommerce);
  document.getElementById('product-check-image')?.classList.toggle('is-complete', !!hasImage);

  const ready    = hasIdentity && hasCommerce;
  const progress = document.getElementById('product-editor-progress');
  progress?.classList.toggle('is-ready', ready);
  const progressText = progress?.querySelector('span');
  if (progressText) progressText.textContent = ready
    ? (isAr ? 'البيانات جاهزة للحفظ' : 'Ready to save')
    : (isAr ? 'أكمل البيانات المطلوبة' : 'Complete required details');
  const progressIcon = progress?.querySelector('i');
  if (progressIcon) progressIcon.className = ready
    ? 'fa-solid fa-circle-check'
    : 'fa-regular fa-circle-check';

  const formStatus = document.getElementById('product-form-status');
  if (formStatus) formStatus.textContent = ready
    ? (isAr ? 'جاهز للحفظ — ويمكنك الضغط على Ctrl + Enter' : 'Ready — press Ctrl + Enter to save')
    : (isAr ? 'لن يظهر المنتج للزبائن حتى يتم حفظه' : 'The product will not appear until it is saved');

  return {
    ready,
    firstInvalid: [...fieldState.entries()].find(([,valid]) => !valid)?.[0] ?? null,
  };
}

async function saveProduct() {
  const id      = document.getElementById('product-modal-id').value;
  const isEdit  = !!id;
  const isAr    = TAZA.Lang.current === 'ar';
  const btn     = document.getElementById('save-product-btn');

  const payload = {
    name:           document.getElementById('product-name').value.trim(),
    category:       document.getElementById('product-category').value,
    price:          parseFloat(document.getElementById('product-price').value),
    stock_quantity: parseInt(document.getElementById('product-stock').value),
    description:    document.getElementById('product-description').value.trim() || null,
    is_active:      document.getElementById('product-is-active').value === '1',
  };
  const loyaltyVal = document.getElementById('product-loyalty-price').value;
  if (loyaltyVal) payload.loyalty_price = parseInt(loyaltyVal);

  const validation = updateProductEditorState(true);
  if (!validation.ready) {
    TAZA.Toast.warning(isAr
      ? 'راجع الحقول المحددة وتأكد من السعر والكمية قبل الحفظ'
      : 'Review the highlighted fields and check price and stock');
    validation.firstInvalid?.focus();
    return;
  }

  TAZA.Utils.disableBtn(btn);
  try {
    let savedId = id;
    if (isEdit) {
      await TAZA.Http.put(TAZA.API.PRODUCTS.UPDATE(id), payload);
      TAZA.Toast.success(isAr ? 'تم تحديث المنتج' : 'Product updated');
    } else {
      const res = await TAZA.Http.post(TAZA.API.PRODUCTS.STORE, payload);
      savedId   = res?.data?.product?.id;
      TAZA.Toast.success(isAr ? 'تم إضافة المنتج' : 'Product added');
    }

    // رفع الصورة منفصل حتى لا يؤدي فشلها إلى تكرار إنشاء المنتج عند المحاولة مجدداً.
    const imageFile = document.getElementById('product-image-input')?.files?.[0];
    if (imageFile && savedId) {
      const fd = new FormData();
      fd.append('image', imageFile);
      try {
        await TAZA.Http.upload(TAZA.API.PRODUCTS.UPLOAD_IMAGE(savedId), fd);
      } catch (imageError) {
        TAZA.Toast.warning(isAr
          ? 'تم حفظ المنتج، لكن تعذّر رفع الصورة. يمكنك إضافتها من بطاقة المنتج.'
          : 'Product saved, but the image could not be uploaded. You can add it from the product card.');
      }
    }

    closeModal('modal-product');
    _products = [];
    loadProducts();
    loadOverview();
  } catch(e) {
    TAZA.Toast.apiError(e);
  } finally {
    TAZA.Utils.enableBtn(btn);
  }
}

async function toggleProduct(id) {
  const isAr = TAZA.Lang.current === 'ar';
  try {
    const res  = await TAZA.Http.patch(TAZA.API.PRODUCTS.TOGGLE(id));
    const active = res?.data?.is_active;
    TAZA.Toast.success(active
      ? (isAr ? 'تم تفعيل المنتج' : 'Product enabled')
      : (isAr ? 'تم تعطيل المنتج' : 'Product disabled'));
    _products = [];
    loadProducts();
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

// ── Product Image Upload via card click ────────
function triggerImageUpload(productId) {
  const fileInput = document.createElement('input');
  fileInput.type  = 'file';
  fileInput.accept= 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.click();
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    document.body.removeChild(fileInput);
    if (!file) return;
    if (!TAZA.Utils.isImageFile(file)) {
      TAZA.Toast.warning(TAZA.Lang.current === 'ar' ? 'صيغة الصورة غير مقبولة' : 'Invalid image format');
      return;
    }
    const fd = new FormData();
    fd.append('image', file);
    try {
      await TAZA.Http.upload(TAZA.API.PRODUCTS.UPLOAD_IMAGE(productId), fd);
      TAZA.Toast.success(TAZA.Lang.current === 'ar' ? 'تم تحديث صورة المنتج' : 'Product image updated');
      _products = [];
      loadProducts();
    } catch(e) { TAZA.Toast.apiError(e); }
  });
}

// ── Stock Modal ────────────────────────────────
function openStockModal(id, name, currentStock) {
  document.getElementById('stock-product-id').value = id;
  document.getElementById('stock-product-name').textContent = name;
  document.getElementById('stock-current').textContent      = currentStock;
  document.getElementById('stock-qty').value  = '';
  _stockOperation = 'set';
  document.querySelectorAll('[data-op]').forEach(b =>
    b.classList.toggle('active', b.dataset.op === 'set'));
  openModal('modal-stock');
}

async function saveStock() {
  const id  = parseInt(document.getElementById('stock-product-id').value);
  const qty = parseInt(document.getElementById('stock-qty').value);
  const isAr = TAZA.Lang.current === 'ar';

  if (isNaN(qty) || qty < 0) {
    TAZA.Toast.warning(isAr ? 'أدخل كمية صحيحة' : 'Enter a valid quantity');
    return;
  }

  const btn = document.getElementById('save-stock-btn');
  TAZA.Utils.disableBtn(btn);
  try {
    await TAZA.Http.patch(TAZA.API.PRODUCTS.UPDATE_STOCK(id), {
      stock_quantity: qty,
      operation:      _stockOperation,
    });
    TAZA.Toast.success(isAr ? 'تم تحديث المخزون' : 'Stock updated');
    closeModal('modal-stock');
    _products = [];
    loadProducts();
    loadOverview();
    loadNotificationsPage();
    TAZA.NotifBadge.refresh();
  } catch(e) {
    TAZA.Toast.apiError(e);
  } finally {
    TAZA.Utils.enableBtn(btn);
  }
}
