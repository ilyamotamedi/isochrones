/**
 * When to ask about analytics, and what to do with the answer.
 *
 * Split out of `App.tsx` because it is a small state machine with a timer in
 * it, and because the rule it enforces — ask once, never again, but always
 * allow a change of mind — is the part a reviewer should be able to read
 * without scrolling past six hundred lines of map wiring.
 */

import { useCallback, useEffect, useState } from 'react';
import { analyticsConfigured, currentConsent, setAnalyticsConsent } from '../analytics';
import type { ConsentState } from '../analytics/consent';
import { CONSENT_BANNER_DELAY_MS } from '../config';

export interface Consent {
  /** Whether the banner should be on screen right now. */
  bannerOpen: boolean;
  /** Records an answer, dismisses the banner, and tells analytics. */
  decide: (state: ConsentState) => void;
  /** Brings the banner back so the answer can be changed. */
  reopen: () => void;
  /** Whether there is any point offering the reopen affordance. */
  available: boolean;
}

export function useConsent(): Consent {
  /*
   * Read once, lazily. `currentConsent` touches localStorage, which can throw
   * behind strict privacy settings — it handles that itself and returns
   * `unknown`, which is the safe answer.
   */
  const [decided, setDecided] = useState<boolean>(() => currentConsent() !== 'unknown');
  const [bannerOpen, setBannerOpen] = useState(false);

  const available = analyticsConfigured();

  /*
   * The delay is the whole reason this is an effect rather than an initial
   * state. See `CONSENT_BANNER_DELAY_MS`: the first moment on the page should
   * be a map.
   *
   * StrictMode runs this twice in development; the cleanup clears the first
   * timer, so the banner still appears exactly once.
   */
  useEffect(() => {
    if (!available || decided) return;

    const handle = window.setTimeout(() => setBannerOpen(true), CONSENT_BANNER_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [available, decided]);

  const decide = useCallback((state: ConsentState) => {
    /*
     * Storage and the tag first, screen second. If something throws on the way
     * to `localStorage` the banner has not yet been dismissed, so the question
     * gets asked again — which is the right failure, because an answer we
     * could not record is not an answer.
     */
    setAnalyticsConsent(state);
    setDecided(state !== 'unknown');
    setBannerOpen(false);
  }, []);

  const reopen = useCallback(() => setBannerOpen(true), []);

  return { bannerOpen, decide, reopen, available };
}
