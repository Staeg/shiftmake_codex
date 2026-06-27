function randomSeed() {
  return (Date.now() ^ Math.random() * 4294967295) >>> 0;
}
function createRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = 1664525 * state + 1013904223 >>> 0;
    return state / 4294967296;
  };
  return {
    next,
    int(maxExclusive) {
      if (maxExclusive <= 0) {
        throw new Error("maxExclusive must be positive");
      }
      return Math.floor(next() * maxExclusive);
    },
    pick(items) {
      if (items.length === 0) {
        throw new Error("Cannot pick from empty array");
      }
      return items[this.int(items.length)];
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = this.int(i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }
  };
}
export {
  createRng,
  randomSeed
};
//# sourceMappingURL=rng.js.map
