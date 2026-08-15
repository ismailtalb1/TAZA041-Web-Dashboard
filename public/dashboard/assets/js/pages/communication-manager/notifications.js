'use strict';

// ═══════════════════════════════════════════
// [6] Notifications
// ═══════════════════════════════════════════
async function loadNotificationsPage() {
  const container = document.getElementById('notifs-full-list');
  const isAr      = TAZA.Lang.current === 'ar';
  try {
    const res    = await TAZA.Http.get(TAZA.API.NOTIFICATIONS.LIST);
    const notifs = res?.data?.notifications ?? [];
    const unread = res?.data?.unread_count  ?? 0;
    const dot    = document.querySelector('.badge-dot');
    if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
    loadNotifPanel(notifs.slice(0, 8));

    if (!notifs.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon"><i class="fa-regular fa-bell"></i></div>
        <div class="empty-title">${isAr?'لا توجد إشعارات':'No notifications'}</div>
        <div class="empty-desc">${isAr?'ستظهر هنا تحديثات المحتوى والاقتراحات المهمة.':'Important content and suggestion updates will appear here.'}</div>
      </div>`;
      return;
    }
    container.innerHTML = notifs.map(n => buildCommunicationNotification(n)).join('');
  } catch(e) { TAZA.Toast.apiError(e); }
}

function getCommunicationNotificationVisual(n = {}) {
  const source = `${n.type ?? ''} ${n.title ?? ''} ${n.message ?? ''}`.toLowerCase();
  if (/رفض|reject|error|فشل|حذف/.test(source)) return {tone:'danger',icon:'fa-circle-xmark'};
  if (/اقتراح|suggest/.test(source)) return {tone:'suggestion',icon:'fa-lightbulb'};
  if (/تطبيق|نجاح|تم |success/.test(source)) return {tone:'success',icon:'fa-circle-check'};
  return {tone:'content',icon:'fa-pen-to-square'};
}

function buildCommunicationNotification(n, compact = false) {
  const isAr = TAZA.Lang.current === 'ar';
  const v = getCommunicationNotificationVisual(n);
  const unread = n.is_read ? '' : 'unread';
  const title = escapeDashboardValue(n.title || (isAr ? 'إشعار جديد' : 'New notification'));
  const message = escapeDashboardValue(n.message || '');
  const time = TAZA.Utils.timeAgo(n.created_at);
  if (compact) return `<div class="notification-item notification-tone-${v.tone} ${unread}" data-id="${n.id}"><div class="notification-icon"><i class="fa-solid ${v.icon}"></i></div><div><div class="notification-item-title">${title}</div><div class="notification-item-time">${time}</div></div></div>`;
  return `<article class="notif-item-full notification-tone-${v.tone} ${unread}" data-id="${n.id}"><div class="notif-icon-wrap"><i class="fa-solid ${v.icon}"></i></div><div class="notif-copy"><div class="notif-title">${title}</div>${message ? `<div class="notif-message">${message}</div>` : ''}<div class="notif-time"><i class="fa-regular fa-clock"></i> ${time}</div></div><span></span></article>`;
}

function loadNotifPanel(notifs) {
  const panel = document.getElementById('notif-list-panel');
  if (!panel) return;
  const isAr = TAZA.Lang.current === 'ar';
  panel.innerHTML = notifs.length ? notifs.map(n => buildCommunicationNotification(n, true)).join('') : `<div class="empty-state" style="padding:34px 20px"><div class="empty-icon"><i class="fa-regular fa-bell"></i></div><div class="empty-title">${isAr?'لا توجد إشعارات جديدة':'No new notifications'}</div></div>`;
  const dot = document.querySelector('.badge-dot');
  const unread = notifs.filter(n=>!n.is_read).length;
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
  const summary = document.getElementById('notif-panel-summary');
  if (summary) summary.textContent = unread ? (isAr ? `${unread} إشعارات غير مقروءة` : `${unread} unread notifications`) : (isAr ? 'أنت مطّلع على كل التحديثات' : 'You are up to date');
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
