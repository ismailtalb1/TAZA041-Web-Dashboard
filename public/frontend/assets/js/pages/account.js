// Notifications, profile, orders, and status helpers
function localizedField(source, names, fallback = '') {
  if (!source) return fallback;
  const variant = localizedVariant(source, names);
  if (variant) return variant;
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    if (source[name]) return source[name];
  }
  return fallback;
}

function localizedVariant(source, names) {
  if (!source) return '';
  const lang = AppState.lang === 'ar' ? 'ar' : 'en';
  const suffix = lang === 'ar' ? 'Ar' : 'En';
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    const value = source[name];
    if (value && typeof value === 'object') {
      if (value[lang]) return value[lang];
      if (value.value) {
        const scalar = String(value.value);
        const hasArabic = /[\u0600-\u06FF]/.test(scalar);
        const hasLatin = /[A-Za-z]/.test(scalar);
        if (lang === 'en' && hasArabic) return '';
        if (lang === 'ar' && hasLatin) return '';
        return scalar;
      }
    }
    const candidates = [
      `${name}_${lang}`,
      `${lang}_${name}`,
      `${name}${suffix}`
    ];
    for (const key of candidates) {
      if (source[key]) return source[key];
    }
    if (source.translations?.[lang]?.[name]) return source.translations[lang][name];
  }
  return '';
}

function normalizedLookupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[#:.,؛،!?؟()[\]{}]/g, '')
    .replace(/[\s-]+/g, '_');
}

function mappedText(value, dictionary, fallback = '') {
  const key = normalizedLookupKey(value);
  if (!key) return fallback;
  const entry = dictionary[key];
  if (!entry) return fallback;
  return langText(entry.ar, entry.en);
}

function translateKnownFreeText(value, pairs, generic) {
  let text = String(value || '').trim();
  if (!text) return '';
  const patterned = translateNotificationPattern(text);
  if (patterned) return patterned;
  let changed = false;
  pairs.forEach(([ar, en]) => {
    const from = AppState.lang === 'ar' ? en : ar;
    const to = AppState.lang === 'ar' ? ar : en;
    const next = text.split(from).join(to);
    if (next !== text) changed = true;
    text = next;
  });
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (changed && AppState.lang === 'en' && !hasArabic) return text;
  if (changed && AppState.lang === 'ar' && !hasLatin) return text;
  if (AppState.lang === 'en' && hasArabic) return generic.en;
  if (AppState.lang === 'ar' && hasLatin) return generic.ar;
  return text;
}

function normalizeNotificationAmount(value = '') {
  return String(value)
    .replace(/\s*ل\.س\s*/g, ' SYP ')
    .replace(/\s+/g, ' ')
    .trim();
}

function translateNotificationPattern(text) {
  const value = String(text || '').trim();
  if (!value) return '';

  const payment = value.match(/^تم استلام دفعتك بمبلغ\s+(.+?)(?:\s+عبر\s+(.+?))?(?:\s+[—-]\s+كسبت\s+(.+?)\s+نقطة ولاء\s*(🎁)?)?$/);
  if (payment) {
    if (AppState.lang === 'ar') return value;
    const amount = normalizeNotificationAmount(payment[1]);
    const method = translatePaymentMethod(payment[2] || '');
    const points = payment[3] ? String(payment[3]).trim() : '';
    const methodPart = method ? ` via ${method}` : '';
    const pointsPart = points ? ` - you earned ${points} loyalty points${payment[4] ? ` ${payment[4]}` : ''}` : '';
    return `Your payment of ${amount}${methodPart} was received${pointsPart}.`;
  }

  const paymentTitle = value.match(/^✅?\s*تم استلام دفعتك$/);
  if (paymentTitle) return langText('تم استلام دفعتك', 'Payment received');

  const orderReceived = value.match(/^تم استلام طلبك بنجاح(?:\s+وسيتم مراجعته قريباً)?$/);
  if (orderReceived) return langText('تم استلام طلبك بنجاح وسيتم مراجعته قريباً', 'Your order was received successfully and will be reviewed soon.');

  const relative = translateRelativeTime(value);
  if (relative) return relative;

  return '';
}

function translatePaymentMethod(value = '') {
  const key = normalizedLookupKey(value);
  const methods = {
    syriatel_cash: { ar: 'سيريتل كاش', en: 'Syriatel Cash' },
    سيريتل_كاش: { ar: 'سيريتل كاش', en: 'Syriatel Cash' },
    sham_cash: { ar: 'شام كاش', en: 'Sham Cash' },
    شام_كاش: { ar: 'شام كاش', en: 'Sham Cash' },
    loyalty_points: { ar: 'نقاط الولاء', en: 'Loyalty points' },
    نقاط_الولاء: { ar: 'نقاط الولاء', en: 'Loyalty points' },
    test_payment: { ar: 'دفع اختباري', en: 'Test payment' },
    دفع_اختباري: { ar: 'دفع اختباري', en: 'Test payment' },
    cash: { ar: 'كاش', en: 'Cash' },
    كاش: { ar: 'كاش', en: 'Cash' }
  };
  return mappedText(key, methods, value);
}

function translateRelativeTime(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const ar = text.match(/^منذ\s+(\d+)\s+(دقيقة|دقائق|ساعة|ساعات|يوم|أيام)$/);
  if (ar) {
    const count = Number(ar[1]);
    const unit = ar[2];
    if (AppState.lang === 'ar') return text;
    if (unit.startsWith('دقيقة') || unit === 'دقائق') return `${count} ${count === 1 ? 'minute' : 'minutes'} ago`;
    if (unit.startsWith('ساعة') || unit === 'ساعات') return `${count} ${count === 1 ? 'hour' : 'hours'} ago`;
    return `${count} ${count === 1 ? 'day' : 'days'} ago`;
  }
  const en = text.match(/^(\d+)\s+(minute|minutes|hour|hours|day|days)\s+ago$/i);
  if (en) {
    const count = Number(en[1]);
    const unit = en[2].toLowerCase();
    if (AppState.lang === 'en') return text;
    if (unit.startsWith('minute')) return `منذ ${count} ${count === 1 ? 'دقيقة' : 'دقائق'}`;
    if (unit.startsWith('hour')) return `منذ ${count} ${count === 1 ? 'ساعة' : 'ساعات'}`;
    return `منذ ${count} ${count === 1 ? 'يوم' : 'أيام'}`;
  }
  return '';
}

const orderTypeText = {
  ordinary: { ar: 'طلب عادي', en: 'Ordinary order' },
  ordinary_order: { ar: 'طلب عادي', en: 'Ordinary order' },
  normal: { ar: 'طلب عادي', en: 'Ordinary order' },
  normal_order: { ar: 'طلب عادي', en: 'Ordinary order' },
  regular: { ar: 'طلب عادي', en: 'Ordinary order' },
  regular_order: { ar: 'طلب عادي', en: 'Ordinary order' },
  default: { ar: 'طلب عادي', en: 'Ordinary order' },
  pickup: { ar: 'طلب عادي', en: 'Pickup order' },
  takeaway: { ar: 'طلب عادي', en: 'Takeaway order' },
  take_away: { ar: 'طلب عادي', en: 'Takeaway order' },
  restaurant: { ar: 'طلب عادي', en: 'Restaurant order' },
  restaurant_order: { ar: 'طلب عادي', en: 'Restaurant order' },
  dine_in: { ar: 'طلب عادي', en: 'Dine-in order' },
  dinein: { ar: 'طلب عادي', en: 'Dine-in order' },
  delivery: { ar: 'طلب توصيل', en: 'Delivery order' },
  delivery_order: { ar: 'طلب توصيل', en: 'Delivery order' },
  reservation: { ar: 'حجز طاولة', en: 'Table reservation' },
  table_reservation: { ar: 'حجز طاولة', en: 'Table reservation' },
  reservation_order: { ar: 'حجز طاولة', en: 'Table reservation' },
  طلب_عادي: { ar: 'طلب عادي', en: 'Ordinary order' },
  طلب_توصيل: { ar: 'طلب توصيل', en: 'Delivery order' },
  حجز_طاولة: { ar: 'حجز طاولة', en: 'Table reservation' }
};

const orderStatusText = {
  created: { ar: 'تم الاستلام', en: 'Received' },
  received: { ar: 'تم الاستلام', en: 'Received' },
  order_received: { ar: 'تم الاستلام', en: 'Received' },
  pending: { ar: 'معلق', en: 'Pending' },
  confirmed: { ar: 'مؤكد', en: 'Confirmed' },
  accepted: { ar: 'تم الاستلام', en: 'Accepted' },
  processing: { ar: 'قيد التحضير', en: 'Processing' },
  preparing: { ar: 'قيد التحضير', en: 'Preparing' },
  order_processing: { ar: 'قيد التحضير', en: 'Processing' },
  order_started: { ar: 'قيد التحضير', en: 'Preparing' },
  ready: { ar: 'قيد التجهيز', en: 'Preparing' },
  on_the_way: { ar: 'في الطريق', en: 'On the way' },
  out_for_delivery: { ar: 'في الطريق', en: 'Out for delivery' },
  delivery_started: { ar: 'في الطريق', en: 'On the way' },
  in_delivery: { ar: 'في الطريق', en: 'On the way' },
  delivered: { ar: 'تم التسليم', en: 'Delivered' },
  seated: { ar: 'الجلسة قائمة', en: 'Session active' },
  no_show: { ar: 'لم يحضر', en: 'No show' },
  completed: { ar: 'مكتمل', en: 'Completed' },
  paid: { ar: 'مدفوع', en: 'Paid' },
  cancelled: { ar: 'ملغى', en: 'Canceled' },
  canceled: { ar: 'ملغى', en: 'Canceled' },
  تم_الاستلام: { ar: 'تم الاستلام', en: 'Received' },
  قيد_الانتظار: { ar: 'قيد الانتظار', en: 'Pending' },
  مؤكد: { ar: 'مؤكد', en: 'Confirmed' },
  تم_القبول: { ar: 'تم الاستلام', en: 'Accepted' },
  قيد_التحضير: { ar: 'قيد التحضير', en: 'Processing' },
  جاهز: { ar: 'جاهز', en: 'Ready' },
  في_الطريق: { ar: 'في الطريق', en: 'On the way' },
  بدأ_التوصيل: { ar: 'في الطريق', en: 'On the way' },
  تم_التسليم: { ar: 'تم التسليم', en: 'Delivered' },
  مكتمل: { ar: 'مكتمل', en: 'Completed' },
  مدفوع: { ar: 'مدفوع', en: 'Paid' },
  ملغى: { ar: 'ملغى', en: 'Canceled' }
};

const notificationTitleText = {
  notification: { ar: 'إشعار جديد', en: 'New notification' },
  new_notification: { ar: 'إشعار جديد', en: 'New notification' },
  order_update: { ar: 'تحديث على الطلب', en: 'Order update' },
  تحديث_على_الطلب: { ar: 'تحديث على الطلب', en: 'Order update' },
  تم_تحديث_الطلب: { ar: 'تم تحديث الطلب', en: 'Order updated' },
  order_created: { ar: 'تم إنشاء الطلب', en: 'Order created' },
  new_order: { ar: 'طلب جديد', en: 'New order' },
  order: { ar: 'طلب', en: 'Order' },
  طلب_جديد: { ar: 'طلب جديد', en: 'New order' },
  طلب: { ar: 'طلب', en: 'Order' },
  تم_إنشاء_الطلب: { ar: 'تم إنشاء الطلب', en: 'Order created' },
  order_confirmed: { ar: 'تم تأكيد الطلب', en: 'Order confirmed' },
  تم_تأكيد_الطلب: { ar: 'تم تأكيد الطلب', en: 'Order confirmed' },
  order_accepted: { ar: 'تم قبول الطلب', en: 'Order accepted' },
  تم_قبول_الطلب: { ar: 'تم قبول الطلب', en: 'Order accepted' },
  order_started: { ar: 'بدأ تحضير الطلب', en: 'Order preparation started' },
  order_processing: { ar: 'بدأ تحضير الطلب', en: 'Order preparation started' },
  بدأ_تحضير_الطلب: { ar: 'بدأ تحضير الطلب', en: 'Order preparation started' },
  delivery_started: { ar: 'بدأ التوصيل', en: 'Delivery started' },
  تم_البدء_بعملية_التوصيل: { ar: 'بدأ التوصيل', en: 'Delivery started' },
  order_completed: { ar: 'تم اكتمال الطلب', en: 'Order completed' },
  تم_اكتمال_الطلب: { ar: 'تم اكتمال الطلب', en: 'Order completed' },
  order_cancelled: { ar: 'تم إلغاء الطلب', en: 'Order canceled' },
  order_canceled: { ar: 'تم إلغاء الطلب', en: 'Order canceled' },
  تم_إلغاء_الطلب: { ar: 'تم إلغاء الطلب', en: 'Order canceled' },
  offer: { ar: 'عرض جديد', en: 'New offer' },
  new_offer: { ar: 'عرض جديد', en: 'New offer' },
  عرض_جديد: { ar: 'عرض جديد', en: 'New offer' },
  meal: { ar: 'وجبة جديدة', en: 'New meal' },
  new_meal: { ar: 'وجبة جديدة', en: 'New meal' },
  وجبة_جديدة: { ar: 'وجبة جديدة', en: 'New meal' },
  loyalty: { ar: 'تحديث نقاط الولاء', en: 'Loyalty update' },
  تحديث_نقاط_الولاء: { ar: 'تحديث نقاط الولاء', en: 'Loyalty update' },
  payment: { ar: 'تحديث الدفع', en: 'Payment update' },
  payment_confirmed: { ar: 'تم تأكيد الدفع', en: 'Payment confirmed' },
  تم_تأكيد_الدفع: { ar: 'تم تأكيد الدفع', en: 'Payment confirmed' }
};

