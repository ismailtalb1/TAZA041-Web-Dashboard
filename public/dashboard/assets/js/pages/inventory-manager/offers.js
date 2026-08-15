'use strict';

// ══════════════════════════════════════════
// [3] Offers
// ══════════════════════════════════════════
async function loadOffers(filterStatus = '') {
  const isAr  = TAZA.Lang.current === 'ar';
  try {
    let endpoint = TAZA.API.OFFERS.LIST;
    if (filterStatus === 'active')  endpoint = TAZA.API.OFFERS.ACTIVE;
    if (filterStatus === 'expired') endpoint = TAZA.API.OFFERS.EXPIRED;

    const res  = await TAZA.Http.get(endpoint);
    _offers    = res?.data?.offers ?? [];
    renderOffersGrid(_offers);
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function renderOffersGrid(offers) {
  const grid = document.getElementById('offers-grid');
  const isAr = TAZA.Lang.current === 'ar';

  if (!offers.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🏷️</div>
      <div class="empty-title">${isAr?'لا توجد عروض':'No offers found'}</div>
    </div>`;
    return;
  }

  grid.innerHTML = offers.map(o => {
    const products  = o.products ?? [];
    const isActive  = o.is_currently_active ?? o.is_active;

    return `
      <div class="offer-card ${isActive ? '' : 'inactive'}">
        <div class="offer-img-wrap" data-action="upload-offer-img" data-id="${o.id}">
          ${o.image_url
            ? `<img src="${TAZA.Media.url(o.image_url)}" alt="${o.name}">`
            : `<div style="text-align:center;color:var(--text-muted)">
                <div style="font-size:2rem">🏷️</div>
                <div style="font-size:.72rem;margin-top:4px">${isAr?'اضغط لإضافة صورة':'Click to add image'}</div>
               </div>`
          }
          ${!isActive ? `
            <div style="position:absolute;top:8px;right:8px">
              <span class="badge badge-muted">${isAr?'غير نشط':'Inactive'}</span>
            </div>` : `
            <div style="position:absolute;top:8px;right:8px">
              <span class="badge badge-success">${isAr?'نشط':'Active'}</span>
            </div>`
          }
        </div>

        <div class="offer-card-body">
          <div class="offer-name">${escapeHtml(o.name)}</div>
          ${o.description ? `<div style="font-size:.75rem;color:var(--text-muted);margin-bottom:4px">${escapeHtml(o.description)}</div>` : ''}

          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:1rem;font-weight:800;color:var(--primary)">${TAZA.Utils.formatMoney(o.offer_price)}</span>
            ${o.original_price && o.original_price > o.offer_price
              ? `<span style="font-size:.75rem;text-decoration:line-through;color:var(--text-muted)">${TAZA.Utils.formatMoney(o.original_price)}</span>
                 <span class="badge badge-success" style="font-size:.62rem">
                   ${Math.round(100 - (o.offer_price/o.original_price)*100)}% ${isAr?'خصم':'OFF'}
                 </span>`
              : ''
            }
          </div>

          ${o.loyalty_price
            ? `<div style="font-size:.72rem;color:var(--accent);margin-bottom:6px">🏆 ${o.loyalty_price} ${isAr?'نقطة':'pts'}</div>`
            : ''
          }

          <div class="offer-products-chips">
            ${products.slice(0, 4).map(p =>
              `<span class="offer-chip">${p.name}</span>`
            ).join('')}
            ${products.length > 4
              ? `<span class="offer-chip">+${products.length-4}</span>`
              : ''
            }
          </div>

          ${o.end_date
            ? `<div style="font-size:.7rem;color:var(--text-muted)">
                <i class="fa-regular fa-clock"></i>
                ${isAr?'ينتهي:':'Ends:'} ${TAZA.Utils.formatDate(o.end_date)}
               </div>`
            : ''
          }

          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" style="flex:1"
                    data-action="edit-offer" data-id="${o.id}">
              <i class="fa-solid fa-pen"></i> ${isAr?'تعديل':'Edit'}
            </button>
            <button class="btn btn-ghost btn-sm"
                    data-action="toggle-offer" data-id="${o.id}"
                    title="${isActive?(isAr?'إيقاف':'Stop'):(isAr?'تفعيل':'Activate')}">
              <i class="fa-solid ${isActive?'fa-pause':'fa-play'}"></i>
            </button>
            <button class="btn btn-ghost btn-sm"
                    data-action="broadcast-offer" data-id="${o.id}"
                    title="${isAr?'إشعار جماعي':'Broadcast'}"
                    ${!isActive ? 'disabled' : ''}>
              <i class="fa-solid fa-bullhorn"></i>
            </button>
            <button class="btn btn-danger btn-sm"
                    data-action="delete-offer" data-id="${o.id}" data-name="${o.name}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Handle Offer Actions ───────────────────────
async function handleOfferAction(e) {
  const btn    = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = parseInt(btn.dataset.id);
  const isAr   = TAZA.Lang.current === 'ar';

  if (action === 'edit-offer')    openEditOfferModal(id);
  if (action === 'upload-offer-img') triggerOfferImageUpload(id);
  if (action === 'toggle-offer') {
    try {
      const res = await TAZA.Http.patch(TAZA.API.OFFERS.TOGGLE(id));
      TAZA.Toast.success(res?.data?.is_active
        ? (isAr?'تم تفعيل العرض':'Offer activated')
        : (isAr?'تم إيقاف العرض':'Offer stopped'));
      _offers = [];
      loadOffers();
    } catch(err) { TAZA.Toast.apiError(err); }
  }
  if (action === 'broadcast-offer') {
    TAZA.Confirm.show(
      isAr ? 'إرسال إشعار بهذا العرض لكل الزبائن؟' : 'Broadcast this offer to all customers?',
      async () => {
        try {
          const res = await TAZA.Http.post(TAZA.API.OFFERS.BROADCAST(id));
          TAZA.Toast.success(`${isAr?'تم إرسال الإشعار لـ':'Sent to'} ${res?.data?.sent_to ?? 0} ${isAr?'زبون':'customers'}`);
        } catch(err) { TAZA.Toast.apiError(err); }
      }
    );
  }
  if (action === 'delete-offer') {
    TAZA.Confirm.show(
      `${isAr?'حذف عرض':'Delete offer'} "${btn.dataset.name}"?`,
      async () => {
        try {
          await TAZA.Http.delete(TAZA.API.OFFERS.DELETE(id));
          TAZA.Toast.success(isAr?'تم حذف العرض':'Offer deleted');
          _offers = [];
          loadOffers();
        } catch(err) { TAZA.Toast.apiError(err); }
      },
      { danger: true }
    );
  }
}

// ── Offer Modal ────────────────────────────────
function openAddOfferModal() {
  document.getElementById('offer-modal-id').value        = '';
  document.getElementById('offer-name').value            = '';
  document.getElementById('offer-category').value        = 'mixed';
  document.getElementById('offer-price').value           = '';
  document.getElementById('offer-loyalty-price').value   = '';
  document.getElementById('offer-description').value     = '';
  document.getElementById('offer-start-date').value      = '';
  document.getElementById('offer-end-date').value        = '';
  _offerProducts = [];
  resetOfferImageEditor();
  renderOfferProductsList();
  const isAr = TAZA.Lang.current === 'ar';
  document.getElementById('offer-modal-title').textContent = isAr ? 'إضافة عرض جديد' : 'Add a new offer';
  populateProductsSelect();
  openModal('modal-offer');
  updateOfferEditorState(false);
  requestAnimationFrame(() => document.getElementById('offer-name')?.focus());
}

function openEditOfferModal(id) {
  const offer = _offers.find(o => o.id === id);
  if (!offer) return;
  const isAr  = TAZA.Lang.current === 'ar';

  document.getElementById('offer-modal-id').value          = offer.id;
  document.getElementById('offer-name').value              = offer.name          ?? '';
  document.getElementById('offer-category').value          = offer.category      ?? 'mixed';
  document.getElementById('offer-price').value             = offer.offer_price   ?? '';
  document.getElementById('offer-loyalty-price').value     = offer.loyalty_price ?? '';
  document.getElementById('offer-description').value       = offer.description   ?? '';
  document.getElementById('offer-start-date').value        = offer.start_date?.slice(0,16) ?? '';
  document.getElementById('offer-end-date').value          = offer.end_date?.slice(0,16)   ?? '';
  document.getElementById('offer-modal-title').textContent  = isAr ? 'تعديل بيانات العرض' : 'Edit offer details';

  _offerProducts = (offer.products ?? []).map(p => ({
    id: p.id,
    name: p.name,
    qty: Number(p.pivot?.quantity ?? p.quantity ?? 1) || 1,
    price: Number(p.price ?? 0),
  }));
  resetOfferImageEditor(offer.image_url || offer.image_path || '');
  renderOfferProductsList();
  populateProductsSelect();
  openModal('modal-offer');
  updateOfferEditorState(false);
  requestAnimationFrame(() => document.getElementById('offer-name')?.focus());
}

function resetOfferImageEditor(imageUrl = '') {
  const input       = document.getElementById('offer-image-input');
  const img         = document.getElementById('offer-img-preview-el');
  const placeholder = document.getElementById('offer-image-placeholder');
  const state       = document.getElementById('offer-image-state');
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
}

function previewOfferImage(e) {
  const file        = e.target.files?.[0];
  const img         = document.getElementById('offer-img-preview-el');
  const placeholder = document.getElementById('offer-image-placeholder');
  const state       = document.getElementById('offer-image-state');
  const isAr        = TAZA.Lang.current === 'ar';
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
  updateOfferEditorState(false);
}

async function populateProductsSelect() {
  if (!_products.length) {
    try {
      const res = await TAZA.Http.get(TAZA.API.PRODUCTS.LIST, { is_active: 1 });
      _products = res?.data?.products ?? [];
    } catch {}
  }
  const sel  = document.getElementById('offer-product-select');
  const isAr = TAZA.Lang.current === 'ar';
  sel.innerHTML = `<option value="">${isAr?'اختر منتجاً...':'Choose a product...'}</option>` +
    _products.map(p => `<option value="${p.id}" data-name="${escapeHtml(p.name)}" data-price="${Number(p.price) || 0}">${escapeHtml(p.name)} — ${TAZA.Utils.formatMoney(p.price)}</option>`)
             .join('');
}

function addProductToOfferList() {
  const sel     = document.getElementById('offer-product-select');
  const qtyEl   = document.getElementById('offer-product-qty');
  const pid     = parseInt(sel.value);
  const pname   = sel.options[sel.selectedIndex]?.dataset.name ?? '';
  const price   = Number(sel.options[sel.selectedIndex]?.dataset.price ?? 0);
  const qty     = parseInt(qtyEl?.value ?? 1);
  const isAr    = TAZA.Lang.current === 'ar';

  if (!pid) { TAZA.Toast.warning(isAr?'اختر منتجاً':'Select a product'); return; }
  if (_offerProducts.find(p => p.id === pid)) {
    TAZA.Toast.warning(isAr?'هذا المنتج مضاف مسبقاً':'Product already added');
    return;
  }

  _offerProducts.push({ id: pid, name: pname, qty: Math.max(1, qty || 1), price });
  renderOfferProductsList();
  sel.value = '';
  if (qtyEl) qtyEl.value = '1';
}

function renderOfferProductsList() {
  const container   = document.getElementById('offer-products-selected');
  const placeholder = document.getElementById('offer-products-placeholder');
  const isAr        = TAZA.Lang.current === 'ar';
  if (!container) return;

  if (!_offerProducts.length) {
    container.innerHTML = '';
    if (placeholder) {
      placeholder.textContent = isAr ? 'لم يُضَف منتج بعد' : 'No products added yet';
      container.appendChild(placeholder);
    }
    updateOfferEditorState(false);
    return;
  }

  container.innerHTML = _offerProducts.map((p, i) => `
    <div class="offer-product-chip">
      <span>${escapeHtml(p.name)}</span>
      <small>×${Number(p.qty) || 1}</small>
      <button type="button" data-remove-idx="${i}" aria-label="${isAr ? 'إزالة المنتج' : 'Remove product'}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </div>
  `).join('');

  // Remove chip
  container.querySelectorAll('[data-remove-idx]').forEach(el => {
    el.addEventListener('click', () => {
      _offerProducts.splice(parseInt(el.dataset.removeIdx), 1);
      renderOfferProductsList();
    });
  });
  updateOfferEditorState(false);
}

function updateOfferEditorState(showErrors = false) {
  const isAr       = TAZA.Lang.current === 'ar';
  const nameEl     = document.getElementById('offer-name');
  const categoryEl = document.getElementById('offer-category');
  const priceEl    = document.getElementById('offer-price');
  const loyaltyEl  = document.getElementById('offer-loyalty-price');
  const descEl     = document.getElementById('offer-description');
  const startEl    = document.getElementById('offer-start-date');
  const endEl      = document.getElementById('offer-end-date');
  if (!nameEl || !categoryEl || !priceEl || !loyaltyEl || !descEl || !startEl || !endEl) {
    return { ready: false, firstInvalid: null };
  }

  const name       = nameEl.value.trim();
  const category   = categoryEl.value;
  const priceRaw   = priceEl.value.trim();
  const loyaltyRaw = loyaltyEl.value.trim();
  const startRaw   = startEl.value;
  const endRaw     = endEl.value;
  const price      = Number(priceRaw);
  const loyalty    = Number(loyaltyRaw);
  const start      = startRaw ? new Date(startRaw) : null;
  const end        = endRaw ? new Date(endRaw) : null;
  const scheduleValid = (!start || !end) || end >= start;
  const validity = {
    name: name.length > 0,
    category: category.length > 0,
    price: priceRaw !== '' && Number.isFinite(price) && price >= 0,
    loyalty: loyaltyRaw === '' || (Number.isInteger(loyalty) && loyalty >= 1),
    start: !startRaw || !Number.isNaN(start?.getTime()),
    end: (!endRaw || !Number.isNaN(end?.getTime())) && scheduleValid,
  };
  const fieldState = new Map([
    [nameEl, validity.name],
    [categoryEl, validity.category],
    [priceEl, validity.price],
    [loyaltyEl, validity.loyalty],
    [startEl, validity.start],
    [endEl, validity.end],
  ]);
  fieldState.forEach((valid, field) => {
    const hasValue = field.value.trim() !== '';
    field.classList.toggle('is-invalid', showErrors && !valid);
    field.classList.toggle('is-valid', valid && hasValue);
    field.setAttribute('aria-invalid', showErrors && !valid ? 'true' : 'false');
  });

  const categoryLabel = categoryEl.options[categoryEl.selectedIndex]?.textContent?.trim() || (isAr ? 'الفئة' : 'Category');
  document.getElementById('offer-preview-name').textContent = name || (isAr ? 'اسم العرض' : 'Offer name');
  document.getElementById('offer-preview-category').textContent = categoryLabel;
  document.getElementById('offer-preview-description').textContent = descEl.value.trim()
    || (isAr ? 'أضف وصفاً مختصراً ليظهر هنا' : 'Add a short description to show here');
  document.getElementById('offer-preview-price').innerHTML = `${validity.price ? price.toLocaleString(isAr ? 'ar-SY' : 'en-US') : '0'} <small>${isAr ? 'ل.س' : 'SYP'}</small>`;

  const productsPreview = document.getElementById('offer-preview-products');
  productsPreview.textContent = _offerProducts.length
    ? _offerProducts.slice(0, 3).map(p => `${p.name} ×${p.qty}`).join(' • ') + (_offerProducts.length > 3 ? ` +${_offerProducts.length - 3}` : '')
    : (isAr ? 'لم تُضف منتجات بعد' : 'No products added yet');

  const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  const locale = isAr ? 'ar-SY' : 'en-US';
  let durationText = isAr ? 'متاح دائماً' : 'Always available';
  if (start && end && scheduleValid) durationText = isAr
    ? `من ${start.toLocaleDateString(locale, dateOptions)} إلى ${end.toLocaleDateString(locale, dateOptions)}`
    : `${start.toLocaleDateString(locale, dateOptions)} → ${end.toLocaleDateString(locale, dateOptions)}`;
  else if (start) durationText = `${isAr ? 'يبدأ' : 'Starts'} ${start.toLocaleDateString(locale, dateOptions)}`;
  else if (end) durationText = `${isAr ? 'ينتهي' : 'Ends'} ${end.toLocaleDateString(locale, dateOptions)}`;
  document.getElementById('offer-preview-duration').textContent = durationText;

  const now = new Date();
  const previewStatus = document.getElementById('offer-preview-status');
  const status = start && start > now ? 'upcoming' : end && end < now ? 'expired' : 'available';
  previewStatus.textContent = status === 'upcoming'
    ? (isAr ? 'قريباً' : 'Upcoming')
    : status === 'expired' ? (isAr ? 'منتهي' : 'Expired') : (isAr ? 'متاح' : 'Available');
  previewStatus.classList.toggle('is-upcoming', status === 'upcoming');
  previewStatus.classList.toggle('is-expired', status === 'expired');

  const hasIdentity = validity.name && validity.category;
  const hasCommerce = validity.price && validity.loyalty && validity.start && validity.end;
  document.getElementById('offer-check-name')?.classList.toggle('is-complete', hasIdentity);
  document.getElementById('offer-check-price')?.classList.toggle('is-complete', hasCommerce);
  document.getElementById('offer-check-products')?.classList.toggle('is-complete', _offerProducts.length > 0);

  const ready = hasIdentity && hasCommerce;
  const progress = document.getElementById('offer-editor-progress');
  progress?.classList.toggle('is-ready', ready);
  const progressText = progress?.querySelector('span');
  if (progressText) progressText.textContent = ready
    ? (isAr ? 'البيانات جاهزة للحفظ' : 'Ready to save')
    : (isAr ? 'أكمل البيانات المطلوبة' : 'Complete required details');
  const progressIcon = progress?.querySelector('i');
  if (progressIcon) progressIcon.className = ready ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle-check';
  const formStatus = document.getElementById('offer-form-status');
  if (formStatus) formStatus.textContent = ready
    ? (isAr ? 'جاهز للحفظ — ويمكنك الضغط على Ctrl + Enter' : 'Ready — press Ctrl + Enter to save')
    : (isAr ? 'لن يظهر العرض للزبائن حتى يتم حفظه' : 'The offer will not appear until it is saved');

  return { ready, firstInvalid: [...fieldState.entries()].find(([,valid]) => !valid)?.[0] ?? null };
}

async function saveOffer() {
  const id     = document.getElementById('offer-modal-id').value;
  const isEdit = !!id;
  const isAr   = TAZA.Lang.current === 'ar';
  const btn    = document.getElementById('save-offer-btn');

  const payload = {
    name:        document.getElementById('offer-name').value.trim(),
    category:    document.getElementById('offer-category').value,
    offer_price: parseFloat(document.getElementById('offer-price').value),
    description: document.getElementById('offer-description').value.trim() || null,
    is_active:   true,
  };
  const lp = document.getElementById('offer-loyalty-price').value;
  if (lp) payload.loyalty_price = parseInt(lp);
  const sd = document.getElementById('offer-start-date').value;
  const ed = document.getElementById('offer-end-date').value;
  if (sd) payload.start_date = sd;
  if (ed) payload.end_date   = ed;

  if (_offerProducts.length) {
    payload.products = _offerProducts.map(p => ({ product_id: p.id, quantity: p.qty }));
  }

  const validation = updateOfferEditorState(true);
  if (!validation.ready) {
    TAZA.Toast.warning(isAr
      ? 'راجع الحقول المحددة وتأكد من السعر ومدة العرض قبل الحفظ'
      : 'Review the highlighted fields and check the price and schedule');
    validation.firstInvalid?.focus();
    return;
  }

  TAZA.Utils.disableBtn(btn);
  try {
    let savedId = id;
    if (isEdit) {
      await TAZA.Http.put(TAZA.API.OFFERS.UPDATE(id), payload);
      TAZA.Toast.success(isAr?'تم تحديث العرض':'Offer updated');
    } else {
      const res = await TAZA.Http.post(TAZA.API.OFFERS.STORE, payload);
      savedId   = res?.data?.offer?.id;
      TAZA.Toast.success(isAr?'تم إنشاء العرض':'Offer created');
    }

    // رفع الصورة منفصل حتى لا يؤدي فشلها إلى تكرار إنشاء العرض عند المحاولة مجدداً.
    const imageFile = document.getElementById('offer-image-input')?.files?.[0];
    if (imageFile && savedId) {
      const fd = new FormData();
      fd.append('image', imageFile);
      try {
        await TAZA.Http.upload(TAZA.API.OFFERS.UPLOAD_IMAGE(savedId), fd);
      } catch (imageError) {
        TAZA.Toast.warning(isAr
          ? 'تم حفظ العرض، لكن تعذّر رفع الصورة. يمكنك إضافتها من بطاقة العرض.'
          : 'Offer saved, but the image could not be uploaded. You can add it from the offer card.');
      }
    }
    closeModal('modal-offer');
    _offers = [];
    loadOffers();
  } catch(e) {
    TAZA.Toast.apiError(e);
  } finally {
    TAZA.Utils.enableBtn(btn);
  }
}

function triggerOfferImageUpload(offerId) {
  const fi = document.createElement('input');
  fi.type  = 'file'; fi.accept = 'image/*'; fi.style.display = 'none';
  document.body.appendChild(fi);
  fi.click();
  fi.addEventListener('change', async () => {
    const file = fi.files?.[0];
    document.body.removeChild(fi);
    if (!file || !TAZA.Utils.isImageFile(file)) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      await TAZA.Http.upload(TAZA.API.OFFERS.UPLOAD_IMAGE(offerId), fd);
      TAZA.Toast.success(TAZA.Lang.current === 'ar' ? 'تم تحديث صورة العرض' : 'Offer image updated');
      _offers = [];
      loadOffers();
    } catch(e) { TAZA.Toast.apiError(e); }
  });
}
