'use strict';

let _restaurantInfo = {};
let _galleryImages  = [];
let _suggestions    = [];
let _reviews        = [];
let _workingHours   = {};
let _activeTab      = 'overview';
let _restaurantFormReady = false;

const DAYS = [
  { key:'saturday',  ar:'السبت',     en:'Saturday'  },
  { key:'sunday',    ar:'الأحد',     en:'Sunday'    },
  { key:'monday',    ar:'الاثنين',   en:'Monday'    },
  { key:'tuesday',  ar:'الثلاثاء',  en:'Tuesday'   },
  { key:'wednesday', ar:'الأربعاء',  en:'Wednesday' },
  { key:'thursday',  ar:'الخميس',    en:'Thursday'  },
  { key:'friday',    ar:'الجمعة',    en:'Friday'    },
];

const WEBSITE_CONTENT_GROUPS = [
  { key:'hero', icon:'fa-wand-magic-sparkles', ar:'واجهة الصفحة الرئيسية', en:'Page Hero', fields:[
    ['hero_eyebrow_ar','العبارة العلوية — عربي','Top label — Arabic','input'],
    ['hero_eyebrow_en','العبارة العلوية — إنجليزي','Top label — English','input'],
    ['hero_title_ar','العنوان الرئيسي — عربي','Main title — Arabic','input'],
    ['hero_title_en','العنوان الرئيسي — إنجليزي','Main title — English','input'],
    ['hero_title_accent_ar','العنوان المميز — عربي','Accent title — Arabic','input'],
    ['hero_title_accent_en','العنوان المميز — إنجليزي','Accent title — English','input'],
    ['hero_description_ar','الوصف — عربي','Description — Arabic','textarea'],
    ['hero_description_en','الوصف — إنجليزي','Description — English','textarea'],
  ]},
  { key:'story', icon:'fa-book-open', ar:'حكايتنا', en:'Our Story', fields:[
    ['story_title_ar','العنوان — عربي','Title — Arabic','input'],
    ['story_title_en','العنوان — إنجليزي','Title — English','input'],
    ['story_paragraph_one_ar','الفقرة الأولى — عربي','First paragraph — Arabic','textarea'],
    ['story_paragraph_one_en','الفقرة الأولى — إنجليزي','First paragraph — English','textarea'],
    ['story_paragraph_two_ar','الفقرة الثانية — عربي','Second paragraph — Arabic','textarea'],
    ['story_paragraph_two_en','الفقرة الثانية — إنجليزي','Second paragraph — English','textarea'],
  ]},
  { key:'values', icon:'fa-gem', ar:'القيم والمميزات', en:'Values & Benefits', fields:[
    ['value_one_title_ar','الميزة 1 — عربي','Value 1 — Arabic','input'],
    ['value_one_title_en','الميزة 1 — إنجليزي','Value 1 — English','input'],
    ['value_one_description_ar','وصف الميزة 1 — عربي','Value 1 description — Arabic','textarea'],
    ['value_one_description_en','وصف الميزة 1 — إنجليزي','Value 1 description — English','textarea'],
    ['value_two_title_ar','الميزة 2 — عربي','Value 2 — Arabic','input'],
    ['value_two_title_en','الميزة 2 — إنجليزي','Value 2 — English','input'],
    ['value_two_description_ar','وصف الميزة 2 — عربي','Value 2 description — Arabic','textarea'],
    ['value_two_description_en','وصف الميزة 2 — إنجليزي','Value 2 description — English','textarea'],
    ['value_three_title_ar','الميزة 3 — عربي','Value 3 — Arabic','input'],
    ['value_three_title_en','الميزة 3 — إنجليزي','Value 3 — English','input'],
    ['value_three_description_ar','وصف الميزة 3 — عربي','Value 3 description — Arabic','textarea'],
    ['value_three_description_en','وصف الميزة 3 — إنجليزي','Value 3 description — English','textarea'],
  ]},
  { key:'visit', icon:'fa-location-dot', ar:'قسم الزيارة', en:'Visit Section', fields:[
    ['visit_title_ar','العنوان — عربي','Title — Arabic','input'],
    ['visit_title_en','العنوان — إنجليزي','Title — English','input'],
    ['visit_description_ar','الوصف — عربي','Description — Arabic','textarea'],
    ['visit_description_en','الوصف — إنجليزي','Description — English','textarea'],
  ]},
];

