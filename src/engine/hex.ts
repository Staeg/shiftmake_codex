import type { HexCoord } from './types';

export type FootprintOrientation = 'north' | 'south';

const NEIGHBOR_DIRS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

export function addHex(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function equalsHex(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const aq = a.q;
  const ar = a.r;
  const as = -aq - ar;
  const bq = b.q;
  const br = b.r;
  const bs = -bq - br;
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

export function neighbors(coord: HexCoord): HexCoord[] {
  return NEIGHBOR_DIRS.map((dir) => addHex(coord, dir));
}

export function inRadius(coord: HexCoord, radius: number): boolean {
  return hexDistance(coord, { q: 0, r: 0 }) <= radius;
}

export function allHexes(radius: number): HexCoord[] {
  const cells: HexCoord[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r += 1) {
      cells.push({ q, r });
    }
  }
  return cells;
}

function uniqueHexes(hexes: HexCoord[]): HexCoord[] {
  const seen = new Set<string>();
  const result: HexCoord[] = [];
  hexes.forEach((hex) => {
    const key = hexKey(hex);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(hex);
    }
  });
  return result.sort((left, right) => left.q - right.q || left.r - right.r);
}

function hexagonFootprint(anchor: HexCoord, radius: number): HexCoord[] {
  return allHexes(radius).map((hex) => addHex(anchor, hex));
}

function triangleFootprint(anchor: HexCoord, orientation: FootprintOrientation): HexCoord[] {
  const offsets = orientation === 'north'
    ? [{ q: 0, r: 0 }, { q: 1, r: -1 }, { q: 1, r: 0 }]
    : [{ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 0 }];
  return offsets.map((hex) => addHex(anchor, hex));
}

export function footprintForSize(anchor: HexCoord, size: number, orientation: FootprintOrientation): HexCoord[] {
  if (size <= 1) {
    return [{ ...anchor }];
  }
  if (size === 2) {
    return uniqueHexes(triangleFootprint(anchor, orientation));
  }
  if (size === 3) {
    return uniqueHexes(hexagonFootprint(anchor, 1));
  }
  if (size === 4) {
    return uniqueHexes(triangleFootprint(anchor, orientation).flatMap((hex) => [hex, ...neighbors(hex)]));
  }
  return uniqueHexes(hexagonFootprint(anchor, 2));
}

export function footprintCenter(occupiedHexes: HexCoord[]): HexCoord {
  if (occupiedHexes.length === 0) {
    return { q: 0, r: 0 };
  }
  const total = occupiedHexes.reduce(
    (sum, hex) => ({ q: sum.q + hex.q, r: sum.r + hex.r }),
    { q: 0, r: 0 },
  );
  return {
    q: total.q / occupiedHexes.length,
    r: total.r / occupiedHexes.length,
  };
}

export function footprintsOverlap(left: HexCoord[], right: HexCoord[]): boolean {
  const rightKeys = new Set(right.map(hexKey));
  return left.some((hex) => rightKeys.has(hexKey(hex)));
}

export function footprintDistance(left: HexCoord[], right: HexCoord[]): number {
  if (left.length === 0 || right.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let best = Number.POSITIVE_INFINITY;
  for (const leftHex of left) {
    for (const rightHex of right) {
      best = Math.min(best, hexDistance(leftHex, rightHex));
      if (best === 0) {
        return 0;
      }
    }
  }
  return best;
}

export function footprintsTouchOrOverlap(left: HexCoord[], right: HexCoord[]): boolean {
  return footprintDistance(left, right) <= 1;
}

export function visualVerticalLineKey(hex: HexCoord): number {
  return 2 * hex.q + hex.r;
}

export function leftmostHex(hexes: HexCoord[]): HexCoord {
  return [...hexes].sort((left, right) => visualVerticalLineKey(left) - visualVerticalLineKey(right) || left.r - right.r || left.q - right.q)[0] ?? { q: 0, r: 0 };
}

export function rightmostHex(hexes: HexCoord[]): HexCoord {
  return [...hexes].sort((left, right) => visualVerticalLineKey(right) - visualVerticalLineKey(left) || left.r - right.r || left.q - right.q)[0] ?? { q: 0, r: 0 };
}