const notificationMessageText = {
  order_created: { ar: 'تم إنشاء طلبك بنجاح وسيظهر تحديثه هنا.', en: 'Your order was created successfully and updates will appear here.' },
  order_confirmed: { ar: 'تم تأكيد طلبك وبدأت معالجته.', en: 'Your order has been confirmed and is being processed.' },
  order_accepted: { ar: 'تم قبول طلبك وبدأ الفريق بتجهيزه.', en: 'Your order was accepted and the team started preparing it.' },
  order_started: { ar: 'بدأ تحضير طلبك الآن.', en: 'Your order preparation has started.' },
  order_processing: { ar: 'بدأ تحضير طلبك الآن.', en: 'Your order preparation has started.' },
  delivery_started: { ar: 'بدأت عملية التوصيل وسيصلك الطلب قريباً.', en: 'Delivery has started and your order will arrive soon.' },
  order_completed: { ar: 'تم اكتمال طلبك بنجاح.', en: 'Your order has been completed successfully.' },
  order_cancelled: { ar: 'تم إلغاء الطلب.', en: 'The order has been canceled.' },
  order_canceled: { ar: 'تم إلغاء الطلب.', en: 'The order has been canceled.' },
  new_order: { ar: 'تم إنشاء طلب جديد.', en: 'A new order has been created.' },
  تم_إنشاء_طلبك_بنجاح: { ar: 'تم إنشاء طلبك بنجاح.', en: 'Your order was created successfully.' },
  تم_تأكيد_طلبك: { ar: 'تم تأكيد طلبك.', en: 'Your order has been confirmed.' },
  تم_اكتمال_طلبك_بنجاح: { ar: 'تم اكتمال طلبك بنجاح.', en: 'Your order has been completed successfully.' },
  تم_إلغاء_الطلب: { ar: 'تم إلغاء الطلب.', en: 'The order has been canceled.' },
  payment_confirmed: { ar: 'تم تأكيد الدفع بنجاح.', en: 'Payment was confirmed successfully.' }
};

const notificationTranslationPairs = [
  ['طلب عادي', 'Ordinary order'],
  ['طلب توصيل', 'Delivery order'],
  ['حجز طاولة', 'Table reservation'],
  ['تحديث على الطلب', 'Order update'],
  ['تم تحديث الطلب', 'Order updated'],
  ['تم تحديث حالة الطلب', 'Order status updated'],
  ['حالة الطلب', 'Order status'],
  ['تم إنشاء الطلب', 'Order created'],
  ['تم إنشاء طلب جديد', 'New order created'],
  ['طلب جديد', 'New order'],
  ['تم إنشاء طلبك', 'Your order was created'],
  ['تم استلام طلبك بنجاح وسيتم مراجعته قريباً', 'Your order was received successfully and will be reviewed soon'],
  ['تم استلام طلبك بنجاح', 'Your order was received successfully'],
  ['سيتم مراجعته قريباً', 'it will be reviewed soon'],
  ['تم تأكيد الطلب', 'Order confirmed'],
  ['تم تأكيد طلبك', 'Your order was confirmed'],
  ['تم اكتمال الطلب', 'Order completed'],
  ['تم اكتمال طلبك', 'Your order was completed'],
  ['تم إلغاء الطلب', 'Order canceled'],
  ['تم إلغاء طلبك', 'Your order was canceled'],
  ['تم إرسال طلب الإلغاء', 'Cancel request sent'],
  ['تم الدفع', 'Payment completed'],
  ['تم استلام دفعتك', 'Your payment was received'],
  ['تم تأكيد الدفع', 'Payment confirmed'],
  ['سيريتل كاش', 'Syriatel Cash'],
  ['الدفع', 'payment'],
  ['قيد الانتظار', 'Pending'],
  ['قيد التحضير', 'Processing'],
  ['في الطريق', 'On the way'],
  ['تم التسليم', 'Delivered'],
  ['مكتمل', 'Completed'],
  ['ملغى', 'Canceled'],
  ['جاهز', 'Ready'],
  ['مؤكد', 'Confirmed'],
  ['عرض جديد', 'New offer'],
  ['العروض', 'offers'],
  ['عرض', 'offer'],
  ['تحديث نقاط الولاء', 'Loyalty update'],
  ['نقاط الولاء', 'loyalty points'],
  ['إشعار جديد', 'New notification'],
  ['طلبك', 'your order'],
  ['الطلب', 'the order'],
  ['طلب', 'order']
];

function notificationTitle(item) {
  const explicit = localizedVariant(item, ['title', 'notification_title']);
  if (explicit) return explicit;
  const mapped = mappedText(item.type || item.kind || item.title, notificationTitleText, '');
  if (mapped) return mapped;
  return translateKnownFreeText(item.title || '', notificationTranslationPairs, { ar: 'إشعار جديد', en: 'New notification' }) || langText('إشعار جديد', 'New notification');
}

function notificationMessage(item) {
  const explicit = localizedVariant(item, ['message', 'body', 'notification_message']);
  if (explicit) return explicit;
  const raw = item.message || item.body || '';
  const mapped = mappedText(item.type || item.kind || raw, notificationMessageText, '');
  if (mapped) return mapped;
  return translateKnownFreeText(raw, notificationTranslationPairs, { ar: 'يوجد تحديث جديد على حسابك.', en: 'There is a new update on your account.' });
}

function notificationTime(item) {
  const raw = item.created_at || item.time || '';
  return translateRelativeTime(raw) || raw;
}

function notificationKind(item = {}) {
  const key = normalizedLookupKey([
    item.type,
    item.kind,
    item.status,
    item.title,
    item.message,
    item.body
  ].filter(Boolean).join(' '));
  const explicit = {
    payment: 'payment',
    payment_confirmed: 'payment',
    paid: 'payment',
    offer: 'offer',
    new_offer: 'offer',
    meal: 'meal',
    new_meal: 'meal',
    new_product: 'meal',
    order_created: 'order_received',
    new_order: 'order_received',
    order_received: 'order_received',
    order_confirmed: 'order_accepted',
    order_accepted: 'order_accepted',
    confirmed: 'order_accepted',
    accepted: 'order_accepted',
    processing: 'order_started',
    preparing: 'order_started',
    order_processing: 'order_started',
    delivery: 'delivery_started',
    delivery_started: 'delivery_started',
    on_the_way: 'delivery_started',
    delivered: 'order_completed',
    completed: 'order_completed',
    order_completed: 'order_completed',
    reservation: 'reservation',
    reservation_confirmed: 'reservation',
    loyalty: 'success',
    cancelled: 'error',
    canceled: 'error',
    order_cancelled: 'error',
    order_canceled: 'error'
  };
  if (explicit[key]) return explicit[key];
  if (typeof inferToastKind === 'function') return inferToastKind(`${item.title || ''} ${item.message || item.body || ''}`);
  return 'info';
}

function notificationKindIcon(kind) {
  const icons = {
    payment: '$',
    offer: '%',
    meal: 'M',
    cart: '+',
    order_received: '#',
    order_accepted: 'OK',
    order_started: '...',
    delivery_started: '>',
    order_completed: 'OK',
    reservation: 'R',
    success: 'OK',
    error: '!',
    warning: '!',
    auth: '@',
    location: '*',
    info: 'i'
  };
  return icons[kind] || icons.info;
}

function notificationCategory(item = {}) {
  const type = normalizedLookupKey(item.type || item.kind || '');
  const text = normalizedLookupKey([
    item.type,
    item.kind,
    item.title,
    item.message,
    item.body
  ].filter(Boolean).join(' '));
  const data = item.data || {};

  if ([
    'order_update',
    'delivery_update',
    'reservation_update',
    'order_created',
    'new_order',
    'order_received',
    'order_confirmed',
    'order_accepted',
    'order_started',
    'order_processing',
    'delivery_started',
    'reservation_confirmed'
  ].includes(type) || data.order_id || data.delivery_order_id || data.reservation_id) return 'orders';

  if (['new_offer', 'offer'].includes(type) || data.offer_id || /عرض|العروض|offer/.test(text)) return 'offers';
  if (['payment_update', 'payment', 'payment_confirmed', 'paid'].includes(type) || data.payment_id || /دفع|دفعتك|payment|paid/.test(text)) return 'payment';
  if (['loyalty_tier_upgrade', 'loyalty', 'loyalty_update'].includes(type) || data.points || data.loyalty_points_earned || /ولاء|loyalty|points/.test(text)) return 'loyalty';

  const kind = notificationKind(item);
  if (['order_received', 'order_accepted', 'order_started', 'delivery_started', 'order_completed', 'reservation'].includes(kind)) return 'orders';
  if (kind === 'offer') return 'offers';
  if (kind === 'payment') return 'payment';
  if (kind === 'success' && /ولاء|loyalty|points/.test(text)) return 'loyalty';
  return 'all';
}

function notificationMatchesFilter(item, filter) {
  return filter === 'all' || notificationCategory(item) === filter;
}

function notificationCardHtml(item) {
  const kind = notificationKind(item);
  const read = item.is_read || item.read;
  const target = typeof catalogNotificationTarget === 'function' ? catalogNotificationTarget(item) : '';
  return `
    <article class="notification-card notification-${esc(kind)} ${read ? '' : 'unread'}" data-kind="${esc(kind)}" data-note-id="${esc(item.id)}" ${target ? `data-notification-target="${esc(target)}" tabindex="0"` : ''}>
      <div class="notification-card-head">
        <div class="notification-title-row">
          <span class="notification-icon">${esc(item.icon || notificationKindIcon(kind))}</span>
          <h3>${esc(notificationTitle(item))}</h3>
        </div>
        ${read ? '' : '<span class="notification-dot"></span>'}
      </div>
      <p class="muted">${esc(notificationMessage(item))}</p>
      <div class="notification-card-foot">
        <small class="muted">${esc(notificationTime(item))}</small>
        ${target ? `<button class="btn btn-primary notification-open-link" type="button" data-open-linked-notification>${kind === 'offer' ? langText('عرض العرض', 'View offer') : langText('عرض الوجبة', 'View meal')}</button>` : ''}
        <button class="btn btn-ghost" data-mark-read="${esc(item.id)}">${read ? langText('تمت القراءة', 'Read') : langText('تعليم كمقروء', 'Mark as read')}</button>
      </div>
    </article>`;
}

function orderTypeLabel(order) {
  const explicit = localizedField(order, ['type_label', 'typeLabel'], '');
  const mapped = mappedText(order.type || explicit, orderTypeText, '');
  if (mapped) return mapped;
  return translateKnownFreeText(explicit || order.type || '', notificationTranslationPairs, { ar: 'طلب', en: 'Order' }) || langText('طلب', 'Order');
}

function orderTypeVisual(order = {}) {
  const type = order.type === 'ordinary' ? 'normal' : order.type;
  return ({
    normal: {
      key: 'normal', icon: '🍽️',
      caption: langText('استلام من المطعم', 'Restaurant pickup')
    },
    delivery: {
      key: 'delivery', icon: '🛵',
      caption: langText('إلى عنوانك', 'To your address')
    },
    reservation: {
      key: 'reservation', icon: '🪑',
      caption: langText('تجربة على الطاولة', 'Table experience')
    }
  })[type] || { key: 'normal', icon: '🍽️', caption: langText('طلب مطعم', 'Restaurant order') };
}

function orderCreatedLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return value || '';
  return date.toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'ar-SY', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function orderStatusLabel(order) {
  const unified = order.customer_status || order.customerStatus;
  if (unified?.key) {
    return AppState.lang === 'ar'
      ? (unified.label_ar || unified.label_en || unified.key)
      : (unified.label_en || unified.label_ar || unified.key);
  }
  const type = order.type === 'ordinary' ? 'normal' : order.type;
  const subtype = type === 'delivery' ? order.delivery?.status : (type === 'reservation' ? order.reservation?.status : '');
  const subtypeText = {
    assigned: { ar: 'في الطريق', en: 'On the way' },
    picked_up: { ar: 'في الطريق', en: 'On the way' },
    in_delivery: { ar: 'في الطريق', en: 'On the way' },
    delivered: { ar: 'تم التسليم', en: 'Delivered' },
    seated: { ar: 'الجلسة قائمة', en: 'Session active' },
    completed: { ar: 'الطاولة شاغرة', en: 'Table vacant' },
    no_show: { ar: 'لم يحضر', en: 'No show' },
    cancelled: { ar: 'ملغى', en: 'Canceled' }
  }[subtype];
  if (subtypeText && (order.status === 'completed' || ['cancelled', 'no_show'].includes(subtype))) {
    return langText(subtypeText.ar, subtypeText.en);
  }

  const explicit = localizedField(order, ['status_label', 'statusLabel'], '');
  const mapped = mappedText(order.status, orderStatusText, '') || mappedText(explicit, orderStatusText, '');
  if (mapped) return mapped;
  return translateKnownFreeText(explicit || order.status || '', notificationTranslationPairs, { ar: 'غير معروف', en: 'Unknown' }) || langText('غير معروف', 'Unknown');
}

const coreOrderTimelineSteps = [
  { key: 'pending', label: { ar: 'معلق', en: 'Pending' } },
  { key: 'confirmed', label: { ar: 'مؤكد', en: 'Confirmed' } },
  { key: 'ready', label: { ar: 'قيد التجهيز', en: 'Preparing' } },
  { key: 'completed', label: { ar: 'مكتمل', en: 'Completed' } }
];

function orderTimelineDefinition(order = {}) {
  const unifiedSteps = order.customer_status?.steps || order.customerStatus?.steps;
  if (Array.isArray(unifiedSteps) && unifiedSteps.length) {
    return unifiedSteps.map(step => ({
      key: step.key,
      label: {
        ar: step.label_ar || step.label_en || step.key,
        en: step.label_en || step.label_ar || step.key
      }
    }));
  }
  const type = order.type === 'ordinary' ? 'normal' : order.type;
  if (type === 'delivery') {
    return [...coreOrderTimelineSteps,
      { key: 'in_delivery', label: { ar: 'في الطريق', en: 'On the way' } },
      { key: 'delivered', label: { ar: 'تم التسليم', en: 'Delivered' } }
    ];
  }
  if (type === 'reservation') {
    return [...coreOrderTimelineSteps,
      { key: 'seated', label: { ar: 'الجلسة قائمة', en: 'Session active' } },
      { key: 'table_vacant', label: { ar: 'الطاولة شاغرة', en: 'Table vacant' } }
    ];
  }
  return coreOrderTimelineSteps;
}

function orderTimelineState(order = {}) {
  const unified = order.customer_status || order.customerStatus;
  if (unified && Number.isInteger(Number(unified.current_index))) {
    return {
      index: Number(unified.current_index),
      canceled: unified.is_cancelled === true
    };
  }
  const type = order.type === 'ordinary' ? 'normal' : order.type;
  const subtype = type === 'delivery' ? order.delivery?.status : (type === 'reservation' ? order.reservation?.status : '');
  const keys = [order.status, subtype].map(normalizedLookupKey).filter(Boolean);
  if (keys.some(key => ['cancelled', 'canceled', 'ملغى'].includes(key))) {
    return { index: 0, canceled: true };
  }
  const baseIndex = { pending: 0, confirmed: 1, ready: 2, completed: 3 }[normalizedLookupKey(order.status)] ?? 0;
  if (type === 'delivery') {
    if (subtype === 'delivered') return { index: 5, canceled: false };
    if (['assigned', 'picked_up', 'in_delivery'].includes(subtype)) return { index: 4, canceled: false };
  }
  if (type === 'reservation') {
    if (subtype === 'completed') return { index: 5, canceled: false };
    if (subtype === 'seated') return { index: 4, canceled: false };
  }
  return { index: baseIndex, canceled: false };
}

