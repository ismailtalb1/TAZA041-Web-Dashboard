'use strict';

// ══════════════════════════════════════════════
// [4] Notifications
// ══════════════════════════════════════════════
async function loadNotificationsPage() {
  const container = document.getElementById('notifs-full-list');
  const isAr      = TAZA.Lang.current === 'ar';

  try {
    const res   = await TAZA.Http.get(TAZA.API.NOTIFICATIONS.LIST);
    _notifications = res?.data?.notifications ?? [];

    if (!_notifications.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon"><i class="fa-regular fa-bell"></i></div>
        <div class="empty-title">${isAr?'لا توجد إشعارات':'No notifications'}</div>
        <div class="empty-desc">${isAr?'ستظهر هنا تحديثات الطلبات والحجوزات المهمة.':'Important order and reservation updates will appear here.'}</div>
      </div>`;
      loadNotifPanel([]);
      return;
    }

    container.innerHTML = _notifications.map(n => buildManagerNotification(n)).join('');

    // Event delegation for marking read
    if (!container.dataset.readListener) container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="mark-read"]');
      if (!btn) return;
      const id  = parseInt(btn.dataset.id);
      const item= btn.closest('.notif-item-full');
      markOneRead(id, item);
    });
    container.dataset.readListener = 'true';

    // Load notifications panel too
    loadNotifPanel(_notifications.slice(0, 8));

  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function getManagerNotificationVisual(notification = {}) {
  const source = `${notification.type ?? ''} ${notification.title ?? ''} ${notification.message ?? ''}`.toLowerCase();
  if (/cancel|رفض|ملغ|إلغاء|error|failed|فشل/.test(source)) return { tone: 'danger', icon: 'fa-circle-xmark' };
  if (/complete|success|جاهز|مكتمل|تم /.test(source)) return { tone: 'success', icon: 'fa-circle-check' };
  if (/pending|wait|تأخير|معلق|تحذير/.test(source)) return { tone: 'warning', icon: 'fa-clock' };
  if (/order|طلب/.test(source)) return { tone: 'order', icon: 'fa-bag-shopping' };
  if (/reserv|حجز|طاولة/.test(source)) return { tone: 'order', icon: 'fa-calendar-check' };
  return { tone: 'info', icon: 'fa-bell' };
}

function buildManagerNotification(notification, compact = false) {
  const isAr = TAZA.Lang.current === 'ar';
  const visual = getManagerNotificationVisual(notification);
  const unreadClass = notification.is_read ? '' : 'unread';
  const safeTitle = escapeHtml(notification.title || (isAr ? 'إشعار جديد' : 'New notification'));
  const safeMessage = escapeHtml(notification.message || '');
  const time = TAZA.Utils.timeAgo(notification.created_at);

  if (compact) {
    return `
      <div class="notification-item notification-tone-${visual.tone} ${unreadClass}" data-id="${notification.id}">
        <div class="notification-icon"><i class="fa-solid ${visual.icon}"></i></div>
        <div class="notification-item-copy">
          <div class="notification-item-title">${safeTitle}</div>
          <div class="notification-item-time"><i class="fa-regular fa-clock"></i> ${time}</div>
        </div>
        <span class="notification-unread-dot" aria-hidden="true"></span>
      </div>`;
  }

  return `
    <article class="notif-item-full notification-tone-${visual.tone} ${unreadClass}" data-id="${notification.id}">
      <div class="notif-icon-wrap"><i class="fa-solid ${visual.icon}"></i></div>
      <div class="notif-copy">
        <div class="notif-title">${safeTitle}</div>
        ${safeMessage ? `<div class="notif-message">${safeMessage}</div>` : ''}
        <div class="notif-time"><i class="fa-regular fa-clock"></i> ${time}</div>
      </div>
      ${!notification.is_read ? `
        <button class="btn btn-ghost btn-sm notif-read-action" data-action="mark-read" data-id="${notification.id}"
                aria-label="${isAr?'تعيين كمقروء':'Mark as read'}" title="${isAr?'تعيين كمقروء':'Mark as read'}">
          <i class="fa-solid fa-check"></i>
        </button>` : '<span></span>'}
    </article>`;
}

function loadNotifPanel(notifs) {
  const panel = document.getElementById('notif-list-panel');
  const isAr  = TAZA.Lang.current === 'ar';
  if (!panel) return;

  if (!notifs.length) {
    panel.innerHTML = `<div class="empty-state" style="padding:34px 20px">
      <div class="empty-icon"><i class="fa-regular fa-bell"></i></div>
      <div class="empty-title">${isAr?'لا توجد إشعارات جديدة':'No new notifications'}</div>
      <div class="empty-desc">${isAr?'أنت مطّلع على كل التحديثات.':'You are up to date.'}</div>
    </div>`;
  } else {
    panel.innerHTML = notifs.map(n => buildManagerNotification(n, true)).join('');
  }

  // Update dot
  const unread = notifs.filter(n => !n.is_read).length;
  const dot    = document.querySelector('.badge-dot');
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
  const summary = document.getElementById('notif-panel-summary');
  if (summary) summary.textContent = unread
    ? (isAr ? `${unread} ${unread === 1 ? 'إشعار غير مقروء' : 'إشعارات غير مقروءة'}` : `${unread} unread notification${unread === 1 ? '' : 's'}`)
    : (isAr ? 'أنت مطّلع على كل التحديثات' : 'You are up to date');
  const markAllButton = document.getElementById('mark-all-read-btn');
  if (markAllButton) markAllButton.style.visibility = unread ? 'visible' : 'hidden';
}

async function markOneRead(id, itemEl) {
  if (itemEl) itemEl.classList.remove('unread');
  itemEl?.querySelector('.notification-unread-dot')?.remove();
  itemEl?.querySelector('.notif-read-action')?.remove();
  try { await TAZA.Http.put(TAZA.API.NOTIFICATIONS.MARK_READ(id)); } catch {}
}

async function markAllRead() {
  try {
    await TAZA.Http.put(TAZA.API.NOTIFICATIONS.MARK_ALL_READ);
    document.querySelectorAll('.notif-item-full.unread, .notification-item.unread')
      .forEach(el => el.classList.remove('unread'));
    const dot = document.querySelector('.badge-dot');
    if (dot) dot.style.display = 'none';
    TAZA.Toast.success(TAZA.Lang.current === 'ar' ? 'تمت قراءة كل الإشعارات' : 'All marked as read');
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}
