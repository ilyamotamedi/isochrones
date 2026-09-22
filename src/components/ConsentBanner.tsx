import type { ConsentState } from '../analytics/consent';

interface ConsentBannerProps {
  open: boolean;
  onDecide: (state: ConsentState) => void;
}

/**
 * The consent question, as small as it can honestly be.
 *
 * ## The two things that are not negotiable
 *
 * **Equal weight.** Decline and Allow are the same size, the same shape and
 * the same colour. The EDPB's position is that refusing must be no harder than
 * accepting, and the usual grey-text-versus-blue-button arrangement fails that
 * on its face. It also happens to be the honest design: we genuinely do not
 * mind which one is pressed.
 *
 * **Not a modal.** No overlay, no focus trap, no blocked map. Someone who
 * ignores this entirely gets a fully working app and sends a cookieless ping,
 * which is the whole point of advanced consent mode. A wall would extract a
 * higher consent rate and would be worse software.
 *
 * `role="region"` with a name rather than `role="dialog"`, for the same
 * reason: dialog implies modality to a screen reader, and this is not modal.
 */
export function ConsentBanner({ open, onDecide }: ConsentBannerProps) {
  if (!open) return null;

  return (
    <section className="consent" role="region" aria-label="Analytics consent">
      <p className="consent__text">
        Count anonymous usage?{' '}
        {/*
          Said plainly, and true: `sanitiseLocation` strips the query string
          before anything reaches Google, and the event vocabulary in
          `events.ts` has no coordinate in it. A banner that made a promise the
          code did not keep would be worse than no banner.
        */}
        <span className="consent__note">No addresses or coordinates are ever sent.</span>
      </p>

      <div className="consent__actions">
        <button
          type="button"
          className="btn btn--subtle consent__btn"
          onClick={() => onDecide('denied')}
        >
          Decline
        </button>
        <button
          type="button"
          className="btn btn--subtle consent__btn"
          onClick={() => onDecide('granted')}
        >
          Allow
        </button>
      </div>
    </section>
  );
}
