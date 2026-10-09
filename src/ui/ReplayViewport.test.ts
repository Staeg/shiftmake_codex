import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import type { BattleReplay } from '../engine/types';
import { createReplayPlaybackState } from '../store/replayPlaybackState';
import { replayPlaybackStore } from '../store/gameStore';
import ReplayViewport from './ReplayViewport.svelte';

vi.mock('../store/gameStore', async () => {
  const { writable } = await import('svelte/store');
  const { createReplayPlaybackState } = await import('../store/replayPlaybackState');
  return {
    replayPlaybackStore: writable(createReplayPlaybackState()),
    gameSessionStore: writable({ screen: 'replay' }),
    gameStore: { jumpTo: vi.fn(), setAutoPlay: vi.fn(), stepBackward: vi.fn(), stepForward: vi.fn(), setRateMs: vi.fn() },
  };
});

const ServerViewport = ReplayViewport as unknown as {
  render(props: ComponentProps<ReplayViewport>): { html: string };
};
const playback = replayPlaybackStore as unknown as {
  set(state: ReturnType<typeof createReplayPlaybackState>): void;
};

function render() {
  const inspection = { read: vi.fn(), hover: vi.fn(), select: vi.fn(), reset: vi.fn(), beforeNavigate: vi.fn() };
  const onDiagnostic = vi.fn();
  const html = ServerViewport.render({ inspection, onDiagnostic, onControlAction: vi.fn() }).html;
  return { html, inspection, onDiagnostic };
}

describe('replay viewport presentation', () => {
  beforeEach(() => playback.set(createReplayPlaybackState()));

  it('keeps empty controls disabled and does not initialize browser resources during SSR', () => {
    const { html, inspection, onDiagnostic } = render();
    expect(html).toContain('aria-label="Play replay"');
    const controlButtons = [...html.matchAll(/<button\b[^>]*data-tutorial-target="replay-[^"]+"[^>]*>/g)];
    expect(controlButtons).toHaveLength(4);
    expect(controlButtons.every(([button]) => button.includes('disabled'))).toBe(true);
    expect(html).toContain('data-ui-name="Battlefield canvas"');
    expect(inspection.read).not.toHaveBeenCalled();
    expect(inspection.reset).not.toHaveBeenCalled();
    expect(onDiagnostic).not.toHaveBeenCalled();
  });

  it('reads the authoritative playback view and preserves tutorial and zoom selectors', () => {
    const replay: BattleReplay = {
      id: 'viewport', seed: 1, riftId: null, tier: null, mutatorIds: [], mapRadius: 1, mapHexes: [],
      initial: { units: [] }, steps: [{ index: 0, kind: 'move', actorIds: [], targetIds: [], message: '', snapshot: { units: [] } }],
      outcome: 'draw', troopLabels: {}, troopProfiles: [], aliveCounts: [],
      summary: { playerTroops: [], enemyTroops: [], finalPlayerAlive: 0, finalEnemyAlive: 0 },
    };
    playback.set({ ...createReplayPlaybackState(), loadedReplay: replay, currentStep: 0, autoPlay: true, rateMs: 500 });
    const { html } = render();
    expect(html).toContain('aria-label="Pause replay"');
    expect(html).toContain('1/1');
    for (const target of ['replay-play', 'replay-reset', 'replay-previous-step', 'replay-next-step', 'replay-rate']) {
      expect(html).toContain(`data-tutorial-target="${target}"`);
    }
    for (const label of ['Zoom In', 'Zoom Out', 'Reset Zoom']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });
});
