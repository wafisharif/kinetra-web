/* Shared mobile nav toggle for pages that don't load main.js (support, privacy, terms, dashboard). */
(function mobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const open = links.style.display === 'flex';
    links.style.cssText = open
      ? ''
      : 'display:flex;position:absolute;top:64px;left:0;right:0;flex-direction:column;background:#0a0b0d;padding:20px 24px;border-bottom:1px solid rgba(255,255,255,.1);gap:18px;';
  });
})();
