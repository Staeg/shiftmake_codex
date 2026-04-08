import { describe, expect, it } from 'vitest';
import {
  applyCycleOutcomes,
  claimOpeningTroop,
  claimTroopOffer,
  claimUpgradeOffer,
  continuePlaying,
  deserializeGameState,
  revealEssenceDraft,
  serializeGameState,
  startNewGame,
} from './game';
import { FACTION_UPGRADES, isNativeTroopUnlockId, TROOP_TYPE_UPGRADES } from './unitCatalog';
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
    expect(opened.unlockedTroopUnlockIds).toEqual([]);
    expect(opened.troops.map((troop) => troop.id)).toEqual(['human/soldier']);
    expect(opened.openRifts).toHaveLength(4);
  });

  it('rejects non-native opening troop choices', () => {
    const state = startNewGame(77);
    const attempted = claimOpeningTroop(state, 'human/druid');

    expect(attempted.phase).toBe('opening_unlock');
    expect(attempted.troops).toEqual([]);
  });

  it('spends two Essence to reveal troop and upgrade draft offers together', () => {
    const state = revealEssenceDraft(claimOpeningTroop(startNewGame(8), 'human/soldier'));

    expect(state.essence).toBe(0);
    expect(state.activeTroopOffer).not.toBeNull();
    expect(state.activeUpgradeOffer).not.toBeNull();
  });

  it('builds troop draft offers from owned faction, owned troop type, and new faction buckets', () => {
    const state = revealEssenceDraft(claimOpeningTroop(startNewGame(8), 'human/soldier'));
    const offer = state.activeTroopOffer;

    expect(offer).not.toBeNull();
    expect(offer?.optionTroopUnlockIds).toHaveLength(3);
    expect(new Set(offer?.optionTroopUnlockIds).size).toBe(3);
    expect(offer?.optionTroopUnlockIds.every((troopUnlockId) => isNativeTroopUnlockId(troopUnlockId))).toBe(true);
    expect(offer?.optionTroopUnlockIds[0]?.startsWith('human/')).toBe(true);
    expect(offer?.optionTroopUnlockIds[1]?.endsWith('/soldier')).toBe(true);
    expect(offer?.optionTroopUnlockIds[2]?.startsWith('human/')).toBe(false);
  });

  it('claims troop and upgrade offers without spending more Essence', () => {
    const offered = revealEssenceDraft(claimOpeningTroop(startNewGame(9), 'human/soldier'));
    const chosen = offered.activeTroopOffer!.optionTroopUnlockIds[0]!;
    const claimedUpgradeId = offered.activeUpgradeOffer!.optionUpgradeIds[0] as UpgradeId;
    const claimed = claimTroopOffer(offered, chosen);
    const claimedBoth = claimUpgradeOffer(claimed, claimedUpgradeId);

    expect(claimed.essence).toBe(0);
    expect(claimed.activeTroopOffer).toBeNull();
    expect(claimed.troops.map((troop) => troop.id)).toContain(chosen);
    expect(claimedBoth.essence).toBe(0);
    expect(claimedBoth.activeUpgradeOffer).toBeNull();
    expect([...claimedBoth.factionUpgradeIds, ...claimedBoth.troopTypeUpgradeIds]).toContain(claimedUpgradeId);
  });

  it('builds upgrade offers from owned troop type, owned faction, and off-bucket options', () => {
    const state = revealEssenceDraft(claimOpeningTroop(startNewGame(10), 'human/archer'));
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

  it('persists active offers through save round-trips', () => {
    const offered = revealEssenceDraft(claimOpeningTroop(startNewGame(11), 'human/soldier'));
    const claimedUpgradeId = offered.activeUpgradeOffer!.optionUpgradeIds[0] as UpgradeId;
    const claimed = claimUpgradeOffer(offered, claimedUpgradeId);
    const loaded = deserializeGameState(serializeGameState(claimed));

    expect(claimed.essence).toBe(0);
    expect(claimed.activeUpgradeOffer).toBeNull();
    expect(claimed.activeTroopOffer).toEqual(offered.activeTroopOffer);
    expect([...claimed.factionUpgradeIds, ...claimed.troopTypeUpgradeIds]).toContain(claimedUpgradeId);
    expect(loaded.ok).toBe(true);
    expect(loaded.state?.activeTroopOffer).toEqual(claimed.activeTroopOffer);
  });

  it('prioritizes newly unlocked Rift troops in the third troop slot and links the third upgrade slot to it', () => {
    const state = revealEssenceDraft({
      ...claimOpeningTroop(startNewGame(99), 'human/soldier'),
      unlockedTroopUnlockIds: ['troll/wizard'],
      recentTroopUnlockIds: ['troll/wizard'],
    });
    const linkedUpgradeId = state.activeUpgradeOffer?.optionUpgradeIds[2]!;

    expect(state.activeTroopOffer?.optionTroopUnlockIds[2]).toBe('troll/wizard');
    expect(
      FACTION_UPGRADES[linkedUpgradeId]?.factionId === 'troll' ||
        TROOP_TYPE_UPGRADES[linkedUpgradeId]?.unitTypeId === 'wizard',
    ).toBe(true);
  });

  it('falls back to the old third troop new-faction bucket when no recent Rift troops are available', () => {
    const state = revealEssenceDraft(claimOpeningTroop(startNewGame(101), 'human/soldier'));

    expect(state.activeTroopOffer?.optionTroopUnlockIds[2]?.startsWith('human/')).toBe(false);
  });

  it('falls back to old off-bucket upgrades when the linked third troop has no remaining upgrades', () => {
    const state = revealEssenceDraft({
      ...claimOpeningTroop(startNewGame(102), 'human/soldier'),
      unlockedTroopUnlockIds: ['troll/wizard'],
      recentTroopUnlockIds: ['troll/wizard'],
      factionUpgradeIds: Object.values(FACTION_UPGRADES).filter((upgrade) => upgrade.factionId === 'troll').map((upgrade) => upgrade.id),
      troopTypeUpgradeIds: Object.values(TROOP_TYPE_UPGRADES).filter((upgrade) => upgrade.unitTypeId === 'wizard').map((upgrade) => upgrade.id),
    });
    const fallbackUpgradeId = state.activeUpgradeOffer?.optionUpgradeIds[2]!;

    expect(state.activeTroopOffer?.optionTroopUnlockIds[2]).toBe('troll/wizard');
    expect(FACTION_UPGRADES[fallbackUpgradeId]?.factionId).not.toBe('troll');
    expect(TROOP_TYPE_UPGRADES[fallbackUpgradeId]?.unitTypeId).not.toBe('wizard');
  });

  it('spends one Essence for a one-sided draft after upgrades are exhausted', () => {
    const state = revealEssenceDraft({
      ...claimOpeningTroop(startNewGame(103), 'human/soldier'),
      essence: 1,
      factionUpgradeIds: Object.values(FACTION_UPGRADES).map((upgrade) => upgrade.id),
      troopTypeUpgradeIds: Object.values(TROOP_TYPE_UPGRADES).map((upgrade) => upgrade.id),
    });

    expect(state.essence).toBe(0);
    expect(state.activeTroopOffer).not.toBeNull();
    expect(state.activeUpgradeOffer).toBeNull();
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

  it('unlocks off-roster enemy troop combinations after Rift victories', () => {
    const state = claimOpeningTroop(startNewGame(88), 'human/soldier');
    const result = applyCycleOutcomes(state, {
      records: [
        {
          ...makeResolutionRecord(state, 'victory'),
          battleInput: {
            seed: 12,
            riftId: state.openRifts[0]!.id,
            tier: state.openRifts[0]!.tier,
            mutatorIds: state.openRifts[0]!.mutatorIds,
            saturation: state.openRifts[0]!.saturation,
            playerCombatants: [],
            enemyCombatants: [
              {
                combatantId: 'enemy-off-roster',
                troopInstanceId: null,
                factionId: 'troll',
                unitTypeId: 'wizard',
                label: 'Troll Wizard',
                role: 'backline',
                type: 'wizard',
                attributes: ['caster', 'troll'],
                stats: { health: 1, damage: 1, speed: 1, range: 1, armor: 0, size: 1, capacity: 0 },
                abilities: [],
                quantity: 1,
                cost: 1,
                side: 'enemy',
              },
            ],
          },
        },
      ],
    });

    expect(result.newlyUnlockedTroopUnlockIds).toEqual(['troll/wizard']);
    expect(result.nextState.unlockedTroopUnlockIds).toContain('troll/wizard');
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
