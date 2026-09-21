import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '../analytics';

interface ShareButtonProps {
  disabled: boolean;
}

export function ShareButton({ disabled }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleShare = useCallback(async () => {
    const url = window.location.href;

    /*
     * The async Clipboard API requires a secure context. localhost and HTTPS
     * are fine, but testing over a LAN IP on a phone is plain HTTP, where this
     * rejects. Falling back to a selectable input keeps the feature usable
     * instead of failing silently.
     */
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);

      /*
       * Only on this path. The fallback below shows the link for the user to
       * copy by hand, which is not the same event — counting it would report a
       * success rate the feature has not earned.
       */
      track({ name: 'share_copied' });

      setManualUrl(null);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setManualUrl(url);
    }
  }, []);

  return (
    <div className="share">
      {/*
        Subtle, not solid. Sharing is an afterthought to looking at the map,
        and a solid blue button at the bottom of the panel would read as the
        thing the panel is asking you to do.
      */}
      <button
        type="button"
        className="btn btn--subtle share__btn"
        onClick={() => void handleShare()}
        disabled={disabled}
      >
        {copied ? 'Link copied' : 'Copy share link'}
      </button>

      {manualUrl && (
        <div className="share__fallback">
          <label htmlFor="share-url">Copy this link:</label>
          <input
            id="share-url"
            type="text"
            readOnly
            value={manualUrl}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}
