<script context="module" lang="ts">
  export type MainMenuView = 'home' | 'singleplayer' | 'tutorial' | 'multiplayer' | 'debug' | 'settings';
</script>

<script lang="ts">
  import type { TutorialStepId } from '../store/tutorial';

  export let onSelect: (view: MainMenuView) => void;
  export let debugToolsEnabled: boolean;
  export let tutorialLocked: boolean;
  export let tutorialStep: TutorialStepId | undefined;
</script>

<div class="main-menu-actions ui-debug-target" data-ui-name="Main menu actions">
  <button class="primary" class:tutorial-scene-locked={tutorialLocked && tutorialStep !== 'game-start'} data-ui-name="Main menu Singleplayer" on:click={() => onSelect('singleplayer')}>Singleplayer</button>
  <button class:tutorial-scene-locked={tutorialLocked} on:click={() => onSelect('tutorial')}>Tutorial</button>
  <button class:tutorial-scene-locked={tutorialLocked} on:click={() => onSelect('multiplayer')}>Multiplayer</button>
  {#if debugToolsEnabled}
    <button class:tutorial-scene-locked={tutorialLocked} on:click={() => onSelect('debug')}>Debug</button>
  {/if}
  <button class:tutorial-scene-locked={tutorialLocked} on:click={() => onSelect('settings')}>Settings</button>
</div>

<style>
  .main-menu-actions {
    width: min(360px, 100%);
    justify-self: center;
    display: grid;
    gap: var(--ui-space-sm);
  }

  button {
    min-width: 220px;
    min-height: 3.3rem;
    padding: 0.9rem 1.2rem;
    font-size: 1rem;
    cursor: pointer;
  }

  .primary {
    border: 1px solid rgba(213, 178, 116, 0.6);
    border-radius: var(--ui-panel-radius-tight);
    background: linear-gradient(135deg, var(--ui-color-accent-strong), var(--ui-color-accent-deep));
    color: #111;
    font: inherit;
    font-size: 1rem;
  }

  button:not(:disabled):active {
    transform: translateY(1px) scale(0.985);
    filter: brightness(0.9);
  }

  button.tutorial-scene-locked {
    cursor: not-allowed;
    filter: grayscale(1);
    opacity: 0.48;
  }
</style>
