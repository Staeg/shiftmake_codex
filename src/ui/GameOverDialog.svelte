<script lang="ts">
  export let victoryPoints: number;
  export let onContinue: () => void;
  export let onReturnToMenu: () => void;
</script>

<div class="unlock-race-overlay" role="presentation">
  <div class="unlock-race-dialog panel ui-debug-target" data-ui-name="Game over dialog" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
    <div class="unlock-race-dialog-header">
      <div>
        <p class="eyebrow">Cycle 10 reached</p>
        <h2 id="game-over-title">Game officially over!</h2>
      </div>
    </div>
    <p class="unlock-race-dialog-copy">You finished the scored run with {victoryPoints} VP.</p>
    <div class="actions-grid">
      <button class="primary ui-debug-target" data-ui-name="Continue playing button" on:click={onContinue}>Continue playing</button>
      <button class="ui-debug-target" data-ui-name="Back to menu button" on:click={onReturnToMenu}>Back to menu</button>
    </div>
  </div>
</div>

<style>
  h2, p { margin: 0; }
  .eyebrow {
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ui-color-accent);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }
  .unlock-race-overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--ui-space-md);
    background: rgba(4, 7, 12, 0.72);
    backdrop-filter: blur(10px);
    z-index: 20;
  }
  .panel {
    box-sizing: border-box;
    min-width: 0;
    display: grid;
    gap: var(--ui-panel-gap);
    padding: var(--ui-panel-padding);
    border-radius: var(--ui-panel-radius);
    border: var(--ui-border-subtle);
    background:
      linear-gradient(160deg, var(--ui-color-surface-strong), rgba(10, 15, 24, 0.94)),
      radial-gradient(circle at top right, rgba(95, 135, 170, 0.12), transparent 35%);
    box-shadow: var(--ui-shadow-panel);
  }
  .panel * { min-width: 0; }
  .unlock-race-dialog { width: min(480px, 100%); }
  .unlock-race-dialog-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: start;
  }
  .unlock-race-dialog-copy { color: #c7d3df; }
  .actions-grid {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--ui-space-sm);
    align-items: center;
  }
  button {
    cursor: pointer;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-interactive);
    color: var(--ui-color-text);
    padding: var(--ui-space-sm);
    font: inherit;
  }
  button:active {
    transform: translateY(1px) scale(0.985);
    filter: brightness(0.9);
  }
  .primary {
    background: linear-gradient(135deg, var(--ui-color-accent-strong), var(--ui-color-accent-deep));
    color: #111;
    border-color: rgba(213, 178, 116, 0.6);
  }
</style>
