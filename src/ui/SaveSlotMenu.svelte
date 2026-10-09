<script lang="ts">
  import type { GameMode } from '../engine/types';
  import type { SaveSlotSummary } from '../store/saveSlots';
  import type { TutorialStepId } from '../store/tutorial';
  import DebugToolsMenu from './DebugToolsMenu.svelte';
  import { slotPhaseLabel } from './detailCards';
  import { gameModeLabel, newGameActionLabel, newGameModeDescription } from './gameModeLabels';

  export let slots: SaveSlotSummary[];
  export let onLoad: (slot: SaveSlotSummary) => void;
  export let onStart: (slot: SaveSlotSummary, mode: GameMode) => void;
  export let onBlocked: () => void;
  export let tutorialLocked: boolean;
  export let tutorialStep: TutorialStepId | undefined;

  const gameModes: GameMode[] = ['campaign', 'ladder', 'contest'];
  let newGameSlot: SaveSlotSummary | null = null;

  function openNewGameMenu(slot: SaveSlotSummary): void {
    if (tutorialLocked && tutorialStep !== 'start-contest') {
      onBlocked();
      return;
    }
    newGameSlot = slot;
  }

  function closeNewGameMenu(): void {
    newGameSlot = null;
  }

  function chooseNewGameMode(slot: SaveSlotSummary, mode: GameMode): void {
    closeNewGameMenu();
    onStart(slot, mode);
  }
</script>

