import { describe, expect, it } from 'vitest';
import {
  footprintCenter,
  footprintDistance,
  footprintForSize,
  footprintsOverlap,
  footprintsTouchOrOverlap,
  leftmostHex,
  rightmostHex,
  visualVerticalLineKey,
} from './hex';

function keys(hexes: Array<{ q: number; r: number }>): string[] {
  return hexes.map((hex) => `${hex.q},${hex.r}`).sort();
}

describe('footprint geometry', () => {
  it('returns exact footprint counts for every supported size', () => {
    const anchor = { q: 2, r: -1 };

    expect(footprintForSize(anchor, 1, 'north')).toHaveLength(1);
    expect(footprintForSize(anchor, 2, 'north')).toHaveLength(3);
    expect(footprintForSize(anchor, 2, 'south')).toHaveLength(3);
    expect(footprintForSize(anchor, 3, 'north')).toHaveLength(7);
    expect(footprintForSize(anchor, 4, 'north')).toHaveLength(12);
    expect(footprintForSize(anchor, 4, 'south')).toHaveLength(12);
    expect(footprintForSize(anchor, 5, 'north')).toHaveLength(19);
  });

  it('uses north and south triangle orientations only for asymmetric sizes', () => {
    expect(keys(footprintForSize({ q: 0, r: 0 }, 2, 'north'))).toEqual(['0,0', '1,-1', '1,0']);
    expect(keys(footprintForSize({ q: 0, r: 0 }, 2, 'south'))).toEqual(['0,0', '0,1', '1,0']);

    expect(keys(footprintForSize({ q: 0, r: 0 }, 4, 'north'))).not.toEqual(keys(footprintForSize({ q: 0, r: 0 }, 4, 'south')));
    expect(keys(footprintForSize({ q: 0, r: 0 }, 3, 'north'))).toEqual(keys(footprintForSize({ q: 0, r: 0 }, 3, 'south')));
    expect(keys(footprintForSize({ q: 0, r: 0 }, 5, 'north'))).toEqual(keys(footprintForSize({ q: 0, r: 0 }, 5, 'south')));
  });

  it('measures overlap, contact, and distance deterministically', () => {
    const left = footprintForSize({ q: 0, r: 0 }, 2, 'north');
    const overlapping = footprintForSize({ q: 1, r: -1 }, 1, 'north');
    const touching = footprintForSize({ q: 2, r: -1 }, 1, 'north');
    const distant = footprintForSize({ q: 4, r: -1 }, 1, 'north');

    expect(footprintsOverlap(left, overlapping)).toBe(true);
    expect(footprintsOverlap(left, touching)).toBe(false);
    expect(footprintsTouchOrOverlap(left, touching)).toBe(true);
    expect(footprintDistance(left, distant)).toBe(3);
  });

  it('calculates center and representative hex helpers stably', () => {
    const footprint = footprintForSize({ q: 0, r: 0 }, 2, 'north');

    expect(footprintCenter(footprint)).toEqual({ q: 2 / 3, r: -1 / 3 });
    expect(leftmostHex(footprint)).toEqual({ q: 0, r: 0 });
    expect(rightmostHex(footprint)).toEqual({ q: 1, r: 0 });
  });

  it('uses a flat-top visual vertical line key', () => {
    expect(visualVerticalLineKey({ q: 0, r: 0 })).toBe(0);
    expect(visualVerticalLineKey({ q: 1, r: -2 })).toBe(0);
    expect(visualVerticalLineKey({ q: 1, r: 0 })).toBeGreaterThan(visualVerticalLineKey({ q: 0, r: 1 }));
  });
});