const FOOTER_CONTENT_FIELDS = [
  ['footer_tagline_ar','الشعار النصي — عربي','Tagline — Arabic','input'],
  ['footer_tagline_en','الشعار النصي — إنجليزي','Tagline — English','input'],
  ['footer_description_ar','وصف الفوتر — عربي','Footer description — Arabic','textarea'],
  ['footer_description_en','وصف الفوتر — إنجليزي','Footer description — English','textarea'],
  ['hours_weekdays_ar','ساعات السبت–الخميس — عربي','Sat–Thu hours — Arabic','input'],
  ['hours_weekdays_en','ساعات السبت–الخميس — إنجليزي','Sat–Thu hours — English','input'],
  ['hours_friday_ar','ساعات الجمعة — عربي','Friday hours — Arabic','input'],
  ['hours_friday_en','ساعات الجمعة — إنجليزي','Friday hours — English','input'],
];

const WEBSITE_CONTENT_DEFAULTS = {
  hero_eyebrow_ar:'من قلب اللاذقية', hero_eyebrow_en:'From the heart of Latakia',
  hero_title_ar:'نكهة قريبة،', hero_title_en:'Familiar flavor,',
  hero_title_accent_ar:'وتجربة صُنعت لتبقى.', hero_title_accent_en:'crafted to stay with you.',
  hero_description_ar:'في TAZA 041 نجمع بين الطعام المحضّر بعناية والخدمة السريعة والتجربة الرقمية السهلة؛ من أول تصفّح للمنيو وحتى وصول طلبك.',
  hero_description_en:'At TAZA 041, carefully prepared food, fast service, and a seamless digital journey come together—from the first menu browse until your order arrives.',
  story_title_ar:'أكثر من وجبة؛ لحظة يومية بطابعنا الخاص.', story_title_en:'More than a meal—a daily moment with our signature.',
  story_paragraph_one_ar:'بدأت فكرتنا من رغبة بسيطة: أن نقدّم طعامًا مألوفًا بجودة يمكن ملاحظتها في كل تفصيل. لذلك نهتم بالمكوّن، بطريقة التحضير، وبالوقت الذي يصل فيه الطلب إليك.',
  story_paragraph_one_en:'Our story began with a simple wish: serve familiar food with quality you can notice in every detail. That means caring about the ingredients, preparation, and the moment your order reaches you.',
  story_paragraph_two_ar:'وصمّمنا تجربتنا الرقمية لتكون امتدادًا للمطعم: واضحة، سريعة، وبدون خطوات مربكة.',
  story_paragraph_two_en:'We designed our digital experience as an extension of the restaurant: clear, quick, and free of confusing steps.',
  value_one_title_ar:'جودة يمكن تذوّقها', value_one_title_en:'Quality you can taste',
  value_one_description_ar:'مكوّنات مختارة وتحضير يومي يحافظ على النكهة كما يجب أن تكون.', value_one_description_en:'Selected ingredients and daily preparation keep every flavor at its best.',
  value_two_title_ar:'خدمة تحترم وقتك', value_two_title_en:'Service that respects your time',
  value_two_description_ar:'خطوات واضحة، متابعة سهلة، وفريق جاهز للمساعدة عند الحاجة.', value_two_description_en:'Clear steps, easy tracking, and a team ready to help whenever needed.',
  value_three_title_ar:'تجربة قريبة منك', value_three_title_en:'An experience close to you',
  value_three_description_ar:'سواء زرتنا أو طلبت من مكانك، نحرص أن تشعر بنفس الاهتمام.', value_three_description_en:'Whether you visit or order from home, you receive the same level of care.',
  visit_title_ar:'زيارتك تسعدنا، وطلبك يصل إليك.', visit_title_en:'We would love your visit—or bring your order to you.',
  visit_description_ar:'تجدنا في اللاذقية، شارع الزراعة، مقابل السكن الجامعي. تواصل معنا قبل الزيارة أو ابدأ طلبك مباشرة.',
  visit_description_en:'Find us in Latakia, Agriculture Street, opposite the university dorms. Contact us before visiting or start your order now.',
  footer_tagline_ar:'نكهة تجمعنا', footer_tagline_en:'Flavor brings us together',
  footer_description_ar:'طعام نحبه، وتجربة نصنعها بعناية من أجلك.', footer_description_en:'Food we love and an experience made carefully for you.',
  hours_weekdays_ar:'10:00 صباحًا – 12:00 ليلًا', hours_weekdays_en:'10:00 AM – 12:00 AM',
  hours_friday_ar:'الجمعة: 1:00 ظهرًا – 12:00 ليلًا', hours_friday_en:'Friday: 1:00 PM – 12:00 AM',
};