<div class="slot-grid">
  {#each slots as slot}
    <article class="slot-card panel ui-debug-target" data-ui-name={`Save slot ${slot.slotId}`}>
      <div class="slot-card-header">
        <span class="slot-label">Slot {slot.slotId}</span>
        <strong>{slot.status === 'occupied' ? 'Occupied' : 'Empty'}</strong>
      </div>
      {#if slot.status === 'occupied'}
        <div class="slot-meta">
          <span>{gameModeLabel(slot.gameMode)}</span>
          <span>{slot.raceLabel ?? 'In progress'}</span>
          <span>Cycle {slot.cycleNumber}</span>
          <span>{slotPhaseLabel(slot.phase)}</span>
          <span>{slot.lastPlayedAt ? new Date(slot.lastPlayedAt).toLocaleString() : 'No timestamp'}</span>
        </div>
      {:else}
        <p>Empty</p>
      {/if}
      <div class="actions-grid">
        {#if slot.status === 'occupied'}
          <button
            class="primary ui-debug-target"
            class:tutorial-scene-locked={tutorialLocked}
            data-ui-name={`Primary action for save slot ${slot.slotId}`}
            on:click={() => onLoad(slot)}
          >Load Slot</button>
          <DebugToolsMenu mode="campaign-button" reportSlotId={slot.slotId} />
        {/if}
        <button
          class:primary={slot.status === 'empty'}
          class="ui-debug-target"
          class:tutorial-scene-locked={tutorialLocked && tutorialStep !== 'start-contest'}
          data-ui-name={`Start new game for save slot ${slot.slotId}`}
          on:click={() => openNewGameMenu(slot)}
        >Start New Game</button>
      </div>
    </article>
  {/each}
</div>

{#if newGameSlot}
  <div class="new-game-modal-backdrop">
    <button class="new-game-modal-dismiss" aria-label="Close new game menu" on:click={closeNewGameMenu}></button>
    <section
      class="panel new-game-modal ui-debug-target"
      data-ui-name={`New game mode menu for save slot ${newGameSlot.slotId}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-game-title"
    >
      <div class="new-game-modal-header">
        <div>
          <p class="eyebrow">Slot {newGameSlot.slotId}</p>
          <h2 id="new-game-title">Start New Game</h2>
        </div>
        <button class="new-game-close" type="button" aria-label="Close new game menu" on:click={closeNewGameMenu}>Close</button>
      </div>
      <div class="new-game-options">
        {#each gameModes as mode}
          <button
            type="button"
            class="new-game-option primary ui-debug-target"
            class:tutorial-scene-locked={tutorialLocked && !(mode === 'contest' && tutorialStep === 'start-contest')}
            data-ui-name={`${newGameActionLabel(newGameSlot, mode)} for save slot ${newGameSlot.slotId}`}
            on:click={() => chooseNewGameMode(newGameSlot, mode)}
            title={newGameModeDescription(mode)}
          >
            <span>{newGameActionLabel(newGameSlot, mode)}</span>
          </button>
        {/each}
      </div>
    </section>
  </div>
{/if}

<style>

  h2, p {
    margin: 0;
  }

  button {
    cursor: pointer;
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

  .panel {
    box-sizing: border-box;
    min-width: 0;
    display: grid;
    gap: var(--ui-panel-gap);
    padding: var(--ui-panel-padding);
    border-radius: var(--ui-panel-radius);
    border: var(--ui-border-subtle);
    background: linear-gradient(160deg, var(--ui-color-surface-strong), rgba(10, 15, 24, 0.94)), radial-gradient(circle at top right, rgba(95, 135, 170, 0.12), transparent 35%);
    box-shadow: var(--ui-shadow-panel);
  }

  .panel * {
    min-width: 0;
  }

  .slot-grid {
    display: grid;
    gap: var(--ui-space-md);
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .slot-card {
    min-height: 0;
    padding: var(--ui-space-sm);
    gap: var(--ui-space-sm);
    align-content: start;
  }

  .slot-card p {
    color: var(--ui-color-text-muted);
  }

  .slot-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-sm);
  }

  .slot-label {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .slot-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-xs) var(--ui-space-sm);
  }

  .slot-meta span {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .slot-meta span:last-child {
    grid-column: 1 / -1;
  }

  .actions-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-sm);
    align-items: center;
  }

  .slot-card button {
    flex: 1 1 10rem;
    min-height: var(--ui-space-hit);
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-interactive);
    color: var(--ui-color-text);
    padding: var(--ui-space-sm);
    font: inherit;
  }

  .slot-card button.primary {
    background: linear-gradient(135deg, var(--ui-color-accent-strong), var(--ui-color-accent-deep));
    color: #111;
    border-color: rgba(213, 178, 116, 0.6);
  }

  .new-game-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 15;
    display: grid;
    place-items: center;
    padding: var(--ui-space-md);
  }

  .new-game-modal-dismiss {
    position: absolute;
    inset: 0;
    border: 0;
    border-radius: 0;
    background: rgba(3, 7, 12, 0.68);
    backdrop-filter: blur(8px);
  }

  .new-game-modal {
    position: relative;
    z-index: 1;
    width: min(420px, 100%);
    gap: var(--ui-space-md);
  }

  .new-game-modal-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--ui-space-sm);
  }

  .new-game-modal-header h2 {
    font-size: 1.35rem;
    line-height: 1.15;
  }

  .eyebrow {
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ui-color-accent);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .new-game-close {
    min-height: 2rem;
    padding: 0.35rem 0.65rem;
    border-radius: var(--ui-panel-radius-pill);
    border: 1px solid rgba(196, 214, 227, 0.22);
    background: rgba(12, 18, 28, 0.52);
    color: #f4f7fb;
    font: inherit;
    font-size: 0.72rem;
  }

  .new-game-options {
    display: grid;
    gap: 0.65rem;
  }

  .new-game-option {
    position: relative;
    display: grid;
    min-height: var(--ui-space-hit);
    padding: 0.75rem 0.85rem;
    align-content: center;
    border: 1px solid rgba(126, 157, 181, 0.24);
    border-radius: 8px;
    background: var(--ui-color-surface-interactive);
    color: var(--ui-color-text);
    font: inherit;
    text-align: left;
  }

  .new-game-option.primary {
    border-color: rgba(213, 178, 116, 0.6);
    background: linear-gradient(135deg, var(--ui-color-accent-strong), var(--ui-color-accent-deep));
    color: #111;
  }

  .new-game-option:hover, .new-game-option:focus, .new-game-option:focus-visible {
    border-color: rgba(213, 178, 116, 0.58);
    outline: none;
  }

  .new-game-option.primary:hover, .new-game-option.primary:focus, .new-game-option.primary:focus-visible {
    border-color: rgba(244, 205, 118, 0.78);
    background: linear-gradient(135deg, #e0bd79, var(--ui-color-accent-strong));
    box-shadow: 0 0 18px rgba(244, 205, 118, 0.24);
  }

  .new-game-option span {
    color: inherit;
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.15;
    text-transform: uppercase;
  }

  @media (max-width: 1280px) {

    .slot-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
  }

  @media (max-width: 820px) {

    .slot-meta {
      grid-template-columns: 1fr;
    }
  }
</style>
