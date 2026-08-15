'use strict';

// ══════════════════════════════════════════════
// [3] Reservations
// ══════════════════════════════════════════════
function loadReservationsSection() {
  switchReservTab('today');
}

function switchReservTab(tab) {
  _reservSubTab = tab;
  const tabs = ['today', 'all', 'tables'];
  tabs.forEach(t => {
    const el = document.getElementById(`reserv-tab-${t}`);
    if (el) {
      el.classList.toggle('active', t === tab);
      el.setAttribute('aria-pressed', String(t === tab));
      el.style.background = '';
      el.style.color = '';
    }
    const view = document.getElementById(`reserv-${t}-view`);
    if (view) view.style.display = t === tab ? 'block' : 'none';
  });

  if (tab === 'today') loadTodayReservations();
  if (tab === 'all')   loadAllReservations();
  if (tab === 'tables') renderTablesMap();
}

async function loadTodayReservations() {
  const container = document.getElementById('today-reservations-list');
  const isAr      = TAZA.Lang.current === 'ar';
  if (!container) return;

  try {
    const res     = await TAZA.Http.get(TAZA.API.RESERVATIONS.TODAY);
    const data    = res?.data ?? {};
    const pending  = data.pending  ?? [];
    const confirmed= data.confirmed?? [];
    const seated   = data.seated   ?? [];

    const all = [...pending, ...confirmed, ...seated];

    // Update sidebar badge
    const totalToday = all.length;
    ['sb-reserv-count'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = totalToday; el.style.display = totalToday > 0 ? 'inline-block' : 'none'; }
    });

    if (!all.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon">🪑</div>
        <div class="empty-title">${isAr ? 'لا توجد حجوزات اليوم' : 'No reservations today'}</div>
      </div>`;
      return;
    }

    container.innerHTML = all.map(r => buildReservationItem(r)).join('');

  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

async function loadAllReservations() {
  const tbody = document.getElementById('reservations-tbody');
  const isAr  = TAZA.Lang.current === 'ar';

  try {
    const res  = await TAZA.Http.get(TAZA.API.RESERVATIONS.LIST);
    _reservations = res?.data?.reservations ?? [];

    if (!_reservations.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
        <div class="empty-icon">🪑</div>
        <div class="empty-title">${isAr ? 'لا توجد حجوزات' : 'No reservations'}</div>
      </div></td></tr>`;
      return;
    }

    tbody.innerHTML = _reservations.map(r => `
      <tr>
        <td style="font-weight:700;color:var(--primary)">#${r.id}</td>
        <td style="font-size:.82rem">${escapeHtml(r.customer_name ?? (isAr?'زبون':'Customer'))}</td>
        <td>
          <span class="badge ${r.table_type === 'vip' ? 'badge-vip' : 'badge-info'}">
            ${r.table_type === 'vip' ? '✨ VIP' : '🪑'} ${isAr?'طاولة':'Table'} ${r.table_number}
          </span>
        </td>
        <td>${r.seats_count ?? '—'}</td>
        <td style="font-size:.78rem">
          ${r.reservation_time
            ? new Date(r.reservation_time).toLocaleString(
                isAr ? 'ar-SY' : 'en-US',
                {weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}
              )
            : '—'}
        </td>
        <td style="font-weight:600">${TAZA.Utils.formatMoney(r.extra_cost ?? 0)}</td>
        <td>${TAZA.Utils.statusBadge(r.status)}</td>
        <td>
          <div style="display:flex;gap:5px">
            ${r.status === 'pending' ? `
              <button class="btn btn-primary btn-sm"
                      data-action="confirm-reservation" data-id="${r.id}">
                <i class="fa-solid fa-check"></i> ${isAr?'تأكيد':'Confirm'}
              </button>` : ''
            }
            ${r.status === 'confirmed' && r.order_status === 'completed' ? `
              <button class="btn btn-success btn-sm"
                      data-action="seat-reservation" data-id="${r.id}">
                <i class="fa-solid fa-chair"></i> ${isAr?'بدء الجلسة':'Start session'}
              </button>` : ''
            }
            ${r.status === 'confirmed' && r.order_status !== 'completed' ? `
              <button class="btn btn-ghost btn-sm" disabled
                      title="${isAr?'أكمل تجهيز الطلب أولاً':'Complete order preparation first'}">
                <i class="fa-solid fa-hourglass-half"></i> ${isAr?'بانتظار اكتمال الطلب':'Awaiting completion'}
              </button>` : ''
            }
            ${r.status === 'pending' ? `
              <button class="btn btn-danger btn-sm"
                      data-action="cancel-reservation" data-id="${r.id}" data-order-id="${r.order_id}"
                      title="${isAr?'إلغاء الحجز':'Cancel reservation'}">
                <i class="fa-solid fa-xmark"></i>
              </button>` : ''
            }
            ${r.status === 'seated' ? `
              <button class="btn btn-success btn-sm"
                      data-action="complete-reservation" data-id="${r.id}"
                      title="${isAr?'تعليم الطاولة كجاهزة':'Mark table as ready'}">
                <i class="fa-solid fa-check-double"></i> ${isAr?'الطاولة جاهزة':'Table ready'}
              </button>` : ''
            }
          </div>
        </td>
      </tr>
    `).join('');

  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function buildReservationItem(r) {
  const isAr  = TAZA.Lang.current === 'ar';
  const time  = r.reservation_time ? new Date(r.reservation_time) : null;
  const hhmm  = time ? time.toLocaleTimeString(isAr?'ar-SY':'en-US',{hour:'2-digit',minute:'2-digit'}) : '--:--';
  const period= time ? (time.getHours() < 12 ? (isAr?'ص':'AM') : (isAr?'م':'PM')) : '';

  return `
    <div class="reservation-item">
      <div class="reservation-time-badge">
        <div class="time">${hhmm}</div>
        <div class="period">${period}</div>
      </div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:.9rem;margin-bottom:3px">
          ${escapeHtml(r.customer_name ?? (isAr?'زبون':'Customer'))}
          ${r.table_type==='vip' ? '<span class="badge badge-vip" style="font-size:.62rem;margin-right:6px">✨VIP</span>' : ''}
        </div>
        <div style="font-size:.78rem;color:var(--text-muted)">
          <i class="fa-solid fa-chair"></i> ${isAr?'طاولة':'Table'} ${r.table_number}
          &nbsp;·&nbsp;
          <i class="fa-solid fa-users"></i> ${r.seats_count ?? '—'} ${isAr?'مقعد':'seats'}
          ${r.special_notes ? `&nbsp;·&nbsp;<i class="fa-solid fa-note-sticky" style="color:var(--warning)"></i> ${escapeHtml(r.special_notes)}` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
        ${TAZA.Utils.statusBadge(r.status)}
        <div style="display:flex;gap:4px;margin-top:4px">
          ${!['completed', 'cancelled', 'no_show'].includes(r.status) ? `
            <button class="btn btn-primary btn-sm"
                    data-action="confirm-reservation" data-id="${r.id}">
              <i class="fa-solid fa-check"></i> ${isAr?'تأكيد':'Confirm'}
            </button>` : ''
          }
          ${r.status === 'confirmed' && r.order_status === 'completed' ? `
            <button class="btn btn-success btn-sm"
                    data-action="seat-reservation" data-id="${r.id}">
              <i class="fa-solid fa-chair"></i> ${isAr?'بدء الجلسة':'Start session'}
            </button>` : ''
          }
          ${r.status === 'confirmed' && r.order_status !== 'completed' ? `
            <button class="btn btn-ghost btn-sm" disabled
                    title="${isAr?'أكمل تجهيز الطلب أولاً':'Complete order preparation first'}">
              <i class="fa-solid fa-hourglass-half"></i>
            </button>` : ''
          }
          ${r.status === 'pending' ? `
            <button class="btn btn-danger btn-sm"
                    data-action="cancel-reservation" data-id="${r.id}" data-order-id="${r.order_id}"
                    title="${isAr?'إلغاء الحجز':'Cancel reservation'}">
              <i class="fa-solid fa-xmark"></i>
            </button>` : ''
          }
          ${r.status === 'seated' ? `
            <button class="btn btn-success btn-sm"
                    data-action="complete-reservation" data-id="${r.id}">
              <i class="fa-solid fa-check-double"></i> ${isAr?'الطاولة جاهزة':'Table ready'}
            </button>` : ''
          }
        </div>
      </div>
    </div>
  `;
}

