import { fixed, fixedClamp, fixedMax, fixedMul, fixedSum } from './fixed';
import type {
  AbilityDefinition,
  AbilityDurationDefinition,
  AbilityEffectDefinition,
  AbilityId,
  AbilityTargetFilters,
  AbilityTiming,
  AbilityTriggerDefinition,
  FactionDefinition,
  FactionId,
  FactionUpgradeDefinition,
  MutatorDefinition,
  RoleId,
  TroopTypeUpgradeDefinition,
  TroopDefinition,
  TroopStatKey,
  UnitStats,
  UnitTypeDefinition,
  UnitTypeId,
} from './types';

const STAT_KEYS: Array<keyof UnitStats> = ['health', 'damage', 'speed', 'range', 'armor', 'size', 'capacity'];
const TROOP_UNIT_BUDGET = 120;

function makeAbility(definition: AbilityDefinition): AbilityDefinition {
  return definition;
}

function instantDuration(): AbilityDurationDefinition {
  return { kind: 'instant' };
}

function battleDuration(): AbilityDurationDefinition {
  return { kind: 'battle' };
}

function turnsDuration(turns: number): AbilityDurationDefinition {
  return { kind: 'turns', turns };
}

function selfTarget() {
  return { mode: 'self' as const };
}

function randomTarget(allegiance: 'ally' | 'enemy' | 'all', radius: number | 'selfRange', filters?: AbilityTargetFilters) {
  return radius === 'selfRange'
    ? { mode: 'random' as const, allegiance, radiusSource: 'selfRange' as const, filters }
    : { mode: 'random' as const, allegiance, radius, filters };
}

function aoeTarget(allegiance: 'ally' | 'enemy' | 'all', radius: number | 'selfRange', filters?: AbilityTargetFilters) {
  return radius === 'selfRange'
    ? { mode: 'aoe' as const, allegiance, radiusSource: 'selfRange' as const, filters }
    : { mode: 'aoe' as const, allegiance, radius, filters };
}

function statEffect(kind: 'bolster' | 'haste' | 'heal' | 'ramp', amount: number, mode: 'flat' | 'percent'): AbilityEffectDefinition {
  return { kind, amount, mode, disposition: kind === 'heal' || amount > 0 ? 'beneficial' : amount < 0 ? 'harmful' : 'neutral' };
}

function statDeltaEffect(stat: TroopStatKey, amount: number, mode: 'flat' | 'percent'): AbilityEffectDefinition {
  return { kind: 'statDelta', stat, amount, mode, disposition: amount > 0 ? 'beneficial' : amount < 0 ? 'harmful' : 'neutral' };
}

function roleset(role: RoleId): AbilityEffectDefinition {
  return { kind: 'roleset', role };
}

function redirectEffect(): AbilityEffectDefinition {
  return { kind: 'redirect' };
}

function summonEffect(unitTypeId: UnitTypeId, count: number, consumeFallenUnitCorpse = false, grantedAbilityIds: AbilityId[] = []): AbilityEffectDefinition {
  return { kind: 'summon', unitTypeId, count, consumeFallenUnitCorpse, grantedAbilityIds, disposition: 'neutral' };
}

function initiativeSetEffect(value: number): AbilityEffectDefinition {
  return { kind: 'initiativeSet', value, disposition: 'harmful' };
}

function grantAbilityEffect(abilityId: AbilityId, disposition: 'beneficial' | 'harmful' | 'neutral' = 'neutral'): AbilityEffectDefinition {
  return { kind: 'grantAbility', abilityId, disposition };
}

// Factory for abilities that apply one or more effects to self on a given timing.
// Pass triggerOpts to layer on charge, maxUses, forsaken, combined-arms, etc.
function makeSelfStatAbility(
  id: AbilityId,
  label: string,
  timing: AbilityTiming,
  effects: AbilityEffectDefinition[],
  shortText: string,
  duration: AbilityDurationDefinition = battleDuration(),
  triggerOpts?: Partial<Omit<AbilityTriggerDefinition, 'timing'>>,
): AbilityDefinition {
  return makeAbility({ id, label, trigger: { timing, ...triggerOpts }, duration, target: selfTarget(), effects, shortText });
}

// Factory for the common triple-stat percent pattern (bolster + haste + ramp, all percent, startOfBattle).
function makeTripleStatAbility(
  id: AbilityId,
  label: string,
  amount: number,
  shortText: string,
  triggerOpts?: Partial<Omit<AbilityTriggerDefinition, 'timing'>>,
): AbilityDefinition {
  return makeSelfStatAbility(
    id,
    label,
    'startOfBattle',
    [statEffect('bolster', amount, 'percent'), statEffect('haste', amount, 'percent'), statEffect('ramp', amount, 'percent')],
    shortText,
    battleDuration(),
    triggerOpts,
  );
}

