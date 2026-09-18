import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HAS_VALID_TOKEN, MAPBOX_TOKEN } from './config';
import { useMapboxMap } from './map/useMapboxMap';
import { useOriginMarker } from './map/useOriginMarker';
import { useMapClick } from './map/useMapClick';
import { useIsochroneRender } from './map/useIsochroneRender';
import { useIsochroneQuery } from './state/useIsochroneQuery';
import { encodeShareState, parseShareState } from './state/urlState';
import { parseBandInputs, remapIndices, suggestNextBand } from './state/bandEditor';
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
const initialBands: number[] = initialShare?.minutes ?? DEFAULT_BANDS[initialProfile];

/*
 * A shared link is already a submitted result — the recipient should see the
 * map, not a form waiting to be run.
 */
const initialQuery: IsochroneQuery | null = initialShare
  ? { origin: initialShare.origin, profile: initialProfile, minutes: initialBands }
  : null;

/*
 * The URL carries visible *values* because that is self-describing to anyone
 * reading the link, but visibility is tracked internally by row position so it
 * can survive the values themselves changing. Convert once, here.
 */
const initialHidden: Set<number> = new Set(
  initialShare
    ? initialBands
        .map((minutes, index) => (initialShare.visible.includes(minutes) ? -1 : index))
        .filter((index) => index >= 0)
    : [],
);

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, ready } = useMapboxMap(containerRef);

  /*
   * State is split in two.
   *
   * `draft*` is what the form holds; `submitted` is what the map shows. Nothing
   * is fetched until the user submits, so a location and a mode can be chosen
   * together and cost one request rather than two.
   *
   * Band *visibility* is deliberately not part of this split. It filters data
   * already on the client, so it applies immediately and never waits for a
   * submit it does not need.
   */
  const [draftOrigin, setDraftOrigin] = useState<Origin | null>(initialShare?.origin ?? null);
  const [draftProfile, setDraftProfile] = useState<Profile>(initialProfile);
  const [draftBands, setDraftBands] = useState<string[]>(() => initialBands.map(String));

  const [submitted, setSubmitted] = useState<IsochroneQuery | null>(initialQuery);

  const [searchValue, setSearchValue] = useState(initialShare?.origin.label ?? '');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  /*
   * Hidden bands are stored as row indices, not minute values.
   *
   * Position survives things a value cannot: switching profile rewrites every
   * number, and editing a field changes one in place. Tracking "the third band
   * is hidden" keeps the user's intent intact through both.
   */
  const [hidden, setHidden] = useState<Set<number>>(initialHidden);

  const parsedBands = useMemo(() => parseBandInputs(draftBands), [draftBands]);

  const status = useIsochroneQuery(submitted);
  const data = status.kind === 'success' ? status.data : null;

  const renderedBands = useMemo(() => submitted?.minutes ?? [], [submitted]);

  const visible = useMemo(() => {
    const shown = renderedBands.filter((_, index) => !hidden.has(index));
    // Never allow an empty map — that reads as a bug, not as a cleared view.
    return shown.length > 0 ? shown : renderedBands;
  }, [renderedBands, hidden]);

  /*
   * Has the form moved on from what is drawn? Compared against the submitted
   * query rather than tracked with a flag, so undoing an edit by hand correctly
   * returns the form to a clean state.
   */
  const dirty = useMemo(() => {
    if (!draftOrigin) return false;
    if (!submitted) return true;
    if (!parsedBands.ok) return true;

    return (
      submitted.origin.lon !== draftOrigin.lon ||
      submitted.origin.lat !== draftOrigin.lat ||
      submitted.profile !== draftProfile ||
      submitted.minutes.join(',') !== parsedBands.values.join(',')
    );
  }, [draftOrigin, draftProfile, parsedBands, submitted]);

  useOriginMarker(map, draftOrigin);
  useIsochroneRender(map, ready, data, visible, renderedBands);

  /*
   * Mirror state into the URL.
   *
   * This follows the *submitted* query, not the draft. A share link should
   * always reproduce what is on screen, and mirroring the draft would rewrite
   * the URL on every keystroke in a minute field.
   *
   * replaceState rather than pushState: every band toggle would otherwise add a
   * history entry, so the back button would step through toggles instead of
   * leaving the app. The tradeoff is that back exits rather than undoing, which
   * is the less surprising behaviour for a single-view tool.
   */
  useEffect(() => {
    if (!submitted) return;
    const qs = encodeShareState({
      origin: submitted.origin,
      profile: submitted.profile,
      minutes: submitted.minutes,
      visible,
    });
    window.history.replaceState(null, '', `${window.location.pathname}?${qs}`);
  }, [submitted, visible]);

  /*
   * Guards against out-of-order reverse-geocode results. Two quick map clicks
   * can resolve in either order, and without this the first click's place name
   * can overwrite the second's, leaving the label describing a point the marker
   * is no longer on.
   */
  const labelSeq = useRef(0);

  const setOriginFromCoords = useCallback(
    async (lon: number, lat: number, recenter: boolean) => {
      const seq = ++labelSeq.current;
      const coordLabel = formatCoords(lon, lat);

      // Show the pin immediately; the place name is an upgrade that lands a
      // moment later rather than something to block on.
      setDraftOrigin({ lon, lat, label: coordLabel });
      setSearchValue(coordLabel);
      setLocationError(null);

      if (recenter && map) {
        map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 12) });
      }

      const label = await reverseGeocode(lon, lat, MAPBOX_TOKEN);
      if (seq !== labelSeq.current) return; // superseded

      setDraftOrigin({ lon, lat, label });
      setSearchValue(label);
    },
    [map],
  );

  const handleSelect = useCallback((next: Origin) => {
    labelSeq.current += 1; // invalidate any in-flight reverse geocode
    setDraftOrigin(next);
    setSearchValue(next.label);
    setLocationError(null);
  }, []);

  const handleToggleBand = useCallback((index: number) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleBandInput = useCallback((index: number, value: string) => {
    setDraftBands((prev) => prev.map((entry, i) => (i === index ? value : entry)));
  }, []);

  const handleAddBand = useCallback(() => {
    setDraftBands((prev) => {
      const numeric = prev.map(Number).filter((n) => Number.isFinite(n) && n > 0);
      return [...prev, String(suggestNextBand(numeric))];
    });
  }, []);

  const handleRemoveBand = useCallback((index: number) => {
    setDraftBands((prev) => prev.filter((_, i) => i !== index));
    // Rows below the removed one shift up, so their hidden flags must too.
    setHidden((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
  }, []);

  const handleProfileChange = useCallback((next: Profile) => {
    setDraftProfile(next);
    /*
     * Reset the values to the new profile's defaults: a 60-minute walk is not
     * a unit most people reason about, and carrying driving numbers into
     * walking would produce a set nobody chose.
     *
     * The hidden set is left alone on purpose. It refers to positions, so
     * "I don't care about the outermost band" survives the change even though
     * every number underneath it is different.
     */
    setDraftBands(DEFAULT_BANDS[next].map(String));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!draftOrigin || !parsedBands.ok) return;

    // Submitting sorts the rows, so any hidden flags have to follow them.
    setHidden((prev) => remapIndices(prev, parsedBands.order));
    setDraftBands(parsedBands.values.map(String));
    setSubmitted({
      origin: draftOrigin,
      profile: draftProfile,
      minutes: parsedBands.values,
    });
  }, [draftOrigin, draftProfile, parsedBands]);

  useMapClick(map, (lon, lat) => {
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
  }, [setOriginFromCoords]);

  if (!HAS_VALID_TOKEN) {
    return <SetupNotice />;
  }

  return (
    <div className="app">
      <div ref={containerRef} className="map-container" />
      <ControlPanel
        map={map}
        origin={draftOrigin}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSelect={handleSelect}
        onUseMyLocation={handleUseMyLocation}
        locating={locating}
        locationError={locationError}
        profile={draftProfile}
        onProfileChange={handleProfileChange}
        bandInputs={draftBands}
        hidden={hidden}
        onBandInput={handleBandInput}
        onToggleBand={handleToggleBand}
        onAddBand={handleAddBand}
        onRemoveBand={handleRemoveBand}
        bandError={parsedBands.ok ? null : parsedBands.error}
        // Toggling filters the rendered result, so it only makes sense while the
        // form still describes what is rendered.
        canToggle={status.kind === 'success' && !dirty}
        dirty={dirty}
        hasSubmitted={submitted !== null}
        canSubmit={draftOrigin !== null && parsedBands.ok && dirty}
        onSubmit={handleSubmit}
        status={status}
      />
    </div>
  );
}
