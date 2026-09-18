import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence around the app.
 *
 * React unmounts the entire tree when an effect throws, and a full-screen map
 * app that unmounts leaves a blank white viewport with nothing to click and no
 * clue as to what happened. mapbox-gl throws from inside camera calls for
 * reasons the caller cannot always anticipate — a transform it considers
 * degenerate, for one — and those calls live in effects.
 *
 * This does not make the app work again; the map instance behind it is gone.
 * It replaces a blank page with an explanation and a way out.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the stack somewhere a developer will look; the UI deliberately
    // shows only the message.
    console.error('Unhandled error, app unmounted:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="setup-notice" role="alert">
        <div className="setup-notice__card">
          <h1>Something went wrong</h1>
          <p>The map ran into an error it could not recover from. Reloading usually fixes it.</p>
          <pre>{error.message}</pre>
          <p>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload the page
            </button>
          </p>
        </div>
      </div>
    );
  }
}
