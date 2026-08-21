// Meal conversations: digital advisor and customer meal ideas.
const MealGuideCopy = {
  welcome: {
    ar: 'أهلاً! أخبرني ماذا تشتهي اليوم، وسأرتّب لك الاختيار ✨',
    en: 'Hi! Tell me what you are craving today, and I will narrow it down ✨'
  },
  fallback: {
    ar: 'وصلتني الفكرة. أضف النكهة المفضلة أو الميزانية أو عدد الأشخاص لأعطيك اقتراحاً أدق.',
    en: 'Got it. Add your preferred flavor, budget, or party size for a sharper suggestion.'
  },
  menu: { ar: 'اذهب إلى المنيو', en: 'Go to menu' }
};

const MealConversationState = {
  conversationId: null,
  activeMode: 'advisor',
  selectedImage: null,
  previewUrl: '',
  suggestions: [],
  suggestionsLoaded: false,
  suggestionsFingerprint: '',
  liveRefreshTimer: null,
  queuedHistoryReloadTimer: null,
  liveRefreshInFlight: false,
  liveChannel: null
};

function conversationTime() {
  return new Intl.DateTimeFormat(AppState.lang === 'ar' ? 'ar-SY' : 'en-US', {
    hour: 'numeric', minute: '2-digit'
  }).format(new Date());
}

function suggestionDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(AppState.lang === 'ar' ? 'ar-SY' : 'en-US', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(date);
}

function advisorProductName(item) {
  return AppState.lang === 'ar'
    ? (item.name_ar || item.name || item.name_en || langText('وجبة', 'Meal'))
    : (item.name_en || item.name || item.name_ar || langText('وجبة', 'Meal'));
}

function advisorProductDescription(item) {
  return AppState.lang === 'ar'
    ? (item.description_ar || item.description || item.description_en || '')
    : (item.description_en || item.description || item.description_ar || '');
}

function advisorCartItem(item) {
  const id = Number(item.id);
  return {
    key: `product:${id}`,
    id,
    item_type: 'product',
    reference_id: id,
    name: item.name || advisorProductName(item),
    nameAr: item.name_ar || item.name || null,
    nameEn: item.name_en || item.name || null,
    price: Number(item.price || 0),
    imageUrl: item.image_url || null,
    available: item.is_available !== false,
    stockQuantity: Number(item.stock_quantity || item.max_quantity || 0),
    maxQuantity: Number(item.max_quantity || item.stock_quantity || 0),
    offer: false
  };
}

function appendAdvisorQuickReplies(bubble, replies = []) {
  if (!Array.isArray(replies) || !replies.length) return;
  const group = document.createElement('div');
  group.className = 'advisor-quick-replies';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', langText('إجابات سريعة', 'Quick replies'));

  replies.forEach(reply => {
    const label = typeof reply === 'string' ? reply : reply?.label;
    const value = typeof reply === 'string' ? reply : (reply?.value || reply?.label);
    if (!label || !value) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      const input = $('[data-chat-input]');
      const form = $('[data-chat-form]');
      if (!input || !form || form.dataset.submitting === 'true') return;
      input.value = value;
      form.requestSubmit();
    });
    group.appendChild(button);
  });

  if (group.childElementCount) bubble.appendChild(group);
}

function disableAdvisorQuickReplies(messages) {
  $$('.advisor-quick-replies button', messages).forEach(button => {
    button.disabled = true;
  });
}

