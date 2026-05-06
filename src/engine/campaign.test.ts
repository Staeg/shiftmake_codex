import { describe, expect, it } from 'vitest';
import {
  applyCycleOutcomes,
  assignTroopToRift,
  canAssignTroopToRift,
  claimFactionUnlockOffer,
  claimOpeningTroop,
  claimTroopOffer,
  claimTroopTypeUnlockOffer,
  claimUpgradeOffer,
  clearTroopAssignment,
  continuePlaying,
  deserializeGameState,
  getOpeningFactionOptionIds,
  revealEssenceDraft,
  serializeGameState,
  startOpeningCampaign,
  startNewGame,
} from './game';
import { FACTION_UPGRADES, NATIVE_TROOP_UNLOCK_IDS, isNativeTroopUnlockId, TROOP_TYPE_UPGRADES } from './unitCatalog';
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

function finishOpening(seed: number, firstTroopUnlockId: string): GameState {
  const first = claimOpeningTroop(startNewGame(seed), firstTroopUnlockId);
  const [firstFactionId, firstUnitTypeId] = firstTroopUnlockId.split('/');
  const openingFactionIds = new Set(getOpeningFactionOptionIds());
  const secondTroopUnlockId = NATIVE_TROOP_UNLOCK_IDS.find((troopUnlockId) => {
    const [factionId, unitTypeId] = troopUnlockId.split('/');
    return openingFactionIds.has(factionId) && factionId !== firstFactionId && unitTypeId !== firstUnitTypeId;
  })!;
  return startOpeningCampaign(claimOpeningTroop(first, secondTroopUnlockId));
}

