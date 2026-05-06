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
    return {
      ok: true,
      state: {
        ...(parsed as GameState),
        activeFactionUnlockOffer: parsed.activeFactionUnlockOffer ?? null,
        activeTroopTypeUnlockOffer: parsed.activeTroopTypeUnlockOffer ?? null,
      },
    };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}
