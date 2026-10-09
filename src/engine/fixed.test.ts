import { describe, expect, it } from 'vitest';
import { FIXED_PRECISION, fixed, fixedAdd, fixedSub, fixedMul, fixedClamp, fixedMax, fixedSum, formatFixed } from './fixed';

describe('two-decimal number quantization', () => {
  it('preserves the epsilon adjustment and asymmetric negative ties', () => {
    expect(FIXED_PRECISION).toBe(100);
    expect(fixed(1.005)).toBe(1.01);
    expect(fixed(-1.005)).toBe(-1);
    expect(fixed(1.015)).toBe(1.02);
    expect(fixed(-1.015)).toBe(-1.01);
    expect(fixed(0.004)).toBe(0);
    expect(fixed(0.006)).toBe(0.01);
  });

  it('quantizes arithmetic results and each sum addition, not just the total', () => {
    expect(fixedAdd(0.1, 0.2)).toBe(0.3);
    expect(fixedSub(0.3, 0.1)).toBe(0.2);
    expect(fixedMul(1.005, 2)).toBe(2.01);
    expect(fixedSum([0.004, 0.004, 0.004])).toBe(0);
    expect(fixed(0.004 + 0.004 + 0.004)).toBe(0.01);
    expect(fixedSum([])).toBe(0);
  });

  it('does not quantize supplied clamp or minimum bounds', () => {
    expect(fixedClamp(0.123, 0.125, 0.126)).toBe(0.125);
    expect(fixedClamp(0.2, 0.125, 0.126)).toBe(0.126);
    expect(fixedMax(0.123, 0.125)).toBe(0.125);
  });

  it('formats quantized values without unnecessary trailing zeroes', () => {
    expect(formatFixed(2)).toBe('2');
    expect(formatFixed(2.1)).toBe('2.1');
    expect(formatFixed(2.126)).toBe('2.13');
    expect(formatFixed(-1.005)).toBe('-1');
  });
});
