import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import type { BattleReplay, BattleUnit } from '../engine/types';
import { createReplayPlaybackState } from '../store/replayPlaybackState';
import { replayPlaybackStore } from '../store/gameStore';
import ReplayViewer from './ReplayViewer.svelte';

vi.mock('../store/gameStore', async () => {
  const { writable } = await import('svelte/store');
  const { createReplayPlaybackState } = await import('../store/replayPlaybackState');
  const state = writable(createReplayPlaybackState());
  return {
    replayPlaybackStore: state,
    gameSessionStore: writable({ screen: 'replay', tutorialProgress: null }),
    gameStore: { subscribe: state.subscribe, jumpTo: vi.fn(), setAutoPlay: vi.fn(), stepBackward: vi.fn(),
      stepForward: vi.fn(), setRateMs: vi.fn(), selectEvent: vi.fn() },
  };
});

const ServerViewer = ReplayViewer as unknown as {
  render(props: ComponentProps<ReplayViewer>): { html: string };
};
const playback = replayPlaybackStore as unknown as {
  set(state: ReturnType<typeof createReplayPlaybackState>): void;
};

function makeReplay(): BattleReplay {
  const unit: BattleUnit = {
    id: 'p-one', troopInstanceId: null, troopId: 'human/soldier', troopLabel: 'Human Soldier',
    unitClassId: 'soldier', raceId: 'human', side: 'player', role: 'frontline', unitClassTag: 'soldier',
    attributes: [], position: { q: 0, r: 0 }, occupiedHexes: [{ q: 0, r: 0 }], footprintOrientation: 'north',
    stats: { health: 10, damage: 3, rate: 2, move: 1, range: 0, armor: 0, size: 1, capacity: 1 },
    hp: 5, maxHp: 10, readiness: 40, alive: true, engagedWithIds: [],
  };
  return {
    id: 'viewer', seed: 1, riftId: 'viewer-rift', tier: 1, mutatorIds: [], mapRadius: 1, mapHexes: [{ q: 0, r: 0 }],
    initial: { units: [unit] }, steps: [{ index: 0, kind: 'move', actorIds: ['p-one'], targetIds: [],
      message: 'Resolved movement', snapshot: { units: [unit] } }],
    troopProfiles: [{ side: 'player', troopLabel: 'Human Soldier', unitClassId: 'soldier', raceId: 'human',
      role: 'frontline', unitClassTag: 'soldier', attributes: [], stats: unit.stats, abilities: [], statBreakdowns: {} }],
    outcome: 'draw', troopLabels: {}, aliveCounts: [{ player: 1, enemy: 0, byTroopLabel: { 'Human Soldier': 1 } }],
    summary: { playerTroops: ['Human Soldier'], enemyTroops: [], finalPlayerAlive: 1, finalEnemyAlive: 0 },
  };
}

function render(overrides: Partial<ComponentProps<ReplayViewer>> = {}) {
  return ServerViewer.render({ getRaceUnitPortrait: () => '/portrait.png', debugToolsEnabled: false,
    rendererDiagnostics: [], onDiagnostic: vi.fn(), onExit: vi.fn(),
    tutorial: { view: null, locked: false, signal: vi.fn(), prompt: vi.fn() }, ...overrides }).html;
}

describe('replay viewer presentation', () => {
  beforeEach(() => playback.set(createReplayPlaybackState()));

  it('renders its empty viewer, controls and recap entry without a renderer', () => {
    const html = render();
    expect(html).toContain('class="replay-shell');
    expect(html).toContain('Battle Reference');
    expect(html).toContain('Open Battle Recap');
    expect(html).toContain('data-ui-name="Battlefield canvas"');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('role="dialog"');
  });

  it('uses resolved snapshot health and portrait data in its local overview', () => {
    playback.set({ ...createReplayPlaybackState(), loadedReplay: makeReplay() });
    const html = render();
    expect(html).toContain('viewer-rift');
    expect(html).toContain('aria-label="Human Soldier health 5 / 10"');
    expect(html).toContain('aria-label="Human Soldier readiness 40 out of 100"');
    expect(html).toContain('/portrait.png');
    expect(html).toContain('data-ui-name="Collapsed event log health overview"');
    expect(html).toContain('No units standing.');
  });

  it('applies a tutorial view request without exposing local state to App', () => {
    playback.set({ ...createReplayPlaybackState(), loadedReplay: makeReplay() });
    const html = render({ tutorial: { view: { step: 'timeline-event', revision: 1 }, locked: true,
      signal: vi.fn(), prompt: vi.fn() } });
    expect(html).toContain('Resolved movement');
    expect(html).not.toContain('data-ui-name="Collapsed event log health overview"');
    expect(html).toContain('tutorial-scene-locked');
    expect(html).toContain('data-tutorial-target="replay-next-step"');
  });
});
