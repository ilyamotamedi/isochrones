/**
 * The Google tag, installed by hand.
 *
 * ## Why not the Firebase SDK
 *
 * `firebase/analytics` was the obvious route and it was tried first. It calls
 * `installations.getId()` unconditionally on start — verified in the installed
 * source, `@firebase/analytics` v0.10.25, not inferred from documentation —
 * which writes a persistent Firebase Installation ID to IndexedDB and
 * registers it with Google. For someone who declined. Consent mode governs
 * gtag's cookies; it has nothing to say about that identifier.
 *
 * So the tag is installed directly. It costs a file of plumbing and saves the
 * `firebase` dependency, three lazy chunks, and a persistent identifier we had
 * no right to create.
 *
 * ## Why the commands are queued before the script exists
 *
 * `gtag` is `dataLayer.push(arguments)` and nothing more. The script, when it
 * finally arrives, reads the queue from the beginning. That is what makes
 * consent mode work at all: `consent default` has to be the first thing the
 * tag ever sees, and it can be pushed long before the tag could possibly have
 * loaded.
 */

import { isForbiddenParamKey } from './events';
import { sanitiseLocation } from './location';

/** What `analytics_storage` may be set to. There is no third value. */
export type ConsentSignal = 'granted' | 'denied';

const TAG_ORIGIN = 'https://www.googletagmanager.com/gtag/js';

interface TaggedWindow extends Window {
  dataLayer?: unknown[];
}

function dataLayer(): unknown[] {
  const w = window as TaggedWindow;
  w.dataLayer ??= [];
  return w.dataLayer;
}

/**
 * Pushes the `arguments` object — deliberately, not as a copied idiom.
 *
 * gtag.js walks the queue looking for `arguments` objects and treats anything
 * else as a legacy Tag Manager push. `dataLayer.push(['consent', 'default',
 * {…}])` therefore looks like reasonable code, runs without error, and
 * silently does nothing. Hence the old-style function with no parameters.
 */
function pushCommand(): void {
  dataLayer().push(arguments);
}

/** Typed front door to `pushCommand`. The cast is confined to this line. */
export function gtag(...args: unknown[]): void {
  (pushCommand as unknown as (...a: unknown[]) => void)(...args);
}

/**
 * The URL as GA is allowed to see it, checked on the way out.
 *
 * `sanitiseLocation` already removes the query string, so the branch below is
 * unreachable today. It exists because the sanitiser is one edit away from
 * becoming an allow-list — that is the natural "improvement" someone makes
 * when they want to keep one harmless parameter — and the cost of getting that
 * edit slightly wrong is a home address in an analytics pipeline. This is the
 * same belt and braces the event dispatcher applies to parameter keys, using
 * the same `isForbiddenParamKey`.
 */
export function safePageLocation(href: string): string {
  const clean = sanitiseLocation(href);

  const cut = clean.search(/[?#]/);
  if (cut === -1) return clean;

  if (import.meta.env.DEV) {
    const leaked = [...new URL(clean).searchParams.keys()].filter(isForbiddenParamKey);
    throw new Error(
      `page_location still carries a query string${
        leaked.length > 0 ? ` including ${leaked.join(', ')}` : ''
      }: ${clean}. See src/analytics/location.ts.`,
    );
  }

  return clean.slice(0, cut);
}

let installed = false;

/** Whether the queue has been primed and the script requested. */
export function isTagInstalled(): boolean {
  return installed;
}

export interface InstallOptions {
  measurementId: string;
  /**
   * The decision as it stands right now, read from storage before anything is
   * pushed. Not a placeholder to be corrected a moment later: a returning
   * visitor's answer belongs in the `default` command, so their very first
   * ping already reflects it.
   */
  analyticsStorage: ConsentSignal;
  /** Sanitised here, not by the caller. */
  href: string;
}

/**
 * Primes the queue and requests the script. Idempotent.
 *
 * Order is the whole of consent mode, so the steps are spelled out rather than
 * grouped.
 */
export function installTag({ measurementId, analyticsStorage, href }: InstallOptions): void {
  if (installed) return;
  installed = true;

  /*
   * 1. Consent first — before `js`, before `config`, before the script tag.
   *
   * Advertising storage is denied here and granted nowhere. This app does no
   * advertising, so there is no version of this where asking would be honest,
   * and `updateConsent` below deliberately mentions only `analytics_storage`.
   *
   * No `wait_for_update`. Google's examples include it because they assume the
   * stored decision arrives asynchronously from a consent platform; ours is a
   * synchronous `localStorage` read that has already happened by this line, so
   * the only thing it would buy is a delay on everybody's first ping.
   */
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: analyticsStorage,
  });

  // 2. Belt and braces: strip ad identifiers from the requests themselves.
  gtag('set', 'ads_data_redaction', true);

  // 3. Then, and only then, the tag.
  gtag('js', new Date());
  gtag('config', measurementId, {
    page_location: safePageLocation(href),
    send_page_view: true,
  });

  loadScript(measurementId);
}

function loadScript(measurementId: string): void {
  /*
   * Tests run in node, where there is a queue to inspect but no head to append
   * to. The queue is the part with the rules in it.
   */
  if (typeof document === 'undefined') return;

  const src = `${TAG_ORIGIN}?id=${encodeURIComponent(measurementId)}`;
  if (document.querySelector(`script[src="${src}"]`)) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = src;

  /*
   * No error handler. An ad blocker refusing this request is an ordinary
   * outcome on a public site, not an exceptional one, and there is nothing
   * useful to do about it: events go on being pushed to a queue nobody reads,
   * which is exactly the right behaviour.
   */
  document.head.append(script);
}

/**
 * Records a change of mind.
 *
 * Only `analytics_storage` moves. The advertising categories were denied in
 * the `default` command and stay there; granting them because someone said yes
 * to "usage analytics" would be answering a question they were not asked.
 */
export function updateConsent(signal: ConsentSignal): void {
  if (!installed) return;
  gtag('consent', 'update', { analytics_storage: signal });
}

/**
 * Re-states the sanitised URL after the app rewrites it.
 *
 * The app calls `history.replaceState` on every query, and GA4's Enhanced
 * Measurement can be configured to treat that as a page view. Pinning
 * `page_location` here means that even where it is, the page view it sends is
 * clean.
 */
export function setPageLocation(href: string): void {
  if (!installed) return;
  gtag('set', { page_location: safePageLocation(href) });
}

export function sendEvent(name: string, params: Record<string, unknown>): void {
  if (!installed) return;
  gtag('event', name, params);
}
