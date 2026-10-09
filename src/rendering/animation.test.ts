import { afterEach, describe, expect, it, vi } from 'vitest';
import { animate } from './animation';

function harness() {
  let sequence = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const requested = vi.fn((callback: FrameRequestCallback) => {
    pending.set(++sequence, callback);
    return sequence;
  });
  const cancelled = vi.fn((handle: number) => pending.delete(handle));
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('requestAnimationFrame', requested);
  vi.stubGlobal('cancelAnimationFrame', cancelled);
  return {
    pending, requested, cancelled,
    frame(time: number) {
      const entry = pending.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!entry) throw new Error('No effect frame queued.');
      pending.delete(entry[0]);
      entry[1](time);
    },
  };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('renderer effect animation', () => {
  it('preserves elapsed interpolation and finishes once without queued work', () => {
    const h = harness();
    const update = vi.fn();
    const finish = vi.fn();
    const cancel = vi.fn();
    const stop = animate(100, update, finish, cancel);
    h.frame(25);
    h.frame(150);
    expect(update.mock.calls).toEqual([[0.25], [1]]);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(h.pending.size).toBe(0);
    stop();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('cancels the queued request before the first frame and ignores stale callbacks', () => {
    const h = harness();
    const update = vi.fn();
    const cancel = vi.fn();
    const stop = animate(100, update, undefined, cancel);
    const stale = [...h.pending.values()][0]!;
    stop();
    stop();
    expect(h.cancelled).toHaveBeenCalledTimes(1);
    expect(h.pending.size).toBe(0);
    stale(50);
    expect(update).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels the next queued frame during an active effect', () => {
    const h = harness();
    const update = vi.fn();
    const cancel = vi.fn();
    const stop = animate(100, update, undefined, cancel);
    h.frame(25);
    stop();
    expect(update.mock.calls).toEqual([[0.25]]);
    expect(h.pending.size).toBe(0);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('does not reschedule or finish after synchronous cancellation inside update', () => {
    const h = harness();
    const finish = vi.fn();
    const cancel = vi.fn();
    const stop = animate(100, () => stop(), finish, cancel);
    h.frame(100);
    expect(h.requested).toHaveBeenCalledTimes(1);
    expect(h.pending.size).toBe(0);
    expect(finish).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
