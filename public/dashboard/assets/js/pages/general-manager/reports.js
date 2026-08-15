'use strict';

// ══════════════════════════════════════════════
// [5] Reports
// ══════════════════════════════════════════════
let _reportsView = 'active';

async function loadReports() {
  try {
    const res = await TAZA.Http.get(TAZA.API.ADMIN_REPORTS.LIST, { record_state: _reportsView });
    _reports  = res?.data?.reports ?? [];
    updateReportsViewCounts(res?.data?.stats ?? {});
    renderReports(_reports);
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

function setReportsView(view) {
  _reportsView = view === 'archived' ? 'archived' : 'active';
  document.querySelectorAll('[data-report-view]').forEach(button => {
    const selected = button.dataset.reportView === _reportsView;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  _reports = [];
  loadReports();
}

function updateReportsViewCounts(stats = {}) {
  const active = document.getElementById('reports-active-count');
  const archived = document.getElementById('reports-archive-count');
  if (active) active.textContent = Number(stats.active_total ?? 0);
  if (archived) archived.textContent = Number(stats.archive_total ?? 0);
}

function toggleReportCard(button) {
  const card = button.closest('.report-card');
  if (!card) return;
  const expanded = !card.classList.contains('is-expanded');
  card.classList.toggle('is-expanded', expanded);
  button.setAttribute('aria-expanded', String(expanded));
}

function handleReportToggleKey(event, trigger) {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  toggleReportCard(trigger);
}

function renderReports(reports) {
  const list = document.getElementById('reports-list');
  const isAr = TAZA.Lang.current === 'ar';

  if (!reports.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${_reportsView === 'archived' ? '🗄️' : '📋'}</div>
      <div class="empty-title">${_reportsView === 'archived'
        ? (isAr ? 'أرشيف التقارير فارغ' : 'Reports archive is empty')
        : (isAr ? 'لا توجد تقارير نشطة' : 'No active reports')}</div>
    </div>`;
    return;
  }

  const typeMeta = {
    order:         { color:'blue',    icon:'fa-bag-shopping' },
    delivery:      { color:'info',    icon:'fa-motorcycle' },
    financial:     { color:'green',   icon:'fa-chart-line' },
    inventory:     { color:'warning', icon:'fa-boxes-stacked' },
    communication: { color:'purple',  icon:'fa-comments' },
    ai_generated:  { color:'amber',   icon:'fa-wand-magic-sparkles' },
    general:       { color:'muted',   icon:'fa-file-lines' },
  };

  list.innerHTML = reports.map((r, index) => {
    const type = typeMeta[r.report_type] ?? typeMeta.general;
    const reportId = Number(r.id) || index;
    const titleId = `report-title-${reportId}`;
    const contentId = `report-content-${reportId}`;
    const collapsibleId = `report-collapsible-${reportId}`;
    const exactDate = TAZA.Utils.formatDate(r.created_at, { year:'numeric', month:'long', day:'numeric' });
    const statusClass = r.status === 'sent' ? 'is-pending' : r.status === 'reviewed' ? 'is-reviewed' : 'is-archived';

    return `
    <article class="report-card report-type-${escapeHtml(r.report_type ?? 'general')} ${statusClass}" aria-labelledby="${titleId}">
      <div class="report-card-header report-toggle" role="button" tabindex="0"
           aria-expanded="false" aria-controls="${collapsibleId}"
           onclick="toggleReportCard(this)" onkeydown="handleReportToggleKey(event, this)">
        <div class="report-heading">
          <div class="report-kind">
            <span class="report-kind-icon"><i class="fa-solid ${type.icon}"></i></span>
            <span class="badge badge-${type.color} report-type-badge">${escapeHtml(r.type_label ?? (isAr ? 'تقرير عام' : 'General report'))}</span>
          </div>
          <h2 class="report-title" id="${titleId}" dir="auto">${escapeHtml(r.title ?? (isAr ? 'تقرير بلا عنوان' : 'Untitled report'))}</h2>
          <div class="report-meta">
            <span><i class="fa-solid fa-user"></i>${escapeHtml(r.sender?.name ?? '—')}</span>
            ${r.sender?.role_label ? `<span><i class="fa-solid fa-id-badge"></i>${escapeHtml(r.sender.role_label)}</span>` : ''}
            <span><i class="fa-regular fa-calendar"></i>${exactDate}</span>
            <span><i class="fa-regular fa-clock"></i>${TAZA.Utils.timeAgo(r.created_at)}</span>
          </div>
        </div>
        <div class="report-status-wrap">
          <span class="report-status ${statusClass}">
            <i class="fa-solid ${r.status === 'sent' ? 'fa-hourglass-half' : r.status === 'reviewed' ? 'fa-circle-check' : 'fa-box-archive'}"></i>
            ${escapeHtml(r.status_label ?? '—')}
          </span>
          <span class="report-expand-indicator" aria-hidden="true">
            <i class="fa-solid fa-chevron-down"></i>
          </span>
        </div>
      </div>

      <div class="report-collapsible" id="${collapsibleId}">
        <div class="report-collapsible-inner">
          ${r.description ? `<aside class="report-summary" dir="auto">
            <span class="report-summary-icon"><i class="fa-solid fa-lightbulb"></i></span>
            <div>
              <strong>${isAr ? 'ملخص التقرير' : 'Report summary'}</strong>
              <p class="report-description">${escapeHtml(r.description)}</p>
            </div>
          </aside>` : ''}

          <section class="report-content-section" aria-labelledby="${contentId}">
            <div class="report-content-heading" id="${contentId}">
              <span><i class="fa-solid fa-align-right"></i>${isAr ? 'محتوى التقرير الكامل' : 'Full report content'}</span>
              <small>${isAr ? 'يعرض النص كاملًا دون اختصار' : 'Full text, without truncation'}</small>
            </div>
            <div class="report-content-body" dir="auto">${formatReportContent(r.content)}</div>
          </section>

          <footer class="report-actions">
            ${r.status === 'sent' ? `
              <button type="button" class="btn btn-success" onclick="reviewReport(${reportId})">
                <i class="fa-solid fa-check"></i> ${isAr?'تعيين كمُراجع':'Mark as reviewed'}
              </button>` : ''}
            ${r.status === 'archived' ? `
              <button type="button" class="btn btn-primary" onclick="restoreReport(${reportId})">
                <i class="fa-solid fa-box-open"></i> ${isAr?'إعادة إلى التقارير':'Restore report'}
              </button>` : `
              <button type="button" class="btn btn-outline" onclick="archiveReport(${reportId})">
                <i class="fa-solid fa-box-archive"></i> ${isAr?'نقل إلى الأرشيف':'Move to archive'}
              </button>`}
          </footer>
        </div>
      </div>
    </article>`;
  }).join('');
}

function formatReportContent(content) {
  const normalized = String(content ?? '').trim();
  return normalized ? escapeHtml(normalized) : '—';
}

async function reviewReport(id) {
  try {
    await TAZA.Http.put(TAZA.API.REPORTS.REVIEW(id));
    TAZA.Toast.success(TAZA.Lang.current === 'ar' ? 'تمت المراجعة' : 'Report reviewed');
    _reports = [];
    loadReports();
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

async function archiveReport(id) {
  const isAr = TAZA.Lang.current === 'ar';
  TAZA.Confirm.show(
    isAr ? 'نقل هذا التقرير إلى الأرشيف؟ سيختفي من قائمة التقارير النشطة.' : 'Move this report to the archive?',
    async () => {
      try {
        await TAZA.Http.put(TAZA.API.REPORTS.ARCHIVE(id));
        TAZA.Toast.success(isAr ? 'تم نقل التقرير إلى الأرشيف' : 'Report moved to archive');
        _reports = [];
        loadReports();
      } catch(e) {
        TAZA.Toast.apiError(e);
      }
    },
    { btnText: isAr ? 'نقل إلى الأرشيف' : 'Archive' }
  );
}

async function restoreReport(id) {
  const isAr = TAZA.Lang.current === 'ar';
  try {
    await TAZA.Http.put(TAZA.API.REPORTS.RESTORE(id));
    TAZA.Toast.success(isAr ? 'تمت إعادة التقرير إلى القائمة النشطة' : 'Report restored');
    _reports = [];
    loadReports();
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}

async function openSendReportModal() {
  // جلب قائمة الموظفين لملء الـ select
  if (!_employees.length) {
    try {
      const res = await TAZA.Http.get(TAZA.API.EMPLOYEES.LIST);
      _employees = res?.data?.all ?? [];
    } catch {}
  }

  const sel  = document.getElementById('report-receiver-id');
  const isAr = TAZA.Lang.current === 'ar';
  sel.innerHTML = `<option value="">${isAr?'اختر موظفاً':'Select employee'}</option>` +
    _employees.map(e => `<option value="${Number(e.id)}">${escapeHtml(e.name)} — ${escapeHtml(e.role_label)}</option>`).join('');

  document.getElementById('report-title').value   = '';
  document.getElementById('report-content').value = '';
  openModal('send-report-modal');
}

async function sendReportToEmployee() {
  const receiverId = document.getElementById('report-receiver-id').value;
  const type       = document.getElementById('report-type').value;
  const title      = document.getElementById('report-title').value.trim();
  const content    = document.getElementById('report-content').value.trim();
  const isAr       = TAZA.Lang.current === 'ar';

  if (!receiverId || !title || !content) {
    TAZA.Toast.warning(isAr ? 'يرجى ملء كل الحقول' : 'Please fill all fields');
    return;
  }

  try {
    // نستخدم مسار إرسال تعليمات المدير العام
    // نحتاج report_id — نرسل أولاً كـ draft ثم نرسله
    // بدلاً من ذلك، نرسل مباشرة عبر notify
    await TAZA.Http.post(TAZA.API.EMPLOYEES.NOTIFY(receiverId), {
      title,
      message: `[${type.toUpperCase()}] ${content}`,
    });
    TAZA.Toast.success(isAr ? 'تم إرسال التعليمات' : 'Instructions sent');
    closeModal('send-report-modal');
  } catch(e) {
    TAZA.Toast.apiError(e);
  }
}
