<script lang="ts">
  export let replayLength = 0;
  export let currentStep = -1;
  export let autoPlay = false;
  export let speedMs = 500;

  export let onStepBack: () => void;
  export let onStepForward: () => void;
  export let onJumpStart: () => void;
  export let onToggleAuto: () => void;
  export let onSetSpeed: (ms: number) => void;

  const BASE_STEP_MS = 500;
  const SPEED_MULTIPLIERS = [0.5, 1, 2, 4, 8];
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
  <h2>Playback</h2>
  <div class="controls">
    <button on:click={onJumpStart} disabled={currentStep < 0}>Start</button>
    <button on:click={onStepBack} disabled={currentStep < 0}>Step -</button>
    <button on:click={onToggleAuto} disabled={replayLength <= 0}>{autoPlay ? 'Pause' : 'Auto'}</button>
    <button on:click={onStepForward} disabled={replayLength <= 0 || currentStep >= replayLength - 1}>Step +</button>
  </div>

  <div class="meta">
    <div>Step: {Math.max(0, currentStep + 1)}/{replayLength}</div>
    <label>
      <span>Speed</span>
      <select bind:value={speedSelection} on:change={handleSpeedChange}>
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
    padding: 1rem;
    display: grid;
    gap: 0.8rem;
  }

  h2 {
    margin: 0;
  }

  .controls {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
  }

  button,
  select {
    background: #1c2631;
    border: 1px solid #324353;
    color: #f4f9ff;
    border-radius: 8px;
    padding: 0.5rem 0.7rem;
    font: inherit;
  }

  button {
    cursor: pointer;
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
    gap: 1rem;
    flex-wrap: wrap;
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  @media (max-width: 860px) {
    .controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
