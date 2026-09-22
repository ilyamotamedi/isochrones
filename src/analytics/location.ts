/**
 * The page address, with everything identifying removed.
 *
 * ## Why this file exists
 *
 * `encodeShareState` puts the origin in the query string — `lng` and `lat` to
 * five decimal places, which is about a metre, and `q`, which is the
 * reverse-geocoded street address. That is by design: it is what makes a link
 * shareable.
 *
 * Google Analytics attaches `page_location` to every event on its own, read
 * from `document.location`. So connecting GA to this app without a sanitiser
 * would send the user's location and address to Google on every interaction —
 * through page context, entirely bypassing the closed event union in
 * `events.ts`, which only governs parameters we pass deliberately.
 *
 * Nothing after the path is ever wanted here, so nothing after the path
 * survives.
 */

/**
 * Strips the query string and fragment from a URL.
 *
 * Total, not selective. An allow-list of safe parameters would need updating
 * every time a parameter is added, and the cost of forgetting is somebody's
 * home address in an analytics pipeline. There is no parameter this app sets
 * that GA has any business knowing.
 */
export function sanitiseLocation(href: string): string {
  try {
    const url = new URL(href);
    return `${url.origin}${url.pathname}`;
  } catch {
    /*
     * Not reachable from `location.href`, which is always absolute and valid.
     * The fallback still truncates rather than passing the input through,
     * because the one thing this function must never do is return something
     * with a query string in it — including when it has been misused.
     */
    return href.split('#')[0]?.split('?')[0] ?? '';
  }
}
