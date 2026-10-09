<svelte:head>
  <title>Shiftmake</title>
</svelte:head>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { createCyclePresentationSession,
    BATTLE_LOG_ARRIVAL_STAGGER_MS, BATTLE_LOG_ARRIVAL_FLIGHT_MS } from './cyclePresentationSession';
  import {
    createTroopInstance,
    getTroopEffectiveDefinition,
    getTroopsAssignedToRift,
    resolveTroopCombatant,
  } from '../engine/army';
  import { formatFixed } from '../engine/fixed';
  import {
    RACES,
    getRaceNativeTroopUnlockIds,
    getUnitClass,
    isNativeTroopUnlockId,
  } from '../engine/unitCatalog';
  import type {
    BattleReportDiagnostic,
    BattleParticipantKind,
    BattleReplay,
    BattleUnit,
    BattleOutcome,
    ContestPlayerId,
    RaceId,
    GameMode,
    StoredReplayPayload,
    ResolvedCombatantDefinition,
    ReplayIndexEntry,
    RiftInstance,
    RiftResolutionRecord,
    SideId,
    TroopId,
    TroopUnlockId,
    UnitClassId,
  } from '../engine/types';
  import { describeTroopUnlock } from '../engine/upgrades';
  import { getRaceSpriteUrl, UNIT_SPRITE_URLS } from '../rendering/unitVisualAssets';
  import { getConfiguredMultiplayerServerUrl, hasConfiguredMultiplayerServerUrl, inferShareableMultiplayerServerUrl, normalizeMultiplayerServerUrl } from '../config/multiplayer';
  import { gameStore, gameSessionStore, replayPlaybackStore, readLastMultiplayerPlayerName, readLastMultiplayerServerUrl } from '../store/gameStore';
  import { getTutorialStepCenterMode, getTutorialStepSurface, type TutorialStepId } from '../store/tutorial';
  import type { SaveSlotSummary } from '../store/saveSlots';
  import ReplayViewer, { type ReplayViewerTutorial } from './ReplayViewer.svelte';
  import DebugToolsMenu from './DebugToolsMenu.svelte';
  import MainMenuNavigation, { type MainMenuView } from './MainMenuNavigation.svelte';
  import SaveSlotMenu from './SaveSlotMenu.svelte';
  import GameOverDialog from './GameOverDialog.svelte';
  import OpeningUnlockScreen from './OpeningUnlockScreen.svelte';
  import ScheduledUnlockScreen from './ScheduledUnlockScreen.svelte';
  import EssenceDraftPanel from './EssenceDraftPanel.svelte';
  import ArchivePanel from './ArchivePanel.svelte';
  import { createArchiveSession } from './archiveSession';
  import { ARCHIVE_PARTICIPANT_FALLBACK, healthPercent } from './archiveDetails';
  import { createEssenceDraftSession } from './essenceDraftSession';
  import { gameModeLabel } from './gameModeLabels';
  import DesignModePanel, { type DesignTweakField, type DesignTweaks } from './DesignModePanel.svelte';
  import GameIcon from './GameIcon.svelte';
  import PlanningInspector from './PlanningInspector.svelte';
  import TroopRosterBoard from './TroopRosterBoard.svelte';
  import RivalInfoBoard from './RivalInfoBoard.svelte';
  import RiftBoard from './RiftBoard.svelte';
  import ReadyTroopsPanel from './ReadyTroopsPanel.svelte';
  import PlanningActionRail from './PlanningActionRail.svelte';
  import { createPlanningInspection } from './planningInspection';
  import { buildRecordBattlePhase, resultForBattleSource,
    healthToneForAnimationSide, phaseResultSource, type MiniReplayHealthTone } from './riftBattlePresentation';
  import { createPlanningAttentionSession } from './planningAttentionSession';
  import { createTroopAssignmentInteraction, type TroopDropTarget } from './troopAssignmentInteraction';
  import { statIcon } from './inspectText';
  import { getRiftVisual } from './riftVisuals';
  import { preloadGameAssets, type GameAssetPreloadProgress } from './gameAssetPreloader';
  import TutorialPopup from './TutorialPopup.svelte';
  import BattleLogResultToken from './BattleLogResultToken.svelte';
  import RiftBattleMiniReplay from './RiftBattleMiniReplay.svelte';
  import {
    CAMPAIGN_FINAL_CYCLE,
    CONTEST_FINAL_CYCLE,
    canAssignTroopToRift,
    getEssenceDraftCost,
    validateAssignments,
  } from '../engine/game';
  import { LADDER_FINAL_CYCLE } from '../engine/ladder';
  import {
    describeRaceModifiers,
    getUpgradeDetails,
    type DetailCard,
  } from './detailCards';

  type CycleRecord = RiftResolutionRecord;
  type BattleLogVisual = {
    key: string;
    replay: BattleReplay | null;
    outcome: BattleOutcome;
    opponentOutcome: boolean;
    leftPercent: number;
    rightPercent: number;
    leftSource: SideId;
    rightSource: SideId;
    leftTone: MiniReplayHealthTone;
    rightTone: MiniReplayHealthTone;
    ariaLabel: string;
    riftId: string | null;
    riftVisualSource: RiftInstance | null;
  };

  type LoadingProgressState = GameAssetPreloadProgress;

  const BATTLE_LOG_ROW_HEIGHT_REM = 3.35;

  const RACE_IDS = Object.keys(RACES) as RaceId[];
  const debugToolsEnabled = import.meta.env.DEV;
  const verificationLabMode =
    debugToolsEnabled && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lab') === 'ability-verification';
  const DESIGN_MODE_STORAGE_KEY = 'shiftmake:design-mode:v1';

  let portraits: Record<string, string> = {};
  let selectedRiftId: string | null = null;
  let selectedTroopId: TroopId | null = null;
  let selectedRaceId: RaceId | null = null;
  const archiveSession = createArchiveSession();
  let replayViewer: ReplayViewer | null = null;
  let openingUnlockScreen: OpeningUnlockScreen | null = null;
  let scheduledUnlockScreen: ScheduledUnlockScreen | null = null;
  let tutorialReplayView: ReplayViewerTutorial['view'] = null;
  const planningInspection = createPlanningInspection();
  const draftSession = createEssenceDraftSession({
    claimTroop: id => { gameStore.claimTroopOffer(id); signalTutorial('draft-troop'); },
    claimUpgrade: id => { gameStore.claimUpgradeOffer(id); signalTutorial('draft-upgrade'); },
    reroll: side => { if (side === 'troop') gameStore.rerollTroopOffer(); else gameStore.rerollUpgradeOffer(); },
    pin: planningInspection.replacePin,
  });
  let highlightedDetailKeys = new Set<string>();
  let topbarTooltip: { label: string; description: string } | null = null;
  let gameAssetProgress: LoadingProgressState = { active: false, completed: 0, total: 1, label: 'Preparing game images' };
  const assignmentInteraction = createTroopAssignmentInteraction({
    runtime: () => ({ window, document }),
    isBlocked: isHoldingTroop,
    describeTroop: troopId => {
      const troop = $gameSessionStore.game.troops.find(entry => entry.id === troopId);
      return troop ? { label: getTroopEffectiveDefinition($gameSessionStore.game, troopId).label,
        portraitUrl: getRaceUnitPortrait(troop.raceId, troop.unitClassId) } : null;
    },
    onDragComplete: troopId => { selectedTroopId = troopId; },
    onDrop: completeTroopDrop,
  });
  let viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;
  let viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  const planningAttention = createPlanningAttentionSession(() => ({
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: handle => window.clearTimeout(handle),
  }));
  let cycleResolvePending = false;
  let cycleResolvePendingCycle: number | null = null;
  let assignmentHintArrow: { x1: number; y1: number; cx1: number; cy1: number; cx2: number; cy2: number; x2: number; y2: number } | null = null;
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
  let multiplayerPlayerName = 'Geopphrey';
  let multiplayerCopyMessage: string | null = null;
  let multiplayerCopyMessageTimer: ReturnType<typeof window.setTimeout> | null = null;
  let multiplayerCycleEnded = false;
  let multiplayerStatus: string | null = null;
  let mainMenuView: MainMenuView = 'home';
  const cyclePresentation = createCyclePresentationSession({
    runtime: () => ({
      setTimeout: (callback, delay) => window.setTimeout(callback, delay),
      clearTimeout: handle => window.clearTimeout(handle),
      requestAnimationFrame: callback => window.requestAnimationFrame(callback),
      cancelAnimationFrame: handle => window.cancelAnimationFrame(handle),
    }),
    afterRender: tick,
    isCurrent: animation => $gameSessionStore.cycleAnimation === animation,
    finish: () => { void gameStore.finishCycleAnimation(); },
  });
  let tutorialScenePrompt = false;
  let tutorialScenePromptMessage = 'Follow the tutorial!';
  let tutorialScenePromptTimer: ReturnType<typeof window.setTimeout> | null = null;
  const multiplayerDefaultServerConfigured = hasConfiguredMultiplayerServerUrl();

  function signalTutorial(action: Parameters<typeof gameStore.recordTutorialAction>[0]): void {
    if ($gameSessionStore.tutorialProgress) {
      gameStore.recordTutorialAction(action);
    }
  }

  function getTutorialReplayId(): string | null {
    return $gameSessionStore.game.replayIndex[0]?.replayId ?? null;
  }

  function navigateToTutorialStepView(step: TutorialStepId): void {
    const surface = getTutorialStepSurface(step);
    const replayId = getTutorialReplayId();
    resetZoneState();
    tutorialScenePrompt = false;

    if (surface === 'archive') {
      if ($gameSessionStore.screen === 'replay') {
        gameStore.closeReplay();
      }
      gameStore.setCenterMode('rifts');
      archiveSession.select(replayId);
      mainMenuView = 'home';
      return;
    }

    if (surface === 'replay') {
      if (replayId && $replayPlaybackStore.loadedReplay?.id !== replayId) {
        gameStore.openReplay(replayId);
      }
      if (step === 'finish-replay') {
        gameStore.jumpTo(Number.MAX_SAFE_INTEGER);
      }
      tutorialReplayView = { step, revision: (tutorialReplayView?.revision ?? 0) + 1 };
      return;
    }

    if (surface === 'main-menu') {
      gameStore.returnToMainMenu();
      mainMenuView = 'home';
      return;
    }

    if (surface === 'singleplayer') {
      gameStore.returnToMainMenu();
      mainMenuView = 'singleplayer';
      return;
    }

    if (surface === 'opening') {
      mainMenuView = 'home';
      return;
    }

    gameStore.setCenterMode(getTutorialStepCenterMode(step));
    mainMenuView = 'home';
  }

  async function resumeTutorial(): Promise<void> {
    if (gameAssetProgress.active) {
      return;
    }
    await prepareGameAssets();
    gameStore.resumeTutorial();
    await tick();
    const step = $gameSessionStore.tutorialProgress?.step;
    if (step) {
      navigateToTutorialStepView(step);
    }
  }

  async function previousTutorialStep(): Promise<void> {
    const currentStep = $gameSessionStore.tutorialProgress?.step;
    gameStore.previousTutorialStep();
    await tick();
    const step = $gameSessionStore.tutorialProgress?.step;
    if (step) {
      navigateToTutorialStepView(step);
    }
  }

  async function startTutorial(): Promise<void> {
    if (gameAssetProgress.active) {
      return;
    }
    await prepareGameAssets();
    gameStore.startTutorial();
  }

  async function restartTutorial(): Promise<void> {
    if (gameAssetProgress.active) {
      return;
    }
    await prepareGameAssets();
    gameStore.restartTutorial();
  }

  function tutorialSceneLockActive(): boolean {
    return $gameSessionStore.activeSlotId === 'tutorial' && !!$gameSessionStore.tutorialProgress && !$gameSessionStore.tutorialProgress.completed;
  }

  function exitTutorial(): void {
    mainMenuView = 'home';
    tutorialScenePrompt = false;
    if (tutorialScenePromptTimer) {
      window.clearTimeout(tutorialScenePromptTimer);
      tutorialScenePromptTimer = null;
    }
    gameStore.exitTutorial();
  }

  function showTutorialScenePrompt(message = 'Follow the tutorial!'): void {
    tutorialScenePromptMessage = message;
    tutorialScenePrompt = true;
    if (tutorialScenePromptTimer) {
      window.clearTimeout(tutorialScenePromptTimer);
    }
    tutorialScenePromptTimer = window.setTimeout(() => {
      tutorialScenePrompt = false;
      tutorialScenePromptTimer = null;
    }, 1800);
  }

  function guardTutorialSceneChange(action: () => void): void {
    if (tutorialSceneLockActive()) {
      showTutorialScenePrompt();
      return;
    }
    action();
  }

  function tutorialCanUseAction(step: string): boolean {
    return $gameSessionStore.tutorialProgress?.step === step;
  }

  function guardTutorialStep(step: string, action: () => void): void {
    if (tutorialSceneLockActive() && !tutorialCanUseAction(step)) {
      showTutorialScenePrompt();
      return;
    }
    action();
  }

  function tutorialCanSwitchCenterMode(mode: 'rifts' | 'troops' | 'contest'): boolean {
    const step = $gameSessionStore.tutorialProgress?.step;
    return !!step && (getTutorialStepCenterMode(step) === mode || (step === 'essence' && mode === 'troops'));
  }

  function guardTutorialCenterMode(mode: 'rifts' | 'troops' | 'contest', action: () => void): void {
    if (tutorialSceneLockActive() && !tutorialCanSwitchCenterMode(mode)) {
      showTutorialScenePrompt();
      return;
    }
    action();
  }

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
      step: typeof diagnostic.step === 'number' ? diagnostic.step : $replayPlaybackStore.currentStep,
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
    archiveSession.select(importedSelectedReplayId);
  }

  function getRaceUnitPortrait(raceId: RaceId, unitClassId: UnitClassId): string {
    return portraits[`${raceId}/${unitClassId}`] ?? UNIT_SPRITE_URLS[unitClassId] ?? '';
  }

  function getRacePortrait(raceId: RaceId): string {
    return getRaceSpriteUrl(raceId);
  }

  function showTopbarTooltip(label: string, description: string): void {
    topbarTooltip = { label, description };
  }

  function clearTopbarTooltip(): void {
    topbarTooltip = null;
  }

  function previewDetail(detail: DetailCard): void {
    if (!planningInspection.preview(detail)) return;
    if (detail.kind === 'mutator') signalTutorial('mutator-hover');
    if (detail.detailKey.startsWith('enemy:')) signalTutorial('rift-enemy-hover');
  }

  function togglePinnedDetail(detail: DetailCard): void {
    planningInspection.togglePin(detail);
    if (detail.detailKey.startsWith('enemy:')) signalTutorial('rift-enemy-hover');
  }

  const clearDetail = planningInspection.clearPreview;

  function resetOverworldInspect(): void {
    planningInspection.reset();
    draftSession.resetSelections();
    assignmentInteraction.setConflict(null);
  }

  function resetZoneSelections(): void {
    selectedRiftId = null;
    selectedTroopId = null;
    selectedRaceId = null;
    archiveSession.select(null);
    assignmentInteraction.clearSuppression();
  }

  function resetZoneState(): void {
    openingUnlockScreen?.resetInspection();
    scheduledUnlockScreen?.resetInspection();
    resetOverworldInspect();
    replayViewer?.resetReplayInspect();
    resetZoneSelections();
    assignmentInteraction.reset();
  }

  function handleResize(): void {
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    updateAssignmentHintArrow(assignmentHintPair);
  }

  function loadingProgressPercent(progress: LoadingProgressState): number {
    if (progress.total <= 0) {
      return progress.active ? 8 : 100;
    }
    return Math.max(0, Math.min(100, Math.round((progress.completed / progress.total) * 100)));
  }

  async function prepareGameAssets(): Promise<void> {
    gameAssetProgress = { active: true, completed: 0, total: 1, label: 'Preparing game images' };
    const result = await preloadGameAssets((progress) => {
      gameAssetProgress = progress;
    });
    portraits = result.portraits;
    result.diagnostics.forEach(rememberRendererDiagnostic);
    gameAssetProgress = { active: false, completed: 1, total: 1, label: 'Game images ready' };
  }

  async function runAfterGameAssetPreload(action: () => void): Promise<void> {
    if (gameAssetProgress.active) {
      return;
    }
    await prepareGameAssets();
    action();
  }

  function openSlot(slot: SaveSlotSummary): void {
    if (tutorialSceneLockActive()) {
      showTutorialScenePrompt();
      return;
    }
    resetZoneState();
    void runAfterGameAssetPreload(() => {
      if (slot.status === 'occupied') {
        gameStore.loadSlot(slot.slotId);
        return;
      }
      gameStore.startNewCampaign(slot.slotId, 'campaign');
    });
  }

  function startSlot(slot: SaveSlotSummary, gameMode: GameMode): void {
    if (gameMode === 'contest' && $gameSessionStore.tutorialProgress?.step === 'start-contest') {
      resetZoneState();
      void runAfterGameAssetPreload(() => gameStore.startTutorialOpening());
      return;
    }
    if (tutorialSceneLockActive()) {
      showTutorialScenePrompt();
      return;
    }
    resetZoneState();
    void runAfterGameAssetPreload(() => gameStore.startNewCampaign(slot.slotId, gameMode));
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

  function cancelMultiplayerCycleEnd(): void {
    gameStore.cancelMultiplayerCycleEnd();
  }

  function leaveMultiplayerContest(): void {
    resetZoneState();
    mainMenuView = 'multiplayer';
    multiplayerCopyMessage = null;
    gameStore.leaveMultiplayerContest();
  }

  function getShareRoomLink(): string {
    if (typeof window === 'undefined' || !$gameSessionStore.multiplayer?.roomId) {
      return '';
    }
    const url = new URL(window.location.href);
    url.searchParams.set('room', $gameSessionStore.multiplayer.roomId);
    url.searchParams.set('server', inferShareableMultiplayerServerUrl($gameSessionStore.multiplayer.serverUrl, window.location.href));
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
      setMultiplayerCopyMessage(successMessage);
    } catch {
      setMultiplayerCopyMessage('Copy failed.');
    }
  }

  function setMultiplayerCopyMessage(message: string): void {
    multiplayerCopyMessage = message;
    if (multiplayerCopyMessageTimer) {
      window.clearTimeout(multiplayerCopyMessageTimer);
    }
    multiplayerCopyMessageTimer = window.setTimeout(() => {
      multiplayerCopyMessage = null;
      multiplayerCopyMessageTimer = null;
    }, 1800);
  }

  function copyRoomCode(): void {
    void copyTextToClipboard($gameSessionStore.multiplayer?.roomId ?? '', 'Room code copied.');
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
    if (tutorialSceneLockActive()) {
      if ($gameSessionStore.tutorialProgress?.step === 'game-start' && view === 'singleplayer') {
        mainMenuView = view;
        multiplayerCopyMessage = null;
        signalTutorial('singleplayer');
        return;
      }
      if (view !== mainMenuView) {
        showTutorialScenePrompt();
      }
      return;
    }
    mainMenuView = view;
    multiplayerCopyMessage = null;
  }

  function beginOpeningCampaign(): void {
    if (tutorialSceneLockActive() && $gameSessionStore.tutorialProgress?.step !== 'opening') {
      showTutorialScenePrompt();
      return;
    }
    resetZoneState();
    gameStore.startOpeningCampaign();
    signalTutorial('begin');
  }

  function claimOpeningPick(troopUnlockId: TroopUnlockId): void {
    gameStore.claimOpeningTroop(troopUnlockId);
    signalTutorial($gameSessionStore.game.troops.length === 2 ? 'opening-confirmed' : 'race-select');
  }

  function unclaimOpeningPick(troopUnlockId: TroopUnlockId): void {
    gameStore.unclaimOpeningTroop(troopUnlockId);
    signalTutorial('race-deselect');
  }

  function chooseRaceUnlock(raceId: RaceId): void {
    resetZoneState();
    gameStore.claimRaceUnlockOffer(raceId);
  }

  function chooseTroopClassUnlock(troopUnlockId: TroopUnlockId): void {
    resetZoneState();
    gameStore.claimTroopClassUnlockOffer(troopUnlockId);
  }

  async function handleEndCycle(): Promise<void> {
    if (mustSpendEssenceBeforeCycleEnd) {
      return;
    }
    if (mustAssignTroopsBeforeCycleEnd) {
      return;
    }
    if ($gameSessionStore.centerMode !== 'rifts') {
      gameStore.setCenterMode('rifts');
      await tick();
    }
    cycleResolvePending = true;
    cycleResolvePendingCycle = $gameSessionStore.game.cycleNumber;
    await tick();
    gameStore.endCycle($gameSessionStore.tutorialProgress?.step === 'end-cycle' || $gameSessionStore.cycleEndConfirmationPending);
    if (!$gameSessionStore.cycleAnimation && cycleResolvePendingCycle === $gameSessionStore.game.cycleNumber) {
      cycleResolvePending = false;
      cycleResolvePendingCycle = null;
    }
    signalTutorial('end-cycle');
  }

  function handleCycleActionEnter(): void {
    planningAttention.setCycleHovered(true);
  }

  function handleCycleActionLeave(): void {
    planningAttention.setCycleHovered(false);
    assignmentHintArrow = null;
  }

  function hashAssignmentHintSeed(seed: string): number {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    return hash;
  }

  function getAssignmentHintPair(): { troopId: TroopId; riftId: string } | null {
    const candidates = readyTroops
      .map((troop) => ({
        troop,
        rifts: discoveredRifts.filter((rift) => canAssignTroopToRift($gameSessionStore.game, troop.id, rift.id).ok),
      }))
      .filter((candidate) => candidate.rifts.length > 0);
    if (candidates.length === 0) {
      return null;
    }
    const pick = hashAssignmentHintSeed(`${$gameSessionStore.game.campaignSeed}:${$gameSessionStore.game.cycleNumber}`) % candidates.length;
    const candidate = candidates[pick];
    const nearestRift = candidate.rifts[candidate.rifts.length - 1];
    return { troopId: candidate.troop.id, riftId: nearestRift.id };
  }

  function updateAssignmentHintArrow(pair: { troopId: TroopId; riftId: string } | null): void {
    if (!pair || !$planningAttention.cycleHovered || !mustAssignTroopsBeforeCycleEnd) {
      assignmentHintArrow = null;
      return;
    }
    const troopEl = document.querySelector<HTMLElement>(`[data-assignment-hint-troop="${pair.troopId}"]`);
    const riftEl = document.querySelector<HTMLElement>(`[data-assignment-hint-rift="${pair.riftId}"]`);
    if (!troopEl || !riftEl) {
      assignmentHintArrow = null;
      return;
    }
    const troopRect = troopEl.getBoundingClientRect();
    const riftRect = riftEl.getBoundingClientRect();
    const x1 = troopRect.left + troopRect.width * 0.5;
    const y1 = troopRect.top + troopRect.height * 0.18;
    const x2 = riftRect.left + riftRect.width * 0.5;
    const y2 = riftRect.bottom - riftRect.height * 0.18;
    const curveLift = Math.max(90, Math.abs(y1 - y2) * 0.42);
    assignmentHintArrow = {
      x1,
      y1,
      cx1: x1,
      cy1: y1 - curveLift,
      cx2: x2,
      cy2: y2 + curveLift * 0.25,
      x2,
      y2,
    };
  }

  function canEditMultiplayerPlan(): boolean {
    return !multiplayerCycleEnded && !$gameSessionStore.cycleAnimation;
  }

  function multiplayerCycleEndLabel(): string {
    const playerId = $gameSessionStore.multiplayer?.playerId;
    if (!$gameSessionStore.multiplayer || !playerId) {
      return 'End Cycle';
    }
    if ($gameSessionStore.multiplayer.cycleEnded.playerOne && $gameSessionStore.multiplayer.cycleEnded.playerTwo) {
      return 'Resolving';
    }
    return $gameSessionStore.multiplayer.cycleEnded[playerId] ? `Waiting For ${getOpponentPlayerName()}` : 'End Cycle';
  }

  function playerConnectionLabel(playerId: ContestPlayerId): string {
    if (!$gameSessionStore.multiplayer?.connectedPlayers[playerId]) {
      return 'Offline';
    }
    return $gameSessionStore.multiplayer.cycleEnded[playerId] ? 'Cycle Ended' : 'Planning';
  }

  function setRiftCenterMode(): void {
    resetZoneState();
    gameStore.setCenterMode('rifts');
    signalTutorial('rifts-view');
  }

  function setTroopCenterMode(): void {
    resetZoneState();
    gameStore.setCenterMode('troops');
    signalTutorial('essence-view');
  }

  function focusEssenceDraft(): void {
    if ($gameSessionStore.centerMode !== 'rifts' && $gameSessionStore.centerMode !== 'troops') {
      gameStore.setCenterMode('troops');
    }
    signalTutorial('essence-view');
    planningAttention.pulseEssenceDraft();
  }

  function revealEssenceDraft(): void {
    if (multiplayerCycleEnded) {
      return;
    }
    gameStore.revealEssenceDraft();
    signalTutorial('reveal-draft');
  }

  function setContestCenterMode(): void {
    resetZoneState();
    gameStore.setCenterMode('contest');
    signalTutorial('rival-info');
  }

  function selectRace(raceId: RaceId): void {
    const nextRaceId = selectedRaceId === raceId ? null : raceId;
    resetOverworldInspect();
    selectedRiftId = null;
    selectedTroopId = null;
    archiveSession.select(null);
    selectedRaceId = nextRaceId;
    gameStore.setCenterMode('troops');
  }

  function handleRaceHeaderClick(raceId: RaceId, raceDetail: DetailCard): void {
    const wasSelected = selectedRaceId === raceId;
    selectRace(raceId);

    if (wasSelected) {
      planningInspection.clearDetails();
      return;
    }

    togglePinnedDetail(raceDetail);
  }

  function pinTroopDetail(troopId: TroopId, detail: DetailCard): void {
    selectedTroopId = selectedTroopId === troopId ? null : troopId;
    togglePinnedDetail(detail);
  }

  function isHoldingTroop(troopId: TroopId): boolean {
    return $gameSessionStore.game.gameMode === 'contest' &&
      $gameSessionStore.game.openRifts.some(
        (rift) =>
          (rift.controller === 'playerOne' || rift.controller === 'human') && (rift.occupyingTroopIds ?? []).includes(troopId),
      );
  }

  function getDropValidationMessage(troopId: TroopId, target: TroopDropTarget | null): string | null {
    if (!target || target.kind === 'ready') {
      return null;
    }
    const result = canAssignTroopToRift($gameSessionStore.game, troopId, target.riftId);
    return result.ok ? null : result.issues[0]?.message ?? 'This troop cannot be assigned here.';
  }

  function handleRiftTroopClick(troopId: TroopId, detail: DetailCard): void {
    if (assignmentInteraction.consumeClick(troopId)) return;

    archiveSession.select(null);
    pinTroopDetail(troopId, detail);
  }

  function handleRosterTroopClick(troopId: TroopId, detail: DetailCard): void {
    selectedRiftId = null;
    selectedRaceId = null;
    archiveSession.select(null);
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
      assignmentInteraction.setConflict(null);
      return;
    }

    if (dropTarget.riftId !== sourceRiftId) {
      const assignment = canAssignTroopToRift($gameSessionStore.game, troopId, dropTarget.riftId);
      if (!assignment.ok) {
        const issue = assignment.issues[0];
        assignmentInteraction.setConflict(issue
          ? {
              troopId: issue.troopId ?? troopId,
              ...(issue.conflictTroopId ? { conflictTroopId: issue.conflictTroopId } : {}),
              riftId: issue.riftId ?? dropTarget.riftId,
              message: issue.message,
            }
          : { troopId, riftId: dropTarget.riftId, message: 'This troop cannot be assigned here.' });
        return;
      }
      assignmentInteraction.setConflict(null);
      gameStore.assignTroopToRift(troopId, dropTarget.riftId);
      signalTutorial('assign-troop');
    }
  }

  function selectReplay(replayId: string): void {
    archiveSession.toggle(replayId);
    planningInspection.clearDetails();
    signalTutorial('archive-inspect');
  }

  function openSelectedReplay(replayId: string): void {
    if (tutorialSceneLockActive() && $gameSessionStore.tutorialProgress?.step !== 'watch-battle') {
      showTutorialScenePrompt();
      return;
    }
    resetZoneState();
    gameStore.openReplay(replayId);
    signalTutorial('watch-battle');
  }

  function openReplayFromArchive(replayId: string): void {
    guardTutorialStep('watch-battle', () => {
      gameStore.openReplay(replayId);
      signalTutorial('watch-battle');
    });
  }

  function openTutorialArchiveReplay(): void {
    const replayId = $archiveSession.selectedId ?? getTutorialReplayId();
    if (replayId) {
      openReplayFromArchive(replayId);
    }
  }

  async function closeReplayToArchive(): Promise<void> {
    const replayId = $replayPlaybackStore.loadedReplay?.id ?? null;
    gameStore.closeReplay();
    gameStore.setCenterMode('rifts');
    // The route change clears inspection before the archive selection is restored.
    await tick();
    if (replayId && $gameSessionStore.screen === 'overworld') {
      archiveSession.select(replayId);
    }
  }

  function isHumanParticipant(participant: { kind: BattleParticipantKind; playerId?: string }): boolean {
    return participant.playerId === 'playerOne' || participant.playerId === 'human' || (participant.kind === 'player' && !participant.playerId);
  }

  function participantHealthTone(participant: { kind: BattleParticipantKind; playerId?: string } | undefined, fallback: SideId): MiniReplayHealthTone {
    if (participant && isHumanParticipant(participant)) {
      return 'player';
    }
    if (participant?.kind === 'neutral' || (!participant && fallback === 'enemy')) {
      return 'neutral';
    }
    return 'opponent';
  }

  function getArchiveCardStyle(entry: { outcome: BattleOutcome; encounterLabel?: string; sideParticipants?: StoredReplayPayload['input']['sideParticipants'] }): string {
    const result = entry.outcome === 'victory' ? 'victory' : entry.outcome === 'defeat' ? 'defeat' : 'draw';
    if (entry.sideParticipants?.player.kind === 'opponent' && entry.sideParticipants.enemy.kind === 'player') {
      return `--archive-left-color: var(--archive-${result}); --archive-right-color: var(--archive-${result === 'victory' ? 'defeat' : result === 'defeat' ? 'victory' : 'draw'});`;
    }
    const foughtNeutral = entry.sideParticipants
      ? entry.sideParticipants.player.kind === 'neutral' || entry.sideParticipants.enemy.kind === 'neutral'
      : entry.encounterLabel?.includes('Neutral Guardians');
    const opponentBattle = isArchiveOpponentBattle(entry);
    const left = opponentBattle ? result : foughtNeutral ? 'neutral' : result;
    const right = foughtNeutral && !opponentBattle ? 'neutral' : result;
    return `--archive-left-color: var(--archive-${left}); --archive-right-color: var(--archive-${right});`;
  }

  function archiveEntryOpponentOutcome(entry: { sideParticipants?: StoredReplayPayload['input']['sideParticipants']; encounterLabel?: string }): boolean {
    if (!entry.sideParticipants) {
      return isArchiveOpponentBattle(entry);
    }
    return !isHumanParticipant(entry.sideParticipants.player) && !isHumanParticipant(entry.sideParticipants.enemy);
  }

  function finalReplayHealth(replay: BattleReplay, side: SideId): { current: number; max: number; percent: number } {
    const finalUnits = replay.steps[replay.steps.length - 1]?.snapshot.units ?? replay.initial.units;
    const sideUnits = finalUnits.filter((unit) => unit.side === side);
    const current = sideUnits.reduce((sum, unit) => sum + (unit.alive ? Math.max(0, unit.hp) : 0), 0);
    const max = sideUnits.reduce((sum, unit) => sum + unit.maxHp, 0);
    return { current, max, percent: healthPercent(current, max) };
  }

  function battleLogOrientation(participants?: StoredReplayPayload['input']['sideParticipants']): {
    leftSource: SideId;
    rightSource: SideId;
    leftTone: MiniReplayHealthTone;
    rightTone: MiniReplayHealthTone;
  } {
    const player = participants?.player ?? ARCHIVE_PARTICIPANT_FALLBACK.player;
    const enemy = participants?.enemy ?? ARCHIVE_PARTICIPANT_FALLBACK.enemy;
    const playerIsRight = isHumanParticipant(player) || enemy.kind === 'neutral';
    return {
      leftSource: playerIsRight ? 'enemy' : 'player',
      rightSource: playerIsRight ? 'player' : 'enemy',
      leftTone: participantHealthTone(playerIsRight ? enemy : player, playerIsRight ? 'enemy' : 'player'),
      rightTone: participantHealthTone(playerIsRight ? player : enemy, playerIsRight ? 'player' : 'enemy'),
    };
  }

  function archiveHealthPercentForSource(entry: ReplayIndexEntry, source: SideId): number {
    return source === 'player'
      ? healthPercent(entry.finalPlayerHp, entry.finalPlayerMaxHp, entry.finalPlayerAlive)
      : healthPercent(entry.finalEnemyHp, entry.finalEnemyMaxHp, entry.finalEnemyAlive);
  }

  function battleLogVisualFromArchiveEntry(entry: ReplayIndexEntry): BattleLogVisual {
    const orientation = battleLogOrientation(entry.sideParticipants);
    const opponentOutcome = archiveEntryOpponentOutcome(entry);
    return {
      key: entry.replayId,
      replay: null,
      outcome: entry.outcome,
      opponentOutcome,
      leftSource: orientation.leftSource,
      rightSource: orientation.rightSource,
      leftTone: orientation.leftTone,
      rightTone: orientation.rightTone,
      leftPercent: archiveHealthPercentForSource(entry, orientation.leftSource),
      rightPercent: archiveHealthPercentForSource(entry, orientation.rightSource),
      ariaLabel: opponentOutcome ? 'Opponent battle result' : `Battle ${entry.outcome}`,
      riftId: entry.riftId,
      riftVisualSource: getArchiveRiftVisual(entry),
    };
  }

  function battleLogVisualFromCycleRecord(record: CycleRecord): BattleLogVisual {
    const phase = buildRecordBattlePhase(record, 'phase-now', `${record.riftId}:incoming:${record.replay.id}`);
    const perspective = phaseResultSource(phase);
    const leftHealth = finalReplayHealth(record.replay, phase.leftSource);
    const rightHealth = finalReplayHealth(record.replay, phase.rightSource);
    return {
      key: record.replay.id,
      replay: record.replay,
      outcome: resultForBattleSource(record.outcome, perspective.source),
      opponentOutcome: perspective.opponentOutcome,
      leftSource: phase.leftSource,
      rightSource: phase.rightSource,
      leftTone: healthToneForAnimationSide(phase.left),
      rightTone: healthToneForAnimationSide(phase.right),
      leftPercent: leftHealth.percent,
      rightPercent: rightHealth.percent,
      ariaLabel: perspective.opponentOutcome ? 'Opponent battle result' : `Battle ${resultForBattleSource(record.outcome, perspective.source)}`,
      riftId: record.riftId,
      riftVisualSource: getArchiveRiftVisual({ riftId: record.riftId }),
    };
  }

  function incomingBattleLogVisuals(): BattleLogVisual[] {
    const records = $gameSessionStore.cycleAnimation?.resolution.records ?? [];
    return [...records].reverse().map(battleLogVisualFromCycleRecord);
  }

  function getIncomingBattleSourceElement(visual: BattleLogVisual): HTMLElement | null {
    if (typeof document === 'undefined' || !visual.riftId) {
      return null;
    }
    const riftRoot = Array.from(document.querySelectorAll<HTMLElement>('[data-rift-id]')).find((element) => element.dataset.riftId === visual.riftId);
    if (!riftRoot) {
      return null;
    }
    if (visual.replay) {
      const phaseSource = Array.from(riftRoot.querySelectorAll<HTMLElement>('[data-flight-replay-id]')).find(
        (element) => element.dataset.flightReplayId === visual.replay?.id,
      );
      if (phaseSource) {
        return phaseSource;
      }
    }
    return riftRoot.querySelector<HTMLElement>('.rift-battle-center');
  }

  function incomingBattleLogStyle(visual: BattleLogVisual, index: number, count: number): string {
    const delayMs = index * BATTLE_LOG_ARRIVAL_STAGGER_MS;
    const viewportWidth = typeof window === 'undefined' ? 480 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 360 : window.innerHeight;
    let fromX = viewportWidth / 2;
    let fromY = viewportHeight / 2;
    let toX = viewportWidth / 2;
    let toY = viewportHeight / 2;
    let targetWidth = 240;
    let targetHeight = BATTLE_LOG_ROW_HEIGHT_REM * 16;
    let sourceWidth = targetWidth;
    let sourceHeight = targetHeight;
    if (typeof document !== 'undefined') {
      const source = getIncomingBattleSourceElement(visual);
      const target = document.querySelector<HTMLElement>('[data-ui-name="Battle archive panel"] .archive-list');
      if (source && target) {
        const sourceRect = source.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const targetY = index * BATTLE_LOG_ROW_HEIGHT_REM * 16;
        targetWidth = targetRect.width;
        sourceWidth = sourceRect.width;
        sourceHeight = sourceRect.height;
        fromX = sourceRect.left;
        fromY = sourceRect.top;
        toX = targetRect.left;
        toY = targetRect.top + targetY;
      }
    }
    return `${getArchiveCardStyle(visual)} --arrival-delay:${delayMs}ms; --arrival-flight:${BATTLE_LOG_ARRIVAL_FLIGHT_MS}ms; --battle-log-row-height:${BATTLE_LOG_ROW_HEIGHT_REM}rem; --flight-from-x:${fromX}px; --flight-from-y:${fromY}px; --flight-to-x:${toX}px; --flight-to-y:${toY}px; --flight-from-width:${sourceWidth}px; --flight-from-height:${sourceHeight}px; --flight-to-width:${targetWidth}px; --flight-to-height:${targetHeight}px;`;
  }

  function getArchiveFightingPartyKind(entry: { encounterLabel?: string; sideParticipants?: StoredReplayPayload['input']['sideParticipants'] }): BattleParticipantKind {
    if (entry.sideParticipants?.enemy.kind === 'player') {
      return 'player';
    }
    return entry.sideParticipants?.player?.kind ?? (entry.encounterLabel?.includes(' vs Neutral Guardians') ? 'opponent' : 'player');
  }

  function isArchiveOpponentBattle(entry: { encounterLabel?: string; sideParticipants?: StoredReplayPayload['input']['sideParticipants'] }): boolean {
    return getArchiveFightingPartyKind(entry) === 'opponent';
  }

  function getArchiveRiftVisual(entry: { riftId?: string | null; tier?: number; mutatorIds?: string[] }): RiftInstance | null {
    const knownRift = $gameSessionStore.game.openRifts.find((rift) => rift.id === entry.riftId);
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
      state: 'expired',
    };
  }

  function previewArchiveRift(entry: { riftId?: string | null }): void {
    selectedRiftId = entry.riftId && discoveredRifts.some((rift) => rift.id === entry.riftId) ? entry.riftId : null;
  }

  function getLocalPlayerName(): string {
    const playerId = $gameSessionStore.multiplayer?.playerId;
    return playerId ? $gameSessionStore.multiplayer?.playerNames[playerId] ?? 'Player' : 'Player';
  }

  function getOpponentPlayerName(): string {
    const playerId = $gameSessionStore.multiplayer?.playerId;
    if (!$gameSessionStore.multiplayer || !playerId) {
      return 'Rival';
    }
    const opponentId = playerId === 'playerOne' ? 'playerTwo' : 'playerOne';
    return $gameSessionStore.multiplayer.playerNames[opponentId] ?? 'Rival';
  }

  function getCenterBoardLabel(): string {
    if ($gameSessionStore.centerMode === 'rifts') {
      return 'Rift board';
    }
    if ($gameSessionStore.centerMode === 'troops') {
      return 'Races and troops board';
    }
    return $gameSessionStore.multiplayer ? `${getOpponentPlayerName()} info board` : 'Rival info board';
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
    window.addEventListener('resize', handleResize);
    return () => {
      assignmentInteraction.dispose();
      cyclePresentation.dispose();
      planningAttention.dispose();
      if (multiplayerCopyMessageTimer) {
        window.clearTimeout(multiplayerCopyMessageTimer);
        multiplayerCopyMessageTimer = null;
      }
      window.removeEventListener('resize', handleResize);
    };
  });

  $: cyclePresentation.synchronize($gameSessionStore.cycleAnimation);
  $: planningAttention.synchronize([
    $gameSessionStore.activeSlotId ?? 'no-slot', $gameSessionStore.multiplayer?.roomId ?? 'local',
    $gameSessionStore.game.campaignSeed, $gameSessionStore.game.gameMode,
    $gameSessionStore.game.cycleNumber, $gameSessionStore.game.phase, $gameSessionStore.screen,
  ].join('|'));

  $: if ($gameSessionStore.tutorialProgress?.step === 'contest-results' && !$gameSessionStore.cycleAnimation && $gameSessionStore.game.replayIndex.length > 0) {
    signalTutorial('cycle-animation-finished');
  }

  $: uiDebugVisible = debugToolsEnabled && (showUiDebugNames || designModeEnabled);
  $: draftSession.synchronize($gameSessionStore.game, [
    $gameSessionStore.activeSlotId ?? 'multiplayer', $gameSessionStore.multiplayer?.roomId ?? 'local',
    $gameSessionStore.game.gameMode, $gameSessionStore.game.campaignSeed,
    $gameSessionStore.game.cycleNumber, $gameSessionStore.game.phase,
  ].join('|'), !!multiplayerCycleEnded);

  $: if ($gameSessionStore.cycleEndConfirmationPending && $gameSessionStore.centerMode !== 'rifts') {
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

  $: if ($gameSessionStore.centerMode === 'contest' && $gameSessionStore.game.gameMode !== 'contest') {
    gameStore.setCenterMode('rifts');
  }

  $: if ($gameSessionStore.screen === 'overworld' && $gameSessionStore.cycleAnimation && $gameSessionStore.centerMode !== 'rifts') {
    gameStore.setCenterMode('rifts');
  }

  $: if (
    $gameSessionStore.screen === 'overworld' &&
    $gameSessionStore.game.phase === 'planning' &&
    !multiplayerCycleEnded &&
    !essenceDraftActive &&
    !$draftSession.confirmedTroop &&
    !$draftSession.confirmedUpgrade &&
    essenceDraftCost !== null &&
    $gameSessionStore.game.essence >= essenceDraftCost
  ) {
    revealEssenceDraft();
  }

  $: multiplayerCycleEnded = (() => {
    const playerId = $gameSessionStore.multiplayer?.playerId;
    return !!playerId && !!$gameSessionStore.multiplayer?.cycleEnded[playerId];
  })();
  $: multiplayerStatus = (() => {
    if (!$gameSessionStore.multiplayer) {
      return null;
    }
    const room = $gameSessionStore.multiplayer.roomId ? `Room ${$gameSessionStore.multiplayer.roomId}` : 'Connecting';
    const player = getLocalPlayerName();
    const message = multiplayerCycleEnded ? `Waiting for ${getOpponentPlayerName()}.` : ($gameSessionStore.multiplayer.message ?? multiplayerCycleEndLabel());
    return `${room} - ${player} - ${message}`;
  })();

  $: discoveredRifts = $gameSessionStore.game.openRifts.filter((rift) => rift.state === 'discovered');
  $: raceRosterIds = RACE_IDS.filter((raceId) => $gameSessionStore.game.unlockedRaceIds.includes(raceId));
  $: {
    const inspectContextKey = [
      $gameSessionStore.activeSlotId ?? 'no-slot',
      $gameSessionStore.game.campaignSeed,
      $gameSessionStore.screen,
      $gameSessionStore.game.phase,
      $gameSessionStore.centerMode,
    ].join(':');
    if (inspectContextKey !== lastInspectContextKey) {
      lastInspectContextKey = inspectContextKey;
      resetZoneState();
    }
  }
  $: highlightedDetailKeys = $planningInspection.highlightedKeys;
  $: essenceDraftCost = getEssenceDraftCost($gameSessionStore.game);
  $: essenceDraftButtonLabel = essenceDraftCost === 1 ? 'Reveal One Unlock' : essenceDraftCost === 2 ? 'Reveal Unlock Draft' : 'Draft Unavailable';
  $: essenceDraftActive = !!($gameSessionStore.game.activeTroopOffer || $gameSessionStore.game.activeUpgradeOffer);
  $: if ($gameSessionStore.tutorialProgress?.step === 'reveal-draft' && essenceDraftActive) {
    signalTutorial('reveal-draft');
  }
  $: mustSpendEssenceBeforeCycleEnd =
    $gameSessionStore.game.phase === 'planning' &&
    (($gameSessionStore.game.essence > 0 && essenceDraftCost !== null) || !!$gameSessionStore.game.activeTroopOffer || !!$gameSessionStore.game.activeUpgradeOffer);
  $: assignmentBlockingIssues = validateAssignments($gameSessionStore.game).issues.filter((issue) => issue.kind !== 'holding_only_no_new_attack');
  $: mustAssignTroopsBeforeCycleEnd = $gameSessionStore.game.phase === 'planning' && !mustSpendEssenceBeforeCycleEnd && assignmentBlockingIssues.length > 0;
  $: cycleActionBlocked = mustSpendEssenceBeforeCycleEnd || mustAssignTroopsBeforeCycleEnd;
  $: cycleHoverEssenceAttention = $planningAttention.cycleHovered && mustSpendEssenceBeforeCycleEnd;
  $: cycleHoverAssignmentAttention = $planningAttention.cycleHovered && mustAssignTroopsBeforeCycleEnd;
  $: cycleActionTooltip = mustSpendEssenceBeforeCycleEnd
    ? $gameSessionStore.game.activeTroopOffer || $gameSessionStore.game.activeUpgradeOffer
      ? 'Finish the active Essence draft before ending the cycle.'
      : 'Spend your available Essence before ending the cycle.'
    : mustAssignTroopsBeforeCycleEnd
      ? 'Assign each ready troop to a valid Rift before ending the cycle.'
      : null;
  $: primaryCycleActionLabel =
    cycleResolvePending || $gameSessionStore.cycleAnimation
      ? 'Resolving...'
      : $gameSessionStore.multiplayer
        ? multiplayerCycleEndLabel()
        : 'End Cycle';
  $: assignmentHintPair = cycleHoverAssignmentAttention ? getAssignmentHintPair() : null;
  $: if (assignmentHintPair && cycleHoverAssignmentAttention) {
    tick().then(() => updateAssignmentHintArrow(assignmentHintPair));
  } else {
    assignmentHintArrow = null;
  }
  $: if (
    cycleResolvePending &&
    cycleResolvePendingCycle !== null &&
    !$gameSessionStore.cycleAnimation &&
    ($gameSessionStore.game.cycleNumber !== cycleResolvePendingCycle || $gameSessionStore.game.phase !== 'planning')
  ) {
    cycleResolvePending = false;
    cycleResolvePendingCycle = null;
  }
  $: riftsNeedAttention =
    $gameSessionStore.game.phase === 'planning' &&
    $gameSessionStore.centerMode !== 'rifts' &&
    discoveredRifts.length > 0 &&
    !mustSpendEssenceBeforeCycleEnd &&
    (!mustAssignTroopsBeforeCycleEnd || $planningAttention.cycleHovered);
  $: finalCycle = $gameSessionStore.game.gameMode === 'contest' ? CONTEST_FINAL_CYCLE : $gameSessionStore.game.gameMode === 'ladder' ? LADDER_FINAL_CYCLE : CAMPAIGN_FINAL_CYCLE;
  $: cycleProgressLabel = $gameSessionStore.game.cycleNumber > finalCycle ? `Postgame cycle ${$gameSessionStore.game.cycleNumber}` : `Cycle ${$gameSessionStore.game.cycleNumber} / ${finalCycle}`;
  $: archiveSession.synchronize($gameSessionStore.game.replayIndex, viewportHeight);
  $: systemMessageHasUnspentEssence = !!$gameSessionStore.systemMessage && $gameSessionStore.game.essence > 0 && /unspent Essence/i.test($gameSessionStore.systemMessage);

  $: if (selectedRiftId && !discoveredRifts.some((rift) => rift.id === selectedRiftId)) {
    selectedRiftId = null;
  }

  $: if (selectedTroopId && !$gameSessionStore.game.troops.some((troop) => troop.id === selectedTroopId)) {
    selectedTroopId = null;
  }

  $: if (selectedRaceId && !raceRosterIds.includes(selectedRaceId)) {
    selectedRaceId = null;
  }

  $: selectedTroop = selectedTroopId ? $gameSessionStore.game.troops.find((troop) => troop.id === selectedTroopId) ?? null : null;
  $: selectedTroopDefinition = selectedTroop ? getTroopEffectiveDefinition($gameSessionStore.game, selectedTroop.id) : null;
  $: readyTroops = $gameSessionStore.game.troops.filter((troop) => troop.recoveryCyclesRemaining === 0 && troop.assignmentRiftId === null);

  $: replay = $replayPlaybackStore.loadedReplay;
  $: if ($gameSessionStore.tutorialProgress?.step === 'play' && $replayPlaybackStore.rateMs !== 500) {
    gameStore.setRateMs(500);
  }
  $: if ($gameSessionStore.tutorialProgress?.step === 'timeline-event' && $replayPlaybackStore.autoPlay) {
    gameStore.setAutoPlay(false);
  }
  $: if (
    $gameSessionStore.tutorialProgress?.step === 'finish-replay' &&
    replay &&
    $replayPlaybackStore.currentStep >= replay.steps.length - 1
  ) {
    signalTutorial('replay-end');
  }
  $: if ($gameSessionStore.tutorialProgress?.step === 'game-start' && $gameSessionStore.screen === 'replay') {
    gameStore.returnToMainMenu();
    mainMenuView = 'home';
  }
</script>

<svelte:window on:keydown={handleUiDebugKeydown} on:keyup={handleUiDebugKeyup} on:blur={clearUiDebugNames} on:click|capture={handleDesignModeClick} />

{#if verificationLabMode}
  {#if abilityVerificationLabComponent}
    <svelte:component this={abilityVerificationLabComponent} />
  {/if}
{:else if $gameSessionStore.screen === 'main_menu'}
  <main class="menu-screen" class:ui-debug-visible={uiDebugVisible} class:design-mode-enabled={designModeEnabled}>
    <section class="menu-panel main-menu-shell ui-debug-target" data-ui-name="Main menu panel">
      <div class="menu-topline ui-debug-target" data-ui-name="Main menu header">
        <div class="menu-copy ui-debug-target" data-ui-name="Main menu intro">
          <h1>{mainMenuView === 'home' ? 'Shiftmake' : mainMenuView === 'singleplayer' ? 'Singleplayer' : mainMenuView === 'tutorial' ? 'Tutorial' : mainMenuView === 'multiplayer' ? 'Multiplayer' : mainMenuView === 'debug' ? 'Debug' : 'Settings'}</h1>
        </div>
      </div>

      {#if $gameSessionStore.systemMessage}
        <div class="menu-system-message panel ui-debug-target" data-ui-name="Main menu system message">
          <strong>System Notice</strong>
          <p>{$gameSessionStore.systemMessage}</p>
        </div>
      {/if}

      {#if mainMenuView === 'home'}
        <MainMenuNavigation
          onSelect={showMainMenuView}
          {debugToolsEnabled}
          tutorialLocked={tutorialSceneLockActive()}
          tutorialStep={$gameSessionStore.tutorialProgress?.step}
        />
      {:else if mainMenuView === 'singleplayer'}
        <SaveSlotMenu
          slots={$gameSessionStore.slots}
          onLoad={openSlot}
          onStart={startSlot}
          onBlocked={showTutorialScenePrompt}
          tutorialLocked={tutorialSceneLockActive()}
          tutorialStep={$gameSessionStore.tutorialProgress?.step}
        />
      {:else if mainMenuView === 'tutorial'}
        <section class="tutorial-menu panel ui-debug-target" data-ui-name="Tutorial menu">
          {#if gameStore.hasTutorialSave()}
            <p>The tutorial save can resume its guided steps or restart from the fixed tutorial state.</p>
            <div class="actions-grid">
              <button class="primary" on:click={resumeTutorial}>Resume Tutorial</button>
              <button on:click={restartTutorial}>Restart Tutorial</button>
            </div>
          {:else}
            <p>Shiftmake is a strategy game about building a mixed-race army and sending it through Rifts — portals to contested worlds. Each cycle, you inspect open Rifts, assign available troops, and end the cycle to resolve all battles automatically.</p>
            <p>Skill lives in preparation, not in the fight itself. Rifts are fully previewable before you commit: you can see the enemy composition, modifiers that change battle rules, and the reward tier. Battles play out on their own, but you can replay each one in full detail afterward.</p>
            <p>A run lasts 10 cycles. You score Victory Points by winning Rifts, spend Essence to draft new troops and upgrades, and gradually expand your roster by unlocking new races. The tutorial walks through these mechanics using a fixed Contest vs AI run.</p>
            <button class="primary" on:click={startTutorial}>Start Tutorial</button>
          {/if}
        </section>
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
              <button class="ui-debug-target" data-ui-name="Join multiplayer Contest room" on:click={joinMultiplayerContest} disabled={!multiplayerRoomCode.trim()}>Join / Rejoin Room</button>
            </div>
          </div>
        </section>
      {:else if mainMenuView === 'debug'}
        <section class="debug-menu-panel panel">
          {#if debugToolsEnabled}
            <DebugToolsMenu
              selectedTroopId={selectedTroopId}
              selectedReplayId={$archiveSession.selectedId}
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
        <button class="menu-back-button" class:tutorial-scene-locked={tutorialSceneLockActive()} aria-label="Back to main menu" on:click={() => showMainMenuView('home')}>←</button>
      {/if}
    </section>
  </main>
{:else if $gameSessionStore.screen === 'overworld' && $gameSessionStore.game.phase === 'opening_unlock'}
  <div class="overworld-surface" class:ui-debug-visible={uiDebugVisible} class:design-mode-enabled={designModeEnabled}>
    <OpeningUnlockScreen bind:this={openingUnlockScreen} game={$gameSessionStore.game} {getRacePortrait} {getRaceUnitPortrait}
      actions={{ label: $gameSessionStore.multiplayer ? multiplayerCycleEndLabel() : `Begin ${gameModeLabel($gameSessionStore.game.gameMode)}`,
        disabled: multiplayerCycleEnded, tutorialLocked: tutorialSceneLockActive() && $gameSessionStore.tutorialProgress?.step !== 'opening',
        begin: beginOpeningCampaign, claim: claimOpeningPick, unclaim: unclaimOpeningPick }}>
      <svelte:fragment slot="session">
      {#if multiplayerStatus}
        <div class="draft-screen-header opening-session-header">
          <p class="multiplayer-status-line ui-debug-target" data-ui-name="Multiplayer opening status">{multiplayerStatus}</p>
          <div class="multiplayer-room-tools ui-debug-target" data-ui-name="Multiplayer opening room tools">
            <div class="multiplayer-room-card">
              <span>Room</span>
              <strong>{$gameSessionStore.multiplayer?.roomId ?? '...'}</strong>
              <button type="button" class="link-icon-button" on:click={copyRoomLink} disabled={!$gameSessionStore.multiplayer?.roomId} aria-label="Copy room link" title="Copy room link">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a3 3 0 0 1 4.2 4.2l-3.4 3.4a3 3 0 0 1-4.2 0 1 1 0 0 1 1.4-1.4 1 1 0 0 0 1.4 0l3.4-3.4a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0Z" /><path d="M3.8 20.2a3 3 0 0 1 0-4.2l3.4-3.4a3 3 0 0 1 4.2 0 1 1 0 0 1-1.4 1.4 1 1 0 0 0-1.4 0l-3.4 3.4a1 1 0 1 0 1.4 1.4l3.4-3.4a1 1 0 0 1 1.4 1.4L8 20.2a3 3 0 0 1-4.2 0Z" /></svg>
              </button>
            </div>
            <div class="multiplayer-player-list">
              <span>Current Players</span>
              <strong>{getLocalPlayerName()} - {playerConnectionLabel($gameSessionStore.multiplayer?.playerId ?? 'playerOne')}</strong>
              <strong>{getOpponentPlayerName()} - {playerConnectionLabel($gameSessionStore.multiplayer?.playerId === 'playerOne' ? 'playerTwo' : 'playerOne')}</strong>
            </div>
          </div>
          <div class="multiplayer-session-actions ui-debug-target" data-ui-name="Multiplayer opening actions">
            {#if !$gameSessionStore.multiplayer?.connected}
              <button type="button" class="primary" on:click={reconnectMultiplayerContest}>Reconnect</button>
            {/if}
            {#if multiplayerCycleEnded}
              <button type="button" on:click={cancelMultiplayerCycleEnd}>Cancel Cycle End</button>
            {/if}
            <button type="button" on:click={leaveMultiplayerContest}>Leave Room</button>
            {#if multiplayerCopyMessage}
              <span class="multiplayer-copy-indicator" role="status">{multiplayerCopyMessage}</span>
            {/if}
          </div>
        </div>
      {/if}
      </svelte:fragment>
    </OpeningUnlockScreen>
  </div>
{:else if $gameSessionStore.screen === 'overworld' && (($gameSessionStore.game.phase === 'race_unlock' && $gameSessionStore.game.activeRaceUnlockOffer) || ($gameSessionStore.game.phase === 'troop_class_unlock' && $gameSessionStore.game.activeTroopClassUnlockOffer))}
  <div class="overworld-surface" class:ui-debug-visible={uiDebugVisible} class:design-mode-enabled={designModeEnabled}>
    <ScheduledUnlockScreen bind:this={scheduledUnlockScreen} game={$gameSessionStore.game} {getRacePortrait} {getRaceUnitPortrait}
      actions={{ disabled: multiplayerCycleEnded, waitingLabel: $gameSessionStore.multiplayer && multiplayerCycleEnded ? multiplayerCycleEndLabel() : null,
        claimRace: chooseRaceUnlock, claimTroop: chooseTroopClassUnlock }}>
      <svelte:fragment slot="session">
        {#if multiplayerStatus}
          <p class="multiplayer-status-line ui-debug-target" data-ui-name={`Multiplayer ${$gameSessionStore.game.phase === 'race_unlock' ? 'race unlock' : 'troop unlock'} status`}>{multiplayerStatus}</p>
          <div class="multiplayer-room-tools ui-debug-target" data-ui-name={`Multiplayer ${$gameSessionStore.game.phase === 'race_unlock' ? 'race unlock' : 'troop unlock'} room tools`}>
            <div class="multiplayer-room-card">
              <span>Room</span>
              <strong>{$gameSessionStore.multiplayer?.roomId ?? '...'}</strong>
              <button type="button" class="link-icon-button" on:click={copyRoomLink} disabled={!$gameSessionStore.multiplayer?.roomId} aria-label="Copy room link" title="Copy room link">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a3 3 0 0 1 4.2 4.2l-3.4 3.4a3 3 0 0 1-4.2 0 1 1 0 0 1 1.4-1.4 1 1 0 0 0 1.4 0l3.4-3.4a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0Z" /><path d="M3.8 20.2a3 3 0 0 1 0-4.2l3.4-3.4a3 3 0 0 1 4.2 0 1 1 0 0 1-1.4 1.4 1 1 0 0 0-1.4 0l-3.4 3.4a1 1 0 1 0 1.4 1.4l3.4-3.4a1 1 0 0 1 1.4 1.4L8 20.2a3 3 0 0 1-4.2 0Z" /></svg>
              </button>
            </div>
            <div class="multiplayer-player-list">
              <span>Current Players</span>
              <strong>{getLocalPlayerName()} - {playerConnectionLabel($gameSessionStore.multiplayer?.playerId ?? 'playerOne')}</strong>
              <strong>{getOpponentPlayerName()} - {playerConnectionLabel($gameSessionStore.multiplayer?.playerId === 'playerOne' ? 'playerTwo' : 'playerOne')}</strong>
            </div>
          </div>
          <div class="multiplayer-session-actions ui-debug-target" data-ui-name={`Multiplayer ${$gameSessionStore.game.phase === 'race_unlock' ? 'race unlock' : 'troop unlock'} actions`}>
            {#if !$gameSessionStore.multiplayer?.connected}
              <button type="button" class="primary" on:click={reconnectMultiplayerContest}>Reconnect</button>
            {/if}
            {#if multiplayerCycleEnded}
              <button type="button" on:click={cancelMultiplayerCycleEnd}>Cancel Cycle End</button>
            {/if}
            <button type="button" on:click={leaveMultiplayerContest}>Leave Room</button>
            {#if multiplayerCopyMessage}
              <span class="multiplayer-copy-indicator" role="status">{multiplayerCopyMessage}</span>
            {/if}
          </div>
        {/if}
      </svelte:fragment>
    </ScheduledUnlockScreen>
  </div>
{:else if $gameSessionStore.screen === 'overworld'}
  <main
    class="shell overworld-shell"
    class:rifts-mode={$gameSessionStore.centerMode === 'rifts'}
    class:troops-mode={$gameSessionStore.centerMode === 'troops'}
    class:contest-info-mode={$gameSessionStore.centerMode === 'contest'}
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
        {#if $gameSessionStore.game.gameMode === 'contest'}
          <div
            class="contest-score topbar-info-button ui-debug-target info-target"
            data-ui-name="Contest score counter"
          >
            <span>Contest VP</span>
            <strong>{$gameSessionStore.game.victoryPoints} - {$gameSessionStore.game.contest?.players.playerTwo.victoryPoints ?? 0}</strong>
          </div>
          {#if $gameSessionStore.multiplayer}
            <div class="contest-score multiplayer-room-status ui-debug-target" data-ui-name="Multiplayer room status">
              <span>Room {$gameSessionStore.multiplayer.roomId ?? '...'}</span>
              <strong>{$gameSessionStore.multiplayer.connected ? multiplayerCycleEndLabel() : 'Offline'}</strong>
            </div>
          {/if}
        {:else}
          <div
            class="topbar-info-button ui-debug-target info-target"
            data-ui-name="Victory points counter"
          ><span>Victory Points</span><strong>{$gameSessionStore.game.victoryPoints}</strong></div>
        {/if}
      </div>
      {#if topbarTooltip}
        <div class="topbar-tooltip" role="tooltip">
          <strong>{topbarTooltip.label}</strong>
          <span>{topbarTooltip.description}</span>
        </div>
      {/if}

      <div class="mode-toggle ui-debug-target" data-ui-name="Top bar actions">
        <button
          class="ui-debug-target secondary-mode-button"
          class:tutorial-scene-locked={tutorialSceneLockActive() && $gameSessionStore.centerMode !== 'rifts' && !tutorialCanSwitchCenterMode('rifts')}
          data-ui-name="Show rifts view"
          class:selected={$gameSessionStore.centerMode === 'rifts'}
          class:rifts-attention={riftsNeedAttention}
          data-tutorial-target="rifts-view-button"
          on:click={() => ($gameSessionStore.centerMode === 'rifts' ? setRiftCenterMode() : guardTutorialCenterMode('rifts', setRiftCenterMode))}
        >Rifts</button>
        <button
          class="ui-debug-target secondary-mode-button"
          class:tutorial-scene-locked={tutorialSceneLockActive() && $gameSessionStore.centerMode !== 'troops' && !tutorialCanSwitchCenterMode('troops')}
          data-ui-name="Show races and troops view"
          class:selected={$gameSessionStore.centerMode === 'troops'}
          data-tutorial-target="troops-view-button"
          on:click={() => ($gameSessionStore.centerMode === 'troops' ? setTroopCenterMode() : guardTutorialCenterMode('troops', setTroopCenterMode))}
        >Races & Troops</button>
        {#if $gameSessionStore.game.gameMode === 'contest'}
          <button
            class="ui-debug-target secondary-mode-button"
            class:tutorial-scene-locked={tutorialSceneLockActive() && $gameSessionStore.centerMode !== 'contest' && !tutorialCanSwitchCenterMode('contest')}
            data-ui-name="Show opponent info view"
            class:selected={$gameSessionStore.centerMode === 'contest'}
            data-tutorial-target="rival-info-button"
            on:click={() => ($gameSessionStore.centerMode === 'contest' ? setContestCenterMode() : guardTutorialCenterMode('contest', setContestCenterMode))}
          >
            {$gameSessionStore.multiplayer ? `${getOpponentPlayerName()} Info` : 'Rival Info'}
          </button>
        {/if}
        <button
          class="ui-debug-target menu-icon-button"
          class:tutorial-scene-locked={tutorialSceneLockActive()}
          data-ui-name="Return to main menu"
          aria-label="Main menu"
          title="Main menu"
          on:click={() => guardTutorialSceneChange(returnToMainMenu)}
        ><span aria-hidden="true"></span></button>
        {#if $gameSessionStore.multiplayer}
          <div class="topbar-room-card ui-debug-target" data-ui-name="Multiplayer room link">
            <span>{$gameSessionStore.multiplayer.roomId ?? '...'}</span>
            <button type="button" class="link-icon-button" on:click={copyRoomLink} disabled={!$gameSessionStore.multiplayer.roomId} aria-label="Copy room link" title="Copy room link">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a3 3 0 0 1 4.2 4.2l-3.4 3.4a3 3 0 0 1-4.2 0 1 1 0 0 1 1.4-1.4 1 1 0 0 0 1.4 0l3.4-3.4a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0Z" /><path d="M3.8 20.2a3 3 0 0 1 0-4.2l3.4-3.4a3 3 0 0 1 4.2 0 1 1 0 0 1-1.4 1.4 1 1 0 0 0-1.4 0l-3.4 3.4a1 1 0 1 0 1.4 1.4l3.4-3.4a1 1 0 0 1 1.4 1.4L8 20.2a3 3 0 0 1-4.2 0Z" /></svg>
            </button>
          </div>
          {#if !$gameSessionStore.multiplayer.connected}
            <button class="primary ui-debug-target" data-ui-name="Reconnect multiplayer room" on:click={reconnectMultiplayerContest}>Reconnect</button>
          {/if}
          {#if multiplayerCycleEnded}
            <button class="ui-debug-target" data-ui-name="Cancel multiplayer cycle end" on:click={cancelMultiplayerCycleEnd}>Cancel Cycle End</button>
          {/if}
          <button class="ui-debug-target" data-ui-name="Leave multiplayer room" on:click={leaveMultiplayerContest}>Leave Room</button>
          {#if multiplayerCopyMessage}
            <span class="multiplayer-copy-indicator topbar-copy-indicator" role="status">{multiplayerCopyMessage}</span>
          {/if}
        {/if}
        <DebugToolsMenu
          mode="campaign-button"
          selectedTroopId={selectedTroopId}
          selectedReplayId={$archiveSession.selectedId}
          selectedRiftId={selectedRiftId}
          rendererDiagnostics={rendererDiagnostics}
        />
      </div>
    </header>

    <section class="left-column ui-debug-target" data-ui-name="Left sidebar">
      <PlanningInspector inspection={planningInspection} centerMode={$gameSessionStore.centerMode}
        {selectedTroop} {selectedTroopDefinition} {getRaceUnitPortrait} {previewDetail} {togglePinnedDetail} />

    </section>

    <section class="center-column ui-debug-target" data-ui-name={getCenterBoardLabel()}>
      {#if $gameSessionStore.centerMode === 'rifts'}
        <RiftBoard game={$gameSessionStore.game} records={$gameSessionStore.cycleAnimation?.resolution.records ?? []}
          resolving={!!$gameSessionStore.cycleAnimation} interaction={assignmentInteraction}
          planning={{ editable: canEditMultiplayerPlan(), submitted: multiplayerCycleEnded, selectedRiftId, selectedTroopId,
            hintRiftId: assignmentHintPair?.riftId ?? null, upgradeId: $draftSession.hoveredUpgrade ?? $draftSession.selectedUpgrade,
            holdingTroopIds: new Set($gameSessionStore.game.troops.filter(troop => isHoldingTroop(troop.id)).map(troop => troop.id)),
            selectTroop: handleRiftTroopClick }}
          inspection={{ preview: previewDetail, clear: clearDetail, pin: togglePinnedDetail, highlightedKeys: highlightedDetailKeys }}
          opponentName={getOpponentPlayerName()} {portraits} {getRaceUnitPortrait} />
      {:else if $gameSessionStore.centerMode === 'troops'}
        <TroopRosterBoard game={$gameSessionStore.game} {selectedRaceId} {selectedTroopId}
          inspection={{ preview: previewDetail, clear: clearDetail, pin: togglePinnedDetail, highlightedKeys: highlightedDetailKeys }}
          {getRacePortrait} {getRaceUnitPortrait} selectRace={handleRaceHeaderClick} selectTroop={handleRosterTroopClick} />
      {:else}
        <RivalInfoBoard game={$gameSessionStore.game} {getRacePortrait} {getRaceUnitPortrait}
          inspection={{ preview: previewDetail, clear: clearDetail, pin: togglePinnedDetail, highlightedKeys: highlightedDetailKeys }} />
      {/if}
    </section>

    <section class="right-column ui-debug-target" data-ui-name="Right sidebar">

      <ArchivePanel game={$gameSessionStore.game} session={archiveSession} visible={$gameSessionStore.centerMode === 'rifts'}
        arrivalActive={$cyclePresentation.arrivalActive}
        replays={{ has: gameStore.hasReplay, payload: gameStore.getReplayPayload, replay: gameStore.getReplay }}
        presentation={{ visual: battleLogVisualFromArchiveEntry, style: getArchiveCardStyle, opponent: isArchiveOpponentBattle }}
        inspection={{ preview: previewDetail, clear: clearDetail, pin: togglePinnedDetail, highlightedKeys: highlightedDetailKeys }}
        select={selectReplay} open={openReplayFromArchive} openSelected={openSelectedReplay}
        previewRift={previewArchiveRift} {getRaceUnitPortrait}>
        <svelte:fragment slot="incoming">
              {#if $cyclePresentation.arrivalActive && $cyclePresentation.arrivalReady}
                {@const incomingVisuals = incomingBattleLogVisuals()}
                {#each incomingVisuals as visual, index (visual.key)}
                  {@const incomingRiftVisual = visual.riftVisualSource ? getRiftVisual(visual.riftVisualSource) : null}
                  <div
                    class="archive-card-row incoming-archive-card-row"
                    style={incomingBattleLogStyle(visual, index, incomingVisuals.length)}
                    aria-hidden="true"
                  >
                    <div class="incoming-archive-card">
                      {#if visual.replay}
                        <div class="incoming-flight-mini">
                          <RiftBattleMiniReplay
                            replay={visual.replay}
                            leftSource={visual.leftSource}
                            rightSource={visual.rightSource}
                            leftHealthTone={visual.leftTone}
                            rightHealthTone={visual.rightTone}
                            result={visual.outcome}
                            opponentOutcome={visual.opponentOutcome}
                            startFinished={true}
                            {portraits}
                          />
                        </div>
                      {/if}
                      <div class="archive-card incoming-flight-archive">
                        {#if incomingRiftVisual}
                          <span class="archive-rift-thumbnail" style={`--rift-tint:${incomingRiftVisual.tint}; --rift-glow:${incomingRiftVisual.glow}; --rift-rotation:${incomingRiftVisual.rotationDeg}deg;`}>
                            <img src={incomingRiftVisual.imageUrl} alt="" aria-hidden="true" style={`filter:${incomingRiftVisual.filter};`} />
                          </span>
                        {/if}
                        <BattleLogResultToken
                          outcome={visual.outcome}
                          opponentOutcome={visual.opponentOutcome}
                          leftPercent={visual.leftPercent}
                          rightPercent={visual.rightPercent}
                          leftTone={visual.leftTone}
                          rightTone={visual.rightTone}
                        />
                      </div>
                    </div>
                  </div>
                {/each}
              {/if}

        </svelte:fragment>
      </ArchivePanel>
    </section>

    <PlanningActionRail empty={$gameSessionStore.centerMode === 'contest' && !$gameSessionStore.systemMessage && $gameSessionStore.game.phase !== 'planning'}
      cycle={{ visible: $gameSessionStore.game.phase === 'planning', label: primaryCycleActionLabel, blocked: cycleActionBlocked,
        disabled: multiplayerCycleEnded || !!$gameSessionStore.cycleAnimation || cycleResolvePending, tooltip: cycleActionTooltip,
        hovered: $planningAttention.cycleHovered, enter: handleCycleActionEnter, leave: handleCycleActionLeave, submit: handleEndCycle }}
      notice={{ message: $gameSessionStore.systemMessage, unspentEssence: systemMessageHasUnspentEssence,
        dismiss: gameStore.clearSystemMessage, focusEssence: focusEssenceDraft }}>
      <svelte:fragment slot="draft">
        {#if $gameSessionStore.game.phase === 'planning' && ($gameSessionStore.centerMode === 'troops' || $gameSessionStore.centerMode === 'rifts') && (mustSpendEssenceBeforeCycleEnd || $draftSession.confirmedTroop || $draftSession.confirmedUpgrade)}
          <EssenceDraftPanel game={$gameSessionStore.game} session={draftSession}
            disabled={multiplayerCycleEnded} highlighted={$planningAttention.essenceDraft || cycleHoverEssenceAttention}
            cost={essenceDraftCost} revealLabel={essenceDraftButtonLabel} reveal={revealEssenceDraft}
            {getRaceUnitPortrait} {previewDetail} {clearDetail} />
        {/if}
      </svelte:fragment>
      <svelte:fragment slot="ready">
        {#if $gameSessionStore.centerMode === 'rifts'}
          <ReadyTroopsPanel game={$gameSessionStore.game} interaction={assignmentInteraction} {getRaceUnitPortrait}
            planning={{ editable: canEditMultiplayerPlan(), submitted: multiplayerCycleEnded, selectedTroopId,
              hintTroopId: assignmentHintPair?.troopId ?? null, attention: cycleHoverAssignmentAttention,
              upgradeId: $draftSession.hoveredUpgrade ?? $draftSession.selectedUpgrade, selectTroop: handleRiftTroopClick }}
            inspection={{ preview: previewDetail, clear: clearDetail, highlightedKeys: highlightedDetailKeys }} />
        {/if}
      </svelte:fragment>
      <svelte:fragment slot="tutorial">
        {#if $gameSessionStore.tutorialProgress?.step === 'watch-battle' && ($archiveSession.selectedId ?? getTutorialReplayId())}
          {@const tutorialArchiveReplayId = $archiveSession.selectedId ?? getTutorialReplayId()}
          {@const tutorialArchiveEntry = tutorialArchiveReplayId ? $gameSessionStore.game.replayIndex.find((entry) => entry.replayId === tutorialArchiveReplayId) : null}
          {@const tutorialArchiveAvailable = !!tutorialArchiveReplayId && !!tutorialArchiveEntry && !tutorialArchiveEntry.summaryOnly && gameStore.hasReplay(tutorialArchiveReplayId)}
          <div class="archive-actions-stack tutorial-archive-actions ui-debug-target" data-ui-name="Tutorial archive actions">
            <button
              type="button"
              class="primary large tutorial-watch-battle-button"
              aria-label={tutorialArchiveAvailable ? 'Watch Battle' : 'Replay unavailable'}
              title={tutorialArchiveAvailable ? 'Watch Battle' : 'Replay unavailable'}
              disabled={!tutorialArchiveAvailable}
              on:click={openTutorialArchiveReplay}
            >
              Watch Battle
            </button>
          </div>
        {/if}
      </svelte:fragment>
    </PlanningActionRail>

    {#if assignmentHintArrow}
      <svg class="assignment-hint-arrow" viewBox={`0 0 ${viewportWidth} ${viewportHeight}`} aria-hidden="true">
        <defs>
          <marker id="assignment-hint-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z"></path>
          </marker>
        </defs>
        <path d={`M ${assignmentHintArrow.x1} ${assignmentHintArrow.y1} C ${assignmentHintArrow.cx1} ${assignmentHintArrow.cy1}, ${assignmentHintArrow.cx2} ${assignmentHintArrow.cy2}, ${assignmentHintArrow.x2} ${assignmentHintArrow.y2}`} />
      </svg>
    {/if}

    {#if $assignmentInteraction.drag?.active}
      <div class="troop-drag-ghost" style={`left:${$assignmentInteraction.drag.x}px; top:${$assignmentInteraction.drag.y}px;`} aria-hidden="true">
        <img class="unit-tile-art" src={$assignmentInteraction.drag.portraitUrl} alt="" />
      </div>
    {/if}

    {#if $gameSessionStore.game.phase === 'game_over'}
      <GameOverDialog victoryPoints={$gameSessionStore.game.victoryPoints}
        onContinue={() => gameStore.continuePlaying()} onReturnToMenu={returnToMainMenu} />
    {/if}
  </main>
{:else}
  <div class="replay-surface" class:ui-debug-visible={uiDebugVisible} class:design-mode-enabled={designModeEnabled}>
    <ReplayViewer bind:this={replayViewer} {getRaceUnitPortrait} {debugToolsEnabled} {rendererDiagnostics}
      onDiagnostic={rememberRendererDiagnostic} onExit={() => guardTutorialSceneChange(closeReplayToArchive)}
      tutorial={{ view: $gameSessionStore.tutorialProgress ? tutorialReplayView : null, locked: tutorialSceneLockActive(), signal: signalTutorial, prompt: showTutorialScenePrompt }} />
  </div>


{/if}

{#if !verificationLabMode && gameAssetProgress.active}
  <div class="loading-screen game-loading-screen" role="status" aria-live="polite">
    <div class="loading-panel">
      <p class="eyebrow">Shiftmake</p>
      <h2>Loading Game</h2>
      <div class="loading-progress-track" aria-label="Game image loading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={loadingProgressPercent(gameAssetProgress)} role="progressbar">
        <span style={`width:${loadingProgressPercent(gameAssetProgress)}%`}></span>
      </div>
      <p>{gameAssetProgress.label}</p>
    </div>
  </div>
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

{#if
  $gameSessionStore.tutorialProgress &&
  $gameSessionStore.activeSlotId === 'tutorial' &&
  ($gameSessionStore.screen !== 'main_menu' || $gameSessionStore.tutorialProgress.step === 'game-start' || $gameSessionStore.tutorialProgress.step === 'start-contest')
}
  <button class="exit-tutorial-button" type="button" on:click={exitTutorial}>Exit Tutorial</button>
  <TutorialPopup
    progress={$gameSessionStore.tutorialProgress}
    onBack={previousTutorialStep}
    onContinue={() => gameStore.continueTutorial()}
    onFinish={exitTutorial}
  />
{/if}
{#if tutorialScenePrompt}
  <div class="tutorial-scene-prompt" role="status">{tutorialScenePromptMessage}</div>
{/if}

<style>
.replay-surface,
.overworld-surface { display: contents; }
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
button:not(:disabled):active {
    transform: translateY(1px) scale(0.985);
    filter: brightness(0.9);
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
.shell {
    min-height: 100vh;
    width: min(calc(var(--ui-shell-max-width) + (2 * var(--ui-shell-column)) + (2 * var(--ui-space-md))), 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: var(--ui-shell-column) minmax(0, 1fr) var(--ui-shell-column);
    grid-template-rows: auto 1fr auto;
    gap: var(--ui-space-md);
    padding: var(--ui-space-md);
  }
.overworld-shell {
    height: 100dvh;
    overflow: hidden;
  }
.overworld-shell {
    width: min(1700px, 100%);
    grid-template-columns: minmax(250px, 282px) minmax(760px, 1fr) minmax(260px, 320px);
    gap: 0.75rem;
    padding-block: 0.75rem;
  }
.overworld-shell.rifts-mode {
    grid-template-rows: auto minmax(0, 1fr) auto;
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
    container-type: inline-size;
  }
.resource-strip > div,
.resource-strip > button {
    display: grid;
    gap: 0.15rem;
    padding: var(--ui-space-sm);
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-soft);
  }
.resource-strip > div,
.resource-strip > button {
    min-width: min(6.2rem, 100%);
    justify-items: center;
    text-align: center;
    overflow: hidden;
    white-space: nowrap;
  }
.topbar-info-button {
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: default;
  }
button.topbar-info-button {
    cursor: help;
  }
button.topbar-info-button:hover,
button.topbar-info-button:focus-visible {
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
.resource-strip span {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }
.resource-strip strong {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-width: 0;
    white-space: nowrap;
  }
@container (max-width: 520px) {.resource-strip {
      gap: 0.28rem;
    }
.resource-strip > div,
.resource-strip > button {
      padding-inline: 0.45rem;
    }
.resource-strip strong {
      gap: 0.18rem;
      font-size: clamp(0.68rem, 16cqw, 0.95rem);
    }}
.contest-score strong {
    color: #f2d080;
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
.archive-card {
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
.mode-toggle button.secondary-mode-button {
    border-color: rgba(126, 157, 181, 0.16);
    background: rgba(17, 26, 36, 0.58);
    color: #b6c6d4;
  }
.mode-toggle button.secondary-mode-button.selected {
    border-color: rgba(134, 188, 218, 0.42);
    background: rgba(41, 62, 72, 0.86);
    color: #edf7fb;
  }
.mode-toggle button.menu-icon-button {
    display: inline-grid;
    place-items: center;
    width: 2.45rem;
    height: 2.45rem;
    padding: 0;
  }
.menu-icon-button span {
    position: relative;
    display: block;
    width: 1.15rem;
    height: 2px;
    border-radius: 999px;
    background: currentColor;
  }
.menu-icon-button span::before,
.menu-icon-button span::after {
    content: '';
    position: absolute;
    left: 0;
    width: 1.15rem;
    height: 2px;
    border-radius: 999px;
    background: currentColor;
  }
.menu-icon-button span::before {
    top: -0.38rem;
  }
.menu-icon-button span::after {
    top: 0.38rem;
  }
.mode-toggle button.rifts-attention {
    border-color: rgba(244, 205, 118, 0.72);
    animation: rifts-button-attention 1.8s ease-in-out infinite;
  }
@keyframes rifts-button-attention {
    0%,
100% {
      box-shadow:
        0 0 0 0 rgba(244, 205, 118, 0.16),
        inset 0 0 0 1px rgba(244, 205, 118, 0.14);
    }
    50% {
      box-shadow:
        0 0 0 3px rgba(244, 205, 118, 0.14),
        0 0 16px rgba(244, 205, 118, 0.18),
        inset 0 0 0 1px rgba(244, 205, 118, 0.34);
    }
  }
button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }
.ui-debug-visible :global(.ui-debug-target) {
    position: relative;
  }
button.tutorial-scene-locked {
    cursor: not-allowed;
    filter: grayscale(1);
    opacity: 0.48;
  }
.exit-tutorial-button {
    position: fixed;
    z-index: 43;
    left: 0.75rem;
    bottom: 0.75rem;
    min-height: 2rem;
    padding: 0.32rem 0.68rem;
    border: 1px solid rgba(237, 197, 111, 0.78);
    border-radius: 6px;
    background: rgba(11, 16, 24, 0.96);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.42);
    color: #ffe1a1;
    cursor: pointer;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 800;
  }
.tutorial-scene-prompt {
    position: fixed;
    z-index: 42;
    left: 50%;
    top: 1rem;
    transform: translateX(-50%);
    border: 1px solid rgba(237, 197, 111, 0.8);
    border-radius: 8px;
    background: rgba(8, 12, 18, 0.96);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
    color: #ffe1a1;
    padding: 0.55rem 0.8rem;
    font-size: 0.82rem;
    font-weight: 800;
  }
.ui-debug-visible :global(.ui-debug-target)::after {
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
.design-mode-enabled :global(.ui-debug-target) {
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
:global(.tutorial-target-glow) {
    outline: 2px solid rgba(119, 185, 255, 0.78);
    outline-offset: 3px;
    filter: drop-shadow(0 0 7px rgba(103, 179, 255, 0.54));
    animation: tutorial-target-pulse 1.45s ease-in-out infinite;
  }
:global(.battle-tutorial-unit-target.tutorial-target-glow) {
    border-radius: 4px;
    outline-offset: 1px;
    box-shadow:
      inset 0 0 0 1px rgba(126, 198, 255, 0.4),
      0 0 0 3px rgba(75, 158, 255, 0.16),
      0 0 18px rgba(91, 170, 255, 0.5);
  }
@keyframes tutorial-target-pulse {
    0%,
100% {
      outline-color: rgba(119, 185, 255, 0.56);
      filter: drop-shadow(0 0 4px rgba(103, 179, 255, 0.36));
    }

    50% {
      outline-color: rgba(151, 207, 255, 0.96);
      filter: drop-shadow(0 0 12px rgba(103, 179, 255, 0.7));
    }
  }
.left-column,
.center-column,
.right-column {
    min-height: 0;
    display: grid;
    gap: 0.75rem;
    align-content: start;
    overflow: auto;
    padding-right: 0.2rem;
  }
.panel,
.menu-panel {
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
.panel *,
.menu-panel * {
    min-width: 0;
  }
.archive-card {
    text-align: left;
  }
.archive-card {
    transition:
      transform 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease,
      background 120ms ease;
  }
.archive-card:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
      0 10px 22px rgba(0, 0, 0, 0.22);
  }
.archive-card {
    --archive-victory: rgba(74, 193, 111, 0.58);
    --archive-defeat: rgba(213, 75, 82, 0.58);
    --archive-draw: rgba(213, 178, 116, 0.52);
    --archive-neutral: rgba(143, 153, 164, 0.52);
    --archive-left-color: var(--archive-victory);
    --archive-right-color: var(--archive-neutral);
    position: relative;
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
.archive-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-left: 3px solid var(--archive-left-color);
    border-right: 3px solid var(--archive-right-color);
    pointer-events: none;
  }
.menu-back-button:not(:disabled):active {
    transform: none;
    filter: brightness(0.92);
  }
@keyframes rift-mini-phase-late {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
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
.unit-tile-art {
    image-rendering: pixelated;
    object-fit: contain;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }
.unit-tile-art {
    width: 2.2rem;
    height: 2.2rem;
    flex: 0 0 auto;
    display: block;
    margin: auto;
  }
.archive-card-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.45rem;
    gap: 0.4rem;
    align-items: stretch;
  }
.archive-card {
    display: grid;
    align-items: center;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.55rem;
    text-align: left;
  }
.incoming-archive-card-row {
    grid-template-columns: minmax(0, 1fr);
    height: 0;
    min-height: 0;
    overflow: visible;
    animation: incoming-archive-row-expand 260ms ease-out var(--arrival-delay) both;
  }
.incoming-archive-card {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 35;
    width: var(--flight-from-width, 8rem);
    height: var(--flight-from-height, 3rem);
    max-width: calc(100vw - 1rem);
    min-height: 0;
    overflow: hidden;
    pointer-events: none;
    transform: translate(var(--flight-from-x), var(--flight-from-y));
    transform-origin: center;
    opacity: 1;
    animation: incoming-archive-card-fly var(--arrival-flight) cubic-bezier(0.18, 0.84, 0.22, 1) var(--arrival-delay) both;
  }
.incoming-flight-mini,
.incoming-flight-archive {
    position: absolute;
    inset: 0;
  }
.incoming-flight-mini {
    opacity: 1;
    animation: incoming-flight-mini-fade var(--arrival-flight) ease-in-out var(--arrival-delay) both;
  }
.incoming-flight-archive {
    opacity: 0;
    animation: incoming-flight-archive-fade var(--arrival-flight) ease-in-out var(--arrival-delay) both;
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
@keyframes incoming-archive-row-expand {
    from {
      height: 0;
      margin-top: 0;
      margin-bottom: 0;
    }
    to {
      height: calc(var(--battle-log-row-height, 3.35rem));
      margin-top: 0;
      margin-bottom: 0;
    }
  }
@keyframes incoming-archive-card-fly {
    0% {
      width: var(--flight-from-width, 8rem);
      height: var(--flight-from-height, 3rem);
      opacity: 1;
      transform: translate(var(--flight-from-x), var(--flight-from-y));
      filter: brightness(1.18) saturate(1.12);
    }
    58% {
      width: var(--flight-from-width, 8rem);
      height: var(--flight-from-height, 3rem);
    }
    82% {
      width: var(--flight-to-width, 15rem);
      height: var(--flight-to-height, 3.35rem);
      transform: translate(var(--flight-to-x), var(--flight-to-y));
      filter: brightness(1.12) saturate(1.08);
    }
    100% {
      width: var(--flight-to-width, 15rem);
      height: var(--flight-to-height, 3.35rem);
      opacity: 1;
      transform: translate(var(--flight-to-x), var(--flight-to-y));
      filter: none;
    }
  }
@keyframes incoming-flight-mini-fade {
    0%,
54% {
      opacity: 1;
    }
    86%,
100% {
      opacity: 0;
    }
  }
@keyframes incoming-flight-archive-fade {
    0%,
54% {
      opacity: 0;
    }
    86%,
100% {
      opacity: 1;
    }
  }
.draft-screen-header {
    display: grid;
    gap: 0.55rem;
    margin-bottom: var(--ui-space-md);
    max-width: 920px;
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
.archive-actions-stack {
    grid-column: 3;
    display: grid;
    gap: 0.75rem;
    justify-items: end;
  }
.tutorial-archive-actions {
    justify-self: end;
  }
.tutorial-watch-battle-button {
    min-width: 220px;
  }
.large {
    min-width: 220px;
    padding: 0.9rem 1.2rem;
    font-size: 1rem;
  }
.menu-screen {
    min-height: 100dvh;
    box-sizing: border-box;
    display: grid;
    justify-items: center;
    align-items: start;
    padding: var(--ui-space-md);
  }
.menu-panel {
    width: min(calc(var(--ui-shell-max-width) + (2 * var(--ui-shell-column))), 100%);
  }
.menu-copy {
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
.main-menu-shell {
    min-height: min(680px, calc(100vh - (2 * var(--ui-space-md))));
    align-content: center;
    padding-bottom: 4.5rem;
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
    background: rgba(38, 38, 52, 0.94);
    border: 1px solid rgba(190, 184, 205, 0.72);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    transform: none;
  }
.menu-back-button::before {
    content: '';
    display: block;
    width: 0.72rem;
    height: 0.72rem;
    border-left: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: translateX(0.12rem) rotate(45deg);
    transform-origin: center;
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
.multiplayer-session-actions .multiplayer-copy-indicator,
.topbar-copy-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    min-height: 2.1rem;
    padding: 0.35rem 0.62rem;
    border: 1px solid rgba(91, 165, 116, 0.45);
    border-radius: 999px;
    color: #c9f2d3;
    background: rgba(42, 99, 60, 0.34);
    box-shadow: 0 0 0 1px rgba(91, 165, 116, 0.12), 0 0 18px rgba(91, 165, 116, 0.18);
    animation: copy-indicator-pop 220ms ease-out both;
  }
.multiplayer-copy-indicator::before {
    content: '';
    width: 0.52rem;
    height: 0.32rem;
    border-left: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(-45deg) translateY(-1px);
  }
@keyframes copy-indicator-pop {
    from {
      opacity: 0;
      transform: translateY(0.18rem) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
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
.overworld-shell.rifts-mode .center-column {
    grid-template-rows: auto minmax(0, 1fr);
    grid-auto-rows: auto;
    overflow: hidden;
  }
.overworld-shell.rifts-mode .right-column {
    grid-column: 3;
    grid-row: 2 / 4;
    grid-template-rows: minmax(0, 1fr);
    grid-auto-rows: minmax(0, 1fr);
    align-content: stretch;
    overflow: hidden;
    padding-bottom: 8.6rem;
  }
.overworld-shell.rifts-mode :global(.action-rail) {
    grid-row: 3;
  }
.center-column > :global(.rift-grid),
.center-column > :global(.race-grid),
.center-column > :global(.opponent-info-board) {
    min-height: 100%;
  }
.center-column > :global(.rift-grid),
.center-column > :global(.troop-race-grid) {
    min-height: 0;
  }
@keyframes available-unit-bob {
    0%,
100% {
      translate: 0 0;
    }
    50% {
      translate: 0 -5px;
    }
  }
.assignment-hint-arrow {
    position: fixed;
    inset: 0;
    z-index: 18;
    pointer-events: none;
    overflow: visible;
  }
.assignment-hint-arrow > path {
    fill: none;
    stroke: rgba(150, 220, 184, 0.92);
    stroke-width: 4;
    stroke-linecap: round;
    filter: drop-shadow(0 0 8px rgba(76, 190, 135, 0.7));
    marker-end: url(#assignment-hint-arrowhead);
    stroke-dasharray: 14 10;
    animation: assignment-arrow-flow 900ms linear infinite;
  }
.assignment-hint-arrow marker path {
    fill: rgba(150, 220, 184, 0.96);
  }
@keyframes assignment-arrow-flow {
    to {
      stroke-dashoffset: -24;
    }
  }
@keyframes assignment-attention-pulse {
    0%,
100% {
      border-color: rgba(211, 176, 255, 0.54);
      box-shadow:
        0 0 0 1px rgba(211, 176, 255, 0.14),
        0 0 14px rgba(155, 95, 220, 0.2),
        var(--ui-shadow-panel);
    }
    50% {
      border-color: rgba(238, 216, 255, 0.94);
      box-shadow:
        0 0 0 3px rgba(211, 176, 255, 0.28),
        0 0 32px rgba(184, 108, 255, 0.5),
        var(--ui-shadow-panel);
    }
  }
.loading-screen {
    display: grid;
    place-items: center;
    color: #f4f7fb;
    background:
      radial-gradient(circle at 50% 18%, rgba(54, 87, 114, 0.52), transparent 36%),
      linear-gradient(180deg, rgba(8, 13, 21, 0.96), rgba(5, 8, 13, 0.98));
  }
.game-loading-screen {
    position: fixed;
    inset: 0;
    z-index: 80;
  }
.loading-panel {
    width: min(24rem, calc(100% - 2rem));
    display: grid;
    gap: 0.75rem;
    padding: 1.1rem;
    border: 1px solid rgba(165, 188, 207, 0.24);
    border-radius: var(--ui-panel-radius);
    background: rgba(10, 17, 26, 0.84);
    box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.34);
  }
.loading-panel h2 {
    font-size: 1.2rem;
    line-height: 1.2;
  }
.loading-panel p:last-child {
    min-height: 1.25rem;
    color: #cbd8e3;
    font-size: 0.88rem;
  }
.loading-progress-track {
    width: 100%;
    height: 0.6rem;
    overflow: hidden;
    border-radius: 999px;
    border: 1px solid rgba(203, 216, 227, 0.18);
    background: rgba(5, 9, 15, 0.72);
  }
.loading-progress-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #71c6d1, #e4c170);
    transition: width 160ms ease;
  }
@media (max-width: 1280px) {.shell {
      grid-template-columns: 1fr;
    }
.shell {
      grid-template-rows: auto auto auto auto;
    }
.topbar {
      grid-template-columns: minmax(0, 1fr) auto;
    }
.resource-strip {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
.overworld-shell {
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }
.overworld-shell.rifts-mode {
      height: 100dvh;
      min-height: 100dvh;
      grid-template-rows: auto minmax(0, 1fr) auto;
      overflow: hidden;
    }
.overworld-shell.rifts-mode .left-column,
.overworld-shell.rifts-mode .right-column {
      display: none;
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
.overworld-shell.rifts-mode .center-column {
      grid-column: 1;
      grid-row: 2;
      overflow: hidden;
    }
.overworld-shell.rifts-mode :global(.action-rail) {
      grid-column: 1;
      grid-row: 3;
      min-height: 0;
      align-content: end;
    }
.overworld-shell.rifts-mode :global(.action-rail):has(:global(.footer-essence-draft-panel)) {
      min-height: 0;
    }}
@media (max-width: 820px) {.resource-strip {
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
.archive-actions-stack {
      grid-column: 1;
    }
.archive-actions-stack {
      justify-self: stretch;
    }
.menu-screen,
.shell {
      padding: 0.75rem;
    }
.menu-panel {
      width: 100%;
    }}
</style>
