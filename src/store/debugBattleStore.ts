import { writable } from 'svelte/store';
import { resolveDebugBattle } from '../engine/battle';
import { getTroopStartingQuantity, UNIT_CLASS_IDS } from '../engine/unitCatalog';
import type { BattleReplay, UnitClassId } from '../engine/types';
import type { ArmyDebugSelection } from '../engine/debugTypes';
import { nextPlayableStep, previousPlayableStep } from './replayNavigation';

interface DebugState {
  player: ArmyDebugSelection;
  enemy: ArmyDebugSelection;
  seedInput: string;
  playerRaceUpgradeIds: string[];
  playerTroopClassUpgradeIds: string[];
  enemyRaceUpgradeIds: string[];
  enemyTroopClassUpgradeIds: string[];
  replay: BattleReplay | null;
  currentStep: number;
  selectedEvent: number | null;
  autoPlay: boolean;
  speedMs: number;
}

function createDefaultArmy(): ArmyDebugSelection {
  const defaults = Object.fromEntries(UNIT_CLASS_IDS.map((troopId) => [troopId, 0])) as ArmyDebugSelection;

  if ('human/soldier' in defaults) {
    defaults['human/soldier'] = getTroopStartingQuantity('human/soldier');
  }
  if ('human/militia' in defaults) {
    defaults['human/militia'] = getTroopStartingQuantity('human/militia');
  }
  if ('elf/archer' in defaults) {
    defaults['elf/archer'] = getTroopStartingQuantity('elf/archer');
  }

  return defaults;
}

const DEFAULT_ARMY = createDefaultArmy();

const initialState: DebugState = {
  player: { ...DEFAULT_ARMY },
  enemy: { ...DEFAULT_ARMY },
  seedInput: '',
  playerRaceUpgradeIds: [],
  playerTroopClassUpgradeIds: [],
  enemyRaceUpgradeIds: [],
  enemyTroopClassUpgradeIds: [],
  replay: null,
  currentStep: -1,
  selectedEvent: null,
  autoPlay: false,
  speedMs: 8,
};

function parseSeed(raw: string): number | undefined {
  if (raw.trim().length === 0) {
    return undefined;
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return Math.floor(numeric) >>> 0;
}

function makeReplay(state: DebugState): BattleReplay {
  return resolveDebugBattle({
    seed: parseSeed(state.seedInput),
    player: state.player,
    enemy: state.enemy,
    playerRaceUpgradeIds: state.playerRaceUpgradeIds,
    playerTroopClassUpgradeIds: state.playerTroopClassUpgradeIds,
    enemyRaceUpgradeIds: state.enemyRaceUpgradeIds,
    enemyTroopClassUpgradeIds: state.enemyTroopClassUpgradeIds,
  });
}

function clampCount(value: number): number {
  return Math.max(0, Math.min(40, Math.floor(value)));
}

export const debugBattleStore = (() => {
  const { subscribe, update } = writable<DebugState>(initialState);

  return {
    subscribe,
    setArmy(side: 'player' | 'enemy', key: UnitClassId, value: number) {
      update((state) => ({
        ...state,
        [side]: {
          ...state[side],
          [key]: clampCount(value),
        },
      }));
    },
    setSeed(value: string) {
      update((state) => ({ ...state, seedInput: value }));
    },
    loadSetup(setup: {
      player: ArmyDebugSelection;
      enemy: ArmyDebugSelection;
      seedInput: string;
      playerRaceUpgradeIds?: string[];
      playerTroopClassUpgradeIds?: string[];
      enemyRaceUpgradeIds?: string[];
      enemyTroopClassUpgradeIds?: string[];
    }) {
      update((state) => ({
        ...state,
        player: { ...setup.player },
        enemy: { ...setup.enemy },
        seedInput: setup.seedInput,
        playerRaceUpgradeIds: [...(setup.playerRaceUpgradeIds ?? [])],
        playerTroopClassUpgradeIds: [...(setup.playerTroopClassUpgradeIds ?? [])],
        enemyRaceUpgradeIds: [...(setup.enemyRaceUpgradeIds ?? [])],
        enemyTroopClassUpgradeIds: [...(setup.enemyTroopClassUpgradeIds ?? [])],
        replay: null,
        currentStep: -1,
        selectedEvent: null,
        autoPlay: false,
      }));
    },
    runBattle() {
      update((state) => {
        const replay = makeReplay(state);
        return {
          ...state,
          replay,
          currentStep: -1,
          selectedEvent: null,
          autoPlay: false,
        };
      });
    },
    restart() {
      update((state) => {
        if (!state.replay) {
          return state;
        }
        const replay = resolveDebugBattle({
          seed: state.replay.seed,
          player: state.player,
          enemy: state.enemy,
          playerRaceUpgradeIds: state.playerRaceUpgradeIds,
          playerTroopClassUpgradeIds: state.playerTroopClassUpgradeIds,
          enemyRaceUpgradeIds: state.enemyRaceUpgradeIds,
          enemyTroopClassUpgradeIds: state.enemyTroopClassUpgradeIds,
        });
        return {
          ...state,
          replay,
          currentStep: -1,
          selectedEvent: null,
          autoPlay: false,
        };
      });
    },
    stepForward() {
      update((state) => {
        if (!state.replay) {
          return state;
        }

        const nextStep = nextPlayableStep(state.currentStep, state.replay);
        if (nextStep <= state.currentStep) {
          return state;
        }

        return {
          ...state,
          currentStep: nextStep,
          selectedEvent: null,
        };
      });
    },
    stepBackward() {
      update((state) => {
        if (!state.replay) {
          return state;
        }

        const nextStep = previousPlayableStep(state.currentStep, state.replay);
        return {
          ...state,
          currentStep: nextStep,
          selectedEvent: null,
        };
      });
    },
    jumpTo(step: number) {
      update((state) => {
        if (!state.replay) {
          return state;
        }
        const nextStep = Math.max(-1, Math.min(step, state.replay.steps.length - 1));
        return {
          ...state,
          currentStep: nextStep,
          selectedEvent: null,
        };
      });
    },
    selectEvent(step: number | null) {
      update((state) => {
        if (!state.replay) {
          return state;
        }
        if (step === null) {
          return {
            ...state,
            selectedEvent: null,
          };
        }
        const clamped = Math.max(0, Math.min(step, state.replay.steps.length - 1));
        return {
          ...state,
          selectedEvent: clamped,
          currentStep: clamped,
        };
      });
    },
    setAutoPlay(value: boolean) {
      update((state) => ({ ...state, autoPlay: value }));
    },
    setSpeedMs(speedMs: number) {
      update((state) => ({ ...state, speedMs }));
    },
  };
})();
