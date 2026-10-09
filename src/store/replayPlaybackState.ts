import { readable, type Readable } from 'svelte/store';
import type { BattleReplay, BattleReportPayload, StoredReplayPayload } from '../engine/types';
import { nextPlayableStep, previousPlayableStep } from './replayNavigation';

export interface ReplayPlaybackState {
  loadedReplay: BattleReplay | null;
  loadedReplayPayload: StoredReplayPayload | null;
  loadedBattleReport: BattleReportPayload | null;
  currentStep: number;
  selectedEvent: number | null;
  autoPlay: boolean;
  rateMs: number;
}

export function createReplayPlaybackState(): ReplayPlaybackState {
  return {
    loadedReplay: null,
    loadedReplayPayload: null,
    loadedBattleReport: null,
    currentStep: -1,
    selectedEvent: null,
    autoPlay: false,
    rateMs: 125,
  };
}

function splitReplayState<T extends ReplayPlaybackState>(state: T) {
  const { loadedReplay, loadedReplayPayload, loadedBattleReport, currentStep, selectedEvent, autoPlay, rateMs, ...session } = state;
  const playback: ReplayPlaybackState = { loadedReplay, loadedReplayPayload, loadedBattleReport, currentStep, selectedEvent, autoPlay, rateMs };
  return { playback, session };
}

function sameFields<T extends object>(left: T, right: T): boolean {
  const keys = Object.keys(left) as Array<keyof T>;
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

function distinctView<T, U extends object>(source: Readable<T>, project: (state: T) => U): Readable<U> {
  return readable<U>(undefined, (set) => {
    let previous: U | undefined;
    return source.subscribe((state) => {
      const next = project(state);
      if (!previous || !sameFields(previous, next)) {
        previous = next;
        set(next);
      }
    });
  });
}

// Views share one atomic source; they do not introduce independently writable state.
export function createReplayStateViews<T extends ReplayPlaybackState>(source: Readable<T>) {
  return {
    session: distinctView(source, (state) => splitReplayState(state).session),
    playback: distinctView(source, (state) => splitReplayState(state).playback),
  };
}

export type ReplayNavigationAction =
  | { kind: 'forward' | 'backward' }
  | { kind: 'seek'; step: number }
  | { kind: 'event'; step: number | null };

export function navigateReplay<T extends ReplayPlaybackState>(state: T, action: ReplayNavigationAction): T {
  if (action.kind === 'seek') {
    return {
      ...state,
      currentStep: state.loadedReplay ? Math.max(-1, Math.min(action.step, state.loadedReplay.steps.length - 1)) : -1,
      selectedEvent: null,
    };
  }
  if (!state.loadedReplay) {
    return state;
  }
  if (action.kind === 'event') {
    if (action.step === null) {
      return { ...state, selectedEvent: null };
    }
    const step = Math.max(0, Math.min(action.step, state.loadedReplay.steps.length - 1));
    return { ...state, selectedEvent: step, currentStep: step };
  }
  const currentStep = action.kind === 'forward'
    ? nextPlayableStep(state.currentStep, state.loadedReplay)
    : previousPlayableStep(state.currentStep, state.loadedReplay);
  return { ...state, currentStep, selectedEvent: currentStep >= 0 ? currentStep : null };
}
