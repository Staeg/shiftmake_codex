<svelte:head>
  <title>Shiftmake</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import { getFactionTroops, getTroopEffectiveDefinition, getTroopStatusCounts, getTroopsAssignedToRift } from '../engine/army';
  import { formatFixed } from '../engine/fixed';
  import {
    FACTIONS,
    FACTION_UPGRADES,
    TROOP_CATALOG,
    getFactionNativeTroopUnlockIds,
    getAbility,
    getFaction,
    getMutator,
    getTroopTypeUpgrade,
    getUnitType,
  } from '../engine/unitCatalog';
  import type {
    AbilityDefinition,
    BattleReplay,
    BattleUnit,
    ExplainedStatKey,
    FactionId,
    SideId,
    StatBreakdown,
    TroopId,
    TroopUnlockId,
    UnitTypeId,
    UpgradeId,
  } from '../engine/types';
  import { describeTroopUnlock, getClaimableTroopUnlockIds, getUnownedUpgradeIds } from '../engine/upgrades';
  import type { BattleRenderer as BattleRendererType, UnitPointerInfo } from '../rendering/BattleRenderer';
  import { getFactionSpriteUrl, loadFactionUnitPortraitUrls } from '../rendering/unitVisuals';
  import { gameStore } from '../store/gameStore';
  import type { SaveSlotSummary } from '../store/saveSlots';
  import BattleControls from './BattleControls.svelte';
  import EventLog from './EventLog.svelte';
  import { displayIcon, formatAbilityExact, statIcon } from './inspectText';
  import { getRiftVisual } from './riftVisuals';
  import StatBreakdownGrid from './StatBreakdownGrid.svelte';
  import UnitTooltip from './UnitTooltip.svelte';
  import { buildBattleRecap, findLastAliveStep, isUnitAliveAtStep, type BattleRecapTroopEntry } from './battleRecap';

  type StatEntry = {
    key: string;
    label: string;
    value: string;
    breakdown: StatBreakdown | null;
  };

  type DetailCard =
    | {
        detailKey: string;
        kind: 'mutator' | 'faction' | 'upgrade';
        label: string;
        description: string;
      }
    | {
        detailKey: string;
        kind: 'unit';
        label: string;
        description: string;
        portraitUrl: string;
        stats: StatEntry[];
        abilities: Array<{ label: string; description: string }>;
      };

  const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];
  const EXPLAINED_STAT_ORDER: ExplainedStatKey[] = ['health', 'damage', 'speed', 'armor', 'range', 'capacity', 'size'];
  const replayProfileKey = (side: SideId, troopLabel: string): string => `${side}:${troopLabel}`;

  let portraits: Record<string, string> = {};
  let selectedRiftId: string | null = null;
  let selectedTroopId: TroopId | null = null;
  let selectedFactionId: FactionId | null = null;
  let selectedReplayId: string | null = null;
  let hoveredDetail: DetailCard | null = null;
  let pinnedDetail: DetailCard | null = null;
  let hoveredAbilityTooltip: { label: string; description: string } | null = null;
  let battleHost: HTMLDivElement | null = null;
  let renderer: BattleRendererType | null = null;
  let rendererInitPromise: Promise<void> | null = null;
  let renderedReplayId: string | null = null;
  let renderedStep = Number.NaN;
  let renderedHighlightKey = '';
  let autoTimer: ReturnType<typeof window.setInterval> | null = null;
  let hoverInfo: UnitPointerInfo | null = null;
  let lockedUnitId: string | null = null;
  let hoveredReplayProfileKey: string | null = null;
  let selectedReplayProfileKey: string | null = null;
  let replayAliveCountsExpanded = false;
  let replayEventLogCollapsed = false;
  let replayRecapOpen = false;
  let expandedReplayRecapTroopKey: string | null = null;

  function getReplayProfileKeyForUnit(unitId: string): string | null {
    const unit = replaySnapshot.find((entry) => entry.id === unitId);
    return unit ? replayProfileKey(unit.side, unit.troopLabel) : null;
  }

  function setReplayUnitLock(unitId: string, options?: { toggle?: boolean; pointer?: UnitPointerInfo | null; profileKey?: string | null }): void {
    const nextProfileKey = options?.profileKey ?? getReplayProfileKeyForUnit(unitId);
    const sameUnitLocked = options?.toggle && lockedUnitId === unitId;

    if (sameUnitLocked) {
      lockedUnitId = null;
      hoverInfo = options?.pointer ?? null;
      if (nextProfileKey) {
        selectedReplayProfileKey = nextProfileKey;
      }
      syncRenderer();
      return;
    }

    lockedUnitId = unitId;
    hoverInfo = options?.pointer ?? { unitId, x: 0, y: 0 };
    if (nextProfileKey) {
      selectedReplayProfileKey = nextProfileKey;
    }
    syncRenderer();
  }

  function previewReplayProfile(side: SideId, troopLabel: string): void {
    hoveredReplayProfileKey = replayProfileKey(side, troopLabel);
  }

  function clearReplayProfilePreview(): void {
    hoveredReplayProfileKey = null;
  }

  function focusReplayProfileUnit(side: SideId, troopLabel: string, options?: { cycle?: boolean; toggle?: boolean }): void {
    const profileKey = replayProfileKey(side, troopLabel);
    const matchingUnits = replaySnapshot
      .filter((unit) => unit.alive && unit.side === side && unit.troopLabel === troopLabel)
      .sort((left, right) => left.id.localeCompare(right.id));

    selectedReplayProfileKey = profileKey;
    if (matchingUnits.length === 0) {
      if (options?.toggle) {
        lockedUnitId = null;
        hoverInfo = null;
        syncRenderer();
      }
      return;
    }

    const currentIndex = matchingUnits.findIndex((unit) => unit.id === lockedUnitId);
    const nextUnit =
      options?.cycle && currentIndex >= 0
        ? matchingUnits[(currentIndex + 1) % matchingUnits.length] ?? null
        : matchingUnits[currentIndex >= 0 ? currentIndex : 0] ?? null;

    if (!nextUnit) {
      return;
    }

    setReplayUnitLock(nextUnit.id, {
      toggle: options?.toggle,
      profileKey,
    });
  }

  function parseTroopUnlockId(troopUnlockId: TroopUnlockId): [FactionId, UnitTypeId] {
    return troopUnlockId.split('/') as [FactionId, UnitTypeId];
  }

  function slotPhaseLabel(phase?: string | null): string {
    return phase ? phase.replace(/_/g, ' ') : 'planning';
  }

  function getFactionUnitPortrait(factionId: FactionId, unitTypeId: UnitTypeId): string {
    return portraits[`${factionId}/${unitTypeId}`] ?? '';
  }

  function getFactionPortrait(factionId: FactionId): string {
    return getFactionSpriteUrl(factionId);
  }

  function getUpgradeDetails(upgradeId: UpgradeId): { label: string; description: string; bucket: string } {
    if (upgradeId in FACTION_UPGRADES) {
      const upgrade = FACTION_UPGRADES[upgradeId]!;
      return {
        label: upgrade.label,
        description: upgrade.description,
        bucket: `${getFaction(upgrade.factionId).label} faction upgrade`,
      };
    }

    const upgrade = getTroopTypeUpgrade(upgradeId);
    return {
      label: upgrade.label,
      description: upgrade.description,
      bucket: `${getUnitType(upgrade.unitTypeId).label} troop upgrade`,
    };
  }

  function buildStatEntries(
    stats: { health: number; damage: number; speed: number; armor: number; range: number; capacity: number; size?: number },
    breakdowns?: Partial<Record<ExplainedStatKey, StatBreakdown>>,
    includeSize = false,
    quantity?: number,
  ): StatEntry[] {
    const keys = includeSize ? EXPLAINED_STAT_ORDER : EXPLAINED_STAT_ORDER.filter((stat) => stat !== 'size');
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

  function describeFactionModifiers(factionId: FactionId): string[] {
    const faction = getFaction(factionId);
    const parts: string[] = [];

    Object.entries(faction.statAdjustments).forEach(([key, adjustment]) => {
      if (!adjustment) {
        return;
      }

      if (key === 'cost') {
        const percent = ((adjustment.multiplier ?? 1) - 1) * 100;
        const flat = adjustment.flat ?? 0;
        if (percent !== 0) {
          parts.push(`Recruitment cost ${percent > 0 ? '+' : ''}${formatFixed(percent)}%.`);
        } else if (flat !== 0) {
          parts.push(`Recruitment cost ${flat > 0 ? '+' : ''}${formatFixed(flat)}.`);
        }
        return;
      }

      const flat = adjustment.flat ?? 0;
      const percent = ((adjustment.multiplier ?? 1) - 1) * 100;
      const modifiers: string[] = [];
      if (flat !== 0) {
        modifiers.push(`${flat > 0 ? '+' : ''}${formatFixed(flat)}`);
      }
      if (percent !== 0) {
        modifiers.push(`${percent > 0 ? '+' : ''}${formatFixed(percent)}%`);
      }
      if (modifiers.length > 0) {
        parts.push(`${statIcon(key as ExplainedStatKey)} ${modifiers.join(', ')}.`);
      }
    });

    if (faction.addedAttributes.length > 0) {
      parts.push(`Attributes: ${faction.addedAttributes.join(', ')}.`);
    }

    faction.abilityIds.forEach((abilityId) => {
      const ability = getAbility(abilityId);
      parts.push(`${ability.label}: ${formatAbilityExact(ability)}`);
    });

    return parts.length > 0 ? parts : ['No special modifiers.'];
  }

  function buildFactionDetail(factionId: FactionId): DetailCard {
    const faction = getFaction(factionId);
    return {
      detailKey: `faction:${factionId}`,
      kind: 'faction',
      label: faction.label,
      description: [faction.description, ...describeFactionModifiers(factionId)].join(' '),
    };
  }

  function buildMutatorDetail(mutatorId: string): DetailCard {
    const mutator = getMutator(mutatorId);
    return {
      detailKey: `mutator:${mutatorId}`,
      kind: 'mutator',
      label: mutator.label,
      description: mutator.description,
    };
  }

  function buildUpgradeDetail(upgradeId: UpgradeId): DetailCard {
    const details = getUpgradeDetails(upgradeId);
    return {
      detailKey: `upgrade:${upgradeId}`,
      kind: 'upgrade',
      label: details.label,
      description: `${details.bucket}. ${details.description}`,
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
  ): DetailCard {
    return {
      detailKey,
      kind: 'unit',
      label,
      description,
      portraitUrl: getFactionUnitPortrait(factionId, unitTypeId),
      stats: buildStatEntries(stats, statBreakdowns, true, quantity),
      abilities: abilities.map((ability) => ({
        label: ability.label,
        description: formatAbilityExact(ability),
      })),
    };
  }

  function previewDetail(detail: DetailCard): void {
    if (!pinnedDetail) {
      hoveredDetail = detail;
    }
  }

  function togglePinnedDetail(detail: DetailCard): void {
    pinnedDetail = pinnedDetail?.detailKey === detail.detailKey ? null : detail;
    hoveredDetail = null;
    hoveredAbilityTooltip = null;
  }

  function clearDetail(): void {
    if (!pinnedDetail) {
      hoveredDetail = null;
    }
    hoveredAbilityTooltip = null;
  }

  function resetOverworldInspect(): void {
    hoveredDetail = null;
    pinnedDetail = null;
    hoveredAbilityTooltip = null;
  }

  function clearAutoTimer(): void {
    if (autoTimer !== null) {
      window.clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  async function ensureRenderer(): Promise<void> {
    if (!battleHost || renderer) {
      return;
    }

    if (rendererInitPromise) {
      await rendererInitPromise;
      return;
    }

    const { BattleRenderer } = await import('../rendering/BattleRenderer');
    const nextRenderer = new BattleRenderer(battleHost);
    nextRenderer.setInteractionHandlers({
      onUnitHover: (info) => {
        if (!lockedUnitId) {
          hoverInfo = info;
        }
      },
      onUnitClick: (info) => {
        setReplayUnitLock(info.unitId, {
          toggle: true,
          pointer: info,
        });
      },
    });

    rendererInitPromise = (async () => {
      await nextRenderer.init();
      renderer = nextRenderer;
      renderer.refreshViewport();
      syncRenderer();
    })();

    try {
      await rendererInitPromise;
    } finally {
      rendererInitPromise = null;
    }
  }

  function syncRenderer(): void {
    if (!renderer || !$gameStore.loadedReplay) {
      return;
    }

    renderer.setPlaybackTiming($gameStore.autoPlay, $gameStore.speedMs);

    if (renderedReplayId !== $gameStore.loadedReplay.id) {
      renderer.setReplay($gameStore.loadedReplay);
      renderedReplayId = $gameStore.loadedReplay.id;
      renderedStep = Number.NaN;
      renderedHighlightKey = '';
      lockedUnitId = null;
      hoverInfo = null;
    }

    if (renderedStep !== $gameStore.currentStep) {
      renderer.showStep($gameStore.currentStep);
      renderedStep = $gameStore.currentStep;
    }

    const highlightStepIndex = $gameStore.selectedEvent ?? ($gameStore.currentStep >= 0 ? $gameStore.currentStep : null);
    const highlightedStep = highlightStepIndex !== null ? $gameStore.loadedReplay.steps[highlightStepIndex] ?? null : null;

    let strongIds = highlightedStep?.actorIds ?? [];
    let faintIds = highlightedStep?.targetIds ?? [];

    if (lockedUnitId) {
      if (highlightedStep?.actorIds.includes(lockedUnitId)) {
        strongIds = [lockedUnitId];
        faintIds = highlightedStep.targetIds.filter((id) => id !== lockedUnitId);
      } else if (highlightedStep?.targetIds.includes(lockedUnitId)) {
        strongIds = [lockedUnitId];
        faintIds = highlightedStep.actorIds.filter((id) => id !== lockedUnitId);
      } else {
        strongIds = [lockedUnitId];
        faintIds = [];
      }
    }

    const highlightKey = `${strongIds.join('|')}::${faintIds.join('|')}`;
    if (highlightKey !== renderedHighlightKey) {
      renderer.setHighlights(strongIds, faintIds);
      renderedHighlightKey = highlightKey;
    }
  }

  function handleResize(): void {
    renderer?.refreshViewport();
  }

  function zoomReplayIn(): void {
    renderer?.zoomIn();
  }

  function zoomReplayOut(): void {
    renderer?.zoomOut();
  }

  function resetReplayZoom(): void {
    renderer?.resetZoom();
  }

  function openSlot(slot: SaveSlotSummary): void {
    if (slot.status === 'occupied') {
      gameStore.loadSlot(slot.slotId);
      return;
    }
    gameStore.startNewCampaign(slot.slotId);
  }

  function restartSlot(slot: SaveSlotSummary): void {
    gameStore.startNewCampaign(slot.slotId);
  }

  function handleEndCycle(): void {
    gameStore.endCycle($gameStore.cycleEndConfirmationPending);
  }

  function setRiftCenterMode(): void {
    resetOverworldInspect();
    gameStore.setCenterMode('rifts');
  }

  function setTroopCenterMode(): void {
    resetOverworldInspect();
    selectedRiftId = null;
    selectedReplayId = null;
    gameStore.setCenterMode('troops');
  }

  function selectRift(riftId: string): void {
    selectedRiftId = riftId;
    selectedFactionId = null;
    selectedReplayId = null;
    setRiftCenterMode();
  }

  function selectTroop(troopId: TroopId): void {
    selectedTroopId = troopId;
    const troop = $gameStore.game.troops.find((entry) => entry.id === troopId);
    selectedFactionId = troop?.factionId ?? null;
    setTroopCenterMode();
  }

  function selectFaction(factionId: FactionId): void {
    selectedFactionId = factionId;
    setTroopCenterMode();
  }

  function selectTroopForRift(troopId: TroopId): void {
    selectedTroopId = selectedTroopId === troopId ? null : troopId;
    selectedReplayId = null;
  }

  function selectReplay(replayId: string): void {
    selectedReplayId = selectedReplayId === replayId ? null : replayId;
    hoveredDetail = null;
    pinnedDetail = null;
  }

  function openSelectedReplay(): void {
    if (selectedReplayEntry) {
      gameStore.openReplay(selectedReplayEntry.replayId);
    }
  }

  function showAbilityTooltip(ability: AbilityDefinition | { label: string; description: string }): void {
    hoveredAbilityTooltip = {
      label: ability.label,
      description: 'shortText' in ability ? formatAbilityExact(ability) : ability.description,
    };
  }

  function showMutatorDetail(mutatorId: string): void {
    previewDetail(buildMutatorDetail(mutatorId));
  }

  function currentSnapshot(replay: BattleReplay): BattleUnit[] {
    if ($gameStore.currentStep < 0) {
      return replay.initial.units;
    }

    return replay.steps[Math.min($gameStore.currentStep, replay.steps.length - 1)]?.snapshot.units ?? replay.initial.units;
  }

  onMount(() => {
    gameStore.initialize();
    void loadFactionUnitPortraitUrls().then((loaded) => {
      portraits = loaded;
    });

    window.addEventListener('resize', handleResize);
    return () => {
      clearAutoTimer();
      window.removeEventListener('resize', handleResize);
      renderer?.destroy();
      renderer = null;
    };
  });

  $: if (battleHost) {
    void ensureRenderer();
  }

  $: if (renderer && $gameStore.screen === 'replay' && $gameStore.loadedReplay) {
    syncRenderer();
  }

  $: {
    clearAutoTimer();
    if ($gameStore.screen === 'replay' && $gameStore.loadedReplay && $gameStore.autoPlay) {
      autoTimer = window.setInterval(() => {
        if (!$gameStore.loadedReplay || $gameStore.currentStep >= $gameStore.loadedReplay.steps.length - 1) {
          gameStore.setAutoPlay(false);
          return;
        }
        gameStore.stepForward();
      }, $gameStore.speedMs);
    }
  }

  $: if ($gameStore.loadedReplay && $gameStore.currentStep >= $gameStore.loadedReplay.steps.length - 1 && $gameStore.autoPlay) {
    gameStore.setAutoPlay(false);
  }

  $: discoveredRifts = $gameStore.game.openRifts.filter((rift) => rift.state === 'discovered');
  $: factionRosterIds = FACTION_IDS.filter((factionId) => $gameStore.game.unlockedFactionIds.includes(factionId));
  $: activeDetail = pinnedDetail ?? hoveredDetail;
  $: statusCounts = getTroopStatusCounts($gameStore.game);
  $: claimableTroopUnlockIds = getClaimableTroopUnlockIds($gameStore.game);
  $: unownedTroopUnlockIds = claimableTroopUnlockIds.filter(
    (troopUnlockId) => !$gameStore.game.troops.some((troop) => troop.id === troopUnlockId),
  );
  $: unownedUpgradeIds = getUnownedUpgradeIds($gameStore.game);
  $: ownedUpgradeIds = [...$gameStore.game.factionUpgradeIds, ...$gameStore.game.troopTypeUpgradeIds];
  $: starterGroups = FACTION_IDS.map((factionId) => ({
    factionId,
    label: FACTIONS[factionId].label,
    options: getFactionNativeTroopUnlockIds(factionId),
  }));

  $: if (selectedRiftId && !discoveredRifts.some((rift) => rift.id === selectedRiftId)) {
    selectedRiftId = null;
  }
  $: if (!selectedRiftId && discoveredRifts.length > 0 && $gameStore.centerMode === 'rifts') {
    selectedRiftId = discoveredRifts[0]!.id;
  }

  $: if (selectedTroopId && !$gameStore.game.troops.some((troop) => troop.id === selectedTroopId)) {
    selectedTroopId = null;
  }
  $: if (!selectedTroopId && $gameStore.game.troops.length > 0 && $gameStore.centerMode === 'troops') {
    selectedTroopId = $gameStore.game.troops[0]!.id;
  }

  $: if (selectedFactionId && !factionRosterIds.includes(selectedFactionId)) {
    selectedFactionId = null;
  }
  $: if (!selectedFactionId && factionRosterIds.length > 0) {
    selectedFactionId = factionRosterIds[0]!;
  }

  $: if (selectedReplayId && !$gameStore.game.replayIndex.some((entry) => entry.replayId === selectedReplayId)) {
    selectedReplayId = null;
  }

  $: selectedRift = selectedRiftId ? discoveredRifts.find((rift) => rift.id === selectedRiftId) ?? null : null;
  $: selectedTroop = selectedTroopId ? $gameStore.game.troops.find((troop) => troop.id === selectedTroopId) ?? null : null;
  $: selectedTroopDefinition = selectedTroop ? getTroopEffectiveDefinition($gameStore.game, selectedTroop.id) : null;
  $: selectedReplayEntry = selectedReplayId
    ? $gameStore.game.replayIndex.find((entry) => entry.replayId === selectedReplayId) ?? null
    : null;
  $: selectedReplayAvailable =
    selectedReplayEntry && !selectedReplayEntry.summaryOnly ? gameStore.hasReplay(selectedReplayEntry.replayId) : false;
  $: readyTroops = $gameStore.game.troops.filter((troop) => troop.recoveryCyclesRemaining === 0 && troop.assignmentRiftId === null);
  $: selectedRiftAssignableTroops = selectedRift
    ? $gameStore.game.troops.filter(
        (troop) => troop.recoveryCyclesRemaining === 0 && (troop.assignmentRiftId === null || troop.assignmentRiftId === selectedRift.id),
      )
    : [];

  $: replay = $gameStore.loadedReplay;
  $: replaySnapshot = replay ? currentSnapshot(replay) : [];
  $: currentUnitById = new Map(replaySnapshot.map((unit) => [unit.id, unit]));
  $: replayProfilesByKey = new Map((replay?.troopProfiles ?? []).map((profile) => [replayProfileKey(profile.side, profile.troopLabel), profile]));
  $: inspectedUnitId = lockedUnitId ?? hoverInfo?.unitId ?? null;
  $: inspectedUnit = inspectedUnitId ? replaySnapshot.find((unit) => unit.id === inspectedUnitId) ?? null : null;
  $: inspectedProfile =
    replay && inspectedUnit
      ? replay.troopProfiles.find((profile) => profile.troopLabel === inspectedUnit.troopLabel && profile.side === inspectedUnit.side) ?? null
      : null;
  $: hoveredReplayProfile = hoveredReplayProfileKey ? replayProfilesByKey.get(hoveredReplayProfileKey) ?? null : null;
  $: selectedReplayProfile = selectedReplayProfileKey ? replayProfilesByKey.get(selectedReplayProfileKey) ?? null : null;
  $: replayFocusProfile = hoveredReplayProfile ?? inspectedProfile ?? selectedReplayProfile;
  $: aliveSummary = replay ? replay.aliveCounts[Math.max(0, $gameStore.currentStep + 1)] ?? replay.aliveCounts[0] : null;
  $: aliveCountsBySide = replaySnapshot.reduce(
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
  $: alivePlayerGroups = Object.entries(aliveCountsBySide.player).sort((left, right) => left[0].localeCompare(right[0]));
  $: aliveEnemyGroups = Object.entries(aliveCountsBySide.enemy).sort((left, right) => left[0].localeCompare(right[0]));
  $: engagedUnits =
    inspectedUnit && replaySnapshot.length > 0
      ? inspectedUnit.engagedWithIds.map((unitId) => replaySnapshot.find((unit) => unit.id === unitId)).filter(Boolean) as BattleUnit[]
      : [];
  $: replayRecap = replay ? buildBattleRecap(replay) : [];
  $: replayRecapPlayerTroops = replayRecap.filter((entry) => entry.side === 'player');
  $: replayRecapEnemyTroops = replayRecap.filter((entry) => entry.side === 'enemy');
  $: replayRecapSides = [
    { side: 'player' as const, label: 'Player', troops: replayRecapPlayerTroops },
    { side: 'enemy' as const, label: 'Enemy', troops: replayRecapEnemyTroops },
  ];

  function selectReplayProfile(side: SideId, troopLabel: string): void {
    focusReplayProfileUnit(side, troopLabel, {
      toggle: true,
    });
  }

  function selectReplayEvent(index: number): void {
    const step = replay?.steps[index] ?? null;
    const snapshotUnits = step?.snapshot.units ?? replay?.initial.units ?? [];
    const focusUnitId = step?.actorIds[0] ?? step?.targetIds[0] ?? null;

    gameStore.selectEvent(index);

    if (!focusUnitId) {
      lockedUnitId = null;
      hoverInfo = null;
      return;
    }

    const focusUnit = snapshotUnits.find((unit) => unit.id === focusUnitId) ?? null;
    setReplayUnitLock(focusUnitId, {
      profileKey: focusUnit ? replayProfileKey(focusUnit.side, focusUnit.troopLabel) : null,
    });
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

  function getReplayRecapSharedScaleTotal(troops: BattleRecapTroopEntry[]): number {
    const damageTotal = troops.reduce((sum, troop) => sum + troop.damageDone, 0);
    const healingTotal = troops.reduce((sum, troop) => sum + troop.healingDone, 0);
    return Math.max(damageTotal, healingTotal);
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
    if (!replay) {
      return;
    }

    const currentStep = $gameStore.currentStep;
    const targetStep = isUnitAliveAtStep(replay, unitId, currentStep) ? currentStep : findLastAliveStep(replay, unitId, currentStep);
    gameStore.setAutoPlay(false);
    if (targetStep !== currentStep) {
      gameStore.jumpTo(targetStep);
    }

    setReplayUnitLock(unitId, {
      profileKey: replayProfileKey(side, troopLabel),
    });
    replayRecapOpen = false;
    expandedReplayRecapTroopKey = null;
  }

  function cycleReplayProfileUnit(side: SideId, troopLabel: string): void {
    focusReplayProfileUnit(side, troopLabel, {
      cycle: true,
    });
  }
</script>

{#if $gameStore.screen === 'main_menu'}
  <main class="menu-screen">
    <section class="menu-panel">
      <div class="menu-copy">
        <p class="eyebrow">Shiftmake</p>
        <h1>Choose A Save Slot</h1>
        <p class="intro">Each slot keeps its own campaign and battle archive. Load one or start fresh.</p>
      </div>

      <div class="slot-grid">
        {#each $gameStore.slots as slot}
          <article class="slot-card panel">
            <div class="slot-card-header">
              <span class="slot-label">Slot {slot.slotId}</span>
              <strong>{slot.status === 'occupied' ? 'Occupied' : 'Empty'}</strong>
            </div>

            {#if slot.status === 'occupied'}
              <div class="slot-meta">
                <span>{slot.factionLabel ?? 'In progress'}</span>
                <span>Cycle {slot.cycleNumber}</span>
                <span>{slotPhaseLabel(slot.phase)}</span>
                <span>{slot.lastPlayedAt ? new Date(slot.lastPlayedAt).toLocaleString() : 'No timestamp'}</span>
              </div>
            {:else}
              <p>This slot is ready for a new campaign.</p>
            {/if}

            <div class="actions-grid">
              <button class="primary" on:click={() => openSlot(slot)}>{slot.status === 'occupied' ? 'Load Slot' : 'Start Campaign'}</button>
              {#if slot.status === 'occupied'}
                <button on:click={() => restartSlot(slot)}>Replace Save</button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </section>
  </main>
{:else if $gameStore.screen === 'overworld' && $gameStore.game.phase === 'opening_unlock'}
  <main class="draft-screen">
    <section class="draft-panel opening-shell">
      <div class="draft-layout">
        <aside class="panel draft-focus-panel" role="presentation" on:mouseleave={clearDetail}>
          {#if activeDetail}
            <div class="detail-panel opening-detail-panel">
              <p class="eyebrow">{activeDetail.kind === 'faction' ? 'Faction Modifiers' : activeDetail.kind === 'unit' ? 'Troop Preview' : 'Detail'}</p>
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
            <div class="focus-empty draft-focus-empty"></div>
          {/if}
        </aside>

        <div class="draft-grid">
          {#each starterGroups as group}
            {@const factionDetail = buildFactionDetail(group.factionId)}
            <article class="draft-card panel">
              <header class="draft-card-header">
                <div class="draft-card-title">
                  <strong>{group.label}</strong>
                  <button
                    type="button"
                    class="sprite-inspect-button"
                    class:selected={activeDetail?.detailKey === factionDetail.detailKey}
                    aria-label={`Inspect ${group.label} faction modifiers`}
                    on:mouseenter={() => previewDetail(factionDetail)}
                    on:focus={() => previewDetail(factionDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => togglePinnedDetail(factionDetail)}
                  >
                    <img class="faction-name-art" src={getFactionPortrait(group.factionId)} alt="" aria-hidden="true" />
                  </button>
                </div>
                <small>{getFaction(group.factionId).description}</small>
              </header>

              <div class="draft-section">
                <span class="draft-section-label">Troop options</span>
                <div class="draft-icon-row">
                  {#each group.options as troopUnlockId}
                    {@const [factionId, unitTypeId] = parseTroopUnlockId(troopUnlockId)}
                    {@const troopDef = TROOP_CATALOG[troopUnlockId]}
                    {@const troopDetail = buildResolvedUnitDetail(
                      `opening:${troopUnlockId}`,
                      troopDef.label,
                      factionId,
                      unitTypeId,
                      troopDef.stats,
                      troopDef.quantity,
                      `Opening unlock for ${getFaction(factionId).label}. Native recruits are available here; unusual faction and troop pairings come from Rift victories.`,
                      troopDef.abilities,
                    )}
                    <button
                      type="button"
                      class="draft-troop-icon"
                      aria-label={troopDef.label}
                      on:mouseenter={() => previewDetail(troopDetail)}
                      on:focus={() => previewDetail(troopDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => gameStore.claimOpeningTroop(troopUnlockId)}
                    >
                      <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden="true" />
                      <span>{getUnitType(unitTypeId).label}</span>
                    </button>
                  {/each}
                </div>
              </div>
            </article>
          {/each}
        </div>
      </div>
    </section>
  </main>
{:else if $gameStore.screen === 'overworld'}
  <main class="shell overworld-shell" class:troops-mode={$gameStore.centerMode === 'troops'}>
    <header class="topbar">
      <div>
        <p class="eyebrow">Cycle {$gameStore.game.cycleNumber}</p>
        <h1>Shiftmake Command Table</h1>
      </div>

      <div class="resource-strip">
        <div class="resource-essence"><span>Essence</span><strong><i class="resource-icon essence"></i>{formatFixed($gameStore.game.essence)}</strong></div>
        <div><span>Victory Points</span><strong>{$gameStore.game.victoryPoints}</strong></div>
        <div><span>Active</span><strong>{statusCounts.active}</strong></div>
        <div><span>Recovering</span><strong>{statusCounts.recovering}</strong></div>
        <div><span>Idle</span><strong>{statusCounts.idle}</strong></div>
      </div>

      <div class="mode-toggle">
        <button class:selected={$gameStore.centerMode === 'rifts'} on:click={setRiftCenterMode}>Rifts</button>
        <button class:selected={$gameStore.centerMode === 'troops'} on:click={setTroopCenterMode}>Factions & Troops</button>
        <button on:click={() => gameStore.returnToMainMenu()}>Main Menu</button>
      </div>
    </header>

    <section class="left-column">
      <div class="panel overworld-detail-panel">
        {#if activeDetail}
          <div class="detail-panel overworld-detail-panel" role="presentation" on:mouseleave={clearDetail}>
            <p class="eyebrow">
              {activeDetail.kind === 'mutator'
                ? 'Mutator Effect'
                : activeDetail.kind === 'faction'
                  ? 'Faction Modifiers'
                  : activeDetail.kind === 'upgrade'
                    ? 'Upgrade Preview'
                    : 'Unit Inspect'}
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
        {:else if false && $gameStore.centerMode === 'rifts' && selectedRift}
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

          <div class="compact-list">
            <div>
              <span>VP Reward</span>
              <strong>{selectedRift.victoryPoints}</strong>
            </div>
            <div>
              <span>Hex Fit</span>
              <strong>{selectedRift.saturation}</strong>
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
                    on:mouseenter={() => previewDetail(buildMutatorDetail(mutatorId))}
                    on:focus={() => previewDetail(buildMutatorDetail(mutatorId))}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => togglePinnedDetail(buildMutatorDetail(mutatorId))}
                  >
                    {getMutator(mutatorId).label}
                  </button>
                {/each}
              {/if}
            </div>
          </div>

          <div class="compact-list enemy-list">
            {#each selectedRift.enemyArmy as enemy}
              {@const enemyDetail = buildResolvedUnitDetail(
                `enemy:${enemy.combatantId}`,
                enemy.label,
                enemy.factionId,
                enemy.unitTypeId,
                enemy.stats,
                enemy.quantity,
                'Enemy troop',
                enemy.abilities,
                enemy.statBreakdowns,
              )}
              <button
                class="unit-tile enemy-tile"
                class:selected={activeDetail?.detailKey === enemyDetail.detailKey}
                on:mouseenter={() => previewDetail(enemyDetail)}
                on:focus={() => previewDetail(enemyDetail)}
                on:mouseleave={clearDetail}
                on:blur={clearDetail}
                on:click={() => togglePinnedDetail(enemyDetail)}
              >
                <img class="unit-tile-art" src={getFactionUnitPortrait(enemy.factionId, enemy.unitTypeId)} alt="" aria-hidden="true" />
                <strong>x{enemy.quantity}</strong>
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
                  {@const troopDef = getTroopEffectiveDefinition($gameStore.game, troop.id)}
                  {@const troopDetail = buildResolvedUnitDetail(
                    `rift-ready:${selectedRift.id}:${troop.id}`,
                    troopDef.label,
                    troop.factionId,
                    troop.unitTypeId,
                    troopDef.stats,
                    troopDef.quantity,
                    troop.assignmentRiftId === selectedRift.id ? 'Assigned to this Rift' : 'Ready troop',
                    troopDef.abilities,
                    troopDef.statBreakdowns,
                  )}
                  <button
                    class="unit-tile"
                    class:assigned={troop.assignmentRiftId === selectedRift.id}
                    class:selected={activeDetail?.detailKey === troopDetail.detailKey}
                    on:click={() => gameStore.assignTroopToRift(troop.id, selectedRift.id)}
                    on:mouseenter={() => previewDetail(troopDetail)}
                    on:focus={() => previewDetail(troopDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                  >
                    <img class="unit-tile-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden="true" />
                    {#if troop.assignmentRiftId === selectedRift.id}
                      <small>✅</small>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else if $gameStore.centerMode === 'troops' && selectedTroop && selectedTroopDefinition}
          <p class="eyebrow">Allied Troop</p>
          <h2>{selectedTroopDefinition.label}</h2>
          <p>{getFaction(selectedTroop.factionId).label} {getUnitType(selectedTroop.unitTypeId).label}</p>
          <p>
            {selectedTroop.assignmentRiftId
              ? `Assigned to ${selectedTroop.assignmentRiftId}`
              : selectedTroop.recoveryCyclesRemaining > 0
                ? `Recovering ${selectedTroop.recoveryCyclesRemaining}`
                : 'Ready'}
          </p>
          <StatBreakdownGrid
            stats={buildStatEntries(selectedTroopDefinition.stats, selectedTroopDefinition.statBreakdowns, true, selectedTroopDefinition.quantity)}
            columns={4}
          />

          <div class="ability-row">
            <span>Abilities</span>
            <div class="ability-list">
              {#if selectedTroopDefinition.abilities.length === 0}
                <span class="mutator-chip empty">None</span>
              {:else}
                {#each selectedTroopDefinition.abilities as ability}
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

          <div class="assignment-panel">
            <p class="assignment-label">Open Rifts</p>
            <div class="assignment-list">
              {#each discoveredRifts as rift}
                <button class="list-button" class:selected={selectedTroop.assignmentRiftId === rift.id} on:click={() => gameStore.assignTroopToRift(selectedTroop.id, rift.id)}>
                  <strong>{rift.id}</strong>
                  <small>Tier {rift.tier} | VP {rift.victoryPoints}</small>
                </button>
              {/each}
            </div>
          </div>

          {#if selectedTroop.assignmentRiftId}
            <button class="primary" on:click={() => gameStore.clearTroopAssignment(selectedTroop.id)}>Clear Assignment</button>
          {/if}
        {:else}
          <p class="eyebrow">Unit Inspect</p>
          <h2>No Focus Item</h2>
          <p>
            {$gameStore.centerMode === 'rifts'
              ? 'Hover or select a troop, enemy, or mutator from the Rift board to inspect it here.'
              : 'Choose a Rift or troop to inspect its roster, stats, and assignments.'}
          </p>
        {/if}
      </div>
    </section>

    <section class="center-column">
      {#if $gameStore.centerMode === 'rifts'}
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
                  <strong>Tier {rift.tier} <span>{rift.id}</span></strong>
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

              <div class="rift-meta-row">
                <span class="reward-pill">VP {rift.victoryPoints}</span>
                <span class="reward-pill">Fit {rift.saturation}</span>
                {#if rift.mutatorIds.length === 0}
                  <span class="mutator-chip empty">No mutators</span>
                {:else}
                  {#each rift.mutatorIds as mutatorId}
                    <button
                      class="mutator-chip rift-mutator-chip"
                      on:mouseenter={() => previewDetail(buildMutatorDetail(mutatorId))}
                      on:focus={() => previewDetail(buildMutatorDetail(mutatorId))}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(buildMutatorDetail(mutatorId))}
                    >
                      {getMutator(mutatorId).label}
                    </button>
                  {/each}
                {/if}
              </div>

              <div class="rift-card-section">
                <div class="assigned-strip enemy-strip">
                  {#each rift.enemyArmy as enemy}
                    {@const enemyDetail = buildResolvedUnitDetail(
                      `enemy:${rift.id}:${enemy.combatantId}`,
                      enemy.label,
                      enemy.factionId,
                      enemy.unitTypeId,
                      enemy.stats,
                      enemy.quantity,
                      'Enemy troop',
                      enemy.abilities,
                      enemy.statBreakdowns,
                    )}
                    <button
                      class="unit-tile enemy-tile"
                      class:selected={activeDetail?.detailKey === enemyDetail.detailKey}
                      on:mouseenter={() => previewDetail(enemyDetail)}
                      on:focus={() => previewDetail(enemyDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(enemyDetail)}
                    >
                      <img class="unit-tile-art" src={getFactionUnitPortrait(enemy.factionId, enemy.unitTypeId)} alt="" aria-hidden="true" />
                      <strong>x{enemy.quantity}</strong>
                    </button>
                  {/each}
                </div>
              </div>

              <div class="assigned-strip">
                {#each getTroopsAssignedToRift($gameStore.game, rift.id) as troop}
                  {@const troopDef = getTroopEffectiveDefinition($gameStore.game, troop.id)}
                  {@const assignedDetail = buildResolvedUnitDetail(
                    `rift-assigned:${rift.id}:${troop.id}`,
                    troopDef.label,
                    troop.factionId,
                    troop.unitTypeId,
                    troopDef.stats,
                    troopDef.quantity,
                    'Assigned to this Rift',
                    troopDef.abilities,
                    troopDef.statBreakdowns,
                  )}
                  <button
                    class="unit-tile assigned-summary-tile"
                    class:selected={selectedTroopId === troop.id || activeDetail?.detailKey === assignedDetail.detailKey}
                    on:mouseenter={() => previewDetail(assignedDetail)}
                    on:focus={() => previewDetail(assignedDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => {
                      selectTroopForRift(troop.id);
                      togglePinnedDetail(assignedDetail);
                    }}
                  >
                    <img class="unit-tile-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden="true" />
                    <small>Assigned</small>
                  </button>
                {/each}
              </div>

              {#if selectedTroop}
                <button class="primary" on:click|stopPropagation={() => gameStore.assignTroopToRift(selectedTroop.id, rift.id)}>
                  {selectedTroop.assignmentRiftId === rift.id ? 'Unassign Selected Troop' : 'Assign Selected Troop'}
                </button>
              {/if}
            </article>
          {/each}
        </div>
      {:else}
        <div class="faction-grid troop-faction-grid">
          {#each factionRosterIds as factionId}
            {@const faction = getFaction(factionId)}
            {@const factionDetail = buildFactionDetail(factionId)}
            {@const factionUpgradeIds = $gameStore.game.factionUpgradeIds.filter((upgradeId) => FACTION_UPGRADES[upgradeId]?.factionId === factionId)}
            <section class="faction-card panel">
              <header>
                <button class="title-button faction-name-button" on:click={() => selectFaction(factionId)}>
                  <span>{faction.label}</span>
                  <img
                    class="faction-name-art"
                    src={getFactionPortrait(factionId)}
                    alt=""
                    aria-hidden="true"
                    on:mouseenter={() => previewDetail(factionDetail)}
                    on:focus={() => previewDetail(factionDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                  />
                </button>
                <small>{faction.description}</small>
              </header>

              <div class="troop-list">
                {#each getFactionTroops($gameStore.game, factionId) as troop}
                  {@const troopDef = getTroopEffectiveDefinition($gameStore.game, troop.id)}
                  {@const troopDetail = buildResolvedUnitDetail(
                    `troop:${troop.id}`,
                    troopDef.label,
                    troop.factionId,
                    troop.unitTypeId,
                    troopDef.stats,
                    troopDef.quantity,
                    troop.assignmentRiftId
                      ? `Assigned to ${troop.assignmentRiftId}`
                      : troop.recoveryCyclesRemaining > 0
                        ? `Recovering ${troop.recoveryCyclesRemaining}`
                        : 'Ready',
                    troopDef.abilities,
                    troopDef.statBreakdowns,
                  )}
                  <button
                    class="troop-chip"
                    class:selected={selectedTroopId === troop.id}
                    on:click={() => selectTroop(troop.id)}
                    on:mouseenter={() => previewDetail(troopDetail)}
                    on:focus={() => previewDetail(troopDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                  >
                    <span class="unit-button-copy">
                      <img class="unit-button-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden="true" />
                      <span>{troopDef.label}</span>
                    </span>
                    <small>
                      {troop.assignmentRiftId
                        ? 'Assigned'
                        : troop.recoveryCyclesRemaining > 0
                          ? `Recovering ${troop.recoveryCyclesRemaining}`
                          : `Qty ${troopDef.quantity}`}
                    </small>
                  </button>
                {/each}
              </div>

              {#if factionUpgradeIds.length > 0}
                <div class="unlock-row">
                  {#each factionUpgradeIds as upgradeId}
                    <button
                      class="list-button"
                      on:mouseenter={() => previewDetail(buildUpgradeDetail(upgradeId))}
                      on:focus={() => previewDetail(buildUpgradeDetail(upgradeId))}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(buildUpgradeDetail(upgradeId))}
                    >
                      <span>{getUpgradeDetails(upgradeId).label}</span>
                      <small>Faction upgrade</small>
                    </button>
                  {/each}
                </div>
              {/if}
            </section>
          {/each}
        </div>
      {/if}
    </section>

    <section class="right-column">
      {#if $gameStore.systemMessage}
        <div class="panel warning-panel">
          <p class="eyebrow">System Message</p>
          <h2>System Notice</h2>
          <p>{$gameStore.systemMessage}</p>
          <button on:click={() => gameStore.clearSystemMessage()}>Dismiss</button>
        </div>
      {/if}

      {#if $gameStore.validationMessages.length > 0}
        <div class="panel warning-panel">
          <p class="eyebrow">Cycle Blocked</p>
          <h2>Can't End Cycle Yet</h2>
          <ul class="warnings">
            {#each $gameStore.validationMessages as message}
              <li>{message}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if $gameStore.centerMode === 'troops'}
        <div class="panel">
          <p class="eyebrow">Essence Draft</p>
          <h2>Unlocks</h2>
          <p>Spend one Essence to reveal a troop or upgrade pack, then claim one option from it. Native faction troops can appear normally; unusual pairings are added to the draft pool when you win Rifts that contain them.</p>

          <div class="actions-grid">
            <button class="primary" disabled={$gameStore.game.essence < 1 || !!$gameStore.game.activeTroopOffer || unownedTroopUnlockIds.length === 0} on:click={() => gameStore.revealTroopOffer()}>
              Unlock Troop
            </button>
            <button class="primary" disabled={$gameStore.game.essence < 1 || !!$gameStore.game.activeUpgradeOffer || unownedUpgradeIds.length === 0} on:click={() => gameStore.revealUpgradeOffer()}>
              Unlock Upgrade
            </button>
          </div>

          {#if $gameStore.game.activeTroopOffer}
            <div class="draft-offer-block">
              <span class="assignment-label">Troop Choices</span>
              <div class="option-list">
                {#each $gameStore.game.activeTroopOffer.optionTroopUnlockIds as troopUnlockId}
                  {@const [factionId, unitTypeId] = parseTroopUnlockId(troopUnlockId)}
                  {@const troopDef = TROOP_CATALOG[troopUnlockId]}
                  {@const troopDetail = buildResolvedUnitDetail(
                    `offer:${troopUnlockId}`,
                    troopDef.label,
                    factionId,
                    unitTypeId,
                    troopDef.stats,
                    troopDef.quantity,
                    'Draftable troop unlock.',
                    troopDef.abilities,
                  )}
                  <button
                    class="draft-option"
                    on:mouseenter={() => previewDetail(troopDetail)}
                    on:focus={() => previewDetail(troopDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => gameStore.claimTroopOffer(troopUnlockId)}
                  >
                    <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden="true" />
                    <span>{describeTroopUnlock(troopUnlockId)}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          {#if $gameStore.game.activeUpgradeOffer}
            <div class="draft-offer-block">
              <span class="assignment-label">Upgrade Choices</span>
              <div class="unlock-row">
                {#each $gameStore.game.activeUpgradeOffer.optionUpgradeIds as upgradeId}
                  <button
                    class="list-button"
                    on:mouseenter={() => previewDetail(buildUpgradeDetail(upgradeId))}
                    on:focus={() => previewDetail(buildUpgradeDetail(upgradeId))}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => gameStore.claimUpgradeOffer(upgradeId)}
                  >
                    <span>{getUpgradeDetails(upgradeId).label}</span>
                    <small>{getUpgradeDetails(upgradeId).bucket}</small>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <div class="compact-list">
            <div>
              <span>Owned Upgrades</span>
              <strong>{ownedUpgradeIds.length}</strong>
            </div>
            <div>
              <span>Unclaimed Essence</span>
              <strong>{formatFixed($gameStore.game.essence)}</strong>
            </div>
          </div>

          {#if ownedUpgradeIds.length > 0}
            <div class="unlock-row">
              {#each ownedUpgradeIds as upgradeId}
                <button
                  class="list-button"
                  on:mouseenter={() => previewDetail(buildUpgradeDetail(upgradeId))}
                  on:focus={() => previewDetail(buildUpgradeDetail(upgradeId))}
                  on:mouseleave={clearDetail}
                  on:blur={clearDetail}
                  on:click={() => togglePinnedDetail(buildUpgradeDetail(upgradeId))}
                >
                  <span>{getUpgradeDetails(upgradeId).label}</span>
                  <small>{getUpgradeDetails(upgradeId).bucket}</small>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if false && activeDetail && $gameStore.centerMode !== 'troops'}
        <div class="panel detail-panel" role="presentation" on:mouseleave={clearDetail}>
          <p class="eyebrow">
            {activeDetail.kind === 'mutator'
              ? 'Mutator Effect'
              : activeDetail.kind === 'faction'
                ? 'Faction Modifiers'
                : activeDetail.kind === 'upgrade'
                  ? 'Upgrade Preview'
                  : 'Unit Inspect'}
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
      {/if}

      {#if $gameStore.centerMode === 'rifts' && selectedReplayEntry}
        <div class="panel">
          <p class="eyebrow">Battle Archive</p>
          <h2>{selectedReplayEntry.summary}</h2>
          <p>Cycle {selectedReplayEntry.cycleNumber} {selectedReplayEntry.outcome}.</p>
          <div class="ability-row">
            <span>Mutators</span>
            <div class="ability-list">
              {#if selectedReplayEntry.mutatorIds.length === 0}
                <span class="mutator-chip empty">None</span>
              {:else}
                {#each selectedReplayEntry.mutatorIds as mutatorId}
                  <span class="mutator-chip">{getMutator(mutatorId).label}</span>
                {/each}
              {/if}
            </div>
          </div>
          <div class="compact-list">
            <div>
              <span>Troops Sent</span>
              <strong>{selectedReplayEntry.playerTroopLabels.join(', ') || 'Unknown troop'}</strong>
            </div>
            <div>
              <span>Replay Status</span>
              <strong>{selectedReplayEntry.summaryOnly ? 'Summary only' : selectedReplayAvailable ? 'Replay available' : 'Replay missing'}</strong>
            </div>
          </div>
          <p>
            {#if selectedReplayEntry.summaryOnly}
              This battle was archived as a summary only.
            {:else if selectedReplayAvailable}
              Open the replay to inspect the full battle log and outcome.
            {:else}
              The archive entry exists, but the replay payload is missing.
            {/if}
          </p>
        </div>
      {/if}

      {#if $gameStore.centerMode === 'rifts' && !selectedReplayEntry}
        <div class="panel">
          <h2>Battle Archive</h2>
          {#if $gameStore.game.replayIndex.length === 0}
            <p>No archived battles yet.</p>
          {:else}
            <div class="archive-list">
              {#each $gameStore.game.replayIndex as replayEntry}
                <button class="archive-card" class:selected={selectedReplayId === replayEntry.replayId} on:click={() => selectReplay(replayEntry.replayId)}>
                  <strong>{replayEntry.summary}</strong>
                  <small>Cycle {replayEntry.cycleNumber} | {replayEntry.mutatorIds.map((id) => getMutator(id).label).join(', ') || 'No mutators'}</small>
                  <small>{replayEntry.summaryOnly ? 'Summary only' : 'Replay available'}</small>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </section>

    <footer class="action-rail">
      {#if $gameStore.centerMode === 'rifts' && selectedReplayEntry}
        <button class="large" on:click={() => (selectedReplayId = null)}>Back to Archive</button>
        <button class="primary large" on:click={openSelectedReplay} disabled={!selectedReplayAvailable}>
          {selectedReplayAvailable ? 'Watch Battle' : selectedReplayEntry.summaryOnly ? 'Summary Only' : 'Replay Missing'}
        </button>
      {:else}
        {#if $gameStore.centerMode === 'rifts'}
          <div class="panel ready-troops-panel footer-ready-troops-panel">
            <div class="ready-troops-header">
              <h2>Ready Troops</h2>
              {#if selectedTroop && selectedTroopDefinition}
                <p class="ready-troops-summary">
                  Selected: <strong>{selectedTroopDefinition.label}</strong>
                </p>
              {/if}
            </div>

            {#if readyTroops.length === 0}
              <p class="assignment-empty">No idle troops are ready right now.</p>
            {:else}
              <div class="ready-troops-grid">
                {#each readyTroops as troop}
                  {@const troopDef = getTroopEffectiveDefinition($gameStore.game, troop.id)}
                  {@const troopDetail = buildResolvedUnitDetail(
                    `ready:${troop.id}`,
                    troopDef.label,
                    troop.factionId,
                    troop.unitTypeId,
                    troopDef.stats,
                    troopDef.quantity,
                    'Ready troop',
                    troopDef.abilities,
                    troopDef.statBreakdowns,
                  )}
                  <button
                    class="unit-tile ready-troop-tile"
                    class:selected={selectedTroopId === troop.id || activeDetail?.detailKey === troopDetail.detailKey}
                    on:mouseenter={() => previewDetail(troopDetail)}
                    on:focus={() => previewDetail(troopDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => {
                      selectTroopForRift(troop.id);
                      togglePinnedDetail(troopDetail);
                    }}
                  >
                    <span class="unit-button-copy">
                      <img class="unit-tile-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden="true" />
                      <span>{troopDef.label}</span>
                    </span>
                    <small>Qty {troopDef.quantity}</small>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        <button class="primary large" on:click={handleEndCycle}>
          {$gameStore.cycleEndConfirmationPending ? 'Confirm End Cycle' : 'End Cycle'}
        </button>
      {/if}
    </footer>

    {#if $gameStore.game.phase === 'game_over'}
      <div class="unlock-faction-overlay" role="presentation">
        <div class="unlock-faction-dialog panel" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
          <div class="unlock-faction-dialog-header">
            <div>
              <p class="eyebrow">Cycle 10 reached</p>
              <h2 id="game-over-title">Game officially over!</h2>
            </div>
          </div>

          <p class="unlock-faction-dialog-copy">You finished the scored run with {$gameStore.game.victoryPoints} VP.</p>

          <div class="actions-grid">
            <button class="primary" on:click={() => gameStore.continuePlaying()}>Continue playing</button>
            <button on:click={() => gameStore.returnToMainMenu()}>Back to menu</button>
          </div>
        </div>
      </div>
    {/if}
  </main>
{:else}
  <main class="replay-shell">
    <section class="left replay-left">
      <div class="replay-header">
        <p class="replay-name">{replay?.riftId ?? 'Debug Battle'}</p>
        <div class="replay-mutators">
          {#if (replay?.mutatorIds.length ?? 0) === 0}
            <span class="mutator-chip empty">No mutators</span>
          {:else}
            {#each replay?.mutatorIds ?? [] as mutatorId}
              <button
                class="mutator-chip"
                on:mouseenter={() => showMutatorDetail(mutatorId)}
                on:focus={() => showMutatorDetail(mutatorId)}
                on:mouseleave={clearDetail}
                on:blur={clearDetail}
              >
                {getMutator(mutatorId).label}
              </button>
            {/each}
          {/if}
        </div>

        <div class="replay-actions replay-header-actions">
          <button class="replay-exit-button" on:click={() => gameStore.closeReplay()}>Return to Overworld</button>
          <button class="replay-exit-button replay-recap-button" on:click={toggleReplayRecap}>
            {replayRecapOpen ? 'Close Battle Recap' : 'Open Battle Recap'}
          </button>
        </div>
      </div>

      <BattleControls
        replayLength={replay?.steps.length ?? 0}
        currentStep={$gameStore.currentStep}
        autoPlay={$gameStore.autoPlay}
        speedMs={$gameStore.speedMs}
        onJumpStart={() => gameStore.jumpTo(-1)}
        onStepBack={() => gameStore.stepBackward()}
        onStepForward={() => gameStore.stepForward()}
        onToggleAuto={() => gameStore.setAutoPlay(!$gameStore.autoPlay)}
        onSetSpeed={(speedMs) => gameStore.setSpeedMs(speedMs)}
      />

      <section class="panel focus-panel">
        {#if activeDetail}
          <div class="detail-panel replay-detail-panel">
            <p class="eyebrow">{activeDetail.kind === 'mutator' ? 'Mutator Effect' : activeDetail.kind === 'upgrade' ? 'Upgrade Preview' : 'Battle Detail'}</p>
            <h2>{activeDetail.label}</h2>
            <p>{activeDetail.description}</p>
          </div>
        {:else if replayFocusProfile}
          <UnitTooltip
            unit={inspectedUnit}
            profile={replayFocusProfile}
            engagedUnits={engagedUnits}
            x={hoverInfo?.x ?? 0}
            y={hoverInfo?.y ?? 0}
            locked={!!lockedUnitId}
            docked={true}
          />
        {:else}
          <div class="focus-empty">
            <p class="eyebrow">Unit Focus</p>
            <h2>Battle Reference</h2>
            <p>Hover a mutator, field unit, or alive-count row to inspect it without leaving the replay.</p>
          </div>
        {/if}
      </section>
    </section>

    <section class="center replay-center">
      <div class="viewport-shell">
        <div class="replay-zoom-controls" aria-label="Replay zoom controls">
          <button class="replay-zoom-button" type="button" aria-label="Zoom In" title="Zoom In" on:click={zoomReplayIn}>+</button>
          <button class="replay-zoom-button" type="button" aria-label="Zoom Out" title="Zoom Out" on:click={zoomReplayOut}>-</button>
          <button class="replay-reset-button" type="button" aria-label="Reset Zoom" title="Reset Zoom" on:click={resetReplayZoom}>Reset Zoom</button>
        </div>
        <div class="viewport" bind:this={battleHost}></div>
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
                    <div class="alive-unit-card" class:selected={selectedReplayProfileKey === replayProfileKey('player', label)}>
                      <button
                        type="button"
                        class="alive-unit-main"
                        on:click={() => selectReplayProfile('player', label)}
                        on:mouseenter={() => previewReplayProfile('player', label)}
                        on:focus={() => previewReplayProfile('player', label)}
                        on:mouseleave={clearReplayProfilePreview}
                        on:blur={clearReplayProfilePreview}
                      >
                        <span>{label}</span>
                        <strong>{count}</strong>
                      </button>
                      <button type="button" class="alive-cycle-button" aria-label={`Cycle ${label} units`} on:click={() => cycleReplayProfileUnit('player', label)}>
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
                    <div class="alive-unit-card" class:selected={selectedReplayProfileKey === replayProfileKey('enemy', label)}>
                      <button
                        type="button"
                        class="alive-unit-main"
                        on:click={() => selectReplayProfile('enemy', label)}
                        on:mouseenter={() => previewReplayProfile('enemy', label)}
                        on:focus={() => previewReplayProfile('enemy', label)}
                        on:mouseleave={clearReplayProfilePreview}
                        on:blur={clearReplayProfilePreview}
                      >
                        <span>{label}</span>
                        <strong>{count}</strong>
                      </button>
                      <button type="button" class="alive-cycle-button" aria-label={`Cycle ${label} units`} on:click={() => cycleReplayProfileUnit('enemy', label)}>
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
              steps={replay?.steps ?? []}
              selected={$gameStore.selectedEvent}
              currentStep={$gameStore.currentStep}
              showTitle={false}
              onSelect={selectReplayEvent}
            />
          </div>
        {/if}
      </section>
    </section>

    {#if replayRecapOpen}
      <div class="replay-recap-backdrop">
        <button class="replay-recap-dismiss" type="button" aria-label="Close battle recap" on:click={toggleReplayRecap}></button>
        <section class="panel replay-recap-modal" role="dialog" aria-modal="true" aria-labelledby="battle-recap-title">
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
                            <img class="replay-recap-art" src={getFactionUnitPortrait(troopProfile.factionId, troopProfile.unitTypeId)} alt="" aria-hidden="true" />
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
                              <button type="button" class="replay-recap-row unit" on:click={() => selectReplayRecapUnit(unit.unitId, troop.side, troop.troopLabel)}>
                                {#if troopProfile}
                                  <img class="replay-recap-art small" src={getFactionUnitPortrait(troopProfile.factionId, troopProfile.unitTypeId)} alt="" aria-hidden="true" />
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
{/if}

<style>
  :global(body) {
    overflow: auto;
    color: #f4f7fb;
    background:
      radial-gradient(circle at top left, rgba(25, 48, 71, 0.28), transparent 25%),
      radial-gradient(circle at bottom right, rgba(118, 56, 35, 0.22), transparent 28%),
      linear-gradient(180deg, #060a11, #0a1018 58%, #0d121a);
  }

  button {
    cursor: pointer;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  .eyebrow {
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ui-color-accent);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .shell,
  .replay-shell {
    min-height: 100vh;
    width: min(calc(var(--ui-shell-max-width) + (2 * var(--ui-shell-column)) + (2 * var(--ui-space-md))), 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: var(--ui-shell-column) minmax(0, 1fr) var(--ui-shell-column);
    grid-template-rows: auto 1fr auto;
    gap: var(--ui-space-md);
    padding: var(--ui-space-md);
  }

  .overworld-shell,
  .opening-shell {
    height: 100dvh;
    overflow: hidden;
  }

  .overworld-shell {
    width: min(1240px, 100%);
    grid-template-columns: minmax(264px, 282px) minmax(0, 1.18fr) minmax(264px, 282px);
    gap: 0.75rem;
    padding-block: 0.75rem;
  }

  .topbar {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1.2fr 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.8rem 1rem;
    border: 1px solid rgba(165, 191, 210, 0.18);
    border-radius: var(--ui-panel-radius);
    background:
      linear-gradient(135deg, rgba(17, 29, 41, 0.92), rgba(16, 21, 30, 0.94)),
      radial-gradient(circle at top left, rgba(190, 147, 92, 0.14), transparent 48%);
    box-shadow: var(--ui-shadow-panel);
  }

  .topbar > div:first-child {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-xs);
  }

  .topbar h1 {
    font-size: clamp(1.55rem, 1.8vw, 1.9rem);
    line-height: 1.05;
  }

  .resource-strip {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .resource-strip div,
  .compact-list div {
    display: grid;
    gap: 0.15rem;
    padding: var(--ui-space-sm);
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-soft);
  }

  .resource-strip span,
  .compact-list span,
  .slot-meta span,
  .draft-section-label,
  .assignment-label {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .resource-strip strong,
  .compact-list strong,
  .troop-chip small,
  .archive-card small,
  .list-button small {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .resource-essence strong {
    color: var(--ui-color-essence);
  }

  .resource-icon {
    display: inline-block;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
  }

  .resource-icon.essence {
    background: radial-gradient(circle at 30% 30%, #fff2ff, #c99bff 45%, #683f93 100%);
    box-shadow: 0 0 10px rgba(201, 155, 255, 0.55);
  }

  .mode-toggle,
  .actions-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-sm);
  }

  .mode-toggle button,
  .primary,
  .actions-grid button,
  .unlock-row button,
  .archive-card,
  .troop-chip,
  .list-button,
  .title-button,
  .draft-option,
  .slot-card button,
  .draft-troop-icon,
  .sprite-inspect-button {
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-interactive);
    color: var(--ui-color-text);
    padding: var(--ui-space-sm);
    font: inherit;
  }

  .mode-toggle button.selected,
  .primary {
    background: linear-gradient(135deg, var(--ui-color-accent-strong), var(--ui-color-accent-deep));
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
    gap: 0.75rem;
    align-content: start;
    overflow: auto;
    padding-right: 0.2rem;
  }

  .panel,
  .menu-panel,
  .draft-panel {
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

  .opening-shell {
    width: min(1240px, 100%);
  }

  .rift-grid,
  .faction-grid,
  .slot-grid,
  .draft-grid {
    display: grid;
    gap: var(--ui-space-md);
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .draft-grid {
    min-height: 0;
    overflow: auto;
    align-content: start;
    padding-right: 0.2rem;
  }

  .slot-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .archive-list,
  .troop-list,
  .unlock-row,
  .assigned-strip,
  .assignment-list,
  .mutator-list,
  .ability-list,
  .option-list,
  .enemy-list {
    display: grid;
    gap: var(--ui-space-sm);
  }

  .assigned-strip,
  .assignment-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .enemy-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ability-list {
    display: flex;
    flex-wrap: wrap;
  }

  .option-list {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .archive-card,
  .troop-chip,
  .title-button,
  .list-button,
  .draft-option {
    text-align: left;
  }

  .archive-card,
  .troop-chip,
  .list-button,
  .draft-option,
  .draft-troop-icon,
  .unit-tile {
    transition:
      transform 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .archive-card:hover,
  .troop-chip:hover,
  .list-button:hover,
  .draft-option:hover,
  .draft-troop-icon:hover,
  .unit-tile:hover,
  .sprite-inspect-button:hover,
  .mutator-chip:hover {
    transform: translateY(-1px);
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .archive-card.selected,
  .troop-chip.selected,
  .list-button.selected,
  .sprite-inspect-button.selected,
  .unit-tile.selected,
  .rift-card.selected {
    background:
      linear-gradient(145deg, rgba(44, 31, 15, 0.96), rgba(17, 22, 30, 0.96)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.18), transparent 42%);
    box-shadow:
      inset 0 0 0 2px #d4ad73,
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .mutator-chip {
    border: 1px solid rgba(124, 153, 176, 0.2);
    border-radius: 999px;
    padding: 0.3rem 0.6rem;
    background: rgba(20, 28, 38, 0.76);
    color: inherit;
    font: inherit;
  }

  .mutator-chip.empty {
    color: #95a9ba;
  }

  .rift-meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .rift-meta-row {
    align-items: center;
  }

  .reward-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.55rem;
    border-radius: 999px;
    border: 1px solid rgba(124, 153, 176, 0.18);
    background: rgba(20, 28, 38, 0.72);
    color: #dce7f2;
    font-size: 0.78rem;
  }

  .rift-card,
  .faction-card,
  .slot-card,
  .draft-card {
    display: grid;
    gap: var(--ui-space-sm);
    align-content: start;
  }

  .rift-card {
    padding: 0.75rem;
    border-radius: 20px;
    border: 1px solid rgba(126, 157, 181, 0.16);
    background:
      linear-gradient(160deg, rgba(18, 27, 38, 0.94), rgba(10, 15, 24, 0.94)),
      radial-gradient(circle at top right, rgba(95, 135, 170, 0.12), transparent 35%);
  }

  .title-button {
    width: 100%;
  }

  .rift-title-card {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.65rem;
    align-items: center;
  }

  .rift-title-card header {
    display: grid;
    gap: 0.2rem;
  }

  .rift-title-card header strong {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.45rem;
  }

  .rift-title-card header span {
    color: #9db2c4;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .rift-visual-shell {
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 18px;
    background:
      radial-gradient(circle at center, var(--rift-glow), transparent 60%),
      linear-gradient(180deg, rgba(13, 22, 31, 0.92), rgba(8, 12, 18, 0.98));
  }

  .rift-visual-shell::before {
    content: '';
    position: absolute;
    inset: 10%;
    border-radius: 50%;
    filter: blur(18px);
    background: radial-gradient(circle, var(--rift-tint), transparent 68%);
    opacity: 0.46;
    pointer-events: none;
  }

  .rift-visual-frame {
    position: relative;
    z-index: 1;
    display: grid;
    width: min(100%, 11rem);
    height: min(100%, 11rem);
    place-items: center;
    color: var(--rift-tint);
    transform: rotate(var(--rift-rotation));
  }

  .rift-visual-image {
    width: 72%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .rift-visual-shell.inline {
    width: 4.1rem;
    height: 4.1rem;
    min-height: 4.1rem;
    border-radius: 14px;
  }

  .rift-title-card.featured .rift-visual-shell.inline {
    width: 5rem;
    height: 5rem;
    min-height: 5rem;
  }

  .unit-tile,
  .troop-chip,
  .draft-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
  }

  .unit-tile {
    padding: 0.45rem;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: 14px;
    background: rgba(22, 31, 42, 0.82);
    color: inherit;
  }

  .unit-tile.assigned {
    border-color: rgba(96, 190, 114, 0.6);
    box-shadow: inset 0 0 0 1px rgba(96, 190, 114, 0.24);
  }

  .enemy-tile {
    justify-content: center;
  }

  .unit-tile-art,
  .unit-button-art,
  .hover-unit-art,
  .faction-name-art {
    image-rendering: pixelated;
    object-fit: contain;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }

  .unit-tile-art,
  .unit-button-art {
    width: 2.2rem;
    height: 2.2rem;
    flex: 0 0 auto;
  }

  .hover-unit-art {
    width: 4rem;
    height: 4rem;
  }

  .faction-name-art {
    width: 2.6rem;
    height: 2.6rem;
  }

  .faction-name-button,
  .draft-card-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
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

  .assignment-empty,
  .intro,
  .warning-panel p,
  .slot-card p,
  .draft-card small,
  .faction-card small,
  .detail-panel p,
  .archive-card small,
  .replay-header p {
    color: #a7b8c8;
  }

  .ability-row,
  .mutator-row,
  .assignment-panel,
  .draft-offer-block {
    display: grid;
    gap: 0.45rem;
  }

  .rift-card-section,
  .ready-troops-header {
    display: grid;
    gap: 0.35rem;
  }

  .ready-troops-summary {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .ready-troops-summary strong {
    color: var(--ui-color-text);
  }

  .assignment-panel,
  .warning-panel,
  .draft-offer-block {
    padding-top: var(--ui-space-xs);
  }

  .ability-hover-tooltip {
    display: grid;
    gap: 0.3rem;
    padding: 0.7rem 0.8rem;
    border-radius: 14px;
    border: 1px solid rgba(124, 153, 176, 0.18);
    background: rgba(12, 18, 28, 0.96);
  }

  .hover-unit-detail {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    align-items: center;
  }

  .warning-panel {
    background:
      linear-gradient(160deg, rgba(46, 25, 23, 0.96), rgba(17, 14, 18, 0.96)),
      radial-gradient(circle at top right, rgba(170, 95, 95, 0.18), transparent 36%);
  }

  .warnings {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.35rem;
  }

  .action-rail {
    grid-column: 1 / -1;
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    padding-bottom: 0.4rem;
  }

  .large {
    min-width: 220px;
    padding: 0.9rem 1.2rem;
    font-size: 1rem;
  }

  .menu-screen,
  .draft-screen {
    min-height: 100vh;
    display: grid;
    justify-items: center;
    align-items: start;
    padding: var(--ui-space-md);
  }

  .menu-panel,
  .draft-panel {
    width: min(calc(var(--ui-shell-max-width) + (2 * var(--ui-shell-column))), 100%);
  }

  .menu-copy,
  .slot-card,
  .draft-layout,
  .draft-focus-panel,
  .detail-panel,
  .replay-left,
  .replay-right,
  .replay-center {
    display: grid;
    gap: var(--ui-space-sm);
    align-content: start;
  }

  .menu-panel {
    max-width: 980px;
  }

  .menu-copy {
    grid-template-columns: minmax(0, 1fr);
    max-width: 36rem;
  }

  .menu-copy h1 {
    font-size: clamp(2rem, 3vw, var(--ui-text-display));
    line-height: var(--ui-line-display);
  }

  .intro {
    max-width: 28rem;
  }

  .slot-card {
    min-height: 0;
    padding: var(--ui-space-sm);
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

  .slot-meta span:last-child {
    grid-column: 1 / -1;
  }

  .slot-card .actions-grid {
    gap: var(--ui-space-sm);
  }

  .slot-card .actions-grid button {
    min-height: var(--ui-space-hit);
  }

  .draft-layout {
    min-height: 0;
    grid-template-columns: minmax(264px, 288px) minmax(0, 1fr);
    align-items: start;
    gap: 0.75rem;
  }

  .draft-section {
    display: grid;
    gap: 0.55rem;
  }

  .draft-focus-panel {
    min-height: 0;
    max-height: none;
    overflow: auto;
  }

  .draft-icon-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: var(--ui-space-sm);
  }

  .draft-troop-icon {
    display: grid;
    justify-items: center;
    gap: var(--ui-space-xs);
    text-align: center;
    padding: var(--ui-space-sm);
  }

  .sprite-inspect-button {
    display: grid;
    place-items: center;
    padding: 0.35rem;
  }

  .draft-grid {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }

  .draft-card-header,
  .faction-card > header {
    display: grid;
    gap: var(--ui-space-xs);
  }

  .left-column,
  .right-column {
    grid-auto-rows: min-content;
  }

  .center-column {
    min-width: 0;
    grid-auto-rows: min-content;
    align-content: start;
  }

  .overworld-detail-panel,
  .opening-detail-panel {
    min-height: 0;
    align-content: start;
    overflow: auto;
  }

  .compact-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .detail-panel {
    min-height: 0;
  }

  .opening-detail-panel {
    gap: 0.65rem;
  }

  .opening-detail-panel h2,
  .overworld-detail-panel h2 {
    line-height: 1.08;
  }

  .opening-detail-panel .ability-list,
  .overworld-detail-panel .ability-list {
    max-height: 8rem;
    overflow: auto;
    padding-right: 0.15rem;
  }

  .warning-panel {
    gap: var(--ui-space-sm);
  }

  .archive-list {
    max-height: min(20rem, 42vh);
    overflow: auto;
    padding-right: var(--ui-space-xs);
  }

  .assignment-panel .assignment-list {
    gap: var(--ui-space-xs);
  }

  .enemy-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
  }

  .enemy-strip .unit-tile {
    gap: 0.4rem;
    justify-content: center;
    padding: 0.4rem 0.3rem;
  }

  .enemy-strip .unit-tile-art {
    width: 1.8rem;
    height: 1.8rem;
  }

  .enemy-strip strong {
    font-size: 0.88rem;
  }

  .rift-mutator-chip {
    flex: 1 1 8.5rem;
    justify-content: center;
    text-align: center;
  }

  .ready-troops-panel {
    gap: 0.55rem;
    padding-block: 0.9rem;
  }

  .footer-ready-troops-panel {
    width: min(620px, 100%);
    justify-self: center;
  }

  .ready-troops-grid {
    display: grid;
    gap: 0.55rem;
    grid-auto-flow: column;
    grid-auto-columns: minmax(180px, 220px);
    overflow-x: auto;
    padding-bottom: 0.15rem;
  }

  .ready-troop-tile {
    padding: 0.55rem 0.7rem;
  }

  .faction-grid {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }

  .troop-faction-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.65rem;
  }

  .rift-grid {
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  }

  .rift-card {
    padding: var(--ui-space-sm);
  }

  .faction-card {
    padding: var(--ui-space-sm);
  }

  .troops-mode .faction-card {
    gap: 0.55rem;
    padding: 0.7rem;
  }

  .faction-name-button {
    width: 100%;
  }

  .troop-chip,
  .draft-option {
    padding: var(--ui-space-sm);
  }

  .troops-mode .troop-list,
  .troops-mode .unlock-row,
  .troops-mode .assignment-list {
    gap: 0.45rem;
  }

  .troops-mode .troop-list {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .troops-mode .faction-card {
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
  }

  .troops-mode .troop-chip,
  .troops-mode .list-button {
    padding: 0.55rem 0.65rem;
  }

  .troops-mode .troop-chip small,
  .troops-mode .list-button small,
  .opening-detail-panel p,
  .overworld-detail-panel p {
    line-height: 1.35;
  }

  .unlock-faction-overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--ui-space-md);
    background: rgba(4, 7, 12, 0.72);
    backdrop-filter: blur(10px);
    z-index: 20;
  }

  .unlock-faction-dialog {
    width: min(480px, 100%);
  }

  .unlock-faction-dialog-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: start;
  }

  .unlock-faction-dialog-copy {
    color: #c7d3df;
  }

  .draft-focus-empty {
    max-width: 80ch;
  }

  .replay-shell {
    min-height: 100dvh;
    height: 100dvh;
    grid-template-columns: var(--ui-replay-left-width) minmax(0, 1fr) var(--ui-replay-right-width);
    grid-template-rows: minmax(0, 1fr);
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
    gap: 0.65rem;
    overflow: hidden;
  }

  .replay-right {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.65rem;
    overflow: hidden;
  }

  .replay-header {
    display: grid;
    gap: 0.55rem;
    align-content: start;
    padding: 0.1rem 0;
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
    gap: var(--ui-space-xs);
  }

  .replay-center {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }

  .viewport-shell,
  .viewport {
    min-height: 0;
    width: 100%;
    height: 100%;
  }

  .viewport-shell {
    display: grid;
    position: relative;
    min-height: clamp(340px, 50vh, 560px);
    border-radius: var(--ui-panel-radius);
    overflow: hidden;
    background:
      radial-gradient(circle at top left, rgba(41, 73, 104, 0.34), transparent 28%),
      linear-gradient(180deg, rgba(10, 15, 24, 0.98), rgba(5, 8, 13, 0.98));
  }

  .viewport {
    display: block;
    width: 100%;
    height: 100%;
    min-height: clamp(340px, 50vh, 560px);
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: calc(var(--ui-panel-radius) + var(--ui-space-sm));
    background:
      radial-gradient(circle at 50% 20%, rgba(46, 70, 89, 0.9), transparent 42%),
      linear-gradient(180deg, #10202c, #08101a 62%, #06090f);
    box-shadow: inset 0 0 0 1px rgba(201, 171, 124, 0.06);
  }

  .focus-panel {
    min-height: 0;
    align-content: start;
    overflow: auto;
  }

  .focus-empty,
  .replay-detail-panel {
    display: grid;
    gap: 0.55rem;
    align-content: start;
  }

  .panel-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-sm);
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
    gap: 0.65rem;
  }

  .event-log-toggle {
    padding: 0.65rem 0.75rem;
  }

  .collapsible-stack {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.65rem;
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

  .count-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.55rem;
  }

  .alive-sides {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-sm);
  }

  .alive-sides.compact {
    gap: var(--ui-space-sm);
  }

  .alive-side {
    display: grid;
    gap: var(--ui-space-sm);
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
    gap: var(--ui-space-sm);
    width: 100%;
    padding: var(--ui-space-sm);
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-soft);
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
    width: var(--ui-space-hit);
    height: var(--ui-space-hit);
    display: grid;
    place-items: center;
    border: 1px solid rgba(196, 214, 227, 0.18);
    border-radius: var(--ui-panel-radius-pill);
    background: rgba(12, 18, 28, 0.48);
    color: rgba(238, 245, 250, 0.9);
    font-size: 1rem;
    line-height: 1;
  }

  .replay-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .replay-header-actions {
    justify-content: flex-start;
  }

  .replay-exit-button {
    min-width: 0;
    min-height: 2.1rem;
    padding: 0.45rem 0.7rem;
    border-radius: var(--ui-panel-radius-pill);
    border: var(--ui-border-strong);
    background: rgba(20, 26, 34, 0.92);
    color: #f4f7fb;
    font: inherit;
    font-size: 0.76rem;
    letter-spacing: 0.04em;
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
    padding: var(--ui-space-md);
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
    width: min(880px, 100%);
    max-height: min(88dvh, 760px);
    overflow: hidden;
    gap: var(--ui-space-sm);
  }

  .replay-recap-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.85rem;
  }

  .replay-recap-header h2 {
    margin: 0.15rem 0 0.25rem;
    font-size: 1.2rem;
  }

  .replay-recap-header p:last-child {
    margin: 0;
    color: #9db2c4;
  }

  .replay-recap-close {
    padding: 0.45rem 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(196, 214, 227, 0.22);
    background: rgba(12, 18, 28, 0.52);
    color: #f4f7fb;
    font: inherit;
  }

  .replay-recap-sides {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-md);
    min-height: 0;
    overflow: auto;
  }

  .replay-recap-side {
    display: grid;
    gap: 0.55rem;
    align-content: start;
    min-height: 0;
  }

  .replay-recap-list,
  .replay-recap-units {
    display: grid;
    gap: 0.4rem;
  }

  .replay-recap-group {
    display: grid;
    gap: 0.4rem;
  }

  .replay-recap-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    padding: 0.55rem 0.65rem;
    border-radius: 14px;
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
    margin-left: 0.75rem;
    width: calc(100% - 0.75rem);
    background: rgba(14, 21, 31, 0.88);
  }

  .replay-recap-main {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  .replay-recap-art {
    width: 2.2rem;
    height: 2.2rem;
    object-fit: contain;
    image-rendering: pixelated;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }

  .replay-recap-art.small {
    width: 1.9rem;
    height: 1.9rem;
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
    gap: 0.45rem;
    color: #d8e1e9;
    font-size: 0.82rem;
  }

  .replay-zoom-controls {
    position: absolute;
    top: 0.45rem;
    right: 0.45rem;
    bottom: auto;
    left: auto;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 0.22rem;
    padding: 0.22rem;
    width: max-content;
    max-width: calc(100% - 0.9rem);
    border-radius: 999px;
    border: 1px solid rgba(126, 157, 181, 0.18);
    background: rgba(7, 11, 18, 0.6);
    backdrop-filter: blur(10px);
  }

  .replay-zoom-button,
  .replay-reset-button {
    min-height: 1.75rem;
    border: 1px solid rgba(124, 153, 176, 0.22);
    background: rgba(15, 23, 35, 0.96);
    color: #f4f7fb;
    font: inherit;
  }

  .replay-zoom-button {
    width: 1.75rem;
    padding: 0;
    border-radius: 999px;
    display: grid;
    place-items: center;
  }

  .replay-reset-button {
    padding: 0 0.55rem;
    border-radius: 999px;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
  }

  .event-log-wrap,
  .alive-sides {
    min-height: 0;
  }

  .alive-sides {
    overflow: auto;
  }

  .replay-recap-empty {
    margin: 0;
    color: #8fa3b5;
  }

  @media (max-width: 1280px) {
    .shell,
    .replay-shell,
    .draft-layout {
      grid-template-columns: 1fr;
    }

    .shell,
    .replay-shell {
      grid-template-rows: auto auto auto auto;
    }

    .topbar {
      grid-template-columns: 1fr;
    }

    .slot-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }

    .resource-strip {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .viewport {
      min-height: 420px;
    }

    .alive-sides,
    .replay-recap-sides {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 820px) {
    .resource-strip,
    .assigned-strip,
    .assignment-list,
    .draft-icon-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .menu-screen,
    .draft-screen,
    .shell,
    .replay-shell {
      padding: 0.75rem;
    }

    .slot-meta,
    .compact-list {
      grid-template-columns: 1fr;
    }
  }
</style>
