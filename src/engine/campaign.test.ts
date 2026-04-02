import { describe, expect, it } from 'vitest';
import {
  applyCycleOutcomes,
  claimOpeningTroop,
  claimTroopOffer,
  claimUpgradeOffer,
  continuePlaying,
  deserializeGameState,
  revealTroopOffer,
  revealUpgradeOffer,
  serializeGameState,
  startNewGame,
} from './game';
import { FACTION_UPGRADES, TROOP_TYPE_UPGRADES } from './unitCatalog';
import type { BattleReplay, GameState, RiftResolutionRecord, UpgradeId } from './types';

function makeReplay(recordId: string, riftId: string, outcome: 'victory' | 'defeat'): BattleReplay {
  return {
    id: recordId,
    seed: 1,
    riftId,
    tier: 1,
    mutatorIds: [],
    mapRadius: 3,
    saturation: 3,
    initial: { units: [] },
    steps: [],
    outcome,
    troopLabels: {},
    troopProfiles: [],
    aliveCounts: [{ player: outcome === 'victory' ? 1 : 0, enemy: outcome === 'victory' ? 0 : 1, byTroopLabel: {} }],
    summary: {
      playerTroops: ['Test Troop'],
      enemyTroops: ['Enemy Troop'],
      finalPlayerAlive: outcome === 'victory' ? 1 : 0,
      finalEnemyAlive: outcome === 'victory' ? 0 : 1,
    },
  };
}

function makeResolutionRecord(state: GameState, outcome: 'victory' | 'defeat'): RiftResolutionRecord {
  const troop = state.troops[0]!;
  const rift = state.openRifts[0]!;
  return {
    riftId: rift.id,
    assignedTroopIds: [troop.id],
    battleInput: {
      seed: 11,
      riftId: rift.id,
      tier: rift.tier,
      mutatorIds: rift.mutatorIds,
      saturation: rift.saturation,
      playerCombatants: [],
      enemyCombatants: [],
    },
    replay: makeReplay(`replay-${outcome}`, rift.id, outcome),
    outcome,
    victoryPoints: rift.victoryPoints,
    recoveryMap: { [troop.id]: 1 },
  };
}

