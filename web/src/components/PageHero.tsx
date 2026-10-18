import type { ReactNode } from 'react';
import { Accent, Reveal } from './ui';
import type { TitlePart } from '../survey/model';

export function Title({ parts }: { parts: TitlePart[] }) {
  return <>{parts.map((p, i) => (typeof p === 'string' ? p : <Accent key={i}>{p.accent}</Accent>))}</>;
}

/** The shared top-of-page block: a pill, one h1 with an accent word, and an optional lead and extra row. */
export function PageHero({ pill, title, lead, children }: { pill: ReactNode; title: TitlePart[]; lead?: ReactNode; children?: ReactNode }) {
  return (
    <section className="page-hero"><div className="wrap">
      <Reveal as="span" className="pill">{pill}</Reveal>
      <Reveal as="h1" delay={0.08} className="display h-xl"><Title parts={title} /></Reveal>
      {lead && <Reveal as="p" delay={0.16} className="lead">{lead}</Reveal>}
      {children}
    </div></section>
  );
}
