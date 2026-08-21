// State, helpers, API client, and formatting
/*
  TAZA 041 Customer Web Frontend
  --------------------------------
  This file is now API-first: restaurant data, images, products, offers,
  orders, notifications and payments are loaded from the Laravel backend.
  LocalStorage is kept only for UI preferences, auth token, cart, and safe fallback mode.
*/

const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

const STORAGE_KEYS = {
  token: 'taza_customer_token',
  user: 'taza_user',
  loggedIn: 'taza_logged_in',
  cart: 'taza_cart',
  orderNotes: 'taza_order_notes',
  theme: 'taza_theme',
  lang: 'taza_lang',
  orderType: 'taza_order_type',
  deliveryMeta: 'taza_delivery_meta',
  savedAddresses: 'taza_saved_addresses',
  savedAddressesOwner: 'taza_saved_addresses_owner',
  reservationMeta: 'taza_reservation_meta',
  customerStateOwner: 'taza_customer_state_owner',
  customerStatePrefix: 'taza_customer_state_v1_'
};

function safeStorageJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    localStorage.removeItem(key);
    return fallback;
  }
}

function resolveApiBase() {
  const { hostname, port, protocol } = window.location;
  if (window.TAZA_API_BASE) return String(window.TAZA_API_BASE);

  const frontendDevPorts = ['5500', '5173', '3000', '8080'];
  if (protocol === 'file:') {
    return 'http://localhost:8000/api';
  }

  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  const privateNetworkHost = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  if ((isLocalHost || privateNetworkHost) && frontendDevPorts.includes(port)) {
    return `http://${hostname}:8000/api`;
  }

  return `${window.location.origin}/api`;
}

const API_BASE = resolveApiBase().replace(/\/$/, '');

const DELIVERY_MAX_DISTANCE_KM = 10;

function deliveryMaxDistanceKm() {
  const configured = Number(AppState.pricing?.delivery?.max_distance_km);
  return Number.isFinite(configured) && configured > 0 ? configured : DELIVERY_MAX_DISTANCE_KM;
}

function deliveryCostPerKm() {
  const configured = Number(AppState.pricing?.delivery?.cost_per_km);
  return Number.isFinite(configured) && configured >= 0 ? configured : 50;
}
const LOYALTY_POINT_VALUE_SYP = 10;
const SAVED_ADDRESS_TYPES = ['home', 'work', 'other'];

const defaultUser = {
  id: null,
  name: 'ضيف TAZA',
  email: '',
  phone: '',
  loyaltyPoints: 0,
  loyaltyTier: 'bronze',
  loyaltyTierLabel: '🥉 برونزي',
  loyalty: null,
  birthday: '',
  address: '',
  bio: '',
  avatarUrl: null
};

const fallbackCatalog = [
  { key:'product:fallback-m1', id:'fallback-m1', item_type:'product', reference_id:'fallback-m1', name:'Crispy Meal', nameAr:'وجبة كرسبي', nameEn:'Crispy Meal', category:'meals', apiCategory:'meal', price:280, rating:4.8, popular:true, top:true, available:false, demoOnly:true, offer:false, oldPrice:0, description:'وجبة مقرمشة مع بطاطا ومشروب', descriptionAr:'وجبة مقرمشة مع بطاطا ومشروب', descriptionEn:'A crispy meal served with fries and a drink.', keywords:['crispy','meal','كرسبي','وجبة'], imageUrl:null },
  { key:'product:fallback-s1', id:'fallback-s1', item_type:'product', reference_id:'fallback-s1', name:'Classic Burger', nameAr:'برغر كلاسيك', nameEn:'Classic Burger', category:'sandwiches', apiCategory:'sandwich', price:190, rating:4.7, popular:true, top:false, available:false, demoOnly:true, offer:false, oldPrice:0, description:'برغر كلاسيكي بنكهة متوازنة', descriptionAr:'برغر كلاسيكي بنكهة متوازنة', descriptionEn:'A classic burger with a balanced flavour.', keywords:['burger','برغر'], imageUrl:null },
  { key:'product:fallback-s2', id:'fallback-s2', item_type:'product', reference_id:'fallback-s2', name:'Chicken Shawarma', nameAr:'شاورما دجاج', nameEn:'Chicken Shawarma', category:'sandwiches', apiCategory:'sandwich', price:170, rating:4.6, popular:true, top:true, available:false, demoOnly:true, offer:false, oldPrice:0, description:'شاورما دجاج محبوبة مع تتبيلة غنية', descriptionAr:'شاورما دجاج محبوبة مع تتبيلة غنية', descriptionEn:'Popular chicken shawarma with a rich signature marinade.', keywords:['shawarma','chicken','شاورما','دجاج'], imageUrl:null },
  { key:'product:fallback-d1', id:'fallback-d1', item_type:'product', reference_id:'fallback-d1', name:'Pepsi', nameAr:'بيبسي', nameEn:'Pepsi', category:'drinks', apiCategory:'drink', price:50, rating:4.2, popular:false, top:false, available:false, demoOnly:true, offer:false, oldPrice:0, description:'مشروب غازي بارد', descriptionAr:'مشروب غازي بارد', descriptionEn:'A chilled soft drink.', keywords:['pepsi','بيبسي'], imageUrl:null },
  { key:'product:fallback-d2', id:'fallback-d2', item_type:'product', reference_id:'fallback-d2', name:'Orange Fresh', nameAr:'عصير برتقال طازج', nameEn:'Orange Fresh', category:'drinks', apiCategory:'drink', price:90, rating:4.4, popular:false, top:false, available:false, demoOnly:true, offer:false, oldPrice:0, description:'مشروب برتقال بارد ومنعش', descriptionAr:'مشروب برتقال بارد ومنعش', descriptionEn:'A refreshing chilled orange drink.', keywords:['orange','fresh','برتقال','عصير'], imageUrl:null },
  { key:'offer:fallback-o1', id:'fallback-o1', item_type:'offer', reference_id:'fallback-o1', name:'Pizza Today Offer', nameAr:'عرض بيتزا اليوم', nameEn:'Pizza Today Offer', category:'offers', apiCategory:'mixed', price:250, rating:4.9, popular:true, top:true, available:false, demoOnly:true, offer:true, oldPrice:330, description:'عرض بيتزا اليوم مع مشروب', descriptionAr:'عرض بيتزا اليوم مع مشروب', descriptionEn:'Today’s pizza offer served with a drink.', keywords:['pizza','بيتزا','offer','عرض'], imageUrl:null }
];

