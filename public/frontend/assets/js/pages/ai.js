// Meal guide chat page
const MealGuideCopy = {
  welcome: {
    ar: 'أهلاً بك في مرشد الوجبة. أخبرني بما يناسبك اليوم: نكهة، عدد أشخاص، وقت سريع، أو ميزانية محددة، وسأقترح لك خياراً واضحاً.',
    en: 'Welcome to the meal guide. Tell me what fits today: flavor, party size, quick timing, or budget, and I will suggest a clear option.'
  },
  fallback: {
    ar: 'وصلتني الفكرة. أضف النكهة المفضلة أو الميزانية أو عدد الأشخاص لأعطيك اقتراحاً أدق.',
    en: 'Got it. Add your preferred flavor, budget, or party size for a sharper suggestion.'
  },
  menu: {
    ar: 'اذهب إلى المنيو',
    en: 'Go to menu'
  }
};

const MealGuideState = { conversationId: null };

function initAIPage() {
  const messages = $('[data-chat-messages]');
  const form = $('[data-chat-form]');
  const input = $('[data-chat-input]');
  if (!messages || !input) return;

  const translateKnownBubbles = () => {
    $$('[data-chat-i18n]', messages).forEach(bubble => {
      const text = $('.chat-bubble-text', bubble);
      if (text) text.textContent = AppState.lang === 'ar' ? bubble.dataset.ar : bubble.dataset.en;
    });
    $$('[data-chat-menu-link]', messages).forEach(link => {
      link.textContent = langText(MealGuideCopy.menu.ar, MealGuideCopy.menu.en);
    });
  };

  const appendBubble = (copy, type, options = {}) => {
    const wrap = document.createElement('div');
    wrap.className = `chat-bubble ${type}`;

    const text = document.createElement('div');
    text.className = 'chat-bubble-text';
    const hasTranslation = copy && typeof copy === 'object' && copy.ar && copy.en;
    if (hasTranslation) {
      wrap.dataset.chatI18n = 'true';
      wrap.dataset.ar = copy.ar;
      wrap.dataset.en = copy.en;
      text.textContent = langText(copy.ar, copy.en);
    } else {
      text.textContent = String(copy ?? '');
    }
    wrap.appendChild(text);

    if (options.withButton) {
      const btn = document.createElement('a');
      btn.className = 'btn btn-secondary';
      btn.href = 'menu.html';
      btn.dataset.chatMenuLink = 'true';
      btn.textContent = langText(MealGuideCopy.menu.ar, MealGuideCopy.menu.en);
      wrap.appendChild(btn);
    }

    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  };

  if (messages.dataset.mealGuideReady === 'true') {
    translateKnownBubbles();
    return;
  }

  messages.dataset.mealGuideReady = 'true';
  appendBubble(MealGuideCopy.welcome, 'ai');

  $$('[data-ai-prompt-ar][data-ai-prompt-en]').forEach(btn => {
    if (btn.dataset.promptBound === 'true') return;
    btn.dataset.promptBound = 'true';
    btn.addEventListener('click', () => {
      input.value = AppState.lang === 'ar'
        ? (btn.dataset.aiPromptAr || btn.textContent.trim())
        : (btn.dataset.aiPromptEn || btn.textContent.trim());
      input.focus();
    });
  });

  if (form && form.dataset.chatBound !== 'true') {
    form.dataset.chatBound = 'true';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      appendBubble(value, 'user');
      input.value = '';

      const endpoint = AppState.token ? '/customer/ai/chat' : '/public/ai/chat';
      const reply = await safeApi(endpoint, { method: 'POST', body: { message: value, conversation_id: MealGuideState.conversationId } });
      if (reply?.conversation_id) MealGuideState.conversationId = reply.conversation_id;
      if (reply?.reply) {
        appendBubble(reply.reply, 'ai', { withButton: Boolean(reply.has_suggestions) });
      } else {
        appendBubble(MealGuideCopy.fallback, 'ai');
      }
    });
  }
}
