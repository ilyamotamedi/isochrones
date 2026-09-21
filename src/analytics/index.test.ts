/**
 * The gates in front of the Firebase SDK, and the queue behind them.
 *
 * `events.ts` and `consent.ts` are tested for what may be sent. This file
 * tests something different and just as easy to get wrong: whether the SDK is
 * *downloaded at all*. The README makes a specific promise — a visitor who has
 * not consented pays nothing beyond the few hundred bytes of this module — and
 * a promise about bundle cost is worth a test that can fail.
 *
 * Each gate gets its own case, so a regression names which one was removed
 * rather than just reporting that analytics loaded.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_STORAGE_KEY } from './consent';

/*
 * The counters are the actual assertion: they increment when — and only when —
 * the SDK module is really imported, which is the thing that costs a download.
 *
 * Asserting on `initializeApp` instead would be weaker. Every gate currently
 * sits in front of the dynamic import, and a refactor that moved one behind it
 * would still leave `initializeApp` uncalled while fetching the chunk anyway.
 */
const mocks = {
  appImports: 0,
  analyticsImports: 0,
  logEvent: vi.fn(),
  isSupported: vi.fn(async () => true),
};

const CONFIG = {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_MEASUREMENT_ID: 'G-TEST',
};

function fakeWindow(consent: string | null): { localStorage: Pick<Storage, 'getItem'> } {
  return {
    localStorage: {
      getItem: (key: string) => (key === CONSENT_STORAGE_KEY ? consent : null),
    },
  };
}

interface Options {
  prod?: boolean;
  config?: boolean;
  consent?: string | null;
  window?: boolean;
}

/*
 * A fresh copy of the module under a chosen environment.
 *
 * `resetModules` is not optional here: `FIREBASE_CONFIG` and `HAS_CONFIG` are
 * read at module scope, so stubbing the environment after the first import
 * would have no effect, and the module-level `logEventFn` would leak a started
 * analytics instance from one case into the next.
 *
 * `doMock` rather than the hoisted `mock`, and re-registered every time. A
 * hoisted `vi.mock` factory runs once for the whole file no matter how often
 * the registry is reset, which quietly pins the counters at whatever the first
 * case left them — every negative assertion below would then pass without
 * testing anything.
 */
async function load(options: Options = {}) {
  const { prod = true, config = true, consent = 'granted', window: hasWindow = true } = options;

  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();

  vi.doMock('firebase/app', () => {
    mocks.appImports += 1;
    return { initializeApp: () => ({}) };
  });

  vi.doMock('firebase/analytics', () => {
    mocks.analyticsImports += 1;
    return {
      getAnalytics: () => ({}),
      isSupported: mocks.isSupported,
      logEvent: mocks.logEvent,
    };
  });

  vi.stubEnv('PROD', prod);
  if (config) {
    for (const [key, value] of Object.entries(CONFIG)) vi.stubEnv(key, value);
  }
  if (hasWindow) vi.stubGlobal('window', fakeWindow(consent));

  return import('./index');
}

beforeEach(() => {
  mocks.appImports = 0;
  mocks.analyticsImports = 0;
  mocks.logEvent.mockClear();
  mocks.isSupported.mockClear();
  mocks.isSupported.mockImplementation(async () => true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('startAnalytics gates', () => {
  it('loads the SDK when every gate passes', async () => {
    const { startAnalytics } = await load();
    await startAnalytics();

    expect(mocks.appImports).toBe(1);
    expect(mocks.analyticsImports).toBe(1);
  });

  it('does not load the SDK in development', async () => {
    const { startAnalytics } = await load({ prod: false });
    await startAnalytics();

    expect(mocks.appImports).toBe(0);
    expect(mocks.analyticsImports).toBe(0);
  });

  it('does not load the SDK without Firebase config', async () => {
    const { startAnalytics } = await load({ config: false });
    await startAnalytics();

    expect(mocks.appImports).toBe(0);
  });

  /*
   * The one that matters most, and the one a well-meaning refactor is most
   * likely to drop: consent is checked *before* the dynamic import, not after.
   * Loading the SDK and then declining to call it would still be a third-party
   * request the user did not agree to.
   */
  it('does not load the SDK without consent', async () => {
    const { startAnalytics } = await load({ consent: null });
    await startAnalytics();

    expect(mocks.appImports).toBe(0);
    expect(mocks.analyticsImports).toBe(0);
  });

  it('treats a refusal as a refusal', async () => {
    const { startAnalytics } = await load({ consent: 'denied' });
    await startAnalytics();

    expect(mocks.appImports).toBe(0);
  });

  it('survives an environment with no window', async () => {
    const { startAnalytics } = await load({ window: false });
    await expect(startAnalytics()).resolves.toBeUndefined();

    expect(mocks.appImports).toBe(0);
  });

  it('only starts once, however many times it is called', async () => {
    const { startAnalytics } = await load();
    await Promise.all([startAnalytics(), startAnalytics()]);
    await startAnalytics();

    expect(mocks.appImports).toBe(1);
  });

  /*
   * `isSupported` returning false is an ordinary outcome — private browsing,
   * blocked storage — not an error, and it must not leave a half-started
   * instance behind that swallows events.
   */
  it('gives up quietly when the browser cannot support analytics', async () => {
    mocks.isSupported.mockImplementation(async () => false);

    const { startAnalytics, track } = await load();
    await startAnalytics();
    track({ name: 'share_copied' });

    expect(mocks.logEvent).not.toHaveBeenCalled();
  });
});

describe('track', () => {
  it('never throws when analytics is switched off', async () => {
    const { track } = await load({ consent: null });

    expect(() => track({ name: 'origin_set', method: 'search' })).not.toThrow();
    expect(mocks.logEvent).not.toHaveBeenCalled();
  });

  it('delivers events raised before the SDK finished loading', async () => {
    const { startAnalytics, track } = await load();

    track({ name: 'origin_set', method: 'map_click' });
    track({ name: 'origin_cleared' });
    await startAnalytics();

    expect(mocks.logEvent).toHaveBeenCalledTimes(2);
    expect(mocks.logEvent).toHaveBeenNthCalledWith(1, {}, 'origin_set', { method: 'map_click' });
    expect(mocks.logEvent).toHaveBeenNthCalledWith(2, {}, 'origin_cleared', {});
  });

  /*
   * The queue exists to cover the second before the SDK lands, not to bank a
   * session. Unbounded, a visitor who never consents would accumulate one
   * object per interaction for as long as the tab is open.
   */
  it('stops queueing once the buffer is full', async () => {
    const { startAnalytics, track } = await load();

    for (let i = 0; i < 25; i += 1) track({ name: 'origin_cleared' });
    await startAnalytics();

    expect(mocks.logEvent).toHaveBeenCalledTimes(20);
  });

  it('sends the event name without repeating it in the parameters', async () => {
    const { startAnalytics, track } = await load();
    await startAnalytics();

    track({ name: 'profile_change', profile: 'cycling' });

    expect(mocks.logEvent).toHaveBeenCalledWith({}, 'profile_change', { profile: 'cycling' });
  });
});