function orderTimelineHtml(order = {}, options = {}) {
  const state = orderTimelineState(order);
  const steps = orderTimelineDefinition(order);
  const compact = Boolean(options.compact);
  const title = langText('مسار حالة الطلب', 'Order status timeline');
  const note = state.canceled
    ? langText('تم إيقاف مسار الطلب بعد طلب الإلغاء.', 'This order timeline stopped after cancellation.')
    : langText('آخر تحديث ظاهر هنا مرتبط بحالة الطلب الحالية.', 'The latest visible step reflects the current order status.');

  return `
    <section class="order-timeline ${compact ? 'compact' : ''} ${state.canceled ? 'is-canceled' : ''}" aria-label="${esc(title)}">
      ${compact ? '' : `<div class="order-timeline-head"><strong>${esc(title)}</strong><span>${esc(orderStatusLabel(order))}</span></div>`}
      <ol style="--order-steps:${steps.length}">
        ${steps.map((step, index) => {
          const complete = !state.canceled && index < state.index;
          const current = !state.canceled && index === state.index;
          const status = complete ? 'complete' : (current ? 'current' : 'upcoming');
          return `
            <li class="${status}" ${current ? 'aria-current="step"' : ''}>
              <span class="order-timeline-dot" aria-hidden="true"></span>
              <span>${esc(langText(step.label.ar, step.label.en))}</span>
            </li>`;
        }).join('')}
      </ol>
      ${compact ? '' : `<p class="muted">${esc(note)}</p>`}
    </section>`;
}

function orderDisplayStatusClass(order = {}) {
  const state = orderTimelineState(order);
  if (state.canceled) return 'canceled';
  if (state.index >= orderTimelineDefinition(order).length - 1) return 'completed';
  if (state.index <= 0) return 'pending';
  return 'processing';
}

function isPendingOrder(order) {
  return statusClass(order?.status || order?.status_label || order?.statusLabel) === 'pending';
}

async function initNotificationsPage() {
  if (!requireCustomerLogin()) return;
  const list = $('[data-notifications-list]');
  const filterButtons = $$('[data-notification-filter]');
  const filtersContainer = $('[data-notification-filters]');
  const markAllButton = $('[data-mark-all-notifications-read]');
  const payload = await safeApi('/customer/notifications');
  const notifications = payload?.notifications || [];
  let notificationsPollTimer = null;
  let notificationsPollInFlight = false;
  let activeFilter = filterButtons.find(btn => btn.classList.contains('active'))?.dataset.notificationFilter || 'all';
  updateNotificationBadgeCount(payload?.unread_count ?? unreadNotificationsFromList(notifications));
  if (!list) return;
  const filteredNotifications = () => notifications.filter(item => notificationMatchesFilter(item, activeFilter));
  const renderFilterControls = () => {
    filtersContainer?.setAttribute('aria-label', langText('فلترة الإشعارات', 'Notification filters'));
    const totals = {
      all: notifications.length,
      orders: notifications.filter(item => notificationCategory(item) === 'orders').length,
      offers: notifications.filter(item => notificationCategory(item) === 'offers').length,
      payment: notifications.filter(item => notificationCategory(item) === 'payment').length,
      loyalty: notifications.filter(item => notificationCategory(item) === 'loyalty').length
    };
    filterButtons.forEach(btn => {
      const filter = btn.dataset.notificationFilter || 'all';
      const label = AppState.lang === 'ar' ? btn.dataset.labelAr : btn.dataset.labelEn;
      btn.classList.toggle('active', filter === activeFilter);
      btn.setAttribute('aria-pressed', String(filter === activeFilter));
      btn.innerHTML = `<span>${esc(label || filter)}</span><strong>${esc(totals[filter] ?? 0)}</strong>`;
    });
    if (markAllButton) {
      const unreadCount = unreadNotificationsFromList(notifications);
      markAllButton.disabled = unreadCount === 0;
      markAllButton.classList.toggle('is-disabled', unreadCount === 0);
      markAllButton.title = unreadCount
        ? langText('تعيين كل الإشعارات كمقروءة', 'Mark all notifications as read')
        : langText('لا توجد إشعارات غير مقروءة', 'No unread notifications');
    }
  };
  const render = () => {
    renderFilterControls();
    if (!notifications.length) {
      list.innerHTML = `
        <article class="empty-state notifications-empty-state">
          <div class="empty-illustration empty-illustration-bell" aria-hidden="true"><span></span><i></i><b></b></div>
          <div>
            <h3>${langText('لا توجد إشعارات حالياً', 'No notifications currently')}</h3>
            <p>${langText('عندما تصل تحديثات جديدة عن الطلبات أو العروض ستظهر هنا مباشرة.', 'New order updates and offers will appear here as soon as they arrive.')}</p>
          </div>
        </article>`;
      return;
    }
    const visibleNotifications = filteredNotifications();
    if (!visibleNotifications.length) {
      const currentLabel = filterButtons.find(btn => btn.dataset.notificationFilter === activeFilter);
      const label = currentLabel ? (AppState.lang === 'ar' ? currentLabel.dataset.labelAr : currentLabel.dataset.labelEn) : '';
      list.innerHTML = `
        <article class="empty-state notifications-empty-state">
          <div class="empty-illustration empty-illustration-bell" aria-hidden="true"><span></span><i></i><b></b></div>
          <div>
            <h3>${esc(langText('لا توجد إشعارات ضمن هذا التصنيف', 'No notifications in this filter'))}</h3>
            <p>${esc(langText(`لا توجد نتائج في فلتر ${label || 'الحالي'} حالياً.`, `There are no results in the ${label || 'current'} filter right now.`))}</p>
          </div>
        </article>`;
      return;
    }
    list.innerHTML = visibleNotifications.map(notificationCardHtml).join('');
    $$('[data-mark-read]', list).forEach(btn => btn.onclick = async () => {
      const note = notifications.find(n => String(n.id) === btn.dataset.markRead);
      if (!note || note.is_read || note.read) return;
      const result = await safeApi(`/customer/notifications/${btn.dataset.markRead}/read`, { method: 'PUT' });
      if (!result) {
        showToast(langText('تعذر تحديث حالة الإشعار الآن', 'Unable to update notification status now'), { kind: 'warning' });
        return;
      }
      if (note) { note.is_read = true; note.read = true; }
      updateNotificationBadgeCount(unreadNotificationsFromList(notifications));
      render();
    });
    $$('[data-notification-target]', list).forEach(card => {
      const note = notifications.find(item => String(item.id) === String(card.dataset.noteId));
      const openLinkedItem = () => {
        if (note && typeof openCatalogNotification === 'function') {
          openCatalogNotification(note, card.dataset.notificationTarget);
        } else {
          location.href = card.dataset.notificationTarget;
        }
      };
      card.addEventListener('click', event => {
        if (event.target.closest('[data-mark-read]')) return;
        openLinkedItem();
      });
      card.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key) || event.target !== card) return;
        event.preventDefault();
        openLinkedItem();
      });
    });
  };
  filterButtons.forEach(btn => {
    btn.onclick = () => {
      activeFilter = btn.dataset.notificationFilter || 'all';
      render();
    };
  });
  if (markAllButton) {
    markAllButton.onclick = async () => {
      if (!unreadNotificationsFromList(notifications)) return;
      markAllButton.disabled = true;
      const result = await safeApi('/customer/notifications/read-all', { method: 'PUT' });
      if (!result) {
        showToast(langText('تعذر تعليم كل الإشعارات كمقروءة الآن', 'Unable to mark all notifications as read now'), { kind: 'warning' });
        render();
        return;
      }
      notifications.forEach(note => { note.is_read = true; note.read = true; note.status = 'read'; });
      updateNotificationBadgeCount(0);
      showToast(langText('تم تعليم كل الإشعارات كمقروءة', 'All notifications marked as read'), { kind: 'success' });
      render();
    };
  }
  const notificationsFingerprint = source => JSON.stringify((source || []).map(item => [
    item.id,
    Boolean(item.is_read || item.read),
    item.updated_at || item.created_at,
  ]));
  let currentNotificationsFingerprint = notificationsFingerprint(notifications);

  const refreshNotificationsLive = async () => {
    if (notificationsPollInFlight || document.hidden) return;
    notificationsPollInFlight = true;
    try {
      const nextPayload = await safeApi('/customer/notifications', { timeoutMs: 5000 });
      if (!nextPayload) return;
      const nextNotifications = nextPayload.notifications || [];
      updateNotificationBadgeCount(
        nextPayload.unread_count ?? unreadNotificationsFromList(nextNotifications)
      );
      const nextFingerprint = notificationsFingerprint(nextNotifications);
      if (nextFingerprint === currentNotificationsFingerprint) return;
      notifications.splice(0, notifications.length, ...nextNotifications);
      currentNotificationsFingerprint = nextFingerprint;
      render();
    } finally {
      notificationsPollInFlight = false;
    }
  };

  const stopNotificationsLiveUpdates = () => {
    if (notificationsPollTimer) clearInterval(notificationsPollTimer);
    notificationsPollTimer = null;
  };

  notificationsPollTimer = setInterval(refreshNotificationsLive, 5_000);
  window.addEventListener('focus', refreshNotificationsLive);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshNotificationsLive();
  });
  window.addEventListener('pagehide', stopNotificationsLiveUpdates, { once: true });
  render();
}

let pendingProfilePayload = null;
let pendingAvatarPayload = null;
let pendingSavedAddressesPayload = null;
let activeSavedAddressMapForm = null;
let savedAddressMapSelection = null;
let savedAddressLeafletMap = null;
let savedAddressDestinationMarker = null;
let savedAddressRouteLine = null;
let savedAddressDeliveryAreaLayer = null;
let savedAddressRestaurantLocation = null;
let profileCropState = null;
let profileImageEditorConfirm = null;

async function initProfilePage() {
  if (!requireCustomerLogin()) return;
  await refreshCustomerContext();
  $$('[data-delivery-range-label]').forEach(el => {
    el.textContent = langText(`نطاق التوصيل البري · ${deliveryMaxDistanceKm()} كم`, `Land delivery range · ${deliveryMaxDistanceKm()} km`);
  });
  const user = AppState.user;
  renderProfileAvatar(user.avatarUrl, user.name);
  renderProfileSummary(user);

  const form = $('[data-profile-form]');
  if (!form) return;
  fillProfileForm(form, user);
  if (form.dataset.editing !== 'true') setProfileEditMode(false);
  bindProfileControls(form);
  bindPasswordChangeForm();
  renderSavedAddressesPanel();
  bindSavedAddressControls();
  setSavedAddressesEditMode(false);
}

function renderProfileSummary(user) {
  $('[data-profile-name]') && ($('[data-profile-name]').textContent = user.name);
  $('[data-profile-email]') && ($('[data-profile-email]').textContent = user.email || '—');
  $('[data-profile-phone]') && ($('[data-profile-phone]').textContent = user.phone || '—');
  $('[data-profile-points]') && ($('[data-profile-points]').textContent = normalizeNumber(user.loyaltyPoints || 0));
  $('[data-profile-tier]') && ($('[data-profile-tier]').textContent = loyaltyTierLabel(user.loyaltyTier));
  const multiplier = Number(user.loyalty?.earning_multiplier ?? user.loyalty?.earning_info?.current_multiplier ?? 1);
  $('[data-profile-multiplier]') && ($('[data-profile-multiplier]').textContent = `${multiplier.toFixed(1)}×`);
  const nextTierPoints = user.loyalty?.points_to_next_tier;
  const hasNextTierPoints = nextTierPoints !== undefined && nextTierPoints !== null && Number.isFinite(Number(nextTierPoints));
  const reachedTopTier = nextTierPoints === null && (user.loyalty?.next_tier === null || user.loyaltyTier === 'platinum');
  $('[data-profile-tier-progress]') && ($('[data-profile-tier-progress]').textContent = reachedTopTier
    ? langText('أنت في أعلى مستوى', 'Top tier reached')
    : (hasNextTierPoints
      ? langText(`بقي ${Number(nextTierPoints)} نقطة للمستوى التالي`, `${Number(nextTierPoints)} points to next tier`)
      : langText('يتم تحديث المستوى حسب رصيد النقاط', 'Tier updates based on your points balance')));
  renderLoyaltyProgram(user);
  const bio = (user.bio || '').trim();
  $('[data-profile-bio]') && ($('[data-profile-bio]').textContent = bio);
  $('[data-profile-bio-card]')?.classList.toggle('hidden', !bio);
  $('[data-edit-current-image]')?.classList.toggle('hidden', !hasEditableProfileAvatar(user));
}

function fallbackLoyaltyTierCatalog() {
  return [
    { key: 'bronze', name_ar: 'برونزي', name_en: 'Bronze', icon: '🥉', minimum_points: 0, earning_multiplier: 1.0 },
    { key: 'silver', name_ar: 'فضي', name_en: 'Silver', icon: '🥈', minimum_points: 400, earning_multiplier: 1.2 },
    { key: 'gold', name_ar: 'ذهبي', name_en: 'Gold', icon: '🥇', minimum_points: 700, earning_multiplier: 1.5 },
    { key: 'platinum', name_ar: 'بلاتينيوم', name_en: 'Platinum', icon: '💎', minimum_points: 1000, earning_multiplier: 2.0 }
  ];
}

