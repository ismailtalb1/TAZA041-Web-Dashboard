// Payment methods and order payment flow
function initPaymentPage() {
  const params = new URLSearchParams(location.search);
  if (params.get('order')) setOrderType(params.get('order') === 'normal' ? 'ordinary' : params.get('order'));
  if (!requireCustomerLogin()) return;
  if (!cartCount()) showToast(langText('السلة فارغة، أضف منتجات قبل الدفع', 'Cart is empty'), { kind: 'warning' });
  if (document.body.dataset.paymentPageReady === 'true') {
    renderPaymentSummary($('[data-payment-summary]'));
    return;
  }
  document.body.dataset.paymentPageReady = 'true';
  const testPaymentEnabled = AppState.pricing?.payment?.test_mode_enabled === true;
  $$('[data-test-payment-only]').forEach(element => {
    element.hidden = !testPaymentEnabled;
    element.classList.toggle('hidden', !testPaymentEnabled);
  });
  const methods = $$('[data-payment-method]');
  const forms = $$('[data-payment-form]');
  const summary = $('[data-payment-summary]');
  const confirmButton = $('[data-confirm-payment]');
  let total = renderPaymentSummary(summary);
  let activeMethod = 'cash';
  const syncLoyaltyState = () => {
    const balance = normalizeNumber(AppState.user?.loyaltyPoints ?? 0);
    const required = loyaltyPointsRequired(total);
    $('[data-loyalty-balance]') && ($('[data-loyalty-balance]').textContent = balance);
    $('[data-loyalty-needed]') && ($('[data-loyalty-needed]').textContent = required);
    const insufficient = activeMethod === 'loyalty' && balance < required;
    const restaurantClosed = !restaurantIsOpen();
    const warning = $('[data-loyalty-warning]');
    if (warning) {
      warning.textContent = insufficient
        ? langText(`رصيدك ينقصه ${required - balance} نقطة لإتمام الدفع.`, `You need ${required - balance} more points to pay.`)
        : '';
      warning.classList.toggle('hidden', !insufficient);
    }
    if (confirmButton) {
      confirmButton.disabled = insufficient || restaurantClosed;
      confirmButton.title = restaurantClosed
        ? langText('المطعم مغلق الآن', 'The restaurant is currently closed')
        : insufficient
          ? langText(`تحتاج ${required - balance} نقطة إضافية`, `You need ${required - balance} more points`)
          : '';
    }
  };
  const activate = (name) => {
    const selectedMethod = methods.find(method => method.dataset.paymentMethod === name);
    if (!selectedMethod || selectedMethod.disabled || selectedMethod.getAttribute('aria-disabled') === 'true') return;
    activeMethod = name;
    methods.forEach(m => {
      const isActive = m.dataset.paymentMethod === name;
      m.classList.toggle('active', isActive);
      m.setAttribute('aria-pressed', String(isActive));
      m.setAttribute('aria-selected', String(isActive));
    });
    forms.forEach(f => f.classList.toggle('hidden', f.dataset.paymentForm !== name));
    total = renderPaymentSummary(summary);
    syncLoyaltyState();
  };
  methods.filter(method => !method.disabled).forEach(m => m.addEventListener('click', () => activate(m.dataset.paymentMethod)));
  activate(activeMethod);
  window.addEventListener('taza:public-data-updated', event => {
    if (event.detail?.restaurant || event.detail?.catalog || event.detail?.pricing) {
      total = renderPaymentSummary(summary);
      syncLoyaltyState();
    }
  });

  confirmButton?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!cartCount()) return showToast(langText('السلة فارغة', 'Cart is empty'), { kind: 'warning' });
    if (!restaurantIsOpen()) return showToast(langText('المطعم مغلق الآن، لا يمكن إنشاء طلب جديد حالياً', 'The restaurant is closed now; new orders are not available'), { kind: 'warning' });
    if (activeMethod === 'seriatel' || activeMethod === 'sham') {
      const form = $(`[data-payment-form="${activeMethod}"]`);
      const inputs = $$('input', form);
      const phone = normalizePhone(inputs[0]?.value || '');
      const pin = String(inputs[1]?.value || '').trim();
      if (!isPhone(phone)) return showToast(langText('رقم الدفع يجب أن يكون 10 أرقام ويبدأ بـ 09', 'Payment phone must be 10 digits and start with 09'), { kind: 'warning' });
      if (!/^\d{4}$/.test(pin)) return showToast(langText('الرمز السري يجب أن يكون 4 أرقام', 'PIN must contain exactly 4 digits'), { kind: 'warning' });
    }
    total = renderPaymentSummary(summary);
    if (activeMethod === 'loyalty') {
      const balance = normalizeNumber(AppState.user?.loyaltyPoints ?? 0);
      const required = loyaltyPointsRequired(total);
      if (balance < required) {
        syncLoyaltyState();
        return showToast(
          langText(`رصيدك غير كافٍ. تحتاج ${required - balance} نقطة إضافية.`, `Not enough points. You need ${required - balance} more points.`),
          { kind: 'warning' }
        );
      }
    }
    try {
      const orderData = await apiFetch('/customer/orders', { method: 'POST', body: buildOrderPayload() });
      const order = orderData?.order;
      if (!order?.id) throw new Error(langText('تعذر تأكيد الطلب، حاول مرة أخرى', 'Unable to confirm the order. Try again'));
      const paymentData = await apiFetch(`/customer/orders/${order.id}/pay`, { method: 'POST', body: paymentMethodPayload(activeMethod, Number(order.final_price || total)) });
      const earnedPoints = normalizeNumber(paymentData?.loyalty_points_earned || 0);
      AppState.cart = {};
      AppState.orderNotes = '';
      AppState.deliveryMeta = null;
      AppState.reservationMeta = null;
      await refreshCustomerContext();
      persist();
      renderCartSummary();
      showToast(activeMethod === 'cash'
        ? langText('تم تأكيد طلبك، وستضاف نقاط الولاء بعد اكتمال الطلب وتأكيد الدفع', 'Order confirmed; loyalty points will be added after completion and payment confirmation')
        : (earnedPoints > 0
          ? langText(`تم الدفع بنجاح وإضافة ${earnedPoints} نقطة ولاء`, `Payment confirmed and ${earnedPoints} loyalty points were added`)
          : langText('تم تأكيد طلبك ودفعه بنجاح', 'Order and payment confirmed')), {
          kind: activeMethod === 'cash' ? 'order_accepted' : 'payment'
        });
      setTimeout(() => location.href = 'orders.html', 700);
    } catch (error) {
      showToast(friendlyError(error), { kind: 'error' });
    }
  });
}
