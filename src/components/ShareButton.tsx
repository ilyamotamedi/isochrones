import { useCallback, useEffect, useRef, useState } from 'react';

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
        Secondary, not primary. Submit is the action the form is asking for;
        two solid blue buttons stacked together would compete.
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
