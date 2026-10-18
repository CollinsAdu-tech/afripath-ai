import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Arrow = (p: P) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const Check = (p: P) => (<svg viewBox="0 0 24 24" aria-hidden="true" {...p}><circle cx="12" cy="12" r="12" fill="#1d3626" /><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>);
export const Pencil = (p: P) => (<svg viewBox="0 0 24 24" {...stroke} aria-hidden="true" {...p}><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19z" /><path d="M14.5 6.5l3 3" /></svg>);
export const Book = (p: P) => (<svg viewBox="0 0 24 24" {...stroke} aria-hidden="true" {...p}><path d="M3 5.5C5.5 4.5 9 4.5 12 6c3-1.5 6.5-1.5 9-.5V19c-2.5-1-6-1-9 .5-3-1.5-6.5-1.5-9-.5z" /><path d="M12 6v13.5" /></svg>);
export const Notes = (p: P) => (<svg viewBox="0 0 24 24" {...stroke} aria-hidden="true" {...p}><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" /></svg>);
export const Cap = (p: P) => (<svg viewBox="0 0 24 24" {...stroke} aria-hidden="true" {...p}><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5" /><path d="M22 9v6" /></svg>);

export const Logo = (p: P) => (
  <svg viewBox="0 0 40 40" aria-hidden="true" {...p}>
    <path d="M3 12l9-4v24l-9 4z" fill="#2f8fd6" /><path d="M12 8l9 4v24l-9-4z" fill="#58b6ee" /><path d="M21 12l9-4v24l-9 4z" fill="#2f8fd6" />
    <path d="M29 2.5c-3.6 0-6.5 2.8-6.5 6.3 0 4.6 6.5 11 6.5 11s6.5-6.4 6.5-11c0-3.5-2.9-6.3-6.5-6.3z" fill="#2347e8" /><circle cx="29" cy="8.8" r="2.4" fill="#fff" />
  </svg>
);

/** Two rows of rounded hills along the bottom of the footer. */
export function Hills() {
  const row = (fill: string, step: number, off: number, base: number) => {
    const out = [];
    for (let i = 0, x = off; x < 1260; i += 1, x += step) out.push(<circle key={`${fill}${i}`} cx={x} cy={base + ((i * 29) % 18)} r={50 + ((i * 37) % 26)} fill={fill} />);
    return out;
  };
  return (
    <svg viewBox="0 0 1200 110" preserveAspectRatio="none" aria-hidden="true">
      {row('#4b8463', 92, 10, 70)}{row('#3d7050', 118, 60, 96)}<rect y="96" width="1200" height="14" fill="#3d7050" />
    </svg>
  );
}

export const Notebook = (p: P) => (
  <svg viewBox="0 0 80 90" aria-hidden="true" {...p}>
    <g transform="rotate(-18 40 45)"><rect x="12" y="8" width="52" height="70" rx="5" fill="#fbf6e8" stroke="#e0a63a" strokeWidth={4} />
      <g stroke="#3b2b21" strokeWidth={3} strokeLinecap="round"><path d="M18 18h-4M18 26h-4M18 34h-4M18 42h-4M18 50h-4M18 58h-4M18 66h-4" /></g>
      <g stroke="#c9d3df" strokeWidth={2}><path d="M26 20h30M26 30h30M26 40h30M26 50h30M26 60h22" /></g></g>
  </svg>
);
export const Trail = (p: P) => (
  <svg viewBox="0 0 120 120" aria-hidden="true" {...p}><path d="M8 4c-14 20 20 28 22 40s-18 10 0 30 70 22 90 40" fill="none" stroke="#7d8a7a" strokeWidth={1.6} strokeDasharray="4 5" strokeLinecap="round" /></svg>
);
