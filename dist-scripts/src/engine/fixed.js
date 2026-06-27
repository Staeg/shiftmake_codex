const FIXED_PRECISION = 100;
function fixed(value) {
  return Math.round((value + Number.EPSILON) * FIXED_PRECISION) / FIXED_PRECISION;
}
function fixedAdd(a, b) {
  return fixed(a + b);
}
function fixedSub(a, b) {
  return fixed(a - b);
}
function fixedMul(a, b) {
  return fixed(a * b);
}
function fixedClamp(value, min, max) {
  return Math.max(min, Math.min(max, fixed(value)));
}
function fixedMax(value, min) {
  return Math.max(min, fixed(value));
}
function fixedSum(values) {
  return values.reduce((sum, value) => fixedAdd(sum, value), 0);
}
function formatFixed(value) {
  const rounded = fixed(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
export {
  FIXED_PRECISION,
  fixed,
  fixedAdd,
  fixedClamp,
  fixedMax,
  fixedMul,
  fixedSub,
  fixedSum,
  formatFixed
};
//# sourceMappingURL=fixed.js.map
