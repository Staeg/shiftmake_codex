export function serializeGameState(state) {
    return JSON.stringify(state);
}
export function deserializeGameState(json) {
    try {
        const parsed = JSON.parse(json);
        if (!parsed || parsed.version !== 3) {
            return { ok: false, error: 'unsupported_version' };
        }
        if (!Array.isArray(parsed.troops) ||
            !Array.isArray(parsed.openRifts) ||
            !Array.isArray(parsed.replayIndex) ||
            !Array.isArray(parsed.unlockedRaceIds) ||
            !Array.isArray(parsed.unlockedTroopUnlockIds)) {
            return { ok: false, error: 'invalid_shape' };
        }
        const state = parsed;
        return {
            ok: true,
            state: {
                ...state,
                gameMode: parsed.gameMode ?? 'campaign',
                activeRaceUnlockOffer: parsed.activeRaceUnlockOffer ?? null,
                activeTroopClassUnlockOffer: parsed.activeTroopClassUnlockOffer ?? null,
                contest: state.contest
                    ? {
                        ...state.contest,
                        opponentInfo: state.contest.opponentInfo ?? null,
                    }
                    : state.contest,
            },
        };
    }
    catch {
        return { ok: false, error: 'invalid_json' };
    }
}
//# sourceMappingURL=save.js.map