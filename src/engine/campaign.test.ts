import { describe, expect, it } from 'vitest';
import {
  applyCycleOutcomes,
  assignTroopToRift,
  canAssignTroopToRift,
  claimFactionUnlockOffer,
  claimOpeningTroop,
  claimTroopOffer,
  claimUpgradeOffer,
  clearTroopAssignment,
  continuePlaying,
  deserializeGameState,
  getOpeningFactionStarterTroopUnlockIds,
  getOpeningFactionOptionIds,
  revealEssenceDraft,
  resolveAssignedRifts,
  serializeGameState,
  startOpeningCampaign,
  startNewGame,
  validateAssignments,
} from './game';
import { createTroopInstance, resolveEnemyCombatant } from './army';
import { ALL_TROOP_UNLOCK_IDS, FACTION_UPGRADES, NATIVE_TROOP_UNLOCK_IDS, isNativeTroopUnlockId, TROOP_TYPE_UPGRADES } from './unitCatalog';
import { upgradeAffectsTroop } from './upgrades';
import type { BattleReplay, FactionId, GameState, RiftResolutionRecord, RiftState, TroopUnlockId, UpgradeId } from './types';

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

function getOpeningNativeTroopUnlockIds(state: GameState): TroopUnlockId[] {
  const openingFactionIds = new Set(getOpeningFactionOptionIds(state));
  return NATIVE_TROOP_UNLOCK_IDS.filter((troopUnlockId) => openingFactionIds.has(troopUnlockId.split('/')[0] as FactionId)) as TroopUnlockId[];
}

function pickOpeningPair(state: GameState, preferredFirstTroopUnlockId?: string): [TroopUnlockId, TroopUnlockId] {
  const startersByFactionId = getOpeningFactionStarterTroopUnlockIds(state);
  const candidates = getOpeningFactionOptionIds(state).map((factionId) => startersByFactionId[factionId]);
  const firstTroopUnlockId =
    preferredFirstTroopUnlockId && candidates.includes(preferredFirstTroopUnlockId as TroopUnlockId)
      ? (preferredFirstTroopUnlockId as TroopUnlockId)
      : candidates[0]!;
  const [firstFactionId, firstUnitTypeId] = firstTroopUnlockId.split('/');
  const secondTroopUnlockId = NATIVE_TROOP_UNLOCK_IDS.find((troopUnlockId) => {
    const [factionId, unitTypeId] = troopUnlockId.split('/');
    return candidates.includes(troopUnlockId as TroopUnlockId) && factionId !== firstFactionId && unitTypeId !== firstUnitTypeId;
  }) as TroopUnlockId;
  return [firstTroopUnlockId, secondTroopUnlockId];
}

function finishOpening(seed: number, preferredFirstTroopUnlockId?: string): GameState {
  const state = startNewGame(seed);
  const [firstTroopUnlockId, secondTroopUnlockId] = pickOpeningPair(state, preferredFirstTroopUnlockId);
  return startOpeningCampaign(claimOpeningTroop(claimOpeningTroop(state, firstTroopUnlockId), secondTroopUnlockId));
}

function finishOpeningWithPreferredFirst(preferredFirstTroopUnlockId: TroopUnlockId): GameState {
  for (let seed = 1; seed < 1_000; seed += 1) {
    const state = startNewGame(seed);
    if (Object.values(getOpeningFactionStarterTroopUnlockIds(state)).includes(preferredFirstTroopUnlockId)) {
      return finishOpening(seed, preferredFirstTroopUnlockId);
    }
  }
  throw new Error(`No opening seed found for ${preferredFirstTroopUnlockId}`);
}

function finishContestOpening(seed: number): GameState {
  const state = startNewGame(seed, 'contest');
  const [firstTroopUnlockId, secondTroopUnlockId] = pickOpeningPair(state);
  return startOpeningCampaign(claimOpeningTroop(claimOpeningTroop(state, firstTroopUnlockId), secondTroopUnlockId));
}

function getLockedFactionTroopUnlockId(state: GameState): TroopUnlockId {
  const lockedFactionId = (Object.keys(FACTION_UPGRADES) as UpgradeId[])
    .map((upgradeId) => FACTION_UPGRADES[upgradeId]!.factionId)
    .find((factionId) => !state.unlockedFactionIds.includes(factionId))!;
  return NATIVE_TROOP_UNLOCK_IDS.find((troopUnlockId) => troopUnlockId.startsWith(`${lockedFactionId}/`)) as TroopUnlockId;
}

function getOffRosterTroopUnlockId(factionId: FactionId): TroopUnlockId {
  return ALL_TROOP_UNLOCK_IDS.find((troopUnlockId) => troopUnlockId.startsWith(`${factionId}/`) && !isNativeTroopUnlockId(troopUnlockId))!;
}