function renderLoyaltyProgram(user) {
  const loyalty = user.loyalty || {};
  const tier = user.loyaltyTier || loyalty.tier || 'bronze';
  const catalog = Array.isArray(loyalty.tier_catalog) && loyalty.tier_catalog.length
    ? loyalty.tier_catalog
    : fallbackLoyaltyTierCatalog();
  const current = catalog.find(item => item.key === tier) || catalog[0];
  const multiplier = Number(loyalty.earning_multiplier ?? loyalty.earning_info?.current_multiplier ?? current.earning_multiplier ?? 1);
  const progress = Math.max(0, Math.min(100, Number(loyalty.tier_progress ?? (tier === 'platinum' ? 100 : 0))));

  $('[data-loyalty-current-tier]') && ($('[data-loyalty-current-tier]').textContent = `${current.icon || ''} ${AppState.lang === 'en' ? current.name_en : current.name_ar}`.trim());
  $('[data-loyalty-current-multiplier]') && ($('[data-loyalty-current-multiplier]').textContent = `${multiplier.toFixed(1)}×`);
  const bar = $('[data-loyalty-tier-progress-bar]');
  if (bar) bar.style.width = `${progress}%`;
  const progressCopy = $('[data-loyalty-tier-progress-copy]');
  if (progressCopy) {
    const remaining = loyalty.points_to_next_tier;
    progressCopy.textContent = tier === 'platinum' || remaining === null
      ? langText('وصلت إلى أعلى مستوى ومضاعف نقاط 2.0×', 'You reached the top tier with a 2.0× point multiplier')
      : langText(`بقي ${Number(remaining || 0)} نقطة للوصول إلى المستوى التالي`, `${Number(remaining || 0)} points to reach the next tier`);
  }

  $$('[data-loyalty-tier-card]').forEach(card => {
    const item = catalog.find(entry => entry.key === card.dataset.loyaltyTierCard);
    if (!item) return;
    card.classList.toggle('active', item.key === tier);
    card.setAttribute('aria-current', item.key === tier ? 'true' : 'false');
    $('[data-tier-minimum]', card) && ($('[data-tier-minimum]', card).textContent = normalizeNumber(item.minimum_points));
    $('[data-tier-multiplier]', card) && ($('[data-tier-multiplier]', card).textContent = `${Number(item.earning_multiplier || 1).toFixed(1)}×`);
  });
}

function fillProfileForm(form, user) {
  form.full_name.value = user.name || '';
  form.email.value = user.email || '';
  form.phone.value = user.phone || '';
  form.birthday.value = user.birthday || '';
  if (typeof syncSmartDateTimeInput === 'function') syncSmartDateTimeInput(form.birthday);
  form.bio.value = user.bio || '';
  form.city.value = user.address || '';
}

function bindPasswordChangeForm() {
  const form = $('[data-password-change-form]');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  const error = $('[data-password-change-error]', form);

  const clearError = () => {
    if (error) error.textContent = '';
  };
  $$('input', form).forEach(input => input.addEventListener('input', clearError));
  form.addEventListener('reset', clearError);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const currentPassword = form.current_password.value;
    const newPassword = form.new_password.value;
    const confirmation = form.new_password_confirmation.value;
    if (newPassword.length < 6) {
      if (error) error.textContent = langText('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل', 'The new password must be at least 6 characters');
      form.new_password.focus();
      return;
    }
    if (newPassword !== confirmation) {
      if (error) error.textContent = langText('تأكيد كلمة المرور الجديدة غير متطابق', 'New password confirmation does not match');
      form.new_password_confirmation.focus();
      return;
    }
    if (currentPassword === newPassword) {
      if (error) error.textContent = langText('اختر كلمة مرور جديدة تختلف عن الحالية', 'Choose a new password different from the current one');
      form.new_password.focus();
      return;
    }

    const submit = $('button[type="submit"]', form);
    if (submit) submit.disabled = true;
    try {
      await apiFetch('/customer/profile', {
        method: 'PUT',
        body: {
          current_password: currentPassword,
          new_password: newPassword,
          new_password_confirmation: confirmation
        }
      });
      form.reset();
      showToast(langText('تم تغيير كلمة المرور وتسجيل خروج الأجهزة الأخرى', 'Password changed and other devices were signed out'), { kind: 'success' });
    } catch (err) {
      if (error) error.textContent = friendlyError(err, 'كلمة المرور الحالية غير صحيحة أو تعذر الحفظ', 'The current password is incorrect or the change could not be saved');
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

function getSavedAddressDeliveryEstimate(lat, lng) {
  const restaurant = AppState.restaurant || {};
  const restaurantLat = Number(savedAddressRestaurantLocation?.lat ?? restaurant.latitude ?? 35.5317);
  const restaurantLng = Number(savedAddressRestaurantLocation?.lng ?? restaurant.longitude ?? 35.7901);
  const pointLat = Number(lat);
  const pointLng = Number(lng);
  const distanceKm = TazaDeliveryGeo.distanceKm(restaurantLat, restaurantLng, pointLat, pointLng);
  const onLand = TazaDeliveryGeo.isPointOnLand(pointLat, pointLng);
  const withinRange = distanceKm <= deliveryMaxDistanceKm();
  const costPerKm = deliveryCostPerKm();
  return {
    distanceKm,
    fee: Math.round(distanceKm * costPerKm),
    onLand,
    withinRange,
    valid: onLand && withinRange
  };
}

function savedAddressEstimateMarkup(estimate) {
  const distance = estimate?.valid ? `${estimate.distanceKm.toFixed(2)} km` : '—';
  const fee = estimate?.valid ? formatCurrency(estimate.fee) : '—';
  return `
    <div class="saved-address-summary-quote">
      <div><span>${esc(langText('المسافة', 'Distance'))}</span><strong>${esc(distance)}</strong></div>
      <div><span>${esc(langText('أجرة تقديرية', 'Estimated fee'))}</span><strong>${esc(fee)}</strong></div>
    </div>`;
}

function renderSavedAddressesPanel() {
  const root = $('[data-saved-addresses-list]');
  if (!root) return;
  const lockNote = $('[data-saved-address-lock-note]');
  if (lockNote) {
    lockNote.textContent = AppState.hasPendingSavedAddressMigration
      ? langText(
        'وجدنا عناوين قديمة على هذا المتصفح. اضغط تعديل ثم حفظ، وأدخل كلمة المرور لربطها بحسابك وتطبيق الموبايل.',
        'Older addresses were found in this browser. Press Edit then Save and enter your password to link them with your account and mobile app.'
      )
      : langText(
        'العناوين متزامنة مع حسابك. اضغط تعديل العناوين قبل تغييرها، وسيُطلب منك إدخال كلمة المرور عند الحفظ.',
        'Addresses are synced with your account. Press Edit addresses to change them; your password will be required when saving.'
      );
  }
  const editing = root.dataset.editing === 'true';
  root.innerHTML = SAVED_ADDRESS_TYPES.map(type => {
    const item = AppState.savedAddresses[type] || emptySavedAddress(type);
    const label = savedAddressLabel(type);
    const hasAddress = Boolean(savedAddressText(item));
    const hasCoordinates = savedAddressHasCoordinates(item);
    const estimate = hasCoordinates ? getSavedAddressDeliveryEstimate(item.latitude, item.longitude) : null;
    const mapSummaryText = hasCoordinates
      ? (estimate?.valid
        ? langText(`موقع جاهز · ${estimate.distanceKm.toFixed(2)} كم · ${formatCurrency(estimate.fee)}`, `Ready · ${estimate.distanceKm.toFixed(2)} km · ${formatCurrency(estimate.fee)}`)
        : langText('الموقع غير صالح للتوصيل، اختر نقطة أخرى', 'Location is not deliverable; choose another point'))
      : langText('اختياري، ويمكن تحديده لتسريع حساب أجرة التوصيل', 'Optional, pin it to speed up delivery fee calculation');
    const status = hasCoordinates && estimate?.valid
      ? { text: langText('جاهز للتوصيل', 'Ready for delivery'), className: 'ready' }
      : (hasCoordinates
        ? { text: langText('الموقع غير متاح للتوصيل', 'Location unavailable for delivery'), className: 'partial' }
        : (hasAddress
        ? { text: langText('يحتاج تثبيت موقع', 'Needs map pin'), className: 'partial' }
        : { text: langText('غير محفوظ', 'Not saved'), className: 'empty' }));

    if (!editing) {
      const addressText = item.address || langText('لم يتم حفظ عنوان بعد', 'No address saved yet');
      const addressNote = item.details || langText('لا توجد ملاحظات إضافية للسائق', 'No additional driver notes');
      return `
        <article class="saved-address-card saved-address-summary-card is-${esc(status.className)}" data-saved-address-type="${esc(type)}">
          <div class="saved-address-card-head">
            <span class="saved-address-icon" aria-hidden="true">${esc(label.icon)}</span>
            <div class="saved-address-identity">
              <span class="saved-address-eyebrow">${esc(langText('عنوان سريع', 'Quick address'))}</span>
              <h3>${esc(savedAddressTitle(item))}</h3>
              <small class="saved-address-status ${esc(status.className)}">${esc(status.text)}</small>
            </div>
          </div>
          <div class="saved-address-summary-copy">
            <strong class="saved-address-summary-label">${esc(langText('العنوان المحفوظ', 'Saved address'))}</strong>
            <p class="${hasAddress ? '' : 'muted'}">${esc(addressText)}</p>
            <small class="saved-address-summary-note">${esc(addressNote)}</small>
          </div>
          ${savedAddressEstimateMarkup(estimate)}
        </article>`;
    }

    return `
      <form class="saved-address-card" data-saved-address-form="${esc(type)}" data-saved-address-type="${esc(type)}">
        <div class="saved-address-card-head">
          <span class="saved-address-icon" aria-hidden="true">${esc(label.icon)}</span>
          <div>
            <h3>${esc(savedAddressTitle(item))}</h3>
            <small class="saved-address-status ${esc(status.className)}">${esc(status.text)}</small>
          </div>
        </div>
        <div class="form-group">
          <label class="label" for="saved-${esc(type)}-address">${esc(langText('العنوان', 'Address'))}</label>
          <input class="input" id="saved-${esc(type)}-address" name="address" maxlength="180" value="${esc(item.address)}" placeholder="${esc(langText('مثال: اللاذقية - شارع الزراعة', 'Example: Latakia - Agriculture Street'))}">
        </div>
        <div class="form-group">
          <label class="label" for="saved-${esc(type)}-details">${esc(langText('تفاصيل تساعد السائق', 'Driver note'))}</label>
          <textarea class="textarea" id="saved-${esc(type)}-details" name="details" rows="3" maxlength="240" placeholder="${esc(langText('طابق، علامة قريبة، رقم بناء...', 'Floor, nearby landmark, building number...'))}">${esc(item.details)}</textarea>
        </div>
        <div class="saved-address-map-picker">
          <input type="hidden" name="latitude" value="${item.latitude ?? ''}">
          <input type="hidden" name="longitude" value="${item.longitude ?? ''}">
          <div>
            <strong>${esc(langText('موقع الخريطة', 'Map location'))}</strong>
            <p class="muted" data-saved-map-summary>${esc(mapSummaryText)}</p>
          </div>
          <button class="btn btn-secondary" type="button" data-open-saved-address-map>${esc(hasCoordinates ? langText('تعديل الموقع', 'Edit location') : langText('تحديد على الخريطة', 'Pin on map'))}</button>
        </div>
        <div class="saved-address-actions">
          <button class="btn btn-secondary" type="button" data-clear-saved-address="${esc(type)}">${esc(langText('مسح', 'Clear'))}</button>
        </div>
      </form>`;
  }).join('');

  $$('[data-saved-address-form]', root).forEach(form => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (root.dataset.editing === 'true') prepareSavedAddressesSave();
    });
  });

  $$('[data-clear-saved-address]', root).forEach(button => {
    button.addEventListener('click', () => {
      if (root.dataset.editing !== 'true') return;
      const form = button.closest('[data-saved-address-form]');
      if (!form) return;
      form.address.value = '';
      form.details.value = '';
      form.latitude.value = '';
      form.longitude.value = '';
      updateSavedAddressMapSummary(form);
    });
  });
  $$('[data-open-saved-address-map]', root).forEach(button => {
    button.addEventListener('click', () => {
      if (root.dataset.editing !== 'true') return;
      openSavedAddressMap(button.closest('[data-saved-address-form]'));
    });
  });
  setSavedAddressesEditMode(editing);
}

function bindSavedAddressControls() {
  const editButton = $('[data-edit-saved-addresses]');
  if (editButton && editButton.dataset.bound !== 'true') {
    editButton.dataset.bound = 'true';
    editButton.addEventListener('click', () => {
      const root = $('[data-saved-addresses-list]');
      if (root) root.dataset.editing = 'true';
      renderSavedAddressesPanel();
      setSavedAddressesEditMode(true);
    });
  }
  const saveButton = $('[data-save-saved-addresses]');
  if (saveButton && saveButton.dataset.bound !== 'true') {
    saveButton.dataset.bound = 'true';
    saveButton.addEventListener('click', prepareSavedAddressesSave);
  }
  const resetButton = $('[data-reset-saved-addresses]');
  if (resetButton && resetButton.dataset.bound !== 'true') {
    resetButton.dataset.bound = 'true';
    resetButton.addEventListener('click', () => {
      pendingSavedAddressesPayload = null;
      const root = $('[data-saved-addresses-list]');
      if (root) root.dataset.editing = 'false';
      renderSavedAddressesPanel();
      setSavedAddressesEditMode(false);
    });
  }
}

function setSavedAddressesEditMode(editing) {
  const root = $('[data-saved-addresses-list]');
  if (!root) return;
  root.dataset.editing = String(editing);
  root.classList.toggle('saved-addresses-locked', !editing);
  $$('input, textarea, button[data-clear-saved-address], button[data-open-saved-address-map]', root).forEach(input => {
    input.disabled = !editing;
  });
  $('[data-saved-address-actions]')?.classList.toggle('hidden', !editing);
  $('[data-saved-address-lock-note]')?.classList.toggle('hidden', editing);
  $('[data-edit-saved-addresses]')?.classList.toggle('hidden', editing);
}

function collectSavedAddressesPayload() {
  const payload = {};
  let invalidField = null;

  $$('[data-saved-address-form]').forEach(form => {
    const type = form.dataset.savedAddressType || form.dataset.savedAddressForm;
    const address = form.address.value.trim();
    const details = form.details.value.trim();
    const latValue = form.latitude.value.trim();
    const lngValue = form.longitude.value.trim();
    const hasAnyValue = Boolean(address || details || latValue || lngValue);
    const hasOneCoordinate = Boolean(latValue || lngValue);
    const latitude = latValue ? Number(latValue) : null;
    const longitude = lngValue ? Number(lngValue) : null;

    if (!address && hasAnyValue) {
      invalidField = invalidField || { field: form.address, message: langText('اكتب العنوان أو اترك البطاقة فارغة بالكامل', 'Enter the address or leave the card completely empty') };
      return;
    }
    if (hasOneCoordinate && (!latValue || !lngValue || !Number.isFinite(latitude) || !Number.isFinite(longitude))) {
      invalidField = invalidField || { field: latValue ? form.longitude : form.latitude, message: langText('أدخل خط العرض والطول معاً بشكل صحيح', 'Enter both latitude and longitude correctly') };
      return;
    }
    if (address && (!latValue || !lngValue)) {
      invalidField = invalidField || {
        field: $('[data-open-saved-address-map]', form),
        message: langText('ثبّت الموقع على الخريطة قبل حفظ العنوان', 'Pin the location on the map before saving the address')
      };
      return;
    }
    if (latValue && lngValue) {
      const estimate = getSavedAddressDeliveryEstimate(latitude, longitude);
      if (!estimate.valid) {
        invalidField = invalidField || {
          field: $('[data-open-saved-address-map]', form),
          message: !estimate.onLand
            ? langText('أحد العناوين مثبت داخل البحر. اختر موقعاً على اليابسة.', 'One address is pinned in the sea. Choose a land location.')
            : langText(`أحد العناوين خارج نطاق التوصيل البالغ ${deliveryMaxDistanceKm()} كم.`, `One address is outside the ${deliveryMaxDistanceKm()} km delivery range.`)
        };
        return;
      }
    }

    payload[type] = normalizeSavedAddress(type, {
      address,
      details,
      latitude: hasOneCoordinate ? latitude : null,
      longitude: hasOneCoordinate ? longitude : null
    });
  });

  if (invalidField) {
    showToast(invalidField.message, { kind: 'warning' });
    invalidField.field?.focus();
    return null;
  }

  return payload;
}

