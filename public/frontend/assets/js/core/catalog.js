// Public data loading, catalog normalization, media branding
async function bootstrapPublicData() {
  bindMediaErrorFallbacks();
  const page = document.body.dataset.page || '';
  const needsRestaurant = Boolean(page);
  const needsImages = ['guest-home', 'user-home', 'menu', 'about'].includes(page);
  const needsCatalog = ['guest-home', 'user-home', 'menu', 'payment', 'delivery', 'reservation'].includes(page);
  const needsPricing = ['payment', 'delivery', 'reservation'].includes(page);

  if (!needsRestaurant && !needsImages && !needsCatalog && !needsPricing) return;

  const [restaurant, images, products, offers, pricing] = await Promise.all([
    needsRestaurant ? safeApi('/public/restaurant', { timeoutMs: 4500 }) : Promise.resolve(null),
    needsImages ? safeApi('/public/restaurant/images', { timeoutMs: 4500 }) : Promise.resolve(null),
    needsCatalog ? safeApi('/public/products', { timeoutMs: 4500 }) : Promise.resolve(null),
    needsCatalog ? safeApi('/public/offers', { timeoutMs: 4500 }) : Promise.resolve(null),
    needsPricing ? safeApi('/public/pricing', { timeoutMs: 4500 }) : Promise.resolve(null)
  ]);

  AppState.restaurant = restaurant?.restaurant || null;
  AppState.images = images?.images || {};
  AppState.pricing = pricing || null;

  const normalizedProducts = flattenProducts(products).map(normalizeProduct).filter(Boolean);
  const normalizedOffers = (offers?.offers || []).map(normalizeOffer).filter(Boolean);
  const catalogApiResponded = products !== null || offers !== null;

  if (!needsCatalog) return;

  if (normalizedProducts.length || normalizedOffers.length) {
    AppState.apiOnline = true;
    AppState.usingFallback = false;
    AppState.catalog.products = normalizedProducts;
    AppState.catalog.offers = normalizedOffers;
    AppState.catalog.allItems = [...normalizedProducts, ...normalizedOffers];
    reconcileCartWithCatalog();
  } else if (catalogApiResponded) {
    AppState.apiOnline = true;
    AppState.usingFallback = false;
    AppState.catalog.products = [];
    AppState.catalog.offers = [];
    AppState.catalog.allItems = [];
    reconcileCartWithCatalog();
  } else if (!AppState.catalog.allItems.length) {
    AppState.usingFallback = true;
    AppState.catalog.products = fallbackCatalog.filter(item => item.item_type === 'product');
    AppState.catalog.offers = fallbackCatalog.filter(item => item.item_type === 'offer');
    AppState.catalog.allItems = [...fallbackCatalog];
  }
}

function flattenProducts(response) {
  if (!response) return [];
  if (Array.isArray(response.products)) return response.products;
  if (!response.grouped) return [];
  return Object.values(response.grouped).flatMap(group => group?.products || []);
}

function categoryToUi(category) {
  return ({ meal: 'meals', drink: 'drinks', sandwich: 'sandwiches' })[category] || category || 'meals';
}

