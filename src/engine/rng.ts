export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: T[]): T;
  shuffle<T>(items: T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  return {
    next,
    int(maxExclusive: number) {
      if (maxExclusive <= 0) {
        throw new Error('maxExclusive must be positive');
      }
      return Math.floor(next() * maxExclusive);
    },
    pick<T>(items: T[]): T {
      if (items.length === 0) {
        throw new Error('Cannot pick from empty array');
      }
      return items[this.int(items.length)] as T;
    },
    shuffle<T>(items: T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = this.int(i + 1);
        [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
      }
      return copy;
    },
  };
}
