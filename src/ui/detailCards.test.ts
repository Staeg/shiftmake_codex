import { describe, expect, it } from 'vitest';
import { getAbility } from '../engine/unitCatalog';
import { buildResolvedUnitDetail } from './detailCards';

describe('buildResolvedUnitDetail', () => {
  it('limits recursive summoned-unit preview details', () => {
    const detail = buildResolvedUnitDetail({
      detailKey: 'test:elementalist',
      label: 'Test Elementalist',
      raceId: 'troll',
      unitClassId: 'elementalist',
      stats: { health: 1, damage: 1, speed: 1, move: 1, armor: 0, range: 1, capacity: 1, size: 1 },
      quantity: 1,
      description: 'Regression preview.',
      abilities: [getAbility('charge-4-summon-elemental-mitosis')],
      getRaceUnitPortrait: () => '',
    });

    const firstSummon = detail.kind === 'unit' ? detail.abilities[0]?.summoned[0]?.detail : null;
    expect(firstSummon?.kind).toBe('unit');
    const secondSummon = firstSummon?.kind === 'unit' ? firstSummon.abilities[0]?.summoned[0]?.detail : null;
    expect(secondSummon?.kind).toBe('unit');
    const repeatedSummon = secondSummon?.kind === 'unit' ? secondSummon.abilities[0]?.summoned[0]?.detail : null;
    expect(repeatedSummon?.kind === 'unit' ? repeatedSummon.abilities : []).toEqual([]);
  });
});
