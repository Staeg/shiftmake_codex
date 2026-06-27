import { writable } from 'svelte/store';
import {
  applyCycleOutcomes,
  applyScheduledCycleUnlock,
  assignTroopToRift,
  canAssignTroopToRift,
  claimRaceUnlockOffer,
  claimOpeningTroop,
  claimTroopOffer,
  claimTroopClassUnlockOffer,
  claimUpgradeOffer,
  clearTroopAssignment,
  continuePlaying,
  getEssenceDraftCost,
  resolveAssignedRifts,
  revealEssenceDraft,
  deserializeGameState,
  serializeGameState,
  startOpeningCampaign,
  startNewGame,
  unclaimOpeningTroop,
  validateAssignments,
} from '../engine/game';
import { buildHarvestedLadderPayload, withLadderDraw } from '../engine/ladder';
import {
  battleReportDecodeErrorMessage,
  buildBattleReportPayload,
  decodeBattleReport,
  encodeBattleReport,
  replayFromBattleReport,
} from '../engine/battleReport';
import { resolveBattle } from '../engine/battle';
import {
  buildCampaignReportPayload,
  campaignReportDecodeErrorMessage,
  decodeCampaignReport,
  encodeCampaignReport,
} from '../engine/campaignReport';
import type {
  BattleReportDiagnostic,
  BattleReportPayload,
  BattleReplay,
  CampaignReportPayload,
  RaceId,
  CampaignReportUiContext,
  CycleResolution,
  GameState,
  ReplayIndexEntry,
  ReplayPayloadWrite,
  StoredReplayPayload,
  TroopId,
  TroopUnlockId,
  UpgradeId,
  GameMode,
  ContestPlayerState,
  LoadGameRepairReport,
} from '../engine/types';
import {
  createNewSlotCampaign,
  getSlotReplayStorageKey,
  importCampaignReportToSlot,
  listSaveSlots,
  loadSaveSlot,
  loadSaveSlotWithRepairs,
  migrateLegacySave,
  readSlotReplay,
  readSlotReplayPayload,
  removeSlotReplay,
  clearSaveSlot,
  slotReplayExists,
  type SaveSlotId,
  type SaveSlotSummary,
  saveToSlot,
  verifyReplayIndexAgainstStoredPayloads,
  writeSlotReplay,
} from './saveSlots';
import { nextPlayableStep, previousPlayableStep } from './replayNavigation';
import { buildContestMultiplayerSubmission, DEFAULT_CONTEST_PLAYER_NAMES } from '../engine/multiplayerContest';
import { buildContestAiPlanKey, type ContestAiWorkerResponse } from './contestAiPlanner';
import {
  clearContestMultiplayerReplayPayloads,
  closeContestMultiplayerSocket,
  connectContestMultiplayer,
  hasContestMultiplayerReplayPayload,
  isContestMultiplayerSocketOpen,
  readContestMultiplayerReplayPayload,
  readLastMultiplayerPlayerName,
  readLastMultiplayerServerUrl,
  readStoredMultiplayerIdentity,
  sendContestMultiplayerMessage,
  type MultiplayerServerMessage,
  type MultiplayerSession,
} from './contestMultiplayerClient';
import {
  buildTutorialOpeningGame,
  buildTutorialReplayFixture,
  continueTutorial,
  makeTutorialProgress,
  readTutorialProgress,
  recordTutorialAction,
  rewindTutorial,
  TUTORIAL_SAVE_ID,
  type TutorialAction,
  type TutorialProgress,
  writeTutorialProgress,
} from './tutorial';
import { drawLadderRiftSet, harvestLadderRiftSet } from './ladderClient';

export { readLastMultiplayerPlayerName, readLastMultiplayerServerUrl } from './contestMultiplayerClient';

export type CenterMode = 'rifts' | 'troops' | 'contest';
export type ScreenMode = 'main_menu' | 'overworld' | 'replay';

interface CycleAnimationState {
  sourceGame: GameState;
  resolution: CycleResolution;
  activeSlotId: SaveSlotId | null;
}