export const ABILITIES: Record<AbilityId, AbilityDefinition> = {
  'blast-5': makeAbility({
    id: 'blast-5',
    label: 'Blast 5',
    trigger: { timing: 'onAttack' },
    duration: instantDuration(),
    effects: [{ kind: 'blast', amount: 5 }],
    shortText: 'On attack: all enemies on the attacked hex take 5 damage.',
  }),
  'regen-5': makeSelfStatAbility('regen-5', 'Regen 5', 'endOfTurn', [statEffect('heal', 5, 'flat')], 'End of turn: heal self for 5.', instantDuration()),
  'regen-60': makeSelfStatAbility('regen-60', 'Regen 60', 'endOfTurn', [statEffect('heal', 60, 'flat')], 'End of turn: heal self for 60.', instantDuration()),
  'valor-20': makeAbility({
    id: 'valor-20',
    label: 'Valor 20',
    trigger: { timing: 'onKill' },
    duration: instantDuration(),
    target: aoeTarget('ally', 0),
    effects: [statEffect('heal', 20, 'flat')],
    shortText: 'On kill: heal allies on this hex for 20.',
  }),
  united: makeAbility({
    id: 'united',
    label: 'United',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    overworldEffectId: 'united',
    shortText: 'Overworld: troops of this faction may enter the same Rift together.',
  }),
  'combined-arms-20': makeTripleStatAbility(
    'combined-arms-20',
    'Power of Friendship',
    20,
    'Start of battle: gain +20% health, +20% damage, and +20% speed for each other friendly troop type in this battle.',
    { repeatPerDistinctFriendlyTroopType: true },
  ),
  'forsaken-80': makeTripleStatAbility(
    'forsaken-80',
    'Forsaken 80',
    80,
    'Start of battle: if no other friendly troop types are present, gain 80% health, damage, and speed.',
    { condition: 'forsaken' },
  ),
  'goblin-farewell': makeAbility({
    id: 'goblin-farewell',
    label: 'Goblin Farewell',
    trigger: { timing: 'onDeath' },
    duration: instantDuration(),
    target: randomTarget('enemy', 0),
    effects: [{ kind: 'strike', amount: 1 }],
    shortText: 'On death: strike a random enemy on this hex one extra time.',
  }),
  'pack-1': makeSelfStatAbility(
    'pack-1',
    'Pack 1',
    'startOfTurn',
    [statEffect('ramp', 1, 'flat')],
    'Start of turn: gain +1 damage per other friendly unit on this hex until end of turn.',
    turnsDuration(1),
    { repeatPerOtherFriendlyUnitOnHex: true },
  ),
  'mend-4': makeAbility({
    id: 'mend-4',
    label: 'Mend 4',
    trigger: { timing: 'endOfTurn' },
    duration: instantDuration(),
    target: aoeTarget('ally', 'selfRange'),
    effects: [statEffect('heal', 4, 'flat')],
    shortText: "End of turn: heal allies within this unit's range for 4.",
  }),
  'haste-1': makeAbility({
    id: 'haste-1',
    label: 'Haste 1',
    trigger: { timing: 'endOfTurn' },
    duration: battleDuration(),
    target: randomTarget('ally', 'selfRange'),
    effects: [statEffect('haste', 1, 'flat')],
    shortText: "End of turn: a random allied unit within this unit's range gains +1 speed for the battle.",
  }),
  'ramp-1': makeSelfStatAbility('ramp-1', 'Ramp 1', 'endOfTurn', [statEffect('ramp', 1, 'flat')], 'End of turn: gain +1 damage for the battle.'),
  'frenzy-ramp-1': makeSelfStatAbility('frenzy-ramp-1', 'Frenzy: Ramp 1', 'onDamaged', [statEffect('ramp', 1, 'flat')], 'After taking damage: gain +1 damage for the battle.'),
  'shredding-arrows': makeAbility({
    id: 'shredding-arrows',
    label: 'Shredding Arrows',
    trigger: { timing: 'onAttack' },
    duration: battleDuration(),
    target: { mode: 'default' },
    effects: [statDeltaEffect('armor', -1, 'flat')],
    shortText: 'On attack: reduce the target armor by 1 for the battle.',
  }),
  taunt: makeAbility({
    id: 'taunt',
    label: 'Taunt',
    trigger: { timing: 'endOfTurn' },
    duration: instantDuration(),
    target: aoeTarget('enemy', 0, { unengaged: true }),
    effects: [redirectEffect()],
    shortText: 'End of turn: engage unengaged enemies on this hex up to Capacity.',
  }),
  'vengeance-1': makeAbility({
    id: 'vengeance-1',
    label: 'Vengeance 1',
    trigger: { timing: 'onFallen', fallen: { allegiance: 'ally', radius: 0 } },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [statEffect('haste', 1, 'flat'), statEffect('ramp', 1, 'flat')],
    shortText: 'When an ally dies on this hex, gain +1 speed and +1 damage for the battle.',
  }),
  'vengeance-3': makeAbility({
    id: 'vengeance-3',
    label: 'Vengeance 3',
    trigger: { timing: 'onFallen', fallen: { allegiance: 'ally', radius: 0 } },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [statEffect('haste', 3, 'flat'), statEffect('ramp', 3, 'flat')],
    shortText: 'When an ally dies on this hex, gain +3 speed and +3 damage for the battle.',
  }),
  'enhance-1': makeAbility({
    id: 'enhance-1',
    label: 'Enhance 1',
    trigger: { timing: 'endOfTurn' },
    duration: battleDuration(),
    target: randomTarget('ally', 'selfRange', { notTypes: ['caster'] }),
    effects: [statEffect('haste', 1, 'flat'), statEffect('ramp', 1, 'flat')],
    shortText: "End of turn: a random allied non-caster within this unit's range gains +1 speed and +1 damage for the battle.",
  }),
  'shapeshift-bear': makeAbility({
    id: 'shapeshift-bear',
    label: 'Shapeshift - Bear',
    trigger: { timing: 'endOfTurn', chargeEvery: 5, maxUses: 1 },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [
      statEffect('bolster', 100, 'flat'),
      statEffect('haste', 5, 'flat'),
      statEffect('ramp', 20, 'flat'),
      { kind: 'rangeset', value: 0 },
      roleset('frontline'),
    ],
    shortText: 'After 5 turns, once: gain +100 health, +5 speed, +20 damage, set range to 0, and become a frontline unit.',
  }),
  bonded: makeAbility({
    id: 'bonded',
    label: 'Bonded',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: dies when its summoner dies.',
  }),
  fading: makeAbility({
    id: 'fading',
    label: 'Fading',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: does not leave a corpse on death.',
  }),
  'summon-wolf-2': makeAbility({
    id: 'summon-wolf-2',
    label: 'Summon Wolf 2',
    trigger: { timing: 'startOfBattle' },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [summonEffect('wolf', 2)],
    shortText: 'Start of battle: summon 2 wolves on this unit or adjacent hexes.',
  }),
  'summon-wolf-2-blood': makeAbility({
    id: 'summon-wolf-2-blood',
    label: 'Summon Wolf 2',
    trigger: { timing: 'startOfBattle' },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [summonEffect('wolf', 2, false, ['onkill-summon-wolf-1'])],
    shortText: 'Start of battle: summon 2 wolves on this unit or adjacent hexes. Those wolves summon 1 more wolf on each kill, and new wolves inherit that effect.',
  }),
  'onkill-summon-wolf-1': makeAbility({
    id: 'onkill-summon-wolf-1',
    label: 'On Kill Summon Wolf 1',
    trigger: { timing: 'onKill' },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [summonEffect('wolf', 1, false, ['onkill-summon-wolf-1'])],
    shortText: 'On kill: summon 1 wolf on this unit or an adjacent hex. Summoned wolves inherit this ability.',
  }),
  'charge-4-summon-elemental': makeAbility({
    id: 'charge-4-summon-elemental',
    label: 'Charge 4 Summon Elemental',
    trigger: { timing: 'endOfTurn', chargeEvery: 4 },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [summonEffect('elemental', 1)],
    shortText: 'Every 4 turns: summon 1 elemental on this unit or an adjacent hex.',
  }),
  'charge-4-summon-elemental-mitosis': makeAbility({
    id: 'charge-4-summon-elemental-mitosis',
    label: 'Charge 4 Summon Elemental',
    trigger: { timing: 'endOfTurn', chargeEvery: 4 },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [summonEffect('elemental', 1, false, ['charge-4-uses-1-summon-elemental'])],
    shortText: 'Every 4 turns: summon 1 elemental on this unit or an adjacent hex. Each summoned elemental can do the same once.',
  }),
  'charge-4-uses-1-summon-elemental': makeAbility({
    id: 'charge-4-uses-1-summon-elemental',
    label: 'Charge 4 Uses 1 Summon Elemental',
    trigger: { timing: 'endOfTurn', chargeEvery: 4, maxUses: 1 },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [summonEffect('elemental', 1, false, ['charge-4-uses-1-summon-elemental'])],
    shortText: 'Every 4 turns, once: summon 1 elemental on this unit or an adjacent hex. Summoned elementals inherit this ability.',
  }),
  'corpse-summon-skeleton': makeAbility({
    id: 'corpse-summon-skeleton',
    label: 'Corpse Summon Skeleton',
    trigger: { timing: 'onFallen', fallen: { allegiance: 'all', radius: 0, radiusSource: 'selfRange' } },
    duration: battleDuration(),
    effects: [summonEffect('skeleton', 1, true)],
    shortText: 'When a nearby unit leaves a corpse, consume it to summon a skeleton there.',
  }),
  'corpse-summon-skeleton-rising': makeAbility({
    id: 'corpse-summon-skeleton-rising',
    label: 'Corpse Summon Skeleton',
    trigger: { timing: 'onFallen', fallen: { allegiance: 'all', radius: 0, radiusSource: 'selfRange' } },
    duration: battleDuration(),
    effects: [summonEffect('skeleton', 1, true, ['heal-ally-0-7'])],
    shortText: 'When a nearby unit leaves a corpse, consume it to summon a skeleton there. Summoned skeletons heal allies on their hex.',
  }),
  'uses-7-corpse-summon-skeleton': makeAbility({
    id: 'uses-7-corpse-summon-skeleton',
    label: 'Uses 7 Corpse Summon Skeleton',
    trigger: { timing: 'onFallen', fallen: { allegiance: 'all', radius: 0, radiusSource: 'selfRange' }, maxUses: 7 },
    duration: battleDuration(),
    effects: [summonEffect('skeleton', 1, true)],
    shortText: 'When a nearby unit leaves a corpse, consume it to summon a skeleton there up to 7 times.',
  }),
  'heal-ally-0-7': makeAbility({
    id: 'heal-ally-0-7',
    label: 'AoE Ally 0 Heal 7',
    trigger: { timing: 'endOfTurn' },
    duration: instantDuration(),
    target: aoeTarget('ally', 0),
    effects: [statEffect('heal', 7, 'flat')],
    shortText: 'End of turn: heal allies on this hex for 7.',
  }),
  'death-summon-skeleton': makeAbility({
    id: 'death-summon-skeleton',
    label: 'On Death Summon Skeleton',
    trigger: { timing: 'onDeath' },
    duration: instantDuration(),
    target: selfTarget(),
    effects: [summonEffect('skeleton', 1)],
    shortText: 'On death: summon 1 skeleton on this unit or an adjacent hex.',
  }),
  'zeal-enhance-1': makeAbility({
    id: 'zeal-enhance-1',
    label: 'Zeal',
    trigger: { timing: 'onEffectApplied', effectApplication: { effectKinds: ['heal'] } },
    duration: battleDuration(),
    target: { mode: 'default' },
    effects: [statEffect('haste', 1, 'flat'), statEffect('ramp', 1, 'flat')],
    shortText: 'When this unit heals a target, that same target also gains +1 speed and +1 damage for the battle.',
  }),
  'serve-once-more': makeAbility({
    id: 'serve-once-more',
    label: 'Serve Once More',
    trigger: { timing: 'onEffectApplied', effectApplication: { dispositions: ['beneficial'] } },
    duration: battleDuration(),
    target: { mode: 'default' },
    effects: [grantAbilityEffect('fading', 'harmful'), grantAbilityEffect('death-summon-skeleton', 'neutral')],
    shortText: 'When this unit applies a beneficial effect, the same target leaves no corpse on death and summons 1 skeleton on death.',
  }),
  executioner: makeAbility({
    id: 'executioner',
    label: 'Executioner',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: prioritize the lowest-HP legal attack target.',
  }),
  retaliate: makeAbility({
    id: 'retaliate',
    label: 'Retaliate',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: when hit by a normal attack, make a normal attack back once.',
  }),
  scurry: makeAbility({
    id: 'scurry',
    label: 'Scurry',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: does not count toward allied saturation limits.',
  }),
  'alternate-fuel-10': makeAbility({
    id: 'alternate-fuel-10',
    label: 'Alternate Fuel',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: corpse-consuming abilities may spend 10 HP instead of requiring or consuming a corpse, if that would not kill this unit.',
  }),
  'concussive-shots': makeAbility({
    id: 'concussive-shots',
    label: 'Concussive Shots',
    trigger: { timing: 'onAttack' },
    duration: instantDuration(),
    target: { mode: 'default' },
    effects: [initiativeSetEffect(0)],
    shortText: 'On attack: set the target initiative to 0.',
  }),
  'charge-4-random-enemy-r-strike-4': makeAbility({
    id: 'charge-4-random-enemy-r-strike-4',
    label: 'Storm',
    trigger: { timing: 'endOfTurn', chargeEvery: 4 },
    duration: instantDuration(),
    target: randomTarget('enemy', 'selfRange'),
    effects: [{ kind: 'strike', amount: 4, disposition: 'harmful' }],
    shortText: 'Every 4 turns: a random enemy within this unit range is struck 4 extra times.',
  }),
};

