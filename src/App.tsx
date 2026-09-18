import { useCallback, useRef, useState } from 'react';
import { HAS_VALID_TOKEN, MAPBOX_TOKEN } from './config';
import { useMapboxMap } from './map/useMapboxMap';
import { useOriginMarker } from './map/useOriginMarker';
import { useMapClick } from './map/useMapClick';
import { formatCoords, reverseGeocode } from './api/geocode';
import { SetupNotice } from './components/SetupNotice';
import { ControlPanel } from './components/ControlPanel';
import type { Origin } from './types';

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map } = useMapboxMap(containerRef);

  const [origin, setOrigin] = useState<Origin | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useOriginMarker(map, origin);

  /*
   * Guards against out-of-order reverse-geocode results. Two quick map clicks
   * can resolve in either order, and without this the first click's place name
   * can overwrite the second click's, leaving the label describing a point the
   * marker is no longer on.
   */
  const labelSeq = useRef(0);

  const setOriginFromCoords = useCallback(
    async (lon: number, lat: number, recenter: boolean) => {
      const seq = ++labelSeq.current;

      // Show the pin and coordinates immediately; the place name is an upgrade
      // that arrives a moment later rather than something to wait on.
      setOrigin({ lon, lat, label: formatCoords(lon, lat) });
      setSearchValue(formatCoords(lon, lat));
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
    // Invalidate any in-flight reverse geocode so it cannot clobber this label.
    labelSeq.current += 1;
    setOrigin(next);
    setSearchValue(next.label);
    setLocationError(null);
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
      />
    </div>
  );
}
