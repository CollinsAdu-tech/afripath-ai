import { boot } from './site.js';
import { api } from './api.js';
boot();
api.health().then((h) => {
  const n = h?.knowledgeBase?.counts?.careers;
  if (Number.isFinite(n)) document.querySelectorAll('[data-count="careers"]').forEach((el) => { el.textContent = String(n); });
}).catch(() => {});