export const UNIT_TYPES: Record<UnitTypeId, UnitTypeDefinition> = {
  soldier: {
    id: 'soldier',
    label: 'Soldier',
    role: 'frontline',
    type: 'soldier',
    attributes: ['melee'],
    stats: { health: 100, damage: 10, speed: 10, range: 0, armor: 2, size: 1, capacity: 2 },
    quantity: 1,
    cost: 24,
    abilityIds: [],
  },
  champion: {
    id: 'champion',
    label: 'Champion',
    role: 'frontline',
    type: 'champion',
    attributes: ['melee'],
    stats: { health: 130, damage: 20, speed: 17, range: 0, armor: 0, size: 2, capacity: 1 },
    quantity: 1,
    cost: 60,
    abilityIds: ['valor-20'],
  },
  avenger: {
    id: 'avenger',
    label: 'Avenger',
    role: 'frontline',
    type: 'avenger',
    attributes: ['melee'],
    stats: { health: 200, damage: 6, speed: 10, range: 0, armor: 0, size: 2, capacity: 1 },
    quantity: 1,
    cost: 40,
    abilityIds: ['vengeance-3'],
  },
  beastmaster: {
    id: 'beastmaster',
    label: 'Beastmaster',
    role: 'frontline',
    type: 'beastmaster',
    attributes: ['melee', 'summoner'],
    stats: { health: 90, damage: 8, speed: 8, range: 0, armor: 0, size: 2, capacity: 1 },
    quantity: 1,
    cost: 60,
    abilityIds: ['summon-wolf-2'],
  },
  druid: {
    id: 'druid',
    label: 'Druid',
    role: 'backline',
    type: 'druid',
    attributes: ['caster'],
    stats: { health: 25, damage: 11, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 30,
    abilityIds: ['shapeshift-bear'],
  },
  elemental: {
    id: 'elemental',
    label: 'Elemental',
    role: 'frontline',
    type: 'elemental',
    attributes: ['melee', 'summoned'],
    stats: { health: 60, damage: 13, speed: 7, range: 2, armor: 5, size: 1, capacity: 3 },
    quantity: 1,
    cost: 20,
    abilityIds: [],
  },
  elementalist: {
    id: 'elementalist',
    label: 'Elementalist',
    role: 'backline',
    type: 'elementalist',
    attributes: ['caster', 'summoner'],
    stats: { health: 25, damage: 10, speed: 9, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 30,
    abilityIds: ['charge-4-summon-elemental'],
  },
  knight: {
    id: 'knight',
    label: 'Knight',
    role: 'frontline',
    type: 'knight',
    attributes: ['melee'],
    stats: { health: 200, damage: 16, speed: 7, range: 0, armor: 10, size: 2, capacity: 5 },
    quantity: 1,
    cost: 60,
    abilityIds: ['taunt'],
  },
  militia: {
    id: 'militia',
    label: 'Militia',
    role: 'chaff',
    type: 'militia',
    attributes: ['melee', 'expendable'],
    stats: { health: 40, damage: 8, speed: 11, range: 0, armor: 0, size: 1, capacity: 1 },
    quantity: 1,
    cost: 10,
    abilityIds: [],
  },
  archer: {
    id: 'archer',
    label: 'Archer',
    role: 'backline',
    type: 'archer',
    attributes: ['ranged'],
    stats: { health: 30, damage: 11, speed: 11, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: [],
  },
  wizard: {
    id: 'wizard',
    label: 'Wizard',
    role: 'backline',
    type: 'wizard',
    attributes: ['caster'],
    stats: { health: 20, damage: 9, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: ['blast-5'],
  },
  priest: {
    id: 'priest',
    label: 'Priest',
    role: 'backline',
    type: 'priest',
    attributes: ['caster'],
    stats: { health: 25, damage: 7, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: ['mend-4'],
  },
  ranger: {
    id: 'ranger',
    label: 'Ranger',
    role: 'backline',
    type: 'ranger',
    attributes: ['ranged'],
    stats: { health: 50, damage: 16, speed: 13, range: 3, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 60,
    abilityIds: ['haste-1'],
  },
  necromancer: {
    id: 'necromancer',
    label: 'Necromancer',
    role: 'backline',
    type: 'necromancer',
    attributes: ['caster', 'summoner'],
    stats: { health: 40, damage: 16, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 40,
    abilityIds: ['corpse-summon-skeleton'],
  },
  skeleton: {
    id: 'skeleton',
    label: 'Skeleton',
    role: 'chaff',
    type: 'skeleton',
    attributes: ['melee', 'summoned'],
    stats: { health: 40, damage: 13, speed: 7, range: 2, armor: 0, size: 1, capacity: 1 },
    quantity: 1,
    cost: 20,
    abilityIds: ['bonded', 'fading'],
  },
  shaman: {
    id: 'shaman',
    label: 'Shaman',
    role: 'backline',
    type: 'shaman',
    attributes: ['caster'],
    stats: { health: 20, damage: 11, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: ['enhance-1'],
  },
  wolf: {
    id: 'wolf',
    label: 'Wolf',
    role: 'chaff',
    type: 'wolf',
    attributes: ['melee', 'summoned'],
    stats: { health: 70, damage: 6, speed: 12, range: 2, armor: 0, size: 1, capacity: 1 },
    quantity: 1,
    cost: 20,
    abilityIds: ['bonded', 'pack-1'],
  },
};

export const FACTIONS: Record<FactionId, FactionDefinition> = {
  human: {
    id: 'human',
    label: 'Humans',
    singularLabel: 'Human',
    description: 'Slightly better at pretty much everything. Boring but solid.',
    addedAttributes: ['human'],
    statAdjustments: {
      health: { multiplier: 1.1 },
      damage: { multiplier: 1.1 },
      speed: { multiplier: 1.1 },
      armor: { flat: 1 },
      capacity: { flat: 1 },
    },
    abilityIds: [],
  },
  elf: {
    id: 'elf',
    label: 'Elves',
    singularLabel: 'Elven',
    description: 'Feared from afar. Less so up close.',
    addedAttributes: ['elf'],
    statAdjustments: {
      health: { multiplier: 0.9 },
      damage: { multiplier: 1.2 },
      speed: { multiplier: 1.2 },
      range: { flat: 1 },
    },
    abilityIds: [],
  },
  goblin: {
    id: 'goblin',
    label: 'Goblins',
    singularLabel: 'Goblin',
    description: "The one good thing you can say about goblins is that there's more than one of them.",
    addedAttributes: ['goblin', 'expendable'],
    statAdjustments: {
      health: { multiplier: 0.7 },
      damage: { multiplier: 0.8 },
      range: { flat: -1 },
      armor: { flat: -2 },
      size: { flat: -1 },
      capacity: { flat: -2 },
      cost: { multiplier: 0.5 },
    },
    abilityIds: [],
  },
  troll: {
    id: 'troll',
    label: 'Trolls',
    singularLabel: 'Troll',
    description: 'Never down for the count, never down for counting.',
    addedAttributes: ['troll'],
    statAdjustments: {
      health: { multiplier: 1.3 },
      damage: { multiplier: 1.2 },
      speed: { multiplier: 0.8 },
      size: { flat: 1 },
      capacity: { flat: 1 },
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
    description: 'Overworld: human troops may enter the same Rift together.',
    effects: [{ kind: 'addAbility', abilityId: 'united' }],
  },
  'human-combined-arms': {
    id: 'human-combined-arms',
    factionId: 'human',
    label: 'Human Combined Arms',
    tier: 2,
    description: 'Start of battle: each human unit gains +20% health, +20% damage, and +20% speed for each other friendly troop type in that battle.',
    effects: [{ kind: 'addAbility', abilityId: 'combined-arms-20' }],
  },
  'elven-eyes': {
    id: 'elven-eyes',
    factionId: 'elf',
    label: 'Elven Eyes',
    tier: 1,
    description: 'All non-melee elven troops gain +1 range.',
    effects: [{ kind: 'modifyStats', unitFilter: 'nonMelee', statModifiers: { range: { flat: 1 } } }],
  },
  'elven-forsaken': {
    id: 'elven-forsaken',
    factionId: 'elf',
    label: 'Elven Forsaken',
    tier: 3,
    description: 'Start of battle: if an elven unit is fighting without any other friendly troop types, it gains +80% health, +80% damage, and +80% speed.',
    effects: [{ kind: 'addAbility', abilityId: 'forsaken-80' }],
  },
  'goblin-farewell-upgrade': {
    id: 'goblin-farewell-upgrade',
    factionId: 'goblin',
    label: 'Goblin Farewell',
    tier: 1,
    description: 'On death: each goblin unit makes 1 extra strike against a random enemy on its hex.',
    effects: [{ kind: 'addAbility', abilityId: 'goblin-farewell' }],
  },
  'goblin-pack': {
    id: 'goblin-pack',
    factionId: 'goblin',
    label: 'Goblin Pack',
    tier: 2,
    description: 'Start of turn: each goblin unit gains +1 damage per other friendly unit on its hex until end of turn.',
    effects: [{ kind: 'addAbility', abilityId: 'pack-1' }],
  },
  'troll-momentum': {
    id: 'troll-momentum',
    factionId: 'troll',
    label: 'Troll Momentum',
    tier: 1,
    description: 'End of turn: each troll unit gains +1 damage for the rest of the battle.',
    effects: [{ kind: 'addAbility', abilityId: 'ramp-1' }],
  },
  'troll-frenzy': {
    id: 'troll-frenzy',
    factionId: 'troll',
    label: 'Troll Frenzy',
    tier: 3,
    description: 'After taking damage: each troll unit gains +1 damage for the rest of the battle.',
    effects: [{ kind: 'addAbility', abilityId: 'frenzy-ramp-1' }],
  },
};

export const TROOP_TYPE_UPGRADES: Record<string, TroopTypeUpgradeDefinition> = {
  'archer-shredding-arrows': {
    id: 'archer-shredding-arrows',
    unitTypeId: 'archer',
    label: 'Shredding Arrows',
    tier: 2,
    description: 'On attack: each Archer reduces its target armor by 1 for the rest of the battle.',
    effects: [{ kind: 'addAbility', abilityId: 'shredding-arrows' }],
  },
  'avenger-sevenfold': {
    id: 'avenger-sevenfold',
    unitTypeId: 'avenger',
    label: 'Sevenfold',
    tier: 2,
    description: 'Whenever a nearby unit leaves a corpse, each Avenger may consume it to summon a skeleton there, up to 7 times per battle.',
    effects: [{ kind: 'addAbility', abilityId: 'uses-7-corpse-summon-skeleton' }],
  },
  'beastmaster-blood-in-the-water': {
    id: 'beastmaster-blood-in-the-water',
    unitTypeId: 'beastmaster',
    label: 'Blood in the Water',
    tier: 2,
    description: 'Start-of-battle wolves summoned by Beastmasters also summon 1 wolf on each kill, and every new wolf inherits that effect.',
    effects: [{ kind: 'replaceAbility', removeAbilityId: 'summon-wolf-2', addAbilityId: 'summon-wolf-2-blood' }],
  },
  'champion-executioner': {
    id: 'champion-executioner',
    unitTypeId: 'champion',
    label: 'Executioner',
    tier: 2,
    description: 'Champions target the lowest-health enemy they are allowed to attack.',
    effects: [{ kind: 'addAbility', abilityId: 'executioner' }],
  },
  'druid-wild-growth': {
    id: 'druid-wild-growth',
    unitTypeId: 'druid',
    label: 'Wild Growth',
    tier: 2,
    description: 'End of turn: each Druid heals itself for 60.',
    effects: [{ kind: 'addAbility', abilityId: 'regen-60' }],
  },
  'elementalist-mitosis': {
    id: 'elementalist-mitosis',
    unitTypeId: 'elementalist',
    label: 'Mitosis',
    tier: 3,
    description: 'Every 4 turns, each Elementalist summons 1 elemental. Each summoned elemental can repeat that summon once after 4 turns.',
    effects: [{ kind: 'replaceAbility', removeAbilityId: 'charge-4-summon-elemental', addAbilityId: 'charge-4-summon-elemental-mitosis' }],
  },
  'knight-retaliate': {
    id: 'knight-retaliate',
    unitTypeId: 'knight',
    label: 'Retaliate',
    tier: 2,
    description: 'Whenever a Knight is hit by a normal attack, it makes 1 normal attack back.',
    effects: [{ kind: 'addAbility', abilityId: 'retaliate' }],
  },
  'militia-scurry': {
    id: 'militia-scurry',
    unitTypeId: 'militia',
    label: 'Scurry',
    tier: 3,
    description: 'Militia do not count toward allied saturation limits.',
    effects: [{ kind: 'addAbility', abilityId: 'scurry' }],
  },
  'necromancer-alternate-fuel': {
    id: 'necromancer-alternate-fuel',
    unitTypeId: 'necromancer',
    label: 'Alternate Fuel',
    tier: 2,
    description: 'Necromancers may spend 10 health instead of requiring or consuming a corpse for corpse-consuming abilities, as long as that would not kill them.',
    effects: [{ kind: 'addAbility', abilityId: 'alternate-fuel-10' }],
  },
  'necromancer-rising-tide': {
    id: 'necromancer-rising-tide',
    unitTypeId: 'necromancer',
    label: 'Rising Tide',
    tier: 3,
    description: 'Skeletons summoned by Necromancers heal allies on their own hex for 7 at the end of each turn.',
    effects: [{ kind: 'replaceAbility', removeAbilityId: 'corpse-summon-skeleton', addAbilityId: 'corpse-summon-skeleton-rising' }],
  },
  'priest-zeal': {
    id: 'priest-zeal',
    unitTypeId: 'priest',
    label: 'Zeal',
    tier: 3,
    description: 'Whenever a Priest heals a target, that same target also gains +1 speed and +1 damage for the battle.',
    effects: [{ kind: 'addAbility', abilityId: 'zeal-enhance-1' }],
  },
  'ranger-concussive-shots': {
    id: 'ranger-concussive-shots',
    unitTypeId: 'ranger',
    label: 'Concussive Shots',
    tier: 2,
    description: 'On attack: each Ranger sets its target initiative to 0.',
    effects: [{ kind: 'addAbility', abilityId: 'concussive-shots' }],
  },
  'shaman-serve-once-more': {
    id: 'shaman-serve-once-more',
    unitTypeId: 'shaman',
    label: 'Serve Once More',
    tier: 3,
    description: 'Whenever a Shaman applies a beneficial effect, that target leaves no corpse on death and summons 1 skeleton on death.',
    effects: [{ kind: 'addAbility', abilityId: 'serve-once-more' }],
  },
  'wizard-storm': {
    id: 'wizard-storm',
    unitTypeId: 'wizard',
    label: 'Storm',
    tier: 2,
    description: 'Every 4 turns, each Wizard makes 4 extra strikes against a random enemy within its range.',
    effects: [{ kind: 'addAbility', abilityId: 'charge-4-random-enemy-r-strike-4' }],
  },
};

export const MUTATORS: Record<string, MutatorDefinition> = {
  momentum: {
    id: 'momentum',
    label: 'Momentum',
    description: 'All units gain +10 initiative every beat.',
    initiativeBonusPerBeat: 10,
  },
  'heavy-air': {
    id: 'heavy-air',
    label: 'Heavy Air',
    description: 'Ranged attack damage is reduced by 50%.',
    rangedDamageMultiplier: 0.5,
  },
  quagmire: {
    id: 'quagmire',
    label: 'Quagmire',
    description: 'Troops sent here take twice as long to recover.',
    recoveryMultiplier: 2,
  },
};

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

export function getTroopTypeUpgrade(id: string): TroopTypeUpgradeDefinition {
  const upgrade = TROOP_TYPE_UPGRADES[id];
  if (!upgrade) {
    throw new Error(`Unknown troop-type upgrade ${id}`);
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

function canReceiveRangeAdjustment(attributes: string[]): boolean {
  return !attributes.includes('melee');
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

export function getTroopQuantityForCost(cost: number): number {
  return fixedMax(fixed(TROOP_UNIT_BUDGET / Math.max(cost, 1)), 1);
}

export function composeBaseTroopDefinition(factionId: FactionId, unitTypeId: UnitTypeId): TroopDefinition {
  const faction = getFaction(factionId);
  const unitType = getUnitType(unitTypeId);
  const attributes = [...new Set([...unitType.attributes, ...faction.addedAttributes])];
  const stats = STAT_KEYS.reduce<UnitStats>(
    (result, key) => {
      if (key === 'range' && !canReceiveRangeAdjustment(attributes)) {
        result[key] = clampStat(key, unitType.stats[key]);
        return result;
      }
      result[key] = clampStat(key, applyAdjustment(unitType.stats[key], faction.statAdjustments[key]));
      return result;
    },
    { health: 0, damage: 0, speed: 0, range: 0, armor: 0, size: 0, capacity: 0 },
  );
  const cost = fixedMax(applyAdjustment(unitType.cost, faction.statAdjustments.cost), 1);
  const abilities = [...unitType.abilityIds, ...faction.abilityIds].map(getAbility);
  return {
    id: `${factionId}/${unitTypeId}`,
    factionId,
    unitTypeId,
    label: `${faction.singularLabel} ${unitType.label}`,
    role: unitType.role,
    type: unitType.type,
    attributes,
    stats,
    quantity: getTroopQuantityForCost(cost),
    cost,
    abilities,
  };
}

export function composeSummonedTroopDefinition(factionId: FactionId, unitTypeId: UnitTypeId): TroopDefinition {
  const unitType = getUnitType(unitTypeId);
  return {
    id: `${factionId}/${unitTypeId}`,
    factionId,
    unitTypeId,
    label: unitType.label,
    role: unitType.role,
    type: unitType.type,
    attributes: [...unitType.attributes],
    stats: { ...unitType.stats },
    quantity: unitType.quantity,
    cost: unitType.cost,
    abilities: unitType.abilityIds.map(getAbility),
  };
}

export const TROOP_CATALOG = Object.values(FACTIONS).reduce<Record<string, TroopDefinition>>((acc, faction) => {
  Object.keys(UNIT_TYPES).forEach((unitTypeId) => {
    acc[`${faction.id}/${unitTypeId}`] = composeBaseTroopDefinition(faction.id, unitTypeId);
  });
  return acc;
}, {});

export const TROOP_TYPE_IDS = Object.keys(TROOP_CATALOG);
export const UNLOCKABLE_UNIT_TYPE_IDS = Object.values(UNIT_TYPES)
  .filter((unitType) => !unitType.attributes.includes('summoned'))
  .map((unitType) => unitType.id);
export const ALL_TROOP_UNLOCK_IDS = Object.keys(FACTIONS).flatMap((factionId) =>
  UNLOCKABLE_UNIT_TYPE_IDS.map((unitTypeId) => getTroopUnlockId(factionId as FactionId, unitTypeId)),
);
export const NATIVE_TROOP_UNIT_TYPE_IDS_BY_FACTION: Record<FactionId, UnitTypeId[]> = {
  human: ['soldier', 'militia', 'archer', 'knight', 'priest', 'wizard'],
  elf: ['archer', 'ranger', 'druid', 'beastmaster', 'champion'],
  goblin: ['militia', 'soldier', 'shaman', 'necromancer', 'wizard'],
  troll: ['soldier', 'champion', 'avenger', 'beastmaster', 'shaman', 'elementalist'],
};
export const NATIVE_TROOP_UNLOCK_IDS_BY_FACTION: Record<FactionId, string[]> = Object.fromEntries(
  (Object.keys(NATIVE_TROOP_UNIT_TYPE_IDS_BY_FACTION) as FactionId[]).map((factionId) => [
    factionId,
    NATIVE_TROOP_UNIT_TYPE_IDS_BY_FACTION[factionId].map((unitTypeId) => getTroopUnlockId(factionId, unitTypeId)),
  ]),
) as Record<FactionId, string[]>;
export const NATIVE_TROOP_UNLOCK_IDS = (Object.values(NATIVE_TROOP_UNLOCK_IDS_BY_FACTION).flat() as string[]).sort((left, right) =>
  left.localeCompare(right),
);

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
  return fixedMul(fixed(troop.cost / troop.quantity), unitCount);
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

export function getTroopUnlockId(factionId: FactionId, unitTypeId: UnitTypeId): string {
  return `${factionId}/${unitTypeId}`;
}

export function getFactionNativeTroopUnlockIds(factionId: FactionId): string[] {
  return [...NATIVE_TROOP_UNLOCK_IDS_BY_FACTION[factionId]];
}

export function isNativeTroopUnlockId(troopUnlockId: string): boolean {
  return NATIVE_TROOP_UNLOCK_IDS.includes(troopUnlockId);
}

export function applyStatModifier(
  stats: UnitStats,
  modifiers: Partial<Record<TroopStatKey, { flat?: number; multiplier?: number }>>,
  attributes: string[] = [],
): UnitStats {
  const next = { ...stats };
  (Object.keys(modifiers) as TroopStatKey[]).forEach((key) => {
    if (key === 'range' && !canReceiveRangeAdjustment(attributes)) {
      return;
    }
    next[key] = clampStat(key, applyAdjustment(next[key], modifiers[key]));
  });
  return next;
}