function emptyCustomerOrderState() {
  return { cart: {}, orderNotes: '', orderType: '', deliveryMeta: null, reservationMeta: null };
}

function customerOrderStateStorageKey(customerId) {
  return `${STORAGE_KEYS.customerStatePrefix}${String(customerId || '')}`;
}

function legacyCustomerOrderState() {
  return {
    cart: safeStorageJson(STORAGE_KEYS.cart, {}),
    orderNotes: localStorage.getItem(STORAGE_KEYS.orderNotes) || '',
    orderType: localStorage.getItem(STORAGE_KEYS.orderType) || '',
    deliveryMeta: safeStorageJson(STORAGE_KEYS.deliveryMeta, null),
    reservationMeta: safeStorageJson(STORAGE_KEYS.reservationMeta, null)
  };
}

function readCustomerOrderState(customerId, allowLegacy = false) {
  if (!customerId) return emptyCustomerOrderState();
  const scoped = safeStorageJson(customerOrderStateStorageKey(customerId), null);
  const source = scoped && typeof scoped === 'object'
    ? scoped
    : (allowLegacy ? legacyCustomerOrderState() : emptyCustomerOrderState());
  return {
    cart: source.cart && typeof source.cart === 'object' ? source.cart : {},
    orderNotes: String(source.orderNotes || ''),
    orderType: String(source.orderType || ''),
    deliveryMeta: source.deliveryMeta || null,
    reservationMeta: source.reservationMeta || null
  };
}

const initialStoredUser = normalizeUser(safeStorageJson(STORAGE_KEYS.user, null));
const initialCustomerId = initialStoredUser.id ? String(initialStoredUser.id) : '';
const initialCustomerStateOwner = localStorage.getItem(STORAGE_KEYS.customerStateOwner) || '';
const initialCustomerOrderState = readCustomerOrderState(
  initialCustomerId,
  Boolean(initialCustomerId) && (!initialCustomerStateOwner || initialCustomerStateOwner === initialCustomerId)
);
const initialSavedAddressesOwner = localStorage.getItem(STORAGE_KEYS.savedAddressesOwner) || '';

const AppState = {
  theme: localStorage.getItem(STORAGE_KEYS.theme) || 'dark',
  lang: localStorage.getItem(STORAGE_KEYS.lang) || 'ar',
  token: localStorage.getItem(STORAGE_KEYS.token) || '',
  user: initialStoredUser,
  loggedIn: Boolean(localStorage.getItem(STORAGE_KEYS.token)) || localStorage.getItem(STORAGE_KEYS.loggedIn) === 'true',
  cart: initialCustomerOrderState.cart,
  orderNotes: initialCustomerOrderState.orderNotes,
  orderType: initialCustomerOrderState.orderType,
  deliveryMeta: initialCustomerOrderState.deliveryMeta,
  savedAddresses: normalizeSavedAddresses(
    initialCustomerId && initialSavedAddressesOwner === initialCustomerId
      ? safeStorageJson(STORAGE_KEYS.savedAddresses, null)
      : null
  ),
  hasPendingSavedAddressMigration: false,
  reservationMeta: initialCustomerOrderState.reservationMeta,
  restaurant: null,
  images: {},
  pricing: null,
  catalog: {
    products: [],
    offers: [],
    allItems: []
  },
  notificationUnreadCount: 0,
  apiOnline: false,
  usingFallback: false
};

