import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import { startNewGame } from '../engine/game';
import { createArchiveSession } from './archiveSession';
import ArchivePanel from './ArchivePanel.svelte';
import { archiveEntries, archiveFixture } from './__fixtures__/archive';

const ServerPanel = ArchivePanel as unknown as { render(props: ComponentProps<ArchivePanel>): { html: string } };

function setup() {
  const { entry, payload, replay } = archiveFixture();
  const game = { ...startNewGame(49), replayIndex: [entry] };
  const session = createArchiveSession();
  session.synchronize(game.replayIndex, 900);
  const props = { game, session, visible: true, arrivalActive: false,
    replays: { has: vi.fn(() => true), payload: vi.fn(() => payload), replay: vi.fn(() => replay) },
    presentation: { visual: () => ({ outcome: entry.outcome, opponentOutcome: false, leftPercent: 50, rightPercent: 0,
      leftTone: 'player' as const, rightTone: 'neutral' as const, ariaLabel: 'Battle result', riftVisualSource: null }),
      style: () => '', opponent: () => false },
    inspection: { preview: vi.fn(), clear: vi.fn(), pin: vi.fn(), highlightedKeys: new Set<string>() },
    select: vi.fn(), open: vi.fn(), openSelected: vi.fn(), previewRift: vi.fn(),
    getRaceUnitPortrait: (race: string, unitClass: string) => `/unit/${race}/${unitClass}.png` };
  return { props, entry, session };
}

describe('archive panel', () => {
  it('renders rows and pagination without resolving unselected replays or issuing commands', () => {
    const { props, session } = setup();
    const game = { ...props.game, replayIndex: archiveEntries(12) };
    session.synchronize(game.replayIndex, 900);
    const html = ServerPanel.render({ ...props, game }).html;
    expect(html).toContain('Page 1 / 2');
    expect(html).toContain('Battle archive panel');
    expect(html).toContain('data-tutorial-target="archive-card"');
    expect(props.replays.replay).not.toHaveBeenCalled();
    for (const command of [props.select, props.open, props.openSelected]) expect(command).not.toHaveBeenCalled();
    session.setPage(1);
    const nextPage = ServerPanel.render({ ...props, game }).html;
    expect(nextPage).toContain('Page 2 / 2');
    expect((nextPage.match(/data-tutorial-target="archive-card"/g) ?? []).length).toBe(2);
  });

  it('renders resolved forces, performance and a watch action for the selected archive', () => {
    const { props, entry, session } = setup();
    session.select(entry.replayId);
    const html = ServerPanel.render(props).html;
    expect(html).toContain('Back to archive');
    expect(html).toContain('Player Forces');
    expect(html).toContain('Human Soldier');
    expect(html).toContain('--archive-health-scale:');
    expect(html).toContain('aria-label="Watch Battle"');
    expect(props.replays.replay).toHaveBeenCalledTimes(1);
  });

  it('retains summary-only replay states and hides the surface outside Rifts', () => {
    const { props, entry, session } = setup();
    session.select(entry.replayId);
    const summary = { ...props.game, replayIndex: [{ ...entry, summaryOnly: true }] };
    const html = ServerPanel.render({ ...props, game: summary }).html;
    expect(html).toContain('Summary only');
    expect(html).toMatch(/aria-label="Replay unavailable"[^>]*disabled/);
    expect(props.replays.replay).not.toHaveBeenCalled();
    expect(props.replays.payload).not.toHaveBeenCalled();
    expect(ServerPanel.render({ ...props, visible: false }).html.trim()).toBe('');
  });

  it('shows missing payloads without trying to reconstruct a replay', () => {
    const { props, entry, session } = setup();
    session.select(entry.replayId);
    props.replays.has.mockReturnValue(false);
    const html = ServerPanel.render({ ...props, replays: { ...props.replays, payload: () => null } }).html;
    expect(html).toContain('Replay missing');
    expect(html).toMatch(/aria-label="Replay unavailable"[^>]*disabled/);
    expect(props.replays.replay).not.toHaveBeenCalled();
  });
});
