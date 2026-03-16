import { getEnemyStatBreakdowns } from './army';
import type { GameState, LoadGameResult } from './types';

function normalizeReplayIndex(state: Partial<GameState>): Partial<GameState> {
  if (!Array.isArray(state.replayIndex)) {
    return state;
  }

  return {
    ...state,
    replayIndex: state.replayIndex.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }

      const replayId =
        'replayId' in entry && typeof entry.replayId === 'string'
          ? entry.replayId
          : 'storageKey' in entry && typeof entry.storageKey === 'string'
            ? entry.storageKey.split(':').at(-1) ?? entry.storageKey
            : 'id' in entry && typeof entry.id === 'string'
              ? entry.id
              : '';

      const { storageKey: _storageKey, ...rest } = entry as Record<string, unknown>;
      return {
        ...rest,
        replayId,
      };
    }),
  };
}

function normalizeOpenRifts(state: Partial<GameState>): Partial<GameState> {
  if (!Array.isArray(state.openRifts)) {
    return state;
  }

  return {
    ...state,
    openRifts: state.openRifts.map((rift) => {
      if (!rift || typeof rift !== 'object') {
        return rift;
      }

      return {
        ...rift,
        rewardPackage:
          'rewardPackage' in rift && rift.rewardPackage && typeof rift.rewardPackage === 'object'
            ? {
                ...rift.rewardPackage,
                blueprintChoiceCountByTier:
                  'blueprintChoiceCountByTier' in rift.rewardPackage && Array.isArray(rift.rewardPackage.blueprintChoiceCountByTier)
                    ? rift.rewardPackage.blueprintChoiceCountByTier
                    : [],
              }
            : rift.rewardPackage,
        saturation: 'saturation' in rift && typeof rift.saturation === 'number' ? rift.saturation : 10,
        enemyArmy: Array.isArray(rift.enemyArmy)
          ? rift.enemyArmy.map((combatant) => {
              if (!combatant || typeof combatant !== 'object') {
                return combatant;
              }

              return {
                ...combatant,
                statBreakdowns:
                  'statBreakdowns' in combatant && combatant.statBreakdowns
                    ? combatant.statBreakdowns
                    : getEnemyStatBreakdowns(combatant.factionId, combatant.unitTypeId, typeof rift.tier === 'number' ? rift.tier : 1),
              };
            })
          : rift.enemyArmy,
      };
    }),
  };
}

function normalizePendingRewardChoices(state: Partial<GameState>): Partial<GameState> {
  if (!Array.isArray(state.pendingRewardChoices)) {
    return state;
  }

  return {
    ...state,
    pendingRewardChoices: state.pendingRewardChoices.map((choice) => {
      if (!choice || typeof choice !== 'object') {
        return choice;
      }
      if ('kind' in choice && choice.kind === 'blueprint') {
        return choice;
      }
      return {
        kind: 'upgrade',
        ...choice,
      };
    }),
  };
}

export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGameState(json: string): LoadGameResult {
  try {
    const parsed = normalizePendingRewardChoices(normalizeOpenRifts(normalizeReplayIndex(JSON.parse(json) as Partial<GameState>)));
    if (!parsed || parsed.version !== 1) {
      return { ok: false, error: 'unsupported_version' };
    }
    if (!Array.isArray(parsed.troops) || !Array.isArray(parsed.openRifts) || !Array.isArray(parsed.replayIndex)) {
      return { ok: false, error: 'invalid_shape' };
    }
    return {
      ok: true,
      state: {
        cheatUpgrades: false,
        cheatBlueprints: false,
        cheatResources: false,
        unlockedBlueprintTroopIds: [],
        ...parsed,
      } as GameState,
    };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}
