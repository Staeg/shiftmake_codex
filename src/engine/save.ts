import type { GameState, LoadGameResult } from './types';

export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGameState(json: string): LoadGameResult {
  try {
    const parsed = JSON.parse(json) as Partial<GameState>;
    if (!parsed || parsed.version !== 3) {
      return { ok: false, error: 'unsupported_version' };
    }
    if (
      !Array.isArray(parsed.troops) ||
      !Array.isArray(parsed.openRifts) ||
      !Array.isArray(parsed.replayIndex) ||
      !Array.isArray(parsed.unlockedFactionIds) ||
      !Array.isArray(parsed.unlockedTroopUnlockIds)
    ) {
      return { ok: false, error: 'invalid_shape' };
    }
    const state = parsed as GameState;
    return {
      ok: true,
      state: {
        ...state,
        gameMode: parsed.gameMode ?? 'campaign',
        activeFactionUnlockOffer: parsed.activeFactionUnlockOffer ?? null,
        activeTroopTypeUnlockOffer: parsed.activeTroopTypeUnlockOffer ?? null,
        contest: state.contest
          ? {
              ...state.contest,
              opponentInfo: state.contest.opponentInfo ?? null,
            }
          : state.contest,
      },
    };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}