function normalizeUser(user) {
  if (!user) return { ...defaultUser };
  const loyalty = normalizeLoyalty(user.loyalty || null, user);
  const directPoints = firstPresent(user.loyalty_points, user.loyaltyPoints, user.points_balance, user.points);
  const loyaltyPoints = normalizeNumber(directPoints ?? loyalty?.points_balance ?? 0);
  const loyaltyTier = firstPresent(user.loyalty_tier, user.loyaltyTier, loyalty?.tier, defaultUser.loyaltyTier);
  const loyaltyTierLabel = firstPresent(
    user.loyalty_tier_label,
    user.loyaltyTierLabel,
    loyalty?.tier_label,
    fallbackLoyaltyTierLabel(loyaltyTier)
  );
  return {
    ...defaultUser,
    id: user.id ?? null,
    name: user.name || user.full_name || defaultUser.name,
    email: user.email || '',
    phone: user.phone || '',
    loyaltyPoints,
    loyaltyTier,
    loyaltyTierLabel,
    loyalty: loyalty ? {
      ...loyalty,
      points_balance: loyaltyPoints,
      points: loyaltyPoints,
      tier: loyaltyTier,
      tier_label: loyaltyTierLabel
    } : null,
    birthday: user.date_of_birth || user.birthday || '',
    address: user.address || user.city || '',
    bio: user.bio || '',
    avatarUrl: user.avatar_url || user.avatar || user.avatarUrl || null
  };
}

function savedAddressLabel(type = '') {
  const labels = {
    home: { ar: 'عنوان البيت', en: 'Home address', icon: '01' },
    work: { ar: 'عنوان العمل', en: 'Work address', icon: '02' },
    other: { ar: 'عنوان آخر', en: 'Other address', icon: '03' }
  };
  return labels[type] || labels.other;
}

function emptySavedAddress(type) {
  const label = savedAddressLabel(type);
  return {
    type,
    label_ar: label.ar,
    label_en: label.en,
    address: '',
    details: '',
    latitude: null,
    longitude: null,
    updatedAt: ''
  };
}

function normalizeSavedAddress(type, value = {}) {
  const base = emptySavedAddress(type);
  const raw = value && typeof value === 'object' ? value : {};
  const latitude = firstPresent(raw.latitude, raw.lat);
  const longitude = firstPresent(raw.longitude, raw.lng);
  const normalizedLatitude = latitude === undefined ? null : Number(latitude);
  const normalizedLongitude = longitude === undefined ? null : Number(longitude);
  return {
    ...base,
    ...raw,
    type,
    label_ar: raw.label_ar || raw.labelAr || base.label_ar,
    label_en: raw.label_en || raw.labelEn || base.label_en,
    address: String(raw.address || raw.title || '').trim(),
    details: String(raw.details || raw.note || raw.description || '').trim(),
    latitude: Number.isFinite(normalizedLatitude) ? normalizedLatitude : null,
    longitude: Number.isFinite(normalizedLongitude) ? normalizedLongitude : null,
    updatedAt: raw.updatedAt || raw.updated_at || ''
  };
}

function normalizeSavedAddresses(raw = null) {
  const source = Array.isArray(raw)
    ? raw.reduce((acc, item) => {
      if (item?.type) acc[item.type] = item;
      return acc;
    }, {})
    : (raw && typeof raw === 'object' ? raw : {});

  return SAVED_ADDRESS_TYPES.reduce((acc, type) => {
    acc[type] = normalizeSavedAddress(type, source[type]);
    return acc;
  }, {});
}

function savedAddressTitle(address = {}) {
  return AppState.lang === 'ar'
    ? (address.label_ar || savedAddressLabel(address.type).ar)
    : (address.label_en || savedAddressLabel(address.type).en);
}

function savedAddressText(address = {}) {
  return [address.address, address.details].map(value => String(value || '').trim()).filter(Boolean).join(' - ');
}

function savedAddressHasCoordinates(address = {}) {
  const latitude = address.latitude;
  const longitude = address.longitude;
  return latitude !== null && latitude !== undefined && latitude !== ''
    && longitude !== null && longitude !== undefined && longitude !== ''
    && Number.isFinite(Number(latitude))
    && Number.isFinite(Number(longitude));
}

function savedAddressIsComplete(address = {}) {
  return Boolean(String(address.address || '').trim()) && savedAddressHasCoordinates(address);
}

async function refreshSavedAddressesContext(embeddedAddresses = undefined) {
  if (!AppState.token || !AppState.user?.id) return false;
  const local = normalizeSavedAddresses(AppState.savedAddresses);
  const owner = localStorage.getItem(STORAGE_KEYS.savedAddressesOwner) || '';
  let data = embeddedAddresses === undefined ? null : { addresses: embeddedAddresses };
  if (embeddedAddresses === undefined) {
    try {
      data = await apiFetch('/customer/saved-addresses');
    } catch (_) {
      return false;
    }
  }

  const server = normalizeSavedAddresses(data?.addresses || []);
  const sameOwner = owner === String(AppState.user.id);
  const legacyCache = !owner;
  let hasPendingMigration = false;
  const merged = SAVED_ADDRESS_TYPES.reduce((result, type) => {
    const remote = server[type];
    const cached = local[type];
    if (savedAddressIsComplete(remote)) {
      result[type] = remote;
    } else if (legacyCache && savedAddressIsComplete(cached)) {
      result[type] = cached;
      hasPendingMigration = true;
    } else {
      result[type] = emptySavedAddress(type);
    }
    return result;
  }, {});

  AppState.savedAddresses = normalizeSavedAddresses(merged);
  AppState.hasPendingSavedAddressMigration = hasPendingMigration;
  if (!hasPendingMigration || sameOwner) {
    localStorage.setItem(STORAGE_KEYS.savedAddressesOwner, String(AppState.user.id));
  }
  persist();
  return true;
}