interface StoreState {
  game: GameState;
  screen: ScreenMode;
  activeSlotId: SaveSlotId | null;
  slots: SaveSlotSummary[];
  tutorialProgress: TutorialProgress | null;
  multiplayer: MultiplayerSession | null;
  centerMode: CenterMode;
  loadedReplay: BattleReplay | null;
  loadedReplayPayload: StoredReplayPayload | null;
  loadedBattleReport: BattleReportPayload | null;
  currentStep: number;
  selectedEvent: number | null;
  autoPlay: boolean;
  speedMs: number;
  validationMessages: string[];
  systemMessage: string | null;
  cycleEndConfirmationPending: boolean;
  cycleAnimation: CycleAnimationState | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface ReplayWriteResult {
  replayIndex: ReplayIndexEntry[];
  failedReplayIds: Set<string>;
  quotaExceeded: boolean;
  evictedReplayIds: string[];
}

const REPLAY_IDENTITY_KEY = (replayId: string): string => replayId;
const TUTORIAL_CYCLE_REWIND_KEY = 'shiftmake:tutorial:cycle-rewind:v1';

let multiplayerReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let multiplayerReconnectAttempts = 0;

function isMultiplayerSubmitted(state: StoreState): boolean {
  const playerId = state.multiplayer?.playerId;
  return !!playerId && !!state.multiplayer?.readiness[playerId];
}

function isBenignMultiplayerStatusMessage(message: string | null): boolean {
  return (
    message === 'Ready submitted. Waiting for the other player.' ||
    message === 'Ready canceled.' ||
    message === 'Both players submitted. Cycle resolved.' ||
    message === 'Both players submitted. Contest updated.'
  );
}

function canEditGame(state: StoreState): boolean {
  return !state.multiplayer || !isMultiplayerSubmitted(state);
}

function buildMultiplayerCycleAnimation(
  sourceGame: GameState,
  replayPayloads: Record<string, StoredReplayPayload>,
  previousReplayPayloads: Record<string, StoredReplayPayload>,
): CycleResolution | null {
  const newPayloads = Object.entries(replayPayloads).filter(([replayId]) => !previousReplayPayloads[replayId]);
  if (newPayloads.length === 0) {
    return null;
  }
  const records = newPayloads.map(([replayId, payload]) => {
    const replay = resolveBattle(payload.input);
    return {
      riftId: payload.input.riftId ?? replayId,
      assignedTroopIds: payload.input.playerCombatants.map((combatant) => combatant.troopInstanceId).filter((troopId): troopId is TroopId => !!troopId),
      battleInput: payload.input,
      replay,
      outcome: replay.outcome,
      victoryPoints: payload.input.tier ?? 0,
      recoveryMap: {},
    };
  });
  return records.length > 0 ? { records, preparedState: sourceGame } : null;
}

function shouldPreserveUnsubmittedMultiplayerGame(state: StoreState, message: Extract<MultiplayerServerMessage, { kind: 'room-snapshot' }>): boolean {
  const session = state.multiplayer;
  if (!session?.connected || state.screen === 'main_menu' || session.roomId !== message.roomId || session.playerId !== message.playerId) {
    return false;
  }
  return !isMultiplayerSubmitted(state);
}

function closeMultiplayerSocket(options: { notifyServer: boolean } = { notifyServer: false }): void {
  if (multiplayerReconnectTimer !== null) {
    clearTimeout(multiplayerReconnectTimer);
    multiplayerReconnectTimer = null;
  }
  closeContestMultiplayerSocket(options);
}

interface ContestAiPlanCache {
  key: string;
  ai: ContestPlayerState;
}

let contestAiWorker: Worker | null = null;
let contestAiPendingKey: string | null = null;
let contestAiPlanCache: ContestAiPlanCache | null = null;

function getContestAiWorker(): Worker | null {
  if (typeof Worker === 'undefined') {
    return null;
  }
  if (!contestAiWorker) {
    contestAiWorker = new Worker(new URL('./contestAiWorker.ts', import.meta.url), { type: 'module' });
    contestAiWorker.onmessage = (event: MessageEvent<ContestAiWorkerResponse>) => {
      const response = event.data;
      if (response.kind !== 'contest-ai-plan') {
        return;
      }
      contestAiPlanCache = { key: response.key, ai: response.ai };
      if (contestAiPendingKey === response.key) {
        contestAiPendingKey = null;
      }
    };
  }
  return contestAiWorker;
}

function scheduleContestAiPlanning(game: GameState): void {
  const key = buildContestAiPlanKey(game);
  if (!key || contestAiPendingKey === key || contestAiPlanCache?.key === key) {
    return;
  }
  const worker = getContestAiWorker();
  if (!worker) {
    return;
  }
  contestAiPendingKey = key;
  worker.postMessage({ kind: 'plan-contest-ai', key, game });
}

function getPreparedContestAiPlan(game: GameState): ContestPlayerState | undefined {
  const key = buildContestAiPlanKey(game);
  return key && contestAiPlanCache?.key === key ? contestAiPlanCache.ai : undefined;
}

function makeInitialGame(): GameState {
  return startNewGame(1);
}

function makeInitialState(): StoreState {
  return {
    game: makeInitialGame(),
    screen: 'main_menu',
    activeSlotId: null,
    slots: [],
    tutorialProgress: null,
    multiplayer: null,
    centerMode: 'rifts',
    loadedReplay: null,
    loadedReplayPayload: null,
    loadedBattleReport: null,
    currentStep: -1,
    selectedEvent: null,
    autoPlay: false,
    speedMs: 8,
    validationMessages: [],
    systemMessage: null,
    cycleEndConfirmationPending: false,
    cycleAnimation: null,
  };
}

function clearCycleEndConfirmation<T extends Pick<StoreState, 'cycleEndConfirmationPending' | 'systemMessage'>>(state: T): T {
  return {
    ...state,
    cycleEndConfirmationPending: false,
    systemMessage: state.cycleEndConfirmationPending ? null : state.systemMessage,
  };
}

function saveActiveCampaign(state: StoreState): StoreState {
  if (state.multiplayer) {
    return state;
  }
  if (!state.activeSlotId) {
    return state;
  }

  saveToSlot(localStorage, state.activeSlotId, state.game);
  scheduleContestAiPlanning(state.game);
  return {
    ...state,
    slots: listSaveSlots(localStorage),
  };
}

function persistTutorialProgress(state: StoreState, progress: TutorialProgress | null): StoreState {
  writeTutorialProgress(localStorage, progress);
  return { ...state, tutorialProgress: progress };
}

function writeTutorialFixture(): ReturnType<typeof buildTutorialReplayFixture> {
  const fixture = buildTutorialReplayFixture();
  clearSaveSlot(localStorage, TUTORIAL_SAVE_ID);
  saveToSlot(localStorage, TUTORIAL_SAVE_ID, fixture.game);
  localStorage.removeItem(TUTORIAL_CYCLE_REWIND_KEY);
  fixture.replayWrites.forEach((write) => {
    writeSlotReplay(localStorage, TUTORIAL_SAVE_ID, write.replayId, JSON.stringify(write.replay));
  });
  return fixture;
}

function writeTutorialCycleRewindGame(game: GameState): void {
  localStorage.setItem(TUTORIAL_CYCLE_REWIND_KEY, JSON.stringify(serializeGameState(game)));
}

function readTutorialCycleRewindGame(): GameState | null {
  const raw = localStorage.getItem(TUTORIAL_CYCLE_REWIND_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    const loaded = deserializeGameState(parsed);
    return loaded.ok && loaded.state ? loaded.state : null;
  } catch {
    return null;
  }
}

function slotReplayStorageKey(slotId: SaveSlotId): (replayId: string) => string {
  return (replayId) => getSlotReplayStorageKey(slotId, replayId);
}

function blockingValidationMessages(state: GameState): string[] {
  return validateAssignments(state).issues
    .filter((issue) => issue.kind !== 'holding_only_no_new_attack')
    .map((issue) => issue.message);
}

function formatRepairList(label: string, values: string[]): string | null {
  if (values.length === 0) {
    return null;
  }
  return `${label}: ${values.join(', ')}`;
}

function buildLoadRepairMessage(repairs: LoadGameRepairReport | null): string | null {
  if (!repairs) {
    return null;
  }

  const sections = [
    formatRepairList('Missing races', repairs.missingRaceIds),
    formatRepairList('Missing troop unlocks', repairs.missingTroopUnlockIds),
    formatRepairList('Missing troop instances', repairs.missingTroopInstanceIds),
    formatRepairList('Missing upgrades', repairs.missingUpgradeIds),
    formatRepairList('Missing Rift enemies', repairs.missingRiftEnemyIds),
    formatRepairList('Missing draft options', repairs.missingDraftOptionIds),
  ].filter((section): section is string => section !== null);

  return sections.length > 0 ? `System Notice: This save referenced retired content that was removed on load. ${sections.join('; ')}.` : null;
}

function joinSystemMessages(messages: Array<string | null>): string | null {
  const activeMessages = messages.filter((message): message is string => !!message);
  return activeMessages.length > 0 ? activeMessages.join(' ') : null;
}

function isQuotaExceeded(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === 'QuotaExceededError' || error.message.toLowerCase().includes('quota');
}

function markReplayEntrySummaryOnly(replayIndex: ReplayIndexEntry[], replayId: string): ReplayIndexEntry[] {
  return replayIndex.map((entry) => (entry.replayId === replayId ? { ...entry, summaryOnly: true } : entry));
}

function getOldestReplayCandidate(
  storage: StorageLike,
  replayIndex: ReplayIndexEntry[],
  protectedIds: Set<string>,
  toStorageKey: (replayId: string) => string,
): ReplayIndexEntry | null {
  for (let index = replayIndex.length - 1; index >= 0; index -= 1) {
    const entry = replayIndex[index];
    if (!entry || entry.summaryOnly || protectedIds.has(entry.replayId)) {
      continue;
    }
    if (storage.getItem(toStorageKey(entry.replayId)) === null) {
      continue;
    }
    return entry;
  }
  return null;
}

function buildEndCycleWarning(hasNoAssignments: boolean, hasHoldingOnly: boolean, hasIdleTroops: boolean, hasUnspentEssence: boolean): string {
  if (hasIdleTroops) {
    return 'Some ready troops are still idle. End the cycle anyway?';
  }
  if (hasHoldingOnly && hasUnspentEssence) {
    return 'Your troops are only holding existing Rifts and you still have unspent Essence. End the cycle anyway?';
  }
  if (hasHoldingOnly) {
    return 'Your troops are only holding existing Rifts. End the cycle anyway?';
  }
  if (hasNoAssignments && hasUnspentEssence) {
    return 'No troops are assigned and you still have unspent Essence. End the cycle anyway?';
  }
  if (hasNoAssignments) {
    return 'No troops are assigned. End the cycle anyway?';
  }
  return 'You still have unspent Essence. End the cycle anyway?';
}

function applyResolvedCycleToStoreState(state: StoreState, sourceGame: GameState, resolution: CycleResolution, activeSlotId: SaveSlotId): StoreState {
  const applied = applyCycleOutcomes(sourceGame, resolution);
  applied.replayPayloadDeletes.forEach((entry) => removeSlotReplay(localStorage, activeSlotId, entry.replayId));
  const replayWriteResult = persistReplayPayloadWrites(
    localStorage,
    applied.nextState.replayIndex,
    applied.replayPayloadWrites,
    slotReplayStorageKey(activeSlotId),
  );
  const nextGame =
    replayWriteResult.replayIndex !== applied.nextState.replayIndex
      ? { ...applied.nextState, replayIndex: replayWriteResult.replayIndex }
      : applied.nextState;

  let systemMessage: string | null = null;
  if (replayWriteResult.failedReplayIds.size > 0) {
    systemMessage = 'Cycle ended, but replay storage is full. Some archived battles were saved as summaries only.';
  } else if (replayWriteResult.evictedReplayIds.length > 0) {
    systemMessage =
      replayWriteResult.evictedReplayIds.length === 1
        ? 'Replay storage was full, so the oldest saved battle was reduced to a summary to keep the latest replay.'
        : `Replay storage was full, so ${replayWriteResult.evictedReplayIds.length} older saved battles were reduced to summaries to keep the latest replays.`;
  } else if (replayWriteResult.quotaExceeded) {
    systemMessage = 'Replay storage is nearly full, but the newest battle was saved.';
  }

  return saveActiveCampaign({
    ...state,
    activeSlotId,
    game: nextGame,
    validationMessages: [],
    systemMessage,
    cycleEndConfirmationPending: false,
    cycleAnimation: null,
  });
}

async function applyResolvedCycleToStoreStateWithLadder(
  state: StoreState,
  sourceGame: GameState,
  resolution: CycleResolution,
  activeSlotId: SaveSlotId,
): Promise<StoreState> {
  const appliedState = applyResolvedCycleToStoreState(state, sourceGame, resolution, activeSlotId);
  if (sourceGame.gameMode !== 'ladder') {
    return appliedState;
  }

  const parentId = sourceGame.ladder?.currentRiftSetId ?? null;
  if (!parentId) {
    return {
      ...appliedState,
      systemMessage: 'Ladder Cycle resolved, but no source Rift-set was recorded for harvesting.',
    };
  }

  const harvestedPayload = buildHarvestedLadderPayload(sourceGame, resolution.records);
  await harvestLadderRiftSet(parentId, harvestedPayload);

  if (appliedState.game.phase === 'game_over') {
    return {
      ...appliedState,
      systemMessage: joinSystemMessages([appliedState.systemMessage, 'Ladder Cycle harvested.']),
    };
  }

  const draw = await drawLadderRiftSet(appliedState.game.cycleNumber);
  const game = applyScheduledCycleUnlock(withLadderDraw(appliedState.game, draw));
  saveToSlot(localStorage, activeSlotId, game);
  return {
    ...appliedState,
    game,
    slots: listSaveSlots(localStorage),
    systemMessage: appliedState.systemMessage,
  };
}

function collectReplayPayloadsForCampaign(state: Pick<StoreState, 'activeSlotId' | 'game'>): {
  replayPayloads: Record<string, StoredReplayPayload>;
  missingReplayIds: string[];
} {
  if (!state.activeSlotId) {
    return { replayPayloads: {}, missingReplayIds: state.game.replayIndex.map((entry) => entry.replayId) };
  }

  const replayPayloads: Record<string, StoredReplayPayload> = {};
  const missingReplayIds: string[] = [];
  state.game.replayIndex.forEach((entry) => {
    const payload = entry.summaryOnly ? null : readSlotReplayPayload(localStorage, state.activeSlotId as SaveSlotId, entry.replayId);
    if (payload) {
      replayPayloads[entry.replayId] = payload;
    } else {
      missingReplayIds.push(entry.replayId);
    }
  });
  return { replayPayloads, missingReplayIds };
}

export function persistReplayPayloadWrites(
  storage: StorageLike,
  replayIndex: ReplayIndexEntry[],
  writes: ReplayPayloadWrite[],
  toStorageKey: (replayId: string) => string = REPLAY_IDENTITY_KEY,
): ReplayWriteResult {
  let nextReplayIndex = replayIndex;
  const failedReplayIds = new Set<string>();
  const evictedReplayIds: string[] = [];
  const protectedIds = new Set(writes.map((entry) => entry.replayId));
  let quotaExceeded = false;

  writes.forEach((entry) => {
    const serialized = JSON.stringify(entry.replay);
    let written = false;

    while (!written) {
      try {
        storage.setItem(toStorageKey(entry.replayId), serialized);
        written = true;
      } catch (error) {
        storage.removeItem(toStorageKey(entry.replayId));
        if (!isQuotaExceeded(error)) {
          throw error;
        }

        quotaExceeded = true;
        const candidate = getOldestReplayCandidate(storage, nextReplayIndex, protectedIds, toStorageKey);
        if (!candidate) {
          failedReplayIds.add(entry.replayId);
          nextReplayIndex = markReplayEntrySummaryOnly(nextReplayIndex, entry.replayId);
          break;
        }

        storage.removeItem(toStorageKey(candidate.replayId));
        evictedReplayIds.push(candidate.replayId);
        nextReplayIndex = markReplayEntrySummaryOnly(nextReplayIndex, candidate.replayId);
      }
    }
  });

  return {
    replayIndex: nextReplayIndex,
    failedReplayIds,
    quotaExceeded,
    evictedReplayIds,
  };
}

export const gameStore = (() => {
  const { subscribe, update, set } = writable<StoreState>(makeInitialState());
  let snapshot = makeInitialState();
  let cycleAnimationFinishInFlight = false;

  subscribe((state) => {
    snapshot = state;
  });

  function scheduleMultiplayerReconnect(playerName?: string): void {
    const session = snapshot.multiplayer;
    if (!session?.roomId || !session.playerId || !session.playerToken || multiplayerReconnectTimer !== null) {
      return;
    }
    const delayMs = Math.min(10_000, 700 * 2 ** multiplayerReconnectAttempts);
    multiplayerReconnectAttempts += 1;
    multiplayerReconnectTimer = setTimeout(() => {
      multiplayerReconnectTimer = null;
      const current = snapshot.multiplayer;
      if (!current?.roomId || current.connected) {
        return;
      }
      connectMultiplayerContest(current.serverUrl, current.roomId, playerName ?? current.playerNames[current.playerId ?? 'human']);
    }, delayMs);
  }

  function connectMultiplayerContest(serverUrl: string, roomId?: string, playerName?: string): void {
    closeMultiplayerSocket();
    const storedIdentity = readStoredMultiplayerIdentity(serverUrl, roomId);

    set({
      ...makeInitialState(),
      slots: listSaveSlots(localStorage),
      multiplayer: {
        connected: false,
        serverUrl,
        roomId: roomId || null,
        playerId: storedIdentity?.playerId ?? null,
        playerToken: storedIdentity?.playerToken ?? null,
        readiness: { human: false, ai: false },
        connectedPlayers: { human: false, ai: false },
        playerNames: { ...DEFAULT_CONTEST_PLAYER_NAMES },
        message: 'Connecting to Contest room...',
      },
      systemMessage: 'Connecting to Contest room...',
    });

    connectContestMultiplayer({
      serverUrl,
      roomId,
      playerName,
      onMessage: (message, previousMultiplayerReplayPayloads) => {
        if (message.kind === 'room-error') {
          update((state) => ({
            ...state,
            slots: listSaveSlots(localStorage),
            systemMessage: message.message,
            multiplayer: state.multiplayer
              ? {
                  ...state.multiplayer,
                  readiness: state.multiplayer.playerId
                    ? { ...state.multiplayer.readiness, [state.multiplayer.playerId]: false }
                    : state.multiplayer.readiness,
                  message: message.message,
                }
              : state.multiplayer,
          }));
          return;
        }

        multiplayerReconnectAttempts = 0;
        update((state) => {
          const nextGame = shouldPreserveUnsubmittedMultiplayerGame(state, message) ? state.game : message.game;
          const multiplayerAnimation =
            state.screen !== 'main_menu' && isBenignMultiplayerStatusMessage(message.message)
              ? buildMultiplayerCycleAnimation(nextGame, message.replayPayloads, previousMultiplayerReplayPayloads)
              : null;
          return {
            ...state,
            screen: state.screen === 'main_menu' ? 'overworld' : state.screen,
            activeSlotId: null,
            game: nextGame,
            slots: listSaveSlots(localStorage),
            multiplayer: {
              connected: true,
              serverUrl,
              roomId: message.roomId,
              playerId: message.playerId,
              playerToken: message.playerToken,
              readiness: message.readiness,
              connectedPlayers: message.connectedPlayers ?? state.multiplayer?.connectedPlayers ?? { human: true, ai: true },
              playerNames: message.playerNames,
              message: message.message,
            },
            systemMessage: isBenignMultiplayerStatusMessage(message.message) ? null : message.message,
            cycleEndConfirmationPending: false,
            cycleAnimation: multiplayerAnimation ? { sourceGame: nextGame, resolution: multiplayerAnimation, activeSlotId: null } : state.cycleAnimation,
          };
        });
      },
      onClose: (shouldReconnect) => {
        update((state) => ({
          ...state,
          multiplayer: state.multiplayer
            ? { ...state.multiplayer, connected: false, message: shouldReconnect ? 'Connection lost. Reconnecting...' : 'Disconnected from multiplayer server.' }
            : state.multiplayer,
          systemMessage: state.multiplayer ? (shouldReconnect ? 'Connection lost. Reconnecting...' : 'Disconnected from multiplayer server.') : state.systemMessage,
        }));
        if (shouldReconnect) {
          scheduleMultiplayerReconnect(playerName);
        }
      },
      onError: () => {
        update((state) => ({
          ...state,
          systemMessage: 'Unable to connect to multiplayer server.',
          multiplayer: state.multiplayer ? { ...state.multiplayer, message: 'Unable to connect to multiplayer server.' } : state.multiplayer,
        }));
      },
    });
  }

  function submitMultiplayerReady(): void {
    if (!snapshot.multiplayer || !snapshot.multiplayer.connected || !isContestMultiplayerSocketOpen()) {
      update((state) => ({ ...state, systemMessage: 'No multiplayer room is connected.' }));
      return;
    }
    if (isMultiplayerSubmitted(snapshot)) {
      return;
    }
    if (
      snapshot.game.phase === 'planning' &&
      ((snapshot.game.essence > 0 && getEssenceDraftCost(snapshot.game) !== null) ||
        snapshot.game.activeTroopOffer ||
        snapshot.game.activeUpgradeOffer)
    ) {
      update((state) => ({
        ...state,
        centerMode: 'troops',
        systemMessage: 'Spend all Essence and finish the active draft before submitting ready.',
      }));
      return;
    }
    sendContestMultiplayerMessage({ kind: 'submit-ready', submission: buildContestMultiplayerSubmission(snapshot.game) });
    const playerId = snapshot.multiplayer.playerId;
    update((state) => ({
      ...state,
      multiplayer:
        state.multiplayer && playerId
          ? {
              ...state.multiplayer,
              readiness: { ...state.multiplayer.readiness, [playerId]: true },
              message: 'Ready submitted. Waiting for the other player.',
            }
          : state.multiplayer,
      systemMessage: null,
    }));
  }

  function cancelMultiplayerReady(): void {
    if (!snapshot.multiplayer || !snapshot.multiplayer.connected || !isContestMultiplayerSocketOpen()) {
      update((state) => ({ ...state, systemMessage: 'No multiplayer room is connected.' }));
      return;
    }
    const playerId = snapshot.multiplayer.playerId;
    if (!playerId || !snapshot.multiplayer.readiness[playerId]) {
      return;
    }
    sendContestMultiplayerMessage({ kind: 'unsubmit-ready' });
    update((state) => ({
      ...state,
      multiplayer:
        state.multiplayer && playerId
          ? {
              ...state.multiplayer,
              readiness: { ...state.multiplayer.readiness, [playerId]: false },
              message: 'Ready canceled.',
            }
          : state.multiplayer,
      systemMessage: null,
    }));
  }

  function reconnectMultiplayerContest(playerName?: string): void {
    const session = snapshot.multiplayer;
    if (!session?.roomId) {
      update((state) => ({ ...state, systemMessage: 'No multiplayer room is available to reconnect.' }));
      return;
    }
    connectMultiplayerContest(session.serverUrl, session.roomId, playerName ?? session.playerNames[session.playerId ?? 'human']);
  }

  return {
    subscribe,
    initialize() {
      const slots = migrateLegacySave(localStorage);
      set({
        ...makeInitialState(),
        slots,
      });
    },
    connectMultiplayerContest,
    submitMultiplayerReady,
    cancelMultiplayerReady,
    reconnectMultiplayerContest,
    leaveMultiplayerContest() {
      closeMultiplayerSocket({ notifyServer: true });
      clearContestMultiplayerReplayPayloads();
      multiplayerReconnectAttempts = 0;
      set({
        ...makeInitialState(),
        slots: listSaveSlots(localStorage),
        systemMessage: 'Left multiplayer room.',
      });
    },
    loadSlot(slotId: SaveSlotId) {
      const loadedSlot = loadSaveSlotWithRepairs(localStorage, slotId);
      if (!loadedSlot) {
        return false;
      }
      const game = loadedSlot.game;
      if (loadedSlot.repairs) {
        saveToSlot(localStorage, slotId, game);
      }
      const repairMessage = buildLoadRepairMessage(loadedSlot.repairs);

      set({
        ...makeInitialState(),
        screen: 'overworld',
        activeSlotId: slotId,
        slots: listSaveSlots(localStorage),
        tutorialProgress: slotId === TUTORIAL_SAVE_ID ? readTutorialProgress(localStorage) : null,
        game,
        systemMessage: repairMessage,
      });
      scheduleContestAiPlanning(game);
      return true;
    },
    startNewCampaign(slotId: SaveSlotId, gameMode: GameMode = 'campaign') {
      const game = createNewSlotCampaign(localStorage, slotId, Date.now() >>> 0, gameMode);
      set({
        ...makeInitialState(),
        screen: 'overworld',
        activeSlotId: slotId,
        slots: listSaveSlots(localStorage),
        game,
      });
      scheduleContestAiPlanning(game);
    },
    hasTutorialSave() {
      return loadSaveSlot(localStorage, TUTORIAL_SAVE_ID) !== null;
    },
    startTutorial() {
      const fixture = writeTutorialFixture();
      const tutorialProgress = makeTutorialProgress();
      writeTutorialProgress(localStorage, tutorialProgress);
      set({
        ...makeInitialState(),
        screen: 'overworld',
        activeSlotId: TUTORIAL_SAVE_ID,
        slots: listSaveSlots(localStorage),
        tutorialProgress,
        game: fixture.game,
        centerMode: 'rifts',
      });
      scheduleContestAiPlanning(fixture.game);
    },
    resumeTutorial() {
      const game = loadSaveSlot(localStorage, TUTORIAL_SAVE_ID);
      if (!game) {
        this.startTutorial();
        return;
      }
      const tutorialProgress = readTutorialProgress(localStorage) ?? makeTutorialProgress();
      set({
        ...makeInitialState(),
        screen: 'overworld',
        activeSlotId: TUTORIAL_SAVE_ID,
        slots: listSaveSlots(localStorage),
        tutorialProgress,
        game,
        centerMode: 'rifts',
      });
      scheduleContestAiPlanning(game);
    },
    restartTutorial() {
      this.startTutorial();
    },
    exitTutorial() {
      writeTutorialProgress(localStorage, null);
      set({
        ...makeInitialState(),
        slots: listSaveSlots(localStorage),
        systemMessage: 'Tutorial exited.',
      });
    },
    startTutorialOpening() {
      const game = buildTutorialOpeningGame();
      saveToSlot(localStorage, TUTORIAL_SAVE_ID, game);
      update((state) => {
        const tutorialProgress = state.tutorialProgress
          ? recordTutorialAction(state.tutorialProgress, 'start-contest')
          : null;
        if (tutorialProgress) {
          writeTutorialProgress(localStorage, tutorialProgress);
        }
        return {
          ...state,
          screen: 'overworld',
          activeSlotId: TUTORIAL_SAVE_ID,
          loadedReplay: null,
          loadedReplayPayload: null,
          loadedBattleReport: null,
          currentStep: -1,
          selectedEvent: null,
          autoPlay: false,
          tutorialProgress,
          game,
        };
      });
      scheduleContestAiPlanning(game);
    },
    recordTutorialAction(action: TutorialAction) {
      update((state) =>
        state.tutorialProgress
          ? persistTutorialProgress(state, recordTutorialAction(state.tutorialProgress, action))
          : state,
      );
    },
    continueTutorial() {
      update((state) =>
        state.tutorialProgress ? persistTutorialProgress(state, continueTutorial(state.tutorialProgress)) : state,
      );
    },
    previousTutorialStep() {
      update((state) => {
        if (!state.tutorialProgress) {
          return state;
        }

        const progress = rewindTutorial(state.tutorialProgress);
        let nextState = persistTutorialProgress(state, progress);
        if (state.activeSlotId === TUTORIAL_SAVE_ID && progress.step === 'opening' && state.game.phase !== 'opening_unlock') {
          const game = buildTutorialOpeningGame();
          saveToSlot(localStorage, TUTORIAL_SAVE_ID, game);
          nextState = {
            ...nextState,
            screen: 'overworld',
            game,
            loadedReplay: null,
            loadedReplayPayload: null,
            loadedBattleReport: null,
            currentStep: -1,
            selectedEvent: null,
            autoPlay: false,
            centerMode: 'rifts',
            systemMessage: null,
            cycleEndConfirmationPending: false,
            cycleAnimation: null,
          };
        }
        if (state.activeSlotId === TUTORIAL_SAVE_ID && progress.step === 'end-cycle') {
          const game = state.cycleAnimation?.sourceGame ?? readTutorialCycleRewindGame();
          if (game) {
            saveToSlot(localStorage, TUTORIAL_SAVE_ID, game);
            nextState = {
              ...nextState,
              screen: 'overworld',
              game,
              loadedReplay: null,
              loadedReplayPayload: null,
              loadedBattleReport: null,
              currentStep: -1,
              selectedEvent: null,
              autoPlay: false,
              centerMode: 'rifts',
              systemMessage: null,
              cycleEndConfirmationPending: false,
              cycleAnimation: null,
            };
          }
        }
        return nextState;
      });
    },
    returnToMainMenu() {
      update((state) => ({
        ...state,
        screen: 'main_menu',
        slots: listSaveSlots(localStorage),
        loadedReplay: null,
        loadedReplayPayload: null,
        loadedBattleReport: null,
        currentStep: -1,
        selectedEvent: null,
        autoPlay: false,
        systemMessage: null,
        cycleEndConfirmationPending: false,
      }));
    },
    claimOpeningTroop(troopUnlockId: TroopUnlockId) {
      update((state) =>
        !canEditGame(state)
          ? state
          : saveActiveCampaign({
              ...clearCycleEndConfirmation(state),
              game: claimOpeningTroop(state.game, troopUnlockId),
            }),
      );
    },
    unclaimOpeningTroop(troopUnlockId: TroopUnlockId) {
      update((state) =>
        !canEditGame(state)
          ? state
          : saveActiveCampaign({
              ...clearCycleEndConfirmation(state),
              game: unclaimOpeningTroop(state.game, troopUnlockId),
            }),
      );
    },
    async startOpeningCampaign() {
      if (snapshot.multiplayer) {
        submitMultiplayerReady();
        return;
      }
      if (snapshot.game.gameMode === 'ladder') {
        const activeSlotId = snapshot.activeSlotId;
        if (!activeSlotId) {
          update((state) => ({ ...state, systemMessage: 'No active save slot is loaded.' }));
          return;
        }
        const preparedGame = startOpeningCampaign(snapshot.game);
        set({
          ...snapshot,
          game: preparedGame,
          systemMessage: 'Drawing Ladder Rift-set...',
          cycleEndConfirmationPending: false,
        });
        try {
          const draw = await drawLadderRiftSet(preparedGame.cycleNumber);
          const game = withLadderDraw(preparedGame, draw);
          saveToSlot(localStorage, activeSlotId, game);
          set({
            ...snapshot,
            game,
            slots: listSaveSlots(localStorage),
            systemMessage: null,
            cycleEndConfirmationPending: false,
          });
        } catch (error) {
          set({
            ...snapshot,
            game: preparedGame,
            systemMessage: `Unable to start Ladder: ${error instanceof Error ? error.message : 'Ladder server unavailable.'}`,
            cycleEndConfirmationPending: false,
          });
        }
        return;
      }
      update((state) =>
        !canEditGame(state)
          ? state
          : saveActiveCampaign({
              ...clearCycleEndConfirmation(state),
              game: startOpeningCampaign(state.game),
              systemMessage: null,
            }),
      );
    },
    claimRaceUnlockOffer(raceId: RaceId) {
      update((state) =>
        !canEditGame(state)
          ? state
          : saveActiveCampaign({
              ...clearCycleEndConfirmation(state),
              game: claimRaceUnlockOffer(state.game, raceId),
              systemMessage: null,
            }),
      );
    },
    claimTroopClassUnlockOffer(troopUnlockId: TroopUnlockId) {
      update((state) =>
        !canEditGame(state)
          ? state
          : saveActiveCampaign({
              ...clearCycleEndConfirmation(state),
              game: claimTroopClassUnlockOffer(state.game, troopUnlockId),
              systemMessage: null,
            }),
      );
    },
    setCenterMode(mode: CenterMode) {
      update((state) => ({ ...state, centerMode: mode }));
    },
    revealEssenceDraft() {
      update((state) =>
        !canEditGame(state)
          ? state
          : saveActiveCampaign({
              ...clearCycleEndConfirmation(state),
              game: revealEssenceDraft(state.game),
            }),
      );
    },
    claimTroopOffer(troopUnlockId: TroopUnlockId) {
      update((state) =>
        !canEditGame(state)
          ? state
          : saveActiveCampaign({
              ...clearCycleEndConfirmation(state),
              game: claimTroopOffer(state.game, troopUnlockId),
            }),
      );
    },
    claimUpgradeOffer(upgradeId: UpgradeId) {
      update((state) =>
        !canEditGame(state)
          ? state
          : saveActiveCampaign({
              ...clearCycleEndConfirmation(state),
              game: claimUpgradeOffer(state.game, upgradeId),
            }),
      );
    },
    assignTroopToRift(troopId: TroopId, riftId: string) {
      update((state) => {
        if (!canEditGame(state)) {
          return state;
        }
        const assignment = canAssignTroopToRift(state.game, troopId, riftId);
        if (!assignment.ok) {
          return {
            ...clearCycleEndConfirmation(state),
            validationMessages: assignment.issues.map((issue) => issue.message),
            systemMessage: null,
          };
        }

        const nextGame = assignTroopToRift(state.game, troopId, riftId);
        return saveActiveCampaign({
          ...clearCycleEndConfirmation(state),
          game: nextGame,
          validationMessages: blockingValidationMessages(nextGame),
          systemMessage: null,
        });
      });
    },
    clearTroopAssignment(troopId: TroopId) {
      update((state) => {
        if (!canEditGame(state)) {
          return state;
        }
        const nextGame = clearTroopAssignment(state.game, troopId);
        return saveActiveCampaign({
          ...clearCycleEndConfirmation(state),
          game: nextGame,
          validationMessages: blockingValidationMessages(nextGame),
        });
      });
    },
    continuePlaying() {
      update((state) =>
        !canEditGame(state)
          ? state
          : saveActiveCampaign({
              ...state,
              game: continuePlaying(state.game),
              cycleEndConfirmationPending: false,
              systemMessage: null,
            }),
      );
    },
    endCycle(force = false) {
      if (snapshot.multiplayer) {
        submitMultiplayerReady();
        return;
      }
      update((state) => {
        if (state.cycleAnimation) {
          return state;
        }
        const hasUnspentEssence = state.game.essence > 0;
        const hasSpendableEssence = state.game.essence > 0 && getEssenceDraftCost(state.game) !== null;
        const hasUnfinishedDraft = !!state.game.activeTroopOffer || !!state.game.activeUpgradeOffer;

        if (hasSpendableEssence || hasUnfinishedDraft) {
          return {
            ...state,
            centerMode: 'troops',
            validationMessages: [],
            systemMessage: hasUnfinishedDraft
              ? 'Finish the active Essence draft before ending the cycle.'
              : 'Spend all Essence before ending the cycle.',
            cycleEndConfirmationPending: false,
          };
        }

        const validation = validateAssignments(state.game);
        const softIssueKinds = new Set(['holding_only_no_new_attack']);
        const blockingIssues = validation.issues.filter((issue) => !softIssueKinds.has(issue.kind));
        const hasNoAssignments = validation.issues.some((issue) => issue.kind === 'no_troops_assigned');
        const hasHoldingOnly = validation.issues.some((issue) => issue.kind === 'holding_only_no_new_attack');
        const hasIdleTroops = validation.issues.some((issue) => issue.kind === 'idle_troops_remaining');

        if (blockingIssues.length > 0) {
          return {
            ...state,
            validationMessages: blockingIssues.map((issue) => issue.message),
            systemMessage: null,
            cycleEndConfirmationPending: false,
          };
        }

        if (!force && (hasNoAssignments || hasHoldingOnly || hasIdleTroops || hasUnspentEssence)) {
          return {
            ...state,
            validationMessages: [],
            systemMessage: buildEndCycleWarning(hasNoAssignments, hasHoldingOnly, hasIdleTroops, hasUnspentEssence),
            cycleEndConfirmationPending: true,
          };
        }

        if (!state.activeSlotId) {
          return { ...state, systemMessage: 'No active save slot is loaded.' };
        }

        if (state.activeSlotId === TUTORIAL_SAVE_ID && state.tutorialProgress?.step === 'end-cycle') {
          writeTutorialCycleRewindGame(state.game);
        }

        const resolution = resolveAssignedRifts(state.game, getPreparedContestAiPlan(state.game));
        if (resolution.records.length > 0) {
          return {
            ...state,
            game: resolution.preparedState ?? state.game,
            validationMessages: [],
            systemMessage: null,
            cycleEndConfirmationPending: false,
            cycleAnimation: {
              sourceGame: state.game,
              resolution,
              activeSlotId: state.activeSlotId,
            },
          };
        }

        try {
          if (state.game.gameMode === 'ladder') {
            const sourceGame = state.game;
            const activeSlotId = state.activeSlotId;
            void applyResolvedCycleToStoreStateWithLadder(state, sourceGame, resolution, activeSlotId)
              .then((nextState) => set(nextState))
              .catch((error) => {
                const message = error instanceof Error ? error.message : 'Unknown storage error.';
                set({
                  ...snapshot,
                  systemMessage: `Unable to end cycle: ${message}`,
                  cycleEndConfirmationPending: false,
                  cycleAnimation: null,
                });
              });
            return {
              ...state,
              systemMessage: 'Resolving Ladder Cycle...',
              cycleEndConfirmationPending: false,
            };
          }
          return applyResolvedCycleToStoreState(state, state.game, resolution, state.activeSlotId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown storage error.';
          return {
            ...state,
            systemMessage: `Unable to end cycle: ${message}`,
            cycleEndConfirmationPending: false,
          };
        }
      });
    },
    async finishCycleAnimation() {
      if (cycleAnimationFinishInFlight) {
        return;
      }
      const animation = snapshot.cycleAnimation;
      if (!animation) {
        return;
      }
      cycleAnimationFinishInFlight = true;
      const { sourceGame, resolution, activeSlotId } = animation;
      if (activeSlotId === null) {
        set({
          ...snapshot,
          cycleAnimation: null,
        });
        cycleAnimationFinishInFlight = false;
        return;
      }
      if (sourceGame.gameMode !== 'ladder') {
        try {
          set(applyResolvedCycleToStoreState(snapshot, sourceGame, resolution, activeSlotId));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown storage error.';
          set({
            ...snapshot,
            systemMessage: `Unable to end cycle: ${message}`,
            cycleEndConfirmationPending: false,
            cycleAnimation: null,
          });
        } finally {
          cycleAnimationFinishInFlight = false;
        }
        return;
      }
      try {
        const nextState = await applyResolvedCycleToStoreStateWithLadder(snapshot, sourceGame, resolution, activeSlotId);
        set(nextState);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown storage error.';
        set({
          ...snapshot,
          systemMessage: `Unable to end cycle: ${message}`,
          cycleEndConfirmationPending: false,
          cycleAnimation: null,
        });
      } finally {
        cycleAnimationFinishInFlight = false;
      }
    },
    openReplay(replayId: string) {
      update((state) => {
        if (state.multiplayer) {
          const loadedReplayPayload = readContestMultiplayerReplayPayload(replayId);
          const loadedReplay = loadedReplayPayload ? resolveBattle(loadedReplayPayload.input) : null;
          if (!loadedReplay) {
            return {
              ...state,
              screen: 'overworld',
              loadedReplay: null,
              loadedReplayPayload: null,
              loadedBattleReport: null,
              currentStep: -1,
              selectedEvent: null,
              autoPlay: false,
              systemMessage: 'This archived battle is only available as a summary.',
            };
          }
          return {
            ...state,
            screen: 'replay',
            loadedReplay,
            loadedReplayPayload,
            loadedBattleReport: null,
            currentStep: -1,
            selectedEvent: null,
            autoPlay: false,
            systemMessage: null,
          };
        }
        if (!state.activeSlotId) {
          return state;
        }

        const loadedReplay = readSlotReplay(localStorage, state.activeSlotId, replayId);
        const loadedReplayPayload = readSlotReplayPayload(localStorage, state.activeSlotId, replayId);
        if (!loadedReplay) {
          return {
            ...state,
            screen: 'overworld',
            loadedReplay: null,
            loadedReplayPayload: null,
            loadedBattleReport: null,
            currentStep: -1,
            selectedEvent: null,
            autoPlay: false,
            systemMessage: 'This archived battle is only available as a summary.',
          };
        }
        return {
          ...state,
          screen: 'replay',
          loadedReplay,
          loadedReplayPayload,
          loadedBattleReport: null,
          currentStep: -1,
          selectedEvent: null,
          autoPlay: false,
          systemMessage: null,
        };
      });
    },
    hasReplay(replayId: string) {
      if (snapshot.multiplayer) {
        return hasContestMultiplayerReplayPayload(replayId);
      }
      return snapshot.activeSlotId ? slotReplayExists(localStorage, snapshot.activeSlotId, replayId) : false;
    },
    getReplay(replayId: string): BattleReplay | null {
      if (snapshot.multiplayer) {
        const payload = readContestMultiplayerReplayPayload(replayId);
        return payload ? resolveBattle(payload.input) : null;
      }
      return snapshot.activeSlotId ? readSlotReplay(localStorage, snapshot.activeSlotId, replayId) : null;
    },
    getReplayPayload(replayId: string): StoredReplayPayload | null {
      if (snapshot.multiplayer) {
        return readContestMultiplayerReplayPayload(replayId);
      }
      return snapshot.activeSlotId ? readSlotReplayPayload(localStorage, snapshot.activeSlotId, replayId) : null;
    },
    createBattleReport(replayId: string, currentStep: number | null, diagnostics: BattleReportDiagnostic[] = []): string | null {
      if (!snapshot.activeSlotId) {
        return null;
      }

      const replay = readSlotReplay(localStorage, snapshot.activeSlotId, replayId);
      const replayPayload = readSlotReplayPayload(localStorage, snapshot.activeSlotId, replayId);
      if (!replay || !replayPayload) {
        return null;
      }

      const replayIndexEntry = snapshot.game.replayIndex.find((entry) => entry.replayId === replayId) ?? null;
      return encodeBattleReport(
        buildBattleReportPayload({
          replay,
          replayPayload,
          replayIndexEntry,
          currentStep,
          diagnostics,
          ...(import.meta.env.MODE ? { buildMode: import.meta.env.MODE } : {}),
        }),
      );
    },
    createLoadedBattleReport(currentStep: number | null, diagnostics: BattleReportDiagnostic[] = []): string | null {
      if (!snapshot.loadedReplay || !snapshot.loadedReplayPayload) {
        return null;
      }

      const replayIndexEntry = snapshot.game.replayIndex.find((entry) => entry.replayId === snapshot.loadedReplay?.id) ?? null;
      return encodeBattleReport(
        buildBattleReportPayload({
          replay: snapshot.loadedReplay,
          replayPayload: snapshot.loadedReplayPayload,
          replayIndexEntry,
          currentStep,
          diagnostics,
          ...(import.meta.env.MODE ? { buildMode: import.meta.env.MODE } : {}),
        }),
      );
    },
    importBattleReport(encodedReport: string): { ok: true; reportId: string } | { ok: false; message: string } {
      const decoded = decodeBattleReport(encodedReport);
      if (!decoded.ok) {
        return { ok: false, message: battleReportDecodeErrorMessage(decoded.error) };
      }

      const replay = replayFromBattleReport(decoded.payload);
      const currentStep =
        typeof decoded.payload.summary.currentStep === 'number'
          ? Math.max(-1, Math.min(decoded.payload.summary.currentStep, replay.steps.length - 1))
          : -1;
      update((state) => ({
        ...state,
        screen: 'replay',
        loadedReplay: replay,
        loadedReplayPayload: decoded.payload.replay,
        loadedBattleReport: decoded.payload,
        currentStep,
        selectedEvent: null,
        autoPlay: false,
        systemMessage: `Imported battle report ${decoded.payload.reportId}.`,
      }));
      return { ok: true, reportId: decoded.payload.reportId };
    },
    createCampaignReport(uiContext: CampaignReportUiContext): string | null {
      if (!snapshot.activeSlotId) {
        return null;
      }

      const { replayPayloads, missingReplayIds } = collectReplayPayloadsForCampaign(snapshot);
      return encodeCampaignReport(
        buildCampaignReportPayload({
          game: snapshot.game,
          replayPayloads,
          missingReplayIds,
          uiContext,
          ...(import.meta.env.MODE ? { buildMode: import.meta.env.MODE } : {}),
        }),
      );
    },
    previewCampaignReport(encodedReport: string): { ok: true; payload: CampaignReportPayload } | { ok: false; message: string } {
      const decoded = decodeCampaignReport(encodedReport);
      if (!decoded.ok) {
        return { ok: false, message: campaignReportDecodeErrorMessage(decoded.error) };
      }
      return { ok: true, payload: decoded.payload };
    },
    importCampaignReport(encodedReport: string, slotId: SaveSlotId): { ok: true; reportId: string } | { ok: false; message: string } {
      const decoded = decodeCampaignReport(encodedReport);
      if (!decoded.ok) {
        return { ok: false, message: campaignReportDecodeErrorMessage(decoded.error) };
      }

      const importedGame = importCampaignReportToSlot(localStorage, slotId, decoded.payload);
      const verification = verifyReplayIndexAgainstStoredPayloads(localStorage, slotId, importedGame);
      const game = verification.game;
      if (verification.game !== importedGame) {
        saveToSlot(localStorage, slotId, game);
      }
      set({
        ...makeInitialState(),
        screen: 'overworld',
        activeSlotId: slotId,
        slots: listSaveSlots(localStorage),
        centerMode: decoded.payload.uiContext.centerMode,
        game,
        systemMessage:
          verification.changedCount > 0
            ? `Imported campaign report ${decoded.payload.reportId} into Slot ${slotId}. ${verification.changedCount} archived ${verification.changedCount === 1 ? 'battle now replays' : 'battles now replay'} with a different result.`
            : `Imported campaign report ${decoded.payload.reportId} into Slot ${slotId}.`,
        validationMessages: [...decoded.payload.uiContext.validationMessages],
      });
      return { ok: true, reportId: decoded.payload.reportId };
    },
    closeReplay() {
      update((state) => ({
        ...state,
        screen: 'overworld',
        loadedReplay: null,
        loadedReplayPayload: null,
        loadedBattleReport: null,
        currentStep: -1,
        selectedEvent: null,
        autoPlay: false,
        systemMessage: null,
      }));
    },
    stepForward() {
      update((state) => {
        if (!state.loadedReplay) {
          return state;
        }
        const currentStep = nextPlayableStep(state.currentStep, state.loadedReplay);
        return {
          ...state,
          currentStep,
          selectedEvent: currentStep >= 0 ? currentStep : null,
        };
      });
    },
    stepBackward() {
      update((state) => {
        if (!state.loadedReplay) {
          return state;
        }
        const currentStep = previousPlayableStep(state.currentStep, state.loadedReplay);
        return {
          ...state,
          currentStep,
          selectedEvent: currentStep >= 0 ? currentStep : null,
        };
      });
    },
    jumpTo(step: number) {
      update((state) => ({
        ...state,
        currentStep: state.loadedReplay ? Math.max(-1, Math.min(step, state.loadedReplay.steps.length - 1)) : -1,
        selectedEvent: null,
      }));
    },
    selectEvent(step: number | null) {
      update((state) => {
        if (!state.loadedReplay) {
          return state;
        }
        if (step === null) {
          return { ...state, selectedEvent: null };
        }
        const clamped = Math.max(0, Math.min(step, state.loadedReplay.steps.length - 1));
        return { ...state, selectedEvent: clamped, currentStep: clamped };
      });
    },
    setAutoPlay(value: boolean) {
      update((state) => ({ ...state, autoPlay: value }));
    },
    setSpeedMs(speedMs: number) {
      update((state) => ({ ...state, speedMs }));
    },
    clearSystemMessage() {
      update((state) => ({ ...state, systemMessage: null, cycleEndConfirmationPending: false }));
    },
  };
})();
