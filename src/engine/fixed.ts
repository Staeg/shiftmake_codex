export const FIXED_PRECISION = 100;

export function fixed(value: number): number {
  return Math.round((value + Number.EPSILON) * FIXED_PRECISION) / FIXED_PRECISION;
}

export function fixedAdd(a: number, b: number): number {
  return fixed(a + b);
}

export function fixedSub(a: number, b: number): number {
  return fixed(a - b);
}

export function fixedMul(a: number, b: number): number {
  return fixed(a * b);
}

export function fixedClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, fixed(value)));
}

export function fixedMax(value: number, min: number): number {
  return Math.max(min, fixed(value));
}

export function fixedSum(values: number[]): number {
  return values.reduce((sum, value) => fixedAdd(sum, value), 0);
}

export function formatFixed(value: number): string {
  const rounded = fixed(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
