import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// mapbox-gl ships its own stylesheet. Without it, controls, markers and the
// attribution are unstyled and mispositioned.
import 'mapbox-gl/dist/mapbox-gl.css';
import './styles/index.css';

import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
