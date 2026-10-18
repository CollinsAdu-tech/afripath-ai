import { useId, useState, type ReactNode } from 'react';
import { Reveal } from './ui';

export interface FaqItem { q: string; a: ReactNode }

export function Faq({ items, defaultOpen = 0, animate = true }: { items: FaqItem[]; defaultOpen?: number | null; animate?: boolean }) {
  const [open, setOpen] = useState<Set<number>>(new Set(defaultOpen === null ? [] : [defaultOpen]));
  const base = useId();
  const toggle = (i: number) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <div className="faq">
      {items.map((it, i) => {
        const isOpen = open.has(i);
        const body = (
          <>
            <button className="faq-q" type="button" aria-expanded={isOpen} aria-controls={`${base}-${i}`} onClick={() => toggle(i)}>
              <span>{it.q}</span><span className="tile" aria-hidden="true" />
            </button>
            <div className="faq-a" id={`${base}-${i}`} role="region"><div><p>{it.a}</p></div></div>
          </>
        );
        const cls = `faq-item${isOpen ? ' open' : ''}`;
        return animate ? <Reveal key={it.q} delay={i * 0.06} className={cls}>{body}</Reveal> : <div key={it.q} className={cls}>{body}</div>;
      })}
    </div>
  );
}
