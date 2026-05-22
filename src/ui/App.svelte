<svelte:head>
  <title>Shiftmake</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createTroopInstance,
    getFactionTroops,
    getTroopQuantityBreakdown,
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
    getSummonedUnitPreviews,
    getTroopTypeUpgrade,
    getUnitType,
    isNativeTroopUnlockId,
  } from '../engine/unitCatalog';
  import type {
    AbilityDefinition,
    BattleReportDiagnostic,
    BattleParticipantKind,
    BattleReplay,
    BattleStep,
    BattleUnit,
    BattleOutcome,
    ContestPlayerState,
    ExplainedStatKey,
    FactionId,
    GameMode,
    StoredReplayPayload,
    ResolvedCombatantDefinition,
    RiftInstance,
    RiftResolutionRecord,
    SideId,
    StatBreakdown,
    StatBreakdownLine,
    TroopId,
    TroopUnlockId,
    UnitTypeId,
    UpgradeId,
  } from '../engine/types';
  import { describeTroopUnlock, getAvailableTroopUnlockIds, upgradeAffectsTroop } from '../engine/upgrades';
  import type { BattleRenderer as BattleRendererType, UnitPointerInfo } from '../rendering/BattleRenderer';
  import { getFactionSpriteUrl, loadFactionUnitPortraitUrls } from '../rendering/unitVisualAssets';
  import { getConfiguredMultiplayerServerUrl, hasConfiguredMultiplayerServerUrl, inferShareableMultiplayerServerUrl, normalizeMultiplayerServerUrl } from '../config/multiplayer';
  import { gameStore, readLastMultiplayerPlayerName, readLastMultiplayerServerUrl } from '../store/gameStore';
  import type { SaveSlotSummary } from '../store/saveSlots';
  import BattleControls from './BattleControls.svelte';
  import DebugToolsMenu from './DebugToolsMenu.svelte';
  import DesignModePanel, { type DesignTweakField, type DesignTweaks } from './DesignModePanel.svelte';
  import EventLog from './EventLog.svelte';
  import GameIcon from './GameIcon.svelte';
  import { displayIcon, formatAbilityDescription, statIcon } from './inspectText';
  import ReplayStepExplanation from './ReplayStepExplanation.svelte';
  import { buildReplayStepExplanationView } from './replayStepExplanation';
  import { getRiftVisual } from './riftVisuals';
  import StatBreakdownGrid from './StatBreakdownGrid.svelte';
  import UnitTooltip from './UnitTooltip.svelte';
  import { buildBattleRecap, findLastAliveStep, isUnitAliveAtStep, type BattleRecapTroopEntry } from './battleRecap';
