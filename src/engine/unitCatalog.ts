import { fixed, fixedClamp, fixedMax, fixedMul } from './fixed';
import type {
  AbilityDefinition,
  AbilityId,
  FactionDefinition,
  FactionId,
  FactionUpgradeDefinition,
  MutatorDefinition,
  TroopDefinition,
  TroopStatKey,
  UnitStats,
  UnitTypeDefinition,
  UnitTypeId,
} from './types';
import { fixedAdd, fixedSum } from './fixed';

const STAT_KEYS: Array<keyof UnitStats> = ['health', 'damage', 'speed', 'range', 'armor', 'size', 'capacity'];

function makeAbility(definition: AbilityDefinition): AbilityDefinition {
  return definition;
}

export const ABILITIES: Record<AbilityId, AbilityDefinition> = {
  'blast-5': makeAbility({
    id: 'blast-5',
    label: 'Blast 5',
    trigger: 'onAttack',
    effect: 'blast',
    amount: 5,
    shortText: 'On attack: all enemies on the attacked hex take 5 damage.',
  }),
  'regen-5': makeAbility({
    id: 'regen-5',
    label: 'Regen 5',
    trigger: 'endOfTurn',
    effect: 'heal',
    amount: 5,
    shortText: 'End of turn: heal self for 5.',
  }),
  'valor-20': makeAbility({
    id: 'valor-20',
    label: 'Valor 20',
    trigger: 'onKill',
    effect: 'heal',
    amount: 20,
    radius: 0,
    shortText: 'On kill: heal allies on this hex for 20.',
  }),
  united: makeAbility({
    id: 'united',
    label: 'United',
    trigger: 'passive',
    effect: 'boost',
    amount: 0,
    overworldEffectId: 'united',
    shortText: 'Overworld: troops of this faction may enter the same Rift together.',
  }),
  'combined-arms-boost-20': makeAbility({
    id: 'combined-arms-boost-20',
    label: 'Combined Arms: Boost 20',
    trigger: 'startOfBattle',
    effect: 'boost',
    amount: 20,
    repeatPerDistinctFriendlyTroopType: true,
    shortText: 'Start of battle: gain 20% health, damage, and speed for each other friendly troop type.',
  }),
  'forsaken-boost-80': makeAbility({
    id: 'forsaken-boost-80',
    label: 'Forsaken: Boost 80',
    trigger: 'startOfBattle',
    effect: 'boost',
    amount: 80,
    condition: 'forsaken',
    shortText: 'Start of battle: if no other friendly troop types are present, gain 80% health, damage, and speed.',
  }),
  'goblin-farewell': makeAbility({
    id: 'goblin-farewell',
    label: 'Goblin Farewell',
    trigger: 'onDeath',
    effect: 'strike',
    amount: 1,
    radius: 0,
    shortText: 'On death: strike a random enemy on this hex one extra time.',
  }),
  'pack-1': makeAbility({
    id: 'pack-1',
    label: 'Pack 1',
    trigger: 'passive',
    effect: 'pack',
    amount: 1,
    shortText: 'Passive: gain +1 damage per allied unit on this hex.',
  }),
  'ramp-1': makeAbility({
    id: 'ramp-1',
    label: 'Ramp 1',
    trigger: 'endOfTurn',
    effect: 'ramp',
    amount: 1,
    shortText: 'End of turn: gain +1 damage for the battle.',
  }),
  'frenzy-ramp-1': makeAbility({
    id: 'frenzy-ramp-1',
    label: 'Frenzy: Ramp 1',
    trigger: 'onDamaged',
    effect: 'ramp',
    amount: 1,
    shortText: 'After taking damage: gain +1 damage for the battle.',
  }),
};

