import { boot, ICONS } from './site.js';
import { api } from './api.js';

// Fill the inline icons that the static HTML references by placeholder.
document.querySelectorAll('.choice').forEach((el) => {
  el.innerHTML = el.innerHTML
    .replace('__PENCIL__', ICONS.pencil).replace('__BOOK__', ICONS.book).replace('__NOTES__', ICONS.notes).replace('__CAP__', ICONS.cap)
    .replaceAll('__ARROW__', ICONS.arrow);
});
['i1', 'i2', 'i3', 'i4'].forEach((id) => { const n = document.getElementById(id); if (n) n.innerHTML = ICONS.check; });

boot();

// Real engine counts for the stat tiles. If the engine is unreachable the tiles simply stay hidden.
api.health().then((h) => {
  const c = h?.knowledgeBase?.counts; if (!c) return;
  document.querySelectorAll('#stats [data-k]').forEach((el) => {
    const v = c[el.dataset.k]; if (Number.isFinite(v)) { el.textContent = String(v); el.closest('.stat').hidden = false; }
  });
}).catch(() => {});
