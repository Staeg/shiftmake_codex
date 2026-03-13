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

export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGameState(json: string): LoadGameResult {
  try {
    const parsed = normalizeReplayIndex(JSON.parse(json) as Partial<GameState>);
    if (!parsed || parsed.version !== 1) {
      return { ok: false, error: 'unsupported_version' };
    }
    if (!Array.isArray(parsed.troops) || !Array.isArray(parsed.openRifts) || !Array.isArray(parsed.replayIndex)) {
      return { ok: false, error: 'invalid_shape' };
    }
    return { ok: true, state: parsed as GameState };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}
