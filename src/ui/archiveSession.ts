import { writable } from 'svelte/store';
import type { ReplayIndexEntry } from '../engine/types';

export function createArchiveSession() {
  let state = { selectedId: null as string | null, page: 0, pageSize: 4, pageCount: 1 };
  const store = writable(state);
  function update(patch: Partial<typeof state>): void {
    if (Object.entries(patch).every(([key, value]) => state[key as keyof typeof state] === value)) return;
    state = { ...state, ...patch };
    store.set(state);
  }
  return {
    subscribe: store.subscribe,
    synchronize(entries: ReplayIndexEntry[], viewportHeight: number): void {
      const pageSize = Math.max(4, Math.min(12, Math.floor((viewportHeight - 350) / 52)));
      const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
      update({ pageSize, pageCount, page: Math.min(state.page, pageCount - 1),
        selectedId: state.selectedId && entries.some(entry => entry.replayId === state.selectedId) ? state.selectedId : null });
    },
    select(selectedId: string | null): void { update({ selectedId }); },
    toggle(id: string): void { update({ selectedId: state.selectedId === id ? null : id }); },
    setPage(page: number): void { update({ page: Math.max(0, Math.min(state.pageCount - 1, Math.floor(page))) }); },
  };
}

export type ArchiveSession = ReturnType<typeof createArchiveSession>;
