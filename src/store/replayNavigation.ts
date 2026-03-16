import type { BattleReplay, BattleStep } from '../engine/types';

export function isSkippableBeat(steps: BattleStep[], index: number): boolean {
  const step = steps[index];
  return step?.kind === 'beat';
}

export function nextPlayableStep(current: number, replay: BattleReplay): number {
  let idx = Math.min(current + 1, replay.steps.length - 1);
  while (idx < replay.steps.length && isSkippableBeat(replay.steps, idx)) {
    idx += 1;
  }

  if (idx >= replay.steps.length) {
    return current;
  }

  return idx;
}

export function previousPlayableStep(current: number, replay: BattleReplay): number {
  let idx = Math.max(-1, current - 1);
  while (idx >= 0 && isSkippableBeat(replay.steps, idx)) {
    idx -= 1;
  }
  return idx;
}
