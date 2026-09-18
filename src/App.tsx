import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HAS_VALID_TOKEN, MAPBOX_TOKEN } from './config';
import { useMapboxMap } from './map/useMapboxMap';
import { useOriginMarker } from './map/useOriginMarker';
import { useMapClick } from './map/useMapClick';
import { useIsochroneRender } from './map/useIsochroneRender';
import { useIsochroneQuery } from './state/useIsochroneQuery';
import { encodeShareState, parseShareState } from './state/urlState';
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

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, ready } = useMapboxMap(containerRef);

  const [origin, setOrigin] = useState<Origin | null>(initialShare?.origin ?? null);
  const [profile, setProfile] = useState<Profile>(initialShare?.profile ?? 'walking');
  const [searchValue, setSearchValue] = useState(initialShare?.origin.label ?? '');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  /*
   * Bands are state, not derived from the profile. A shared link carries its
   * own band values so it stays a faithful snapshot even if we retune the
   * per-profile defaults later.
   */
  const [bands, setBands] = useState<number[]>(
    initialShare?.minutes ?? DEFAULT_BANDS[initialShare?.profile ?? 'walking'],
  );
  const [hidden, setHidden] = useState<Set<number>>(() => {
    if (!initialShare) return new Set();
    return new Set(initialShare.minutes.filter((m) => !initialShare.visible.includes(m)));
  });

  const visible = useMemo(() => {
    const shown = bands.filter((m) => !hidden.has(m));
    // Never allow an empty map — that reads as a bug, not as a cleared view.
    return shown.length > 0 ? shown : bands;
  }, [bands, hidden]);

  const query = useMemo<IsochroneQuery | null>(
    () => (origin ? { origin, profile, minutes: bands } : null),
    [origin, profile, bands],
  );

  const status = useIsochroneQuery(query);
  const data = status.kind === 'success' ? status.data : null;

  useOriginMarker(map, origin);
  useIsochroneRender(map, ready, data, visible, bands);

  /*
   * Mirror state into the URL.
   *
   * replaceState rather than pushState: every band toggle would otherwise add a
   * history entry, so the back button would step through toggles instead of
   * leaving the app. The tradeoff is that back exits rather than undoing, which
   * is the less surprising behaviour for a single-view tool.
   */
  useEffect(() => {
    if (!origin) return;
    const qs = encodeShareState({ origin, profile, minutes: bands, visible });
    window.history.replaceState(null, '', `${window.location.pathname}?${qs}`);
  }, [origin, profile, bands, visible]);

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
      setOrigin({ lon, lat, label: coordLabel });
      setSearchValue(coordLabel);
      setLocationError(null);

      if (recenter && map) {
        map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 12) });
      }

      const label = await reverseGeocode(lon, lat, MAPBOX_TOKEN);
      if (seq !== labelSeq.current) return; // superseded

      setOrigin({ lon, lat, label });
      setSearchValue(label);
    },
    [map],
  );

  const handleSelect = useCallback((next: Origin) => {
    labelSeq.current += 1; // invalidate any in-flight reverse geocode
    setOrigin(next);
    setSearchValue(next.label);
    setLocationError(null);
  }, []);

  const handleToggleBand = useCallback((minutes: number) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(minutes)) next.delete(minutes);
      else next.add(minutes);
      return next;
    });
  }, []);

  const handleProfileChange = useCallback((next: Profile) => {
    setProfile(next);
    // Bands are state, so switching profile must explicitly reset them to that
    // profile's defaults — otherwise values from a shared link would persist
    // into a mode they were never meant for.
    setBands(DEFAULT_BANDS[next]);
    // Hidden minutes refer to the old band values and would hide arbitrary
    // bands in the new set.
    setHidden(new Set());
  }, []);

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
        origin={origin}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSelect={handleSelect}
        onUseMyLocation={handleUseMyLocation}
        locating={locating}
        locationError={locationError}
        profile={profile}
        onProfileChange={handleProfileChange}
        bands={bands}
        visible={visible}
        onToggleBand={handleToggleBand}
        status={status}
      />
    </div>
  );
}
