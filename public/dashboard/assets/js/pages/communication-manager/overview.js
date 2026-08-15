'use strict';

// ═══════════════════════════════════════════
// [1] Overview
// ═══════════════════════════════════════════
async function loadOverview() {
  try {
    const [infoRes, suggRes, reviewRes, imagesRes] = await Promise.allSettled([
      TAZA.Http.get(TAZA.API.COMM.RESTAURANT_SHOW),
      TAZA.Http.get(TAZA.API.COMM.SUGGESTIONS),
      TAZA.Http.get(TAZA.API.REVIEWS.CUSTOMERS),
      TAZA.Http.get(TAZA.API.COMM.IMAGES_LIST),
    ]);

    _restaurantInfo = infoRes.status === 'fulfilled' ? (infoRes.value?.data?.restaurant ?? {}) : {};
    _suggestions    = suggRes.status === 'fulfilled' ? (suggRes.value?.data?.suggestions ?? []) : [];
    _reviews        = reviewRes.status === 'fulfilled' ? (reviewRes.value?.data?.reviews ?? []) : [];
    _galleryImages  = imagesRes.status === 'fulfilled' ? (imagesRes.value?.data?.all_images ?? imagesRes.value?.data?.images ?? []) : [];

    renderOverviewStats();
    renderRestaurantPreview();
    renderOverviewSuggestions(_suggestions.slice(0, 5));
    renderRatingsChart(_reviews);

    // Pending badge
    const pending = _suggestions.filter(s => s.status === 'pending').length;
    ['suggestions-badge','sb-suggestions'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = pending; el.style.display = pending > 0 ? 'inline-block' : 'none'; }
    });

  } catch(e) { TAZA.Toast.apiError(e); }
}

