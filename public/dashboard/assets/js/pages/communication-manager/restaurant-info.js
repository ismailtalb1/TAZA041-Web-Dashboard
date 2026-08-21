'use strict';

// ═══════════════════════════════════════════
// [2] Restaurant Info
// ═══════════════════════════════════════════
async function loadRestaurantInfo() {
  try {
    if (!Object.keys(_restaurantInfo).length) {
      const res   = await TAZA.Http.get(TAZA.API.COMM.RESTAURANT_SHOW);
      _restaurantInfo = res?.data?.restaurant ?? {};
    }
    populateInfoForm(_restaurantInfo);
    buildHoursGrid(_restaurantInfo.working_hours ?? {});
    initRestaurantLocationMap(_restaurantInfo);
  } catch(e) { TAZA.Toast.apiError(e); }
}

function populateInfoForm(ri) {
  _restaurantFormReady = false;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  setVal('info-name',        ri.name);
  setVal('info-phone',       ri.phone);
  setVal('info-whatsapp',    ri.whatsapp);
  setVal('info-description', ri.description || ri.about_text);
  setVal('info-address',     ri.address);
  setVal('info-email',       ri.email);
  setVal('info-instagram',   ri.instagram);
  setVal('info-facebook',    ri.facebook || ri.facebook_url || ri.social_links?.facebook);
  setVal('info-instagram',   ri.instagram || ri.instagram_url || ri.social_links?.instagram);
  setVal('info-telegram',    ri.telegram_url || ri.social_links?.telegram);
  setVal('info-latitude',    ri.latitude);
  setVal('info-longitude',   ri.longitude);
  const editableWebsiteContent = { ...(ri.website_content ?? {}) };
  if (!editableWebsiteContent.hero_description_ar && ri.about_text) {
    editableWebsiteContent.hero_description_ar = ri.about_text;
  }
  renderWebsiteContentEditors(editableWebsiteContent);

  if (ri.logo_url) {
    const img = document.getElementById('logo-preview-img');
    if (img) { img.src = ri.logo_url; img.style.display = 'block'; }
    const ph  = document.getElementById('logo-placeholder');
    if (ph)  ph.style.display = 'none';
  }
  updateRestaurantEditorPreview();
  setRestaurantSaveState('saved');
  _restaurantFormReady = true;
}

function setRestaurantSaveState(state = 'saved') {
  const elements = document.querySelectorAll('[data-restaurant-save-state]');
  if (!elements.length) return;
  const isAr = TAZA.Lang.current === 'ar';
  const copy = {
    saved:  { icon:'fa-circle-check', ar:'كل التغييرات محفوظة', en:'All changes saved' },
    dirty:  { icon:'fa-circle-exclamation', ar:'توجد تغييرات غير محفوظة', en:'Unsaved changes' },
    saving: { icon:'fa-spinner fa-spin', ar:'جارٍ الحفظ...', en:'Saving...' },
  }[state];
  elements.forEach(el => {
    el.className = `restaurant-save-state is-${state}`;
    const icon = el.querySelector('i');
    const text = el.querySelector('span');
    if (icon) icon.className = `fa-solid ${copy.icon}`;
    if (text) {
      text.textContent = isAr ? copy.ar : copy.en;
      text.dataset.langAr = copy.ar;
      text.dataset.langEn = copy.en;
    }
  });
}

function markRestaurantInfoDirty() {
  if (!_restaurantFormReady) return;
  setRestaurantSaveState('dirty');
}

function updateRestaurantEditorPreview() {
  const value = id => document.getElementById(id)?.value.trim() || '';
  const isAr = TAZA.Lang.current === 'ar';
  const name = value('info-name') || 'TAZA 041';
  const description = value('info-description');
  const phone = value('info-phone');
  const address = value('info-address');
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('restaurant-editor-preview-name', name);
  setText('restaurant-editor-preview-description', description || (isAr ? 'أضف وصفاً موجزاً وواضحاً للمطعم' : 'Add a clear, concise restaurant description'));
  setText('restaurant-editor-preview-phone', phone || '—');
  setText('restaurant-editor-preview-address', address || '—');

  const descriptionCounter = document.getElementById('restaurant-description-count');
  if (descriptionCounter) descriptionCounter.textContent = `${description.length} / 2000`;

  const completenessChecks = [
    name,
    phone,
    description,
    address,
    value('info-email'),
    value('info-whatsapp'),
    value('info-instagram') || value('info-facebook') || value('info-telegram'),
    value('info-latitude') && value('info-longitude'),
  ];
  const completed = completenessChecks.filter(Boolean).length;
  const percentage = Math.round((completed / completenessChecks.length) * 100);
  setText('restaurant-completeness-value', `${percentage}%`);
  const bar = document.getElementById('restaurant-completeness-bar');
  if (bar) bar.style.width = `${percentage}%`;
  const note = document.getElementById('restaurant-completeness-note');
  if (note) {
    const complete = percentage === 100;
    note.textContent = complete
      ? (isAr ? 'ممتاز، جميع المعلومات الأساسية مكتملة.' : 'Excellent, all essential information is complete.')
      : (isAr ? `تبقّى ${completenessChecks.length - completed} من عناصر المعلومات الأساسية.` : `${completenessChecks.length - completed} essential items remaining.`);
  }
}