function prepareSavedAddressesSave() {
  const root = $('[data-saved-addresses-list]');
  if (root?.dataset.editing !== 'true') return;
  const payload = collectSavedAddressesPayload();
  if (!payload) return;
  pendingSavedAddressesPayload = payload;
  openProfilePasswordDialog('addresses');
}

function updateSavedAddressMapSummary(form) {
  if (!form) return;
  const summary = $('[data-saved-map-summary]', form);
  const button = $('[data-open-saved-address-map]', form);
  const status = $('.saved-address-status', form);
  const hasCoordinates = form.latitude.value && form.longitude.value;
  const estimate = hasCoordinates ? getSavedAddressDeliveryEstimate(form.latitude.value, form.longitude.value) : null;
  if (summary) {
    summary.textContent = hasCoordinates
      ? (estimate?.valid
        ? langText(`موقع جاهز · ${estimate.distanceKm.toFixed(2)} كم · ${formatCurrency(estimate.fee)}`, `Ready · ${estimate.distanceKm.toFixed(2)} km · ${formatCurrency(estimate.fee)}`)
        : langText('الموقع غير صالح للتوصيل، اختر نقطة أخرى', 'Location is not deliverable; choose another point'))
      : langText('اختياري، ويمكن تحديده لتسريع حساب أجرة التوصيل', 'Optional, pin it to speed up delivery fee calculation');
  }
  if (button) {
    button.textContent = hasCoordinates
      ? langText('تعديل الموقع', 'Edit location')
      : langText('تحديد على الخريطة', 'Pin on map');
  }
  if (status) {
    const hasAddress = Boolean(form.address.value.trim() || form.details.value.trim());
    const nextStatus = hasCoordinates && estimate?.valid
      ? { text: langText('جاهز للتوصيل', 'Ready for delivery'), className: 'ready' }
      : (hasCoordinates || hasAddress
        ? { text: langText(hasCoordinates ? 'الموقع غير متاح للتوصيل' : 'يحتاج تثبيت موقع', hasCoordinates ? 'Location unavailable for delivery' : 'Needs map pin'), className: 'partial' }
        : { text: langText('غير محفوظ', 'Not saved'), className: 'empty' });
    status.textContent = nextStatus.text;
    status.classList.remove('ready', 'partial', 'empty');
    status.classList.add(nextStatus.className);
  }
}

function openSavedAddressMap(form) {
  if (!form) return;
  activeSavedAddressMapForm = form;
  const restaurant = AppState.restaurant || {};
  const defaultLat = Number(restaurant.latitude || 35.5317);
  const defaultLng = Number(restaurant.longitude || 35.7901);
  savedAddressRestaurantLocation = { lat: defaultLat, lng: defaultLng };
  const lat = Number(form.latitude.value || defaultLat);
  const lng = Number(form.longitude.value || defaultLng);
  const hasCoordinates = form.latitude.value && form.longitude.value;
  savedAddressMapSelection = hasCoordinates ? { lat, lng } : null;

  $('[data-overlay]')?.classList.add('active');
  $('[data-saved-address-map-modal]')?.classList.add('active');
  if (typeof syncOverlayState === 'function') syncOverlayState();
  initSavedAddressMap(defaultLat, defaultLng, hasCoordinates ? { lat, lng } : null);
  updateSavedAddressMapStatus();
  [80, 260, 620].forEach(delay => setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    savedAddressLeafletMap?.invalidateSize?.();
  }, delay));
}

function closeSavedAddressMap() {
  $('[data-saved-address-map-modal]')?.classList.remove('active');
  if (typeof syncOverlayState === 'function') syncOverlayState();
  else if (!$('[data-profile-password-dialog]')?.classList.contains('active') && !$('[data-profile-image-editor]')?.classList.contains('active')) $('[data-overlay]')?.classList.remove('active');
}

function updateSavedAddressMapStatus() {
  const title = $('[data-saved-address-map-title]');
  const detail = $('[data-saved-address-map-detail]');
  const status = $('[data-saved-address-map-status]');
  const saveButton = $('[data-use-saved-address-map]');
  const distance = $('[data-saved-address-map-distance]');
  const fee = $('[data-saved-address-map-fee]');
  const warning = $('[data-saved-address-map-warning]');
  const hasPoint = Boolean(savedAddressMapSelection?.lat && savedAddressMapSelection?.lng);
  const estimate = hasPoint ? getSavedAddressDeliveryEstimate(savedAddressMapSelection.lat, savedAddressMapSelection.lng) : null;
  const isValid = Boolean(hasPoint && estimate?.valid);
  status?.classList.toggle('is-ready', isValid);
  status?.classList.toggle('is-invalid', Boolean(hasPoint && !isValid));
  if (title) title.textContent = isValid ? langText('الموقع جاهز للحفظ', 'Location ready to save') : langText('لم يتم اختيار موقع', 'No location selected');
  if (detail) {
    detail.textContent = isValid
      ? `${Number(savedAddressMapSelection.lat).toFixed(5)}, ${Number(savedAddressMapSelection.lng).toFixed(5)}`
      : langText('اختر نقطة داخل النطاق البرتقالي على اليابسة', 'Choose a land point inside the orange range');
  }
  if (distance) distance.textContent = isValid ? `${estimate.distanceKm.toFixed(2)} km` : '—';
  if (fee) fee.textContent = isValid ? formatCurrency(estimate.fee) : '—';
  if (warning) {
    const message = hasPoint && !estimate.onLand
      ? langText('لا يمكن حفظ عنوان داخل البحر. اختر نقطة على اليابسة.', 'A sea location cannot be saved. Choose a point on land.')
      : (hasPoint && !estimate.withinRange
        ? langText(`الموقع خارج نطاق التوصيل البالغ ${deliveryMaxDistanceKm()} كم.`, `Location is outside the ${deliveryMaxDistanceKm()} km delivery range.`)
        : '');
    warning.textContent = message;
    warning.classList.toggle('hidden', !message);
  }
  if (saveButton) saveButton.disabled = !isValid;
}

function initSavedAddressMap(restaurantLat, restaurantLng, selected) {
  const el = $('[data-saved-address-map]');
  if (!el) return;

  const setSelection = (lat, lng, { notify = true } = {}) => {
    const next = { lat: Number(lat), lng: Number(lng) };
    const estimate = getSavedAddressDeliveryEstimate(next.lat, next.lng);
    if (!estimate.valid) {
      const message = !estimate.onLand
        ? langText('لا يمكن اختيار موقع في البحر. اختر نقطة على اليابسة.', 'Sea locations cannot be selected. Choose a point on land.')
        : langText(`الموقع خارج نطاق التوصيل البالغ ${deliveryMaxDistanceKm()} كم.`, `Location is outside the ${deliveryMaxDistanceKm()} km delivery range.`);
      const warning = $('[data-saved-address-map-warning]');
      if (warning) {
        warning.textContent = message;
        warning.classList.remove('hidden');
      }
      if (notify) showToast(message, { kind: 'error' });
      return false;
    }
    savedAddressMapSelection = next;
    const message = $('[data-saved-address-map-message]');
    if (message) message.textContent = langText('تم اختيار الموقع، اضغط حفظ الموقع', 'Location selected, save it');
    updateSavedAddressMapStatus();
    return true;
  };
  window.__tazaSavedAddressSetSelection = (lat, lng) => {
    if (!setSelection(lat, lng)) return false;
    drawSavedAddressMarker(lat, lng);
    savedAddressLeafletMap?.setView?.([Number(lat), Number(lng)], 15, { animate: true });
    return true;
  };

  if (!window.L) {
    el.addEventListener('click', (event) => {
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      setSelection(restaurantLat + y * 0.08, restaurantLng + x * 0.08);
    }, { once: false });
    return;
  }

  if (!savedAddressLeafletMap) {
    el.style.minHeight = '420px';
    el.classList.remove('placeholder-media');
    el.classList.add('delivery-leaflet-map');
    el.innerHTML = '';
    savedAddressLeafletMap = L.map(el, {
      scrollWheelZoom: true,
      wheelDebounceTime: 32,
      wheelPxPerZoomLevel: 70
    }).setView([restaurantLat, restaurantLng], 14);
    const mapShell = el.closest('.map-canvas-shell');
    const finishMapLoading = () => mapShell?.classList.remove('is-map-loading');
    mapShell?.classList.add('is-map-loading');
    mapShell?.setAttribute('data-map-loading-label', langText('جاري تجهيز الخريطة…', 'Preparing map…'));
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      keepBuffer: 4
    }).once('load', finishMapLoading).addTo(savedAddressLeafletMap);
    setTimeout(finishMapLoading, 8000);
    const restaurantIcon = window.TazaMapMarkers?.create('restaurant');
    L.marker([restaurantLat, restaurantLng], restaurantIcon ? { icon: restaurantIcon } : {})
      .addTo(savedAddressLeafletMap)
      .bindPopup(langText('موقع المطعم', 'Restaurant location'));
    savedAddressLeafletMap.on('click', event => {
      if (setSelection(event.latlng.lat, event.latlng.lng)) drawSavedAddressMarker(event.latlng.lat, event.latlng.lng);
    });
    L.DomEvent.on(el, 'wheel', L.DomEvent.preventDefault);
    savedAddressLeafletMap.scrollWheelZoom.enable();
  }

  if (savedAddressDeliveryAreaLayer) savedAddressLeafletMap.removeLayer(savedAddressDeliveryAreaLayer);
  const landOnlyArea = TazaDeliveryGeo.createLandOnlyArea(restaurantLat, restaurantLng, deliveryMaxDistanceKm());
  const deliveryAreaStyle = {
    color: '#ff9635', weight: 2, opacity: 0.9,
    fillColor: '#ffc45e', fillOpacity: 0.1, interactive: false
  };
  savedAddressDeliveryAreaLayer = landOnlyArea
    ? L.geoJSON(landOnlyArea, { style: deliveryAreaStyle }).addTo(savedAddressLeafletMap)
    : L.circle([restaurantLat, restaurantLng], { ...deliveryAreaStyle, radius: deliveryMaxDistanceKm() * 1000 }).addTo(savedAddressLeafletMap);

  savedAddressLeafletMap.setView(selected ? [selected.lat, selected.lng] : [restaurantLat, restaurantLng], selected ? 15 : 14);
  if (selected) {
    savedAddressMapSelection = { lat: Number(selected.lat), lng: Number(selected.lng) };
    drawSavedAddressMarker(selected.lat, selected.lng);
  } else {
    if (savedAddressDestinationMarker) savedAddressLeafletMap.removeLayer(savedAddressDestinationMarker);
    if (savedAddressRouteLine) savedAddressLeafletMap.removeLayer(savedAddressRouteLine);
    savedAddressDestinationMarker = null;
    savedAddressRouteLine = null;
  }
}

function drawSavedAddressMarker(lat, lng) {
  if (!savedAddressLeafletMap || !window.L) return;
  const latlng = L.latLng(Number(lat), Number(lng));
  if (savedAddressDestinationMarker) savedAddressDestinationMarker.setLatLng(latlng);
  else {
    const destinationIcon = window.TazaMapMarkers?.create('destination');
    savedAddressDestinationMarker = L.marker(latlng, destinationIcon ? { icon: destinationIcon } : {})
      .addTo(savedAddressLeafletMap)
      .bindPopup(langText('الوجهة المطلوبة', 'Selected destination'));
  }
  const restaurant = savedAddressRestaurantLocation || { lat: 35.5317, lng: 35.7901 };
  const route = [[restaurant.lat, restaurant.lng], latlng];
  if (savedAddressRouteLine) savedAddressRouteLine.setLatLngs(route);
  else savedAddressRouteLine = L.polyline(route, {
    color: '#ff4d4f', weight: 3, opacity: 0.75, dashArray: '8, 8', interactive: false
  }).addTo(savedAddressLeafletMap);
  savedAddressDestinationMarker.openPopup();
}

