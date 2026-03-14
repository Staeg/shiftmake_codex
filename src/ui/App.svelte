<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy, onMount, tick } from 'svelte';
  import { BattleRenderer, type UnitPointerInfo } from '../rendering/BattleRenderer';
  import { canUpgradeStat, getAvailableFactionTroopUnlocks, getFactionTroops, getFactionUnlockCost, getTroopAddUnitCost, getTroopEffectiveDefinition, getTroopStatUpgradeCost, getTroopStatusCounts, getTroopUnlockCost, getTroopsAssignedToRift } from '../engine/army';
  import { formatFixed } from '../engine/fixed';
  import { validateAssignments } from '../engine/game';
  import { composeBaseTroopDefinition, FACTION_UPGRADES, FACTIONS, UNIT_TYPES, getFaction, getFactionUpgrade, getMutator, getUnitType } from '../engine/unitCatalog';
  import type { AbilityDefinition, BattleUnit, FactionId, RewardPackage, RiftInstance, TroopId, TroopStatKey, UnitTypeId } from '../engine/types';
  import { gameStore } from '../store/gameStore';
  import type { SaveSlotId, SaveSlotSummary } from '../store/saveSlots';
  import BattleControls from './BattleControls.svelte';
  import EventLog from './EventLog.svelte';
  import UnitTooltip from './UnitTooltip.svelte';

  const state = gameStore;
  let viewport: HTMLDivElement;
  let renderer: BattleRenderer | null = null;
  let rendererHost: HTMLDivElement | null = null;
  let rendererInitPromise: Promise<void> | null = null;
  let mountedReplayId: string | null = null;
  let replayUiId: string | null = null;
  let autoTimer: ReturnType<typeof setInterval> | null = null;
  let selectedTroopId: TroopId | null = null;
  let selectedRiftId: string | null = null;
  let selectedFactionId: FactionId | null = null;
  let selectedReplayStorageKey: string | null = null;
  let hoveredReplayProfileKey: string | null = null;
  let selectedReplayProfileKey: string | null = null;
  let hoveredPointer: UnitPointerInfo | null = null;
  let lockedPointer: UnitPointerInfo | null = null;
  let replayAliveCountsExpanded = false;
  let replayEventLogCollapsed = false;
  let selectedMenuSlotId: SaveSlotId | null = null;
  let hoveredDetail:
    | {
        kind: 'mutator';
        label: string;
        description: string;
      }
    | {
        kind: 'ability';
        label: string;
        description: string;
      }
    | {
        kind: 'upgrade' | 'troop';
        label: string;
        description: string;
      }
    | null = null;
  let pendingPurchase:
    | { kind: 'unlockFaction'; factionId: FactionId; cost: number }
    | { kind: 'unlockTroop'; factionId: FactionId; unitTypeId: UnitTypeId; cost: number }
    | { kind: 'factionUpgrade'; upgradeId: string; factionId: FactionId; cost: number }
    | null = null;

  const troopUpgradeOrder: TroopStatKey[] = ['health', 'damage', 'speed', 'armor', 'range', 'capacity'];
  const replayProfileKey = (side: 'player' | 'enemy', troopLabel: string): string => `${side}:${troopLabel}`;

  async function ensureRenderer(): Promise<void> {
    if (!viewport) {
      await tick();
    }
    if (!viewport) {
      return;
    }
    if (renderer && rendererHost === viewport) {
      return;
    }
    if (rendererInitPromise) {
      await rendererInitPromise;
      return;
    }

    const nextRenderer = new BattleRenderer(viewport);
    nextRenderer.setInteractionHandlers({
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

    rendererInitPromise = nextRenderer.init().then(() => {
      renderer?.destroy();
      renderer = nextRenderer;
      rendererHost = viewport;
      mountedReplayId = null;
    });

    try {
      await rendererInitPromise;
    } finally {
      rendererInitPromise = null;
    }
  }

  function clearAutoTimer(): void {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  function selectTroop(troopId: TroopId): void {
    pendingPurchase = null;
    selectedTroopId = troopId;
    selectedRiftId = null;
    selectedFactionId = get(state).game.troops.find((troop) => troop.id === troopId)?.factionId ?? null;
  }

  function selectRift(riftId: string): void {
    pendingPurchase = null;
    selectedRiftId = riftId;
    selectedTroopId = null;
    selectedFactionId = null;
  }

  function selectReplay(replayId: string): void {
    selectedReplayStorageKey = selectedReplayStorageKey === replayId ? null : replayId;
  }

  function selectMenuSlot(slotId: SaveSlotId): void {
    selectedMenuSlotId = selectedMenuSlotId === slotId ? null : slotId;
  }

  function selectFaction(factionId: FactionId): void {
    pendingPurchase = null;
    selectedFactionId = factionId;
    selectedTroopId = null;
    selectedRiftId = null;
  }

  function selectRecruitableFaction(factionId: FactionId): void {
    selectedFactionId = factionId;
    selectedTroopId = null;
    selectedRiftId = null;
    pendingPurchase = {
      kind: 'unlockFaction',
      factionId,
      cost: getFactionUnlockCost($state.game),
    };
  }

  function selectRecruitableTroop(factionId: FactionId, unitTypeId: UnitTypeId): void {
    selectedFactionId = factionId;
    selectedTroopId = null;
    selectedRiftId = null;
    pendingPurchase = {
      kind: 'unlockTroop',
      factionId,
      unitTypeId,
      cost: getTroopUnlockCost($state.game, factionId, unitTypeId),
    };
  }

  function selectFactionUpgradePurchase(upgradeId: string, factionId: FactionId): void {
    selectedFactionId = factionId;
    selectedTroopId = null;
    selectedRiftId = null;
    pendingPurchase = {
      kind: 'factionUpgrade',
      upgradeId,
      factionId,
      cost: getFactionUpgrade(upgradeId).cost,
    };
  }

  onMount(async () => {
    gameStore.initialize();
  });

  onDestroy(() => {
    clearAutoTimer();
    renderer?.destroy();
  });

  $: currentReplay = $state.loadedReplay;
  $: if (currentReplay && currentReplay.id !== replayUiId) {
    replayUiId = currentReplay.id;
    hoveredReplayProfileKey = null;
    selectedReplayProfileKey = null;
    replayAliveCountsExpanded = false;
    replayEventLogCollapsed = false;
    hoveredDetail = null;
    lockedPointer = null;
    hoveredPointer = null;
  }
  $: if ($state.screen === 'replay' && currentReplay && viewport) {
    void ensureRenderer();
  }
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
  $: replayProfilesByKey = new Map(
    (currentReplay?.troopProfiles ?? []).map((profile) => [replayProfileKey(profile.side, profile.troopLabel), profile]),
  );
  $: activePointer = lockedPointer ?? hoveredPointer;
  $: activeUnit = activePointer ? currentUnitById.get(activePointer.unitId) ?? null : null;
  $: activeUnitProfile = activeUnit ? replayProfilesByKey.get(replayProfileKey(activeUnit.side, activeUnit.troopLabel)) ?? null : null;
  $: hoveredReplayProfile = hoveredReplayProfileKey ? replayProfilesByKey.get(hoveredReplayProfileKey) ?? null : null;
  $: selectedReplayProfile = selectedReplayProfileKey ? replayProfilesByKey.get(selectedReplayProfileKey) ?? null : null;
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
  $: selectedReplayEntry = selectedReplayStorageKey
    ? $state.game.replayIndex.find((replay) => replay.replayId === selectedReplayStorageKey) ?? null
    : null;
  $: selectedReplayAvailable =
    selectedReplayEntry && !selectedReplayEntry.summaryOnly ? gameStore.hasReplay(selectedReplayEntry.replayId) : false;
  $: factionTroops = selectedFactionId ? getFactionTroops($state.game, selectedFactionId) : [];
  $: availableFactionTroopUnlocks = selectedFactionId ? getAvailableFactionTroopUnlocks($state.game, selectedFactionId) : [];
  $: selectedFactionDefaultUpgrades = selectedFactionId
    ? Object.values(FACTION_UPGRADES).filter(
        (upgrade) => upgrade.factionId === selectedFactionId && !$state.game.factionUpgradeIds.includes(upgrade.id) && upgrade.source === 'default',
      )
    : [];
  $: selectedFactionRiftUpgrades = selectedFactionId
    ? Object.values(FACTION_UPGRADES).filter(
        (upgrade) => upgrade.factionId === selectedFactionId && upgrade.source === 'rift',
      )
    : [];
  $: selectedFactionOwnedUpgrades = selectedFactionId
    ? Object.values(FACTION_UPGRADES).filter(
        (upgrade) => upgrade.factionId === selectedFactionId && $state.game.factionUpgradeIds.includes(upgrade.id),
      )
    : [];
  $: statusCounts = getTroopStatusCounts($state.game);
  $: factionsById = Object.keys(FACTIONS) as FactionId[];
  $: lockedFactionIds = factionsById.filter((factionId) => !$state.game.unlockedFactionIds.includes(factionId));
  $: aliveSummary = currentReplay ? currentReplay.aliveCounts[Math.max(0, $state.currentStep + 1)] ?? currentReplay.aliveCounts[0] : null;
  $: aliveCountsBySide = currentUnits.reduce(
    (groups, unit) => {
      if (!unit.alive) {
        return groups;
      }
      const target = unit.side === 'player' ? groups.player : groups.enemy;
      target[unit.troopLabel] = (target[unit.troopLabel] ?? 0) + 1;
      return groups;
    },
    { player: {} as Record<string, number>, enemy: {} as Record<string, number> },
  );
  $: alivePlayerGroups = Object.entries(aliveCountsBySide.player).sort((a, b) => a[0].localeCompare(b[0]));
  $: aliveEnemyGroups = Object.entries(aliveCountsBySide.enemy).sort((a, b) => a[0].localeCompare(b[0]));
  $: replayFocusProfile = hoveredReplayProfile ?? activeUnitProfile ?? selectedReplayProfile;
  $: selectedRiftAssignableTroops = selectedRift
    ? $state.game.troops.filter(
        (troop) =>
          troop.unlocked &&
          troop.recoveryCyclesRemaining === 0 &&
          (troop.assignmentRiftId === null || troop.assignmentRiftId === selectedRift.id),
      )
    : [];
  $: selectedRecruitableFaction = pendingPurchase?.kind === 'unlockFaction' ? getFaction(pendingPurchase.factionId) : null;
  $: selectedRecruitableFactionModifierLines = selectedRecruitableFaction
    ? describeFactionModifiers(selectedRecruitableFaction.id)
    : [];
  $: selectedRecruitableFactionTroopPreviews = selectedRecruitableFaction
    ? selectedRecruitableFaction.defaultUnitTypeIds.map((unitTypeId) => ({
        unitTypeId,
        troopDef: getTroopEffectivePreview(selectedRecruitableFaction.id, unitTypeId),
      }))
    : [];
  $: selectedRecruitableFactionUpgrades = selectedRecruitableFaction
    ? Object.values(FACTION_UPGRADES).filter((upgrade) => upgrade.factionId === selectedRecruitableFaction.id)
    : [];
  $: selectedRecruitableTroop =
    pendingPurchase?.kind === 'unlockTroop'
      ? {
          faction: getFaction(pendingPurchase.factionId),
          unitType: getUnitType(pendingPurchase.unitTypeId),
          troopDef: getTroopEffectivePreview(pendingPurchase.factionId, pendingPurchase.unitTypeId),
        }
      : null;
  $: selectedFactionUpgrade = pendingPurchase?.kind === 'factionUpgrade' ? getFactionUpgrade(pendingPurchase.upgradeId) : null;

  function getTroopEffectivePreview(factionId: FactionId, unitTypeId: UnitTypeId) {
    const base = composeBaseTroopDefinition(factionId, unitTypeId);
    return {
      ...getTroopEffectiveDefinition(
        {
          ...$state.game,
          troops: [
            ...$state.game.troops,
            {
              id: '__preview__',
              factionId,
              unitTypeId,
              quantity: base.quantity,
              unlocked: false,
              statUpgradeLevels: { health: 0, damage: 0, speed: 0, armor: 0, range: 0, capacity: 0 },
              recoveryCyclesRemaining: 0,
              assignmentRiftId: null,
            },
          ],
        },
        '__preview__',
      ),
    };
  }

  function troopAssignedTo(rift: RiftInstance, troopId: TroopId): boolean {
    return getTroopsAssignedToRift($state.game, rift.id).some((troop) => troop.id === troopId);
  }

  function canAffordGold(cost: number): boolean {
    return $state.game.resources.gold >= cost;
  }

  function canAffordEssence(cost: number): boolean {
    return $state.game.resources.essence >= cost;
  }

  function clearPendingPurchase(): void {
    pendingPurchase = null;
  }

  function confirmPendingPurchase(): void {
    if (!pendingPurchase) {
      return;
    }
    if (pendingPurchase.kind === 'unlockFaction') {
      gameStore.unlockFaction(pendingPurchase.factionId);
    } else if (pendingPurchase.kind === 'unlockTroop') {
      gameStore.unlockTroopType(pendingPurchase.factionId, pendingPurchase.unitTypeId);
    } else {
      gameStore.buyFactionUpgrade(pendingPurchase.upgradeId);
    }
    pendingPurchase = null;
  }

  function purchaseAffordability(purchase: NonNullable<typeof pendingPurchase>): boolean {
    if (purchase.kind === 'unlockFaction' || purchase.kind === 'unlockTroop') {
      return canAffordEssence(purchase.cost);
    }
    return canAffordGold(purchase.cost);
  }

  function openSelectedReplay(): void {
    if (selectedReplayEntry) {
      gameStore.openReplay(selectedReplayEntry.replayId);
    }
  }

  function clearCampaignSelections(): void {
    selectedTroopId = null;
    selectedRiftId = null;
    selectedFactionId = null;
    selectedReplayStorageKey = null;
    pendingPurchase = null;
  }

  function returnToMainMenu(): void {
    clearCampaignSelections();
    gameStore.returnToMainMenu();
  }

  function loadSelectedSlot(): void {
    if (!selectedMenuSlotId) {
      return;
    }
    clearCampaignSelections();
    gameStore.loadSlot(selectedMenuSlotId);
  }

  function startSelectedSlotCampaign(): void {
    if (!selectedMenuSlotId) {
      return;
    }
    const slot = $state.slots.find((entry) => entry.slotId === selectedMenuSlotId) ?? null;
    const shouldOverwrite =
      slot?.status === 'occupied'
        ? window.confirm(`Overwrite save slot ${selectedMenuSlotId}? This will replace that campaign and its archived replays.`)
        : true;
    if (!shouldOverwrite) {
      return;
    }

    clearCampaignSelections();
    gameStore.startNewCampaign(selectedMenuSlotId);
  }

  function formatSlotTimestamp(slot: SaveSlotSummary): string {
    if (!slot.lastPlayedAt) {
      return 'Never played';
    }
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(slot.lastPlayedAt));
  }

  function attemptEndCycle(): void {
    if ($state.game.phase === 'reward_claims') {
      gameStore.finishRewards();
      return;
    }

    const validation = validateAssignments($state.game);
    const hasBlockingIssues = validation.issues.some((issue) => issue.kind !== 'no_assignments');
    if (hasBlockingIssues) {
      gameStore.endCycle();
      return;
    }

    const hasNoAssignments = validation.issues.some((issue) => issue.kind === 'no_assignments');
    if (hasNoAssignments) {
      const confirmed = window.confirm('No troops are assigned to any Rift. End the cycle anyway?');
      if (!confirmed) {
        return;
      }
      gameStore.endCycle(true);
      return;
    }

    gameStore.endCycle();
  }

  function selectReplayProfile(side: 'player' | 'enemy', troopLabel: string): void {
    selectedReplayProfileKey = replayProfileKey(side, troopLabel);
  }

  function showMutatorDetail(mutatorId: string): void {
    const mutator = getMutator(mutatorId);
    hoveredDetail = {
      kind: 'mutator',
      label: mutator.label,
      description: mutator.description,
    };
  }

  function showAbilityDetail(ability: AbilityDefinition): void {
    hoveredDetail = {
      kind: 'ability',
      label: ability.label,
      description: ability.shortText,
    };
  }

  function clearDetail(): void {
    hoveredDetail = null;
  }

  function showUpgradeDetail(upgradeId: string): void {
    const upgrade = getFactionUpgrade(upgradeId);
    hoveredDetail = {
      kind: 'upgrade',
      label: upgrade.label,
      description: upgrade.description,
    };
  }

  function showTroopDetail(factionId: FactionId, unitTypeId: UnitTypeId): void {
    const troop = getTroopEffectivePreview(factionId, unitTypeId);
    hoveredDetail = {
      kind: 'troop',
      label: troop.label,
      description: `HP ${formatFixed(troop.stats.health)} | DMG ${formatFixed(troop.stats.damage)} | SPD ${formatFixed(troop.stats.speed)} | ARM ${formatFixed(troop.stats.armor)} | RNG ${formatFixed(troop.stats.range)} | CAP ${formatFixed(troop.stats.capacity)}`,
    };
  }

  function describeFactionModifiers(factionId: FactionId): string[] {
    const faction = getFaction(factionId);
    const entries = Object.entries(faction.statAdjustments);
    return entries
      .filter(([, adjustment]) => (adjustment?.flat ?? 0) !== 0 || (adjustment?.multiplier ?? 1) !== 1)
      .map(([key, adjustment]) => {
        if ((adjustment?.flat ?? 0) !== 0) {
          const flat = adjustment?.flat ?? 0;
          return `${key}: ${flat > 0 ? '+' : ''}${formatFixed(flat)}`;
        }
        const pct = (((adjustment?.multiplier ?? 1) - 1) * 100);
        return `${key}: ${pct > 0 ? '+' : ''}${formatFixed(pct)}%`;
      });
  }

  function describeRewardPackage(rewardPackage: RewardPackage): string {
    const parts: string[] = [];
    if (rewardPackage.resources.gold > 0) {
      parts.push(`${formatFixed(rewardPackage.resources.gold)} gold`);
    }
    if (rewardPackage.resources.essence > 0) {
      parts.push(`${formatFixed(rewardPackage.resources.essence)} essence`);
    }
    if (rewardPackage.upgradeChoiceBatches > 0) {
      parts.push(`upgrade x${rewardPackage.upgradeChoiceBatches}`);
    }
    return parts.join(', ');
  }
</script>

{#if $state.screen === 'main_menu'}
  <main class="menu-screen">
    <section class="menu-panel">
      <div class="menu-copy">
        <p class="eyebrow">Shiftmake</p>
        <h1>Choose A Save Slot</h1>
        <p class="intro">Each slot keeps its own campaign and battle archive. Load an existing command table or begin a fresh campaign in any slot.</p>
      </div>

      <div class="slot-grid">
        {#each $state.slots as slot}
          <button class="slot-card" class:selected={selectedMenuSlotId === slot.slotId} on:click={() => selectMenuSlot(slot.slotId)}>
            <div class="slot-card-header">
              <span class="slot-label">Slot {slot.slotId}</span>
              <strong>{slot.status === 'occupied' ? 'Occupied' : 'Empty'}</strong>
            </div>

            {#if slot.status === 'occupied'}
              <div class="slot-meta">
                <span>{slot.factionLabel ?? 'Unchosen Banner'}</span>
                <span>Cycle {slot.cycleNumber}</span>
                <span>{slot.phase === 'faction_draft' ? 'Faction Draft' : slot.phase === 'reward_claims' ? 'Reward Claims' : 'Planning'}</span>
                <span>{formatSlotTimestamp(slot)}</span>
              </div>
            {:else}
              <p>This slot is ready for a new campaign.</p>
            {/if}
          </button>
        {/each}
      </div>

      <div class="menu-actions">
        <button class="large" on:click={() => (selectedMenuSlotId = null)} disabled={selectedMenuSlotId === null}>Clear Selection</button>
        <button
          class="large"
          on:click={() => loadSelectedSlot()}
          disabled={selectedMenuSlotId === null || !($state.slots.find((slot) => slot.slotId === selectedMenuSlotId)?.status === 'occupied')}
        >
          Load Campaign
        </button>
        <button class="primary large" on:click={() => startSelectedSlotCampaign()} disabled={selectedMenuSlotId === null}>
          {$state.slots.find((slot) => slot.slotId === selectedMenuSlotId)?.status === 'occupied' ? 'Overwrite With New Campaign' : 'Start New Campaign'}
        </button>
      </div>
    </section>
  </main>
{:else if $state.game.phase === 'faction_draft'}
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
    <section class="left replay-left">
      <div class="replay-header">
        <p class="replay-name">{currentReplay.riftId ?? 'Debug Battle'}</p>
        <div class="replay-mutators">
          {#if currentReplay.mutatorIds.length === 0}
            <span class="mutator-chip empty">No mutators</span>
          {:else}
            {#each currentReplay.mutatorIds as mutatorId}
              <button
                class="mutator-chip"
                on:mouseenter={() => showMutatorDetail(mutatorId)}
                on:focus={() => showMutatorDetail(mutatorId)}
                on:mouseleave={() => clearDetail()}
                on:blur={() => clearDetail()}
              >
                {getMutator(mutatorId).label}
              </button>
            {/each}
          {/if}
        </div>
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

      <section class="panel focus-panel">
        {#if hoveredDetail}
          <div class="detail-panel replay-detail-panel">
            <p class="eyebrow">
              {hoveredDetail.kind === 'mutator'
                ? 'Mutator Effect'
                : hoveredDetail.kind === 'ability'
                  ? 'Ability Effect'
                  : hoveredDetail.kind === 'upgrade'
                    ? 'Upgrade Preview'
                    : 'Troop Preview'}
            </p>
            <h2>{hoveredDetail.label}</h2>
            <p>{hoveredDetail.description}</p>
          </div>
        {:else if hoveredReplayProfile}
          <UnitTooltip unit={null} profile={hoveredReplayProfile} engagedUnits={[]} x={0} y={0} docked={true} />
        {:else if activeUnit}
          <UnitTooltip unit={activeUnit} profile={activeUnitProfile} engagedUnits={engagedUnits} x={0} y={0} locked={Boolean(lockedPointer)} docked={true} />
        {:else if replayFocusProfile}
          <UnitTooltip unit={null} profile={replayFocusProfile} engagedUnits={[]} x={0} y={0} docked={true} />
        {:else}
          <div class="focus-empty">
            <p class="eyebrow">Unit Focus</p>
            <h2>Battle Reference</h2>
            <p>Hover a mutator, a unit on the field, or a troop row in alive counts to inspect it.</p>
          </div>
        {/if}
      </section>
    </section>

    <section class="center replay-center">
      <div class="viewport" bind:this={viewport}></div>
    </section>

    <section class="right replay-right">
      <section class="panel collapsible-panel">
        <button class="panel-toggle" on:click={() => (replayAliveCountsExpanded = !replayAliveCountsExpanded)}>
          <div>
            <p class="eyebrow">Alive Counts</p>
            <strong>{replayAliveCountsExpanded ? 'Expanded Roster' : 'Side Totals'}</strong>
          </div>
          <span>{replayAliveCountsExpanded ? 'Hide' : 'Show'}</span>
        </button>
        {#if aliveSummary}
          <div class="alive-sides" class:compact={!replayAliveCountsExpanded}>
            <section class="alive-side">
              <div class="alive-side-header">
                <span>Player</span>
                <strong>{aliveSummary.player}</strong>
              </div>
              {#if replayAliveCountsExpanded}
                <div class="count-grid side-grid">
                  {#each alivePlayerGroups as [label, count]}
                    <button
                      class="alive-unit-card"
                      class:selected={selectedReplayProfileKey === replayProfileKey('player', label)}
                      on:click={() => selectReplayProfile('player', label)}
                      on:mouseenter={() => (hoveredReplayProfileKey = replayProfileKey('player', label))}
                      on:focus={() => (hoveredReplayProfileKey = replayProfileKey('player', label))}
                      on:mouseleave={() => (hoveredReplayProfileKey = null)}
                      on:blur={() => (hoveredReplayProfileKey = null)}
                    >
                      <span>{label}</span>
                      <strong>{count}</strong>
                    </button>
                  {/each}
                </div>
              {/if}
            </section>

            <section class="alive-side">
              <div class="alive-side-header enemy">
                <span>Enemy</span>
                <strong>{aliveSummary.enemy}</strong>
              </div>
              {#if replayAliveCountsExpanded}
                <div class="count-grid side-grid">
                  {#each aliveEnemyGroups as [label, count]}
                    <button
                      class="alive-unit-card"
                      class:selected={selectedReplayProfileKey === replayProfileKey('enemy', label)}
                      on:click={() => selectReplayProfile('enemy', label)}
                      on:mouseenter={() => (hoveredReplayProfileKey = replayProfileKey('enemy', label))}
                      on:focus={() => (hoveredReplayProfileKey = replayProfileKey('enemy', label))}
                      on:mouseleave={() => (hoveredReplayProfileKey = null)}
                      on:blur={() => (hoveredReplayProfileKey = null)}
                    >
                      <span>{label}</span>
                      <strong>{count}</strong>
                    </button>
                  {/each}
                </div>
              {/if}
            </section>
          </div>
        {/if}
      </section>

      <section class="collapsible-stack" class:collapsed={replayEventLogCollapsed}>
        <button class="panel panel-toggle event-log-toggle" on:click={() => (replayEventLogCollapsed = !replayEventLogCollapsed)}>
          <div>
            <p class="eyebrow">Event Log</p>
            <strong>{replayEventLogCollapsed ? 'Collapsed' : 'Live Timeline'}</strong>
          </div>
          <span>{replayEventLogCollapsed ? 'Show' : 'Hide'}</span>
        </button>
        {#if !replayEventLogCollapsed}
          <div class="event-log-wrap">
            <EventLog
              steps={currentReplay.steps}
              selected={$state.selectedEvent}
              currentStep={$state.currentStep}
              showTitle={false}
              onSelect={(index) => gameStore.selectEvent(index)}
            />
          </div>
        {/if}
      </section>
    </section>

    <div class="replay-exit">
      <button class="replay-exit-button" on:click={() => gameStore.closeReplay()}>Return to Overworld</button>
    </div>
  </main>
{:else}
  <main class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Cycle {$state.game.cycleNumber}</p>
        <h1>Shiftmake Command Table</h1>
      </div>

      <div class="resource-strip">
        <div class="resource-gold"><span>Gold</span><strong><i class="resource-icon gold"></i>{formatFixed($state.game.resources.gold)}</strong></div>
        <div class="resource-essence"><span>Essence</span><strong><i class="resource-icon essence"></i>{formatFixed($state.game.resources.essence)}</strong></div>
        <div><span>Active</span><strong>{statusCounts.active}</strong></div>
        <div><span>Recovering</span><strong>{statusCounts.recovering}</strong></div>
        <div><span>Idle</span><strong>{statusCounts.idle}</strong></div>
      </div>

      <div class="mode-toggle">
        <button class:selected={$state.centerMode === 'rifts'} on:click={() => gameStore.setCenterMode('rifts')}>Rifts</button>
        <button class:selected={$state.centerMode === 'troops'} on:click={() => gameStore.setCenterMode('troops')}>Factions & Troops</button>
        <button on:click={() => returnToMainMenu()}>Main Menu</button>
      </div>
    </header>

    <section class="left-column">
      <div class="panel">
        {#if selectedRift}
          <p class="eyebrow">Selected Rift</p>
          <h2>{selectedRift.id}</h2>
          <p>Tier {selectedRift.tier}</p>
          <div class="mutator-row">
            <span>Mutators</span>
            <div class="mutator-list">
              {#if selectedRift.mutatorIds.length === 0}
                <span class="mutator-chip empty">None</span>
              {:else}
                {#each selectedRift.mutatorIds as mutatorId}
                  <button
                    class="mutator-chip"
                    on:mouseenter={() => showMutatorDetail(mutatorId)}
                    on:focus={() => showMutatorDetail(mutatorId)}
                    on:mouseleave={() => clearDetail()}
                    on:blur={() => clearDetail()}
                  >
                    {getMutator(mutatorId).label}
                  </button>
                {/each}
              {/if}
            </div>
          </div>
          <div class="reward-summary" aria-label={`Rewards: ${describeRewardPackage(selectedRift.rewardPackage)}`}>
            {#if selectedRift.rewardPackage.resources.gold > 0}
              <span class="reward-pill">
                <i class="resource-icon gold"></i>
                {formatFixed(selectedRift.rewardPackage.resources.gold)}
              </span>
            {/if}
            {#if selectedRift.rewardPackage.resources.essence > 0}
              <span class="reward-pill">
                <i class="resource-icon essence"></i>
                {formatFixed(selectedRift.rewardPackage.resources.essence)}
              </span>
            {/if}
            {#if selectedRift.rewardPackage.upgradeChoiceBatches > 0}
              <span class="reward-pill upgrade-pill">Upgrade x{selectedRift.rewardPackage.upgradeChoiceBatches}</span>
            {/if}
          </div>
          <div class="compact-list">
            {#each selectedRift.enemyArmy as group}
              <div>
                <span>{group.label}</span>
                <strong>x{group.quantity}</strong>
              </div>
            {/each}
          </div>
          <div class="assignment-panel">
            <p class="assignment-label">Ready Troops</p>
            {#if selectedRiftAssignableTroops.length === 0}
              <p class="assignment-empty">No idle troops are ready for this Rift.</p>
            {:else}
              <div class="assignment-list">
                {#each selectedRiftAssignableTroops as troop}
                  {@const troopDef = getTroopEffectiveDefinition($state.game, troop.id)}
                  <button
                    class:assigned={troopAssignedTo(selectedRift, troop.id)}
                    on:click={() => gameStore.assignTroopToRift(troop.id, selectedRift.id)}
                  >
                    <span>{troopDef.label}</span>
                    <small>{troopAssignedTo(selectedRift, troop.id) ? 'Assigned' : `Qty ${troop.quantity}`}</small>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else if selectedRecruitableTroop}
          <p class="eyebrow">Recruitable Troop</p>
          <h2>{selectedRecruitableTroop.troopDef.label}</h2>
          <p>For {selectedRecruitableTroop.faction.label}</p>
          <div class="stats-grid">
            <div><span>Health</span><strong>{formatFixed(selectedRecruitableTroop.troopDef.stats.health)}</strong></div>
            <div><span>Damage</span><strong>{formatFixed(selectedRecruitableTroop.troopDef.stats.damage)}</strong></div>
            <div><span>Speed</span><strong>{formatFixed(selectedRecruitableTroop.troopDef.stats.speed)}</strong></div>
            <div><span>Armor</span><strong>{formatFixed(selectedRecruitableTroop.troopDef.stats.armor)}</strong></div>
            <div><span>Range</span><strong>{formatFixed(selectedRecruitableTroop.troopDef.stats.range)}</strong></div>
            <div><span>Capacity</span><strong>{formatFixed(selectedRecruitableTroop.troopDef.stats.capacity)}</strong></div>
          </div>
          <div class="ability-row">
            <span>Abilities</span>
            <div class="ability-list">
              {#if selectedRecruitableTroop.troopDef.abilities.length === 0}
                <span class="mutator-chip empty">None</span>
              {:else}
                {#each selectedRecruitableTroop.troopDef.abilities as ability}
                  <button
                    class="mutator-chip ability-chip"
                    on:mouseenter={() => showAbilityDetail(ability)}
                    on:focus={() => showAbilityDetail(ability)}
                    on:mouseleave={() => clearDetail()}
                    on:blur={() => clearDetail()}
                  >
                    {ability.label}
                  </button>
                {/each}
              {/if}
            </div>
          </div>
          <p class="purchase-cost"><i class="resource-icon essence"></i>{pendingPurchase?.kind === 'unlockTroop' ? formatFixed(pendingPurchase.cost) : ''}</p>
          <p class="purchase-caption">This troop is not yet recruited.</p>
        {:else if selectedTroop}
          {@const troopDef = getTroopEffectiveDefinition($state.game, selectedTroop.id)}
          <p class="eyebrow">Allied Troop</p>
          <h2>{troopDef.label}</h2>
          <p>Qty {selectedTroop.quantity} {selectedTroop.recoveryCyclesRemaining > 0 ? `| Recovering ${selectedTroop.recoveryCyclesRemaining}` : '| Ready'}</p>
          <div class="stats-grid">
            <div><span>Health</span><strong>{formatFixed(troopDef.stats.health)}</strong></div>
            <div><span>Damage</span><strong>{formatFixed(troopDef.stats.damage)}</strong></div>
            <div><span>Speed</span><strong>{formatFixed(troopDef.stats.speed)}</strong></div>
            <div><span>Armor</span><strong>{formatFixed(troopDef.stats.armor)}</strong></div>
            <div><span>Range</span><strong>{formatFixed(troopDef.stats.range)}</strong></div>
            <div><span>Capacity</span><strong>{formatFixed(troopDef.stats.capacity)}</strong></div>
          </div>
          <div class="ability-row">
            <span>Abilities</span>
            <div class="ability-list">
              {#if troopDef.abilities.length === 0}
                <span class="mutator-chip empty">None</span>
              {:else}
                {#each troopDef.abilities as ability}
                  <button
                    class="mutator-chip ability-chip"
                    on:mouseenter={() => showAbilityDetail(ability)}
                    on:focus={() => showAbilityDetail(ability)}
                    on:mouseleave={() => clearDetail()}
                    on:blur={() => clearDetail()}
                  >
                    {ability.label}
                  </button>
                {/each}
              {/if}
            </div>
          </div>
          <div class="actions-grid">
            <button class:unaffordable-button={!canAffordGold(getTroopAddUnitCost(selectedTroop))} disabled={!canAffordGold(getTroopAddUnitCost(selectedTroop))} on:click={() => gameStore.buyTroopUnit(selectedTroop.id)}>
              <span>Add Unit</span>
              <small class:unaffordable={!canAffordGold(getTroopAddUnitCost(selectedTroop))}><i class="resource-icon gold"></i>{formatFixed(getTroopAddUnitCost(selectedTroop))}</small>
            </button>
            {#each troopUpgradeOrder as stat}
              {#if canUpgradeStat(selectedTroop.unitTypeId, stat)}
                <button class:unaffordable-button={!canAffordGold(getTroopStatUpgradeCost(selectedTroop, stat))} disabled={!canAffordGold(getTroopStatUpgradeCost(selectedTroop, stat))} on:click={() => gameStore.buyTroopStatUpgrade(selectedTroop.id, stat)}>
                  <span>{stat} +</span>
                  <small class:unaffordable={!canAffordGold(getTroopStatUpgradeCost(selectedTroop, stat))}><i class="resource-icon gold"></i>{formatFixed(getTroopStatUpgradeCost(selectedTroop, stat))}</small>
                </button>
              {/if}
            {/each}
          </div>
        {:else if selectedFactionUpgrade}
          <p class="eyebrow">Faction Upgrade</p>
          <h2>{selectedFactionUpgrade.label}</h2>
          <p>{selectedFactionUpgrade.description}</p>
          <p class="purchase-cost"><i class="resource-icon gold"></i>{formatFixed(selectedFactionUpgrade.cost)}</p>
          <p class="purchase-caption">This doctrine is not yet purchased.</p>
        {:else if selectedRecruitableFaction}
          <p class="eyebrow">Recruitable Faction</p>
          <h2>{selectedRecruitableFaction.label}</h2>
          <p>{selectedRecruitableFaction.description}</p>
          <div class="compact-list">
            {#if selectedRecruitableFactionModifierLines.length > 0}
              <div>
                <span>Faction Modifiers</span>
                <strong>{selectedRecruitableFactionModifierLines.join(', ')}</strong>
              </div>
            {/if}
            <div>
              <span>Available Troops</span>
              <div class="preview-pill-row">
                {#each selectedRecruitableFactionTroopPreviews as preview}
                  <button
                    class="mutator-chip preview-chip"
                    on:mouseenter={() => showTroopDetail(selectedRecruitableFaction.id, preview.unitTypeId)}
                    on:focus={() => showTroopDetail(selectedRecruitableFaction.id, preview.unitTypeId)}
                    on:mouseleave={() => clearDetail()}
                    on:blur={() => clearDetail()}
                  >
                    {preview.troopDef.label}
                  </button>
                {/each}
              </div>
            </div>
            <div>
              <span>Faction Upgrades</span>
              <div class="preview-pill-row">
                {#each selectedRecruitableFactionUpgrades as upgrade}
                  <button
                    class="mutator-chip ability-chip"
                    on:mouseenter={() => showUpgradeDetail(upgrade.id)}
                    on:focus={() => showUpgradeDetail(upgrade.id)}
                    on:mouseleave={() => clearDetail()}
                    on:blur={() => clearDetail()}
                  >
                    {upgrade.label}
                  </button>
                {/each}
              </div>
            </div>
          </div>
          <p class="purchase-cost"><i class="resource-icon essence"></i>{pendingPurchase?.kind === 'unlockFaction' ? formatFixed(pendingPurchase.cost) : ''}</p>
          <p class="purchase-caption">This faction is not yet allied.</p>
        {:else if selectedFactionId}
          <p class="eyebrow">Allied Faction</p>
          <h2>{getFaction(selectedFactionId).label}</h2>
          <p>{getFaction(selectedFactionId).description}</p>
          <div class="compact-list">
            {#each factionTroops as troop}
              <button class="list-button" on:click={() => selectTroop(troop.id)}>{troop.id}</button>
            {/each}
          </div>
          {#if selectedFactionOwnedUpgrades.length > 0}
            <div class="compact-list">
              {#each selectedFactionOwnedUpgrades as upgrade}
                <div>
                  <span>Active Upgrade</span>
                  <strong>{upgrade.label}</strong>
                </div>
              {/each}
            </div>
          {/if}
          <div class="actions-grid">
            {#each availableFactionTroopUnlocks as unitTypeId}
              <button
                class:selected-action={pendingPurchase?.kind === 'unlockTroop' && pendingPurchase.factionId === selectedFactionId && pendingPurchase.unitTypeId === unitTypeId}
                on:click={() => selectRecruitableTroop(selectedFactionId, unitTypeId)}
              >
                <span>Unlock {getUnitType(unitTypeId).label}</span>
                <small class:unaffordable={!canAffordEssence(getTroopUnlockCost($state.game, selectedFactionId, unitTypeId))}><i class="resource-icon essence"></i>{formatFixed(getTroopUnlockCost($state.game, selectedFactionId, unitTypeId))}</small>
              </button>
            {/each}
            {#each selectedFactionDefaultUpgrades as upgrade}
              <button
                class:selected-action={pendingPurchase?.kind === 'factionUpgrade' && pendingPurchase.upgradeId === upgrade.id}
                on:click={() => selectFactionUpgradePurchase(upgrade.id, selectedFactionId)}
              >
                <span>{upgrade.label}</span>
                <small class:unaffordable={!canAffordGold(upgrade.cost)}><i class="resource-icon gold"></i>{formatFixed(upgrade.cost)}</small>
              </button>
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
              <div class="reward-summary" aria-label={`Rewards: ${describeRewardPackage(rift.rewardPackage)}`}>
                {#if rift.rewardPackage.resources.gold > 0}
                  <span class="reward-pill">
                    <i class="resource-icon gold"></i>
                    {formatFixed(rift.rewardPackage.resources.gold)}
                  </span>
                {/if}
                {#if rift.rewardPackage.resources.essence > 0}
                  <span class="reward-pill">
                    <i class="resource-icon essence"></i>
                    {formatFixed(rift.rewardPackage.resources.essence)}
                  </span>
                {/if}
                {#if rift.rewardPackage.upgradeChoiceBatches > 0}
                  <span class="reward-pill upgrade-pill">Upgrade x{rift.rewardPackage.upgradeChoiceBatches}</span>
                {/if}
              </div>
              <div class="mutator-list">
                {#if rift.mutatorIds.length === 0}
                  <span class="mutator-chip empty">No mutators</span>
                {:else}
                  {#each rift.mutatorIds as mutatorId}
                    <button
                      class="mutator-chip"
                      on:mouseenter={() => showMutatorDetail(mutatorId)}
                      on:focus={() => showMutatorDetail(mutatorId)}
                      on:mouseleave={() => clearDetail()}
                      on:blur={() => clearDetail()}
                    >
                      {getMutator(mutatorId).label}
                    </button>
                  {/each}
                {/if}
              </div>
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
                {#each getAvailableFactionTroopUnlocks($state.game, factionId) as unitTypeId}
                  <button
                    class:selected-action={pendingPurchase?.kind === 'unlockTroop' && pendingPurchase.factionId === factionId && pendingPurchase.unitTypeId === unitTypeId}
                    on:click={() => selectRecruitableTroop(factionId, unitTypeId)}
                  >
                    <span>+ {getUnitType(unitTypeId).label}</span>
                    <small class:unaffordable={!canAffordEssence(getTroopUnlockCost($state.game, factionId, unitTypeId))}><i class="resource-icon essence"></i>{formatFixed(getTroopUnlockCost($state.game, factionId, unitTypeId))}</small>
                  </button>
                {/each}
              </div>
              {#if Object.values(FACTION_UPGRADES).some((upgrade) => upgrade.factionId === factionId && upgrade.source === 'default' && !$state.game.factionUpgradeIds.includes(upgrade.id))}
                <div class="unlock-row">
                  {#each Object.values(FACTION_UPGRADES).filter((upgrade) => upgrade.factionId === factionId && upgrade.source === 'default' && !$state.game.factionUpgradeIds.includes(upgrade.id)) as upgrade}
                    <button
                      class:selected-action={pendingPurchase?.kind === 'factionUpgrade' && pendingPurchase.upgradeId === upgrade.id}
                      on:click={() => selectFactionUpgradePurchase(upgrade.id, factionId)}
                    >
                      <span>{upgrade.label}</span>
                      <small class:unaffordable={!canAffordGold(upgrade.cost)}><i class="resource-icon gold"></i>{formatFixed(upgrade.cost)}</small>
                    </button>
                  {/each}
                </div>
              {/if}
            </section>
          {/each}

          <section class="faction-card accent">
            <header>
              <strong>Recruit New Faction</strong>
              <small><i class="resource-icon essence"></i>{formatFixed(getFactionUnlockCost($state.game))}</small>
            </header>
            <div class="unlock-row">
              {#each lockedFactionIds as factionId}
                <button
                  class:selected-action={pendingPurchase?.kind === 'unlockFaction' && pendingPurchase.factionId === factionId}
                  on:click={() => selectRecruitableFaction(factionId)}
                >
                  <span>+ {getFaction(factionId).label}</span>
                  <small class:unaffordable={!canAffordEssence(getFactionUnlockCost($state.game))}><i class="resource-icon essence"></i>{formatFixed(getFactionUnlockCost($state.game))}</small>
                </button>
              {/each}
            </div>
          </section>
        </div>
      {/if}
    </section>

    <section class="right-column">
      {#if $state.systemMessage}
        <div class="panel warning-panel">
          <p class="eyebrow">System Message</p>
          <h2>System Notice</h2>
          <p>{$state.systemMessage}</p>
          <button on:click={() => gameStore.clearSystemMessage()}>Dismiss</button>
        </div>
      {/if}
      {#if $state.validationMessages.length > 0}
        <div class="panel warning-panel">
          <p class="eyebrow">Cycle Blocked</p>
          <h2>Can’t End Cycle Yet</h2>
          <ul class="warnings">
            {#each $state.validationMessages as message}
              <li>{message}</li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if hoveredDetail}
        <div class="panel detail-panel">
          <p class="eyebrow">
            {hoveredDetail.kind === 'mutator'
              ? 'Mutator Effect'
              : hoveredDetail.kind === 'ability'
                ? 'Ability Effect'
                : hoveredDetail.kind === 'upgrade'
                  ? 'Upgrade Preview'
                  : 'Troop Preview'}
          </p>
          <h2>{hoveredDetail.label}</h2>
          <p>{hoveredDetail.description}</p>
        </div>
      {:else}
        <div class="panel">
          <h2>Battle Archive</h2>
          {#if $state.game.replayIndex.length === 0}
            <p>No archived battles yet.</p>
          {:else}
            <div class="archive-list">
              {#each $state.game.replayIndex as replay}
                <button class="archive-card" class:selected={selectedReplayStorageKey === replay.replayId} on:click={() => selectReplay(replay.replayId)}>
                  <strong>{replay.summary}</strong>
                  <small>Cycle {replay.cycleNumber} | {replay.mutatorIds.map((id) => getMutator(id).label).join(', ') || 'No mutators'}</small>
                  {#if replay.summaryOnly}
                    <small>Summary only</small>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

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
      {#if pendingPurchase}
        <button class="large" on:click={() => clearPendingPurchase()}>Cancel Purchase</button>
        <button class="primary large" on:click={() => confirmPendingPurchase()} disabled={!purchaseAffordability(pendingPurchase)}>
          Confirm Purchase
        </button>
      {:else if selectedReplayEntry}
        <button class="large" on:click={() => (selectedReplayStorageKey = null)}>Back to Planning</button>
        <button class="primary large" on:click={() => openSelectedReplay()} disabled={!selectedReplayAvailable}>
          {selectedReplayAvailable ? 'Watch Battle' : selectedReplayEntry.summaryOnly ? 'Summary Only' : 'Replay Missing'}
        </button>
      {:else}
        <button class="primary large" on:click={() => attemptEndCycle()}>
          {$state.game.phase === 'reward_claims' ? 'Finish Rewards' : 'End Cycle'}
        </button>
      {/if}
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

  .shell {
    height: 100vh;
    overflow-y: auto;
    align-content: start;
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
  .compact-list div,
  .stats-grid div {
    display: grid;
    gap: 0.15rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: 14px;
    background: rgba(20, 28, 38, 0.7);
  }

  .resource-strip span,
  .compact-list span,
  .stats-grid span {
    color: #93a9bc;
    font-size: 0.75rem;
  }

  .resource-strip strong,
  .purchase-cost,
  .actions-grid small,
  .unlock-row small,
  .troop-chip small {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .resource-gold strong {
    color: #f3cc63;
  }

  .resource-essence strong {
    color: #c99bff;
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
  .slot-card,
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
  .assigned-strip,
  .assignment-list {
    display: grid;
    gap: 0.55rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .assigned-strip {
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  }

  .assignment-list {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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

  .archive-card.selected {
    outline: 2px solid #d4ad73;
    background:
      linear-gradient(145deg, rgba(44, 31, 15, 0.96), rgba(17, 22, 30, 0.96)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.18), transparent 42%);
  }

  .archive-card small,
  .troop-chip small,
  .draft-card small {
    color: #9db2c4;
  }

  .selected-action {
    outline: 2px solid #d4ad73;
    border-color: rgba(213, 178, 116, 0.6) !important;
  }

  .mutator-row {
    display: grid;
    gap: 0.45rem;
  }

  .mutator-row > span,
  .ability-row > span,
  .assignment-label {
    color: #93a9bc;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .mutator-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .reward-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .reward-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(117, 145, 168, 0.18);
    background: rgba(16, 27, 38, 0.85);
    color: #dce9f4;
    font-size: 0.82rem;
    font-weight: 600;
  }

  .upgrade-pill {
    border-color: rgba(212, 173, 115, 0.24);
    background: rgba(31, 24, 16, 0.82);
    color: #f1d7ae;
  }

  .ability-row {
    display: grid;
    gap: 0.45rem;
  }

  .ability-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .preview-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .mutator-chip {
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(117, 145, 168, 0.18);
    background: rgba(16, 27, 38, 0.85);
    color: #dce9f4;
    font-size: 0.76rem;
  }

  button.mutator-chip {
    cursor: pointer;
    font: inherit;
  }

  .mutator-chip.empty {
    color: #8fa3b5;
  }

  .ability-chip {
    border-color: rgba(212, 173, 115, 0.24);
    background: rgba(31, 24, 16, 0.82);
    color: #f1d7ae;
  }

  .preview-chip {
    border-color: rgba(120, 169, 219, 0.24);
    background: rgba(17, 31, 45, 0.88);
  }

  .detail-panel {
    min-height: 180px;
    align-content: start;
  }

  .purchase-cost {
    color: #d6c8ea;
    font-weight: 600;
  }

  .purchase-caption {
    color: #8fa3b5;
  }

  .assignment-panel {
    display: grid;
    gap: 0.6rem;
    padding-top: 0.2rem;
    border-top: 1px solid rgba(126, 157, 181, 0.12);
  }

  .assignment-empty {
    color: #8fa3b5;
  }

  .assignment-list button {
    display: grid;
    gap: 0.25rem;
    text-align: left;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: 14px;
    background: rgba(22, 31, 42, 0.82);
    color: #f4f7fb;
    padding: 0.65rem 0.8rem;
    font: inherit;
  }

  .assignment-list button.assigned {
    border-color: rgba(213, 178, 116, 0.55);
    background:
      linear-gradient(145deg, rgba(60, 42, 20, 0.9), rgba(20, 26, 34, 0.92)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.18), transparent 45%);
  }

  .warnings {
    margin: 0;
    padding-left: 1rem;
    color: #f2c58c;
  }

  .warning-panel {
    border-color: rgba(242, 197, 140, 0.28);
    background:
      linear-gradient(160deg, rgba(39, 28, 16, 0.94), rgba(19, 14, 11, 0.94)),
      radial-gradient(circle at top right, rgba(242, 197, 140, 0.12), transparent 38%);
  }

  .resource-icon {
    display: inline-block;
    flex: 0 0 auto;
    width: 0.78rem;
    height: 0.78rem;
  }

  .resource-icon.gold {
    border-radius: 999px;
    background: radial-gradient(circle at 35% 35%, #fff2a8, #f3cc63 58%, #b8871d 100%);
    box-shadow: 0 0 0 1px rgba(255, 218, 117, 0.2);
  }

  .resource-icon.essence {
    background: linear-gradient(180deg, #efccff, #a866ff 70%, #6e35c2 100%);
    border-radius: 60% 60% 60% 0;
    transform: rotate(-45deg);
    box-shadow: 0 0 0 1px rgba(189, 137, 255, 0.24);
  }

  .unaffordable {
    color: #8a738f !important;
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
  }

  .unaffordable-button {
    opacity: 0.7;
  }

  .unaffordable-button span {
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
  }

  .action-rail {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.75rem;
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

  .menu-screen {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem;
  }

  .menu-panel {
    width: min(1180px, 100%);
    display: grid;
    gap: 1.4rem;
    padding: 2rem;
    border-radius: 28px;
    border: 1px solid rgba(193, 162, 114, 0.22);
    background:
      linear-gradient(150deg, rgba(17, 29, 41, 0.96), rgba(10, 15, 22, 0.98)),
      radial-gradient(circle at top left, rgba(197, 154, 90, 0.18), transparent 38%);
  }

  .menu-copy {
    display: grid;
    gap: 0.55rem;
  }

  .slot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
  }

  .slot-card {
    min-height: 220px;
    display: grid;
    gap: 0.8rem;
    align-content: start;
    text-align: left;
  }

  .slot-card.selected {
    outline: 2px solid #d4ad73;
    background:
      linear-gradient(145deg, rgba(44, 31, 15, 0.96), rgba(17, 22, 30, 0.96)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.18), transparent 42%);
  }

  .slot-card-header,
  .slot-meta,
  .menu-actions {
    display: grid;
    gap: 0.55rem;
  }

  .slot-label {
    color: #c7b18b;
    font-size: 0.76rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .slot-meta {
    color: #9db2c4;
  }

  .menu-actions {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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

  .replay-shell {
    height: 100vh;
    grid-template-columns: 280px minmax(0, 1fr) 320px;
    grid-template-rows: minmax(0, 1fr) auto;
    align-items: stretch;
    overflow: hidden;
    background:
      radial-gradient(circle at top left, rgba(25, 48, 71, 0.28), transparent 25%),
      radial-gradient(circle at bottom right, rgba(118, 56, 35, 0.22), transparent 28%),
      linear-gradient(180deg, #060a11, #0a1018 58%, #0d121a);
  }

  .replay-left,
  .replay-right,
  .replay-center {
    min-height: 0;
  }

  .replay-left {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 0.85rem;
  }

  .replay-right {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 0.85rem;
    overflow: hidden;
  }

  .replay-center {
    min-height: 680px;
  }

  .replay-header {
    display: grid;
    gap: 0.55rem;
    align-content: start;
    padding: 0.2rem 0.15rem;
  }

  .replay-name {
    font-size: 0.82rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #d8e1e9;
  }

  .replay-mutators {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .focus-panel {
    min-height: 0;
    align-content: start;
    overflow: auto;
  }

  .focus-empty,
  .replay-detail-panel {
    display: grid;
    gap: 0.7rem;
    align-content: start;
  }

  .panel-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.85rem;
    padding: 0;
    background: transparent;
    border: 0;
    color: inherit;
    text-align: left;
  }

  .panel-toggle strong {
    font-size: 1rem;
    color: #f0f5fb;
  }

  .panel-toggle span {
    color: #9db2c4;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .collapsible-panel {
    gap: 0.9rem;
  }

  .event-log-toggle {
    padding: 0.9rem 1rem;
  }

  .collapsible-stack {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.7rem;
  }

  .collapsible-stack.collapsed {
    grid-template-rows: auto;
  }

  .event-log-wrap {
    min-height: 0;
    overflow: hidden;
  }

  .event-log-wrap :global(.panel) {
    height: 100%;
  }

  .event-log-wrap :global(.log) {
    max-height: none;
    min-height: 0;
  }

  .viewport {
    height: 100%;
    min-height: 680px;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: 28px;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 20%, rgba(46, 70, 89, 0.9), transparent 42%),
      linear-gradient(180deg, #10202c, #08101a 62%, #06090f);
    box-shadow: inset 0 0 0 1px rgba(201, 171, 124, 0.06);
  }

  .count-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.55rem;
  }

  .alive-sides {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }

  .alive-sides.compact {
    gap: 0.6rem;
  }

  .alive-side {
    display: grid;
    gap: 0.7rem;
    align-content: start;
  }

  .alive-side-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid rgba(126, 157, 181, 0.16);
  }

  .alive-side-header span {
    color: #c9d8e5;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .alive-side-header strong {
    font-size: 1.5rem;
  }

  .alive-side-header.enemy strong {
    color: #ffb8b8;
  }

  .side-grid {
    grid-template-columns: 1fr;
  }

  .alive-unit-card {
    display: grid;
    gap: 0.15rem;
    width: 100%;
    padding: 0.55rem 0.7rem;
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: 14px;
    background: rgba(20, 28, 38, 0.7);
    color: #f4f7fb;
    text-align: left;
    font: inherit;
  }

  .alive-unit-card:hover,
  .alive-unit-card:focus,
  .alive-unit-card.selected {
    border-color: rgba(213, 178, 116, 0.55);
    background: rgba(36, 28, 18, 0.75);
  }

  .replay-exit {
    grid-column: 2;
    display: flex;
    justify-content: center;
    padding-top: 0.2rem;
  }

  .replay-exit-button {
    min-width: 180px;
    padding: 0.55rem 0.95rem;
    border-radius: 999px;
    border: 1px solid rgba(213, 178, 116, 0.42);
    background: rgba(20, 26, 34, 0.92);
    color: #f4f7fb;
    font: inherit;
  }

  @media (max-width: 1280px) {
    .shell,
    .replay-shell {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto auto;
    }

    .topbar {
      grid-template-columns: 1fr;
    }

    .resource-strip {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .viewport {
      min-height: 420px;
    }

    .alive-sides {
      grid-template-columns: 1fr;
    }

    .replay-exit {
      grid-column: 1;
    }
  }
</style>
