import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { resolveEnemyCombatant } from '../engine/army';
import { gameStore } from '../store/gameStore';
import { saveToSlot } from '../store/saveSlots';
import App from './App.svelte';
import { draftFixture } from './__fixtures__/essenceDraft';
import { cyclePresentationDurations } from './cyclePresentationSession';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const ServerApp = App as unknown as { render(): { html: string } };

afterEach(() => {
  gameStore.returnToMainMenu();
  vi.unstubAllGlobals();
});

describe('App cycle presentation integration', () => {
  it('renders real resolved cycle data and schedules the battle-to-archive handoff', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    const setTimeout = vi.fn((_callback: () => void, _delay: number) => 7);
    vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900, setTimeout,
      localStorage: storage,
      clearTimeout: vi.fn(), requestAnimationFrame: vi.fn(),
      location: { search: '', href: 'http://127.0.0.1:5174/', origin: 'http://127.0.0.1:5174/', hostname: '127.0.0.1', protocol: 'http:' } });
    const base = draftFixture();
    const rift = { ...base.openRifts[0]!, mutatorIds: [],
      enemyArmy: [resolveEnemyCombatant([], [], 'human', 'knight', 1, 'qa-guardian')] };
    const game = { ...base, activeTroopOffer: null, activeUpgradeOffer: null, essence: 0,
      openRifts: [rift], troops: base.troops.map(troop => ({ ...troop, assignmentRiftId: rift.id })) };
    saveToSlot(storage, 1, game);
    gameStore.initialize();
    gameStore.loadSlot(1);
    gameStore.endCycle(true);
    const animation = get(gameStore).cycleAnimation!;
    expect(animation.resolution.records.length).toBe(1);
    const html = ServerApp.render().html;
    expect(html).toContain('Resolving...');
    expect(setTimeout.mock.calls).toHaveLength(2);
    const { battleMs, totalMs } = cyclePresentationDurations(animation.resolution.records);
    expect(setTimeout.mock.calls.map(call => call[1])).toEqual([battleMs, totalMs]);
  });
});