function appendAdvisorRecommendations(bubble, items = []) {
  if (!Array.isArray(items) || !items.length) return;
  bubble.classList.add('has-recommendations');
  const grid = document.createElement('div');
  grid.className = 'advisor-recommendations';

  items.forEach(item => {
    const card = document.createElement('article');
    card.className = 'advisor-product-card';

    const media = document.createElement('div');
    media.className = 'advisor-product-media';
    if (item.image_url) {
      const image = document.createElement('img');
      image.src = item.image_url;
      image.alt = advisorProductName(item);
      image.loading = 'lazy';
      media.appendChild(image);
    } else {
      media.textContent = '🍽️';
      media.classList.add('is-placeholder');
    }

    const copy = document.createElement('div');
    copy.className = 'advisor-product-copy';
    const name = document.createElement('strong');
    name.textContent = advisorProductName(item);
    const description = document.createElement('p');
    description.textContent = advisorProductDescription(item);
    const reason = document.createElement('span');
    reason.className = 'advisor-product-reason';
    reason.textContent = item.recommendation_reason || langText('اختيار مناسب لطلبك', 'A good match for your request');
    copy.append(name);
    if (description.textContent) copy.append(description);
    copy.append(reason);

    const action = document.createElement('div');
    action.className = 'advisor-product-action';
    const price = document.createElement('b');
    price.textContent = typeof formatCurrency === 'function'
      ? formatCurrency(Number(item.price || 0))
      : (item.price_formatted || `${Number(item.price || 0).toLocaleString()} SYP`);
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-primary';
    add.textContent = item.is_available === false
      ? langText('غير متاح', 'Unavailable')
      : langText('أضف للسلة', 'Add to cart');
    add.disabled = item.is_available === false;
    add.addEventListener('click', () => addToCart(advisorCartItem(item)));
    action.append(price, add);

    card.append(media, copy, action);
    grid.appendChild(card);
  });

  bubble.appendChild(grid);
}

