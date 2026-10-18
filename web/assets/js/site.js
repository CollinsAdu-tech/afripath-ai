// Shared chrome for every page: header, footer, scroll reveals, FAQ accordions, photo slots.
// Plain ES module, no dependencies.

export const BRAND = 'AfriPath AI';

export const NAV = [
  { href: 'opportunities.html', label: 'Opportunities' },
  { href: 'mentorship.html', label: 'Live Mentorship' },
  { href: 'about.html', label: 'About' },
  { href: 'afripath-ai.html', label: 'AfriPath AI', cls: 'is-ai' },
];

const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 12l9-4v24l-9 4z" fill="#2f8fd6"/><path d="M12 8l9 4v24l-9-4z" fill="#58b6ee"/><path d="M21 12l9-4v24l-9 4z" fill="#2f8fd6"/><path d="M29 2.5c-3.6 0-6.5 2.8-6.5 6.3 0 4.6 6.5 11 6.5 11s6.5-6.4 6.5-11c0-3.5-2.9-6.3-6.5-6.3z" fill="#2347e8"/><circle cx="29" cy="8.8" r="2.4" fill="#fff"/></svg>`;
const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
export const ICONS = {
  arrow: ARROW,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1d3626"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19z"/><path d="M14.5 6.5l3 3"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5.5C5.5 4.5 9 4.5 12 6c3-1.5 6.5-1.5 9-.5V19c-2.5-1-6-1-9 .5-3-1.5-6.5-1.5-9-.5z"/><path d="M12 6v13.5"/></svg>`,
  notes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/></svg>`,
  cap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v6"/></svg>`,
};

const HILLS = (() => {
  const row = (fill, step, off, base) => { let c = ''; for (let i = 0, x = off; x < 1260; i++, x += step) c += `<circle cx="${x}" cy="${base + ((i * 29) % 18)}" r="${50 + ((i * 37) % 26)}" fill="${fill}"/>`; return c; };
  return `<svg viewBox="0 0 1200 110" preserveAspectRatio="none" aria-hidden="true">${row('#4b8463', 92, 10, 70)}${row('#3d7050', 118, 60, 96)}<rect y="96" width="1200" height="14" fill="#3d7050"/></svg>`;
})();

const here = () => (location.pathname.split('/').pop() || 'index.html').toLowerCase();

export function headerHTML() {
  const cur = here();
  const links = NAV.map((n) => `<li><a href="${n.href}" class="${n.cls || ''}" ${cur === n.href ? 'aria-current="page"' : ''}>${n.label}</a></li>`).join('');
  return `<a class="skip" href="#main">Skip to content</a>
  <header class="site-header" id="top"><div class="wrap nav">
    <a class="brand" href="index.html" aria-label="${BRAND} home">${LOGO}<span>${BRAND}</span></a>
    <ul class="nav-links" id="nav-links">${links}</ul>
    <div class="nav-cta"><a class="btn btn--steel" href="login.html">Login</a>
      <button class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav-links"><span></span><span></span><span></span></button></div>
  </div></header>`;
}

export function footerHTML() {
  const cur = here();
  const all = [{ href: 'index.html', label: 'Home' }, ...NAV, { href: 'login.html', label: 'Login' }, { href: 'privacy.html', label: 'Privacy' }];
  const links = all.map((n) => `<li><a href="${n.href}" ${cur === n.href ? 'aria-current="page"' : ''}>${n.label}</a></li>`).join('');
  return `<footer class="site-footer"><div class="wrap">
    <div class="foot-grid">
      <div><a class="brand" href="index.html">${LOGO}<span>${BRAND}</span></a><p class="muted">Find your career path. Online, built for students in Ghana and beyond.</p></div>
      <nav aria-label="Footer"><h4>Pages</h4><ul class="foot-links">${links}</ul></nav>
      <div class="foot-cta"><p>Not sure where to start? Take the quick survey.</p><a class="btn btn--primary" href="afripath-ai.html">Start the survey <span class="arrow">${ARROW.replace('<svg', '<svg width="18" height="18"')}</span></a></div>
    </div>
    <div class="foot-bar"><span>© 2026 ${BRAND}</span><a href="privacy.html">Privacy</a></div>
  </div><div class="hills">${HILLS}</div></footer>`;
}

export function mountChrome() {
  document.documentElement.classList.add('js');
  const h = document.getElementById('site-header'); if (h) h.innerHTML = headerHTML();
  const f = document.getElementById('site-footer'); if (f) f.innerHTML = footerHTML();
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    const btn = header.querySelector('.menu-btn');
    btn?.addEventListener('click', () => { const o = header.classList.toggle('menu-open'); btn.setAttribute('aria-expanded', String(o)); });
    header.querySelectorAll('.nav-links a').forEach((a) => a.addEventListener('click', () => header.classList.remove('menu-open')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') header.classList.remove('menu-open'); });
  }
}

/** Fade/slide elements in as they scroll into view. Elements with .accent also draw their underline. */
export function initReveal(root = document) {
  const els = [...root.querySelectorAll('.reveal, .pop, .accent')];
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e) => io.observe(e));
}

export function initFaq(root = document) {
  root.querySelectorAll('.faq-item').forEach((item) => {
    const q = item.querySelector('.faq-q');
    q.addEventListener('click', () => {
      const open = !item.classList.contains('open');
      item.classList.toggle('open', open);
      q.setAttribute('aria-expanded', String(open));
    });
  });
}

/** A photo slot shows a tidy placeholder until the real image file exists in assets/img/. */
export function initPhotos(root = document) {
  root.querySelectorAll('.photo[data-src]').forEach((slot) => {
    const img = new Image();
    img.alt = slot.dataset.alt || '';
    img.decoding = 'async'; img.loading = 'lazy';
    img.onload = () => { slot.prepend(img); slot.classList.add('has-img'); };
    img.src = slot.dataset.src;
  });
  root.querySelectorAll('.cut[data-src]').forEach((slot) => {
    const img = new Image(); img.alt = slot.dataset.alt || ''; img.loading = 'lazy';
    img.onload = () => { slot.append(img); slot.classList.add('has-img'); };
    img.src = slot.dataset.src;
  });
}

/** Safe-ish text escaping for any string that ends up in innerHTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Only http(s) links are ever rendered as links. */
export const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };

export function boot() {
  mountChrome(); initPhotos(); initFaq(); initReveal();
}
