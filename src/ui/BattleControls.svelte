<script lang="ts">
  import { BASE_STEP_MS } from '../rendering/renderingConstants';

  export let replayLength = 0;
  export let currentStep = -1;
  export let autoPlay = false;
  export let rateMs = 125;

  export let onStepBack: () => void;
  export let onStepForward: () => void;
  export let onJumpStart: () => void;
  export let onToggleAuto: () => void;
  export let onSetRate: (ms: number) => void;

  const RATE_MULTIPLIERS = [0.25, 1, 4, 16, 64];
  const RATE_PRESETS = RATE_MULTIPLIERS.map((multiplier) => ({
    label: `${multiplier}×`,
    ms: Math.round(BASE_STEP_MS / multiplier),
  }));

  let rateSelection = String(rateMs);

  $: rateSelection = String(rateMs);

  function handleRateChange(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    onSetRate(Number(select.value));
  }
</script>

<section class="panel replay-control-panel">
  <div class="controls">
    <button class="play-button" data-tutorial-target="replay-play" aria-label={autoPlay ? 'Pause replay' : 'Play replay'} title={autoPlay ? 'Pause replay' : 'Play replay'} on:click={onToggleAuto} disabled={replayLength <= 0}>{autoPlay ? 'Ⅱ' : '▶'}</button>
    <button data-tutorial-target="replay-reset" aria-label="Reset replay" title="Reset replay" on:click={onJumpStart} disabled={currentStep < 0}>↻</button>
    <button data-tutorial-target="replay-previous-step" aria-label="Previous step" title="Previous step" on:click={onStepBack} disabled={currentStep < 0}>←</button>
    <button data-tutorial-target="replay-next-step" aria-label="Next step" title="Next step" on:click={onStepForward} disabled={replayLength <= 0 || currentStep >= replayLength - 1}>→</button>
    <div class="step-readout">
      <span>Step</span>
      <strong>{Math.max(0, currentStep + 1)}/{replayLength}</strong>
    </div>
    <label aria-label="Replay rate">
      <select data-tutorial-target="replay-rate" bind:value={rateSelection} on:change={handleRateChange}>
        {#each RATE_PRESETS as preset}
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
    border-radius: 8px;
    padding: 0.32rem;
    display: block;
  }

  .replay-control-panel {
    width: auto;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.22rem;
  }

  button,
  select {
    background: #1c2631;
    border: 1px solid #324353;
    color: #f4f9ff;
    border-radius: 6px;
    min-height: 1.62rem;
    min-width: 1.62rem;
    padding: 0.18rem 0.32rem;
    font: inherit;
    font-size: 0.74rem;
  }

  button {
    cursor: pointer;
    display: grid;
    place-items: center;
    font-size: 0.82rem;
    line-height: 1;
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

  .step-readout {
    display: grid;
    gap: 0;
    min-width: 3.6rem;
    padding-inline: 0.18rem;
    color: #bfc6ce;
  }

  .step-readout span {
    font-size: 0.54rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9cb0bf;
  }

  .step-readout strong {
    font-size: 0.68rem;
    color: #f4f9ff;
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  select {
    min-width: 3.1rem;
    font-size: 0.68rem;
  }
</style>
