import { useEffect, useRef, useState } from 'react';
import { MAPBOX_TOKEN } from '../config';
import { IsochroneError, fetchIsochrone, normaliseMinutes } from '../api/isochrone';
import type { IsochroneQuery, QueryStatus } from '../types';

/**
 * Stable identity for a request. Two queries producing the same key would issue
 * an identical HTTP call, so this doubles as the effect dependency and prevents
 * refetching when an unrelated piece of state changes.
 */
function queryKey(query: IsochroneQuery | null): string {
  if (!query) return '';
  const { origin, profile, minutes } = query;
  return [
    origin.lon.toFixed(6),
    origin.lat.toFixed(6),
    profile,
    normaliseMinutes(minutes).join(','),
  ].join('|');
}

/**
 * Runs the isochrone request whenever the query materially changes.
 *
 * Two independent guards, protecting against different failures:
 *
 *  - AbortController cancels the in-flight request, so a superseded call stops
 *    consuming quota and its response is discarded by the browser.
 *  - A sequence counter discards late responses. Abort alone is not enough: a
 *    response already in flight can still resolve after a newer one, and
 *    without this, switching walking → driving quickly can leave the walking
 *    bands on screen while the panel reads "driving".
 */
export function useIsochroneQuery(query: IsochroneQuery | null): QueryStatus {
  const [status, setStatus] = useState<QueryStatus>({ kind: 'idle' });

  const seqRef = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;

  const key = queryKey(query);

  useEffect(() => {
    const current = queryRef.current;

    if (!current || key === '') {
      setStatus({ kind: 'idle' });
      return;
    }

    const seq = ++seqRef.current;
    const controller = new AbortController();

    setStatus({ kind: 'loading' });

    fetchIsochrone(current, MAPBOX_TOKEN, controller.signal)
      .then((data) => {
        if (seq !== seqRef.current) return; // superseded
        setStatus({ kind: 'success', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (seq !== seqRef.current) return;

        if (error instanceof IsochroneError) {
          setStatus({ kind: 'error', message: error.message, retryable: error.retryable });
          return;
        }
        setStatus({ kind: 'error', message: 'Something went wrong.', retryable: true });
      });

    return () => controller.abort();
  }, [key]);

  return status;
}
