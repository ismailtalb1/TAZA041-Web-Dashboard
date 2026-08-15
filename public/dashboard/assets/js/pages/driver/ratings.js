'use strict';

// ═══════════════════════════════════════════
// [4] Ratings
// ═══════════════════════════════════════════
async function loadRatings() {
  const isAr = TAZA.Lang.current === 'ar';
  if (!_driverId) return;

  try {
    const res  = await TAZA.Http.get(TAZA.API.DELIVERY.DRIVER_RATINGS(_driverId));
    _myRatings = res?.data ?? {};

    const summary = _myRatings.summary ?? {};
    const dist    = summary.distribution ?? {};
    const avg     = summary.average_rating ?? 0;
    const total   = summary.total_ratings  ?? 0;

    // Summary Card
    const avgEl   = document.getElementById('my-avg-rating');
    const starsEl = document.getElementById('my-stars-display');
    const totalEl = document.getElementById('my-total-ratings');
    const tierEl  = document.getElementById('rating-tier-badge');

    if (avgEl)   avgEl.textContent   = avg.toFixed(1);
    if (starsEl) starsEl.textContent = '★'.repeat(Math.round(avg)) + '☆'.repeat(5-Math.round(avg));
    if (totalEl) totalEl.textContent = `${total} ${isAr?'تقييم':'reviews'}`;

    // Profile hero sync
    const heroStarsEl  = document.getElementById('profile-hero-stars');
    const heroRatingEl = document.getElementById('profile-hero-rating');
    if (heroStarsEl)  heroStarsEl.textContent = '★'.repeat(Math.round(avg)) + '☆'.repeat(5-Math.round(avg));
    if (heroRatingEl) heroRatingEl.textContent = avg.toFixed(1) + ' / 5';

    // Tier badge
    if (tierEl) {
      const tierConfig = avg >= 4.8 ? { label: isAr?'ممتاز':'Excellent', color:'var(--success)' }
                       : avg >= 4.0 ? { label: isAr?'جيد جداً':'Very Good', color:'var(--primary)' }
                       : avg >= 3.0 ? { label: isAr?'جيد':'Good',         color:'var(--warning)' }
                       :              { label: isAr?'يحتاج تحسين':'Needs Improvement', color:'var(--danger)' };
      tierEl.innerHTML = `<span style="background:${tierConfig.color}22;color:${tierConfig.color};
        padding:5px 16px;border-radius:var(--border-radius-full);font-size:.8rem;font-weight:700">
        ${tierConfig.label}
      </span>`;
    }

    // Distribution Bars
    const distEl = document.getElementById('rating-distribution');
    if (distEl) {
      distEl.innerHTML = [5,4,3,2,1].map(n => {
        const count = ratingBucketCount(dist, n);
        const rawBucket = dist[n];
        const percent = typeof rawBucket === 'object' && Number.isFinite(Number(rawBucket?.percent))
          ? Number(rawBucket.percent)
          : (total > 0 ? (count / total) * 100 : 0);
        const barColor = n >= 4 ? 'var(--success)' : n === 3 ? 'var(--warning)' : 'var(--danger)';
        return `
          <div class="rating-bar-row">
            <span class="rating-bar-label" style="color:${barColor}">${n}★</span>
            <div class="progress" style="flex:1;height:10px">
              <div class="progress-bar" style="width:${Math.min(100, Math.max(0, percent))}%;background:${barColor};border-radius:5px"></div>
            </div>
            <span class="rating-bar-count">${count}</span>
          </div>
        `;
      }).join('');
    }

    // Reviews List
    const reviews   = _myRatings.reviews ?? [];
    const reviewsEl = document.getElementById('my-reviews-list');
    if (reviewsEl) {
      if (!reviews.length) {
        reviewsEl.innerHTML = `<div class="empty-state" style="padding:20px">
          <div class="empty-icon">💬</div>
          <div class="empty-title">${isAr?'لا توجد تعليقات بعد':'No comments yet'}</div>
        </div>`;
      } else {
        reviewsEl.innerHTML = reviews.map(r => {
          const stars = Math.round(r.rating ?? 0);
          const color = stars >= 4 ? 'var(--success)' : stars >= 3 ? 'var(--warning)' : 'var(--danger)';
          return `
            <div style="padding:12px 0;border-bottom:1px solid var(--border-light)">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="avatar avatar-sm" style="background:var(--primary-soft);color:var(--primary)">
                    ${TAZA.Utils.initials(r.customer_name ?? 'Z')}
                  </div>
                  <span style="font-weight:600;font-size:.85rem">${escapeHtml(r.customer_name ?? (isAr?'زبون':'Customer'))}</span>
                </div>
                <div style="display:flex;align-items:center;gap:5px">
                  <span style="color:${color};font-size:.9rem">${'★'.repeat(stars)}${'☆'.repeat(5-stars)}</span>
                  <span style="font-weight:700;font-size:.82rem;color:${color}">${r.rating?.toFixed(1)}</span>
                </div>
              </div>
              ${r.comment ? `<div style="font-size:.8rem;color:var(--text-secondary);font-style:italic">
                "${escapeHtml(r.comment)}"
              </div>` : ''}
              <div style="font-size:.7rem;color:var(--text-muted);margin-top:4px">
                <i class="fa-regular fa-clock"></i> ${TAZA.Utils.timeAgo(r.created_at)}
              </div>
            </div>
          `;
        }).join('');
      }
    }

  } catch(e) { TAZA.Toast.apiError(e); }
}
