<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy, onMount, tick } from 'svelte';
  import { BattleRenderer, type UnitPointerInfo } from '../rendering/BattleRenderer';
  import { getFactionSpriteUrl, loadFactionUnitPortraitUrls } from '../rendering/unitVisuals';
  import { canUpgradeStat, getAvailableFactionTroopUnlocks, getFactionTroops, getFactionUnlockCost, getResolvedStatBreakdowns, getTroopAddUnitCost, getTroopEffectiveDefinition, getTroopStatUpgradeCost, getTroopStatusCounts, getTroopUnlockCost, getTroopsAssignedToRift } from '../engine/army';
  import { formatFixed } from '../engine/fixed';
  import { getStartingFactionUnitType, validateAssignments } from '../engine/game';
  import { composeBaseTroopDefinition, FACTION_UPGRADES, FACTIONS, UNIT_TYPES, getAbility, getFaction, getFactionUpgrade, getMutator, getUnitType } from '../engine/unitCatalog';
  import type { AbilityDefinition, BattleReplay, BattleUnit, ExplainedStatKey, FactionId, RewardPackage, RiftInstance, SideId, StatBreakdown, StatBreakdownLine, TroopId, TroopStatKey, UnitTypeId } from '../engine/types';
  import { gameStore } from '../store/gameStore';
  import type { SaveSlotId, SaveSlotSummary } from '../store/saveSlots';
  import BattleControls from './BattleControls.svelte';
  import { buildBattleRecap, findLastAliveStep, isUnitAliveAtStep, type BattleRecapTroopEntry, type BattleRecapUnitEntry } from './battleRecap';
  import EventLog from './EventLog.svelte';
  import { describeTroopUnlock } from '../engine/upgrades';
  import { displayIcon, formatAbilityExact, statIcon } from './inspectText';
  import { getRiftVisual } from './riftVisuals';
  import StatBreakdownGrid from './StatBreakdownGrid.svelte';
  import UnitTooltip from './UnitTooltip.svelte';

  const state = gameStore;
  let viewport: HTMLDivElement;
  let renderer: BattleRenderer | null = null;
  let rendererHost: HTMLDivElement | null = null;
  let rendererInitPromise: Promise<void> | null = null;
  let viewportResizeObserver: ResizeObserver | null = null;
  let mountedReplayId: string | null = null;
  let replayUiId: string | null = null;
  let autoTimer: ReturnType<typeof setInterval> | null = null;
  let selectedTroopId: TroopId | null = null;
  let selectedRiftId: string | null = null;
  let selectedFactionId: FactionId | null = null;
  let selectedReplayStorageKey: string | null = null;
  let hoveredReplayProfileKey: string | null = null;
  let selectedReplayProfileKey: string | null = null;
  let unlockFactionMenuOpen = false;
  let hoveredBlockedFactionUnlockId: FactionId | null = null;
  let hoveredPointer: UnitPointerInfo | null = null;
  let lockedPointer: UnitPointerInfo | null = null;
  let replayAliveCountsExpanded = false;
  let replayEventLogCollapsed = false;
  let replayRecapOpen = false;
  let expandedReplayRecapTroopKey: string | null = null;
  let detailHideTimer: ReturnType<typeof setTimeout> | null = null;
  type HoveredDetail =
    | {
        detailKey: string;
        kind: 'mutator';
        label: string;
        description: string;
      }
    | {
        detailKey: string;
        kind: 'faction';
        label: string;
        description: string;
      }
    | {
        detailKey: string;
        kind: 'ability';
        label: string;
        description: string;
      }
    | {
        detailKey: string;
        kind: 'upgrade' | 'troop';
        label: string;
        description: string;
      }
    | {
        detailKey: string;
        kind: 'unit';
        label: string;
        description: string;
        portraitUrl: string;
        stats: Array<{ key: string; label: string; value: string; breakdown: StatBreakdown | null; action?: { label: string; cost: string; disabled?: boolean; onClick?: () => void; onMouseEnter?: () => void; onMouseLeave?: () => void } }>;
        abilities: Array<{ label: string; description: string }>;
      }
    | null;

  let selectedMenuSlotId: SaveSlotId | null = null;
  let newCampaignCheatUpgrades = false;
  let newCampaignCheatBlueprints = false;
  let newCampaignCheatResources = false;
  let factionUnitPortraits: Record<string, string> = {};
  let hoveredDetail: HoveredDetail = null;
  let pinnedDetail: Exclude<HoveredDetail, null> | null = null;
  let hoveredAbilityTooltip: { label: string; description: string } | null = null;
  let hoveredUpgradeTooltip: { label: string; description: string } | null = null;
  let pendingPurchase:
    | { kind: 'unlockFaction'; factionId: FactionId; cost: number }
    | { kind: 'unlockTroop'; factionId: FactionId; unitTypeId: UnitTypeId; cost: number }
    | { kind: 'factionUpgrade'; upgradeId: string; factionId: FactionId; cost: number }
    | null = null;

  const explainedStatOrder: ExplainedStatKey[] = ['health', 'damage', 'speed', 'armor', 'range', 'capacity', 'size'];
  const replayProfileKey = (side: 'player' | 'enemy', troopLabel: string): string => `${side}:${troopLabel}`;

  function getFactionUnitPortrait(factionId: FactionId, unitTypeId: UnitTypeId): string {
    return factionUnitPortraits[`${factionId}/${unitTypeId}`] ?? '';
  }

  function getFactionPortrait(factionId: FactionId): string {
    return getFactionSpriteUrl(factionId);
  }

  function buildStatEntries(
    stats: { health: number; damage: number; speed: number; armor: number; range: number; capacity: number; size?: number },
    breakdowns?: Partial<Record<ExplainedStatKey, StatBreakdown>>,
    includeSize = false,
    quantity?: number,
  ) {
    const keys = includeSize ? explainedStatOrder : explainedStatOrder.filter((stat) => stat !== 'size');
    const entries = keys.map((key) => ({
      key,
      label: displayIcon(key),
      value: formatFixed(key === 'size' ? stats.size ?? 0 : stats[key as keyof typeof stats] as number),
      breakdown: breakdowns?.[key] ?? null,
    }));
    if (typeof quantity === 'number') {
      entries.push({
        key: 'quantity',
        label: displayIcon('quantity'),
        value: formatFixed(quantity),
        breakdown: null,
      });
    }
    return entries;
  }

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

  function cancelDetailHideTimer(): void {
    if (detailHideTimer) {
      clearTimeout(detailHideTimer);
      detailHideTimer = null;
    }
  }

  function clearOverworldDetailState(): void {
    cancelDetailHideTimer();
    hoveredDetail = null;
    pinnedDetail = null;
    hoveredAbilityTooltip = null;
    hoveredUpgradeTooltip = null;
  }

  function selectTroop(troopId: TroopId): void {
    clearOverworldDetailState();
    pendingPurchase = null;
    selectedTroopId = troopId;
    selectedRiftId = null;
    selectedFactionId = get(state).game.troops.find((troop) => troop.id === troopId)?.factionId ?? null;
  }

  function selectRift(riftId: string): void {
    clearOverworldDetailState();
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
    clearOverworldDetailState();
    unlockFactionMenuOpen = false;
    pendingPurchase = null;
    selectedFactionId = factionId;
    selectedTroopId = null;
    selectedRiftId = null;
  }

  function openUnlockFactionMenu(): void {
    if (lockedFactionIds.length === 0) {
      return;
    }
    clearOverworldDetailState();
    unlockFactionMenuOpen = true;
  }

  function closeUnlockFactionMenu(): void {
    unlockFactionMenuOpen = false;
    clearOverworldDetailState();
  }

  function selectRecruitableFaction(factionId: FactionId): void {
    clearOverworldDetailState();
    unlockFactionMenuOpen = false;
    selectedFactionId = null;
    selectedTroopId = null;
    selectedRiftId = null;
    pendingPurchase = null;
    gameStore.unlockFaction(factionId);
  }

  function selectRecruitableTroop(factionId: FactionId, unitTypeId: UnitTypeId): void {
    clearOverworldDetailState();
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
    clearOverworldDetailState();
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
    void loadFactionUnitPortraitUrls().then((portraits) => {
      factionUnitPortraits = portraits;
    });

    if (typeof ResizeObserver !== 'undefined') {
      viewportResizeObserver = new ResizeObserver(() => {
        renderer?.refreshViewport();
      });
    }
  });

  onDestroy(() => {
    clearAutoTimer();
    viewportResizeObserver?.disconnect();
    renderer?.destroy();
  });

  $: currentReplay = $state.loadedReplay;
  $: if (currentReplay && currentReplay.id !== replayUiId) {
    replayUiId = currentReplay.id;
    hoveredReplayProfileKey = null;
    selectedReplayProfileKey = null;
    replayAliveCountsExpanded = false;
    replayEventLogCollapsed = false;
    replayRecapOpen = false;
    expandedReplayRecapTroopKey = null;
    hoveredDetail = null;
    lockedPointer = null;
    hoveredPointer = null;
  }
  $: if ($state.screen === 'replay' && currentReplay && viewport) {
    void ensureRenderer();
  }
  $: if (viewport) {
    viewportResizeObserver?.disconnect();
    viewportResizeObserver?.observe(viewport);
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
  $: activeUnitBuffLines = currentReplay && activeUnit ? buildReplayBuffLines(activeUnit.id, currentReplay, $state.currentStep) : {};
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
  $: selectedTroopDef = selectedTroop ? getTroopEffectiveDefinition($state.game, selectedTroop.id) : null;
  $: selectedTroopStatBreakdowns = selectedTroop ? getResolvedStatBreakdowns($state.game, selectedTroop, 'player') : null;
  $: selectedTroopStatEntries =
    selectedTroop && selectedTroopDef && selectedTroopStatBreakdowns
      ? buildStatEntries(selectedTroopDef.stats, selectedTroopStatBreakdowns, true, selectedTroop.quantity).map((entry) => {
          if (entry.key === 'quantity' || entry.key === 'size') {
            return entry;
          }

          const stat = entry.key as TroopStatKey;
          if (!canUpgradeStat(selectedTroop.unitTypeId, stat)) {
            return entry;
          }

          return {
            ...entry,
            action: {
              label: '+',
              cost: formatFixed(getTroopStatUpgradeCost(selectedTroop, stat)),
              disabled: !canAffordGold(getTroopStatUpgradeCost(selectedTroop, stat)),
              onClick: () => gameStore.buyTroopStatUpgrade(selectedTroop.id, stat),
              onMouseEnter: () => showUpgradeTooltip(selectedTroop, stat),
              onMouseLeave: () => (hoveredUpgradeTooltip = null),
            },
          };
        })
      : [];
  $: selectedRift = selectedRiftId ? $state.game.openRifts.find((rift) => rift.id === selectedRiftId) ?? null : null;
  $: selectedReplayEntry = selectedReplayStorageKey
    ? $state.game.replayIndex.find((replay) => replay.replayId === selectedReplayStorageKey) ?? null
    : null;
  $: selectedReplayAvailable =
    selectedReplayEntry && !selectedReplayEntry.summaryOnly ? gameStore.hasReplay(selectedReplayEntry.replayId) : false;
  $: activeDetailKey = activeDetail?.detailKey ?? null;
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
  $: replayRecap = currentReplay ? buildBattleRecap(currentReplay) : [] as BattleRecapTroopEntry[];
  $: replayRecapPlayerTroops = replayRecap.filter((entry) => entry.side === 'player');
  $: replayRecapEnemyTroops = replayRecap.filter((entry) => entry.side === 'enemy');
  $: replayRecapSides = [
    { side: 'player' as SideId, label: 'Player', troops: replayRecapPlayerTroops },
    { side: 'enemy' as SideId, label: 'Enemy', troops: replayRecapEnemyTroops },
  ];
  $: replayFocusProfile = hoveredReplayProfile ?? activeUnitProfile ?? selectedReplayProfile;
  $: activeDetail = pinnedDetail ?? hoveredDetail;
  $: selectedRiftAssignableTroops = selectedRift
    ? $state.game.troops.filter(
        (troop) =>
          troop.unlocked &&
          troop.recoveryCyclesRemaining === 0 &&
          (troop.assignmentRiftId === null || troop.assignmentRiftId === selectedRift.id),
      )
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
    const previewTroop = {
      id: '__preview__',
      factionId,
      unitTypeId,
      quantity: base.quantity,
      unlocked: false,
      statUpgradeLevels: { health: 0, damage: 0, speed: 0, armor: 0, range: 0, capacity: 0 },
      recoveryCyclesRemaining: 0,
      assignmentRiftId: null,
    };
    const previewState = {
      ...$state.game,
      troops: [...$state.game.troops, previewTroop],
    };

    return {
      ...getTroopEffectiveDefinition(previewState, '__preview__'),
      statBreakdowns: getResolvedStatBreakdowns(previewState, previewTroop, 'player'),
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

  function unlockFactionBlockedMessage(cost: number, currentEssence: number): string {
    return `You need ${formatFixed(cost)} essence to unlock a new faction. You currently have ${formatFixed(currentEssence)} essence.`;
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

  function zoomReplayIn(): void {
    renderer?.zoomIn();
  }

  function zoomReplayOut(): void {
    renderer?.zoomOut();
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
    gameStore.startNewCampaign(selectedMenuSlotId, {
      cheatUpgrades: newCampaignCheatUpgrades,
      cheatBlueprints: newCampaignCheatBlueprints,
      cheatResources: newCampaignCheatResources,
    });
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

  function getInspectableFactionTroopTypeIds(factionId: FactionId): UnitTypeId[] {
    const faction = getFaction(factionId);
    const unlockedOrUnlockableBlueprints = faction.blueprintUnitTypeIds.filter(
      (unitTypeId) =>
        $state.game.unlockedBlueprintTroopIds.includes(`${factionId}/${unitTypeId}`) ||
        $state.game.troops.some((troop) => troop.factionId === factionId && troop.unitTypeId === unitTypeId),
    );

    return [...new Set([...faction.defaultUnitTypeIds, ...unlockedOrUnlockableBlueprints])];
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

  function getReplayRecapTroopProfile(side: SideId, troopLabel: string) {
    return replayProfilesByKey.get(replayProfileKey(side, troopLabel)) ?? null;
  }

  function getReplayRecapUnitState(unitId: string): BattleUnit | null {
    return currentUnitById.get(unitId) ?? null;
  }

  function getReplayRecapBarWidth(value: number, totalValue: number): string {
    if (value <= 0 || totalValue <= 0) {
      return '0%';
    }

    return `${Math.min(100, (value / totalValue) * 100)}%`;
  }

  function getReplayRecapTeamDamageTotal(troops: BattleRecapTroopEntry[]): number {
    return troops.reduce((sum, troop) => sum + troop.damageDone, 0);
  }

  function getReplayRecapTeamHealingTotal(troops: BattleRecapTroopEntry[]): number {
    return troops.reduce((sum, troop) => sum + troop.healingDone, 0);
  }

  function getReplayRecapSharedScaleTotal(troops: BattleRecapTroopEntry[]): number {
    return Math.max(getReplayRecapTeamDamageTotal(troops), getReplayRecapTeamHealingTotal(troops));
  }

  function toggleReplayRecap(): void {
    replayRecapOpen = !replayRecapOpen;
    if (!replayRecapOpen) {
      expandedReplayRecapTroopKey = null;
    }
  }

  function toggleReplayRecapTroop(side: SideId, troopLabel: string): void {
    const key = replayProfileKey(side, troopLabel);
    expandedReplayRecapTroopKey = expandedReplayRecapTroopKey === key ? null : key;
  }

  function selectReplayRecapUnit(unitId: string, side: SideId, troopLabel: string): void {
    if (!currentReplay) {
      return;
    }

    const currentStep = $state.currentStep;
    const targetStep = isUnitAliveAtStep(currentReplay, unitId, currentStep)
      ? currentStep
      : findLastAliveStep(currentReplay, unitId, currentStep);

    gameStore.setAutoPlay(false);
    if (targetStep !== currentStep) {
      gameStore.jumpTo(targetStep);
    }

    selectReplayProfile(side, troopLabel);
    const pointer = { unitId, x: 0, y: 0 };
    lockedPointer = pointer;
    hoveredPointer = pointer;
    replayRecapOpen = false;
    expandedReplayRecapTroopKey = null;
  }

  function cycleReplayProfileUnit(side: 'player' | 'enemy', troopLabel: string): void {
    const matchingUnits = currentUnits
      .filter((unit) => unit.alive && unit.side === side && unit.troopLabel === troopLabel)
      .sort((left, right) => left.id.localeCompare(right.id));

    if (matchingUnits.length === 0) {
      return;
    }

    selectReplayProfile(side, troopLabel);
    const currentIndex = activeUnit?.side === side && activeUnit.troopLabel === troopLabel
      ? matchingUnits.findIndex((unit) => unit.id === activeUnit.id)
      : -1;
    const nextUnit = matchingUnits[(currentIndex + 1 + matchingUnits.length) % matchingUnits.length];
    if (!nextUnit) {
      return;
    }

    const pointer = { unitId: nextUnit.id, x: 0, y: 0 };
    lockedPointer = pointer;
    hoveredPointer = pointer;
  }

  function sameDetail(left: Exclude<HoveredDetail, null>, right: Exclude<HoveredDetail, null>): boolean {
    return left.detailKey === right.detailKey;
  }

  function hasPinnedDraftSelection(factionId: FactionId): boolean {
    return activeDetailKey === `faction:${factionId}` || activeDetailKey?.startsWith(`troop-preview:${factionId}:`) === true;
  }

  function previewDetail(detail: Exclude<HoveredDetail, null>): void {
    cancelDetailHideTimer();
    if (!pinnedDetail) {
      hoveredDetail = detail;
    }
  }

  function togglePinnedDetail(detail: Exclude<HoveredDetail, null>): void {
    cancelDetailHideTimer();
    pinnedDetail = pinnedDetail && sameDetail(pinnedDetail, detail) ? null : detail;
    hoveredDetail = null;
    hoveredAbilityTooltip = null;
  }

  function buildMutatorDetail(mutatorId: string): Exclude<HoveredDetail, null> {
    const mutator = getMutator(mutatorId);
    return {
      detailKey: `mutator:${mutatorId}`,
      kind: 'mutator',
      label: mutator.label,
      description: mutator.description,
    };
  }

  function showMutatorDetail(mutatorId: string): void {
    previewDetail(buildMutatorDetail(mutatorId));
  }

  function clearDetail(): void {
    cancelDetailHideTimer();
    detailHideTimer = setTimeout(() => {
      if (!pinnedDetail) {
        hoveredDetail = null;
      }
      hoveredAbilityTooltip = null;
      detailHideTimer = null;
    }, 140);
  }

  function showUpgradeDetail(upgradeId: string): void {
    previewDetail(buildUpgradeDetail(upgradeId));
  }

  function buildTroopDetail(factionId: FactionId, unitTypeId: UnitTypeId): Exclude<HoveredDetail, null> {
    const troop = getTroopEffectivePreview(factionId, unitTypeId);
    return buildResolvedUnitDetail(
      `troop-preview:${factionId}:${unitTypeId}`,
      troop.label,
      factionId,
      unitTypeId,
      troop.stats,
      troop.quantity,
      `${getFaction(factionId).label} troop preview`,
      troop.abilities,
      troop.statBreakdowns,
    );
  }

  function showTroopDetail(factionId: FactionId, unitTypeId: UnitTypeId): void {
    previewDetail(buildTroopDetail(factionId, unitTypeId));
  }

  function buildFactionDetail(factionId: FactionId): Exclude<HoveredDetail, null> {
    const faction = getFaction(factionId);
    const modifierLines = describeFactionModifiers(factionId);
    return {
      detailKey: `faction:${factionId}`,
      kind: 'faction',
      label: faction.label,
      description:
        modifierLines.length > 0
          ? `${faction.description} Modifiers: ${modifierLines.join(' | ')}.`
          : `${faction.description} No stat modifiers.`,
    };
  }

  function clearPreviewDetail(): void {
    cancelDetailHideTimer();
    if (!pinnedDetail) {
      hoveredDetail = null;
    }
    hoveredAbilityTooltip = null;
  }

  function describeFactionUpgrade(upgradeId: string): string {
    const upgrade = getFactionUpgrade(upgradeId);
    const effectDescriptions = upgrade.effects.map((effect) => {
      if (effect.kind === 'addAbility') {
        const ability = getAbility(effect.abilityId);
        return `${ability.label}: ${formatAbilityExact(ability)}`;
      }
      if (effect.kind === 'addAttribute') {
        return `Adds attribute ${effect.attribute} to all faction troops.`;
      }
      const entries = Object.entries(effect.statModifiers).map(([stat, modifier]) => {
        if ((modifier?.flat ?? 0) !== 0) {
          const flat = modifier?.flat ?? 0;
          return `${statIcon(stat as ExplainedStatKey)} ${flat > 0 ? '+' : ''}${formatFixed(flat)}`;
        }
        const pct = (((modifier?.multiplier ?? 1) - 1) * 100);
        return `${statIcon(stat as ExplainedStatKey)} ${pct > 0 ? '+' : ''}${formatFixed(pct)}%`;
      });
      const scope = effect.unitFilter === 'nonMelee' ? 'for non-melee troops' : 'for all faction troops';
      return `Adjusts ${entries.join(', ')} ${scope}.`;
    });
    return `Tier ${upgrade.tier}. Cost ${formatFixed(upgrade.cost)} gold. ${upgrade.description}${effectDescriptions.length > 0 ? ` ${effectDescriptions.join(' ')}` : ''}`;
  }

  function buildUpgradeDetail(upgradeId: string): Exclude<HoveredDetail, null> {
    const upgrade = getFactionUpgrade(upgradeId);
    return {
      detailKey: `upgrade:${upgradeId}`,
      kind: 'upgrade',
      label: upgrade.label,
      description: describeFactionUpgrade(upgradeId),
    };
  }

  function buildResolvedUnitDetail(
    detailKey: string,
    label: string,
    factionId: FactionId,
    unitTypeId: UnitTypeId,
    stats: { health: number; damage: number; speed: number; armor: number; range: number; capacity: number; size?: number },
    quantity: number,
    description: string,
    abilities: AbilityDefinition[],
    statBreakdowns?: Partial<Record<ExplainedStatKey, StatBreakdown>>,
  ): Exclude<HoveredDetail, null> {
    return {
      detailKey,
      kind: 'unit',
      label,
      description,
      portraitUrl: getFactionUnitPortrait(factionId, unitTypeId),
      stats: buildStatEntries(stats, statBreakdowns, true, quantity),
      abilities: abilities.map((ability) => ({ label: ability.label, description: formatAbilityExact(ability) })),
    };
  }

  function describeFactionModifiers(factionId: FactionId): string[] {
    const faction = getFaction(factionId);
    const entries = Object.entries(faction.statAdjustments);
    return entries
      .filter(([, adjustment]) => (adjustment?.flat ?? 0) !== 0 || (adjustment?.multiplier ?? 1) !== 1)
      .map(([key, adjustment]) => {
        const label = key in { health: 1, damage: 1, speed: 1, armor: 1, range: 1, capacity: 1, size: 1 }
          ? statIcon(key as ExplainedStatKey)
          : key;
        if ((adjustment?.flat ?? 0) !== 0) {
          const flat = adjustment?.flat ?? 0;
          return `${label}: ${flat > 0 ? '+' : ''}${formatFixed(flat)}`;
        }
        const pct = (((adjustment?.multiplier ?? 1) - 1) * 100);
        return `${label}: ${pct > 0 ? '+' : ''}${formatFixed(pct)}%`;
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

  function showAbilityTooltip(ability: AbilityDefinition | { label: string; description: string }): void {
    hoveredAbilityTooltip = {
      label: ability.label,
      description: 'shortText' in ability ? formatAbilityExact(ability) : ability.description,
    };
  }

  function showUpgradeTooltip(troop: NonNullable<typeof selectedTroop>, stat: TroopStatKey): void {
    const current = getTroopEffectiveDefinition($state.game, troop.id);
    const previewTroop = {
      ...troop,
      statUpgradeLevels: {
        ...troop.statUpgradeLevels,
        [stat]: (troop.statUpgradeLevels[stat] ?? 0) + 1,
      },
    };
    const previewState = {
      ...$state.game,
      troops: $state.game.troops.map((entry) => (entry.id === troop.id ? previewTroop : entry)),
    };
    const next = getTroopEffectiveDefinition(previewState, troop.id);
    const gain = next.stats[stat] - current.stats[stat];

    hoveredUpgradeTooltip = {
      label: `${statIcon(stat)} upgrade`,
      description: `Next purchase: ${gain > 0 ? '+' : ''}${formatFixed(gain)} ${statIcon(stat)} (${formatFixed(current.stats[stat])} -> ${formatFixed(next.stats[stat])}).`,
    };
  }

  function buildReplayBuffLines(unitId: string, replay: BattleReplay, currentStep: number): Partial<Record<ExplainedStatKey, StatBreakdownLine[]>> {
    if (currentStep < 0) {
      return {};
    }

    const additive = new Map<ExplainedStatKey, Map<string, number>>();
    const rangeSets: Array<{ label: string; value: number }> = [];
    const stepLimit = Math.min(currentStep, replay.steps.length - 1);
    const effectToStat: Partial<Record<string, ExplainedStatKey>> = {
      bolster: 'health',
      haste: 'speed',
      ramp: 'damage',
    };

    for (let index = 0; index <= stepLimit; index += 1) {
      const step = replay.steps[index];
      if (!step || step.kind !== 'buff' || !step.targetIds.includes(unitId) || !step.metadata) {
        continue;
      }

      const effect = typeof step.metadata.effect === 'string' ? step.metadata.effect : null;
      const labelBase =
        typeof step.metadata.sourceAbilityLabel === 'string'
          ? step.metadata.sourceAbilityLabel
          : typeof step.metadata.sourceAbilityId === 'string'
            ? step.metadata.sourceAbilityId
            : 'Battle effect';
      const label = `${labelBase} (battle)`;
      const expired = step.metadata.expired === true;

      if (effect && effectToStat[effect]) {
        const stat = effectToStat[effect];
        const amount = typeof step.metadata.amount === 'number' ? step.metadata.amount : 0;
        if (!additive.has(stat)) {
          additive.set(stat, new Map<string, number>());
        }
        const byLabel = additive.get(stat);
        byLabel?.set(label, (byLabel.get(label) ?? 0) + (expired ? -amount : amount));
        continue;
      }

      if (effect === 'rangeset' && typeof step.metadata.value === 'number') {
        if (expired) {
          rangeSets.pop();
        } else {
          rangeSets.push({ label, value: step.metadata.value });
        }
      }
    }

    const result: Partial<Record<ExplainedStatKey, StatBreakdownLine[]>> = {};
    additive.forEach((byLabel, stat) => {
      const lines = [...byLabel.entries()]
        .filter(([, value]) => value !== 0)
        .map(([label, value]) => ({ label, value, kind: 'delta' as const }));
      if (lines.length > 0) {
        result[stat] = lines;
      }
    });
    if (rangeSets.length > 0) {
      const active = rangeSets[rangeSets.length - 1];
      result.range = [{ label: active.label, value: active.value, kind: 'set' }];
    }
    return result;
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

      <div class="menu-cheats panel">
        <p class="eyebrow">Testing</p>
        <label class="menu-checkbox">
          <input type="checkbox" bind:checked={newCampaignCheatUpgrades} />
          <span>Cheat Upgrades</span>
        </label>
        <label class="menu-checkbox">
          <input type="checkbox" bind:checked={newCampaignCheatBlueprints} />
          <span>Cheat Blueprints</span>
        </label>
        <label class="menu-checkbox">
          <input type="checkbox" bind:checked={newCampaignCheatResources} />
          <span>Cheat Resources</span>
        </label>
      </div>
    </section>
  </main>
{:else if $state.game.phase === 'faction_draft'}
  <main class="draft-screen">
    <section class="draft-panel">
      <div class="draft-layout">
        <aside class="panel draft-focus-panel" role="presentation">
          {#if activeDetail}
            <div class="detail-panel">
              <p class="eyebrow">
                {activeDetail.kind === 'faction'
                  ? 'Faction Modifiers'
                  : activeDetail.kind === 'upgrade'
                    ? 'Upgrade Preview'
                    : activeDetail.kind === 'unit'
                      ? 'Troop Preview'
                      : activeDetail.kind === 'ability'
                        ? 'Ability Effect'
                        : 'Draft Detail'}
              </p>
              <h2>{activeDetail.label}</h2>
              {#if activeDetail.kind === 'unit'}
                <div class="hover-unit-detail">
                  <img class="hover-unit-art" src={activeDetail.portraitUrl} alt="" aria-hidden="true" />
                  <p>{activeDetail.description}</p>
                </div>
                <StatBreakdownGrid stats={activeDetail.stats} columns={activeDetail.stats.length} />
                <div class="ability-row detail-ability-row">
                  <span>Abilities</span>
                  <div class="ability-list">
                    {#if activeDetail.abilities.length === 0}
                      <span class="mutator-chip empty">None</span>
                    {:else}
                      {#each activeDetail.abilities as ability}
                        <button
                          class="mutator-chip ability-chip"
                          on:mouseenter={() => showAbilityTooltip(ability)}
                          on:focus={() => showAbilityTooltip(ability)}
                          on:mouseleave={() => (hoveredAbilityTooltip = null)}
                          on:blur={() => (hoveredAbilityTooltip = null)}
                        >
                          {ability.label}
                        </button>
                      {/each}
                    {/if}
                  </div>
                  {#if hoveredAbilityTooltip}
                    <div class="ability-hover-tooltip">
                      <strong>{hoveredAbilityTooltip.label}</strong>
                      <p>{hoveredAbilityTooltip.description}</p>
                    </div>
                  {/if}
                </div>
              {:else}
                <p>{activeDetail.description}</p>
              {/if}
            </div>
          {:else}
            <div class="focus-empty draft-focus-empty">
              <p class="eyebrow">Choose Your First Banner</p>
              <h2>Inspect Your Options</h2>
              <p>Every faction is available at campaign start. Hover a faction sprite to inspect modifiers and flavor, and hover troop icons to compare full stats and abilities. Click any sprite or troop icon to pin its details in place.</p>
            </div>
          {/if}
        </aside>

        <div class="draft-grid">
          {#each $state.game.availableFactionDraft as factionId}
            {@const faction = getFaction(factionId)}
            {@const startingUnitTypeId = getStartingFactionUnitType(factionId)}
            {@const factionDetail = buildFactionDetail(factionId)}
            {@const startingTroopDetail = buildTroopDetail(factionId, startingUnitTypeId)}
            <article class="draft-card" class:locked-focus={hasPinnedDraftSelection(factionId)}>
              <header class="draft-card-header">
                <div class="draft-card-title">
                  <strong>{faction.label}</strong>
                  <button
                    type="button"
                    class="sprite-inspect-button"
                    class:selected={activeDetailKey === factionDetail.detailKey}
                    aria-label={`Inspect ${faction.label} faction modifiers`}
                    on:mouseenter={() => previewDetail(factionDetail)}
                    on:focus={() => previewDetail(factionDetail)}
                    on:mouseleave={() => clearPreviewDetail()}
                    on:blur={() => clearPreviewDetail()}
                    on:click={() => togglePinnedDetail(factionDetail)}
                  >
                    <img class="faction-name-art" src={getFactionPortrait(factionId)} alt="" aria-hidden="true" />
                  </button>
                </div>
              </header>

              <div class="draft-section">
                <span class="draft-section-label">Starts With</span>
                <div class="draft-icon-row">
                  <button
                    type="button"
                    class="draft-troop-icon"
                    class:selected={activeDetailKey === startingTroopDetail.detailKey}
                    aria-label={composeBaseTroopDefinition(factionId, startingUnitTypeId).label}
                    on:mouseenter={() => previewDetail(startingTroopDetail)}
                    on:focus={() => previewDetail(startingTroopDetail)}
                    on:mouseleave={() => clearPreviewDetail()}
                    on:blur={() => clearPreviewDetail()}
                    on:click={() => togglePinnedDetail(startingTroopDetail)}
                  >
                    <img class="unit-button-art" src={getFactionUnitPortrait(factionId, startingUnitTypeId)} alt="" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div class="draft-section">
                <span class="draft-section-label">Recruitable Troops</span>
                <div class="draft-icon-row">
                  {#each getInspectableFactionTroopTypeIds(factionId).filter((unitTypeId) => unitTypeId !== startingUnitTypeId) as unitTypeId}
                    {@const troopDetail = buildTroopDetail(factionId, unitTypeId)}
                    <button
                      type="button"
                      class="draft-troop-icon"
                      class:selected={activeDetailKey === troopDetail.detailKey}
                      aria-label={composeBaseTroopDefinition(factionId, unitTypeId).label}
                      on:mouseenter={() => previewDetail(troopDetail)}
                      on:focus={() => previewDetail(troopDetail)}
                      on:mouseleave={() => clearPreviewDetail()}
                      on:blur={() => clearPreviewDetail()}
                      on:click={() => togglePinnedDetail(troopDetail)}
                    >
                      <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden="true" />
                    </button>
                  {/each}
                </div>
              </div>

              <button class="primary draft-choose-button" on:click={() => gameStore.chooseStartingFaction(factionId)}>
                Choose {faction.label}
              </button>
            </article>
          {/each}
        </div>
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
          <UnitTooltip unit={activeUnit} profile={activeUnitProfile} engagedUnits={engagedUnits} x={0} y={0} locked={Boolean(lockedPointer)} docked={true} liveBuffLines={activeUnitBuffLines} />
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
      <div class="viewport-shell">
        <div class="viewport" bind:this={viewport}></div>
        <div class="replay-zoom-controls" aria-label="Replay zoom controls">
          <button class="replay-zoom-button" type="button" aria-label="Zoom in" on:click={zoomReplayIn}>+</button>
          <button class="replay-zoom-button" type="button" aria-label="Zoom out" on:click={zoomReplayOut}>-</button>
        </div>
      </div>
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
                    <div
                      class="alive-unit-card"
                      class:selected={selectedReplayProfileKey === replayProfileKey('player', label)}
                    >
                      <button
                        type="button"
                        class="alive-unit-main"
                        on:click={() => selectReplayProfile('player', label)}
                        on:mouseenter={() => (hoveredReplayProfileKey = replayProfileKey('player', label))}
                        on:focus={() => (hoveredReplayProfileKey = replayProfileKey('player', label))}
                        on:mouseleave={() => (hoveredReplayProfileKey = null)}
                        on:blur={() => (hoveredReplayProfileKey = null)}
                      >
                        <span>{label}</span>
                        <strong>{count}</strong>
                      </button>
                      <button
                        type="button"
                        class="alive-cycle-button"
                        aria-label={`Cycle ${label} units`}
                        on:click={() => cycleReplayProfileUnit('player', label)}
                      >
                        ↻
                      </button>
                    </div>
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
                    <div
                      class="alive-unit-card"
                      class:selected={selectedReplayProfileKey === replayProfileKey('enemy', label)}
                    >
                      <button
                        type="button"
                        class="alive-unit-main"
                        on:click={() => selectReplayProfile('enemy', label)}
                        on:mouseenter={() => (hoveredReplayProfileKey = replayProfileKey('enemy', label))}
                        on:focus={() => (hoveredReplayProfileKey = replayProfileKey('enemy', label))}
                        on:mouseleave={() => (hoveredReplayProfileKey = null)}
                        on:blur={() => (hoveredReplayProfileKey = null)}
                      >
                        <span>{label}</span>
                        <strong>{count}</strong>
                      </button>
                      <button
                        type="button"
                        class="alive-cycle-button"
                        aria-label={`Cycle ${label} units`}
                        on:click={() => cycleReplayProfileUnit('enemy', label)}
                      >
                        ↻
                      </button>
                    </div>
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

    <div class="replay-exit replay-actions">
      <button class="replay-exit-button" on:click={() => gameStore.closeReplay()}>Return to Overworld</button>
      <button class="replay-exit-button replay-recap-button" on:click={toggleReplayRecap}>
        {replayRecapOpen ? 'Close Battle Recap' : 'Battle Recap'}
      </button>
    </div>

    {#if replayRecapOpen}
      <div class="replay-recap-backdrop">
        <button
          class="replay-recap-dismiss"
          type="button"
          aria-label="Close battle recap"
          on:click={toggleReplayRecap}
        ></button>
        <section
          class="panel replay-recap-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="battle-recap-title"
        >
          <div class="replay-recap-header">
            <div>
              <p class="eyebrow">Battle Recap</p>
              <h2 id="battle-recap-title">Damage And Healing By Troop</h2>
              <p>Click a troop to open its units. Clicking a unit focuses it on the battlefield and rewinds if needed.</p>
            </div>
            <button class="replay-recap-close" type="button" aria-label="Close battle recap" on:click={toggleReplayRecap}>Close</button>
          </div>

          <div class="replay-recap-sides">
            {#each replayRecapSides as sideGroup}
              <section class="replay-recap-side">
                <div class="alive-side-header" class:enemy={sideGroup.side === 'enemy'}>
                  <span>{sideGroup.label}</span>
                  <strong>{sideGroup.troops.length}</strong>
                </div>

                {#if sideGroup.troops.length === 0}
                  <p class="replay-recap-empty">No troops recorded.</p>
                {:else}
                  {@const sharedScaleTotal = getReplayRecapSharedScaleTotal(sideGroup.troops)}
                  <div class="replay-recap-list">
                    {#each sideGroup.troops as troop}
                      {@const troopProfile = getReplayRecapTroopProfile(troop.side, troop.troopLabel)}
                      <div class="replay-recap-group">
                        <button
                          type="button"
                          class="replay-recap-row troop"
                          class:expanded={expandedReplayRecapTroopKey === replayProfileKey(troop.side, troop.troopLabel)}
                          on:click={() => toggleReplayRecapTroop(troop.side, troop.troopLabel)}
                        >
                          {#if troopProfile}
                            <img
                              class="replay-recap-art"
                              src={getFactionUnitPortrait(troopProfile.factionId, troopProfile.unitTypeId)}
                              alt=""
                              aria-hidden="true"
                            />
                          {/if}
                          <div class="replay-recap-main">
                            <strong>{troop.troopLabel}</strong>
                            <small>{expandedReplayRecapTroopKey === replayProfileKey(troop.side, troop.troopLabel) ? 'Hide units' : 'Show units'}</small>
                            <div class="replay-recap-bars">
                              <div class="replay-recap-bar damage">
                                <span style={`width: ${getReplayRecapBarWidth(troop.damageDone, sharedScaleTotal)}`}></span>
                              </div>
                              <div class="replay-recap-bar healing">
                                <span style={`width: ${getReplayRecapBarWidth(troop.healingDone, sharedScaleTotal)}`}></span>
                              </div>
                            </div>
                          </div>
                          <div class="replay-recap-stats">
                            <span>Dmg {formatFixed(troop.damageDone)}</span>
                            <span>Heal {formatFixed(troop.healingDone)}</span>
                            <span>Kills {troop.kills}</span>
                          </div>
                        </button>

                        {#if expandedReplayRecapTroopKey === replayProfileKey(troop.side, troop.troopLabel)}
                          <div class="replay-recap-units">
                            {#each troop.units as unit}
                              {@const unitState = getReplayRecapUnitState(unit.unitId)}
                              <button
                                type="button"
                                class="replay-recap-row unit"
                                on:click={() => selectReplayRecapUnit(unit.unitId, troop.side, troop.troopLabel)}
                              >
                                {#if troopProfile}
                                  <img
                                    class="replay-recap-art small"
                                    src={getFactionUnitPortrait(troopProfile.factionId, troopProfile.unitTypeId)}
                                    alt=""
                                    aria-hidden="true"
                                  />
                                {/if}
                                <div class="replay-recap-main">
                                  <strong>{unit.unitLabel}</strong>
                                  <small>{unitState?.alive ? 'Alive at this step' : 'Dead at this step'}</small>
                                  <div class="replay-recap-bars">
                                    <div class="replay-recap-bar damage">
                                      <span style={`width: ${getReplayRecapBarWidth(unit.damageDone, sharedScaleTotal)}`}></span>
                                    </div>
                                    <div class="replay-recap-bar healing">
                                      <span style={`width: ${getReplayRecapBarWidth(unit.healingDone, sharedScaleTotal)}`}></span>
                                    </div>
                                  </div>
                                </div>
                                <div class="replay-recap-stats">
                                  <span>Dmg {formatFixed(unit.damageDone)}</span>
                                  <span>Heal {formatFixed(unit.healingDone)}</span>
                                  <span>Kills {unit.kills}</span>
                                </div>
                              </button>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </section>
            {/each}
          </div>
        </section>
      </div>
    {/if}
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
          {@const selectedRiftVisual = getRiftVisual(selectedRift)}
          <p class="eyebrow">Selected Rift</p>
          <div
            class="title-button rift-title-card featured"
            style={`--rift-tint:${selectedRiftVisual.tint}; --rift-glow:${selectedRiftVisual.glow}; --rift-rotation:${selectedRiftVisual.rotationDeg}deg;`}
          >
            <header>
              <strong>Tier {selectedRift.tier}</strong>
              <span>{selectedRift.id}</span>
            </header>
            <div class="rift-visual-shell inline">
              <div class="rift-visual-frame">
                <img
                  class="rift-visual-image"
                  src={selectedRiftVisual.imageUrl}
                  alt=""
                  aria-hidden="true"
                  style={`filter:${selectedRiftVisual.filter};`}
                />
              </div>
            </div>
          </div>
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
                    on:click={() => togglePinnedDetail(buildMutatorDetail(mutatorId))}
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
            <span class="reward-pill">
              Hex Fit {selectedRift.saturation}
            </span>
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
              {@const enemyDetail = buildResolvedUnitDetail(`enemy:${group.combatantId}`, group.label, group.factionId, group.unitTypeId, group.stats, group.quantity, 'Enemy troop', group.abilities, group.statBreakdowns)}
              <button
                class="unit-tile enemy-tile"
                class:selected={activeDetailKey === enemyDetail.detailKey}
                on:mouseenter={() => previewDetail(enemyDetail)}
                on:focus={() => previewDetail(enemyDetail)}
                on:click={() => togglePinnedDetail(enemyDetail)}
                on:mouseleave={() => clearDetail()}
                on:blur={() => clearDetail()}
              >
                <img class="unit-tile-art" src={getFactionUnitPortrait(group.factionId, group.unitTypeId)} alt="" aria-hidden="true" />
                <strong>x{group.quantity}</strong>
              </button>
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
                  {@const troopDetail = buildResolvedUnitDetail(
                    `rift-ready:${selectedRift.id}:${troop.id}`,
                    troopDef.label,
                    troop.factionId,
                    troop.unitTypeId,
                    troopDef.stats,
                    troop.quantity,
                    troopAssignedTo(selectedRift, troop.id) ? 'Assigned to this Rift' : `Qty ${troop.quantity}`,
                    troopDef.abilities,
                    troopDef.statBreakdowns,
                  )}
                  <button
                    class="unit-tile"
                    class:assigned={troopAssignedTo(selectedRift, troop.id)}
                    class:selected={activeDetailKey === troopDetail.detailKey}
                    on:click={() => gameStore.assignTroopToRift(troop.id, selectedRift.id)}
                    on:mouseenter={() => previewDetail(troopDetail)}
                    on:focus={() => previewDetail(troopDetail)}
                    on:mouseleave={() => clearDetail()}
                    on:blur={() => clearDetail()}
                  >
                    <img class="unit-tile-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden="true" />
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
          <StatBreakdownGrid stats={buildStatEntries(selectedRecruitableTroop.troopDef.stats, selectedRecruitableTroop.troopDef.statBreakdowns, true, selectedRecruitableTroop.troopDef.quantity)} columns={4} />
          <div class="ability-row">
            <span>Abilities</span>
            <div class="ability-list">
              {#if selectedRecruitableTroop.troopDef.abilities.length === 0}
                <span class="mutator-chip empty">None</span>
              {:else}
                {#each selectedRecruitableTroop.troopDef.abilities as ability}
                  <button
                    class="mutator-chip ability-chip"
                    on:mouseenter={() => showAbilityTooltip(ability)}
                    on:focus={() => showAbilityTooltip(ability)}
                    on:mouseleave={() => (hoveredAbilityTooltip = null)}
                    on:blur={() => (hoveredAbilityTooltip = null)}
                  >
                    {ability.label}
                  </button>
                {/each}
              {/if}
            </div>
            {#if hoveredAbilityTooltip}
              <div class="ability-hover-tooltip">
                <strong>{hoveredAbilityTooltip.label}</strong>
                <p>{hoveredAbilityTooltip.description}</p>
              </div>
            {/if}
          </div>
          <p class="purchase-cost"><i class="resource-icon essence"></i>{pendingPurchase?.kind === 'unlockTroop' ? formatFixed(pendingPurchase.cost) : ''}</p>
          <p class="purchase-caption">This troop is not yet recruited.</p>
        {:else if selectedTroop}
          <p class="eyebrow">Allied Troop</p>
          <h2>{selectedTroopDef?.label}</h2>
          <p>{selectedTroop.recoveryCyclesRemaining > 0 ? `Recovering ${selectedTroop.recoveryCyclesRemaining}` : 'Ready'}</p>
          {#if selectedTroopDef && selectedTroopStatBreakdowns}
            <StatBreakdownGrid stats={selectedTroopStatEntries} columns={4} />
          {/if}
          <div class="ability-row">
            <span>Abilities</span>
            <div class="ability-list">
              {#if !selectedTroopDef || selectedTroopDef.abilities.length === 0}
                <span class="mutator-chip empty">None</span>
              {:else}
                {#each selectedTroopDef.abilities as ability}
                  <button
                    class="mutator-chip ability-chip"
                    on:mouseenter={() => showAbilityTooltip(ability)}
                    on:focus={() => showAbilityTooltip(ability)}
                    on:mouseleave={() => (hoveredAbilityTooltip = null)}
                    on:blur={() => (hoveredAbilityTooltip = null)}
                  >
                    {ability.label}
                  </button>
                {/each}
              {/if}
            </div>
            {#if hoveredAbilityTooltip}
              <div class="ability-hover-tooltip">
                <strong>{hoveredAbilityTooltip.label}</strong>
                <p>{hoveredAbilityTooltip.description}</p>
              </div>
            {/if}
          </div>
          <div class="actions-grid">
            <button class:unaffordable-button={!canAffordGold(getTroopAddUnitCost(selectedTroop))} disabled={!canAffordGold(getTroopAddUnitCost(selectedTroop))} on:click={() => gameStore.buyTroopUnit(selectedTroop.id)}>
              <span>{displayIcon('quantity')} +</span>
              <small class:unaffordable={!canAffordGold(getTroopAddUnitCost(selectedTroop))}><i class="resource-icon gold"></i>{formatFixed(getTroopAddUnitCost(selectedTroop))}</small>
            </button>
          </div>
          {#if hoveredUpgradeTooltip}
            <div class="ability-hover-tooltip">
              <strong>{hoveredUpgradeTooltip.label}</strong>
              <p>{hoveredUpgradeTooltip.description}</p>
            </div>
          {/if}
        {:else if selectedFactionUpgrade}
          <p class="eyebrow">Faction Upgrade</p>
          <h2>{selectedFactionUpgrade.label}</h2>
          <p>{selectedFactionUpgrade.description}</p>
          <p class="purchase-cost"><i class="resource-icon gold"></i>{formatFixed(selectedFactionUpgrade.cost)}</p>
          <p class="purchase-caption">This doctrine is not yet purchased.</p>
        {:else if selectedFactionId}
          <p class="eyebrow">Allied Faction</p>
          <h2 class="faction-name-row">
            <span>{getFaction(selectedFactionId).label}</span>
            <img class="faction-name-art" src={getFactionPortrait(selectedFactionId)} alt="" aria-hidden="true" />
          </h2>
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
                  class="unit-action"
                  class:selected-action={pendingPurchase?.kind === 'unlockTroop' && pendingPurchase.factionId === selectedFactionId && pendingPurchase.unitTypeId === unitTypeId}
                  on:click={() => selectRecruitableTroop(selectedFactionId, unitTypeId)}
                >
                  <span class="unit-button-copy">
                    <img class="unit-button-art" src={getFactionUnitPortrait(selectedFactionId, unitTypeId)} alt="" aria-hidden="true" />
                    <span>Unlock {getUnitType(unitTypeId).label}</span>
                  </span>
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
            {@const riftVisual = getRiftVisual(rift)}
            <article class="rift-card" class:selected={selectedRiftId === rift.id}>
              <button
                class="title-button rift-title-card"
                on:click={() => selectRift(rift.id)}
                style={`--rift-tint:${riftVisual.tint}; --rift-glow:${riftVisual.glow}; --rift-rotation:${riftVisual.rotationDeg}deg;`}
              >
                <header>
                  <strong>Tier {rift.tier}</strong>
                  <span>{rift.id}</span>
                </header>
                <div class="rift-visual-shell inline">
                  <div class="rift-visual-frame">
                    <img
                      class="rift-visual-image"
                      src={riftVisual.imageUrl}
                      alt=""
                      aria-hidden="true"
                      style={`filter:${riftVisual.filter};`}
                    />
                  </div>
                </div>
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
                    on:click={() => togglePinnedDetail(buildMutatorDetail(mutatorId))}
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
                  {@const troopDef = getTroopEffectiveDefinition($state.game, troop.id)}
                  {@const assignedDetail = buildResolvedUnitDetail(`rift-assigned:${rift.id}:${troop.id}`, troopDef.label, troop.factionId, troop.unitTypeId, troopDef.stats, troop.quantity, 'Assigned to this Rift', troopDef.abilities, troopDef.statBreakdowns)}
                  <button
                    class="unit-tile assigned-summary-tile"
                    class:selected={activeDetailKey === assignedDetail.detailKey}
                    on:mouseenter={() => previewDetail(assignedDetail)}
                    on:focus={() => previewDetail(assignedDetail)}
                    on:click={() => togglePinnedDetail(assignedDetail)}
                    on:mouseleave={() => clearDetail()}
                    on:blur={() => clearDetail()}
                  >
                    <img class="unit-tile-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden="true" />
                    <small>Assigned</small>
                  </button>
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
                <button class="title-button faction-name-button" on:click={() => selectFaction(factionId)}>
                  <span>{getFaction(factionId).label}</span>
                  <img class="faction-name-art" src={getFactionPortrait(factionId)} alt="" aria-hidden="true" />
                </button>
                <small>{getFaction(factionId).description}</small>
              </header>
              <div class="troop-list">
                {#each getFactionTroops($state.game, factionId) as troop}
                  {@const troopDef = getTroopEffectiveDefinition($state.game, troop.id)}
                  <button class="troop-chip" on:click={() => selectTroop(troop.id)}>
                    <span class="unit-button-copy">
                      <img class="unit-button-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden="true" />
                      <span>{troopDef.label}</span>
                    </span>
                    <small>Qty {troop.quantity}</small>
                  </button>
                {/each}
              </div>
              <div class="unlock-row">
                {#each getAvailableFactionTroopUnlocks($state.game, factionId) as unitTypeId}
                  <button
                    class="unit-action"
                    class:selected-action={pendingPurchase?.kind === 'unlockTroop' && pendingPurchase.factionId === factionId && pendingPurchase.unitTypeId === unitTypeId}
                    on:click={() => selectRecruitableTroop(factionId, unitTypeId)}
                  >
                    <span class="unit-button-copy">
                      <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden="true" />
                      <span>Unlock {getUnitType(unitTypeId).label}</span>
                    </span>
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
              <strong>Unlock New Faction</strong>
              <small class:unaffordable={!canAffordEssence(getFactionUnlockCost($state.game))}><i class="resource-icon essence"></i>{formatFixed(getFactionUnlockCost($state.game))}</small>
            </header>
            <div class="unlock-row">
              <button class="primary" on:click={() => openUnlockFactionMenu()} disabled={lockedFactionIds.length === 0}>
                {lockedFactionIds.length === 0 ? 'All Factions Unlocked' : 'Browse Factions'}
              </button>
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
      {#if activeDetail}
        <div class="panel detail-panel" role="presentation" on:mouseenter={cancelDetailHideTimer} on:mouseleave={() => clearDetail()}>
          <p class="eyebrow">
            {activeDetail.kind === 'mutator'
              ? 'Mutator Effect'
              : activeDetail.kind === 'ability'
                ? 'Ability Effect'
                : activeDetail.kind === 'faction'
                  ? 'Faction Modifiers'
                : activeDetail.kind === 'unit'
                    ? 'Unit Inspect'
                  : activeDetail.kind === 'upgrade'
                    ? 'Upgrade Preview'
                    : 'Troop Preview'}
          </p>
          <h2>{activeDetail.label}</h2>
            {#if activeDetail.kind === 'unit'}
              <div class="hover-unit-detail">
                <img class="hover-unit-art" src={activeDetail.portraitUrl} alt="" aria-hidden="true" />
                <p>{activeDetail.description}</p>
              </div>
              <StatBreakdownGrid stats={activeDetail.stats} columns={4} />
              <div class="ability-row detail-ability-row">
                <span>Abilities</span>
                <div class="ability-list">
                  {#if activeDetail.abilities.length === 0}
                    <span class="mutator-chip empty">None</span>
                  {:else}
                    {#each activeDetail.abilities as ability}
                      <button
                        class="mutator-chip ability-chip"
                        on:mouseenter={() => showAbilityTooltip(ability)}
                        on:focus={() => showAbilityTooltip(ability)}
                        on:mouseleave={() => (hoveredAbilityTooltip = null)}
                        on:blur={() => (hoveredAbilityTooltip = null)}
                      >
                        {ability.label}
                      </button>
                    {/each}
                  {/if}
                </div>
                {#if hoveredAbilityTooltip}
                  <div class="ability-hover-tooltip">
                    <strong>{hoveredAbilityTooltip.label}</strong>
                    <p>{hoveredAbilityTooltip.description}</p>
                  </div>
                {/if}
              </div>
            {:else}
              <p>{activeDetail.description}</p>
            {/if}
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
          <h2>Claim Rewards</h2>
          {#each $state.game.pendingRewardChoices as choice}
            <div class="reward-card">
              <strong>{choice.title}</strong>
              <div class="actions-grid">
                {#if choice.kind === 'upgrade'}
                  {#each choice.optionUpgradeIds as optionId}
                    <button on:click={() => gameStore.claimReward(choice.id, optionId)}>{getFactionUpgrade(optionId).label}</button>
                  {/each}
                {:else}
                  {#each choice.optionTroopUnlockIds as optionId}
                    <button on:click={() => gameStore.claimReward(choice.id, optionId)}>{describeTroopUnlock(optionId)}</button>
                  {/each}
                {/if}
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

    {#if unlockFactionMenuOpen}
      <div class="unlock-faction-overlay" role="presentation">
        <div class="unlock-faction-dialog panel" role="dialog" aria-modal="true" aria-labelledby="unlock-faction-title">
          <div class="unlock-faction-dialog-header">
            <div>
              <p class="eyebrow">Faction Unlock</p>
              <h2 id="unlock-faction-title">Choose Your Next Alliance</h2>
            </div>
            <button class="large" on:click={() => closeUnlockFactionMenu()}>Cancel</button>
          </div>

          <p class="unlock-faction-dialog-copy">
            Review the factions still outside your command, inspect their modifiers and troops, then choose one to unlock for
            <i class="resource-icon essence"></i>{formatFixed(getFactionUnlockCost($state.game))}.
          </p>

          <div class="draft-layout unlock-faction-layout">
            <aside class="panel draft-focus-panel unlock-faction-focus" role="presentation">
              {#if activeDetail}
                <div class="detail-panel">
                  <p class="eyebrow">
                    {activeDetail.kind === 'faction'
                      ? 'Faction Modifiers'
                      : activeDetail.kind === 'upgrade'
                        ? 'Upgrade Preview'
                        : activeDetail.kind === 'unit'
                          ? 'Troop Preview'
                          : activeDetail.kind === 'ability'
                            ? 'Ability Effect'
                            : 'Faction Detail'}
                  </p>
                  <h2>{activeDetail.label}</h2>
                  {#if activeDetail.kind === 'unit'}
                    <div class="hover-unit-detail">
                      <img class="hover-unit-art" src={activeDetail.portraitUrl} alt="" aria-hidden="true" />
                      <p>{activeDetail.description}</p>
                    </div>
                    <StatBreakdownGrid stats={activeDetail.stats} columns={activeDetail.stats.length} />
                    <div class="ability-row detail-ability-row">
                      <span>Abilities</span>
                      <div class="ability-list">
                        {#if activeDetail.abilities.length === 0}
                          <span class="mutator-chip empty">None</span>
                        {:else}
                          {#each activeDetail.abilities as ability}
                            <button
                              class="mutator-chip ability-chip"
                              on:mouseenter={() => showAbilityTooltip(ability)}
                              on:focus={() => showAbilityTooltip(ability)}
                              on:mouseleave={() => (hoveredAbilityTooltip = null)}
                              on:blur={() => (hoveredAbilityTooltip = null)}
                            >
                              {ability.label}
                            </button>
                          {/each}
                        {/if}
                      </div>
                      {#if hoveredAbilityTooltip}
                        <div class="ability-hover-tooltip">
                          <strong>{hoveredAbilityTooltip.label}</strong>
                          <p>{hoveredAbilityTooltip.description}</p>
                        </div>
                      {/if}
                    </div>
                  {:else}
                    <p>{activeDetail.description}</p>
                  {/if}
                </div>
              {:else}
                <div class="focus-empty draft-focus-empty">
                  <p class="eyebrow">Review Before Unlocking</p>
                  <h2>Inspect Locked Factions</h2>
                  <p>Only factions you have not unlocked yet appear here. Hover a faction sprite to inspect modifiers, and hover troop icons to compare their recruits before committing your essence.</p>
                </div>
              {/if}
            </aside>

            <div class="draft-grid">
              {#each lockedFactionIds as factionId}
                {@const faction = getFaction(factionId)}
                {@const startingUnitTypeId = getStartingFactionUnitType(factionId)}
                {@const factionDetail = buildFactionDetail(factionId)}
                {@const startingTroopDetail = buildTroopDetail(factionId, startingUnitTypeId)}
                {@const factionUnlockCost = getFactionUnlockCost($state.game)}
                {@const canUnlockFaction = canAffordEssence(factionUnlockCost)}
                <article class="draft-card" class:locked-focus={hasPinnedDraftSelection(factionId)}>
                  <header class="draft-card-header">
                    <div class="draft-card-title">
                      <strong>{faction.label}</strong>
                      <button
                        type="button"
                        class="sprite-inspect-button"
                        class:selected={activeDetailKey === factionDetail.detailKey}
                        aria-label={`Inspect ${faction.label} faction modifiers`}
                        on:mouseenter={() => previewDetail(factionDetail)}
                        on:focus={() => previewDetail(factionDetail)}
                        on:mouseleave={() => clearPreviewDetail()}
                        on:blur={() => clearPreviewDetail()}
                        on:click={() => togglePinnedDetail(factionDetail)}
                      >
                        <img class="faction-name-art" src={getFactionPortrait(factionId)} alt="" aria-hidden="true" />
                      </button>
                    </div>
                  </header>

                  <div class="draft-section">
                    <span class="draft-section-label">First Recruit</span>
                    <div class="draft-icon-row">
                      <button
                        type="button"
                        class="draft-troop-icon"
                        class:selected={activeDetailKey === startingTroopDetail.detailKey}
                        aria-label={composeBaseTroopDefinition(factionId, startingUnitTypeId).label}
                        on:mouseenter={() => previewDetail(startingTroopDetail)}
                        on:focus={() => previewDetail(startingTroopDetail)}
                        on:mouseleave={() => clearPreviewDetail()}
                        on:blur={() => clearPreviewDetail()}
                        on:click={() => togglePinnedDetail(startingTroopDetail)}
                      >
                        <img class="unit-button-art" src={getFactionUnitPortrait(factionId, startingUnitTypeId)} alt="" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div class="draft-section">
                    <span class="draft-section-label">Recruitable Troops</span>
                    <div class="draft-icon-row">
                      {#each getInspectableFactionTroopTypeIds(factionId).filter((unitTypeId) => unitTypeId !== startingUnitTypeId) as unitTypeId}
                        {@const troopDetail = buildTroopDetail(factionId, unitTypeId)}
                        <button
                          type="button"
                          class="draft-troop-icon"
                          class:selected={activeDetailKey === troopDetail.detailKey}
                          aria-label={composeBaseTroopDefinition(factionId, unitTypeId).label}
                          on:mouseenter={() => previewDetail(troopDetail)}
                          on:focus={() => previewDetail(troopDetail)}
                          on:mouseleave={() => clearPreviewDetail()}
                          on:blur={() => clearPreviewDetail()}
                          on:click={() => togglePinnedDetail(troopDetail)}
                        >
                          <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden="true" />
                        </button>
                      {/each}
                    </div>
                  </div>

                  <div
                    class="unlock-faction-action"
                  >
                    <button
                      class="primary draft-choose-button"
                      class:unaffordable-button={!canUnlockFaction}
                      aria-disabled={!canUnlockFaction}
                      aria-label={!canUnlockFaction ? unlockFactionBlockedMessage(factionUnlockCost, $state.game.resources.essence) : `Unlock ${faction.label}`}
                      on:mouseenter={() => (hoveredBlockedFactionUnlockId = canUnlockFaction ? null : factionId)}
                      on:mouseleave={() => (hoveredBlockedFactionUnlockId = null)}
                      on:focus={() => (hoveredBlockedFactionUnlockId = canUnlockFaction ? null : factionId)}
                      on:blur={() => (hoveredBlockedFactionUnlockId = null)}
                      on:click={() => canUnlockFaction && selectRecruitableFaction(factionId)}
                    >
                      Unlock {faction.label}
                    </button>
                    {#if !canUnlockFaction && hoveredBlockedFactionUnlockId === factionId}
                      <div class="unlock-faction-tooltip" role="tooltip">
                        <span>You need <span class="tooltip-number tooltip-number-required">{formatFixed(factionUnlockCost)}</span> <i class="resource-icon essence"></i> essence to unlock a new faction.</span>
                        <span>You currently have <span class="tooltip-number tooltip-number-current">{formatFixed($state.game.resources.essence)}</span> <i class="resource-icon essence"></i> essence.</span>
                      </div>
                    {/if}
                  </div>
                </article>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </main>
{/if}

<style>
  :global(body) {
    overflow: auto;
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
  .compact-list div {
    display: grid;
    gap: 0.15rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: 14px;
    background: rgba(20, 28, 38, 0.7);
  }

  .resource-strip span,
  .compact-list span {
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
    gap: 0.75rem;
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

  .rift-visual-shell {
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 16px;
    border: 1px solid rgba(126, 157, 181, 0.18);
    background:
      radial-gradient(circle at center, var(--rift-glow), transparent 60%),
      linear-gradient(180deg, rgba(13, 22, 31, 0.92), rgba(8, 12, 18, 0.98));
  }

  .rift-visual-shell::before {
    content: '';
    position: absolute;
    inset: 10%;
    border-radius: 50%;
    background:
      radial-gradient(circle at center, var(--rift-tint), transparent 65%);
    opacity: 0.35;
    filter: blur(18px);
    pointer-events: none;
  }

  .rift-visual-frame {
    position: relative;
    z-index: 1;
    display: grid;
    width: min(100%, 11rem);
    aspect-ratio: 1;
    place-items: center;
    color: var(--rift-tint);
  }

  .rift-visual-image {
    width: var(--rift-size);
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
    transform: rotate(var(--rift-rotation));
  }

  .rift-card header,
  .faction-card header {
    display: grid;
    gap: 0.3rem;
  }

  .rift-title-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    min-height: 5.8rem;
    padding: 0.9rem 1rem;
  }

  .rift-title-card.featured {
    cursor: default;
    min-height: 6.4rem;
  }

  .rift-title-card header strong {
    font-size: 1.05rem;
    line-height: 1.1;
  }

  .rift-title-card header span {
    font-size: 0.9rem;
    color: #e7edf3;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .rift-visual-shell.inline {
    width: 4.6rem;
    height: 4.6rem;
    min-height: 4.6rem;
    border-radius: 14px;
    background:
      radial-gradient(circle at center, var(--rift-glow), transparent 58%),
      linear-gradient(180deg, rgba(13, 22, 31, 0.82), rgba(8, 12, 18, 0.94));
  }

  .rift-title-card.featured .rift-visual-shell.inline {
    width: 5rem;
    height: 5rem;
    min-height: 5rem;
  }

  .rift-visual-shell.inline::before {
    inset: 18%;
    opacity: 0.42;
    filter: blur(12px);
  }

  .rift-visual-shell.inline .rift-visual-frame,
  .rift-title-card.featured .rift-visual-shell.inline .rift-visual-frame {
    width: 100%;
    height: 100%;
  }

  .rift-visual-shell.inline .rift-visual-image {
    width: 72%;
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

  .assigned-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .assignment-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .archive-card,
  .troop-chip,
  .title-button,
  .list-button,
  .draft-card {
    text-align: left;
  }

  .unit-action,
  .troop-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
  }

  .unit-button-copy {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
  }

  .unit-button-copy > span {
    min-width: 0;
  }

  .faction-name-row {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
  }

  .faction-name-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
  }

  .faction-name-art {
    width: 2rem;
    height: 2rem;
    flex: 0 0 auto;
    object-fit: contain;
    image-rendering: pixelated;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }

  .unit-button-art {
    width: 2.2rem;
    height: 2.2rem;
    flex: 0 0 auto;
    object-fit: contain;
    image-rendering: pixelated;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }

  .archive-card.selected {
    outline: 2px solid #d4ad73;
    background:
      linear-gradient(145deg, rgba(44, 31, 15, 0.96), rgba(17, 22, 30, 0.96)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.18), transparent 42%);
  }

  .archive-card small,
  .troop-chip small {
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

  .detail-panel {
    min-height: 180px;
    align-content: start;
  }

  .hover-unit-detail {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.85rem;
    align-items: center;
  }

  .hover-unit-art {
    width: 4rem;
    height: 4rem;
    object-fit: contain;
    image-rendering: pixelated;
    filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.3));
  }

  .unit-tile {
    display: grid;
    justify-items: center;
    gap: 0.45rem;
    padding: 0.75rem 0.55rem;
    text-align: center;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: 16px;
    background: rgba(22, 31, 42, 0.82);
    color: #f4f7fb;
    font: inherit;
    position: relative;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease,
      transform 120ms ease;
  }

  .unit-tile.enemy-tile {
    cursor: default;
  }

  .unit-tile.assigned,
  .unit-tile.assigned-summary-tile {
    border-color: rgba(213, 178, 116, 0.55);
    background:
      linear-gradient(145deg, rgba(60, 42, 20, 0.9), rgba(20, 26, 34, 0.92)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.18), transparent 45%);
  }

  .unit-tile.selected {
    border-color: rgba(213, 178, 116, 0.78);
    box-shadow:
      0 0 0 2px #d4ad73,
      0 12px 24px rgba(0, 0, 0, 0.18);
  }

  .unit-tile-art {
    width: 2.8rem;
    height: 2.8rem;
    object-fit: contain;
    image-rendering: pixelated;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }

  .unit-tile strong,
  .unit-tile small {
    margin: 0;
    line-height: 1.1;
  }

  .compact-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
    justify-items: center;
    align-items: start;
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

  .menu-cheats {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
  }

  .menu-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    color: #d7dee6;
  }

  .menu-checkbox input {
    width: 1rem;
    height: 1rem;
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

  .draft-layout {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr;
    grid-template-areas:
      "cards"
      "focus";
    align-items: start;
  }

  .draft-grid {
    grid-area: cards;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem;
  }

  .draft-card {
    display: grid;
    gap: 0.95rem;
    align-content: start;
    min-height: 100%;
    padding: 1.15rem;
    border-radius: 22px;
    border: 1px solid rgba(126, 157, 181, 0.2);
    background:
      linear-gradient(145deg, rgba(24, 35, 49, 0.92), rgba(11, 17, 25, 0.96)),
      radial-gradient(circle at top right, rgba(117, 145, 168, 0.12), transparent 40%);
  }

  .draft-card.locked-focus {
    border-color: rgba(213, 178, 116, 0.5);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.22),
      0 14px 28px rgba(0, 0, 0, 0.22);
    background:
      linear-gradient(145deg, rgba(38, 31, 22, 0.94), rgba(13, 19, 27, 0.97)),
      radial-gradient(circle at top right, rgba(213, 178, 116, 0.15), transparent 42%);
  }

  .draft-card-header {
    display: grid;
    gap: 0.45rem;
  }

  .draft-card-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .draft-card-title strong {
    font-size: 1.4rem;
  }

  .draft-section {
    display: grid;
    gap: 0.55rem;
  }

  .draft-section-label {
    color: #c7b18b;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .draft-icon-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }

  .draft-troop-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 0.55rem;
    border-radius: 16px;
    border: 1px solid rgba(124, 153, 176, 0.15);
    background: rgba(16, 25, 35, 0.82);
    color: #f4f7fb;
    font: inherit;
    text-align: left;
    transition:
      border-color 120ms ease,
      transform 120ms ease,
      background 120ms ease;
  }

  .draft-troop-icon:hover,
  .draft-troop-icon:focus-visible,
  .draft-troop-icon.selected,
  .sprite-inspect-button:hover,
  .sprite-inspect-button:focus-visible,
  .sprite-inspect-button.selected {
    border-color: rgba(213, 178, 116, 0.55);
    background: rgba(36, 28, 18, 0.75);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.18),
      0 8px 18px rgba(0, 0, 0, 0.18);
    transform: translateY(-1px);
  }

  .draft-troop-icon.selected,
  .sprite-inspect-button.selected {
    border-color: #d4ad73;
    background: rgba(36, 28, 18, 0.82);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.32),
      0 0 0 2px rgba(212, 173, 115, 0.28),
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .draft-troop-icon.selected::after,
  .sprite-inspect-button.selected::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 19px;
    border: 1px solid rgba(212, 173, 115, 0.65);
    pointer-events: none;
  }

  .draft-troop-icon {
    width: 3rem;
    height: 3rem;
  }

  .sprite-inspect-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 3rem;
    height: 3rem;
    padding: 0;
    border-radius: 16px;
    border: 1px solid rgba(124, 153, 176, 0.15);
    background: rgba(16, 25, 35, 0.82);
  }

  .draft-choose-button {
    margin-top: auto;
  }

  .unlock-faction-action {
    position: relative;
    margin-top: auto;
    outline: none;
  }

  .unlock-faction-action:focus-visible {
    border-radius: 20px;
    box-shadow: 0 0 0 2px rgba(212, 173, 115, 0.28);
  }

  .unlock-faction-tooltip {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 0.75rem);
    transform: translateX(-50%);
    z-index: 2;
    min-width: 18rem;
    max-width: min(24rem, calc(100vw - 3rem));
    display: grid;
    gap: 0.35rem;
    padding: 0.7rem 0.85rem;
    border-radius: 14px;
    border: 1px solid rgba(212, 173, 115, 0.3);
    background:
      linear-gradient(145deg, rgba(26, 21, 15, 0.97), rgba(13, 18, 26, 0.98)),
      radial-gradient(circle at top, rgba(212, 173, 115, 0.12), transparent 45%);
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.3);
    color: #f2ede4;
    pointer-events: none;
  }

  .unlock-faction-tooltip::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    width: 0.8rem;
    height: 0.8rem;
    background: rgba(13, 18, 26, 0.98);
    border-right: 1px solid rgba(212, 173, 115, 0.3);
    border-bottom: 1px solid rgba(212, 173, 115, 0.3);
    transform: translate(-50%, -50%) rotate(45deg);
  }

  .tooltip-number {
    font-weight: 700;
  }

  .tooltip-number-required {
    color: #d4ad73;
  }

  .tooltip-number-current {
    color: #d78686;
  }

  .draft-focus-panel {
    grid-area: focus;
    min-height: 180px;
    align-content: start;
  }

  .unlock-faction-overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    align-items: start;
    justify-items: center;
    padding: 1.5rem;
    background: rgba(4, 8, 14, 0.76);
    backdrop-filter: blur(8px);
    overflow-y: auto;
  }

  .unlock-faction-dialog {
    width: min(1280px, 100%);
    max-height: calc(100vh - 3rem);
    overflow: auto;
    display: grid;
    gap: 1rem;
    padding: 1.35rem;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.38);
  }

  .unlock-faction-dialog-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
  }

  .unlock-faction-dialog-copy {
    margin: 0;
    color: #d7dee6;
  }

  .unlock-faction-layout {
    gap: 1rem;
  }

  .unlock-faction-focus {
    background:
      linear-gradient(145deg, rgba(19, 28, 40, 0.98), rgba(11, 17, 25, 0.98)),
      radial-gradient(circle at top right, rgba(117, 145, 168, 0.14), transparent 42%);
  }

  .draft-focus-empty {
    max-width: 80ch;
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

  .viewport-shell {
    position: relative;
    height: 100%;
    min-height: 680px;
  }

  .replay-zoom-controls {
    position: absolute;
    right: 1rem;
    bottom: 1rem;
    display: grid;
    gap: 0.45rem;
    z-index: 1;
  }

  .replay-zoom-button {
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    border: 1px solid rgba(196, 214, 227, 0.22);
    border-radius: 999px;
    background: rgba(12, 18, 28, 0.48);
    color: rgba(238, 245, 250, 0.9);
    font-size: 1rem;
    line-height: 1;
    backdrop-filter: blur(10px);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
    transition:
      background 120ms ease,
      border-color 120ms ease,
      color 120ms ease,
      transform 120ms ease;
  }

  .replay-zoom-button:hover {
    background: rgba(18, 28, 41, 0.74);
    border-color: rgba(242, 201, 122, 0.45);
    color: #fff9eb;
    transform: translateY(-1px);
  }

  .replay-zoom-button:active {
    transform: translateY(0);
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
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    padding: 0.45rem 0.5rem 0.45rem 0.55rem;
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: 14px;
    background: rgba(20, 28, 38, 0.7);
    color: #f4f7fb;
  }

  .alive-unit-card:hover,
  .alive-unit-card.selected {
    border-color: rgba(213, 178, 116, 0.55);
    background: rgba(36, 28, 18, 0.75);
  }

  .alive-unit-main {
    display: grid;
    gap: 0.15rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    font: inherit;
  }

  .alive-cycle-button {
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    border: 1px solid rgba(196, 214, 227, 0.18);
    border-radius: 999px;
    background: rgba(12, 18, 28, 0.48);
    color: rgba(238, 245, 250, 0.9);
    font-size: 1rem;
    line-height: 1;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      transform 120ms ease;
  }

  .alive-cycle-button:hover,
  .alive-cycle-button:focus-visible {
    background: rgba(18, 28, 41, 0.74);
    border-color: rgba(242, 201, 122, 0.45);
    transform: translateY(-1px);
  }

  .replay-exit {
    grid-column: 2;
    display: flex;
    justify-content: center;
    padding-top: 0.2rem;
  }

  .replay-actions {
    gap: 0.75rem;
    flex-wrap: wrap;
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

  .replay-recap-button {
    border-color: rgba(120, 169, 219, 0.34);
    background: rgba(15, 27, 39, 0.96);
  }

  .replay-recap-backdrop {
    position: fixed;
    inset: 0;
    z-index: 12;
    display: grid;
    place-items: center;
    padding: 1.4rem;
  }

  .replay-recap-dismiss {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(3, 7, 12, 0.68);
    backdrop-filter: blur(8px);
  }

  .replay-recap-modal {
    position: relative;
    z-index: 1;
    width: min(960px, 100%);
    max-height: min(82vh, 860px);
    overflow: auto;
    gap: 1rem;
  }

  .replay-recap-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
  }

  .replay-recap-header h2 {
    margin: 0.2rem 0 0.35rem;
    font-size: 1.4rem;
  }

  .replay-recap-header p:last-child {
    margin: 0;
    color: #9db2c4;
  }

  .replay-recap-close {
    padding: 0.55rem 0.9rem;
    border-radius: 999px;
    border: 1px solid rgba(196, 214, 227, 0.22);
    background: rgba(12, 18, 28, 0.52);
    color: #f4f7fb;
    font: inherit;
  }

  .replay-recap-sides {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .replay-recap-side {
    display: grid;
    gap: 0.8rem;
    align-content: start;
  }

  .replay-recap-list,
  .replay-recap-units {
    display: grid;
    gap: 0.5rem;
  }

  .replay-recap-group {
    display: grid;
    gap: 0.5rem;
  }

  .replay-recap-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.8rem;
    width: 100%;
    padding: 0.75rem 0.85rem;
    border-radius: 16px;
    border: 1px solid rgba(124, 153, 176, 0.15);
    background: rgba(20, 28, 38, 0.7);
    color: #f4f7fb;
    text-align: left;
    font: inherit;
  }

  .replay-recap-row.troop.expanded,
  .replay-recap-row:hover,
  .replay-recap-row:focus-visible {
    border-color: rgba(213, 178, 116, 0.55);
    background: rgba(36, 28, 18, 0.75);
  }

  .replay-recap-row.unit {
    margin-left: 1rem;
    width: calc(100% - 1rem);
    background: rgba(14, 21, 31, 0.88);
  }

  .replay-recap-main {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  .replay-recap-art {
    width: 2.6rem;
    height: 2.6rem;
    object-fit: contain;
    image-rendering: pixelated;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }

  .replay-recap-art.small {
    width: 2.15rem;
    height: 2.15rem;
  }

  .replay-recap-bars {
    display: grid;
    gap: 0.28rem;
    margin-top: 0.18rem;
  }

  .replay-recap-bar {
    height: 0.4rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(116, 140, 161, 0.22);
  }

  .replay-recap-bar span {
    display: block;
    height: 100%;
    min-width: 0;
    border-radius: inherit;
  }

  .replay-recap-bar.damage span {
    background: linear-gradient(90deg, rgba(224, 123, 91, 0.9), rgba(255, 185, 122, 0.92));
  }

  .replay-recap-bar.healing span {
    background: linear-gradient(90deg, rgba(82, 198, 140, 0.9), rgba(147, 240, 183, 0.95));
  }

  .replay-recap-main small {
    color: #9db2c4;
  }

  .replay-recap-stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.7rem;
    color: #d8e1e9;
    font-size: 0.92rem;
  }

  .replay-recap-empty {
    margin: 0;
    color: #8fa3b5;
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

    .viewport {
      min-height: 420px;
    }

    .alive-sides {
      grid-template-columns: 1fr;
    }

    .replay-recap-sides {
      grid-template-columns: 1fr;
    }

    .draft-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .replay-exit {
      grid-column: 1;
    }
  }

  @media (max-width: 900px) {
    .unlock-faction-overlay {
      padding: 0.75rem;
    }

    .unlock-faction-dialog {
      max-height: calc(100vh - 1.5rem);
      padding: 1rem;
    }

    .unlock-faction-dialog-header {
      flex-direction: column;
      align-items: stretch;
    }

    .draft-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
