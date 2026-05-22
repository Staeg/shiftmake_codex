import { writable } from 'svelte/store';
import {
  applyCycleOutcomes,
  assignTroopToRift,
  canAssignTroopToRift,
  claimFactionUnlockOffer,
  claimOpeningTroop,
  claimTroopOffer,
  claimTroopTypeUnlockOffer,
  claimUpgradeOffer,
  clearTroopAssignment,
  continuePlaying,
  resolveAssignedRifts,
  revealEssenceDraft,
  startOpeningCampaign,
  startNewGame,
  unclaimOpeningTroop,
  validateAssignments,
} from '../engine/game';
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
  FactionId,
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
} from '../engine/types';
import {
  createNewSlotCampaign,
  getSlotReplayStorageKey,
  importCampaignReportToSlot,
  listSaveSlots,
  loadSaveSlot,
  migrateLegacySave,
  readSlotReplay,
  readSlotReplayPayload,
  removeSlotReplay,
  type SaveSlotId,
  type SaveSlotSummary,
  saveToSlot,
  verifyReplayIndexAgainstStoredPayloads,
} from './saveSlots';
import { nextPlayableStep, previousPlayableStep } from './replayNavigation';
import { describeTroopUnlock } from '../engine/upgrades';
import { buildContestMultiplayerSubmission, DEFAULT_CONTEST_PLAYER_NAMES, type ContestPlayerNames } from '../engine/multiplayerContest';
import { buildContestAiPlanKey, type ContestAiWorkerResponse } from './contestAiPlanner';

export type CenterMode = 'rifts' | 'troops' | 'contest';
export type ScreenMode = 'main_menu' | 'overworld' | 'replay';

interface CycleAnimationState {
  sourceGame: GameState;
  resolution: CycleResolution;
  activeSlotId: SaveSlotId;
}

