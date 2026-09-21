import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DISMISS_CLICK_MS,
  HAS_VALID_TOKEN,
  INPUT_DEBOUNCE_MS,
  MAPBOX_TOKEN,
  MOBILE_BREAKPOINT,
  fitPaddingFor,
} from './config';
import { useMapboxMap } from './map/useMapboxMap';
import { useOriginMarker } from './map/useOriginMarker';
import { useMapClick } from './map/useMapClick';
import { useIsochroneRender } from './map/useIsochroneRender';
import { prefersReducedMotion } from './map/motion';
import { useIsochroneQuery } from './state/useIsochroneQuery';
import { useDebouncedValue } from './state/useDebouncedValue';
import { useTheme } from './state/useTheme';
import { useCaretHint } from './state/useCaretHint';
import { encodeShareState, parseShareState } from './state/urlState';
import {
  enabledValidCount,
  padToBandCount,
  parseBands,
  visibleMinutes,
} from './state/bandEditor';
import { formatCoords, reverseGeocode } from './api/geocode';
import { SetupNotice } from './components/SetupNotice';
import { ControlPanel } from './components/ControlPanel';
import { DEFAULT_BANDS, type IsochroneQuery, type Origin, type Profile } from './types';

/*
 * Read once, at module scope, before React renders. Parsing here rather than in
 * an effect means the first render already has the shared state, so there is no
 * flash of the default view before the link is applied.
 */
const initialShare = parseShareState(window.location.search);

const initialProfile: Profile = initialShare?.profile ?? 'walking';

/*
 * The editor always has four rows, but a link can carry fewer contours. The
 * spares are seeded with plausible values and switched off below, so the
 * recipient sees exactly the sender's map rather than two empty boxes flagged
 * as errors.
 */
const initialValues: number[] = initialShare
  ? padToBandCount(initialShare.minutes, DEFAULT_BANDS[initialProfile])
  : DEFAULT_BANDS[initialProfile];

const initialInputs: string[] = initialValues.map(String);

const initialEnabled: boolean[] = initialValues.map((minutes, index) => {
  if (!initialShare) return true;
  // Seeded spares sit past the end of the shared set and start off.
  if (index >= initialShare.minutes.length) return false;
  return initialShare.visible.includes(minutes);
});

/*
 * Derived the same way the running app derives it, so mounting from a link does
 * not immediately supersede its own first request with an identical one.
 */
const initialQuery: IsochroneQuery | null = initialShare
  ? {
      origin: initialShare.origin,
      profile: initialProfile,
      minutes: parseBands(initialInputs).requestMinutes,
    }
  : null;