function appendAdvisorBubble(messages, copy, type, options = {}) {
  const bubble = document.createElement('article');
  bubble.className = `chat-bubble ${type}`;

  const meta = document.createElement('div');
  meta.className = 'chat-bubble-meta';
  const sender = document.createElement('strong');
  sender.textContent = type === 'user'
    ? langText('أنت', 'You')
    : langText('المستشار الرقمي', 'Digital advisor');
  const time = document.createElement('span');
  time.textContent = conversationTime();
  meta.append(sender, time);

  const text = document.createElement('div');
  text.className = 'chat-bubble-text';
  const hasTranslation = copy && typeof copy === 'object' && copy.ar && copy.en;
  if (hasTranslation) {
    bubble.dataset.chatI18n = 'true';
    bubble.dataset.ar = copy.ar;
    bubble.dataset.en = copy.en;
    text.textContent = langText(copy.ar, copy.en);
  } else {
    text.textContent = String(copy ?? '');
  }
  bubble.append(meta, text);

  appendAdvisorQuickReplies(bubble, options.quickReplies);
  appendAdvisorRecommendations(bubble, options.suggestions);

  if (options.withButton) {
    const button = document.createElement('a');
    button.className = 'btn btn-secondary';
    button.href = 'menu.html';
    button.dataset.chatMenuLink = 'true';
    button.textContent = langText(MealGuideCopy.menu.ar, MealGuideCopy.menu.en);
    bubble.appendChild(button);
  }

  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function translateAdvisorBubbles(messages) {
  $$('.chat-bubble.user .chat-bubble-meta strong', messages).forEach(sender => {
    sender.textContent = langText('أنت', 'You');
  });
  $$('.chat-bubble.ai .chat-bubble-meta strong', messages).forEach(sender => {
    sender.textContent = langText('المستشار الرقمي', 'Digital advisor');
  });
  $$('[data-chat-i18n]', messages).forEach(bubble => {
    const text = $('.chat-bubble-text', bubble);
    if (text) text.textContent = AppState.lang === 'ar' ? bubble.dataset.ar : bubble.dataset.en;
  });
  $$('[data-chat-menu-link]', messages).forEach(link => {
    link.textContent = langText(MealGuideCopy.menu.ar, MealGuideCopy.menu.en);
  });
}

function activateMealConversation(mode) {
  MealConversationState.activeMode = mode === 'idea' ? 'idea' : 'advisor';
  $$('[data-conversation-mode]').forEach(button => {
    const active = button.dataset.conversationMode === MealConversationState.activeMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('[data-conversation-panel]').forEach(panel => {
    const active = panel.dataset.conversationPanel === MealConversationState.activeMode;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });

  if (MealConversationState.activeMode === 'idea') loadMealSuggestionHistory(true);
}

function suggestionStatusCopy(status) {
  const copies = {
    pending: {
      label: ['بانتظار المراجعة', 'Pending review'],
      message: ['وصل اقتراحك إلى مدير التواصل وهو بانتظار المراجعة.', 'Your idea reached the communication manager and is waiting for review.']
    },
    reviewed: {
      label: ['تمت المراجعة', 'Reviewed'],
      message: ['راجع مدير التواصل اقتراحك.', 'The communication manager reviewed your idea.']
    },
    implemented: {
      label: ['تم التطبيق', 'Implemented'],
      message: ['خبر جميل! تم اعتماد اقتراحك للتطبيق.', 'Great news! Your idea was approved for implementation.']
    },
    rejected: {
      label: ['لن يُطبّق حالياً', 'Not planned now'],
      message: ['تمت مراجعة اقتراحك، لكنه لن يُطبّق في الوقت الحالي.', 'Your idea was reviewed, but it is not planned for implementation right now.']
    }
  };
  const copy = copies[status] || copies.pending;
  return {
    label: langText(copy.label[0], copy.label[1]),
    message: langText(copy.message[0], copy.message[1])
  };
}

function mealSuggestionsFingerprint(suggestions) {
  return JSON.stringify((suggestions || []).map(suggestion => [
    suggestion.id,
    suggestion.status,
    suggestion.admin_note || '',
    suggestion.updated_at || suggestion.created_at || ''
  ]));
}

function setSuggestionLiveState(state = 'live') {
  const indicator = $('.manager-status');
  if (!indicator) return;
  const copies = {
    syncing: ['جاري مزامنة الحالة...', 'Syncing status...'],
    live: ['تحديث مباشر مع مدير التواصل', 'Live with communication manager'],
    retrying: ['إعادة الاتصال بمدير التواصل...', 'Reconnecting to communication manager...']
  };
  const copy = copies[state] || copies.live;
  indicator.dataset.liveState = state;
  indicator.dataset.ar = copy[0];
  indicator.dataset.en = copy[1];
  indicator.textContent = langText(copy[0], copy[1]);
}

function announceSuggestionStatusChanges(previousSuggestions, nextSuggestions) {
  const previousById = new Map((previousSuggestions || []).map(suggestion => [suggestion.id, suggestion]));
  const changes = (nextSuggestions || []).filter(suggestion => {
    const previous = previousById.get(suggestion.id);
    return previous && previous.status !== suggestion.status;
  });
  if (!changes.length) return;

  const latest = changes[0];
  const statusCopy = suggestionStatusCopy(latest.status);
  showToast(
    `${langText('تم تحديث حالة اقتراحك', 'Your suggestion status was updated')}: ${statusCopy.label}`,
    { kind: latest.status === 'rejected' ? 'warning' : 'success' }
  );
}

async function refreshMealSuggestionHistoryLive() {
  if (
    MealConversationState.activeMode !== 'idea' ||
    document.hidden ||
    MealConversationState.liveRefreshInFlight
  ) return;

  MealConversationState.liveRefreshInFlight = true;
  try {
    const data = await apiFetch('/customer/meal-suggestions', { timeoutMs: 5000 });
    const nextSuggestions = data?.suggestions || [];
    const nextFingerprint = mealSuggestionsFingerprint(nextSuggestions);
    setSuggestionLiveState('live');
    if (nextFingerprint === MealConversationState.suggestionsFingerprint) return;

    const previousSuggestions = MealConversationState.suggestions;
    MealConversationState.suggestions = nextSuggestions;
    MealConversationState.suggestionsFingerprint = nextFingerprint;
    MealConversationState.suggestionsLoaded = true;
    renderMealSuggestionHistory();
    announceSuggestionStatusChanges(previousSuggestions, nextSuggestions);
  } catch (_) {
    setSuggestionLiveState('retrying');
  } finally {
    MealConversationState.liveRefreshInFlight = false;
  }
}

function stopMealSuggestionLiveUpdates() {
  if (MealConversationState.liveRefreshTimer) {
    window.clearInterval(MealConversationState.liveRefreshTimer);
    MealConversationState.liveRefreshTimer = null;
  }
  if (MealConversationState.queuedHistoryReloadTimer) {
    window.clearTimeout(MealConversationState.queuedHistoryReloadTimer);
    MealConversationState.queuedHistoryReloadTimer = null;
  }
  MealConversationState.liveChannel?.close();
  MealConversationState.liveChannel = null;
}

function startMealSuggestionLiveUpdates() {
  if (MealConversationState.liveRefreshTimer) return;

  MealConversationState.liveRefreshTimer = window.setInterval(refreshMealSuggestionHistoryLive, 4_000);
  window.addEventListener('focus', refreshMealSuggestionHistoryLive);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshMealSuggestionHistoryLive();
  });
  window.addEventListener('pagehide', stopMealSuggestionLiveUpdates, { once: true });

  if ('BroadcastChannel' in window) {
    try {
      MealConversationState.liveChannel = new BroadcastChannel('taza-meal-suggestions');
      MealConversationState.liveChannel.addEventListener('message', event => {
        if (event.data?.type === 'suggestion-status-changed') refreshMealSuggestionHistoryLive();
      });
    } catch (_) { /* The timed refresh remains the cross-browser fallback. */ }
  }
}

function appendSuggestionImage(container, suggestion) {
  if (!suggestion.image_url) return;
  const link = document.createElement('a');
  link.className = 'suggestion-message-image';
  link.href = suggestion.image_url;
  link.target = '_blank';
  link.rel = 'noopener';
  const image = document.createElement('img');
  image.src = suggestion.image_url;
  image.alt = langText('صورة مرفقة مع اقتراح الوجبة', 'Image attached to the meal idea');
  image.loading = 'lazy';
  link.appendChild(image);
  container.appendChild(link);
}

function renderMealSuggestionHistory() {
  const messages = $('[data-suggestion-messages]');
  if (!messages) return;
  messages.innerHTML = '';

  if (!MealConversationState.suggestions.length) {
    const welcome = document.createElement('div');
    welcome.className = 'suggestion-empty-chat';
    welcome.innerHTML = `<span>💡</span><strong>${langText('ابدأ بأول فكرة وجبة', 'Start with your first meal idea')}</strong><p>${langText('اكتب الفكرة في الأسفل، وأضف صورة توضيحية إن رغبت.', 'Describe it below and add a reference image if you like.')}</p>`;
    messages.appendChild(welcome);
    return;
  }

  [...MealConversationState.suggestions].reverse().forEach(suggestion => {
    const entry = document.createElement('div');
    entry.className = 'suggestion-thread-entry';

    const userBubble = document.createElement('article');
    userBubble.className = 'chat-bubble user suggestion-user-bubble';
    const userMeta = document.createElement('div');
    userMeta.className = 'chat-bubble-meta';
    const userName = document.createElement('strong');
    userName.textContent = langText('فكرتك', 'Your idea');
    const createdAt = document.createElement('span');
    createdAt.textContent = suggestionDateTime(suggestion.created_at);
    userMeta.append(userName, createdAt);
    const userText = document.createElement('div');
    userText.className = 'chat-bubble-text';
    userText.textContent = suggestion.suggestion_text || '';
    userBubble.append(userMeta, userText);
    appendSuggestionImage(userBubble, suggestion);

    const managerBubble = document.createElement('article');
    managerBubble.className = `chat-bubble manager suggestion-status-${suggestion.status || 'pending'}`;
    const statusCopy = suggestionStatusCopy(suggestion.status);
    const managerMeta = document.createElement('div');
    managerMeta.className = 'chat-bubble-meta';
    const managerName = document.createElement('strong');
    managerName.textContent = langText('مدير التواصل', 'Communication manager');
    const status = document.createElement('span');
    status.className = 'suggestion-status-chip';
    status.textContent = statusCopy.label;
    managerMeta.append(managerName, status);
    const managerText = document.createElement('div');
    managerText.className = 'chat-bubble-text';
    managerText.textContent = suggestion.admin_note || statusCopy.message;
    managerBubble.append(managerMeta, managerText);

    entry.append(userBubble, managerBubble);
    messages.appendChild(entry);
  });
  messages.scrollTop = messages.scrollHeight;
}

async function loadMealSuggestionHistory(force = false) {
  if (MealConversationState.suggestionsLoaded && !force) {
    renderMealSuggestionHistory();
    return;
  }
  if (MealConversationState.liveRefreshInFlight) {
    window.clearTimeout(MealConversationState.queuedHistoryReloadTimer);
    MealConversationState.queuedHistoryReloadTimer = window.setTimeout(() => {
      MealConversationState.queuedHistoryReloadTimer = null;
      loadMealSuggestionHistory(force);
    }, 250);
    return;
  }
  MealConversationState.liveRefreshInFlight = true;
  const messages = $('[data-suggestion-messages]');
  if (messages) messages.innerHTML = `<div class="suggestion-chat-loading"><span></span>${langText('جاري تحميل أفكارك...', 'Loading your ideas...')}</div>`;
  setSuggestionLiveState('syncing');
  try {
    const data = await apiFetch('/customer/meal-suggestions');
    MealConversationState.suggestions = data?.suggestions || [];
    MealConversationState.suggestionsFingerprint = mealSuggestionsFingerprint(MealConversationState.suggestions);
    MealConversationState.suggestionsLoaded = true;
    setSuggestionLiveState('live');
    renderMealSuggestionHistory();
  } catch (error) {
    setSuggestionLiveState('retrying');
    if (messages) messages.innerHTML = `<div class="suggestion-empty-chat"><span>!</span><strong>${langText('تعذر تحميل الاقتراحات', 'Unable to load ideas')}</strong></div>`;
  } finally {
    MealConversationState.liveRefreshInFlight = false;
  }
}

function clearSuggestionImage() {
  if (MealConversationState.previewUrl) URL.revokeObjectURL(MealConversationState.previewUrl);
  MealConversationState.selectedImage = null;
  MealConversationState.previewUrl = '';
  const input = $('[data-suggestion-image]');
  const preview = $('[data-suggestion-image-preview]');
  if (input) input.value = '';
  if (preview) preview.hidden = true;
}

function selectSuggestionImage(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!file || !allowed.includes(file.type) || file.size > 5 * 1024 * 1024) {
    clearSuggestionImage();
    showToast(langText('اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 5 MB', 'Choose a JPG, PNG, or WebP image up to 5 MB'), { kind: 'warning' });
    return;
  }
  clearSuggestionImage();
  MealConversationState.selectedImage = file;
  MealConversationState.previewUrl = URL.createObjectURL(file);
  const preview = $('[data-suggestion-image-preview]');
  const image = $('[data-suggestion-image-thumb]');
  const name = $('[data-suggestion-image-name]');
  if (image) image.src = MealConversationState.previewUrl;
  if (name) name.textContent = file.name;
  if (preview) preview.hidden = false;
}

