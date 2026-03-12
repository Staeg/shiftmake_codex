import { fixed, fixedClamp, fixedMax, fixedMul, formatFixed } from './fixed';
import type {
  AbilityBaselineDefinition,
  AbilityId,
  AbilityModifier,
  BaselineAbilityId,
  FactionDefinition,
  FactionId,
  NamedAbilityDefinition,
  ResolvedAbility,
  StatAdjustment,
  TroopDefinition,
  TroopTypeId,
  UnitStats,
  UnitTypeDefinition,
  UnitTypeId,
} from './types';
import { fixedAdd, fixedSum } from './fixed';

const STAT_KEYS: Array<keyof UnitStats> = ['health', 'damage', 'speed', 'range', 'armor', 'size', 'capacity'];
const FACTION_SINGULAR_LABELS: Record<FactionId, string> = {
  human: 'Human',
  elf: 'Elf',
  goblin: 'Goblin',
  troll: 'Troll',
};

function applyAdjustment(value: number, adjustment?: StatAdjustment): number {
  const multiplier = adjustment?.multiplier ?? 1;
  const flat = adjustment?.flat ?? 0;
  return fixed(fixedMul(value, multiplier) + flat);
}

function clampStat(key: keyof UnitStats, value: number): number {
  if (key === 'damage') {
    return fixedMax(value, 0);
  }
  if (key === 'speed') {
    return fixedClamp(value, 1, 100);
  }
  if (key === 'range') {
    return fixedMax(value, 0);
  }
  if (key === 'size') {
    return fixedMax(value, 1);
  }
  if (key === 'capacity') {
    return fixedMax(value, 0);
  }
  if (key === 'health') {
    return fixedMax(value, 1);
  }
  return fixed(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function resolveAbilityText(ability: ResolvedAbility): string {
  const amount = formatFixed(ability.amount);

  if (ability.baselineId === 'heal') {
    if (ability.target.kind === 'self') {
      return `End of turn: heal self for ${amount}.`;
    }

    if (ability.trigger === 'onKill' && ability.target.kind === 'area') {
      return `On kill: heal all allies within ${formatFixed(ability.target.radius ?? 0)} hexes for ${amount}.`;
    }

    return `End of turn: heal the most damaged ally in range for ${amount}.`;
  }

  return `On attack: deal ${amount} damage to all enemies on the attacked hex.`;
}

export const ABILITY_BASELINES: Record<BaselineAbilityId, AbilityBaselineDefinition> = {
  heal: {
    id: 'heal',
    label: 'Heal',
    defaultTrigger: 'endOfTurn',
    defaultTarget: 'friendlyInRangeMostDamaged',
    descriptionTemplate: 'Restore health to a friendly target.',
  },
  blast: {
    id: 'blast',
    label: 'Blast',
    defaultTrigger: 'onAttack',
    defaultTarget: 'attackedEnemyHex',
    descriptionTemplate: 'Damage all enemies on the attacked hex.',
  },
};

export const NAMED_ABILITIES: Record<AbilityId, NamedAbilityDefinition> = {
  'blast-5': {
    id: 'blast-5',
    label: 'Blast 5',
    baselineId: 'blast',
    amount: 5,
    modifiers: [],
  },
  'regen-5': {
    id: 'regen-5',
    label: 'Regen 5',
    baselineId: 'heal',
    amount: 5,
    modifiers: [{ id: 'self' }],
  },
  'valor-20': {
    id: 'valor-20',
    label: 'Valor 20',
    baselineId: 'heal',
    amount: 20,
    modifiers: [{ id: 'onKill' }, { id: 'aoe', value: 0 }],
  },
};

export const UNIT_TYPES: Record<UnitTypeId, UnitTypeDefinition> = {
  soldier: {
    id: 'soldier',
    label: 'Soldier',
    role: 'frontline',
    types: ['soldier', 'melee'],
    stats: {
      health: 100,
      damage: 10,
      speed: 10,
      range: 0,
      armor: 2,
      size: 1,
      capacity: 2,
    },
    quantity: 5,
    cost: 100,
    abilityIds: [],
  },
  champion: {
    id: 'champion',
    label: 'Champion',
    role: 'frontline',
    types: ['champion', 'melee'],
    stats: {
      health: 150,
      damage: 20,
      speed: 17,
      range: 0,
      armor: 0,
      size: 2,
      capacity: 1,
    },
    quantity: 1,
    cost: 250,
    abilityIds: ['valor-20'],
  },
  militia: {
    id: 'militia',
    label: 'Militia',
    role: 'chaff',
    types: ['militia', 'melee', 'expendable'],
    stats: {
      health: 40,
      damage: 8,
      speed: 12,
      range: 0,
      armor: 0,
      size: 1,
      capacity: 1,
    },
    quantity: 10,
    cost: 25,
    abilityIds: [],
  },
  archer: {
    id: 'archer',
    label: 'Archer',
    role: 'backline',
    types: ['archer', 'ranged'],
    stats: {
      health: 30,
      damage: 10,
      speed: 10,
      range: 2,
      armor: 0,
      size: 1,
      capacity: 0,
    },
    quantity: 5,
    cost: 75,
    abilityIds: [],
  },
  wizard: {
    id: 'wizard',
    label: 'Wizard',
    role: 'backline',
    types: ['wizard', 'caster'],
    stats: {
      health: 20,
      damage: 5,
      speed: 8,
      range: 2,
      armor: 0,
      size: 1,
      capacity: 0,
    },
    quantity: 3,
    cost: 75,
    abilityIds: ['blast-5'],
  },
};

export const FACTIONS: Record<FactionId, FactionDefinition> = {
  human: {
    id: 'human',
    label: 'Humans',
    description: 'Slightly better at pretty much everything. Boring but solid.',
    addedTypes: ['human'],
    defaultUnitTypeIds: ['soldier', 'champion', 'militia', 'archer'],
    statAdjustments: {
      health: { multiplier: 1.1 },
      damage: { multiplier: 1.1 },
      speed: { multiplier: 1.1 },
      armor: { flat: 1 },
      capacity: { flat: 1 },
      cost: { multiplier: 0.9 },
    },
    abilityIds: [],
  },
  elf: {
    id: 'elf',
    label: 'Elves',
    description: 'Feared from afar. Less so up close.',
    addedTypes: ['elf'],
    defaultUnitTypeIds: ['soldier', 'archer', 'wizard'],
    statAdjustments: {
      health: { multiplier: 0.9 },
      damage: { multiplier: 1.2 },
      speed: { multiplier: 1.2 },
      range: { flat: 1 },
      cost: { multiplier: 1.1 },
    },
    abilityIds: [],
  },
  goblin: {
    id: 'goblin',
    label: 'Goblins',
    description: "The one good thing you can say about goblins is that there's more than one of them.",
    addedTypes: ['goblin', 'expendable'],
    defaultUnitTypeIds: ['soldier', 'militia', 'wizard'],
    statAdjustments: {
      health: { multiplier: 0.7 },
      damage: { multiplier: 0.8 },
      range: { flat: -1 },
      armor: { flat: -2 },
      size: { flat: -1 },
      capacity: { flat: -2 },
      cost: { multiplier: 0.4 },
    },
    abilityIds: [],
  },
  troll: {
    id: 'troll',
    label: 'Trolls',
    description: 'Never down for the count, never down for counting.',
    addedTypes: ['troll'],
    defaultUnitTypeIds: ['soldier', 'champion'],
    statAdjustments: {
      health: { multiplier: 1.3 },
      damage: { multiplier: 1.2 },
      speed: { multiplier: 0.8 },
      size: { flat: 1 },
      capacity: { flat: 1 },
      cost: { multiplier: 1.3 },
    },
    abilityIds: ['regen-5'],
  },
};

export function resolveAbilityDefinition(abilityId: AbilityId): ResolvedAbility {
  const definition = NAMED_ABILITIES[abilityId];
  if (!definition) {
    throw new Error(`Unknown ability: ${abilityId}`);
  }

  const baseline = ABILITY_BASELINES[definition.baselineId];
  let trigger = baseline.defaultTrigger;
  let target: ResolvedAbility['target'] = { kind: baseline.defaultTarget };

  definition.modifiers.forEach((modifier: AbilityModifier) => {
    if (modifier.id === 'onKill') {
      trigger = 'onKill';
    }

    if (modifier.id === 'self') {
      target = { kind: 'self' };
    }

    if (modifier.id === 'aoe') {
      target = {
        kind: 'area',
        radius: modifier.value ?? 0,
      };
    }
  });

  const resolved: ResolvedAbility = {
    id: definition.id,
    label: definition.label,
    baselineId: definition.baselineId,
    amount: fixed(definition.amount),
    trigger,
    target,
    modifiers: definition.modifiers.map((modifier) => ({ ...modifier })),
    shortText: '',
  };

  resolved.shortText = resolveAbilityText(resolved);
  return resolved;
}

export function composeTroopId(factionId: FactionId, unitTypeId: UnitTypeId): TroopTypeId {
  return `${factionId}/${unitTypeId}`;
}

export function composeTroopDefinition(factionId: FactionId, unitTypeId: UnitTypeId): TroopDefinition {
  const faction = FACTIONS[factionId];
  const unitType = UNIT_TYPES[unitTypeId];

  if (!faction) {
    throw new Error(`Unknown faction: ${factionId}`);
  }

  if (!unitType) {
    throw new Error(`Unknown unit type: ${unitTypeId}`);
  }

  const stats = STAT_KEYS.reduce<UnitStats>((result, key) => {
    const nextValue = applyAdjustment(unitType.stats[key], faction.statAdjustments[key]);
    result[key] = clampStat(key, nextValue);
    return result;
  }, {
    health: 0,
    damage: 0,
    speed: 0,
    range: 0,
    armor: 0,
    size: 0,
    capacity: 0,
  });

  const cost = fixedMax(applyAdjustment(unitType.cost, faction.statAdjustments.cost), 0);
  const abilityIds = unique([...unitType.abilityIds, ...faction.abilityIds]);

  return {
    id: composeTroopId(factionId, unitTypeId),
    factionId,
    unitTypeId,
    label: `${FACTION_SINGULAR_LABELS[factionId]} ${unitType.label}`,
    role: unitType.role,
    types: unique([...unitType.types, ...faction.addedTypes]),
    stats,
    quantity: unitType.quantity,
    cost,
    abilityIds,
    abilities: abilityIds.map(resolveAbilityDefinition),
  };
}

export const TROOP_CATALOG: Record<TroopTypeId, TroopDefinition> = Object.values(FACTIONS).reduce<Record<TroopTypeId, TroopDefinition>>(
  (catalog, faction) => {
    faction.defaultUnitTypeIds.forEach((unitTypeId) => {
      const resolvedTroop = composeTroopDefinition(faction.id, unitTypeId);
      catalog[resolvedTroop.id] = resolvedTroop;
    });
    return catalog;
  },
  {},
);

export const TROOP_TYPE_IDS = Object.keys(TROOP_CATALOG) as TroopTypeId[];

export function getTroopDefinitionOrThrow(troopId: TroopTypeId): TroopDefinition {
  const troop = TROOP_CATALOG[troopId];
  if (!troop) {
    throw new Error(`Unknown troop: ${troopId}`);
  }
  return troop;
}

export function getTroopStartingQuantity(troopId: TroopTypeId): number {
  return getTroopDefinitionOrThrow(troopId).quantity;
}

export function getTroopSelectionCost(troopId: TroopTypeId, quantity: number): number {
  const troop = getTroopDefinitionOrThrow(troopId);
  const unitCount = Math.max(0, Math.floor(quantity));

  if (unitCount === 0) {
    return 0;
  }

  const startingQuantity = troop.quantity;
  const perStartingUnitCost = fixed(troop.cost / startingQuantity);

  if (unitCount <= startingQuantity) {
    return fixedMul(perStartingUnitCost, unitCount);
  }

  const extraUnitCosts: number[] = [];
  for (let currentQuantity = startingQuantity; currentQuantity < unitCount; currentQuantity += 1) {
    extraUnitCosts.push(fixedMul(perStartingUnitCost, currentQuantity - startingQuantity + 1));
  }

  return fixedAdd(troop.cost, fixedSum(extraUnitCosts));
}

export function getArmySelectionCost(selection: Partial<Record<TroopTypeId, number>>): number {
  return fixedSum(
    Object.entries(selection).map(([troopId, quantity]) => {
      if (!(troopId in TROOP_CATALOG)) {
        return 0;
      }

      return getTroopSelectionCost(troopId as TroopTypeId, quantity ?? 0);
    }),
  );
}
