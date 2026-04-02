import type { GameState, LoadGameResult } from './types';

export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGameState(json: string): LoadGameResult {
  try {
    const parsed = JSON.parse(json) as Partial<GameState>;
    if (!parsed || parsed.version !== 2) {
      return { ok: false, error: 'unsupported_version' };
    }
    if (!Array.isArray(parsed.troops) || !Array.isArray(parsed.openRifts) || !Array.isArray(parsed.replayIndex)) {
      return { ok: false, error: 'invalid_shape' };
    }
    return {
      ok: true,
      state: parsed as GameState,
    };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}
