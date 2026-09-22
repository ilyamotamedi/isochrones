/**
 * Analytics: the impure edge.
 *
 * Everything with a rule in it lives next door and is pure and tested —
 * `events.ts` (what may be sent), `consent.ts` (whether it may be sent),
 * `location.ts` (what the URL is allowed to say). This file is the wiring:
 * gates, a queue, and the decision of when the tag goes in.
 *
 * The mode lives in `config.ts`, not here, because it is a deployment choice
 * rather than an implementation detail.
 */

import { ANALYTICS_MODE, GA_MEASUREMENT_ID } from '../config';
import { analyticsAllowed, readConsent, writeConsent, type ConsentState } from './consent';
import { isForbiddenParamKey, toGaParams, type AnalyticsEvent } from './events';
import { installTag, isTagInstalled, sendEvent, setPageLocation, updateConsent } from './gtag';

/*
 * Events raised before the tag is in.
 *
 * Bounded, and small on purpose. This exists so an event fired during the
 * first second is not silently dropped — not so a session's worth of activity
 * can accumulate in memory waiting for a script that may never arrive.
 */
const MAX_QUEUED = 20;
const queue: AnalyticsEvent[] = [];

/**
 * Whether there is a property to send to.
 *
 * Deliberately says nothing about the current build. A missing measurement ID
 * means clicking either button has no effect anywhere, so putting the question
 * in front of that visitor would be theatre — and worse than theatre, because
 * it teaches people that the banner is noise.
 */
export function analyticsConfigured(): boolean {
  if (ANALYTICS_MODE === 'off') return false;
  if (!GA_MEASUREMENT_ID) return false;
  if (typeof window === 'undefined') return false;
  return true;
}

/**
 * Whether this build will actually send anything.
 *
 * The extra gate over `analyticsConfigured` is production. Development gets
 * the banner and the stored decision but never the tag, so the consent flow
 * can be worked on and tested without putting a single event into the
 * property — and without 152 kB of `gtag.js` on every hot reload.
 */
function analyticsPossible(): boolean {
  return analyticsConfigured() && import.meta.env.PROD;
}

/** The decision as stored, or `unknown`. */
export function currentConsent(): ConsentState {
  if (typeof window === 'undefined') return 'unknown';
  return readConsent(window.localStorage);
}

function dispatch(event: AnalyticsEvent): void {
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

  sendEvent(event.name, params);
}

function flush(): void {
  while (queue.length > 0) {
    const queued = queue.shift();
    if (queued) dispatch(queued);
  }
}

/**
 * Installs the tag, if this build has one and this visitor should get it.
 *
 * Safe to call more than once and safe to call before a decision exists.
 *
 * In `advanced` mode the tag goes in for everyone, carrying the visitor's
 * standing answer — `denied` for anyone who has not answered, which is what
 * produces a cookieless ping rather than a tracked one. In `basic` mode there
 * is an extra gate and nothing is requested until an explicit yes.
 */
export function startAnalytics(): void {
  if (!analyticsPossible()) return;

  const granted = analyticsAllowed(currentConsent());
  if (ANALYTICS_MODE === 'basic' && !granted) return;

  installTag({
    measurementId: GA_MEASUREMENT_ID,
    analyticsStorage: granted ? 'granted' : 'denied',
    href: window.location.href,
  });

  flush();
}

/**
 * Records an answer and acts on it immediately.
 *
 * The write happens first and happens in every build, including development
 * and builds with no measurement ID, so the banner behaves the same way
 * everywhere and can be exercised locally.
 */
export function setAnalyticsConsent(state: ConsentState): void {
  if (typeof window !== 'undefined') writeConsent(window.localStorage, state);

  if (!analyticsPossible()) return;

  if (isTagInstalled()) {
    updateConsent(analyticsAllowed(state) ? 'granted' : 'denied');
    return;
  }

  /*
   * Only reachable in `basic` mode, where the tag was withheld pending this
   * answer. `startAnalytics` re-reads storage and will still decline to do
   * anything if the answer was no.
   */
  startAnalytics();
}

/**
 * Re-states the sanitised page address.
 *
 * Called whenever the app rewrites the URL, which it does on every query. See
 * `location.ts` for what is being kept out, and why it matters here more than
 * it would in most apps.
 */
export function trackPageLocation(href: string): void {
  setPageLocation(href);
}

/**
 * Records an event, if analytics is running.
 *
 * Never throws and never awaits, so call sites do not have to care whether
 * analytics exists. An event raised before the tag is in is queued; one raised
 * when analytics is switched off is dropped once the queue is full.
 */
export function track(event: AnalyticsEvent): void {
  if (isTagInstalled()) {
    dispatch(event);
    return;
  }
  if (queue.length < MAX_QUEUED) queue.push(event);
}

export type { AnalyticsEvent } from './events';
export type { ConsentState } from './consent';
