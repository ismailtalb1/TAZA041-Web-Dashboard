'use strict';

let mealSuggestionStatusChannel = null;
try {
  if ('BroadcastChannel' in window) {
    mealSuggestionStatusChannel = new BroadcastChannel('taza-meal-suggestions');
  }
} catch (_) { /* Dashboard LiveSync remains the timed fallback. */ }

function publishMealSuggestionStatusChange(id, status) {
  mealSuggestionStatusChannel?.postMessage({
    type: 'suggestion-status-changed',
    suggestionId: Number(id),
    status,
    changedAt: new Date().toISOString()
  });
}

window.addEventListener('pagehide', () => mealSuggestionStatusChannel?.close(), { once: true });

// ═══════════════════════════════════════════
// [4] Meal Suggestions
// ═══════════════════════════════════════════
function switchSuggestionView(view = 'direct') {
  _suggestionView = view === 'advisor' ? 'advisor' : 'direct';

  document.querySelectorAll('[data-suggestion-view]').forEach(button => {
    const isActive = button.dataset.suggestionView === _suggestionView;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('[data-suggestion-panel]').forEach(panel => {
    const isActive = panel.dataset.suggestionPanel === _suggestionView;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });

  if (_suggestionView === 'advisor') {
    loadAdvisorConversations();
  } else if (_suggestions.length) {
    renderSuggestionsGrid(_suggestions);
  } else {
    loadSuggestions();
  }
}

async function loadSuggestions(filterStatus = '') {
  const isAr = TAZA.Lang.current === 'ar';
  try {
    const params = {};
    if (filterStatus) params.status = filterStatus;
    const res   = await TAZA.Http.get(TAZA.API.COMM.SUGGESTIONS, params);
    _suggestions = res?.data?.suggestions ?? [];
    renderSuggestionsGrid(_suggestions);
  } catch(e) { TAZA.Toast.apiError(e); }
}

function renderSuggestionsGrid(suggestions) {
  const grid = document.getElementById('suggestions-grid');
  const isAr = TAZA.Lang.current === 'ar';

  if (!suggestions.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">💡</div>
      <div class="empty-title">${isAr?'لا توجد اقتراحات':'No suggestions found'}</div>
    </div>`;
    return;
  }

  const statusInfo = {
    pending:    { cls:'pending',     color:'var(--warning)', label:isAr?'قيد المراجعة':'Pending'      },
    reviewed:   { cls:'',           color:'var(--info)',    label:isAr?'تمت المراجعة':'Reviewed'     },
    implemented:{ cls:'implemented', color:'var(--success)', label:isAr?'تم التطبيق':'Implemented'   },
    rejected:   { cls:'rejected',   color:'var(--danger)',  label:isAr?'مرفوض':'Rejected'            },
  };

  grid.innerHTML = suggestions.map(s => {
    const si   = statusInfo[s.status] ?? { cls:'', color:'var(--text-muted)', label:s.status };
    const catIcons = { sweet:'🍰', spicy:'🌶️', vegetarian:'🥗', grilled:'🔥', seafood:'🦞', other:'🍽️' };

    return `
      <div class="suggestion-card ${si.cls}">
        <div class="suggestion-header">
          <div>
            <div style="font-size:.68rem;font-weight:600;color:${si.color};margin-bottom:4px">${si.label}</div>
            <div class="suggestion-meal-name">${escapeDashboardValue(s.meal_name || s.suggestion_text || (isAr?'اقتراح وجبة':'Meal suggestion'))}</div>
          </div>
          ${s.image_url
            ? `<img class="suggestion-card-image" src="${escapeDashboardValue(s.image_url)}" alt="${isAr?'صورة اقتراح الوجبة':'Meal suggestion image'}" loading="lazy">`
            : `<span style="font-size:1.4rem">${catIcons[s.category] ?? '🍽️'}</span>`}
        </div>

        <div class="customer-info-chip" style="margin-bottom:8px">
          <div class="avatar avatar-sm" style="font-size:.6rem;background:var(--primary-soft);color:var(--primary)">
            ${TAZA.Utils.initials(s.customer_name || s.customer?.name || 'Z')}
          </div>
          <span>${escapeDashboardValue(s.customer_name || s.customer?.name || (isAr?'زبون':'Customer'))}</span>
          <span style="color:var(--border)">·</span>
          <span>${TAZA.Utils.timeAgo(s.created_at)}</span>
        </div>

        ${(s.description || s.suggestion_text) ? `
          <div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:10px;
               display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
            ${escapeDashboardValue(s.description || s.suggestion_text)}
          </div>` : ''}

        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" style="flex:1"
                  data-action="view-suggestion" data-id="${s.id}">
            <i class="fa-solid fa-eye"></i>
            ${isAr?'التفاصيل':'Details'}
          </button>
          ${s.status === 'pending' ? `
            <button class="btn btn-ghost btn-sm"
                    data-action="review-suggestion" data-id="${s.id}"
                    title="${isAr?'تعيين كمراجَعة':'Mark Reviewed'}">
              <i class="fa-solid fa-check"></i>
            </button>` : ''}
          ${['pending','reviewed'].includes(s.status) ? `
            <button class="btn btn-success btn-sm"
                    data-action="implement-suggestion" data-id="${s.id}">
              <i class="fa-solid fa-circle-check"></i>
              ${isAr?'تطبيق':'Apply'}
            </button>
            <button class="btn btn-danger btn-sm"
                    data-action="reject-suggestion" data-id="${s.id}">
              <i class="fa-solid fa-xmark"></i>
            </button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function handleSuggestionAction(e) {
  const btn    = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = parseInt(btn.dataset.id);
  const isAr   = TAZA.Lang.current === 'ar';

  if (action === 'view-suggestion') {
    openSuggestionModal(id);
    return;
  }

  const endpoints = {
    'review-suggestion':    TAZA.API.COMM.SUGGESTION_REVIEW(id),
    'implement-suggestion': TAZA.API.COMM.SUGGESTION_IMPL(id),
    'reject-suggestion':    TAZA.API.COMM.SUGGESTION_REJECT(id),
  };

  const messages = {
    'review-suggestion':    isAr?'تم تعيين الاقتراح كمراجَع':'Marked as reviewed',
    'implement-suggestion': isAr?'تم تطبيق الاقتراح 🎉':'Suggestion implemented 🎉',
    'reject-suggestion':    isAr?'تم رفض الاقتراح':'Suggestion rejected',
  };

  const payloads = {
    'review-suggestion':    { note:'تمت مراجعة الاقتراح من مدير التواصل' },
    'implement-suggestion': { note:'تم اعتماد الاقتراح للتطبيق' },
    'reject-suggestion':    { reason:'لن يتم اعتماد الاقتراح في الوقت الحالي' },
  };

  const ep = endpoints[action];
  if (!ep) return;

  if (action === 'reject-suggestion') {
    TAZA.Confirm.show(
      isAr ? 'رفض هذا الاقتراح؟' : 'Reject this suggestion?',
      async () => {
        try {
          await TAZA.Http.put(ep, payloads[action]);
          publishMealSuggestionStatusChange(id, 'rejected');
          TAZA.Toast.success(messages[action]);
          _suggestions = [];
          loadSuggestions();
        } catch(err) { TAZA.Toast.apiError(err); }
      },
      { danger: true }
    );
    return;
  }

  try {
    await TAZA.Http.put(ep, payloads[action]);
    publishMealSuggestionStatusChange(id, {
      'review-suggestion': 'reviewed',
      'implement-suggestion': 'implemented'
    }[action]);
    TAZA.Toast.success(messages[action]);
    _suggestions = [];
    loadSuggestions();
  } catch(err) { TAZA.Toast.apiError(err); }
}

async function openSuggestionModal(id) {
  openModal('modal-suggestion');
  const content = document.getElementById('suggestion-modal-content');
  const footer  = document.getElementById('suggestion-modal-footer');
  const isAr    = TAZA.Lang.current === 'ar';

  content.innerHTML = '<div class="loader-ring" style="margin:0 auto"></div>';

  try {
    const res  = await TAZA.Http.get(TAZA.API.COMM.SUGGESTION_SHOW(id));
    const s    = res?.data?.suggestion ?? {};
    const catIcons = { sweet:'🍰', spicy:'🌶️', vegetarian:'🥗', grilled:'🔥', seafood:'🦞', other:'🍽️' };

    content.innerHTML = `
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:2.5rem">${catIcons[s.category] ?? '🍽️'}</div>
        <div style="font-size:1.2rem;font-weight:700;margin-top:6px">${escapeDashboardValue(s.meal_name || s.suggestion_text || (isAr?'اقتراح وجبة':'Meal suggestion'))}</div>
        ${TAZA.Utils.statusBadge(s.status)}
      </div>
      ${s.image_url ? `
        <a class="suggestion-modal-image" href="${escapeDashboardValue(s.image_url)}" target="_blank" rel="noopener">
          <img src="${escapeDashboardValue(s.image_url)}" alt="${isAr?'صورة اقتراح الوجبة':'Meal suggestion image'}">
        </a>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="background:var(--bg-main);border-radius:8px;padding:10px">
          <div style="font-size:.7rem;color:var(--text-muted)">${isAr?'مقترح من':'Suggested by'}</div>
          <div style="font-weight:600;font-size:.85rem">${escapeDashboardValue(s.customer_name || s.customer?.name || '—')}</div>
        </div>
        <div style="background:var(--bg-main);border-radius:8px;padding:10px">
          <div style="font-size:.7rem;color:var(--text-muted)">${isAr?'الفئة':'Category'}</div>
          <div style="font-weight:600;font-size:.85rem">${escapeDashboardValue(s.category_label ?? s.category)}</div>
        </div>
      </div>
      ${(s.description || s.suggestion_text) ? `
        <div style="margin-bottom:12px">
          <div style="font-size:.75rem;font-weight:600;color:var(--text-muted);margin-bottom:4px">
            ${isAr?'الوصف:':'Description:'}
          </div>
          <div style="font-size:.85rem;color:var(--text-secondary);background:var(--bg-main);
                      border-radius:8px;padding:10px;line-height:1.6">${escapeDashboardValue(s.description || s.suggestion_text)}</div>
        </div>` : ''}
      ${s.ingredients ? `
        <div style="margin-bottom:12px">
          <div style="font-size:.75rem;font-weight:600;color:var(--text-muted);margin-bottom:4px">
            ${isAr?'المكونات المقترحة:':'Suggested Ingredients:'}
          </div>
          <div style="font-size:.85rem;color:var(--text-secondary);background:var(--bg-main);
                      border-radius:8px;padding:10px">${escapeDashboardValue(s.ingredients)}</div>
        </div>` : ''}
      ${s.employee_notes ? `
        <div>
          <div style="font-size:.75rem;font-weight:600;color:var(--text-muted);margin-bottom:4px">
            ${isAr?'ملاحظات المراجع:':'Reviewer Notes:'}
          </div>
          <div style="font-size:.85rem;color:var(--text-secondary);background:var(--success-light);
                      border-radius:8px;padding:10px">${escapeDashboardValue(s.employee_notes)}</div>
        </div>` : ''}
    `;

    // Update footer buttons based on status
    if (['pending','reviewed'].includes(s.status)) {
      footer.innerHTML = `
        <button class="btn btn-outline btn-sm" id="close-suggestion-btn-dynamic"
                data-lang-ar="إغلاق" data-lang-en="Close">
          ${isAr?'إغلاق':'Close'}
        </button>
        <button class="btn btn-success btn-sm" onclick="quickAction(${id},'implement')">
          <i class="fa-solid fa-circle-check"></i> ${isAr?'تطبيق':'Implement'}
        </button>
        <button class="btn btn-danger btn-sm" onclick="quickAction(${id},'reject')">
          <i class="fa-solid fa-xmark"></i> ${isAr?'رفض':'Reject'}
        </button>
      `;
    document.getElementById('close-suggestion-btn-dynamic')
        ?.addEventListener('click', () => closeModal('modal-suggestion'));
    }

  } catch(err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div></div>`;
  }
}

async function quickAction(id, action) {
  const isAr    = TAZA.Lang.current === 'ar';
  const endpoints = {
    implement: TAZA.API.COMM.SUGGESTION_IMPL(id),
    reject:    TAZA.API.COMM.SUGGESTION_REJECT(id),
  };
  const payloads = {
    implement: { note:'تم اعتماد الاقتراح للتطبيق' },
    reject:    { reason:'لن يتم اعتماد الاقتراح في الوقت الحالي' },
  };
  try {
    await TAZA.Http.put(endpoints[action], payloads[action]);
    publishMealSuggestionStatusChange(id, action === 'implement' ? 'implemented' : 'rejected');
    TAZA.Toast.success(action === 'implement'
      ? (isAr?'تم التطبيق 🎉':'Implemented 🎉')
      : (isAr?'تم الرفض':'Rejected'));
    closeModal('modal-suggestion');
    _suggestions = [];
    loadSuggestions();
  } catch(e) { TAZA.Toast.apiError(e); }
}

async function loadAdvisorConversations() {
  const container = document.getElementById('advisor-conversations');
  if (!container) return;

  container.innerHTML = `
    <div class="stat-card skeleton" style="height:210px"></div>
    <div class="stat-card skeleton" style="height:210px"></div>`;

  try {
    const res = await TAZA.Http.get(TAZA.API.AI.CONVERSATIONS, { intent:'meal_suggestion' });
    renderAdvisorConversations(res?.data?.conversations ?? []);
  } catch (e) {
    container.innerHTML = renderAdvisorEmptyState(
      TAZA.Lang.current === 'ar' ? 'تعذّر تحميل المحادثات' : 'Could not load conversations',
      'fa-triangle-exclamation'
    );
  }
}

function renderAdvisorEmptyState(title, icon = 'fa-comments') {
  return `<div class="empty-state advisor-empty-state">
    <div class="empty-icon"><i class="fa-solid ${icon}"></i></div>
    <div class="empty-title">${title}</div>
  </div>`;
}

function renderAdvisorConversations(conversations) {
  const container = document.getElementById('advisor-conversations');
  if (!container) return;
  const isAr = TAZA.Lang.current === 'ar';

  if (!conversations.length) {
    container.innerHTML = renderAdvisorEmptyState(isAr ? 'لا توجد محادثات اقتراح وجبات بعد' : 'No meal suggestion conversations yet');
    return;
  }

  container.innerHTML = conversations.map((conversation, index) => {
    const customerName = conversation.customer_name || conversation.customer?.name || (isAr ? 'زائر' : 'Guest');
    return `
      <article class="advisor-conversation-card">
        <header class="advisor-conversation-header">
          <div class="advisor-customer">
            <span class="avatar avatar-sm">${TAZA.Utils.initials(customerName)}</span>
            <div>
              <strong>${escapeDashboardValue(customerName)}</strong>
              <span>${TAZA.Utils.timeAgo(conversation.created_at)}</span>
            </div>
          </div>
          <span class="advisor-conversation-number">#${String(index + 1).padStart(2, '0')}</span>
        </header>
        <div class="advisor-message customer-message">
          <span class="advisor-message-label"><i class="fa-solid fa-user"></i>${isAr ? 'طلب الزبون' : 'Customer request'}</span>
          <p>${escapeDashboardValue(conversation.user_message || '—')}</p>
        </div>
        <div class="advisor-message ai-message">
          <span class="advisor-message-label"><i class="fa-solid fa-wand-magic-sparkles"></i>${isAr ? 'رد المستشار الرقمي' : 'Digital advisor reply'}</span>
          <p>${escapeDashboardValue(conversation.ai_response || '—')}</p>
        </div>
      </article>`;
  }).join('');
}
