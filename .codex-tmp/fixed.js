export const FIXED_PRECISION = 100;
export function fixed(value) {
    return Math.round((value + Number.EPSILON) * FIXED_PRECISION) / FIXED_PRECISION;
}
export function fixedAdd(a, b) {
    return fixed(a + b);
}
export function fixedSub(a, b) {
    return fixed(a - b);
}
export function fixedMul(a, b) {
    return fixed(a * b);
}
export function fixedClamp(value, min, max) {
    return Math.max(min, Math.min(max, fixed(value)));
}
export function fixedMax(value, min) {
    return Math.max(min, fixed(value));
}
export function fixedSum(values) {
    return values.reduce((sum, value) => fixedAdd(sum, value), 0);
}
export function formatFixed(value) {
    const rounded = fixed(value);
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
