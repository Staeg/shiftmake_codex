import { describe, expect, it, vi } from 'vitest';
import type { BattleReplay, BattleStep } from '../engine/types';
import { buildBattlePresentationTimeline } from './battlePresentationTimeline';
import { createReplayPlaybackController, type PlaybackState } from './replayPlaybackController';

function makeReplay(kinds: BattleStep['kind'][] = ['beat', 'attack', 'beat', 'move', 'beat', 'heal']): BattleReplay {
  return {
    id: 'playback-test', seed: 1, riftId: null, tier: null, mutatorIds: [], mapRadius: 3, mapHexes: [],
    initial: { units: [] }, outcome: 'draw', troopLabels: {}, troopProfiles: [], aliveCounts: [],
    summary: { playerTroops: [], enemyTroops: [], finalPlayerAlive: 0, finalEnemyAlive: 0 },
    steps: kinds.map((kind, index) => ({ index, kind, actorIds: [], targetIds: [], message: kind, snapshot: { units: [] } })),
  };
}

function harness(replay = makeReplay()) {
  let now = 0;
  let sequence = 0;
  const pending = new Map<number, () => void>();
  const requested = new Map<number, () => void>();
  const state: PlaybackState = { loadedReplay: replay, currentStep: -1, autoPlay: true, rateMs: 500 };
  const session = { active: true };
  const advance = vi.fn((step: number) => {
    state.currentStep = step;
    controller.sync(state, session.active);
  });
  const pause = vi.fn(() => {
    state.autoPlay = false;
    controller.sync(state, session.active);
  });
  const idle = vi.fn();
  const cancel = vi.fn((handle: number) => pending.delete(handle));
  const controller = createReplayPlaybackController({
    read: () => ({ state, active: session.active }), advance, pause, idle,
    scheduler: {
      now: () => now,
      cancel,
      request: (callback) => {
        const handle = ++sequence;
        pending.set(handle, callback);
        requested.set(handle, callback);
        return handle;
      },
    },
  });
  return {
    state, session, pending, requested, controller, advance, pause, idle, cancel,
    sync: () => controller.sync(state, session.active),
    setTime(time: number) { now = time; },
    frame(time: number) {
      now = time;
      const entry = pending.entries().next().value as [number, () => void] | undefined;
      if (!entry) throw new Error('No pending playback frame.');
      pending.delete(entry[0]);
      entry[1]();
    },
  };
}

describe('replay playback controller', () => {
  it('preserves cue timing, skips beats, and catches up in cue order', () => {
    const h = harness();
    h.sync();
    h.sync();
    expect(h.requested.size).toBe(1);
    h.frame(0);
    expect(h.advance.mock.calls).toEqual([[1]]);
    h.frame(50);
    expect(h.idle).toHaveBeenCalledTimes(1);
    const timeline = buildBattlePresentationTimeline(h.state.loadedReplay!, 500);
    h.frame(timeline.cues[2]!.startMs);
    expect(h.advance.mock.calls).toEqual([[1], [3], [5]]);
    expect(h.pause).toHaveBeenCalledTimes(1);
    expect(h.state.autoPlay).toBe(false);
    expect(h.pending.size).toBe(0);
  });

  it('cancels pause frames, ignores stale callbacks and resumes at the next cue', () => {
    const h = harness();
    h.sync();
    h.frame(0);
    const stale = [...h.pending.values()][0]!;
    h.state.autoPlay = false;
    h.sync();
    expect(h.pending.size).toBe(0);
    stale();
    expect(h.advance.mock.calls).toEqual([[1]]);
    h.state.autoPlay = true;
    h.setTime(10000);
    h.sync();
    h.frame(10000);
    expect(h.advance.mock.calls).toEqual([[1], [3]]);
    h.frame(10240);
    expect(h.advance.mock.calls).toEqual([[1], [3], [5]]);
    expect(h.pending.size).toBe(0);
  });

  it('restarts rate changes without retaining old frames or repeating the current cue', () => {
    const h = harness();
    h.sync();
    h.frame(0);
    const stale = [...h.pending.values()][0]!;
    h.state.rateMs = 1000;
    h.sync();
    stale();
    expect(h.pending.size).toBe(1);
    expect(h.advance.mock.calls).toEqual([[1]]);
    h.frame(0);
    expect(h.advance.mock.calls).toEqual([[1], [3]]);
    h.frame(400);
    expect(h.advance.mock.calls).toEqual([[1], [3]]);
    h.frame(480);
    expect(h.advance.mock.calls).toEqual([[1], [3], [5]]);
  });

  it('rebases external forward and backward seeks while playing', () => {
    const h = harness();
    h.sync();
    h.frame(0);
    h.state.currentStep = 3;
    h.sync();
    h.frame(0);
    expect(h.advance.mock.calls).toEqual([[1], [5]]);
    h.state.currentStep = -1;
    h.state.autoPlay = true;
    h.sync();
    h.frame(0);
    expect(h.advance.mock.calls).toEqual([[1], [5], [1]]);
  });

  it('uses replay reference identity when a same-ID replay replaces the current one', () => {
    const h = harness();
    h.sync();
    const stale = [...h.pending.values()][0]!;
    h.state.loadedReplay = makeReplay(['beat', 'beat', 'buff', 'attack']);
    h.sync();
    stale();
    expect(h.advance).not.toHaveBeenCalled();
    h.frame(0);
    expect(h.advance.mock.calls).toEqual([[2]]);
  });

  it('observes leaving the screen before a reactive sync and drops all pending work', () => {
    const h = harness();
    h.sync();
    h.session.active = false;
    h.frame(0);
    expect(h.advance).not.toHaveBeenCalled();
    expect(h.pending.size).toBe(0);
    h.session.active = true;
    h.sync();
    h.frame(0);
    expect(h.advance.mock.calls).toEqual([[1]]);
  });

  it('does not continue a catch-up loop after an advance callback switches replays', () => {
    const h = harness();
    h.advance.mockImplementationOnce((step) => {
      h.state.currentStep = step;
      h.state.loadedReplay = makeReplay(['beat', 'move']);
      h.state.currentStep = -1;
      h.sync();
    });
    h.sync();
    h.frame(10000);
    expect(h.advance.mock.calls).toEqual([[1]]);
    expect(h.pending.size).toBe(1);
    h.frame(10000);
    expect(h.advance.mock.calls).toEqual([[1], [1]]);
    expect(h.pending.size).toBe(0);
  });

  it('pauses at the end or with no visual cues without scheduling a frame', () => {
    const h = harness(makeReplay(['beat', 'beat']));
    h.sync();
    expect(h.pause).toHaveBeenCalledTimes(1);
    expect(h.pending.size).toBe(0);
    h.state.loadedReplay = makeReplay();
    h.state.currentStep = 5;
    h.state.autoPlay = true;
    h.sync();
    expect(h.pause).toHaveBeenCalledTimes(2);
    expect(h.pending.size).toBe(0);
  });

  it('disposes idempotently and cannot resurrect from queued callbacks or sync', () => {
    const h = harness();
    h.sync();
    const stale = [...h.pending.values()][0]!;
    h.controller.dispose();
    h.controller.dispose();
    stale();
    h.sync();
    expect(h.pending.size).toBe(0);
    expect(h.advance).not.toHaveBeenCalled();
    expect(h.cancel).toHaveBeenCalledTimes(1);
  });
});