function bindMealIdeaConversation() {
  const form = $('[data-suggestion-form]');
  const input = $('[data-suggestion-input]');
  const imageInput = $('[data-suggestion-image]');
  const removeImage = $('[data-remove-suggestion-image]');
  if (!form || !input || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  imageInput?.addEventListener('change', () => selectSuggestionImage(imageInput.files?.[0]));
  removeImage?.addEventListener('click', clearSuggestionImage);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!isSafeCustomerText(text, { required: true, min: 10, max: 1000 })) {
      showToast(langText('اكتب فكرة واضحة من 10 أحرف على الأقل', 'Enter a clear idea of at least 10 characters'), { kind: 'warning' });
      return;
    }

    const submit = $('[data-suggestion-submit]', form);
    const originalLabel = submit?.textContent;
    if (submit) {
      submit.disabled = true;
      submit.textContent = langText('جاري الإرسال...', 'Sending...');
    }

    const body = new FormData();
    body.append('suggestion_text', text);
    if (MealConversationState.selectedImage) body.append('image', MealConversationState.selectedImage);

    try {
      await apiFetch('/customer/meal-suggestion', { method: 'POST', body, timeoutMs: 15000 });
      input.value = '';
      clearSuggestionImage();
      MealConversationState.suggestionsLoaded = false;
      await loadMealSuggestionHistory(true);
      showToast(langText('وصل اقتراحك إلى مدير التواصل', 'Your idea reached the communication manager'), { kind: 'success' });
    } catch (error) {
      showToast(error?.message || langText('تعذر إرسال الاقتراح', 'Unable to send the idea'), { kind: 'error' });
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = originalLabel || langText('إرسال الاقتراح', 'Send suggestion');
      }
    }
  });
}

