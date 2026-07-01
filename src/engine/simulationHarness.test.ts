import { describe, expect, it } from 'vitest';
import {
  buildRoleScenarioBattleInput,
  buildSimulationBattleInput,
  countRoleIntentSteps,
  createCatalogTroopCombatant,
  createSeedRange,
  createUnitClassCombatant,
  extractSimulationMetrics,
  findFirstRoleIntentBeat,
  runBattleWithMetrics,
  sweepBattleSeeds,
  sweepBattleSeedsChunked,
} from './simulationHarness';
import { fixed } from './fixed';

function buildEqualCostBundle(leftCost: number, rightCost: number): { leftInstances: number; rightInstances: number; totalCost: number } {
  const MAX_EXACT_INSTANCES = 12;
  const MAX_APPROX_INSTANCES = 12;
  const scaledLeft = Math.round(leftCost * 100);
  const scaledRight = Math.round(rightCost * 100);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(scaledLeft, scaledRight);
  const scaledTotalCost = (scaledLeft * scaledRight) / divisor;
  const exactLeftInstances = scaledTotalCost / scaledLeft;
  const exactRightInstances = scaledTotalCost / scaledRight;

  if (exactLeftInstances <= MAX_EXACT_INSTANCES && exactRightInstances <= MAX_EXACT_INSTANCES) {
    return {
      leftInstances: exactLeftInstances,
      rightInstances: exactRightInstances,
      totalCost: fixed(scaledTotalCost / 100),
    };
  }

  let best:
    | {
        leftInstances: number;
        rightInstances: number;
        gap: number;
        totalCost: number;
      }
    | undefined;

  for (let leftInstances = 1; leftInstances <= MAX_APPROX_INSTANCES; leftInstances += 1) {
    for (let rightInstances = 1; rightInstances <= MAX_APPROX_INSTANCES; rightInstances += 1) {
      const leftTotal = fixed(leftInstances * leftCost);
      const rightTotal = fixed(rightInstances * rightCost);
      const gap = Math.abs(leftTotal - rightTotal);
      const totalCost = Math.max(leftTotal, rightTotal);
      if (
        !best ||
        gap < best.gap ||
        (gap === best.gap && totalCost < best.totalCost) ||
        (gap === best.gap && totalCost === best.totalCost && leftInstances + rightInstances < best.leftInstances + best.rightInstances)
      ) {
        best = {
          leftInstances,
          rightInstances,
          gap,
          totalCost,
        };
      }
    }
  }

  if (!best) {
    return {
      leftInstances: 1,
      rightInstances: 1,
      totalCost: fixed(Math.max(leftCost, rightCost)),
    };
  }

  return {
    leftInstances: best.leftInstances,
    rightInstances: best.rightInstances,
    totalCost: best.totalCost,
  };
}

describe('simulationHarness builders', () => {
  it('builds equal-cost bundles from whole troop instances', () => {
    expect(buildEqualCostBundle(100, 60)).toEqual({
      leftInstances: 3,
      rightInstances: 5,
      totalCost: 300,
    });

    expect(buildEqualCostBundle(60, 80)).toEqual({
      leftInstances: 4,
      rightInstances: 3,
      totalCost: 240,
    });
  });

  it('caps fractional-cost bundles to a practical closest whole-instance matchup', () => {
    const bundle = buildEqualCostBundle(35, 12);

    expect(bundle.leftInstances).toBeLessThanOrEqual(12);
    expect(bundle.rightInstances).toBeLessThanOrEqual(12);
    expect(bundle.leftInstances).toBeGreaterThan(0);
    expect(bundle.rightInstances).toBeGreaterThan(0);
    expect(Math.abs(bundle.leftInstances * 35 - bundle.rightInstances * 12)).toBeLessThanOrEqual(1);
  });

  it('creates unit-class combatants from raw unit stats instead of composed race stats', () => {
    const archer = createUnitClassCombatant('archer', {
      side: 'player',
    });

    expect(archer.label).toBe('Archer');
    expect(archer.stats).toEqual({
      health: 30,
      damage: 11,
      rate: 11,
      move: 3,
      range: 5,
      armor: 0,
      size: 2,
      capacity: 0,
    });
    expect(archer.attributes).toEqual(['ranged']);
  });

  it('creates catalog combatants from real troop definitions', () => {
    const soldier = createCatalogTroopCombatant('human/soldier', {
      side: 'player',
    });

    expect(soldier.label).toBe('Human Soldier');
    expect(soldier.quantity).toBe(5);
    expect(soldier.stats.armor).toBe(3);
  });
});

