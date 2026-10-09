import { writable } from 'svelte/store';
import type { GameState, EssenceDraftRerollSide, TroopUnlockId, UpgradeId } from '../engine/types';
import type { DetailCard } from './detailCards';

export interface EssenceDraftState {
  selectedTroop: TroopUnlockId | null;
  selectedUpgrade: UpgradeId | null;
  confirmedTroop: TroopUnlockId | null;
  confirmedUpgrade: UpgradeId | null;
  hoveredUpgrade: UpgradeId | null;
  hoveredReroll: EssenceDraftRerollSide | null;
}

export interface EssenceDraftCommands {
  claimTroop(id: TroopUnlockId): void;
  claimUpgrade(id: UpgradeId): void;
  reroll(side: EssenceDraftRerollSide): void;
  pin(detail: DetailCard | null): void;
}

function emptyState(): EssenceDraftState {
  return { selectedTroop: null, selectedUpgrade: null, confirmedTroop: null,
    confirmedUpgrade: null, hoveredUpgrade: null, hoveredReroll: null };
}

// One presentation-state owner shared by the draft surface and planning highlights.
export function createEssenceDraftSession(commands: EssenceDraftCommands) {
  let state = emptyState();
  let game: GameState | null = null;
  let contextKey: string | null = null;
  let disabled = false;
  const store = writable(state);

  function update(patch: Partial<EssenceDraftState>): void {
    if (Object.entries(patch).every(([key, value]) => state[key as keyof EssenceDraftState] === value)) return;
    state = { ...state, ...patch };
    store.set(state);
  }

  function canReroll(side: EssenceDraftRerollSide): boolean {
    return !!game && game.phase === 'planning' && !disabled && !game.essenceDraftRerollUsed &&
      !!(side === 'troop' ? game.activeTroopOffer : game.activeUpgradeOffer);
  }

  return {
    subscribe: store.subscribe,
    synchronize(nextGame: GameState, nextContextKey: string, nextDisabled: boolean): void {
      game = nextGame;
      disabled = nextDisabled;
      const next = contextKey !== nextContextKey ? emptyState() : { ...state };
      contextKey = nextContextKey;
      if (next.selectedTroop && !game.activeTroopOffer?.optionTroopUnlockIds.includes(next.selectedTroop)) next.selectedTroop = null;
      if (next.selectedUpgrade && !game.activeUpgradeOffer?.optionUpgradeIds.includes(next.selectedUpgrade)) next.selectedUpgrade = null;
      if (next.hoveredUpgrade && !game.activeUpgradeOffer?.optionUpgradeIds.includes(next.hoveredUpgrade)) next.hoveredUpgrade = null;
      if (game.activeTroopOffer) next.confirmedTroop = null;
      if (game.activeUpgradeOffer) next.confirmedUpgrade = null;
      if (game.essenceDraftRerollUsed) next.hoveredReroll = null;
      update(next);
    },
    resetSelections(): void {
      update({ selectedTroop: null, selectedUpgrade: null, hoveredUpgrade: null, hoveredReroll: null });
    },
    selectTroop(id: TroopUnlockId, detail: DetailCard): void {
      if (disabled || game?.phase !== 'planning' || !game.activeTroopOffer?.optionTroopUnlockIds.includes(id)) return;
      const selectedTroop = state.selectedTroop === id ? null : id;
      update({ selectedTroop });
      commands.pin(selectedTroop ? detail : null);
    },
    selectUpgrade(id: UpgradeId, detail: DetailCard): void {
      if (disabled || game?.phase !== 'planning' || !game.activeUpgradeOffer?.optionUpgradeIds.includes(id)) return;
      const selectedUpgrade = state.selectedUpgrade === id ? null : id;
      update({ selectedUpgrade });
      commands.pin(selectedUpgrade ? detail : null);
    },
    hoverUpgrade(id: UpgradeId | null): void {
      update({ hoveredUpgrade: id && game?.activeUpgradeOffer?.optionUpgradeIds.includes(id) ? id : null });
    },
    hoverReroll(side: EssenceDraftRerollSide | null): void {
      update({ hoveredReroll: side && canReroll(side) ? side : null });
    },
    canReroll,
    reroll(side: EssenceDraftRerollSide): void {
      if (!canReroll(side)) return;
      update(side === 'troop' ? { selectedTroop: null, hoveredReroll: null } :
        { selectedUpgrade: null, hoveredUpgrade: null, hoveredReroll: null });
      commands.reroll(side);
      commands.pin(null);
    },
    confirmTroop(): void {
      const id = state.selectedTroop;
      if (disabled || game?.phase !== 'planning' || !id || !game.activeTroopOffer?.optionTroopUnlockIds.includes(id)) return;
      update({ confirmedTroop: id, selectedTroop: null });
      commands.claimTroop(id);
      commands.pin(null);
    },
    confirmUpgrade(): void {
      const id = state.selectedUpgrade;
      if (disabled || game?.phase !== 'planning' || !id || !game.activeUpgradeOffer?.optionUpgradeIds.includes(id)) return;
      update({ confirmedUpgrade: id, selectedUpgrade: null, hoveredUpgrade: null });
      commands.claimUpgrade(id);
      commands.pin(null);
    },
  };
}

export type EssenceDraftSession = ReturnType<typeof createEssenceDraftSession>;
