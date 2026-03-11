<script lang="ts">
  import type { ArmyDebugSelection } from '../engine/types';

  export let player: ArmyDebugSelection;
  export let enemy: ArmyDebugSelection;
  export let seedInput = '';
  export let replaySeed: number | null = null;

  export let onSetArmy: (side: 'player' | 'enemy', key: keyof ArmyDebugSelection, value: number) => void;
  export let onSetSeed: (value: string) => void;
  export let onRunBattle: () => void;
  export let onRestart: () => void;

  const UNIT_KEYS: Array<keyof ArmyDebugSelection> = ['swordsman', 'peasant', 'archer'];

  function handleArmyChange(
    side: 'player' | 'enemy',
    key: keyof ArmyDebugSelection,
    event: Event,
  ): void {
    const input = event.currentTarget as HTMLInputElement;
    onSetArmy(side, key, Number(input.value));
  }

  function handleSeedInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    onSetSeed(input.value);
  }
</script>

<section class="panel">
  <h2>Debug Setup</h2>
  <p class="hint">Set how many units of each type fight on both sides.</p>

  <div class="army-grid">
    <div>
      <h3>Player Army</h3>
      {#each UNIT_KEYS as key}
        <label>
          <span>{key}</span>
          <input type="number" min="0" max="40" value={player[key]} on:change={(event) => handleArmyChange('player', key, event)} />
        </label>
      {/each}
    </div>

    <div>
      <h3>Enemy Army</h3>
      {#each UNIT_KEYS as key}
        <label>
          <span>{key}</span>
          <input type="number" min="0" max="40" value={enemy[key]} on:change={(event) => handleArmyChange('enemy', key, event)} />
        </label>
      {/each}
    </div>
  </div>

  <div class="seed-row">
    <label>
      <span>Seed</span>
      <input
        type="text"
        placeholder="leave blank for random"
        value={seedInput}
        on:input={handleSeedInput}
      />
    </label>
    {#if replaySeed !== null}
      <small>Last seed: {replaySeed}</small>
    {/if}
  </div>

  <div class="actions">
    <button class="primary" on:click={onRunBattle}>Run battle</button>
    <button on:click={onRestart} disabled={replaySeed === null}>Restart with same seed</button>
  </div>
</section>

<style>
  .panel {
    background: linear-gradient(145deg, rgba(20, 24, 32, 0.95), rgba(11, 13, 18, 0.95));
    border: 1px solid #2f3b49;
    border-radius: 14px;
    padding: 1rem;
    display: grid;
    gap: 0.9rem;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  .hint {
    color: #a8b1bb;
    font-size: 0.9rem;
  }

  .army-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .army-grid label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.4rem;
    gap: 0.5rem;
  }

  input {
    width: 100px;
    background: #0c1218;
    border: 1px solid #34485d;
    color: #ecf2f9;
    border-radius: 7px;
    padding: 0.35rem 0.45rem;
    font: inherit;
  }

  .seed-row {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .seed-row label {
    display: grid;
    gap: 0.35rem;
  }

  .actions {
    display: flex;
    gap: 0.6rem;
  }

  button {
    background: #1c2631;
    border: 1px solid #324353;
    color: #f4f9ff;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    font: inherit;
  }

  button.primary {
    background: #324f75;
    border-color: #6291ca;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 860px) {
    .army-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
