import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/**
 * Whether the visitor asked for less motion. On the server, and while the browser is hydrating
 * the server's page, this is false: the first render then matches the HTML it was sent, and the
 * real answer follows straight after. (A hook that answered at once would render different
 * markup on the client than the server sent, which React reports as a hydration error.)
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
