import { describe, expect, it } from 'vitest';
import { fitPaddingFor } from './config';

function rect(partial: Partial<DOMRect>): DOMRect {
  return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...partial } as DOMRect;
}

describe('fitPaddingFor', () => {
  it('pushes the result to the right of a desktop panel', () => {
    const padding = fitPaddingFor(rect({ right: 356, bottom: 520 }), null, 1440, 900);
    expect(padding.left).toBe(372);
    // A floating card is avoided horizontally only; padding the top as well
    // would shove the result into the bottom-right corner for no reason.
    expect(padding.top).toBe(32);
  });

  it('pushes the result below a mobile top sheet', () => {
    const padding = fitPaddingFor(rect({ right: 390, bottom: 300 }), null, 390, 844);
    expect(padding.top).toBe(316);
    expect(padding.left).toBe(32);
  });

  it('frames against the collapsed height, not the open sheet', () => {
    // An open sheet reaching 553px on an 844px screen cannot be cleared without
    // squeezing the map to a sliver. The 123px that survives a collapse can.
    const padding = fitPaddingFor(
      rect({ right: 390, bottom: 553 }),
      rect({ right: 390, bottom: 123 }),
      390,
      844,
    );
    expect(padding.top).toBe(139);
  });

  it('ignores the sticky region on desktop, where nothing collapses', () => {
    const padding = fitPaddingFor(
      rect({ right: 356, bottom: 520 }),
      rect({ right: 356, bottom: 120 }),
      1440,
      900,
    );
    expect(padding.left).toBe(372);
  });

  it('clamps a tall panel rather than letting padding exceed the canvas', () => {
    // A 700px-tall sticky region on an 844px screen would otherwise leave no
    // room at all, and mapbox-gl throws when padding exceeds the canvas.
    const padding = fitPaddingFor(rect({ right: 390, bottom: 700 }), null, 390, 844);
    expect(padding.top).toBeCloseTo(337.6);
    expect(padding.top).toBeLessThan(844);
  });

  it('clamps a very wide panel on a narrow desktop window', () => {
    const padding = fitPaddingFor(rect({ right: 700, bottom: 400 }), null, 900, 700);
    expect(padding.left).toBe(360);
  });

  it('falls back to plain edge padding before the panel exists', () => {
    expect(fitPaddingFor(null, null, 1440, 900)).toEqual({
      top: 32,
      bottom: 32,
      left: 32,
      right: 32,
    });
  });
});
