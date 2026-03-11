import type { UnitArchetype, UnitTypeId } from './types';

export const BASIC_UNIT_TYPES: Record<UnitTypeId, UnitArchetype> = {
  swordsman: {
    id: 'swordsman',
    label: 'Human Swordsman',
    role: 'frontline',
    types: ['human', 'swordsman'],
    stats: {
      health: 100,
      damage: 15,
      speed: 8,
      range: 0,
      armor: 5,
      size: 2,
      capacity: 5,
    },
  },
  peasant: {
    id: 'peasant',
    label: 'Human Peasant',
    role: 'chaff',
    types: ['human', 'peasant', 'expendable'],
    stats: {
      health: 40,
      damage: 8,
      speed: 12,
      range: 0,
      armor: 1,
      size: 1,
      capacity: 1,
    },
  },
  archer: {
    id: 'archer',
    label: 'Human Archer',
    role: 'backline',
    types: ['human', 'archer'],
    stats: {
      health: 30,
      damage: 5,
      speed: 10,
      range: 2,
      armor: 0,
      size: 1,
      capacity: 0,
    },
  },
};
