<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy, onMount } from 'svelte';
  import { BattleRenderer, type UnitPointerInfo } from '../rendering/BattleRenderer';
  import { canUpgradeStat, getFactionTroops, getFactionUnlockCost, getTroopAddUnitCost, getTroopEffectiveDefinition, getTroopStatUpgradeCost, getTroopStatusCounts, getTroopUnlockCost, getTroopsAssignedToRift } from '../engine/army';
  import { FACTION_UPGRADES, FACTIONS, UNIT_TYPES, getFaction, getFactionUpgrade, getUnitType } from '../engine/unitCatalog';
  import type { BattleUnit, FactionId, RiftInstance, TroopId, TroopStatKey } from '../engine/types';
  import { gameStore } from '../store/gameStore';
  import BattleControls from './BattleControls.svelte';
  import EventLog from './EventLog.svelte';
  import UnitTooltip from './UnitTooltip.svelte';

  const state = gameStore;
  let viewport: HTMLDivElement;
  let renderer: BattleRenderer | null = null;
  let mountedReplayId: string | null = null;
  let autoTimer: ReturnType<typeof setInterval> | null = null;
  let selectedTroopId: TroopId | null = null;
  let selectedRiftId: string | null = null;
  let selectedFactionId: FactionId | null = null;
  let hoveredPointer: UnitPointerInfo | null = null;
  let lockedPointer: UnitPointerInfo | null = null;

  const troopUpgradeOrder: TroopStatKey[] = ['health', 'damage', 'speed', 'armor', 'range', 'capacity'];

  function clearAutoTimer(): void {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  function selectTroop(troopId: TroopId): void {
    selectedTroopId = troopId;
    selectedRiftId = null;
    selectedFactionId = get(state).game.troops.find((troop) => troop.id === troopId)?.factionId ?? null;
  }

  function selectRift(riftId: string): void {
    selectedRiftId = riftId;
    selectedTroopId = null;
    selectedFactionId = null;
  }

  function selectFaction(factionId: FactionId): void {
    selectedFactionId = factionId;
    selectedTroopId = null;
    selectedRiftId = null;
  }

  onMount(async () => {
    gameStore.hydrate();
    renderer = new BattleRenderer(viewport);
    renderer.setInteractionHandlers({
      onUnitHover: (info) => {
        if (!lockedPointer) {
          hoveredPointer = info;
        }
      },
      onUnitClick: (info) => {
        if (lockedPointer?.unitId === info.unitId) {
          lockedPointer = null;
          hoveredPointer = info;
        } else {
          lockedPointer = info;
          hoveredPointer = info;
        }
      },
    });
    await renderer.init();
  });

  onDestroy(() => {
    clearAutoTimer();
    renderer?.destroy();
  });

  $: currentReplay = $state.loadedReplay;
  $: if (renderer && currentReplay && currentReplay.id !== mountedReplayId) {
    renderer.setReplay(currentReplay);
    mountedReplayId = currentReplay.id;
    hoveredPointer = null;
    lockedPointer = null;
  }

  $: if (renderer && currentReplay) {
    renderer.showStep($state.currentStep);
    renderer.setPlaybackTiming($state.autoPlay, $state.speedMs);
  }

  $: currentUnits = (() => {
    if (!currentReplay) return [] as BattleUnit[];
    if ($state.currentStep < 0) return currentReplay.initial.units;
    return currentReplay.steps[$state.currentStep]?.snapshot.units ?? currentReplay.initial.units;
  })();

  $: currentUnitById = new Map(currentUnits.map((unit) => [unit.id, unit]));
  $: activePointer = lockedPointer ?? hoveredPointer;
  $: activeUnit = activePointer ? currentUnitById.get(activePointer.unitId) ?? null : null;
  $: engagedUnits = activeUnit ? activeUnit.engagedWithIds.map((id) => currentUnitById.get(id)).filter(Boolean) as BattleUnit[] : [];

  $: if (renderer) {
    const strong = new Set<string>();
    if ($state.selectedEvent !== null && currentReplay) {
      const step = currentReplay.steps[$state.selectedEvent];
      step?.actorIds.forEach((id) => strong.add(id));
      step?.targetIds.forEach((id) => strong.add(id));
    }
    if (activeUnit) {
      strong.add(activeUnit.id);
    }
    const faint = activeUnit ? activeUnit.engagedWithIds.filter((id) => !strong.has(id)) : [];
    renderer.setHighlights([...strong], faint);
  }

  $: {
    clearAutoTimer();
    if ($state.autoPlay && currentReplay) {
      autoTimer = setInterval(() => {
        const snapshot = get(gameStore);
        if (!snapshot.loadedReplay) {
          gameStore.setAutoPlay(false);
          return;
        }
        const before = snapshot.currentStep;
        gameStore.stepForward();
        const after = get(gameStore).currentStep;
        if (after === before) {
          gameStore.setAutoPlay(false);
        }
      }, $state.speedMs);
    }
  }

  $: discoveredRifts = $state.game.openRifts.filter((rift) => rift.state === 'discovered');
  $: selectedTroop = selectedTroopId ? $state.game.troops.find((troop) => troop.id === selectedTroopId) ?? null : null;
  $: selectedRift = selectedRiftId ? $state.game.openRifts.find((rift) => rift.id === selectedRiftId) ?? null : null;
  $: factionTroops = selectedFactionId ? getFactionTroops($state.game, selectedFactionId) : [];
  $: statusCounts = getTroopStatusCounts($state.game);
  $: factionsById = Object.keys(FACTIONS) as FactionId[];
  $: aliveSummary = currentReplay ? currentReplay.aliveCounts[Math.max(0, $state.currentStep + 1)] ?? currentReplay.aliveCounts[0] : null;

  function troopAssignedTo(rift: RiftInstance, troopId: TroopId): boolean {
    return getTroopsAssignedToRift($state.game, rift.id).some((troop) => troop.id === troopId);
  }
</script>

{#if $state.game.phase === 'faction_draft'}
  <main class="draft-screen">
    <section class="draft-panel">
      <p class="eyebrow">Shiftmake</p>
      <h1>Choose Your First Banner</h1>
      <p class="intro">Pick one faction to lead for free. Your first soldier troop joins immediately, and the first cycle of Rifts will open once the banner is raised.</p>

      <div class="draft-grid">
        {#each $state.game.availableFactionDraft as factionId}
          <button class="draft-card" on:click={() => gameStore.chooseStartingFaction(factionId)}>
            <strong>{getFaction(factionId).label}</strong>
            <span>{getFaction(factionId).description}</span>
            <small>Starts with {getFaction(factionId).singularLabel} Soldiers</small>
          </button>
        {/each}
      </div>
    </section>
  </main>
{:else if $state.screen === 'replay' && currentReplay}
  <main class="replay-shell">
    <section class="left">
      <div class="panel">
        <p class="eyebrow">Replay</p>
        <h2>{currentReplay.riftId ?? 'Debug Battle'}</h2>
        <p>Outcome: <strong>{currentReplay.outcome}</strong></p>
        <p>Tier: {currentReplay.tier ?? '-'}</p>
        <p>Mutators: {currentReplay.mutatorIds.length === 0 ? 'none' : currentReplay.mutatorIds.join(', ')}</p>
        <button class="primary" on:click={() => gameStore.closeReplay()}>Return to Overworld</button>
      </div>

      <BattleControls
        replayLength={currentReplay.steps.length}
        currentStep={$state.currentStep}
        autoPlay={$state.autoPlay}
        speedMs={$state.speedMs}
        onStepBack={() => gameStore.stepBackward()}
        onStepForward={() => gameStore.stepForward()}
        onJumpStart={() => gameStore.jumpTo(-1)}
        onToggleAuto={() => gameStore.setAutoPlay(!$state.autoPlay)}
        onSetSpeed={(ms) => gameStore.setSpeedMs(ms)}
      />

      <div class="panel">
        <h2>Alive Counts</h2>
        {#if aliveSummary}
          <p>Player: {aliveSummary.player}</p>
          <p>Enemy: {aliveSummary.enemy}</p>
          <div class="count-grid">
            {#each Object.entries(aliveSummary.byTroopLabel) as [label, count]}
              <div>
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <section class="center">
      <div class="viewport" bind:this={viewport}></div>
    </section>

    <section class="right">
      <EventLog
        steps={currentReplay.steps}
        selected={$state.selectedEvent}
        currentStep={$state.currentStep}
        onSelect={(index) => gameStore.selectEvent(index)}
      />

      <section class="panel">
        <h2>Unit Focus</h2>
        {#if activeUnit}
          <UnitTooltip unit={activeUnit} engagedUnits={engagedUnits} x={0} y={0} locked={Boolean(lockedPointer)} docked={true} />
        {:else}
          <p>Hover or click a unit to inspect it.</p>
        {/if}
      </section>
    </section>
  </main>
{:else}
  <main class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Cycle {$state.game.cycleNumber}</p>
        <h1>Shiftmake Command Table</h1>
      </div>

      <div class="resource-strip">
        <div><span>Gold</span><strong>{$state.game.resources.gold}</strong></div>
        <div><span>Essence</span><strong>{$state.game.resources.essence}</strong></div>
        <div><span>Active</span><strong>{statusCounts.active}</strong></div>
        <div><span>Recovering</span><strong>{statusCounts.recovering}</strong></div>
        <div><span>Idle</span><strong>{statusCounts.idle}</strong></div>
      </div>

      <div class="mode-toggle">
        <button class:selected={$state.centerMode === 'rifts'} on:click={() => gameStore.setCenterMode('rifts')}>Rifts</button>
        <button class:selected={$state.centerMode === 'troops'} on:click={() => gameStore.setCenterMode('troops')}>Factions & Troops</button>
      </div>
    </header>

    <section class="left-column">
      <div class="panel">
        {#if selectedRift}
          <p class="eyebrow">Selected Rift</p>
          <h2>{selectedRift.id}</h2>
          <p>Tier {selectedRift.tier}</p>
          <p>Mutators: {selectedRift.mutatorIds.length === 0 ? 'none' : selectedRift.mutatorIds.join(', ')}</p>
          <p>Rewards: {selectedRift.rewardPackage.summaryParts.join(', ')}</p>
          <div class="compact-list">
            {#each selectedRift.enemyArmy as group}
              <div>
                <span>{group.label}</span>
                <strong>x{group.quantity}</strong>
              </div>
            {/each}
          </div>
        {:else if selectedTroop}
          {@const troopDef = getTroopEffectiveDefinition($state.game, selectedTroop.id)}
          <p class="eyebrow">Selected Troop</p>
          <h2>{troopDef.label}</h2>
          <p>Qty {selectedTroop.quantity} {selectedTroop.recoveryCyclesRemaining > 0 ? `| Recovering ${selectedTroop.recoveryCyclesRemaining}` : '| Ready'}</p>
          <div class="compact-list">
            <div><span>Health</span><strong>{troopDef.stats.health}</strong></div>
            <div><span>Damage</span><strong>{troopDef.stats.damage}</strong></div>
            <div><span>Speed</span><strong>{troopDef.stats.speed}</strong></div>
            <div><span>Armor</span><strong>{troopDef.stats.armor}</strong></div>
            <div><span>Range</span><strong>{troopDef.stats.range}</strong></div>
            <div><span>Capacity</span><strong>{troopDef.stats.capacity}</strong></div>
          </div>
          <div class="actions-grid">
            <button on:click={() => gameStore.buyTroopUnit(selectedTroop.id)}>Add Unit ({getTroopAddUnitCost(selectedTroop)}g)</button>
            {#each troopUpgradeOrder as stat}
              {#if canUpgradeStat(selectedTroop.unitTypeId, stat)}
                <button on:click={() => gameStore.buyTroopStatUpgrade(selectedTroop.id, stat)}>
                  {stat} + ({getTroopStatUpgradeCost(selectedTroop, stat)}g)
                </button>
              {/if}
            {/each}
          </div>
        {:else if selectedFactionId}
          <p class="eyebrow">Selected Faction</p>
          <h2>{getFaction(selectedFactionId).label}</h2>
          <p>{getFaction(selectedFactionId).description}</p>
          <div class="compact-list">
            {#each factionTroops as troop}
              <button class="list-button" on:click={() => selectTroop(troop.id)}>{troop.id}</button>
            {/each}
          </div>
          <div class="actions-grid">
            {#each Object.keys(UNIT_TYPES) as unitTypeId}
              {#if !$state.game.troops.some((troop) => troop.factionId === selectedFactionId && troop.unitTypeId === unitTypeId)}
                <button on:click={() => gameStore.unlockTroopType(selectedFactionId, unitTypeId)}>
                  Unlock {getUnitType(unitTypeId).label} ({getTroopUnlockCost($state.game, selectedFactionId, unitTypeId)}e)
                </button>
              {/if}
            {/each}
            {#each Object.values(FACTION_UPGRADES).filter((upgrade) => upgrade.factionId === selectedFactionId && !$state.game.factionUpgradeIds.includes(upgrade.id) && upgrade.source === 'default') as upgrade}
              <button on:click={() => gameStore.buyFactionUpgrade(upgrade.id)}>{upgrade.label} ({upgrade.cost}g)</button>
            {/each}
          </div>
        {:else}
          <p class="eyebrow">Assignment Summary</p>
          <h2>Cycle Ready</h2>
          <p>{statusCounts.active} troops committed this cycle.</p>
          {#if $state.validationMessages.length > 0}
            <ul class="warnings">
              {#each $state.validationMessages as message}
                <li>{message}</li>
              {/each}
            </ul>
          {:else}
            <p>No assignment conflicts detected.</p>
          {/if}
        {/if}
      </div>
    </section>

    <section class="center-column">
      {#if $state.centerMode === 'rifts'}
        <div class="rift-grid">
          {#each discoveredRifts as rift}
            <article class="rift-card" class:selected={selectedRiftId === rift.id}>
              <button class="title-button" on:click={() => selectRift(rift.id)}>
                <header>
                  <strong>Tier {rift.tier}</strong>
                  <span>{rift.id}</span>
                </header>
              </button>
              <p>{rift.rewardPackage.summaryParts.join(', ')}</p>
              <small>{rift.mutatorIds.length === 0 ? 'No mutators' : rift.mutatorIds.join(', ')}</small>
              <div class="assigned-strip">
                {#each getTroopsAssignedToRift($state.game, rift.id) as troop}
                  <span>{getTroopEffectiveDefinition($state.game, troop.id).label}</span>
                {/each}
              </div>
              {#if selectedTroop}
                <button class="primary" on:click|stopPropagation={() => gameStore.assignTroopToRift(selectedTroop.id, rift.id)}>
                  {troopAssignedTo(rift, selectedTroop.id) ? 'Unassign' : 'Assign Selected Troop'}
                </button>
              {/if}
            </article>
          {/each}
        </div>
      {:else}
        <div class="faction-grid">
          {#each $state.game.unlockedFactionIds as factionId}
            <section class="faction-card">
              <header>
                <button class="title-button" on:click={() => selectFaction(factionId)}>{getFaction(factionId).label}</button>
                <small>{getFaction(factionId).description}</small>
              </header>
              <div class="troop-list">
                {#each getFactionTroops($state.game, factionId) as troop}
                  <button class="troop-chip" on:click={() => selectTroop(troop.id)}>
                    <span>{getTroopEffectiveDefinition($state.game, troop.id).label}</span>
                    <small>Qty {troop.quantity}</small>
                  </button>
                {/each}
              </div>
              <div class="unlock-row">
                {#each Object.keys(UNIT_TYPES) as unitTypeId}
                  {#if !$state.game.troops.some((troop) => troop.factionId === factionId && troop.unitTypeId === unitTypeId)}
                    <button on:click={() => gameStore.unlockTroopType(factionId, unitTypeId)}>
                      + {getUnitType(unitTypeId).label}
                    </button>
                  {/if}
                {/each}
              </div>
            </section>
          {/each}

          <section class="faction-card accent">
            <header>
              <strong>Unlock New Faction</strong>
              <small>{getFactionUnlockCost($state.game)} essence</small>
            </header>
            <div class="unlock-row">
              {#each factionsById.filter((factionId) => !$state.game.unlockedFactionIds.includes(factionId)) as factionId}
                <button on:click={() => gameStore.unlockFaction(factionId)}>+ {getFaction(factionId).label}</button>
              {/each}
            </div>
          </section>
        </div>
      {/if}
    </section>

    <section class="right-column">
      <div class="panel">
        <p class="eyebrow">Battle Archive</p>
        <h2>Recent Replays</h2>
        {#if $state.game.replayIndex.length === 0}
          <p>No archived battles yet.</p>
        {:else}
          <div class="archive-list">
            {#each $state.game.replayIndex as replay}
              <button class="archive-card" on:click={() => gameStore.openReplay(replay.storageKey)}>
                <strong>{replay.summary}</strong>
                <small>Cycle {replay.cycleNumber} | {replay.mutatorIds.join(', ') || 'No mutators'}</small>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if $state.game.phase === 'reward_claims'}
        <div class="panel">
          <p class="eyebrow">Rewards</p>
          <h2>Choose Upgrades</h2>
          {#each $state.game.pendingRewardChoices as choice}
            <div class="reward-card">
              <strong>{choice.title}</strong>
              <div class="actions-grid">
                {#each choice.optionUpgradeIds as optionId}
                  <button on:click={() => gameStore.claimReward(choice.id, optionId)}>{getFactionUpgrade(optionId).label}</button>
                {/each}
              </div>
            </div>
          {/each}
          {#if $state.game.pendingRewardChoices.length === 0}
            <button class="primary" on:click={() => gameStore.finishRewards()}>Return to Planning</button>
          {/if}
        </div>
      {/if}
    </section>

    <footer class="action-rail">
      <button class="primary large" on:click={() => ($state.game.phase === 'reward_claims' ? gameStore.finishRewards() : gameStore.endCycle())}>
        {$state.game.phase === 'reward_claims' ? 'Finish Rewards' : 'End Cycle'}
      </button>
    </footer>
  </main>
{/if}

<style>
  :global(body) {
    overflow: hidden;
  }

  button {
    cursor: pointer;
  }

  .shell,
  .replay-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr) 340px;
    grid-template-rows: auto 1fr auto;
    gap: 1rem;
    padding: 1rem;
  }

  .topbar {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1.2fr 1fr auto;
    gap: 1rem;
    align-items: center;
    padding: 1rem 1.2rem;
    border: 1px solid rgba(165, 191, 210, 0.18);
    border-radius: 22px;
    background:
      linear-gradient(135deg, rgba(17, 29, 41, 0.92), rgba(16, 21, 30, 0.94)),
      radial-gradient(circle at top left, rgba(190, 147, 92, 0.14), transparent 48%);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
  }

  .eyebrow {
    margin: 0 0 0.15rem;
    font-size: 0.76rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #c7b18b;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  .resource-strip {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .resource-strip div,
  .count-grid div,
  .compact-list div {
    display: grid;
    gap: 0.15rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: 14px;
    background: rgba(20, 28, 38, 0.7);
  }

  .resource-strip span,
  .count-grid span,
  .compact-list span {
    color: #93a9bc;
    font-size: 0.75rem;
  }

  .mode-toggle {
    display: flex;
    gap: 0.6rem;
  }

  .mode-toggle button,
  .primary,
  .actions-grid button,
  .unlock-row button,
  .archive-card,
  .troop-chip,
  .list-button,
  .draft-card,
  .title-button {
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: 14px;
    background: rgba(22, 31, 42, 0.82);
    color: #f4f7fb;
    padding: 0.65rem 0.8rem;
    font: inherit;
  }

  .mode-toggle button.selected,
  .primary {
    background: linear-gradient(135deg, #c59a5a, #8a5b2f);
    color: #111;
    border-color: rgba(213, 178, 116, 0.6);
  }

  .left-column,
  .center-column,
  .right-column,
  .left,
  .right {
    min-height: 0;
    display: grid;
    gap: 1rem;
    align-content: start;
  }

  .panel {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    border-radius: 20px;
    border: 1px solid rgba(126, 157, 181, 0.15);
    background:
      linear-gradient(160deg, rgba(18, 27, 38, 0.94), rgba(10, 15, 24, 0.94)),
      radial-gradient(circle at top right, rgba(95, 135, 170, 0.12), transparent 35%);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.24);
  }

  .rift-grid,
  .faction-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
    align-content: start;
  }

  .rift-card,
  .faction-card,
  .reward-card {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    border-radius: 18px;
    border: 1px solid rgba(126, 157, 181, 0.16);
    background:
      linear-gradient(145deg, rgba(25, 35, 46, 0.92), rgba(14, 18, 25, 0.94)),
      radial-gradient(circle at top left, rgba(197, 154, 90, 0.12), transparent 30%);
  }

  .rift-card.selected {
    outline: 2px solid #d4ad73;
  }

  .rift-card header,
  .faction-card header {
    display: grid;
    gap: 0.3rem;
  }

  .troop-list,
  .unlock-row,
  .actions-grid,
  .archive-list,
  .compact-list,
  .assigned-strip {
    display: grid;
    gap: 0.55rem;
  }

  .assigned-strip {
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  }

  .assigned-strip span {
    padding: 0.4rem 0.55rem;
    border-radius: 999px;
    background: rgba(212, 173, 115, 0.12);
    color: #e4cca8;
    font-size: 0.75rem;
  }

  .archive-card,
  .troop-chip,
  .title-button,
  .list-button,
  .draft-card {
    text-align: left;
  }

  .archive-card small,
  .troop-chip small,
  .draft-card small {
    color: #9db2c4;
  }

  .warnings {
    margin: 0;
    padding-left: 1rem;
    color: #f2c58c;
  }

  .action-rail {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    padding-bottom: 0.4rem;
  }

  .large {
    min-width: 220px;
    padding: 0.9rem 1.2rem;
    font-size: 1rem;
  }

  .draft-screen {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem;
  }

  .draft-panel {
    width: min(1100px, 100%);
    display: grid;
    gap: 1.4rem;
    padding: 2rem;
    border-radius: 28px;
    border: 1px solid rgba(193, 162, 114, 0.22);
    background:
      linear-gradient(150deg, rgba(17, 29, 41, 0.96), rgba(10, 15, 22, 0.98)),
      radial-gradient(circle at top left, rgba(197, 154, 90, 0.18), transparent 38%);
  }

  .intro {
    max-width: 62ch;
    color: #b6c4d1;
  }

  .draft-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
  }

  .draft-card {
    display: grid;
    gap: 0.6rem;
    min-height: 220px;
  }

  .replay-shell .center {
    min-height: 640px;
  }

  .viewport {
    height: 100%;
    min-height: 640px;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: 20px;
    overflow: hidden;
    background: radial-gradient(circle at 50% 20%, #213240, #0d1118 60%, #090d14 100%);
  }

  .count-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.55rem;
  }

  @media (max-width: 1280px) {
    .shell,
    .replay-shell {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto auto auto;
    }

    .topbar {
      grid-template-columns: 1fr;
    }

    .resource-strip {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .viewport {
      min-height: 420px;
    }
  }
</style>
