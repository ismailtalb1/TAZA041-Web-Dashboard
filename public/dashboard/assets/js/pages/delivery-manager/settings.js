'use strict';

// ══════════════════════════════════════════════
// [6] Settings
// ══════════════════════════════════════════════
async function loadSettings() {
  try {
    const res  = await TAZA.Http.get(TAZA.API.DELIVERY.SETTINGS);
    _settings  = res?.data ?? {};
    document.getElementById('setting-cost-per-100m').value  = _settings.cost_per_100m    ?? '';
    document.getElementById('setting-max-distance').value   = _settings.max_distance_meters ?? '';
    const calculatorSlider = document.getElementById('calc-distance');
    if (calculatorSlider) {
      calculatorSlider.max = Math.max(.5, Number(_settings.max_distance_km ?? 10));
      calculatorSlider.value = Math.min(Number(calculatorSlider.value), Number(calculatorSlider.max));
    }
    updateCalculator();
  } catch(e) { TAZA.Toast.apiError(e); }
}

async function saveSettings() {
  const cost    = parseFloat(document.getElementById('setting-cost-per-100m').value);
  const maxDist = parseInt(document.getElementById('setting-max-distance').value);
  const isAr    = TAZA.Lang.current === 'ar';
  const btn     = document.getElementById('save-settings-btn');

  if (!cost || !maxDist) {
    TAZA.Toast.warning(isAr ? 'يرجى ملء الحقول' : 'Fill all fields');
    return;
  }

  TAZA.Utils.disableBtn(btn);
  try {
    await TAZA.Http.put(TAZA.API.DELIVERY.UPDATE_SETTINGS, {
      cost_per_100m: cost, max_distance_meters: maxDist,
    });
    TAZA.Toast.success(isAr ? 'تم حفظ الإعدادات' : 'Settings saved');
    await loadSettings();
    loadLiveBoard();
    loadActiveDeliveries();
  } catch(e) {
    TAZA.Toast.apiError(e);
  } finally {
    TAZA.Utils.enableBtn(btn);
  }
}

function updateCalculator() {
  const slider    = document.getElementById('calc-distance');
  const distKm    = parseFloat(slider?.value ?? 3);
  const costPer100= parseFloat(_settings.cost_per_100m
                      || document.getElementById('setting-cost-per-100m')?.value
                      || 5);

  const costTotal = Math.round((distKm * 1000 / 100) * costPer100);
  const etaMin    = Math.round(distKm * 4.5);
  const isAr      = TAZA.Lang.current === 'ar';

  document.getElementById('calc-distance-val').textContent = `${distKm} ${isAr?'كم':'km'}`;
  document.getElementById('calc-km').textContent           = `${distKm} ${isAr?'كم':'km'}`;
  document.getElementById('calc-cost').textContent         = TAZA.Utils.formatMoney(costTotal);
  document.getElementById('calc-time').textContent         = `~${etaMin} ${isAr?'دقيقة':'min'}`;
}