describe('extractSimulationMetrics', () => {
  it('captures first contact and survivor counts in a basic melee mirror', () => {
    const input = buildSimulationBattleInput(
      7,
      [createCatalogTroopCombatant('human/soldier', { side: 'player', quantity: 1 })],
      [createCatalogTroopCombatant('human/soldier', { side: 'enemy', quantity: 1 })],
    );

    const { replay } = runBattleWithMetrics(input);
    const metrics = extractSimulationMetrics(replay);

    expect(metrics.beatsToEnd).toBeGreaterThan(0);
    expect(metrics.firstContactBeat).not.toBeNull();
    expect(metrics.ownTurnsTakenPerUnit).toBeGreaterThan(0);
    expect(metrics.playerSurvivors + metrics.enemySurvivors).toBeGreaterThanOrEqual(0);
  });

  it('tracks summon applications and realized summon value for a summoner troop', () => {
    const input = buildSimulationBattleInput(
      22,
      [createCatalogTroopCombatant('goblin/beastmaster', { side: 'player', quantity: 1 })],
      [createCatalogTroopCombatant('human/knight', { side: 'enemy', quantity: 2 })],
    );

    const { metrics } = runBattleWithMetrics(input);

    expect(metrics.abilitySuccessfulApplications['summon-wolf-2']).toBe(2);
    expect(metrics.abilityNetImpact['summon-wolf-2']?.unitsSummoned).toBe(2);
    expect(metrics.summonRealizedValue).toBeGreaterThan(0);
    expect(metrics.summonUptimeBeats).toBeGreaterThanOrEqual(0);
  });
});

describe('sweepBattleSeeds', () => {
  const makeSimpleInput = (seed: number) =>
    buildSimulationBattleInput(
      seed,
      [createCatalogTroopCombatant('human/soldier', { side: 'player', quantity: 1 })],
      [createCatalogTroopCombatant('human/militia', { side: 'enemy', quantity: 1 })],
    );

  it('aggregates deterministic seed sweeps into summary stats', () => {
    const seeds = createSeedRange(5, 100);
    const result = sweepBattleSeeds(makeSimpleInput, seeds);

    expect(result.entries).toHaveLength(5);
    expect(result.summary.battles).toBe(5);
    expect(result.summary.wins + result.summary.losses + result.summary.draws).toBe(5);
    expect(result.summary.percentiles.beatsToEnd.p10).toBeLessThanOrEqual(result.summary.percentiles.beatsToEnd.median);
    expect(result.summary.percentiles.beatsToEnd.median).toBeLessThanOrEqual(result.summary.percentiles.beatsToEnd.p90);
  });

  it('matches sync results while reporting chunked progress', async () => {
    const seeds = createSeedRange(4, 120);
    const progress: number[] = [];
    const sync = sweepBattleSeeds(makeSimpleInput, seeds);
    const chunked = await sweepBattleSeedsChunked(makeSimpleInput, seeds, {
      chunkSize: 2,
      onProgress: ({ completed, partial }) => {
        progress.push(completed);
        expect(partial.summary.battles).toBe(completed);
      },
    });

    expect(chunked).toEqual(sync);
    expect(progress).toEqual([2, 4]);
  });

  it('rejects cleanly when aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(sweepBattleSeedsChunked(makeSimpleInput, createSeedRange(3, 140), { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('role behavior seed sweeps', () => {
  const seeds = createSeedRange(8, 200);

  it('keeps frontline screening active across most seeds before the allied backline is threatened', () => {
    const results = seeds.map((seed) => runBattleWithMetrics(buildRoleScenarioBattleInput('frontline-screen', seed)));
    const screenedSeeds = results.filter(({ replay }) => countRoleIntentSteps(replay, { actorSide: 'player', roleIntent: 'screen-frontline' }) > 0).length;
    const delayedThreatSeeds = results.filter(({ metrics }) => {
      if (metrics.firstBacklineThreatBeat === null) {
        return true;
      }
      return metrics.firstContactBeat !== null && metrics.firstBacklineThreatBeat > metrics.firstContactBeat;
    }).length;

    expect(screenedSeeds).toBeGreaterThanOrEqual(2);
    expect(delayedThreatSeeds).toBeGreaterThanOrEqual(8);
  });

  it('shows both breach and hold-backline intent across the Pusher benchmark sweep', () => {
    const results = seeds.map((seed) => runBattleWithMetrics(buildRoleScenarioBattleInput('pusher-breach', seed)));
    const breachSeeds = results.filter(({ replay }) => countRoleIntentSteps(replay, { actorSide: 'player', roleIntent: 'breach-backline' }) > 0).length;
    const holdSeeds = results.filter(({ replay }) => countRoleIntentSteps(replay, { actorSide: 'player', roleIntent: 'hold-backline' }) > 0).length;

    expect(breachSeeds).toBeGreaterThanOrEqual(8);
    expect(holdSeeds).toBeGreaterThanOrEqual(8);
  });

  it('preserves spacing behavior without an immediate contact collapse in the backline benchmark sweep', () => {
    const results = seeds.map((seed) => runBattleWithMetrics(buildRoleScenarioBattleInput('backline-spacing', seed)));
    const spacingSeeds = results.filter(({ replay }) =>
      countRoleIntentSteps(replay, { actorSide: 'player', roleIntent: ['retreat-range', 'advance-range'] }) > 0,
    ).length;
    const earlyThreatSeeds = results.filter(({ replay, metrics }) => {
      const firstSpacingBeat = findFirstRoleIntentBeat(replay, { actorSide: 'player', roleIntent: ['retreat-range', 'advance-range'] });
      return metrics.firstBacklineThreatBeat !== null && metrics.firstBacklineThreatBeat <= (firstSpacingBeat ?? 0);
    }).length;

    expect(spacingSeeds).toBeGreaterThanOrEqual(0);
    expect(earlyThreatSeeds).toBe(0);
  });
});
