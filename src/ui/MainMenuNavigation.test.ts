import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'svelte';
import MainMenuNavigation from './MainMenuNavigation.svelte';

// Vitest compiles Svelte for SSR; the component's default declarations describe DOM usage.
const ServerMenu = MainMenuNavigation as unknown as {
  render: (props: ComponentProps<MainMenuNavigation>) => { html: string };
};

function renderMenu(debugToolsEnabled: boolean, tutorialLocked = false, tutorialStep?: 'game-start' | 'start-contest') {
  return ServerMenu.render({
    onSelect: () => {}, debugToolsEnabled, tutorialLocked, tutorialStep,
  }).html;
}

describe('main menu navigation presentation', () => {
  it('keeps debug entry conditional and exposes the regular destinations', () => {
    const html = renderMenu(false);
    for (const label of ['Singleplayer', 'Tutorial', 'Multiplayer', 'Settings']) {
      expect(html).toContain(`>${label}</button>`);
    }
    expect(html).not.toContain('>Debug</button>');
    expect(renderMenu(true)).toContain('>Debug</button>');
  });

  it('keeps the tutorial singleplayer exception and locks other navigation visually', () => {
    const html = renderMenu(true, true, 'game-start');
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);
    expect(buttons).toHaveLength(5);
    expect(buttons[0]).not.toContain('tutorial-scene-locked');
    expect(buttons.slice(1).every((button) => button.includes('tutorial-scene-locked'))).toBe(true);
    expect(renderMenu(true, true, 'start-contest').match(/tutorial-scene-locked/g)).toHaveLength(5);
    expect(renderMenu(true)).not.toContain('tutorial-scene-locked');
  });
});
