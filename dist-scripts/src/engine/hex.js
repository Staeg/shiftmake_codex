const NEIGHBOR_DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];
function hexKey(coord) {
  return `${coord.q},${coord.r}`;
}
function addHex(a, b) {
  return { q: a.q + b.q, r: a.r + b.r };
}
function equalsHex(a, b) {
  return a.q === b.q && a.r === b.r;
}
function hexDistance(a, b) {
  const aq = a.q;
  const ar = a.r;
  const as = -aq - ar;
  const bq = b.q;
  const br = b.r;
  const bs = -bq - br;
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}
function neighbors(coord) {
  return NEIGHBOR_DIRS.map((dir) => addHex(coord, dir));
}
function inRadius(coord, radius) {
  return hexDistance(coord, { q: 0, r: 0 }) <= radius;
}
function allHexes(radius) {
  const cells = [];
  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r += 1) {
      cells.push({ q, r });
    }
  }
  return cells;
}
function uniqueHexes(hexes) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  hexes.forEach((hex) => {
    const key = hexKey(hex);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(hex);
    }
  });
  return result.sort((left, right) => left.q - right.q || left.r - right.r);
}
function hexagonFootprint(anchor, radius) {
  return allHexes(radius).map((hex) => addHex(anchor, hex));
}
function triangleFootprint(anchor, orientation) {
  const offsets = orientation === "north" ? [{ q: 0, r: 0 }, { q: 1, r: -1 }, { q: 1, r: 0 }] : [{ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 0 }];
  return offsets.map((hex) => addHex(anchor, hex));
}
function footprintForSize(anchor, size, orientation) {
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
function footprintCenter(occupiedHexes) {
  if (occupiedHexes.length === 0) {
    return { q: 0, r: 0 };
  }
  const total = occupiedHexes.reduce(
    (sum, hex) => ({ q: sum.q + hex.q, r: sum.r + hex.r }),
    { q: 0, r: 0 }
  );
  return {
    q: total.q / occupiedHexes.length,
    r: total.r / occupiedHexes.length
  };
}
function footprintsOverlap(left, right) {
  const rightKeys = new Set(right.map(hexKey));
  return left.some((hex) => rightKeys.has(hexKey(hex)));
}
function footprintDistance(left, right) {
  if (left.length === 0 || right.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let best = Number.POSITIVE_INFINITY;
  left.forEach((leftHex) => {
    right.forEach((rightHex) => {
      best = Math.min(best, hexDistance(leftHex, rightHex));
    });
  });
  return best;
}
function footprintsTouchOrOverlap(left, right) {
  return footprintDistance(left, right) <= 1;
}
function visualVerticalLineKey(hex) {
  return 2 * hex.q + hex.r;
}
function leftmostHex(hexes) {
  return [...hexes].sort((left, right) => visualVerticalLineKey(left) - visualVerticalLineKey(right) || left.r - right.r || left.q - right.q)[0] ?? { q: 0, r: 0 };
}
function rightmostHex(hexes) {
  return [...hexes].sort((left, right) => visualVerticalLineKey(right) - visualVerticalLineKey(left) || left.r - right.r || left.q - right.q)[0] ?? { q: 0, r: 0 };
}
export {
  addHex,
  allHexes,
  equalsHex,
  footprintCenter,
  footprintDistance,
  footprintForSize,
  footprintsOverlap,
  footprintsTouchOrOverlap,
  hexDistance,
  hexKey,
  inRadius,
  leftmostHex,
  neighbors,
  rightmostHex,
  visualVerticalLineKey
};
//# sourceMappingURL=hex.js.map
