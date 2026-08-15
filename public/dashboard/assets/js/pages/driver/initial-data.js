'use strict';

// ═══════════════════════════════════════════
// Initial Load
// ═══════════════════════════════════════════
async function loadInitialData() {
  try {
    const meRes = await TAZA.Http.get(TAZA.API.AUTH.ME);
    const user  = meRes?.data?.employee ?? {};
    _driverId   = user.id;

    updateSidebarUser(user);

    const [activeRes, statsRes] = await Promise.all([
      TAZA.Http.get(TAZA.API.DELIVERY.ACTIVE),
      TAZA.Http.get(TAZA.API.DELIVERY.DRIVER_STATS(_driverId)),
    ]);

    _activeDeliveries = activeRes?.data?.deliveries ?? [];
    _myStats          = statsRes?.data ?? {};

    renderOverviewStats();
    renderOverviewActiveList(_activeDeliveries);
    renderWeeklyChart();
    loadRatingsChart();

  } catch(e) { TAZA.Toast.apiError(e); }
}

function updateSidebarUser(user) {
  const nameEl   = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('sidebar-user-avatar');
  if (nameEl)   nameEl.textContent = user.name ?? '—';
  if (avatarEl) {
    if (user.avatar) {
      avatarEl.innerHTML = `<img src="${escapeHtml(TAZA.Media.url(user.avatar))}" alt="${escapeHtml(user.name ?? '')}"
        onerror="this.style.display='none';this.parentElement.textContent='${TAZA.Utils.initials(user.name)}'">`;
    } else {
      avatarEl.textContent = TAZA.Utils.initials(user.name);
    }
  }
}
