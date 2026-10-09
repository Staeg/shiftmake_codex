import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import GameOverDialog from './GameOverDialog.svelte';

const ServerDialog = GameOverDialog as unknown as {
  render: (props: ComponentProps<GameOverDialog>) => { html: string };
};

describe('game over dialog', () => {
  it.each([0, 37])('presents the authoritative %i VP without running actions during render', (victoryPoints) => {
    const onContinue = vi.fn();
    const onReturnToMenu = vi.fn();
    const { html } = ServerDialog.render({ victoryPoints, onContinue, onReturnToMenu });
    expect(html).toContain(`You finished the scored run with ${victoryPoints} VP.`);
    expect(html).toContain('role="dialog" aria-modal="true" aria-labelledby="game-over-title"');
    expect(html).toContain('id="game-over-title"');
    expect(html).toContain('data-ui-name="Continue playing button"');
    expect(html).toContain('data-ui-name="Back to menu button"');
    expect(onContinue).not.toHaveBeenCalled();
    expect(onReturnToMenu).not.toHaveBeenCalled();
  });
});
