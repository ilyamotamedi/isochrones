/**
 * The tag installer, tested on what it puts in the queue.
 *
 * `dataLayer` is the whole observable surface here — gtag.js is never loaded
 * in these tests and does not need to be. What matters is that the right
 * commands go in, in the right order, in the right shape; everything after
 * that is Google's problem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HREF = 'https://isochrones-4f3fa.web.app/?lng=-73.89641&lat=40.74412&q=68-01+Queens+Blvd';
const ID = 'G-TEST12345';

/** Stubs a window with nothing but a queue, and re-imports the module. */
async function load() {
  vi.resetModules();

  const dataLayer: unknown[] = [];
  vi.stubGlobal('window', { dataLayer });

  const gtag = await import('./gtag');
  return { ...gtag, dataLayer };
}

/** Each entry is an `arguments` object; this reads it as a plain array. */
function commands(dataLayer: unknown[]): unknown[][] {
  return dataLayer.map((entry) => Array.from(entry as IArguments));
}

/** The first argument of every command, in order: 'consent', 'js', … */
function verbs(dataLayer: unknown[]): unknown[] {
  return commands(dataLayer).map((args) => args[0]);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.doUnmock('./location');
});

describe('command shape', () => {
  /*
   * The bug this test exists to prevent is silent. gtag.js walks the queue
   * looking for `arguments` objects; an array is read as a legacy Tag Manager
   * push and skipped. Everything would look correct in the debugger and no
   * consent command would ever take effect.
   */
  it('pushes arguments objects, not arrays', async () => {
    const { installTag, dataLayer } = await load();

    installTag({ measurementId: ID, analyticsStorage: 'denied', href: HREF });

    expect(dataLayer.length).toBeGreaterThan(0);
    for (const entry of dataLayer) {
      expect(Array.isArray(entry)).toBe(false);
      expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]');
    }
  });

  it('creates the queue if the page has not', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {});
    const { installTag } = await import('./gtag');

    installTag({ measurementId: ID, analyticsStorage: 'denied', href: HREF });

    const queue = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
    expect(queue?.length).toBeGreaterThan(0);
  });
});

describe('installTag ordering', () => {
  /*
   * The single most important assertion in this file. Consent mode is entirely
   * a question of what the tag sees first: a `default` that arrives after
   * `config` is a `default` that arrives too late.
   */
  it('queues consent before js and config', async () => {
    const { installTag, dataLayer } = await load();

    installTag({ measurementId: ID, analyticsStorage: 'denied', href: HREF });

    const order = verbs(dataLayer);
    expect(order[0]).toBe('consent');
    expect(order.indexOf('consent')).toBeLessThan(order.indexOf('js'));
    expect(order.indexOf('consent')).toBeLessThan(order.indexOf('config'));
  });

  it('denies every advertising category, and says so before anything else', async () => {
    const { installTag, dataLayer } = await load();

    installTag({ measurementId: ID, analyticsStorage: 'denied', href: HREF });

    const [verb, stage, payload] = commands(dataLayer)[0] ?? [];
    expect(verb).toBe('consent');
    expect(stage).toBe('default');
    expect(payload).toMatchObject({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
  });

  it('carries a standing grant into the default command', async () => {
    const { installTag, dataLayer } = await load();

    installTag({ measurementId: ID, analyticsStorage: 'granted', href: HREF });

    const payload = commands(dataLayer)[0]?.[2] as Record<string, unknown>;
    expect(payload.analytics_storage).toBe('granted');

    // A yes to usage analytics is not a yes to advertising.
    expect(payload.ad_storage).toBe('denied');
  });

  it('redacts ad data', async () => {
    const { installTag, dataLayer } = await load();

    installTag({ measurementId: ID, analyticsStorage: 'denied', href: HREF });

    expect(commands(dataLayer)).toContainEqual(['set', 'ads_data_redaction', true]);
  });

  /* The whole point of `location.ts`, asserted where it reaches Google. */
  it('configures with a page_location stripped of the origin', async () => {
    const { installTag, dataLayer } = await load();

    installTag({ measurementId: ID, analyticsStorage: 'denied', href: HREF });

    const config = commands(dataLayer).find((args) => args[0] === 'config');
    expect(config?.[1]).toBe(ID);
    expect(config?.[2]).toMatchObject({
      page_location: 'https://isochrones-4f3fa.web.app/',
    });
  });

  it('installs only once', async () => {
    const { installTag, dataLayer } = await load();

    installTag({ measurementId: ID, analyticsStorage: 'denied', href: HREF });
    const after = dataLayer.length;
    installTag({ measurementId: ID, analyticsStorage: 'granted', href: HREF });

    expect(dataLayer.length).toBe(after);
  });
});

describe('commands before the tag is in', () => {
  /*
   * Not a micro-optimisation. `consent update` ahead of `consent default`
   * inverts the meaning of the pair, and an event before `config` has no
   * property to belong to. Silence is the correct behaviour.
   */
  it('are dropped rather than queued out of order', async () => {
    const { updateConsent, setPageLocation, sendEvent, dataLayer } = await load();

    updateConsent('granted');
    setPageLocation(HREF);
    sendEvent('share_copied', {});

    expect(dataLayer).toHaveLength(0);
  });
});

describe('after install', () => {
  it('updates only analytics_storage', async () => {
    const { installTag, updateConsent, dataLayer } = await load();
    installTag({ measurementId: ID, analyticsStorage: 'denied', href: HREF });

    updateConsent('granted');

    const update = commands(dataLayer).find(
      (args) => args[0] === 'consent' && args[1] === 'update',
    );
    expect(update?.[2]).toEqual({ analytics_storage: 'granted' });
  });

  it('re-states page_location without the query string', async () => {
    const { installTag, setPageLocation, dataLayer } = await load();
    installTag({ measurementId: ID, analyticsStorage: 'denied', href: 'https://x.test/' });

    setPageLocation(HREF);

    expect(commands(dataLayer)).toContainEqual([
      'set',
      { page_location: 'https://isochrones-4f3fa.web.app/' },
    ]);
  });

  it('sends events', async () => {
    const { installTag, sendEvent, dataLayer } = await load();
    installTag({ measurementId: ID, analyticsStorage: 'denied', href: HREF });

    sendEvent('profile_change', { profile: 'cycling' });

    expect(commands(dataLayer)).toContainEqual([
      'event',
      'profile_change',
      { profile: 'cycling' },
    ]);
  });
});

describe('safePageLocation', () => {
  /*
   * The backstop, tested by breaking the thing it backs up.
   *
   * `sanitiseLocation` is total, so in the real app this branch is dead code.
   * It is here for the day someone turns it into an allow-list, and a guard
   * that has never been executed is a guard nobody can trust. Mocking the
   * sanitiser into a pass-through is the only way to reach it.
   */
  it('refuses a URL the sanitiser let through', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { dataLayer: [] });
    vi.doMock('./location', () => ({ sanitiseLocation: (href: string) => href }));

    const { safePageLocation } = await import('./gtag');

    // Dev is the default in vitest, so this is the throwing path.
    expect(() => safePageLocation(HREF)).toThrow(/page_location still carries a query string/);

    // And it names what leaked, using the dispatcher's own vocabulary.
    expect(() => safePageLocation(HREF)).toThrow(/lng/);
  });

  it('truncates rather than throwing in production', async () => {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    vi.stubGlobal('window', { dataLayer: [] });
    vi.doMock('./location', () => ({ sanitiseLocation: (href: string) => href }));

    const { safePageLocation } = await import('./gtag');

    expect(safePageLocation(HREF)).toBe('https://isochrones-4f3fa.web.app/');
  });
});
