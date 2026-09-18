import { useRef } from 'react';
import { HAS_VALID_TOKEN } from './config';
import { useMapboxMap } from './map/useMapboxMap';
import { SetupNotice } from './components/SetupNotice';

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ready } = useMapboxMap(containerRef);

  if (!HAS_VALID_TOKEN) {
    return <SetupNotice />;
  }

  return (
    <div className="app">
      <div ref={containerRef} className="map-container" data-map-ready={ready} />
    </div>
  );
}
