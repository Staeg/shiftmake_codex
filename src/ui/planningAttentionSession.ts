import { writable } from 'svelte/store';

export const ESSENCE_ATTENTION_MS = 2400;

interface AttentionRuntime {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

export function createPlanningAttentionSession(runtime: () => AttentionRuntime) {
  let state = { essenceDraft: false, cycleHovered: false };
  const store = writable(state);
  let context: string | null = null;
  let pulse: { runtime: AttentionRuntime; timer: number | null } | null = null;
  let disposed = false;

  function update(patch: Partial<typeof state>): void {
    if (Object.entries(patch).every(([key, value]) => state[key as keyof typeof state] === value)) return;
    state = { ...state, ...patch };
    store.set(state);
  }

  function cancelPulse(): void {
    const previous = pulse;
    pulse = null;
    if (previous && previous.timer !== null) previous.runtime.clearTimeout(previous.timer);
  }

  function reset(): void {
    cancelPulse();
    update({ essenceDraft: false, cycleHovered: false });
  }

  return {
    subscribe: store.subscribe,
    synchronize(nextContext: string): void {
      if (disposed || context === nextContext) return;
      context = nextContext;
      reset();
    },
    setCycleHovered(cycleHovered: boolean): void {
      if (!disposed) update({ cycleHovered });
    },
    pulseEssenceDraft(): void {
      if (disposed) return;
      cancelPulse();
      const attempt = { runtime: runtime(), timer: null as number | null };
      pulse = attempt;
      update({ essenceDraft: true });
      attempt.timer = attempt.runtime.setTimeout(() => {
        if (disposed || pulse !== attempt) return;
        pulse = null;
        update({ essenceDraft: false });
      }, ESSENCE_ATTENTION_MS);
    },
    reset,
    dispose(): void {
      disposed = true;
      reset();
    },
  };
}
