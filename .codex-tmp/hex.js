const NEIGHBOR_DIRS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
];
export function hexKey(coord) {
    return `${coord.q},${coord.r}`;
}
export function addHex(a, b) {
    return { q: a.q + b.q, r: a.r + b.r };
}
export function equalsHex(a, b) {
    return a.q === b.q && a.r === b.r;
}
export function hexDistance(a, b) {
    const aq = a.q;
    const ar = a.r;
    const as = -aq - ar;
    const bq = b.q;
    const br = b.r;
    const bs = -bq - br;
    return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}
export function neighbors(coord) {
    return NEIGHBOR_DIRS.map((dir) => addHex(coord, dir));
}
export function inRadius(coord, radius) {
    return hexDistance(coord, { q: 0, r: 0 }) <= radius;
}
export function allHexes(radius) {
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
