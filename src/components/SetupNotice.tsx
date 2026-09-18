import { TOKEN_IS_SECRET } from '../config';

/**
 * Shown instead of the map when no usable token is configured.
 *
 * A missing token otherwise surfaces as an opaque 401 from inside mapbox-gl,
 * which is a poor first-run experience for something with a two-line fix.
 */
export function SetupNotice() {
  return (
    <div className="setup-notice">
      <div className="setup-notice__card">
        <h1>Almost there</h1>
        <p>
          <strong>isochrones</strong> needs a Mapbox access token to load the map.
        </p>

        {TOKEN_IS_SECRET && (
          <p className="setup-notice__warning">
            The configured token starts with <code>sk.</code>, which is a <strong>secret</strong>{' '}
            token. This value is bundled into the browser build and would be readable by anyone
            visiting the site. Revoke it in the Mapbox console and use a public{' '}
            <code>pk.</code> token instead.
          </p>
        )}

        <p>Create a free public token, then:</p>
        <pre>
          cp .env.example .env.local{'\n'}
          # paste your pk. token into .env.local{'\n'}
          npm run dev
        </pre>
        <p>
          Tokens live at{' '}
          <a
            href="https://console.mapbox.com/account/access-tokens/"
            target="_blank"
            rel="noreferrer noopener"
          >
            console.mapbox.com
          </a>
          . The default public scopes are all this app needs.
        </p>
      </div>
    </div>
  );
}
