/**
 * Every analytics event the app can send, and the only parameters it may carry.
 *
 * No React, no Firebase, no DOM — the rules are the part worth testing, and
 * they are the part with a privacy consequence if they are wrong.
 *
 * ## Why this is a closed union rather than a `logEvent(name, params)` wrapper
 *
 * The risk with analytics on a map is not that someone sets out to exfiltrate
 * a location. It is that a year from now, somebody debugging a routing problem
 * adds `{ lat, lon }` to an event because it would be useful, and nobody
 * notices in review. Where a person is — especially via "use my location" — is
 * personal data, and this app currently keeps it in the tab.
 *
 * So the call sites cannot pass free-form parameters: the union below is the
 * whole vocabulary, `PARAM_ALLOW_LIST` is enforced by a test, and adding a
 * coordinate means editing this file and tripping that test.
 */

import type { Profile } from '../types';

/** How the origin came to be set. Deliberately not *where*. */
export type OriginMethod = 'search' | 'geolocate' | 'map_click' | 'share_link';

export type AnalyticsEvent =
  | { name: 'origin_set'; method: OriginMethod }
  | { name: 'origin_cleared' }
  | { name: 'profile_change'; profile: Profile }
  | { name: 'band_edit'; index: number; enabled: boolean }
  | { name: 'share_copied' }
  | { name: 'isochrone_error'; code: string; retryable: boolean };

/**
 * The complete set of parameter keys that may reach GA.
 *
 * Asserted against the union in `events.test.ts`. A new key has to be added
 * here deliberately, which is the moment to ask whether it should exist.
 */
export const PARAM_ALLOW_LIST: readonly string[] = [
  'method',
  'profile',
  'index',
  'enabled',
  'code',
  'retryable',
];

/**
 * Keys that must never appear, checked at runtime in development.
 *
 * Redundant with the type system, and that is the point: the type system does
 * not survive a `as any` or a JavaScript call site, and this is the failure
 * worth catching twice.
 */
const FORBIDDEN_FRAGMENTS: readonly string[] = [
  'lat',
  'lon',
  'lng',
  'coord',
  'address',
  'label',
  'query',
  'location',
  'place',
];

export function isForbiddenParamKey(key: string): boolean {
  const lower = key.toLowerCase();
  return FORBIDDEN_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

/**
 * Splits an event into the name GA wants and the parameters that go with it.
 *
 * Returns a plain object rather than spreading the event, so the discriminant
 * never leaks into the payload as a redundant `name` parameter.
 */
export function toGaParams(event: AnalyticsEvent): Record<string, string | number | boolean> {
  switch (event.name) {
    case 'origin_set':
      return { method: event.method };
    case 'origin_cleared':
      return {};
    case 'profile_change':
      return { profile: event.profile };
    case 'band_edit':
      return { index: event.index, enabled: event.enabled };
    case 'share_copied':
      return {};
    case 'isochrone_error':
      return { code: event.code, retryable: event.retryable };
  }
}