function escapeDashboardValue(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function websiteEditorFieldHtml(field, content) {
  const [key, labelAr, labelEn, type] = field;
  const value = content[key] ?? WEBSITE_CONTENT_DEFAULTS[key] ?? '';
  const isWide = type === 'textarea' ? ' wide' : '';
  const control = type === 'textarea'
    ? `<textarea class="form-control" rows="3" data-website-content-key="${key}">${escapeDashboardValue(value)}</textarea>`
    : `<input class="form-control" type="text" value="${escapeDashboardValue(value)}" data-website-content-key="${key}">`;
  return `<div class="form-group${isWide}"><label class="form-label" data-lang-ar="${escapeDashboardValue(labelAr)}" data-lang-en="${escapeDashboardValue(labelEn)}">${TAZA.Lang.current === 'ar' ? labelAr : labelEn}</label>${control}</div>`;
}

function renderWebsiteContentEditors(content = {}) {
  const aboutEditor = document.getElementById('about-content-editor');
  const footerEditor = document.getElementById('footer-content-editor');
  if (aboutEditor) {
    aboutEditor.innerHTML = WEBSITE_CONTENT_GROUPS.map(group => `
      <div class="content-editor-group">
        <div class="content-editor-group-title"><i class="fa-solid ${group.icon}"></i><span data-lang-ar="${group.ar}" data-lang-en="${group.en}">${TAZA.Lang.current === 'ar' ? group.ar : group.en}</span></div>
        <div class="content-editor-grid">${group.fields.map(field => websiteEditorFieldHtml(field, content)).join('')}</div>
      </div>`).join('');
  }
  if (footerEditor) {
    footerEditor.innerHTML = `<div class="content-editor-group"><div class="content-editor-grid">${FOOTER_CONTENT_FIELDS.map(field => websiteEditorFieldHtml(field, content)).join('')}</div></div>`;
  }
  renderFooterLinks(content.footer_links?.length ? content.footer_links : DEFAULT_FOOTER_LINKS);
}

function footerLinkRowHtml(link = {}) {
  return `<div class="footer-link-row">
    <div class="form-group"><label class="form-label" data-lang-ar="العنوان بالعربية" data-lang-en="Arabic label">${TAZA.Lang.current === 'ar' ? 'العنوان بالعربية' : 'Arabic label'}</label><input class="form-control" data-footer-label-ar value="${escapeDashboardValue(link.label_ar || '')}"></div>
    <div class="form-group"><label class="form-label" data-lang-ar="العنوان بالإنجليزية" data-lang-en="English label">${TAZA.Lang.current === 'ar' ? 'العنوان بالإنجليزية' : 'English label'}</label><input class="form-control" data-footer-label-en value="${escapeDashboardValue(link.label_en || '')}"></div>
    <div class="form-group"><label class="form-label" data-lang-ar="الرابط" data-lang-en="URL">${TAZA.Lang.current === 'ar' ? 'الرابط' : 'URL'}</label><input class="form-control" dir="ltr" data-footer-url value="${escapeDashboardValue(link.url || '')}" placeholder="menu.html"></div>
    <button class="footer-link-remove" type="button" data-remove-footer-link title="${TAZA.Lang.current === 'ar' ? 'حذف الرابط' : 'Remove link'}"><i class="fa-solid fa-trash"></i></button>
  </div>`;
}

function renderFooterLinks(links = []) {
  const editor = document.getElementById('footer-links-editor');
  if (editor) editor.innerHTML = links.slice(0, 8).map(footerLinkRowHtml).join('');
}

function appendFooterLinkRow(link) {
  const editor = document.getElementById('footer-links-editor');
  if (editor) editor.insertAdjacentHTML('beforeend', footerLinkRowHtml(link));
}

function collectWebsiteContent() {
  const content = {};
  document.querySelectorAll('[data-website-content-key]').forEach(input => {
    content[input.dataset.websiteContentKey] = input.value.trim();
  });
  content.footer_links = [...document.querySelectorAll('#footer-links-editor .footer-link-row')].map(row => ({
    label_ar: row.querySelector('[data-footer-label-ar]')?.value.trim() || '',
    label_en: row.querySelector('[data-footer-label-en]')?.value.trim() || '',
    url: row.querySelector('[data-footer-url]')?.value.trim() || '',
  }));
  return content;
}

function buildHoursGrid(hours) {
  const grid = document.getElementById('hours-grid');
  const isAr = TAZA.Lang.current === 'ar';
  if (!grid) return;

  _workingHours = { ...hours };

  grid.innerHTML = DAYS.map(day => {
    const h      = hours[day.key] ?? { open: true, from: '09:00', to: '22:00' };
    const isOpen = h.open ?? true;
    return `
      <div class="hours-row" data-day="${day.key}">
        <div class="hours-day">${isAr ? day.ar : day.en}</div>
        <input type="time" class="form-control"
               value="${h.from ?? '09:00'}" id="hours-from-${day.key}"
               ${!isOpen ? 'disabled' : ''}>
        <input type="time" class="form-control"
               value="${h.to ?? '22:00'}" id="hours-to-${day.key}"
               ${!isOpen ? 'disabled' : ''}>
        <div class="hours-state-wrap">
          <span class="hours-state-label ${isOpen ? 'is-open' : ''}">${isOpen ? (isAr?'مفتوح':'Open') : (isAr?'مغلق':'Closed')}</span>
          <button type="button" class="hours-toggle ${isOpen ? 'on' : ''}" data-day="${day.key}" id="hours-toggle-${day.key}" role="switch" aria-checked="${isOpen}" title="${isOpen ? (isAr?'مفتوح':'Open') : (isAr?'مغلق':'Closed')}"></button>
        </div>
      </div>
    `;
  }).join('');

  // Toggle listeners
  grid.querySelectorAll('.hours-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const day  = btn.dataset.day;
      const isOn = btn.classList.toggle('on');
      _workingHours[day] = { ..._workingHours[day], open: isOn };
      const fromEl = document.getElementById(`hours-from-${day}`);
      const toEl   = document.getElementById(`hours-to-${day}`);
      if (fromEl) fromEl.disabled = !isOn;
      if (toEl)   toEl.disabled   = !isOn;
      btn.setAttribute('aria-checked', String(isOn));
      btn.title = isOn ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed');
      const stateLabel = btn.closest('.hours-state-wrap')?.querySelector('.hours-state-label');
      if (stateLabel) {
        stateLabel.textContent = isOn ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed');
        stateLabel.classList.toggle('is-open', isOn);
      }
      markRestaurantInfoDirty();
    });
  });
}

