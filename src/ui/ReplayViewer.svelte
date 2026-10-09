<script context="module" lang="ts">
  import type { TutorialAction, TutorialStepId } from '../store/tutorial';
  export interface ReplayViewerTutorial {
    view: { step: TutorialStepId; revision: number } | null;
    locked: boolean;
    signal(action: TutorialAction): void;
    prompt(message?: string): void;
  }
</script>

<script lang="ts">
  import type {
    AbilityDefinition, BattleReplay, BattleStep, BattleUnit, BattleReportDiagnostic,
    ExplainedStatKey, StatBreakdownLine, RaceId, UnitClassId, SideId,
  } from '../engine/types';
  import { formatFixed } from '../engine/fixed';
  import { getMutator } from '../engine/unitCatalog';
  import type { ReplayStepNavigationKind, UnitPointerInfo } from '../rendering/BattleRenderer';
  import { gameStore, gameSessionStore, replayPlaybackStore } from '../store/gameStore';
  import ReplayViewport, { type ReplayViewportInspection, type ReplayControlAction } from './ReplayViewport.svelte';
  import ReplayRecap from './ReplayRecap.svelte';
  import ReplayStepExplanation from './ReplayStepExplanation.svelte';
  import { buildReplayStepExplanationView } from './replayStepExplanation';
  import { findLastAliveStep, isUnitAliveAtStep } from './battleRecap';
  import { buildMutatorDetail, getDetailInspectLabel, type DetailCard } from './detailCards';
  import { formatAbilityDescription, statIcon } from './inspectText';
  import UnitTooltip from './UnitTooltip.svelte';
  import EventLog from './EventLog.svelte';
  import DebugToolsMenu from './DebugToolsMenu.svelte';
  import GameIcon from './GameIcon.svelte';
  import InlineStatText from './InlineStatText.svelte';

  export let getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;
  export let debugToolsEnabled: boolean;
  export let rendererDiagnostics: BattleReportDiagnostic[];
  export let onDiagnostic: (diagnostic: BattleReportDiagnostic) => void;
  export let onExit: () => void;
  export let tutorial: ReplayViewerTutorial;

  let activeDetail: DetailCard | null = null;
  let lastTutorialView: ReplayViewerTutorial['view'] = null;
  function signalTutorial(action: TutorialAction): void { tutorial.signal(action); }
  function showTutorialScenePrompt(message?: string): void { tutorial.prompt(message); }
  function tutorialSceneLockActive(): boolean { return tutorial.locked; }
  function showMutatorDetail(mutatorId: string): void { activeDetail = buildMutatorDetail(mutatorId); }
  function clearDetail(): void { activeDetail = null; }

  $: replay = $replayPlaybackStore.loadedReplay;
  $: if (tutorial.view !== lastTutorialView) {
    lastTutorialView = tutorial.view;
    if (tutorial.view) {
      resetReplayInspect();
      replayEventLogCollapsed = !['timeline-event', 'unit-actions', 'ability'].includes(tutorial.view.step);
      if (tutorial.view.step === 'finish-replay') {
        replayStepNavigationKind = 'event-select';
      }
    }
  }
  type ReplayAbilityTooltipState = { side: SideId; label: string; description: string };
  type ReplaySideAbility = {
    ability: AbilityDefinition;
    side: SideId;
    ownerLabels: string[];
    active: boolean;
  };


  type ReplayHealthUnit = {
    unit: BattleUnit;
    hpPercent: string;
    hpLabel: string;
    readinessPercent: string;
    readinessReady: boolean;
    portraitUrl: string;
  };

  type ReplayHealthSide = {
    side: SideId;
    label: string;
    currentHp: number;
    maxHp: number;
    hpPercent: string;
    hpLabel: string;
    hpTooltip: string;
    unitsMinHeight: string;
    units: ReplayHealthUnit[];
  };


  const replayProfileKey = (side: SideId, troopLabel: string): string => `${side}:${troopLabel}`;

  let replayAbilityTooltip: ReplayAbilityTooltipState | null = null;

  let readinessTooltip: { label: string; description: string; x: number; y: number } | null = null;

  let replayViewport: ReplayViewport | null = null;

  let replayStepNavigationKind: ReplayStepNavigationKind = 'manual-step';

  let hoverInfo: UnitPointerInfo | null = null;

  let lockedUnitId: string | null = null;

  let hoveredReplayProfileKey: string | null = null;

  let selectedReplayProfileKey: string | null = null;

  let replayAliveCountsExpanded = false;

  let replayEventLogCollapsed = true;

  let replayRecapOpen = false;

  let pinnedReplayExplanationIndex: number | null = null;

  let lastInspectedReplay: BattleReplay | null = null;

  let replayHealthRosterCache: { replay: BattleReplay; roster: BattleUnit[] } | null = null;

  let replayProfilesByKeyCache: { replay: BattleReplay; profiles: Map<string, BattleReplay['troopProfiles'][number]> } | null = null;

  function getReplayProfileKeyForUnit(unitId: string): string | null {
    const unit =
      replaySnapshot.find((entry) => entry.id === unitId) ??
      replay?.initial.units.find((entry) => entry.id === unitId) ??
      replay?.steps.find((step) => step.snapshot.units.some((entry) => entry.id === unitId))?.snapshot.units.find((entry) => entry.id === unitId);
    return unit ? replayProfileKey(unit.side, unit.troopLabel) : null;
  }

  function getReplayStepPrimaryUnitId(step: BattleStep | null): string | null {
    return step?.metadata?.activeUnitId ?? step?.actorIds[0] ?? step?.targetIds[0] ?? null;
  }

  function getReplayStepAffectedUnitIds(step: BattleStep | null): string[] {
    if (!step) {
      return [];
    }

    return [
      step.metadata?.activeUnitId,
      ...(step.metadata?.secondaryUnitIds ?? []),
      ...step.actorIds,
      ...step.targetIds,
    ].filter((id, index, ids): id is string => Boolean(id) && ids.indexOf(id) === index);
  }

  function clearPinnedReplayEvent(): void {
    pinnedReplayExplanationIndex = null;
    if ($replayPlaybackStore.selectedEvent !== null) {
      gameStore.selectEvent(null);
    }
  }

  function getReplayUnitPortraitUrl(unit: BattleUnit): string {
    return getRaceUnitPortrait(unit.raceId, unit.unitClassId);
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
    clearPinnedReplayEvent();
    const nextProfileKey = options?.profileKey ?? getReplayProfileKeyForUnit(unitId);
    const sameUnitLocked = options?.toggle && lockedUnitId === unitId;

    if (sameUnitLocked) {
      lockedUnitId = null;
      hoverInfo = options?.pointer ?? null;
      if (nextProfileKey) {
        selectedReplayProfileKey = nextProfileKey;
      }
      signalTutorial('unit-unlock');
      syncRenderer();
      return;
    }

    lockedUnitId = unitId;
    hoverInfo = options?.pointer ?? { unitId, x: 0, y: 0 };
    if (nextProfileKey) {
      selectedReplayProfileKey = nextProfileKey;
    }
    signalTutorial('unit-lock');
    syncRenderer();
  }

  function previewReplayUnit(unit: BattleUnit, event: MouseEvent | FocusEvent): void {
    if (pinnedReplayExplanationIndex !== null) {
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
    signalTutorial('unit-hover');
    syncRenderer();
  }

  function clearReplayUnitPreview(unitId: string): void {
    if (pinnedReplayExplanationIndex !== null) {
      return;
    }
    if (hoverInfo?.unitId === unitId) {
      hoverInfo = null;
      signalTutorial('unit-unhover');
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


  function showReadinessTooltip(unit: BattleUnit, event: MouseEvent | FocusEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    readinessTooltip = {
      label: `${unit.troopLabel} Readiness`,
      description: `${formatFixed(unit.readiness)} / 100. Units act when readiness reaches 100; Beats add Rate until someone is ready.`,
      x: rect.left + rect.width / 2,
      y: rect.top,
    };
    signalTutorial('readiness-hover');
  }

  function clearReadinessTooltip(): void {
    readinessTooltip = null;
  }


  export function resetReplayInspect(): void {
    activeDetail = null;
    readinessTooltip = null;
    replayAbilityTooltip = null;
    hoverInfo = null;
    lockedUnitId = null;
    hoveredReplayProfileKey = null;
    selectedReplayProfileKey = null;
    pinnedReplayExplanationIndex = null;
  }


  function syncRenderer(): void {
    replayViewport?.refresh();
  }

  const replayViewportInspection: ReplayViewportInspection = {
    read: () => {
      const state = $replayPlaybackStore;
      const currentStep = state.currentStep >= 0 ? state.loadedReplay?.steps[state.currentStep] ?? null : null;
      const pinnedEvent = pinnedReplayExplanationIndex !== null ? state.loadedReplay?.steps[pinnedReplayExplanationIndex] ?? null : null;
      const strongIds = pinnedEvent || activeDetail ? []
        : [lockedUnitId ?? hoverInfo?.unitId ?? (!state.autoPlay ? getReplayStepPrimaryUnitId(currentStep) : null)]
          .filter((id): id is string => Boolean(id));
      return { strongIds, eventMarkerIds: activeDetail ? [] : getReplayStepAffectedUnitIds(pinnedEvent),
        terrainVisible: replayEventLogCollapsed };
    },
    hover: (info) => {
      if (pinnedReplayExplanationIndex === null) {
        hoverInfo = info;
        signalTutorial(info ? 'unit-hover' : 'unit-unhover');
        syncRenderer();
      }
    },
    select: (info) => setReplayUnitLock(info.unitId, { toggle: true, pointer: info }),
    reset: () => {
      hoverInfo = null;
      lockedUnitId = null;
    },
    beforeNavigate: () => {
      pinnedReplayExplanationIndex = null;
    },
  };

  function handleReplayControlAction(action: ReplayControlAction): void {
    if (action === 'step-previous' || action === 'step-next' || $gameSessionStore.tutorialProgress?.step === 'play') {
      signalTutorial(action);
    }
  }


  function currentSnapshot(replay: BattleReplay): BattleUnit[] {
    if ($replayPlaybackStore.currentStep < 0) {
      return replay.initial.units;
    }

    return replay.steps[Math.min($replayPlaybackStore.currentStep, replay.steps.length - 1)]?.snapshot.units ?? replay.initial.units;
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

  function getReplayHealthRoster(replay: BattleReplay): BattleUnit[] {
    if (replayHealthRosterCache?.replay === replay) {
      return replayHealthRosterCache.roster;
    }
    const roster = buildReplayHealthRoster(replay);
    replayHealthRosterCache = { replay, roster };
    return roster;
  }

  function getReplayProfilesByKey(replay: BattleReplay | null): Map<string, BattleReplay['troopProfiles'][number]> {
    if (!replay) {
      return new Map();
    }
    if (replayProfilesByKeyCache?.replay === replay) {
      return replayProfilesByKeyCache.profiles;
    }
    const profiles = new Map(replay.troopProfiles.map((profile) => [replayProfileKey(profile.side, profile.troopLabel), profile]));
    replayProfilesByKeyCache = { replay, profiles };
    return profiles;
  }

  function buildReplayHealthSide(roster: BattleUnit[], snapshot: BattleUnit[], side: SideId): ReplayHealthSide {
    const currentUnitsById = new Map(snapshot.map((unit) => [unit.id, unit]));
    const sideUnits = roster.filter((unit) => unit.side === side);
    const currentSideUnits = sideUnits
      .map((unit) => currentUnitsById.get(unit.id))
      .filter((unit): unit is BattleUnit => !!unit);
    const currentHp = currentSideUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0);
    const maxHp = currentSideUnits.reduce((sum, unit) => sum + Math.max(0, unit.maxHp), 0);
    const units = sideUnits.flatMap((unit) => {
      const currentUnit = currentUnitsById.get(unit.id);
      if (!currentUnit?.alive) {
        return [];
      }

      return [{
        unit: currentUnit,
        hpPercent: getHpPercent(currentUnit.hp, currentUnit.maxHp),
        hpLabel: formatHpLabel(currentUnit.hp, currentUnit.maxHp),
        readinessPercent: `${Math.max(0, Math.min(100, currentUnit.readiness))}%`,
        readinessReady: currentUnit.readiness >= 100,
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
      hpTooltip: `${side === 'player' ? 'Player' : 'Enemy'} total health ${formatHpLabel(currentHp, maxHp)}`,
      unitsMinHeight: `${sideUnits.length * 1.9 + Math.max(0, sideUnits.length - 1) * 0.28}rem`,
      units,
    };
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
      return { stat: 'rate', line: { label, value: amount, kind: 'delta' } };
    }
    if (metadata.effect === 'statDelta') {
      const stat = metadata.stat;
      if (stat === 'damage' || stat === 'rate' || stat === 'armor' || stat === 'range' || stat === 'capacity') {
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


  $: if (replayViewport && $gameSessionStore.screen === 'replay') {
    activeDetail;
    pinnedReplayExplanationIndex;
    replayEventLogCollapsed;
    lockedUnitId;
    hoverInfo;
    syncRenderer();
  }
  $: if ($gameSessionStore.screen !== 'replay') {
    replayStepNavigationKind = 'manual-step';
  }

  $: replaySnapshot = replay ? currentSnapshot(replay) : [];
  $: replayHealthRoster = replay ? getReplayHealthRoster(replay) : [];
  $: replayHealthOverview = replay
    ? [buildReplayHealthSide(replayHealthRoster, replaySnapshot, 'player'), buildReplayHealthSide(replayHealthRoster, replaySnapshot, 'enemy')]
    : [];
  $: replayProfilesByKey = getReplayProfilesByKey(replay);
  $: replayHighlightedStepIndex = replay && $replayPlaybackStore.currentStep >= 0 ? $replayPlaybackStore.currentStep : null;
  $: replayHighlightedStep = replay && replayHighlightedStepIndex !== null ? replay.steps[replayHighlightedStepIndex] ?? null : null;
  $: replayPlayerAbilities = replay || replaySnapshot || replayHighlightedStep ? buildReplaySideAbilities('player') : [];
  $: replayEnemyAbilities = replay || replaySnapshot || replayHighlightedStep ? buildReplaySideAbilities('enemy') : [];
  $: replayActiveHighlightId = getReplayStepPrimaryUnitId(replayHighlightedStep);
  $: replayPinnedEventStep = replay && pinnedReplayExplanationIndex !== null ? replay.steps[pinnedReplayExplanationIndex] ?? null : null;
  $: replayEventAffectedUnitIds = new Set(activeDetail ? [] : getReplayStepAffectedUnitIds(replayPinnedEventStep));
  $: replayStrongHighlightId =
    pinnedReplayExplanationIndex === null && !activeDetail
      ? lockedUnitId ?? hoverInfo?.unitId ?? (!$replayPlaybackStore.autoPlay ? replayActiveHighlightId : null)
      : null;
  $: inspectedUnitId = replayStrongHighlightId;
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
  $: inspectedUnitLiveStatLines = buildLiveStatBreakdownLines(replay, inspectedUnit?.id ?? null, $replayPlaybackStore.currentStep);
  $: hoveredReplayUnit =
    hoverInfo?.unitId && hoverInfo.unitId !== lockedUnitId
      ? replaySnapshot.find((unit) => unit.id === hoverInfo?.unitId) ?? null
      : null;
  $: hoveredReplayUnitProfile =
    replay && hoveredReplayUnit
      ? replay.troopProfiles.find((profile) => profile.troopLabel === hoveredReplayUnit.troopLabel && profile.side === hoveredReplayUnit.side) ??
        replay.troopProfiles.find((profile) => {
          const initialUnit = replay.initial.units.find((unit) => unit.id === hoveredReplayUnit.id);
          return profile.troopLabel === hoveredReplayUnit.troopLabel && profile.side === initialUnit?.side;
        }) ??
        null
      : null;
  $: hoveredReplayUnitLiveStatLines = buildLiveStatBreakdownLines(replay, hoveredReplayUnit?.id ?? null, $replayPlaybackStore.currentStep);
  $: hoveredReplayUnitEngagedUnits =
    hoveredReplayUnit && replaySnapshot.length > 0
      ? hoveredReplayUnit.engagedWithIds.map((unitId) => replaySnapshot.find((unit) => unit.id === unitId)).filter(Boolean) as BattleUnit[]
      : [];
  $: hoveredReplayProfile = hoveredReplayProfileKey ? replayProfilesByKey.get(hoveredReplayProfileKey) ?? null : null;
  $: selectedReplayProfile = selectedReplayProfileKey ? replayProfilesByKey.get(selectedReplayProfileKey) ?? null : null;
  $: replayFocusProfile = hoveredReplayProfile ?? inspectedProfile ?? selectedReplayProfile;
  $: aliveSummary = replay ? replay.aliveCounts[Math.max(0, $replayPlaybackStore.currentStep + 1)] ?? replay.aliveCounts[0] : null;
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
    lockedUnitId && replay ? findLockedUnitActorStep(lockedUnitId, $replayPlaybackStore.currentStep, 'prev') : null;
  $: lockedUnitNextActionStep =
    lockedUnitId && replay ? findLockedUnitActorStep(lockedUnitId, $replayPlaybackStore.currentStep, 'next') : null;
  $: if (replay !== lastInspectedReplay) {
    lastInspectedReplay = replay;
    resetReplayInspect();
    activeDetail = null;
    replayRecapOpen = false;
    replayAbilityTooltip = null;
    readinessTooltip = null;
    if (!replay) {
      replayHealthRosterCache = null;
      replayProfilesByKeyCache = null;
    }
  }
  $: if (!replay || (pinnedReplayExplanationIndex !== null && !replay.steps[pinnedReplayExplanationIndex])) {
    pinnedReplayExplanationIndex = null;
  }
  $: replayExplanationIndex = pinnedReplayExplanationIndex;
  $: replayExplanationView =
    replay && replayExplanationIndex !== null && replay.steps[replayExplanationIndex]
      ? buildReplayStepExplanationView(replay.steps[replayExplanationIndex]!)
      : null;

  function selectReplayProfile(side: SideId, troopLabel: string): void {
    focusReplayProfileUnit(side, troopLabel, {
      toggle: true,
    });
  }

  function selectReplayEvent(index: number): void {
    lockedUnitId = null;
    hoverInfo = null;
    selectedReplayProfileKey = null;
    pinnedReplayExplanationIndex = index;
    gameStore.setAutoPlay(false);
    replayStepNavigationKind = 'event-select';
    gameStore.selectEvent(index);
    if ($gameSessionStore.tutorialProgress?.step !== 'timeline-event' || index === 100) {
      signalTutorial('event-select');
    }
  }

  function goToReplayUnitActionStep(stepIndex: number | null): void {
    if (stepIndex === null) {
      return;
    }

    gameStore.setAutoPlay(false);
    replayStepNavigationKind = 'event-select';
    gameStore.selectEvent(stepIndex);
    pinnedReplayExplanationIndex = null;
    syncRenderer();
  }

  function pinReplayExplanation(index: number | null): void {
    if (index === null) {
      clearPinnedReplayEvent();
      syncRenderer();
      return;
    }

    lockedUnitId = null;
    hoverInfo = null;
    selectedReplayProfileKey = null;
    replayStepNavigationKind = 'event-select';
    gameStore.selectEvent(index);
    pinnedReplayExplanationIndex = index;
    syncRenderer();
  }

  function getStepAbilityId(step: BattleStep | null): string | null {
    if (!step) {
      return null;
    }
    return (
      (typeof step.metadata?.sourceAbilityId === 'string' ? step.metadata.sourceAbilityId : null) ??
      (typeof step.metadata?.explanation?.ability?.abilityId === 'string' ? step.metadata.explanation.ability.abilityId : null)
    );
  }

  function getStepActorSide(step: BattleStep | null): SideId | null {
    const actorId = step?.actorIds[0];
    if (!actorId) {
      return null;
    }
    return (replaySnapshot.find((unit) => unit.id === actorId) ?? replay?.initial.units.find((unit) => unit.id === actorId))?.side ?? null;
  }

  function buildReplaySideAbilities(side: SideId): ReplaySideAbility[] {
    const activeAbilityId = getStepAbilityId(replayHighlightedStep);
    const activeSide = getStepActorSide(replayHighlightedStep);
    const abilities = new Map<string, ReplaySideAbility>();
    (replay?.troopProfiles ?? [])
      .filter((profile) => profile.side === side)
      .forEach((profile) => {
        profile.abilities.forEach((ability) => {
          const existing = abilities.get(ability.id);
          if (existing) {
            if (!existing.ownerLabels.includes(profile.troopLabel)) {
              existing.ownerLabels.push(profile.troopLabel);
            }
            return;
          }
          abilities.set(ability.id, {
            ability,
            side,
            ownerLabels: [profile.troopLabel],
            active: activeSide === side && activeAbilityId === ability.id,
          });
        });
      });
    return [...abilities.values()].sort((left, right) => left.ability.label.localeCompare(right.ability.label));
  }

  function showReplayAbilityTooltip(entry: ReplaySideAbility): void {
    replayAbilityTooltip = {
      side: entry.side,
      label: entry.ability.label,
      description: `${formatAbilityDescription(entry.ability)} ${entry.ownerLabels.join(', ')}.`,
    };
    signalTutorial('ability-hover');
  }

  function clearReplayAbilityTooltip(): void {
    replayAbilityTooltip = null;
  }

  function toggleReplayRecap(): void {
    replayRecapOpen = !replayRecapOpen;
  }

  function selectReplayRecapUnit(unitId: string, side: SideId, troopLabel: string): void {
    if (!replay) {
      return;
    }

    const currentStep = $replayPlaybackStore.currentStep;
    const targetStep = isUnitAliveAtStep(replay, unitId, currentStep) ? currentStep : findLastAliveStep(replay, unitId, currentStep);
    gameStore.setAutoPlay(false);
    if (targetStep !== currentStep) {
      replayStepNavigationKind = 'event-select';
      gameStore.jumpTo(targetStep);
    }

    setReplayUnitLock(unitId, {
      profileKey: replayProfileKey(side, troopLabel),
    });
    replayRecapOpen = false;
  }

  function cycleReplayProfileUnit(side: SideId, troopLabel: string): void {
    focusReplayProfileUnit(side, troopLabel, {
      cycle: true,
    });
  }
</script>

  <main class="replay-shell">
    <section class="left replay-left ui-debug-target" data-ui-name="Replay left sidebar">
      <div class="replay-header ui-debug-target" data-ui-name="Replay header">
        <div class="replay-title-row">
          <p class="replay-name">{replay?.riftId ?? 'Debug Battle'}</p>
        </div>
        <div class="replay-actions replay-header-actions">
          <button
            class="replay-exit-button ui-debug-target"
            class:tutorial-scene-locked={tutorialSceneLockActive()}
            data-ui-name="Return to overworld"
            on:click={onExit}
          ><span aria-hidden="true">&larr;</span> Return to Rifts</button>
          <button class="replay-exit-button replay-recap-button ui-debug-target" data-ui-name="Toggle battle recap" on:click={toggleReplayRecap}>
            {replayRecapOpen ? 'Close Battle Recap' : 'Open Battle Recap'}
          </button>
        </div>
      </div>
      {#if debugToolsEnabled && $replayPlaybackStore.loadedBattleReport}
        <div class="panel battle-report-panel">
          <p class="eyebrow">Imported Battle Report</p>
          <h2>{$replayPlaybackStore.loadedBattleReport.reportId}</h2>
          <p>
            Created {$replayPlaybackStore.loadedBattleReport.createdAt}. Original replay {$replayPlaybackStore.loadedBattleReport.summary.replayId}
            with {$replayPlaybackStore.loadedBattleReport.summary.stepCount} steps.
          </p>
          {#if $replayPlaybackStore.loadedBattleReport.diagnostics.length > 0}
            <div class="compact-list">
              {#each $replayPlaybackStore.loadedBattleReport.diagnostics as diagnostic}
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
      <section class="panel focus-panel ui-debug-target" data-ui-name="Replay focus panel">
        {#if activeDetail}
          <div class="detail-panel replay-detail-panel">
            <p class="eyebrow">{getDetailInspectLabel(activeDetail)}</p>
            <h2 class="detail-title">{#if activeDetail.iconKind && activeDetail.iconId}<GameIcon kind={activeDetail.iconKind} id={activeDetail.iconId} label={activeDetail.label} />{/if}<span>{activeDetail.label}</span></h2>
            <p><InlineStatText text={activeDetail.description} /></p>
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
          <div class="replay-unit-focus-stack">
            <UnitTooltip
              unit={inspectedUnit}
              profile={replayFocusProfile}
              engagedUnits={engagedUnits}
              getUnitPortraitUrl={getReplayUnitPortraitUrl}
              getRaceUnitPortraitUrl={getRaceUnitPortrait}
              x={hoverInfo?.x ?? 0}
              y={hoverInfo?.y ?? 0}
              locked={!!lockedUnitId}
              lastActionStep={lockedUnitLastActionStep}
              nextActionStep={lockedUnitNextActionStep}
              onGoToLastAction={() => goToReplayUnitActionStep(lockedUnitLastActionStep)}
              onGoToNextAction={() => goToReplayUnitActionStep(lockedUnitNextActionStep)}
              docked={true}
              liveBuffLines={inspectedUnitLiveStatLines}
              onHoverStat={(key) => key === 'rate' && signalTutorial('rate-hover')}
              onHoverAbility={() => signalTutorial('ability-hover')}
              onPreviousAction={() => signalTutorial('unit-previous-action')}
              onNextAction={() => signalTutorial('unit-next-action')}
            />
            {#if lockedUnitId && hoveredReplayUnit}
              <UnitTooltip
                unit={hoveredReplayUnit}
                profile={hoveredReplayUnitProfile}
                engagedUnits={hoveredReplayUnitEngagedUnits}
                getUnitPortraitUrl={getReplayUnitPortraitUrl}
                getRaceUnitPortraitUrl={getRaceUnitPortrait}
                x={hoverInfo?.x ?? 0}
                y={hoverInfo?.y ?? 0}
                locked={false}
                docked={true}
                liveBuffLines={hoveredReplayUnitLiveStatLines}
                onHoverStat={(key) => key === 'rate' && signalTutorial('rate-hover')}
                onHoverAbility={() => signalTutorial('ability-hover')}
              />
            {/if}
          </div>
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
        <ReplayViewport bind:this={replayViewport} bind:navigationKind={replayStepNavigationKind}
          inspection={replayViewportInspection} onDiagnostic={onDiagnostic} onControlAction={handleReplayControlAction}>
        <div class="replay-map-mutators" slot="mutators">
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
        {#if replayPlayerAbilities.length > 0 || replayEnemyAbilities.length > 0}
          <div class="replay-ability-rails" aria-label="Replay side abilities">
            <div class="replay-ability-rail player">
              {#each replayPlayerAbilities as entry (entry.ability.id)}
                <button
                  type="button"
                  class="replay-ability-button ui-debug-target"
                  class:active={entry.active}
                  data-ui-name={`Replay player ability ${entry.ability.label}`}
                  aria-label={`${entry.ability.label}: ${formatAbilityDescription(entry.ability)}`}
                  style={`--replay-ability-flash-ms:${Math.round(Math.max(420, $replayPlaybackStore.rateMs * 1.5))}ms;`}
                  on:mouseenter={() => showReplayAbilityTooltip(entry)}
                  on:focus={() => showReplayAbilityTooltip(entry)}
                  on:mouseleave={clearReplayAbilityTooltip}
                  on:blur={clearReplayAbilityTooltip}
                >
                  <GameIcon kind="ability" id={entry.ability.id} label={entry.ability.label} />
                </button>
              {/each}
            </div>
            <div class="replay-ability-rail enemy">
              {#each replayEnemyAbilities as entry (entry.ability.id)}
                <button
                  type="button"
                  class="replay-ability-button ui-debug-target"
                  class:active={entry.active}
                  data-ui-name={`Replay enemy ability ${entry.ability.label}`}
                  aria-label={`${entry.ability.label}: ${formatAbilityDescription(entry.ability)}`}
                  style={`--replay-ability-flash-ms:${Math.round(Math.max(420, $replayPlaybackStore.rateMs * 1.5))}ms;`}
                  on:mouseenter={() => showReplayAbilityTooltip(entry)}
                  on:focus={() => showReplayAbilityTooltip(entry)}
                  on:mouseleave={clearReplayAbilityTooltip}
                  on:blur={clearReplayAbilityTooltip}
                >
                  <GameIcon kind="ability" id={entry.ability.id} label={entry.ability.label} />
                </button>
              {/each}
            </div>
            {#if replayAbilityTooltip}
              <div class={`replay-ability-tooltip ${replayAbilityTooltip.side}`} role="tooltip">
                <strong>{replayAbilityTooltip.label}</strong>
                <span><InlineStatText text={replayAbilityTooltip.description} /></span>
              </div>
            {/if}
          </div>
        {/if}
        </ReplayViewport>
      </div>
    </section>

    <section class="right replay-right ui-debug-target" data-ui-name="Replay right sidebar">
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
        <div class="replay-log-toolbar">
          <button
            class="panel panel-toggle event-log-toggle ui-debug-target"
            data-ui-name="Toggle event log"
            on:click={() => {
              replayEventLogCollapsed = !replayEventLogCollapsed;
              if (!replayEventLogCollapsed) {
                signalTutorial('event-log-show');
              } else if ($gameSessionStore.tutorialProgress?.step === 'timeline-event') {
                showTutorialScenePrompt('Re-open the Event Log to continue.');
              }
            }}
          >
            <span class="event-log-tab" class:active={replayEventLogCollapsed}>Overview</span>
            <span class="event-log-tab" class:active={!replayEventLogCollapsed}>Event Log</span>
          </button>
          <DebugToolsMenu mode="battle-button" rendererDiagnostics={rendererDiagnostics} />
        </div>
        {#if replayEventLogCollapsed}
          <section class="panel replay-health-overview ui-debug-target" data-ui-name="Collapsed event log health overview" aria-label="Replay health overview">
            {#each replayHealthOverview as side}
              <section class="replay-health-side" class:enemy={side.side === 'enemy'} style={`--replay-health-units-min-height: ${side.unitsMinHeight};`}>
                <div class="replay-health-total">
                  <div class="replay-health-total-label" title={side.hpTooltip} aria-label={side.hpTooltip}>
                    <span>{side.label}</span>
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
                        class:active-highlight={replayStrongHighlightId === entry.unit.id}
                        class:secondary-highlight={replayEventAffectedUnitIds.has(entry.unit.id)}
                        data-ui-name={`Health overview ${side.label} ${entry.unit.id}`}
                        data-tutorial-has-abilities={(replayProfilesByKey.get(replayProfileKey(entry.unit.side, entry.unit.troopLabel))?.abilities.length ?? 0) > 0 ? 'true' : undefined}
                        aria-label={`${entry.unit.troopLabel} health ${entry.hpLabel}`}
                        on:mouseenter={(event) => previewReplayUnit(entry.unit, event)}
                        on:focus={(event) => previewReplayUnit(entry.unit, event)}
                        on:mouseleave={() => clearReplayUnitPreview(entry.unit.id)}
                        on:blur={() => clearReplayUnitPreview(entry.unit.id)}
                        on:click={() => setReplayUnitLock(entry.unit.id, { toggle: true, profileKey: replayProfileKey(entry.unit.side, entry.unit.troopLabel) })}
                      >
                        <img src={entry.portraitUrl} alt="" aria-hidden="true" />
                        <div class="replay-health-unit-main">
                          <div
                            class="replay-health-track"
                            role="meter"
                            aria-label={`${entry.unit.troopLabel} readiness ${formatFixed(entry.unit.readiness)} out of 100`}
                            aria-valuemin="0"
                            aria-valuemax="100"
                            aria-valuenow={Math.max(0, Math.min(100, entry.unit.readiness))}
                          >
                            <div class="replay-health-bar" aria-hidden="true">
                              <span style={`width: ${entry.hpPercent}`}></span>
                            </div>
                            <span
                              class="replay-readiness-row replay-readiness-marker"
                              class:ready={entry.readinessReady}
                              style={`--readiness-position: ${entry.readinessPercent};`}
                              on:mouseenter={(event) => showReadinessTooltip(entry.unit, event)}
                              on:mouseleave={clearReadinessTooltip}
                              aria-hidden="true"
                            >
                              {statIcon('rate')}
                            </span>
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
              selected={$replayPlaybackStore.selectedEvent}
              currentStep={$replayPlaybackStore.currentStep}
              pinnedExplanationIndex={pinnedReplayExplanationIndex}
              tutorialTargetIndex={$gameSessionStore.tutorialProgress?.step === 'timeline-event' ? 100 : null}
              showTitle={false}
              onSelect={selectReplayEvent}
              onPinExplanation={pinReplayExplanation}
            />
          </div>
        {/if}
      </section>
    </section>

    {#if replayRecapOpen}
      <ReplayRecap {replay} snapshot={replaySnapshot} {getRaceUnitPortrait} onClose={toggleReplayRecap} onInspect={selectReplayRecapUnit} />
    {/if}
  </main>{#if readinessTooltip}
  <div class="readiness-tooltip" style={`left:${readinessTooltip.x}px; top:${readinessTooltip.y}px;`} role="tooltip">
    <strong>{readinessTooltip.label}</strong>
    <span>{readinessTooltip.description}</span>
  </div>
{/if}


<style>


  button {
    cursor: pointer;
  }

  button:not(:disabled):active {
    transform: translateY(1px) scale(0.985);
    filter: brightness(0.9);
  }

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

  .compact-list div {
    display: grid;
    gap: 0.15rem;
    padding: var(--ui-space-sm);
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-soft);
  }

  .readiness-tooltip {
    position: fixed;
    z-index: 44;
    display: grid;
    gap: 0.18rem;
    width: min(18rem, calc(100vw - 1rem));
    padding: 0.5rem 0.62rem;
    border: 1px solid rgba(214, 146, 54, 0.62);
    border-radius: 8px;
    background: rgba(8, 12, 18, 0.96);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
    color: #f5f1e6;
    font-size: 0.78rem;
    pointer-events: none;
    transform: translate(-50%, calc(-100% - 0.45rem));
  }

  .readiness-tooltip strong {
    color: #ffcf73;
    font-size: 0.82rem;
  }

  .readiness-tooltip span {
    color: #c7d5e0;
    line-height: 1.32;
  }

  .compact-list span {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .compact-list strong {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-width: 0;
    white-space: nowrap;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  button.tutorial-scene-locked {
    cursor: not-allowed;
    filter: grayscale(1);
    opacity: 0.48;
  }

  .left,
  .right {
    min-height: 0;
    display: grid;
    gap: 0.75rem;
    align-content: start;
    overflow: auto;
    padding-right: 0.2rem;
  }

  .panel {
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

  .panel * {
    min-width: 0;
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

  .mutator-chip:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .mutator-chip.selected {
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
  .detail-title :global(.game-icon) {
    --game-icon-size: 1.05rem;
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

  .detail-panel p,
  .replay-header p {
    color: #a7b8c8;
  }

  .detail-panel,
  .replay-left,
  .replay-right,
  .replay-center {
    display: grid;
    gap: var(--ui-space-sm);
    align-content: start;
  }

  .compact-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .detail-panel {
    min-height: 0;
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

  .replay-map-mutators {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    z-index: 5;
    transform: translateX(-50%);
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-xs);
    justify-content: center;
    max-width: min(34rem, calc(100% - 11rem));
    pointer-events: auto;
  }

  .replay-center {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }

  .viewport-shell {
    min-height: 0;
    width: 100%;
    height: 100%;
    display: grid;
    position: relative;
    min-height: clamp(340px, 50vh, 560px);
    border-radius: var(--ui-panel-radius);
    overflow: hidden;
    background:
      radial-gradient(circle at top left, rgba(41, 73, 104, 0.34), transparent 28%),
      linear-gradient(180deg, rgba(10, 15, 24, 0.98), rgba(5, 8, 13, 0.98));
  }

  .replay-ability-rails {
    position: absolute;
    inset: auto 0 0 0;
    z-index: 3;
    pointer-events: none;
  }

  .replay-ability-rail {
    position: absolute;
    bottom: 0.55rem;
    display: grid;
    grid-auto-rows: 1.9rem;
    gap: 0.28rem;
    max-height: min(38vh, 18rem);
    overflow: visible;
    pointer-events: auto;
  }

  .replay-ability-rail.player {
    left: 0.55rem;
  }

  .replay-ability-rail.enemy {
    right: 0.55rem;
  }

  .replay-ability-button {
    width: 1.9rem;
    height: 1.9rem;
    min-height: 1.9rem;
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: 8px;
    border: 1px solid rgba(128, 157, 181, 0.26);
    background: rgba(7, 11, 18, 0.72);
    backdrop-filter: blur(8px);
  }

  .replay-ability-button :global(.game-icon) {
    --game-icon-size: 1.18rem;
  }

  .replay-ability-button :global(.game-icon.raster-icon) {
    --game-icon-raster-scale: 1.42;
  }

  .replay-ability-button.active {
    animation: replay-ability-flash var(--replay-ability-flash-ms, 750ms) ease-out both;
  }

  .replay-ability-tooltip {
    position: absolute;
    bottom: 0.55rem;
    width: min(20rem, 38vw);
    display: grid;
    gap: 0.25rem;
    padding: 0.58rem 0.68rem;
    border: 1px solid rgba(213, 178, 116, 0.34);
    border-radius: 8px;
    color: #edf4fb;
    background: rgba(8, 12, 18, 0.9);
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.34);
    pointer-events: none;
  }

  .replay-ability-tooltip.player {
    left: 2.85rem;
  }

  .replay-ability-tooltip.enemy {
    right: 2.85rem;
  }

  .replay-ability-tooltip strong {
    color: var(--ui-color-accent);
    font-size: 0.88rem;
    line-height: 1.1;
  }

  .replay-ability-tooltip span {
    color: #c9d6e2;
    font-size: 0.78rem;
    line-height: 1.25;
  }

  @keyframes replay-ability-flash {
    0% {
      border-color: rgba(255, 235, 174, 0.9);
      box-shadow: 0 0 0 0 rgba(255, 219, 133, 0.72), 0 0 22px rgba(255, 219, 133, 0.45);
      transform: scale(1);
    }
    45% {
      transform: scale(1.16);
    }
    100% {
      border-color: rgba(128, 157, 181, 0.26);
      box-shadow: 0 0 0 0.55rem rgba(255, 219, 133, 0);
      transform: scale(1);
    }
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

  .replay-unit-focus-stack {
    display: grid;
    gap: 0.55rem;
    min-width: 0;
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
    --replay-log-panel-bg: #121c29;
    display: flex;
    align-items: end;
    gap: 0.25rem;
    padding: 0;
    border-bottom: 0;
    background: transparent;
  }

  .replay-log-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.45rem;
    align-items: stretch;
  }

  .event-log-tab {
    min-width: 0;
    padding: 0.55rem 0.78rem 0.48rem;
    border: 1px solid rgba(89, 105, 126, 0.62);
    border-bottom-color: rgba(89, 105, 126, 0.28);
    border-radius: 10px 10px 0 0;
    background: rgba(12, 16, 24, 0.78);
    color: #b9c7d4;
    font-size: 0.8rem;
    font-weight: 800;
    line-height: 1.1;
    text-transform: none;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .event-log-tab.active {
    padding-top: 0.68rem;
    background: var(--replay-log-panel-bg);
    border-color: rgba(107, 137, 168, 0.78);
    border-bottom-color: var(--replay-log-panel-bg);
    color: #f0f5fb;
  }

  .collapsible-stack {
    --replay-log-panel-bg: #121c29;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0;
    align-content: start;
  }

  .collapsible-stack.collapsed {
    grid-template-rows: auto auto;
  }

  .event-log-wrap {
    min-height: 0;
    overflow: hidden;
  }

  .event-log-wrap :global(.panel) {
    height: 100%;
    border-top-color: rgba(107, 137, 168, 0.78);
    border-radius: 0 0 var(--ui-panel-radius) var(--ui-panel-radius);
    background: var(--replay-log-panel-bg);
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
    border-top-color: rgba(107, 137, 168, 0.78);
    border-radius: 0 0 var(--ui-panel-radius) var(--ui-panel-radius);
    background: var(--replay-log-panel-bg);
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
    container-type: inline-size;
  }

  .replay-health-total-label {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
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
    white-space: nowrap;
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

  .replay-health-track {
    position: relative;
    display: block;
    padding: 0.42rem 0;
    margin: -0.42rem 0;
  }

  .replay-health-track .replay-health-bar {
    height: 0.42rem;
  }

  .replay-readiness-marker {
    --readiness-marker-size: 0.9rem;
    position: absolute;
    left: clamp(
      calc(var(--readiness-marker-size) / 2),
      var(--readiness-position),
      calc(100% - var(--readiness-marker-size) / 2)
    );
    top: 50%;
    display: grid;
    place-items: center;
    width: var(--readiness-marker-size);
    height: var(--readiness-marker-size);
    border: 0;
    background: transparent;
    box-shadow: none;
    color: inherit;
    font-size: 0.82rem;
    line-height: 1;
    text-shadow:
      -0.04rem 0 #05070a,
      0.04rem 0 #05070a,
      0 -0.04rem #05070a,
      0 0.04rem #05070a;
    transform: translate(-50%, -50%);
    transition:
      left 140ms ease-out,
      text-shadow 140ms ease-out,
      filter 140ms ease-out;
    pointer-events: auto;
  }

  .replay-readiness-marker.ready {
    filter: saturate(1.2) brightness(1.12);
    text-shadow:
      -0.04rem 0 #05070a,
      0.04rem 0 #05070a,
      0 -0.04rem #05070a,
      0 0.04rem #05070a,
      0 0 0.22rem rgba(255, 232, 160, 0.9),
      0 0 0.55rem rgba(255, 190, 71, 0.9);
  }

  .replay-readiness-marker.ready::after {
    content: '';
    position: absolute;
    inset: -0.08rem 0.08rem 0.08rem -0.08rem;
    background: linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.62) 48%, transparent 66%);
    clip-path: polygon(34% 0, 72% 0, 45% 44%, 74% 44%, 24% 100%, 42% 54%, 18% 54%);
    mix-blend-mode: screen;
    pointer-events: none;
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

  .event-log-wrap,
  .alive-sides {
    min-height: 0;
  }

  .alive-sides {
    overflow: auto;
  }

  @media (max-width: 1280px) {
    .replay-shell {
      grid-template-columns: 1fr;
    }

    .replay-shell {
      grid-template-rows: auto auto auto auto;
    }

    .alive-sides {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 820px) {

    .replay-shell {
      padding: 0.75rem;
    }

    .compact-list {
      grid-template-columns: 1fr;
    }
  }
</style>
