import { describe, expect, it } from 'vitest';
import {
  applyCycleOutcomes,
  assignTroopToRift,
  canAssignTroopToRift,
  claimRaceUnlockOffer,
  claimOpeningTroop,
  claimTroopOffer,
  claimUpgradeOffer,
  clearTroopAssignment,
  continuePlaying,
  CONTEST_FINAL_CYCLE,
  deserializeGameState,
  getOpeningRaceStarterTroopUnlockIds,
  getOpeningRaceOptionIds,
  revealEssenceDraft,
  resolveAssignedRifts,
  serializeGameState,
  startOpeningCampaign,
  startNewGame,
  validateAssignments,
} from './game';
import { createTroopInstance, resolveEnemyCombatant } from './army';
import { ALL_TROOP_UNLOCK_IDS, RACE_UPGRADES, NATIVE_TROOP_UNLOCK_IDS, isNativeTroopUnlockId, TROOP_CLASS_UPGRADES } from './unitCatalog';
import { upgradeAffectsTroop } from './upgrades';
import type { BattleReplay, RaceId, GameState, RiftResolutionRecord, RiftState, TroopUnlockId, UpgradeId } from './types';

function makeReplay(recordId: string, riftId: string, outcome: 'victory' | 'defeat'): BattleReplay {
  return {
    id: recordId,
    seed: 1,
    riftId,
    tier: 1,
    mutatorIds: [],
    mapRadius: 3,
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
  const openingRaceIds = new Set(getOpeningRaceOptionIds(state));
  return NATIVE_TROOP_UNLOCK_IDS.filter((troopUnlockId) => openingRaceIds.has(troopUnlockId.split('/')[0] as RaceId)) as TroopUnlockId[];
}

function pickOpeningPair(state: GameState, preferredFirstTroopUnlockId?: string): [TroopUnlockId, TroopUnlockId] {
  const startersByRaceId = getOpeningRaceStarterTroopUnlockIds(state);
  const candidates = getOpeningRaceOptionIds(state).map((raceId) => startersByRaceId[raceId]);
  const firstTroopUnlockId =
    preferredFirstTroopUnlockId && candidates.includes(preferredFirstTroopUnlockId as TroopUnlockId)
      ? (preferredFirstTroopUnlockId as TroopUnlockId)
      : candidates[0]!;
  const [firstRaceId, firstUnitClassId] = firstTroopUnlockId.split('/');
  const secondTroopUnlockId = NATIVE_TROOP_UNLOCK_IDS.find((troopUnlockId) => {
    const [raceId, unitClassId] = troopUnlockId.split('/');
    return candidates.includes(troopUnlockId as TroopUnlockId) && raceId !== firstRaceId && unitClassId !== firstUnitClassId;
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
    if (Object.values(getOpeningRaceStarterTroopUnlockIds(state)).includes(preferredFirstTroopUnlockId)) {
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

function getLockedRaceTroopUnlockId(state: GameState): TroopUnlockId {
  const lockedRaceId = (Object.keys(RACE_UPGRADES) as UpgradeId[])
    .map((upgradeId) => RACE_UPGRADES[upgradeId]!.raceId)
    .find((raceId) => !state.unlockedRaceIds.includes(raceId))!;
  return NATIVE_TROOP_UNLOCK_IDS.find((troopUnlockId) => troopUnlockId.startsWith(`${lockedRaceId}/`)) as TroopUnlockId;
}

function getOffRosterTroopUnlockId(raceId: RaceId): TroopUnlockId {
  return ALL_TROOP_UNLOCK_IDS.find((troopUnlockId) => troopUnlockId.startsWith(`${raceId}/`) && !isNativeTroopUnlockId(troopUnlockId))!;
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
    expect(opened.unlockedRaceIds).toEqual([firstTroopUnlockId.split('/')[0], secondTroopUnlockId.split('/')[0]]);
    expect(opened.unlockedTroopUnlockIds).toEqual([]);
    expect(opened.troops.map((troop) => troop.id)).toEqual([firstTroopUnlockId, secondTroopUnlockId]);
    expect(opened.openRifts).toHaveLength(4);
  });

  it('limits opening choices to two troops from the four opening races', () => {
    const state = startNewGame(72);
    const [firstTroopUnlockId, secondTroopUnlockId] = pickOpeningPair(state);
    const firstPick = claimOpeningTroop(state, firstTroopUnlockId);
    const secondPick = claimOpeningTroop(firstPick, secondTroopUnlockId);
    const invalidTroopUnlockId = NATIVE_TROOP_UNLOCK_IDS.find(
      (troopUnlockId) => !getOpeningRaceOptionIds(state).includes(troopUnlockId.split('/')[0] as RaceId),
    )!;
    const extraOpeningTroopUnlockId = getOpeningNativeTroopUnlockIds(state).find(
      (troopUnlockId) => ![firstTroopUnlockId, secondTroopUnlockId].includes(troopUnlockId),
    )!;

    expect(getOpeningRaceOptionIds(state)).toHaveLength(4);
    expect(getOpeningRaceOptionIds(state).some((raceId) => !['human', 'elf', 'goblin', 'troll'].includes(raceId))).toBe(true);
    expect(claimOpeningTroop(state, invalidTroopUnlockId as TroopUnlockId).troops).toEqual([]);
    expect(claimOpeningTroop(secondPick, extraOpeningTroopUnlockId).troops.map((troop) => troop.id)).toEqual([
      firstTroopUnlockId,
      secondTroopUnlockId,
    ]);
  });

  it('preselects unique opening starter troop classes across offered races', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const starters = Object.values(getOpeningRaceStarterTroopUnlockIds(startNewGame(seed)));
      const unitClassIds = starters.map((troopUnlockId) => troopUnlockId.split('/')[1]);
      expect(new Set(unitClassIds).size).toBe(unitClassIds.length);
    }
  });

  it('rejects opening choices that repeat a race or troop class', () => {
    const state = startNewGame(71);
    const [firstTroopUnlockId] = pickOpeningPair(state);
    const firstPick = claimOpeningTroop(state, firstTroopUnlockId);
    const [firstRaceId, firstUnitClassId] = firstTroopUnlockId.split('/');
    const repeatedRaceTroopUnlockId = getOpeningNativeTroopUnlockIds(state).find(
      (troopUnlockId) => troopUnlockId.startsWith(`${firstRaceId}/`) && troopUnlockId !== firstTroopUnlockId,
    )!;
    const repeatedTypeTroopUnlockId = getOpeningNativeTroopUnlockIds(state).find(
      (troopUnlockId) => !troopUnlockId.startsWith(`${firstRaceId}/`) && troopUnlockId.endsWith(`/${firstUnitClassId}`),
    )!;

    expect(claimOpeningTroop(firstPick, repeatedRaceTroopUnlockId).troops).toHaveLength(1);
    expect(claimOpeningTroop(firstPick, repeatedTypeTroopUnlockId).troops).toHaveLength(1);
  });

  it('rejects non-native opening troop choices', () => {
    const state = startNewGame(77);
    const openingRaceId = getOpeningRaceOptionIds(state)[0]!;
    const attempted = claimOpeningTroop(state, getOffRosterTroopUnlockId(openingRaceId));

    expect(attempted.phase).toBe('opening_unlock');
    expect(attempted.troops).toEqual([]);
  });

  it('spends two Essence to reveal troop and upgrade draft offers together', () => {
    const state = revealEssenceDraft(finishOpening(8, 'human/soldier'));

    expect(state.essence).toBe(0);
    expect(state.activeTroopOffer).not.toBeNull();
    expect(state.activeUpgradeOffer).not.toBeNull();
  });

  it('builds troop draft offers only from unlocked race rosters', () => {
    const state = revealEssenceDraft(finishOpening(8, 'human/soldier'));
    const offer = state.activeTroopOffer;
    const ownedRaceIds = new Set(state.unlockedRaceIds);

    expect(offer).not.toBeNull();
    expect(offer?.optionTroopUnlockIds).toHaveLength(3);
    expect(new Set(offer?.optionTroopUnlockIds).size).toBe(3);
    expect(offer?.optionTroopUnlockIds.every((troopUnlockId) => isNativeTroopUnlockId(troopUnlockId))).toBe(true);
    expect(offer?.optionTroopUnlockIds.every((troopUnlockId) => ownedRaceIds.has(troopUnlockId.split('/')[0]!))).toBe(true);
    expect(offer?.optionTroopUnlockIds.some((troopUnlockId) => ownedRaceIds.has(troopUnlockId.split('/')[0] as RaceId))).toBe(true);
    expect(offer?.optionTroopUnlockIds.some((troopUnlockId) => state.troops.some((troop) => troopUnlockId.endsWith(`/${troop.unitClassId}`)))).toBe(true);
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
    expect([...claimedBoth.raceUpgradeIds, ...claimedBoth.troopClassUpgradeIds]).toContain(claimedUpgradeId);
  });

  it('builds upgrade offers from owned troop class, owned race, and off-bucket options', () => {
    const state = revealEssenceDraft(finishOpening(10, 'human/archer'));
    const offer = state.activeUpgradeOffer;
    const ownedUnitClassIds = new Set(state.troops.map((troop) => troop.unitClassId));
    const ownedRaceIds = new Set(state.unlockedRaceIds);

    expect(offer).not.toBeNull();
    expect(offer?.optionUpgradeIds).toHaveLength(3);
    expect(new Set(offer?.optionUpgradeIds).size).toBe(3);
    expect(offer?.optionUpgradeIds.some((upgradeId) => ownedUnitClassIds.has(TROOP_CLASS_UPGRADES[upgradeId]?.unitClassId ?? ''))).toBe(true);
    expect(offer?.optionUpgradeIds.some((upgradeId) => ownedRaceIds.has(RACE_UPGRADES[upgradeId]?.raceId ?? ''))).toBe(true);
    expect(offer?.optionUpgradeIds.every((upgradeId) => upgradeId in RACE_UPGRADES || upgradeId in TROOP_CLASS_UPGRADES)).toBe(true);
  });

  it('only treats race upgrades as affecting troops when their effects can apply', () => {
    expect(upgradeAffectsTroop('elf-silvershot-doctrine', createTroopInstance('elf', 'champion'))).toBe(false);
    expect(upgradeAffectsTroop('elf-silvershot-doctrine', createTroopInstance('elf', 'beastmaster'))).toBe(false);
    expect(upgradeAffectsTroop('elf-silvershot-doctrine', createTroopInstance('elf', 'archer'))).toBe(true);
    expect(upgradeAffectsTroop('elf-silvershot-doctrine', createTroopInstance('elf', 'druid'))).toBe(true);
    expect(upgradeAffectsTroop('elf-feline-grace', createTroopInstance('elf', 'champion'))).toBe(false);
    expect(upgradeAffectsTroop('elf-feline-grace', createTroopInstance('elf', 'ranger'))).toBe(true);
  });

  it('does not offer upgrades that affect none of the controlled troops', () => {
    const opened = finishOpeningWithPreferredFirst('elf/champion');
    const meleeElfOnly = {
      ...opened,
      troops: [createTroopInstance('elf', 'champion'), createTroopInstance('elf', 'beastmaster')],
      unlockedRaceIds: ['elf'],
      essence: 2,
      raceUpgradeIds: Object.values(RACE_UPGRADES)
        .filter((upgrade) => upgrade.raceId !== 'elf' || upgrade.id !== 'elf-silvershot-doctrine')
        .map((upgrade) => upgrade.id),
      troopClassUpgradeIds: Object.values(TROOP_CLASS_UPGRADES)
        .filter((upgrade) => !['champion', 'beastmaster'].includes(upgrade.unitClassId))
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
    expect([...claimed.raceUpgradeIds, ...claimed.troopClassUpgradeIds]).toContain(claimedUpgradeId);
    expect(loaded.ok).toBe(true);
    expect(loaded.state?.activeTroopOffer).toEqual(claimed.activeTroopOffer);
  });

  it('keeps defeated locked-race Rift troops latent until that race unlocks', () => {
    const opened = finishOpening(99, 'human/soldier');
    const latentTroopUnlockId = getLockedRaceTroopUnlockId(opened);
    const state = revealEssenceDraft({
      ...opened,
      unlockedTroopUnlockIds: [latentTroopUnlockId],
      recentTroopUnlockIds: [latentTroopUnlockId],
    });
    const latentRaceId = latentTroopUnlockId.split('/')[0];

    expect(state.unlockedRaceIds).not.toContain(latentRaceId);
    expect(state.activeTroopOffer?.optionTroopUnlockIds).not.toContain(latentTroopUnlockId);
  });

  it('prioritizes newly unlocked Rift troops for already unlocked races', () => {
    const state = revealEssenceDraft({
      ...finishOpening(99, 'human/soldier'),
      unlockedRaceIds: ['human', 'elf', 'troll'],
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
      raceUpgradeIds: Object.values(RACE_UPGRADES)
        .filter((upgrade) => upgrade.raceId === upgradedTroop.raceId)
        .map((upgrade) => upgrade.id),
      troopClassUpgradeIds: Object.values(TROOP_CLASS_UPGRADES)
        .filter((upgrade) => upgrade.unitClassId === upgradedTroop.unitClassId)
        .map((upgrade) => upgrade.id),
    });
    const targetedUpgradeId = state.activeUpgradeOffer?.optionUpgradeIds[2]!;

    expect(
      RACE_UPGRADES[targetedUpgradeId]?.raceId === targetTroop.raceId ||
        TROOP_CLASS_UPGRADES[targetedUpgradeId]?.unitClassId === targetTroop.unitClassId,
    ).toBe(true);
  });

  it('excludes the first upgrade class and second upgrade race before targeting the third upgrade offer', () => {
    const state = revealEssenceDraft(finishOpening(3));
    const [firstUpgradeId, secondUpgradeId, thirdUpgradeId] = state.activeUpgradeOffer!.optionUpgradeIds;
    const excludedUnitClassId = TROOP_CLASS_UPGRADES[firstUpgradeId!]?.unitClassId;
    const excludedRaceId = RACE_UPGRADES[secondUpgradeId!]?.raceId;

    expect(state.troops.map((troop) => `${troop.raceId}/${troop.unitClassId}`)).toEqual(['fae/shaman', 'dwarf/soldier']);
    expect(excludedUnitClassId).toBe('soldier');
    expect(excludedRaceId).toBe('dwarf');
    expect(TROOP_CLASS_UPGRADES[thirdUpgradeId!]?.unitClassId).not.toBe(excludedUnitClassId);
    expect(RACE_UPGRADES[thirdUpgradeId!]?.raceId).not.toBe(excludedRaceId);
    expect(upgradeAffectsTroop(thirdUpgradeId!, state.troops[0]!)).toBe(true);
  });

  it('does not use locked-race troops as a third troop fallback when no recent Rift troops are available', () => {
    const state = revealEssenceDraft(finishOpening(101, 'human/soldier'));
    const ownedRaceIds = new Set(state.unlockedRaceIds);

    expect(state.activeTroopOffer?.optionTroopUnlockIds[2]).toBeDefined();
    expect(ownedRaceIds.has(state.activeTroopOffer!.optionTroopUnlockIds[2]!.split('/')[0]!)).toBe(true);
  });

  it('does not fall back to upgrades that do not affect controlled troops', () => {
    const opened = finishOpening(102, 'human/soldier');
    const ownedRaceIds = new Set(opened.troops.map((troop) => troop.raceId));
    const ownedUnitClassIds = new Set(opened.troops.map((troop) => troop.unitClassId));
    const state = revealEssenceDraft({
      ...opened,
      raceUpgradeIds: Object.values(RACE_UPGRADES)
        .filter((upgrade) => ownedRaceIds.has(upgrade.raceId))
        .map((upgrade) => upgrade.id),
      troopClassUpgradeIds: Object.values(TROOP_CLASS_UPGRADES)
        .filter((upgrade) => ownedUnitClassIds.has(upgrade.unitClassId))
        .map((upgrade) => upgrade.id),
    });
    const fallbackUpgradeId = state.activeUpgradeOffer?.optionUpgradeIds[2];

    expect(fallbackUpgradeId).toBeUndefined();
  });

  it('spends one Essence for a one-sided draft after relevant upgrades are exhausted', () => {
    const state = revealEssenceDraft({
      ...finishOpening(103, 'human/soldier'),
      essence: 1,
      raceUpgradeIds: Object.values(RACE_UPGRADES).map((upgrade) => upgrade.id),
      troopClassUpgradeIds: Object.values(TROOP_CLASS_UPGRADES).map((upgrade) => upgrade.id),
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
          controller: 'playerOne',
          occupyingPlayerId: 'playerOne',
          occupyingTroopIds: [heldTroopId],
        },
        ...contest.openRifts.slice(1),
      ],
      troops: [{ ...contest.troops[0]!, assignmentRiftId: contest.openRifts[0]!.id }, ...contest.troops.slice(1)],
    };

    expect(validateAssignments(heldOnly).issues[0]).toMatchObject({
      kind: 'idle_troops_remaining',
    });
  });

  it('prevents same-race assignments unless the race is united', () => {
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
      kind: 'same_race_conflict',
      troopId: secondTroopId,
      conflictTroopId: firstTroopId,
      riftId,
    });

    const united = {
      ...firstAssigned,
      raceUpgradeIds: ['human-tubthumping' as UpgradeId],
    };
    expect(assignTroopToRift(united, secondTroopId, riftId).troops.find((troop) => troop.id === secondTroopId)?.assignmentRiftId).toBe(riftId);
  });

  it('prevents same troop-class assignments even across different races', () => {
    const opened = finishOpeningWithPreferredFirst('human/soldier');
    const withGoblinSoldiers = claimTroopOffer(
      {
        ...opened,
        unlockedRaceIds: [...opened.unlockedRaceIds, 'goblin'],
        activeTroopOffer: { kind: 'troop', optionTroopUnlockIds: ['goblin/soldier'] },
      },
      'goblin/soldier',
    );
    const riftId = withGoblinSoldiers.openRifts[0]!.id;
    const firstAssigned = assignTroopToRift(withGoblinSoldiers, 'human/soldier', riftId);
    const blockedSecond = assignTroopToRift(firstAssigned, 'goblin/soldier', riftId);

    expect(blockedSecond.troops.find((troop) => troop.id === 'goblin/soldier')?.assignmentRiftId).toBeNull();
    expect(canAssignTroopToRift(firstAssigned, 'goblin/soldier', riftId).issues[0]).toMatchObject({
      kind: 'same_class_conflict',
      troopId: 'goblin/soldier',
      conflictTroopId: 'human/soldier',
      riftId,
    });
  });

  it('allows multiple Militia assignments with R-selected', () => {
    const opening = startNewGame(12);
    const [firstTroopUnlockId, secondTroopUnlockId] = pickOpeningPair(opening);
    const opened = startOpeningCampaign(claimOpeningTroop(claimOpeningTroop(opening, firstTroopUnlockId), secondTroopUnlockId));
    const riftId = opened.openRifts[0]!.id;
    const state = {
      ...opened,
      troopClassUpgradeIds: ['militia-rat-behavior'],
      troops: [createTroopInstance('human', 'militia'), createTroopInstance('goblin', 'militia')],
    };

    const firstAssigned = assignTroopToRift(state, 'human/militia', riftId);
    const secondAssigned = assignTroopToRift(firstAssigned, 'goblin/militia', riftId);

    expect(secondAssigned.troops.find((troop) => troop.id === 'goblin/militia')?.assignmentRiftId).toBe(riftId);
    expect(validateAssignments(secondAssigned).issues.some((issue) => issue.kind === 'same_class_conflict')).toBe(false);
  });

  it('opens scheduled race unlocks at cycles three and seven with preselected troop grants', () => {
    const cycleThreeState: GameState = {
      ...finishOpening(123, 'human/soldier'),
      cycleNumber: 2,
      phase: 'planning',
    };
    const cycleThree = applyCycleOutcomes(cycleThreeState, { records: [] }).nextState;

    expect(cycleThree.cycleNumber).toBe(3);
    expect(cycleThree.phase).toBe('race_unlock');
    expect(cycleThree.activeRaceUnlockOffer?.optionRaceIds.length).toBeGreaterThan(0);
    expect(cycleThree.activeRaceUnlockOffer?.troopUnlockChoiceCount).toBe(2);

    const raceId = cycleThree.activeRaceUnlockOffer!.optionRaceIds[0]!;
    const grantedTroops = cycleThree.activeRaceUnlockOffer!.troopUnlockIdsByRaceId[raceId]!;
    const withRace = claimRaceUnlockOffer(cycleThree, raceId);
    expect(withRace.unlockedRaceIds).toContain(raceId);
    expect(withRace.raceUpgradeIds.filter((upgradeId) => RACE_UPGRADES[upgradeId]?.raceId === raceId)).toHaveLength(1);
    expect(withRace.phase).toBe('planning');
    expect(withRace.activeTroopClassUnlockOffer).toBeNull();
    expect(withRace.troops.map((troop) => troop.id)).toEqual(expect.arrayContaining(grantedTroops));

    const cycleSevenState: GameState = {
      ...withRace,
      cycleNumber: 6,
      phase: 'planning',
    };
    const cycleSeven = applyCycleOutcomes(cycleSevenState, { records: [] }).nextState;
    const cycleSevenRaceId = cycleSeven.activeRaceUnlockOffer?.optionRaceIds[0];
    expect(cycleSeven.phase).toBe('race_unlock');
    expect(cycleSeven.activeRaceUnlockOffer?.troopUnlockChoiceCount).toBe(3);
    expect(cycleSevenRaceId ? cycleSeven.activeRaceUnlockOffer?.upgradeIdsByRaceId[cycleSevenRaceId]?.length : 0).toBe(2);
    expect(cycleSevenRaceId ? cycleSeven.activeRaceUnlockOffer?.troopUnlockIdsByRaceId[cycleSevenRaceId]?.length : 0).toBe(3);
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
            playerCombatants: [],
            enemyCombatants: [
              {
                combatantId: 'enemy-off-roster',
                troopInstanceId: null,
                raceId: 'troll',
                unitClassId: 'wizard',
                label: 'Troll Wizard',
                role: 'backline',
                unitClassTag: 'wizard',
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

  it('includes latent defeated troops in scheduled choices when their race is unlocked', () => {
    const opened = finishOpening(89, 'human/soldier');
    const latentRaceId = getOpeningRaceOptionIds(opened).find((raceId) => !opened.unlockedRaceIds.includes(raceId)) ?? 'troll';
    const latentTroopUnlockId = getOffRosterTroopUnlockId(latentRaceId);
    const cycleThreeState: GameState = {
      ...opened,
      cycleNumber: 3,
      phase: 'race_unlock',
      unlockedTroopUnlockIds: [latentTroopUnlockId],
      activeRaceUnlockOffer: {
        kind: 'race_unlock',
        cycleNumber: 3,
        optionRaceIds: [latentRaceId],
        upgradeIdsByRaceId: { [latentRaceId]: [] } as Record<RaceId, UpgradeId[]>,
        troopUnlockChoiceCount: 2,
        troopUnlockIdsByRaceId: { [latentRaceId]: [latentTroopUnlockId] } as Record<RaceId, TroopUnlockId[]>,
      },
    };

    const withTroll = claimRaceUnlockOffer(cycleThreeState, latentRaceId);

    expect(withTroll.phase).toBe('planning');
    expect(withTroll.activeTroopClassUnlockOffer).toBeNull();
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
    expect(state.contest?.players.playerTwo.troops).toHaveLength(2);
    expect(state.contest?.players.playerTwo.essence).toBe(2);
    expect(state.contest?.opponentInfo).toBeNull();
  });

  it('reveals Contest opponent info from the end of the previous cycle', () => {
    const opened = finishContestOpening(301);
    const resolution = resolveAssignedRifts(opened);
    const prepared = resolution.preparedState ?? opened;
    const result = applyCycleOutcomes(prepared, resolution);
    const opponentInfo = result.nextState.contest?.opponentInfo;

    expect(opponentInfo?.cycleNumber).toBe(1);
    expect(opponentInfo?.playerTwo.troops).toEqual(result.nextState.contest?.players.playerTwo.troops);
    expect(opponentInfo?.playerTwo.raceUpgradeIds).toEqual(result.nextState.contest?.players.playerTwo.raceUpgradeIds);
    expect(opponentInfo?.playerTwo.troopClassUpgradeIds).toEqual(result.nextState.contest?.players.playerTwo.troopClassUpgradeIds);
  });

  it('prevents Contest players from assigning troops to Rifts they already control', () => {
    const opened = finishContestOpening(302);
    const riftId = opened.openRifts[0]!.id;
    const troopId = opened.troops[0]!.id;
    const controlled: GameState = {
      ...opened,
      openRifts: [{ ...opened.openRifts[0]!, controller: 'playerOne', occupyingPlayerId: 'playerOne', occupyingTroopIds: [troopId] }],
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
            playerCombatants: [],
            enemyCombatants: [],
          },
          replay: makeReplay('contest-guardian-victory', rift.id, 'victory'),
          outcome: 'victory',
          victoryPoints: rift.victoryPoints,
          recoveryMap: { [humanTroopId]: 1 },
          contest: { kind: 'guardian', attackerId: 'playerOne', defenderId: 'neutral', winnerId: 'playerOne' },
        },
      ],
      preparedState: opened,
    });

    expect(result.nextState.victoryPoints).toBe(rift.tier);
    expect(result.nextState.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('playerOne');
    expect(result.nextState.troops.find((troop) => troop.id === humanTroopId)?.assignmentRiftId).toBe(rift.id);
  });

  it('keeps Contest holders through successful defense and failed attacks, and releases them after lost defense', () => {
    const opened = finishContestOpening(303);
    const heldTroopId = opened.troops[0]!.id;
    const attackingTroopId = opened.contest!.players.playerTwo.troops[0]!.id;
    const rift = opened.openRifts[0]!;
    const held: GameState = {
      ...opened,
      openRifts: [{ ...rift, controller: 'playerOne', occupyingPlayerId: 'playerOne', occupyingTroopIds: [heldTroopId] }, ...opened.openRifts.slice(1)],
      troops: [{ ...opened.troops[0]!, assignmentRiftId: rift.id }, ...opened.troops.slice(1)],
      contest: {
        players: {
          ...opened.contest!.players,
          playerTwo: {
            ...opened.contest!.players.playerTwo,
            troops: [{ ...opened.contest!.players.playerTwo.troops[0]!, assignmentRiftId: rift.id }, ...opened.contest!.players.playerTwo.troops.slice(1)],
          },
        },
        opponentInfo: null,
      },
    };
    const baseRecord = {
      riftId: rift.id,
      assignedTroopIds: [heldTroopId, attackingTroopId],
      battleInput: { seed: 12, riftId: rift.id, tier: rift.tier, mutatorIds: rift.mutatorIds, playerCombatants: [], enemyCombatants: [] },
      victoryPoints: rift.victoryPoints,
      recoveryMap: { [heldTroopId]: 1, [attackingTroopId]: 1 },
      contest: { kind: 'occupation' as const, attackerId: 'playerTwo' as const, defenderId: 'playerOne' as const, winnerId: 'playerOne' as const },
    };

    const defended = applyCycleOutcomes(held, {
      records: [{ ...baseRecord, replay: makeReplay('defended', rift.id, 'victory'), outcome: 'victory' }],
      preparedState: held,
    }).nextState;
    expect(defended.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('playerOne');
    expect(defended.troops.find((troop) => troop.id === heldTroopId)?.assignmentRiftId).toBe(rift.id);

    const lost = applyCycleOutcomes(held, {
      records: [{
        ...baseRecord,
        replay: makeReplay('lost-defense', rift.id, 'defeat'),
        outcome: 'defeat',
        contest: { ...baseRecord.contest, winnerId: 'playerTwo' as const },
      }],
      preparedState: held,
    }).nextState;
    expect(lost.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('playerTwo');
    expect(lost.troops.find((troop) => troop.id === heldTroopId)?.assignmentRiftId).toBeNull();
  });

  it('keeps two player-held Contest Rifts when the rival attacks both and loses', () => {
    const opened = finishContestOpening(308);
    const [firstHeldTroop, secondHeldTroop] = opened.troops;
    const [firstAttacker, secondAttacker] = opened.contest!.players.playerTwo.troops;
    const [firstRift, secondRift] = opened.openRifts;
    const held: GameState = {
      ...opened,
      openRifts: [
        { ...firstRift!, controller: 'playerOne', occupyingPlayerId: 'playerOne', occupyingTroopIds: [firstHeldTroop!.id] },
        { ...secondRift!, controller: 'playerOne', occupyingPlayerId: 'playerOne', occupyingTroopIds: [secondHeldTroop!.id] },
        ...opened.openRifts.slice(2),
      ],
      troops: [
        { ...firstHeldTroop!, assignmentRiftId: firstRift!.id },
        { ...secondHeldTroop!, assignmentRiftId: secondRift!.id },
      ],
      contest: {
        players: {
          ...opened.contest!.players,
          playerTwo: {
            ...opened.contest!.players.playerTwo,
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
        battleInput: { seed: 12, riftId: firstRift!.id, tier: firstRift!.tier, mutatorIds: firstRift!.mutatorIds, playerCombatants: [], enemyCombatants: [] },
        replay: makeReplay('defended-first', firstRift!.id, 'victory'),
        outcome: 'victory',
        victoryPoints: firstRift!.victoryPoints,
        recoveryMap: { [firstHeldTroop!.id]: 1, [firstAttacker!.id]: 1 },
        contest: { kind: 'occupation', attackerId: 'playerTwo', defenderId: 'playerOne', winnerId: 'playerOne' },
      },
      {
        riftId: secondRift!.id,
        assignedTroopIds: [secondHeldTroop!.id, secondAttacker!.id],
        battleInput: { seed: 13, riftId: secondRift!.id, tier: secondRift!.tier, mutatorIds: secondRift!.mutatorIds, playerCombatants: [], enemyCombatants: [] },
        replay: makeReplay('defended-second', secondRift!.id, 'victory'),
        outcome: 'victory',
        victoryPoints: secondRift!.victoryPoints,
        recoveryMap: { [secondHeldTroop!.id]: 1, [secondAttacker!.id]: 1 },
        contest: { kind: 'occupation', attackerId: 'playerTwo', defenderId: 'playerOne', winnerId: 'playerOne' },
      },
    ];

    const result = applyCycleOutcomes(held, { records, preparedState: held }).nextState;

    expect(result.replayIndex.filter((entry) => [firstRift!.id, secondRift!.id].includes(entry.riftId ?? '')).map((entry) => entry.outcome)).toEqual([
      'victory',
      'victory',
    ]);
    expect(result.openRifts.find((entry) => entry.id === firstRift!.id)?.controller).toBe('playerOne');
    expect(result.openRifts.find((entry) => entry.id === secondRift!.id)?.controller).toBe('playerOne');
    expect(result.troops.find((troop) => troop.id === firstHeldTroop!.id)?.assignmentRiftId).toBe(firstRift!.id);
    expect(result.troops.find((troop) => troop.id === secondHeldTroop!.id)?.assignmentRiftId).toBe(secondRift!.id);
  });

  it('covers Contest ownership outcomes for neutral attacks, rival attacks, and defenses', () => {
    const opened = finishContestOpening(309);
    const rift = opened.openRifts[0]!;
    const humanTroopId = opened.troops[0]!.id;
    const aiTroopId = opened.contest!.players.playerTwo.troops[0]!.id;
    const baseInput = { seed: 12, riftId: rift.id, tier: rift.tier, mutatorIds: rift.mutatorIds, playerCombatants: [], enemyCombatants: [] };

    const playerNeutral = applyCycleOutcomes(assignTroopToRift(opened, humanTroopId, rift.id), {
      records: [{
        riftId: rift.id,
        assignedTroopIds: [humanTroopId],
        battleInput: baseInput,
        replay: makeReplay('player-neutral', rift.id, 'victory'),
        outcome: 'victory',
        victoryPoints: rift.victoryPoints,
        recoveryMap: { [humanTroopId]: 1 },
        contest: { kind: 'guardian', attackerId: 'playerOne', defenderId: 'neutral', winnerId: 'playerOne' },
      }],
      preparedState: assignTroopToRift(opened, humanTroopId, rift.id),
    }).nextState;

    const playerAttackRival = applyCycleOutcomes({
      ...opened,
      openRifts: [{ ...rift, controller: 'playerTwo', occupyingPlayerId: 'playerTwo', occupyingTroopIds: [aiTroopId] }, ...opened.openRifts.slice(1)],
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
        contest: { kind: 'occupation', attackerId: 'playerOne', defenderId: 'playerTwo', winnerId: 'playerOne' },
      }],
      preparedState: {
        ...opened,
        openRifts: [{ ...rift, controller: 'playerTwo', occupyingPlayerId: 'playerTwo', occupyingTroopIds: [aiTroopId] }, ...opened.openRifts.slice(1)],
        troops: [{ ...opened.troops[0]!, assignmentRiftId: rift.id }, ...opened.troops.slice(1)],
      },
    }).nextState;

    const rivalAttackPlayerBase: GameState = {
      ...opened,
      openRifts: [{ ...rift, controller: 'playerOne', occupyingPlayerId: 'playerOne', occupyingTroopIds: [humanTroopId] }, ...opened.openRifts.slice(1)],
      troops: [{ ...opened.troops[0]!, assignmentRiftId: rift.id }, ...opened.troops.slice(1)],
      contest: {
        players: {
          ...opened.contest!.players,
          playerTwo: {
            ...opened.contest!.players.playerTwo,
            troops: [{ ...opened.contest!.players.playerTwo.troops[0]!, assignmentRiftId: rift.id }, ...opened.contest!.players.playerTwo.troops.slice(1)],
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
        contest: { kind: 'occupation', attackerId: 'playerTwo', defenderId: 'playerOne', winnerId: 'playerTwo' },
      }],
      preparedState: rivalAttackPlayerBase,
    }).nextState;

    expect(playerNeutral.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('playerOne');
    expect(playerAttackRival.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('playerOne');
    expect(rivalAttackPlayer.openRifts.find((entry) => entry.id === rift.id)?.controller).toBe('playerTwo');
  });

  it('locks a troop holding a Contest Rift against reassignment', () => {
    const opened = finishContestOpening(307);
    const troopId = opened.troops[0]!.id;
    const rift = opened.openRifts[0]!;
    const held: GameState = {
      ...opened,
      openRifts: [{ ...rift, controller: 'playerOne', occupyingPlayerId: 'playerOne', occupyingTroopIds: [troopId] }, ...opened.openRifts.slice(1)],
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

  it('adds Contest Rifts on cycles three, five, and seven and ends after cycle ten', () => {
    const cycleTwo: GameState = { ...finishContestOpening(304), cycleNumber: 2 };
    const cycleThree = applyCycleOutcomes(cycleTwo, { records: [], preparedState: cycleTwo }).nextState;
    expect(cycleThree.openRifts.some((rift) => rift.cycleNumber === 3 && rift.tier === 2)).toBe(true);

    const cycleEight: GameState = { ...cycleThree, cycleNumber: 8, phase: 'planning', activeRaceUnlockOffer: null };
    const notEnded = applyCycleOutcomes(cycleEight, { records: [], preparedState: cycleEight }).nextState;
    expect(notEnded.phase).toBe('planning');

    const cycleTen: GameState = { ...notEnded, cycleNumber: CONTEST_FINAL_CYCLE, phase: 'planning', activeRaceUnlockOffer: null };
    const ended = applyCycleOutcomes(cycleTen, { records: [], preparedState: cycleTen }).nextState;
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
          ...opened.contest!.players,
          playerTwo: {
            ...opened.contest!.players.playerTwo,
            essence: 0,
            activeTroopOffer: null,
            activeUpgradeOffer: null,
            activeRaceUnlockOffer: null,
            activeTroopClassUnlockOffer: null,
          },
        },
      },
      openRifts: [...hardRifts, easyRift],
    };

    const prepared = resolveAssignedRifts(state).preparedState!;

    expect(prepared.contest?.players.playerTwo.troops.some((troop) => troop.assignmentRiftId === 'easy-rift')).toBe(true);
  });

  it('packs Contest AI troops into the lowest-tier Rifts when no winning battles are found', () => {
    const opened = finishContestOpening(309);
    const overwhelmingEnemyArmy = [
      resolveEnemyCombatant([], [], 'troll', 'champion', 4, 'overwhelming-1'),
      resolveEnemyCombatant([], [], 'orc', 'avenger', 4, 'overwhelming-2'),
      resolveEnemyCombatant([], [], 'dwarf', 'knight', 4, 'overwhelming-3'),
      resolveEnemyCombatant([], [], 'fae', 'wizard', 4, 'overwhelming-4'),
    ];
    const baseRift = opened.openRifts[0]!;
    const lowRift = {
      ...baseRift,
      id: 'low-rift',
      tier: 1,
      seed: baseRift.seed + 11,
      enemyArmy: overwhelmingEnemyArmy,
      victoryPoints: 1,
      controller: 'neutral' as const,
      occupyingPlayerId: null,
      occupyingTroopIds: [],
    };
    const secondLowRift = {
      ...baseRift,
      id: 'second-low-rift',
      tier: 1,
      seed: baseRift.seed + 12,
      enemyArmy: overwhelmingEnemyArmy,
      victoryPoints: 1,
      controller: 'neutral' as const,
      occupyingPlayerId: null,
      occupyingTroopIds: [],
    };
    const highRift = {
      ...baseRift,
      id: 'high-rift',
      tier: 3,
      seed: baseRift.seed + 13,
      enemyArmy: overwhelmingEnemyArmy,
      victoryPoints: 3,
      controller: 'neutral' as const,
      occupyingPlayerId: null,
      occupyingTroopIds: [],
    };
    const aiTroops = [
      createTroopInstance('human', 'soldier'),
      createTroopInstance('elf', 'archer'),
      createTroopInstance('dwarf', 'knight'),
      createTroopInstance('human', 'wizard'),
      createTroopInstance('goblin', 'archer'),
    ];
    const state: GameState = {
      ...opened,
      cycleNumber: 8,
      contest: {
        players: {
          ...opened.contest!.players,
          playerTwo: {
            ...opened.contest!.players.playerTwo,
            essence: 0,
            troops: aiTroops,
            unlockedRaceIds: ['human', 'elf', 'dwarf', 'goblin'],
            unlockedTroopUnlockIds: ['human/soldier', 'elf/archer', 'dwarf/knight', 'human/wizard', 'goblin/archer'],
            activeTroopOffer: null,
            activeUpgradeOffer: null,
            activeRaceUnlockOffer: null,
            activeTroopClassUnlockOffer: null,
          },
        },
      },
      openRifts: [highRift, secondLowRift, lowRift],
    };

    const prepared = resolveAssignedRifts(state).preparedState!;
    const assignments = Object.fromEntries(prepared.contest!.players.playerTwo.troops.map((troop) => [troop.id, troop.assignmentRiftId]));

    expect(Object.values(assignments)).not.toContain('high-rift');
    expect(prepared.contest!.players.playerTwo.troops.filter((troop) => troop.assignmentRiftId === 'low-rift')).toHaveLength(3);
    expect(prepared.contest!.players.playerTwo.troops.filter((troop) => troop.assignmentRiftId === 'second-low-rift')).toHaveLength(2);
    expect(assignments['human/soldier']).toBe('low-rift');
    expect(assignments['human/wizard']).toBe('second-low-rift');
    expect(assignments['goblin/archer']).toBe('second-low-rift');
  });

  it('archives Contest battles, including AI guardian expeditions, and labels their encounter type', () => {
    const opened = finishContestOpening(306);
    const rift = opened.openRifts[0]!;
    const aiTroopId = opened.contest!.players.playerTwo.troops[0]!.id;
    const baseInput = {
      seed: 12,
      riftId: rift.id,
      tier: rift.tier,
      mutatorIds: rift.mutatorIds,
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
          contest: { kind: 'guardian', attackerId: 'playerTwo', defenderId: 'neutral', winnerId: 'playerTwo' },
        },
        {
          riftId: rift.id,
          assignedTroopIds: [opened.troops[0]!.id],
          battleInput: baseInput,
          replay: makeReplay('visible-human-guardian', rift.id, 'victory'),
          outcome: 'victory',
          victoryPoints: rift.victoryPoints,
          recoveryMap: { [opened.troops[0]!.id]: 1 },
          contest: { kind: 'guardian', attackerId: 'playerOne', defenderId: 'neutral', winnerId: 'playerOne' },
        },
        {
          riftId: rift.id,
          assignedTroopIds: [opened.troops[0]!.id, aiTroopId],
          battleInput: baseInput,
          replay: makeReplay('visible-pvp', rift.id, 'victory'),
          outcome: 'victory',
          victoryPoints: rift.victoryPoints,
          recoveryMap: { [opened.troops[0]!.id]: 1, [aiTroopId]: 1 },
          contest: { kind: 'pvp', defenderId: 'neutral', winnerId: 'playerOne' },
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
    const aiRecord = resolution.records.find((record) => record.contest?.attackerId === 'playerTwo');
    const result = applyCycleOutcomes(state, resolution);

    expect(aiRecord?.riftId).toBe('contest-cycle-1-rift-3');
    expect(aiRecord?.assignedTroopIds).toEqual(['orc/militia']);
    expect(aiRecord?.outcome).toBe('victory');
    expect(
      result.nextState.replayIndex.some(
        (entry) =>
          entry.riftId === 'contest-cycle-1-rift-3' &&
          entry.encounterLabel === 'Rival vs Neutral Guardians' &&
          entry.outcome === 'victory' &&
          entry.summary.startsWith('VICTORY'),
      ),
    ).toBe(true);
  });
});