interface StoreState {
  game: GameState;
  screen: ScreenMode;
  activeSlotId: SaveSlotId | null;
  slots: SaveSlotSummary[];
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

interface MultiplayerSession {
  connected: boolean;
  serverUrl: string;
  roomId: string | null;
  playerId: 'human' | 'ai' | null;
  playerToken: string | null;
  readiness: { human: boolean; ai: boolean };
  connectedPlayers: { human: boolean; ai: boolean };
  playerNames: ContestPlayerNames;
  message: string | null;
}

type MultiplayerServerMessage =
  | {
      kind: 'room-snapshot';
      roomId: string;
      playerId: 'human' | 'ai';
      playerToken: string;
      game: GameState;
      readiness: { human: boolean; ai: boolean };
      connectedPlayers?: { human: boolean; ai: boolean };
      playerNames: ContestPlayerNames;
      replayPayloads: Record<string, StoredReplayPayload>;
      message: string | null;
    }
  | { kind: 'room-error'; message: string };

let multiplayerSocket: WebSocket | null = null;
let multiplayerReplayPayloads: Record<string, StoredReplayPayload> = {};

interface StoredMultiplayerIdentity {
  serverUrl: string;
  roomId: string;
  playerId: 'human' | 'ai';
  playerToken: string;
}

const MULTIPLAYER_IDENTITY_KEY_PREFIX = 'shiftmake:multiplayer:contest:identity:';
const MULTIPLAYER_LAST_PLAYER_NAME_KEY = 'shiftmake:multiplayer:contest:last-player-name';
const MULTIPLAYER_LAST_SERVER_URL_KEY = 'shiftmake:multiplayer:contest:last-server-url';

function multiplayerIdentityStorageKey(serverUrl: string, roomId: string): string {
  return `${MULTIPLAYER_IDENTITY_KEY_PREFIX}${serverUrl}|${roomId}`;
}

function readStoredMultiplayerIdentity(serverUrl: string, roomId: string | undefined): StoredMultiplayerIdentity | null {
  if (!roomId || typeof sessionStorage === 'undefined') {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(multiplayerIdentityStorageKey(serverUrl, roomId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredMultiplayerIdentity>;
    if (
      parsed.serverUrl === serverUrl &&
      parsed.roomId === roomId &&
      (parsed.playerId === 'human' || parsed.playerId === 'ai') &&
      typeof parsed.playerToken === 'string' &&
      parsed.playerToken
    ) {
      return {
        serverUrl,
        roomId,
        playerId: parsed.playerId,
        playerToken: parsed.playerToken,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function writeStoredMultiplayerIdentity(identity: StoredMultiplayerIdentity): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(multiplayerIdentityStorageKey(identity.serverUrl, identity.roomId), JSON.stringify(identity));
  } catch {
    // Session storage is a convenience for refresh reconnects; live memory still has the token.
  }
}

function readStoredString(key: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const value = localStorage.getItem(key)?.trim() ?? '';
    return value || null;
  } catch {
    return null;
  }
}

function writeStoredString(key: string, value: string | undefined): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return;
  }
  try {
    localStorage.setItem(key, trimmed);
  } catch {
    // Multiplayer preferences are convenience-only and should never block room flow.
  }
}

export function readLastMultiplayerPlayerName(): string | null {
  return readStoredString(MULTIPLAYER_LAST_PLAYER_NAME_KEY);
}

export function readLastMultiplayerServerUrl(): string | null {
  return readStoredString(MULTIPLAYER_LAST_SERVER_URL_KEY);
}

function persistMultiplayerPreferences(serverUrl: string, playerName?: string): void {
  writeStoredString(MULTIPLAYER_LAST_SERVER_URL_KEY, serverUrl);
  writeStoredString(MULTIPLAYER_LAST_PLAYER_NAME_KEY, playerName);
}

function isMultiplayerSubmitted(state: StoreState): boolean {
  const playerId = state.multiplayer?.playerId;
  return !!playerId && !!state.multiplayer?.readiness[playerId];
}

function canEditGame(state: StoreState): boolean {
  return !state.multiplayer || !isMultiplayerSubmitted(state);
}

function shouldPreserveUnsubmittedMultiplayerGame(state: StoreState, message: Extract<MultiplayerServerMessage, { kind: 'room-snapshot' }>): boolean {
  const session = state.multiplayer;
  if (!session?.connected || state.screen === 'main_menu' || session.roomId !== message.roomId || session.playerId !== message.playerId) {
    return false;
  }
  return !isMultiplayerSubmitted(state);
}

function closeMultiplayerSocket(options: { notifyServer: boolean } = { notifyServer: false }): void {
  const socket = multiplayerSocket;
  multiplayerSocket = null;
  if (!socket) {
    return;
  }
  if (options.notifyServer && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ kind: 'leave-room' }));
  }
  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = null;
  socket.close();
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

function slotReplayStorageKey(slotId: SaveSlotId): (replayId: string) => string {
  return (replayId) => getSlotReplayStorageKey(slotId, replayId);
}

