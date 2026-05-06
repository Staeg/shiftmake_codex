<svelte:head>
  <title>Shiftmake</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createTroopInstance,
    getFactionTroops,
    getTroopEffectiveDefinition,
    getTroopStatusCounts,
    getTroopsAssignedToRift,
    resolveTroopCombatant,
  } from '../engine/army';
  import { formatFixed } from '../engine/fixed';
  import {
    FACTIONS,
    FACTION_UPGRADES,
    TROOP_CATALOG,
    TROOP_TYPE_UPGRADES,
    getFactionNativeTroopUnlockIds,
    getAbility,
    getFaction,
    getMutator,
    getTroopTypeUpgrade,
    getUnitType,
  } from '../engine/unitCatalog';
  import type {
    AbilityDefinition,
    BattleReportDiagnostic,
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
  import { describeTroopUnlock } from '../engine/upgrades';
  import type { BattleRenderer as BattleRendererType, UnitPointerInfo } from '../rendering/BattleRenderer';
  import { getFactionSpriteUrl, loadFactionUnitPortraitUrls } from '../rendering/unitVisuals';
  import { gameStore } from '../store/gameStore';
  import type { SaveSlotSummary } from '../store/saveSlots';
  import BattleControls from './BattleControls.svelte';
  import DebugToolsMenu from './DebugToolsMenu.svelte';
  import DesignModePanel, { type DesignTweakField, type DesignTweaks } from './DesignModePanel.svelte';
  import EventLog from './EventLog.svelte';
  import { displayIcon, formatAbilityExact, statIcon } from './inspectText';
  import ReplayStepExplanation from './ReplayStepExplanation.svelte';
  import { buildReplayStepExplanationView } from './replayStepExplanation';
  import { getRiftVisual } from './riftVisuals';
  import StatBreakdownGrid from './StatBreakdownGrid.svelte';
  import UnitTooltip from './UnitTooltip.svelte';
  import { buildBattleRecap, findLastAliveStep, isUnitAliveAtStep, type BattleRecapTroopEntry } from './battleRecap';
  import { getEssenceDraftCost, getOpeningFactionOptionIds } from '../engine/game';

  type StatEntry = {
    key: string;
    label: string;
    name?: string;
    description?: string;
    value: string;
    breakdown: StatBreakdown | null;
  };

  type DetailCard =
    | {
        detailKey: string;
        kind: 'mutator' | 'faction' | 'upgrade';
        label: string;
        description: string;
        stats?: StatEntry[];
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

  type TroopDropTarget = { kind: 'rift'; riftId: string } | { kind: 'ready' };

  type TroopDragState = {
    troopId: TroopId;
    sourceRiftId: string | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    x: number;
    y: number;
    active: boolean;
    label: string;
    portraitUrl: string;
    dropTarget: TroopDropTarget | null;
  };

  type ReplayHealthUnit = {
    unit: BattleUnit;
    hpPercent: string;
    hpLabel: string;
    portraitUrl: string;
  };

  type ReplayHealthSide = {
    side: SideId;
    label: string;
    currentHp: number;
    maxHp: number;
    hpPercent: string;
    hpLabel: string;
    unitsMinHeight: string;
    units: ReplayHealthUnit[];
  };

  const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];
  const EXPLAINED_STAT_ORDER: ExplainedStatKey[] = ['health', 'damage', 'speed', 'armor', 'range', 'capacity', 'size'];
  const replayProfileKey = (side: SideId, troopLabel: string): string => `${side}:${troopLabel}`;
  const debugToolsEnabled = import.meta.env.DEV;
  const verificationLabMode =
    debugToolsEnabled && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lab') === 'ability-verification';
  const DESIGN_MODE_STORAGE_KEY = 'shiftmake:design-mode:v1';

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
  let replayEventLogCollapsed = true;
  let replayRecapOpen = false;
  let expandedReplayRecapTroopKey: string | null = null;
  let pinnedReplayExplanationIndex: number | null = null;
  let lastReplayExplanationReplayId: string | null = null;
  let troopDrag: TroopDragState | null = null;
  let suppressTroopClickId: TroopId | null = null;
  let openingFocusedTroopUnlockId: TroopUnlockId | null = null;
  let selectedTroopOfferUnlockId: TroopUnlockId | null = null;
  let lastInspectContextKey = '';
  let rendererDiagnostics: BattleReportDiagnostic[] = [];
  let showUiDebugNames = false;
  let designModeEnabled = false;
  let selectedDesignTargetName: string | null = null;
  let designTweaksByTarget: Record<string, DesignTweaks> = {};
  let uiDebugVisible = false;
  let abilityVerificationLabComponent: typeof import('./AbilityVerificationLab.svelte').default | null = null;

  function handleUiDebugKeydown(event: KeyboardEvent): void {
    if (!debugToolsEnabled) {
      return;
    }

    if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
      event.preventDefault();
      designModeEnabled = !designModeEnabled;
      if (!designModeEnabled) {
        selectedDesignTargetName = null;
      }
      return;
    }

    if (event.code === 'ControlLeft') {
      showUiDebugNames = true;
    }
  }

  function handleUiDebugKeyup(event: KeyboardEvent): void {
    if (!debugToolsEnabled) {
      return;
    }

    if (event.code === 'ControlLeft') {
      showUiDebugNames = false;
    }
  }

  function clearUiDebugNames(): void {
    if (!debugToolsEnabled) {
      return;
    }

    showUiDebugNames = false;
  }

  function handleDesignModeClick(event: MouseEvent): void {
    if (!debugToolsEnabled || !designModeEnabled) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest('.design-mode-panel')) {
      return;
    }

    const uiTarget = target.closest<HTMLElement>('.ui-debug-target[data-ui-name]');
    if (!uiTarget) {
      selectedDesignTargetName = null;
      return;
    }

    selectedDesignTargetName = uiTarget.dataset.uiName ?? null;
    event.preventDefault();
    event.stopPropagation();
  }

  function updateSelectedDesignTweak(field: DesignTweakField, value: string): void {
    if (!selectedDesignTargetName) {
      return;
    }

    const trimmed = value.trim();
    const nextTweaks: DesignTweaks = {
      ...(designTweaksByTarget[selectedDesignTargetName] ?? {}),
    };

    if (trimmed.length === 0) {
      delete nextTweaks[field];
    } else {
      nextTweaks[field] = trimmed;
    }

    const nextMap = { ...designTweaksByTarget };
    if (Object.keys(nextTweaks).length === 0) {
      delete nextMap[selectedDesignTargetName];
    } else {
      nextMap[selectedDesignTargetName] = nextTweaks;
    }
    designTweaksByTarget = nextMap;
  }

  function clearSelectedDesignTweaks(): void {
    if (!selectedDesignTargetName || !(selectedDesignTargetName in designTweaksByTarget)) {
      return;
    }

    const nextMap = { ...designTweaksByTarget };
    delete nextMap[selectedDesignTargetName];
    designTweaksByTarget = nextMap;
  }

  function resetAllDesignTweaks(): void {
    designTweaksByTarget = {};
  }

  function rememberRendererDiagnostic(diagnostic: BattleReportDiagnostic): void {
    const normalized: BattleReportDiagnostic = {
      ...diagnostic,
      replayId: diagnostic.replayId ?? replay?.id ?? null,
      step: typeof diagnostic.step === 'number' ? diagnostic.step : $gameStore.currentStep,
    };
    const key = [
      normalized.source,
      normalized.severity,
      normalized.code,
      normalized.replayId ?? '',
      normalized.step ?? '',
      normalized.textureKey ?? '',
      normalized.assetUrl ?? '',
      normalized.message,
    ].join('|');
    const existing = new Set(
      rendererDiagnostics.map((entry) =>
        [entry.source, entry.severity, entry.code, entry.replayId ?? '', entry.step ?? '', entry.textureKey ?? '', entry.assetUrl ?? '', entry.message].join('|'),
      ),
    );
    if (existing.has(key)) {
      return;
    }
    rendererDiagnostics = [...rendererDiagnostics, normalized].slice(-80);
  }

  function handleCampaignReportImport(importedSelectedTroopId: TroopId | null, importedSelectedReplayId: string | null): void {
    selectedRiftId = null;
    selectedTroopId = importedSelectedTroopId;
    selectedReplayId = importedSelectedReplayId;
  }

  function getReplayProfileKeyForUnit(unitId: string): string | null {
    const unit = replaySnapshot.find((entry) => entry.id === unitId);
    return unit ? replayProfileKey(unit.side, unit.troopLabel) : null;
  }

  function getReplayUnitPortraitUrl(unit: BattleUnit): string {
    return getFactionUnitPortrait(unit.factionId, unit.unitTypeId);
  }

  function findLockedUnitActorStep(unitId: string, fromStep: number, direction: 'prev' | 'next'): number | null {
    if (!replay) {
      return null;
    }

    if (direction === 'prev') {
      for (let index = Math.min(fromStep - 1, replay.steps.length - 1); index >= 0; index -= 1) {
        if (replay.steps[index]?.actorIds.includes(unitId)) {
          return index;
        }
      }
      return null;
    }

    for (let index = Math.max(fromStep + 1, 0); index < replay.steps.length; index += 1) {
      if (replay.steps[index]?.actorIds.includes(unitId)) {
        return index;
      }
    }

    return null;
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

  function formatRiftTierLabel(tier: number): string {
    return `T${tier}`;
  }

  function formatRiftDisplayId(riftId: string): string {
    const match = /^cycle-(\d+)-rift-(\d+)$/i.exec(riftId);
    if (!match) {
      return riftId;
    }

    const [, cycleNumber, riftNumber] = match;
    return `C${cycleNumber}R${riftNumber}`;
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

  function getStatLabel(key: ExplainedStatKey): string {
    return {
      health: 'Health',
      damage: 'Damage',
      speed: 'Speed',
      range: 'Range',
      armor: 'Armor',
      capacity: 'Capacity',
      size: 'Size',
    }[key];
  }

  function getStatDescription(key: ExplainedStatKey): string {
    return {
      health: 'How much punishment each unit can take before falling.',
      damage: 'How much harm each attack deals before armor and other effects.',
      speed: 'How quickly the unit gains initiative and takes turns.',
      range: 'How many hexes away the unit can attack from.',
      armor: 'Flat damage reduction applied when the unit is hit.',
      capacity: 'How many enemies this unit can hold in melee engagement.',
      size: 'How much space each unit occupies on the battlefield.',
    }[key];
  }

  function formatStatModifier(value: { flat?: number; multiplier?: number } | undefined): string {
    if (!value) {
      return '0';
    }

    const parts: string[] = [];
    const multiplier = value.multiplier ?? 1;
    const percent = (multiplier - 1) * 100;
    if (percent !== 0) {
      parts.push(`${percent > 0 ? '+' : ''}${formatFixed(percent)}%`);
    }
    if ((value.flat ?? 0) !== 0) {
      parts.push(`${value.flat! > 0 ? '+' : ''}${formatFixed(value.flat!)}`);
    }
    return parts.join(', ') || '0';
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
        name: getStatLabel(key),
        description: getStatDescription(key),
        value: formatFixed(key === 'size' ? stats.size ?? 0 : stats[key as keyof typeof stats] as number),
        breakdown: breakdowns?.[key] ?? null,
    }));

    if (typeof quantity === 'number') {
      entries.push({
        key: 'quantity',
        label: displayIcon('quantity'),
        name: 'Quantity',
        description: 'How many bodies are in this troop group.',
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
    const nonStatModifiers = [
      ...(faction.addedAttributes.length > 0 ? [`Attributes: ${faction.addedAttributes.join(', ')}.`] : []),
      ...faction.abilityIds.map((abilityId) => {
        const ability = getAbility(abilityId);
        return `${ability.label}: ${formatAbilityExact(ability)}`;
      }),
    ];
    const stats = (['health', 'damage', 'speed', 'armor', 'range', 'capacity', 'size'] as ExplainedStatKey[])
      .map((key) => ({
        key,
        label: displayIcon(key),
        name: getStatLabel(key),
        description: getStatDescription(key),
        value: formatStatModifier(faction.statAdjustments[key]),
        breakdown: null,
      }))
      .filter((entry) => entry.value !== '0');

    return {
      detailKey: `faction:${factionId}`,
      kind: 'faction',
      label: faction.label,
      description: nonStatModifiers.length > 0 ? nonStatModifiers.join(' ') : 'No special non-stat modifiers.',
      stats,
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
      description: details.description,
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
        description: ability.shortText ?? formatAbilityExact(ability),
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
    selectedTroopOfferUnlockId = null;
  }

  function clearAutoTimer(): void {
    if (autoTimer !== null) {
      window.clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  function teardownRenderer(): void {
    renderer?.destroy();
    renderer = null;
    rendererInitPromise = null;
    renderedReplayId = null;
    renderedStep = Number.NaN;
    renderedHighlightKey = '';
    hoverInfo = null;
    lockedUnitId = null;
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
    const host = battleHost;
    if (!host || !host.isConnected || renderer) {
      return;
    }

    const nextRenderer = new BattleRenderer(host);
    nextRenderer.setDiagnosticHandler(rememberRendererDiagnostic);
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
      try {
        await nextRenderer.init();
        if (!battleHost || battleHost !== host || !host.isConnected || $gameStore.screen !== 'replay') {
          nextRenderer.destroy();
          return;
        }
        renderer = nextRenderer;
        renderer.refreshViewport();
        syncRenderer();
      } catch (error) {
        rememberRendererDiagnostic({
          source: 'ui',
          severity: 'error',
          code: 'renderer_init_failed',
          message: error instanceof Error ? error.message : 'Renderer failed to initialize.',
        });
        nextRenderer.destroy();
      }
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
    selectedRiftId = null;
    gameStore.setCenterMode('rifts');
  }

  function setTroopCenterMode(): void {
    resetOverworldInspect();
    selectedRiftId = null;
    selectedReplayId = null;
    gameStore.setCenterMode('troops');
  }

  function selectTroop(troopId: TroopId): void {
    const nextTroopId = selectedTroopId === troopId ? null : troopId;
    selectedTroopId = nextTroopId;
    const troop = $gameStore.game.troops.find((entry) => entry.id === troopId);
    selectedFactionId = nextTroopId ? troop?.factionId ?? null : null;
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

  function getTroopDropTarget(clientX: number, clientY: number): TroopDropTarget | null {
    const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-rift-drop-target], [data-ready-drop-target]');

    if (!element) {
      return null;
    }

    if (element.dataset.readyDropTarget === 'true') {
      return { kind: 'ready' };
    }

    return element.dataset.riftDropTarget ? { kind: 'rift', riftId: element.dataset.riftDropTarget } : null;
  }

  function isCurrentDropTarget(target: TroopDropTarget | null, kind: 'ready' | 'rift', riftId?: string): boolean {
    if (!target || target.kind !== kind) {
      return false;
    }

    return kind === 'ready' || target.riftId === riftId;
  }

  function clearTroopDragListeners(): void {
    window.removeEventListener('pointermove', handleTroopDragMove);
    window.removeEventListener('pointerup', handleTroopDragEnd);
    window.removeEventListener('pointercancel', handleTroopDragCancel);
    window.removeEventListener('mousemove', handleMouseTroopDragMove);
    window.removeEventListener('mouseup', handleMouseTroopDragEnd);
    document.removeEventListener('pointermove', handleTroopDragMove);
    document.removeEventListener('pointerup', handleTroopDragEnd);
    document.removeEventListener('pointercancel', handleTroopDragCancel);
    document.removeEventListener('mousemove', handleMouseTroopDragMove);
    document.removeEventListener('mouseup', handleMouseTroopDragEnd);
  }

  function beginTroopDrag(
    pointerId: number | null,
    clientX: number,
    clientY: number,
    troopId: TroopId,
    sourceRiftId: string | null,
    label: string,
    portraitUrl: string,
  ): void {
    troopDrag = {
      troopId,
      sourceRiftId,
      pointerId,
      startX: clientX,
      startY: clientY,
      x: clientX,
      y: clientY,
      active: false,
      label,
      portraitUrl,
      dropTarget: null,
    };
  }

  function buildOpeningTroopDetail(troopUnlockId: TroopUnlockId): DetailCard {
    const [factionId, unitTypeId] = parseTroopUnlockId(troopUnlockId);
    const troopDef = TROOP_CATALOG[troopUnlockId];
    return buildResolvedUnitDetail(
      `opening:${troopUnlockId}`,
      troopDef.label,
      factionId,
      unitTypeId,
      troopDef.stats,
      troopDef.quantity,
      `Opening unlock for ${getFaction(factionId).label}. Native recruits are available here; unusual faction and troop pairings come from Rift victories.`,
      troopDef.abilities,
    );
  }

  function buildScheduledTroopDetail(troopUnlockId: TroopUnlockId, grantedUpgradeIds: UpgradeId[], description: string): DetailCard {
    const [factionId, unitTypeId] = parseTroopUnlockId(troopUnlockId);
    const previewState = {
      factionUpgradeIds: [...new Set([...$gameStore.game.factionUpgradeIds, ...grantedUpgradeIds])],
      troopTypeUpgradeIds: $gameStore.game.troopTypeUpgradeIds,
    };
    const troopDef = resolveTroopCombatant(previewState, createTroopInstance(factionId, unitTypeId), 'player');
    return buildResolvedUnitDetail(
      `scheduled-faction:${troopUnlockId}:${grantedUpgradeIds.join(',')}`,
      troopDef.label,
      factionId,
      unitTypeId,
      troopDef.stats,
      troopDef.quantity,
      description,
      troopDef.abilities,
      troopDef.statBreakdowns,
    );
  }

  function startTroopDrag(event: PointerEvent, troopId: TroopId, sourceRiftId: string | null, label: string, portraitUrl: string): void {
    if (troopDrag || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }

    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    beginTroopDrag(event.pointerId, event.clientX, event.clientY, troopId, sourceRiftId, label, portraitUrl);
    window.addEventListener('pointermove', handleTroopDragMove, { passive: false });
    window.addEventListener('pointerup', handleTroopDragEnd);
    window.addEventListener('pointercancel', handleTroopDragCancel);
    document.addEventListener('pointermove', handleTroopDragMove, { passive: false });
    document.addEventListener('pointerup', handleTroopDragEnd);
    document.addEventListener('pointercancel', handleTroopDragCancel);
    if (event.pointerType === 'mouse') {
      window.addEventListener('mousemove', handleMouseTroopDragMove, { passive: false });
      window.addEventListener('mouseup', handleMouseTroopDragEnd);
      document.addEventListener('mousemove', handleMouseTroopDragMove, { passive: false });
      document.addEventListener('mouseup', handleMouseTroopDragEnd);
    }
  }

  function startMouseTroopDrag(event: MouseEvent, troopId: TroopId, sourceRiftId: string | null, label: string, portraitUrl: string): void {
    if (troopDrag || event.button !== 0) {
      return;
    }

    beginTroopDrag(null, event.clientX, event.clientY, troopId, sourceRiftId, label, portraitUrl);
    window.addEventListener('mousemove', handleMouseTroopDragMove, { passive: false });
    window.addEventListener('mouseup', handleMouseTroopDragEnd);
    document.addEventListener('mousemove', handleMouseTroopDragMove, { passive: false });
    document.addEventListener('mouseup', handleMouseTroopDragEnd);
  }

  function updateTroopDragPosition(clientX: number, clientY: number): void {
    if (!troopDrag) {
      return;
    }

    const movedDistance = Math.hypot(clientX - troopDrag.startX, clientY - troopDrag.startY);
    const active = troopDrag.active || movedDistance > 6;

    troopDrag = {
      ...troopDrag,
      x: clientX,
      y: clientY,
      active,
      dropTarget: active ? getTroopDropTarget(clientX, clientY) : null,
    };
  }

  function handleTroopDragMove(event: PointerEvent): void {
    if (!troopDrag || event.pointerId !== troopDrag.pointerId) {
      return;
    }

    updateTroopDragPosition(event.clientX, event.clientY);
    if (troopDrag.active) {
      event.preventDefault();
    }
  }

  function finishTroopDrag(clientX?: number, clientY?: number): void {
    if (!troopDrag) {
      return;
    }

    const completedDrag = troopDrag.active;
    const finalDropTarget = typeof clientX === 'number' && typeof clientY === 'number' ? getTroopDropTarget(clientX, clientY) : null;
    const { troopId, sourceRiftId } = troopDrag;
    const dropTarget = finalDropTarget ?? troopDrag.dropTarget;

    clearTroopDragListeners();
    troopDrag = null;

    if (completedDrag) {
      suppressTroopClickId = troopId;
      selectedTroopId = troopId;
    }

    if (!completedDrag) {
      return;
    }

    completeTroopDrop(troopId, sourceRiftId, dropTarget);
  }

  function handleTroopDragEnd(event: PointerEvent): void {
    if (!troopDrag || event.pointerId !== troopDrag.pointerId) {
      return;
    }

    finishTroopDrag(event.clientX, event.clientY);
  }

  function handleMouseTroopDragMove(event: MouseEvent): void {
    if (!troopDrag) {
      return;
    }

    updateTroopDragPosition(event.clientX, event.clientY);
    if (troopDrag.active) {
      event.preventDefault();
    }
  }

  function handleMouseTroopDragEnd(event: MouseEvent): void {
    if (!troopDrag) {
      return;
    }

    finishTroopDrag(event.clientX, event.clientY);
  }

  function handleTroopDragCancel(event: PointerEvent): void {
    if (!troopDrag || event.pointerId !== troopDrag.pointerId) {
      return;
    }

    clearTroopDragListeners();
    troopDrag = null;
  }

  function handleRiftTroopClick(troopId: TroopId, detail: DetailCard): void {
    if (suppressTroopClickId === troopId) {
      suppressTroopClickId = null;
      return;
    }

    selectTroopForRift(troopId);
    togglePinnedDetail(detail);
  }

  function completeTroopDrop(troopId: TroopId, sourceRiftId: string | null, dropTarget: TroopDropTarget | null): void {
    if (!dropTarget) {
      return;
    }

    selectedTroopId = troopId;

    if (dropTarget.kind === 'ready') {
      if (sourceRiftId) {
        gameStore.clearTroopAssignment(troopId);
      }
      return;
    }

    if (dropTarget.riftId !== sourceRiftId) {
      gameStore.assignTroopToRift(troopId, dropTarget.riftId);
    }
  }

  function startNativeTroopDrag(event: DragEvent, troopId: TroopId, sourceRiftId: string | null): void {
    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-shiftmake-troop', JSON.stringify({ troopId, sourceRiftId }));
  }

  function allowNativeTroopDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function endNativeTroopDrag(): void {
    clearTroopDragListeners();
    troopDrag = null;
  }

  function finishNativeTroopDrop(event: DragEvent, dropTarget: TroopDropTarget): void {
    event.preventDefault();
    const payload = event.dataTransfer?.getData('application/x-shiftmake-troop');

    if (!payload) {
      return;
    }

    try {
      const parsed = JSON.parse(payload) as { troopId?: TroopId; sourceRiftId?: string | null };
      if (parsed.troopId) {
        completeTroopDrop(parsed.troopId, parsed.sourceRiftId ?? null, dropTarget);
      }
    } catch {
      // Ignore malformed external drops; only Shiftmake troop payloads are valid.
    }
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
      description: 'shortText' in ability ? ability.shortText ?? formatAbilityExact(ability) : ability.description,
    };
  }

  function selectTroopOfferUnlock(troopUnlockId: TroopUnlockId, detail: DetailCard): void {
    selectedTroopOfferUnlockId = troopUnlockId;
    pinnedDetail = detail;
    hoveredDetail = null;
    hoveredAbilityTooltip = null;
  }

  function confirmTroopOfferUnlock(): void {
    if (!selectedTroopOfferUnlockId) {
      return;
    }

    gameStore.claimTroopOffer(selectedTroopOfferUnlockId);
    selectedTroopOfferUnlockId = null;
    pinnedDetail = null;
    hoveredDetail = null;
    hoveredAbilityTooltip = null;
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

  function formatHpLabel(currentHp: number, maxHp: number): string {
    return `${Math.round(currentHp)} / ${Math.round(maxHp)}`;
  }

  function getHpPercent(currentHp: number, maxHp: number): string {
    if (maxHp <= 0) {
      return '0%';
    }

    return `${Math.max(0, Math.min(100, (currentHp / maxHp) * 100))}%`;
  }

  function buildReplayHealthRoster(replay: BattleReplay): BattleUnit[] {
    const unitsById = new Map<string, BattleUnit>();
    const rememberUnit = (unit: BattleUnit): void => {
      if (!unitsById.has(unit.id)) {
        unitsById.set(unit.id, unit);
      }
    };

    replay.initial.units.forEach(rememberUnit);
    replay.steps.forEach((step) => step.snapshot.units.forEach(rememberUnit));

    return [...unitsById.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  function buildReplayHealthSide(roster: BattleUnit[], snapshot: BattleUnit[], side: SideId): ReplayHealthSide {
    const currentUnitsById = new Map(snapshot.map((unit) => [unit.id, unit]));
    const sideUnits = roster.filter((unit) => unit.side === side);
    const snapshotSideUnits = snapshot.filter((unit) => unit.side === side);
    const currentHp = snapshotSideUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0);
    const maxHp = snapshotSideUnits.reduce((sum, unit) => sum + Math.max(0, unit.maxHp), 0);
    const units = sideUnits.flatMap((unit) => {
      const currentUnit = currentUnitsById.get(unit.id);
      if (!currentUnit?.alive) {
        return [];
      }

      return [{
        unit: currentUnit,
        hpPercent: getHpPercent(currentUnit.hp, currentUnit.maxHp),
        hpLabel: formatHpLabel(currentUnit.hp, currentUnit.maxHp),
        portraitUrl: getReplayUnitPortraitUrl(unit),
      }];
    });

    return {
      side,
      label: side === 'player' ? 'Player' : 'Enemy',
      currentHp,
      maxHp,
      hpPercent: getHpPercent(currentHp, maxHp),
      hpLabel: formatHpLabel(currentHp, maxHp),
      unitsMinHeight: `${sideUnits.length * 1.9 + Math.max(0, sideUnits.length - 1) * 0.28}rem`,
      units,
    };
  }

  onMount(() => {
    if (verificationLabMode) {
      if (import.meta.env.DEV) {
        void import('./AbilityVerificationLab.svelte').then((module) => {
          abilityVerificationLabComponent = module.default;
        });
      }
      return;
    }

    if (debugToolsEnabled) {
      try {
      const raw = window.localStorage.getItem(DESIGN_MODE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          designTweaksByTarget = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).filter(
              ([key, value]) => typeof key === 'string' && value && typeof value === 'object' && !Array.isArray(value),
            ),
          ) as Record<string, DesignTweaks>;
        }
      }
      } catch {
        designTweaksByTarget = {};
      }
    }

    gameStore.initialize();
    void loadFactionUnitPortraitUrls()
      .then((loaded) => {
        portraits = loaded;
      })
      .catch((error) => {
        rememberRendererDiagnostic({
          source: 'assets',
          severity: 'error',
          code: 'portrait_generation_failed',
          message: error instanceof Error ? error.message : 'Failed to generate unit portraits.',
        });
      });

    window.addEventListener('resize', handleResize);
    return () => {
      clearAutoTimer();
      window.removeEventListener('resize', handleResize);
      teardownRenderer();
    };
  });

  $: if ((!battleHost || $gameStore.screen !== 'replay') && renderer) {
    teardownRenderer();
  }

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

  $: uiDebugVisible = debugToolsEnabled && (showUiDebugNames || designModeEnabled);
  $: if (
    selectedTroopOfferUnlockId &&
    !$gameStore.game.activeTroopOffer?.optionTroopUnlockIds.includes(selectedTroopOfferUnlockId)
  ) {
    selectedTroopOfferUnlockId = null;
  }

  $: if (debugToolsEnabled && typeof window !== 'undefined' && !verificationLabMode) {
    window.localStorage.setItem(DESIGN_MODE_STORAGE_KEY, JSON.stringify(designTweaksByTarget));
  }

  $: if (debugToolsEnabled && typeof document !== 'undefined' && !verificationLabMode) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.ui-debug-target[data-ui-name]'));
    elements.forEach((element) => {
      const name = element.dataset.uiName ?? '';
      const tweaks = designTweaksByTarget[name] ?? {};
      const isSelected = !!selectedDesignTargetName && name === selectedDesignTargetName;

      element.toggleAttribute('data-design-selected', isSelected);
      element.toggleAttribute('data-design-tweaked', Object.keys(tweaks).length > 0);

      element.style.padding = tweaks.padding ?? '';
      element.style.gap = tweaks.gap ?? '';
      element.style.width = tweaks.width ?? '';
      element.style.maxWidth = tweaks.maxWidth ?? '';
      element.style.borderRadius = tweaks.borderRadius ?? '';
      element.style.minHeight = tweaks.minHeight ?? '';
    });
  }

  $: discoveredRifts = $gameStore.game.openRifts.filter((rift) => rift.state === 'discovered');
  $: factionRosterIds = FACTION_IDS.filter((factionId) => $gameStore.game.unlockedFactionIds.includes(factionId));
  $: selectedOpeningFactionIds = new Set($gameStore.game.troops.map((troop) => troop.factionId));
  $: selectedOpeningUnitTypeIds = new Set($gameStore.game.troops.map((troop) => troop.unitTypeId));
  $: selectedOpeningTroopUnlockIds = new Set($gameStore.game.troops.map((troop) => `${troop.factionId}/${troop.unitTypeId}` as TroopUnlockId));
  $: openingFocusedDetail =
    openingFocusedTroopUnlockId && selectedOpeningTroopUnlockIds.has(openingFocusedTroopUnlockId)
      ? buildOpeningTroopDetail(openingFocusedTroopUnlockId)
      : null;
  $: {
    const inspectContextKey = `${$gameStore.screen}:${$gameStore.game.phase}`;
    if (inspectContextKey !== lastInspectContextKey) {
      lastInspectContextKey = inspectContextKey;
      resetOverworldInspect();
      if ($gameStore.screen !== 'overworld' || $gameStore.game.phase === 'faction_unlock') {
        selectedRiftId = null;
        selectedTroopId = null;
        selectedReplayId = null;
      }
    }
  }
  $: activeDetail = openingFocusedDetail ?? pinnedDetail ?? hoveredDetail;
  $: statusCounts = getTroopStatusCounts($gameStore.game);
  $: essenceDraftCost = getEssenceDraftCost($gameStore.game);
  $: essenceDraftButtonLabel =
    essenceDraftCost === 1 ? 'Reveal One Unlock (1 Essence)' : essenceDraftCost === 2 ? 'Reveal Unlock Draft (2 Essence)' : 'Draft Unavailable';
  $: starterGroups = getOpeningFactionOptionIds().map((factionId) => ({
    factionId,
    label: FACTIONS[factionId].label,
    options: getFactionNativeTroopUnlockIds(factionId),
  }));

  function isOpeningTroopSelected(troopUnlockId: TroopUnlockId): boolean {
    return selectedOpeningTroopUnlockIds.has(troopUnlockId);
  }

  function canClaimOpeningTroop(troopUnlockId: TroopUnlockId): boolean {
    const [factionId, unitTypeId] = parseTroopUnlockId(troopUnlockId);
    return (
      $gameStore.game.troops.length < 2 &&
      getOpeningFactionOptionIds().includes(factionId) &&
      !selectedOpeningFactionIds.has(factionId) &&
      !selectedOpeningUnitTypeIds.has(unitTypeId)
    );
  }

  function isOpeningTroopIncompatible(troopUnlockId: TroopUnlockId): boolean {
    return !isOpeningTroopSelected(troopUnlockId) && !canClaimOpeningTroop(troopUnlockId);
  }

  function toggleOpeningTroop(troopUnlockId: TroopUnlockId): void {
    if (isOpeningTroopSelected(troopUnlockId)) {
      const remainingSelected = [...selectedOpeningTroopUnlockIds].filter((selectedId) => selectedId !== troopUnlockId);
      openingFocusedTroopUnlockId = remainingSelected[remainingSelected.length - 1] ?? null;
      gameStore.unclaimOpeningTroop(troopUnlockId);
    } else {
      openingFocusedTroopUnlockId = troopUnlockId;
      pinnedDetail = null;
      hoveredDetail = null;
      gameStore.claimOpeningTroop(troopUnlockId);
    }
  }

  function getDefeatedFutureTroopUnlockIds(factionId: FactionId): TroopUnlockId[] {
    return $gameStore.game.unlockedTroopUnlockIds.filter((troopUnlockId) => parseTroopUnlockId(troopUnlockId)[0] === factionId);
  }

  function getAffectedTroopsForUpgrade(upgradeId: UpgradeId) {
    if (upgradeId in FACTION_UPGRADES) {
      const factionId = FACTION_UPGRADES[upgradeId]!.factionId;
      return $gameStore.game.troops.filter((troop) => troop.factionId === factionId);
    }

    const troopTypeUpgrade = TROOP_TYPE_UPGRADES[upgradeId];
    if (!troopTypeUpgrade) {
      return [];
    }

    return $gameStore.game.troops.filter((troop) => troop.unitTypeId === troopTypeUpgrade.unitTypeId);
  }

  $: if (selectedRiftId && !discoveredRifts.some((rift) => rift.id === selectedRiftId)) {
    selectedRiftId = null;
  }

  $: if (selectedTroopId && !$gameStore.game.troops.some((troop) => troop.id === selectedTroopId)) {
    selectedTroopId = null;
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
  $: replayHealthRoster = replay ? buildReplayHealthRoster(replay) : [];
  $: replayHealthOverview = replay
    ? [buildReplayHealthSide(replayHealthRoster, replaySnapshot, 'player'), buildReplayHealthSide(replayHealthRoster, replaySnapshot, 'enemy')]
    : [];
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
  $: lockedUnitLastActionStep =
    lockedUnitId && replay ? findLockedUnitActorStep(lockedUnitId, $gameStore.currentStep, 'prev') : null;
  $: lockedUnitNextActionStep =
    lockedUnitId && replay ? findLockedUnitActorStep(lockedUnitId, $gameStore.currentStep, 'next') : null;
  $: replayRecap = replay ? buildBattleRecap(replay) : [];
  $: replayRecapPlayerTroops = replayRecap.filter((entry) => entry.side === 'player');
  $: replayRecapEnemyTroops = replayRecap.filter((entry) => entry.side === 'enemy');
  $: if ((replay?.id ?? null) !== lastReplayExplanationReplayId) {
    lastReplayExplanationReplayId = replay?.id ?? null;
    pinnedReplayExplanationIndex = null;
  }
  $: if (!replay || (pinnedReplayExplanationIndex !== null && !replay.steps[pinnedReplayExplanationIndex])) {
    pinnedReplayExplanationIndex = null;
  }
  $: replayExplanationIndex = pinnedReplayExplanationIndex;
  $: replayExplanationView =
    replay && replayExplanationIndex !== null && replay.steps[replayExplanationIndex]
      ? buildReplayStepExplanationView(replay.steps[replayExplanationIndex]!)
      : null;
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

    pinnedReplayExplanationIndex = null;
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

  function goToReplayUnitActionStep(stepIndex: number | null): void {
    if (stepIndex === null) {
      return;
    }

    gameStore.setAutoPlay(false);
    selectReplayEvent(stepIndex);
  }

  function pinReplayExplanation(index: number | null): void {
    pinnedReplayExplanationIndex = index;
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

<svelte:window on:keydown={handleUiDebugKeydown} on:keyup={handleUiDebugKeyup} on:blur={clearUiDebugNames} on:click|capture={handleDesignModeClick} />

{#if verificationLabMode}
  {#if abilityVerificationLabComponent}
    <svelte:component this={abilityVerificationLabComponent} />
  {/if}
{:else if $gameStore.screen === 'main_menu'}
  <main class="menu-screen" class:ui-debug-visible={uiDebugVisible} class:design-mode-enabled={designModeEnabled}>
    <section class="menu-panel ui-debug-target" data-ui-name="Main menu panel">
      <div class="menu-topline ui-debug-target" data-ui-name="Main menu header">
        <div class="menu-copy ui-debug-target" data-ui-name="Main menu intro">
          <p class="eyebrow">Shiftmake</p>
          <h1>Choose A Save Slot</h1>
          <p class="intro">Each slot keeps its own campaign and battle archive. Load one or start fresh.</p>
        </div>

        {#if debugToolsEnabled}
          <DebugToolsMenu
            selectedTroopId={selectedTroopId}
            selectedReplayId={selectedReplayId}
            selectedRiftId={selectedRiftId}
            rendererDiagnostics={rendererDiagnostics}
            onCampaignImport={handleCampaignReportImport}
          />
        {/if}
      </div>

      <div class="slot-grid">
        {#each $gameStore.slots as slot}
          <article class="slot-card panel ui-debug-target" data-ui-name={`Save slot ${slot.slotId}`}>
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
              <button class="primary ui-debug-target" data-ui-name={`Primary action for save slot ${slot.slotId}`} on:click={() => openSlot(slot)}>
                {slot.status === 'occupied' ? 'Load Slot' : 'Start Campaign'}
              </button>
              {#if slot.status === 'occupied'}
                <button class="ui-debug-target" data-ui-name={`Replace save for slot ${slot.slotId}`} on:click={() => restartSlot(slot)}>Replace Save</button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </section>
  </main>
{:else if $gameStore.screen === 'overworld' && $gameStore.game.phase === 'opening_unlock'}
  <main class="draft-screen" class:ui-debug-visible={uiDebugVisible} class:design-mode-enabled={designModeEnabled}>
    <section class="draft-panel opening-shell ui-debug-target" data-ui-name="Opening unlock screen">
      <div class="draft-screen-header">
        <p class="eyebrow">Opening Muster</p>
        <h1>Choose Two Starting Troops</h1>
        <p class="opening-instructions">Pick any two native troop combinations. The two starters must use different factions and different troop types.</p>
      </div>
      <div class="draft-layout">
        <aside class="panel draft-focus-panel ui-debug-target" data-ui-name="Opening detail panel" role="presentation" on:mouseleave={clearDetail}>
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
          {/if}
        </aside>

        <div class="draft-grid">
          {#each starterGroups as group}
            {@const factionDetail = buildFactionDetail(group.factionId)}
            <article class="draft-card panel ui-debug-target" data-ui-name={`Opening faction card ${group.label}`}>
              <header class="draft-card-header">
                <div class="draft-card-title">
                  <strong>{group.label}</strong>
                  <button
                    type="button"
                    class="sprite-inspect-button ui-debug-target"
                    data-ui-name={`Inspect faction ${group.label}`}
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
                    {@const openingTroopSelected = selectedOpeningTroopUnlockIds.has(troopUnlockId)}
                    {@const openingTroopIncompatible = !openingTroopSelected && !canClaimOpeningTroop(troopUnlockId)}
                    <button
                      type="button"
                      class="draft-troop-icon ui-debug-target"
                      class:selected={openingTroopSelected}
                      class:incompatible={openingTroopIncompatible}
                      data-ui-name={`Opening troop option ${troopDef.label}`}
                      aria-label={troopDef.label}
                      aria-pressed={openingTroopSelected}
                      on:mouseenter={() => previewDetail(troopDetail)}
                      on:focus={() => previewDetail(troopDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => toggleOpeningTroop(troopUnlockId)}
                      disabled={openingTroopIncompatible}
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
      <div class="opening-actions actions-grid">
        <button
          type="button"
          class="primary large ui-debug-target"
          data-ui-name="Begin campaign button"
          on:click={() => gameStore.startOpeningCampaign()}
          disabled={$gameStore.game.troops.length !== 2}
        >
          Begin Campaign
        </button>
      </div>
    </section>
  </main>
{:else if $gameStore.screen === 'overworld' && $gameStore.game.phase === 'faction_unlock' && $gameStore.game.activeFactionUnlockOffer}
  <main class="draft-screen" class:ui-debug-visible={uiDebugVisible} class:design-mode-enabled={designModeEnabled}>
    <section class="draft-panel opening-shell scheduled-faction-shell ui-debug-target" data-ui-name="Scheduled faction unlock screen">
      <div class="draft-screen-header">
        <p class="eyebrow">Cycle {$gameStore.game.cycleNumber} Muster</p>
        <h1>Choose a Faction</h1>
        <p class="scheduled-unlock-instructions">Each candidate joins with its shown faction upgrade already unlocked. Native troops are ready for immediate mustering; discovered troops show what your victories have made possible.</p>
      </div>

      <div class="draft-layout scheduled-faction-layout" class:has-detail={!!activeDetail}>
        {#if activeDetail}
          <aside class="panel draft-focus-panel ui-debug-target" data-ui-name="Scheduled faction detail panel" role="presentation" on:mouseleave={clearDetail}>
            <div class="detail-panel opening-detail-panel">
              <p class="eyebrow">
                {activeDetail.kind === 'faction'
                  ? 'Faction Modifiers'
                  : activeDetail.kind === 'upgrade'
                    ? 'Upgrade Effects'
                    : activeDetail.kind === 'unit'
                      ? 'Troop Preview'
                      : 'Detail'}
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
                {#if activeDetail.stats && activeDetail.stats.length > 0}
                  <StatBreakdownGrid stats={activeDetail.stats} columns={4} />
                {/if}
              {/if}
            </div>
          </aside>
        {/if}

        <div class="draft-grid faction-unlock-grid">
          {#each $gameStore.game.activeFactionUnlockOffer.optionFactionIds as factionId}
            {@const faction = getFaction(factionId)}
            {@const factionDetail = buildFactionDetail(factionId)}
            {@const nativeTroopUnlockIds = getFactionNativeTroopUnlockIds(factionId)}
            {@const futureTroopUnlockIds = getDefeatedFutureTroopUnlockIds(factionId)}
            {@const grantedUpgradeIds = $gameStore.game.activeFactionUnlockOffer.upgradeIdsByFactionId[factionId] ?? []}
            <article class="draft-card panel faction-unlock-card ui-debug-target" data-ui-name={`Faction unlock option ${faction.label}`}>
              <header class="draft-card-header">
                <div class="draft-card-title">
                  <strong>{faction.label}</strong>
                  <button
                    type="button"
                    class="sprite-inspect-button"
                    class:selected={activeDetail?.detailKey === factionDetail.detailKey}
                    aria-label={`Inspect ${faction.label} faction modifiers`}
                    on:mouseenter={() => previewDetail(factionDetail)}
                    on:focus={() => previewDetail(factionDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => togglePinnedDetail(factionDetail)}
                  >
                    <img class="faction-name-art" src={getFactionPortrait(factionId)} alt="" aria-hidden="true" />
                  </button>
                </div>
                <small>{faction.description}</small>
              </header>

              <div class="draft-section">
                <span class="draft-section-label">Granted upgrades</span>
                <div class="unlock-row">
                  {#each grantedUpgradeIds as upgradeId}
                    {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                    <button
                      type="button"
                      class="list-button upgrade-grant"
                      class:selected={activeDetail?.detailKey === upgradeDetail.detailKey}
                      on:mouseenter={() => previewDetail(upgradeDetail)}
                      on:focus={() => previewDetail(upgradeDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(upgradeDetail)}
                    >
                      <span>{getUpgradeDetails(upgradeId).label}</span>
                    </button>
                  {/each}
                </div>
              </div>

              <div class="draft-section">
                <span class="draft-section-label">Native troops</span>
                <div class="draft-icon-row troop-preview-row">
                  {#each nativeTroopUnlockIds as troopUnlockId}
                    {@const [nativeFactionId, nativeUnitTypeId] = parseTroopUnlockId(troopUnlockId)}
                    {@const troopDetail = buildScheduledTroopDetail(
                      troopUnlockId,
                      grantedUpgradeIds,
                      `Native ${getFaction(nativeFactionId).singularLabel} recruits available as soon as this faction joins.`,
                    )}
                    <button
                      type="button"
                      class="draft-troop-icon troop-preview native"
                      class:selected={activeDetail?.detailKey === troopDetail.detailKey}
                      aria-label={`Inspect ${troopDetail.label}`}
                      on:mouseenter={() => previewDetail(troopDetail)}
                      on:focus={() => previewDetail(troopDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(troopDetail)}
                    >
                      <img class="unit-button-art" src={getFactionUnitPortrait(nativeFactionId, nativeUnitTypeId)} alt="" aria-hidden="true" />
                      <span>{getUnitType(nativeUnitTypeId).label}</span>
                    </button>
                  {/each}
                </div>
              </div>

              <div class="draft-section">
                <span class="draft-section-label">Defeated enemy unlocks</span>
                <div class="draft-icon-row troop-preview-row">
                  {#if futureTroopUnlockIds.length === 0}
                    <span class="troop-preview future empty">None discovered yet</span>
                  {:else}
                    {#each futureTroopUnlockIds as troopUnlockId}
                      {@const [futureFactionId, futureUnitTypeId] = parseTroopUnlockId(troopUnlockId)}
                      {@const troopDetail = buildScheduledTroopDetail(
                        troopUnlockId,
                        grantedUpgradeIds,
                        'Discovered from a defeated Rift enemy. This pairing becomes available once this faction joins.',
                      )}
                      <button
                        type="button"
                        class="draft-troop-icon troop-preview future"
                        class:selected={activeDetail?.detailKey === troopDetail.detailKey}
                        aria-label={`Inspect ${troopDetail.label}`}
                        on:mouseenter={() => previewDetail(troopDetail)}
                        on:focus={() => previewDetail(troopDetail)}
                        on:mouseleave={clearDetail}
                        on:blur={clearDetail}
                        on:click={() => togglePinnedDetail(troopDetail)}
                      >
                        <img class="unit-button-art" src={getFactionUnitPortrait(futureFactionId, futureUnitTypeId)} alt="" aria-hidden="true" />
                        <span>{getUnitType(futureUnitTypeId).label}</span>
                      </button>
                    {/each}
                  {/if}
                </div>
              </div>

              <button class="primary large" on:click={() => gameStore.claimFactionUnlockOffer(factionId)}>Choose {faction.label}</button>
            </article>
          {/each}
        </div>
      </div>
    </section>
  </main>
{:else if $gameStore.screen === 'overworld' && $gameStore.game.phase === 'troop_type_unlock' && $gameStore.game.activeTroopTypeUnlockOffer}
  <main class="draft-screen" class:ui-debug-visible={uiDebugVisible} class:design-mode-enabled={designModeEnabled}>
    <section class="draft-panel opening-shell ui-debug-target" data-ui-name="Scheduled troop type unlock screen">
      <div class="draft-screen-header">
        <p class="eyebrow">{getFaction($gameStore.game.activeTroopTypeUnlockOffer.factionId).label} Muster</p>
        <h1>Choose Troop Type {$gameStore.game.activeTroopTypeUnlockOffer.remainingChoices}</h1>
        <p>Pick one troop for the new faction. Remaining picks will follow immediately.</p>
      </div>

      <div class="draft-grid troop-type-unlock-grid">
        {#each $gameStore.game.activeTroopTypeUnlockOffer.optionTroopUnlockIds as troopUnlockId}
          {@const [factionId, unitTypeId] = parseTroopUnlockId(troopUnlockId)}
          {@const troopDef = resolveTroopCombatant($gameStore.game, createTroopInstance(factionId, unitTypeId), 'player')}
          {@const troopDetail = buildResolvedUnitDetail(
            `scheduled-troop:${troopUnlockId}`,
            troopDef.label,
            factionId,
            unitTypeId,
            troopDef.stats,
            troopDef.quantity,
            'Troop type unlock for the newly joined faction.',
            troopDef.abilities,
          )}
          <button
            type="button"
            class="draft-option troop-type-choice"
            on:mouseenter={() => previewDetail(troopDetail)}
            on:focus={() => previewDetail(troopDetail)}
            on:mouseleave={clearDetail}
            on:blur={clearDetail}
            on:click={() => gameStore.claimTroopTypeUnlockOffer(troopUnlockId)}
          >
            <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden="true" />
            <span>{describeTroopUnlock(troopUnlockId)}</span>
          </button>
        {/each}
      </div>

      {#if activeDetail}
        <aside class="panel floating-detail-panel">
          <p class="eyebrow">Troop Preview</p>
          <h2>{activeDetail.label}</h2>
          {#if activeDetail.kind === 'unit'}
            <div class="hover-unit-detail">
              <img class="hover-unit-art" src={activeDetail.portraitUrl} alt="" aria-hidden="true" />
              <p>{activeDetail.description}</p>
            </div>
            <StatBreakdownGrid stats={activeDetail.stats} columns={4} />
          {:else}
            <p>{activeDetail.description}</p>
          {/if}
        </aside>
      {/if}
    </section>
  </main>
{:else if $gameStore.screen === 'overworld'}
  <main class="shell overworld-shell" class:troops-mode={$gameStore.centerMode === 'troops'} class:ui-debug-visible={uiDebugVisible} class:design-mode-enabled={designModeEnabled}>
    <header class="topbar ui-debug-target" data-ui-name="Overworld top bar">
      <div class="ui-debug-target" data-ui-name="Campaign title">
        <p class="eyebrow">Cycle {$gameStore.game.cycleNumber}</p>
        <h1>Shiftmake Command Table</h1>
      </div>

      <div class="resource-strip">
        <div class="resource-essence ui-debug-target" data-ui-name="Essence counter"><span>Essence</span><strong><i class="resource-icon essence"></i>{formatFixed($gameStore.game.essence)}</strong></div>
        <div class="ui-debug-target" data-ui-name="Victory points counter"><span>Victory Points</span><strong>{$gameStore.game.victoryPoints}</strong></div>
        <div class="ui-debug-target" data-ui-name="Active troops counter"><span>Active</span><strong>{statusCounts.active}</strong></div>
        <div class="ui-debug-target" data-ui-name="Recovering troops counter"><span>Recovering</span><strong>{statusCounts.recovering}</strong></div>
        <div class="ui-debug-target" data-ui-name="Idle troops counter"><span>Idle</span><strong>{statusCounts.idle}</strong></div>
      </div>

      <div class="mode-toggle ui-debug-target" data-ui-name="Top bar actions">
        <button class="ui-debug-target" data-ui-name="Show rifts view" class:selected={$gameStore.centerMode === 'rifts'} on:click={setRiftCenterMode}>Rifts</button>
        <button class="ui-debug-target" data-ui-name="Show factions and troops view" class:selected={$gameStore.centerMode === 'troops'} on:click={setTroopCenterMode}>Factions & Troops</button>
        <button class="ui-debug-target" data-ui-name="Return to main menu" on:click={() => gameStore.returnToMainMenu()}>Main Menu</button>
        {#if debugToolsEnabled}
          <DebugToolsMenu
            mode="campaign-button"
            selectedTroopId={selectedTroopId}
            selectedReplayId={selectedReplayId}
            selectedRiftId={selectedRiftId}
            rendererDiagnostics={rendererDiagnostics}
          />
        {/if}
      </div>
    </header>

    <section class="left-column ui-debug-target" data-ui-name="Left sidebar">
      <div class="panel overworld-detail-panel ui-debug-target" data-ui-name="Detail panel">
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
              {#if activeDetail.stats && activeDetail.stats.length > 0}
                <StatBreakdownGrid stats={activeDetail.stats} columns={4} />
              {/if}
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
                    class="unit-tile draggable-troop-tile"
                    class:assigned={troop.assignmentRiftId === selectedRift.id}
                    class:selected={activeDetail?.detailKey === troopDetail.detailKey}
                    draggable="true"
                    aria-label={`Drag ${troopDef.label} to assign or move it`}
                    on:dragstart={(event) => startNativeTroopDrag(event, troop.id, troop.assignmentRiftId)}
                    on:dragend={endNativeTroopDrag}
                    on:pointerdown={(event) =>
                      startTroopDrag(
                        event,
                        troop.id,
                        troop.assignmentRiftId,
                        troopDef.label,
                        getFactionUnitPortrait(troop.factionId, troop.unitTypeId),
                      )}
                    on:mousedown={(event) =>
                      startMouseTroopDrag(
                        event,
                        troop.id,
                        troop.assignmentRiftId,
                        troopDef.label,
                        getFactionUnitPortrait(troop.factionId, troop.unitTypeId),
                      )}
                    on:click={() => handleRiftTroopClick(troop.id, troopDetail)}
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
          <p class="eyebrow">Unit Inspect</p>
          <h2>{selectedTroopDefinition.label}</h2>
          <div class="hover-unit-detail">
            <img class="hover-unit-art" src={getFactionUnitPortrait(selectedTroop.factionId, selectedTroop.unitTypeId)} alt="" aria-hidden="true" />
            <p>
              {selectedTroop.assignmentRiftId
                ? `Assigned to ${selectedTroop.assignmentRiftId}`
                : selectedTroop.recoveryCyclesRemaining > 0
                  ? `Recovering ${selectedTroop.recoveryCyclesRemaining}`
                  : 'Ready'}
            </p>
          </div>
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

    <section class="center-column ui-debug-target" data-ui-name={$gameStore.centerMode === 'rifts' ? 'Rift board' : 'Factions and troops board'}>
      {#if $gameStore.centerMode === 'rifts'}
        <div class="rift-grid">
          {#each discoveredRifts as rift}
            {@const riftVisual = getRiftVisual(rift)}
            <article
              class="rift-card ui-debug-target"
              data-ui-name={`Rift card ${formatRiftDisplayId(rift.id)}`}
              class:drop-target-active={troopDrag?.active && isCurrentDropTarget(troopDrag.dropTarget, 'rift', rift.id)}
              data-rift-drop-target={rift.id}
              on:dragover={allowNativeTroopDrop}
              on:drop={(event) => finishNativeTroopDrop(event, { kind: 'rift', riftId: rift.id })}
            >
              <div
                class="title-button rift-title-card"
                style={`--rift-tint:${riftVisual.tint}; --rift-glow:${riftVisual.glow}; --rift-rotation:${riftVisual.rotationDeg}deg;`}
              >
                <header class="rift-title-line">
                  <strong class="rift-tier-pill">{formatRiftTierLabel(rift.tier)}</strong>
                  <span class="rift-name-text">{formatRiftDisplayId(rift.id)}</span>
                  <span class="reward-pill rift-fit-pill">Fit {rift.saturation}</span>
                  {#if rift.mutatorIds.length === 0}
                    <span class="mutator-chip empty rift-mutator-chip">None</span>
                  {:else}
                    {#each rift.mutatorIds as mutatorId}
                      <button
                        class="mutator-chip rift-mutator-chip ui-debug-target"
                        data-ui-name={`Mutator ${getMutator(mutatorId).label} on ${formatRiftDisplayId(rift.id)}`}
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
                      class="unit-tile enemy-tile ui-debug-target"
                      data-ui-name={`Enemy troop ${enemy.label} on ${formatRiftDisplayId(rift.id)}`}
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
                    class="unit-tile assigned-summary-tile draggable-troop-tile ui-debug-target"
                    data-ui-name={`Assigned troop ${troopDef.label} on ${formatRiftDisplayId(rift.id)}`}
                    class:selected={selectedTroopId === troop.id || activeDetail?.detailKey === assignedDetail.detailKey}
                    draggable="true"
                    aria-label={`Drag ${troopDef.label} to another Rift or Ready Troops`}
                    on:dragstart={(event) => startNativeTroopDrag(event, troop.id, troop.assignmentRiftId)}
                    on:dragend={endNativeTroopDrag}
                    on:pointerdown={(event) =>
                      startTroopDrag(
                        event,
                        troop.id,
                        troop.assignmentRiftId,
                        troopDef.label,
                        getFactionUnitPortrait(troop.factionId, troop.unitTypeId),
                      )}
                    on:mousedown={(event) =>
                      startMouseTroopDrag(
                        event,
                        troop.id,
                        troop.assignmentRiftId,
                        troopDef.label,
                        getFactionUnitPortrait(troop.factionId, troop.unitTypeId),
                      )}
                    on:mouseenter={() => previewDetail(assignedDetail)}
                    on:focus={() => previewDetail(assignedDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => handleRiftTroopClick(troop.id, assignedDetail)}
                  >
                    <img class="unit-tile-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden="true" />
                  </button>
                {/each}
              </div>

            </article>
          {/each}
        </div>
      {:else}
        <div class="faction-grid troop-faction-grid">
          {#each factionRosterIds as factionId}
            {@const faction = getFaction(factionId)}
            {@const factionDetail = buildFactionDetail(factionId)}
            {@const factionUpgradeIds = $gameStore.game.factionUpgradeIds.filter((upgradeId) => FACTION_UPGRADES[upgradeId]?.factionId === factionId)}
            <section class="faction-card panel ui-debug-target" data-ui-name={`Faction card ${faction.label}`}>
              <header class="faction-card-top">
                <button
                  class="title-button faction-name-button ui-debug-target"
                  data-ui-name={`Faction header ${faction.label}`}
                  class:selected={activeDetail?.detailKey === factionDetail.detailKey || selectedFactionId === factionId}
                  on:mouseenter={() => previewDetail(factionDetail)}
                  on:focus={() => previewDetail(factionDetail)}
                  on:mouseleave={clearDetail}
                  on:blur={clearDetail}
                  on:click={() => {
                    selectFaction(factionId);
                    togglePinnedDetail(factionDetail);
                  }}
                >
                  <span>{faction.label}</span>
                  <img class="faction-name-art" src={getFactionPortrait(factionId)} alt="" aria-hidden="true" />
                </button>

                {#if factionUpgradeIds.length > 0}
                  <div class="unlock-row faction-card-upgrades">
                    {#each factionUpgradeIds as upgradeId}
                      {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                      <button
                        class="list-button ui-debug-target"
                        data-ui-name={`Faction upgrade ${getUpgradeDetails(upgradeId).label}`}
                        class:selected={activeDetail?.detailKey === upgradeDetail.detailKey}
                        on:mouseenter={() => previewDetail(upgradeDetail)}
                        on:focus={() => previewDetail(upgradeDetail)}
                        on:mouseleave={clearDetail}
                        on:blur={clearDetail}
                        on:click={() => togglePinnedDetail(upgradeDetail)}
                      >
                        <span>{getUpgradeDetails(upgradeId).label}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </header>

              <div class="troop-list faction-troop-list">
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
                    class="troop-chip ui-debug-target"
                    data-ui-name={`Troop chip ${troopDef.label}`}
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
                  </button>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {/if}
    </section>

    <section class="right-column ui-debug-target" data-ui-name="Right sidebar">
      {#if $gameStore.systemMessage}
        <div class="panel warning-panel ui-debug-target" data-ui-name="System message panel">
          <p class="eyebrow">System Message</p>
          <h2>System Notice</h2>
          <p>{$gameStore.systemMessage}</p>
          <button class="ui-debug-target" data-ui-name="Dismiss system message" on:click={() => gameStore.clearSystemMessage()}>Dismiss</button>
        </div>
      {/if}

      {#if $gameStore.validationMessages.length > 0}
        <div class="panel warning-panel ui-debug-target" data-ui-name="Validation warning panel">
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
          <p>Spend two Essence to reveal troop and upgrade packs together, then claim one option from each. If one side is fully exhausted, a one-Essence fallback reveals the remaining unlock type.</p>

          <div class="actions-grid">
            <button class="primary" disabled={essenceDraftCost === null || $gameStore.game.essence < essenceDraftCost} on:click={() => gameStore.revealEssenceDraft()}>
              {essenceDraftButtonLabel}
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
                    class:selected={selectedTroopOfferUnlockId === troopUnlockId}
                    on:mouseenter={() => previewDetail(troopDetail)}
                    on:focus={() => previewDetail(troopDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => selectTroopOfferUnlock(troopUnlockId, troopDetail)}
                  >
                    <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden="true" />
                    <span>{describeTroopUnlock(troopUnlockId)}</span>
                  </button>
                {/each}
              </div>
              <button
                type="button"
                class="primary"
                disabled={!selectedTroopOfferUnlockId}
                on:click={confirmTroopOfferUnlock}
              >
                Confirm Troop
              </button>
            </div>
          {/if}

          {#if $gameStore.game.activeUpgradeOffer}
            <div class="draft-offer-block">
              <span class="assignment-label">Upgrade Choices</span>
              <div class="unlock-row">
                {#each $gameStore.game.activeUpgradeOffer.optionUpgradeIds as upgradeId}
                  {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                  {@const affectedTroops = getAffectedTroopsForUpgrade(upgradeId)}
                  <button
                    class="list-button"
                    class:selected={activeDetail?.detailKey === upgradeDetail.detailKey}
                    on:mouseenter={() => previewDetail(upgradeDetail)}
                    on:focus={() => previewDetail(upgradeDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => gameStore.claimUpgradeOffer(upgradeId)}
                  >
                    <span>{getUpgradeDetails(upgradeId).label}</span>
                    {#if affectedTroops.length > 0}
                      <span class="affected-troop-strip" aria-label="Affected unlocked troops">
                        {#each affectedTroops as troop}
                          <img src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden="true" />
                        {/each}
                      </span>
                    {/if}
                  </button>
                {/each}
              </div>
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
        <div class="panel ui-debug-target" data-ui-name="Selected archive entry">
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
        <div class="panel ui-debug-target" data-ui-name="Battle archive panel">
          <h2>Battle Archive</h2>
          {#if $gameStore.game.replayIndex.length === 0}
            <p>No archived battles yet.</p>
          {:else}
            <div class="archive-list">
              {#each $gameStore.game.replayIndex as replayEntry}
                <button
                  class="archive-card ui-debug-target"
                  data-ui-name={`Archive entry ${replayEntry.summary}`}
                  class:selected={selectedReplayId === replayEntry.replayId}
                  on:click={() => selectReplay(replayEntry.replayId)}
                >
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
        <div class="archive-actions-stack">
          <button class="large ui-debug-target" data-ui-name="Back to archive" on:click={() => (selectedReplayId = null)}>Back to Archive</button>
          <button class="primary large ui-debug-target" data-ui-name="Open selected replay" on:click={openSelectedReplay} disabled={!selectedReplayAvailable}>
            {selectedReplayAvailable ? 'Watch Battle' : selectedReplayEntry.summaryOnly ? 'Summary Only' : 'Replay Missing'}
          </button>
        </div>
      {:else}
        {#if $gameStore.centerMode === 'rifts'}
          <div
            class="panel ready-troops-panel footer-ready-troops-panel ui-debug-target"
            data-ui-name="Ready troops panel"
            class:drop-target-active={troopDrag?.active && isCurrentDropTarget(troopDrag.dropTarget, 'ready')}
            role="region"
            aria-label="Ready Troops drop zone"
            data-ready-drop-target="true"
            on:dragover={allowNativeTroopDrop}
            on:drop={(event) => finishNativeTroopDrop(event, { kind: 'ready' })}
          >
            <div class="ready-troops-header">
              <h2>Ready Troops</h2>
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
                    class="unit-tile ready-troop-tile draggable-troop-tile ui-debug-target"
                    data-ui-name={`Ready troop ${troopDef.label}`}
                    class:selected={selectedTroopId === troop.id || activeDetail?.detailKey === troopDetail.detailKey}
                    draggable="true"
                    aria-label={`Drag ${troopDef.label} to a Rift`}
                    on:dragstart={(event) => startNativeTroopDrag(event, troop.id, troop.assignmentRiftId)}
                    on:dragend={endNativeTroopDrag}
                    on:pointerdown={(event) =>
                      startTroopDrag(
                        event,
                        troop.id,
                        troop.assignmentRiftId,
                        troopDef.label,
                        getFactionUnitPortrait(troop.factionId, troop.unitTypeId),
                      )}
                    on:mousedown={(event) =>
                      startMouseTroopDrag(
                        event,
                        troop.id,
                        troop.assignmentRiftId,
                        troopDef.label,
                        getFactionUnitPortrait(troop.factionId, troop.unitTypeId),
                      )}
                    on:mouseenter={() => previewDetail(troopDetail)}
                    on:focus={() => previewDetail(troopDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => handleRiftTroopClick(troop.id, troopDetail)}
                  >
                    <img class="unit-tile-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden="true" />
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        <button class="primary large end-cycle-button ui-debug-target" data-ui-name="End cycle button" on:click={handleEndCycle}>
          {$gameStore.cycleEndConfirmationPending ? 'Confirm End Cycle' : 'End Cycle'}
        </button>
      {/if}
    </footer>

    {#if troopDrag?.active}
      <div class="troop-drag-ghost" style={`left:${troopDrag.x}px; top:${troopDrag.y}px;`} aria-hidden="true">
        <img class="unit-tile-art" src={troopDrag.portraitUrl} alt="" />
      </div>
    {/if}

    {#if $gameStore.game.phase === 'game_over'}
      <div class="unlock-faction-overlay" role="presentation">
        <div class="unlock-faction-dialog panel ui-debug-target" data-ui-name="Game over dialog" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
          <div class="unlock-faction-dialog-header">
            <div>
              <p class="eyebrow">Cycle 10 reached</p>
              <h2 id="game-over-title">Game officially over!</h2>
            </div>
          </div>

          <p class="unlock-faction-dialog-copy">You finished the scored run with {$gameStore.game.victoryPoints} VP.</p>

          <div class="actions-grid">
            <button class="primary ui-debug-target" data-ui-name="Continue playing button" on:click={() => gameStore.continuePlaying()}>Continue playing</button>
            <button class="ui-debug-target" data-ui-name="Back to menu button" on:click={() => gameStore.returnToMainMenu()}>Back to menu</button>
          </div>
        </div>
      </div>
    {/if}
  </main>
{:else}
  <main class="replay-shell" class:ui-debug-visible={uiDebugVisible} class:design-mode-enabled={designModeEnabled}>
    <section class="left replay-left ui-debug-target" data-ui-name="Replay left sidebar">
      <div class="replay-header ui-debug-target" data-ui-name="Replay header">
        <div class="replay-title-row">
          <p class="replay-name">{replay?.riftId ?? 'Debug Battle'}</p>
          {#if debugToolsEnabled}
            <DebugToolsMenu mode="battle-button" rendererDiagnostics={rendererDiagnostics} />
          {/if}
        </div>
        <div class="replay-mutators">
          {#if (replay?.mutatorIds.length ?? 0) === 0}
            <span class="mutator-chip empty">No mutators</span>
          {:else}
            {#each replay?.mutatorIds ?? [] as mutatorId}
              <button
                class="mutator-chip ui-debug-target"
                data-ui-name={`Replay mutator ${getMutator(mutatorId).label}`}
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
          <button class="replay-exit-button ui-debug-target" data-ui-name="Return to overworld" on:click={() => gameStore.closeReplay()}>Return to Overworld</button>
          <button class="replay-exit-button replay-recap-button ui-debug-target" data-ui-name="Toggle battle recap" on:click={toggleReplayRecap}>
            {replayRecapOpen ? 'Close Battle Recap' : 'Open Battle Recap'}
          </button>
        </div>
      </div>
      {#if debugToolsEnabled && $gameStore.loadedBattleReport}
        <div class="panel battle-report-panel">
          <p class="eyebrow">Imported Battle Report</p>
          <h2>{$gameStore.loadedBattleReport.reportId}</h2>
          <p>
            Created {$gameStore.loadedBattleReport.createdAt}. Original replay {$gameStore.loadedBattleReport.summary.replayId}
            with {$gameStore.loadedBattleReport.summary.stepCount} steps.
          </p>
          {#if $gameStore.loadedBattleReport.diagnostics.length > 0}
            <div class="compact-list">
              {#each $gameStore.loadedBattleReport.diagnostics as diagnostic}
                <div>
                  <span>{diagnostic.source} / {diagnostic.code}</span>
                  <strong>{diagnostic.message}</strong>
                </div>
              {/each}
            </div>
          {:else}
            <p>No renderer diagnostics were captured with this report.</p>
          {/if}
        </div>
      {/if}
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

      <section class="panel focus-panel ui-debug-target" data-ui-name="Replay focus panel">
        {#if activeDetail}
          <div class="detail-panel replay-detail-panel">
            <p class="eyebrow">{activeDetail.kind === 'mutator' ? 'Mutator Effect' : activeDetail.kind === 'upgrade' ? 'Upgrade Preview' : 'Battle Detail'}</p>
            <h2>{activeDetail.label}</h2>
            <p>{activeDetail.description}</p>
          </div>
        {:else if replayExplanationView}
          <div class="detail-panel replay-detail-panel replay-explanation-panel">
            <div class="replay-explanation-header">
              <p class="eyebrow">Battle Explanation</p>
              {#if pinnedReplayExplanationIndex !== null}
                <button type="button" class="replay-explanation-clear" on:click={() => pinReplayExplanation(null)}>Clear</button>
              {/if}
            </div>
            <ReplayStepExplanation view={replayExplanationView} compact={true} />
          </div>
        {:else if replayFocusProfile}
          <UnitTooltip
            unit={inspectedUnit}
            profile={replayFocusProfile}
            engagedUnits={engagedUnits}
            getUnitPortraitUrl={getReplayUnitPortraitUrl}
            x={hoverInfo?.x ?? 0}
            y={hoverInfo?.y ?? 0}
            locked={!!lockedUnitId}
            lastActionStep={lockedUnitLastActionStep}
            nextActionStep={lockedUnitNextActionStep}
            onGoToLastAction={() => goToReplayUnitActionStep(lockedUnitLastActionStep)}
            onGoToNextAction={() => goToReplayUnitActionStep(lockedUnitNextActionStep)}
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

    <section class="center replay-center ui-debug-target" data-ui-name="Replay battlefield">
      <div class="viewport-shell ui-debug-target" data-ui-name="Replay viewport shell">
        <div class="replay-zoom-controls ui-debug-target" data-ui-name="Replay zoom controls" aria-label="Replay zoom controls">
          <button class="replay-zoom-button ui-debug-target" data-ui-name="Zoom in button" type="button" aria-label="Zoom In" title="Zoom In" on:click={zoomReplayIn}>+</button>
          <button class="replay-zoom-button ui-debug-target" data-ui-name="Zoom out button" type="button" aria-label="Zoom Out" title="Zoom Out" on:click={zoomReplayOut}>-</button>
          <button class="replay-reset-button ui-debug-target" data-ui-name="Reset zoom button" type="button" aria-label="Reset Zoom" title="Reset Zoom" on:click={resetReplayZoom}>Reset Zoom</button>
        </div>
        <div class="viewport ui-debug-target" data-ui-name="Battlefield canvas" bind:this={battleHost}></div>
      </div>
    </section>

    <section class="right replay-right ui-debug-target" data-ui-name="Replay right sidebar">
      <section class="panel collapsible-panel ui-debug-target" data-ui-name="Alive counts panel">
        <button class="panel-toggle ui-debug-target" data-ui-name="Toggle alive counts panel" on:click={() => (replayAliveCountsExpanded = !replayAliveCountsExpanded)}>
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
                    <div class="alive-unit-card ui-debug-target" data-ui-name={`Player alive card ${label}`} class:selected={selectedReplayProfileKey === replayProfileKey('player', label)}>
                      <button
                        type="button"
                        class="alive-unit-main ui-debug-target"
                        data-ui-name={`Player alive row ${label}`}
                        on:click={() => selectReplayProfile('player', label)}
                        on:mouseenter={() => previewReplayProfile('player', label)}
                        on:focus={() => previewReplayProfile('player', label)}
                        on:mouseleave={clearReplayProfilePreview}
                        on:blur={clearReplayProfilePreview}
                      >
                        <span>{label}</span>
                        <strong>{count}</strong>
                      </button>
                      <button type="button" class="alive-cycle-button ui-debug-target" data-ui-name={`Cycle player units ${label}`} aria-label={`Cycle ${label} units`} on:click={() => cycleReplayProfileUnit('player', label)}>
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
                    <div class="alive-unit-card ui-debug-target" data-ui-name={`Enemy alive card ${label}`} class:selected={selectedReplayProfileKey === replayProfileKey('enemy', label)}>
                      <button
                        type="button"
                        class="alive-unit-main ui-debug-target"
                        data-ui-name={`Enemy alive row ${label}`}
                        on:click={() => selectReplayProfile('enemy', label)}
                        on:mouseenter={() => previewReplayProfile('enemy', label)}
                        on:focus={() => previewReplayProfile('enemy', label)}
                        on:mouseleave={clearReplayProfilePreview}
                        on:blur={clearReplayProfilePreview}
                      >
                        <span>{label}</span>
                        <strong>{count}</strong>
                      </button>
                      <button type="button" class="alive-cycle-button ui-debug-target" data-ui-name={`Cycle enemy units ${label}`} aria-label={`Cycle ${label} units`} on:click={() => cycleReplayProfileUnit('enemy', label)}>
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

      <section class="collapsible-stack ui-debug-target" data-ui-name="Replay event log stack" class:collapsed={replayEventLogCollapsed}>
        <button class="panel panel-toggle event-log-toggle ui-debug-target" data-ui-name="Toggle event log" on:click={() => (replayEventLogCollapsed = !replayEventLogCollapsed)}>
          <div>
            <p class="eyebrow">Event Log</p>
            <strong>{replayEventLogCollapsed ? 'Collapsed' : 'Live Timeline'}</strong>
          </div>
          <span>{replayEventLogCollapsed ? 'Show' : 'Hide'}</span>
        </button>
        {#if replayEventLogCollapsed}
          <section class="panel replay-health-overview ui-debug-target" data-ui-name="Collapsed event log health overview" aria-label="Replay health overview">
            {#each replayHealthOverview as side}
              <section class="replay-health-side" class:enemy={side.side === 'enemy'} style={`--replay-health-units-min-height: ${side.unitsMinHeight};`}>
                <div class="replay-health-total">
                  <div class="replay-health-total-label">
                    <span>{side.label}</span>
                    <strong>{side.hpLabel}</strong>
                  </div>
                  <div class="replay-health-bar total" aria-hidden="true">
                    <span style={`width: ${side.hpPercent}`}></span>
                  </div>
                </div>

                {#if side.units.length === 0}
                  <p class="replay-health-empty">No units standing.</p>
                {:else}
                  <div class="replay-health-units">
                    {#each side.units as entry}
                      <button
                        type="button"
                        class="replay-health-unit ui-debug-target"
                        data-ui-name={`Health overview ${side.label} ${entry.unit.id}`}
                        title={`${entry.unit.troopLabel} ${entry.hpLabel}`}
                        aria-label={`${entry.unit.troopLabel} health ${entry.hpLabel}`}
                        on:click={() => setReplayUnitLock(entry.unit.id, { toggle: true, profileKey: replayProfileKey(entry.unit.side, entry.unit.troopLabel) })}
                      >
                        <img src={entry.portraitUrl} alt="" aria-hidden="true" />
                        <div class="replay-health-unit-main">
                          <div class="replay-health-bar" aria-hidden="true">
                            <span style={`width: ${entry.hpPercent}`}></span>
                          </div>
                        </div>
                      </button>
                    {/each}
                  </div>
                {/if}
              </section>
            {/each}
          </section>
        {:else}
          <div class="event-log-wrap">
            <EventLog
              steps={replay?.steps ?? []}
              selected={$gameStore.selectedEvent}
              currentStep={$gameStore.currentStep}
              pinnedExplanationIndex={pinnedReplayExplanationIndex}
              showTitle={false}
              onSelect={selectReplayEvent}
              onPinExplanation={pinReplayExplanation}
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

{#if debugToolsEnabled && !verificationLabMode && designModeEnabled}
  <DesignModePanel
    selectedDesignTargetName={selectedDesignTargetName}
    designTweaksByTarget={designTweaksByTarget}
    onClose={() => (designModeEnabled = false)}
    onUpdateTweak={updateSelectedDesignTweak}
    onClearSelected={clearSelectedDesignTweaks}
    onDeselect={() => (selectedDesignTargetName = null)}
    onResetAll={resetAllDesignTweaks}
  />
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

  .overworld-shell.troops-mode {
    width: min(1700px, 100%);
    grid-template-columns: minmax(250px, 282px) minmax(760px, 1fr) minmax(260px, 320px);
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
  .archive-card small {
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
    align-items: center;
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

  button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .opening-actions {
    justify-content: flex-end;
  }

  .ui-debug-visible .ui-debug-target {
    position: relative;
  }

  .ui-debug-visible .ui-debug-target::after {
    content: attr(data-ui-name);
    position: absolute;
    top: 0.35rem;
    left: 0.35rem;
    z-index: 40;
    max-width: min(14rem, calc(100% - 0.7rem));
    padding: 0.16rem 0.36rem;
    border-radius: 0.45rem;
    background: rgba(244, 196, 92, 0.94);
    color: #1d1406;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1.2;
    text-transform: uppercase;
    pointer-events: none;
    white-space: normal;
  }

  .design-mode-enabled .ui-debug-target {
    outline: 1px dashed rgba(244, 196, 92, 0.32);
    outline-offset: 1px;
  }

  :global(.ui-debug-target[data-design-selected]) {
    outline: 2px solid rgba(112, 219, 255, 0.92);
    outline-offset: 2px;
    box-shadow: 0 0 0 2px rgba(6, 10, 18, 0.82);
  }

  :global(.ui-debug-target[data-design-tweaked]:not([data-design-selected])) {
    outline-color: rgba(120, 245, 179, 0.65);
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

  .list-button {
    display: grid;
    gap: 0.25rem;
    align-items: center;
  }

  .draft-offer-block .list-button {
    grid-template-columns: minmax(0, 1fr) auto;
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
      box-shadow 120ms ease,
      background 120ms ease;
  }

  .archive-card:hover,
  .troop-chip:hover,
  .list-button:hover,
  .draft-option:hover,
  .draft-troop-icon:hover,
  .unit-tile:hover,
  .sprite-inspect-button:hover,
  .mutator-chip:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .archive-card.selected,
  .troop-chip.selected,
  .list-button.selected,
  .title-button.selected,
  .draft-option.selected,
  .draft-troop-icon.selected,
  .sprite-inspect-button.selected,
  .unit-tile.selected {
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

  .reward-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.24rem 0.5rem;
    border-radius: 999px;
    border: 1px solid rgba(124, 153, 176, 0.18);
    background: rgba(20, 28, 38, 0.72);
    color: #dce7f2;
    font-size: 0.74rem;
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
    gap: 0.5rem;
    align-items: center;
  }

  .rift-title-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }

  .rift-tier-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 1.9rem;
    padding: 0.16rem 0.56rem;
    border-radius: 999px;
    border: 1px solid rgba(213, 178, 116, 0.3);
    background: rgba(31, 24, 16, 0.8);
    color: #f5f0de;
    font-size: 0.88rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .rift-name-text {
    min-width: 0;
    color: #9db2c4;
    font-size: 0.74rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .rift-fit-pill {
    flex: 0 0 auto;
  }

  .rift-mutator-chip {
    flex: 0 1 auto;
    justify-content: center;
    text-align: center;
    min-height: 1.9rem;
    min-width: 0;
    max-width: 8.5rem;
    padding-inline: 0.5rem;
    font-size: 0.76rem;
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
    width: 3.8rem;
    height: 3.8rem;
    min-height: 3.8rem;
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

  .draggable-troop-tile {
    justify-content: center;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .draggable-troop-tile:active {
    cursor: grabbing;
  }

  .unit-tile.assigned {
    border-color: rgba(185, 195, 203, 0.54);
    background:
      linear-gradient(145deg, rgba(82, 88, 96, 0.92), rgba(37, 42, 49, 0.96)),
      radial-gradient(circle at 30% 15%, rgba(234, 239, 242, 0.2), transparent 52%);
    box-shadow:
      inset 0 0 0 1px rgba(238, 243, 246, 0.18),
      0 10px 20px rgba(0, 0, 0, 0.22);
  }

  .assigned-summary-tile {
    border-color: rgba(185, 195, 203, 0.54);
    background:
      linear-gradient(145deg, rgba(78, 84, 92, 0.9), rgba(32, 37, 44, 0.96)),
      radial-gradient(circle at 30% 15%, rgba(234, 239, 242, 0.18), transparent 52%);
    box-shadow: inset 0 0 0 1px rgba(238, 243, 246, 0.16);
  }

  .unit-tile.assigned.selected,
  .unit-tile.assigned-summary-tile.selected {
    border-color: rgba(218, 190, 140, 0.72);
    background:
      linear-gradient(145deg, rgba(86, 93, 102, 0.94), rgba(35, 40, 47, 0.98)),
      radial-gradient(circle at 28% 12%, rgba(246, 249, 250, 0.22), transparent 54%);
    box-shadow:
      inset 0 0 0 2px rgba(218, 190, 140, 0.45),
      0 10px 22px rgba(0, 0, 0, 0.24);
  }

  .assignment-panel .unit-tile small {
    display: none;
  }

  .drop-target-active {
    border-color: rgba(218, 190, 140, 0.78);
    box-shadow:
      inset 0 0 0 2px rgba(218, 190, 140, 0.42),
      0 0 28px rgba(218, 190, 140, 0.18);
  }

  .troop-drag-ghost {
    position: fixed;
    z-index: 80;
    display: grid;
    width: 4rem;
    height: 4rem;
    place-items: center;
    pointer-events: none;
    transform: translate(-50%, -50%) rotate(-3deg);
    border: 1px solid rgba(234, 239, 242, 0.64);
    border-radius: 18px;
    background:
      linear-gradient(145deg, rgba(91, 98, 107, 0.94), rgba(35, 40, 47, 0.98)),
      radial-gradient(circle at 32% 18%, rgba(255, 255, 255, 0.24), transparent 54%);
    box-shadow:
      0 18px 44px rgba(0, 0, 0, 0.5),
      inset 0 0 0 1px rgba(255, 255, 255, 0.16);
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
  .detail-panel p,
  .archive-card small,
  .replay-header p {
    color: #a7b8c8;
  }

  .draft-screen-header {
    display: grid;
    gap: 0.55rem;
    margin-bottom: var(--ui-space-md);
    max-width: 920px;
  }

  .draft-screen-header h1 {
    margin: 0;
    font-size: var(--ui-text-title);
  }

  .draft-screen-header p {
    max-width: 70ch;
    margin: 0;
    color: #a7b8c8;
  }

  .draft-screen-header .opening-instructions {
    max-width: none;
  }

  .draft-screen-header .scheduled-unlock-instructions {
    max-width: none;
    font-size: clamp(0.68rem, 0.62vw, 0.78rem);
    white-space: nowrap;
  }

  .scheduled-faction-shell {
    width: min(1780px, 100%);
    max-height: calc(100vh - (2 * var(--ui-space-md)));
    overflow: auto;
  }

  .scheduled-faction-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .scheduled-faction-layout.has-detail {
    grid-template-columns: minmax(240px, 288px) minmax(0, 1fr);
  }

  .scheduled-faction-layout .draft-grid {
    overflow: visible;
  }

  .faction-unlock-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  .faction-unlock-card {
    display: grid;
    gap: var(--ui-space-sm);
    align-content: start;
  }

  .faction-unlock-card > .primary {
    margin-top: auto;
  }

  .troop-preview-row {
    grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
  }

  .troop-preview {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    min-height: 4.6rem;
    padding: 0.45rem;
    border: 1px solid rgba(124, 153, 176, 0.18);
    border-radius: var(--ui-panel-radius-tight);
    color: #edf4fa;
    text-align: center;
    font-size: 0.82rem;
  }

  .scheduled-faction-shell .troop-preview {
    min-height: 3.75rem;
    padding: 0.35rem;
    font-size: 0.76rem;
  }

  .scheduled-faction-shell .troop-preview .unit-button-art {
    width: 1.65rem;
    height: 1.65rem;
  }

  .troop-preview.native {
    background: rgba(24, 41, 48, 0.74);
  }

  .troop-preview.future {
    border-style: dashed;
    background: rgba(50, 36, 20, 0.7);
    color: #f5d6a1;
  }

  .troop-preview.empty {
    place-items: center;
    color: #a7b8c8;
  }

  .upgrade-grant {
    border-color: rgba(213, 178, 116, 0.48);
    background: rgba(45, 34, 18, 0.78);
  }

  .troop-type-unlock-grid {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .troop-type-choice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    justify-content: start;
  }

  .troop-type-choice .unit-button-art {
    width: 1.75rem;
    height: 1.75rem;
  }

  .floating-detail-panel {
    position: fixed;
    right: var(--ui-space-md);
    bottom: var(--ui-space-md);
    z-index: 21;
    width: min(360px, calc(100vw - (2 * var(--ui-space-md))));
    max-height: min(44vh, 360px);
    overflow: auto;
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
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    justify-items: start;
    gap: 0.75rem;
    padding-bottom: 0.4rem;
  }

  .action-rail > button:only-child {
    grid-column: 2;
  }

  .archive-actions-stack {
    grid-column: 2;
    display: grid;
    gap: 0.75rem;
    justify-items: end;
  }

  .end-cycle-button {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
    align-self: end;
    z-index: 1;
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

  .menu-topline {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--ui-space-md);
    position: relative;
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

  .draft-troop-icon.incompatible {
    cursor: not-allowed;
    border-color: rgba(126, 157, 181, 0.12);
    background: rgba(20, 28, 38, 0.42);
    color: rgba(167, 184, 200, 0.58);
    filter: grayscale(0.85);
    opacity: 0.56;
  }

  .draft-troop-icon.incompatible:hover {
    transform: none;
    border-color: rgba(126, 157, 181, 0.12);
    box-shadow: none;
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

  .ready-troops-panel {
    gap: 0.55rem;
    padding-block: 0.9rem;
  }

  .footer-ready-troops-panel {
    width: min(620px, 100%);
    grid-column: 1 / -1;
    grid-row: 1;
    justify-self: center;
  }

  .ready-troops-grid {
    display: grid;
    gap: 0.55rem;
    grid-auto-flow: column;
    grid-auto-columns: 4.35rem;
    overflow-x: auto;
    padding-bottom: 0.15rem;
  }

  .ready-troop-tile {
    width: 4.35rem;
    min-height: 3.7rem;
    padding: 0.55rem;
  }

  .faction-grid {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }

  .troop-faction-grid {
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 0.65rem;
  }

  .rift-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  .rift-card {
    padding: var(--ui-space-sm);
  }

  @media (max-width: 560px) {
    .draft-screen-header .scheduled-unlock-instructions {
      white-space: normal;
    }

    .rift-title-card {
      grid-template-columns: minmax(0, 1fr);
    }

    .rift-title-line {
      order: 2;
    }

    .rift-title-card .rift-visual-shell.inline {
      order: 1;
      justify-self: end;
    }
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

  .faction-card-top {
    display: grid;
    grid-template-columns: minmax(150px, 0.9fr) minmax(170px, 1.1fr);
    gap: 0.55rem;
    align-items: stretch;
  }

  .faction-card-top .faction-name-button {
    min-height: 4.5rem;
  }

  .faction-card-upgrades {
    gap: 0.35rem;
  }

  .faction-card-upgrades .list-button {
    min-height: 2rem;
  }

  .faction-troop-list {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.45rem;
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
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .troops-mode .faction-card {
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
  }

  .troops-mode .troop-chip,
  .troops-mode .list-button {
    padding: 0.55rem 0.65rem;
  }

  .troops-mode .troop-chip {
    justify-content: flex-start;
  }

  .troops-mode .unit-button-copy {
    gap: 0.55rem;
  }

  .troops-mode .unit-button-copy > span {
    white-space: nowrap;
  }

  .scheduled-faction-shell .draft-screen-header {
    max-width: none;
  }

  .scheduled-faction-shell .scheduled-faction-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .scheduled-faction-shell .scheduled-faction-layout.has-detail {
    grid-template-columns: minmax(240px, 288px) minmax(0, 1fr);
  }

  .scheduled-faction-shell .faction-unlock-grid {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .affected-troop-strip {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.2rem;
  }

  .affected-troop-strip img {
    width: 1.35rem;
    height: 1.35rem;
    image-rendering: pixelated;
    object-fit: contain;
  }

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

  .replay-title-row {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
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

  .replay-explanation-panel {
    gap: 0.75rem;
  }

  .replay-explanation-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .replay-explanation-clear {
    min-height: 1.8rem;
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    border: 1px solid rgba(196, 214, 227, 0.22);
    background: rgba(12, 18, 28, 0.52);
    color: #d8e4f0;
    font: inherit;
    font-size: 0.72rem;
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

  .replay-health-overview {
    min-height: 0;
    overflow: auto;
    column-gap: 1.15rem;
    row-gap: 0.75rem;
    padding: 0.65rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
  }

  .replay-health-side {
    display: grid;
    grid-template-rows: 2.75rem auto;
    gap: 0.45rem;
    align-content: start;
    min-width: 0;
  }

  .replay-health-total {
    display: grid;
    grid-template-rows: 1.5rem 0.52rem;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.35rem;
    min-height: 2.37rem;
    min-width: 0;
  }

  .replay-health-total-label {
    display: grid;
    grid-template-columns: minmax(0, auto) minmax(6.7rem, 1fr);
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
  }

  .replay-health-total-label span {
    color: #c9d8e5;
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    min-width: 0;
    overflow: hidden;
    text-overflow: clip;
    text-transform: uppercase;
  }

  .replay-health-total-label strong {
    color: #f3ead0;
    font-family: var(--ui-font-mono);
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.2;
    text-align: right;
    white-space: nowrap;
  }

  .replay-health-side.enemy .replay-health-total-label strong {
    color: #ffd1d1;
  }

  .replay-health-bar {
    width: 100%;
    min-width: 0;
    height: 0.35rem;
    overflow: hidden;
    border-radius: var(--ui-panel-radius-pill);
    background: rgba(5, 9, 14, 0.74);
    box-shadow: inset 0 0 0 1px rgba(196, 214, 227, 0.12);
  }

  .replay-health-bar.total {
    height: 0.52rem;
  }

  .replay-health-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #6fbf81, #d9c66f);
    transition: width 140ms ease-out;
  }

  .replay-health-side.enemy .replay-health-bar span {
    background: linear-gradient(90deg, #c86464, #d8a35e);
  }

  .replay-health-units {
    display: grid;
    grid-auto-rows: 1.9rem;
    gap: 0.28rem;
    min-height: var(--replay-health-units-min-height, 0);
  }

  .replay-health-unit {
    display: grid;
    grid-template-columns: 1.5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.35rem;
    min-height: 1.9rem;
    height: 1.9rem;
    width: 100%;
    padding: 0.22rem 0.28rem;
    border: 1px solid rgba(124, 153, 176, 0.13);
    border-radius: 8px;
    background: rgba(15, 22, 31, 0.72);
    color: #f4f7fb;
    text-align: left;
  }

  .replay-health-unit:hover,
  .replay-health-unit:focus-visible {
    border-color: rgba(213, 178, 116, 0.55);
    background: rgba(35, 29, 21, 0.82);
  }

  .replay-health-unit img {
    width: 1.5rem;
    height: 1.5rem;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .replay-health-unit-main {
    display: grid;
    min-width: 0;
  }

  .replay-health-empty {
    margin: 0;
    min-height: var(--replay-health-units-min-height, 0);
    color: #97a9ba;
    font-size: 0.8rem;
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

    .overworld-shell {
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }

    .overworld-shell.troops-mode {
      width: min(1240px, 100%);
      grid-template-columns: 1fr;
    }

    .overworld-shell .left-column,
    .overworld-shell .center-column,
    .overworld-shell .right-column {
      overflow: visible;
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

    .menu-topline {
      flex-direction: column;
    }


    .action-rail {
      grid-template-columns: 1fr;
    }

    .action-rail > button:only-child,
    .end-cycle-button,
    .archive-actions-stack,
    .footer-ready-troops-panel {
      grid-column: 1;
    }

    .archive-actions-stack,
    .end-cycle-button {
      justify-self: stretch;
    }

    .footer-ready-troops-panel {
      justify-self: stretch;
    }

    .end-cycle-button {
      width: 100%;
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
