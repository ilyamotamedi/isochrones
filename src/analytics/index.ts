/**
 * Firebase Analytics, loaded late and only if it is wanted.
 *
 * Everything with a rule in it lives in `events.ts` and `consent.ts`, which are
 * pure and tested. This file is the impure edge: dynamic import, SDK handle,
 * and the queue that covers the gap between the two.
 */

import { analyticsAllowed, readConsent } from './consent';
import { isForbiddenParamKey, toGaParams, type AnalyticsEvent } from './events';

/*
 * Read straight from the environment rather than through `config.ts`.
 *
 * These are not secrets — Firebase web config is public by design, and the
 * project is identified by it on every request — but they are also not
 * interesting to the rest of the app, and putting them in `config.ts` would
 * imply they are.
 */
const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};

/** Without these two there is nothing to send to. */
const HAS_CONFIG = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.measurementId);

type LogEvent = (name: string, params: Record<string, unknown>) => void;

let logEventFn: LogEvent | null = null;
let starting = false;

/*
 * Events raised before the SDK finishes loading.
 *
 * Bounded, and small on purpose. This exists so that an event fired during the
 * first second is not silently dropped — not so that a session's worth of
 * activity can accumulate in memory waiting for a network request that may
 * never complete.
 */
const MAX_QUEUED = 20;
const queue: AnalyticsEvent[] = [];

function dispatch(event: AnalyticsEvent): void {
  if (!logEventFn) return;

  const params = toGaParams(event);

  /*
   * The second half of the guarantee in `events.ts`.
   *
   * The type system already makes this unreachable, which is exactly why it is
   * worth checking: types do not survive a cast, and this is the failure that
   * would be invisible until it showed up in someone else's console. Dev only —
   * in production, dropping the parameter beats throwing inside a handler.
   */
  for (const key of Object.keys(params)) {
    if (!isForbiddenParamKey(key)) continue;
    if (import.meta.env.DEV) {
      throw new Error(
        `Analytics parameter "${key}" looks like location data. See src/analytics/events.ts.`,
      );
    }
    delete params[key];
  }

  logEventFn(event.name, params);
}

/**
 * Starts Analytics if — and only if — it is wanted, supported and configured.
 *
 * Safe to call more than once and safe to call before consent exists; it is a
 * no-op until every condition holds.
 */
export async function startAnalytics(): Promise<void> {
  if (logEventFn || starting) return;

  /*
   * Four gates, cheapest first, and the order matters for what gets loaded.
   * Each one short-circuits before the dynamic import below, so a visitor who
   * has not consented never downloads the SDK at all — the bundle cost is
   * theirs to opt into.
   */
  if (!import.meta.env.PROD) return;
  if (!HAS_CONFIG) return;
  if (typeof window === 'undefined') return;
  if (!analyticsAllowed(readConsent(window.localStorage))) return;

  starting = true;

  try {
    const [{ initializeApp }, { getAnalytics, isSupported, logEvent }] = await Promise.all([
      import('firebase/app'),
      import('firebase/analytics'),
    ]);

    /*
     * `isSupported` rather than a try/catch around `getAnalytics`. It returns
     * false where IndexedDB or cookies are unavailable — private browsing, some
     * embedded webviews, anything with storage blocked by policy — and calling
     * `getAnalytics` in those conditions throws.
     */
    if (!(await isSupported())) return;

    const app = initializeApp(FIREBASE_CONFIG as Record<string, string>);
    const analytics = getAnalytics(app);

    logEventFn = (name, params) => {
      // The SDK's own type is a large union of known GA event names; ours is a
      // closed set that does not overlap it, and the cast is confined here.
      (logEvent as unknown as (a: unknown, n: string, p: unknown) => void)(
        analytics,
        name,
        params,
      );
    };

    while (queue.length > 0) {
      const queued = queue.shift();
      if (queued) dispatch(queued);
    }
  } catch {
    /*
     * A blocked or failed analytics load is not an application error. Ad
     * blockers make this an ordinary outcome, not an exceptional one, and it
     * must never reach the user.
     */
  } finally {
    starting = false;
  }
}

/**
 * Records an event, if analytics is running.
 *
 * Never throws and never awaits, so call sites do not have to care whether
 * analytics exists. An event raised before the SDK is ready is queued; one
 * raised when analytics is switched off is dropped.
 */
export function track(event: AnalyticsEvent): void {
  if (logEventFn) {
    dispatch(event);
    return;
  }
  if (queue.length < MAX_QUEUED) queue.push(event);
}

export type { AnalyticsEvent } from './events';
