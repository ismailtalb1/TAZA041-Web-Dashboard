'use strict';

// ═══════════════════════════════════════════
// [5] Notifications
// ═══════════════════════════════════════════
async function loadNotificationsPage() {
  const container = document.getElementById('notifs-full-list');
  const isAr      = TAZA.Lang.current === 'ar';
  try {
    const res    = await TAZA.Http.get(TAZA.API.NOTIFICATIONS.LIST);
    const notifs = res?.data?.notifications ?? [];
    const unread = res?.data?.unread_count  ?? 0;
    const dot    = document.querySelector('.notif-count-dot');
    if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
    ['sb-notif-count'].forEach(id=>{const el=document.getElementById(id);if(el){el.textContent=unread;el.style.display=unread?'inline-flex':'none';}});
    loadNotifPanel(notifs.slice(0, 8));

    if (!notifs.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon"><i class="fa-regular fa-bell"></i></div>
        <div class="empty-title">${isAr?'لا توجد إشعارات':'No notifications'}</div>
        <div class="empty-desc">${isAr?'ستظهر هنا تحديثات الرحلات الجديدة.':'New delivery updates will appear here.'}</div>
      </div>`;
      return;
    }
    container.innerHTML = notifs.map(n => buildDriverNotification(n)).join('');
  } catch(e) { TAZA.Toast.apiError(e); }
}

function driverNotificationVisual(n={}) {
  const value = `${n.type??''} ${n.title??''} ${n.message??''}`.toLowerCase();
  if (/إلغاء|cancel|فشل|failed/.test(value)) return {tone:'danger',icon:'fa-circle-xmark'};
  if (/تسليم|delivered|مكتمل|completed/.test(value)) return {tone:'success',icon:'fa-circle-check'};
  if (/عنوان|موقع|location|address|انتبه|warning/.test(value)) return {tone:'warning',icon:'fa-location-dot'};
  if (/تعيين|assigned|طلب|delivery|رحلة/.test(value)) return {tone:'delivery',icon:'fa-motorcycle'};
  return {tone:'info',icon:'fa-bell'};
}

function buildDriverNotification(n, compact=false) {
  const isAr = TAZA.Lang.current === 'ar';
  const visual = driverNotificationVisual(n);
  const unread = n.is_read ? '' : 'unread';
  const title = escapeHtml(n.title || (isAr?'تحديث رحلة':'Delivery update'));
  const message = escapeHtml(n.message || '');
  const time = TAZA.Utils.timeAgo(n.created_at);
  if (compact) return `<div class="notification-item notification-tone-${visual.tone} ${unread}"><div class="notification-icon"><i class="fa-solid ${visual.icon}"></i></div><div class="notification-item-copy"><div class="notification-item-title">${title}</div><div class="notification-item-time">${time}</div></div><span class="notification-unread-dot"></span></div>`;
  return `<article class="notif-item-full notification-tone-${visual.tone} ${unread}"><div class="notif-icon-wrap"><i class="fa-solid ${visual.icon}"></i></div><div class="notif-copy"><div class="notif-title">${title}</div>${message?`<div class="notif-message">${message}</div>`:''}<div class="notif-time"><i class="fa-regular fa-clock"></i> ${time}</div></div><span class="notification-unread-dot"></span></article>`;
}

function loadNotifPanel(notifs) {
  const panel = document.getElementById('notif-list-panel');
  if (!panel) return;
  const isAr = TAZA.Lang.current === 'ar';
  panel.innerHTML = notifs.length ? notifs.map(n => buildDriverNotification(n,true)).join('') : `<div class="empty-state" style="padding:32px 18px"><div class="empty-icon"><i class="fa-regular fa-bell"></i></div><div class="empty-title">${isAr?'لا توجد إشعارات جديدة':'No new notifications'}</div></div>`;
  const unread = notifs.filter(n=>!n.is_read).length;
  const dot    = document.querySelector('.notif-count-dot');
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
  const markAll = document.getElementById('panel-mark-all');
  if (markAll) markAll.style.display = unread > 0 ? '' : 'none';
  const summary = document.getElementById('notif-panel-summary');
  if (summary) summary.textContent = unread ? (isAr?`${unread} إشعارات غير مقروءة`:`${unread} unread notifications`) : (isAr?'أنت مطّلع على كل التحديثات':'You are up to date');
}

async function markAllRead() {
  try {
    await TAZA.Http.put(TAZA.API.NOTIFICATIONS.MARK_ALL_READ);
    document.querySelectorAll('.notif-item-full.unread,.notification-item.unread')
      .forEach(el => el.classList.remove('unread'));
    const dot = document.querySelector('.notif-count-dot');
    if (dot) dot.style.display = 'none';
    const markAll = document.getElementById('panel-mark-all');
    if (markAll) markAll.style.display = 'none';
    const summary = document.getElementById('notif-panel-summary');
    if (summary) summary.textContent = TAZA.Lang.current === 'ar' ? 'أنت مطّلع على كل التحديثات' : 'You are up to date';
    const sidebarCount = document.getElementById('sb-notif-count');
    if (sidebarCount) sidebarCount.style.display = 'none';
    TAZA.Toast.success(TAZA.Lang.current === 'ar' ? 'تمت القراءة' : 'All read');
  } catch(e) { TAZA.Toast.apiError(e); }
}
