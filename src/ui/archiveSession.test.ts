import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { createArchiveSession } from './archiveSession';
import { archiveEntries } from './__fixtures__/archive';

describe('archive presentation session', () => {
  it('toggles selection and clears entries that have been removed', () => {
    const session = createArchiveSession();
    const entries = archiveEntries(8);
    session.synchronize(entries, 900);
    session.toggle('qa-2');
    expect(get(session).selectedId).toBe('qa-2');
    session.toggle('qa-2');
    expect(get(session).selectedId).toBeNull();
    session.select('qa-7');
    session.synchronize(entries.slice(0, 4), 900);
    expect(get(session).selectedId).toBeNull();
  });

  it('preserves selection and pagination across view remounts and clamps resize/removal', () => {
    const session = createArchiveSession();
    const entries = archiveEntries(40);
    session.synchronize(entries, 900);
    expect(get(session)).toMatchObject({ pageSize: 10, pageCount: 4 });
    session.setPage(3);
    session.select('qa-35');
    const first = get(session);
    session.synchronize(entries, 900);
    expect(get(session)).toBe(first);
    session.synchronize(entries, 2000);
    expect(get(session)).toMatchObject({ pageSize: 12, page: 3, pageCount: 4, selectedId: 'qa-35' });
    session.synchronize(entries.slice(0, 2), 400);
    expect(get(session)).toMatchObject({ pageSize: 4, page: 0, pageCount: 1, selectedId: null });
    session.setPage(-20);
    expect(get(session).page).toBe(0);
    session.synchronize(entries, 900);
    session.setPage(99);
    expect(get(session).page).toBe(3);
  });
});
