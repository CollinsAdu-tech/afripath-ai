import { createElement, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Arrow } from './Icons';
import { useReveal } from '../lib/useReveal';

type Tag = 'div' | 'section' | 'article' | 'h1' | 'h2' | 'p' | 'span' | 'ul' | 'footer' | 'header' | 'li';

/** Fades and slides its content in once it scrolls into view. `delay` is in seconds. */
export function Reveal({ as = 'div', delay = 0, pop = false, className = '', style, children, ...rest }:
  { as?: Tag; delay?: number; pop?: boolean; className?: string; style?: CSSProperties; children?: ReactNode } & HTMLAttributes<HTMLElement>) {
  const [ref, seen] = useReveal<HTMLElement>();
  const cls = [pop ? 'pop' : 'reveal', seen ? 'in' : '', className].filter(Boolean).join(' ');
  return createElement(as, { ref, className: cls, style: { ...(delay ? { '--d': `${delay}s` } : null), ...style } as CSSProperties, ...rest }, children);
}

/** The green, tilted accent word with the hand-drawn orange underline and sparks. */
export function Accent({ children }: { children: ReactNode }) {
  const [ref, seen] = useReveal<HTMLSpanElement>();
  return <span ref={ref} className={`accent${seen ? ' in' : ''}`}>{children}</span>;
}

export function Pill({ children, tone, dot = true, className = '' }: { children: ReactNode; tone?: 'plain' | 'lime' | 'blue' | 'peach'; dot?: boolean; className?: string }) {
  return <span className={['pill', tone && `pill--${tone}`, !dot && 'pill--noDot', className].filter(Boolean).join(' ')}>{children}</span>;
}

export type TileTone = 'blue' | 'lime' | 'pink' | 'peach';
export function Tile({ children, tone = 'blue' }: { children?: ReactNode; tone?: TileTone }) {
  return <span className={`tile${tone === 'blue' ? '' : ` tile--${tone}`}`} aria-hidden={typeof children === 'string' ? undefined : true}>{children}</span>;
}

type BtnProps = { to: string; variant?: 'primary' | 'ink' | 'steel' | 'ghost' | 'plain'; size?: 'lg'; arrow?: boolean; children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLAnchorElement>, 'className'>;
/** A router link styled as one of the pill buttons. */
export function LinkButton({ to, variant = 'plain', size, arrow, children, className = '', ...rest }: BtnProps) {
  const cls = ['btn', variant !== 'plain' && `btn--${variant}`, size && `btn--${size}`, className].filter(Boolean).join(' ');
  return <Link to={to} className={cls} {...rest}>{children}{arrow && <span className="arrow" aria-hidden="true"><Arrow width={18} height={18} /></span>}</Link>;
}

export function Spinner({ label }: { label: string }) {
  return <div className="status-block"><div className="spinner" role="status" aria-label={label} /></div>;
}

export function ProblemPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel panel--peach stack" role="alert">
      <h2 className="display h-md">{title}</h2>{children}
    </div>
  );
}

/** A router link that reveals itself on scroll (used where the link itself is the styled card). */
export function RevealLink({ to, delay = 0, className = '', children }: { to: string; delay?: number; className?: string; children: ReactNode }) {
  const [ref, seen] = useReveal<HTMLAnchorElement>();
  return <Link ref={ref} to={to} className={['reveal', seen && 'in', className].filter(Boolean).join(' ')} style={delay ? ({ '--d': `${delay}s` } as CSSProperties) : undefined}>{children}</Link>;
}