let _restaurantMap = null;
let _restaurantMarker = null;

function initRestaurantLocationMap(ri = {}) {
  const el = document.getElementById('restaurant-location-map');
  if (!el || !window.L) return;
  const latInput = document.getElementById('info-latitude');
  const lngInput = document.getElementById('info-longitude');
  const lat = parseFloat(ri.latitude ?? latInput?.value ?? 35.5317);
  const lng = parseFloat(ri.longitude ?? lngInput?.value ?? 35.7901);
  const center = [Number.isFinite(lat) ? lat : 35.5317, Number.isFinite(lng) ? lng : 35.7901];

  if (!_restaurantMap) {
    _restaurantMap = L.map(el, { scrollWheelZoom: false }).setView(center, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(_restaurantMap);

    const blueIcon = L.divIcon({
      className: 'taza-dashboard-map-marker restaurant-blue-marker',
      html: '<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#2563eb;color:white;border:3px solid white;box-shadow:0 8px 18px rgba(37,99,235,.35)">🏪</span>',
      iconSize: [30, 30],
      iconAnchor: [15, 30]
    });
    _restaurantMarker = L.marker(center, { icon: blueIcon, draggable: true }).addTo(_restaurantMap);
    const syncInputs = (latlng) => {
      if (latInput) latInput.value = Number(latlng.lat).toFixed(7);
      if (lngInput) lngInput.value = Number(latlng.lng).toFixed(7);
      updateRestaurantEditorPreview();
      markRestaurantInfoDirty();
    };
    _restaurantMarker.on('dragend', () => syncInputs(_restaurantMarker.getLatLng()));
    _restaurantMap.on('click', (e) => {
      _restaurantMarker.setLatLng(e.latlng);
      syncInputs(e.latlng);
    });
  } else {
    _restaurantMap.setView(center, 15);
    _restaurantMarker?.setLatLng(center);
  }
  setTimeout(() => _restaurantMap?.invalidateSize(), 200);
}

async function saveRestaurantInfo() {
  const isAr  = TAZA.Lang.current === 'ar';
  const buttons = document.querySelectorAll('[data-save-restaurant-info]');
  const invalidControl = document.querySelector('#restaurant-editor-shell input:invalid, #restaurant-editor-shell textarea:invalid');
  if (invalidControl) {
    invalidControl.reportValidity();
    invalidControl.focus();
    TAZA.Toast.warning(isAr ? 'راجع الحقل المحدد قبل الحفظ' : 'Review the highlighted field before saving');
    return;
  }

  // Collect working hours
  const wh = {};
  DAYS.forEach(day => {
    const toggle  = document.getElementById(`hours-toggle-${day.key}`);
    const fromEl  = document.getElementById(`hours-from-${day.key}`);
    const toEl    = document.getElementById(`hours-to-${day.key}`);
    wh[day.key]   = {
      open: toggle?.classList.contains('on') ?? true,
      from: fromEl?.value ?? '09:00',
      to:   toEl?.value   ?? '22:00',
    };
  });

  const payload = {
    name:          document.getElementById('info-name')?.value.trim()        ?? '',
    phone:         document.getElementById('info-phone')?.value.trim()       || null,
    whatsapp:      document.getElementById('info-whatsapp')?.value.trim()    || null,
    about_text:    document.getElementById('info-description')?.value.trim() || null,
    address:       document.getElementById('info-address')?.value.trim()     || null,
    email:         document.getElementById('info-email')?.value.trim()       || null,
    instagram_url: document.getElementById('info-instagram')?.value.trim()   || null,
    facebook_url:  document.getElementById('info-facebook')?.value.trim()    || null,
    telegram_url:  document.getElementById('info-telegram')?.value.trim()    || null,
    latitude:      document.getElementById('info-latitude')?.value ? parseFloat(document.getElementById('info-latitude').value) : null,
    longitude:     document.getElementById('info-longitude')?.value ? parseFloat(document.getElementById('info-longitude').value) : null,
    working_hours: wh,
    website_content: collectWebsiteContent(),
  };

  if (!payload.name) {
    TAZA.Toast.warning(isAr ? 'اسم المطعم مطلوب' : 'Restaurant name required');
    return;
  }

  const invalidFooterLink = payload.website_content.footer_links.find(link =>
    !link.label_ar || !link.label_en || !link.url || /^\s*(javascript|data):/i.test(link.url)
  );
  if (invalidFooterLink) {
    TAZA.Toast.warning(isAr ? 'أكمل عناوين وروابط الفوتر وتأكد من صحة الرابط' : 'Complete all footer link labels and use a safe URL');
    return;
  }

  setRestaurantSaveState('saving');
  buttons.forEach(button => TAZA.Utils.disableBtn(button));
  try {
    await TAZA.Http.put(TAZA.API.COMM.RESTAURANT_UPDATE, payload);
    TAZA.Toast.success(isAr ? 'تم حفظ المعلومات بنجاح' : 'Information saved successfully');
    _restaurantInfo = { ..._restaurantInfo, ...payload, social_links: {
      facebook: payload.facebook_url,
      instagram: payload.instagram_url,
      telegram: payload.telegram_url,
    }};
    setRestaurantSaveState('saved');
    renderRestaurantPreview();
  } catch(e) {
    setRestaurantSaveState('dirty');
    TAZA.Toast.apiError(e);
  }
  finally    { buttons.forEach(button => TAZA.Utils.enableBtn(button)); }
}

async function uploadLogo(e) {
  const file = e.target.files?.[0];
  if (!file || !TAZA.Utils.isImageFile(file)) {
    TAZA.Toast.warning(TAZA.Lang.current === 'ar' ? 'صيغة غير مقبولة' : 'Invalid format');
    return;
  }
  const fd = new FormData(); fd.append('image', file);
  try {
    const res = await TAZA.Http.upload(TAZA.API.ADMIN_RESTAURANT.UPLOAD_LOGO, fd);
    const url = res?.data?.logo_url ?? res?.data?.url ?? URL.createObjectURL(file);
    const img = document.getElementById('logo-preview-img');
    if (img) { img.src = url; img.style.display = 'block'; }
    const ph  = document.getElementById('logo-placeholder');
    if (ph)   ph.style.display = 'none';
    TAZA.Toast.success(TAZA.Lang.current === 'ar' ? 'تم تحديث الشعار' : 'Logo updated');
  } catch(e) { TAZA.Toast.apiError(e); }
}
