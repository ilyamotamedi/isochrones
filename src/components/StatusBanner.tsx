import type { QueryStatus } from '../types';

interface StatusBannerProps {
  status: QueryStatus;
  hasOrigin: boolean;
}

export function StatusBanner({ status, hasOrigin }: StatusBannerProps) {
  let content: string | null = null;
  let tone = 'info';

  if (!hasOrigin) {
    content = 'Pick a starting point to see how far you can travel.';
  } else if (status.kind === 'loading') {
    content = 'Working out your travel area…';
  } else if (status.kind === 'error') {
    content = status.message;
    tone = 'error';
  }

  return (
    // Always rendered so assistive tech observes the same node changing,
    // rather than a region appearing and disappearing from the accessibility
    // tree, which screen readers announce inconsistently.
    <div
      className={`status status--${tone}`}
      role="status"
      aria-live="polite"
      hidden={content === null}
    >
      {content}
    </div>
  );
}
