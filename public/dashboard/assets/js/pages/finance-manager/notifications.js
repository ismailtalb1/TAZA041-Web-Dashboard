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
    document.querySelector('.badge-dot')?.style &&
      (document.querySelector('.badge-dot').style.display = unread > 0 ? 'block' : 'none');
    loadNotifPanel(notifs.slice(0, 8));

    if (!notifs.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon"><i class="fa-regular fa-bell"></i></div>
        <div class="empty-title">${isAr?'لا توجد إشعارات':'No notifications'}</div>
        <div class="empty-desc">${isAr?'ستظهر هنا تنبيهات الحسابات والمعاملات المهمة.':'Important account and transaction alerts will appear here.'}</div>
      </div>`;
      return;
    }
    container.innerHTML = notifs.map(n => buildFinanceNotification(n)).join('');
  } catch(e) { TAZA.Toast.apiError(e); }
}

function financeNotificationVisual(n={}){const s=`${n.type??''} ${n.title??''} ${n.message??''}`.toLowerCase();if(/فشل|failed|رفض|استرداد|refund/.test(s))return{tone:'danger',icon:'fa-rotate-left'};if(/حد|رصيد|capacity|balance|تحذير/.test(s))return{tone:'warning',icon:'fa-triangle-exclamation'};if(/نجاح|completed|تم /.test(s))return{tone:'success',icon:'fa-circle-check'};return{tone:'money',icon:'fa-coins'}}
function buildFinanceNotification(n,compact=false){const isAr=TAZA.Lang.current==='ar';const v=financeNotificationVisual(n);const unread=n.is_read?'':'unread';const title=escapeHtml(n.title||(isAr?'إشعار مالي':'Financial notification'));const message=escapeHtml(n.message||'');const time=TAZA.Utils.timeAgo(n.created_at);if(compact)return`<div class="notification-item notification-tone-${v.tone} ${unread}"><div class="notification-icon"><i class="fa-solid ${v.icon}"></i></div><div><div class="notification-item-title">${title}</div><div class="notification-item-time">${time}</div></div></div>`;return`<article class="notif-item-full notification-tone-${v.tone} ${unread}"><div class="notif-icon-wrap"><i class="fa-solid ${v.icon}"></i></div><div class="notif-copy"><div class="notif-title">${title}</div>${message?`<div class="notif-message">${message}</div>`:''}<div class="notif-time"><i class="fa-regular fa-clock"></i> ${time}</div></div><span></span></article>`}

function loadNotifPanel(notifs) {
  const panel = document.getElementById('notif-list-panel');
  if (!panel) return;
  const isAr=TAZA.Lang.current==='ar';
  panel.innerHTML=notifs.length?notifs.map(n=>buildFinanceNotification(n,true)).join(''):`<div class="empty-state" style="padding:34px 20px"><div class="empty-icon"><i class="fa-regular fa-bell"></i></div><div class="empty-title">${isAr?'لا توجد إشعارات جديدة':'No new notifications'}</div></div>`;
  const unread = notifs.filter(n=>!n.is_read).length;
  const dot    = document.querySelector('.badge-dot');
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
  const markAll = document.getElementById('panel-mark-all');
  if (markAll) markAll.style.display = unread > 0 ? '' : 'none';
  const summary=document.getElementById('notif-panel-summary');if(summary)summary.textContent=unread?(isAr?`${unread} إشعارات غير مقروءة`:`${unread} unread notifications`):(isAr?'أنت مطّلع على كل التحديثات':'You are up to date');
}

async function markAllRead() {
  try {
    await TAZA.Http.put(TAZA.API.NOTIFICATIONS.MARK_ALL_READ);
    document.querySelectorAll('.notif-item-full.unread,.notification-item.unread')
      .forEach(el => el.classList.remove('unread'));
    const dot = document.querySelector('.badge-dot');
    if (dot) dot.style.display = 'none';
    const markAll = document.getElementById('panel-mark-all');
    if (markAll) markAll.style.display = 'none';
    const summary=document.getElementById('notif-panel-summary');if(summary)summary.textContent=TAZA.Lang.current==='ar'?'أنت مطّلع على كل التحديثات':'You are up to date';
    TAZA.Toast.success(TAZA.Lang.current === 'ar' ? 'تمت القراءة' : 'All read');
  } catch(e) { TAZA.Toast.apiError(e); }
}
