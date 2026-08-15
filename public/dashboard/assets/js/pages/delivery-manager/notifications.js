'use strict';

// ══════════════════════════════════════════════
// [5] Notifications
// ══════════════════════════════════════════════
async function loadNotificationsPage() {
  const container = document.getElementById('notifs-full-list');
  const isAr      = TAZA.Lang.current === 'ar';

  try {
    const res   = await TAZA.Http.get(TAZA.API.NOTIFICATIONS.LIST);
    const notifs = res?.data?.notifications ?? [];
    const unread = res?.data?.unread_count  ?? 0;

    const dot = document.querySelector('.badge-dot');
    if (dot) dot.style.display = unread > 0 ? 'block' : 'none';

    // Panel preview
    loadNotifPanel(notifs.slice(0, 8));

    if (!notifs.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon"><i class="fa-regular fa-bell"></i></div>
        <div class="empty-title">${isAr?'لا توجد إشعارات':'No notifications'}</div>
        <div class="empty-desc">${isAr?'ستظهر هنا تحديثات الإسناد والتسليم المهمة.':'Assignment and delivery updates will appear here.'}</div>
      </div>`;
      return;
    }

    container.innerHTML = notifs.map(n => buildDeliveryNotification(n)).join('');

    if (!container.dataset.readListener) container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-notif-read]');
      if (btn) {
        const id   = parseInt(btn.dataset.notifRead);
        const item = btn.closest('.notif-item-full');
        document.querySelectorAll(`[data-id="${id}"]`).forEach(el => el.classList.remove('unread'));
        item?.querySelector('.notif-read-action')?.remove();
        syncNotificationIndicators();
        try { await TAZA.Http.put(TAZA.API.NOTIFICATIONS.MARK_READ(id)); } catch {}
      }
    });
    container.dataset.readListener = 'true';

  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function getDeliveryNotificationVisual(notification = {}) {
  const source = `${notification.type ?? ''} ${notification.title ?? ''} ${notification.message ?? ''}`.toLowerCase();
  if (/cancel|رفض|ملغ|إلغاء|error|failed|فشل/.test(source)) return {tone:'danger',icon:'fa-circle-xmark'};
  if (/deliver|تسليم|وصل|complete|success|تم /.test(source)) return {tone:'success',icon:'fa-circle-check'};
  if (/pending|wait|تأخير|معلق|تحذير|بدون سائق/.test(source)) return {tone:'warning',icon:'fa-user-clock'};
  if (/driver|سائق|delivery|توصيل|route|مسار/.test(source)) return {tone:'delivery',icon:'fa-motorcycle'};
  return {tone:'info',icon:'fa-bell'};
}

function buildDeliveryNotification(notification, compact = false) {
  const isAr = TAZA.Lang.current === 'ar';
  const visual = getDeliveryNotificationVisual(notification);
  const unreadClass = notification.is_read ? '' : 'unread';
  const title = escapeHtml(notification.title || (isAr ? 'إشعار جديد' : 'New notification'));
  const message = escapeHtml(notification.message || '');
  const time = TAZA.Utils.timeAgo(notification.created_at);

  if (compact) return `
    <div class="notification-item notification-tone-${visual.tone} ${unreadClass}" data-id="${notification.id}">
      <div class="notification-icon"><i class="fa-solid ${visual.icon}"></i></div>
      <div class="notification-item-copy">
        <div class="notification-item-title">${title}</div>
        <div class="notification-item-time"><i class="fa-regular fa-clock"></i> ${time}</div>
      </div>
      <span class="notification-unread-dot" aria-hidden="true"></span>
    </div>`;

  return `
    <article class="notif-item-full notification-tone-${visual.tone} ${unreadClass}" data-id="${notification.id}">
      <div class="notif-icon-wrap"><i class="fa-solid ${visual.icon}"></i></div>
      <div class="notif-copy">
        <div class="notif-title">${title}</div>
        ${message ? `<div class="notif-message">${message}</div>` : ''}
        <div class="notif-time"><i class="fa-regular fa-clock"></i> ${time}</div>
      </div>
      ${!notification.is_read ? `<button class="btn btn-ghost btn-sm notif-read-action" data-notif-read="${notification.id}" aria-label="${isAr?'تعيين كمقروء':'Mark as read'}"><i class="fa-solid fa-check"></i></button>` : '<span></span>'}
    </article>`;
}

function loadNotifPanel(notifs) {
  const panel = document.getElementById('notif-list-panel');
  const isAr = TAZA.Lang.current === 'ar';
  if (!panel) return;
  panel.innerHTML = notifs.length
    ? notifs.map(n => buildDeliveryNotification(n, true)).join('')
    : `<div class="empty-state" style="padding:34px 20px"><div class="empty-icon"><i class="fa-regular fa-bell"></i></div><div class="empty-title">${isAr?'لا توجد إشعارات جديدة':'No new notifications'}</div><div class="empty-desc">${isAr?'أنت مطّلع على كل التحديثات.':'You are up to date.'}</div></div>`;
  const unread = notifs.filter(n => !n.is_read).length;
  const dot    = document.querySelector('.badge-dot');
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
  const summary = document.getElementById('notif-panel-summary');
  if (summary) summary.textContent = unread
    ? (isAr ? `${unread} ${unread === 1 ? 'إشعار غير مقروء' : 'إشعارات غير مقروءة'}` : `${unread} unread notification${unread === 1 ? '' : 's'}`)
    : (isAr ? 'أنت مطّلع على كل التحديثات' : 'You are up to date');
  const markAll = document.getElementById('panel-mark-all');
  if (markAll) markAll.style.visibility = unread ? 'visible' : 'hidden';
}

function syncNotificationIndicators() {
  const unread = document.querySelectorAll('#notif-list-panel .notification-item.unread').length;
  const isAr = TAZA.Lang.current === 'ar';
  const dot = document.querySelector('.badge-dot');
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
  const summary = document.getElementById('notif-panel-summary');
  if (summary) summary.textContent = unread
    ? (isAr ? `${unread} ${unread === 1 ? 'إشعار غير مقروء' : 'إشعارات غير مقروءة'}` : `${unread} unread notification${unread === 1 ? '' : 's'}`)
    : (isAr ? 'أنت مطّلع على كل التحديثات' : 'You are up to date');
  const markAll = document.getElementById('panel-mark-all');
  if (markAll) markAll.style.visibility = unread ? 'visible' : 'hidden';
}

async function markAllRead() {
  try {
    await TAZA.Http.put(TAZA.API.NOTIFICATIONS.MARK_ALL_READ);
    document.querySelectorAll('.notif-item-full.unread,.notification-item.unread')
      .forEach(el => el.classList.remove('unread'));
    const dot = document.querySelector('.badge-dot');
    if (dot) dot.style.display = 'none';
    const summary = document.getElementById('notif-panel-summary');
    if (summary) summary.textContent = TAZA.Lang.current === 'ar' ? 'أنت مطّلع على كل التحديثات' : 'You are up to date';
    const panelButton = document.getElementById('panel-mark-all');
    if (panelButton) panelButton.style.visibility = 'hidden';
    TAZA.Toast.success(TAZA.Lang.current === 'ar' ? 'تمت القراءة' : 'All read');
  } catch(e) { TAZA.Toast.apiError(e); }
}
