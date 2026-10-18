import { useEffect, useState, type ReactNode } from 'react';
import { Reveal } from './ui';

/** A photo slot: shows a labelled placeholder until the image file exists in public/img/. */
export function Photo({ src, alt, label, hint, className = '', delay = 0 }: { src: string; alt: string; label: string; hint?: ReactNode; className?: string; delay?: number }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => { if (live) setOk(true); };
    img.src = src;
    return () => { live = false; };
  }, [src]);
  return (
    <Reveal pop delay={delay} className={`photo ${className}${ok ? ' has-img' : ''}`}>
      {ok && <img src={src} alt={alt} loading="lazy" decoding="async" />}
      <div className="ph"><b>{label}</b>{hint ?? <>Add <code>public{src}</code></>}</div>
    </Reveal>
  );
}

/** A transparent cut-out image that only appears if the file exists (no placeholder). */
export function Cut({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => { if (live) setOk(true); };
    img.src = src;
    return () => { live = false; };
  }, [src]);
  return <div className={`cut ${className}${ok ? ' has-img' : ''}`}>{ok && <img src={src} alt={alt} loading="lazy" />}</div>;
}
