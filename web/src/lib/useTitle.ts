import { useEffect } from 'react';

export const SITE = 'AfriPath AI';

/** Sets the browser tab title for the current page. */
export function useTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${SITE} — ${title}` : SITE;
  }, [title]);
}