function blockingValidationMessages(state: GameState): string[] {
  return validateAssignments(state).issues
    .filter((issue) => issue.kind !== 'no_troops_assigned' && issue.kind !== 'holding_only_no_new_attack' && issue.kind !== 'idle_troops_remaining')
    .map((issue) => issue.message);
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

function buildUnlockedTroopMessage(troopUnlockIds: string[]): string | null {
  if (troopUnlockIds.length === 0) {
    return null;
  }

  if (troopUnlockIds.length === 1) {
    return `New troop unlock available: ${describeTroopUnlock(troopUnlockIds[0])}.`;
  }

  return `New troop unlocks available: ${troopUnlockIds.map((troopUnlockId) => describeTroopUnlock(troopUnlockId)).join(', ')}.`;
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

  const unlockedTroopMessage = buildUnlockedTroopMessage(applied.newlyUnlockedTroopUnlockIds);
  let systemMessage: string | null = unlockedTroopMessage;
  if (replayWriteResult.failedReplayIds.size > 0) {
    systemMessage = unlockedTroopMessage
      ? `${unlockedTroopMessage} Cycle ended, but replay storage is full. Some archived battles were saved as summaries only.`
      : 'Cycle ended, but replay storage is full. Some archived battles were saved as summaries only.';
  } else if (replayWriteResult.evictedReplayIds.length > 0) {
    systemMessage =
      replayWriteResult.evictedReplayIds.length === 1
        ? `${unlockedTroopMessage ? `${unlockedTroopMessage} ` : ''}Replay storage was full, so the oldest saved battle was reduced to a summary to keep the latest replay.`
        : `${unlockedTroopMessage ? `${unlockedTroopMessage} ` : ''}Replay storage was full, so ${replayWriteResult.evictedReplayIds.length} older saved battles were reduced to summaries to keep the latest replays.`;
  } else if (replayWriteResult.quotaExceeded) {
    systemMessage = unlockedTroopMessage
      ? `${unlockedTroopMessage} Replay storage is nearly full, but the newest battle was saved.`
      : 'Replay storage is nearly full, but the newest battle was saved.';
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

  subscribe((state) => {
    snapshot = state;
  });

  function connectMultiplayerContest(serverUrl: string, roomId?: string, playerName?: string): void {
    closeMultiplayerSocket();
    multiplayerReplayPayloads = {};
    persistMultiplayerPreferences(serverUrl, playerName);
    const storedIdentity = readStoredMultiplayerIdentity(serverUrl, roomId);
    const socket = new WebSocket(serverUrl);
    multiplayerSocket = socket;

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

    socket.onopen = () => {
      socket.send(
        JSON.stringify(
          storedIdentity
            ? { kind: 'reconnect-room', roomId: storedIdentity.roomId, playerId: storedIdentity.playerId, token: storedIdentity.playerToken, playerName }
            : roomId
              ? { kind: 'join-room', roomId, playerName }
              : { kind: 'create-room', playerName },
        ),
      );
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as MultiplayerServerMessage;
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

      multiplayerReplayPayloads = {
        ...multiplayerReplayPayloads,
        ...message.replayPayloads,
      };
      writeStoredMultiplayerIdentity({
        serverUrl,
        roomId: message.roomId,
        playerId: message.playerId,
        playerToken: message.playerToken,
      });
      update((state) => ({
        ...state,
        screen: state.screen === 'main_menu' ? 'overworld' : state.screen,
        activeSlotId: null,
        game: shouldPreserveUnsubmittedMultiplayerGame(state, message) ? state.game : message.game,
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
        systemMessage: message.message,
        cycleEndConfirmationPending: false,
      }));
    };

    socket.onclose = () => {
      update((state) => ({
        ...state,
        multiplayer: state.multiplayer ? { ...state.multiplayer, connected: false, message: 'Disconnected from multiplayer server.' } : state.multiplayer,
        systemMessage: state.multiplayer ? 'Disconnected from multiplayer server.' : state.systemMessage,
      }));
    };

    socket.onerror = () => {
      update((state) => ({
        ...state,
        systemMessage: 'Unable to connect to multiplayer server.',
        multiplayer: state.multiplayer ? { ...state.multiplayer, message: 'Unable to connect to multiplayer server.' } : state.multiplayer,
      }));
    };
  }

  function submitMultiplayerReady(): void {
    if (!snapshot.multiplayer || !snapshot.multiplayer.connected || !multiplayerSocket || multiplayerSocket.readyState !== WebSocket.OPEN) {
      update((state) => ({ ...state, systemMessage: 'No multiplayer room is connected.' }));
      return;
    }
    if (isMultiplayerSubmitted(snapshot)) {
      return;
    }
    multiplayerSocket.send(JSON.stringify({ kind: 'submit-ready', submission: buildContestMultiplayerSubmission(snapshot.game) }));
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
      systemMessage: 'Ready submitted. Waiting for the other player.',
    }));
  }

  function cancelMultiplayerReady(): void {
    if (!snapshot.multiplayer || !snapshot.multiplayer.connected || !multiplayerSocket || multiplayerSocket.readyState !== WebSocket.OPEN) {
      update((state) => ({ ...state, systemMessage: 'No multiplayer room is connected.' }));
      return;
    }
    const playerId = snapshot.multiplayer.playerId;
    if (!playerId || !snapshot.multiplayer.readiness[playerId]) {
      return;
    }
    multiplayerSocket.send(JSON.stringify({ kind: 'unsubmit-ready' }));
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
      systemMessage: 'Ready canceled.',
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
      multiplayerReplayPayloads = {};
      set({
        ...makeInitialState(),
        slots: listSaveSlots(localStorage),
        systemMessage: 'Left multiplayer room.',
      });
    },
    loadSlot(slotId: SaveSlotId) {
      const loadedGame = loadSaveSlot(localStorage, slotId);
      if (!loadedGame) {
        return false;
      }
      const verification = verifyReplayIndexAgainstStoredPayloads(localStorage, slotId, loadedGame);
      const game = verification.game;
      if (verification.game !== loadedGame) {
        saveToSlot(localStorage, slotId, game);
      }

      set({
        ...makeInitialState(),
        screen: 'overworld',
        activeSlotId: slotId,
        slots: listSaveSlots(localStorage),
        game,
        systemMessage:
          verification.changedCount > 0
            ? `${verification.changedCount} archived ${verification.changedCount === 1 ? 'battle now replays' : 'battles now replay'} with a different result.`
            : null,
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
    startOpeningCampaign() {
      if (snapshot.multiplayer) {
        submitMultiplayerReady();
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
    claimFactionUnlockOffer(factionId: FactionId) {
      update((state) =>
        !canEditGame(state)
          ? state
          : saveActiveCampaign({
              ...clearCycleEndConfirmation(state),
              game: claimFactionUnlockOffer(state.game, factionId),
              systemMessage: null,
            }),
      );
    },
    claimTroopTypeUnlockOffer(troopUnlockId: TroopUnlockId) {
      update((state) =>
        !canEditGame(state)
          ? state
          : saveActiveCampaign({
              ...clearCycleEndConfirmation(state),
              game: claimTroopTypeUnlockOffer(state.game, troopUnlockId),
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
        const validation = validateAssignments(state.game);
        const softIssueKinds = new Set(['no_troops_assigned', 'holding_only_no_new_attack', 'idle_troops_remaining']);
        const blockingIssues = validation.issues.filter((issue) => !softIssueKinds.has(issue.kind));
        const hasNoAssignments = validation.issues.some((issue) => issue.kind === 'no_troops_assigned');
        const hasHoldingOnly = validation.issues.some((issue) => issue.kind === 'holding_only_no_new_attack');
        const hasIdleTroops = validation.issues.some((issue) => issue.kind === 'idle_troops_remaining');
        const hasUnspentEssence = state.game.essence > 0;

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
    finishCycleAnimation() {
      update((state) => {
        if (!state.cycleAnimation) {
          return state;
        }
        const { sourceGame, resolution, activeSlotId } = state.cycleAnimation;
        try {
          return applyResolvedCycleToStoreState(state, sourceGame, resolution, activeSlotId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown storage error.';
          return {
            ...state,
            systemMessage: `Unable to end cycle: ${message}`,
            cycleEndConfirmationPending: false,
            cycleAnimation: null,
          };
        }
      });
    },
    openReplay(replayId: string) {
      update((state) => {
        if (state.multiplayer) {
          const loadedReplayPayload = multiplayerReplayPayloads[replayId] ?? null;
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
        return !!multiplayerReplayPayloads[replayId];
      }
      return snapshot.activeSlotId ? readSlotReplay(localStorage, snapshot.activeSlotId, replayId) !== null : false;
    },
    getReplay(replayId: string): BattleReplay | null {
      if (snapshot.multiplayer) {
        const payload = multiplayerReplayPayloads[replayId] ?? null;
        return payload ? resolveBattle(payload.input) : null;
      }
      return snapshot.activeSlotId ? readSlotReplay(localStorage, snapshot.activeSlotId, replayId) : null;
    },
    getReplayPayload(replayId: string): StoredReplayPayload | null {
      if (snapshot.multiplayer) {
        return multiplayerReplayPayloads[replayId] ?? null;
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
        return {
          ...state,
          currentStep: nextPlayableStep(state.currentStep, state.loadedReplay),
          selectedEvent: null,
        };
      });
    },
    stepBackward() {
      update((state) => {
        if (!state.loadedReplay) {
          return state;
        }
        return {
          ...state,
          currentStep: previousPlayableStep(state.currentStep, state.loadedReplay),
          selectedEvent: null,
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