describe('campaign progression', () => {
  it('starts in opening unlock and the free pick moves the run into planning with two Essence', () => {
    const state = startNewGame(7);
    const opened = claimOpeningTroop(state, 'human/soldier');

    expect(state.phase).toBe('opening_unlock');
    expect(opened.phase).toBe('planning');
    expect(opened.essence).toBe(2);
    expect(opened.unlockedFactionIds).toEqual(['human']);
    expect(opened.troops.map((troop) => troop.id)).toEqual(['human/soldier']);
    expect(opened.openRifts).toHaveLength(4);
  });

  it('builds troop draft offers from owned faction, owned troop type, and new faction buckets', () => {
    const state = revealTroopOffer(claimOpeningTroop(startNewGame(8), 'human/soldier'));
    const offer = state.activeTroopOffer;

    expect(offer).not.toBeNull();
    expect(offer?.optionTroopUnlockIds).toHaveLength(3);
    expect(new Set(offer?.optionTroopUnlockIds).size).toBe(3);
    expect(offer?.optionTroopUnlockIds[0]?.startsWith('human/')).toBe(true);
    expect(offer?.optionTroopUnlockIds[1]?.endsWith('/soldier')).toBe(true);
    expect(offer?.optionTroopUnlockIds[2]?.startsWith('human/')).toBe(false);
  });

  it('claims a troop offer for one Essence and rerolls from updated ownership', () => {
    const offered = revealTroopOffer(claimOpeningTroop(startNewGame(9), 'human/soldier'));
    const chosen = offered.activeTroopOffer!.optionTroopUnlockIds[0]!;
    const claimed = claimTroopOffer(offered, chosen);
    const rerolled = revealTroopOffer(claimed);

    expect(claimed.essence).toBe(1);
    expect(claimed.activeTroopOffer).toBeNull();
    expect(claimed.troops.map((troop) => troop.id)).toContain(chosen);
    expect(rerolled.activeTroopOffer?.optionTroopUnlockIds).not.toContain(chosen);
  });

  it('builds upgrade offers from owned troop type, owned faction, and off-bucket options', () => {
    const state = revealUpgradeOffer(claimOpeningTroop(startNewGame(10), 'human/archer'));
    const offer = state.activeUpgradeOffer;
    const troopUpgradeId = offer?.optionUpgradeIds[0]!;
    const factionUpgradeId = offer?.optionUpgradeIds[1]!;
    const offBucketId = offer?.optionUpgradeIds[2]!;

    expect(offer).not.toBeNull();
    expect(offer?.optionUpgradeIds).toHaveLength(3);
    expect(new Set(offer?.optionUpgradeIds).size).toBe(3);
    expect(TROOP_TYPE_UPGRADES[troopUpgradeId]?.unitTypeId).toBe('archer');
    expect(FACTION_UPGRADES[factionUpgradeId]?.factionId).toBe('human');
    expect(FACTION_UPGRADES[offBucketId]?.factionId === 'human').toBe(false);
    expect(TROOP_TYPE_UPGRADES[offBucketId]?.unitTypeId === 'archer').toBe(false);
  });

  it('claims an upgrade offer for one Essence and persists active offers through save round-trips', () => {
    const offered = revealUpgradeOffer(revealTroopOffer(claimOpeningTroop(startNewGame(11), 'human/soldier')));
    const claimedUpgradeId = offered.activeUpgradeOffer!.optionUpgradeIds[0] as UpgradeId;
    const claimed = claimUpgradeOffer(offered, claimedUpgradeId);
    const reoffered = revealTroopOffer(claimed);
    const loaded = deserializeGameState(serializeGameState(reoffered));

    expect(claimed.essence).toBe(1);
    expect(claimed.activeUpgradeOffer).toBeNull();
    expect([...claimed.factionUpgradeIds, ...claimed.troopTypeUpgradeIds]).toContain(claimedUpgradeId);
    expect(loaded.ok).toBe(true);
    expect(loaded.state?.activeTroopOffer).toEqual(reoffered.activeTroopOffer);
  });

  it('awards VP only on Rift victories, adds two Essence, and clears recovery by next cycle', () => {
    const state = claimOpeningTroop(startNewGame(12), 'human/soldier');
    const result = applyCycleOutcomes(state, { records: [makeResolutionRecord(state, 'victory')] });

    expect(result.nextState.cycleNumber).toBe(2);
    expect(result.nextState.victoryPoints).toBe(state.openRifts[0]!.tier);
    expect(result.nextState.essence).toBe(4);
    expect(result.nextState.troops[0]?.recoveryCyclesRemaining).toBe(0);
    expect(result.nextState.activeTroopOffer).toBeNull();
    expect(result.nextState.activeUpgradeOffer).toBeNull();
  });

  it('does not award VP for defeats and still leaves troops ready next cycle by default', () => {
    const state = claimOpeningTroop(startNewGame(13), 'human/soldier');
    const result = applyCycleOutcomes(state, { records: [makeResolutionRecord(state, 'defeat')] });

    expect(result.nextState.victoryPoints).toBe(0);
    expect(result.nextState.troops[0]?.recoveryCyclesRemaining).toBe(0);
    expect(result.nextState.replayIndex[0]?.outcome).toBe('defeat');
  });

  it('transitions to game over after resolving cycle ten and continue playing resumes planning', () => {
    const seeded = claimOpeningTroop(startNewGame(14), 'human/soldier');
    const cycleTenState: GameState = {
      ...seeded,
      cycleNumber: 10,
      phase: 'planning',
      postgameDismissed: false,
      openRifts: seeded.openRifts,
    };

    const ended = applyCycleOutcomes(cycleTenState, { records: [] }).nextState;
    const continued = continuePlaying(ended);

    expect(ended.cycleNumber).toBe(11);
    expect(ended.phase).toBe('game_over');
    expect(ended.openRifts.some((rift) => rift.cycleNumber === 11 && rift.state === 'discovered')).toBe(true);
    expect(continued.phase).toBe('planning');
    expect(continued.postgameDismissed).toBe(true);
  });

  it('rejects old save formats instead of migrating them', () => {
    expect(deserializeGameState(JSON.stringify({ version: 1 }))).toEqual({
      ok: false,
      error: 'unsupported_version',
    });
  });
});