function updateSavedAddress(type, patch = {}) {
  if (!SAVED_ADDRESS_TYPES.includes(type)) return null;
  AppState.savedAddresses[type] = normalizeSavedAddress(type, {
    ...AppState.savedAddresses[type],
    ...patch,
    updatedAt: new Date().toISOString()
  });
  persist();
  return AppState.savedAddresses[type];
}

function firstPresent(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function fallbackLoyaltyTierLabel(tier = defaultUser.loyaltyTier) {
  return {
    bronze: '🥉 برونزي',
    silver: '🥈 فضي',
    gold: '🥇 ذهبي',
    platinum: '💎 بلاتينيوم'
  }[tier] || defaultUser.loyaltyTierLabel;
}

function normalizeLoyalty(raw = null, user = {}) {
  const loyalty = raw && typeof raw === 'object' ? raw : {};
  const hasSnapshot = Boolean(raw && typeof raw === 'object' && Object.keys(raw).length)
    || firstPresent(user.loyalty_points, user.loyaltyPoints, user.points_balance, user.points) !== undefined
    || firstPresent(user.loyalty_tier, user.loyaltyTier) !== undefined;
  if (!hasSnapshot) return null;

  const points = normalizeNumber(firstPresent(
    loyalty.points_balance,
    loyalty.points,
    loyalty.balance,
    loyalty.loyalty_points,
    loyalty.available_points,
    user.loyalty_points,
    user.loyaltyPoints,
    user.points_balance,
    user.points,
    0
  ));
  const tier = firstPresent(loyalty.tier, loyalty.loyalty_tier, user.loyalty_tier, user.loyaltyTier, defaultUser.loyaltyTier);
  const tierLabel = firstPresent(
    loyalty.tier_label,
    loyalty.loyalty_tier_label,
    loyalty.tierLabel,
    user.loyalty_tier_label,
    user.loyaltyTierLabel,
    fallbackLoyaltyTierLabel(tier)
  );

  return {
    ...loyalty,
    points_balance: points,
    points,
    tier,
    tier_label: tierLabel,
    earning_multiplier: normalizeNumber(firstPresent(
      loyalty.earning_multiplier,
      loyalty.earning_info?.current_multiplier,
      1
    ), 1),
    tier_catalog: Array.isArray(loyalty.tier_catalog)
      ? loyalty.tier_catalog
      : (Array.isArray(loyalty.earning_info?.tier_catalog) ? loyalty.earning_info.tier_catalog : []),
    points_to_next_tier: loyalty.points_to_next_tier ?? loyalty.pointsToNextTier ?? null,
    tier_progress: loyalty.tier_progress ?? loyalty.tierProgress ?? null
  };
}

function applyLoyaltySnapshot(loyalty, user = AppState.user) {
  const snapshot = normalizeLoyalty(loyalty, user || {});
  if (!snapshot || !user) return user;
  user.loyaltyPoints = snapshot.points_balance;
  user.loyaltyTier = snapshot.tier;
  user.loyaltyTierLabel = snapshot.tier_label;
  user.loyalty = snapshot;
  return user;
}

function loyaltyPointsRequired(total) {
  return Math.max(0, Math.ceil(Number(total || 0) / LOYALTY_POINT_VALUE_SYP));
}

function currentCustomerOrderState() {
  return {
    cart: AppState.cart || {},
    orderNotes: AppState.orderNotes || '',
    orderType: AppState.orderType || '',
    deliveryMeta: AppState.deliveryMeta || null,
    reservationMeta: AppState.reservationMeta || null
  };
}

function saveCurrentCustomerOrderState(customerId = AppState.user?.id) {
  if (!customerId) return;
  localStorage.setItem(customerOrderStateStorageKey(customerId), JSON.stringify(currentCustomerOrderState()));
}

function switchCustomerOrderState(customerId) {
  const nextId = customerId ? String(customerId) : '';
  const previousId = localStorage.getItem(STORAGE_KEYS.customerStateOwner)
    || (AppState.user?.id ? String(AppState.user.id) : '');
  if (previousId && previousId !== nextId) saveCurrentCustomerOrderState(previousId);

  const nextState = readCustomerOrderState(nextId, false);
  AppState.cart = nextState.cart;
  AppState.orderNotes = nextState.orderNotes;
  AppState.orderType = nextState.orderType;
  AppState.deliveryMeta = nextState.deliveryMeta;
  AppState.reservationMeta = nextState.reservationMeta;
  AppState.savedAddresses = normalizeSavedAddresses();
  AppState.hasPendingSavedAddressMigration = false;
  localStorage.removeItem(STORAGE_KEYS.savedAddressesOwner);
  localStorage.removeItem(STORAGE_KEYS.savedAddresses);
  try { sessionStorage.removeItem('taza_profile_avatar_preview'); } catch (_) {}

  if (nextId) localStorage.setItem(STORAGE_KEYS.customerStateOwner, nextId);
  else localStorage.removeItem(STORAGE_KEYS.customerStateOwner);
}

function persist() {
  localStorage.setItem(STORAGE_KEYS.theme, AppState.theme);
  localStorage.setItem(STORAGE_KEYS.lang, AppState.lang);
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(AppState.user));
  localStorage.setItem(STORAGE_KEYS.loggedIn, String(AppState.loggedIn));
  localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(AppState.cart));
  localStorage.setItem(STORAGE_KEYS.orderNotes, AppState.orderNotes || '');
  localStorage.setItem(STORAGE_KEYS.orderType, AppState.orderType);
  localStorage.setItem(STORAGE_KEYS.deliveryMeta, JSON.stringify(AppState.deliveryMeta));
  localStorage.setItem(STORAGE_KEYS.savedAddresses, JSON.stringify(AppState.savedAddresses));
  localStorage.setItem(STORAGE_KEYS.reservationMeta, JSON.stringify(AppState.reservationMeta));
  if (AppState.loggedIn && AppState.user?.id) {
    localStorage.setItem(STORAGE_KEYS.customerStateOwner, String(AppState.user.id));
    saveCurrentCustomerOrderState(AppState.user.id);
  }
  if (AppState.token) localStorage.setItem(STORAGE_KEYS.token, AppState.token);
  else localStorage.removeItem(STORAGE_KEYS.token);
  if (typeof TazaCookies !== 'undefined') TazaCookies.syncPreferences?.();
}