function renderOverviewStats() {
  const isAr  = TAZA.Lang.current === 'ar';
  const grid  = document.getElementById('overview-stats');
  const pending     = _suggestions.filter(s => s.status === 'pending').length;
  const implemented = _suggestions.filter(s => s.status === 'implemented').length;
  const avgRating   = _reviews.length
    ? (_reviews.reduce((s, r) => s + (r.overall_rating ?? r.rating ?? 0), 0) / _reviews.length).toFixed(1)
    : 0;

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon amber"><i class="fa-solid fa-lightbulb"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'اقتراحات جديدة':'New Suggestions'}</div>
        <div class="stat-value" style="color:${pending>0?'var(--warning)':'var(--success)'}">${pending}</div>
        <div class="stat-change ${pending>0?'down':'up'}">
          <i class="fa-solid fa-circle-dot"></i>
          ${pending>0 ? (isAr?'تحتاج مراجعة':'Needs review') : (isAr?'تمت مراجعة الكل':'All reviewed')}
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green"><i class="fa-solid fa-circle-check"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'اقتراحات مطبَّقة':'Implemented'}</div>
        <div class="stat-value">${implemented}</div>
        <div class="stat-change up"><i class="fa-solid fa-check"></i> ${isAr?'تم التطبيق':'Applied'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber"><i class="fa-solid fa-star"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'متوسط التقييم':'Average Rating'}</div>
        <div class="stat-value">${avgRating} ⭐</div>
        <div class="stat-change neutral"><i class="fa-solid fa-users"></i>
          ${_reviews.length} ${isAr?'تقييم':'reviews'}
        </div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue"><i class="fa-solid fa-images"></i></div>
      <div class="stat-content">
        <div class="stat-label">${isAr?'صور المعرض':'Gallery Images'}</div>
        <div class="stat-value" id="gallery-count-stat">—</div>
        <div class="stat-change neutral"><i class="fa-solid fa-photo-film"></i> ${isAr?'صورة منشورة':'published'}</div>
      </div>
    </div>
  `;

  // Gallery count async
  if (_galleryImages.length) {
    const el = document.getElementById('gallery-count-stat');
    if (el) el.textContent = _galleryImages.length;
  } else {
    TAZA.Http.get(TAZA.API.COMM.IMAGES_LIST).then(r => {
      const imgs = r?.data?.all_images ?? r?.data?.images ?? [];
      _galleryImages = imgs;
      const el = document.getElementById('gallery-count-stat');
      if (el) el.textContent = imgs.length;
    }).catch(() => {});
  }

  renderCommunicationStatus(pending);
}

function renderCommunicationStatus(pending = 0) {
  const panel = document.getElementById('communication-status');
  if (!panel) return;
  const isAr = TAZA.Lang.current === 'ar';
  const noImages = _galleryImages.length === 0;
  const hasMissingInfo = !_restaurantInfo.description || !_restaurantInfo.phone;
  const needsWork = pending > 0 || noImages || hasMissingInfo;
  const title = pending > 0
    ? (isAr ? `${pending} ${pending === 1 ? 'اقتراح ينتظر المراجعة' : 'اقتراحات تنتظر المراجعة'}` : `${pending} suggestion${pending === 1 ? '' : 's'} awaiting review`)
    : hasMissingInfo ? (isAr ? 'بيانات المطعم تحتاج إكمالًا' : 'Restaurant information needs completion')
    : noImages ? (isAr ? 'معرض الصور ما زال فارغًا' : 'The gallery is still empty')
    : (isAr ? 'المحتوى العام محدث وتحت السيطرة' : 'Public content is up to date');
  const description = pending > 0
    ? (isAr ? 'ابدأ بالأقدم حتى لا تتراكم اقتراحات الزبائن.' : 'Start with the oldest to avoid a suggestion backlog.')
    : (isAr ? 'راجع المعلومات والصور دوريًا للحفاظ على تجربة متناسقة.' : 'Review information and images regularly for a consistent experience.');
  panel.className = `communication-status ${needsWork ? 'has-alerts' : 'is-clear'}`;
  panel.innerHTML = `<div class="communication-status-icon"><i class="fa-solid ${pending > 0 ? 'fa-lightbulb' : hasMissingInfo ? 'fa-circle-info' : noImages ? 'fa-images' : 'fa-circle-check'}"></i></div><div class="communication-status-copy"><strong>${title}</strong><span>${description}</span></div><button class="btn btn-outline btn-sm" onclick="switchTab('${pending > 0 ? 'suggestions' : hasMissingInfo ? 'restaurant-info' : 'gallery'}')"><i class="fa-solid fa-arrow-left-long"></i>${isAr?'فتح المهمة':'Open task'}</button>`;
}

function renderRestaurantPreview() {
  const ri = _restaurantInfo;
  const isAr = TAZA.Lang.current === 'ar';

  const nameEl   = document.getElementById('restaurant-name-preview');
  const descEl   = document.getElementById('restaurant-desc-preview');
  const phoneEl  = document.getElementById('restaurant-phone-preview');
  const statusEl = document.getElementById('restaurant-status-preview');
  const logoEl   = document.getElementById('restaurant-logo-preview');

  if (nameEl)   nameEl.textContent  = ri.name        ?? 'TAZA 041';
  if (descEl)   descEl.textContent  = (ri.description || ri.about_text) ?? (isAr?'لا يوجد وصف بعد':'No description yet');
  if (phoneEl)  phoneEl.innerHTML   = `<i class="fa-solid fa-phone"></i> ${ri.phone ?? '—'}`;
  if (statusEl) statusEl.innerHTML  = ri.is_open
    ? `<span style="color:var(--success);font-weight:600"><i class="fa-solid fa-circle-check"></i> ${isAr?'مفتوح الآن':'Open Now'}</span>`
    : `<span style="color:var(--danger);font-weight:600"><i class="fa-solid fa-circle-xmark"></i> ${isAr?'مغلق الآن':'Closed Now'}</span>`;

  if (logoEl && ri.logo_url) {
    logoEl.innerHTML = `<img src="${TAZA.Media.url(ri.logo_url)}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:12px">`;
  }
}

function renderOverviewSuggestions(suggestions) {
  const container = document.getElementById('overview-suggestions');
  const isAr      = TAZA.Lang.current === 'ar';
  if (!container) return;

  if (!suggestions.length) {
    container.innerHTML = `<div class="empty-state" style="padding:20px">
      <div class="empty-icon">💡</div>
      <div class="empty-title">${isAr?'لا توجد اقتراحات':'No suggestions'}</div>
    </div>`;
    return;
  }

  const statusColors = { pending:'var(--warning)', reviewed:'var(--info)', implemented:'var(--success)', rejected:'var(--danger)' };
  const statusLabels = {
    pending:    isAr?'قيد المراجعة':'Pending',
    reviewed:   isAr?'تمت المراجعة':'Reviewed',
    implemented:isAr?'مطبَّق':'Implemented',
    rejected:   isAr?'مرفوض':'Rejected',
  };

  container.innerHTML = suggestions.map(s => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
      <div style="width:8px;height:8px;border-radius:50%;background:${statusColors[s.status]??'var(--text-muted)'};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.825rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeDashboardValue(s.meal_name || s.suggestion_text || (isAr?'اقتراح وجبة':'Meal suggestion'))}</div>
        <div style="font-size:.7rem;color:var(--text-muted)">${escapeDashboardValue(s.customer_name || s.customer?.name || (isAr?'زبون':'Customer'))} · ${TAZA.Utils.timeAgo(s.created_at)}</div>
      </div>
      <span style="font-size:.65rem;font-weight:600;padding:2px 8px;border-radius:var(--border-radius-full);background:${statusColors[s.status]}22;color:${statusColors[s.status]}">
        ${statusLabels[s.status] ?? s.status}
      </span>
    </div>
  `).join('');
}

function renderRatingsChart(reviews) {
  const dist = [5,4,3,2,1].map(n => reviews.filter(r => Math.round(r.overall_rating??r.rating??0) === n).length);
  TAZA.Charts.createDonut('chart-ratings', {
    labels: ['5 ⭐','4 ⭐','3 ⭐','2 ⭐','1 ⭐'],
    data:   dist,
  });
}
