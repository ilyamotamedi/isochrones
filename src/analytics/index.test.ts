/**
 * The gates, the queue, and the consent write-through.
 *
 * ## The trap this file was rebuilt around
 *
 * An earlier version of these tests used `vi.mock` with a factory that counted
 * SDK imports. `vi.mock` factories run **once per file** regardless of
 * `vi.resetModules()`, so the counter was shared across every case and each
 * negative test passed for the wrong reason: the count was zero because a
 * previous test had already consumed it, not because the gate held.
 *
 * Hence `vi.doMock` inside `load()`, re-registered after every reset, and
 * assertions on the queue's contents rather than on a counter.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_STORAGE_KEY, type ConsentState } from './consent';

const ID = 'G-TEST12345';
const HREF = 'https://isochrones-4f3fa.web.app/?lng=-73.89641&lat=40.74412&q=68-01+Queens+Blvd';

interface LoadOptions {
  mode?: 'advanced' | 'basic' | 'off';
  measurementId?: string;
  prod?: boolean;
  consent?: ConsentState | null;
  href?: string;
}

async function load(options: LoadOptions = {}) {
  const {
    mode = 'advanced',
    measurementId = ID,
    prod = true,
    consent = null,
    href = HREF,
  } = options;

  vi.resetModules();
  vi.stubEnv('PROD', prod);
  vi.stubEnv('DEV', !prod);

  const store = new Map<string, string>();
  if (consent) store.set(CONSENT_STORAGE_KEY, consent);

  const dataLayer: unknown[] = [];
  vi.stubGlobal('window', {
    dataLayer,
    location: { href },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  });

  /*
   * A partial mock of `config.ts`, because `ANALYTICS_MODE` is a literal
   * constant rather than an environment read — that is deliberate in the
   * source (it is a deployment decision, not a runtime one) and it means the
   * only way to exercise the other two modes is from here.
   */
  vi.doMock('../config', () => ({
    ANALYTICS_MODE: mode,
    GA_MEASUREMENT_ID: measurementId,
  }));

  const analytics = await import('./index');
  return { ...analytics, dataLayer, store };
}

function commands(dataLayer: unknown[]): unknown[][] {
  return dataLayer.map((entry) => Array.from(entry as IArguments));
}

function consentDefault(dataLayer: unknown[]): Record<string, unknown> | undefined {
  const found = commands(dataLayer).find(
    (args) => args[0] === 'consent' && args[1] === 'default',
  );
  return found?.[2] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.doUnmock('../config');
});

describe('advanced mode', () => {
  /*
   * The defining behaviour of advanced consent mode: somebody who has not
   * answered still gets the tag, and it still sends — cookielessly, because
   * `analytics_storage` is denied. That is what buys the aggregate counts.
   */
  it('installs the tag for a visitor who has not answered', async () => {
    const { startAnalytics, dataLayer } = await load();

    startAnalytics();

    expect(dataLayer.length).toBeGreaterThan(0);
    expect(consentDefault(dataLayer)?.analytics_storage).toBe('denied');
  });

  it('honours a stored grant on the very first command', async () => {
    const { startAnalytics, dataLayer } = await load({ consent: 'granted' });

    startAnalytics();

    expect(consentDefault(dataLayer)?.analytics_storage).toBe('granted');
  });

  it('honours a stored refusal', async () => {
    const { startAnalytics, dataLayer } = await load({ consent: 'denied' });

    startAnalytics();

    expect(consentDefault(dataLayer)?.analytics_storage).toBe('denied');
  });
});

describe('gates', () => {
  it('sends nothing in development', async () => {
    const { startAnalytics, dataLayer } = await load({ prod: false });

    startAnalytics();

    expect(dataLayer).toHaveLength(0);
  });

  it('sends nothing without a measurement ID', async () => {
    const { startAnalytics, analyticsConfigured, dataLayer } = await load({
      measurementId: '',
    });

    startAnalytics();

    expect(dataLayer).toHaveLength(0);
    // And there is no point asking permission for it.
    expect(analyticsConfigured()).toBe(false);
  });

  it('sends nothing when the mode is off', async () => {
    const { startAnalytics, analyticsConfigured, dataLayer } = await load({ mode: 'off' });

    startAnalytics();

    expect(dataLayer).toHaveLength(0);
    expect(analyticsConfigured()).toBe(false);
  });

  /*
   * The banner has to exist in development or it could never be worked on.
   * What must not exist in development is the tag — asserted above.
   */
  it('still offers the question in development', async () => {
    const { analyticsConfigured } = await load({ prod: false });

    expect(analyticsConfigured()).toBe(true);
  });

  it('is safe to start twice', async () => {
    const { startAnalytics, dataLayer } = await load();

    startAnalytics();
    const after = dataLayer.length;
    startAnalytics();

    expect(dataLayer.length).toBe(after);
  });
});

