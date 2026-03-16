import { describe, expect, it } from 'vitest';
import {
  applyPermutationOutcome,
  createEmptyPermutationAggregate,
  finalizePermutationAggregate,
  generatePermutationMatchups,
  generatePermutationTeams,
  getEligiblePermutationUnitTypeIds,
  renderPermutationReport,
  resolvePermutationQuantity,
  runPermutationBatch,
} from './permutationReport';

describe('permutationReport', () => {
  it('discovers eligible troops by excluding summoned attributes only', () => {
    const troopIds = getEligiblePermutationUnitTypeIds();

    expect(troopIds).not.toContain('wolf');
    expect(troopIds).not.toContain('elemental');
    expect(troopIds).not.toContain('skeleton');
    expect(troopIds).toContain('beastmaster');
    expect(troopIds).toContain('elementalist');
    expect(troopIds).toContain('necromancer');
  });

  it('resolves test quantities from rounded 120 per cost', () => {
    expect(resolvePermutationQuantity('soldier')).toBe(5);
    expect(resolvePermutationQuantity('champion')).toBe(2);
    expect(resolvePermutationQuantity('militia')).toBe(12);
    expect(resolvePermutationQuantity('druid')).toBe(4);
  });

  it('generates the expected current-roster team and matchup counts', () => {
    const troopIds = getEligiblePermutationUnitTypeIds();
    const teams2 = generatePermutationTeams(2, troopIds);
    const teams3 = generatePermutationTeams(3, troopIds);

    expect(troopIds).toHaveLength(14);
    expect(teams2).toHaveLength(91);
    expect(teams3).toHaveLength(364);
    expect(generatePermutationMatchups(teams2)).toHaveLength(4095);
    expect(generatePermutationMatchups(teams3)).toHaveLength(66066);
  });

  it('aggregates overall, against, and alongside records correctly', () => {
    const aggregate = createEmptyPermutationAggregate(['soldier', 'archer', 'champion', 'militia']);

    applyPermutationOutcome(aggregate, ['soldier', 'archer'], ['champion', 'militia'], 'victory');
    applyPermutationOutcome(aggregate, ['soldier', 'archer'], ['champion', 'militia'], 'draw');

    expect(aggregate.overall.soldier).toEqual({ wins: 1, losses: 0, draws: 1, samples: 2 });
    expect(aggregate.overall.champion).toEqual({ wins: 0, losses: 1, draws: 1, samples: 2 });
    expect(aggregate.against.soldier?.champion).toEqual({ wins: 1, losses: 0, draws: 1, samples: 2 });
    expect(aggregate.against.champion?.soldier).toEqual({ wins: 0, losses: 1, draws: 1, samples: 2 });
    expect(aggregate.alongside.soldier?.archer).toEqual({ wins: 1, losses: 0, draws: 1, samples: 2 });
    expect(aggregate.alongside.champion?.militia).toEqual({ wins: 0, losses: 1, draws: 1, samples: 2 });
  });

  it('sorts alongside tables by best teammate win rate in the rendered report data', () => {
    const aggregate = createEmptyPermutationAggregate(['archer', 'champion', 'militia', 'soldier']);
    aggregate.alongside.soldier!.archer = { wins: 5, losses: 0, draws: 0, samples: 5 };
    aggregate.alongside.soldier!.champion = { wins: 1, losses: 4, draws: 0, samples: 5 };
    aggregate.alongside.soldier!.militia = { wins: 3, losses: 2, draws: 0, samples: 5 };

    const finalized = finalizePermutationAggregate(aggregate, 2, 6, 15, 1, 10, '2026-03-16T00:00:00.000Z');
    const soldierSection = finalized.alongside.find((section) => section.troopId === 'soldier');

    expect(soldierSection?.entries.map((entry) => entry.troopId)).toEqual(['archer', 'militia', 'champion']);
  });

  it('runs deterministic matchup batches and renders the three requested sections', () => {
    const teams = generatePermutationTeams(2, ['archer', 'champion', 'militia', 'soldier']);
    const matchups = generatePermutationMatchups(teams).slice(0, 2);

    const first = runPermutationBatch(2, matchups, 1, ['archer', 'champion', 'militia', 'soldier']);
    const second = runPermutationBatch(2, matchups, 1, ['archer', 'champion', 'militia', 'soldier']);

    expect(first.results).toEqual(second.results);

    const finalized = finalizePermutationAggregate(first.aggregate, 2, teams.length, 15, 1, 25, '2026-03-16T00:00:00.000Z');
    const markdown = renderPermutationReport(finalized);

    expect(markdown).toContain('## Overall troop winrates');
    expect(markdown).toContain('## Against every troop type');
    expect(markdown).toContain('## Alongside every troop type');
  });
});
