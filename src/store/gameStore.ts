import { writable } from 'svelte/store';
import {
  advanceFromRewards,
  applyCycleOutcomes,
  assignTroopToRift,
  buyFactionUpgrade,
  buyTroopStatUpgrade,
  buyTroopUnit,
  chooseStartingFaction,
  claimRewardChoice,
  clearTroopAssignment,
  resolveAssignedRifts,
  startNewGame,
  unlockFaction,
  unlockTroopType,
  validateAssignments,
} from '../engine/game';
import type {
  BattleReplay,
  FactionId,
  GameState,
  ReplayIndexEntry,
  ReplayPayloadWrite,
  TroopId,
  TroopStatKey,
} from '../engine/types';
import { createNewSlotCampaign, listSaveSlots, loadSaveSlot, migrateLegacySave, readSlotReplay, removeSlotReplay, type SaveSlotId, type SaveSlotSummary, saveToSlot } from './saveSlots';

export type CenterMode = 'rifts' | 'troops';
export type ScreenMode = 'main_menu' | 'overworld' | 'replay';

interface StoreState {
  game: GameState;
  screen: ScreenMode;
  activeSlotId: SaveSlotId | null;
  slots: SaveSlotSummary[];
  centerMode: CenterMode;
  loadedReplay: BattleReplay | null;
  currentStep: number;
  selectedEvent: number | null;
  autoPlay: boolean;
  speedMs: number;
  validationMessages: string[];
  systemMessage: string | null;
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
    currentStep: -1,
    selectedEvent: null,
    autoPlay: false,
    speedMs: 500,
    validationMessages: [],
    systemMessage: null,
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
  return (replayId) => `shiftmake:slot:${slotId}:replay:${replayId}`;
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
      const game = loadSaveSlot(localStorage, slotId);
      if (!game) {
        return false;
      }

      set({
        ...makeInitialState(),
        screen: 'overworld',
        activeSlotId: slotId,
        slots: listSaveSlots(localStorage),
        game,
      });
      return true;
    },
    startNewCampaign(slotId: SaveSlotId) {
      const game = createNewSlotCampaign(localStorage, slotId);
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
        currentStep: -1,
        selectedEvent: null,
        autoPlay: false,
        systemMessage: null,
      }));
    },
    chooseStartingFaction(factionId: FactionId) {
      update((state) => saveActiveCampaign({ ...state, game: chooseStartingFaction(state.game, factionId) }));
    },
    setCenterMode(mode: CenterMode) {
      update((state) => ({ ...state, centerMode: mode }));
    },
    assignTroopToRift(troopId: TroopId, riftId: string) {
      update((state) => {
        const nextGame = assignTroopToRift(state.game, troopId, riftId);
        return saveActiveCampaign({
          ...state,
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
          ...state,
          game: nextGame,
          validationMessages: blockingValidationMessages(nextGame),
        });
      });
    },
    buyTroopUnit(troopId: TroopId) {
      update((state) => saveActiveCampaign({ ...state, game: buyTroopUnit(state.game, troopId) }));
    },
    buyTroopStatUpgrade(troopId: TroopId, stat: TroopStatKey) {
      update((state) => saveActiveCampaign({ ...state, game: buyTroopStatUpgrade(state.game, troopId, stat) }));
    },
    buyFactionUpgrade(upgradeId: string) {
      update((state) => saveActiveCampaign({ ...state, game: buyFactionUpgrade(state.game, upgradeId) }));
    },
    unlockFaction(factionId: FactionId) {
      update((state) => saveActiveCampaign({ ...state, game: unlockFaction(state.game, factionId) }));
    },
    unlockTroopType(factionId: FactionId, unitTypeId: string) {
      update((state) => saveActiveCampaign({ ...state, game: unlockTroopType(state.game, factionId, unitTypeId) }));
    },
    endCycle(force = false) {
      update((state) => {
        const validation = validateAssignments(state.game);
        const blockingIssues = validation.issues.filter((issue) => issue.kind !== 'no_assignments');
        const shouldWarnOnly = !force && validation.issues.some((issue) => issue.kind === 'no_assignments');

        if (blockingIssues.length > 0 || shouldWarnOnly) {
          return { ...state, validationMessages: blockingIssues.map((issue) => issue.message), systemMessage: null };
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
            game: nextGame,
            validationMessages: [],
            systemMessage,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown storage error.';
          return {
            ...state,
            systemMessage: `Unable to end cycle: ${message}`,
          };
        }
      });
    },
    claimReward(choiceId: string, optionId: string) {
      update((state) => saveActiveCampaign({ ...state, game: claimRewardChoice(state.game, choiceId, optionId) }));
    },
    finishRewards() {
      update((state) => saveActiveCampaign({ ...state, game: advanceFromRewards(state.game) }));
    },
    openReplay(replayId: string) {
      update((state) => {
        if (!state.activeSlotId) {
          return state;
        }

        const loadedReplay = readSlotReplay(localStorage, state.activeSlotId, replayId);
        if (!loadedReplay) {
          return {
            ...state,
            screen: 'overworld',
            loadedReplay: null,
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
    closeReplay() {
      update((state) => ({
        ...state,
        screen: 'overworld',
        loadedReplay: null,
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
          currentStep: Math.min(state.currentStep + 1, state.loadedReplay.steps.length - 1),
          selectedEvent: null,
        };
      });
    },
    stepBackward() {
      update((state) => ({
        ...state,
        currentStep: Math.max(-1, state.currentStep - 1),
        selectedEvent: null,
      }));
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
      update((state) => ({ ...state, systemMessage: null }));
    },
  };
})();