export const UNIT_TYPES: Record<UnitTypeId, UnitTypeDefinition> = {
  soldier: {
    id: 'soldier',
    label: 'Soldier',
    role: 'frontline',
    types: ['soldier', 'melee'],
    stats: { health: 100, damage: 10, speed: 10, range: 0, armor: 2, size: 1, capacity: 2 },
    quantity: 5,
    cost: 100,
    abilityIds: [],
  },
  champion: {
    id: 'champion',
    label: 'Champion',
    role: 'frontline',
    types: ['champion', 'melee'],
    stats: { health: 150, damage: 20, speed: 17, range: 0, armor: 0, size: 2, capacity: 1 },
    quantity: 1,
    cost: 60,
    abilityIds: ['valor-20'],
  },
  militia: {
    id: 'militia',
    label: 'Militia',
    role: 'chaff',
    types: ['militia', 'melee', 'expendable'],
    stats: { health: 40, damage: 8, speed: 12, range: 0, armor: 0, size: 1, capacity: 1 },
    quantity: 10,
    cost: 60,
    abilityIds: [],
  },
  archer: {
    id: 'archer',
    label: 'Archer',
    role: 'backline',
    types: ['archer', 'ranged'],
    stats: { health: 30, damage: 10, speed: 10, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 5,
    cost: 100,
    abilityIds: [],
  },
  wizard: {
    id: 'wizard',
    label: 'Wizard',
    role: 'backline',
    types: ['wizard', 'caster'],
    stats: { health: 20, damage: 10, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 3,
    cost: 60,
    abilityIds: ['blast-5'],
  },
};

export const FACTIONS: Record<FactionId, FactionDefinition> = {
  human: {
    id: 'human',
    label: 'Humans',
    singularLabel: 'Human',
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
    singularLabel: 'Elven',
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
    singularLabel: 'Goblin',
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
    singularLabel: 'Troll',
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

export const FACTION_UPGRADES: Record<string, FactionUpgradeDefinition> = {
  'human-united': {
    id: 'human-united',
    factionId: 'human',
    label: 'Humans United',
    tier: 1,
    cost: 20,
    source: 'default',
    description: 'All human troops become United.',
    effects: [{ kind: 'addAbility', abilityId: 'united' }],
  },
  'human-combined-arms': {
    id: 'human-combined-arms',
    factionId: 'human',
    label: 'Human Combined Arms',
    tier: 2,
    cost: 80,
    source: 'rift',
    description: 'All human troops gain Combined Arms: Boost 20.',
    effects: [{ kind: 'addAbility', abilityId: 'combined-arms-boost-20' }],
  },
  'elven-eyes': {
    id: 'elven-eyes',
    factionId: 'elf',
    label: 'Elven Eyes',
    tier: 1,
    cost: 60,
    source: 'default',
    description: 'All non-melee elven troops gain +1 range.',
    effects: [{ kind: 'modifyStats', unitFilter: 'nonMelee', statModifiers: { range: { flat: 1 } } }],
  },
  'elven-forsaken': {
    id: 'elven-forsaken',
    factionId: 'elf',
    label: 'Elven Forsaken',
    tier: 3,
    cost: 60,
    source: 'rift',
    description: 'All elven troops gain Forsaken: Boost 80.',
    effects: [{ kind: 'addAbility', abilityId: 'forsaken-boost-80' }],
  },
  'goblin-farewell-upgrade': {
    id: 'goblin-farewell-upgrade',
    factionId: 'goblin',
    label: 'Goblin Farewell',
    tier: 1,
    cost: 20,
    source: 'default',
    description: 'All goblin units gain Goblin Farewell.',
    effects: [{ kind: 'addAbility', abilityId: 'goblin-farewell' }],
  },
  'goblin-pack': {
    id: 'goblin-pack',
    factionId: 'goblin',
    label: 'Goblin Pack',
    tier: 2,
    cost: 60,
    source: 'rift',
    description: 'All goblin units gain Pack 1.',
    effects: [{ kind: 'addAbility', abilityId: 'pack-1' }],
  },
  'troll-momentum': {
    id: 'troll-momentum',
    factionId: 'troll',
    label: 'Troll Momentum',
    tier: 1,
    cost: 100,
    source: 'default',
    description: 'All troll units gain Ramp 1.',
    effects: [{ kind: 'addAbility', abilityId: 'ramp-1' }],
  },
  'troll-frenzy': {
    id: 'troll-frenzy',
    factionId: 'troll',
    label: 'Troll Frenzy',
    tier: 3,
    cost: 20,
    source: 'rift',
    description: 'All troll units gain Frenzy: Ramp 1.',
    effects: [{ kind: 'addAbility', abilityId: 'frenzy-ramp-1' }],
  },
};

export const MUTATORS: Record<string, MutatorDefinition> = {
  momentum: {
    id: 'momentum',
    label: 'Momentum',
    description: 'All units gain +10 initiative every beat.',
    enemyBudgetMultiplier: 1,
    rewardMultiplier: 1,
    initiativeBonusPerBeat: 10,
  },
  'heavy-air': {
    id: 'heavy-air',
    label: 'Heavy Air',
    description: 'Ranged attack damage is reduced by 50%.',
    enemyBudgetMultiplier: 1,
    rewardMultiplier: 1,
    rangedDamageMultiplier: 0.5,
  },
  rich: {
    id: 'rich',
    label: 'Rich',
    description: 'Enemy budget increased by 50%. Rewards doubled.',
    enemyBudgetMultiplier: 1.5,
    rewardMultiplier: 2,
  },
  outpost: {
    id: 'outpost',
    label: 'Outpost',
    description: 'Enemy budget decreased by 20%.',
    enemyBudgetMultiplier: 0.8,
    rewardMultiplier: 1,
  },
  quagmire: {
    id: 'quagmire',
    label: 'Quagmire',
    description: 'Enemy budget decreased by 50%. Recovery time is doubled.',
    enemyBudgetMultiplier: 0.5,
    rewardMultiplier: 1,
    recoveryMultiplier: 2,
  },
};

export const STARTING_FACTION_COUNT = 3;

export function getAbility(id: AbilityId): AbilityDefinition {
  const ability = ABILITIES[id];
  if (!ability) {
    throw new Error(`Unknown ability ${id}`);
  }
  return ability;
}

export function getFaction(id: FactionId): FactionDefinition {
  const faction = FACTIONS[id];
  if (!faction) {
    throw new Error(`Unknown faction ${id}`);
  }
  return faction;
}

export function getUnitType(id: UnitTypeId): UnitTypeDefinition {
  const unitType = UNIT_TYPES[id];
  if (!unitType) {
    throw new Error(`Unknown unit type ${id}`);
  }
  return unitType;
}

export function getFactionUpgrade(id: string): FactionUpgradeDefinition {
  const upgrade = FACTION_UPGRADES[id];
  if (!upgrade) {
    throw new Error(`Unknown faction upgrade ${id}`);
  }
  return upgrade;
}

export function getMutator(id: string): MutatorDefinition {
  const mutator = MUTATORS[id];
  if (!mutator) {
    throw new Error(`Unknown mutator ${id}`);
  }
  return mutator;
}

function applyAdjustment(value: number, adjustment?: { flat?: number; multiplier?: number }): number {
  const multiplier = adjustment?.multiplier ?? 1;
  const flat = adjustment?.flat ?? 0;
  return fixed(value * multiplier + flat);
}

export function clampStat(key: keyof UnitStats, value: number): number {
  if (key === 'damage') return fixedMax(value, 0);
  if (key === 'speed') return fixedClamp(value, 1, 100);
  if (key === 'range') return fixedMax(value, 0);
  if (key === 'size') return fixedMax(value, 1);
  if (key === 'capacity') return fixedMax(value, 0);
  if (key === 'health') return fixedMax(value, 1);
  return fixed(value);
}

export function composeBaseTroopDefinition(factionId: FactionId, unitTypeId: UnitTypeId): TroopDefinition {
  const faction = getFaction(factionId);
  const unitType = getUnitType(unitTypeId);
  const stats = STAT_KEYS.reduce<UnitStats>(
    (result, key) => {
      result[key] = clampStat(key, applyAdjustment(unitType.stats[key], faction.statAdjustments[key]));
      return result;
    },
    { health: 0, damage: 0, speed: 0, range: 0, armor: 0, size: 0, capacity: 0 },
  );
  const abilities = [...unitType.abilityIds, ...faction.abilityIds].map(getAbility);
  return {
    id: `${factionId}/${unitTypeId}`,
    factionId,
    unitTypeId,
    label: `${faction.singularLabel} ${unitType.label}`,
    role: unitType.role,
    types: [...new Set([...unitType.types, ...faction.addedTypes])],
    stats,
    quantity: unitType.quantity,
    cost: fixedMax(applyAdjustment(unitType.cost, faction.statAdjustments.cost), 1),
    abilities,
  };
}

export const TROOP_CATALOG = Object.values(FACTIONS).reduce<Record<string, TroopDefinition>>((acc, faction) => {
  Object.keys(UNIT_TYPES).forEach((unitTypeId) => {
    acc[`${faction.id}/${unitTypeId}`] = composeBaseTroopDefinition(faction.id, unitTypeId);
  });
  return acc;
}, {});

export const TROOP_TYPE_IDS = Object.keys(TROOP_CATALOG);

export function getTroopDefinitionOrThrow(id: string): TroopDefinition {
  const troop = TROOP_CATALOG[id];
  if (!troop) {
    throw new Error(`Unknown troop ${id}`);
  }
  return troop;
}

export function composeTroopDefinition(factionId: FactionId, unitTypeId: UnitTypeId): TroopDefinition {
  return composeBaseTroopDefinition(factionId, unitTypeId);
}

export function resolveAbilityDefinition(id: AbilityId): AbilityDefinition {
  return getAbility(id);
}

export function getTroopStartingQuantity(troopId: string): number {
  return getTroopDefinitionOrThrow(troopId).quantity;
}

export function getTroopSelectionCost(troopId: string, quantity: number): number {
  const troop = getTroopDefinitionOrThrow(troopId);
  const unitCount = Math.max(0, Math.floor(quantity));
  if (unitCount === 0) {
    return 0;
  }
  const perStartingUnitCost = fixed(troop.cost / troop.quantity);
  if (unitCount <= troop.quantity) {
    return fixedMul(perStartingUnitCost, unitCount);
  }

  const extraUnitCosts: number[] = [];
  for (let currentQuantity = troop.quantity; currentQuantity < unitCount; currentQuantity += 1) {
    extraUnitCosts.push(fixedMul(perStartingUnitCost, currentQuantity - troop.quantity + 1));
  }
  return fixedAdd(troop.cost, fixedSum(extraUnitCosts));
}

export function getArmySelectionCost(selection: Partial<Record<string, number>>): number {
  return fixedSum(
    Object.entries(selection).map(([troopId, quantity]) => {
      if (!(troopId in TROOP_CATALOG)) {
        return 0;
      }
      return getTroopSelectionCost(troopId, quantity ?? 0);
    }),
  );
}

export function getBaseTroopCost(factionId: FactionId, unitTypeId: UnitTypeId): number {
  return composeBaseTroopDefinition(factionId, unitTypeId).cost;
}

export function getUpgradeableStatsForUnitType(unitTypeId: UnitTypeId): TroopStatKey[] {
  const stats: TroopStatKey[] = ['health', 'damage'];
  if (unitTypeId === 'champion' || unitTypeId === 'wizard') {
    stats.push('speed');
  }
  if (unitTypeId === 'archer') {
    stats.push('range');
  }
  if (unitTypeId === 'soldier') {
    stats.push('armor');
  }
  return stats;
}

export function applyStatModifier(
  stats: UnitStats,
  modifiers: Partial<Record<TroopStatKey, { flat?: number; multiplier?: number }>>,
): UnitStats {
  const next = { ...stats };
  (Object.keys(modifiers) as TroopStatKey[]).forEach((key) => {
    next[key] = clampStat(key, applyAdjustment(next[key], modifiers[key]));
  });
  return next;
}

export function applyPercentageUpgrade(value: number, levels: number): number {
  let current = value;
  for (let i = 0; i < levels; i += 1) {
    current = fixedMul(current, 1.1);
  }
  return fixed(current);
}
