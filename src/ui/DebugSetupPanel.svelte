<script lang="ts">
  import { formatFixed } from '../engine/fixed';
  import {
    RACES,
    getArmySelectionCost,
    getTroopStartingQuantity,
    getTroopUnlockId,
    TROOP_CATALOG,
    UNLOCKABLE_UNIT_CLASS_IDS,
    UNIT_CLASSES,
  } from '../engine/unitCatalog';
  import type { RaceId, UnitClassId } from '../engine/types';
  import type { ArmyDebugSelection } from '../engine/debugTypes';

  export let player: ArmyDebugSelection;
  export let enemy: ArmyDebugSelection;
  export let seedInput = '';
  export let replaySeed: number | null = null;

  export let onSetArmy: (side: 'player' | 'enemy', key: UnitClassId, value: number) => void;
  export let onSetSeed: (value: string) => void;
  export let onRunBattle: () => void;
  export let onRestart: () => void;

  const SIDE_LABELS = {
    player: 'Player Army',
    enemy: 'Enemy Army',
  } as const;

  const RACE_IDS = Object.keys(RACES) as RaceId[];
  const DEFAULT_UNIT_CLASS_ID = UNLOCKABLE_UNIT_CLASS_IDS[0];

  let addMenuSide: 'player' | 'enemy' | null = null;
  let selectedRaceId: RaceId = RACE_IDS[0];
  let selectedUnitClassId: UnitClassId = DEFAULT_UNIT_CLASS_ID;

  function visibleTroops(selection: ArmyDebugSelection): UnitClassId[] {
    return Object.entries(selection)
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([troopId]) => troopId as UnitClassId)
      .sort((a, b) => TROOP_CATALOG[a].label.localeCompare(TROOP_CATALOG[b].label));
  }

  function handleArmyChange(
    side: 'player' | 'enemy',
    key: UnitClassId,
    event: Event,
  ): void {
    const input = event.currentTarget as HTMLInputElement;
    onSetArmy(side, key, Number(input.value));
  }

  function handleSeedInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    onSetSeed(input.value);
  }

  function openAddMenu(side: 'player' | 'enemy'): void {
    addMenuSide = side;
    selectedRaceId = RACE_IDS[0];
    selectedUnitClassId = DEFAULT_UNIT_CLASS_ID;
  }

  function closeAddMenu(): void {
    addMenuSide = null;
  }

  function handleRaceChange(event: Event): void {
    const input = event.currentTarget as HTMLSelectElement;
    selectedRaceId = input.value as RaceId;
    if (!UNLOCKABLE_UNIT_CLASS_IDS.includes(selectedUnitClassId)) {
      selectedUnitClassId = DEFAULT_UNIT_CLASS_ID;
    }
  }

  function handleTroopClassChange(event: Event): void {
    const input = event.currentTarget as HTMLSelectElement;
    selectedUnitClassId = input.value as UnitClassId;
  }

  function addSelectedTroop(): void {
    if (!addMenuSide) {
      return;
    }

    const troopId = getTroopUnlockId(selectedRaceId, selectedUnitClassId);
    const currentCount = (addMenuSide === 'player' ? player : enemy)[troopId] ?? 0;
    onSetArmy(addMenuSide, troopId, currentCount + getTroopStartingQuantity(troopId));
    closeAddMenu();
  }

  $: playerVisibleTroops = visibleTroops(player);
  $: enemyVisibleTroops = visibleTroops(enemy);
  $: availableUnitClassIds = UNLOCKABLE_UNIT_CLASS_IDS;
  $: playerTotalCost = getArmySelectionCost(player);
  $: enemyTotalCost = getArmySelectionCost(enemy);
</script>

