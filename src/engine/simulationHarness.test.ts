import { describe, expect, it } from 'vitest';
import {
  buildSimulationBattleInput,
  buildEqualCostBundle,
  createCatalogTroopCombatant,
  createSeedRange,
  createUnitTypeCombatant,
  extractSimulationMetrics,
  runBattleWithMetrics,
  sweepBattleSeeds,
} from './simulationHarness';

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

  it('creates unit-type combatants from raw unit stats instead of composed faction stats', () => {
    const archer = createUnitTypeCombatant('archer', {
      side: 'player',
    });

    expect(archer.label).toBe('Archer');
    expect(archer.stats).toEqual({
      health: 30,
      damage: 11,
      speed: 11,
      range: 2,
      armor: 0,
      size: 1,
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
  it('aggregates deterministic seed sweeps into summary stats', () => {
    const seeds = createSeedRange(5, 100);
    const result = sweepBattleSeeds(
      (seed) =>
        buildSimulationBattleInput(
          seed,
          [createCatalogTroopCombatant('human/soldier', { side: 'player', quantity: 1 })],
          [createCatalogTroopCombatant('human/militia', { side: 'enemy', quantity: 1 })],
        ),
      seeds,
    );

    expect(result.entries).toHaveLength(5);
    expect(result.summary.battles).toBe(5);
    expect(result.summary.wins + result.summary.losses + result.summary.draws).toBe(5);
    expect(result.summary.percentiles.beatsToEnd.p10).toBeLessThanOrEqual(result.summary.percentiles.beatsToEnd.median);
    expect(result.summary.percentiles.beatsToEnd.median).toBeLessThanOrEqual(result.summary.percentiles.beatsToEnd.p90);
  });
});
