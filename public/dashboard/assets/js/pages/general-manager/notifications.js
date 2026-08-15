'use strict';

// ══════════════════════════════════════════════
// Notifications Panel
// ══════════════════════════════════════════════
async function loadNotifications() {
  try {
    const res = await TAZA.Http.get(TAZA.API.NOTIFICATIONS.LIST, { status: 'unread' });
    const notifs = res?.data?.notifications ?? [];
    const count  = res?.data?.unread_count  ?? 0;

    // تحديث الـ badge
    const dot = document.querySelector('.badge-dot');
    if (dot) dot.style.display = count > 0 ? 'block' : 'none';

    const list = document.getElementById('notif-list');
    const summary = document.getElementById('notif-panel-summary');
    const markAllButton = document.getElementById('notif-mark-all');
    const isAr = TAZA.Lang.current === 'ar';
    if (markAllButton) markAllButton.style.display = count > 0 ? '' : 'none';
    if (summary) {
      summary.textContent = count > 0
        ? (isAr ? `${count} إشعار غير مقروء` : `${count} unread notification${count === 1 ? '' : 's'}`)
        : (isAr ? 'لا توجد تحديثات جديدة' : 'You are all caught up');
    }

    if (!notifs.length) {
      list.innerHTML = `<div class="notification-empty">
        <div class="notification-empty-icon"><i class="fa-regular fa-bell"></i></div>
        <strong>${isAr ? 'كل شيء تحت السيطرة' : 'You are all caught up'}</strong>
        <span>${isAr ? 'ستظهر التحديثات المهمة هنا فور وصولها.' : 'Important updates will appear here as they arrive.'}</span>
      </div>`;
      return;
    }

    list.innerHTML = notifs.slice(0, 10).map(n => `
      <button type="button" class="notification-item notification-${notificationTone(n.type)} ${n.is_read ? '' : 'unread'}" onclick="readNotif(${n.id}, this)">
        <span class="notification-icon"><i class="fa-solid ${notificationIcon(n.type)}"></i></span>
        <span class="notification-item-main">
          <span class="notification-item-title">${escapeHtml(n.title ?? '')}</span>
          ${n.message ? `<span class="notification-item-message">${escapeHtml(n.message)}</span>` : ''}
          <span class="notification-item-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(n.created_at_human ?? n.created_at ?? '')}</span>
        </span>
        <span class="notification-unread-dot" aria-hidden="true"></span>
      </button>
    `).join('');
  } catch {}
}

function notificationTone(type) {
  const tones = {
    stock_alert: 'warning',
    payment_update: 'success',
    loyalty_tier_upgrade: 'success',
    delivery_update: 'info',
    reservation_update: 'info',
    order_update: 'primary',
    new_offer: 'primary',
    manager_notification: 'neutral',
    system_announcement: 'neutral',
  };
  return tones[type] ?? 'neutral';
}

function notificationIcon(type) {
  const icons = {
    order_update: 'fa-bag-shopping',
    delivery_update: 'fa-motorcycle',
    reservation_update: 'fa-chair',
    payment_update: 'fa-credit-card',
    loyalty_tier_upgrade: 'fa-trophy',
    new_offer: 'fa-tag',
    stock_alert: 'fa-box-open',
    manager_notification: 'fa-clipboard-check',
    system_announcement: 'fa-bullhorn',
  };
  return icons[type] ?? 'fa-bell';
}

function updateNotificationSummaryAfterRead() {
  const remaining = document.querySelectorAll('.notification-item.unread').length;
  const summary = document.getElementById('notif-panel-summary');
  const isAr = TAZA.Lang.current === 'ar';
  if (summary) {
    summary.textContent = remaining > 0
      ? (isAr ? `${remaining} إشعار غير مقروء` : `${remaining} unread notification${remaining === 1 ? '' : 's'}`)
      : (isAr ? 'لا توجد تحديثات جديدة' : 'You are all caught up');
  }
  const dot = document.querySelector('.badge-dot');
  if (dot) dot.style.display = remaining > 0 ? 'block' : 'none';
}

async function readNotif(id, el) {
  el?.classList.remove('unread');
  updateNotificationSummaryAfterRead();
  try { await TAZA.Http.put(TAZA.API.NOTIFICATIONS.MARK_READ(id)); } catch {}
}

async function markAllNotifsRead() {
  try {
    await TAZA.Http.put(TAZA.API.NOTIFICATIONS.MARK_ALL_READ);
    document.querySelectorAll('.notification-item.unread').forEach(el => el.classList.remove('unread'));
    updateNotificationSummaryAfterRead();
    TAZA.Toast.success(TAZA.Lang.current === 'ar' ? 'تمت قراءة جميع الإشعارات' : 'All notifications marked as read');
  } catch {}
}