function normalizeProduct(product) {
  if (!product) return null;
  const id = Number(product.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const name = product.name || langText('منتج', 'Product');
  return {
    key: `product:${id}`,
    id,
    item_type: 'product',
    reference_id: id,
    name,
    nameAr: product.name_ar || null,
    nameEn: product.name_en || null,
    category: categoryToUi(product.category),
    apiCategory: product.category,
    price: Number(product.price || 0),
    stockQuantity: Number(product.stock_quantity || 0),
    maxQuantity: Number(product.max_quantity || product.stock_quantity || 0),
    rating: Number(product.average_rating || 0),
    popular: Number(product.stock_quantity || 0) > 50,
    top: Number(product.average_rating || 0) >= 4.5,
    available: product.is_available !== false,
    offer: false,
    oldPrice: 0,
    description: product.description || '',
    descriptionAr: product.description_ar || null,
    descriptionEn: product.description_en || null,
    keywords: [name, product.name_ar, product.name_en, product.description, product.description_ar, product.description_en, product.category_label, product.category].filter(Boolean),
    imageUrl: assetUrl(product.image_url || null),
    loyaltyPrice: product.loyalty_price || null
  };
}

function normalizeOffer(offer) {
  if (!offer) return null;
  const id = Number(offer.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const name = offer.name || langText('عرض', 'Offer');
  return {
    key: `offer:${id}`,
    id,
    item_type: 'offer',
    reference_id: id,
    name,
    nameAr: offer.name_ar || null,
    nameEn: offer.name_en || null,
    category: 'offers',
    apiCategory: offer.category,
    price: Number(offer.offer_price || offer.price || 0),
    stockQuantity: Number(offer.max_available || 0),
    maxQuantity: Number(offer.max_available || 0),
    rating: 4.8,
    popular: true,
    top: true,
    available: offer.is_currently_active !== false,
    offer: true,
    oldPrice: Number(offer.original_price || 0),
    description: offer.description || '',
    descriptionAr: offer.description_ar || null,
    descriptionEn: offer.description_en || null,
    keywords: [name, offer.name_ar, offer.name_en, offer.description, offer.description_ar, offer.description_en, offer.category, 'عرض', 'offer'].filter(Boolean),
    imageUrl: assetUrl(offer.image_url || null),
    loyaltyPrice: offer.loyalty_price || null,
    discount: offer.discount_percentage || 0,
    products: offer.products || []
  };
}

function getImage(type, index = 0) {
  return assetUrl(AppState.images?.[type]?.images?.[index]?.image_url || null);
}

function localLogoSrc() {
  return 'assets/images/taza041-logo.jpg';
}

function fallbackMedia(el, label = 'TAZA 041') {
  if (!el) return;
  el.classList.remove('media-loaded');
  el.innerHTML = `<span>${esc(label)}</span>`;
}

function bindMediaErrorFallbacks() {
  if (document.documentElement.dataset.mediaFallbackBound === 'true') return;
  document.documentElement.dataset.mediaFallbackBound = 'true';
  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;

    const logo = image.closest('.logo-image');
    if (logo) {
      const fallback = localLogoSrc();
      if (image.getAttribute('src') !== fallback) image.src = fallback;
      return;
    }

    const media = image.closest('.placeholder-media');
    if (media) fallbackMedia(media, image.alt || 'TAZA 041');
  }, true);
}

function mediaHtml(item, fallback = 'TAZA 041') {
  const itemName = catalogItemName(item) || fallback;
  if (item?.imageUrl) {
    return `<div class="placeholder-media media-loaded"><img loading="lazy" decoding="async" src="${esc(assetUrl(item.imageUrl))}" alt="${esc(itemName)}"></div>`;
  }
  return `<div class="placeholder-media"><span>${esc(itemName)}</span></div>`;
}

function setMedia(el, url, label) {
  if (!el || !url) return;
  el.classList.add('media-loaded');
  el.innerHTML = `<img loading="lazy" decoding="async" src="${esc(assetUrl(url))}" alt="${esc(label)}">`;
  const image = $('img', el);
  if (image) image.onerror = () => fallbackMedia(el, label);
}

function setLogoMedia(el, url, label) {
  if (!el) return;
  const fallback = localLogoSrc();
  el.classList.add('logo-loaded');
  el.innerHTML = `<img loading="eager" decoding="async" src="${esc(assetUrl(url) || fallback)}" alt="${esc(label || 'TAZA 041')}">`;
  const image = $('img', el);
  if (image) {
    image.onerror = () => {
      if (image.getAttribute('src') === fallback) return;
      image.src = fallback;
    };
  }
}

let livePublicDataRefreshRunning = false;
let livePublicDataRevision = '';

function publicDataFingerprint(value) {
  try { return JSON.stringify(value ?? null); } catch (_) { return String(value ?? ''); }
}

