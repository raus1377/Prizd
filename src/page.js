/* Keeps the status chip on static pages honest between daily rebuilds. */
(() => {
  const now = Date.now();
  document.querySelectorAll('[data-closes]').forEach(el => {
    const closes = Date.parse(el.dataset.closes);
    if (Number.isFinite(closes) && closes <= now) {
      el.textContent = 'Closed';
      el.className = 'status status-closed';
    }
  });
})();
