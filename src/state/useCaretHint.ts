import { useCallback, useEffect, useRef, useState } from 'react';
import { CARET_HINT_DELAY_MS, CARET_HINT_DURATION_MS, MOBILE_BREAKPOINT } from '../config';
import { readHintSeen, writeHintSeen } from './caretHint';

interface CaretHint {
  /** Whether the hint should currently be on screen. */
  visible: boolean;
  /** Bring it forward early. Called on the first map tap. */
  reveal: () => void;
}

/**
 * A one-time nudge towards the caret that holds the rest of the controls.
 *
 * Shown on whichever comes first: a few seconds of the panel sitting
 * collapsed, or the first tap on the map. The second trigger matters more than
 * the timer — someone who has just tapped the map is exploring, and is the
 * person most likely to want the travel times next.
 *
 * @param enabled Whether a hint is wanted at all. In practice this is "the
 *   panel is collapsed": there is nothing to point at while it is open.
 */
export function useCaretHint(enabled: boolean): CaretHint {
  const [visible, setVisible] = useState(false);

  /*
   * Whether the hint has been used up, in memory. Read from storage once and
   * then owned here — a ref rather than state because the timer callback below
   * must see the current value, not the one captured when it was scheduled.
   */
  const spentRef = useRef<boolean | null>(null);
  if (spentRef.current === null) {
    spentRef.current = readHintSeen(window.localStorage);
  }

  const reveal = useCallback(() => {
    if (spentRef.current) return;
    // The caret only exists below the breakpoint; above it the panel is a card
    // with everything already on show.
    if (window.innerWidth > MOBILE_BREAKPOINT) return;

    /*
     * Not while someone is using the panel. The tooltip hangs below the header
     * and straight over the search field, so firing it mid-search would cover
     * the suggestion list with an advert for a button.
     *
     * Deliberately does not mark the hint as spent: it has not been shown, and
     * the first map tap should still get a chance to show it.
     */
    const active = document.activeElement;
    if (active instanceof Element && active.closest('.panel')) return;

    spentRef.current = true;
    writeHintSeen(window.localStorage);
    setVisible(true);
  }, []);

  // Arm the timer for as long as the panel stays collapsed.
  useEffect(() => {
    if (!enabled || spentRef.current) return;
    const id = window.setTimeout(reveal, CARET_HINT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [enabled, reveal]);

  // Expanding the panel answers the question the hint was asking.
  useEffect(() => {
    if (!enabled) setVisible(false);
  }, [enabled]);

  useEffect(() => {
    if (!visible) return;

    const hide = () => setVisible(false);
    const id = window.setTimeout(hide, CARET_HINT_DURATION_MS);

    /*
     * Capture phase, so a tap takes the hint down whatever it lands on and
     * whether or not anything downstream handles it.
     *
     * Attaching these here rather than at reveal time is what keeps the map
     * tap from dismissing the hint it just triggered: the listener goes on in
     * an effect, which runs after the gesture that caused the render has
     * finished.
     */
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);

    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [visible]);

  return { visible, reveal };
}