describe('campaign progression', () => {
  it('starts in opening unlock and waits for confirmation after two legal free picks', () => {
    const state = startNewGame(7);
    const firstPick = claimOpeningTroop(state, 'human/soldier');
    const secondPick = claimOpeningTroop(firstPick, 'elf/archer');
    const opened = startOpeningCampaign(secondPick);

    expect(state.phase).toBe('opening_unlock');
    expect(firstPick.phase).toBe('opening_unlock');
    expect(secondPick.phase).toBe('opening_unlock');
    expect(secondPick.openRifts).toEqual([]);
    expect(opened.phase).toBe('planning');
    expect(opened.essence).toBe(2);
    expect(opened.unlockedFactionIds).toEqual(['human', 'elf']);
    expect(opened.unlockedTroopUnlockIds).toEqual([]);
    expect(opened.troops.map((troop) => troop.id)).toEqual(['human/soldier', 'elf/archer']);
    expect(opened.openRifts).toHaveLength(4);
  });

  it('limits opening choices to two troops from the four opening factions', () => {
    const firstPick = claimOpeningTroop(startNewGame(72), 'human/soldier');
    const secondPick = claimOpeningTroop(firstPick, 'elf/archer');

    expect(claimOpeningTroop(startNewGame(72), 'dwarf/avenger').troops).toEqual([]);
    expect(claimOpeningTroop(secondPick, 'goblin/wizard').troops.map((troop) => troop.id)).toEqual(['human/soldier', 'elf/archer']);
  });

  it('rejects opening choices that repeat a faction or troop type', () => {
    const firstPick = claimOpeningTroop(startNewGame(71), 'human/soldier');

    expect(claimOpeningTroop(firstPick, 'human/archer').troops).toHaveLength(1);
    expect(claimOpeningTroop(firstPick, 'goblin/soldier').troops).toHaveLength(1);
  });

  it('rejects non-native opening troop choices', () => {
    const state = startNewGame(77);
    const attempted = claimOpeningTroop(state, 'human/druid');

    expect(attempted.phase).toBe('opening_unlock');
    expect(attempted.troops).toEqual([]);
  });

  it('spends two Essence to reveal troop and upgrade draft offers together', () => {
    const state = revealEssenceDraft(finishOpening(8, 'human/soldier'));

    expect(state.essence).toBe(0);
    expect(state.activeTroopOffer).not.toBeNull();
    expect(state.activeUpgradeOffer).not.toBeNull();
  });

  it('builds troop draft offers from owned faction, owned troop type, and new faction buckets', () => {
    const state = revealEssenceDraft(finishOpening(8, 'human/soldier'));
    const offer = state.activeTroopOffer;

    expect(offer).not.toBeNull();
    expect(offer?.optionTroopUnlockIds).toHaveLength(3);
    expect(new Set(offer?.optionTroopUnlockIds).size).toBe(3);
    expect(offer?.optionTroopUnlockIds.every((troopUnlockId) => isNativeTroopUnlockId(troopUnlockId))).toBe(true);
    expect(offer?.optionTroopUnlockIds.some((troopUnlockId) => troopUnlockId.startsWith('human/') || troopUnlockId.startsWith('elf/'))).toBe(true);
    expect(offer?.optionTroopUnlockIds.some((troopUnlockId) => troopUnlockId.endsWith('/soldier') || troopUnlockId.endsWith('/archer'))).toBe(true);
    expect(offer?.optionTroopUnlockIds.some((troopUnlockId) => !troopUnlockId.startsWith('human/') && !troopUnlockId.startsWith('elf/'))).toBe(true);
  });

  it('claims troop and upgrade offers without spending more Essence', () => {
    const offered = revealEssenceDraft(finishOpening(9, 'human/soldier'));
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
    const state = revealEssenceDraft(finishOpening(10, 'human/archer'));
    const offer = state.activeUpgradeOffer;
    const ownedUnitTypeIds = new Set(state.troops.map((troop) => troop.unitTypeId));
    const ownedFactionIds = new Set(state.unlockedFactionIds);

    expect(offer).not.toBeNull();
    expect(offer?.optionUpgradeIds).toHaveLength(3);
    expect(new Set(offer?.optionUpgradeIds).size).toBe(3);
    expect(offer?.optionUpgradeIds.some((upgradeId) => ownedUnitTypeIds.has(TROOP_TYPE_UPGRADES[upgradeId]?.unitTypeId ?? ''))).toBe(true);
    expect(offer?.optionUpgradeIds.some((upgradeId) => ownedFactionIds.has(FACTION_UPGRADES[upgradeId]?.factionId ?? ''))).toBe(true);
    expect(
      offer?.optionUpgradeIds.some(
        (upgradeId) =>
          !ownedFactionIds.has(FACTION_UPGRADES[upgradeId]?.factionId ?? '') &&
          !ownedUnitTypeIds.has(TROOP_TYPE_UPGRADES[upgradeId]?.unitTypeId ?? ''),
      ),
    ).toBe(true);
  });

  it('persists active offers through save round-trips', () => {
    const offered = revealEssenceDraft(finishOpening(11, 'human/soldier'));
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
      ...finishOpening(99, 'human/soldier'),
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
    const state = revealEssenceDraft(finishOpening(101, 'human/soldier'));

    expect(state.activeTroopOffer?.optionTroopUnlockIds[2]?.startsWith('human/')).toBe(false);
  });

  it('falls back to old off-bucket upgrades when the linked third troop has no remaining upgrades', () => {
    const state = revealEssenceDraft({
      ...finishOpening(102, 'human/soldier'),
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
      ...finishOpening(103, 'human/soldier'),
      essence: 1,
      factionUpgradeIds: Object.values(FACTION_UPGRADES).map((upgrade) => upgrade.id),
      troopTypeUpgradeIds: Object.values(TROOP_TYPE_UPGRADES).map((upgrade) => upgrade.id),
    });

    expect(state.essence).toBe(0);
    expect(state.activeTroopOffer).not.toBeNull();
    expect(state.activeUpgradeOffer).toBeNull();
  });

  it('awards VP only on Rift victories, adds two Essence, and clears recovery by next cycle', () => {
    const state = finishOpening(12, 'human/soldier');
    const result = applyCycleOutcomes(state, { records: [makeResolutionRecord(state, 'victory')] });

    expect(result.nextState.cycleNumber).toBe(2);
    expect(result.nextState.victoryPoints).toBe(state.openRifts[0]!.tier);
    expect(result.nextState.essence).toBe(4);
    expect(result.nextState.troops[0]?.recoveryCyclesRemaining).toBe(0);
    expect(result.nextState.activeTroopOffer).toBeNull();
    expect(result.nextState.activeUpgradeOffer).toBeNull();
  });

  it('enforces assignment invariants at the state mutation boundary', () => {
    const opened = finishOpening(120, 'human/soldier');
    const riftId = opened.openRifts[0]!.id;
    const troopId = opened.troops[0]!.id;

    const assigned = assignTroopToRift(opened, troopId, riftId);
    expect(assigned.troops[0]?.assignmentRiftId).toBe(riftId);

    const toggledOff = assignTroopToRift(assigned, troopId, riftId);
    expect(toggledOff.troops[0]?.assignmentRiftId).toBeNull();

    const blockedRecovery = assignTroopToRift(
      {
        ...opened,
        troops: [{ ...opened.troops[0]!, recoveryCyclesRemaining: 1 }],
      },
      troopId,
      riftId,
    );
    expect(blockedRecovery.troops[0]?.assignmentRiftId).toBeNull();
    expect(canAssignTroopToRift(blockedRecovery, troopId, riftId).issues[0]?.kind).toBe('troop_recovering');

    const blockedResolvedRift = assignTroopToRift(
      {
        ...opened,
        openRifts: [{ ...opened.openRifts[0]!, state: 'resolved_victory' }],
      },
      troopId,
      riftId,
    );
    expect(blockedResolvedRift.troops[0]?.assignmentRiftId).toBeNull();
    expect(canAssignTroopToRift(blockedResolvedRift, troopId, riftId).issues[0]?.kind).toBe('unknown_rift');

    const blockedPhase = clearTroopAssignment({ ...assigned, phase: 'game_over' }, troopId);
    expect(blockedPhase.troops[0]?.assignmentRiftId).toBe(riftId);
  });

  it('prevents same-faction assignments unless the faction is united', () => {
    const opened = finishOpening(121, 'human/soldier');
    const withTwoHumans = claimTroopOffer(
      {
        ...opened,
        activeTroopOffer: { kind: 'troop', optionTroopUnlockIds: ['human/archer'] },
      },
      'human/archer',
    );
    const riftId = withTwoHumans.openRifts[0]!.id;
    const firstTroopId = withTwoHumans.troops[0]!.id;
    const secondTroopId = withTwoHumans.troops.find((troop) => troop.id === 'human/archer')!.id;
    const firstAssigned = assignTroopToRift(withTwoHumans, firstTroopId, riftId);
    const blockedSecond = assignTroopToRift(firstAssigned, secondTroopId, riftId);

    expect(blockedSecond.troops.find((troop) => troop.id === secondTroopId)?.assignmentRiftId).toBeNull();
    expect(canAssignTroopToRift(firstAssigned, secondTroopId, riftId).issues[0]?.kind).toBe('same_faction_conflict');

    const united = {
      ...firstAssigned,
      factionUpgradeIds: ['human-united' as UpgradeId],
    };
    expect(assignTroopToRift(united, secondTroopId, riftId).troops.find((troop) => troop.id === secondTroopId)?.assignmentRiftId).toBe(riftId);
  });

  it('prevents same troop-type assignments even across different factions', () => {
    const opened = finishOpening(122, 'human/soldier');
    const withGoblinSoldiers = claimTroopOffer(
      {
        ...opened,
        activeTroopOffer: { kind: 'troop', optionTroopUnlockIds: ['goblin/soldier'] },
      },
      'goblin/soldier',
    );
    const riftId = withGoblinSoldiers.openRifts[0]!.id;
    const firstAssigned = assignTroopToRift(withGoblinSoldiers, 'human/soldier', riftId);
    const blockedSecond = assignTroopToRift(firstAssigned, 'goblin/soldier', riftId);

    expect(blockedSecond.troops.find((troop) => troop.id === 'goblin/soldier')?.assignmentRiftId).toBeNull();
    expect(canAssignTroopToRift(firstAssigned, 'goblin/soldier', riftId).issues[0]?.kind).toBe('same_type_conflict');
  });

  it('opens scheduled faction unlocks at cycles three and seven with sequential troop choices', () => {
    const cycleThreeState: GameState = {
      ...finishOpening(123, 'human/soldier'),
      cycleNumber: 2,
      phase: 'planning',
    };
    const cycleThree = applyCycleOutcomes(cycleThreeState, { records: [] }).nextState;

    expect(cycleThree.cycleNumber).toBe(3);
    expect(cycleThree.phase).toBe('faction_unlock');
    expect(cycleThree.activeFactionUnlockOffer?.optionFactionIds.length).toBeGreaterThan(0);
    expect(cycleThree.activeFactionUnlockOffer?.troopUnlockChoiceCount).toBe(2);

    const factionId = cycleThree.activeFactionUnlockOffer!.optionFactionIds[0]!;
    const withFaction = claimFactionUnlockOffer(cycleThree, factionId);
    expect(withFaction.unlockedFactionIds).toContain(factionId);
    expect(withFaction.factionUpgradeIds.filter((upgradeId) => FACTION_UPGRADES[upgradeId]?.factionId === factionId)).toHaveLength(1);
    expect(withFaction.phase).toBe('troop_type_unlock');

    const firstTroop = withFaction.activeTroopTypeUnlockOffer!.optionTroopUnlockIds[0]!;
    const afterFirstTroop = claimTroopTypeUnlockOffer(withFaction, firstTroop);
    expect(afterFirstTroop.phase).toBe('troop_type_unlock');
    const secondTroop = afterFirstTroop.activeTroopTypeUnlockOffer!.optionTroopUnlockIds[0]!;
    const afterSecondTroop = claimTroopTypeUnlockOffer(afterFirstTroop, secondTroop);
    expect(afterSecondTroop.phase).toBe('planning');
    expect(afterSecondTroop.troops.map((troop) => troop.id)).toEqual(expect.arrayContaining([firstTroop, secondTroop]));

    const cycleSevenState: GameState = {
      ...afterSecondTroop,
      cycleNumber: 6,
      phase: 'planning',
    };
    const cycleSeven = applyCycleOutcomes(cycleSevenState, { records: [] }).nextState;
    const cycleSevenFactionId = cycleSeven.activeFactionUnlockOffer?.optionFactionIds[0];
    expect(cycleSeven.phase).toBe('faction_unlock');
    expect(cycleSeven.activeFactionUnlockOffer?.troopUnlockChoiceCount).toBe(3);
    expect(cycleSevenFactionId ? cycleSeven.activeFactionUnlockOffer?.upgradeIdsByFactionId[cycleSevenFactionId]?.length : 0).toBe(2);
  });

  it('does not award VP for defeats and still leaves troops ready next cycle by default', () => {
    const state = finishOpening(13, 'human/soldier');
    const result = applyCycleOutcomes(state, { records: [makeResolutionRecord(state, 'defeat')] });

    expect(result.nextState.victoryPoints).toBe(0);
    expect(result.nextState.troops[0]?.recoveryCyclesRemaining).toBe(0);
    expect(result.nextState.replayIndex[0]?.outcome).toBe('defeat');
  });

  it('unlocks off-roster enemy troop combinations after Rift victories', () => {
    const state = finishOpening(88, 'human/soldier');
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
    const seeded = finishOpening(14, 'human/soldier');
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
