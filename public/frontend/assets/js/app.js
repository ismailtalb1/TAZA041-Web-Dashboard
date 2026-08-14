// TAZA 041 frontend bootstrap. Feature code lives in assets/js/core and assets/js/pages.
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof TazaCookies !== 'undefined') TazaCookies.init?.();

  try {
    await initGlobalUI();
  } catch (error) {
    console.error(error);
    showToast(langText('تعذر تحميل الصفحة الآن، يرجى المحاولة لاحقاً', 'Unable to load the page now, please try again later'));
  }
});