describe('basic mode', () => {
  it('requests nothing at all until an explicit yes', async () => {
    const { startAnalytics, dataLayer } = await load({ mode: 'basic' });

    startAnalytics();

    expect(dataLayer).toHaveLength(0);
  });

  it('stays quiet for someone who declined', async () => {
    const { startAnalytics, setAnalyticsConsent, dataLayer } = await load({ mode: 'basic' });

    startAnalytics();
    setAnalyticsConsent('denied');

    expect(dataLayer).toHaveLength(0);
  });

  it('installs the tag the moment consent is given', async () => {
    const { startAnalytics, setAnalyticsConsent, dataLayer } = await load({ mode: 'basic' });

    startAnalytics();
    setAnalyticsConsent('granted');

    expect(consentDefault(dataLayer)?.analytics_storage).toBe('granted');
  });
});

describe('recording a decision', () => {
  it('writes it down', async () => {
    const { setAnalyticsConsent, store } = await load();

    setAnalyticsConsent('denied');

    expect(store.get(CONSENT_STORAGE_KEY)).toBe('denied');
  });

  /*
   * The banner behaves identically everywhere, so a decision made in
   * development is still remembered. Only the tag is withheld.
   */
  it('writes it down in development too', async () => {
    const { setAnalyticsConsent, store, dataLayer } = await load({ prod: false });

    setAnalyticsConsent('granted');

    expect(store.get(CONSENT_STORAGE_KEY)).toBe('granted');
    expect(dataLayer).toHaveLength(0);
  });

  it('updates a running tag rather than reinstalling it', async () => {
    const { startAnalytics, setAnalyticsConsent, dataLayer } = await load();
    startAnalytics();

    setAnalyticsConsent('granted');

    const defaults = commands(dataLayer).filter(
      (args) => args[0] === 'consent' && args[1] === 'default',
    );
    expect(defaults).toHaveLength(1);

    const update = commands(dataLayer).find(
      (args) => args[0] === 'consent' && args[1] === 'update',
    );
    expect(update?.[2]).toEqual({ analytics_storage: 'granted' });
  });

  it('can be reversed', async () => {
    const { startAnalytics, setAnalyticsConsent, dataLayer } = await load({
      consent: 'granted',
    });
    startAnalytics();

    setAnalyticsConsent('denied');

    const update = commands(dataLayer).find(
      (args) => args[0] === 'consent' && args[1] === 'update',
    );
    expect(update?.[2]).toEqual({ analytics_storage: 'denied' });
  });
});

describe('the queue', () => {
  it('holds events raised before the tag is in, and keeps their order', async () => {
    const { startAnalytics, track, dataLayer } = await load();

    track({ name: 'origin_set', method: 'map_click' });
    track({ name: 'origin_cleared' });
    startAnalytics();

    const events = commands(dataLayer)
      .filter((args) => args[0] === 'event')
      .map((args) => args[1]);
    expect(events).toEqual(['origin_set', 'origin_cleared']);
  });

  it('is bounded', async () => {
    const { startAnalytics, track, dataLayer } = await load();

    for (let i = 0; i < 25; i += 1) track({ name: 'origin_cleared' });
    startAnalytics();

    const events = commands(dataLayer).filter((args) => args[0] === 'event');
    expect(events).toHaveLength(20);
  });

  it('is bypassed once the tag is in', async () => {
    const { startAnalytics, track, dataLayer } = await load();
    startAnalytics();

    track({ name: 'profile_change', profile: 'cycling' });

    expect(commands(dataLayer)).toContainEqual([
      'event',
      'profile_change',
      { profile: 'cycling' },
    ]);
  });

  it('never throws when analytics is switched off', async () => {
    const { track } = await load({ mode: 'off' });

    expect(() => track({ name: 'origin_set', method: 'search' })).not.toThrow();
  });
});

describe('page_location', () => {
  /*
   * The URL is rewritten on every query and carries the origin's coordinates
   * and street address. This is the assertion that the address never leaves
   * the browser through GA's page context.
   */
  it('is pinned to the bare path, never the share link', async () => {
    const { startAnalytics, trackPageLocation, dataLayer } = await load();
    startAnalytics();

    trackPageLocation(HREF);

    const serialised = JSON.stringify(commands(dataLayer));
    expect(serialised).not.toContain('40.74412');
    expect(serialised).not.toContain('-73.89641');
    expect(serialised.toLowerCase()).not.toContain('queens');
    expect(commands(dataLayer)).toContainEqual([
      'set',
      { page_location: 'https://isochrones-4f3fa.web.app/' },
    ]);
  });
});
