import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { createPlanningAttentionSession, ESSENCE_ATTENTION_MS } from './planningAttentionSession';

function fixture() {
  const callbacks = new Map<number, () => void>();
  let nextId = 0;
  const runtime = {
    setTimeout: vi.fn((callback: () => void, _delay: number) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    }),
    clearTimeout: vi.fn((id: number) => { callbacks.delete(id); }),
  };
  const session = createPlanningAttentionSession(() => runtime);
  session.synchronize('slot:seed:cycle:planning:overworld');
  return { session, runtime, callbacks };
}

describe('planning attention lifecycle', () => {
  it('expires the Essence pulse after the existing delay, independently of hover', () => {
    const { session, runtime, callbacks } = fixture();
    session.setCycleHovered(true);
    session.pulseEssenceDraft();
    expect(get(session)).toEqual({ essenceDraft: true, cycleHovered: true });
    expect(runtime.setTimeout).toHaveBeenCalledWith(expect.any(Function), ESSENCE_ATTENTION_MS);
    callbacks.get(0)!();
    expect(get(session)).toEqual({ essenceDraft: false, cycleHovered: true });
    session.setCycleHovered(false);
    expect(get(session).cycleHovered).toBe(false);
  });

  it('restarts a pulse and rejects an already queued callback from the previous pulse', () => {
    const { session, runtime, callbacks } = fixture();
    session.pulseEssenceDraft();
    const stale = callbacks.get(0)!;
    session.pulseEssenceDraft();
    expect(runtime.clearTimeout).toHaveBeenCalledWith(0);
    expect(callbacks.size).toBe(1);
    stale();
    expect(get(session).essenceDraft).toBe(true);
    callbacks.get(1)!();
    expect(get(session).essenceDraft).toBe(false);
  });

  it('retains attention through same-context updates without starting another timer', () => {
    const { session, runtime } = fixture();
    session.pulseEssenceDraft();
    session.setCycleHovered(true);
    session.synchronize('slot:seed:cycle:planning:overworld');
    expect(get(session)).toEqual({ essenceDraft: true, cycleHovered: true });
    expect(runtime.setTimeout).toHaveBeenCalledTimes(1);
    expect(runtime.clearTimeout).not.toHaveBeenCalled();
  });

  it.each(['different-slot', 'different-seed', 'different-cycle', 'different-phase', 'different-screen'])('clears attention on %s context replacement', nextContext => {
    const { session, callbacks, runtime } = fixture();
    session.pulseEssenceDraft();
    const stale = callbacks.get(0)!;
    session.setCycleHovered(true);
    session.synchronize(nextContext);
    expect(get(session)).toEqual({ essenceDraft: false, cycleHovered: false });
    expect(runtime.clearTimeout).toHaveBeenCalledWith(0);
    expect(callbacks.size).toBe(0);
    stale();
    expect(get(session).essenceDraft).toBe(false);
  });

  it('resets explicitly and releases a zero-valued timer handle', () => {
    const { session, runtime, callbacks } = fixture();
    session.pulseEssenceDraft();
    session.setCycleHovered(true);
    session.reset();
    expect(runtime.clearTimeout).toHaveBeenCalledWith(0);
    expect(callbacks.size).toBe(0);
    expect(get(session)).toEqual({ essenceDraft: false, cycleHovered: false });
  });

  it('disposes idempotently and cannot schedule or update attention afterward', () => {
    const { session, runtime, callbacks } = fixture();
    session.pulseEssenceDraft();
    const stale = callbacks.get(0)!;
    session.dispose();
    session.dispose();
    session.pulseEssenceDraft();
    session.setCycleHovered(true);
    session.synchronize('another-context');
    stale();
    expect(get(session)).toEqual({ essenceDraft: false, cycleHovered: false });
    expect(callbacks.size).toBe(0);
    expect(runtime.setTimeout).toHaveBeenCalledTimes(1);
    expect(runtime.clearTimeout).toHaveBeenCalledTimes(1);
  });
});