/** Would these two produce the same request? */
function sameQuery(a: IsochroneQuery | null, b: IsochroneQuery | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.origin.lon === b.origin.lon &&
    a.origin.lat === b.origin.lat &&
    a.profile === b.profile &&
    a.minutes.join(',') === b.minutes.join(',')
  );
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  /*
   * Read before the map is constructed, because the basemap style is chosen at
   * construction time. Switching afterwards works, but starting on the wrong
   * one would mean a visible restyle on every load in dark mode.
   */
  const { preference: themePreference, resolved: theme, cycle: cycleTheme } = useTheme();

  const { map, ready, styleEpoch, styleReady } = useMapboxMap(containerRef, theme);

  /*
   * One source of truth per input, no draft/submitted split. The map follows
   * the form.
   *
   * Only the minute fields are debounced. Choosing a profile or a location is a
   * discrete act with no half-typed state, so delaying those would add lag for
   * nothing — whereas typing `45` without a delay asks for a 4-minute contour
   * on the way to the 45-minute one.
   */
  const [origin, setOrigin] = useState<Origin | null>(initialShare?.origin ?? null);
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const bandInput = useDebouncedValue<string[]>(initialInputs, INPUT_DEBOUNCE_MS);

  /*
   * On/off per row, by position.
   *
   * Position survives things a value cannot: switching profile rewrites every
   * number, and editing a field changes one in place. "The fourth band is off"
   * keeps its meaning through both.
   */
  const [enabled, setEnabled] = useState<boolean[]>(initialEnabled);

  const [searchValue, setSearchValue] = useState(initialShare?.origin.label ?? '');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  /*
   * Mobile only, enforced in CSS. The panel is a top sheet below the
   * breakpoint and covers most of a phone screen, so it needs a way out of
   * the way; on desktop it is a small card with the map beside it.
   *
   * It starts collapsed on a phone. Opening onto a full-height panel puts the
   * controls first and the map — the thing the app is for — out of sight, and
   * every path to a result (search, pin, map tap) collapses the sheet anyway,
   * so the expanded state was a stop on the way out rather than a destination.
   *
   * Evaluated once, not tracked. A phone that is rotated mid-session keeps
   * whatever state the person has since chosen, which is the polite reading of
   * a rotation; re-collapsing on every resize would fight a deliberate open.
   */
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const panelRef = useRef<HTMLDivElement>(null);
  /*
   * The header plus the search field: everything that stays on screen when the
   * mobile sheet collapses. The camera frames against this rather than the full
   * sheet — see `fitPaddingFor`.
   */
  const stickyRef = useRef<HTMLDivElement>(null);
  /*
   * The pin button, which is where focus goes when the map label is cleared.
   * See `handleClear`.
   */
  const pinButtonRef = useRef<HTMLButtonElement>(null);
  /*
   * Guards against out-of-order reverse-geocode results. Two quick map clicks
   * can resolve in either order, and without this the first click's place name
   * can overwrite the second's, leaving the label describing a point the marker
   * is no longer on.
   *
   * Declared up here with the other refs because `handleClear` bumps it, and
   * that has to be defined before `useOriginMarker` consumes it.
   */
  const labelSeq = useRef(0);
  /*
   * When the sheet was last dismissed by a tap outside it. Read by the map
   * click handler to tell "get out of my way" apart from "put the pin here".
   *
   * `-Infinity`, not 0. `performance.now()` is measured from page load, so a
   * seed of 0 means "dismissed at load" — which swallowed every map click in
   * the first half second of the app's life. The verification harness caught
   * exactly that.
   */
  const dismissedAtRef = useRef(Number.NEGATIVE_INFINITY);

  /*
   * The caret is the only way back to the settings once the sheet is
   * collapsed, and on arrival it is a small chevron with nothing to say for
   * itself. This points at it once, and then never again.
   */
  const { visible: caretHint, reveal: revealCaretHint } = useCaretHint(collapsed);

  /*
   * Measured, not assumed. The panel's height varies with the length of the
   * address and whether an error is showing, and on a phone a fixed guess left
   * the result almost entirely behind the sheet.
   */
  const getFitPadding = useCallback(
    () =>
      fitPaddingFor(
        panelRef.current?.getBoundingClientRect() ?? null,
        stickyRef.current?.getBoundingClientRect() ?? null,
        window.innerWidth,
        window.innerHeight,
      ),
    [],
  );

  /*
   * Two parses of the same rows at two different ages.
   *
   * `draftBands` is what the user is looking at, so it drives the boxes, the
   * per-row errors and the swatches. `queryBands` has settled, so it drives the
   * request and the map filter — which keeps the drawn bands and the data they
   * come from in step instead of flickering mid-keystroke.
   */
  const draftBands = useMemo(() => parseBands(bandInput.draft), [bandInput.draft]);
  const queryBands = useMemo(() => parseBands(bandInput.value), [bandInput.value]);

  const [query, setQuery] = useState<IsochroneQuery | null>(initialQuery);

  useEffect(() => {
    /*
     * Nothing valid to ask for: hold the previous result rather than clearing.
     * A map that goes blank while you are mid-edit reads as a crash, not as an
     * empty selection.
     */
    if (!origin || queryBands.requestMinutes.length === 0) return;

    const next: IsochroneQuery = {
      origin,
      profile,
      minutes: queryBands.requestMinutes,
    };

    setQuery((prev) => (sameQuery(prev, next) ? prev : next));
  }, [origin, profile, queryBands]);

  const status = useIsochroneQuery(query);
  const data = status.kind === 'success' ? status.data : null;

  /** The band set the loaded geometry actually contains. */
  const renderedBands = useMemo(() => query?.minutes ?? [], [query]);

  const visible = useMemo(() => {
    const shown = visibleMinutes(queryBands, enabled);
    // Never allow an empty map — that reads as a bug, not as a cleared view.
    return shown.length > 0 ? shown : renderedBands;
  }, [queryBands, enabled, renderedBands]);

  /*
   * Take the pin, the isochrones and the address off the map.
   *
   * Only those. The travel mode and the band times are settings the user
   * chose, not results — resetting them would turn "clear this result" into
   * "undo my session", and there is no way to get them back.
   *
   * Everything downstream follows from the two nulls: `useOriginMarker` has a
   * null-origin branch that removes the marker and the label, a null query
   * puts `useIsochroneQuery` back to idle, and `useIsochroneRender` clears its
   * layers when the data goes away. The URL is handled by the mirror effect.
   *
   * Defined here, above `useOriginMarker`, rather than down with the other
   * handlers: `const` is not hoisted, so passing it to a hook that runs
   * earlier in the body is a ReferenceError on the first render.
   */
  const handleClear = useCallback(() => {
    /*
     * Move focus first, while the button that has it still exists. The state
     * update below unmounts the label, and focus on a detached node falls to
     * `<body>` — which strands anyone navigating by keyboard.
     *
     * The pin button rather than the search field, which is the more obvious
     * choice and the wrong one: focusing a text input raises the soft keyboard
     * on a phone, so tidying the map would immediately cover it. It also
     * behaves the same on every platform, whereas a rule conditioned on the ×
     * having focus would differ between iOS Safari, which does not focus
     * buttons on tap, and Android Chrome, which does.
     */
    pinButtonRef.current?.focus();

    labelSeq.current += 1; // a reverse geocode in flight must not re-set it
    setOrigin(null);
    setQuery(null);
    setSearchValue('');
    setLocationError(null);
  }, []);

  useOriginMarker(map, origin, handleClear);
  useIsochroneRender(
    map,
    ready,
    data,
    visible,
    renderedBands,
    theme,
    styleEpoch,
    styleReady,
    getFitPadding,
  );

  /*
   * Whether the URL currently carries state we put there.
   *
   * Without this, the branch below would strip the query string on every cold
   * start — including one that has just been handed a share link and not yet
   * produced its first query.
   */
  const hadQueryRef = useRef(query !== null);

  /*
   * Mirror state into the URL.
   *
   * This follows the query rather than the draft, so a link always reproduces
   * what is on screen and the URL is not rewritten on every keystroke.
   *
   * replaceState rather than pushState: every band toggle would otherwise add a
   * history entry, so the back button would step through toggles instead of
   * leaving the app. The tradeoff is that back exits rather than undoing, which
   * is the less surprising behaviour for a single-view tool.
   */
  useEffect(() => {
    if (!query) {
      /*
       * Cleared. The origin has to come out of the URL as well as off the map,
       * or the two disagree: reloading would bring the pin back, and a link
       * copied earlier would still resolve to a place the app is no longer
       * showing.
       */
      if (!hadQueryRef.current) return;
      hadQueryRef.current = false;
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }

    hadQueryRef.current = true;
    const qs = encodeShareState({
      origin: query.origin,
      profile: query.profile,
      minutes: query.minutes,
      visible,
    });
    window.history.replaceState(null, '', `${window.location.pathname}?${qs}`);
  }, [query, visible]);

  /*
   * On a phone the panel covers most of the screen, so choosing a location and
   * then seeing almost none of the result is the default experience. With the
   * submit button gone, the decisive moment is picking a starting point —
   * after that attention moves to the map. Desktop has room for both.
   */
  const collapseOnMobile = useCallback(() => {
    if (window.innerWidth <= MOBILE_BREAKPOINT) setCollapsed(true);
  }, []);

  const setOriginFromCoords = useCallback(
    async (lon: number, lat: number, recenter: boolean) => {
      const seq = ++labelSeq.current;
      const coordLabel = formatCoords(lon, lat);

      // Show the pin immediately; the place name is an upgrade that lands a
      // moment later rather than something to block on.
      setOrigin({ lon, lat, label: coordLabel });
      setSearchValue(coordLabel);
      setLocationError(null);

      if (recenter && map) {
        /*
         * `duration` is spread in rather than set to `undefined`, because
         * mapbox-gl checks `'duration' in options` and then does
         * `+options.duration`. A key present with an undefined value is
         * therefore NaN, not "use the default": the flight runs for NaN
         * milliseconds, sets the zoom to NaN on its first frame, and every
         * later camera call throws "failed to invert matrix" — which took the
         * whole app down with it, because a throw inside an effect unmounts
         * the tree.
         *
         * Omitting the key gets mapbox's own speed-based duration.
         */
        map.flyTo({
          center: [lon, lat],
          zoom: Math.max(map.getZoom(), 12),
          ...(prefersReducedMotion() ? { duration: 0 } : {}),
        });
      }

      const label = await reverseGeocode(lon, lat, MAPBOX_TOKEN);
      if (seq !== labelSeq.current) return; // superseded

      setOrigin({ lon, lat, label });
      setSearchValue(label);
    },
    [map],
  );

  const handleSelect = useCallback(
    (next: Origin) => {
      labelSeq.current += 1; // invalidate any in-flight reverse geocode
      setOrigin(next);
      setSearchValue(next.label);
      setLocationError(null);
      collapseOnMobile();
    },
    [collapseOnMobile],
  );

  const handleToggleBand = useCallback((index: number) => {
    setEnabled((prev) => prev.map((on, i) => (i === index ? !on : on)));
  }, []);

  const handleBandInput = useCallback(
    (index: number, value: string) => {
      bandInput.setDebounced(bandInput.draft.map((entry, i) => (i === index ? value : entry)));
    },
    [bandInput],
  );

  const handleProfileChange = useCallback(
    (next: Profile) => {
      setProfile(next);
      /*
       * Reset the values to the new profile's defaults: a 60-minute walk is not
       * a unit most people reason about, and carrying driving numbers into
       * walking would produce a set nobody chose.
       *
       * `setNow`, not `setDebounced`. The profile changes immediately, so if
       * the values arrived half a second later there would be a window where
       * the query is the new profile with the old minutes — a wasted request
       * for a combination nobody asked for.
       *
       * The on/off flags are left alone. They refer to positions, so "I don't
       * care about the outermost band" survives the change even though every
       * number underneath it is different.
       */
      bandInput.setNow(DEFAULT_BANDS[next].map(String));
    },
    [bandInput],
  );

  /*
   * Tapping outside the open sheet collapses it.
   *
   * Capture phase, so the decision is made before anything else handles the
   * gesture, and `pointerdown` rather than `click`, so the sheet gets out of
   * the way as the finger lands.
   *
   * Deliberately not `preventDefault`: a drag that starts on the map outside
   * the panel should still pan it. The tap is neutralised afterwards instead,
   * via the timestamp below.
   */
  useEffect(() => {
    if (collapsed) return;

    const onPointerDown = (event: PointerEvent) => {
      if (window.innerWidth > MOBILE_BREAKPOINT) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target)) return;

      /*
       * The search suggestions are *not* inside the panel: the listbox is
       * portaled to <body> so that no ancestor can clip it. Treating a tap on
       * a suggestion as an outside tap would collapse the sheet, unmount the
       * listbox and lose the selection before it registered.
       */
      if (target.closest('mapbox-search-listbox, [role="listbox"]')) return;

      dismissedAtRef.current = performance.now();
      setCollapsed(true);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [collapsed]);

  useMapClick(map, (lon, lat) => {
    // The tail of a dismiss gesture, not a request to move the pin.
    if (performance.now() - dismissedAtRef.current < DISMISS_CLICK_MS) return;

    /*
     * Someone tapping the map is exploring, which makes this the best moment
     * to mention that the rest of the controls are behind the caret — better
     * than the timer, which fires whether or not anyone is paying attention.
     */
    revealCaretHint();

    void setOriginFromCoords(lon, lat, false);
  });

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Location services are not available in this browser.');
      return;
    }

    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        void setOriginFromCoords(position.coords.longitude, position.coords.latitude, true);
        collapseOnMobile();
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission denied. Search or click the map instead.'
            : "Couldn't get your location. Search or click the map instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, [collapseOnMobile, setOriginFromCoords]);

  if (!HAS_VALID_TOKEN) {
    return <SetupNotice />;
  }

  return (
    <div className="app">
      <div ref={containerRef} className="map-container" />
      <ControlPanel
        panelRef={panelRef}
        stickyRef={stickyRef}
        collapsed={collapsed}
        caretHint={caretHint}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
        map={map}
        origin={origin}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSelect={handleSelect}
        onUseMyLocation={handleUseMyLocation}
        pinButtonRef={pinButtonRef}
        locating={locating}
        locationError={locationError}
        profile={profile}
        onProfileChange={handleProfileChange}
        bands={draftBands}
        enabled={enabled}
        onBandInput={handleBandInput}
        onToggleBand={handleToggleBand}
        /*
         * Toggling is gated on there being something drawn to filter, not on
         * the values being settled. Visibility is positional, so it keeps
         * meaning while a number is being edited — and disabling the switches
         * would pull them out of the keyboard tab order every time someone
         * touches a field.
         */
        canToggle={status.kind === 'success'}
        /*
         * Counted from the draft, so the last-band-standing lock matches what
         * the user can see in the form rather than a value that has not landed
         * yet.
         */
        enabledCount={enabledValidCount(draftBands, enabled)}
        /*
         * Every row unusable. The map is still showing the last good result, so
         * say so rather than leaving it looking stale for no reason.
         */
        stale={draftBands.requestMinutes.length === 0 && query !== null}
        hasResult={query !== null}
        status={status}
        themePreference={themePreference}
        theme={theme}
        onCycleTheme={cycleTheme}
      />
    </div>
  );
}

