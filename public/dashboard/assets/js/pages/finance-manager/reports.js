'use strict';

// ═══════════════════════════════════════════
// [4] Reports
// ═══════════════════════════════════════════
async function loadReports() {
  const isAr = TAZA.Lang.current === 'ar';
  try {
    const [statsRes, reportsRes] = await Promise.all([
      TAZA.Http.get(TAZA.API.FINANCE.PAYMENT_STATS),
      TAZA.Http.get(TAZA.API.REPORTS.LIST),
    ]);
    renderReportPreview(statsRes?.data ?? {});
    renderGMReports(reportsRes?.data?.received ?? []);
  } catch(e) { TAZA.Toast.apiError(e); }
}

function renderReportPreview(stats) {
  const isAr   = TAZA.Lang.current === 'ar';
  const rev    = stats.revenue ?? {};
  const byMethod = stats.by_method ?? {};
  const content  = document.getElementById('report-preview-content');
  if (!content) return;

  const rows = [
    { label: isAr?'إيرادات اليوم':'Today\'s Revenue',  val: TAZA.Utils.formatMoney(rev.today) },
    { label: isAr?'إيرادات الأسبوع':'Weekly Revenue',   val: TAZA.Utils.formatMoney(rev.this_week) },
    { label: isAr?'إيرادات الشهر':'Monthly Revenue',    val: TAZA.Utils.formatMoney(rev.this_month) },
    { label: isAr?'إجمالي كل الوقت':'All-Time Revenue', val: TAZA.Utils.formatMoney(rev.all_time) },
  ];

  const methodRows = Object.entries(byMethod)
    .filter(([, m]) => m.count > 0)
    .map(([method, m]) => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:.8rem;border-bottom:1px solid var(--border-light)">
        <span style="color:var(--text-secondary)">${m.label}</span>
        <span style="font-weight:600">${m.count} ${isAr?'عملية':'txs'} — ${TAZA.Utils.formatMoney(m.amount)}</span>
      </div>`).join('');

  content.innerHTML = `
    ${rows.map(r => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-light)">
        <span style="font-size:.825rem;color:var(--text-secondary)">${r.label}</span>
        <span style="font-weight:700;font-size:.9rem;color:var(--primary)">${r.val}</span>
      </div>`).join('')}
    ${methodRows ? `<div style="margin-top:14px;font-size:.78rem;font-weight:600;color:var(--text-muted);margin-bottom:6px">
      ${isAr?'توزيع طرق الدفع:':'Payment Methods:'}</div>${methodRows}` : ''}
  `;

  // Last report time
  TAZA.Http.get(TAZA.API.REPORTS.LIST).then(r => {
    const reports = r?.data?.sent ?? [];
    const last    = reports[0];
    const lrEl    = document.getElementById('last-report-info');
    if (lrEl) {
      lrEl.innerHTML = last
        ? `<i class="fa-regular fa-clock"></i> ${isAr?'آخر تقرير:':'Last report:'} ${TAZA.Utils.timeAgo(last.created_at)}`
        : `<i class="fa-regular fa-clock"></i> ${isAr?'لم يُرسَل أي تقرير بعد':'No report sent yet'}`;
    }
  }).catch(() => {});
}

function renderGMReports(reports) {
  const list = document.getElementById('gm-reports-list');
  const isAr = TAZA.Lang.current === 'ar';
  if (!reports.length) {
    list.innerHTML = `<div class="empty-state" style="padding:30px">
      <div class="empty-icon">📬</div>
      <div class="empty-title">${isAr?'لا توجد تعليمات واردة':'No instructions received'}</div>
    </div>`;
    return;
  }
  list.innerHTML = reports.map(r => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--border-radius);padding:14px 18px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div>
          <div style="font-weight:700;font-size:.875rem">${escapeHtml(r.title)}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px">
            <i class="fa-solid fa-user"></i> ${escapeHtml(r.sender?.name ?? (isAr?'المدير العام':'GM'))}
            &nbsp;·&nbsp;
            <i class="fa-regular fa-clock"></i> ${TAZA.Utils.timeAgo(r.created_at)}
          </div>
        </div>
        <span class="badge ${r.status==='sent'?'badge-warning':'badge-success'}">${r.status_label}</span>
      </div>
      ${r.content ? `<div style="margin-top:8px;font-size:.8rem;color:var(--text-secondary);
        background:var(--bg-main);border-radius:6px;padding:8px;white-space:pre-line">${escapeHtml(r.content)}</div>` : ''}
    </div>
  `).join('');
}

async function generateReport() {
  const btn  = document.getElementById('generate-report-btn');
  const isAr = TAZA.Lang.current === 'ar';
  TAZA.Utils.disableBtn(btn, isAr ? 'جارٍ التوليد...' : 'Generating...');
  try {
    const res = await TAZA.Http.get(TAZA.API.FINANCE.REPORT);
    TAZA.Toast.success(isAr ? 'تمت جدولة التقرير وسيصل للمدير العام ✓' : 'Report queued for the GM ✓');
    loadReports();
  } catch(e) { TAZA.Toast.apiError(e); }
  finally    { TAZA.Utils.enableBtn(btn); }
}
