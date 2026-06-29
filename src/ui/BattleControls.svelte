<script lang="ts">
  import { BASE_STEP_MS } from '../rendering/renderingConstants';

  export let replayLength = 0;
  export let currentStep = -1;
  export let autoPlay = false;
  export let speedMs = 125;

  export let onStepBack: () => void;
  export let onStepForward: () => void;
  export let onJumpStart: () => void;
  export let onToggleAuto: () => void;
  export let onSetSpeed: (ms: number) => void;

  const SPEED_MULTIPLIERS = [0.25, 1, 4, 16, 64];
  const SPEED_PRESETS = SPEED_MULTIPLIERS.map((multiplier) => ({
    label: `${multiplier}x`,
    ms: Math.round(BASE_STEP_MS / multiplier),
  }));

  let speedSelection = String(speedMs);

  $: speedSelection = String(speedMs);

  function handleSpeedChange(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    onSetSpeed(Number(select.value));
  }
</script>

<section class="panel">
  <div class="controls">
    <button class="play-button" data-tutorial-target="replay-play" on:click={onToggleAuto} disabled={replayLength <= 0}>{autoPlay ? 'Pause' : 'Play'}</button>
    <button data-tutorial-target="replay-reset" on:click={onJumpStart} disabled={currentStep < 0}>Reset Replay</button>
    <button data-tutorial-target="replay-previous-step" on:click={onStepBack} disabled={currentStep < 0}>Previous Step</button>
    <button data-tutorial-target="replay-next-step" on:click={onStepForward} disabled={replayLength <= 0 || currentStep >= replayLength - 1}>Next Step</button>
  </div>

  <div class="meta">
    <div class="step-readout">
      <span>Step</span>
      <strong>{Math.max(0, currentStep + 1)}/{replayLength}</strong>
    </div>
    <label>
      <span>Speed</span>
      <select data-tutorial-target="replay-speed" bind:value={speedSelection} on:change={handleSpeedChange}>
        {#each SPEED_PRESETS as preset}
          <option value={String(preset.ms)}>{preset.label}</option>
        {/each}
      </select>
    </label>
  </div>
</section>

<style>
  .panel {
    background: linear-gradient(145deg, rgba(20, 24, 32, 0.95), rgba(11, 13, 18, 0.95));
    border: 1px solid #2f3b49;
    border-radius: 14px;
    padding: 0.6rem 0.7rem;
    display: grid;
    gap: 0.55rem;
  }

  .controls {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.3rem;
  }

  button,
  select {
    background: #1c2631;
    border: 1px solid #324353;
    color: #f4f9ff;
    border-radius: 8px;
    min-height: 2.1rem;
    padding: 0.35rem 0.5rem;
    font: inherit;
    font-size: 0.74rem;
  }

  button {
    cursor: pointer;
  }

  .play-button {
    background: linear-gradient(135deg, #f3ce73, #da8f32);
    border-color: rgba(255, 230, 160, 0.82);
    color: #161008;
    font-weight: 800;
    box-shadow:
      0 0 0 1px rgba(255, 238, 183, 0.18),
      0 8px 18px rgba(0, 0, 0, 0.26);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #bfc6ce;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .step-readout {
    display: grid;
    gap: 0.1rem;
  }

  .step-readout span,
  label span {
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9cb0bf;
  }

  .step-readout strong {
    font-size: 0.86rem;
    color: #f4f9ff;
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  @media (max-width: 860px) {
    .controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