function bindSavedAddressMapModal() {
  const modal = $('[data-saved-address-map-modal]');
  if (!modal || modal.dataset.bound === 'true') return;
  modal.dataset.bound = 'true';
  $('[data-close-saved-address-map]', modal)?.addEventListener('click', closeSavedAddressMap);
  $('[data-use-current-saved-address-location]', modal)?.addEventListener('click', event => {
    const button = event.currentTarget;
    if (!navigator.geolocation) {
      showToast(langText('المتصفح لا يدعم تحديد الموقع الحالي', 'Current location is not supported by this browser'), { kind: 'warning' });
      return;
    }
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    navigator.geolocation.getCurrentPosition(
      position => {
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
        const accepted = window.__tazaSavedAddressSetSelection?.(position.coords.latitude, position.coords.longitude);
        if (accepted !== false) showToast(langText('تم تحديد موقعك الحالي', 'Current location selected'), { kind: 'location' });
      },
      () => {
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
        showToast(langText('تعذر قراءة موقعك الحالي', 'Unable to read your current location'), { kind: 'warning' });
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  });
  $('[data-clear-map-location]', modal)?.addEventListener('click', () => {
    savedAddressMapSelection = null;
    if (activeSavedAddressMapForm) {
      activeSavedAddressMapForm.latitude.value = '';
      activeSavedAddressMapForm.longitude.value = '';
      updateSavedAddressMapSummary(activeSavedAddressMapForm);
    }
    if (savedAddressLeafletMap && savedAddressDestinationMarker) {
      savedAddressLeafletMap.removeLayer(savedAddressDestinationMarker);
      savedAddressDestinationMarker = null;
    }
    if (savedAddressLeafletMap && savedAddressRouteLine) {
      savedAddressLeafletMap.removeLayer(savedAddressRouteLine);
      savedAddressRouteLine = null;
    }
    updateSavedAddressMapStatus();
  });
  $('[data-use-saved-address-map]', modal)?.addEventListener('click', () => {
    if (!activeSavedAddressMapForm || !savedAddressMapSelection) return;
    activeSavedAddressMapForm.latitude.value = Number(savedAddressMapSelection.lat).toFixed(6);
    activeSavedAddressMapForm.longitude.value = Number(savedAddressMapSelection.lng).toFixed(6);
    updateSavedAddressMapSummary(activeSavedAddressMapForm);
    closeSavedAddressMap();
    showToast(langText('تم تثبيت موقع العنوان على الخريطة', 'Address location pinned on the map'), { kind: 'location' });
  });
}

function bindProfileControls(form) {
  const imageInput = $('[data-image-change]');
  const imageButton = $('[data-image-picker]');
  const editCurrentImageButton = $('[data-edit-current-image]');
  if (imageButton && imageButton.dataset.bound !== 'true') {
    imageButton.dataset.bound = 'true';
    imageButton.addEventListener('click', () => imageInput?.click());
  }
  if (editCurrentImageButton && editCurrentImageButton.dataset.bound !== 'true') {
    editCurrentImageButton.dataset.bound = 'true';
    editCurrentImageButton.addEventListener('click', async () => {
      const source = await getEditableProfileAvatarSource();
      if (source) openProfileImageEditor(source);
      else showToast(langText('تعذر فتح الصورة الحالية للتحرير، اختر صورة جديدة', 'Unable to edit the current image; choose a new one'));
    });
  }
  if (imageInput && imageInput.dataset.bound !== 'true') {
    imageInput.dataset.bound = 'true';
    imageInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast(langText('اختر ملف صورة صالح', 'Choose a valid image file'));
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      openProfileImageEditor(dataUrl);
    });
  }

  const editButton = $('[data-edit-profile]');
  if (editButton && editButton.dataset.bound !== 'true') {
    editButton.dataset.bound = 'true';
    editButton.addEventListener('click', () => setProfileEditMode(true));
  }
  const resetButton = $('[data-reset-profile]');
  if (resetButton && resetButton.dataset.bound !== 'true') {
    resetButton.dataset.bound = 'true';
    resetButton.addEventListener('click', () => {
      fillProfileForm(form, AppState.user);
      setProfileEditMode(false);
    });
  }

  if (form.dataset.bound !== 'true') {
    form.dataset.bound = 'true';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (form.dataset.editing !== 'true') return;
      pendingProfilePayload = {
        name: form.full_name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        address: form.city.value.trim(),
        bio: form.bio.value.trim(),
        date_of_birth: form.birthday.value || null
      };
      openProfilePasswordDialog();
    });
  }

  bindProfilePasswordDialog();
  bindSavedAddressMapModal();
  bindProfileImageEditor();
  bindProfileDialogDismiss();
  if (typeof bindPasswordToggles === 'function') bindPasswordToggles(document);
}

function setProfileEditMode(editing) {
  const form = $('[data-profile-form]');
  if (!form) return;
  form.dataset.editing = String(editing);
  form.classList.toggle('profile-form-locked', !editing);
  $$('input, textarea', form).forEach(input => {
    input.disabled = !editing;
    if (input.matches('input[type="date"], input[type="time"]') && typeof syncSmartDateTimeInput === 'function') {
      syncSmartDateTimeInput(input);
    }
  });
  $('[data-profile-actions]')?.classList.toggle('hidden', !editing);
  $('[data-profile-lock-note]')?.classList.toggle('hidden', editing);
  $('[data-edit-profile]')?.classList.toggle('hidden', editing);
}

function openProfilePasswordDialog(mode = 'profile') {
  const dialog = $('[data-profile-password-dialog]');
  if (dialog) dialog.dataset.mode = mode;
  const message = $('[data-profile-password-message]', dialog);
  if (message) {
    const messages = {
      avatar: langText('أدخل كلمة المرور الحالية لتأكيد تغيير الصورة الشخصية.', 'Enter your current password to confirm changing your profile image.'),
      addresses: langText('أدخل كلمة المرور الحالية لتأكيد حفظ العناوين المحفوظة.', 'Enter your current password to confirm saving saved addresses.'),
      profile: langText('أدخل كلمة المرور الحالية لحماية بيانات حسابك.', 'Enter your current password to protect your account details.')
    };
    message.textContent = messages[mode] || messages.profile;
  }
  $('[data-overlay]')?.classList.add('active');
  dialog?.classList.add('active');
  if (typeof syncOverlayState === 'function') syncOverlayState();
  const input = $('[name="profile_current_password"]', dialog);
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 50);
  }
  $('[data-profile-password-error]') && ($('[data-profile-password-error]').textContent = '');
}

function closeProfilePasswordDialog() {
  $('[data-profile-password-dialog]')?.classList.remove('active');
  if (typeof syncOverlayState === 'function') syncOverlayState();
  else if (!$('[data-profile-image-editor]')?.classList.contains('active')) $('[data-overlay]')?.classList.remove('active');
  if ($('[data-profile-password-dialog]')?.dataset.mode === 'avatar') {
    pendingAvatarPayload = null;
  }
}

function bindProfilePasswordDialog() {
  const dialog = $('[data-profile-password-dialog]');
  if (!dialog || dialog.dataset.bound === 'true') return;
  dialog.dataset.bound = 'true';
  $$('[data-close-profile-password]', dialog).forEach(btn => btn.addEventListener('click', closeProfilePasswordDialog));
  $('[data-confirm-profile-save]', dialog)?.addEventListener('click', saveProfileWithPassword);
  $('[name="profile_current_password"]', dialog)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveProfileWithPassword();
  });
}

function bindProfileDialogDismiss() {
  const overlay = $('[data-overlay]');
  if (overlay && overlay.dataset.profileDialogsBound !== 'true') {
    overlay.dataset.profileDialogsBound = 'true';
    overlay.addEventListener('click', () => {
      if ($('[data-profile-password-dialog]')?.classList.contains('active')) return;
      closeProfilePasswordDialog();
      closeProfileImageEditor();
      closeSavedAddressMap();
    });
  }
  if (document.documentElement.dataset.profileEscapeBound === 'true') return;
  document.documentElement.dataset.profileEscapeBound = 'true';
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('[data-profile-password-dialog]')?.classList.contains('active')) return;
    closeProfilePasswordDialog();
    closeProfileImageEditor();
    closeSavedAddressMap();
  });
}

async function saveProfileWithPassword() {
  const password = $('[name="profile_current_password"]')?.value || '';
  const error = $('[data-profile-password-error]');
  if (!password) {
    if (error) error.textContent = langText('يرجى إدخال كلمة المرور', 'Please enter your password');
    return;
  }
  const mode = $('[data-profile-password-dialog]')?.dataset.mode || 'profile';
  if (mode === 'avatar') {
    await saveAvatarWithPassword(password, error);
    return;
  }
  if (mode === 'addresses') {
    await saveSavedAddressesWithPassword(password, error);
    return;
  }
  if (!pendingProfilePayload) return;

  try {
    const data = await apiFetch('/customer/profile', {
      method: 'PUT',
      body: { ...pendingProfilePayload, current_password: password }
    });
    const loyalty = data.loyalty || data.customer?.loyalty || AppState.user.loyalty;
    AppState.user = normalizeUser({ ...data.customer, loyalty });
    applyLoyaltySnapshot(loyalty, AppState.user);
    persist();
    renderUserHeader();
    renderProfileSummary(AppState.user);
    fillProfileForm($('[data-profile-form]'), AppState.user);
    setProfileEditMode(false);
    closeProfilePasswordDialog();
    pendingProfilePayload = null;
    showToast(langText('تم حفظ التعديلات بنجاح', 'Changes saved successfully'));
  } catch (err) {
    if (error) error.textContent = friendlyError(err, 'كلمة المرور غير صحيحة أو تعذر الحفظ', 'Password is incorrect or changes could not be saved');
  }
}

