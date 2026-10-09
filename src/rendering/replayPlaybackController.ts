import type { BattleReplay } from '../engine/types';
import { buildBattlePresentationTimeline, type BattlePresentationTimeline } from './battlePresentationTimeline';

export interface PlaybackState {
  loadedReplay: BattleReplay | null;
  currentStep: number;
  autoPlay: boolean;
  rateMs: number;
}

export interface PlaybackFrameScheduler {
  now(): number;
  request(callback: () => void): number;
  cancel(handle: number): void;
}

interface PlaybackOptions {
  read(): { state: PlaybackState; active: boolean };
  scheduler: PlaybackFrameScheduler;
  advance(step: number): void;
  pause(): void;
  idle(): void;
}

export function createReplayPlaybackController(options: PlaybackOptions) {
  let frame: number | null = null;
  let generation = 0;
  let runningReplay: BattleReplay | null = null;
  let runningRate = 0;
  let expectedStep = -1;
  let cache: { replay: BattleReplay; rateMs: number; timeline: BattlePresentationTimeline } | null = null;
  let disposed = false;

  function stop(): void {
    generation += 1;
    if (frame !== null) {
      options.scheduler.cancel(frame);
      frame = null;
    }
    runningReplay = null;
  }

  function reset(): void {
    stop();
    cache = null;
  }

  function sync(state: PlaybackState, active: boolean): void {
    if (disposed) {
      return;
    }
    const replay = state.loadedReplay;
    if (!active || !replay) {
      reset();
      return;
    }
    if (!state.autoPlay) {
      stop();
      return;
    }
    if (frame !== null && runningReplay === replay && runningRate === state.rateMs && expectedStep === state.currentStep) {
      return;
    }
    stop();
    if (!cache || cache.replay !== replay || cache.rateMs !== state.rateMs) {
      cache = { replay, rateMs: state.rateMs, timeline: buildBattlePresentationTimeline(replay, state.rateMs) };
    }
    const timeline = cache.timeline;
    let cueIndex = timeline.cues.findIndex((cue) => cue.stepIndex > state.currentStep);
    const firstCue = timeline.cues[cueIndex];
    if (!firstCue) {
      options.pause();
      return;
    }
    const token = generation;
    runningReplay = replay;
    runningRate = state.rateMs;
    expectedStep = state.currentStep;
    const startedAt = options.scheduler.now() - firstCue.startMs;

    function isCurrent(): boolean {
      if (disposed || token !== generation) {
        return false;
      }
      const current = options.read();
      return current.active && current.state.autoPlay && current.state.loadedReplay === replay
        && current.state.rateMs === runningRate && current.state.currentStep === expectedStep;
    }

    function tick(): void {
      if (token !== generation || disposed) {
        return;
      }
      if (!isCurrent()) {
        const current = options.read();
        sync(current.state, current.active);
        return;
      }
      const elapsed = options.scheduler.now() - startedAt;
      let advanced = false;
      while (cueIndex < timeline.cues.length) {
        const cue = timeline.cues[cueIndex]!;
        if (cue.startMs > elapsed) {
          break;
        }
        expectedStep = cue.stepIndex;
        cueIndex += 1;
        options.advance(cue.stepIndex);
        advanced = true;
        // Store callbacks can synchronously pause, seek, switch replay or unmount.
        if (!isCurrent()) {
          if (token === generation) {
            const current = options.read();
            sync(current.state, current.active);
          }
          return;
        }
      }
      if (cueIndex >= timeline.cues.length) {
        frame = null;
        runningReplay = null;
        options.pause();
        return;
      }
      frame = options.scheduler.request(tick);
      if (!advanced) {
        options.idle();
      }
    }

    frame = options.scheduler.request(tick);
  }

  return {
    sync,
    reset,
    dispose() {
      disposed = true;
      reset();
    },
  };
}
