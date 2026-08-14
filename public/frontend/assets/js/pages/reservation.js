// Reservation table selection and reservation metadata
async function initReservationPage() {
  if (!requireCustomerLogin()) return;
  if (document.body.dataset.reservationPageReady === 'true') {
    renderPaymentSummary($('[data-reservation-summary]'));
    return;
  }
  document.body.dataset.reservationPageReady = 'true';

  let tables = [];
  const wrap = $('[data-tables]');
  const dateInput = $('[data-reserve-date]');
  const timeInput = $('[data-reserve-time]');
  const selectedTableEl = $('[data-selected-table]');
  const selectedTypeEl = $('[data-selected-type]');
  const selectedSeatsEl = $('[data-selected-seats]');
  const seatsInput = $('[data-reserve-seats]');
  let selectedTable = null;

  const pad = n => String(n).padStart(2, '0');
  const toDateValue = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const toTimeValue = date => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const reservationWindow = () => {
    const now = new Date();
    return {
      min: new Date(now.getTime() + 60 * 1000),
      max: new Date(now.getTime() + 24 * 60 * 60 * 1000)
    };
  };
  const getSelectedDateTime = () => {
    const date = dateInput?.value;
    const time = timeInput?.value;
    if (!date || !time) return null;
    const selected = new Date(`${date}T${time}:00`);
    return Number.isNaN(selected.getTime()) ? null : selected;
  };
  const getReservationDateTime = () => {
    const selected = getSelectedDateTime();
    return selected ? `${toDateValue(selected)} ${toTimeValue(selected)}:00` : null;
  };
  const validateReservationWindow = ({ silent = false } = {}) => {
    const selected = getSelectedDateTime();
    if (!selected) {
      if (!silent) showToast(langText('يرجى تحديد تاريخ ووقت الحجز أولاً', 'Please select reservation date and time first'), { kind: 'warning' });
      return false;
    }
    const { min, max } = reservationWindow();
    if (selected < min) {
      if (!silent) showToast(langText('يرجى اختيار وقت مستقبلي صحيح', 'Please choose a valid future time'), { kind: 'warning' });
      return false;
    }
    if (selected > max) {
      if (!silent) showToast(langText('الحجز متاح فقط ضمن الـ 24 ساعة القادمة', 'Reservations are available only within the next 24 hours'), { kind: 'warning' });
      return false;
    }
    return true;
  };
  const setInitialDateLimits = () => {
    if (!dateInput || !timeInput) return;
    const { min, max } = reservationWindow();
    dateInput.min = toDateValue(min);
    dateInput.max = toDateValue(max);
    if (!dateInput.value) dateInput.value = toDateValue(min);
    if (!timeInput.value) timeInput.value = '';
  };
  const selectedMaxSeats = () => Number(selectedTable?.maxSeats || 10);
  const clampSeats = value => Math.min(selectedMaxSeats(), Math.max(1, Number(value) || 1));
  const setSeats = value => {
    if (!seatsInput) return;
    seatsInput.value = String(clampSeats(value));
    updateReservationPreview();
  };
  const updateReservationPreview = () => {
    if (selectedTableEl) selectedTableEl.textContent = selectedTable ? `T${selectedTable.id}` : '-';
    if (selectedTypeEl) selectedTypeEl.textContent = selectedTable ? (selectedTable.type === 'vip' ? 'VIP' : langText('عادية', 'Standard')) : '-';
    if (selectedSeatsEl) selectedSeatsEl.textContent = seatsInput?.value || '4';
    $$('[data-table]', wrap || document).forEach(card => {
      const active = selectedTable && card.dataset.table === String(selectedTable.id);
      card.classList.toggle('selected', Boolean(active));
      card.setAttribute('aria-pressed', String(Boolean(active)));
    });
  };
  const setTableStatus = (card, status, text) => {
    card.classList.remove('available', 'unavailable', 'time-required', 'selected');
    card.classList.add(status);
    const label = card.querySelector('.table-card-status');
    if (label) label.textContent = text;
  };
  const markTablesWaitingForTime = () => {
    selectedTable = null;
    if (!wrap) return;
    $$('[data-table]', wrap).forEach(card => {
      setTableStatus(card, 'time-required', langText('حدد الوقت أولاً', 'Select time first'));
      card.disabled = false;
      card.setAttribute('aria-pressed', 'false');
    });
    updateReservationPreview();
  };

  const applyTableCatalog = payload => {
    tables = (payload?.tables || []).map(table => ({
      id: Number(table.number),
      name: table.name || `T${table.number}`,
      type: table.type,
      maxSeats: Number(table.max_seats || 10),
      available: table.is_available,
      label: table.is_available === false
        ? langText('محجوزة في هذا الوقت', 'Reserved at this time')
        : langText('متاحة', 'Available')
    }));
    if (!wrap) return;
    wrap.innerHTML = tables.map(t => `
      <button class="table-card ${t.type === 'vip' ? 'vip' : 'available'} ${t.available == null ? 'time-required' : (t.available ? 'available' : 'unavailable')}" data-table="${t.id}" type="button" aria-pressed="false" ${t.available === false ? 'disabled' : ''}>
        <span class="table-card-top"><strong>${esc(t.name)}</strong><span>${t.type === 'vip' ? 'VIP' : langText('عادية', 'Standard')}</span></span>
        <span class="table-seat-mark">${String(t.id).padStart(2, '0')}</span>
        <span class="table-card-status">${esc(t.available == null ? langText('حدد الوقت أولاً', 'Select time first') : t.label)}</span>
      </button>
    `).join('');
    updateReservationPreview();
  };

  const loadTableCatalog = async reservationTime => {
    const query = reservationTime
      ? `?reservation_time=${encodeURIComponent(reservationTime)}&duration_minutes=60`
      : '';
    const payload = await safeApi(`/public/reservations/tables${query}`);
    if (!payload?.tables?.length) {
      if (wrap) wrap.innerHTML = `<div class="empty-state"><strong>${esc(langText('تعذر تحميل الطاولات', 'Unable to load tables'))}</strong><p class="muted">${esc(langText('تحقق من الاتصال ثم أعد المحاولة.', 'Check your connection and try again.'))}</p></div>`;
      return false;
    }
    applyTableCatalog(payload);
    return true;
  };

  const refreshTableAvailability = async () => {
    const reservationTime = getReservationDateTime();
    if (!wrap) return;
    if (!reservationTime || !validateReservationWindow({ silent: true })) {
      markTablesWaitingForTime();
      return;
    }

    $$('[data-table]', wrap).forEach(card => {
      card.disabled = true;
      const label = card.querySelector('.table-card-status');
      if (label) label.textContent = langText('يتم الفحص...', 'Checking...');
    });
    const loaded = await loadTableCatalog(reservationTime);
    if (!loaded) return;
    if (selectedTable && !tables.find(table => table.id === selectedTable.id)?.available) {
      selectedTable = null;
    }
    updateReservationPreview();
  };

  wrap?.addEventListener('click', event => {
    const btn = event.target.closest('[data-table]');
    if (!btn) return;
    if (!validateReservationWindow()) {
      markTablesWaitingForTime();
      return;
    }
    if (btn.disabled || btn.classList.contains('unavailable')) {
      return showToast(langText('هذه الطاولة محجوزة في الوقت المحدد', 'This table is reserved at the selected time'), { kind: 'warning' });
    }
    selectedTable = tables.find(t => String(t.id) === btn.dataset.table);
    if (Number(seatsInput?.value || 1) > selectedMaxSeats()) setSeats(selectedMaxSeats());
    updateReservationPreview();
  });

  setInitialDateLimits();
  await loadTableCatalog();
  markTablesWaitingForTime();
  dateInput?.addEventListener('change', () => {
    selectedTable = null;
    refreshTableAvailability();
  });
  timeInput?.addEventListener('change', () => {
    selectedTable = null;
    refreshTableAvailability();
  });
  timeInput?.addEventListener('blur', () => {
    if (!validateReservationWindow({ silent: true }) && timeInput.value) validateReservationWindow();
  });
  $$('[data-seat-step]').forEach(btn => btn.addEventListener('click', () => {
    setSeats(Number(seatsInput?.value || 4) + Number(btn.dataset.seatStep || 0));
  }));
  seatsInput?.addEventListener('input', () => {
    if (Number(seatsInput.value) > 10) seatsInput.value = '10';
    if (seatsInput.value && Number(seatsInput.value) < 1) seatsInput.value = '1';
    updateReservationPreview();
  });
  seatsInput?.addEventListener('change', () => setSeats(seatsInput.value));

  $('[data-confirm-reservation]')?.addEventListener('click', () => {
    if (!validateReservationWindow()) return;
    if (!selectedTable) return showToast(langText('يرجى اختيار طاولة متاحة في الوقت المحدد', 'Choose an available table at the selected time'), { kind: 'warning' });
    const date = dateInput?.value;
    const time = timeInput?.value;
    const seats = Number(seatsInput?.value || 0);
    if (!seats || seats > 10) return showToast(langText('عدد الكراسي يجب أن يكون بين 1 و10', 'Seats must be between 1 and 10'), { kind: 'warning' });

    const pricing = AppState.pricing?.reservation || {};
    const availabilityPath = `/public/reservations/table/${selectedTable.id}/availability?reservation_time=${encodeURIComponent(`${date} ${time}:00`)}&duration_minutes=60&live=1`;
    safeApi(availabilityPath).then(availability => {
      if (!availability || availability.is_available === false) {
        showToast(langText('هذه الطاولة محجوزة في الوقت المحدد', 'This table is already reserved at that time'), { kind: 'warning' });
        refreshTableAvailability();
        return;
      }

      const tableType = availability?.table_type || (selectedTable.type === 'vip' ? 'vip' : 'normal');
      const livePricing = availability?.pricing_info || {};
      const freeSeats = Number(livePricing.free_seats || pricing.free_seats || 4);
      const vipFee = Number(livePricing.vip_extra_cost ?? (tableType === 'vip' ? (pricing.vip_extra_cost || 50) : 0));
      const seatsFee = Math.max(0, seats - freeSeats) * Number(livePricing.cost_per_extra_seat || pricing.cost_per_extra_seat || 20);
      const fee = vipFee + seatsFee;

      AppState.reservationMeta = {
        table: `T${selectedTable.id}`,
        tableNumber: selectedTable.id,
        tableType,
        reservationTime: `${date} ${time}:00`,
        time: `${date} ${time}`,
        seats,
        fee,
        durationMinutes: 60
      };
      persist();
      $('[data-reserve-fee]') && ($('[data-reserve-fee]').textContent = formatCurrency(fee));
      renderPaymentSummary($('[data-reservation-summary]'));
      showToast(langText('تم تأكيد بيانات الحجز بنجاح', 'Reservation details confirmed successfully'), { kind: 'reservation' });
    });
  });

  $('[data-go-payment-reservation]')?.addEventListener('click', () => {
    if (!AppState.reservationMeta) return showToast(langText('أكد الحجز أولاً', 'Confirm reservation first'), { kind: 'warning' });
    location.href = 'payment.html?order=reservation';
  });
  updateReservationPreview();
  renderPaymentSummary($('[data-reservation-summary]'));
}