async function refreshLivePublicData() {
  if (livePublicDataRefreshRunning || document.hidden) return null;
  const page = document.body.dataset.page || '';
  const needsRestaurant = Boolean(page);
  const needsImages = ['guest-home', 'user-home', 'menu', 'about'].includes(page);
  const needsCatalog = ['guest-home', 'user-home', 'menu', 'payment', 'delivery', 'reservation'].includes(page);
  const needsPricing = ['payment', 'delivery', 'reservation'].includes(page);
  if (!needsRestaurant && !needsImages && !needsCatalog && !needsPricing) return null;

  livePublicDataRefreshRunning = true;
  const before = {
    restaurant: publicDataFingerprint(AppState.restaurant),
    images: publicDataFingerprint(AppState.images),
    catalog: publicDataFingerprint(AppState.catalog),
    pricing: publicDataFingerprint(AppState.pricing)
  };
  const wasOpen = restaurantIsOpen();

  try {
    const query = livePublicDataRevision ? `?since=${encodeURIComponent(livePublicDataRevision)}` : '';
    const live = await safeApi(`/public/live-data${query}`, { timeoutMs: 5500, cache: 'no-store' });
    if (!live) return null;
    livePublicDataRevision = live.revision || livePublicDataRevision;
    if (live.changed === false) return { restaurant: false, images: false, catalog: false, pricing: false };

    if (live.restaurant) AppState.restaurant = live.restaurant;
    if (live.images) AppState.images = live.images;
    if (live.pricing) AppState.pricing = live.pricing;

    if (Array.isArray(live.products) && Array.isArray(live.offers)) {
      const normalizedProducts = live.products.map(normalizeProduct).filter(Boolean);
      const normalizedOffers = live.offers.map(normalizeOffer).filter(Boolean);
      AppState.apiOnline = true;
      AppState.usingFallback = false;
      AppState.catalog.products = normalizedProducts;
      AppState.catalog.offers = normalizedOffers;
      AppState.catalog.allItems = [...normalizedProducts, ...normalizedOffers];
      reconcileCartWithCatalog();
    }

    const changes = {
      restaurant: before.restaurant !== publicDataFingerprint(AppState.restaurant),
      images: before.images !== publicDataFingerprint(AppState.images),
      catalog: before.catalog !== publicDataFingerprint(AppState.catalog),
      pricing: before.pricing !== publicDataFingerprint(AppState.pricing)
    };
    if (!Object.values(changes).some(Boolean)) return changes;

    if (changes.restaurant || changes.images) applyRestaurantBranding();
    if (typeof syncRestaurantOrderAvailability === 'function') syncRestaurantOrderAvailability();
    window.dispatchEvent(new CustomEvent('taza:public-data-updated', { detail: changes }));

    if (changes.restaurant && wasOpen !== restaurantIsOpen() && AppState.loggedIn && AppState.token) {
      showToast(
        restaurantIsOpen()
          ? langText('يمكنك الآن تصفح المنيو وإرسال طلبك', 'You can now browse the menu and place your order')
          : langText('المطعم مغلق حالياً، وسنعلمك عندما يعود لاستقبال الطلبات', 'The restaurant is currently closed; we will let you know when ordering resumes'),
        {
          kind: restaurantIsOpen() ? 'info' : 'warning',
          title: restaurantIsOpen()
            ? langText('المطعم مفتوح الآن', 'The restaurant is open now')
            : langText('المطعم مغلق الآن', 'The restaurant is closed now'),
          position: 'top',
          duration: 6500
        }
      );
    }

    return changes;
  } finally {
    livePublicDataRefreshRunning = false;
  }
}

function syncRestaurantStatusUI() {
  const isOpen = restaurantIsOpen();
  const statusText = restaurantStatusText();

  $$('[data-restaurant-status]').forEach(el => {
    el.textContent = statusText;
  });

  $$('[data-restaurant-status-card]').forEach(card => {
    card.classList.toggle('is-open', isOpen);
    card.classList.toggle('is-closed', !isOpen);
    card.setAttribute('aria-label', `${langText('حالة المطعم', 'Restaurant status')}: ${statusText}`);
  });
}

const PUBLIC_WORKING_DAYS = [
  ['saturday', 'السبت', 'Saturday'],
  ['sunday', 'الأحد', 'Sunday'],
  ['monday', 'الاثنين', 'Monday'],
  ['tuesday', 'الثلاثاء', 'Tuesday'],
  ['wednesday', 'الأربعاء', 'Wednesday'],
  ['thursday', 'الخميس', 'Thursday'],
  ['friday', 'الجمعة', 'Friday']
];