function loyaltyTierLabel(tier) {
  const labels = {
    bronze: langText('🥉 برونزي', '🥉 Bronze'),
    silver: langText('🥈 فضي', '🥈 Silver'),
    gold: langText('🥇 ذهبي', '🥇 Gold'),
    platinum: langText('💎 بلاتينيوم', '💎 Platinum')
  };
  return labels[tier || 'bronze'] || labels.bronze;
}

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString('en-US')} SYP`;
}

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function langText(ar, en) {
  return AppState.lang === 'ar' ? ar : en;
}

function catalogItemName(item) {
  if (!item) return langText('منتج', 'Item');
  return AppState.lang === 'ar'
    ? (item.nameAr || item.name_ar || item.name)
    : (item.nameEn || item.name_en || item.name);
}

function catalogItemDescription(item) {
  if (!item) return '';
  return AppState.lang === 'ar'
    ? (item.descriptionAr || item.description_ar || item.description || '')
    : (item.descriptionEn || item.description_en || item.description || '');
}

function catalogItemSearchText(item) {
  return normalizeCatalogSearch([
    item?.name,
    item?.nameAr,
    item?.nameEn,
    item?.description,
    item?.descriptionAr,
    item?.descriptionEn,
    ...(item?.keywords || [])
  ].filter(Boolean).join(' '));
}

function normalizeCatalogSearch(value = '') {
  return String(value || '')
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function catalogSearchDistance(left = '', right = '') {
  const a = Array.from(left);
  const b = Array.from(right);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous = saved;
    }
  }
  return row[b.length];
}

function catalogSearchScore(item, rawQuery) {
  const query = normalizeCatalogSearch(rawQuery);
  const names = normalizeCatalogSearch([
    item?.name, item?.nameAr, item?.nameEn, item?.name_ar, item?.name_en
  ].filter(Boolean).join(' '));
  const descriptions = normalizeCatalogSearch([
    item?.description, item?.descriptionAr, item?.descriptionEn,
    item?.description_ar, item?.description_en, ...(item?.keywords || [])
  ].filter(Boolean).join(' '));
  return Math.max(
    catalogSearchTextScore(names, query),
    catalogSearchTextScore(descriptions, query) * .6
  );
}

function catalogSearchTextScore(text, query) {
  if (!query || !text) return 0;
  if (text === query) return 1;
  if (text.includes(query)) return .96;

  const queryTokens = query.split(' ');
  const candidateTokens = text.split(' ');
  const scores = queryTokens.map(needle => candidateTokens.reduce((best, candidate) => {
    if (candidate === needle) return 1;
    if (Math.min(Array.from(candidate).length, Array.from(needle).length) >= 3
      && (candidate.includes(needle) || needle.includes(candidate))) return Math.max(best, .88);
    const maxLength = Math.max(Array.from(needle).length, Array.from(candidate).length);
    if (maxLength < 3) return best;
    return Math.max(best, 1 - (catalogSearchDistance(needle, candidate) / maxLength));
  }, 0));
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function smartCatalogSearch(items = [], rawQuery = '') {
  const query = normalizeCatalogSearch(rawQuery);
  if (!query) return items.map(item => ({ item, score: 1, fuzzy: false }));
  return items
    .map(item => {
      const score = catalogSearchScore(item, query);
      return { item, score, fuzzy: !catalogItemSearchText(item).includes(query) };
    })
    .filter(match => match.score >= .54)
    .sort((a, b) => b.score - a.score);
}

function baseAssetOrigin() {
  return API_BASE.replace(/\/api\/?$/, '');
}

function assetUrl(url) {
  if (!url) return null;
  const value = String(url).trim();
  if (!value) return null;
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;

  const origin = baseAssetOrigin();
  try {
    const parsed = new URL(value, `${origin}/`);

    // روابط Laravel المخزنة قد تصل باسم localhost من APP_URL. على الهاتف
    // يشير localhost إلى الهاتف نفسه، لذلك نربط ملفات storage بعنوان الـ API
    // الذي نجح التطبيق في الاتصال به، مع إبقاء الروابط الخارجية كما هي.
    if (parsed.pathname.startsWith('/storage/')) {
      return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.href;
  } catch {
    return `${origin}/${value.replace(/^\/+/, '')}`;
  }
}

function isEmail(value) {
  const email = String(value || '').trim();
  return email.length <= 254
    && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(email);
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatSyrianPhone(value) {
  const digits = normalizePhone(value);
  if (!digits) return '';
  const subscriber = (digits.startsWith('09') ? digits.slice(2) : digits).slice(0, 8);
  const groups = ['09'];
  if (subscriber.length) groups.push(subscriber.slice(0, 2));
  if (subscriber.length > 2) groups.push(subscriber.slice(2, 5));
  if (subscriber.length > 5) groups.push(subscriber.slice(5, 8));
  return groups.join(' ');
}

function isPhone(value) {
  const phone = String(value || '').trim();
  return /^09\d{8}$/.test(phone) || /^09 \d{2} \d{3} \d{3}$/.test(phone);
}

function normalizeFullName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isFullName(value) {
  const name = normalizeFullName(value);
  return name.length >= 2
    && name.length <= 100
    && /^[\p{L}\p{M}]+(?:[ '’.-][\p{L}\p{M}]+)*$/u.test(name);
}

function isStrongPassword(value) {
  const password = String(value || '');
  return password.length >= 8 && password.length <= 128 && /\p{L}/u.test(password) && /\p{N}/u.test(password);
}

function isSafeCustomerText(value, { required = false, min = 1, max = 500 } = {}) {
  const text = String(value || '').trim();
  if (!text) return !required;
  return text.length >= min
    && text.length <= max
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)
    && /[\p{L}\p{N}]/u.test(text);
}

function hardenCustomerInputs(root = document) {
  const limits = {
    full_name: 100, name: 100, identifier: 254,
    email: 254, register_email: 254,
    phone: 13, register_phone: 13,
    address: 500, city: 500, details: 500, bio: 500,
    password: 128, register_password: 128, register_confirm: 128,
    current_password: 128, new_password: 128,
    new_password_confirmation: 128, confirm_password: 128,
    profile_current_password: 128, comment: 500, feedback: 500,
  };
  $$('input, textarea', root).forEach(field => {
    const key = field.name || field.id || '';
    const inferred = field.matches('[data-chat-input]') ? 1000
      : field.matches('[data-menu-search]') ? 100
      : field.matches('[data-delivery-address]') ? 500
      : null;
    const limit = limits[key] || inferred;
    if (limit && field.maxLength < 0) field.maxLength = limit;
    if (field.type === 'tel') {
      field.inputMode = 'numeric';
      field.pattern = '09 [0-9]{2} [0-9]{3} [0-9]{3}';
      field.maxLength = 13;
      if (field.value) field.value = formatSyrianPhone(field.value);
      field.addEventListener('input', () => {
        field.value = formatSyrianPhone(field.value);
        const complete = !field.value || isPhone(field.value);
        const message = langText('أكمل الرقم: 09 ثم خانتان ثم 3 خانات ثم 3 خانات', 'Complete the number: 09, then 2, 3, and 3 digits');
        field.setCustomValidity(complete ? '' : message);
        if (field.name === 'register_phone') {
          const error = $('.error.phone', field.form || document);
          if (error && field.value && !complete) error.textContent = message;
          else if (error && complete && !field.form?.register_email?.value) error.textContent = '';
        }
      });
    }
  });
}

function friendlyError(error, fallbackAr = 'تعذر تنفيذ العملية، يرجى التحقق من البيانات والمحاولة مرة أخرى', fallbackEn = 'Unable to complete the action. Please check your details and try again') {
  const raw = String(error?.message || '');
  if (!raw || /server|backend|endpoint|database|الخادم|الباك|قاعدة/i.test(raw)) return langText(fallbackAr, fallbackEn);
  return raw;
}

function normalizeBool(value, fallback = true) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function restaurantIsOpen() {
  if (!AppState.restaurant) return true;
  return normalizeBool(AppState.restaurant.is_open, true);
}

function restaurantStatusText() {
  return restaurantIsOpen()
    ? langText('مفتوح الآن', 'Open now')
    : langText('مغلق الآن', 'Closed now');
}

function currentOrderTypeLabel() {
  const map = {
    ordinary: ['طلب عادي', 'Ordinary order'],
    delivery: ['طلب توصيل', 'Delivery order'],
    reservation: ['حجز طاولة', 'Table reservation']
  };
  return AppState.orderType ? langText(map[AppState.orderType]?.[0], map[AppState.orderType]?.[1]) : langText('اختر نوع الطلب', 'Choose order type');
}

function orderTypeMeta(type = AppState.orderType) {
  const map = {
    ordinary: {
      icon: '01',
      title: ['طلب عادي', 'Ordinary order'],
      hint: ['استلام من المطعم', 'Restaurant pickup']
    },
    delivery: {
      icon: '02',
      title: ['طلب توصيل', 'Delivery order'],
      hint: ['مع تحديد الموقع', 'With location']
    },
    reservation: {
      icon: '03',
      title: ['حجز طاولة', 'Table reservation'],
      hint: ['طاولة ووقت', 'Table and time']
    }
  };
  return map[type] || {
    icon: '--',
    title: ['اختر نوع الطلب', 'Choose order type'],
    hint: ['حدد المسار المناسب', 'Select a path']
  };
}

function renderOrderBadges() {
  const meta = orderTypeMeta(AppState.orderType);
  $$('[data-order-badge]').forEach(el => {
    el.dataset.orderBadge = AppState.orderType || 'unset';
    el.innerHTML = `
      <span class="order-badge-icon" aria-hidden="true">${esc(meta.icon)}</span>
      <span class="order-badge-copy">
        <strong>${esc(langText(meta.title[0], meta.title[1]))}</strong>
        <small>${esc(langText(meta.hint[0], meta.hint[1]))}</small>
      </span>`;
  });
}

function setOrderType(type) {
  if (!['ordinary', 'delivery', 'reservation'].includes(type)) return;
  AppState.orderType = type;
  persist();
  $$('[data-order-select]').forEach(el => { el.value = type; });
  renderOrderBadges();
}

function setOrderNotes(notes = '') {
  AppState.orderNotes = String(notes || '').slice(0, 500);
  persist();
  $$('[data-order-notes]').forEach(el => {
    if (el.value !== AppState.orderNotes) el.value = AppState.orderNotes;
  });
}

const toastKinds = {
  success: { title: ['تم بنجاح', 'Success'], icon: 'OK', tone: 'success' },
  error: { title: ['حدث خطأ', 'Something went wrong'], icon: '!', tone: 'error' },
  warning: { title: ['تنبيه', 'Heads up'], icon: '!', tone: 'warning' },
  info: { title: ['إشعار جديد', 'New notification'], icon: 'i', tone: 'info' },
  meal: { title: ['وجبة جديدة', 'New meal'], icon: 'M', tone: 'meal' },
  cart: { title: ['تحديث السلة', 'Cart update'], icon: '+', tone: 'cart' },
  offer: { title: ['عرض جديد', 'New offer'], icon: '%', tone: 'offer' },
  payment: { title: ['تم الدفع', 'Payment confirmed'], icon: '$', tone: 'payment' },
  order_received: { title: ['تم تلقي الطلب', 'Order received'], icon: '#', tone: 'order' },
  order_accepted: { title: ['تم قبول الطلب', 'Order accepted'], icon: 'OK', tone: 'accepted' },
  order_started: { title: ['بدأ تحضير الطلب', 'Order preparation started'], icon: '...', tone: 'started' },
  delivery_started: { title: ['بدأ التوصيل', 'Delivery started'], icon: '>', tone: 'delivery' },
  order_completed: { title: ['تم إنجاز الطلب', 'Order completed'], icon: 'OK', tone: 'completed' },
  reservation: { title: ['تم تأكيد الحجز', 'Reservation confirmed'], icon: 'R', tone: 'reservation' },
  auth: { title: ['تحديث الحساب', 'Account update'], icon: '@', tone: 'auth' },
  location: { title: ['تحديث الموقع', 'Location update'], icon: '*', tone: 'location' }
};

function normalizeToastKind(kind = '') {
  return String(kind || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function inferToastKind(message = '') {
  const text = String(message || '').toLowerCase();
  if (/تعذر|خطأ|فشل|غير صحيحة|خارج نطاق|انتهت مهلة|failed|error|invalid|unable|outside|timeout/.test(text)) return 'error';
  if (/فارغة|أولاً|اولا|اختر|تحقق|empty|choose|confirm|please/.test(text)) return 'warning';
  if (/دفع|دفعتك|كاش|payment|paid|cash/.test(text)) return 'payment';
  if (/عرض|خصم|offer|discount/.test(text)) return 'offer';
  if (/وجبة|العنصر|منتج|السلة|cart|meal|item|product/.test(text)) return /السلة|cart/.test(text) ? 'cart' : 'meal';
  if (/توصيل|السائق|الطريق|delivery|driver|on the way/.test(text)) return 'delivery_started';
  if (/موقع|الخريطة|location|map/.test(text)) return 'location';
  if (/حجز|طاولة|reservation|table/.test(text)) return 'reservation';
  if (/اكتمال|إنجاز|انجاز|completed|delivered/.test(text)) return 'order_completed';
  if (/قبول|مقبول|confirmed|accepted/.test(text)) return 'order_accepted';
  if (/تحضير|processing|preparing|started/.test(text)) return 'order_started';
  if (/طلب|order/.test(text)) return 'order_received';
  if (/تسجيل|حساب|كلمة المرور|profile|login|password|account/.test(text)) return 'auth';
  if (/تم|success|saved|sent|created|updated/.test(text)) return 'success';
  return 'info';
}

function toastMeta(kind, message, title) {
  const normalized = normalizeToastKind(kind) || inferToastKind(message);
  const meta = toastKinds[normalized] || toastKinds[inferToastKind(message)] || toastKinds.info;
  return {
    kind: normalized in toastKinds ? normalized : inferToastKind(message),
    title: title || langText(meta.title[0], meta.title[1]),
    icon: meta.icon,
    tone: meta.tone
  };
}

function ensureToastStack(position = 'bottom') {
  let stack = position === 'top' ? $('[data-catalog-toast]') : $('[data-toast]');
  if (!stack && position === 'top') {
    stack = document.createElement('div');
    stack.className = 'toast';
    stack.dataset.catalogToast = '';
    document.body.appendChild(stack);
  }
  if (!stack) return null;
  stack.classList.add('toast-stack');
  stack.classList.toggle('toast-stack-top', position === 'top');
  stack.setAttribute('aria-live', 'polite');
  stack.setAttribute('aria-atomic', 'false');
  stack.setAttribute('role', 'status');
  if (stack.dataset.toastReady !== 'true') {
    stack.dataset.toastReady = 'true';
    stack.textContent = '';
  }
  return stack;
}

function showToast(message, options = {}) {
  const config = typeof options === 'string' ? { kind: options } : (options || {});
  const stack = ensureToastStack(config.position || 'bottom');
  if (!stack) return;
  const text = typeof message === 'object' && message !== null ? (message.message || message.body || '') : message;
  const body = String(text || '').trim();
  if (!body) return;

  const meta = toastMeta(config.kind || config.type, body, config.title);
  const duplicate = [...stack.querySelectorAll('.toast-item:not(.leaving)')]
    .find(item => item.dataset.kind === meta.kind && item.dataset.message === body);
  if (duplicate) {
    duplicate.classList.remove('cruising');
    duplicate.classList.add('show');
    return;
  }

  const duration = Math.max(3000, Math.min(5000, Number(config.duration || config.timeout || (meta.kind === 'error' ? 5000 : 4200))));
  const item = document.createElement('article');
  item.className = `toast-item toast-${meta.kind}`;
  item.dataset.kind = meta.kind;
  item.dataset.message = body;
  item.style.setProperty('--toast-duration', `${duration}ms`);
  item.innerHTML = `
    <div class="toast-icon" aria-hidden="true">${esc(meta.icon)}</div>
    <div class="toast-copy">
      <strong>${esc(meta.title)}</strong>
      <p>${esc(body)}</p>
    </div>
    <button class="toast-close" type="button" aria-label="${esc(langText('إغلاق الإشعار', 'Close notification'))}" title="${esc(langText('إغلاق', 'Close'))}">×</button>
    <span class="toast-progress" aria-hidden="true"></span>
  `;
  stack.appendChild(item);
  const enterDuration = 380;
  const pauseDuration = 150;
  void item.offsetWidth;
  item.__toastEnterTimer = setTimeout(() => item.classList.add('show'), 16);

  const dismiss = () => {
    if (item.classList.contains('leaving')) return;
    item.classList.remove('show');
    item.classList.remove('cruising');
    item.classList.add('leaving');
    clearTimeout(item.__toastEnterTimer);
    clearTimeout(item.__toastTimer);
    clearTimeout(item.__toastCruiseTimer);
    setTimeout(() => item.remove(), 300);
  };
  item.querySelector('.toast-close')?.addEventListener('click', dismiss);
  if (config.onClick || config.href) {
    item.classList.add('toast-clickable');
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `${meta.title}: ${body}. ${langText('افتح التفاصيل', 'Open details')}`);
    const activate = async () => {
      if (typeof config.onClick === 'function') await config.onClick();
      else if (config.href) location.href = config.href;
    };
    item.addEventListener('click', event => {
      if (event.target.closest('.toast-close')) return;
      activate();
    });
    item.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      activate();
    });
  }
  item.__toastCruiseTimer = setTimeout(() => item.classList.add('cruising'), enterDuration + pauseDuration);
  item.__toastTimer = setTimeout(dismiss, enterDuration + pauseDuration + duration);

  const maxVisible = Number(config.maxVisible || 4);
  [...stack.querySelectorAll('.toast-item')].slice(0, -maxVisible).forEach(oldItem => oldItem.remove());
  return item;
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  const timeoutMs = Number(options.timeoutMs || 7000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, ...restOptions } = options;
  const fetchOptions = { ...restOptions, headers, signal: controller.signal };
  const publicRecoveryEndpoint = [
    '/customer/auth/forgot-password',
    '/customer/auth/reset-password'
  ].includes(path);
  if (AppState.token && !publicRecoveryEndpoint) headers.set('Authorization', `Bearer ${AppState.token}`);

  if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    fetchOptions.body = JSON.stringify(fetchOptions.body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, fetchOptions);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(langText('انتهت مهلة الاتصال، حاول مرة أخرى', 'Connection timed out. Try again'));
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  let payload = null;
  try { payload = await response.json(); } catch (_) { payload = null; }

  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.message || langText('تعذر تنفيذ الطلب', 'Request failed'));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload?.data ?? payload;
}

async function safeApi(path, options = {}) {
  try {
    return await apiFetch(path, options);
  } catch (error) {
    return null;
  }
}
