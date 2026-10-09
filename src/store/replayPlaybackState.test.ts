import { get, readable, writable } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { resolveBattle } from '../engine/battle';
import { unitOnceEffectInput } from '../engine/__fixtures__/unitOnceEffectInputs';
import { createReplayPlaybackState, createReplayStateViews, navigateReplay } from './replayPlaybackState';

describe('replay state views', () => {
  it('notifies playback and session only when their own fields change', () => {
    const game = { seed: 1 };
    const source = writable({ ...createReplayPlaybackState(), game, screen: 'replay' });
    const views = createReplayStateViews(source);
    const session = vi.fn();
    const playback = vi.fn();
    const stopSession = views.session.subscribe(session);
    const stopPlayback = views.playback.subscribe(playback);
    expect(session).toHaveBeenCalledTimes(1);
    expect(playback).toHaveBeenCalledTimes(1);
    expect(get(views.session)).toEqual({ game, screen: 'replay' });

    source.update((state) => ({ ...state, currentStep: 2, autoPlay: true, rateMs: 500 }));
    expect(session).toHaveBeenCalledTimes(1);
    expect(playback).toHaveBeenCalledTimes(2);
    source.update((state) => ({ ...state, screen: 'overworld' }));
    expect(session).toHaveBeenCalledTimes(2);
    expect(playback).toHaveBeenCalledTimes(2);
    source.update((state) => ({ ...state }));
    expect(session).toHaveBeenCalledTimes(2);
    expect(playback).toHaveBeenCalledTimes(2);
    stopSession();
    stopPlayback();
  });

  it('handles replay replacement with the same ID by reference, not by ID', () => {
    const replay = resolveBattle(unitOnceEffectInput('stoneblood'));
    const source = writable({ ...createReplayPlaybackState(), loadedReplay: replay });
    const { playback } = createReplayStateViews(source);
    const listener = vi.fn();
    const stop = playback.subscribe(listener);
    const replacement = { ...replay, steps: [...replay.steps] };
    source.update((state) => ({ ...state, loadedReplay: replacement }));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(get(playback).loadedReplay).toBe(replacement);
    stop();
  });

  it('releases source subscriptions and reads current state on resubscription', () => {
    const start = vi.fn(() => stop);
    const stop = vi.fn();
    const source = readable(createReplayPlaybackState(), start);
    const { playback, session } = createReplayStateViews(source);
    const stopPlayback = playback.subscribe(() => {});
    const stopSession = session.subscribe(() => {});
    expect(start).toHaveBeenCalledTimes(1);
    stopPlayback();
    expect(stop).not.toHaveBeenCalled();
    stopSession();
    expect(stop).toHaveBeenCalledTimes(1);
    const unsubscribe = playback.subscribe(() => {});
    expect(start).toHaveBeenCalledTimes(2);
    unsubscribe();
    expect(stop).toHaveBeenCalledTimes(2);
  });
});

describe('replay navigation state', () => {
  const replay = resolveBattle(unitOnceEffectInput('stoneblood'));

  it('preserves session references while navigating playable steps in both directions', () => {
    const game = { seed: 1 };
    const initial = { ...createReplayPlaybackState(), loadedReplay: replay, game };
    const forward = navigateReplay(initial, { kind: 'forward' });
    expect(replay.steps[forward.currentStep]?.kind).not.toBe('beat');
    expect(forward.selectedEvent).toBe(forward.currentStep);
    const next = navigateReplay(forward, { kind: 'forward' });
    expect(next.currentStep).toBeGreaterThan(forward.currentStep);
    expect(navigateReplay(next, { kind: 'backward' }).currentStep).toBe(forward.currentStep);
    expect(next.game).toBe(game);
    expect(next.loadedReplay).toBe(replay);
    expect(initial.currentStep).toBe(-1);
  });

  it('clamps seeking and event selection and keeps their selection semantics distinct', () => {
    const state = { ...createReplayPlaybackState(), loadedReplay: replay };
    expect(navigateReplay(state, { kind: 'seek', step: -100 }).currentStep).toBe(-1);
    expect(navigateReplay(state, { kind: 'seek', step: 10000 }).currentStep).toBe(replay.steps.length - 1);
    const selected = navigateReplay(state, { kind: 'event', step: 10000 });
    expect(selected.currentStep).toBe(replay.steps.length - 1);
    expect(selected.selectedEvent).toBe(selected.currentStep);
    expect(navigateReplay(selected, { kind: 'seek', step: 1 }).selectedEvent).toBeNull();
    expect(navigateReplay(selected, { kind: 'event', step: null })).toMatchObject({ currentStep: selected.currentStep, selectedEvent: null });
  });

  it('does not navigate absent replays and creates independent defaults', () => {
    const state = createReplayPlaybackState();
    expect(createReplayPlaybackState()).not.toBe(state);
    expect(navigateReplay(state, { kind: 'forward' })).toBe(state);
    expect(navigateReplay(state, { kind: 'backward' })).toBe(state);
    expect(navigateReplay(state, { kind: 'event', step: 1 })).toBe(state);
    expect(navigateReplay(state, { kind: 'seek', step: 1 })).toEqual(state);
  });
});
