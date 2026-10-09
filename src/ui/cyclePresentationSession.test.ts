import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { resolveAssignedRifts } from '../engine/game';
import type { RiftResolutionRecord } from '../engine/types';
import { buildBattlePresentationTimeline } from '../rendering/battlePresentationTimeline';
import { draftFixture } from './__fixtures__/essenceDraft';
import { createCyclePresentationSession, cyclePresentationDurations, RIFT_BATTLE_STEP_MS,
  RIFT_BATTLE_RESULT_HANDOFF_MS, RIFT_BATTLE_LATE_PHASE_DELAY_MS,
  BATTLE_LOG_ARRIVAL_FLIGHT_MS, BATTLE_LOG_ARRIVAL_STAGGER_MS } from './cyclePresentationSession';

type Animation = { resolution: { records: readonly RiftResolutionRecord[] } };
const base = draftFixture();
const rift = base.openRifts[0]!;
const records = resolveAssignedRifts({ ...base, openRifts: [rift],
  troops: base.troops.map(troop => ({ ...troop, assignmentRiftId: rift.id })) }).records;

function setup() {
  let animation: Animation | null = { resolution: { records } };
  let nextHandle = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const frames = new Map<number, () => void>();
  const runtime = {
    setTimeout: vi.fn((callback: () => void, delay: number) => {
      const handle = nextHandle++;
      timers.set(handle, { callback, delay });
      return handle;
    }),
    clearTimeout: vi.fn((handle: number) => { timers.delete(handle); }),
    requestAnimationFrame: vi.fn((callback: () => void) => {
      const handle = nextHandle++;
      frames.set(handle, callback);
      return handle;
    }),
    cancelAnimationFrame: vi.fn((handle: number) => { frames.delete(handle); }),
  };
  const options = { runtime: () => runtime, afterRender: vi.fn(() => Promise.resolve()),
    isCurrent: (candidate: Animation) => candidate === animation, finish: vi.fn() };
  const session = createCyclePresentationSession(options);
  function fireTimer(handle: number): void {
    const timer = timers.get(handle)!;
    timers.delete(handle);
    timer.callback();
  }
  return { session, options, runtime, timers, frames, fireTimer,
    animation: () => animation!, replace: (value: Animation | null) => { animation = value; } };
}