import { CAMPAIGN_FINAL_CYCLE, CONTEST_FINAL_CYCLE, canAssignTroopToRift, getEssenceDraftCost, getOpeningFactionOptionIds, getOpeningFactionStarterTroopUnlockIds } from '../engine/game';

  type StatEntry = {
    key: string;
    label: string;
    name?: string;
    description?: string;
    value: string;
    comparisonDelta?: string;
    comparisonDirection?: 'positive' | 'negative';
    breakdown: StatBreakdown | null;
  };

  type DetailCard =
    | {
        detailKey: string;
        kind: 'mutator' | 'faction' | 'upgrade';
        label: string;
        description: string;
        iconKind?: 'upgrade' | 'mutator';
        iconId?: string;
        stats?: StatEntry[];
      }
    | {
        detailKey: string;
        kind: 'unit';
        inspectLabel: string;
        label: string;
        description: string;
        portraitUrl: string;
        quantity: number;
        factionId: FactionId;
        unitTypeId: UnitTypeId;
        stats: StatEntry[];
        abilities: Array<{
          id: string;
          label: string;
          description: string;
          summoned: Array<{
            key: string;
            label: string;
            count: number;
            detail: DetailCard;
          }>;
        }>;
      };

  type TroopDropTarget = { kind: 'rift'; riftId: string } | { kind: 'ready' };
  type MainMenuView = 'home' | 'singleplayer' | 'multiplayer' | 'debug' | 'settings';
  type CycleRecord = RiftResolutionRecord;

  type RiftBattleAnimationSide = {
    label: string;
    kind: BattleParticipantKind;
    loses: boolean;
  };

  type RiftBattleAnimationPhase = {
    key: string;
    replayId: string;
    delayClass: 'phase-now' | 'phase-late';
    left: RiftBattleAnimationSide;
    right: RiftBattleAnimationSide;
  };

  type RiftBattleAnimationView = {
    riftId: string;
    phases: RiftBattleAnimationPhase[];
  };

  type ForceLossTiming = 'now' | 'late' | null;

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
    initiativePercent: string;
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

  type ArchiveHealthTotal = {
    side: SideId;
    label: string;
    hpPercent: string;
    hpLabel: string;
  };

  const ARCHIVE_PARTICIPANT_FALLBACK: Record<SideId, { kind: BattleParticipantKind; label: string }> = {
    player: { kind: 'player', label: 'Player' },
    enemy: { kind: 'neutral', label: 'Neutral Guardians' },
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
  let topbarTooltip: { label: string; description: string } | null = null;
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
  let selectedTroopOfferUnlockId: TroopUnlockId | null = null;
  let selectedUpgradeOfferId: UpgradeId | null = null;
  let selectedScheduledFactionId: FactionId | null = null;
  let pendingOpeningTroopUnlockId: TroopUnlockId | null = null;
  let confirmedTroopOfferUnlockId: TroopUnlockId | null = null;
  let confirmedUpgradeOfferId: UpgradeId | null = null;
  let hoveredUpgradeOfferId: UpgradeId | null = null;
  let comparisonDetails: DetailCard[] = [];
  let assignmentConflict: { troopId?: TroopId; conflictTroopId?: TroopId; riftId?: string; message: string } | null = null;
  let archivePage = 0;
  let viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  let essenceDraftHighlighted = false;
  let essenceDraftHighlightTimer: ReturnType<typeof window.setTimeout> | null = null;
  let lastInspectContextKey = '';
  let rendererDiagnostics: BattleReportDiagnostic[] = [];
  let showUiDebugNames = false;
  let designModeEnabled = false;
  let selectedDesignTargetName: string | null = null;
  let designTweaksByTarget: Record<string, DesignTweaks> = {};
  let uiDebugVisible = false;
  let abilityVerificationLabComponent: typeof import('./AbilityVerificationLab.svelte').default | null = null;
  let multiplayerServerUrl = getConfiguredMultiplayerServerUrl();
  let multiplayerRoomCode = '';
  let multiplayerPlayerName = 'Player';
  let multiplayerCopyMessage: string | null = null;
  let multiplayerReadySubmitted = false;
  let multiplayerStatus: string | null = null;
  let mainMenuView: MainMenuView = 'home';
  let cycleAnimationFinishTimer: ReturnType<typeof window.setTimeout> | null = null;
  const multiplayerDefaultServerConfigured = hasConfiguredMultiplayerServerUrl();

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
    const unit =
      replaySnapshot.find((entry) => entry.id === unitId) ??
      replay?.initial.units.find((entry) => entry.id === unitId) ??
      replay?.steps.find((step) => step.snapshot.units.some((entry) => entry.id === unitId))?.snapshot.units.find((entry) => entry.id === unitId);
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

  function previewReplayUnit(unit: BattleUnit, event: MouseEvent | FocusEvent): void {
    if (lockedUnitId) {
      return;
    }
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    hoverInfo = {
      unitId: unit.id,
      x: rect.left + rect.width / 2,
      y: rect.top,
    };
    selectedReplayProfileKey = replayProfileKey(unit.side, unit.troopLabel);
    syncRenderer();
  }

  function clearReplayUnitPreview(unitId: string): void {
    if (lockedUnitId) {
      return;
    }
    if (hoverInfo?.unitId === unitId) {
      hoverInfo = null;
      syncRenderer();
    }
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

  function showTopbarTooltip(label: string, description: string): void {
    topbarTooltip = { label, description };
  }

  function clearTopbarTooltip(): void {
    topbarTooltip = null;
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
    breakdowns?: Partial<Record<ExplainedStatKey | 'quantity', StatBreakdown>>,
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
        breakdown: breakdowns?.quantity ?? null,
      });
    }

    return entries;
  }

  function withActiveComparisonDeltas(detail: DetailCard, comparisonDetail: DetailCard | null): StatEntry[] {
    if (detail.kind !== 'unit' || comparisonDetail?.kind !== 'unit' || comparisonDetail.detailKey === detail.detailKey) {
      return detail.kind === 'unit' ? detail.stats.slice(0, 8) : [];
    }

    return detail.stats.slice(0, 8).map((stat) => {
      const activeStat = comparisonDetail.stats.find((entry) => entry.key === stat.key);
      if (!activeStat) {
        return stat;
      }

      const delta = Number(activeStat.value) - Number(stat.value);
      if (delta === 0) {
        return stat;
      }

      return {
        ...stat,
        comparisonDelta: `${delta > 0 ? '+' : ''}${formatFixed(delta)}`,
        comparisonDirection: delta > 0 ? 'positive' : 'negative',
      };
    });
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

    faction.abilityIds.forEach((abilityId) => {
      const ability = getAbility(abilityId);
      parts.push(`${ability.label}: ${formatAbilityDescription(ability)}`);
    });

    return parts.length > 0 ? parts : ['No special modifiers.'];
  }

  function buildFactionDetail(factionId: FactionId): DetailCard {
    const faction = getFaction(factionId);
    const nonStatModifiers = [
      ...faction.abilityIds.map((abilityId) => {
        const ability = getAbility(abilityId);
        return `${ability.label}: ${formatAbilityDescription(ability)}`;
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
      description: nonStatModifiers.join(' '),
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
      iconKind: 'mutator',
      iconId: mutatorId,
    };
  }

  function buildUpgradeDetail(upgradeId: UpgradeId): DetailCard {
    const details = getUpgradeDetails(upgradeId);
    return {
      detailKey: `upgrade:${upgradeId}`,
      kind: 'upgrade',
      label: details.label,
      description: details.description,
      iconKind: 'upgrade',
      iconId: upgradeId,
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
    statBreakdowns?: Partial<Record<ExplainedStatKey | 'quantity', StatBreakdown>>,
  ): DetailCard {
    const safeDescription = description ?? 'Troop preview.';
    const lowerDescription = safeDescription.toLowerCase();
    return {
      detailKey,
      kind: 'unit',
      inspectLabel:
        /^enemy:/.test(detailKey) || lowerDescription.includes('enemy')
          ? 'Enemy Troop'
          : lowerDescription.includes('assigned') || /^rift-assigned:/.test(detailKey)
            ? 'Assigned Troop'
            : lowerDescription.includes('ready') || /^ready:/.test(detailKey)
              ? 'Ready Troop'
              : 'Troop Inspector',
      label,
      description: safeDescription,
      portraitUrl: getFactionUnitPortrait(factionId, unitTypeId),
      quantity,
      factionId,
      unitTypeId,
      stats: buildStatEntries(
        stats,
        { ...(statBreakdowns ?? {}), quantity: getTroopQuantityBreakdown(createTroopInstance(factionId, unitTypeId)) },
        true,
        quantity,
      ),
      abilities: abilities.map((ability) => {
        const summoned = getSummonedUnitPreviews(ability, factionId).map((preview) => ({
          key: `${ability.id}:${preview.unitTypeId}:${preview.count}:${preview.grantedAbilityIds.join(',')}`,
          label: preview.troop.label,
          count: preview.count,
          detail: buildResolvedUnitDetail(
            `summon-preview:${detailKey}:${ability.id}:${preview.unitTypeId}:${preview.grantedAbilityIds.join(',')}`,
            preview.troop.label,
            preview.troop.factionId,
            preview.troop.unitTypeId,
            preview.troop.stats,
            preview.troop.quantity,
            `${preview.count > 1 ? `${preview.count} units. ` : ''}${preview.consumesCorpse ? 'Requires a corpse. ' : ''}Summoned by ${ability.label}.`,
            preview.troop.abilities,
          ),
        }));
        return {
          id: ability.id,
          label: ability.label,
          description: formatAbilityDescription(ability),
          summoned,
        };
      }),
    };
  }

  function unitIconCopies(quantity: number): number[] {
    return Array.from({ length: Math.max(1, Math.min(12, Math.floor(quantity))) }, (_, index) => index);
  }

  function unitIconColumns(quantity: number): number {
    const count = Math.max(1, Math.min(12, Math.floor(quantity)));
    if (count <= 1) {
      return 1;
    }
    if (count <= 4) {
      return 2;
    }
    if (count <= 9) {
      return 3;
    }
    return 4;
  }

  function unitIconDensityClass(quantity: number): string {
    const count = Math.max(1, Math.min(12, Math.floor(quantity)));
    if (count >= 10) {
      return 'density-12';
    }
    if (count >= 7) {
      return 'density-9';
    }
    if (count >= 5) {
      return 'density-6';
    }
    if (count >= 2) {
      return 'density-4';
    }
    return 'density-1';
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

  function pinComparisonDetail(detail: DetailCard): void {
    if (detail.kind !== 'unit') {
      return;
    }
    const withoutExisting = comparisonDetails.filter((entry) => entry.detailKey !== detail.detailKey);
    comparisonDetails = [...withoutExisting, detail].slice(-4);
  }

  function removeComparisonDetail(detailKey: string): void {
    comparisonDetails = comparisonDetails.filter((entry) => entry.detailKey !== detailKey);
  }

  function clearDetail(): void {
    if (!pinnedDetail) {
      hoveredDetail = null;
    }
    hoveredAbilityTooltip = null;
  }

  function restoreOpeningFactionDetail(event: MouseEvent, factionDetail: DetailCard): void {
    const card = (event.currentTarget as HTMLElement).closest('.opening-faction-card');
    const nextTarget = event.relatedTarget;
    if (!pinnedDetail && card && nextTarget instanceof Node && card.contains(nextTarget)) {
      hoveredDetail = factionDetail;
      hoveredAbilityTooltip = null;
      return;
    }
    clearDetail();
  }

  function resetOverworldInspect(): void {
    hoveredDetail = null;
    pinnedDetail = null;
    hoveredAbilityTooltip = null;
    selectedTroopOfferUnlockId = null;
    selectedUpgradeOfferId = null;
    selectedScheduledFactionId = null;
    pendingOpeningTroopUnlockId = null;
    hoveredUpgradeOfferId = null;
    assignmentConflict = null;
  }

  function resetReplayInspect(): void {
    hoverInfo = null;
    lockedUnitId = null;
    hoveredReplayProfileKey = null;
    selectedReplayProfileKey = null;
    pinnedReplayExplanationIndex = null;
  }

  function resetZoneSelections(): void {
    selectedRiftId = null;
    selectedTroopId = null;
    selectedFactionId = null;
    selectedReplayId = null;
    suppressTroopClickId = null;
  }

  function resetZoneState(): void {
    resetOverworldInspect();
    resetReplayInspect();
    resetZoneSelections();
    clearTroopDragListeners();
    troopDrag = null;
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

    let strongIds = $gameStore.autoPlay ? [] : highlightedStep ? [highlightedStep.metadata?.activeUnitId ?? highlightedStep.actorIds[0] ?? highlightedStep.targetIds[0]].filter((id): id is string => Boolean(id)) : [];
    let faintIds = $gameStore.autoPlay
      ? []
      : highlightedStep
        ? (highlightedStep.metadata?.secondaryUnitIds ?? [...highlightedStep.actorIds.slice(1), ...highlightedStep.targetIds]).filter((id) => !strongIds.includes(id))
        : [];

    if (!$gameStore.autoPlay && lockedUnitId) {
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

    const highlightKey = `${$gameStore.autoPlay ? 'autoplay' : 'manual'}::${strongIds.join('|')}::${faintIds.join('|')}`;
    if (highlightKey !== renderedHighlightKey) {
      renderer.setHighlights(strongIds, faintIds);
      renderedHighlightKey = highlightKey;
    }
  }

  function handleResize(): void {
    viewportHeight = window.innerHeight;
    renderer?.refreshViewport();
  }

  function runManualReplayAction(action: () => void): void {
    gameStore.setAutoPlay(false);
    action();
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
    resetZoneState();
    if (slot.status === 'occupied') {
      gameStore.loadSlot(slot.slotId);
      return;
    }
    gameStore.startNewCampaign(slot.slotId, 'campaign');
  }

  function startSlot(slot: SaveSlotSummary, gameMode: GameMode): void {
    resetZoneState();
    gameStore.startNewCampaign(slot.slotId, gameMode);
  }

  function restartSlot(slot: SaveSlotSummary, gameMode: GameMode): void {
    resetZoneState();
    gameStore.startNewCampaign(slot.slotId, gameMode);
  }

  function createMultiplayerContest(): void {
    resetZoneState();
    gameStore.connectMultiplayerContest(normalizeMultiplayerServerUrl(multiplayerServerUrl), undefined, multiplayerPlayerName);
  }

  function joinMultiplayerContest(): void {
    const roomId = multiplayerRoomCode.trim().toUpperCase();
    if (!roomId) {
      return;
    }
    resetZoneState();
    gameStore.connectMultiplayerContest(normalizeMultiplayerServerUrl(multiplayerServerUrl), roomId, multiplayerPlayerName);
  }

  function reconnectMultiplayerContest(): void {
    resetZoneState();
    gameStore.reconnectMultiplayerContest(multiplayerPlayerName);
  }

  function cancelMultiplayerReady(): void {
    gameStore.cancelMultiplayerReady();
  }

  function leaveMultiplayerContest(): void {
    resetZoneState();
    mainMenuView = 'multiplayer';
    multiplayerCopyMessage = null;
    gameStore.leaveMultiplayerContest();
  }

  function getShareRoomLink(): string {
    if (typeof window === 'undefined' || !$gameStore.multiplayer?.roomId) {
      return '';
    }
    const url = new URL(window.location.href);
    url.searchParams.set('room', $gameStore.multiplayer.roomId);
    url.searchParams.set('server', inferShareableMultiplayerServerUrl($gameStore.multiplayer.serverUrl, window.location.href));
    return url.toString();
  }

  async function copyTextToClipboard(value: string, successMessage: string): Promise<void> {
    if (!value) {
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement('textarea');
        input.value = value;
        input.setAttribute('readonly', 'true');
        input.style.position = 'fixed';
        input.style.top = '-1000px';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(input);
        if (!copied) {
          throw new Error('Clipboard command failed.');
        }
      }
      multiplayerCopyMessage = successMessage;
    } catch {
      multiplayerCopyMessage = 'Copy failed.';
    }
  }

  function copyRoomCode(): void {
    void copyTextToClipboard($gameStore.multiplayer?.roomId ?? '', 'Room code copied.');
  }

  function copyRoomLink(): void {
    void copyTextToClipboard(getShareRoomLink(), 'Room link copied.');
  }

  function returnToMainMenu(): void {
    resetZoneState();
    mainMenuView = 'home';
    gameStore.returnToMainMenu();
  }

  function showMainMenuView(view: MainMenuView): void {
    mainMenuView = view;
    multiplayerCopyMessage = null;
  }

  function beginOpeningCampaign(): void {
    resetZoneState();
    pendingOpeningTroopUnlockId = null;
    gameStore.startOpeningCampaign();
  }

  function chooseFactionUnlock(factionId: FactionId): void {
    resetZoneState();
    gameStore.claimFactionUnlockOffer(factionId);
  }

  function selectScheduledFactionUnlock(factionId: FactionId): void {
    selectedScheduledFactionId = selectedScheduledFactionId === factionId ? null : factionId;
  }

  function confirmScheduledFactionUnlock(): void {
    if (!selectedScheduledFactionId) {
      return;
    }
    chooseFactionUnlock(selectedScheduledFactionId);
    selectedScheduledFactionId = null;
  }

  function chooseTroopTypeUnlock(troopUnlockId: TroopUnlockId): void {
    resetZoneState();
    gameStore.claimTroopTypeUnlockOffer(troopUnlockId);
  }

  function handleEndCycle(): void {
    if ($gameStore.centerMode !== 'rifts') {
      gameStore.setCenterMode('rifts');
    }
    gameStore.endCycle($gameStore.cycleEndConfirmationPending);
  }

  function multiplayerReadyLabel(): string {
    const playerId = $gameStore.multiplayer?.playerId;
    if (!$gameStore.multiplayer || !playerId) {
      return 'Submit Ready';
    }
    return $gameStore.multiplayer.readiness[playerId] ? `Waiting For ${getOpponentPlayerName()}` : 'Submit Ready';
  }

  function playerConnectionLabel(playerId: 'human' | 'ai'): string {
    if (!$gameStore.multiplayer?.connectedPlayers[playerId]) {
      return 'Offline';
    }
    return $gameStore.multiplayer.readiness[playerId] ? 'Ready' : 'Choosing';
  }

  function setRiftCenterMode(): void {
    resetZoneState();
    gameStore.setCenterMode('rifts');
  }

  function setTroopCenterMode(): void {
    resetZoneState();
    gameStore.setCenterMode('troops');
  }

  function focusEssenceDraft(): void {
    gameStore.setCenterMode('rifts');
    essenceDraftHighlighted = true;
    if (essenceDraftHighlightTimer) {
      window.clearTimeout(essenceDraftHighlightTimer);
    }
    essenceDraftHighlightTimer = window.setTimeout(() => {
      essenceDraftHighlighted = false;
      essenceDraftHighlightTimer = null;
    }, 2400);
  }

  function setContestCenterMode(): void {
    resetZoneState();
    gameStore.setCenterMode('contest');
  }

  function selectFaction(factionId: FactionId): void {
    const nextFactionId = selectedFactionId === factionId ? null : factionId;
    resetOverworldInspect();
    selectedRiftId = null;
    selectedTroopId = null;
    selectedReplayId = null;
    selectedFactionId = nextFactionId;
    gameStore.setCenterMode('troops');
  }

  function handleFactionHeaderClick(factionId: FactionId, factionDetail: DetailCard): void {
    const wasSelected = selectedFactionId === factionId;
    selectFaction(factionId);

    if (wasSelected) {
      pinnedDetail = null;
      hoveredDetail = null;
      return;
    }

    togglePinnedDetail(factionDetail);
  }

  function pinTroopDetail(troopId: TroopId, detail: DetailCard): void {
    selectedTroopId = selectedTroopId === troopId ? null : troopId;
    togglePinnedDetail(detail);
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

  function isHoldingTroop(troopId: TroopId): boolean {
    return $gameStore.game.gameMode === 'contest' &&
      $gameStore.game.openRifts.some((rift) => rift.controller === 'human' && (rift.occupyingTroopIds ?? []).includes(troopId));
  }

  function isUpgradeAffectingTroop(troopId: TroopId): boolean {
    const upgradeId = hoveredUpgradeOfferId ?? selectedUpgradeOfferId;
    const troop = $gameStore.game.troops.find((entry) => entry.id === troopId);
    return !!upgradeId && !!troop && upgradeAffectsTroop(upgradeId, troop);
  }

  function getDropValidationMessage(troopId: TroopId, target: TroopDropTarget | null): string | null {
    if (!target || target.kind === 'ready') {
      return null;
    }
    const result = canAssignTroopToRift($gameStore.game, troopId, target.riftId);
    return result.ok ? null : result.issues[0]?.message ?? 'This troop cannot be assigned here.';
  }

  function getRiftDropValidationMessage(riftId: string): string | null {
    return troopDrag?.active && troopDrag.dropTarget?.kind === 'rift' && troopDrag.dropTarget.riftId === riftId
      ? getDropValidationMessage(troopDrag.troopId, troopDrag.dropTarget)
      : null;
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
    if (troopDrag || isHoldingTroop(troopId) || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }

    event.preventDefault();
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
    if (troopDrag || isHoldingTroop(troopId) || event.button !== 0) {
      return;
    }

    event.preventDefault();
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

    selectedReplayId = null;
    pinTroopDetail(troopId, detail);
  }

  function handleRosterTroopClick(troopId: TroopId, detail: DetailCard): void {
    selectedRiftId = null;
    selectedFactionId = null;
    selectedReplayId = null;
    gameStore.setCenterMode('troops');
    pinTroopDetail(troopId, detail);
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
      assignmentConflict = null;
      return;
    }

    if (dropTarget.riftId !== sourceRiftId) {
      const assignment = canAssignTroopToRift($gameStore.game, troopId, dropTarget.riftId);
      if (!assignment.ok) {
        const issue = assignment.issues[0];
        assignmentConflict = issue
          ? {
              troopId: issue.troopId ?? troopId,
              conflictTroopId: issue.conflictTroopId,
              riftId: issue.riftId ?? dropTarget.riftId,
              message: issue.message,
            }
          : { troopId, riftId: dropTarget.riftId, message: 'This troop cannot be assigned here.' };
        return;
      }
      assignmentConflict = null;
      gameStore.assignTroopToRift(troopId, dropTarget.riftId);
    }
  }

  function startNativeTroopDrag(event: DragEvent, troopId: TroopId, sourceRiftId: string | null): void {
    if (!event.dataTransfer || isHoldingTroop(troopId)) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-shiftmake-troop', JSON.stringify({ troopId, sourceRiftId }));
    const troop = $gameStore.game.troops.find((entry) => entry.id === troopId);
    if (troop) {
      const troopDef = getTroopEffectiveDefinition($gameStore.game, troopId);
      beginTroopDrag(null, event.clientX, event.clientY, troopId, sourceRiftId, troopDef.label, getFactionUnitPortrait(troop.factionId, troop.unitTypeId));
      troopDrag = troopDrag ? { ...troopDrag, active: true, dropTarget: getTroopDropTarget(event.clientX, event.clientY) } : null;
    }
  }

  function allowNativeTroopDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    if (troopDrag) {
      troopDrag = {
        ...troopDrag,
        x: event.clientX,
        y: event.clientY,
        active: true,
        dropTarget: getTroopDropTarget(event.clientX, event.clientY),
      };
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
      resetZoneState();
      gameStore.openReplay(selectedReplayEntry.replayId);
    }
  }

  function closeReplayToArchive(): void {
    const replayId = $gameStore.loadedReplay?.id ?? null;
    gameStore.closeReplay();
    gameStore.setCenterMode('rifts');
    if (replayId) {
      selectedReplayId = replayId;
    }
  }

  function showAbilityTooltip(ability: AbilityDefinition | { label: string; description: string }): void {
    hoveredAbilityTooltip = {
      label: ability.label,
      description: 'shortText' in ability ? formatAbilityDescription(ability) : ability.description,
    };
  }

  function selectTroopOfferUnlock(troopUnlockId: TroopUnlockId, detail: DetailCard): void {
    if (selectedTroopOfferUnlockId === troopUnlockId) {
      selectedTroopOfferUnlockId = null;
      pinnedDetail = null;
      hoveredDetail = null;
      hoveredAbilityTooltip = null;
      return;
    }

    selectedTroopOfferUnlockId = troopUnlockId;
    pinnedDetail = detail;
    hoveredDetail = null;
    hoveredAbilityTooltip = null;
  }

  function confirmTroopOfferUnlock(): void {
    if (!selectedTroopOfferUnlockId) {
      return;
    }

    confirmedTroopOfferUnlockId = selectedTroopOfferUnlockId;
    gameStore.claimTroopOffer(selectedTroopOfferUnlockId);
    selectedTroopOfferUnlockId = null;
    pinnedDetail = null;
    hoveredDetail = null;
    hoveredAbilityTooltip = null;
  }

  function selectUpgradeOffer(upgradeId: UpgradeId, detail: DetailCard): void {
    if (selectedUpgradeOfferId === upgradeId) {
      selectedUpgradeOfferId = null;
      pinnedDetail = null;
      hoveredDetail = null;
      hoveredAbilityTooltip = null;
      return;
    }

    selectedUpgradeOfferId = upgradeId;
    pinnedDetail = detail;
    hoveredDetail = null;
    hoveredAbilityTooltip = null;
  }

  function confirmUpgradeOffer(): void {
    if (!selectedUpgradeOfferId) {
      return;
    }

    confirmedUpgradeOfferId = selectedUpgradeOfferId;
    gameStore.claimUpgradeOffer(selectedUpgradeOfferId);
    selectedUpgradeOfferId = null;
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
    const sideUnits = roster.filter((unit) => (currentUnitsById.get(unit.id)?.side ?? unit.side) === side);
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
        initiativePercent: `${Math.max(0, Math.min(100, currentUnit.initiative))}%`,
        portraitUrl: getReplayUnitPortraitUrl(currentUnit),
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

  function finalReplaySnapshot(replay: BattleReplay): BattleUnit[] {
    return replay.steps[replay.steps.length - 1]?.snapshot.units ?? replay.initial.units;
  }

  function statLineKey(line: StatBreakdownLine): string {
    return `${line.kind}:${line.label}`;
  }

  function addLiveStatLine(
    linesByStat: Partial<Record<ExplainedStatKey, StatBreakdownLine[]>>,
    stat: ExplainedStatKey,
    line: StatBreakdownLine,
  ): void {
    const existing = linesByStat[stat] ?? [];
    const existingIndex = existing.findIndex((entry) => statLineKey(entry) === statLineKey(line));
    if (existingIndex >= 0) {
      existing[existingIndex] = {
        ...existing[existingIndex],
        value: line.kind === 'set' ? line.value : existing[existingIndex]!.value + line.value,
      };
      return;
    }
    linesByStat[stat] = [...existing, line];
  }

  function getLiveStatLine(step: BattleStep): { stat: ExplainedStatKey; line: StatBreakdownLine } | null {
    const metadata = step.metadata;
    if (step.kind !== 'buff' || !metadata) {
      return null;
    }

    const label = typeof metadata.sourceAbilityLabel === 'string'
      ? metadata.sourceAbilityLabel
      : typeof metadata.sourceAbilityId === 'string'
        ? metadata.sourceAbilityId
        : 'Battle effect';

    if (metadata.effect === 'rangeset' && typeof metadata.value === 'number') {
      return { stat: 'range', line: { label, value: metadata.value, kind: 'set' } };
    }

    const amount = typeof metadata.amount === 'number' ? metadata.amount : null;
    if (amount === null || amount === 0) {
      return null;
    }

    if (metadata.effect === 'bolster') {
      return { stat: 'health', line: { label, value: amount, kind: 'delta' } };
    }
    if (metadata.effect === 'ramp') {
      return { stat: 'damage', line: { label, value: amount, kind: 'delta' } };
    }
    if (metadata.effect === 'haste') {
      return { stat: 'speed', line: { label, value: amount, kind: 'delta' } };
    }
    if (metadata.effect === 'statDelta') {
      const stat = metadata.stat;
      if (stat === 'damage' || stat === 'speed' || stat === 'armor' || stat === 'range' || stat === 'capacity') {
        return { stat, line: { label, value: amount, kind: 'delta' } };
      }
    }
    return null;
  }

  function buildLiveStatBreakdownLines(
    replay: BattleReplay | null,
    unitId: string | null,
    currentStep: number,
  ): Partial<Record<ExplainedStatKey, StatBreakdownLine[]>> {
    if (!replay || !unitId || currentStep < 0) {
      return {};
    }

    const linesByStat: Partial<Record<ExplainedStatKey, StatBreakdownLine[]>> = {};
    replay.steps.slice(0, currentStep + 1).forEach((step) => {
      if (!step.targetIds.includes(unitId)) {
        return;
      }
      const liveLine = getLiveStatLine(step);
      if (liveLine) {
        addLiveStatLine(linesByStat, liveLine.stat, liveLine.line);
      }
    });
    return Object.fromEntries(
      Object.entries(linesByStat).map(([stat, lines]) => [stat, lines.filter((line) => line.kind === 'set' || line.value !== 0)]),
    ) as Partial<Record<ExplainedStatKey, StatBreakdownLine[]>>;
  }

  function buildArchiveHealthTotal(replay: BattleReplay, side: SideId): ArchiveHealthTotal {
    const finalUnits = finalReplaySnapshot(replay).filter((unit) => unit.side === side);
    const initialUnits = replay.initial.units.filter((unit) => unit.side === side);
    const currentHp = finalUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0);
    const maxHp = initialUnits.reduce((sum, unit) => sum + Math.max(0, unit.maxHp), 0);
    return {
      side,
      label: getArchiveSideLabel(side),
      hpPercent: getHpPercent(currentHp, maxHp),
      hpLabel: `${Math.round(Number.parseFloat(getHpPercent(currentHp, maxHp)))}% (${formatHpLabel(currentHp, maxHp)})`,
    };
  }

  function decorateArchiveSummary(summary: string): string {
    return summary.replace(/\s+\d+\s*-\s*\d+\b/g, '');
  }

  function getArchiveParticipant(side: SideId): { kind: BattleParticipantKind; label: string } {
    return selectedArchivePayload?.input.sideParticipants?.[side] ?? selectedReplayEntry?.sideParticipants?.[side] ?? ARCHIVE_PARTICIPANT_FALLBACK[side];
  }

  function getArchiveSideLabel(side: SideId): string {
    return getArchiveParticipant(side).label;
  }

  function getArchiveForcesLabel(side: SideId): string {
    return `${getArchiveSideLabel(side)} Forces`;
  }

  function archiveParticipantClass(kind: BattleParticipantKind): string {
    return `archive-${kind}`;
  }

  function getArchiveCardStyle(entry: { encounterLabel?: string; sideParticipants?: StoredReplayPayload['input']['sideParticipants'] }): string {
    const fallbackLeft = entry.encounterLabel?.includes(' vs Neutral Guardians') ? 'opponent' : 'player';
    const left = entry.sideParticipants?.player?.kind ?? fallbackLeft;
    const right = entry.sideParticipants?.enemy?.kind ?? 'neutral';
    return `--archive-left-color: var(--archive-${left}); --archive-right-color: var(--archive-${right});`;
  }

  function archiveEntryMatchupLabel(entry: { sideParticipants?: StoredReplayPayload['input']['sideParticipants']; encounterLabel?: string }): string | null {
    if (entry.sideParticipants) {
      const { player, enemy } = entry.sideParticipants;
      if (player.kind === 'player' || enemy.kind === 'player') {
        return `${player.label} vs ${enemy.label}`;
      }
      return null;
    }
    return entry.encounterLabel ? `Player vs ${entry.encounterLabel}` : null;
  }

  function getArchiveRiftVisual(entry: { riftId?: string | null; tier?: number; mutatorIds?: string[] }): RiftInstance | null {
    const knownRift = $gameStore.game.openRifts.find((rift) => rift.id === entry.riftId);
    if (knownRift) {
      return knownRift;
    }
    if (!entry.riftId) {
      return null;
    }
    return {
      id: entry.riftId,
      cycleNumber: 0,
      seed: entry.riftId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0),
      tier: entry.tier ?? 1,
      mutatorIds: [],
      enemyArmy: [],
      victoryPoints: entry.tier ?? 1,
      saturation: 1,
      state: 'expired',
    };
  }

  function previewArchiveRift(entry: { riftId?: string | null }): void {
    selectedRiftId = entry.riftId && discoveredRifts.some((rift) => rift.id === entry.riftId) ? entry.riftId : null;
  }

  function buildArchiveCombatantDetail(combatant: ResolvedCombatantDefinition, side: SideId): DetailCard {
    return buildResolvedUnitDetail(
      `archive:${side}:${combatant.combatantId}`,
      combatant.label,
      combatant.factionId,
      combatant.unitTypeId,
      combatant.stats,
      combatant.quantity,
      `${getArchiveSideLabel(side)} force at battle time.`,
      combatant.abilities,
      combatant.statBreakdowns,
    );
  }

  function getRelevantArchiveUpgradeIds(payload: StoredReplayPayload | null, replay: BattleReplay | null, side: SideId): UpgradeId[] {
    if (!payload) {
      return [];
    }

    const factionUpgradeIds = side === 'player' ? payload.input.playerFactionUpgradeIds ?? [] : payload.input.enemyFactionUpgradeIds ?? [];
    const troopTypeUpgradeIds = side === 'player' ? payload.input.playerTroopTypeUpgradeIds ?? [] : payload.input.enemyTroopTypeUpgradeIds ?? [];
    const profiles = replay?.troopProfiles.filter((profile) => profile.side === side) ?? [];
    const fallbackCombatants = side === 'player' ? payload.input.playerCombatants : payload.input.enemyCombatants;
    const relevantFactions = new Set((profiles.length > 0 ? profiles : fallbackCombatants).map((entry) => entry.factionId));
    const relevantUnitTypes = new Set((profiles.length > 0 ? profiles : fallbackCombatants).map((entry) => entry.unitTypeId));

    return [...factionUpgradeIds, ...troopTypeUpgradeIds].filter((upgradeId) => {
      if (upgradeId in FACTION_UPGRADES) {
        return relevantFactions.has(FACTION_UPGRADES[upgradeId]!.factionId);
      }
      const troopTypeUpgrade = TROOP_TYPE_UPGRADES[upgradeId];
      return troopTypeUpgrade ? relevantUnitTypes.has(troopTypeUpgrade.unitTypeId) : false;
    });
  }

  function slotModeLabel(mode: GameMode | null): string {
    return mode === 'contest' ? 'Contest' : 'Campaign';
  }

  function getLocalPlayerName(): string {
    const playerId = $gameStore.multiplayer?.playerId;
    return playerId ? $gameStore.multiplayer?.playerNames[playerId] ?? 'Player' : 'Player';
  }

  function getOpponentPlayerName(): string {
    const playerId = $gameStore.multiplayer?.playerId;
    if (!$gameStore.multiplayer || !playerId) {
      return 'Rival';
    }
    const opponentId = playerId === 'human' ? 'ai' : 'human';
    return $gameStore.multiplayer.playerNames[opponentId] ?? 'Rival';
  }

  function getRiftControllerLabel(rift: { controller?: string }): string {
    if ($gameStore.game.gameMode !== 'contest') {
      return 'Guardians';
    }
    if (rift.controller === 'human') {
      return 'Held By You';
    }
    if (rift.controller === 'ai') {
      return `Held By ${getOpponentPlayerName()}`;
    }
    return 'Neutral Guardians';
  }

  function getVisibleRiftDefenders(rift: { controller?: string; occupyingTroopIds?: TroopId[]; enemyArmy: ResolvedCombatantDefinition[] }): ResolvedCombatantDefinition[] {
    if ($gameStore.game.gameMode !== 'contest') {
      return rift.enemyArmy;
    }
    if (!rift.controller || rift.controller === 'neutral') {
      return rift.enemyArmy;
    }
    if (rift.controller === 'human') {
      return [];
    }
    const ai = $gameStore.game.contest?.players.ai;
    if (!ai) {
      return [];
    }
    const occupyingIds = new Set(rift.occupyingTroopIds ?? []);
    return ai.troops
      .filter((troop) => occupyingIds.has(troop.id))
      .map((troop) => resolveTroopCombatant(ai, troop, 'enemy', null, `ai-held-${troop.id}`));
  }

  function isHumanBattleSide(record: CycleRecord, side: SideId): boolean {
    const participant = record.battleInput.sideParticipants?.[side];
    return participant?.kind === 'player' || participant?.playerId === 'human';
  }

  function getBattleAnimationSide(
    record: CycleRecord,
    side: SideId,
    loses: boolean,
    fallbackKind: BattleParticipantKind,
    fallbackLabel: string,
  ): RiftBattleAnimationSide {
    const participant = record.battleInput.sideParticipants?.[side] ?? { kind: fallbackKind, label: fallbackLabel };
    return {
      label: participant.label,
      kind: participant.kind,
      loses,
    };
  }

  function outcomeLoser(outcome: BattleOutcome, side: SideId): boolean {
    if (outcome === 'draw') {
      return true;
    }
    return side === 'player' ? outcome === 'defeat' : outcome === 'victory';
  }

  function buildRecordBattlePhase(record: CycleRecord, delayClass: RiftBattleAnimationPhase['delayClass'], key: string): RiftBattleAnimationPhase {
    const playerSide = getBattleAnimationSide(record, 'player', outcomeLoser(record.outcome, 'player'), 'player', 'Player');
    const enemySide = getBattleAnimationSide(record, 'enemy', outcomeLoser(record.outcome, 'enemy'), 'neutral', 'Neutral Guardians');
    const playerIsRight = isHumanBattleSide(record, 'player');
    return {
      key,
      replayId: record.replay.id,
      delayClass,
      left: playerIsRight ? enemySide : playerSide,
      right: playerIsRight ? playerSide : enemySide,
    };
  }

  function getAnimationForceLossTiming(animation: RiftBattleAnimationView | null, side: 'left' | 'right'): ForceLossTiming {
    const losingPhase = animation?.phases.find((phase) => phase[side].loses) ?? null;
    if (!losingPhase) {
      return null;
    }
    return losingPhase.delayClass === 'phase-late' ? 'late' : 'now';
  }

  function getAnimationLeftCombatants(rift: RiftInstance, animation: RiftBattleAnimationView | null): ResolvedCombatantDefinition[] {
    const leftBattlePhase =
      animation?.phases.find((phase) => phase.left.kind === 'opponent' || phase.left.kind === 'player') ??
      animation?.phases.find((phase) => phase.left.kind === 'neutral') ??
      null;
    if (leftBattlePhase) {
      const record = $gameStore.cycleAnimation?.resolution.records.find((entry) => entry.replay.id === leftBattlePhase.replayId);
      if (record) {
        const participants = record.battleInput.sideParticipants;
        if (participants?.player.kind === leftBattlePhase.left.kind && participants.player.label === leftBattlePhase.left.label) {
          return record.battleInput.playerCombatants;
        }
        if (participants?.enemy.kind === leftBattlePhase.left.kind && participants.enemy.label === leftBattlePhase.left.label) {
          return record.battleInput.enemyCombatants;
        }
      }
    }
    return getVisibleRiftDefenders(rift);
  }

  function getRiftBattleAnimationView(rift: RiftInstance): RiftBattleAnimationView | null {
    const animation = $gameStore.cycleAnimation;
    if (!animation) {
      return null;
    }
    const records = animation.resolution.records.filter((record) => record.riftId === rift.id);
    if (records.length === 0) {
      return null;
    }

    const pvp = records.find((record) => record.contest?.kind === 'pvp') ?? null;
    if (pvp) {
      const humanGuardian = records.find((record) => record.contest?.kind === 'guardian' && record.contest.attackerId === 'human') ?? null;
      return {
        riftId: rift.id,
        phases: [
          buildRecordBattlePhase(humanGuardian ?? pvp, 'phase-now', `${rift.id}:guardian`),
          buildRecordBattlePhase(pvp, 'phase-late', `${rift.id}:pvp`),
        ],
      };
    }

    const humanGuardian = records.find((record) => record.contest?.kind === 'guardian' && record.contest.attackerId === 'human') ?? null;
    const aiGuardian = records.find((record) => record.contest?.kind === 'guardian' && record.contest.attackerId === 'ai') ?? null;
    const preferredRecords =
      humanGuardian && aiGuardian
        ? [humanGuardian]
        : records.filter((record) => record.contest?.kind !== 'guardian' || record.contest.attackerId !== 'ai' || !humanGuardian);

    return {
      riftId: rift.id,
      phases: preferredRecords.map((record, index) => buildRecordBattlePhase(record, 'phase-now', `${rift.id}:${index}:${record.replay.id}`)),
    };
  }

  function getCenterBoardLabel(): string {
    if ($gameStore.centerMode === 'rifts') {
      return 'Rift board';
    }
    if ($gameStore.centerMode === 'troops') {
      return 'Factions and troops board';
    }
    return $gameStore.multiplayer ? `${getOpponentPlayerName()} info board` : 'Rival info board';
  }

  function getOpponentFactionUpgradeIds(opponent: ContestPlayerState, factionId: FactionId): UpgradeId[] {
    return opponent.factionUpgradeIds.filter((upgradeId) => FACTION_UPGRADES[upgradeId]?.factionId === factionId);
  }

  function getOpponentTroopTypeUpgradeIds(opponent: ContestPlayerState, unitTypeId: UnitTypeId): UpgradeId[] {
    return opponent.troopTypeUpgradeIds.filter((upgradeId) => TROOP_TYPE_UPGRADES[upgradeId]?.unitTypeId === unitTypeId);
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
    multiplayerPlayerName = readLastMultiplayerPlayerName() ?? multiplayerPlayerName;
    multiplayerServerUrl = readLastMultiplayerServerUrl() ?? multiplayerServerUrl;
    const linkedParams = new URLSearchParams(window.location.search);
    const linkedServer = linkedParams.get('server')?.trim() ?? '';
    if (linkedServer) {
      multiplayerServerUrl = normalizeMultiplayerServerUrl(linkedServer);
    }
    const linkedRoom = linkedParams.get('room')?.trim().toUpperCase() ?? '';
    if (linkedRoom) {
      multiplayerRoomCode = linkedRoom;
      mainMenuView = 'multiplayer';
    }
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
      if (cycleAnimationFinishTimer) {
        window.clearTimeout(cycleAnimationFinishTimer);
        cycleAnimationFinishTimer = null;
      }
      if (essenceDraftHighlightTimer) {
        window.clearTimeout(essenceDraftHighlightTimer);
        essenceDraftHighlightTimer = null;
      }
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

  $: {
    if ($gameStore.cycleAnimation && !cycleAnimationFinishTimer) {
      const hasLatePhase = $gameStore.cycleAnimation.resolution.records.some((record) => record.contest?.kind === 'pvp');
      cycleAnimationFinishTimer = window.setTimeout(() => {
        cycleAnimationFinishTimer = null;
        gameStore.finishCycleAnimation();
      }, hasLatePhase ? 7600 : 5200);
    }
    if (!$gameStore.cycleAnimation && cycleAnimationFinishTimer) {
      window.clearTimeout(cycleAnimationFinishTimer);
      cycleAnimationFinishTimer = null;
    }
  }

  $: uiDebugVisible = debugToolsEnabled && (showUiDebugNames || designModeEnabled);
  $: if (
    selectedTroopOfferUnlockId &&
    !$gameStore.game.activeTroopOffer?.optionTroopUnlockIds.includes(selectedTroopOfferUnlockId)
  ) {
    selectedTroopOfferUnlockId = null;
  }

  $: if (
    pendingOpeningTroopUnlockId &&
    (isOpeningTroopSelected(pendingOpeningTroopUnlockId) || !canClaimOpeningTroop(pendingOpeningTroopUnlockId))
  ) {
    pendingOpeningTroopUnlockId = null;
  }

  $: if (
    selectedUpgradeOfferId &&
    !$gameStore.game.activeUpgradeOffer?.optionUpgradeIds.includes(selectedUpgradeOfferId)
  ) {
    selectedUpgradeOfferId = null;
  }

  $: if ($gameStore.game.activeTroopOffer) {
    confirmedTroopOfferUnlockId = null;
  }

  $: if ($gameStore.game.activeUpgradeOffer) {
    confirmedUpgradeOfferId = null;
  }

  $: if ($gameStore.cycleEndConfirmationPending && $gameStore.centerMode !== 'rifts') {
    gameStore.setCenterMode('rifts');
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

  $: if ($gameStore.centerMode === 'contest' && $gameStore.game.gameMode !== 'contest') {
    gameStore.setCenterMode('rifts');
  }

  $: multiplayerReadySubmitted = (() => {
    const playerId = $gameStore.multiplayer?.playerId;
    return !!playerId && !!$gameStore.multiplayer?.readiness[playerId];
  })();
  $: multiplayerStatus = (() => {
    if (!$gameStore.multiplayer) {
      return null;
    }
    const room = $gameStore.multiplayer.roomId ? `Room ${$gameStore.multiplayer.roomId}` : 'Connecting';
    const player = getLocalPlayerName();
    const message = multiplayerReadySubmitted ? `Waiting for ${getOpponentPlayerName()}.` : ($gameStore.multiplayer.message ?? multiplayerReadyLabel());
    return `${room} - ${player} - ${message}`;
  })();

  $: discoveredRifts = $gameStore.game.openRifts.filter((rift) => rift.state === 'discovered');
  $: opponentInfo = $gameStore.game.gameMode === 'contest' ? $gameStore.game.contest?.opponentInfo ?? null : null;
  $: opponentInfoAi = opponentInfo?.ai ?? null;
  $: opponentInfoFactionIds = opponentInfoAi
    ? FACTION_IDS.filter((factionId) => opponentInfoAi.unlockedFactionIds.includes(factionId))
    : [];
  $: currentOpponentOccupyingTroopIds = new Set(
    $gameStore.game.openRifts
      .filter((rift) => rift.occupyingPlayerId === 'ai')
      .flatMap((rift) => rift.occupyingTroopIds ?? []),
  );
  $: opponentMobileTroopCount = opponentInfoAi
    ? opponentInfoAi.troops.filter((troop) => !currentOpponentOccupyingTroopIds.has(troop.id)).length
    : 0;
  $: factionRosterIds = FACTION_IDS.filter((factionId) => $gameStore.game.unlockedFactionIds.includes(factionId));
  $: selectedOpeningFactionIds = new Set($gameStore.game.troops.map((troop) => troop.factionId));
  $: selectedOpeningUnitTypeIds = new Set($gameStore.game.troops.map((troop) => troop.unitTypeId));
  $: selectedOpeningTroopUnlockIds = new Set($gameStore.game.troops.map((troop) => `${troop.factionId}/${troop.unitTypeId}` as TroopUnlockId));
  $: {
    const inspectContextKey = [
      $gameStore.activeSlotId ?? 'no-slot',
      $gameStore.game.campaignSeed,
      $gameStore.screen,
      $gameStore.game.phase,
      $gameStore.centerMode,
    ].join(':');
    if (inspectContextKey !== lastInspectContextKey) {
      lastInspectContextKey = inspectContextKey;
      resetZoneState();
    }
  }
  $: activeDetail = pinnedDetail ?? hoveredDetail;
  $: statusCounts = getTroopStatusCounts($gameStore.game);
  $: essenceDraftCost = getEssenceDraftCost($gameStore.game);
  $: essenceDraftButtonLabel = essenceDraftCost === 1 ? 'Reveal One Unlock' : essenceDraftCost === 2 ? 'Reveal Unlock Draft' : 'Draft Unavailable';
  $: essenceDraftActive = !!($gameStore.game.activeTroopOffer || $gameStore.game.activeUpgradeOffer);
  $: finalCycle = $gameStore.game.gameMode === 'contest' ? CONTEST_FINAL_CYCLE : CAMPAIGN_FINAL_CYCLE;
  $: cycleProgressLabel = $gameStore.game.cycleNumber > finalCycle ? `Postgame cycle ${$gameStore.game.cycleNumber}` : `Cycle ${$gameStore.game.cycleNumber} / ${finalCycle}`;
  $: archiveEntriesPerPage = Math.max(4, Math.min(12, Math.floor((viewportHeight - 350) / 52)));
  $: archivePageCount = Math.max(1, Math.ceil($gameStore.game.replayIndex.length / archiveEntriesPerPage));
  $: if (archivePage > archivePageCount - 1) {
    archivePage = archivePageCount - 1;
  }
  $: pagedReplayEntries = $gameStore.game.replayIndex.slice(archivePage * archiveEntriesPerPage, (archivePage + 1) * archiveEntriesPerPage);
  $: systemMessageHasUnspentEssence = !!$gameStore.systemMessage && $gameStore.game.essence > 0 && /unspent Essence/i.test($gameStore.systemMessage);
  $: starterGroups = getOpeningFactionOptionIds($gameStore.game).map((factionId) => ({
    factionId,
    label: FACTIONS[factionId].label,
    starterTroopUnlockId: getOpeningFactionStarterTroopUnlockIds($gameStore.game)[factionId],
    options: getFactionNativeTroopUnlockIds(factionId),
  }));
  $: selectedOpeningFactionSummaries = starterGroups
    .filter((group) => selectedOpeningFactionIds.has(group.factionId))
    .map((group) => ({ factionId: group.factionId, label: group.label }));

  function isOpeningTroopSelected(troopUnlockId: TroopUnlockId): boolean {
    return selectedOpeningTroopUnlockIds.has(troopUnlockId);
  }

  function canClaimOpeningTroop(troopUnlockId: TroopUnlockId): boolean {
    const [factionId, unitTypeId] = parseTroopUnlockId(troopUnlockId);
    const starterTroopUnlockId = getOpeningFactionStarterTroopUnlockIds($gameStore.game)[factionId];
    return (
      $gameStore.game.troops.length < 2 &&
      getOpeningFactionOptionIds($gameStore.game).includes(factionId) &&
      starterTroopUnlockId === troopUnlockId &&
      !selectedOpeningFactionIds.has(factionId) &&
      !selectedOpeningUnitTypeIds.has(unitTypeId)
    );
  }

  function isOpeningTroopIncompatible(troopUnlockId: TroopUnlockId): boolean {
    return !isOpeningTroopSelected(troopUnlockId) && !canClaimOpeningTroop(troopUnlockId);
  }

  function toggleOpeningFaction(troopUnlockId: TroopUnlockId): void {
    if (isOpeningTroopSelected(troopUnlockId)) {
      if (pinnedDetail?.detailKey === `opening:${troopUnlockId}`) {
        pinnedDetail = null;
      }
      gameStore.unclaimOpeningTroop(troopUnlockId);
      pendingOpeningTroopUnlockId = null;
    } else {
      pendingOpeningTroopUnlockId = pendingOpeningTroopUnlockId === troopUnlockId ? null : troopUnlockId;
    }
  }

  function lockOpeningTroopPreview(troopUnlockId: TroopUnlockId, detail: DetailCard): void {
    pendingOpeningTroopUnlockId = isOpeningTroopSelected(troopUnlockId) ? null : troopUnlockId;
    togglePinnedDetail(detail);
  }

  function confirmOpeningTroop(): void {
    if (!pendingOpeningTroopUnlockId || !canClaimOpeningTroop(pendingOpeningTroopUnlockId)) {
      return;
    }
    gameStore.claimOpeningTroop(pendingOpeningTroopUnlockId);
    pendingOpeningTroopUnlockId = null;
    pinnedDetail = null;
    hoveredDetail = null;
  }

  function getScheduledFactionRosterUnlockIds(factionId: FactionId): TroopUnlockId[] {
    const offer = $gameStore.game.activeFactionUnlockOffer;
    const offered = offer?.troopUnlockIdsByFactionId[factionId] ?? [];
    return [...new Set([...getFactionNativeTroopUnlockIds(factionId), ...offered])];
  }

  function getTroopUnlockSourceLabel(troopUnlockId: TroopUnlockId): string {
    return isNativeTroopUnlockId(troopUnlockId) ? 'Native' : 'Rift-discovered';
  }

  function getAvailableFactionTroopUnlockIds(factionId: FactionId): TroopUnlockId[] {
    return getAvailableTroopUnlockIds($gameStore.game).filter((troopUnlockId) => parseTroopUnlockId(troopUnlockId)[0] === factionId);
  }

  function getAffectedTroopsForUpgrade(upgradeId: UpgradeId) {
    return $gameStore.game.troops.filter((troop) => upgradeAffectsTroop(upgradeId, troop));
  }

  function getAffectedDraftTroopsForUpgrade(upgradeId: UpgradeId): TroopUnlockId[] {
    return ($gameStore.game.activeTroopOffer?.optionTroopUnlockIds ?? []).filter((troopUnlockId) => {
      const [factionId, unitTypeId] = parseTroopUnlockId(troopUnlockId);
      return upgradeAffectsTroop(upgradeId, createTroopInstance(factionId, unitTypeId));
    });
  }

  function isUpgradeAffectingDraftTroop(troopUnlockId: TroopUnlockId): boolean {
    const upgradeId = hoveredUpgradeOfferId ?? selectedUpgradeOfferId;
    if (!upgradeId) {
      return false;
    }
    const [factionId, unitTypeId] = parseTroopUnlockId(troopUnlockId);
    return upgradeAffectsTroop(upgradeId, createTroopInstance(factionId, unitTypeId));
  }

  function selectedDraftChoicesHaveSynergy(): boolean {
    return !!selectedTroopOfferUnlockId && !!selectedUpgradeOfferId && getAffectedDraftTroopsForUpgrade(selectedUpgradeOfferId).includes(selectedTroopOfferUnlockId);
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
  $: selectedArchiveReplay =
    selectedReplayEntry && !selectedReplayEntry.summaryOnly ? gameStore.getReplay(selectedReplayEntry.replayId) : null;
  $: selectedArchivePayload =
    selectedReplayEntry && !selectedReplayEntry.summaryOnly ? gameStore.getReplayPayload(selectedReplayEntry.replayId) : null;
  $: selectedArchiveHealthTotals = selectedArchiveReplay
    ? [buildArchiveHealthTotal(selectedArchiveReplay, 'player'), buildArchiveHealthTotal(selectedArchiveReplay, 'enemy')]
    : [];
  $: selectedArchivePlayerUpgradeIds = getRelevantArchiveUpgradeIds(selectedArchivePayload, selectedArchiveReplay, 'player');
  $: selectedArchiveEnemyUpgradeIds = getRelevantArchiveUpgradeIds(selectedArchivePayload, selectedArchiveReplay, 'enemy');
  $: readyTroops = $gameStore.game.troops.filter((troop) => troop.recoveryCyclesRemaining === 0 && troop.assignmentRiftId === null);
  $: selectedRiftAssignableTroops = selectedRift
    ? selectedRift.controller === 'human'
      ? []
      : $gameStore.game.troops.filter(
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
  $: replayHighlightedStepIndex = replay ? $gameStore.selectedEvent ?? ($gameStore.currentStep >= 0 ? $gameStore.currentStep : null) : null;
  $: replayHighlightedStep = replay && replayHighlightedStepIndex !== null ? replay.steps[replayHighlightedStepIndex] ?? null : null;
  $: replayActiveHighlightId = replayHighlightedStep?.metadata?.activeUnitId ?? replayHighlightedStep?.actorIds[0] ?? replayHighlightedStep?.targetIds[0] ?? null;
  $: replaySecondaryHighlightIds = new Set(
    replayHighlightedStep
      ? replayHighlightedStep.metadata?.secondaryUnitIds ?? [...replayHighlightedStep.actorIds.slice(1), ...replayHighlightedStep.targetIds]
      : [],
  );
  $: inspectedUnitId = lockedUnitId ?? hoverInfo?.unitId ?? null;
  $: inspectedUnit = inspectedUnitId ? replaySnapshot.find((unit) => unit.id === inspectedUnitId) ?? null : null;
  $: inspectedProfile =
    replay && inspectedUnit
      ? replay.troopProfiles.find((profile) => profile.troopLabel === inspectedUnit.troopLabel && profile.side === inspectedUnit.side) ??
        replay.troopProfiles.find((profile) => {
          const initialUnit = replay.initial.units.find((unit) => unit.id === inspectedUnit.id);
          return profile.troopLabel === inspectedUnit.troopLabel && profile.side === initialUnit?.side;
        }) ??
        null
      : null;
  $: inspectedUnitLiveStatLines = buildLiveStatBreakdownLines(replay, inspectedUnit?.id ?? null, $gameStore.currentStep);
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
    gameStore.setAutoPlay(false);
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
    <section class="menu-panel main-menu-shell ui-debug-target" data-ui-name="Main menu panel">
      <div class="menu-topline ui-debug-target" data-ui-name="Main menu header">
        <div class="menu-copy ui-debug-target" data-ui-name="Main menu intro">
          <p class="eyebrow">Shiftmake</p>
          <h1>{mainMenuView === 'home' ? 'Shiftmake' : mainMenuView === 'singleplayer' ? 'Singleplayer' : mainMenuView === 'multiplayer' ? 'Multiplayer' : mainMenuView === 'debug' ? 'Debug' : 'Settings'}</h1>
        </div>
      </div>

      {#if $gameStore.systemMessage}
        <div class="menu-system-message panel ui-debug-target" data-ui-name="Main menu system message">
          <strong>System Notice</strong>
          <p>{$gameStore.systemMessage}</p>
        </div>
      {/if}

      {#if mainMenuView === 'home'}
        <div class="main-menu-actions ui-debug-target" data-ui-name="Main menu actions">
          <button class="primary large" on:click={() => showMainMenuView('singleplayer')}>Singleplayer</button>
          <button class="large" on:click={() => showMainMenuView('multiplayer')}>Multiplayer</button>
          <button class="large" on:click={() => showMainMenuView('debug')}>Debug</button>
          <button class="large" on:click={() => showMainMenuView('settings')}>Settings</button>
        </div>
      {:else if mainMenuView === 'singleplayer'}
        <div class="slot-grid">
          {#each $gameStore.slots as slot}
            <article class="slot-card panel ui-debug-target" data-ui-name={`Save slot ${slot.slotId}`}>
              <div class="slot-card-header">
                <span class="slot-label">Slot {slot.slotId}</span>
                <strong>{slot.status === 'occupied' ? 'Occupied' : 'Empty'}</strong>
              </div>

              {#if slot.status === 'occupied'}
                <div class="slot-meta">
                  <span>{slotModeLabel(slot.gameMode)}</span>
                  <span>{slot.factionLabel ?? 'In progress'}</span>
                  <span>Cycle {slot.cycleNumber}</span>
                  <span>{slotPhaseLabel(slot.phase)}</span>
                  <span>{slot.lastPlayedAt ? new Date(slot.lastPlayedAt).toLocaleString() : 'No timestamp'}</span>
                </div>
              {:else}
                <p>Empty</p>
              {/if}

              <div class="actions-grid">
                <button class="primary ui-debug-target" data-ui-name={`Primary action for save slot ${slot.slotId}`} on:click={() => openSlot(slot)}>
                  {slot.status === 'occupied' ? 'Load Slot' : 'Start Campaign'}
                </button>
                {#if slot.status === 'empty'}
                  <button class="ui-debug-target" data-ui-name={`Start Contest vs AI for save slot ${slot.slotId}`} on:click={() => startSlot(slot, 'contest')}>Contest vs AI</button>
                {:else}
                  <button class="ui-debug-target" data-ui-name={`Replace campaign for slot ${slot.slotId}`} on:click={() => restartSlot(slot, 'campaign')}>Replace Campaign</button>
                  <button class="ui-debug-target" data-ui-name={`Replace Contest vs AI for save slot ${slot.slotId}`} on:click={() => restartSlot(slot, 'contest')}>Replace Contest vs AI</button>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else if mainMenuView === 'multiplayer'}
        <section class="multiplayer-menu panel ui-debug-target" data-ui-name="Multiplayer Contest panel">
          <div class="multiplayer-identity-controls">
            <label>
              <span>Name</span>
              <input bind:value={multiplayerPlayerName} maxlength="24" aria-label="Multiplayer player name" />
            </label>
            {#if multiplayerDefaultServerConfigured}
              <details class="multiplayer-server-details">
                <summary>Server</summary>
                <label>
                  <span>Server</span>
                  <input bind:value={multiplayerServerUrl} aria-label="Multiplayer server URL" />
                </label>
              </details>
            {:else}
              <label>
                <span>Server</span>
                <input bind:value={multiplayerServerUrl} aria-label="Multiplayer server URL" />
              </label>
            {/if}
          </div>
          <div class="multiplayer-room-choice">
            <button class="primary ui-debug-target" data-ui-name="Create multiplayer Contest room" on:click={createMultiplayerContest}>Create Room</button>
            <div class="join-room-box">
              <label>
                <span>Room Code</span>
                <input bind:value={multiplayerRoomCode} aria-label="Multiplayer room code" on:input={() => (multiplayerRoomCode = multiplayerRoomCode.toUpperCase())} />
              </label>
              <button class="ui-debug-target" data-ui-name="Join multiplayer Contest room" on:click={joinMultiplayerContest} disabled={!multiplayerRoomCode.trim()}>Join Room</button>
            </div>
          </div>
        </section>
      {:else if mainMenuView === 'debug'}
        <section class="debug-menu-panel panel">
          {#if debugToolsEnabled}
            <DebugToolsMenu
              selectedTroopId={selectedTroopId}
              selectedReplayId={selectedReplayId}
              selectedRiftId={selectedRiftId}
              rendererDiagnostics={rendererDiagnostics}
              onCampaignImport={handleCampaignReportImport}
            />
          {:else}
            <p>Debug tools are only available in development builds.</p>
          {/if}
        </section>
      {:else if mainMenuView === 'settings'}
        <section class="settings-menu-panel panel">
          <p>None yet!</p>
        </section>
      {/if}

      {#if mainMenuView !== 'home'}
        <button class="menu-back-button" aria-label="Back to main menu" on:click={() => showMainMenuView('home')}>←</button>
      {/if}
    </section>
  </main>
{:else if $gameStore.screen === 'overworld' && $gameStore.game.phase === 'opening_unlock'}
  <main class="draft-screen" class:ui-debug-visible={uiDebugVisible} class:design-mode-enabled={designModeEnabled}>
    <section class="draft-panel opening-shell ui-debug-target" data-ui-name="Opening unlock screen">
      {#if multiplayerStatus}
        <div class="draft-screen-header opening-session-header">
          <p class="multiplayer-status-line ui-debug-target" data-ui-name="Multiplayer opening status">{multiplayerStatus}</p>
          <div class="multiplayer-room-tools ui-debug-target" data-ui-name="Multiplayer opening room tools">
            <div class="multiplayer-room-card">
              <span>Room</span>
              <strong>{$gameStore.multiplayer?.roomId ?? '...'}</strong>
              <button type="button" class="link-icon-button" on:click={copyRoomLink} disabled={!$gameStore.multiplayer?.roomId} aria-label="Copy room link" title="Copy room link">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a3 3 0 0 1 4.2 4.2l-3.4 3.4a3 3 0 0 1-4.2 0 1 1 0 0 1 1.4-1.4 1 1 0 0 0 1.4 0l3.4-3.4a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0Z" /><path d="M3.8 20.2a3 3 0 0 1 0-4.2l3.4-3.4a3 3 0 0 1 4.2 0 1 1 0 0 1-1.4 1.4 1 1 0 0 0-1.4 0l-3.4 3.4a1 1 0 1 0 1.4 1.4l3.4-3.4a1 1 0 0 1 1.4 1.4L8 20.2a3 3 0 0 1-4.2 0Z" /></svg>
              </button>
            </div>
            <div class="multiplayer-player-list">
              <span>Current Players</span>
              <strong>{getLocalPlayerName()} - {playerConnectionLabel($gameStore.multiplayer?.playerId ?? 'human')}</strong>
              <strong>{getOpponentPlayerName()} - {playerConnectionLabel($gameStore.multiplayer?.playerId === 'human' ? 'ai' : 'human')}</strong>
            </div>
          </div>
          <div class="multiplayer-session-actions ui-debug-target" data-ui-name="Multiplayer opening actions">
            {#if !$gameStore.multiplayer?.connected}
              <button type="button" class="primary" on:click={reconnectMultiplayerContest}>Reconnect</button>
            {/if}
            {#if multiplayerReadySubmitted}
              <button type="button" on:click={cancelMultiplayerReady}>Cancel Ready</button>
            {/if}
            <button type="button" on:click={leaveMultiplayerContest}>Leave Room</button>
            {#if multiplayerCopyMessage}
              <span>{multiplayerCopyMessage}</span>
            {/if}
          </div>
        </div>
      {/if}
      <div class="draft-layout">
        <aside class="panel draft-focus-panel ui-debug-target" data-ui-name="Opening detail panel" role="presentation" on:mouseleave={clearDetail}>
          {#if activeDetail}
            <div class="detail-panel opening-detail-panel">
              <p class="eyebrow">{activeDetail.kind === 'faction' ? 'Faction Modifiers' : activeDetail.kind === 'unit' ? 'Troop Preview' : 'Detail'}</p>
              <h2 class="detail-title">{#if activeDetail.iconKind && activeDetail.iconId}<GameIcon kind={activeDetail.iconKind} id={activeDetail.iconId} label={activeDetail.label} />{/if}<span>{activeDetail.label}</span></h2>
              {#if activeDetail.kind === 'unit'}
                <div class="hover-unit-detail">
                  <span class="unit-icon-cluster detail-unit-cluster" style={`--unit-cluster-columns:${unitIconColumns(activeDetail.quantity)}`} aria-label={`${activeDetail.quantity} units in troop`}>
                    {#each unitIconCopies(activeDetail.quantity) as copy}
                      <img class="hover-unit-art" src={activeDetail.portraitUrl} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                    {/each}
                  </span>
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
                          <span class="icon-label"><GameIcon kind="ability" id={ability.id} label={ability.label} /><span>{ability.label}</span></span>
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
              {:else if activeDetail.description}
                <p>{activeDetail.description}</p>
                {#if activeDetail.stats && activeDetail.stats.length > 0}
                  <StatBreakdownGrid stats={activeDetail.stats} columns={4} />
                {/if}
              {:else if activeDetail.stats && activeDetail.stats.length > 0}
                <StatBreakdownGrid stats={activeDetail.stats} columns={4} />
              {/if}
            </div>
          {:else}
            <div class="detail-panel opening-detail-panel opening-empty-detail">
              <h2>Choose Two Starting Factions</h2>
              <p>Each faction brings its included starter troop. Other native troops are shown as later unlock potential.</p>
            </div>
          {/if}
        </aside>

        <div class="draft-grid">
          {#each starterGroups as group}
            {@const factionDetail = buildFactionDetail(group.factionId)}
            {@const starterTroopUnlockId = group.starterTroopUnlockId}
            {@const starterSelected = selectedOpeningTroopUnlockIds.has(starterTroopUnlockId)}
            {@const starterIncompatible = !starterSelected && !canClaimOpeningTroop(starterTroopUnlockId)}
            {@const [starterFactionId, starterUnitTypeId] = parseTroopUnlockId(starterTroopUnlockId)}
            {@const starterTroopDef = TROOP_CATALOG[starterTroopUnlockId]}
            {@const starterTroopDetail = buildResolvedUnitDetail(
              `opening:${starterTroopUnlockId}`,
              starterTroopDef.label,
              starterFactionId,
              starterUnitTypeId,
              starterTroopDef.stats,
              starterTroopDef.quantity,
              `Included starting troop for ${getFaction(starterFactionId).label}. Other native recruits can be unlocked later.`,
              starterTroopDef.abilities,
            )}
            <article
              class="draft-card panel opening-faction-card ui-debug-target"
              class:selected={starterSelected}
              class:pending={pendingOpeningTroopUnlockId === starterTroopUnlockId}
              class:incompatible={starterIncompatible}
              data-ui-name={`Opening faction card ${group.label}`}
              on:mouseenter={() => previewDetail(factionDetail)}
              on:mouseleave={clearDetail}
            >
              <button
                type="button"
                class="opening-card-select-button"
                class:pending={pendingOpeningTroopUnlockId === starterTroopUnlockId}
                aria-label={`Choose ${group.label} with ${starterTroopDef.label}`}
                aria-pressed={starterSelected}
                disabled={starterIncompatible}
                on:focus={() => previewDetail(factionDetail)}
                on:blur={clearDetail}
                on:click={() => toggleOpeningFaction(starterTroopUnlockId)}
              ></button>
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
                    on:mouseleave={(event) => restoreOpeningFactionDetail(event, factionDetail)}
                    on:blur={clearDetail}
                    on:click|stopPropagation={() => togglePinnedDetail(factionDetail)}
                  >
                    <img class="faction-name-art" src={getFactionPortrait(group.factionId)} alt="" aria-hidden="true" />
                  </button>
                </div>
              </header>

              <div class="draft-section opening-included-section">
                <span class="draft-section-label">Included starter</span>
                <button
                  type="button"
                  class="draft-troop-icon opening-starter-tile ui-debug-target"
                  class:selected={pinnedDetail?.detailKey === starterTroopDetail.detailKey}
                  class:pending={pendingOpeningTroopUnlockId === starterTroopUnlockId}
                  class:incompatible={starterIncompatible}
                  data-ui-name={`Opening included troop ${starterTroopDef.label}`}
                  aria-label={`Inspect ${starterTroopDef.label}`}
                  aria-pressed={pinnedDetail?.detailKey === starterTroopDetail.detailKey}
                  on:mouseenter={() => previewDetail(starterTroopDetail)}
                  on:focus={() => previewDetail(starterTroopDetail)}
                  on:mouseleave={(event) => restoreOpeningFactionDetail(event, factionDetail)}
                  on:blur={clearDetail}
                  on:click|stopPropagation={() => lockOpeningTroopPreview(starterTroopUnlockId, starterTroopDetail)}
                  disabled={starterIncompatible}
                >
                  <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(starterTroopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(starterTroopDef.quantity)}`} aria-label={`${starterTroopDef.quantity} ${starterTroopDef.label} units`}>
                    {#each unitIconCopies(starterTroopDef.quantity) as copy}
                      <img class="unit-button-art" src={getFactionUnitPortrait(starterFactionId, starterUnitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                    {/each}
                  </span>
                  <span>{getUnitType(starterUnitTypeId).label}</span>
                </button>
              </div>

              <div class="draft-section opening-future-section">
                <span class="draft-section-label">Future unlocks</span>
                <div class="draft-icon-row opening-future-grid">
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
                      getFaction(factionId).description,
                      troopDef.abilities,
                    )}
                    {@const isIncludedStarter = troopUnlockId === group.starterTroopUnlockId}
                    {#if !isIncludedStarter}
                      <button
                        type="button"
                        class="draft-troop-icon troop-preview opening-future-tile ui-debug-target"
                        class:selected={pinnedDetail?.detailKey === troopDetail.detailKey}
                        data-ui-name={`Opening future troop ${troopDef.label}`}
                        aria-label={`Inspect future unlock ${troopDef.label}`}
                        on:mouseenter={() => previewDetail(troopDetail)}
                        on:focus={() => previewDetail(troopDetail)}
                        on:mouseleave={(event) => restoreOpeningFactionDetail(event, factionDetail)}
                        on:blur={clearDetail}
                        on:click|stopPropagation={() => togglePinnedDetail(troopDetail)}
                      >
                        <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                          {#each unitIconCopies(troopDef.quantity) as copy}
                            <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                          {/each}
                        </span>
                        <span>{getUnitType(unitTypeId).label}</span>
                      </button>
                    {/if}
                  {/each}
                </div>
              </div>
            </article>
          {/each}
        </div>
      </div>
      <div class="opening-actions actions-grid">
        {#if selectedOpeningFactionSummaries.length > 0}
          <div class="opening-selected-factions ui-debug-target" data-ui-name="Selected opening factions" aria-label="Selected factions">
            {#each selectedOpeningFactionSummaries as selectedFaction}
              <span class="opening-selected-faction">
                <img src={getFactionPortrait(selectedFaction.factionId)} alt="" aria-hidden="true" />
                <span>{selectedFaction.label}</span>
              </span>
            {/each}
          </div>
        {/if}
        {#if pendingOpeningTroopUnlockId}
          <button
            type="button"
            class="primary large ui-debug-target"
            data-ui-name="Confirm opening faction button"
            on:click={confirmOpeningTroop}
          >
            Confirm {TROOP_CATALOG[pendingOpeningTroopUnlockId].label}
          </button>
        {/if}
        <button
          type="button"
          class="primary large ui-debug-target"
          data-ui-name="Begin campaign button"
          on:click={beginOpeningCampaign}
          disabled={$gameStore.game.troops.length !== 2 || multiplayerReadySubmitted}
        >
          {$gameStore.multiplayer ? multiplayerReadyLabel() : 'Begin Campaign'}
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
        <p class="scheduled-unlock-instructions">Each candidate joins with its shown upgrades and included troop types already unlocked. Other troops show what can be unlocked later.</p>
        {#if multiplayerStatus}
          <p class="multiplayer-status-line ui-debug-target" data-ui-name="Multiplayer faction unlock status">{multiplayerStatus}</p>
          <div class="multiplayer-room-tools ui-debug-target" data-ui-name="Multiplayer faction unlock room tools">
            <div class="multiplayer-room-card">
              <span>Room</span>
              <strong>{$gameStore.multiplayer?.roomId ?? '...'}</strong>
              <button type="button" class="link-icon-button" on:click={copyRoomLink} disabled={!$gameStore.multiplayer?.roomId} aria-label="Copy room link" title="Copy room link">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a3 3 0 0 1 4.2 4.2l-3.4 3.4a3 3 0 0 1-4.2 0 1 1 0 0 1 1.4-1.4 1 1 0 0 0 1.4 0l3.4-3.4a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0Z" /><path d="M3.8 20.2a3 3 0 0 1 0-4.2l3.4-3.4a3 3 0 0 1 4.2 0 1 1 0 0 1-1.4 1.4 1 1 0 0 0-1.4 0l-3.4 3.4a1 1 0 1 0 1.4 1.4l3.4-3.4a1 1 0 0 1 1.4 1.4L8 20.2a3 3 0 0 1-4.2 0Z" /></svg>
              </button>
            </div>
            <div class="multiplayer-player-list">
              <span>Current Players</span>
              <strong>{getLocalPlayerName()} - {playerConnectionLabel($gameStore.multiplayer?.playerId ?? 'human')}</strong>
              <strong>{getOpponentPlayerName()} - {playerConnectionLabel($gameStore.multiplayer?.playerId === 'human' ? 'ai' : 'human')}</strong>
            </div>
          </div>
          <div class="multiplayer-session-actions ui-debug-target" data-ui-name="Multiplayer faction unlock actions">
            {#if !$gameStore.multiplayer?.connected}
              <button type="button" class="primary" on:click={reconnectMultiplayerContest}>Reconnect</button>
            {/if}
            {#if multiplayerReadySubmitted}
              <button type="button" on:click={cancelMultiplayerReady}>Cancel Ready</button>
            {/if}
            <button type="button" on:click={leaveMultiplayerContest}>Leave Room</button>
            {#if multiplayerCopyMessage}
              <span>{multiplayerCopyMessage}</span>
            {/if}
          </div>
        {/if}
      </div>

      <div class="draft-layout scheduled-faction-layout" class:has-detail={!!activeDetail}>
        <aside class="panel draft-focus-panel ui-debug-target" class:empty={!activeDetail} data-ui-name="Scheduled faction detail panel" role="presentation" on:mouseleave={clearDetail}>
          {#if activeDetail}
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
              <h2 class="detail-title">{#if activeDetail.iconKind && activeDetail.iconId}<GameIcon kind={activeDetail.iconKind} id={activeDetail.iconId} label={activeDetail.label} />{/if}<span>{activeDetail.label}</span></h2>
              {#if activeDetail.kind === 'unit'}
                <div class="hover-unit-detail">
                  <span class="unit-icon-cluster detail-unit-cluster" style={`--unit-cluster-columns:${unitIconColumns(activeDetail.quantity)}`} aria-label={`${activeDetail.quantity} units in troop`}>
                    {#each unitIconCopies(activeDetail.quantity) as copy}
                      <img class="hover-unit-art" src={activeDetail.portraitUrl} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                    {/each}
                  </span>
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
                          <span class="icon-label"><GameIcon kind="ability" id={ability.id} label={ability.label} /><span>{ability.label}</span></span>
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
                {#if activeDetail.description}
                  <p>{activeDetail.description}</p>
                {/if}
                {#if activeDetail.stats && activeDetail.stats.length > 0}
                  <StatBreakdownGrid stats={activeDetail.stats} columns={4} />
                {/if}
              {/if}
            </div>
          {/if}
        </aside>

        <div class="draft-grid faction-unlock-grid">
          {#each $gameStore.game.activeFactionUnlockOffer.optionFactionIds as factionId}
            {@const faction = getFaction(factionId)}
            {@const factionDetail = buildFactionDetail(factionId)}
            {@const grantedUpgradeIds = $gameStore.game.activeFactionUnlockOffer.upgradeIdsByFactionId[factionId] ?? []}
            {@const grantedTroopUnlockIds = $gameStore.game.activeFactionUnlockOffer.troopUnlockIdsByFactionId?.[factionId] ?? []}
            {@const rosterTroopUnlockIds = getScheduledFactionRosterUnlockIds(factionId)}
            <article class="draft-card panel faction-unlock-card ui-debug-target" class:selected={selectedScheduledFactionId === factionId} data-ui-name={`Faction unlock option ${faction.label}`}>
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
                      <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                    </button>
                  {/each}
                </div>
              </div>

              <div class="draft-section">
                <span class="draft-section-label">Troop roster</span>
                <div class="draft-icon-row troop-preview-row">
                  {#each rosterTroopUnlockIds as troopUnlockId}
                    {@const [rosterFactionId, rosterUnitTypeId] = parseTroopUnlockId(troopUnlockId)}
                    {@const isGrantedTroop = grantedTroopUnlockIds.includes(troopUnlockId)}
                    {@const sourceLabel = getTroopUnlockSourceLabel(troopUnlockId)}
                    {@const troopDetail = buildScheduledTroopDetail(
                      troopUnlockId,
                      grantedUpgradeIds,
                      isGrantedTroop
                        ? `Included ${sourceLabel.toLowerCase()} troop unlocked immediately when ${getFaction(rosterFactionId).label} joins.`
                        : `${sourceLabel} ${getFaction(rosterFactionId).singularLabel} recruit shown as later unlock potential.`,
                    )}
                    <button
                      type="button"
                      class="draft-troop-icon troop-preview"
                      class:native={isNativeTroopUnlockId(troopUnlockId)}
                      class:future={!isNativeTroopUnlockId(troopUnlockId)}
                      class:selected={isGrantedTroop || activeDetail?.detailKey === troopDetail.detailKey}
                      aria-label={`Inspect ${troopDetail.label}`}
                      on:mouseenter={() => previewDetail(troopDetail)}
                      on:focus={() => previewDetail(troopDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(troopDetail)}
                    >
                      <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDetail.kind === 'unit' ? troopDetail.quantity : 1)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDetail.kind === 'unit' ? troopDetail.quantity : 1)}`} aria-label={troopDetail.kind === 'unit' ? `${troopDetail.quantity} ${troopDetail.label} units` : troopDetail.label}>
                        {#each unitIconCopies(troopDetail.kind === 'unit' ? troopDetail.quantity : 1) as copy}
                          <img class="unit-button-art" src={getFactionUnitPortrait(rosterFactionId, rosterUnitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                        {/each}
                      </span>
                      <span>{getUnitType(rosterUnitTypeId).label}</span>
                      <small>{sourceLabel}{isGrantedTroop ? ' included' : ''}</small>
                    </button>
                  {/each}
                </div>
              </div>

              <button class:selected={selectedScheduledFactionId === factionId} on:click={() => selectScheduledFactionUnlock(factionId)}>Select {faction.label}</button>
            </article>
          {/each}
        </div>
      </div>
      <div class="opening-actions">
        <button class="primary large" disabled={!selectedScheduledFactionId} on:click={confirmScheduledFactionUnlock}>
          Confirm {selectedScheduledFactionId ? getFaction(selectedScheduledFactionId).label : 'Faction'}
        </button>
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
        {#if multiplayerStatus}
          <p class="multiplayer-status-line ui-debug-target" data-ui-name="Multiplayer troop unlock status">{multiplayerStatus}</p>
          <div class="multiplayer-room-tools ui-debug-target" data-ui-name="Multiplayer troop unlock room tools">
            <div class="multiplayer-room-card">
              <span>Room</span>
              <strong>{$gameStore.multiplayer?.roomId ?? '...'}</strong>
              <button type="button" class="link-icon-button" on:click={copyRoomLink} disabled={!$gameStore.multiplayer?.roomId} aria-label="Copy room link" title="Copy room link">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a3 3 0 0 1 4.2 4.2l-3.4 3.4a3 3 0 0 1-4.2 0 1 1 0 0 1 1.4-1.4 1 1 0 0 0 1.4 0l3.4-3.4a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0Z" /><path d="M3.8 20.2a3 3 0 0 1 0-4.2l3.4-3.4a3 3 0 0 1 4.2 0 1 1 0 0 1-1.4 1.4 1 1 0 0 0-1.4 0l-3.4 3.4a1 1 0 1 0 1.4 1.4l3.4-3.4a1 1 0 0 1 1.4 1.4L8 20.2a3 3 0 0 1-4.2 0Z" /></svg>
              </button>
            </div>
            <div class="multiplayer-player-list">
              <span>Current Players</span>
              <strong>{getLocalPlayerName()} - {playerConnectionLabel($gameStore.multiplayer?.playerId ?? 'human')}</strong>
              <strong>{getOpponentPlayerName()} - {playerConnectionLabel($gameStore.multiplayer?.playerId === 'human' ? 'ai' : 'human')}</strong>
            </div>
          </div>
          <div class="multiplayer-session-actions ui-debug-target" data-ui-name="Multiplayer troop unlock actions">
            {#if !$gameStore.multiplayer?.connected}
              <button type="button" class="primary" on:click={reconnectMultiplayerContest}>Reconnect</button>
            {/if}
            {#if multiplayerReadySubmitted}
              <button type="button" on:click={cancelMultiplayerReady}>Cancel Ready</button>
            {/if}
            <button type="button" on:click={leaveMultiplayerContest}>Leave Room</button>
            {#if multiplayerCopyMessage}
              <span>{multiplayerCopyMessage}</span>
            {/if}
          </div>
        {/if}
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
            class="draft-option troop-type-choice troop-icon-option"
            aria-label={`Inspect troop unlock ${troopDef.label}`}
            on:mouseenter={() => previewDetail(troopDetail)}
            on:focus={() => previewDetail(troopDetail)}
            on:mouseleave={clearDetail}
            on:blur={clearDetail}
            on:click={() => chooseTroopTypeUnlock(troopUnlockId)}
          >
            <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
              {#each unitIconCopies(troopDef.quantity) as copy}
                <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
              {/each}
            </span>
          </button>
        {/each}
      </div>

      {#if activeDetail}
        <aside class="panel floating-detail-panel">
          <p class="eyebrow">Troop Preview</p>
          <h2>{activeDetail.label}</h2>
          {#if activeDetail.kind === 'unit'}
            <div class="hover-unit-detail">
                  <span class="unit-icon-cluster detail-unit-cluster" style={`--unit-cluster-columns:${unitIconColumns(activeDetail.quantity)}`} aria-label={`${activeDetail.quantity} units in troop`}>
                    {#each unitIconCopies(activeDetail.quantity) as copy}
                      <img class="hover-unit-art" src={activeDetail.portraitUrl} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                    {/each}
                  </span>
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
  <main
    class="shell overworld-shell"
    class:troops-mode={$gameStore.centerMode === 'troops'}
    class:contest-info-mode={$gameStore.centerMode === 'contest'}
    class:ui-debug-visible={uiDebugVisible}
    class:design-mode-enabled={designModeEnabled}
  >
    <header class="topbar ui-debug-target" data-ui-name="Overworld top bar">
      <div class="resource-strip">
        <button
          type="button"
          class="topbar-info-button ui-debug-target info-target"
          data-ui-name="Cycle counter"
          on:mouseenter={() => showTopbarTooltip('Cycle', 'The current strategic turn. Score is evaluated at the final cycle, but you can keep playing afterward.')}
          on:focus={() => showTopbarTooltip('Cycle', 'The current strategic turn. Score is evaluated at the final cycle, but you can keep playing afterward.')}
          on:mouseleave={clearTopbarTooltip}
          on:blur={clearTopbarTooltip}
        ><span>Cycle</span><strong>{cycleProgressLabel}</strong></button>
        <button
          type="button"
          class="resource-counter resource-essence ui-debug-target info-target"
          data-ui-name="Essence counter"
          on:mouseenter={() => showTopbarTooltip('Essence', 'Essence reveals troop and upgrade drafts.')}
          on:focus={() => showTopbarTooltip('Essence', 'Essence reveals troop and upgrade drafts.')}
          on:mouseleave={clearTopbarTooltip}
          on:blur={clearTopbarTooltip}
          on:click={focusEssenceDraft}
        >
          <span>Essence</span><strong><i class="resource-icon essence"></i>{formatFixed($gameStore.game.essence)}</strong>
        </button>
        {#if $gameStore.game.gameMode === 'contest'}
          <button
            type="button"
            class="contest-score topbar-info-button ui-debug-target info-target"
            data-ui-name="Contest score counter"
            on:mouseenter={() => showTopbarTooltip('Contest VP', 'Victory Points come from Rifts held at cycle end.')}
            on:focus={() => showTopbarTooltip('Contest VP', 'Victory Points come from Rifts held at cycle end.')}
            on:mouseleave={clearTopbarTooltip}
            on:blur={clearTopbarTooltip}
          >
            <span>Contest VP</span>
            <strong>{$gameStore.game.victoryPoints} - {$gameStore.game.contest?.players.ai.victoryPoints ?? 0}</strong>
          </button>
          {#if $gameStore.multiplayer}
            <div class="contest-score multiplayer-room-status ui-debug-target" data-ui-name="Multiplayer room status">
              <span>Room {$gameStore.multiplayer.roomId ?? '...'}</span>
              <strong>{$gameStore.multiplayer.connected ? multiplayerReadyLabel() : 'Offline'}</strong>
            </div>
          {/if}
        {:else}
          <button
            type="button"
            class="topbar-info-button ui-debug-target info-target"
            data-ui-name="Victory points counter"
            on:mouseenter={() => showTopbarTooltip('Victory Points', 'Victory Points come from conquered Rifts.')}
            on:focus={() => showTopbarTooltip('Victory Points', 'Victory Points come from conquered Rifts.')}
            on:mouseleave={clearTopbarTooltip}
            on:blur={clearTopbarTooltip}
          ><span>Victory Points</span><strong>{$gameStore.game.victoryPoints}</strong></button>
        {/if}
      </div>
      {#if topbarTooltip}
        <div class="topbar-tooltip" role="tooltip">
          <strong>{topbarTooltip.label}</strong>
          <span>{topbarTooltip.description}</span>
        </div>
      {/if}

      <div class="mode-toggle ui-debug-target" data-ui-name="Top bar actions">
        <button class="ui-debug-target" data-ui-name="Show rifts view" class:selected={$gameStore.centerMode === 'rifts'} on:click={setRiftCenterMode}>Rifts</button>
        <button class="ui-debug-target" data-ui-name="Show factions and troops view" class:selected={$gameStore.centerMode === 'troops'} on:click={setTroopCenterMode}>Factions & Troops</button>
        {#if $gameStore.game.gameMode === 'contest'}
          <button class="ui-debug-target" data-ui-name="Show opponent info view" class:selected={$gameStore.centerMode === 'contest'} on:click={setContestCenterMode}>
            {$gameStore.multiplayer ? `${getOpponentPlayerName()} Info` : 'Rival Info'}
          </button>
        {/if}
        <button class="ui-debug-target" data-ui-name="Return to main menu" on:click={returnToMainMenu}>Main Menu</button>
        {#if $gameStore.multiplayer}
          <div class="topbar-room-card ui-debug-target" data-ui-name="Multiplayer room link">
            <span>{$gameStore.multiplayer.roomId ?? '...'}</span>
            <button type="button" class="link-icon-button" on:click={copyRoomLink} disabled={!$gameStore.multiplayer.roomId} aria-label="Copy room link" title="Copy room link">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a3 3 0 0 1 4.2 4.2l-3.4 3.4a3 3 0 0 1-4.2 0 1 1 0 0 1 1.4-1.4 1 1 0 0 0 1.4 0l3.4-3.4a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0Z" /><path d="M3.8 20.2a3 3 0 0 1 0-4.2l3.4-3.4a3 3 0 0 1 4.2 0 1 1 0 0 1-1.4 1.4 1 1 0 0 0-1.4 0l-3.4 3.4a1 1 0 1 0 1.4 1.4l3.4-3.4a1 1 0 0 1 1.4 1.4L8 20.2a3 3 0 0 1-4.2 0Z" /></svg>
            </button>
          </div>
          {#if !$gameStore.multiplayer.connected}
            <button class="primary ui-debug-target" data-ui-name="Reconnect multiplayer room" on:click={reconnectMultiplayerContest}>Reconnect</button>
          {/if}
          {#if multiplayerReadySubmitted}
            <button class="ui-debug-target" data-ui-name="Cancel multiplayer ready" on:click={cancelMultiplayerReady}>Cancel Ready</button>
          {/if}
          <button class="ui-debug-target" data-ui-name="Leave multiplayer room" on:click={leaveMultiplayerContest}>Leave Room</button>
        {/if}
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
                    : activeDetail.inspectLabel}
            </p>
            <h2 class="detail-title">{#if activeDetail.iconKind && activeDetail.iconId}<GameIcon kind={activeDetail.iconKind} id={activeDetail.iconId} label={activeDetail.label} />{/if}<span>{activeDetail.label}</span></h2>
            {#if activeDetail.kind === 'unit'}
              <div class="hover-unit-detail">
                <span class="unit-icon-cluster detail-unit-cluster" style={`--unit-cluster-columns:${unitIconColumns(activeDetail.quantity)}`} aria-label={`${activeDetail.quantity} units in troop`}>
                  {#each unitIconCopies(activeDetail.quantity) as copy}
                    <img class="hover-unit-art" src={activeDetail.portraitUrl} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                  {/each}
                </span>
                <p>{activeDetail.description}</p>
              </div>
              <StatBreakdownGrid stats={activeDetail.stats} columns={4} />
              <button type="button" class="compare-pin-button" on:click={() => pinComparisonDetail(activeDetail)}>📌 Compare</button>
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
                        <span class="icon-label"><GameIcon kind="ability" id={ability.id} label={ability.label} /><span>{ability.label}</span></span>
                      </button>
                      {#each ability.summoned as summon}
                        <button
                          type="button"
                          class="mutator-chip summon-preview-chip"
                          aria-label={`Inspect summoned ${summon.label}`}
                          on:mouseenter={() => previewDetail(summon.detail)}
                          on:focus={() => previewDetail(summon.detail)}
                          on:mouseleave={clearDetail}
                          on:blur={clearDetail}
                          on:click={() => togglePinnedDetail(summon.detail)}
                        >
                          <span class="icon-label"><img class="summon-chip-art" src={summon.detail.portraitUrl} alt="" aria-hidden="true" /><span>{summon.count} {summon.label}</span></span>
                        </button>
                      {/each}
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
              {#if activeDetail.description}
                <p>{activeDetail.description}</p>
              {/if}
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
                    <span class="icon-label"><GameIcon kind="mutator" id={mutatorId} label={getMutator(mutatorId).label} /><span>{getMutator(mutatorId).label}</span></span>
                  </button>
                {/each}
              {/if}
            </div>
          </div>

          <div class="compact-list enemy-list">
            {#each getVisibleRiftDefenders(selectedRift) as enemy}
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
                <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(enemy.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(enemy.quantity)}`} aria-label={`${enemy.quantity} ${enemy.label} units`}>
                  {#each unitIconCopies(enemy.quantity) as copy}
                    <img class="unit-tile-art" src={getFactionUnitPortrait(enemy.factionId, enemy.unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                  {/each}
                </span>
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
                    aria-label={`Drag ${troopDef.label} to assign or move it`}
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
                    <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                      {#each unitIconCopies(troopDef.quantity) as copy}
                        <img class="unit-tile-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                      {/each}
                    </span>
                    {#if troop.assignmentRiftId === selectedRift.id}
                      <small>✅</small>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else if $gameStore.centerMode === 'troops' && selectedTroop && selectedTroopDefinition}
          <p class="eyebrow">Troop Inspector</p>
          <h2>{selectedTroopDefinition.label}</h2>
          <div class="hover-unit-detail">
            <span class="unit-icon-cluster detail-unit-cluster" style={`--unit-cluster-columns:${unitIconColumns(selectedTroopDefinition.quantity)}`} aria-label={`${selectedTroopDefinition.quantity} units in troop`}>
              {#each unitIconCopies(selectedTroopDefinition.quantity) as copy}
                <img class="hover-unit-art" src={getFactionUnitPortrait(selectedTroop.factionId, selectedTroop.unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
              {/each}
            </span>
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
                  {@const selectedSummons = getSummonedUnitPreviews(ability, selectedTroop.factionId).map((preview) => buildResolvedUnitDetail(
                    `selected-summon:${selectedTroop.id}:${ability.id}:${preview.unitTypeId}:${preview.grantedAbilityIds.join(',')}`,
                    preview.troop.label,
                    preview.troop.factionId,
                    preview.troop.unitTypeId,
                    preview.troop.stats,
                    preview.troop.quantity,
                    `${preview.count > 1 ? `${preview.count} units. ` : ''}${preview.consumesCorpse ? 'Requires a corpse. ' : ''}Summoned by ${ability.label}.`,
                    preview.troop.abilities,
                  ))}
                  <button
                    class="mutator-chip ability-chip"
                    on:mouseenter={() => showAbilityTooltip(ability)}
                    on:focus={() => showAbilityTooltip(ability)}
                    on:mouseleave={() => (hoveredAbilityTooltip = null)}
                    on:blur={() => (hoveredAbilityTooltip = null)}
                  >
                    <span class="icon-label"><GameIcon kind="ability" id={ability.id} label={ability.label} /><span>{ability.label}</span></span>
                  </button>
                  {#each selectedSummons as summonDetail}
                    <button
                      type="button"
                      class="mutator-chip summon-preview-chip"
                      aria-label={`Inspect summoned ${summonDetail.label}`}
                      on:mouseenter={() => previewDetail(summonDetail)}
                      on:focus={() => previewDetail(summonDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(summonDetail)}
                    >
                      <span class="icon-label"><img class="summon-chip-art" src={summonDetail.portraitUrl} alt="" aria-hidden="true" /><span>{summonDetail.label}</span></span>
                    </button>
                  {/each}
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
          <p class="eyebrow">Troop Inspector</p>
          <h2>No Focus Item</h2>
          <p>
            {$gameStore.centerMode === 'rifts'
              ? 'Hover or select a troop, enemy, or mutator from the Rift board to inspect it here.'
              : $gameStore.centerMode === 'troops'
                ? 'Choose a Rift or troop to inspect its roster, stats, and assignments.'
                : 'Hover or select an opponent troop, faction, or upgrade to inspect it here.'}
          </p>
        {/if}
      </div>

      {#if comparisonDetails.length > 0}
        <div class="panel comparison-tray ui-debug-target" data-ui-name="Troop comparison tray">
          <div class="comparison-header">
            <p class="eyebrow">Compare Troops</p>
            <button type="button" on:click={() => (comparisonDetails = [])}>Clear</button>
          </div>
          <div class="comparison-grid">
            {#each comparisonDetails as detail}
              {#if detail.kind === 'unit'}
                <article class="comparison-card">
                  <button type="button" class="comparison-remove" aria-label={`Remove ${detail.label} from comparison`} on:click={() => removeComparisonDetail(detail.detailKey)}>X</button>
                  {#if activeDetail?.kind === 'unit' && activeDetail.detailKey !== detail.detailKey}
                    <div class="comparison-versus">
                      <div class="comparison-unit-summary">
                        <span class={`unit-icon-cluster tile-unit-cluster comparison-unit-art ${unitIconDensityClass(detail.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(detail.quantity)}`} aria-label={`${detail.quantity} ${detail.label} units`}>
                          {#each unitIconCopies(detail.quantity) as copy}
                            <img class="unit-tile-art" src={detail.portraitUrl} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                          {/each}
                        </span>
                        <strong>{detail.label}</strong>
                      </div>
                      <span class="comparison-versus-mark">vs</span>
                      <div class="comparison-unit-summary selected">
                        <span class={`unit-icon-cluster tile-unit-cluster comparison-unit-art ${unitIconDensityClass(activeDetail.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(activeDetail.quantity)}`} aria-label={`${activeDetail.quantity} ${activeDetail.label} units`}>
                          {#each unitIconCopies(activeDetail.quantity) as copy}
                            <img class="unit-tile-art" src={activeDetail.portraitUrl} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                          {/each}
                        </span>
                        <strong>{activeDetail.label}</strong>
                      </div>
                    </div>
                  {:else}
                    <div class="comparison-unit-summary solo">
                      <span class={`unit-icon-cluster tile-unit-cluster comparison-unit-art ${unitIconDensityClass(detail.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(detail.quantity)}`} aria-label={`${detail.quantity} ${detail.label} units`}>
                        {#each unitIconCopies(detail.quantity) as copy}
                          <img class="unit-tile-art" src={detail.portraitUrl} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                        {/each}
                      </span>
                      <strong>{detail.label}</strong>
                    </div>
                  {/if}
                  <StatBreakdownGrid stats={withActiveComparisonDeltas(detail, activeDetail)} columns={2} />
                  <div class="comparison-abilities">
                    {#if detail.abilities.length === 0}
                      <small>No abilities</small>
                    {:else}
                      {#each detail.abilities as ability}
                        <small>{ability.label}</small>
                      {/each}
                    {/if}
                  </div>
                  <div class="comparison-upgrades">
                    {#each $gameStore.game.factionUpgradeIds.filter((upgradeId) => FACTION_UPGRADES[upgradeId]?.factionId === detail.factionId) as upgradeId}
                      <small>{getUpgradeDetails(upgradeId).label}</small>
                    {/each}
                    {#each $gameStore.game.troopTypeUpgradeIds.filter((upgradeId) => TROOP_TYPE_UPGRADES[upgradeId]?.unitTypeId === detail.unitTypeId) as upgradeId}
                      <small>{getUpgradeDetails(upgradeId).label}</small>
                    {/each}
                  </div>
                </article>
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    </section>

    <section class="center-column ui-debug-target" data-ui-name={getCenterBoardLabel()}>
      {#if $gameStore.centerMode === 'rifts'}
        <div class="rift-grid">
          {#each discoveredRifts as rift}
            {@const riftVisual = getRiftVisual(rift)}
            {@const battleAnimation = getRiftBattleAnimationView(rift)}
            {@const leftForceLoss = getAnimationForceLossTiming(battleAnimation, 'left')}
            {@const rightForceLoss = getAnimationForceLossTiming(battleAnimation, 'right')}
            <article
              class="rift-card ui-debug-target"
              class:contest-neutral={$gameStore.game.gameMode === 'contest' && (!rift.controller || rift.controller === 'neutral')}
              class:contest-human-held={$gameStore.game.gameMode === 'contest' && rift.controller === 'human'}
              class:contest-ai-held={$gameStore.game.gameMode === 'contest' && rift.controller === 'ai'}
              class:archive-highlighted={selectedRiftId === rift.id}
              data-ui-name={`Rift card ${formatRiftDisplayId(rift.id)}`}
              class:drop-target-active={troopDrag?.active && isCurrentDropTarget(troopDrag.dropTarget, 'rift', rift.id)}
              class:drop-target-blocked={!!getRiftDropValidationMessage(rift.id)}
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
                  {#if $gameStore.game.gameMode === 'contest'}
                    <span class="control-pill">{getRiftControllerLabel(rift)}</span>
                  {/if}
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
                        <span class="icon-label"><GameIcon kind="mutator" id={mutatorId} label={getMutator(mutatorId).label} /><span>{getMutator(mutatorId).label}</span></span>
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

              <div class="rift-battle-lane">
                <div class="assigned-strip enemy-strip rift-force-side rift-force-left" class:force-loses-now={leftForceLoss === 'now'} class:force-loses-late={leftForceLoss === 'late'}>
                  {#each getAnimationLeftCombatants(rift, battleAnimation) as enemy}
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
                      <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(enemy.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(enemy.quantity)}`} aria-label={`${enemy.quantity} ${enemy.label} units`}>
                        {#each unitIconCopies(enemy.quantity) as copy}
                          <img class="unit-tile-art" src={getFactionUnitPortrait(enemy.factionId, enemy.unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                        {/each}
                      </span>
                    </button>
                  {/each}
                </div>

                <div class="rift-battle-center">
                  {#if battleAnimation}
                    <div class="rift-battle-animation" aria-hidden="true">
                      {#each battleAnimation.phases as phase}
                        <div class={`rift-battle-phase ${phase.delayClass}`}>
                          <div class="clash-swords" class:left-loses={phase.left.loses} class:right-loses={phase.right.loses}>
                            <span class="clash-sword left-sword"></span>
                            <span class="clash-spark"></span>
                            <span class="clash-sword right-sword"></span>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>

                <div class="assigned-strip rift-force-side rift-force-right" class:force-loses-now={rightForceLoss === 'now'} class:force-loses-late={rightForceLoss === 'late'}>
                  {#if troopDrag?.active && troopDrag.dropTarget?.kind === 'rift' && troopDrag.dropTarget.riftId === rift.id && !getRiftDropValidationMessage(rift.id)}
                    <div class="unit-tile drop-preview-tile">
                      <img class="unit-tile-art" src={troopDrag.portraitUrl} alt="" aria-hidden="true" />
                    </div>
                  {/if}
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
                      class:dragging-source={troopDrag?.troopId === troop.id && troopDrag.active}
                      class:upgrade-affected={isUpgradeAffectingTroop(troop.id)}
                      class:holding={isHoldingTroop(troop.id)}
                      class:conflict-pulse={assignmentConflict?.troopId === troop.id || assignmentConflict?.conflictTroopId === troop.id}
                      aria-label={`Drag ${troopDef.label} to another Rift or Ready Troops`}
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
                      <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                        {#each unitIconCopies(troopDef.quantity) as copy}
                          <img class="unit-tile-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                        {/each}
                      </span>
                    </button>
                  {/each}
                </div>
              </div>

              {#if getRiftDropValidationMessage(rift.id)}
                <p class="drop-conflict-message">{getRiftDropValidationMessage(rift.id)}</p>
              {:else if assignmentConflict?.riftId === rift.id}
                <p class="drop-conflict-message">{assignmentConflict.message}</p>
              {/if}

            </article>
          {/each}
        </div>
      {:else if $gameStore.centerMode === 'troops'}
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
                  on:click={() => handleFactionHeaderClick(factionId, factionDetail)}
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
                        <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
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
                    class:selected={selectedTroopId === troop.id || activeDetail?.detailKey === troopDetail.detailKey}
                    aria-label={`Inspect troop ${troopDef.label}`}
                    on:click={() => handleRosterTroopClick(troop.id, troopDetail)}
                    on:mouseenter={() => previewDetail(troopDetail)}
                    on:focus={() => previewDetail(troopDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                  >
                    <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                      {#each unitIconCopies(troopDef.quantity) as copy}
                        <img class="unit-button-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                      {/each}
                    </span>
                  </button>
                {/each}
              </div>

              {#if (selectedFactionId === factionId || activeDetail?.detailKey === factionDetail.detailKey) && getAvailableFactionTroopUnlockIds(factionId).length > 0}
                <div class="available-troop-block">
                  <span class="assignment-label">Available Troop Types</span>
                  <div class="troop-list faction-troop-list">
                    {#each getAvailableFactionTroopUnlockIds(factionId) as troopUnlockId}
                      {@const [availableFactionId, unitTypeId] = parseTroopUnlockId(troopUnlockId)}
                      {@const troopDef = TROOP_CATALOG[troopUnlockId]}
                      {@const troopDetail = buildResolvedUnitDetail(
                        `available:${troopUnlockId}`,
                        troopDef.label,
                        availableFactionId,
                        unitTypeId,
                        troopDef.stats,
                        troopDef.quantity,
                        'Available for future troop drafts.',
                        troopDef.abilities,
                      )}
                      <button
                        class="troop-chip available-troop-chip ui-debug-target"
                        data-ui-name={`Available troop type ${troopDef.label}`}
                        class:selected={activeDetail?.detailKey === troopDetail.detailKey}
                        aria-label={`Inspect available troop ${troopDef.label}`}
                        on:mouseenter={() => previewDetail(troopDetail)}
                        on:focus={() => previewDetail(troopDetail)}
                        on:mouseleave={clearDetail}
                        on:blur={clearDetail}
                        on:click={() => togglePinnedDetail(troopDetail)}
                      >
                        <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                          {#each unitIconCopies(troopDef.quantity) as copy}
                            <img class="unit-button-art" src={getFactionUnitPortrait(availableFactionId, unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                          {/each}
                        </span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </section>
          {/each}
        </div>
      {:else}
        <div class="opponent-info-board">
          {#if !opponentInfo || !opponentInfoAi}
            <div class="opponent-empty-state ui-debug-target" data-ui-name="Opponent info unknown"></div>
          {:else}
            {#if opponentInfoAi.troopTypeUpgradeIds.length > 0}
              <section class="panel opponent-upgrades-panel ui-debug-target" data-ui-name="Opponent troop type upgrades">
                <p class="eyebrow">Troop Type Upgrades</p>
                <div class="unlock-row opponent-upgrade-row">
                  {#each opponentInfoAi.troopTypeUpgradeIds as upgradeId}
                    {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                    <button
                      class="list-button opponent-upgrade-chip"
                      class:selected={activeDetail?.detailKey === upgradeDetail.detailKey}
                      on:mouseenter={() => previewDetail(upgradeDetail)}
                      on:focus={() => previewDetail(upgradeDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(upgradeDetail)}
                    >
                      <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                    </button>
                  {/each}
                </div>
              </section>
            {/if}

            <div class="faction-grid opponent-faction-grid">
              {#each opponentInfoFactionIds as factionId}
                {@const faction = getFaction(factionId)}
                {@const factionDetail = buildFactionDetail(factionId)}
                {@const factionUpgradeIds = getOpponentFactionUpgradeIds(opponentInfoAi, factionId)}
                {@const factionTroops = opponentInfoAi.troops.filter((troop) => troop.factionId === factionId)}
                <section class="faction-card panel opponent-faction-card ui-debug-target" data-ui-name={`Opponent faction card ${faction.label}`}>
                  <header class="faction-card-top opponent-faction-card-top">
                    <button
                      class="title-button faction-name-button ui-debug-target"
                      data-ui-name={`Opponent faction header ${faction.label}`}
                      class:selected={activeDetail?.detailKey === factionDetail.detailKey}
                      on:mouseenter={() => previewDetail(factionDetail)}
                      on:focus={() => previewDetail(factionDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(factionDetail)}
                    >
                      <span>{faction.label}</span>
                      <img class="faction-name-art" src={getFactionPortrait(factionId)} alt="" aria-hidden="true" />
                    </button>

                    <div class="unlock-row faction-card-upgrades">
                      {#if factionUpgradeIds.length === 0}
                        <span class="mutator-chip empty">No known faction upgrades</span>
                      {:else}
                        {#each factionUpgradeIds as upgradeId}
                          {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                          <button
                            class="list-button ui-debug-target"
                            data-ui-name={`Opponent faction upgrade ${getUpgradeDetails(upgradeId).label}`}
                            class:selected={activeDetail?.detailKey === upgradeDetail.detailKey}
                            on:mouseenter={() => previewDetail(upgradeDetail)}
                            on:focus={() => previewDetail(upgradeDetail)}
                            on:mouseleave={clearDetail}
                            on:blur={clearDetail}
                            on:click={() => togglePinnedDetail(upgradeDetail)}
                          >
                            <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                          </button>
                        {/each}
                      {/if}
                    </div>
                  </header>

                  <div class="troop-list faction-troop-list opponent-troop-list">
                    {#each factionTroops as troop}
                      {@const troopDef = resolveTroopCombatant(opponentInfoAi, troop, 'enemy', null, `known-ai:${troop.id}`)}
                      {@const isMobileThreat = !currentOpponentOccupyingTroopIds.has(troop.id)}
                      {@const troopDetail = buildResolvedUnitDetail(
                        `opponent:${opponentInfo.cycleNumber}:${troop.id}`,
                        troopDef.label,
                        troop.factionId,
                        troop.unitTypeId,
                        troopDef.stats,
                        troopDef.quantity,
                        isMobileThreat ? 'Known opponent troop not currently holding any Rift.' : 'Known opponent troop currently holding a Rift.',
                        troopDef.abilities,
                        troopDef.statBreakdowns,
                      )}
                      <button
                        class="troop-chip opponent-troop-chip ui-debug-target"
                        class:opponent-threat={isMobileThreat}
                        data-ui-name={`Opponent troop ${troopDef.label}`}
                        class:selected={activeDetail?.detailKey === troopDetail.detailKey}
                        aria-label={`Inspect opponent troop ${troopDef.label}`}
                        on:mouseenter={() => previewDetail(troopDetail)}
                        on:focus={() => previewDetail(troopDetail)}
                        on:mouseleave={clearDetail}
                        on:blur={clearDetail}
                        on:click={() => togglePinnedDetail(troopDetail)}
                      >
                        <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                          {#each unitIconCopies(troopDef.quantity) as copy}
                            <img class="unit-button-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                          {/each}
                        </span>
                      </button>
                    {/each}
                  </div>
                </section>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </section>

    <section class="right-column ui-debug-target" data-ui-name="Right sidebar">
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

      {#if false && $gameStore.centerMode === 'troops'}
        <div class="panel essence-draft-panel" class:soft-highlight={essenceDraftHighlighted}>
          {#if !essenceDraftActive}
            <p class="draft-helper-copy">Spend two Essence to reveal troop and upgrade packs together, then claim one option from each.</p>

            <div class="actions-grid">
              <button class="primary reveal-draft-button" class:soft-highlight={essenceDraftHighlighted} disabled={essenceDraftCost === null || $gameStore.game.essence < essenceDraftCost} on:click={() => gameStore.revealEssenceDraft()}>
                <span>{essenceDraftButtonLabel}</span>
                {#if essenceDraftCost}
                  <span class="essence-cost"><i class="resource-icon essence"></i><strong>{essenceDraftCost}</strong></span>
                {/if}
              </button>
            </div>
          {/if}

          {#if $gameStore.game.activeTroopOffer}
            <div class="draft-offer-block">
              <span class="assignment-label">Choose one troop</span>
              <div class="option-list troop-draft-option-list">
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
                    class="draft-option troop-icon-option"
                    class:selected={selectedTroopOfferUnlockId === troopUnlockId}
                    aria-label={`Inspect troop unlock ${troopDef.label}`}
                    on:mouseenter={() => previewDetail(troopDetail)}
                    on:focus={() => previewDetail(troopDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => selectTroopOfferUnlock(troopUnlockId, troopDetail)}
                  >
                    <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                      {#each unitIconCopies(troopDef.quantity) as copy}
                        <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                      {/each}
                    </span>
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
              <span class="assignment-label">Choose one upgrade</span>
              <div class="unlock-row">
                {#each $gameStore.game.activeUpgradeOffer.optionUpgradeIds as upgradeId}
                  {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                  {@const affectedTroops = getAffectedTroopsForUpgrade(upgradeId)}
                  <button
                    class="list-button"
                    class:selected={selectedUpgradeOfferId === upgradeId}
                    on:mouseenter={() => { hoveredUpgradeOfferId = upgradeId; previewDetail(upgradeDetail); }}
                    on:focus={() => { hoveredUpgradeOfferId = upgradeId; previewDetail(upgradeDetail); }}
                    on:mouseleave={() => { hoveredUpgradeOfferId = null; clearDetail(); }}
                    on:blur={() => { hoveredUpgradeOfferId = null; clearDetail(); }}
                    on:click={() => selectUpgradeOffer(upgradeId, upgradeDetail)}
                  >
                    <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
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
              <button
                type="button"
                class="primary"
                disabled={!selectedUpgradeOfferId}
                on:click={confirmUpgradeOffer}
              >
                Confirm Upgrade
              </button>
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
              <span class="unit-icon-cluster detail-unit-cluster" style={`--unit-cluster-columns:${unitIconColumns(activeDetail.quantity)}`} aria-label={`${activeDetail.quantity} units in troop`}>
                {#each unitIconCopies(activeDetail.quantity) as copy}
                  <img class="hover-unit-art" src={activeDetail.portraitUrl} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                {/each}
              </span>
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
                      <span class="icon-label"><GameIcon kind="ability" id={ability.id} label={ability.label} /><span>{ability.label}</span></span>
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
          <div class="archive-inspect-heading">
            <h2>{decorateArchiveSummary(selectedReplayEntry.summary)}</h2>
            <button
              type="button"
              class="archive-watch-button archive-inspect-watch-button"
              aria-label={selectedReplayAvailable ? 'Watch Battle' : 'Replay unavailable'}
              title={selectedReplayAvailable ? 'Watch Battle' : 'Replay unavailable'}
              disabled={!selectedReplayAvailable}
              on:click={openSelectedReplay}
            >
              <svg class="archive-watch-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2.2 12s3.4-6.1 9.8-6.1 9.8 6.1 9.8 6.1-3.4 6.1-9.8 6.1S2.2 12 2.2 12Z" />
                <circle cx="12" cy="12" r="3.25" />
              </svg>
            </button>
          </div>
          <p>Cycle {selectedReplayEntry.cycleNumber} vs {selectedReplayEntry.encounterLabel ?? 'Enemy'}: {selectedReplayEntry.outcome}.</p>
          {#if selectedReplayEntry.riftLabel || selectedReplayEntry.riftId}
            <p class="archive-rift-id">Rift {selectedReplayEntry.riftLabel ?? formatRiftDisplayId(selectedReplayEntry.riftId ?? '')}</p>
          {/if}
          {#if selectedReplayEntry.resultDrift}
            <div class="archive-drift-note">
              <strong>Rules changed this replay.</strong>
              <span>It now resolves as {decorateArchiveSummary(selectedReplayEntry.resultDrift.currentSummary)}; archived result was {decorateArchiveSummary(selectedReplayEntry.resultDrift.originalSummary)}.</span>
            </div>
          {/if}
          <div class="ability-row">
            <span>Mutators</span>
            <div class="ability-list">
              {#if selectedReplayEntry.mutatorIds.length === 0}
                <span class="mutator-chip empty">None</span>
              {:else}
                {#each selectedReplayEntry.mutatorIds as mutatorId}
                  <button
                    class="mutator-chip"
                    class:selected={activeDetail?.detailKey === buildMutatorDetail(mutatorId).detailKey}
                    on:mouseenter={() => previewDetail(buildMutatorDetail(mutatorId))}
                    on:focus={() => previewDetail(buildMutatorDetail(mutatorId))}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => togglePinnedDetail(buildMutatorDetail(mutatorId))}
                  >
                    <span class="icon-label"><GameIcon kind="mutator" id={mutatorId} label={getMutator(mutatorId).label} /><span>{getMutator(mutatorId).label}</span></span>
                  </button>
                {/each}
              {/if}
            </div>
          </div>

          {#if selectedArchiveHealthTotals.length > 0}
            <div class="archive-health-totals">
              {#each selectedArchiveHealthTotals as total}
                <div class={`archive-health-total ${archiveParticipantClass(getArchiveParticipant(total.side).kind)}`}>
                  <div>
                    <span>{total.label} final HP</span>
                    <strong>{total.hpLabel}</strong>
                  </div>
                  <div class="replay-health-bar total" aria-hidden="true">
                    <span style={`width: ${total.hpPercent}`}></span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          {#if selectedArchivePayload}
            <div class="archive-force-block">
              <span class={`assignment-label archive-side-label ${archiveParticipantClass(getArchiveParticipant('player').kind)}`}>{getArchiveForcesLabel('player')}</span>
              <div class="assigned-strip archive-force-strip">
                {#each selectedArchivePayload.input.playerCombatants as combatant}
                  {@const combatantDetail = buildArchiveCombatantDetail(combatant, 'player')}
                  <button
                    class="unit-tile assigned-summary-tile ui-debug-target"
                    data-ui-name={`Archive player force ${combatant.label}`}
                    class:selected={activeDetail?.detailKey === combatantDetail.detailKey}
                    on:mouseenter={() => previewDetail(combatantDetail)}
                    on:focus={() => previewDetail(combatantDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => togglePinnedDetail(combatantDetail)}
                  >
                    <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(combatant.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(combatant.quantity)}`} aria-label={`${combatant.quantity} ${combatant.label} units`}>
                      {#each unitIconCopies(combatant.quantity) as copy}
                        <img class="unit-tile-art" src={getFactionUnitPortrait(combatant.factionId, combatant.unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                      {/each}
                    </span>
                  </button>
                {/each}
              </div>
              <div class="unlock-row archive-upgrade-row">
                {#if selectedArchivePlayerUpgradeIds.length > 0}
                  {#each selectedArchivePlayerUpgradeIds as upgradeId}
                    {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                    <button
                      class="list-button archive-upgrade-chip"
                      class:selected={activeDetail?.detailKey === upgradeDetail.detailKey}
                      on:mouseenter={() => previewDetail(upgradeDetail)}
                      on:focus={() => previewDetail(upgradeDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(upgradeDetail)}
                    >
                      <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                    </button>
                  {/each}
                {/if}
              </div>
            </div>

            <div class="archive-force-block">
              <span class={`assignment-label archive-side-label ${archiveParticipantClass(getArchiveParticipant('enemy').kind)}`}>{getArchiveForcesLabel('enemy')}</span>
              <div class="assigned-strip enemy-strip archive-force-strip">
                {#each selectedArchivePayload.input.enemyCombatants as combatant}
                  {@const combatantDetail = buildArchiveCombatantDetail(combatant, 'enemy')}
                  <button
                    class="unit-tile enemy-tile ui-debug-target"
                    data-ui-name={`Archive enemy force ${combatant.label}`}
                    class:selected={activeDetail?.detailKey === combatantDetail.detailKey}
                    on:mouseenter={() => previewDetail(combatantDetail)}
                    on:focus={() => previewDetail(combatantDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => togglePinnedDetail(combatantDetail)}
                  >
                    <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(combatant.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(combatant.quantity)}`} aria-label={`${combatant.quantity} ${combatant.label} units`}>
                      {#each unitIconCopies(combatant.quantity) as copy}
                        <img class="unit-tile-art" src={getFactionUnitPortrait(combatant.factionId, combatant.unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                      {/each}
                    </span>
                  </button>
                {/each}
              </div>
              {#if selectedArchiveEnemyUpgradeIds.length > 0}
                <div class="unlock-row archive-upgrade-row">
                  {#each selectedArchiveEnemyUpgradeIds as upgradeId}
                    {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                    <button
                      class="list-button archive-upgrade-chip"
                      class:selected={activeDetail?.detailKey === upgradeDetail.detailKey}
                      on:mouseenter={() => previewDetail(upgradeDetail)}
                      on:focus={() => previewDetail(upgradeDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(upgradeDetail)}
                    >
                      <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {:else}
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
          {/if}
          <p>
            {#if selectedReplayEntry.summaryOnly}
              This battle was archived as a summary only.
            {:else if selectedReplayAvailable}
              Open the replay to inspect the full battle log.
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
              {#each pagedReplayEntries as replayEntry}
                {@const archiveRiftVisual = getArchiveRiftVisual(replayEntry)}
                {@const archiveVisual = archiveRiftVisual ? getRiftVisual(archiveRiftVisual) : null}
                <div class="archive-card-row">
                  <button
                    class="archive-card ui-debug-target"
                    data-ui-name={`Archive entry ${replayEntry.summary}`}
                    class:selected={selectedReplayId === replayEntry.replayId}
                    style={getArchiveCardStyle(replayEntry)}
                    on:mouseenter={() => previewArchiveRift(replayEntry)}
                    on:focus={() => previewArchiveRift(replayEntry)}
                    on:click={() => selectReplay(replayEntry.replayId)}
                  >
                    {#if archiveVisual}
                      <span class="archive-rift-thumbnail" style={`--rift-tint:${archiveVisual.tint}; --rift-glow:${archiveVisual.glow}; --rift-rotation:${archiveVisual.rotationDeg}deg;`}>
                        <img src={archiveVisual.imageUrl} alt="" aria-hidden="true" style={`filter:${archiveVisual.filter};`} />
                      </span>
                    {/if}
                    <span class="archive-card-copy">
                      <strong>{decorateArchiveSummary(replayEntry.summary)}</strong>
                      {#if archiveEntryMatchupLabel(replayEntry)}
                        <small>{archiveEntryMatchupLabel(replayEntry)}</small>
                      {/if}
                      {#if replayEntry.riftId && !discoveredRifts.some((rift) => rift.id === replayEntry.riftId)}
                        <small>Archived Rift no longer on map</small>
                      {/if}
                      {#if replayEntry.resultDrift}
                        <small>Now {decorateArchiveSummary(replayEntry.resultDrift.currentSummary)}</small>
                      {/if}
                    </span>
                  </button>
                  <button
                    type="button"
                    class="archive-watch-button"
                    aria-label={replayEntry.summaryOnly || !gameStore.hasReplay(replayEntry.replayId) ? 'Replay unavailable' : 'Watch Battle'}
                    title={replayEntry.summaryOnly || !gameStore.hasReplay(replayEntry.replayId) ? 'Replay unavailable' : 'Watch Battle'}
                    disabled={replayEntry.summaryOnly || !gameStore.hasReplay(replayEntry.replayId)}
                    on:click={() => gameStore.openReplay(replayEntry.replayId)}
                  >
                    👁️
                    <svg class="archive-watch-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2.2 12s3.4-6.1 9.8-6.1 9.8 6.1 9.8 6.1-3.4 6.1-9.8 6.1S2.2 12 2.2 12Z" />
                      <circle cx="12" cy="12" r="3.25" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
            {#if archivePageCount > 1}
              <div class="archive-pagination">
                <button type="button" aria-label="Previous archive page" disabled={archivePage === 0} on:click={() => (archivePage = Math.max(0, archivePage - 1))}>&lt;</button>
                <span>Page {archivePage + 1} / {archivePageCount}</span>
                <button type="button" aria-label="Next archive page" disabled={archivePage >= archivePageCount - 1} on:click={() => (archivePage = Math.min(archivePageCount - 1, archivePage + 1))}>&gt;</button>
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </section>

    <footer class="action-rail">
      {#if $gameStore.centerMode === 'rifts' && selectedReplayEntry}
        <div class="archive-actions-stack">
          <button class="large ui-debug-target" data-ui-name="Back to archive" on:click={() => (selectedReplayId = null)}>Back to Archive</button>
        </div>
      {:else}
        {#if $gameStore.game.phase === 'planning' && $gameStore.centerMode === 'troops'}
          <div class="panel essence-draft-panel footer-essence-draft-panel ui-debug-target" data-ui-name="Bottom essence draft panel" class:soft-highlight={essenceDraftHighlighted}>
            {#if !essenceDraftActive && !confirmedTroopOfferUnlockId && !confirmedUpgradeOfferId}
              <p class="draft-helper-copy">Spend Essence to reveal linked troop and upgrade packs.</p>
              <div class="actions-grid">
                <button class="primary reveal-draft-button" class:soft-highlight={essenceDraftHighlighted} disabled={essenceDraftCost === null || $gameStore.game.essence < essenceDraftCost} on:click={() => gameStore.revealEssenceDraft()}>
                  <span>{essenceDraftButtonLabel}</span>
                  {#if essenceDraftCost}
                    <span class="essence-cost"><i class="resource-icon essence"></i><strong>{essenceDraftCost}</strong></span>
                  {/if}
                </button>
              </div>
            {:else}
              <div class="essence-draft-groups" class:has-synergy={selectedDraftChoicesHaveSynergy()}>
                <div class="draft-offer-block" class:locked={!$gameStore.game.activeTroopOffer && !!confirmedTroopOfferUnlockId}>
                  <span class="assignment-label">Choose one troop</span>
                  {#if $gameStore.game.activeTroopOffer}
                    <div class="option-list troop-draft-option-list">
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
                          class="draft-option troop-icon-option"
                          class:selected={selectedTroopOfferUnlockId === troopUnlockId}
                          class:upgrade-affected={isUpgradeAffectingDraftTroop(troopUnlockId)}
                          aria-label={`Inspect troop unlock ${troopDef.label}`}
                          on:mouseenter={() => previewDetail(troopDetail)}
                          on:focus={() => previewDetail(troopDetail)}
                          on:mouseleave={clearDetail}
                          on:blur={clearDetail}
                          on:click={() => selectTroopOfferUnlock(troopUnlockId, troopDetail)}
                        >
                          <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                            {#each unitIconCopies(troopDef.quantity) as copy}
                              <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                            {/each}
                          </span>
                          {#if isUpgradeAffectingDraftTroop(troopUnlockId)}
                            <span class="upgrade-plus-badge" aria-hidden="true">+</span>
                          {/if}
                        </button>
                      {/each}
                    </div>
                    <button type="button" class="primary" disabled={!selectedTroopOfferUnlockId} on:click={confirmTroopOfferUnlock}>Confirm Troop</button>
                  {:else if confirmedTroopOfferUnlockId}
                    {@const [factionId, unitTypeId] = parseTroopUnlockId(confirmedTroopOfferUnlockId)}
                    <div class="locked-draft-card">
                      <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(TROOP_CATALOG[confirmedTroopOfferUnlockId].quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(TROOP_CATALOG[confirmedTroopOfferUnlockId].quantity)}`} aria-label={`${TROOP_CATALOG[confirmedTroopOfferUnlockId].quantity} ${TROOP_CATALOG[confirmedTroopOfferUnlockId].label} units`}>
                        {#each unitIconCopies(TROOP_CATALOG[confirmedTroopOfferUnlockId].quantity) as copy}
                          <img class="unit-button-art" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                        {/each}
                      </span>
                      <strong>{TROOP_CATALOG[confirmedTroopOfferUnlockId].label}</strong>
                      <span>Confirmed</span>
                    </div>
                  {/if}
                </div>

                <div class="draft-synergy-connector" aria-hidden="true"></div>

                <div class="draft-offer-block" class:locked={!$gameStore.game.activeUpgradeOffer && !!confirmedUpgradeOfferId}>
                  <span class="assignment-label">Choose one upgrade</span>
                  {#if $gameStore.game.activeUpgradeOffer}
                    <div class="unlock-row">
                      {#each $gameStore.game.activeUpgradeOffer.optionUpgradeIds as upgradeId}
                        {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                        {@const affectedTroops = getAffectedTroopsForUpgrade(upgradeId)}
                        {@const affectedDraftTroops = getAffectedDraftTroopsForUpgrade(upgradeId)}
                        <button
                          class="list-button draft-upgrade-option"
                          class:selected={selectedUpgradeOfferId === upgradeId}
                          on:mouseenter={() => { hoveredUpgradeOfferId = upgradeId; previewDetail(upgradeDetail); }}
                          on:focus={() => { hoveredUpgradeOfferId = upgradeId; previewDetail(upgradeDetail); }}
                          on:mouseleave={() => { hoveredUpgradeOfferId = null; clearDetail(); }}
                          on:blur={() => { hoveredUpgradeOfferId = null; clearDetail(); }}
                          on:click={() => selectUpgradeOffer(upgradeId, upgradeDetail)}
                        >
                          <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                          {#if affectedTroops.length > 0 || affectedDraftTroops.length > 0}
                            <span class="affected-troop-strip" aria-label="Affected troops">
                              {#each affectedTroops as troop}
                                <img src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden="true" />
                              {/each}
                              {#each affectedDraftTroops as troopUnlockId}
                                {@const [factionId, unitTypeId] = parseTroopUnlockId(troopUnlockId)}
                                <img class="draft-affected" src={getFactionUnitPortrait(factionId, unitTypeId)} alt="" aria-hidden="true" />
                              {/each}
                            </span>
                          {/if}
                        </button>
                      {/each}
                    </div>
                    <button type="button" class="primary" disabled={!selectedUpgradeOfferId} on:click={confirmUpgradeOffer}>Confirm Upgrade</button>
                  {:else if confirmedUpgradeOfferId}
                    <div class="locked-draft-card">
                      <GameIcon kind="upgrade" id={confirmedUpgradeOfferId} label={getUpgradeDetails(confirmedUpgradeOfferId).label} />
                      <strong>{getUpgradeDetails(confirmedUpgradeOfferId).label}</strong>
                      <span>Confirmed</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/if}
        {#if $gameStore.systemMessage}
          <div class="panel warning-panel system-message-popover ui-debug-target" data-ui-name="System message panel">
            <button type="button" class="system-message-close ui-debug-target" data-ui-name="Dismiss system message" aria-label="Dismiss system message" on:click={() => gameStore.clearSystemMessage()}>X</button>
            <p class="eyebrow">System Message</p>
            <h2>System Notice</h2>
            <p>{$gameStore.systemMessage}</p>
            {#if systemMessageHasUnspentEssence}
              <button type="button" class="primary" on:click={focusEssenceDraft}>Spend Essence</button>
            {/if}
          </div>
        {/if}
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
              <div class="ready-status-counts info-target" title="Ready troops can be assigned. Assigned troops are committed to a Rift. Recovering troops cannot act this cycle.">
                <span>Ready <strong>{statusCounts.idle}</strong></span>
                <span>Assigned <strong>{statusCounts.active}</strong></span>
                <span>Recovering <strong>{statusCounts.recovering}</strong></span>
              </div>
            </div>

            {#if readyTroops.length === 0}
              <p class="assignment-empty">No idle troops are ready right now.</p>
            {:else}
              <div
                class="ready-troops-grid"
                class:roster-count-8={readyTroops.length >= 8}
                class:roster-count-12={readyTroops.length >= 12}
                class:roster-count-16={readyTroops.length >= 16}
              >
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
                      class:dragging-source={troopDrag?.troopId === troop.id && troopDrag.active}
                      class:upgrade-affected={isUpgradeAffectingTroop(troop.id)}
                      class:conflict-pulse={assignmentConflict?.troopId === troop.id || assignmentConflict?.conflictTroopId === troop.id}
                    aria-label={`Drag ${troopDef.label} to a Rift`}
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
                    <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                      {#each unitIconCopies(troopDef.quantity) as copy}
                        <img class="unit-tile-art" src={getFactionUnitPortrait(troop.factionId, troop.unitTypeId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                      {/each}
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        {#if $gameStore.centerMode === 'rifts'}
          <button
            class="primary large end-cycle-button ui-debug-target"
            data-ui-name="End cycle button"
            on:click={handleEndCycle}
            disabled={multiplayerReadySubmitted || !!$gameStore.cycleAnimation}
          >
            {$gameStore.cycleAnimation ? 'Battles Resolving' : $gameStore.multiplayer ? multiplayerReadyLabel() : $gameStore.cycleEndConfirmationPending ? 'Confirm End Cycle' : 'End Cycle'}
          </button>
        {/if}
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
            <button class="ui-debug-target" data-ui-name="Back to menu button" on:click={returnToMainMenu}>Back to menu</button>
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
                <span class="icon-label"><GameIcon kind="mutator" id={mutatorId} label={getMutator(mutatorId).label} /><span>{getMutator(mutatorId).label}</span></span>
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
        onJumpStart={() => runManualReplayAction(() => gameStore.jumpTo(-1))}
        onStepBack={() => runManualReplayAction(() => gameStore.stepBackward())}
        onStepForward={() => runManualReplayAction(() => gameStore.stepForward())}
        onToggleAuto={() => gameStore.setAutoPlay(!$gameStore.autoPlay)}
        onSetSpeed={(speedMs) => gameStore.setSpeedMs(speedMs)}
      />

      <section class="panel focus-panel ui-debug-target" data-ui-name="Replay focus panel">
        {#if activeDetail}
          <div class="detail-panel replay-detail-panel">
            <p class="eyebrow">{activeDetail.kind === 'mutator' ? 'Mutator Effect' : activeDetail.kind === 'upgrade' ? 'Upgrade Preview' : 'Battle Detail'}</p>
            <h2 class="detail-title">{#if activeDetail.iconKind && activeDetail.iconId}<GameIcon kind={activeDetail.iconKind} id={activeDetail.iconId} label={activeDetail.label} />{/if}<span>{activeDetail.label}</span></h2>
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
        {:else if replayFocusProfile || inspectedUnit}
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
            liveBuffLines={inspectedUnitLiveStatLines}
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
      <button class="replay-exit-button sidebar-back-button ui-debug-target" data-ui-name="Back to archive from replay" aria-label="Back to archive" on:click={closeReplayToArchive}>
        <span aria-hidden="true">&larr;</span> Back to Archive
      </button>
      <section class="panel collapsible-panel ui-debug-target" data-ui-name="Deprecated alive counts panel" hidden>
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
                        <span>Troop</span>
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
                        <span>Troop</span>
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
                        class:selected={lockedUnitId === entry.unit.id}
                        class:active-highlight={replayActiveHighlightId === entry.unit.id}
                        class:secondary-highlight={replaySecondaryHighlightIds.has(entry.unit.id)}
                        data-ui-name={`Health overview ${side.label} ${entry.unit.id}`}
                        aria-label={`${entry.unit.troopLabel} health ${entry.hpLabel}`}
                        on:mouseenter={(event) => previewReplayUnit(entry.unit, event)}
                        on:focus={(event) => previewReplayUnit(entry.unit, event)}
                        on:mouseleave={() => clearReplayUnitPreview(entry.unit.id)}
                        on:blur={() => clearReplayUnitPreview(entry.unit.id)}
                        on:click={() => setReplayUnitLock(entry.unit.id, { toggle: true, profileKey: replayProfileKey(entry.unit.side, entry.unit.troopLabel) })}
                      >
                        <img src={entry.portraitUrl} alt="" aria-hidden="true" />
                        <div class="replay-health-unit-main">
                          <div class="replay-health-bar" aria-hidden="true">
                            <span style={`width: ${entry.hpPercent}`}></span>
                          </div>
                          <div class="replay-initiative-row" title="Units act when initiative reaches 100; when no unit can act, each unit gains initiative equal to Speed.">
                            <div class="replay-health-bar initiative" aria-hidden="true">
                              <span style={`width: ${entry.initiativePercent}`}></span>
                            </div>
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
                            <strong>Troop group</strong>
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
                              <button type="button" class="replay-recap-row unit" aria-label={`Inspect ${unit.unitLabel}`} on:click={() => selectReplayRecapUnit(unit.unitId, troop.side, troop.troopLabel)}>
                                {#if troopProfile}
                                  <img class="replay-recap-art small" src={getFactionUnitPortrait(troopProfile.factionId, troopProfile.unitTypeId)} alt="" aria-hidden="true" />
                                {/if}
                                <div class="replay-recap-main">
                                  <strong>Unit</strong>
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

  .info-target {
    cursor: help;
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
    width: min(1700px, 100%);
    grid-template-columns: minmax(250px, 282px) minmax(760px, 1fr) minmax(260px, 320px);
    gap: 0.75rem;
    padding-block: 0.75rem;
  }

  .topbar {
    grid-column: 1 / -1;
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
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

  .resource-strip {
    min-width: 0;
    display: flex;
    flex-wrap: nowrap;
    gap: 0.45rem;
  }

  .resource-strip > div,
  .resource-strip > button,
  .compact-list div {
    display: grid;
    gap: 0.15rem;
    padding: var(--ui-space-sm);
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-soft);
  }

  .resource-strip > div,
  .resource-strip > button {
    min-width: 6.2rem;
    white-space: nowrap;
  }

  .resource-counter {
    cursor: pointer;
    text-align: left;
  }

  .topbar-info-button {
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: help;
  }

  .topbar-info-button:hover,
  .topbar-info-button:focus-visible,
  .resource-counter:hover,
  .resource-counter:focus-visible {
    border-color: rgba(211, 176, 255, 0.58);
    box-shadow:
      inset 0 0 0 1px rgba(211, 176, 255, 0.38),
      0 8px 18px rgba(0, 0, 0, 0.18);
  }

  .topbar-tooltip {
    position: absolute;
    top: calc(100% + 0.35rem);
    left: 1rem;
    z-index: 8;
    display: grid;
    gap: 0.12rem;
    max-width: min(24rem, calc(100vw - 2rem));
    padding: 0.5rem 0.65rem;
    border: 1px solid rgba(213, 178, 116, 0.34);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(12, 17, 24, 0.96);
    box-shadow: var(--ui-shadow-panel);
    color: var(--ui-color-text);
    font-size: var(--ui-text-small);
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

  .essence-cost {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    margin-left: 0.35rem;
    color: #d3b0ff;
  }

  .essence-cost strong {
    color: #b86cff;
    font-family: var(--ui-font-mono);
    font-weight: 700;
  }

  .contest-score strong {
    color: #f2d080;
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
    flex-wrap: nowrap;
    gap: var(--ui-space-sm);
    align-items: center;
  }

  .mode-toggle {
    justify-content: flex-end;
    min-width: 0;
  }

  .mode-toggle button {
    white-space: nowrap;
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
    padding-top: 0.15rem;
  }

  .opening-selected-factions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    min-height: 2rem;
  }

  .opening-selected-faction {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    max-width: 11rem;
    padding: 0.3rem 0.55rem;
    border: 1px solid rgba(237, 197, 111, 0.42);
    border-radius: var(--ui-panel-radius-tight);
    background:
      linear-gradient(145deg, rgba(44, 31, 15, 0.78), rgba(17, 22, 30, 0.86)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.16), transparent 44%);
    color: #f3dfac;
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .opening-selected-faction img {
    width: 1.35rem;
    height: 1.35rem;
    flex: 0 0 auto;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .opening-selected-faction span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    box-sizing: border-box;
    min-width: 0;
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

  .opening-shell:not(.scheduled-faction-shell) {
    height: calc(100dvh - (2 * var(--ui-space-md)));
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .opening-shell:not(.scheduled-faction-shell):has(.opening-session-header) {
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  .opening-shell:not(.scheduled-faction-shell) .draft-layout {
    overflow: hidden;
  }

  .rift-grid,
  .faction-grid,
  .slot-grid,
  .draft-grid {
    display: grid;
    gap: var(--ui-space-md);
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .rift-grid {
    align-content: start;
    align-items: start;
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

  .troop-draft-option-list {
    grid-template-columns: repeat(3, var(--troop-icon-box-size, 3.8rem));
    justify-content: space-between;
    gap: 0.35rem;
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

  .list-button:has(:global(.game-icon)) {
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 0.45rem;
  }

  .draft-offer-block .list-button {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .draft-offer-block .list-button:has(:global(.game-icon)) {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .troop-icon-option {
    display: grid;
    place-items: center;
    width: var(--troop-icon-box-size, 3.8rem);
    height: var(--troop-icon-box-size, 3.8rem);
    min-height: 0;
    aspect-ratio: 1;
    justify-self: center;
    padding: 0.45rem;
  }

  .troop-icon-option .unit-button-art {
    width: 2rem;
    height: 2rem;
  }

  .icon-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .icon-label > span {
    min-width: 0;
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
  .mutator-chip.selected,
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
    display: inline-flex;
    align-items: center;
    justify-content: stretch;
    gap: 0.35rem;
    border: 1px solid rgba(124, 153, 176, 0.2);
    border-radius: 999px;
    padding: 0.3rem 0.6rem;
    background: rgba(20, 28, 38, 0.76);
    color: inherit;
    font: inherit;
    line-height: 1.1;
  }

  .mutator-chip :global(.game-icon),
  .list-button :global(.game-icon),
  .detail-title :global(.game-icon) {
    --game-icon-size: 1.05rem;
  }

  .ability-chip :global(.game-icon.raster-icon) {
    --game-icon-raster-scale: 1.45;
  }

  .summon-preview-chip {
    border-color: rgba(215, 221, 230, 0.34);
    background: rgba(28, 34, 42, 0.82);
    color: #d7dde6;
  }

  .summon-chip-art {
    width: 1.05rem;
    height: 1.05rem;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .detail-title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .detail-title :global(.game-icon) {
    --game-icon-size: 1.35rem;
  }

  .mutator-chip.empty {
    color: #95a9ba;
  }

  .archive-drift-note {
    display: grid;
    gap: 0.2rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid rgba(213, 178, 116, 0.34);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(50, 33, 17, 0.62);
    color: #f0d4a6;
  }

  .archive-drift-note span {
    color: #d7c3a4;
    font-size: 0.78rem;
  }

  .archive-card {
    --archive-player: rgba(74, 193, 111, 0.58);
    --archive-opponent: rgba(213, 75, 82, 0.58);
    --archive-neutral: rgba(143, 153, 164, 0.52);
    --archive-left-color: var(--archive-player);
    --archive-right-color: var(--archive-neutral);
    position: relative;
    display: grid;
    gap: 0.18rem;
    min-height: 3rem;
    overflow: hidden;
    background:
      linear-gradient(
        90deg,
        color-mix(in srgb, var(--archive-left-color) 34%, transparent),
        color-mix(in srgb, var(--archive-left-color) 12%, var(--archive-right-color) 12%) 48%,
        color-mix(in srgb, var(--archive-right-color) 34%, transparent)
      ),
      var(--ui-color-surface-interactive);
  }

  .archive-card strong,
  .archive-card small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .archive-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-left: 3px solid var(--archive-left-color);
    border-right: 3px solid var(--archive-right-color);
    pointer-events: none;
  }

  .archive-health-totals,
  .archive-force-block {
    display: grid;
    gap: var(--ui-space-sm);
  }

  .archive-health-total {
    display: grid;
    gap: 0.35rem;
    padding: var(--ui-space-sm);
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(20, 28, 38, 0.72);
  }

  .archive-health-total > div:first-child {
    display: flex;
    justify-content: space-between;
    gap: var(--ui-space-sm);
    color: var(--ui-color-text-dim);
    font-size: 0.78rem;
  }

  .archive-side-label.archive-player,
  .archive-health-total.archive-player strong {
    color: #d8f4df;
  }

  .archive-side-label.archive-opponent,
  .archive-health-total.archive-opponent strong {
    color: #f1b1a8;
  }

  .archive-side-label.archive-neutral,
  .archive-health-total.archive-neutral strong {
    color: #c7d0d8;
  }

  .archive-force-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .archive-upgrade-row {
    display: flex;
    flex-wrap: wrap;
  }

  .archive-upgrade-chip {
    min-width: 0;
    padding: 0.35rem 0.5rem;
    font-size: 0.74rem;
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

  .opening-faction-card {
    position: relative;
    cursor: pointer;
    transition:
      border-color 160ms ease,
      background 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease;
  }

  .opening-faction-card > :not(.opening-card-select-button) {
    position: relative;
    z-index: 2;
    pointer-events: none;
  }

  .opening-faction-card button:not(.opening-card-select-button) {
    pointer-events: auto;
  }

  .opening-card-select-button {
    position: absolute;
    inset: 0;
    z-index: 1;
    border: 0;
    border-radius: inherit;
    background: transparent;
    padding: 0;
  }

  .opening-faction-card:hover,
  .opening-faction-card:focus-visible {
    border-color: rgba(213, 178, 116, 0.44);
    box-shadow:
      var(--ui-shadow-panel),
      inset 0 0 0 1px rgba(213, 178, 116, 0.18);
  }

  .opening-card-select-button:focus-visible {
    outline: 2px solid rgba(244, 205, 118, 0.94);
    outline-offset: 3px;
  }

  .opening-faction-card.selected {
    border-color: rgba(231, 190, 105, 0.82);
    background:
      linear-gradient(160deg, rgba(48, 38, 16, 0.92), rgba(24, 22, 16, 0.96)),
      radial-gradient(circle at top right, rgba(243, 204, 105, 0.2), transparent 42%);
    box-shadow:
      0 18px 42px rgba(0, 0, 0, 0.34),
      inset 0 0 0 2px rgba(237, 197, 111, 0.38);
  }

  .opening-faction-card.pending {
    border-color: rgba(128, 196, 255, 0.72);
    box-shadow:
      0 0 0 1px rgba(128, 196, 255, 0.24),
      0 0 24px rgba(78, 148, 214, 0.24),
      var(--ui-shadow-panel);
  }

  .opening-card-select-button.pending:focus-visible {
    outline-color: rgba(128, 196, 255, 0.95);
  }

  .opening-faction-card.incompatible {
    cursor: not-allowed;
    opacity: 0.68;
  }

  .opening-included-section {
    margin-top: 0.1rem;
  }

  .opening-starter-tile {
    grid-template-columns: auto minmax(0, 1fr);
    justify-items: start;
    align-items: center;
    min-height: 4.2rem;
    text-align: left;
    border-color: rgba(213, 178, 116, 0.48);
    background:
      linear-gradient(135deg, rgba(44, 33, 17, 0.88), rgba(18, 25, 34, 0.88)),
      radial-gradient(circle at 18% 18%, rgba(239, 199, 111, 0.18), transparent 58%);
  }

  .opening-starter-tile.selected {
    border-color: rgba(244, 205, 118, 0.9);
    background:
      linear-gradient(135deg, rgba(64, 46, 18, 0.95), rgba(31, 26, 17, 0.97)),
      radial-gradient(circle at 20% 15%, rgba(248, 218, 139, 0.26), transparent 58%);
  }

  .opening-starter-tile.pending {
    border-color: rgba(128, 196, 255, 0.86);
  }

  .opening-future-section {
    margin-top: 0.35rem;
  }

  .opening-future-grid {
    grid-template-columns: repeat(auto-fit, var(--troop-icon-box-size, 3.8rem));
    justify-content: start;
  }

  .opening-future-tile {
    min-height: 0;
    border-style: dashed;
    background: rgba(16, 25, 35, 0.68);
    color: #c4d2df;
  }

  .rift-card {
    padding: 0.75rem;
    border-radius: 20px;
    border: 1px solid rgba(126, 157, 181, 0.16);
    background:
      linear-gradient(160deg, rgba(18, 27, 38, 0.94), rgba(10, 15, 24, 0.94)),
      radial-gradient(circle at top right, rgba(95, 135, 170, 0.12), transparent 35%);
  }

  .rift-card.contest-neutral {
    border-color: rgba(126, 157, 181, 0.22);
  }

  .rift-card.contest-human-held {
    border-color: rgba(111, 190, 146, 0.45);
    box-shadow: inset 0 0 0 1px rgba(111, 190, 146, 0.14);
  }

  .rift-card.contest-ai-held {
    border-color: rgba(221, 106, 94, 0.48);
    box-shadow: inset 0 0 0 1px rgba(221, 106, 94, 0.16);
  }

  .rift-card.archive-highlighted {
    border-color: rgba(244, 205, 118, 0.92);
    box-shadow:
      0 0 0 2px rgba(244, 205, 118, 0.2),
      0 0 28px rgba(244, 205, 118, 0.26),
      var(--ui-shadow-panel);
  }

  .rift-battle-lane {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 4fr) minmax(3.5rem, 2fr) minmax(0, 4fr);
    align-items: stretch;
    min-height: 3.65rem;
    overflow: hidden;
    border: 1px solid rgba(213, 178, 116, 0.24);
    border-radius: 14px;
    background:
      radial-gradient(circle at center, rgba(239, 202, 124, 0.12), transparent 58%),
      linear-gradient(90deg, rgba(45, 75, 62, 0.34), rgba(16, 21, 29, 0.82) 48%, rgba(83, 36, 38, 0.34));
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.2);
  }

  .rift-force-side.assigned-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    align-content: center;
    gap: 0.28rem;
    min-width: 0;
    padding: 0.45rem;
  }

  .rift-force-left {
    justify-content: flex-start;
  }

  .rift-force-right {
    justify-content: flex-end;
  }

  .rift-force-side.force-loses-now {
    animation: rift-force-fade 4.8s ease-in-out both;
  }

  .rift-force-side.force-loses-late {
    animation: rift-force-fade 4.8s ease-in-out 3.7s both;
  }

  .rift-battle-lane .unit-tile {
    flex: 0 0 auto;
    width: 2.55rem;
    height: 2.55rem;
    min-height: 2.55rem;
    padding: 0.25rem;
  }

  .rift-battle-lane .unit-tile-art {
    width: 1.85rem;
    height: 1.85rem;
  }

  .rift-battle-center {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
  }

  .rift-battle-animation {
    position: absolute;
    inset: 0;
    display: grid;
    pointer-events: none;
  }

  .rift-battle-phase {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    opacity: 0;
    animation: battle-phase 4.8s ease-in-out both;
  }

  .rift-battle-phase.phase-late {
    animation-delay: 3.7s;
  }

  .phase-late .clash-sword,
  .phase-late .clash-spark {
    animation-delay: 3.7s;
  }

  .clash-swords {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: 3rem;
    min-width: 3.2rem;
  }

  .clash-sword {
    position: absolute;
    display: grid;
    width: 1.8rem;
    height: 1.8rem;
    place-items: center;
    opacity: 0;
    transform-origin: center;
  }

  .clash-sword::before,
  .clash-sword::after {
    content: '';
    position: absolute;
    display: block;
  }

  .clash-sword::before {
    width: 0.24rem;
    height: 1.55rem;
    border-radius: 999px 999px 0.12rem 0.12rem;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.92), #f7e5b8 42%, #9a7141);
    box-shadow:
      0 0 9px rgba(247, 207, 125, 0.62),
      0 2px 2px rgba(0, 0, 0, 0.42);
  }

  .clash-sword::after {
    top: 1.1rem;
    width: 1.05rem;
    height: 0.22rem;
    border-radius: 999px;
    background: linear-gradient(90deg, #7c4b2a, #f0c674, #7c4b2a);
    box-shadow: 0 0 5px rgba(247, 207, 125, 0.46);
  }

  .left-sword {
    --sword-start-x: -1.45rem;
    --sword-retreat-x: -1.05rem;
    --sword-ready-rotate: 90deg;
    --sword-clash-rotate: 42deg;
    --sword-break-rotate: 128deg;
    animation: sword-clash 4.8s cubic-bezier(0.2, 0.9, 0.26, 1) both;
  }

  .right-sword {
    --sword-start-x: 1.45rem;
    --sword-retreat-x: 1.05rem;
    --sword-ready-rotate: -90deg;
    --sword-clash-rotate: -42deg;
    --sword-break-rotate: -128deg;
    animation: sword-clash 4.8s cubic-bezier(0.2, 0.9, 0.26, 1) both;
  }

  .left-loses .left-sword,
  .right-loses .right-sword {
    animation-name: losing-sword-clash;
  }

  .clash-spark {
    position: absolute;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 999px;
    background: #fff4c6;
    box-shadow:
      0 0 12px rgba(255, 231, 154, 0.95),
      0 0 26px rgba(229, 92, 60, 0.58);
    opacity: 0;
    animation: clash-spark 4.8s ease-out both;
  }

  @keyframes rift-force-fade {
    0%,
    58% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: none;
    }
    100% {
      opacity: 0;
      transform: translateY(0.35rem) scale(0.86);
      filter: grayscale(1) brightness(0.68);
    }
  }

  @keyframes battle-phase {
    0%,
    100% {
      opacity: 0;
    }
    8%,
    82% {
      opacity: 1;
    }
  }

  @keyframes sword-clash {
    0% {
      opacity: 0;
      transform: translateX(var(--sword-start-x)) rotate(var(--sword-ready-rotate)) scale(0.92);
    }
    16% {
      opacity: 1;
      transform: translateX(var(--sword-start-x)) rotate(var(--sword-ready-rotate)) scale(1);
    }
    28%,
    48% {
      opacity: 1;
      transform: translateX(0) rotate(var(--sword-clash-rotate)) scale(1.08);
    }
    38% {
      opacity: 1;
      transform: translateX(var(--sword-retreat-x)) rotate(var(--sword-ready-rotate)) scale(1);
    }
    72%,
    84% {
      opacity: 1;
      transform: translateX(var(--sword-start-x)) rotate(var(--sword-ready-rotate)) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateX(var(--sword-start-x)) rotate(var(--sword-ready-rotate)) scale(0.96);
    }
  }

  @keyframes losing-sword-clash {
    0% {
      opacity: 0;
      transform: translateX(var(--sword-start-x)) rotate(var(--sword-ready-rotate)) scale(0.92);
      clip-path: inset(0);
    }
    16% {
      opacity: 1;
      transform: translateX(var(--sword-start-x)) rotate(var(--sword-ready-rotate)) scale(1);
      clip-path: inset(0);
    }
    28%,
    48% {
      opacity: 1;
      transform: translateX(0) rotate(var(--sword-clash-rotate)) scale(1.08);
      clip-path: inset(0);
    }
    38% {
      opacity: 1;
      transform: translateX(var(--sword-retreat-x)) rotate(var(--sword-ready-rotate)) scale(1);
      clip-path: inset(0);
    }
    72% {
      opacity: 1;
      transform: translateX(var(--sword-start-x)) rotate(var(--sword-ready-rotate)) scale(1);
      clip-path: inset(0);
    }
    84% {
      opacity: 1;
      transform: translateX(var(--sword-start-x)) rotate(var(--sword-break-rotate)) scale(1);
      clip-path: polygon(0 0, 52% 0, 45% 100%, 0 100%);
    }
    100% {
      opacity: 0;
      transform: translateX(var(--sword-start-x)) translateY(0.45rem) rotate(var(--sword-break-rotate)) scale(0.45);
      clip-path: polygon(0 0, 52% 0, 45% 100%, 0 100%);
    }
  }

  @keyframes clash-spark {
    0%,
    22%,
    42%,
    54%,
    100% {
      opacity: 0;
      transform: scale(0.4);
    }
    28%,
    48%,
    60% {
      opacity: 1;
      transform: scale(1.25);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rift-battle-phase,
    .rift-force-side,
    .clash-sword,
    .clash-spark {
      animation-duration: 1ms;
      animation-delay: 0ms;
    }
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

  .control-pill {
    display: inline-flex;
    align-items: center;
    min-height: 1.65rem;
    padding: 0.18rem 0.5rem;
    border-radius: 999px;
    border: 1px solid rgba(124, 153, 176, 0.22);
    background: rgba(7, 10, 16, 0.68);
    color: #dce7f2;
    font-size: 0.72rem;
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
    position: relative;
    width: var(--troop-icon-box-size, 3.8rem);
    height: var(--troop-icon-box-size, 3.8rem);
    min-height: 0;
    aspect-ratio: 1;
    display: grid;
    place-items: stretch;
    justify-content: center;
    padding: 0.45rem;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: 14px;
    background: rgba(22, 31, 42, 0.82);
    color: inherit;
    overflow: hidden;
  }

  .draggable-troop-tile {
    justify-content: stretch;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .draggable-troop-tile:active {
    cursor: grabbing;
  }

  .unit-tile.selected {
    border-color: rgba(237, 197, 111, 0.82);
    box-shadow:
      inset 0 0 0 2px rgba(237, 197, 111, 0.45),
      0 0 0 1px rgba(237, 197, 111, 0.2);
  }

  .unit-tile:focus-visible {
    outline: 2px dotted rgba(244, 247, 251, 0.86);
    outline-offset: 3px;
  }

  .dragging-source {
    opacity: 0.45;
    filter: grayscale(0.35);
  }

  .unit-tile.holding {
    cursor: help;
    border-color: rgba(120, 207, 241, 0.58);
    background:
      linear-gradient(145deg, rgba(24, 54, 68, 0.9), rgba(20, 31, 40, 0.96)),
      radial-gradient(circle at 30% 15%, rgba(137, 220, 255, 0.18), transparent 52%);
  }

  .unit-tile.upgrade-affected::after {
    content: '+';
    position: absolute;
    top: -0.35rem;
    right: -0.35rem;
    width: 1.35rem;
    height: 1.35rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(128, 229, 161, 0.28);
    border: 1px solid rgba(156, 244, 185, 0.72);
    color: #c8ffd5;
    font-weight: 900;
  }

  .conflict-pulse {
    animation: conflict-pulse 680ms ease-out 0s 2;
  }

  @keyframes conflict-pulse {
    0%,
    100% {
      box-shadow: inset 0 0 0 1px rgba(238, 243, 246, 0.16);
    }
    45% {
      box-shadow:
        inset 0 0 0 3px rgba(255, 96, 96, 0.74),
        0 0 24px rgba(255, 80, 80, 0.34);
    }
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

  .drop-target-blocked {
    border-color: rgba(255, 102, 102, 0.8);
    box-shadow:
      inset 0 0 0 2px rgba(255, 102, 102, 0.38),
      0 0 28px rgba(255, 80, 80, 0.18);
  }

  .drop-preview-tile {
    border-style: dashed;
    border-color: rgba(218, 190, 140, 0.78);
    background: rgba(73, 57, 29, 0.62);
  }

  .drop-conflict-message {
    margin-top: 0.35rem;
    padding: 0.35rem 0.5rem;
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(82, 20, 20, 0.78);
    color: #ffd5d5;
    font-size: 0.75rem;
  }

  .quantity-stack {
    display: grid;
    gap: 0.12rem;
    place-items: center;
    min-width: 3rem;
    padding: 0.3rem 0.42rem;
    border: 1px solid rgba(237, 197, 111, 0.26);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(37, 28, 15, 0.64);
  }

  .quantity-stack strong {
    color: #f4e6ba;
    font-family: var(--ui-font-mono);
  }

  .quantity-stack span {
    color: rgba(237, 197, 111, 0.68);
    font-size: 0.56rem;
    letter-spacing: 0.04rem;
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
    justify-content: stretch;
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
    display: block;
    margin: auto;
  }

  .hover-unit-art {
    width: 4rem;
    height: 4rem;
  }

  .unit-icon-cluster {
    --unit-cluster-columns: 1;
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    justify-self: stretch;
    align-self: stretch;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .unit-tile:has(.unit-icon-cluster),
  .rift-battle-lane .unit-tile:has(.unit-icon-cluster) {
    justify-content: stretch;
    justify-items: stretch;
    place-items: stretch;
  }

  .tile-unit-cluster .unit-tile-art,
  .chip-unit-cluster .unit-button-art {
    position: absolute;
    left: 50%;
    top: 50%;
    width: min(1.55rem, 86%) !important;
    height: min(1.55rem, 86%) !important;
    margin: 0 !important;
    transform: translate(-50%, -50%);
  }

  .tile-unit-cluster.density-4 .unit-tile-art,
  .chip-unit-cluster.density-4 .unit-button-art {
    width: min(1.05rem, 64%) !important;
    height: min(1.05rem, 64%) !important;
  }

  .tile-unit-cluster.density-6 .unit-tile-art,
  .chip-unit-cluster.density-6 .unit-button-art {
    width: min(0.98rem, 58%) !important;
    height: min(0.98rem, 58%) !important;
  }

  .tile-unit-cluster.density-9 .unit-tile-art,
  .chip-unit-cluster.density-9 .unit-button-art {
    width: min(0.94rem, 56%) !important;
    height: min(0.94rem, 56%) !important;
  }

  .tile-unit-cluster.density-12 .unit-tile-art,
  .chip-unit-cluster.density-12 .unit-button-art {
    width: min(0.86rem, 50%) !important;
    height: min(0.86rem, 50%) !important;
  }

  .tile-unit-cluster img:nth-child(1),
  .chip-unit-cluster img:nth-child(1) {
    left: 35%;
    top: 35%;
  }

  .tile-unit-cluster.density-1 img:nth-child(1),
  .chip-unit-cluster.density-1 img:nth-child(1) {
    left: 50%;
    top: 50%;
  }

  .tile-unit-cluster img:nth-child(2),
  .chip-unit-cluster img:nth-child(2) {
    left: 50%;
    top: 35%;
  }

  .tile-unit-cluster img:nth-child(3),
  .chip-unit-cluster img:nth-child(3) {
    left: 65%;
    top: 35%;
  }

  .tile-unit-cluster img:nth-child(4),
  .chip-unit-cluster img:nth-child(4) {
    left: 35%;
    top: 50%;
  }

  .tile-unit-cluster img:nth-child(5),
  .chip-unit-cluster img:nth-child(5) {
    left: 50%;
    top: 50%;
  }

  .tile-unit-cluster img:nth-child(6),
  .chip-unit-cluster img:nth-child(6) {
    left: 65%;
    top: 50%;
  }

  .tile-unit-cluster img:nth-child(7),
  .chip-unit-cluster img:nth-child(7) {
    left: 35%;
    top: 65%;
  }

  .tile-unit-cluster img:nth-child(8),
  .chip-unit-cluster img:nth-child(8) {
    left: 50%;
    top: 65%;
  }

  .tile-unit-cluster img:nth-child(9),
  .chip-unit-cluster img:nth-child(9) {
    left: 65%;
    top: 65%;
  }

  .tile-unit-cluster img:nth-child(10),
  .chip-unit-cluster img:nth-child(10) {
    left: 42%;
    top: 76%;
  }

  .tile-unit-cluster img:nth-child(11),
  .chip-unit-cluster img:nth-child(11) {
    left: 58%;
    top: 76%;
  }

  .tile-unit-cluster img:nth-child(12),
  .chip-unit-cluster img:nth-child(12) {
    left: 50%;
    top: 50%;
    z-index: 1;
    width: min(1.05rem, 62%) !important;
    height: min(1.05rem, 62%) !important;
  }

  .detail-unit-cluster {
    width: 5.4rem;
    height: 5.4rem;
    padding: 0.24rem;
    border: 1px solid rgba(237, 197, 111, 0.24);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(16, 24, 34, 0.58);
  }

  .detail-unit-cluster .hover-unit-art {
    width: min(1.45rem, 100%);
    height: min(1.45rem, 100%);
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

  .assignment-empty,
  .intro,
  .warning-panel p,
  .slot-card p,
  .detail-panel p,
  .archive-card small,
  .replay-header p {
    color: #a7b8c8;
  }

  .archive-card-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.45rem;
    gap: 0.4rem;
    align-items: stretch;
  }

  .archive-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.55rem;
    text-align: left;
  }

  .archive-card-copy {
    display: grid;
    gap: 0.08rem;
    min-width: 0;
  }

  .archive-inspect-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .archive-inspect-heading h2 {
    margin: 0;
  }

  .archive-rift-id {
    color: #9db2c4;
    font-size: 0.8rem;
    text-transform: uppercase;
  }

  .archive-rift-thumbnail {
    width: 2.55rem;
    height: 2.55rem;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--rift-tint) 56%, transparent);
    border-radius: var(--ui-panel-radius-tight);
    background: radial-gradient(circle, var(--rift-glow), rgba(10, 14, 20, 0.84) 68%);
    overflow: hidden;
  }

  .archive-rift-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transform: rotate(var(--rift-rotation));
  }

  .archive-watch-button {
    display: grid;
    min-height: 2.45rem;
    min-width: 0;
    place-items: center;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(20, 29, 39, 0.9);
    color: #f4e6ba;
    font-size: 0;
    font-weight: 800;
  }

  .archive-watch-icon {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .archive-inspect-watch-button {
    width: 2.8rem;
    border-color: rgba(229, 188, 88, 0.82);
    box-shadow: inset 0 0 0 1px rgba(255, 220, 125, 0.18), 0 0 0.85rem rgba(217, 164, 48, 0.24);
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

  .draft-screen-header .multiplayer-status-line {
    max-width: none;
    width: fit-content;
    border: var(--ui-border-strong);
    border-radius: 6px;
    padding: 0.45rem 0.65rem;
    color: var(--ui-color-text);
    background: rgba(213, 178, 116, 0.12);
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

  .scheduled-faction-layout,
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

  .faction-unlock-card > button:last-child {
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

  .draft-helper-copy {
    color: var(--ui-color-text-dim);
    font-size: 0.82rem;
    line-height: 1.35;
  }

  .rift-card-section,
  .ready-troops-header {
    display: grid;
    gap: 0.35rem;
  }

  .ready-status-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .ready-status-counts span {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.18rem 0.42rem;
    border-radius: var(--ui-panel-radius-pill);
    background: rgba(14, 22, 31, 0.72);
    color: #a7b8c8;
    font-size: 0.68rem;
    text-transform: uppercase;
  }

  .ready-status-counts strong {
    color: #f4e6ba;
    font-family: var(--ui-font-mono);
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
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    align-items: center;
  }

  .compare-pin-button {
    justify-self: start;
    padding: 0.35rem 0.6rem;
    border: 1px solid rgba(213, 178, 116, 0.34);
    border-radius: var(--ui-panel-radius-pill);
    background: rgba(42, 32, 18, 0.72);
    color: #f4e6ba;
    font: inherit;
    font-size: 0.74rem;
    font-weight: 700;
  }

  .compare-mini-button {
    align-self: center;
    min-height: 1.35rem;
    padding: 0.12rem 0.34rem;
    border: 1px solid rgba(213, 178, 116, 0.34);
    border-radius: 999px;
    background: rgba(31, 24, 16, 0.82);
    color: #f1d7ae;
    font-size: 0.64rem;
    line-height: 1;
  }

  .compare-mini-button.roster-pin {
    margin-top: -0.15rem;
  }

  .comparison-tray {
    align-content: start;
  }

  .comparison-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .comparison-header button,
  .comparison-remove {
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(20, 29, 39, 0.9);
    color: #f4f7fb;
    font: inherit;
    font-size: 0.7rem;
  }

  .comparison-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.55rem;
  }

  .comparison-card {
    position: relative;
    display: grid;
    gap: 0.4rem;
    padding: 0.65rem 2.15rem 0.65rem 0.65rem;
    border: 1px solid rgba(126, 157, 181, 0.16);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(15, 22, 31, 0.72);
  }

  .comparison-versus {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 0.45rem;
  }

  .comparison-unit-summary {
    display: grid;
    grid-template-columns: 2.35rem minmax(0, 1fr);
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .comparison-unit-summary.selected {
    grid-template-columns: minmax(0, 1fr) 2.35rem;
  }

  .comparison-unit-summary.selected .comparison-unit-art {
    grid-column: 2;
    grid-row: 1;
  }

  .comparison-unit-summary.selected strong {
    grid-column: 1;
    grid-row: 1;
    text-align: right;
  }

  .comparison-unit-summary.solo {
    grid-template-columns: 2.7rem minmax(0, 1fr);
  }

  .comparison-unit-summary strong {
    min-width: 0;
    color: #f4f7fb;
    font-size: 0.84rem;
    line-height: 1.12;
    overflow-wrap: anywhere;
  }

  .comparison-unit-art {
    width: 2.35rem;
    height: 2.35rem;
    padding: 0.18rem;
    border: 1px solid rgba(126, 157, 181, 0.18);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(11, 18, 27, 0.7);
  }

  .comparison-unit-art .unit-tile-art {
    width: min(1rem, 70%) !important;
    height: min(1rem, 70%) !important;
  }

  .comparison-versus-mark {
    color: #a7b8c8;
    font-size: 0.62rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .comparison-abilities,
  .comparison-upgrades {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .comparison-abilities small,
  .comparison-upgrades small {
    padding: 0.15rem 0.32rem;
    border: 1px solid rgba(124, 153, 176, 0.18);
    border-radius: 999px;
    background: rgba(15, 22, 31, 0.62);
    color: #cbd7e2;
    font-size: 0.66rem;
  }

  .comparison-remove {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    width: 1.45rem;
    height: 1.45rem;
    padding: 0;
  }

  .warning-panel {
    background:
      linear-gradient(160deg, rgba(46, 25, 23, 0.96), rgba(17, 14, 18, 0.96)),
      radial-gradient(circle at top right, rgba(170, 95, 95, 0.18), transparent 36%);
  }

  .essence-draft-panel.soft-highlight {
    border-color: rgba(211, 176, 255, 0.72);
    box-shadow:
      0 0 0 2px rgba(211, 176, 255, 0.2),
      0 0 28px rgba(155, 95, 220, 0.34),
      var(--ui-shadow-panel);
  }

  .essence-draft-panel {
    gap: 0.55rem;
  }

  .footer-essence-draft-panel {
    grid-column: 1 / -1;
    width: fit-content;
    max-width: 100%;
    justify-self: center;
    align-self: end;
    padding: 0.6rem 0.7rem;
    border-radius: 12px;
    --troop-icon-box-size: 2.9rem;
  }

  .essence-draft-groups {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2rem minmax(0, 1fr);
    gap: 0.7rem;
    align-items: stretch;
  }

  .footer-essence-draft-panel .essence-draft-groups {
    grid-template-columns: max-content 0.8rem max-content;
    gap: 0.45rem;
    align-items: start;
  }

  .footer-essence-draft-panel .draft-offer-block {
    min-width: 0;
    gap: 0.25rem;
    padding-top: 0;
    justify-items: stretch;
  }

  .footer-essence-draft-panel .troop-draft-option-list {
    grid-template-columns: repeat(3, minmax(2.75rem, var(--troop-icon-box-size, 3rem)));
    justify-content: start;
    gap: 0.15rem;
  }

  .footer-essence-draft-panel .troop-icon-option {
    padding: 0.3rem;
  }

  .footer-essence-draft-panel .unlock-row {
    gap: 1px;
    justify-items: start;
  }

  .footer-essence-draft-panel .draft-upgrade-option {
    display: inline-flex;
    width: fit-content;
    max-width: min(31rem, calc(100vw - 2.4rem));
    min-height: 2.25rem;
    padding: 0.32rem 0.44rem;
    align-items: center;
    justify-content: flex-start;
    gap: 0.16rem;
  }

  .footer-essence-draft-panel .draft-upgrade-option .icon-label {
    width: auto;
    line-height: 1.15;
  }

  .footer-essence-draft-panel .draft-upgrade-option .icon-label > span {
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .footer-essence-draft-panel .affected-troop-strip {
    flex: 0 0 auto;
    max-width: 4.5rem;
  }

  .footer-essence-draft-panel .affected-troop-strip img {
    width: 1.15rem;
    height: 1.15rem;
  }

  .footer-essence-draft-panel .primary {
    min-height: 2.15rem;
    padding: 0.35rem 0.55rem;
  }

  .draft-synergy-connector {
    align-self: center;
    height: 0.28rem;
    border-radius: 999px;
    background: rgba(124, 153, 176, 0.22);
  }

  .essence-draft-groups.has-synergy .draft-synergy-connector {
    background: linear-gradient(90deg, rgba(100, 205, 143, 0.1), rgba(126, 232, 164, 0.92), rgba(100, 205, 143, 0.1));
    box-shadow: 0 0 18px rgba(126, 232, 164, 0.42);
  }

  .draft-offer-block.locked {
    border-color: rgba(111, 190, 146, 0.38);
    background: rgba(19, 42, 32, 0.58);
  }

  .locked-draft-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid rgba(111, 190, 146, 0.34);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(9, 20, 16, 0.46);
    color: #d8f4df;
  }

  .draft-option.upgrade-affected,
  .ready-troop-tile.upgrade-affected {
    position: relative;
  }

  .upgrade-plus-badge,
  .ready-troop-tile.upgrade-affected::after {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    content: '+';
    color: rgba(154, 255, 180, 0.72);
    font-size: 2.6rem;
    font-weight: 900;
    line-height: 1;
    pointer-events: none;
    text-shadow: 0 0 12px rgba(70, 211, 111, 0.44);
  }

  .draft-upgrade-option {
    align-content: start;
  }

  .affected-troop-strip .draft-affected {
    border-color: rgba(128, 196, 255, 0.58);
  }

  .essence-draft-panel .primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
  }

  .reveal-draft-button.soft-highlight {
    box-shadow:
      inset 0 0 0 2px rgba(238, 216, 255, 0.72),
      0 0 24px rgba(184, 108, 255, 0.5);
  }

  .system-message-popover {
    position: fixed;
    right: var(--ui-space-md);
    bottom: 5.35rem;
    width: min(360px, 100%);
    padding-right: 2.65rem;
    z-index: 12;
  }

  .system-message-close {
    position: absolute;
    top: 0.45rem;
    right: 0.45rem;
    width: 1.55rem;
    height: 1.55rem;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid rgba(255, 153, 153, 0.38);
    border-radius: 999px;
    background: rgba(111, 24, 29, 0.92);
    color: #ffdada;
    font: inherit;
    font-size: 0.75rem;
    line-height: 1;
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
    grid-auto-rows: auto;
    align-items: end;
    justify-items: start;
    gap: 0.75rem;
    min-height: 8.6rem;
    padding-bottom: 0.4rem;
  }

  .action-rail:has(.footer-essence-draft-panel) {
    min-height: 6.4rem;
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
    grid-row: 2;
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
    min-height: 100dvh;
    box-sizing: border-box;
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
    position: relative;
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
    min-width: 0;
    max-width: 36rem;
  }

  .menu-copy h1 {
    font-size: clamp(2rem, 3vw, var(--ui-text-display));
    line-height: var(--ui-line-display);
  }

  .intro {
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .main-menu-shell {
    min-height: min(680px, calc(100vh - (2 * var(--ui-space-md))));
    align-content: center;
    padding-bottom: 4.5rem;
  }

  .main-menu-actions {
    width: min(360px, 100%);
    justify-self: center;
    display: grid;
    gap: var(--ui-space-sm);
  }

  .main-menu-actions button {
    min-height: 3.3rem;
    font-size: 1rem;
  }

  .menu-back-button {
    position: absolute;
    left: var(--ui-space-md);
    bottom: var(--ui-space-md);
    width: var(--ui-space-hit);
    height: var(--ui-space-hit);
    display: grid;
    place-items: center;
    padding: 0;
    font-size: 0;
    border-radius: 999px;
  }

  .menu-back-button::before {
    content: '<';
    font-size: 1.2rem;
    line-height: 1;
  }


  .slot-card {
    min-height: 0;
    padding: var(--ui-space-sm);
  }

  .menu-system-message {
    display: grid;
    gap: 0.35rem;
    padding: var(--ui-space-sm);
    border-color: rgba(213, 178, 116, 0.34);
  }

  .menu-system-message strong {
    color: var(--ui-color-accent);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .menu-system-message p {
    margin: 0;
    color: var(--ui-color-text);
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
    flex-wrap: wrap;
    gap: var(--ui-space-sm);
  }

  .slot-card .actions-grid button {
    flex: 1 1 10rem;
    min-height: var(--ui-space-hit);
  }

  .multiplayer-menu {
    display: grid;
    gap: var(--ui-space-sm);
    padding: var(--ui-space-sm);
  }

  .multiplayer-identity-controls,
  .multiplayer-room-choice {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-sm);
    align-items: end;
  }

  .multiplayer-room-choice {
    grid-template-columns: minmax(160px, 0.8fr) minmax(0, 1.2fr);
    align-items: stretch;
  }

  .join-room-box {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--ui-space-sm);
    padding: var(--ui-space-sm);
    border: 1px solid rgba(213, 178, 116, 0.25);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(213, 178, 116, 0.06);
  }

  .multiplayer-identity-controls label,
  .join-room-box label {
    display: grid;
    gap: 5px;
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .multiplayer-server-details {
    min-width: 0;
  }

  .multiplayer-server-details summary {
    min-height: var(--ui-space-hit);
    display: grid;
    align-items: center;
    padding: 0 0.75rem;
    border: var(--ui-border-subtle);
    border-radius: 6px;
    color: var(--ui-color-text-dim);
    cursor: pointer;
  }

  .multiplayer-server-details[open] summary {
    margin-bottom: 5px;
  }

  .multiplayer-identity-controls input,
  .join-room-box input {
    box-sizing: border-box;
    min-width: 0;
    border: var(--ui-border-subtle);
    border-radius: 6px;
    padding: 9px 10px;
    color: var(--ui-color-text);
    background: rgba(255, 255, 255, 0.06);
  }

  .multiplayer-room-tools {
    display: grid;
    grid-template-columns: minmax(180px, 0.55fr) minmax(220px, 1fr);
    gap: var(--ui-space-sm);
  }

  .multiplayer-room-card,
  .multiplayer-player-list,
  .topbar-room-card {
    min-width: 0;
    display: grid;
    gap: 0.25rem;
    padding: var(--ui-space-sm);
    border: 1px solid rgba(124, 153, 176, 0.18);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(255, 255, 255, 0.055);
  }

  .multiplayer-room-card {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .multiplayer-room-card > span,
  .multiplayer-player-list > span,
  .topbar-room-card > span {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .multiplayer-room-card strong {
    grid-column: 1;
    overflow-wrap: anywhere;
  }

  .multiplayer-player-list strong {
    font-size: var(--ui-text-small);
    line-height: var(--ui-line-small);
  }

  .link-icon-button {
    width: 2.35rem;
    height: 2.35rem;
    display: grid;
    place-items: center;
    padding: 0;
  }

  .link-icon-button svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: currentColor;
  }

  .topbar-room-card {
    grid-template-columns: auto auto;
    align-items: center;
    padding: 0.25rem 0.35rem 0.25rem 0.65rem;
  }

  .multiplayer-session-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-xs);
  }

  .multiplayer-session-actions button {
    min-height: 2.1rem;
    padding: 0.45rem 0.7rem;
  }

  .multiplayer-session-actions span {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .draft-layout {
    min-height: 0;
    grid-template-columns: minmax(264px, 288px) minmax(0, 1fr);
    align-items: start;
    gap: 0.75rem;
  }

  .opening-shell:not(.scheduled-faction-shell) .draft-layout {
    align-items: stretch;
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

  .opening-shell:not(.scheduled-faction-shell) .draft-focus-panel,
  .opening-shell:not(.scheduled-faction-shell) .draft-grid {
    max-height: 100%;
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
    grid-auto-rows: minmax(0, 1fr);
    align-content: stretch;
  }

  .center-column > .rift-grid,
  .center-column > .faction-grid,
  .center-column > .opponent-info-board {
    min-height: 100%;
  }

  .center-column > .rift-grid,
  .center-column > .troop-faction-grid {
    min-height: 0;
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

  .opening-empty-detail {
    align-content: center;
    min-height: 100%;
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
    min-height: 0;
  }

  .archive-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .archive-pagination button {
    width: 2rem;
    height: 2rem;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: 999px;
    background: rgba(20, 28, 38, 0.82);
    color: #f1f4f8;
    font: inherit;
  }

  .archive-pagination span {
    color: #a7b8c8;
    font-family: var(--ui-font-mono);
    font-size: 0.74rem;
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
    grid-row: 2;
    justify-self: center;
  }

  .ready-troops-grid {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(3.6rem, 4.35rem));
    align-items: start;
    justify-content: center;
    padding-bottom: 0.15rem;
  }

  .ready-troop-tile {
    width: 4.35rem;
    height: 4.35rem;
    min-height: 0;
    padding: 0.55rem;
  }

  .ready-troops-grid.roster-count-8 {
    grid-template-columns: repeat(auto-fit, minmax(3.25rem, 3.85rem));
  }

  .ready-troops-grid.roster-count-8 .ready-troop-tile {
    width: 3.85rem;
    height: 3.85rem;
    padding: 0.45rem;
  }

  .ready-troops-grid.roster-count-12 {
    grid-template-columns: repeat(auto-fit, minmax(2.95rem, 3.35rem));
  }

  .ready-troops-grid.roster-count-12 .ready-troop-tile {
    width: 3.35rem;
    height: 3.35rem;
    padding: 0.35rem;
  }

  .ready-troops-grid.roster-count-16 {
    grid-template-columns: repeat(auto-fit, minmax(2.65rem, 2.95rem));
  }

  .ready-troops-grid.roster-count-16 .ready-troop-tile {
    width: 2.95rem;
    height: 2.95rem;
    padding: 0.26rem;
  }

  .ready-troops-grid.roster-count-12 .unit-tile-art {
    width: 1.85rem;
    height: 1.85rem;
  }

  .ready-troops-grid.roster-count-16 .unit-tile-art {
    width: 1.55rem;
    height: 1.55rem;
  }

  .faction-grid {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    align-items: start;
  }

  .troop-faction-grid {
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 0.65rem;
    align-content: start;
  }

  .opponent-info-board {
    display: grid;
    gap: var(--ui-space-md);
    align-content: start;
  }

  .opponent-upgrades-panel {
    align-content: start;
  }

  .opponent-empty-state {
    min-height: 100%;
  }

  .opponent-upgrade-row {
    display: flex;
    flex-wrap: wrap;
  }

  .opponent-upgrade-chip {
    min-width: 0;
  }

  .opponent-faction-grid {
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 0.65rem;
  }

  .opponent-faction-card-top {
    grid-template-columns: minmax(140px, 0.85fr) minmax(170px, 1.15fr);
  }

  .opponent-troop-list {
    grid-template-columns: repeat(auto-fit, var(--troop-icon-box-size, 3.8rem));
    justify-content: start;
  }

  .opponent-troop-chip {
    display: grid;
    place-items: center;
    width: var(--troop-icon-box-size, 3.8rem);
    height: var(--troop-icon-box-size, 3.8rem);
    min-height: 0;
    aspect-ratio: 1;
    gap: 0;
  }

  .opponent-troop-chip.opponent-threat {
    border-color: rgba(221, 106, 94, 0.72);
    background:
      linear-gradient(145deg, rgba(48, 20, 18, 0.92), rgba(17, 22, 30, 0.96)),
      radial-gradient(circle at top left, rgba(221, 106, 94, 0.18), transparent 42%);
    box-shadow: inset 0 0 0 1px rgba(221, 106, 94, 0.24);
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

  .available-troop-block {
    display: grid;
    gap: 0.4rem;
    padding-top: 0.15rem;
  }

  .available-troop-chip {
    border-style: dashed;
    opacity: 0.82;
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

  .troops-mode .footer-essence-draft-panel .unlock-row {
    gap: 1px;
  }

  .troops-mode .troop-list {
    grid-template-columns: repeat(auto-fit, var(--troop-icon-box-size, 3.8rem));
    justify-content: start;
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
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    place-items: center;
    width: var(--troop-icon-box-size, 3.8rem);
    height: var(--troop-icon-box-size, 3.8rem);
    aspect-ratio: 1;
    justify-content: center;
    min-height: 0;
  }

  .troops-mode .unit-button-copy {
    justify-content: center;
    gap: 0;
  }

  .troops-mode .unit-button-art {
    width: 2.2rem;
    height: 2.2rem;
  }

  .scheduled-faction-shell .draft-screen-header {
    max-width: none;
  }

  .scheduled-faction-shell .scheduled-faction-layout {
    grid-template-columns: minmax(240px, 288px) minmax(0, 1fr);
  }

  .draft-focus-panel.empty {
    visibility: hidden;
    pointer-events: none;
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
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--ui-space-sm);
    padding: 0;
    background: transparent;
    border: 0;
    color: inherit;
    text-align: left;
  }

  .panel-toggle strong {
    display: block;
    font-size: 1rem;
    color: #f0f5fb;
    line-height: 1.18;
    overflow-wrap: anywhere;
  }

  .panel-toggle > span {
    color: #9db2c4;
    font-size: 0.82rem;
    line-height: 1.1;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }

  .collapsible-panel {
    gap: 0.65rem;
  }

  .collapsible-panel[hidden] {
    display: none;
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
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 0.35rem;
    overflow: hidden;
    border: 1px solid rgba(100, 171, 242, 0.84);
    border-radius: var(--ui-panel-radius-pill);
    background: rgba(5, 9, 14, 0.74);
  }

  .replay-health-bar.total {
    height: 0.52rem;
  }

  .replay-health-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #4eaf69, #8ed66c);
    transition: width 140ms ease-out;
  }

  .replay-health-side.enemy .replay-health-bar:not(.initiative) {
    border-color: rgba(235, 94, 94, 0.84);
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
  .replay-health-unit:focus-visible,
  .replay-health-unit.selected {
    border-color: rgba(213, 178, 116, 0.55);
    background: rgba(35, 29, 21, 0.82);
  }

  .replay-health-unit.active-highlight {
    border-color: rgba(232, 184, 84, 0.9);
    box-shadow: inset 0 0 0 1px rgba(232, 184, 84, 0.65);
  }

  .replay-health-unit.secondary-highlight {
    border-color: rgba(215, 221, 230, 0.78);
    box-shadow: inset 0 0 0 1px rgba(215, 221, 230, 0.42);
  }

  .replay-health-unit img {
    width: 1.5rem;
    height: 1.5rem;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .replay-health-unit-main {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  .replay-initiative-row {
    display: block;
  }

  .replay-health-bar.initiative {
    height: 0.26rem;
    border-color: rgba(214, 146, 54, 0.34);
  }

  .replay-health-bar.initiative span {
    background: linear-gradient(90deg, #e48728, #ffbf47);
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

    .opening-shell:not(.scheduled-faction-shell) .draft-layout {
      grid-template-rows: minmax(8.5rem, 15rem) minmax(0, 1fr);
    }

    .opening-shell:not(.scheduled-faction-shell) .draft-focus-panel {
      min-height: 0;
    }

    .draft-focus-panel.empty {
      display: none;
    }

    .shell,
    .replay-shell {
      grid-template-rows: auto auto auto auto;
    }

    .topbar {
      grid-template-columns: minmax(0, 1fr) auto;
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

    .action-rail {
      min-height: 0;
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

    .multiplayer-identity-controls,
    .multiplayer-room-choice,
    .join-room-box,
    .multiplayer-room-tools {
      grid-template-columns: 1fr;
    }

    .multiplayer-room-choice button,
    .join-room-box button {
      box-sizing: border-box;
      width: 100%;
      min-height: var(--ui-space-hit);
    }


    .action-rail {
      grid-template-columns: 1fr;
    }

    .essence-draft-groups {
      grid-template-columns: 1fr;
    }

    .footer-essence-draft-panel .essence-draft-groups {
      grid-template-columns: 1fr;
    }

    .draft-synergy-connector {
      width: 0.28rem;
      height: 1.4rem;
      justify-self: center;
    }

    .action-rail > button:only-child,
    .end-cycle-button,
    .system-message-popover,
    .archive-actions-stack,
    .footer-ready-troops-panel,
    .footer-essence-draft-panel {
      grid-column: 1;
    }

    .archive-actions-stack,
    .system-message-popover,
    .end-cycle-button {
      justify-self: stretch;
    }

    .footer-ready-troops-panel {
      justify-self: stretch;
    }

    .end-cycle-button {
      width: 100%;
    }

    .system-message-popover {
      right: 0.75rem;
      bottom: 5.15rem;
      width: calc(100% - 1.5rem);
    }

    .menu-screen,
    .draft-screen,
    .shell,
    .replay-shell {
      padding: 0.75rem;
    }

    .menu-panel {
      width: 100%;
    }

    .slot-meta,
    .compact-list {
      grid-template-columns: 1fr;
    }
  }
</style>
