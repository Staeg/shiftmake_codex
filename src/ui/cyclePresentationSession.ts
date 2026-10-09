import { writable } from 'svelte/store';
import type { RiftResolutionRecord } from '../engine/types';
import { buildBattlePresentationTimeline } from '../rendering/battlePresentationTimeline';

export const RIFT_BATTLE_LATE_PHASE_DELAY_MS = 925;
export const RIFT_BATTLE_STEP_MS = 500 / 64;
export const RIFT_BATTLE_RESULT_HANDOFF_MS = 420;
export const BATTLE_LOG_ARRIVAL_STAGGER_MS = 460;
export const BATTLE_LOG_ARRIVAL_FLIGHT_MS = 1160;

interface CycleAnimation {
  resolution: { records: readonly RiftResolutionRecord[] };
}
interface PresentationRuntime {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(handle: number): void;
}
interface PresentationOptions<A extends CycleAnimation> {
  runtime(): PresentationRuntime;
  afterRender(): Promise<void>;
  isCurrent(animation: A): boolean;
  finish(animation: A): void;
}

export function cyclePresentationDurations(records: readonly RiftResolutionRecord[]) {
  const battleMs = records.length === 0 ? 0 : Math.max(
    ...records.map(record => buildBattlePresentationTimeline(record.replay, RIFT_BATTLE_STEP_MS).durationMs),
  ) + (records.some(record => record.contest?.kind === 'pvp') ? RIFT_BATTLE_LATE_PHASE_DELAY_MS : 0)
    + RIFT_BATTLE_RESULT_HANDOFF_MS;
  const arrivalMs = records.length === 0 ? 0 : BATTLE_LOG_ARRIVAL_FLIGHT_MS
    + (records.length - 1) * BATTLE_LOG_ARRIVAL_STAGGER_MS + 180;
  return { battleMs, arrivalMs, totalMs: battleMs + arrivalMs };
}

export function createCyclePresentationSession<A extends CycleAnimation>(options: PresentationOptions<A>) {
  const store = writable({ arrivalActive: false, arrivalReady: false });
  type Attempt = { animation: A; runtime: PresentationRuntime; finished: boolean;
    arrivalTimer: number | null; finishTimer: number | null; frame: number | null };
  let current: Attempt | null = null;
  let disposed = false;

  function isCurrent(attempt: Attempt): boolean {
    return !disposed && current === attempt && !attempt.finished && options.isCurrent(attempt.animation);
  }
  function release(attempt: Attempt): void {
    if (attempt.arrivalTimer !== null) attempt.runtime.clearTimeout(attempt.arrivalTimer);
    if (attempt.finishTimer !== null) attempt.runtime.clearTimeout(attempt.finishTimer);
    if (attempt.frame !== null) attempt.runtime.cancelAnimationFrame(attempt.frame);
    attempt.arrivalTimer = attempt.finishTimer = attempt.frame = null;
  }
  function reset(): void {
    const previous = current;
    current = null;
    if (previous) release(previous);
    store.set({ arrivalActive: false, arrivalReady: false });
  }
  function synchronize(animation: A | null): void {
    if (disposed || current?.animation === animation) return;
    reset();
    if (!animation) return;
    const runtime = options.runtime();
    const attempt: Attempt = { animation, runtime, finished: false,
      arrivalTimer: null, finishTimer: null, frame: null };
    current = attempt;
    const { battleMs, totalMs } = cyclePresentationDurations(animation.resolution.records);
    attempt.arrivalTimer = runtime.setTimeout(() => {
      attempt.arrivalTimer = null;
      if (!isCurrent(attempt)) return;
      store.set({ arrivalActive: true, arrivalReady: false });
      void options.afterRender().then(() => {
        if (!isCurrent(attempt)) return;
        attempt.frame = runtime.requestAnimationFrame(() => {
          attempt.frame = null;
          if (isCurrent(attempt)) store.set({ arrivalActive: true, arrivalReady: true });
        });
      });
    }, battleMs);
    attempt.finishTimer = runtime.setTimeout(() => {
      attempt.finishTimer = null;
      if (!isCurrent(attempt)) return;
      attempt.finished = true;
      release(attempt);
      store.set({ arrivalActive: false, arrivalReady: false });
      // Retain the completed identity while asynchronous store finalization runs.
      options.finish(animation);
    }, totalMs);
  }
  return {
    subscribe: store.subscribe,
    synchronize,
    reset,
    dispose(): void { disposed = true; reset(); },
  };
}