// ── Handle Reservation Actions ─────────────────────
function handleReservationAction(e) {
  const btn    = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = parseInt(btn.dataset.id);
  const orderId = parseInt(btn.dataset.orderId);
  const isAr   = TAZA.Lang.current === 'ar';

  const statusMap = {
    'confirm-reservation': 'confirmed',
    'seat-reservation':    'seated',
    'complete-reservation':'completed',
    'cancel-reservation':  'cancelled',
  };

  const status = statusMap[action];
  if (!status || !id) return;

  const labels = {
    confirmed: isAr ? 'تأكيد الحجز' : 'Confirm',
    seated:    isAr ? 'الجلسة قائمة' : 'Session active',
    completed: isAr ? 'الطاولة جاهزة' : 'Table ready',
    cancelled: isAr ? 'إلغاء الحجز'  : 'Cancel',
  };

  TAZA.Confirm.show(
    `${isAr ? 'تغيير حالة الحجز إلى:' : 'Change reservation status to:'} "${labels[status]}"?`,
    async () => {
      try {
        const response = await TAZA.Http.put(TAZA.API.RESERVATIONS.CHANGE_STATUS(id), { status });
        const settlement = status === 'cancelled'
          ? ` · ${cancellationSettlementLabel(response?.data?.refund, isAr)}`
          : '';
        TAZA.Toast.success(`${labels[status]} ✓${settlement}`);
        loadTodayReservations();
        if (_reservSubTab === 'all') loadAllReservations();
        if (_reservSubTab === 'tables') renderTablesMap();
      } catch(err) { TAZA.Toast.apiError(err); }
    },
    { danger: status === 'cancelled' }
  );
}

