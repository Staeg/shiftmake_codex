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
  GameState,
  ReplayIndexEntry,
  ReplayPayloadWrite,
  StoredReplayPayload,
  TroopId,
  TroopUnlockId,
  UpgradeId,
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

export type CenterMode = 'rifts' | 'troops';
export type ScreenMode = 'main_menu' | 'overworld' | 'replay';

interface StoreState {
  game: GameState;
  screen: ScreenMode;
  activeSlotId: SaveSlotId | null;
  slots: SaveSlotSummary[];
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
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface ReplayWriteResult {
  replayIndex: ReplayIndexEntry[];
  failedReplayIds: Set<string>;
  quotaExceeded: boolean;
  evictedReplayIds: string[];
}

const REPLAY_IDENTITY_KEY = (replayId: string): string => replayId;

function makeInitialGame(): GameState {
  return startNewGame(1);
}

function makeInitialState(): StoreState {
  return {
    game: makeInitialGame(),
    screen: 'main_menu',
    activeSlotId: null,
    slots: [],
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
  if (!state.activeSlotId) {
    return state;
  }

  saveToSlot(localStorage, state.activeSlotId, state.game);
  return {
    ...state,
    slots: listSaveSlots(localStorage),
  };
}

function slotReplayStorageKey(slotId: SaveSlotId): (replayId: string) => string {
  return (replayId) => getSlotReplayStorageKey(slotId, replayId);
}

function blockingValidationMessages(state: GameState): string[] {
  return validateAssignments(state).issues.filter((issue) => issue.kind !== 'no_assignments').map((issue) => issue.message);
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

function buildEndCycleWarning(hasNoAssignments: boolean, hasUnspentEssence: boolean): string {
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

  return {
    subscribe,
    initialize() {
      const slots = migrateLegacySave(localStorage);
      set({
        ...makeInitialState(),
        slots,
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
      return true;
    },
    startNewCampaign(slotId: SaveSlotId) {
      const game = createNewSlotCampaign(localStorage, slotId, Date.now() >>> 0);
      set({
        ...makeInitialState(),
        screen: 'overworld',
        activeSlotId: slotId,
        slots: listSaveSlots(localStorage),
        game,
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
        saveActiveCampaign({
          ...clearCycleEndConfirmation(state),
          game: claimOpeningTroop(state.game, troopUnlockId),
        }),
      );
    },
    unclaimOpeningTroop(troopUnlockId: TroopUnlockId) {
      update((state) =>
        saveActiveCampaign({
          ...clearCycleEndConfirmation(state),
          game: unclaimOpeningTroop(state.game, troopUnlockId),
        }),
      );
    },
    startOpeningCampaign() {
      update((state) =>
        saveActiveCampaign({
          ...clearCycleEndConfirmation(state),
          game: startOpeningCampaign(state.game),
          systemMessage: null,
        }),
      );
    },
    claimFactionUnlockOffer(factionId: FactionId) {
      update((state) =>
        saveActiveCampaign({
          ...clearCycleEndConfirmation(state),
          game: claimFactionUnlockOffer(state.game, factionId),
          systemMessage: null,
        }),
      );
    },
    claimTroopTypeUnlockOffer(troopUnlockId: TroopUnlockId) {
      update((state) =>
        saveActiveCampaign({
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
        saveActiveCampaign({
          ...clearCycleEndConfirmation(state),
          game: revealEssenceDraft(state.game),
        }),
      );
    },
    claimTroopOffer(troopUnlockId: TroopUnlockId) {
      update((state) =>
        saveActiveCampaign({
          ...clearCycleEndConfirmation(state),
          game: claimTroopOffer(state.game, troopUnlockId),
        }),
      );
    },
    claimUpgradeOffer(upgradeId: UpgradeId) {
      update((state) =>
        saveActiveCampaign({
          ...clearCycleEndConfirmation(state),
          game: claimUpgradeOffer(state.game, upgradeId),
        }),
      );
    },
    assignTroopToRift(troopId: TroopId, riftId: string) {
      update((state) => {
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
        saveActiveCampaign({
          ...state,
          game: continuePlaying(state.game),
          cycleEndConfirmationPending: false,
          systemMessage: null,
        }),
      );
    },
    endCycle(force = false) {
      update((state) => {
        const validation = validateAssignments(state.game);
        const blockingIssues = validation.issues.filter((issue) => issue.kind !== 'no_assignments');
        const hasNoAssignments = validation.issues.some((issue) => issue.kind === 'no_assignments');
        const hasUnspentEssence = state.game.essence > 0;

        if (blockingIssues.length > 0) {
          return {
            ...state,
            validationMessages: blockingIssues.map((issue) => issue.message),
            systemMessage: null,
            cycleEndConfirmationPending: false,
          };
        }

        if (!force && (hasNoAssignments || hasUnspentEssence)) {
          return {
            ...state,
            validationMessages: [],
            systemMessage: buildEndCycleWarning(hasNoAssignments, hasUnspentEssence),
            cycleEndConfirmationPending: true,
          };
        }

        if (!state.activeSlotId) {
          return { ...state, systemMessage: 'No active save slot is loaded.' };
        }

        const resolution = resolveAssignedRifts(state.game);
        try {
          const applied = applyCycleOutcomes(state.game, resolution);
          applied.replayPayloadDeletes.forEach((entry) => removeSlotReplay(localStorage, state.activeSlotId as SaveSlotId, entry.replayId));
          const replayWriteResult = persistReplayPayloadWrites(
            localStorage,
            applied.nextState.replayIndex,
            applied.replayPayloadWrites,
            slotReplayStorageKey(state.activeSlotId),
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
            game: nextGame,
            validationMessages: [],
            systemMessage,
            cycleEndConfirmationPending: false,
          });
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
    openReplay(replayId: string) {
      update((state) => {
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
      return snapshot.activeSlotId ? readSlotReplay(localStorage, snapshot.activeSlotId, replayId) !== null : false;
    },
    getReplay(replayId: string): BattleReplay | null {
      return snapshot.activeSlotId ? readSlotReplay(localStorage, snapshot.activeSlotId, replayId) : null;
    },
    getReplayPayload(replayId: string): StoredReplayPayload | null {
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
