/**
 * Whether the user has agreed to analytics.
 *
 * Follows the same shape as `state/theme.ts`: pure, storage injected, and
 * tolerant of a `localStorage` that throws. The difference is which way it
 * fails.
 *
 * `theme.ts` fails *open* — a storage error falls back to a working default,
 * because a missing preference is visible and correctable. This fails *closed*:
 * if we cannot read a decision, we do not have one, and the absence of consent
 * is not consent. That asymmetry is deliberate and is the whole reason this is
 * a separate module rather than a boolean in `config.ts`.
 */

export const CONSENT_STORAGE_KEY = 'isochrones:analytics-consent';

/**
 * Three states, not two.
 *
 * `unknown` is distinct from `denied` because they mean different things to the
 * UI: one should raise the question, the other must never raise it again.
 * Collapsing them into a boolean is how consent banners end up re-appearing on
 * every visit for people who already said no.
 */
export type ConsentState = 'unknown' | 'granted' | 'denied';

const STATES: readonly ConsentState[] = ['unknown', 'granted', 'denied'];

export function parseConsent(raw: string | null | undefined): ConsentState {
  return STATES.includes(raw as ConsentState) ? (raw as ConsentState) : 'unknown';
}

export function readConsent(storage: Pick<Storage, 'getItem'>): ConsentState {
  try {
    return parseConsent(storage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    // No readable decision is not a decision.
    return 'unknown';
  }
}

export function writeConsent(
  storage: Pick<Storage, 'setItem'>,
  state: ConsentState,
): void {
  try {
    storage.setItem(CONSENT_STORAGE_KEY, state);
  } catch {
    /*
     * Not recording the answer is survivable — the question gets asked again.
     * Throwing here, in the handler for a consent button, would not be.
     */
  }
}

/** The single gate. Analytics runs only for an explicit yes. */
export function analyticsAllowed(state: ConsentState): boolean {
  return state === 'granted';
}