const DEFAULT_FOOTER_LINKS = [
  {label_ar:'الرئيسية', label_en:'Home', url:'index.html'},
  {label_ar:'المنيو', label_en:'Menu', url:'menu.html'},
  {label_ar:'عن المطعم', label_en:'About', url:'about.html'},
];

document.addEventListener('DOMContentLoaded', () => {
  TAZA.initDashboardPage(['communication_manager', 'general_manager']);
  initTabs();
  initEventListeners();
  loadOverview();
  loadNotificationsPage();
  TAZA.LiveSync.subscribe(async () => {
    if (_activeTab === 'overview') return loadOverview();
    if (_activeTab === 'suggestions') return loadSuggestions();
    if (_activeTab === 'reviews') return loadReviews();
    if (_activeTab === 'notifications') return loadNotificationsPage();
  });
  document.querySelectorAll('.lang-btn').forEach(btn => btn.addEventListener('click', refreshActiveTabLanguage));
});

function refreshActiveTabLanguage() {
  if (_activeTab === 'restaurant-info') {
    const isAr = TAZA.Lang.current === 'ar';
    document.querySelectorAll('#hours-grid .hours-row').forEach((row, index) => {
      const day = DAYS[index];
      const label = row.querySelector('.hours-day');
      const toggle = row.querySelector('.hours-toggle');
      const state = row.querySelector('.hours-state-label');
      const isOpen = toggle?.classList.contains('on');
      if (label && day) label.textContent = isAr ? day.ar : day.en;
      if (state) state.textContent = isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed');
      if (toggle) toggle.title = isOpen ? (isAr ? 'مفتوح' : 'Open') : (isAr ? 'مغلق' : 'Closed');
    });
    const saveState = document.getElementById('restaurant-save-state');
    setRestaurantSaveState(saveState?.classList.contains('is-dirty') ? 'dirty' : saveState?.classList.contains('is-saving') ? 'saving' : 'saved');
    updateRestaurantEditorPreview();
    return;
  }
  const refreshers = { overview:loadOverview, 'restaurant-info':loadRestaurantInfo, gallery:loadGallery, suggestions:loadSuggestions, reviews:loadReviews, notifications:loadNotificationsPage, profile:TAZA.loadEmployeeProfile };
  refreshers[_activeTab]?.();
}

// ── Tabs ──────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.nav-tab[data-tab]').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.querySelectorAll('.sidebar-item[data-tab]').forEach(el =>
    el.addEventListener('click', (e) => { e.preventDefault(); switchTab(el.dataset.tab); }));
}

function switchTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('.nav-tab[data-tab]').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.sidebar-item[data-tab]').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.section-content').forEach(s =>
    s.classList.toggle('active', s.id === `tab-${tab}`));

  const titles = {
    overview:         {ar:'نظرة عامة',           en:'Overview'},
    'restaurant-info':{ar:'معلومات المطعم',       en:'Restaurant Info'},
    gallery:          {ar:'معرض الصور',            en:'Gallery'},
    suggestions:      {ar:'اقتراحات الوجبات',     en:'Meal Suggestions'},
    reviews:          {ar:'تقييمات الزبائن',      en:'Customer Reviews'},
    notifications:    {ar:'الإشعارات',            en:'Notifications'},
    profile:          {ar:'ملفي الشخصي',          en:'My Profile'},
  };
  const lang = TAZA.Lang.current;
  const pt   = document.getElementById('page-title');
  if (pt && titles[tab]) pt.textContent = titles[tab][lang];

  const loaders = {
    'restaurant-info': loadRestaurantInfo,
    gallery:           () => { _galleryImages.length ? renderGallery(_galleryImages) : loadGallery(); },
    suggestions:       () => { _suggestions.length ? renderSuggestionsGrid(_suggestions) : loadSuggestions(); },
    reviews:           () => { if (_reviews.length) { renderReviewsSummary(_reviews); renderReviewsList(_reviews); } else loadReviews(); },
    notifications:     loadNotificationsPage,
    profile:           TAZA.loadEmployeeProfile,
  };
  loaders[tab]?.();
  if (tab === 'restaurant-info') {
    setTimeout(() => _restaurantMap?.invalidateSize?.(), 250);
  }
}

// ── Events ────────────────────────────────────
function initEventListeners() {
  // Restaurant Info
  document.getElementById('save-info-btn')
    ?.addEventListener('click', saveRestaurantInfo);
  document.getElementById('logo-input')
    ?.addEventListener('change', uploadLogo);
  document.getElementById('add-footer-link-btn')
    ?.addEventListener('click', () => {
      const rows = document.querySelectorAll('#footer-links-editor .footer-link-row');
      if (rows.length >= 8) {
        TAZA.Toast.warning(TAZA.Lang.current === 'ar' ? 'الحد الأقصى 8 روابط' : 'Maximum 8 links');
        return;
      }
      appendFooterLinkRow({label_ar:'', label_en:'', url:''});
      markRestaurantInfoDirty();
    });
  document.getElementById('footer-links-editor')
    ?.addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove-footer-link]');
      if (remove) {
        remove.closest('.footer-link-row')?.remove();
        markRestaurantInfoDirty();
      }
    });
  const restaurantShell = document.getElementById('restaurant-editor-shell');
  restaurantShell?.addEventListener('input', (e) => {
    if (e.target.matches('input, textarea')) {
      updateRestaurantEditorPreview();
      markRestaurantInfoDirty();
    }
  });
  restaurantShell?.addEventListener('change', (e) => {
    if (e.target.matches('input, textarea')) {
      updateRestaurantEditorPreview();
      markRestaurantInfoDirty();
    }
  });
  document.querySelectorAll('.restaurant-section-nav a').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.restaurant-section-nav a').forEach(item => item.classList.remove('active'));
      link.classList.add('active');
    });
  });

  // Gallery
  document.getElementById('gallery-upload-input')
    ?.addEventListener('change', uploadGalleryImages);
  document.getElementById('gallery-grid')
    ?.addEventListener('click', handleGalleryAction);

  // Suggestions filter
  document.getElementById('suggestions-filter')
    ?.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      document.querySelectorAll('#suggestions-filter .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      loadSuggestions(chip.dataset.filter);
    });
  document.getElementById('suggestions-grid')
    ?.addEventListener('click', handleSuggestionAction);

  // Reviews filter
  document.getElementById('reviews-rating-filter')
    ?.addEventListener('change', loadReviews);

  // Suggestion modal
  document.getElementById('close-suggestion-modal')
    ?.addEventListener('click', () => closeModal('modal-suggestion'));
  document.getElementById('cancel-suggestion-btn')
    ?.addEventListener('click', () => closeModal('modal-suggestion'));

  // Notifications
  document.getElementById('mark-all-read-btn')
    ?.addEventListener('click', markAllRead);
  document.getElementById('panel-mark-all')
    ?.addEventListener('click', markAllRead);

}
