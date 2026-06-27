import { describe, expect, it } from 'vitest';
import { buildBattleInputFromResolvedCombatants } from './battle';
import { assignTroopToRift, claimOpeningTroop, getOpeningRaceStarterTroopUnlockIds, startNewGame, startOpeningCampaign } from './game';
import { buildHarvestedLadderPayload, generateBaselineLadderPayload, ladderRiftSetToRiftInstances, validateLadderRiftSetPayload } from './ladder';
import type { RiftResolutionRecord } from './types';

describe('Ladder Rift-set payloads', () => {
  it('validates and converts baseline payloads into playable Rifts', () => {
    const payload = generateBaselineLadderPayload(1234, 1);
    expect(validateLadderRiftSetPayload(payload, 1)).toEqual([]);

    const rifts = ladderRiftSetToRiftInstances({
      id: 'set-1',
      cycleNumber: 1,
      generation: 0,
      sourceSetId: null,
      payload,
    });

    expect(rifts).toHaveLength(4);
    expect(rifts[0]?.enemyArmy.length).toBeGreaterThan(0);
    expect(() =>
      buildBattleInputFromResolvedCombatants(
        1,
        rifts[0]!.id,
        rifts[0]!.tier,
        rifts[0]!.mutatorIds,
        [],
        [],
        rifts[0]!.enemyRaceUpgradeIds ?? [],
        rifts[0]!.enemyTroopClassUpgradeIds ?? [],
        [],
        rifts[0]!.enemyArmy,
      ),
    ).not.toThrow();
  });

  it('tags unknown catalog ids as compatibility issues', () => {
    const payload = generateBaselineLadderPayload(1234, 1);
    payload.rifts[0]!.guardians[0]!.raceId = 'missing-race';
    payload.rifts[0]!.guardians[0]!.unitClassId = 'missing-unit-class';
    payload.rifts[0]!.guardians[0]!.raceUpgradeIds = ['missing-race-upgrade'];
    payload.rifts[0]!.guardians[0]!.troopClassUpgradeIds = ['missing-unit-class-upgrade'];
    payload.rifts[0]!.mutatorIds = ['missing-mutator'];

    const issues = validateLadderRiftSetPayload(payload, 1);
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'unknown_race',
        'unknown_unit_class',
        'unknown_race_upgrade',
        'unknown_troop_class_upgrade',
        'unknown_mutator',
      ]),
    );
  });

  it('stores victorious player troops and upgrade snapshots when harvesting conquered Rifts', () => {
    const opening = startNewGame(1234, 'ladder');
    const starters = getOpeningRaceStarterTroopUnlockIds(opening);
    const [firstTroopUnlockId, secondTroopUnlockId] = [starters.human!, starters.elf!];
    const prepared = startOpeningCampaign(claimOpeningTroop(claimOpeningTroop(opening, firstTroopUnlockId), secondTroopUnlockId));
    const payload = generateBaselineLadderPayload(9999, 1);
    const openRifts = ladderRiftSetToRiftInstances({
      id: 'parent-set',
      cycleNumber: 1,
      generation: 0,
      sourceSetId: null,
      payload,
    });
    const assigned = assignTroopToRift(
      {
        ...prepared,
        raceUpgradeIds: ['human-hold-the-standard'],
        troopClassUpgradeIds: ['soldier-shield-drill'],
        openRifts,
      },
      prepared.troops[0]!.id,
      openRifts[0]!.id,
    );

    const harvested = buildHarvestedLadderPayload(assigned, [
      {
        riftId: openRifts[0]!.id,
        assignedTroopIds: [prepared.troops[0]!.id],
        battleInput: {
          seed: 1,
          riftId: openRifts[0]!.id,
          tier: openRifts[0]!.tier,
          mutatorIds: openRifts[0]!.mutatorIds,
          playerCombatants: [],
          enemyCombatants: [],
        },
        replay: null as never,
        outcome: 'victory',
        victoryPoints: openRifts[0]!.victoryPoints,
        recoveryMap: {},
      } satisfies RiftResolutionRecord,
    ]);

    expect(harvested.rifts[0]!.guardians).toEqual([
      {
        raceId: prepared.troops[0]!.raceId,
        unitClassId: prepared.troops[0]!.unitClassId,
        raceUpgradeIds: ['human-hold-the-standard'],
        troopClassUpgradeIds: ['soldier-shield-drill'],
      },
    ]);
    expect(harvested.rifts[1]!.guardians).toEqual(payload.rifts[1]!.guardians);
  });
});
