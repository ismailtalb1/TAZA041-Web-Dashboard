'use strict';

// ═══════════════════════════════════════════
// [5] Reviews
// ═══════════════════════════════════════════
async function loadReviews() {
  const rating   = document.getElementById('reviews-rating-filter')?.value ?? '';
  const isAr     = TAZA.Lang.current === 'ar';
  try {
    const params = {};
    if (rating) params.rating = rating;
    const res  = await TAZA.Http.get(TAZA.API.REVIEWS.CUSTOMERS, params);
    _reviews   = res?.data?.reviews ?? [];
    renderReviewsSummary(_reviews);
    renderReviewsList(_reviews);
  } catch(e) { TAZA.Toast.apiError(e); }
}

function renderReviewsSummary(reviews) {
  const summaryEl = document.getElementById('reviews-summary');
  if (!summaryEl) return;
  if (!reviews.length) { summaryEl.style.display = 'none'; return; }
  summaryEl.style.display = 'block';
  const isAr  = TAZA.Lang.current === 'ar';
  const avg   = reviews.reduce((s, r) => s + (r.overall_rating ?? r.rating ?? 0), 0) / reviews.length;
  const total = reviews.length;

  const bigEl = document.getElementById('avg-rating-big');
  if (bigEl) bigEl.textContent = avg.toFixed(1);
  const starsEl = document.getElementById('avg-stars-display');
  if (starsEl) {
    const filled = Math.round(avg);
    starsEl.textContent = '★'.repeat(filled) + '☆'.repeat(5 - filled);
  }
  const totalEl = document.getElementById('total-reviews-count');
  if (totalEl) totalEl.textContent = `${total} ${isAr?'تقييم':'reviews'}`;

  const barsEl = document.getElementById('rating-bars');
  if (barsEl) {
    barsEl.innerHTML = [5,4,3,2,1].map(n => {
      const count = reviews.filter(r => Math.round(r.overall_rating ?? r.rating ?? 0) === n).length;
      const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
      return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:.75rem;color:var(--accent);width:20px">${n}★</span>
          <div class="progress" style="flex:1;height:8px">
            <div class="progress-bar" style="width:${pct}%;background:var(--accent)"></div>
          </div>
          <span style="font-size:.72rem;color:var(--text-muted);width:28px">${count}</span>
        </div>
      `;
    }).join('');
  }
}

function renderReviewsList(reviews) {
  const list = document.getElementById('reviews-list');
  const isAr = TAZA.Lang.current === 'ar';

  if (!reviews.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⭐</div>
      <div class="empty-title">${isAr?'لا توجد تقييمات منتجات حالياً — جاهز للتطوير لاحقاً':'No product reviews yet — ready for later development'}</div>
    </div>`;
    return;
  }

  list.innerHTML = reviews.map(r => {
    const rating   = r.overall_rating ?? r.rating ?? 0;
    const filled   = Math.round(rating);
    const ratingColor = filled >= 4 ? 'var(--success)' : filled >= 3 ? 'var(--warning)' : 'var(--danger)';

    return `
      <div class="review-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="avatar avatar-sm" style="background:var(--primary-soft);color:var(--primary)">
              ${TAZA.Utils.initials(r.customer_name ?? 'Z')}
            </div>
            <div>
              <div style="font-weight:700;font-size:.85rem">${escapeDashboardValue(r.customer_name ?? (isAr?'زبون':'Customer'))}</div>
              <div style="font-size:.7rem;color:var(--text-muted)">${TAZA.Utils.timeAgo(r.created_at)}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="star-display" style="color:${ratingColor}">
              ${'★'.repeat(filled)}${'☆'.repeat(5-filled)}
            </span>
            <span style="font-weight:700;font-size:.85rem;color:${ratingColor}">${rating.toFixed(1)}</span>
          </div>
        </div>
        ${r.comment ? `
          <div style="font-size:.825rem;color:var(--text-secondary);line-height:1.6;
                      background:var(--bg-main);border-radius:8px;padding:10px;margin-bottom:8px">
            "${escapeDashboardValue(r.comment)}"
          </div>` : ''}
        ${r.employee_reply ? `
          <div style="background:var(--primary-soft);border-right:3px solid var(--primary);
                      padding:8px 12px;border-radius:0 8px 8px 0;font-size:.78rem;color:var(--text-secondary)">
            <span style="font-weight:700;color:var(--primary)">
              ${isAr?'رد المطعم:':'Restaurant Reply:'}&nbsp;
            </span>
            ${escapeDashboardValue(r.employee_reply)}
          </div>` : ''}
      </div>
    `;
  }).join('');
}
