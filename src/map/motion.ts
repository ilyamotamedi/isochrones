/**
 * Motion preference, read at the moment it is needed.
 *
 * Not cached: the setting can be changed while the page is open, and a value
 * captured at module load would ignore that for the rest of the session.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