<section class="panel">
  <h2>Debug Setup</h2>
  <p class="hint">Only active troop combinations are shown. Use + to add a race and troop class.</p>

  <div class="army-grid">
    {#each ['player', 'enemy'] as side}
      <div class="army-column">
        <div class="army-header">
          <div class="army-title">
            <h3>{SIDE_LABELS[side]}</h3>
            <small>Total Cost: {formatFixed(side === 'player' ? playerTotalCost : enemyTotalCost)}</small>
          </div>
          <button type="button" class="add-button" on:click={() => openAddMenu(side)} aria-label={`Add troop to ${SIDE_LABELS[side]}`}>
            +
          </button>
        </div>

        {#if side === 'player' ? playerVisibleTroops.length === 0 : enemyVisibleTroops.length === 0}
          <p class="empty-state">No troops selected yet.</p>
        {/if}

        {#each side === 'player' ? playerVisibleTroops : enemyVisibleTroops as key}
          <label class="troop-row">
            <span class="troop-label">{TROOP_CATALOG[key].label}</span>
            <input class="count-input" type="number" min="0" max="40" value={(side === 'player' ? player : enemy)[key]} on:change={(event) => handleArmyChange(side, key, event)} />
          </label>
        {/each}
      </div>
    {/each}
  </div>

  {#if addMenuSide}
    <div class="add-menu" role="dialog" aria-label="Add troop">
      <div class="add-menu-header">
        <strong>Add Troop</strong>
        <button type="button" class="ghost-button" on:click={closeAddMenu}>Close</button>
      </div>

      <div class="add-menu-grid">
        <label>
          <span>Race</span>
          <select value={selectedRaceId} on:change={handleRaceChange}>
            {#each RACE_IDS as raceId}
              <option value={raceId}>{RACES[raceId].label}</option>
            {/each}
          </select>
        </label>

        <label>
          <span>Troop Class</span>
          <select value={selectedUnitClassId} on:change={handleTroopClassChange}>
            {#each availableUnitClassIds as unitClassId}
              <option value={unitClassId}>{UNIT_CLASSES[unitClassId].label}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="add-preview">
        <span>Will add</span>
        <strong>{TROOP_CATALOG[getTroopUnlockId(selectedRaceId, selectedUnitClassId)].label}</strong>
        <small>to {SIDE_LABELS[addMenuSide]}</small>
      </div>

      <div class="add-actions">
        <button type="button" class="primary" on:click={addSelectedTroop}>Add troop</button>
        <button type="button" class="ghost-button" on:click={closeAddMenu}>Cancel</button>
      </div>
    </div>
  {/if}

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
    font-size: clamp(0.76rem, 1.2vw, 0.9rem);
    line-height: 1.45;
  }

  .army-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .army-column {
    display: grid;
    align-content: start;
    gap: 0.55rem;
    min-height: 0;
  }

  .army-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .army-header h3 {
    min-width: 0;
    flex: 1 1 auto;
    font-size: clamp(1.1rem, 2vw, 1.7rem);
    line-height: 1.1;
  }

  .army-title {
    min-width: 0;
    flex: 1 1 auto;
    display: grid;
    gap: 0.15rem;
  }

  .army-title small {
    color: #8da3b9;
    font-size: 0.78rem;
  }

  .troop-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .troop-label {
    min-width: 0;
    flex: 1 1 auto;
    font-size: clamp(0.86rem, 1.6vw, 1rem);
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .empty-state {
    color: #90a0b1;
    font-size: 0.82rem;
    padding: 0.5rem 0.65rem;
    border: 1px dashed #324353;
    border-radius: 9px;
    background: rgba(12, 18, 24, 0.45);
  }

  input,
  select {
    width: 100px;
    background: #0c1218;
    border: 1px solid #34485d;
    color: #ecf2f9;
    border-radius: 7px;
    padding: 0.35rem 0.45rem;
    font: inherit;
  }

  .count-input {
    width: 2.7rem;
    min-width: 2.7rem;
    padding: 0.2rem 0.3rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .count-input::-webkit-outer-spin-button,
  .count-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  select {
    width: 100%;
  }

  .add-button,
  .ghost-button {
    background: #17202a;
    border: 1px solid #324353;
    color: #f4f9ff;
    border-radius: 8px;
    padding: 0.4rem 0.65rem;
    cursor: pointer;
    font: inherit;
  }

  .add-button {
    min-width: 2.2rem;
    flex: 0 0 auto;
    padding: 0.25rem 0.5rem;
    font-size: 1.15rem;
    line-height: 1;
  }

  .add-menu {
    display: grid;
    gap: 0.75rem;
    padding: 0.85rem;
    border: 1px solid #3d5570;
    border-radius: 12px;
    background: linear-gradient(160deg, rgba(17, 26, 35, 0.98), rgba(11, 16, 24, 0.98));
  }

  .add-menu-header,
  .add-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.6rem;
  }

  .add-menu-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .add-menu-grid label,
  .seed-row label {
    display: grid;
    gap: 0.35rem;
  }

  .add-preview {
    display: grid;
    gap: 0.15rem;
    padding: 0.55rem 0.65rem;
    border-radius: 10px;
    background: rgba(12, 18, 24, 0.6);
    border: 1px solid #2f4155;
    color: #c8d6e4;
  }

  .add-preview small {
    color: #8da3b9;
  }

  .seed-row {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
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
    .army-grid,
    .add-menu-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
