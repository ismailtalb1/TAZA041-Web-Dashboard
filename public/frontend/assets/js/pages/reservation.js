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
  const hourInput = $('[data-reserve-hour]');
  const minuteInput = $('[data-reserve-minute]');
  const periodInput = $('[data-reserve-period]');
  const selectedTableEl = $('[data-selected-table]');
  const selectedTypeEl = $('[data-selected-type]');
  const selectedSeatsEl = $('[data-selected-seats]');
  const seatsInput = $('[data-reserve-seats]');
  const roomOrbit = $('[data-room-orbit]');
  const roomChairs = $('[data-room-chairs]');
  let selectedTable = null;
  let availabilityRequestId = 0;

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
    const hour12 = Number(hourInput?.value);
    const minute = Number(minuteInput?.value);
    const period = periodInput?.value;
    if (!hour12 || !Number.isInteger(minute) || !['am', 'pm'].includes(period)) return null;
    const hour24 = (hour12 % 12) + (period === 'pm' ? 12 : 0);
    const selected = new Date();
    selected.setHours(hour24, minute, 0, 0);
    return selected;
  };
  const getReservationDateTime = () => {
    const selected = getSelectedDateTime();
    return selected ? `${toDateValue(selected)} ${toTimeValue(selected)}:00` : null;
  };
  const validateReservationWindow = ({ silent = false } = {}) => {
    const selected = getSelectedDateTime();
    if (!selected) {
      if (!silent) showToast(langText('يرجى تحديد وقت الحجز أولاً', 'Please select the reservation time first'), { kind: 'warning' });
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
  const setInitialTime = () => {
    if (!hourInput || !minuteInput || !periodInput) return;
    const initial = new Date(Date.now() + 5 * 60 * 1000);
    initial.setSeconds(0, 0);
    initial.setMinutes(Math.ceil(initial.getMinutes() / 5) * 5);
    const hour24 = initial.getHours();
    hourInput.value = String(hour24 % 12 || 12);
    minuteInput.value = pad(initial.getMinutes());
    periodInput.value = hour24 >= 12 ? 'pm' : 'am';
  };
  const selectedMaxSeats = () => Number(selectedTable?.maxSeats || 10);
  const clampSeats = value => Math.min(selectedMaxSeats(), Math.max(1, Number(value) || 1));
  const clearConfirmedReservation = () => {
    if (!AppState.reservationMeta) return;
    AppState.reservationMeta = null;
    persist();
    const fee = $('[data-reserve-fee]');
    if (fee) fee.textContent = formatCurrency(0);
    renderPaymentSummary($('[data-reservation-summary]'));
  };
  const setSeats = value => {
    if (!seatsInput) return;
    clearConfirmedReservation();
    seatsInput.value = String(clampSeats(value));
    updateReservationPreview();
  };
  const updateReservationPreview = () => {
    const seats = clampSeats(seatsInput?.value || 2);
    if (selectedTableEl) selectedTableEl.textContent = selectedTable ? `T${selectedTable.id}` : '-';
    if (selectedTypeEl) selectedTypeEl.textContent = selectedTable ? (selectedTable.type === 'vip' ? 'VIP' : langText('عادية', 'Standard')) : '-';
    if (selectedSeatsEl) selectedSeatsEl.textContent = String(seats);
    if (roomOrbit) roomOrbit.dataset.seatCount = String(seats);
    if (roomChairs) {
      roomChairs.innerHTML = Array.from({ length: seats }, (_, index) => {
        const angle = (360 / seats) * index;
        return `<span class="room-chair" style="--chair-angle:${angle}deg"></span>`;
      }).join('');
    }
    const seatingTitle = $('[data-seating-title]');
    const seatingCopy = $('[data-seating-copy]');
    if (seatingTitle) seatingTitle.textContent = langText(`طاولة مجهزة لـ ${seats} ضيوف`, `A table set for ${seats} guests`);
    if (seatingCopy) seatingCopy.textContent = langText(
      `تم ترتيب ${seats} كراسٍ حول الطاولة، وسيثبت هذا العدد مع طلبك.`,
      `${seats} chairs are arranged around your table and will be saved with your order.`
    );
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
  const markTablesWaitingForTime = (message = langText('حدد الوقت أولاً', 'Select time first')) => {
    selectedTable = null;
    if (!wrap) return;
    $$('[data-table]', wrap).forEach(card => {
      setTableStatus(card, 'time-required', message);
      card.disabled = true;
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

  const loadTableCatalog = async (reservationTime, requestId = null) => {
    const query = reservationTime
      ? `?reservation_time=${encodeURIComponent(reservationTime)}&duration_minutes=60`
      : '';
    const payload = await safeApi(`/public/reservations/tables${query}`);
    if (requestId !== null && requestId !== availabilityRequestId) return false;
    if (!payload?.tables?.length) {
      if (wrap) wrap.innerHTML = `<div class="empty-state"><strong>${esc(langText('تعذر تحميل الطاولات', 'Unable to load tables'))}</strong><p class="muted">${esc(langText('تحقق من الاتصال ثم أعد المحاولة.', 'Check your connection and try again.'))}</p></div>`;
      return false;
    }
    applyTableCatalog(payload);
    return true;
  };

  const refreshTableAvailability = async () => {
    const requestId = ++availabilityRequestId;
    const reservationTime = getReservationDateTime();
    if (!wrap) return;
    if (!reservationTime) {
      markTablesWaitingForTime();
      return;
    }
    if (!validateReservationWindow({ silent: true })) {
      markTablesWaitingForTime(langText('الوقت المحدد مضى', 'Selected time has passed'));
      return;
    }

    $$('[data-table]', wrap).forEach(card => {
      card.disabled = true;
      const label = card.querySelector('.table-card-status');
      if (label) label.textContent = langText('يتم الفحص...', 'Checking...');
    });
    const loaded = await loadTableCatalog(reservationTime, requestId);
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
    clearConfirmedReservation();
    selectedTable = tables.find(t => String(t.id) === btn.dataset.table);
    if (Number(seatsInput?.value || 1) > selectedMaxSeats()) setSeats(selectedMaxSeats());
    updateReservationPreview();
  });

  setInitialTime();
  await loadTableCatalog(getReservationDateTime());
  const handleTimeChange = () => {
    clearConfirmedReservation();
    selectedTable = null;
    refreshTableAvailability();
  };
  [hourInput, minuteInput, periodInput].forEach(input => input?.addEventListener('change', handleTimeChange));
  $$('[data-seat-step]').forEach(btn => btn.addEventListener('click', () => {
    setSeats(Number(seatsInput?.value || 2) + Number(btn.dataset.seatStep || 0));
  }));
  seatsInput?.addEventListener('input', () => {
    clearConfirmedReservation();
    if (Number(seatsInput.value) > 10) seatsInput.value = '10';
    if (seatsInput.value && Number(seatsInput.value) < 1) seatsInput.value = '1';
    updateReservationPreview();
  });
  seatsInput?.addEventListener('change', () => setSeats(seatsInput.value));

  $('[data-confirm-reservation]')?.addEventListener('click', () => {
    if (!validateReservationWindow()) return;
    if (!selectedTable) return showToast(langText('يرجى اختيار طاولة متاحة في الوقت المحدد', 'Choose an available table at the selected time'), { kind: 'warning' });
    const reservationTime = getReservationDateTime();
    const displayTime = `${hourInput?.value}:${minuteInput?.value} ${String(periodInput?.value || '').toUpperCase()}`;
    const seats = Number(seatsInput?.value || 0);
    if (!seats || seats > 10) return showToast(langText('عدد الكراسي يجب أن يكون بين 1 و10', 'Seats must be between 1 and 10'), { kind: 'warning' });

    const pricing = AppState.pricing?.reservation || {};
    const availabilityPath = `/public/reservations/table/${selectedTable.id}/availability?reservation_time=${encodeURIComponent(reservationTime)}&duration_minutes=60&live=1`;
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
        reservationTime,
        time: displayTime,
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
