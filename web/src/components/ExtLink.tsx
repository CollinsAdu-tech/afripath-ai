import type { ReactNode } from 'react';
import { safeUrl } from '../lib/safeUrl';

/** A link to someone else's site. Unsafe or missing URLs render as plain text, never as a link. */
export function ExtLink({ url, children, className = 'link' }: { url: string | null | undefined; children: ReactNode; className?: string }) {
  const href = safeUrl(url);
  if (!href) return <>{children}</>;
  return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> (opens in a new tab)</span></a>;
}