describe('cycle presentation timing', () => {
  it('preserves shared timeline, PvP delay and staggered arrivals without mutating records', () => {
    const original = JSON.stringify(records);
    const ordinary = cyclePresentationDurations(records);
    const battle = Math.max(...records.map(record => buildBattlePresentationTimeline(record.replay, RIFT_BATTLE_STEP_MS).durationMs));
    expect(ordinary).toEqual({ battleMs: battle + RIFT_BATTLE_RESULT_HANDOFF_MS,
      arrivalMs: BATTLE_LOG_ARRIVAL_FLIGHT_MS + 180,
      totalMs: battle + RIFT_BATTLE_RESULT_HANDOFF_MS + BATTLE_LOG_ARRIVAL_FLIGHT_MS + 180 });
    const pvp = { ...records[0]!, contest: { kind: 'pvp' as const } };
    const multiple = cyclePresentationDurations([...records, pvp]);
    expect(multiple.battleMs).toBe(ordinary.battleMs + RIFT_BATTLE_LATE_PHASE_DELAY_MS);
    expect(multiple.arrivalMs).toBe(ordinary.arrivalMs + BATTLE_LOG_ARRIVAL_STAGGER_MS);
    expect(JSON.stringify(records)).toBe(original);
    expect(cyclePresentationDurations([])).toEqual({ battleMs: 0, arrivalMs: 0, totalMs: 0 });
  });

  it('coalesces repeated synchronization and waits for render plus a frame before arrival', async () => {
    const qa = setup();
    qa.session.synchronize(qa.animation());
    qa.session.synchronize(qa.animation());
    expect(qa.runtime.setTimeout).toHaveBeenCalledTimes(2);
    expect([...qa.timers.values()].map(timer => timer.delay)).toEqual([
      cyclePresentationDurations(records).battleMs, cyclePresentationDurations(records).totalMs,
    ]);
    qa.fireTimer(0);
    expect(get(qa.session)).toEqual({ arrivalActive: true, arrivalReady: false });
    await Promise.resolve();
    expect(qa.frames.size).toBe(1);
    qa.frames.get(2)!();
    expect(get(qa.session)).toEqual({ arrivalActive: true, arrivalReady: true });
  });

  it('finishes exactly once and does not restart during asynchronous store finalization', async () => {
    const qa = setup();
    qa.session.synchronize(qa.animation());
    const finish = qa.timers.get(1)!.callback;
    qa.fireTimer(0);
    await Promise.resolve();
    const frame = qa.frames.get(2)!;
    finish();
    frame();
    finish();
    qa.session.synchronize(qa.animation());
    expect(qa.options.finish.mock.calls).toEqual([[qa.animation()]]);
    expect(qa.runtime.setTimeout).toHaveBeenCalledTimes(2);
    expect(qa.runtime.cancelAnimationFrame).toHaveBeenCalledWith(2);
    expect(get(qa.session)).toEqual({ arrivalActive: false, arrivalReady: false });
  });

  it('replaces the animation identity and rejects callbacks already queued for the old one', async () => {
    const qa = setup();
    qa.session.synchronize(qa.animation());
    const oldFinish = qa.timers.get(1)!.callback;
    qa.fireTimer(0);
    const replacement = { resolution: { records: [...records] } };
    qa.replace(replacement);
    qa.session.synchronize(replacement);
    await Promise.resolve();
    oldFinish();
    expect(qa.frames.size).toBe(0);
    expect(qa.options.finish).not.toHaveBeenCalled();
    expect(qa.runtime.clearTimeout).toHaveBeenCalledWith(1);
    expect(get(qa.session)).toEqual({ arrivalActive: false, arrivalReady: false });
    qa.fireTimer(3);
    expect(qa.options.finish.mock.calls).toEqual([[replacement]]);
  });

  it('rejects stale callbacks before reactive synchronization catches up', async () => {
    const qa = setup();
    qa.session.synchronize(qa.animation());
    qa.replace(null);
    qa.fireTimer(0);
    qa.fireTimer(1);
    await Promise.resolve();
    expect(qa.options.afterRender).not.toHaveBeenCalled();
    expect(qa.options.finish).not.toHaveBeenCalled();
    expect(qa.frames.size).toBe(0);
  });

  it('cancels zero-valued handles and cannot publish after reset/disposal', async () => {
    const qa = setup();
    qa.session.synchronize(qa.animation());
    const oldArrival = qa.timers.get(0)!.callback;
    qa.session.reset();
    expect(qa.runtime.clearTimeout.mock.calls).toEqual([[0], [1]]);
    oldArrival();
    expect(get(qa.session)).toEqual({ arrivalActive: false, arrivalReady: false });
    qa.session.synchronize(qa.animation());
    qa.fireTimer(2);
    await Promise.resolve();
    const frame = qa.frames.get(4)!;
    qa.session.dispose();
    frame();
    qa.session.synchronize(qa.animation());
    expect(qa.timers.size + qa.frames.size).toBe(0);
    expect(qa.options.finish).not.toHaveBeenCalled();
    expect(get(qa.session)).toEqual({ arrivalActive: false, arrivalReady: false });
  });

  it('does not schedule frames after disposal while rendering is pending', async () => {
    const qa = setup();
    let rendered!: () => void;
    qa.options.afterRender.mockImplementation(() => new Promise(resolve => { rendered = resolve; }));
    qa.session.synchronize(qa.animation());
    qa.fireTimer(0);
    qa.session.dispose();
    rendered();
    await Promise.resolve();
    expect(qa.runtime.requestAnimationFrame).not.toHaveBeenCalled();
    expect(qa.options.finish).not.toHaveBeenCalled();
  });

  it('finalizes an empty resolution without leaving a frame queued', async () => {
    const qa = setup();
    const empty = { resolution: { records: [] } };
    qa.replace(empty);
    qa.session.synchronize(empty);
    qa.fireTimer(0);
    qa.fireTimer(1);
    await Promise.resolve();
    expect(qa.options.finish.mock.calls).toEqual([[empty]]);
    expect(qa.runtime.requestAnimationFrame).not.toHaveBeenCalled();
    expect(get(qa.session)).toEqual({ arrivalActive: false, arrivalReady: false });
  });
});