// ── Tables Map ─────────────────────────────────────
async function renderTablesMap() {
  const grid    = document.getElementById('tables-grid');
  const timeInput = document.getElementById('table-check-time');
  const timeVal = timeInput?.value;
  const isAr    = TAZA.Lang.current === 'ar';

  if (!grid) return;

  const selectedTime = timeVal ? new Date(timeVal) : null;
  const now = new Date();
  const maxTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (!selectedTime || Number.isNaN(selectedTime.getTime()) || selectedTime <= now || selectedTime > maxTime) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🕒</div>
      <div class="empty-title">${isAr ? 'اختر وقتاً صحيحاً ضمن الـ 24 ساعة القادمة' : 'Choose a valid time within the next 24 hours'}</div>
    </div>`;
    return;
  }

  grid.innerHTML = '<div class="loader-ring" style="grid-column:1/-1;margin:20px auto"></div>';

  let tables = [];
  try {
    const res = await TAZA.Http.get(TAZA.API.RESERVATIONS.TABLES, {
      reservation_time: timeVal,
      duration_minutes: 60,
    });
    tables = res?.data?.tables ?? [];
  } catch (error) {
    TAZA.Toast.apiError(error);
  }
  if (!tables.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🪑</div><div class="empty-title">${isAr ? 'تعذر تحميل خريطة الطاولات' : 'Unable to load table map'}</div></div>`;
    return;
  }

  grid.innerHTML = tables.map(info => {
    const num       = Number(info.number);
    const isVip     = info.type === 'vip';
    const available = info.is_available !== false;

    let cls  = available ? 'available' : 'reserved';
    if (isVip) cls = available ? 'vip' : 'vip reserved';

    const icon  = isVip ? '⭐' : '🪑';
    const label = available
      ? (isAr ? 'متاحة' : 'Free')
      : (isAr ? 'محجوزة' : 'Taken');

    return `
      <div class="table-cell ${cls}" data-table="${num}">
        <div class="table-icon">${icon}</div>
        <div class="table-num">${isAr?'طاولة':'Table'} ${num}</div>
        <div style="font-size:.65rem">${isVip ? 'VIP' : ''} ${label}</div>
      </div>
    `;
  }).join('');
}