async function saveSavedAddressesWithPassword(password, error) {
  if (!pendingSavedAddressesPayload) return;
  try {
    const addresses = SAVED_ADDRESS_TYPES
      .map(type => normalizeSavedAddress(type, pendingSavedAddressesPayload[type]))
      .filter(savedAddressIsComplete)
      .map(address => ({
        type: address.type,
        address: address.address,
        details: address.details,
        latitude: address.latitude,
        longitude: address.longitude
      }));
    const data = await apiFetch('/customer/saved-addresses', {
      method: 'PUT',
      body: {
        addresses,
        current_password: password
      }
    });
    AppState.savedAddresses = normalizeSavedAddresses(data?.addresses || []);
    AppState.hasPendingSavedAddressMigration = false;
    localStorage.setItem(STORAGE_KEYS.savedAddressesOwner, String(AppState.user.id));
    persist();
    renderUserHeader();
    const root = $('[data-saved-addresses-list]');
    if (root) root.dataset.editing = 'false';
    renderSavedAddressesPanel();
    setSavedAddressesEditMode(false);
    closeProfilePasswordDialog();
    pendingSavedAddressesPayload = null;
    showToast(langText('تم حفظ العناوين بنجاح', 'Addresses saved successfully'), { kind: 'location' });
  } catch (err) {
    if (error) error.textContent = friendlyError(err, 'كلمة المرور غير صحيحة أو تعذر حفظ العناوين', 'Password is incorrect or addresses could not be saved');
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openProfileImageEditor(dataUrl, options = {}) {
  const dialog = $('[data-profile-image-editor]');
  const image = $('[data-crop-image]');
  const zoom = $('[data-crop-zoom]');
  if (!dialog || !image || !zoom) return;
  profileImageEditorConfirm = typeof options.onConfirm === 'function' ? options.onConfirm : null;
  profileCropState = {
    dataUrl,
    scale: 1,
    fitScale: 1,
    x: 0,
    y: 0,
    dragging: false,
    startX: 0,
    startY: 0,
    naturalWidth: 0,
    naturalHeight: 0
  };
  zoom.value = '1';
  image.onload = () => {
    if (!profileCropState) return;
    profileCropState.naturalWidth = image.naturalWidth;
    profileCropState.naturalHeight = image.naturalHeight;
    updateCropFitScale();
    renderCropTransform();
  };
  image.onerror = () => showToast(langText('تعذر عرض الصورة الحالية، اختر صورة جديدة', 'Unable to show the current image; choose a new one'));
  image.removeAttribute('crossorigin');
  image.src = dataUrl;
  renderCropTransform();
  $('[data-overlay]')?.classList.add('active');
  dialog.classList.add('active');
  if (typeof syncOverlayState === 'function') syncOverlayState();
}

function closeProfileImageEditor() {
  $('[data-profile-image-editor]')?.classList.remove('active');
  if (typeof syncOverlayState === 'function') syncOverlayState();
  else if (!$('[data-profile-password-dialog]')?.classList.contains('active')) $('[data-overlay]')?.classList.remove('active');
  profileCropState = null;
  profileImageEditorConfirm = null;
}

function bindProfileImageEditor() {
  const dialog = $('[data-profile-image-editor]');
  if (!dialog || dialog.dataset.bound === 'true') return;
  dialog.dataset.bound = 'true';
  const stage = $('[data-crop-stage]', dialog);
  const zoom = $('[data-crop-zoom]', dialog);
  zoom?.addEventListener('input', () => {
    if (!profileCropState) return;
    profileCropState.scale = Math.max(1, Number(zoom.value || 1));
    renderCropTransform();
  });
  stage?.addEventListener('pointerdown', (e) => {
    if (!profileCropState) return;
    profileCropState.dragging = true;
    profileCropState.startX = e.clientX - profileCropState.x;
    profileCropState.startY = e.clientY - profileCropState.y;
    stage.setPointerCapture(e.pointerId);
  });
  stage?.addEventListener('pointermove', (e) => {
    if (!profileCropState?.dragging) return;
    profileCropState.x = e.clientX - profileCropState.startX;
    profileCropState.y = e.clientY - profileCropState.startY;
    renderCropTransform();
  });
  stage?.addEventListener('pointerup', () => { if (profileCropState) profileCropState.dragging = false; });
  stage?.addEventListener('pointercancel', () => { if (profileCropState) profileCropState.dragging = false; });
  $$('[data-cancel-image-edit]', dialog).forEach(btn => btn.addEventListener('click', closeProfileImageEditor));
  $('[data-confirm-image-edit]', dialog)?.addEventListener('click', confirmProfileImageEdit);
}

function renderCropTransform() {
  const image = $('[data-crop-image]');
  if (!image || !profileCropState) return;
  if (!profileCropState.fitScale || !profileCropState.naturalWidth || !profileCropState.naturalHeight) updateCropFitScale();
  const width = profileCropState.naturalWidth * profileCropState.fitScale * profileCropState.scale;
  const height = profileCropState.naturalHeight * profileCropState.fitScale * profileCropState.scale;
  constrainCropPan(width, height);
  image.style.width = `${width}px`;
  image.style.height = `${height}px`;
  image.style.transform = `translate(calc(-50% + ${profileCropState.x}px), calc(-50% + ${profileCropState.y}px))`;
}

function constrainCropPan(width, height) {
  const stage = $('[data-crop-stage]');
  if (!stage || !profileCropState) return;
  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height || !width || !height) return;
  const maxX = Math.max(0, (width - rect.width) / 2);
  const maxY = Math.max(0, (height - rect.height) / 2);
  profileCropState.x = Math.min(maxX, Math.max(-maxX, profileCropState.x));
  profileCropState.y = Math.min(maxY, Math.max(-maxY, profileCropState.y));
}

function updateCropFitScale() {
  const stage = $('[data-crop-stage]');
  const image = $('[data-crop-image]');
  if (!stage || !image || !profileCropState) return;
  const rect = stage.getBoundingClientRect();
  const naturalWidth = profileCropState.naturalWidth || image.naturalWidth;
  const naturalHeight = profileCropState.naturalHeight || image.naturalHeight;
  if (!rect.width || !rect.height || !naturalWidth || !naturalHeight) return;
  profileCropState.fitScale = Math.max(rect.width / naturalWidth, rect.height / naturalHeight);
}

async function confirmProfileImageEdit(e) {
  if (!profileCropState) return;
  const button = e?.currentTarget;
  if (button) button.disabled = true;
  try {
    const edited = await createCroppedAvatar(profileCropState);
    const onConfirm = profileImageEditorConfirm;
    closeProfileImageEditor();
    if (onConfirm) {
      await onConfirm(edited);
      return;
    }
    renderProfileAvatar(edited.previewUrl, AppState.user.name);
    pendingAvatarPayload = edited;
    openProfilePasswordDialog('avatar');
  } catch (error) {
    showToast(error?.message || langText('تعذر اعتماد الصورة، حاول مرة أخرى', 'Unable to use the image. Try again'));
  } finally {
    if (button) button.disabled = false;
  }
}

async function createCroppedAvatar(crop) {
  const image = await loadEditableImage(crop.dataUrl);
  const size = 800;
  const stage = $('[data-crop-stage]');
  const rect = stage?.getBoundingClientRect();
  const offsetScaleX = rect?.width ? size / rect.width : 1;
  const offsetScaleY = rect?.height ? size / rect.height : offsetScaleX;
  const baseScale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * crop.scale;
  const drawWidth = image.naturalWidth * baseScale;
  const drawHeight = image.naturalHeight * baseScale;
  const dx = (size - drawWidth) / 2 + crop.x * offsetScaleX;
  const dy = (size - drawHeight) / 2 + crop.y * offsetScaleY;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#120d0a';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
  let previewUrl = '';
  let blob = null;
  try {
    previewUrl = canvas.toDataURL('image/jpeg', .9);
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
  } catch (_) {
    throw new Error(langText('تعذر حفظ تعديل الصورة الحالية بسبب قيود المتصفح. اختر الصورة من الجهاز لتحريرها.', 'Unable to save edits to the current image because of browser restrictions. Choose it from your device to edit it.'));
  }
  if (!blob) throw new Error(langText('تعذر تجهيز الصورة للحفظ، حاول مرة أخرى', 'Unable to prepare the image for saving. Try again'));
  return { blob, previewUrl };
}

function loadEditableImage(src) {
  return new Promise((resolve, reject) => {
    const isRemote = /^https?:\/\//i.test(src);
    const load = (useCors) => {
      const image = new Image();
      const timer = setTimeout(() => {
        image.onload = null;
        image.onerror = null;
        if (useCors) load(false);
        else reject(new Error(langText('استغرق تحميل الصورة وقتاً طويلاً، حاول مرة أخرى', 'Image loading took too long. Try again')));
      }, 8000);
      image.onload = () => {
        clearTimeout(timer);
        resolve(image);
      };
      image.onerror = () => {
        clearTimeout(timer);
        if (useCors) load(false);
        else reject(new Error(langText('تعذر تحميل الصورة للتحرير', 'Unable to load the image for editing')));
      };
      if (useCors) image.crossOrigin = 'anonymous';
      image.src = src;
      if (image.complete && image.naturalWidth) {
        clearTimeout(timer);
        resolve(image);
      }
    };
    load(isRemote);
  });
}

async function saveAvatarWithPassword(password, error) {
  if (!pendingAvatarPayload) return;
  try {
    await uploadProfileAvatar(pendingAvatarPayload.blob, pendingAvatarPayload.previewUrl, password);
    pendingAvatarPayload = null;
    closeProfilePasswordDialog();
  } catch (err) {
    if (error) error.textContent = friendlyError(err, 'كلمة المرور غير صحيحة أو تعذر حفظ الصورة', 'Password is incorrect or the image could not be saved');
  }
}

async function uploadProfileAvatar(blob, previewUrl, password) {
  const body = new FormData();
  body.append('image', blob, 'profile-avatar.jpg');
  body.append('current_password', password);
  const upload = await apiFetch('/customer/avatar', { method: 'POST', body });

  const remoteUrl = upload.avatar_url || upload.avatar;
  if (remoteUrl) {
    sessionStorage.setItem('taza_profile_avatar_preview', previewUrl);
    AppState.user.avatarUrl = remoteUrl;
    persist();
    const canLoadRemote = await imageCanLoad(remoteUrl);
    renderProfileAvatar(canLoadRemote ? remoteUrl : previewUrl, AppState.user.name);
  }
  await refreshCustomerContext();
  if (AppState.user.avatarUrl && await imageCanLoad(AppState.user.avatarUrl)) {
    renderProfileAvatar(AppState.user.avatarUrl, AppState.user.name);
  }
  showToast(langText('تم تحديث الصورة الشخصية', 'Profile image updated'));
}

async function getEditableProfileAvatarSource() {
  const preview = sessionStorage.getItem('taza_profile_avatar_preview');
  if (preview) return preview;
  const visible = $('[data-profile-avatar] img')?.getAttribute('src') || '';
  if (visible.startsWith('data:') || visible.startsWith('blob:')) return visible;
  const remote = AppState.user.avatarUrl || visible;
  if (!remote) return '';
  try {
    const payload = await apiFetch('/customer/avatar/current');
    if (payload?.avatar_data_url) {
      sessionStorage.setItem('taza_profile_avatar_preview', payload.avatar_data_url);
      return payload.avatar_data_url;
    }
  } catch (_) {
    // Fall back to the public image URL if the server copy is unavailable.
  }
  try {
    const response = await fetch(assetUrl(remote), { mode: 'cors' });
    if (!response.ok) return assetUrl(remote);
    const blob = await response.blob();
    return await readFileAsDataUrl(blob);
  } catch (_) {
    return assetUrl(remote);
  }
}

function hasEditableProfileAvatar(user = AppState.user) {
  return Boolean(sessionStorage.getItem('taza_profile_avatar_preview') || user.avatarUrl || $('[data-profile-avatar] img'));
}

function imageCanLoad(url) {
  return new Promise(resolve => {
    const image = new Image();
    const timer = setTimeout(() => resolve(false), 3500);
    image.onload = () => { clearTimeout(timer); resolve(true); };
    image.onerror = () => { clearTimeout(timer); resolve(false); };
    image.src = assetUrl(url);
  });
}

function renderProfileAvatar(url, name = '') {
  const avatar = $('[data-profile-avatar]');
  if (!avatar) return;
  const label = name || langText('الصورة الشخصية', 'Profile image');
  const preview = sessionStorage.getItem('taza_profile_avatar_preview');
  if (url) {
    avatar.classList.add('media-loaded');
    avatar.innerHTML = `<img loading="lazy" decoding="async" src="${esc(assetUrl(url))}" alt="${esc(label)}">`;
    const image = $('img', avatar);
    image.onerror = () => (preview && url !== preview) ? renderProfileAvatar(preview, label) : renderProfileAvatar('', label);
    return;
  }

  const initials = String(label)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('') || 'T';
  avatar.classList.remove('media-loaded');
  avatar.innerHTML = `<span class="profile-avatar-fallback">${esc(initials)}</span>`;
}

let customerOrderRouteMap = null;
let customerOrderRouteLayer = null;

function customerDeliveryRouteMarkup(delivery) {
  if (!Array.isArray(delivery?.route?.geometry) || delivery.route.geometry.length < 2) return '';
  const duration = Number(delivery.route.duration_minutes ?? 0);
  const fallback = Boolean(delivery.route.is_fallback);
  return `<div class="summary-item customer-delivery-route">
    <div class="row-between customer-delivery-route-head">
      <strong>${langText('مسار التوصيل المعتمد', 'Assigned delivery route')}</strong>
      <span class="customer-route-quality ${fallback?'fallback':''}">${fallback?langText('تقدير احتياطي', 'Fallback estimate'):langText('مسار طرق فعلي', 'Road route')}</span>
    </div>
    <div class="customer-route-metrics">
      <span><b>${(Number(delivery.distance_meters ?? 0)/1000).toFixed(1)}</b> ${langText('كم', 'km')}</span>
      <span><b>${duration || '—'}</b> ${duration?langText('دقيقة', 'min'):''}</span>
    </div>
    <div class="customer-order-route-map" data-customer-order-route-map aria-label="${esc(langText('خريطة مسار التوصيل', 'Delivery route map'))}"></div>
  </div>`;
}

function renderCustomerDeliveryRoute(delivery) {
  const container = $('[data-customer-order-route-map]');
  if (!container || typeof L === 'undefined') return;
  if (customerOrderRouteMap) {
    customerOrderRouteMap.remove();
    customerOrderRouteMap = null;
    customerOrderRouteLayer = null;
  }
  const points = delivery.route.geometry
    .filter(point => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
    .map(([lng, lat]) => [Number(lat), Number(lng)]);
  if (points.length < 2) return;
  customerOrderRouteMap = L.map(container, { scrollWheelZoom:false }).setView(points[0], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19,
    attribution:'&copy; OpenStreetMap contributors',
  }).addTo(customerOrderRouteMap);
  customerOrderRouteLayer = L.layerGroup().addTo(customerOrderRouteMap);
  const fallback = Boolean(delivery.route.is_fallback);
  L.circleMarker(points[0], {radius:8,color:'#7f1d1d',weight:3,fillColor:'#ef4444',fillOpacity:1})
    .bindPopup(langText('المطعم', 'Restaurant')).addTo(customerOrderRouteLayer);
  L.polyline(points, {color:fallback?'#f59e0b':'#2563eb',weight:5,opacity:.95,dashArray:fallback?'8 8':null})
    .addTo(customerOrderRouteLayer);
  L.circleMarker(points[points.length-1], {radius:7,color:'#1e3a8a',weight:3,fillColor:'#2563eb',fillOpacity:1})
    .bindPopup(esc(delivery.delivery_address || langText('موقع التوصيل', 'Delivery location'))).addTo(customerOrderRouteLayer);
  customerOrderRouteMap.fitBounds(points, {padding:[24,24],maxZoom:16});
  setTimeout(() => customerOrderRouteMap?.invalidateSize(), 0);
}

async function initOrdersPage() {
  if (!requireCustomerLogin()) return;
  const list = $('[data-orders-list]');
  const detail = $('[data-detail-modal]');
  const overlay = $('[data-overlay]');
  const payload = await safeApi('/customer/orders');
  let orders = payload?.orders || [];
  let activeDetailId = null;
  let ordersPollTimer = null;
  let ordersPollInFlight = false;
  const cancellationRefundMessage = refund => {
    const restored = Number(refund?.loyalty_points_restored || 0);
    const reversed = Number(refund?.loyalty_points_reversed || 0);
    const money = Number(refund?.money_refunded || 0);
    if (restored > 0) return langText(`تم الإلغاء وإعادة ${restored} نقطة إلى رصيدك`, `Order cancelled and ${restored} points were returned`);
    if (money > 0) return langText(`تم الإلغاء وتسوية مبلغ ${formatCurrency(money)}`, `Order cancelled and ${formatCurrency(money)} was refunded`);
    if (refund?.kind === 'test_payment') return langText('تم إلغاء الدفع الاختباري وعكس نقاط المكافأة', 'Test payment cancelled and reward points reversed');
    if (refund?.kind === 'uncollected_cash') return langText('تم الإلغاء، ولم يتم تحصيل أي مبلغ نقدي', 'Order cancelled; no cash was collected');
    if (reversed > 0) return langText(`تم الإلغاء وعكس ${reversed} نقطة مكتسبة من الطلب`, `Order cancelled and ${reversed} earned points were reversed`);
    return langText('تم إلغاء الطلب وتسوية الدفع بنجاح', 'Order cancelled and payment settled successfully');
  };
  const ordersLiveFingerprint = source => JSON.stringify((source || []).map(order => ({
    id: order.id,
    status: order.status,
    updated_at: order.updated_at,
    delivery_status: order.delivery?.status,
    delivery_driver: order.delivery?.driver?.id,
    delivery_rating: order.delivery?.driver_rating,
    reservation_status: order.reservation?.status,
  })));
  let currentOrdersFingerprint = ordersLiveFingerprint(orders);
  const uiOrderTypeFromApi = (type = '') => type === 'normal' ? 'ordinary' : type;
  const reorderRedirectFor = (type = '') => ({
    ordinary: 'payment.html?order=ordinary',
    delivery: 'delivery.html',
    reservation: 'reservation.html'
  })[type] || 'menu.html';
  const cartItemFromOrderItem = (item) => {
    const itemType = item?.item_type;
    const referenceId = Number(item?.reference_id);
    const quantity = Math.max(1, Number(item?.quantity || 1));
    if (!['product', 'offer'].includes(itemType) || !Number.isFinite(referenceId) || referenceId <= 0) return null;
    const unitPrice = Number(item.unit_price || (Number(item.subtotal || 0) / quantity) || 0);
    const key = `${itemType}:${referenceId}`;
    return {
      key,
      id: referenceId,
      item_type: itemType,
      reference_id: referenceId,
      name: item.name || langText('عنصر من الطلب السابق', 'Previous order item'),
      price: unitPrice,
      qty: quantity,
      imageUrl: item.image_url || null
    };
  };
  const reorderFromOrder = async (id) => {
    let order = orders.find(o => String(o.id) === String(id));
    const live = await safeApi(`/customer/orders/${id}`);
    if (live?.order) {
      order = live.order;
      orders = orders.map(o => String(o.id) === String(id) ? order : o);
    }
    if (!order) return showToast(langText('تعذر العثور على الطلب السابق', 'Unable to find this previous order'), { kind: 'error' });

    const nextCart = {};
    (order.items || []).map(cartItemFromOrderItem).filter(Boolean).forEach(item => {
      nextCart[item.key] = item;
    });
    if (!Object.keys(nextCart).length) {
      return showToast(langText('لا توجد عناصر صالحة لإعادة هذا الطلب', 'No valid items to reorder'), { kind: 'warning' });
    }

    const orderType = uiOrderTypeFromApi(order.type);
    AppState.cart = nextCart;
    AppState.deliveryMeta = null;
    AppState.reservationMeta = null;
    setOrderType(orderType);
    setOrderNotes(order.notes || '');
    persist();
    renderCartSummary();
    notifyCartUpdated();

    showToast(langText('تم نسخ الطلب السابق إلى السلة', 'Previous order copied to cart'), { kind: 'cart' });
    setTimeout(() => {
      location.href = reorderRedirectFor(orderType);
    }, 450);
  };
  const render = () => {
    if (!list) return;
    if (!orders.length) {
      list.innerHTML = `
        <article class="empty-state orders-empty-state">
          <div class="empty-illustration empty-illustration-receipt" aria-hidden="true"><span></span><i></i><b></b></div>
          <div>
            <h3>${langText('لا توجد طلبات حتى الآن', 'No orders yet')}</h3>
            <p>${langText('ابدأ طلبك الأول وسيظهر هنا مع الحالة والتفاصيل.', 'Start your first order and it will appear here with its status and details.')}</p>
            <a class="btn btn-primary" href="menu.html?type=ordinary">${langText('ابدأ طلبك الآن', 'Start ordering')}</a>
          </div>
        </article>`;
      return;
    }
    list.innerHTML = orders.map(order => {
      const visual = orderTypeVisual(order);
      return `
      <article class="order-card order-type-${visual.key} ${orderDisplayStatusClass(order)}">
        <div class="order-card-main">
          <div class="order-type-mark" aria-hidden="true"><span>${visual.icon}</span></div>
          <div class="order-card-heading">
            <span class="order-number">${langText('طلب', 'Order')} #${esc(order.id)}</span>
            <h3>${esc(orderTypeLabel(order))}</h3>
            <small class="muted">${esc(visual.caption)} · ${esc(orderCreatedLabel(order.created_at))}</small>
          </div>
        </div>
        <div class="order-card-meta">
          <span class="status-badge">${esc(orderStatusLabel(order))}</span>
          <strong>${formatCurrency(order.final_price || order.total_price || 0)}</strong>
        </div>
        ${orderTimelineHtml(order, { compact: true })}
        <div class="order-card-actions">
          <button class="btn btn-primary" data-reorder-order="${esc(order.id)}">${langText('إعادة الطلب', 'Reorder')}</button>
          <button class="btn btn-secondary" data-view-order="${esc(order.id)}">${langText('عرض التفاصيل', 'View details')}</button>
          ${isPendingOrder(order) ? `<button class="btn btn-danger" data-cancel-order="${esc(order.id)}">${langText('إلغاء الطلب', 'Cancel order')}</button>` : ''}
        </div>
      </article>`;
    }).join('');
    $$('[data-reorder-order]', list).forEach(btn => btn.onclick = () => reorderFromOrder(btn.dataset.reorderOrder));
    $$('[data-view-order]', list).forEach(btn => btn.onclick = () => openOrderDetail(btn.dataset.viewOrder));
    $$('[data-cancel-order]', list).forEach(btn => btn.onclick = async () => {
      const result = await safeApi(`/customer/orders/${btn.dataset.cancelOrder}`, { method: 'DELETE' });
      if (!result) return showToast(langText('تعذر إلغاء الطلب؛ حدّث الصفحة وحاول مجدداً', 'Unable to cancel the order; refresh and try again'), { kind: 'error' });
      orders = orders.map(o => String(o.id) === btn.dataset.cancelOrder
        ? {
            ...o,
            status: 'cancelled',
            delivery: o.delivery ? { ...o.delivery, status: 'cancelled' } : o.delivery,
            reservation: o.reservation ? { ...o.reservation, status: 'cancelled' } : o.reservation
          }
        : o);
      currentOrdersFingerprint = ordersLiveFingerprint(orders);
      render();
      await refreshCustomerContext();
      showToast(cancellationRefundMessage(result.refund));
    });
  };
  const openOrderDetail = async (id, { fetchLive = true } = {}) => {
    activeDetailId = String(id);
    let order = orders.find(o => String(o.id) === String(id));
    if (!order) return;

    // جلب التفاصيل المحدثة حتى يظهر تقييم السائق وحالة الطلب الجديدة بعد اكتمال التوصيل مباشرة.
    if (fetchLive) {
      const live = await safeApi(`/customer/orders/${id}`);
      if (live?.order) {
        order = live.order;
        orders = orders.map(o => String(o.id) === String(id) ? order : o);
        currentOrdersFingerprint = ordersLiveFingerprint(orders);
      }
    }

    const delivery = order.delivery;
    const canRateDriver = !!(delivery?.can_be_rated && !delivery?.driver_rating && delivery?.driver?.id);
    const orderItems = order.items || [];
    const orderItemsHtml = orderItems.map((item, index) => `
          <article class="order-meal-card ${item.can_rate_meal ? 'is-awaiting-rating' : 'is-rated'}">
            <header class="order-meal-card-head">
              <div class="order-meal-identity">
                <span class="order-meal-index" aria-hidden="true">${index + 1}</span>
                <div>
                  <strong>${esc(item.name)}</strong>
                  <span class="order-meal-quantity">${langText('الكمية', 'Quantity')} <b>× ${esc(item.quantity)}</b></span>
                </div>
              </div>
              <strong class="order-meal-price">${formatCurrency(item.subtotal || 0)}</strong>
            </header>
            ${item.meal_review ? `<div class="meal-rating-result"><div class="meal-rating-result-title"><span aria-hidden="true">✓</span><strong>${langText('تم إرسال تقييمك', 'Your rating was sent')}</strong></div><span class="rating" aria-label="${langText('تقييمك', 'Your rating')}: ${esc(item.meal_review.rating || 0)} ${langText('من 5', 'out of 5')}">${'★'.repeat(Number(item.meal_review.rating || 0))}</span>${item.meal_review.comment ? `<p>${esc(item.meal_review.comment)}</p>` : ''}</div>` : ''}
            ${item.can_rate_meal ? `<form class="rating-form meal-rating-form" data-meal-rating-form data-order-id="${esc(order.id)}" data-product-id="${esc(item.reference_id)}"><div class="meal-rating-form-head"><div><strong>${langText('قيّم هذه الوجبة', 'Rate this meal')}</strong><small>${langText('اختر عدد النجوم المناسب لتجربتك', 'Choose the stars that match your experience')}</small></div><span>${langText('مطلوب', 'Required')}</span></div><div class="meal-star-row"><div class="star-select" data-star-select role="group" aria-label="${langText('اختر تقييم الوجبة من خمس نجوم', 'Choose a meal rating out of five stars')}">${[1,2,3,4,5].map(n => `<button type="button" data-star="${n}" aria-label="${n} ${langText('نجوم', 'stars')}" aria-pressed="false">★</button>`).join('')}</div><small>${langText('اضغط لتحديد تقييمك', 'Tap to select your rating')}</small></div><textarea class="textarea" rows="2" name="comment" maxlength="500" placeholder="${langText('اكتب رأيك بالطعم أو التغليف (اختياري)', 'Share your thoughts on taste or packaging (optional)')}"></textarea><div class="meal-rating-form-actions"><small>${langText('يمكنك إرسال التقييم من دون تعليق', 'You can submit without a comment')}</small><button class="btn btn-primary" type="submit">${langText('إرسال التقييم', 'Send rating')}</button></div></form>` : ''}
          </article>`).join('');
    $('[data-detail-content]').innerHTML = `
      <h3>#${esc(order.id)}</h3>
      <div class="order-card-actions detail-order-actions">
        <button class="btn btn-primary" data-reorder-order="${esc(order.id)}">${langText('إعادة الطلب', 'Reorder')}</button>
      </div>
      ${orderTimelineHtml(order)}
      <div class="summary-list">
        <div class="summary-item"><div class="row-between"><strong>${langText('نوع الطلب', 'Order type')}</strong><span>${esc(orderTypeLabel(order))}</span></div></div>
        <div class="summary-item"><div class="row-between"><strong>${langText('الحالة', 'Status')}</strong><span>${esc(orderStatusLabel(order))}</span></div></div>
        ${order.notes ? `<div class="summary-item"><strong>${langText('ملاحظة الطلب', 'Order note')}</strong><p class="muted">${esc(order.notes)}</p></div>` : ''}
        <section class="order-meals-section" aria-labelledby="order-meals-title">
          <div class="order-meals-section-head">
            <div><span class="order-meals-eyebrow">${langText('تفاصيل الوجبة', 'Meal details')}</span><h4 id="order-meals-title">${langText('عناصر الطلب', 'Order items')}</h4></div>
            <span class="order-meals-count">${orderItems.length} ${langText(orderItems.length === 1 ? 'عنصر' : 'عناصر', orderItems.length === 1 ? 'item' : 'items')}</span>
          </div>
          <div class="order-meals-scroll" data-order-meals-list tabindex="0">
            ${orderItemsHtml || `<p class="order-meals-empty">${langText('لا توجد عناصر في هذا الطلب', 'There are no items in this order')}</p>`}
          </div>
        </section>
        ${delivery ? `<div class="summary-item"><strong>${langText('بيانات التوصيل', 'Delivery data')}</strong><div class="muted">${esc(delivery.delivery_address || '')} • ${esc(delivery.distance_km || '')} km • ${formatCurrency(delivery.delivery_cost || 0)}</div>${delivery.driver ? `<div class="driver-mini"><strong>${esc(delivery.driver.name || '')}</strong><span>${esc(delivery.driver.phone || '')}</span></div>` : `<p class="muted">${langText('سيظهر اسم السائق بعد تعيينه من مدير التوصيل', 'Driver name appears after assignment by delivery manager')}</p>`}</div>` : ''}
        ${delivery ? customerDeliveryRouteMarkup(delivery) : ''}
        ${delivery?.driver_rating ? `<div class="summary-item"><strong>${langText('تقييمك للسائق', 'Your driver rating')}</strong><div class="rating">${'★'.repeat(Number(delivery.driver_rating || 0))}</div><p class="muted">${esc(delivery.driver_feedback || '')}</p></div>` : ''}
        ${canRateDriver ? `<form class="summary-item rating-form" data-driver-rating-form data-delivery-id="${esc(delivery.id)}"><strong>${langText('قيّم تجربة التوصيل', 'Rate delivery experience')}</strong><div class="star-select" data-star-select>${[1,2,3,4,5].map(n => `<button type="button" data-star="${n}">★</button>`).join('')}</div><textarea class="textarea" rows="3" name="feedback" placeholder="${langText('ملاحظتك اختيارية', 'Optional feedback')}"></textarea><button class="btn btn-primary" type="submit">${langText('إرسال التقييم', 'Send rating')}</button></form>` : ''}
        ${order.reservation ? `<div class="summary-item"><strong>${langText('بيانات الحجز', 'Reservation data')}</strong><div class="muted">T${esc(order.reservation.table_number || '')} • ${esc(order.reservation.table_type || '')} • ${esc(order.reservation.seats_count || '')} • ${esc(order.reservation.reservation_time || '')}</div></div>` : ''}
      </div>`;

    const bindStarForm = (ratingForm, onSubmit) => {
      let ratingValue = 5;
      const stars = $$('[data-star]', ratingForm);
      stars.forEach(btn => btn.addEventListener('click', () => {
        ratingValue = Number(btn.dataset.star);
        stars.forEach(star => {
          const isActive = Number(star.dataset.star) <= ratingValue;
          star.classList.toggle('active', isActive);
          star.setAttribute('aria-pressed', String(isActive));
        });
      }));
      stars.forEach(star => {
        const isActive = Number(star.dataset.star) <= ratingValue;
        star.classList.toggle('active', isActive);
        star.setAttribute('aria-pressed', String(isActive));
      });
      ratingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await onSubmit(ratingForm, ratingValue);
      });
    };

    const ratingForm = $('[data-driver-rating-form]');
    if (ratingForm) {
      bindStarForm(ratingForm, async (form, ratingValue) => {
        const data = await safeApi(`/customer/delivery/${ratingForm.dataset.deliveryId}/rate`, { method: 'POST', body: { rating: ratingValue, feedback: ratingForm.feedback.value.trim() } });
        if (data) {
          delivery.driver_rating = ratingValue;
          delivery.driver_feedback = ratingForm.feedback.value.trim();
          showToast(langText('شكراً لك، تم إرسال التقييم', 'Thank you, rating sent'));
          openOrderDetail(id);
        } else showToast(langText('تعذر إرسال التقييم الآن', 'Unable to send rating now'));
      });
    }
    $$('[data-meal-rating-form]').forEach(form => {
      bindStarForm(form, async (ratingForm, ratingValue) => {
        const comment = ratingForm.comment.value.trim();
        const data = await safeApi(`/customer/orders/${ratingForm.dataset.orderId}/products/${ratingForm.dataset.productId}/rate`, {
          method: 'POST',
          body: { rating: ratingValue, comment }
        });
        if (data) {
          showToast(langText('شكراً لك، تم إرسال تقييم الوجبة', 'Thank you, meal rating sent'));
          openOrderDetail(id);
        } else showToast(langText('تعذر إرسال تقييم الوجبة الآن', 'Unable to send meal rating now'), { kind: 'error' });
      });
    });
    $('[data-reorder-order]', detail)?.addEventListener('click', () => reorderFromOrder(order.id));

    overlay?.classList.add('active');
    detail?.classList.add('active');
    if (delivery?.route?.geometry) renderCustomerDeliveryRoute(delivery);
  };

  const refreshOrdersLive = async () => {
    if (ordersPollInFlight || document.hidden) return;
    ordersPollInFlight = true;
    try {
      const live = await safeApi('/customer/orders');
      const nextOrders = live?.orders || [];
      const nextFingerprint = ordersLiveFingerprint(nextOrders);
      if (nextFingerprint === currentOrdersFingerprint) return;

      orders = nextOrders;
      currentOrdersFingerprint = nextFingerprint;
      render();
      if (activeDetailId && detail?.classList.contains('active')) {
        await openOrderDetail(activeDetailId, { fetchLive: false });
      }
    } finally {
      ordersPollInFlight = false;
    }
  };

  const stopOrdersLiveUpdates = () => {
    if (ordersPollTimer) clearInterval(ordersPollTimer);
    ordersPollTimer = null;
  };

  ordersPollTimer = setInterval(refreshOrdersLive, 5_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshOrdersLive();
  });
  window.addEventListener('pagehide', stopOrdersLiveUpdates, { once: true });

  $('[data-close-detail]')?.addEventListener('click', () => {
    activeDetailId = null;
    customerOrderRouteMap?.remove();
    customerOrderRouteMap = null;
    customerOrderRouteLayer = null;
    closeDetail();
    $('[data-overlay]')?.classList.remove('active');
  });
  render();
}

function statusClass(status) {
  const key = normalizedLookupKey(status);
  if (['pending', 'created', 'received', 'order_received', 'قيد_الانتظار', 'تم_الاستلام'].includes(key)) return 'pending';
  if (['confirmed', 'accepted', 'processing', 'preparing', 'order_processing', 'order_started', 'ready', 'on_the_way', 'out_for_delivery', 'delivery_started', 'in_delivery', 'مؤكد', 'تم_القبول', 'قيد_التحضير', 'جاهز', 'في_الطريق', 'بدأ_التوصيل'].includes(key)) return 'processing';
  if (['completed', 'delivered', 'done', 'مكتمل', 'تم_التسليم'].includes(key)) return 'completed';
  if (['cancelled', 'canceled', 'ملغى'].includes(key)) return 'canceled';
  return 'processing';
}