function bindDigitalAdvisor() {
  const messages = $('[data-chat-messages]');
  const form = $('[data-chat-form]');
  const input = $('[data-chat-input]');
  if (!messages || !input) return;

  if (messages.dataset.mealGuideReady === 'true') {
    translateAdvisorBubbles(messages);
  } else {
    messages.dataset.mealGuideReady = 'true';
    appendAdvisorBubble(messages, MealGuideCopy.welcome, 'ai');
  }

  $$('[data-ai-prompt-ar][data-ai-prompt-en]').forEach(button => {
    if (button.dataset.promptBound === 'true') return;
    button.dataset.promptBound = 'true';
    button.addEventListener('click', () => {
      input.value = AppState.lang === 'ar'
        ? (button.dataset.aiPromptAr || button.textContent.trim())
        : (button.dataset.aiPromptEn || button.textContent.trim());
      input.focus();
    });
  });

  if (!form || form.dataset.chatBound === 'true') return;
  form.dataset.chatBound = 'true';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.submitting === 'true') return;
    const value = input.value.trim();
    if (!isSafeCustomerText(value, { required: true, min: 2, max: 1000 })) {
      showToast(langText('اكتب طلباً واضحاً بين حرفين و1000 حرف', 'Enter a clear request between 2 and 1000 characters'), { kind: 'warning' });
      return;
    }
    disableAdvisorQuickReplies(messages);
    appendAdvisorBubble(messages, value, 'user');
    input.value = '';
    const submit = form.querySelector('button[type="submit"]');
    form.dataset.submitting = 'true';
    input.disabled = true;
    if (submit) submit.disabled = true;

    try {
      const reply = await apiFetch('/customer/ai/chat', {
        method: 'POST',
        body: { message: value, conversation_id: MealConversationState.conversationId }
      });
      if (reply?.conversation_id) MealConversationState.conversationId = reply.conversation_id;
      const suggestions = Array.isArray(reply?.suggested_items) ? reply.suggested_items : [];
      appendAdvisorBubble(messages, reply?.reply || MealGuideCopy.fallback, 'ai', {
        quickReplies: reply?.quick_replies || [],
        suggestions,
        withButton: Boolean(reply?.has_suggestions && !suggestions.length)
      });
    } catch (error) {
      appendAdvisorBubble(messages, {
        ar: 'تعذر الوصول إلى المستشار الآن. حاول مرة أخرى بعد لحظة.',
        en: 'The advisor is unavailable right now. Please try again in a moment.'
      }, 'ai');
    } finally {
      form.dataset.submitting = 'false';
      input.disabled = false;
      if (submit) submit.disabled = false;
      input.focus();
    }
  });
}

function initAIPage() {
  $$('[data-conversation-mode]').forEach(button => {
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => activateMealConversation(button.dataset.conversationMode));
  });

  bindDigitalAdvisor();
  bindMealIdeaConversation();
  startMealSuggestionLiveUpdates();
  activateMealConversation(MealConversationState.activeMode);
  if (MealConversationState.suggestionsLoaded) renderMealSuggestionHistory();
}