function formatWorkingHourTime(value) {
  const [rawHour, rawMinute] = String(value || '00:00').split(':');
  const hour = Number(rawHour);
  const minute = Number(rawMinute || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value || '—';
  const suffix = hour < 12 ? langText('ص', 'AM') : langText('م', 'PM');
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function workingHoursLine(day, hours) {
  const label = AppState.lang === 'ar' ? day[1] : day[2];
  if (!hours || hours.open === false) return `${label}: ${langText('مغلق', 'Closed')}`;
  return `${label}: ${formatWorkingHourTime(hours.from)} – ${formatWorkingHourTime(hours.to)}`;
}

function todayWorkingHoursText(restaurant = AppState.restaurant || {}) {
  const hours = restaurant.working_hours || {};
  if (!Object.keys(hours).length) return langText('غير محدد', 'Not specified');
  const nowKey = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()).toLowerCase();
  const today = PUBLIC_WORKING_DAYS.find(day => day[0] === nowKey) || PUBLIC_WORKING_DAYS[0];
  return workingHoursLine(today, hours[today[0]]);
}

function syncWorkingHoursUI(restaurant = AppState.restaurant || {}) {
  const hours = restaurant.working_hours || {};
  if (!Object.keys(hours).length) return;

  const todayText = todayWorkingHoursText(restaurant);

  $$('[data-working-hours-today]').forEach(el => { el.textContent = todayText; });
  $$('[data-working-hours-list]').forEach(list => {
    list.innerHTML = PUBLIC_WORKING_DAYS
      .map(day => `<li>${esc(workingHoursLine(day, hours[day[0]]))}</li>`)
      .join('');
  });
}

function applyRestaurantBranding() {
  const restaurant = AppState.restaurant || {};
  const websiteContent = restaurant.website_content || {};
  const logo = restaurant.logo_url || getImage('logo');
  $$('.logo-text strong, footer h3').forEach(el => { if (restaurant.name) el.textContent = restaurant.name; });
  $$('link[data-restaurant-favicon]').forEach(el => {
    if (!restaurant.logo_url) return;
    el.href = restaurant.logo_url;
    el.removeAttribute('type');
  });
  $$('.logo-image').forEach(el => {
    setLogoMedia(el, logo, restaurant.name || 'TAZA 041');
  });

  $$('.restaurant-status-pill').forEach(el => el.remove());
  const statusHost = $('.site-header [data-header-status]') || $('.site-header .header-actions');
  if (statusHost) {
    const statusPill = document.createElement('span');
    statusPill.className = `restaurant-status-pill ${restaurantIsOpen() ? 'is-open' : 'is-closed'}`;
    statusPill.textContent = restaurantStatusText();
    statusHost.prepend(statusPill);
  }
  syncRestaurantStatusUI();

  const footerContact = document.body.dataset.page === 'about' ? null : $('.footer-grid > div:nth-child(3) ul');
  if (footerContact && restaurant) {
    footerContact.innerHTML = `
      <li>${esc(restaurant.address || langText('العنوان قريباً', 'Address coming soon'))}</li>
      <li>${esc(restaurant.phone || restaurant.whatsapp || '+963 000 000 000')}</li>
      <li>${esc(restaurant.email || 'info@taza041.com')}</li>`;
  }

  $$('[data-content-key]').forEach(el => {
    const key = `${el.dataset.contentKey}_${AppState.lang}`;
    const value = websiteContent[key] || (
      el.dataset.contentKey === 'hero_description' && AppState.lang === 'ar'
        ? restaurant.about_text
        : ''
    );
    if (typeof value === 'string' && value.trim()) el.textContent = value.trim();
  });

  syncWorkingHoursUI(restaurant);

  const footerDescription = websiteContent[`footer_description_${AppState.lang}`];
  if (footerDescription) {
    $$('.site-footer .footer-grid > div:first-child > p').forEach(el => { el.textContent = footerDescription; });
  }

  const footerLinks = Array.isArray(websiteContent.footer_links) ? websiteContent.footer_links : [];
  if (footerLinks.length) {
    $$('[data-footer-links]').forEach(list => {
      list.innerHTML = footerLinks.map(link => {
        const label = AppState.lang === 'ar' ? link?.label_ar : link?.label_en;
        const href = safeWebsiteHref(link?.url);
        return label && href ? `<li><a href="${esc(href)}">${esc(label)}</a></li>` : '';
      }).join('');
    });
  }

  syncRestaurantMapLinks(restaurant);

  const aboutPhone = $('[data-about-phone]');
  const publicPhone = restaurant.phone || restaurant.whatsapp;
  if (aboutPhone && publicPhone) {
    aboutPhone.href = `tel:${String(publicPhone).replace(/[^+\d]/g, '')}`;
    const value = $('strong', aboutPhone);
    if (value) value.textContent = publicPhone;
  }
  const aboutEmail = $('[data-about-email]');
  if (aboutEmail && restaurant.email) {
    aboutEmail.href = `mailto:${restaurant.email}`;
    const value = $('strong', aboutEmail);
    if (value) value.textContent = restaurant.email;
  }

  const heroImages = $$('.hero-panel .placeholder-media.tall');
  setMedia(heroImages[0], getImage('banner') || getImage('exterior') || getImage('food'), restaurant.name || 'TAZA 041');

  const aboutImages = $$('.about-grid .placeholder-media.tall, body[data-page="about"] .placeholder-media.tall');
  aboutImages.forEach((el, i) => setMedia(el, getImage(i ? 'interior' : 'exterior') || getImage('food'), restaurant.name || 'Restaurant'));

  if (restaurant.about_text) {
    $$('body[data-page="about"] .card p.muted, .about-grid p.muted').forEach(el => { el.textContent = restaurant.about_text; });
  }

  $$('.info-list').forEach(list => {
    const hasRestaurantContext = list.closest('.about-grid') || document.body.dataset.page === 'about';
    if (!hasRestaurantContext) return;
    list.innerHTML = `
      <div class="info-chip">${esc(langText('العنوان: ', 'Location: '))}${esc(restaurant.address || langText('غير محدد بعد', 'Not set yet'))}</div>
      <div class="info-chip">${esc(langText('حالة المطعم: ', 'Restaurant status: '))}${esc(restaurantStatusText())}</div>
      <div class="info-chip">${esc(langText('دوام اليوم: ', 'Today’s hours: '))}${esc(todayWorkingHoursText(restaurant))}</div>
      <div class="info-chip">${esc(langText('التواصل: ', 'Contact: '))}${esc(restaurant.phone || restaurant.whatsapp || restaurant.email || '—')}</div>`;
  });
}

function restaurantMapHref(restaurant = {}) {
  const latitude = Number(restaurant.latitude);
  const longitude = Number(restaurant.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  const coordinates = `${latitude.toFixed(7)},${longitude.toFixed(7)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`;
}

function syncRestaurantMapLinks(restaurant = AppState.restaurant || {}) {
  const href = restaurantMapHref(restaurant);
  $$('.site-footer').forEach(footer => {
    let link = $('[data-restaurant-map-link]', footer);
    if (!link) {
      const host = $('.footer-grid > div:last-child', footer) || $('.footer-grid', footer);
      if (!host) return;
      link = document.createElement('a');
      link.className = 'btn btn-secondary footer-map-link';
      link.dataset.restaurantMapLink = '';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      host.appendChild(link);
    }

    link.hidden = !href;
    if (!href) {
      link.removeAttribute('href');
      return;
    }

    const label = langText('عرض موقع المطعم على الخريطة', 'View restaurant on map');
    link.href = href;
    link.title = restaurant.address
      ? langText(`عرض ${restaurant.address} على الخريطة`, `View ${restaurant.address} on the map`)
      : label;
    link.setAttribute('aria-label', `${label} — ${langText('يفتح في نافذة جديدة', 'opens in a new tab')}`);
    link.innerHTML = `<span class="footer-map-icon" aria-hidden="true">⌖</span><span>${esc(label)}</span><span class="footer-map-arrow" aria-hidden="true">↗</span>`;
  });
}

function safeWebsiteHref(value) {
  const href = String(value || '').trim();
  if (!href || /^\s*(javascript|data):/i.test(href)) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^(https?:|mailto:|tel:)/i.test(href)) return '';
  return href;
}
