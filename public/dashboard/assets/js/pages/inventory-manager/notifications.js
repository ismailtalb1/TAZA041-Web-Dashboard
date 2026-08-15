'use strict';

// ══════════════════════════════════════════
// [4] Notifications
// ══════════════════════════════════════════
async function loadNotificationsPage() {
  const container = document.getElementById('notifs-full-list');
  const isAr      = TAZA.Lang.current === 'ar';
  try {
    const res    = await TAZA.Http.get(TAZA.API.NOTIFICATIONS.LIST);
    const notifs = res?.data?.notifications ?? [];
    const unread = res?.data?.unread_count  ?? 0;
    _notificationUnreadCount = Number(unread);
    const dot    = document.querySelector('.badge-dot');
    if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
    loadNotifPanel(notifs.slice(0, 8));

    if (!notifs.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon"><i class="fa-regular fa-bell"></i></div>
        <div class="empty-title">${isAr?'لا توجد إشعارات':'No notifications'}</div>
        <div class="empty-desc">${isAr?'ستظهر هنا تنبيهات المخزون والمنتجات المهمة.':'Important inventory and product alerts will appear here.'}</div>
      </div>`;
      return;
    }
    container.innerHTML = notifs.map(n => buildInventoryNotification(n)).join('');
  } catch(e) { TAZA.Toast.apiError(e); }
}

function getInventoryNotificationVisual(n={}) {
  const source=`${n.type??''} ${n.title??''} ${n.message??''}`.toLowerCase();
  if(/نفد|out of stock|error|فشل|حذف|ملغ/.test(source)) return {tone:'danger',icon:'fa-box-open'};
  if(/منخفض|low stock|مخزون|stock/.test(source)) return {tone:'stock',icon:'fa-boxes-stacked'};
  if(/نجاح|تم |active|تفعيل/.test(source)) return {tone:'success',icon:'fa-circle-check'};
  return {tone:'info',icon:'fa-bell'};
}
function buildInventoryNotification(n,compact=false){const isAr=TAZA.Lang.current==='ar';const v=getInventoryNotificationVisual(n);const unread=n.is_read?'':'unread';const title=escapeHtml(n.title||(isAr?'إشعار جديد':'New notification'));const msg=escapeHtml(n.message||'');const time=TAZA.Utils.timeAgo(n.created_at);if(compact)return `<div class="notification-item notification-tone-${v.tone} ${unread}" data-id="${n.id}" role="button" tabindex="0"><div class="notification-icon"><i class="fa-solid ${v.icon}"></i></div><div><div class="notification-item-title">${title}</div><div class="notification-item-time">${time}</div></div></div>`;const readLabel=isAr?'تعيين كمقروء':'Mark as read';return `<article class="notif-item-full notification-tone-${v.tone} ${unread}" data-id="${n.id}"><div class="notif-icon-wrap"><i class="fa-solid ${v.icon}"></i></div><div class="notif-copy"><div class="notif-title">${title}</div>${msg?`<div class="notif-message">${msg}</div>`:''}<div class="notif-time"><i class="fa-regular fa-clock"></i> ${time}</div></div>${!n.is_read?`<button type="button" class="btn btn-ghost btn-sm" aria-label="${readLabel}" title="${readLabel}" onclick="markOneRead(${n.id},this.closest('.notif-item-full'))"><i class="fa-solid fa-check" aria-hidden="true"></i></button>`:'<span></span>'}</article>`}

function loadNotifPanel(notifs) {
  const panel = document.getElementById('notif-list-panel');
  if (!panel) return;
  const isAr=TAZA.Lang.current==='ar';
  panel.innerHTML = notifs.length?notifs.map(n=>buildInventoryNotification(n,true)).join(''):`<div class="empty-state" style="padding:34px 20px"><div class="empty-icon"><i class="fa-regular fa-bell"></i></div><div class="empty-title">${isAr?'لا توجد إشعارات جديدة':'No new notifications'}</div></div>`;
  document.querySelector('.badge-dot')?.style &&
    (document.querySelector('.badge-dot').style.display =
      notifs.filter(n => !n.is_read).length > 0 ? 'block' : 'none');
  const unread=notifs.filter(n=>!n.is_read).length;const summary=document.getElementById('notif-panel-summary');if(summary)summary.textContent=unread?(isAr?`${unread} إشعارات غير مقروءة`:`${unread} unread notifications`):(isAr?'أنت مطّلع على كل التحديثات':'You are up to date');
}

async function markOneRead(id, itemEl) {
  try {
    await TAZA.Http.put(TAZA.API.NOTIFICATIONS.MARK_READ(id));
    document.querySelectorAll(`[data-id="${id}"]`).forEach(el => el.classList.remove('unread'));
    await loadNotificationsPage();
    TAZA.NotifBadge.refresh();
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

async function markAllRead() {
  try {
    await TAZA.Http.put(TAZA.API.NOTIFICATIONS.MARK_ALL_READ);
    await loadNotificationsPage();
    TAZA.NotifBadge.refresh();
    TAZA.Toast.success(TAZA.Lang.current === 'ar' ? 'تمت القراءة' : 'All read');
  } catch(e) { TAZA.Toast.apiError(e); }
}
