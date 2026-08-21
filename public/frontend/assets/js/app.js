// TAZA 041 frontend bootstrap. Feature code lives in assets/js/core and assets/js/pages.
const tazaSiteLoader = (() => {
  const loader = document.getElementById('taza-site-loader');
  if (!loader) return { finish: async () => {} };

  const status = loader.querySelector('[data-site-loader-status]');
  const startedAt = window.__TAZA_SPLASH_STARTED__ || performance.now();
  const phases = {
    ar: ['نجهّز تفاصيل المطعم…', 'نرتّب المنيو والعروض…', 'الواجهة جاهزة لاستقبالك'],
    en: ['Preparing restaurant details…', 'Arranging the menu and offers…', 'Your experience is ready']
  };
  let phaseIndex = 0;
  let finished = false;
  let phaseSwapTimer = null;

  document.body.setAttribute('aria-busy', 'true');
  const phaseTimer = window.setInterval(() => {
    if (!status || finished) return;
    const language = document.documentElement.lang === 'en' ? 'en' : 'ar';
    phaseIndex = Math.min(phaseIndex + 1, phases[language].length - 2);
    status.classList.add('is-changing');
    phaseSwapTimer = window.setTimeout(() => {
      status.textContent = phases[language][phaseIndex];
      status.classList.remove('is-changing');
    }, 160);
  }, 720);

  const remove = async (immediate = false) => {
    if (finished) return;
    finished = true;
    window.clearInterval(phaseTimer);
    window.clearTimeout(phaseSwapTimer);

    const elapsed = performance.now() - startedAt;
    const remaining = immediate ? 0 : Math.max(0, 2300 - elapsed);
    if (remaining) await new Promise(resolve => window.setTimeout(resolve, remaining));

    const language = document.documentElement.lang === 'en' ? 'en' : 'ar';
    if (status) status.textContent = phases[language][2];
    loader.classList.add('is-ready');
    await new Promise(resolve => window.setTimeout(resolve, immediate ? 80 : 360));
    loader.classList.add('is-leaving');
    document.body.classList.remove('site-booting');
    document.body.removeAttribute('aria-busy');
    await new Promise(resolve => window.setTimeout(resolve, 700));
    loader.remove();
    window.dispatchEvent(new CustomEvent('taza:site-ready'));
  };

  // A slow or unavailable service must never keep the customer behind the splash screen.
  window.setTimeout(() => remove(true), 9000);
  return { finish: remove };
})();

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof hardenCustomerInputs === 'function') hardenCustomerInputs(document);
  if (typeof TazaCookies !== 'undefined') TazaCookies.init?.();

  try {
    await initGlobalUI();
  } catch (error) {
    console.error(error);
    showToast(langText('تعذر تحميل الصفحة الآن، يرجى المحاولة لاحقاً', 'Unable to load the page now, please try again later'));
  } finally {
    await tazaSiteLoader.finish();
  }
});