describe('campaign progression', () => {
  it('starts in opening unlock and waits for confirmation after two legal free picks', () => {
    const state = startNewGame(7);
    const [firstTroopUnlockId, secondTroopUnlockId] = pickOpeningPair(state);
    const firstPick = claimOpeningTroop(state, firstTroopUnlockId);
    const secondPick = claimOpeningTroop(firstPick, secondTroopUnlockId);
    const opened = startOpeningCampaign(secondPick);

    expect(state.phase).toBe('opening_unlock');
    expect(firstPick.phase).toBe('opening_unlock');
    expect(secondPick.phase).toBe('opening_unlock');
    expect(secondPick.openRifts).toEqual([]);
    expect(opened.phase).toBe('planning');
    expect(opened.essence).toBe(2);
    expect(opened.unlockedFactionIds).toEqual([firstTroopUnlockId.split('/')[0], secondTroopUnlockId.split('/')[0]]);
    expect(opened.unlockedTroopUnlockIds).toEqual([]);
    expect(opened.troops.map((troop) => troop.id)).toEqual([firstTroopUnlockId, secondTroopUnlockId]);
    expect(opened.openRifts).toHaveLength(4);
  });

  it('limits opening choices to two troops from the four opening factions', () => {
    const state = startNewGame(72);
    const [firstTroopUnlockId, secondTroopUnlockId] = pickOpeningPair(state);
    const firstPick = claimOpeningTroop(state, firstTroopUnlockId);
    const secondPick = claimOpeningTroop(firstPick, secondTroopUnlockId);
    const invalidTroopUnlockId = NATIVE_TROOP_UNLOCK_IDS.find(
      (troopUnlockId) => !getOpeningFactionOptionIds(state).includes(troopUnlockId.split('/')[0] as FactionId),
    )!;
    const extraOpeningTroopUnlockId = getOpeningNativeTroopUnlockIds(state).find(
      (troopUnlockId) => ![firstTroopUnlockId, secondTroopUnlockId].includes(troopUnlockId),
    )!;

    expect(getOpeningFactionOptionIds(state)).toHaveLength(4);
    expect(getOpeningFactionOptionIds(state).some((factionId) => !['human', 'elf', 'goblin', 'troll'].includes(factionId))).toBe(true);
    expect(claimOpeningTroop(state, invalidTroopUnlockId as TroopUnlockId).troops).toEqual([]);
    expect(claimOpeningTroop(secondPick, extraOpeningTroopUnlockId).troops.map((troop) => troop.id)).toEqual([
      firstTroopUnlockId,
      secondTroopUnlockId,
    ]);
  });

  it('preselects unique opening starter troop types across offered factions', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const starters = Object.values(getOpeningFactionStarterTroopUnlockIds(startNewGame(seed)));
      const unitTypeIds = starters.map((troopUnlockId) => troopUnlockId.split('/')[1]);
      expect(new Set(unitTypeIds).size).toBe(unitTypeIds.length);
    }
  });

  it('rejects opening choices that repeat a faction or troop type', () => {
    const state = startNewGame(71);
    const [firstTroopUnlockId] = pickOpeningPair(state);
    const firstPick = claimOpeningTroop(state, firstTroopUnlockId);
    const [firstFactionId, firstUnitTypeId] = firstTroopUnlockId.split('/');
    const repeatedFactionTroopUnlockId = getOpeningNativeTroopUnlockIds(state).find(
      (troopUnlockId) => troopUnlockId.startsWith(`${firstFactionId}/`) && troopUnlockId !== firstTroopUnlockId,
    )!;
    const repeatedTypeTroopUnlockId = getOpeningNativeTroopUnlockIds(state).find(
      (troopUnlockId) => !troopUnlockId.startsWith(`${firstFactionId}/`) && troopUnlockId.endsWith(`/${firstUnitTypeId}`),
    )!;

    expect(claimOpeningTroop(firstPick, repeatedFactionTroopUnlockId).troops).toHaveLength(1);
    expect(claimOpeningTroop(firstPick, repeatedTypeTroopUnlockId).troops).toHaveLength(1);
  });

  it('rejects non-native opening troop choices', () => {
    const state = startNewGame(77);
    const openingFactionId = getOpeningFactionOptionIds(state)[0]!;
    const attempted = claimOpeningTroop(state, getOffRosterTroopUnlockId(openingFactionId));

    expect(attempted.phase).toBe('opening_unlock');
    expect(attempted.troops).toEqual([]);
  });

  it('spends two Essence to reveal troop and upgrade draft offers together', () => {
    const state = revealEssenceDraft(finishOpening(8, 'human/soldier'));

    expect(state.essence).toBe(0);
    expect(state.activeTroopOffer).not.toBeNull();
    expect(state.activeUpgradeOffer).not.toBeNull();
  });

  it('builds troop draft offers only from unlocked faction rosters', () => {
    const state = revealEssenceDraft(finishOpening(8, 'human/soldier'));
    const offer = state.activeTroopOffer;
    const ownedFactionIds = new Set(state.unlockedFactionIds);

    expect(offer).not.toBeNull();
    expect(offer?.optionTroopUnlockIds).toHaveLength(3);
    expect(new Set(offer?.optionTroopUnlockIds).size).toBe(3);
    expect(offer?.optionTroopUnlockIds.every((troopUnlockId) => isNativeTroopUnlockId(troopUnlockId))).toBe(true);
    expect(offer?.optionTroopUnlockIds.every((troopUnlockId) => ownedFactionIds.has(troopUnlockId.split('/')[0]!))).toBe(true);
    expect(offer?.optionTroopUnlockIds.some((troopUnlockId) => ownedFactionIds.has(troopUnlockId.split('/')[0] as FactionId))).toBe(true);
    expect(offer?.optionTroopUnlockIds.some((troopUnlockId) => state.troops.some((troop) => troopUnlockId.endsWith(`/${troop.unitTypeId}`)))).toBe(true);
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
    expect(offer?.optionUpgradeIds.every((upgradeId) => upgradeId in FACTION_UPGRADES || upgradeId in TROOP_TYPE_UPGRADES)).toBe(true);
  });

  it('only treats faction upgrades as affecting troops when their effects can apply', () => {
    expect(upgradeAffectsTroop('elf-silvershot-doctrine', createTroopInstance('elf', 'champion'))).toBe(false);
    expect(upgradeAffectsTroop('elf-silvershot-doctrine', createTroopInstance('elf', 'beastmaster'))).toBe(false);
    expect(upgradeAffectsTroop('elf-silvershot-doctrine', createTroopInstance('elf', 'archer'))).toBe(true);
    expect(upgradeAffectsTroop('elf-silvershot-doctrine', createTroopInstance('elf', 'druid'))).toBe(true);
    expect(upgradeAffectsTroop('elf-elven-reflexes', createTroopInstance('elf', 'champion'))).toBe(false);
    expect(upgradeAffectsTroop('elf-elven-reflexes', createTroopInstance('elf', 'ranger'))).toBe(true);
  });

  it('does not offer upgrades that affect none of the controlled troops', () => {
    const opened = finishOpeningWithPreferredFirst('elf/champion');
    const meleeElfOnly = {
      ...opened,
      troops: [createTroopInstance('elf', 'champion'), createTroopInstance('elf', 'beastmaster')],
      unlockedFactionIds: ['elf'],
      essence: 2,
      factionUpgradeIds: Object.values(FACTION_UPGRADES)
        .filter((upgrade) => upgrade.factionId !== 'elf' || upgrade.id !== 'elf-silvershot-doctrine')
        .map((upgrade) => upgrade.id),
      troopTypeUpgradeIds: Object.values(TROOP_TYPE_UPGRADES)
        .filter((upgrade) => !['champion', 'beastmaster'].includes(upgrade.unitTypeId))
        .map((upgrade) => upgrade.id),
    };
    const state = revealEssenceDraft(meleeElfOnly);

    expect(state.activeUpgradeOffer?.optionUpgradeIds).not.toContain('elf-silvershot-doctrine');
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

  it('keeps defeated locked-faction Rift troops latent until that faction unlocks', () => {
    const opened = finishOpening(99, 'human/soldier');
    const latentTroopUnlockId = getLockedFactionTroopUnlockId(opened);
    const state = revealEssenceDraft({
      ...opened,
      unlockedTroopUnlockIds: [latentTroopUnlockId],
      recentTroopUnlockIds: [latentTroopUnlockId],
    });
    const latentFactionId = latentTroopUnlockId.split('/')[0];

    expect(state.unlockedFactionIds).not.toContain(latentFactionId);
    expect(state.activeTroopOffer?.optionTroopUnlockIds).not.toContain(latentTroopUnlockId);
  });

  it('prioritizes newly unlocked Rift troops for already unlocked factions', () => {
    const state = revealEssenceDraft({
      ...finishOpening(99, 'human/soldier'),
      unlockedFactionIds: ['human', 'elf', 'troll'],
      unlockedTroopUnlockIds: ['troll/wizard'],
      recentTroopUnlockIds: ['troll/wizard'],
    });

    expect(state.activeTroopOffer?.optionTroopUnlockIds[2]).toBe('troll/wizard');
  });

  it('targets the third upgrade offer at a random allied troop with the fewest existing upgrades', () => {
    const opened = finishOpening(99, 'human/soldier');
    const upgradedTroop = opened.troops[0]!;
    const targetTroop = opened.troops[1]!;
    const state = revealEssenceDraft({
      ...opened,
      factionUpgradeIds: Object.values(FACTION_UPGRADES)
        .filter((upgrade) => upgrade.factionId === upgradedTroop.factionId)
        .map((upgrade) => upgrade.id),
      troopTypeUpgradeIds: Object.values(TROOP_TYPE_UPGRADES)
        .filter((upgrade) => upgrade.unitTypeId === upgradedTroop.unitTypeId)
        .map((upgrade) => upgrade.id),
    });
    const targetedUpgradeId = state.activeUpgradeOffer?.optionUpgradeIds[2]!;

    expect(
      FACTION_UPGRADES[targetedUpgradeId]?.factionId === targetTroop.factionId ||
        TROOP_TYPE_UPGRADES[targetedUpgradeId]?.unitTypeId === targetTroop.unitTypeId,
    ).toBe(true);
  });

  it('does not use locked-faction troops as a third troop fallback when no recent Rift troops are available', () => {
    const state = revealEssenceDraft(finishOpening(101, 'human/soldier'));
    const ownedFactionIds = new Set(state.unlockedFactionIds);

    expect(state.activeTroopOffer?.optionTroopUnlockIds[2]).toBeDefined();
    expect(ownedFactionIds.has(state.activeTroopOffer!.optionTroopUnlockIds[2]!.split('/')[0]!)).toBe(true);
  });

  it('does not fall back to upgrades that do not affect controlled troops', () => {
    const opened = finishOpening(102, 'human/soldier');
    const ownedFactionIds = new Set(opened.troops.map((troop) => troop.factionId));
    const ownedUnitTypeIds = new Set(opened.troops.map((troop) => troop.unitTypeId));
    const state = revealEssenceDraft({
      ...opened,
      factionUpgradeIds: Object.values(FACTION_UPGRADES)
        .filter((upgrade) => ownedFactionIds.has(upgrade.factionId))
        .map((upgrade) => upgrade.id),
      troopTypeUpgradeIds: Object.values(TROOP_TYPE_UPGRADES)
        .filter((upgrade) => ownedUnitTypeIds.has(upgrade.unitTypeId))
        .map((upgrade) => upgrade.id),
    });
    const fallbackUpgradeId = state.activeUpgradeOffer?.optionUpgradeIds[2];

    expect(fallbackUpgradeId).toBeUndefined();
  });

  it('spends one Essence for a one-sided draft after relevant upgrades are exhausted', () => {
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

  it('distinguishes assignment warnings for no attacks, idle reserves, and Contest holders only', () => {
    const opened = finishOpening(121, 'human/soldier');

    expect(validateAssignments(opened).issues[0]).toMatchObject({
      kind: 'no_troops_assigned',
    });

    const withOneAssigned = assignTroopToRift(opened, opened.troops[0]!.id, opened.openRifts[0]!.id);
    expect(validateAssignments(withOneAssigned).issues[0]).toMatchObject({
      kind: 'idle_troops_remaining',
    });

    const contest = finishContestOpening(304);
    const heldTroopId = contest.troops[0]!.id;
    const heldOnly: GameState = {
      ...contest,
      openRifts: [
        {
          ...contest.openRifts[0]!,
          controller: 'human',
          occupyingPlayerId: 'human',
          occupyingTroopIds: [heldTroopId],
        },
        ...contest.openRifts.slice(1),
      ],
      troops: [{ ...contest.troops[0]!, assignmentRiftId: contest.openRifts[0]!.id }, ...contest.troops.slice(1)],
    };

    expect(validateAssignments(heldOnly).issues[0]).toMatchObject({
      kind: 'holding_only_no_new_attack',
    });
  });

  it('prevents same-faction assignments unless the faction is united', () => {
    const opened = finishOpeningWithPreferredFirst('human/soldier');
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
    expect(canAssignTroopToRift(firstAssigned, secondTroopId, riftId).issues[0]).toMatchObject({
      kind: 'same_faction_conflict',
      troopId: secondTroopId,
      conflictTroopId: firstTroopId,
      riftId,
    });

    const united = {
      ...firstAssigned,
      factionUpgradeIds: ['human-tubthumping' as UpgradeId],
    };
    expect(assignTroopToRift(united, secondTroopId, riftId).troops.find((troop) => troop.id === secondTroopId)?.assignmentRiftId).toBe(riftId);
  });

  it('prevents same troop-type assignments even across different factions', () => {
    const opened = finishOpeningWithPreferredFirst('human/soldier');
    const withGoblinSoldiers = claimTroopOffer(
      {
        ...opened,
        unlockedFactionIds: [...opened.unlockedFactionIds, 'goblin'],
        activeTroopOffer: { kind: 'troop', optionTroopUnlockIds: ['goblin/soldier'] },
      },
      'goblin/soldier',
    );
    const riftId = withGoblinSoldiers.openRifts[0]!.id;
    const firstAssigned = assignTroopToRift(withGoblinSoldiers, 'human/soldier', riftId);
    const blockedSecond = assignTroopToRift(firstAssigned, 'goblin/soldier', riftId);

    expect(blockedSecond.troops.find((troop) => troop.id === 'goblin/soldier')?.assignmentRiftId).toBeNull();
    expect(canAssignTroopToRift(firstAssigned, 'goblin/soldier', riftId).issues[0]).toMatchObject({
      kind: 'same_type_conflict',
      troopId: 'goblin/soldier',
      conflictTroopId: 'human/soldier',
      riftId,
    });
  });

  it('opens scheduled faction unlocks at cycles three and seven with preselected troop grants', () => {
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
    const grantedTroops = cycleThree.activeFactionUnlockOffer!.troopUnlockIdsByFactionId[factionId]!;
    const withFaction = claimFactionUnlockOffer(cycleThree, factionId);
    expect(withFaction.unlockedFactionIds).toContain(factionId);
    expect(withFaction.factionUpgradeIds.filter((upgradeId) => FACTION_UPGRADES[upgradeId]?.factionId === factionId)).toHaveLength(1);
    expect(withFaction.phase).toBe('planning');
    expect(withFaction.activeTroopTypeUnlockOffer).toBeNull();
    expect(withFaction.troops.map((troop) => troop.id)).toEqual(expect.arrayContaining(grantedTroops));

    const cycleSevenState: GameState = {
      ...withFaction,
      cycleNumber: 6,
      phase: 'planning',
    };
    const cycleSeven = applyCycleOutcomes(cycleSevenState, { records: [] }).nextState;
    const cycleSevenFactionId = cycleSeven.activeFactionUnlockOffer?.optionFactionIds[0];
    expect(cycleSeven.phase).toBe('faction_unlock');
    expect(cycleSeven.activeFactionUnlockOffer?.troopUnlockChoiceCount).toBe(3);
    expect(cycleSevenFactionId ? cycleSeven.activeFactionUnlockOffer?.upgradeIdsByFactionId[cycleSevenFactionId]?.length : 0).toBe(2);
    expect(cycleSevenFactionId ? cycleSeven.activeFactionUnlockOffer?.troopUnlockIdsByFactionId[cycleSevenFactionId]?.length : 0).toBe(3);
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

  it('includes latent defeated troops in scheduled choices when their faction is unlocked', () => {
    const opened = finishOpening(89, 'human/soldier');
    const latentFactionId = getOpeningFactionOptionIds(opened).find((factionId) => !opened.unlockedFactionIds.includes(factionId)) ?? 'troll';
    const latentTroopUnlockId = getOffRosterTroopUnlockId(latentFactionId);
    const cycleThreeState: GameState = {
      ...opened,
      cycleNumber: 3,
      phase: 'faction_unlock',
      unlockedTroopUnlockIds: [latentTroopUnlockId],
      activeFactionUnlockOffer: {
        kind: 'faction_unlock',
        cycleNumber: 3,
        optionFactionIds: [latentFactionId],
        upgradeIdsByFactionId: { [latentFactionId]: [] } as Record<FactionId, UpgradeId[]>,
        troopUnlockChoiceCount: 2,
        troopUnlockIdsByFactionId: { [latentFactionId]: [latentTroopUnlockId] } as Record<FactionId, TroopUnlockId[]>,
      },
    };

    const withTroll = claimFactionUnlockOffer(cycleThreeState, latentFactionId);

    expect(withTroll.phase).toBe('planning');
    expect(withTroll.activeTroopTypeUnlockOffer).toBeNull();
    expect(withTroll.troops.map((troop) => troop.id)).toContain(latentTroopUnlockId);
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

  it('starts Contest with three neutral tier-one Rifts and an AI roster', () => {
    const state = finishContestOpening(301);

    expect(state.gameMode).toBe('contest');
    expect(state.openRifts).toHaveLength(3);
    expect(state.openRifts.every((rift) => rift.tier === 1 && rift.controller === 'neutral')).toBe(true);
    expect(state.contest?.players.ai.troops).toHaveLength(2);
    expect(state.contest?.players.ai.essence).toBe(2);
    expect(state.contest?.opponentInfo).toBeNull();
  });

  it('reveals Contest opponent info from the end of the previous cycle', () => {
    const opened = finishContestOpening(301);
    const resolution = resolveAssignedRifts(opened);
    const prepared = resolution.preparedState ?? opened;
    const result = applyCycleOutcomes(prepared, resolution);
    const opponentInfo = result.nextState.contest?.opponentInfo;

    expect(opponentInfo?.cycleNumber).toBe(1);
    expect(opponentInfo?.ai.troops).toEqual(result.nextState.contest?.players.ai.troops);
    expect(opponentInfo?.ai.factionUpgradeIds).toEqual(result.nextState.contest?.players.ai.factionUpgradeIds);
    expect(opponentInfo?.ai.troopTypeUpgradeIds).toEqual(result.nextState.contest?.players.ai.troopTypeUpgradeIds);
  });

  it('prevents Contest players from assigning troops to Rifts they already control', () => {
    const opened = finishContestOpening(302);
    const riftId = opened.openRifts[0]!.id;
    const troopId = opened.troops[0]!.id;
    const controlled: GameState = {
      ...opened,
      openRifts: [{ ...opened.openRifts[0]!, controller: 'human', occupyingPlayerId: 'human', occupyingTroopIds: [troopId] }],
      troops: [{ ...opened.troops[0]!, assignmentRiftId: riftId }, ...opened.troops.slice(1)],
    };

    expect(canAssignTroopToRift(controlled, opened.troops[1]!.id, riftId).issues[0]?.kind).toBe('own_rift');
  });

  it('scores newly conquered Contest Rifts after cycle battles and keeps occupying troops committed', () => {
    const contestOpening = finishContestOpening(303);
    const humanTroopId = contestOpening.troops[0]!.id;
    const opened = assignTroopToRift(contestOpening, humanTroopId, contestOpening.openRifts[0]!.id);
    const rift = opened.openRifts[0]!;
    const result = applyCycleOutcomes(opened, {
      records: [
        {
          riftId: rift.id,
          assignedTroopIds: [humanTroopId],
          battleInput: {
            seed: 12,
            riftId: rift.id,
            tier: rift.tier,
            mutatorIds: rift.mutatorIds,
            saturation: rift.saturation,
            playerCombatants: [],
            enemyCombatants: [],
          },
          replay: makeReplay('contest-guardian-victory', rift.id, 'victory'),
          outcome: 'victory',
          victoryPoints: rift.victoryPoints,
          recoveryMap: { [humanTroopId]: 1 },
          contest: { kind: 'guardian', attackerId: 'human', defenderId: 'neutral', winnerId: 'human' },
        },
      ],
      preparedState: opened,
    });

    expect(result.nextState.victoryPoints).toBe(rift.tier);
    expect(result.nextState.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('human');
    expect(result.nextState.troops.find((troop) => troop.id === humanTroopId)?.assignmentRiftId).toBe(rift.id);
  });

  it('keeps Contest holders through successful defense and failed attacks, and releases them after lost defense', () => {
    const opened = finishContestOpening(303);
    const heldTroopId = opened.troops[0]!.id;
    const attackingTroopId = opened.contest!.players.ai.troops[0]!.id;
    const rift = opened.openRifts[0]!;
    const held: GameState = {
      ...opened,
      openRifts: [{ ...rift, controller: 'human', occupyingPlayerId: 'human', occupyingTroopIds: [heldTroopId] }, ...opened.openRifts.slice(1)],
      troops: [{ ...opened.troops[0]!, assignmentRiftId: rift.id }, ...opened.troops.slice(1)],
      contest: {
        players: {
          ai: {
            ...opened.contest!.players.ai,
            troops: [{ ...opened.contest!.players.ai.troops[0]!, assignmentRiftId: rift.id }, ...opened.contest!.players.ai.troops.slice(1)],
          },
        },
        opponentInfo: null,
      },
    };
    const baseRecord = {
      riftId: rift.id,
      assignedTroopIds: [heldTroopId, attackingTroopId],
      battleInput: { seed: 12, riftId: rift.id, tier: rift.tier, mutatorIds: rift.mutatorIds, saturation: rift.saturation, playerCombatants: [], enemyCombatants: [] },
      victoryPoints: rift.victoryPoints,
      recoveryMap: { [heldTroopId]: 1, [attackingTroopId]: 1 },
      contest: { kind: 'occupation' as const, attackerId: 'ai' as const, defenderId: 'human' as const, winnerId: 'human' as const },
    };

    const defended = applyCycleOutcomes(held, {
      records: [{ ...baseRecord, replay: makeReplay('defended', rift.id, 'victory'), outcome: 'victory' }],
      preparedState: held,
    }).nextState;
    expect(defended.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('human');
    expect(defended.troops.find((troop) => troop.id === heldTroopId)?.assignmentRiftId).toBe(rift.id);

    const lost = applyCycleOutcomes(held, {
      records: [{
        ...baseRecord,
        replay: makeReplay('lost-defense', rift.id, 'defeat'),
        outcome: 'defeat',
        contest: { ...baseRecord.contest, winnerId: 'ai' as const },
      }],
      preparedState: held,
    }).nextState;
    expect(lost.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('ai');
    expect(lost.troops.find((troop) => troop.id === heldTroopId)?.assignmentRiftId).toBeNull();
  });

  it('keeps two player-held Contest Rifts when the rival attacks both and loses', () => {
    const opened = finishContestOpening(308);
    const [firstHeldTroop, secondHeldTroop] = opened.troops;
    const [firstAttacker, secondAttacker] = opened.contest!.players.ai.troops;
    const [firstRift, secondRift] = opened.openRifts;
    const held: GameState = {
      ...opened,
      openRifts: [
        { ...firstRift!, controller: 'human', occupyingPlayerId: 'human', occupyingTroopIds: [firstHeldTroop!.id] },
        { ...secondRift!, controller: 'human', occupyingPlayerId: 'human', occupyingTroopIds: [secondHeldTroop!.id] },
        ...opened.openRifts.slice(2),
      ],
      troops: [
        { ...firstHeldTroop!, assignmentRiftId: firstRift!.id },
        { ...secondHeldTroop!, assignmentRiftId: secondRift!.id },
      ],
      contest: {
        players: {
          ai: {
            ...opened.contest!.players.ai,
            troops: [
              { ...firstAttacker!, assignmentRiftId: firstRift!.id },
              { ...secondAttacker!, assignmentRiftId: secondRift!.id },
            ],
          },
        },
        opponentInfo: null,
      },
    };
    const records: RiftResolutionRecord[] = [
      {
        riftId: firstRift!.id,
        assignedTroopIds: [firstHeldTroop!.id, firstAttacker!.id],
        battleInput: { seed: 12, riftId: firstRift!.id, tier: firstRift!.tier, mutatorIds: firstRift!.mutatorIds, saturation: firstRift!.saturation, playerCombatants: [], enemyCombatants: [] },
        replay: makeReplay('defended-first', firstRift!.id, 'victory'),
        outcome: 'victory',
        victoryPoints: firstRift!.victoryPoints,
        recoveryMap: { [firstHeldTroop!.id]: 1, [firstAttacker!.id]: 1 },
        contest: { kind: 'occupation', attackerId: 'ai', defenderId: 'human', winnerId: 'human' },
      },
      {
        riftId: secondRift!.id,
        assignedTroopIds: [secondHeldTroop!.id, secondAttacker!.id],
        battleInput: { seed: 13, riftId: secondRift!.id, tier: secondRift!.tier, mutatorIds: secondRift!.mutatorIds, saturation: secondRift!.saturation, playerCombatants: [], enemyCombatants: [] },
        replay: makeReplay('defended-second', secondRift!.id, 'victory'),
        outcome: 'victory',
        victoryPoints: secondRift!.victoryPoints,
        recoveryMap: { [secondHeldTroop!.id]: 1, [secondAttacker!.id]: 1 },
        contest: { kind: 'occupation', attackerId: 'ai', defenderId: 'human', winnerId: 'human' },
      },
    ];

    const result = applyCycleOutcomes(held, { records, preparedState: held }).nextState;

    expect(result.replayIndex.filter((entry) => [firstRift!.id, secondRift!.id].includes(entry.riftId ?? '')).map((entry) => entry.outcome)).toEqual([
      'victory',
      'victory',
    ]);
    expect(result.openRifts.find((entry) => entry.id === firstRift!.id)?.controller).toBe('human');
    expect(result.openRifts.find((entry) => entry.id === secondRift!.id)?.controller).toBe('human');
    expect(result.troops.find((troop) => troop.id === firstHeldTroop!.id)?.assignmentRiftId).toBe(firstRift!.id);
    expect(result.troops.find((troop) => troop.id === secondHeldTroop!.id)?.assignmentRiftId).toBe(secondRift!.id);
  });

  it('covers Contest ownership outcomes for neutral attacks, rival attacks, and defenses', () => {
    const opened = finishContestOpening(309);
    const rift = opened.openRifts[0]!;
    const humanTroopId = opened.troops[0]!.id;
    const aiTroopId = opened.contest!.players.ai.troops[0]!.id;
    const baseInput = { seed: 12, riftId: rift.id, tier: rift.tier, mutatorIds: rift.mutatorIds, saturation: rift.saturation, playerCombatants: [], enemyCombatants: [] };

    const playerNeutral = applyCycleOutcomes(assignTroopToRift(opened, humanTroopId, rift.id), {
      records: [{
        riftId: rift.id,
        assignedTroopIds: [humanTroopId],
        battleInput: baseInput,
        replay: makeReplay('player-neutral', rift.id, 'victory'),
        outcome: 'victory',
        victoryPoints: rift.victoryPoints,
        recoveryMap: { [humanTroopId]: 1 },
        contest: { kind: 'guardian', attackerId: 'human', defenderId: 'neutral', winnerId: 'human' },
      }],
      preparedState: assignTroopToRift(opened, humanTroopId, rift.id),
    }).nextState;

    const playerAttackRival = applyCycleOutcomes({
      ...opened,
      openRifts: [{ ...rift, controller: 'ai', occupyingPlayerId: 'ai', occupyingTroopIds: [aiTroopId] }, ...opened.openRifts.slice(1)],
      troops: [{ ...opened.troops[0]!, assignmentRiftId: rift.id }, ...opened.troops.slice(1)],
    }, {
      records: [{
        riftId: rift.id,
        assignedTroopIds: [humanTroopId, aiTroopId],
        battleInput: baseInput,
        replay: makeReplay('player-rival', rift.id, 'victory'),
        outcome: 'victory',
        victoryPoints: rift.victoryPoints,
        recoveryMap: { [humanTroopId]: 1, [aiTroopId]: 1 },
        contest: { kind: 'occupation', attackerId: 'human', defenderId: 'ai', winnerId: 'human' },
      }],
      preparedState: {
        ...opened,
        openRifts: [{ ...rift, controller: 'ai', occupyingPlayerId: 'ai', occupyingTroopIds: [aiTroopId] }, ...opened.openRifts.slice(1)],
        troops: [{ ...opened.troops[0]!, assignmentRiftId: rift.id }, ...opened.troops.slice(1)],
      },
    }).nextState;

    const rivalAttackPlayerBase: GameState = {
      ...opened,
      openRifts: [{ ...rift, controller: 'human', occupyingPlayerId: 'human', occupyingTroopIds: [humanTroopId] }, ...opened.openRifts.slice(1)],
      troops: [{ ...opened.troops[0]!, assignmentRiftId: rift.id }, ...opened.troops.slice(1)],
      contest: {
        players: {
          ai: {
            ...opened.contest!.players.ai,
            troops: [{ ...opened.contest!.players.ai.troops[0]!, assignmentRiftId: rift.id }, ...opened.contest!.players.ai.troops.slice(1)],
          },
        },
        opponentInfo: null,
      },
    };
    const rivalAttackPlayer = applyCycleOutcomes(rivalAttackPlayerBase, {
      records: [{
        riftId: rift.id,
        assignedTroopIds: [humanTroopId, aiTroopId],
        battleInput: baseInput,
        replay: makeReplay('rival-player', rift.id, 'defeat'),
        outcome: 'defeat',
        victoryPoints: rift.victoryPoints,
        recoveryMap: { [humanTroopId]: 1, [aiTroopId]: 1 },
        contest: { kind: 'occupation', attackerId: 'ai', defenderId: 'human', winnerId: 'ai' },
      }],
      preparedState: rivalAttackPlayerBase,
    }).nextState;

    expect(playerNeutral.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('human');
    expect(playerAttackRival.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('human');
    expect(rivalAttackPlayer.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('ai');
  });

  it('locks a troop holding a Contest Rift against reassignment', () => {
    const opened = finishContestOpening(307);
    const troopId = opened.troops[0]!.id;
    const rift = opened.openRifts[0]!;
    const held: GameState = {
      ...opened,
      openRifts: [{ ...rift, controller: 'human', occupyingPlayerId: 'human', occupyingTroopIds: [troopId] }, ...opened.openRifts.slice(1)],
      troops: [{ ...opened.troops[0]!, assignmentRiftId: rift.id }, ...opened.troops.slice(1)],
    };

    expect(canAssignTroopToRift(held, troopId, opened.openRifts[1]!.id).issues[0]?.kind).toBe('holding_troop_locked');
    expect(assignTroopToRift(held, troopId, opened.openRifts[1]!.id).troops.find((troop) => troop.id === troopId)?.assignmentRiftId).toBe(rift.id);
  });

  it('has no obsolete Recovering Rift state label', () => {
    const labels: Record<RiftState, string> = {
      discovered: 'Discovered',
      resolved_victory: 'Resolved Victory',
      resolved_defeat: 'Resolved Defeat',
      expired: 'Expired',
    };

    expect(Object.values(labels)).not.toContain('Recovering');
  });

  it('adds Contest Rifts on cycles three, five, and seven and ends after cycle eight', () => {
    const cycleTwo: GameState = { ...finishContestOpening(304), cycleNumber: 2 };
    const cycleThree = applyCycleOutcomes(cycleTwo, { records: [], preparedState: cycleTwo }).nextState;
    expect(cycleThree.openRifts.some((rift) => rift.cycleNumber === 3 && rift.tier === 2)).toBe(true);

    const cycleEight: GameState = { ...cycleThree, cycleNumber: 8, phase: 'planning', activeFactionUnlockOffer: null };
    const ended = applyCycleOutcomes(cycleEight, { records: [], preparedState: cycleEight }).nextState;
    expect(ended.phase).toBe('game_over');
  });

  it('falls back to smaller Contest AI target subsets after unwinnable ambitious Rifts', () => {
    const opened = finishContestOpening(305);
    const hardEnemyArmy = [
      resolveEnemyCombatant([], [], 'troll', 'champion', 4, 'hard-1'),
      resolveEnemyCombatant([], [], 'orc', 'avenger', 4, 'hard-2'),
      resolveEnemyCombatant([], [], 'dwarf', 'knight', 4, 'hard-3'),
      resolveEnemyCombatant([], [], 'fae', 'wizard', 4, 'hard-4'),
    ];
    const baseRift = opened.openRifts[0]!;
    const hardRifts = [1, 2, 3, 4, 5].map((index) => ({
      ...baseRift,
      id: `hard-${index}`,
      tier: 4,
      seed: baseRift.seed + index,
      enemyArmy: hardEnemyArmy,
      victoryPoints: 4,
      controller: 'neutral' as const,
      occupyingPlayerId: null,
      occupyingTroopIds: [],
    }));
    const easyRift = {
      ...baseRift,
      id: 'easy-rift',
      tier: 1,
      seed: baseRift.seed + 99,
      enemyArmy: [],
      victoryPoints: 1,
      controller: 'neutral' as const,
      occupyingPlayerId: null,
      occupyingTroopIds: [],
    };
    const state: GameState = {
      ...opened,
      cycleNumber: 8,
      essence: 0,
      contest: {
        players: {
          ai: {
            ...opened.contest!.players.ai,
            essence: 0,
            activeTroopOffer: null,
            activeUpgradeOffer: null,
            activeFactionUnlockOffer: null,
            activeTroopTypeUnlockOffer: null,
          },
        },
      },
      openRifts: [...hardRifts, easyRift],
    };

    const prepared = resolveAssignedRifts(state).preparedState!;

    expect(prepared.contest?.players.ai.troops.some((troop) => troop.assignmentRiftId === 'easy-rift')).toBe(true);
  });

  it('archives Contest battles, including AI guardian expeditions, and labels their encounter type', () => {
    const opened = finishContestOpening(306);
    const rift = opened.openRifts[0]!;
    const aiTroopId = opened.contest!.players.ai.troops[0]!.id;
    const baseInput = {
      seed: 12,
      riftId: rift.id,
      tier: rift.tier,
      mutatorIds: rift.mutatorIds,
      saturation: rift.saturation,
      playerCombatants: [],
      enemyCombatants: [],
    };
    const result = applyCycleOutcomes(opened, {
      records: [
        {
          riftId: rift.id,
          assignedTroopIds: [aiTroopId],
          battleInput: baseInput,
          replay: makeReplay('hidden-ai-guardian', rift.id, 'victory'),
          outcome: 'victory',
          victoryPoints: rift.victoryPoints,
          recoveryMap: { [aiTroopId]: 1 },
          contest: { kind: 'guardian', attackerId: 'ai', defenderId: 'neutral', winnerId: 'ai' },
        },
        {
          riftId: rift.id,
          assignedTroopIds: [opened.troops[0]!.id],
          battleInput: baseInput,
          replay: makeReplay('visible-human-guardian', rift.id, 'victory'),
          outcome: 'victory',
          victoryPoints: rift.victoryPoints,
          recoveryMap: { [opened.troops[0]!.id]: 1 },
          contest: { kind: 'guardian', attackerId: 'human', defenderId: 'neutral', winnerId: 'human' },
        },
        {
          riftId: rift.id,
          assignedTroopIds: [opened.troops[0]!.id, aiTroopId],
          battleInput: baseInput,
          replay: makeReplay('visible-pvp', rift.id, 'victory'),
          outcome: 'victory',
          victoryPoints: rift.victoryPoints,
          recoveryMap: { [opened.troops[0]!.id]: 1, [aiTroopId]: 1 },
          contest: { kind: 'pvp', defenderId: 'neutral', winnerId: 'human' },
        },
      ],
      preparedState: opened,
    });

    expect(result.replayPayloadWrites.map((write) => write.replayId)).toEqual(['hidden-ai-guardian', 'visible-human-guardian', 'visible-pvp']);
    expect(result.nextState.replayIndex.map((entry) => entry.replayId)).toEqual(['visible-pvp', 'visible-human-guardian', 'hidden-ai-guardian']);
    expect(result.nextState.replayIndex.map((entry) => entry.encounterLabel)).toEqual(['Rival', 'Neutral Guardians', 'Rival vs Neutral Guardians']);
    expect(result.nextState.replayIndex.find((entry) => entry.replayId === 'hidden-ai-guardian')?.outcome).toBe('victory');
    expect(result.nextState.replayIndex.find((entry) => entry.replayId === 'hidden-ai-guardian')?.summary.startsWith('VICTORY')).toBe(true);
  });

  it('keeps the bug report seed auditable when the Contest AI plans its cycle-one expedition', () => {
    let state = finishContestOpening(193111407);
    state = revealEssenceDraft(state);
    state = claimTroopOffer(state, 'fae/wizard');
    state = claimUpgradeOffer(state, 'fae-changeling');
    state = assignTroopToRift(state, 'fae/elementalist', 'contest-cycle-1-rift-2');
    state = assignTroopToRift(state, 'troll/avenger', 'contest-cycle-1-rift-3');
    state = assignTroopToRift(state, 'fae/wizard', 'contest-cycle-1-rift-3');

    const resolution = resolveAssignedRifts(state);
    const aiRecord = resolution.records.find((record) => record.contest?.attackerId === 'ai');
    const result = applyCycleOutcomes(state, resolution);

    expect(aiRecord?.riftId).toBe('contest-cycle-1-rift-1');
    expect(aiRecord?.assignedTroopIds).toEqual(['dwarf/elementalist', 'orc/militia']);
    expect(aiRecord?.outcome).toBe('victory');
    expect(
      result.nextState.replayIndex.some(
        (entry) =>
          entry.riftId === 'contest-cycle-1-rift-1' &&
          entry.encounterLabel === 'Rival vs Neutral Guardians' &&
          entry.outcome === 'victory' &&
          entry.summary.startsWith('VICTORY'),
      ),
    ).toBe(true);
  });
});
