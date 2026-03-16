import { writable } from 'svelte/store';
import { resolveDebugBattle } from '../engine/battle';
import { getTroopStartingQuantity, TROOP_TYPE_IDS } from '../engine/unitCatalog';
import type { BattleReplay, TroopTypeId } from '../engine/types';
import type { ArmyDebugSelection } from '../engine/debugTypes';
import { nextPlayableStep, previousPlayableStep } from './replayNavigation';

interface DebugState {
  player: ArmyDebugSelection;
  enemy: ArmyDebugSelection;
  seedInput: string;
  replay: BattleReplay | null;
  currentStep: number;
  selectedEvent: number | null;
  autoPlay: boolean;
  speedMs: number;
}

function createDefaultArmy(): ArmyDebugSelection {
  const defaults = Object.fromEntries(TROOP_TYPE_IDS.map((troopId) => [troopId, 0])) as ArmyDebugSelection;

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
  replay: null,
  currentStep: -1,
  selectedEvent: null,
  autoPlay: false,
  speedMs: 500,
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
  });
}

function clampCount(value: number): number {
  return Math.max(0, Math.min(40, Math.floor(value)));
}

export const debugBattleStore = (() => {
  const { subscribe, update } = writable<DebugState>(initialState);

  return {
    subscribe,
    setArmy(side: 'player' | 'enemy', key: TroopTypeId, value: number) {
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
