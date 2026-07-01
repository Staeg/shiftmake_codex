import { fixed, fixedClamp, fixedMax, fixedMul, fixedSum } from './fixed';
import type {
  AbilityDefinition,
  AbilityDurationDefinition,
  AbilityEffectDefinition,
  AbilityId,
  AbilityTargetFilters,
  AbilityTiming,
  AbilityTriggerDefinition,
  RaceDefinition,
  RaceId,
  RaceUpgradeDefinition,
  MutatorDefinition,
  RoleId,
  TroopClassUpgradeDefinition,
  TroopDefinition,
  TroopStatKey,
  UnitStats,
  UnitClassDefinition,
  UnitClassId,
} from './types';

const STAT_KEYS: Array<keyof UnitStats> = ['health', 'damage', 'speed', 'move', 'range', 'armor', 'size', 'capacity'];
const TROOP_UNIT_BUDGET = 120;

function makeAbility(definition: AbilityDefinition): AbilityDefinition {
  if (!definition.id.trim()) {
    throw new Error('Ability definitions must have a non-empty id.');
  }
  if (!definition.label.trim()) {
    throw new Error(`Ability ${definition.id} must have a non-empty label.`);
  }
  if (!definition.trigger?.timing) {
    throw new Error(`Ability ${definition.id} must define a trigger timing.`);
  }
  if (!Array.isArray(definition.effects)) {
    throw new Error(`Ability ${definition.id} must define effects.`);
  }
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

function redirectEffectAllowEngaged(): AbilityEffectDefinition {
  return { kind: 'redirect', allowAlreadyEngaged: true };
}

function summonEffect(
  unitClassId: UnitClassId,
  count: number,
  consumeFallenUnitCorpse = false,
  grantedAbilityIds: AbilityId[] = [],
  initialInitiative?: number,
): AbilityEffectDefinition {
  return { kind: 'summon', unitClassId, count, consumeFallenUnitCorpse, grantedAbilityIds, initialInitiative, disposition: 'neutral' };
}

function initiativeSetEffect(value: number): AbilityEffectDefinition {
  return { kind: 'initiativeSet', value, disposition: 'harmful' };
}

function initiativeDeltaEffect(amount: number): AbilityEffectDefinition {
  return { kind: 'initiativeDelta', amount, disposition: amount >= 0 ? 'beneficial' : 'harmful' };
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
    shortText: "On attack: all enemies within 2 hexes of the target's occupied hexes take 5 damage.",
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
    shortText: 'On kill: heal allies touching the fallen unit for 20.',
  }),
  united: makeAbility({
    id: 'united',
    label: 'United',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    overworldEffectId: 'united',
    shortText: 'Overworld: troops of this race may enter the same Rift together.',
  }),
  'combined-arms-20': makeTripleStatAbility(
    'combined-arms-20',
    'Power of Friendship',
    20,
    'Start of battle: gain +20% health, +20% damage, and +20% speed for each other friendly troop on this side.',
    { repeatPerDistinctFriendlyTroop: true },
  ),
  'forsaken-80': makeTripleStatAbility(
    'forsaken-80',
    'Forsaken 80',
    80,
    'Start of battle: if this is the only troop on its side, gain 80% health, damage, and speed.',
    { condition: 'forsaken' },
  ),
  'goblin-farewell': makeAbility({
    id: 'goblin-farewell',
    label: 'Goblin Farewell',
    trigger: { timing: 'onDeath' },
    duration: instantDuration(),
    target: randomTarget('enemy', 0),
    effects: [{ kind: 'strike', amount: 1 }],
    shortText: 'On death: strike a random touching enemy one extra time.',
  }),
  'diggy-hole': makeAbility({
    id: 'diggy-hole',
    label: 'Diggy Hole',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: does not spawn at battle start. After 10 beats, spawns on the enemy side of the board with 100 initiative.',
  }),
  'ale-and-hearty': makeAbility({
    id: 'ale-and-hearty',
    label: 'Ale and Hearty',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: one random unit from each troop has speed set to 1 at the start of combat.',
  }),
  'stall-warts': makeAbility({
    id: 'stall-warts',
    label: 'Stall Warts',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: after being hit by normal attacks, gain +1 armor and lose 1 speed for the battle.',
  }),
  'seeing-red': makeAbility({
    id: 'seeing-red',
    label: 'Seeing Red',
    trigger: { timing: 'onKill' },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [statDeltaEffect('armor', -1, 'flat'), initiativeDeltaEffect(75)],
    shortText: 'On kill: lose 1 armor for the battle and gain 75 initiative.',
  }),
  'first-blood': makeAbility({
    id: 'first-blood',
    label: 'First Blood',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: attack immediately when engaging an enemy, before the normal engagement attack.',
  }),
  berserk: makeAbility({
    id: 'berserk',
    label: 'Berserk',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: the first time this unit would die from damage, it becomes immune to damage and dies at the end of its next turn.',
  }),
  glamour: makeAbility({
    id: 'glamour',
    label: 'Glamour',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: once per battle, redirect an incoming normal attack to a random enemy in range as if this unit made the attack.',
  }),
  changeling: makeAbility({
    id: 'changeling',
    label: 'Changeling',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: after beat 12, one random enemy from each enemy troop changes sides.',
  }),
  whimsy: makeAbility({
    id: 'whimsy',
    label: 'Whimsy',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: after taking damage, relocate to a random legal hex.',
  }),
  'pack-1': makeSelfStatAbility(
    'pack-1',
    'Pack 1',
    'startOfTurn',
    [statEffect('ramp', 1, 'flat')],
    'Start of turn: gain +1 damage per other touching friendly unit until end of turn.',
    turnsDuration(1),
    { repeatPerTouchingFriendlyUnit: true },
  ),
  'horde-4': makeSelfStatAbility(
    'horde-4',
    'Horde 4',
    'startOfTurn',
    [statEffect('ramp', 4, 'flat')],
    'Start of turn: gain +4 damage per other touching friendly unit until end of turn.',
    turnsDuration(1),
    { repeatPerTouchingFriendlyUnit: true },
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
  'self-haste-2': makeAbility({
    id: 'self-haste-2',
    label: 'Self Haste 2',
    trigger: { timing: 'endOfTurn' },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [statEffect('haste', 2, 'flat')],
    shortText: 'End of turn: gain +2 speed for the battle.',
  }),
  'ramp-1': makeSelfStatAbility('ramp-1', 'Ramp 1', 'endOfTurn', [statEffect('ramp', 1, 'flat')], 'End of turn: gain +1 damage for the battle.'),
  'ramp-2': makeSelfStatAbility('ramp-2', 'Ramp 2', 'endOfTurn', [statEffect('ramp', 2, 'flat')], 'End of turn: gain +2 damage for the battle.'),
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
    shortText: 'End of turn: engage unengaged enemies in footprint contact up to Capacity.',
  }),
  'vengeance-1': makeAbility({
    id: 'vengeance-1',
    label: 'Vengeance 1',
    trigger: { timing: 'onFallen', fallen: { allegiance: 'ally', radius: 0 } },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [statEffect('haste', 1, 'flat'), statEffect('ramp', 1, 'flat')],
    shortText: 'When a touching ally dies, gain +1 speed and +1 damage for the battle.',
  }),
  'vengeance-3': makeAbility({
    id: 'vengeance-3',
    label: 'Vengeance 3',
    trigger: { timing: 'onFallen', fallen: { allegiance: 'ally', radius: 0 } },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [statEffect('haste', 3, 'flat'), statEffect('ramp', 3, 'flat')],
    shortText: 'When a touching ally dies, gain +3 speed and +3 damage for the battle.',
  }),
  'enhance-1': makeAbility({
    id: 'enhance-1',
    label: 'Enhance 1',
    trigger: { timing: 'endOfTurn' },
    duration: battleDuration(),
    target: randomTarget('ally', 'selfRange', { notClasses: ['caster'] }),
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
  'summon-wolf-1': makeAbility({
    id: 'summon-wolf-1',
    label: 'Summon Wolf 1',
    trigger: { timing: 'startOfBattle' },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [summonEffect('wolf', 1)],
    shortText: 'Start of battle: summon 1 wolf on this unit or an adjacent hex.',
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
    shortText: 'When a nearby unit leaves a corpse, consume it to summon a skeleton there. Summoned skeletons heal allies touching them.',
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
    shortText: 'End of turn: heal touching allies for 7.',
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
  dreamwork: makeAbility({
    id: 'dreamwork',
    label: 'Dreamwork',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: "Passive: once per beat, attack an adjacent enemy when that enemy is hit by another ally's normal attack.",
  }),
  barrage: makeAbility({
    id: 'barrage',
    label: 'Barrage',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: while not engaged, ranged attacks hit every enemy in range, but deal 40% less damage.',
  }),
  'honorable-duel': makeAbility({
    id: 'honorable-duel',
    label: 'Honorable Duel',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: this Champion cannot be targeted by normal attacks from enemies it is not engaged with.',
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
    effects: [{ kind: 'strike', amount: 2, disposition: 'harmful' }],
    shortText: 'Every 4 turns: a random enemy within this unit range is struck 2 extra times.',
  }),
  'shield-drill': makeAbility({
    id: 'shield-drill',
    label: 'Shield Drill',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: ranged attacks can deal at most 1 damage to this unit after all modifiers.',
  }),
  'pinning-volley': makeAbility({
    id: 'pinning-volley',
    label: 'Pinning Volley',
    trigger: { timing: 'onAttack' },
    duration: battleDuration(),
    target: { mode: 'default' },
    effects: [statDeltaEffect('speed', -1, 'flat')],
    shortText: 'On attack: reduce the target speed by 1 for the battle.',
  }),
  'hexing-shots': makeAbility({
    id: 'hexing-shots',
    label: 'Hexing Shots',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: Archer attacks deal +1 damage per Hex stack on the target.',
  }),
  'blood-oath': makeAbility({
    id: 'blood-oath',
    label: 'Blood Oath',
    trigger: { timing: 'onFallen', fallen: { allegiance: 'ally', radius: 0 } },
    duration: instantDuration(),
    target: selfTarget(),
    effects: [initiativeSetEffect(100)],
    shortText: 'When a touching ally dies: set initiative to 100.',
  }),
  'shapeshift-bear-2': makeAbility({
    id: 'shapeshift-bear-2',
    label: 'Shapeshift - Bear',
    trigger: { timing: 'endOfTurn', chargeEvery: 5, maxUses: 2 },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [
      statEffect('bolster', 100, 'flat'),
      statEffect('haste', 5, 'flat'),
      statEffect('ramp', 20, 'flat'),
      { kind: 'rangeset', value: 0 },
      roleset('frontline'),
    ],
    shortText: 'After every 5 turns, twice: gain +100 health, +5 speed, +20 damage, set range to 0, and become a frontline unit.',
  }),
  'thornhide': makeAbility({
    id: 'thornhide',
    label: 'Thornhide',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: after shapeshifting, normal attackers take 6 damage when they hit this unit.',
  }),
  'arc-conductor': makeAbility({
    id: 'arc-conductor',
    label: 'Arc Conductor',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: "Passive: when an allied elemental dies, blast all enemies within 2 hexes of its occupied hexes for 8.",
  }),
  'arc-conductor-blast-8': makeAbility({
    id: 'arc-conductor-blast-8',
    label: 'Arc Conductor',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [{ kind: 'blast', amount: 8 }],
    shortText: "Triggered by Arc Conductor: when an allied elemental dies, blast all enemies within 2 hexes of its occupied hexes for 8.",
  }),
  'rabble-rush': makeAbility({
    id: 'rabble-rush',
    label: 'R-selected',
    trigger: { timing: 'startOfTurn', repeatPerTouchingFriendlyUnit: true },
    duration: instantDuration(),
    target: selfTarget(),
    effects: [initiativeDeltaEffect(10)],
    overworldEffectId: 'united',
    shortText: 'Start of turn: gain +10 initiative per other touching Militia. Overworld: Militia troops may enter the same Rift together.',
  }),
  'early-riser': makeAbility({
    id: 'early-riser',
    label: 'Early Riser',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: skeletons this unit summons spawn with +100 initiative.',
  }),
  'carrion-choir': makeAbility({
    id: 'carrion-choir',
    label: 'Carrion Choir',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: when this unit consumes a corpse, nearby enemies lose 1 armor and 1 damage for the battle.',
  }),
  'mercy-before-dawn': makeAbility({
    id: 'mercy-before-dawn',
    label: 'Mercy Before Dawn',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: "Passive: the first time each battle an ally in this unit's range would die, it survives at 1 HP. Priest heals repeat on allies in range below 10% HP.",
  }),
  'bolstering-light': makeAbility({
    id: 'bolstering-light',
    label: 'Bolstering Light',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: Priest heals that bring a target to full HP give the target and Priest +1 speed and +1 damage; other Priest heals give both 40 initiative.',
  }),
  'skirmishers-step': makeAbility({
    id: 'skirmishers-step',
    label: "Skirmisher's Step",
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: after attacking unengaged, move to the safest hex that still keeps an enemy in range.',
  }),
  'heartseeker': makeAbility({
    id: 'heartseeker',
    label: 'Heartseeker',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: attacks against unengaged targets deal double damage.',
  }),
  'war-drums': makeAbility({
    id: 'war-drums',
    label: 'War Drums',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'End of turn: pick a random allied non-caster in range; enhance it and all allies touching it.',
  }),
  'spell-echo': makeAbility({
    id: 'spell-echo',
    label: 'Spell Echo',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: each Blast echoes from every enemy hit by that Blast or its echoes, but each enemy can be hit only once per Blast chain.',
  }),
  'tubthumping': makeAbility({
    id: 'tubthumping',
    label: 'Tubthumping',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: effects that would reduce this unit damage or speed instead increase it by 1.',
  }),
  'fade-into-shadow': makeAbility({
    id: 'fade-into-shadow',
    label: 'Fade Into Shadow',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: the first time this backline unit is engaged, it retreats 1 hex for free.',
  }),
  'long-shot-doctrine': makeAbility({
    id: 'long-shot-doctrine',
    label: 'Long Shot Doctrine',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: ranged and caster attacks gain +1 damage and +2 initiative per hex of distance.',
  }),
  'snatch-the-moment': makeAbility({
    id: 'snatch-the-moment',
    label: 'Snatch the Moment',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: on kill, all enemies lose 10 initiative.',
  }),
  'stoneblood': makeAbility({
    id: 'stoneblood',
    label: 'Stoneblood',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: the first time this unit would die, it survives at 25 HP and loses Regen.',
  }),
  'crushing-sweep': makeAbility({
    id: 'crushing-sweep',
    label: 'Crushing Sweep',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: melee kills deal splash damage equal to 10 times this unit size to enemies touching the fallen unit.',
  }),
  'last-witness': makeAbility({
    id: 'last-witness',
    label: 'Last Witness',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: when a touching ally dies, strike their killer twice if still in contact.',
  }),
  brace: makeAbility({
    id: 'brace',
    label: 'Brace',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: start of turn, if engaged at full capacity, gain +5 armor until next turn.',
  }),
  dogpile: makeAbility({
    id: 'dogpile',
    label: 'Dogpile',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: melee attacks against enemies engaged by at least 3 allies strike 1 extra time.',
  }),
  'overflowing-grace': makeAbility({
    id: 'overflowing-grace',
    label: 'Overflowing Grace',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: when this unit heals an ally to full HP, that ally gains 40 initiative.',
  }),
  'static-charge': makeAbility({
    id: 'static-charge',
    label: 'Static Charge',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: when this unit applies Enhance, affected allies gain 1 extra strike on their next normal attack.',
  }),
  'grave-vigor': makeAbility({
    id: 'grave-vigor',
    label: 'Grave Vigor',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: after this unit beneficially affects an ally, that ally ignores future beneficial effects and targeting from Grave Vigor units.',
  }),
  'silver-distance': makeAbility({
    id: 'silver-distance',
    label: 'Silver Distance',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: ranged and caster attacks made from max range make the target lose 30 initiative.',
  }),
  'bramble-snare': makeAbility({
    id: 'bramble-snare',
    label: 'Bramble Snare',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: each shapeshift empowers this unit so its melee attacks reduce target speed by 2 for the battle.',
  }),
  'living-circuit': makeAbility({
    id: 'living-circuit',
    label: 'Living Circuit',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: end of turn, gain 15 initiative once if any allied elemental is in range, and all allied elementals in range gain 15 initiative.',
  }),
  'hold-the-standard': makeAbility({
    id: 'hold-the-standard',
    label: 'Hold the Standard',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: whenever a non-Fading ally dies, heal each Human unit for 15.',
  }),
  'loot-frenzy': makeAbility({
    id: 'loot-frenzy',
    label: 'Loot Frenzy',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: on kill, allies touching the fallen unit heal 10 and gain 30 initiative.',
  }),
  'rowdy-regrowth': makeAbility({
    id: 'rowdy-regrowth',
    label: 'Rowdy Regrowth',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: whenever this unit is healed, gain 20 initiative and +1 damage.',
  }),
  'gargantuan-zeal': makeAbility({
    id: 'gargantuan-zeal',
    label: 'Gargantuan Zeal',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: when a Troll is present, one random unit from each allied troop gains Zeal at battle start. Zeal grants damage based on size.',
  }),
  'overwhelm-hex': makeAbility({
    id: 'overwhelm-hex',
    label: 'Overwhelm Hex',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: when a Goblin is present, one random unit from each enemy troop gains Hex at battle start. Hex drains health at end of turn.',
  }),
  'wild-call': makeAbility({
    id: 'wild-call',
    label: 'Wild Call',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: whenever this unit shapeshifts, summon 2 wolves.',
  }),
  'forest-friends': makeAbility({
    id: 'forest-friends',
    label: 'Forest Friends',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: end of turn, heal self and all units Bonded to this unit for 20; whenever this unit shapeshifts, summon 2 wolves.',
  }),
  'scavengers-hunger': makeAbility({
    id: 'scavengers-hunger',
    label: "Scavenger's Hunger",
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: the first 3 times this unit kills a non-Fading enemy, consume the corpse and summon 1 wolf there.',
  }),
  'scavengers-hunger-2': makeAbility({
    id: 'scavengers-hunger-2',
    label: "Scavenger's Hunger",
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: the first 2 times this unit kills a non-Fading enemy, consume the corpse and summon 1 wolf there.',
  }),
  'sentinel-runes': makeAbility({
    id: 'sentinel-runes',
    label: 'Sentinel Runes',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: "Passive: the first time an enemy moves out of contact with this unit, summon 2 elementals at its new position; if unused, trigger on death instead.",
  }),
  'lightning-rods': makeAbility({
    id: 'lightning-rods',
    label: 'Lightning Rods',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: Blast deals +1 damage per allied elemental on the battlefield.',
  }),
  'summon-elemental-1': makeAbility({
    id: 'summon-elemental-1',
    label: 'Summon Elemental 1',
    trigger: { timing: 'startOfBattle' },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [summonEffect('elemental', 1)],
    shortText: 'Start of battle: summon 1 elemental on this unit or an adjacent hex.',
  }),
  anointed: makeAbility({
    id: 'anointed',
    label: 'Anointed',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: healing and positive stat gains affecting this unit are doubled.',
  }),
  'wages-of-virtue': makeAbility({
    id: 'wages-of-virtue',
    label: 'Wages of Virtue',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: redirect incoming attack damage to a touching ally if possible. When a touching ally is healed, this unit is also healed.',
  }),
  'throwing-axes': makeAbility({
    id: 'throwing-axes',
    label: 'Throwing Axes',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: "Passive: attacks deal extra damage equal to 10% of the target's current health before damage.",
  }),
  opening: makeAbility({
    id: 'opening',
    label: 'Opening',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: when this unit hits an enemy, allies touching the target also attack that enemy.',
  }),
  triumph: makeAbility({
    id: 'triumph',
    label: 'Triumphant Zeal',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: on kill, this unit and touching allies gain Zeal. Zeal grants +10% damage, +10% speed, and +10% max health.',
  }),
  'hunters-zeal': makeAbility({
    id: 'hunters-zeal',
    label: "Hunter's Zeal",
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: on kill, this Ranger and allies adjacent to the killed enemy gain Zeal. Zeal grants initiative at end of turn.',
  }),
  'martyrs-zeal': makeAbility({
    id: 'martyrs-zeal',
    label: "Martyr's Zeal",
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: when this Soldier dies, all allies gain Zeal. Zeal heals at end of turn.',
  }),
  'crippling-hex': makeAbility({
    id: 'crippling-hex',
    label: 'Crippling Hex',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: enemies who kill this Militia gain Hex. Hex reduces enemy speed.',
  }),
  'vulnerability-hex': makeAbility({
    id: 'vulnerability-hex',
    label: 'Vulnerability Hex',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: if a Wizard is present, enemies damaged by Blast can gain Hex. Hex makes enemies take more Blast damage.',
  }),
  'crack-exploits': makeAbility({
    id: 'crack-exploits',
    label: 'Crack Exploits',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: when an enemy loses armor, each allied Elementalist makes a normal attack against them ignoring range.',
  }),
  'elemental-sunder-1': makeAbility({
    id: 'elemental-sunder-1',
    label: 'Elemental Sunder',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: allied elementals remove 1 armor on attack.',
  }),
  sunder: makeAbility({
    id: 'sunder',
    label: 'Sunder',
    trigger: { timing: 'onAttack' },
    duration: battleDuration(),
    target: { mode: 'default' },
    effects: [statDeltaEffect('armor', -20, 'flat')],
    shortText: 'On attack: remove 20 armor from the target.',
  }),
  saintbane: makeAbility({
    id: 'saintbane',
    label: 'Saintbane',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: when an enemy heals or gains stats, raise adjacent corpses as Skeletons.',
  }),
  'holy-constructs': makeAbility({
    id: 'holy-constructs',
    label: 'Holy Constructs',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: while a Priest is present, the first time each non-Fading ally is healed, summon an Elemental adjacent to them. Elementals heal adjacent allies on death.',
  }),
  'final-hex': makeAbility({
    id: 'final-hex',
    label: 'Final Hex',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: 'Passive: attacks apply Hexed. Attacking an enemy with 5 Hexed stacks kills it.',
  }),
  'thrill-of-the-hunt': makeAbility({
    id: 'thrill-of-the-hunt',
    label: 'Thrill of the Hunt',
    trigger: { timing: 'passive' },
    duration: instantDuration(),
    effects: [],
    shortText: "Passive: when this side's wolf kills, summon 1 Wolf and all allied units gain +1 damage for the battle.",
  }),
};

export const UNIT_CLASSES: Record<UnitClassId, UnitClassDefinition> = {
  soldier: {
    id: 'soldier',
    label: 'Soldier',
    role: 'frontline',
    unitClassTag: 'soldier',
    attributes: ['melee'],
    stats: { health: 100, damage: 10, speed: 10, move: 3, range: 0, armor: 2, size: 2, capacity: 2 },
    quantity: 1,
    cost: 24,
    abilityIds: [],
  },
  champion: {
    id: 'champion',
    label: 'Champion',
    role: 'frontline',
    unitClassTag: 'champion',
    attributes: ['melee'],
    stats: { health: 130, damage: 20, speed: 17, move: 3, range: 0, armor: 0, size: 3, capacity: 1 },
    quantity: 1,
    cost: 60,
    abilityIds: ['valor-20'],
  },
  avenger: {
    id: 'avenger',
    label: 'Avenger',
    role: 'frontline',
    unitClassTag: 'avenger',
    attributes: ['melee'],
    stats: { health: 200, damage: 6, speed: 10, move: 2, range: 0, armor: 0, size: 3, capacity: 1 },
    quantity: 1,
    cost: 40,
    abilityIds: ['vengeance-3'],
  },
  beastmaster: {
    id: 'beastmaster',
    label: 'Beastmaster',
    role: 'frontline',
    unitClassTag: 'beastmaster',
    attributes: ['melee', 'summoner'],
    stats: { health: 90, damage: 8, speed: 8, move: 3, range: 0, armor: 0, size: 3, capacity: 1 },
    quantity: 1,
    cost: 60,
    abilityIds: ['summon-wolf-2'],
  },
  druid: {
    id: 'druid',
    label: 'Druid',
    role: 'backline',
    unitClassTag: 'druid',
    attributes: ['caster'],
    stats: { health: 25, damage: 11, speed: 8, move: 3, range: 5, armor: 0, size: 2, capacity: 0 },
    quantity: 1,
    cost: 30,
    abilityIds: ['shapeshift-bear'],
  },
  elemental: {
    id: 'elemental',
    label: 'Elemental',
    role: 'frontline',
    unitClassTag: 'elemental',
    attributes: ['melee', 'summoned'],
    stats: { health: 60, damage: 13, speed: 7, move: 2, range: 0, armor: 5, size: 2, capacity: 3 },
    quantity: 1,
    cost: 20,
    abilityIds: [],
  },
  elementalist: {
    id: 'elementalist',
    label: 'Elementalist',
    role: 'backline',
    unitClassTag: 'elementalist',
    attributes: ['caster', 'summoner'],
    stats: { health: 25, damage: 10, speed: 9, move: 3, range: 5, armor: 0, size: 2, capacity: 0 },
    quantity: 1,
    cost: 30,
    abilityIds: ['charge-4-summon-elemental'],
  },
  knight: {
    id: 'knight',
    label: 'Knight',
    role: 'frontline',
    unitClassTag: 'knight',
    attributes: ['melee'],
    stats: { health: 200, damage: 16, speed: 7, move: 2, range: 0, armor: 10, size: 3, capacity: 5 },
    quantity: 1,
    cost: 60,
    abilityIds: ['taunt'],
  },
  militia: {
    id: 'militia',
    label: 'Militia',
    role: 'pusher',
    unitClassTag: 'militia',
    attributes: ['melee', 'expendable'],
    stats: { health: 40, damage: 8, speed: 11, move: 4, range: 0, armor: 0, size: 2, capacity: 1 },
    quantity: 1,
    cost: 10,
    abilityIds: [],
  },
  archer: {
    id: 'archer',
    label: 'Archer',
    role: 'backline',
    unitClassTag: 'archer',
    attributes: ['ranged'],
    stats: { health: 30, damage: 11, speed: 11, move: 3, range: 5, armor: 0, size: 2, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: [],
  },
  wizard: {
    id: 'wizard',
    label: 'Wizard',
    role: 'backline',
    unitClassTag: 'wizard',
    attributes: ['caster'],
    stats: { health: 20, damage: 9, speed: 8, move: 3, range: 5, armor: 0, size: 2, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: ['blast-5'],
  },
  priest: {
    id: 'priest',
    label: 'Priest',
    role: 'backline',
    unitClassTag: 'priest',
    attributes: ['caster'],
    stats: { health: 25, damage: 7, speed: 8, move: 3, range: 5, armor: 0, size: 2, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: ['mend-4'],
  },
  ranger: {
    id: 'ranger',
    label: 'Ranger',
    role: 'backline',
    unitClassTag: 'ranger',
    attributes: ['ranged'],
    stats: { health: 50, damage: 16, speed: 13, move: 4, range: 7, armor: 0, size: 2, capacity: 0 },
    quantity: 1,
    cost: 60,
    abilityIds: ['self-haste-2'],
  },
  necromancer: {
    id: 'necromancer',
    label: 'Necromancer',
    role: 'backline',
    unitClassTag: 'necromancer',
    attributes: ['caster', 'summoner'],
    stats: { health: 40, damage: 16, speed: 8, move: 3, range: 5, armor: 0, size: 2, capacity: 0 },
    quantity: 1,
    cost: 40,
    abilityIds: ['corpse-summon-skeleton'],
  },
  skeleton: {
    id: 'skeleton',
    label: 'Skeleton',
    role: 'pusher',
    unitClassTag: 'skeleton',
    attributes: ['melee', 'summoned'],
    stats: { health: 40, damage: 13, speed: 7, move: 3, range: 0, armor: 0, size: 2, capacity: 1 },
    quantity: 1,
    cost: 20,
    abilityIds: ['bonded', 'fading'],
  },
  shaman: {
    id: 'shaman',
    label: 'Shaman',
    role: 'backline',
    unitClassTag: 'shaman',
    attributes: ['caster'],
    stats: { health: 20, damage: 11, speed: 8, move: 3, range: 5, armor: 0, size: 2, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: ['enhance-1'],
  },
  wolf: {
    id: 'wolf',
    label: 'Wolf',
    role: 'pusher',
    unitClassTag: 'wolf',
    attributes: ['melee', 'summoned'],
    stats: { health: 70, damage: 6, speed: 12, move: 4, range: 0, armor: 0, size: 2, capacity: 1 },
    quantity: 1,
    cost: 20,
    abilityIds: ['bonded', 'pack-1'],
  },
};

export const RACES: Record<RaceId, RaceDefinition> = {
  human: {
    id: 'human',
    label: 'Humans',
    singularLabel: 'Human',
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
    addedAttributes: ['elf'],
    statAdjustments: {
      health: { multiplier: 0.9 },
      damage: { multiplier: 1.1 },
      speed: { multiplier: 1.2 },
      move: { flat: 1 },
    },
    abilityIds: [],
  },
  goblin: {
    id: 'goblin',
    label: 'Goblins',
    singularLabel: 'Goblin',
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
  dwarf: {
    id: 'dwarf',
    label: 'Dwarves',
    singularLabel: 'Dwarven',
    addedAttributes: ['dwarf'],
    statAdjustments: {
      health: { multiplier: 1.2 },
      speed: { multiplier: 0.9 },
      move: { flat: -1 },
      armor: { flat: 3 },
      capacity: { flat: 1 },
    },
    abilityIds: [],
  },
  orc: {
    id: 'orc',
    label: 'Orcs',
    singularLabel: 'Orc',
    addedAttributes: ['orc'],
    statAdjustments: {
      health: { multiplier: 1.1 },
      damage: { multiplier: 1.1 },
      speed: { multiplier: 1.1 },
      range: { flat: -2 },
      armor: { flat: -1 },
      size: { flat: 1 },
      capacity: { flat: -1 },
    },
    abilityIds: ['frenzy-ramp-1'],
  },
  fae: {
    id: 'fae',
    label: 'Fae',
    singularLabel: 'Fae',
    addedAttributes: ['fae'],
    statAdjustments: {
      health: { multiplier: 0.8 },
      speed: { multiplier: 1.1 },
      armor: { flat: -3 },
      size: { flat: -1 },
    },
    abilityIds: ['summon-wolf-1'],
  },
};

export const RACE_UPGRADES: Record<string, RaceUpgradeDefinition> = {
  'human-combined-arms': {
    id: 'human-combined-arms',
    raceId: 'human',
    label: 'Combined Arms',
    tier: 2,
    description: 'Start of battle: each human unit gains +20% health, +20% damage, and +20% speed for each other friendly troop on its side.',
    effects: [{ kind: 'addAbility', abilityId: 'combined-arms-20' }],
  },
  'human-tubthumping': {
    id: 'human-tubthumping',
    raceId: 'human',
    label: 'Tubthumping',
    tier: 1,
    description: 'Overworld: human troops may enter the same Rift together. Effects that would reduce a Human unit speed or damage instead increase it by 1.',
    effects: [{ kind: 'addAbility', abilityId: 'united' }, { kind: 'addAbility', abilityId: 'tubthumping' }],
  },
  'elf-feline-grace': {
    id: 'elf-feline-grace',
    raceId: 'elf',
    label: 'Feline Grace',
    tier: 1,
    description: 'All non-melee elven troops gain +2 range. The first time each battle an engaged elven backline unit retreats 1 hex for free.',
    effects: [{ kind: 'modifyStats', unitFilter: 'nonMelee', statModifiers: { range: { flat: 2 } } }, { kind: 'addAbility', abilityId: 'fade-into-shadow' }],
  },
  'elven-forsaken': {
    id: 'elven-forsaken',
    raceId: 'elf',
    label: 'Forsaken',
    tier: 3,
    description: 'Start of battle: if an elven unit is the only troop on its side, it gains +80% health, +80% damage, and +80% speed.',
    effects: [{ kind: 'addAbility', abilityId: 'forsaken-80' }],
  },
  'elf-silvershot-doctrine': {
    id: 'elf-silvershot-doctrine',
    raceId: 'elf',
    label: 'Silvershot Doctrine',
    tier: 2,
    description: 'Elven ranged and caster attacks gain +1 damage and +2 initiative per hex of distance to the target. Attacks made from max range make the target lose 30 initiative.',
    effects: [{ kind: 'addAbility', abilityId: 'silver-distance' }, { kind: 'addAbility', abilityId: 'long-shot-doctrine' }],
  },
  'goblin-behavior': {
    id: 'goblin-behavior',
    raceId: 'goblin',
    label: 'Gallowsworn',
    tier: 1,
    description: 'On death: each goblin unit makes 1 extra strike against a random enemy touching it. When a goblin gets a kill, all enemies lose 10 initiative.',
    effects: [{ kind: 'addAbility', abilityId: 'goblin-farewell' }, { kind: 'addAbility', abilityId: 'snatch-the-moment' }],
  },
  'goblin-pack': {
    id: 'goblin-pack',
    raceId: 'goblin',
    label: 'Horde',
    tier: 2,
    description: 'Start of turn: each goblin unit gains +4 damage per other friendly unit touching it until end of turn.',
    effects: [{ kind: 'addAbility', abilityId: 'horde-4' }],
  },
  'goblin-overwhelm-hex': {
    id: 'goblin-overwhelm-hex',
    raceId: 'goblin',
    label: 'Overwhelm Hex',
    tier: 1,
    description: 'When a Goblin is present, a random unit from each enemy troop gains 1 stack of Hex at the start of the battle. Enemies lose health equal to the number of your living Goblins per stack of Hex they have at the end of their turn.',
    effects: [{ kind: 'addAbility', abilityId: 'overwhelm-hex' }],
  },
  'troll-gargantuan-zeal': {
    id: 'troll-gargantuan-zeal',
    raceId: 'troll',
    label: 'Gargantuan Zeal',
    tier: 1,
    description: 'When a Troll is present, a random unit from each allied troop gains 1 stack of Zeal at the start of the battle. Allies gain damage equal to 5x their size for each stack of Zeal they have.',
    effects: [{ kind: 'addAbility', abilityId: 'gargantuan-zeal' }],
  },
  'troll-mossblood': {
    id: 'troll-mossblood',
    raceId: 'troll',
    label: 'Mossblood',
    tier: 2,
    description: 'After taking damage, each troll unit gains +1 damage for the rest of the battle. The first time each troll would die in a battle, it survives at 25 HP and loses Regen for the rest of that battle.',
    effects: [{ kind: 'addAbility', abilityId: 'stoneblood' }, { kind: 'addAbility', abilityId: 'frenzy-ramp-1' }],
  },
  'troll-rowdy-regrowth': {
    id: 'troll-rowdy-regrowth',
    raceId: 'troll',
    label: 'Rowdy Regrowth',
    tier: 2,
    description: 'Whenever a Troll regains health, it gains 20 initiative and +1 damage.',
    effects: [{ kind: 'addAbility', abilityId: 'rowdy-regrowth' }],
  },
  'human-hold-the-standard': {
    id: 'human-hold-the-standard',
    raceId: 'human',
    label: 'Hold the Standard',
    tier: 2,
    description: 'Whenever a non-Fading ally dies, each Human unit heals 15.',
    effects: [{ kind: 'addAbility', abilityId: 'hold-the-standard' }],
  },
  'dwarf-diggy-hole': {
    id: 'dwarf-diggy-hole',
    raceId: 'dwarf',
    label: 'Diggy Hole',
    tier: 1,
    description: 'Dwarven units do not spawn at battle start. After 10 beats, they spawn on the enemy side of the board with 100 initiative.',
    effects: [{ kind: 'addAbility', abilityId: 'diggy-hole' }],
  },
  'dwarf-ale-and-hearty': {
    id: 'dwarf-ale-and-hearty',
    raceId: 'dwarf',
    label: 'Ale and Hearty',
    tier: 2,
    description: 'Dwarven troops gain +60% speed. One random unit from each Dwarven troop has its speed set to 1 at the start of combat.',
    effects: [
      { kind: 'modifyStats', statModifiers: { speed: { multiplier: 1.6 } } },
      { kind: 'addAbility', abilityId: 'ale-and-hearty' },
    ],
  },
  'dwarf-stall-warts': {
    id: 'dwarf-stall-warts',
    raceId: 'dwarf',
    label: 'Stall Warts',
    tier: 3,
    description: 'Dwarven troops gain +1 armor and lose 1 speed for the rest of the battle after they are hit by normal attacks.',
    effects: [{ kind: 'addAbility', abilityId: 'stall-warts' }],
  },
  'orc-seeing-red': {
    id: 'orc-seeing-red',
    raceId: 'orc',
    label: 'Seeing Red',
    tier: 1,
    description: 'Whenever an Orc unit kills an enemy unit, it loses 1 armor for the battle and gains 75 initiative.',
    effects: [{ kind: 'addAbility', abilityId: 'seeing-red' }],
  },
  'orc-first-blood': {
    id: 'orc-first-blood',
    raceId: 'orc',
    label: 'First Blood',
    tier: 2,
    description: 'Orc units attack their target whenever they engage, in addition to the normal engagement attack.',
    effects: [{ kind: 'addAbility', abilityId: 'first-blood' }],
  },
  'orc-berserk': {
    id: 'orc-berserk',
    raceId: 'orc',
    label: 'Berserk',
    tier: 3,
    description: 'When an Orc unit would die from damage, its initiative is set to 0, it stops taking damage, and it dies at the end of its next turn.',
    effects: [{ kind: 'addAbility', abilityId: 'berserk' }],
  },
  'fae-glamour': {
    id: 'fae-glamour',
    raceId: 'fae',
    label: 'Glamour',
    tier: 2,
    description: 'Once per battle per Fae unit, redirect an incoming normal attack to a random enemy in range as if the Fae unit made that attack.',
    effects: [{ kind: 'addAbility', abilityId: 'glamour' }],
  },
  'fae-changeling': {
    id: 'fae-changeling',
    raceId: 'fae',
    label: 'Changeling',
    tier: 3,
    description: 'If a Fae troop was brought to battle, after beat 12 a random enemy unit from each enemy troop changes sides.',
    effects: [{ kind: 'addAbility', abilityId: 'changeling' }],
  },
  'fae-whimsy': {
    id: 'fae-whimsy',
    raceId: 'fae',
    label: 'Whimsy',
    tier: 3,
    description: 'Whenever a Fae unit takes damage, it is relocated to a random hex.',
    effects: [{ kind: 'addAbility', abilityId: 'whimsy' }],
  },
};

export const TROOP_CLASS_UPGRADES: Record<string, TroopClassUpgradeDefinition> = {
  'soldier-shield-drill': {
    id: 'soldier-shield-drill',
    unitClassId: 'soldier',
    label: 'Shield Drill',
    tier: 3,
    description: 'Soldiers have -4 armor, but each ranged attack can deal at most 1 damage to a Soldier after all modifiers.',
    effects: [{ kind: 'modifyStats', statModifiers: { armor: { flat: -4 } } }, { kind: 'addAbility', abilityId: 'shield-drill' }],
  },
  'soldier-dreamwork': {
    id: 'soldier-dreamwork',
    unitClassId: 'soldier',
    label: 'Dreamwork',
    tier: 3,
    description: "Whenever an enemy adjacent to a Soldier is hit by another ally's normal attack, that Soldier makes a normal attack against it. Each Soldier can trigger at most once per beat.",
    effects: [{ kind: 'addAbility', abilityId: 'dreamwork' }],
  },
  'soldier-martyrs-zeal': {
    id: 'soldier-martyrs-zeal',
    unitClassId: 'soldier',
    label: "Martyr's Zeal",
    tier: 3,
    description: 'When a Soldier dies, all allies gain a stack of Zeal. Allies heal 5 health for each stack of Zeal they have at the end of their turns.',
    effects: [{ kind: 'addAbility', abilityId: 'martyrs-zeal' }],
  },
  'archer-crippling-shots': {
    id: 'archer-crippling-shots',
    unitClassId: 'archer',
    label: 'Crippling Shots',
    tier: 3,
    description: 'On attack: each Archer reduces its target armor by 1 and speed by 1 for the rest of the battle.',
    effects: [{ kind: 'addAbility', abilityId: 'shredding-arrows' }, { kind: 'addAbility', abilityId: 'pinning-volley' }],
  },
  'archer-barrage': {
    id: 'archer-barrage',
    unitClassId: 'archer',
    label: 'Barrage',
    tier: 3,
    description: "Archers shoot all enemies within their attack range when they aren't engaged in melee, but their attacks deal 40% less damage.",
    effects: [{ kind: 'addAbility', abilityId: 'barrage' }],
  },
  'archer-hexing-shots': {
    id: 'archer-hexing-shots',
    unitClassId: 'archer',
    label: 'Hexing Shots',
    tier: 3,
    description: 'Archer attacks deal +1 damage per Hex stack on the target.',
    effects: [{ kind: 'addAbility', abilityId: 'hexing-shots' }],
  },
  'avenger-sevenfold': {
    id: 'avenger-sevenfold',
    unitClassId: 'avenger',
    label: 'Sevenfold',
    tier: 2,
    description: 'Whenever a nearby unit leaves a corpse, each Avenger may consume it to summon a skeleton there, up to 7 times per battle.',
    effects: [{ kind: 'addAbility', abilityId: 'uses-7-corpse-summon-skeleton' }],
  },
  'avenger-witness': {
    id: 'avenger-witness',
    unitClassId: 'avenger',
    label: 'Witness',
    tier: 3,
    description: 'When a nearby ally falls, set this Avenger initiative to 100. When a touching ally dies, it strikes the killer if still in contact.',
    effects: [{ kind: 'addAbility', abilityId: 'blood-oath' }, { kind: 'addAbility', abilityId: 'last-witness' }],
  },
  'avenger-wages-of-virtue': {
    id: 'avenger-wages-of-virtue',
    unitClassId: 'avenger',
    label: 'Wages of Virtue',
    tier: 3,
    description: 'Avengers redirect damage taken to a random adjacent ally if possible. Whenever an ally adjacent to an Avenger is healed, that Avenger is also healed.',
    effects: [{ kind: 'addAbility', abilityId: 'wages-of-virtue' }],
  },
  'beastmaster-throwing-axes': {
    id: 'beastmaster-throwing-axes',
    unitClassId: 'beastmaster',
    label: 'Throwing Axes',
    tier: 3,
    description: "Beastmasters gain 4 range. Their attacks deal additional damage equal to 10% of the enemy's current health.",
    effects: [
      { kind: 'removeAttribute', attribute: 'melee' },
      { kind: 'addAttribute', attribute: 'ranged' },
      { kind: 'setRole', role: 'backline' },
      { kind: 'modifyStats', statModifiers: { range: { flat: 4 } } },
      { kind: 'addAbility', abilityId: 'throwing-axes' },
    ],
  },
  'beastmaster-opening': {
    id: 'beastmaster-opening',
    unitClassId: 'beastmaster',
    label: 'Opening',
    tier: 3,
    description: 'When a Beastmaster hits an enemy, all allies adjacent to the target also attack that enemy.',
    effects: [{ kind: 'addAbility', abilityId: 'opening' }],
  },
  'beastmaster-thrill-of-the-hunt': {
    id: 'beastmaster-thrill-of-the-hunt',
    unitClassId: 'beastmaster',
    label: 'Thrill of the Hunt',
    tier: 3,
    description: 'Wolves summon 1 Wolf on each kill. Whenever any wolf gets a kill, all allies gain +1 damage for the battle.',
    effects: [{ kind: 'addAbility', abilityId: 'thrill-of-the-hunt' }],
  },
  'champion-anointed-executioner': {
    id: 'champion-anointed-executioner',
    unitClassId: 'champion',
    label: 'Anointed Executioner',
    tier: 3,
    description: 'Champions target the lowest-health enemy they are allowed to attack. Whenever a Champion is healed or gains positive stats, it gains twice as much.',
    effects: [{ kind: 'addAbility', abilityId: 'executioner' }, { kind: 'addAbility', abilityId: 'anointed' }],
  },
  'champion-honorable-duel': {
    id: 'champion-honorable-duel',
    unitClassId: 'champion',
    label: 'Honorable Duel',
    tier: 3,
    description: "Champions cannot be targeted with normal attacks by enemies they aren't engaged with.",
    effects: [{ kind: 'addAbility', abilityId: 'honorable-duel' }],
  },
  'champion-triumph': {
    id: 'champion-triumph',
    unitClassId: 'champion',
    label: 'Triumphant Zeal',
    tier: 3,
    description: 'On kill, Champions and touching allies gain a stack of Zeal. Allies gain +10% damage, +10% speed, and +10% max health for each stack of Zeal they have.',
    effects: [{ kind: 'addAbility', abilityId: 'triumph' }],
  },
  'knight-dine-in-hell': {
    id: 'knight-dine-in-hell',
    unitClassId: 'knight',
    label: 'Dine in Hell',
    tier: 3,
    description: 'Start of turn: if a Knight is engaged at full capacity, it gains +5 armor until next turn. Whenever a Knight is hit by a normal attack while engaged at full capacity, it makes 1 normal attack back.',
    effects: [{ kind: 'addAbility', abilityId: 'brace' }, { kind: 'addAbility', abilityId: 'retaliate' }],
  },
  'knight-sentinel-runes': {
    id: 'knight-sentinel-runes',
    unitClassId: 'knight',
    label: 'Sentinel Runes',
    tier: 3,
    description: "The first time an enemy moves out of contact with a Knight, summon 2 elementals at that unit's new position; they immediately engage and attack that unit. If unused, this also triggers on death against the killer.",
    effects: [{ kind: 'addAbility', abilityId: 'sentinel-runes' }],
  },
  'knight-sunder': {
    id: 'knight-sunder',
    unitClassId: 'knight',
    label: 'Sunder',
    tier: 3,
    description: 'Knights remove 20 armor on attack.',
    effects: [{ kind: 'addAbility', abilityId: 'sunder' }],
  },
  'druid-forest-friends': {
    id: 'druid-forest-friends',
    unitClassId: 'druid',
    label: 'Forest Friends',
    tier: 3,
    description: 'End of turn: each Druid heals itself and all units Bonded to that specific Druid for 20. Whenever a Druid shapeshifts, it summons 2 wolves.',
    effects: [{ kind: 'addAbility', abilityId: 'forest-friends' }],
  },
  'druid-true-form': {
    id: 'druid-true-form',
    unitClassId: 'druid',
    label: 'True Form',
    tier: 2,
    description: "Druid's Shapeshift can now trigger an additional time.",
    effects: [{ kind: 'replaceAbility', removeAbilityId: 'shapeshift-bear', addAbilityId: 'shapeshift-bear-2' }],
  },
  'druid-ents-visage': {
    id: 'druid-ents-visage',
    unitClassId: 'druid',
    label: "Ent's Visage",
    tier: 3,
    description: 'After shapeshifting, attackers take 6 damage whenever they hit the Druid with a normal attack. Each time a Druid shapeshifts, its melee attacks gain an additional battle-long -2 speed debuff on hit.',
    effects: [{ kind: 'addAbility', abilityId: 'thornhide' }, { kind: 'addAbility', abilityId: 'bramble-snare' }],
  },
  'elementalist-crackling-mitosis': {
    id: 'elementalist-crackling-mitosis',
    unitClassId: 'elementalist',
    label: 'Crackling Mitosis',
    tier: 3,
    description: "When an allied elemental dies, blast enemies within 2 hexes of its occupied hexes for 8. Elementals summoned by Elementalists can repeat that summon once after 4 turns.",
    effects: [{ kind: 'addAbility', abilityId: 'arc-conductor' }, { kind: 'replaceAbility', removeAbilityId: 'charge-4-summon-elemental', addAbilityId: 'charge-4-summon-elemental-mitosis' }],
  },
  'elementalist-living-circuit': {
    id: 'elementalist-living-circuit',
    unitClassId: 'elementalist',
    label: 'Living Circuit',
    tier: 3,
    description: 'End of turn: if any allied elemental is in range, this Elementalist gains 15 initiative once and all allied elementals in range gain 15 initiative.',
    effects: [{ kind: 'addAbility', abilityId: 'living-circuit' }],
  },
  'elementalist-crack-exploits': {
    id: 'elementalist-crack-exploits',
    unitClassId: 'elementalist',
    label: 'Crack Exploits',
    tier: 3,
    description: 'Elementalists lose 5 damage. Whenever an enemy loses armor, each Elementalist makes a normal attack against them ignoring range. Allied elementals remove 1 armor on attack.',
    effects: [{ kind: 'modifyStats', statModifiers: { damage: { flat: -5 } } }, { kind: 'addAbility', abilityId: 'crack-exploits' }, { kind: 'addAbility', abilityId: 'elemental-sunder-1' }],
  },
  'militia-rat-behavior': {
    id: 'militia-rat-behavior',
    unitClassId: 'militia',
    label: 'R-selected',
    tier: 3,
    description: 'Start of turn: Militia gain +10 initiative for each other Militia touching them. Overworld: multiple Militia troops may enter the same Rift together.',
    effects: [{ kind: 'addAbility', abilityId: 'rabble-rush' }],
  },
  'militia-dogpile': {
    id: 'militia-dogpile',
    unitClassId: 'militia',
    label: 'Dogpile',
    tier: 3,
    description: 'When Militia attack an enemy engaged by at least 3 allies, they strike 1 extra time.',
    effects: [{ kind: 'addAbility', abilityId: 'dogpile' }],
  },
  'militia-crippling-hex': {
    id: 'militia-crippling-hex',
    unitClassId: 'militia',
    label: 'Crippling Hex',
    tier: 3,
    description: 'Enemies who kill Militia gain 1 stack of Hex. Enemies get -30% speed for each stack of Hex.',
    effects: [{ kind: 'addAbility', abilityId: 'crippling-hex' }],
  },
  'necromancer-hemomancy': {
    id: 'necromancer-hemomancy',
    unitClassId: 'necromancer',
    label: 'Hemomancy',
    tier: 3,
    description: 'Necromancers may spend 10 health instead of requiring or consuming a corpse for corpse-consuming abilities, as long as that would not kill them. Allied summoned Skeletons heal allies on their own hex for 7 at the end of each turn.',
    effects: [{ kind: 'addAbility', abilityId: 'alternate-fuel-10' }, { kind: 'replaceAbility', removeAbilityId: 'corpse-summon-skeleton', addAbilityId: 'corpse-summon-skeleton-rising' }],
  },
  'necromancer-explosion-corpse': {
    id: 'necromancer-explosion-corpse',
    unitClassId: 'necromancer',
    label: 'Explosion Corpse',
    tier: 3,
    description: 'Skeletons summoned by Necromancers spawn with +100 initiative. Whenever this Necromancer consumes a corpse, enemies adjacent to that corpse lose 1 armor and 1 damage for the battle.',
    effects: [{ kind: 'addAbility', abilityId: 'early-riser' }, { kind: 'addAbility', abilityId: 'carrion-choir' }],
  },
  'necromancer-saintbane': {
    id: 'necromancer-saintbane',
    unitClassId: 'necromancer',
    label: 'Saintbane',
    tier: 3,
    description: 'Whenever an enemy gains stats or heals, all corpses adjacent to them are raised as Skeletons as though an allied Necromancer had summoned them.',
    effects: [{ kind: 'addAbility', abilityId: 'saintbane' }],
  },
  'priest-bolstering-light': {
    id: 'priest-bolstering-light',
    unitClassId: 'priest',
    label: 'Bolstering Light',
    tier: 3,
    description: 'When a Priest heal brings its target to full HP, that target and the Priest gain +1 speed and +1 damage for the battle. Otherwise, that target and the Priest gain 40 initiative.',
    effects: [{ kind: 'addAbility', abilityId: 'bolstering-light' }],
  },
  'priest-mercy-before-dawn': {
    id: 'priest-mercy-before-dawn',
    unitClassId: 'priest',
    label: 'Mercy Before Dawn',
    tier: 3,
    description: "The first time each battle each allied unit within this Priest's range would die, it survives at 1 HP. Whenever a Priest heals an ally, the heal repeats on all allies in range under 10% health.",
    effects: [{ kind: 'addAbility', abilityId: 'mercy-before-dawn' }],
  },
  'priest-holy-constructs': {
    id: 'priest-holy-constructs',
    unitClassId: 'priest',
    label: 'Holy Constructs',
    tier: 3,
    description: 'While a Priest is present in a battle: the first time each non-Fading ally is healed, an Elemental is summoned adjacent to them. Elementals now heal adjacent allies by 20 on death.',
    effects: [{ kind: 'addAbility', abilityId: 'holy-constructs' }],
  },
  'ranger-on-the-hunt': {
    id: 'ranger-on-the-hunt',
    unitClassId: 'ranger',
    label: 'On the Hunt',
    tier: 3,
    description: 'On attack: each Ranger sets its target initiative to 0. The first 2 times a Ranger kills a non-Fading enemy, consume the corpse and summon 1 wolf there.',
    effects: [{ kind: 'addAbility', abilityId: 'concussive-shots' }, { kind: 'addAbility', abilityId: 'scavengers-hunger-2' }],
  },
  'ranger-shadows-embrace': {
    id: 'ranger-shadows-embrace',
    unitClassId: 'ranger',
    label: "Shadow's Embrace",
    tier: 3,
    description: 'After attacking, Rangers move to the safest hex that still keeps an enemy in range. Ranger attacks against unengaged targets deal double damage.',
    effects: [{ kind: 'addAbility', abilityId: 'skirmishers-step' }, { kind: 'addAbility', abilityId: 'heartseeker' }],
  },
  'ranger-hunters-zeal': {
    id: 'ranger-hunters-zeal',
    unitClassId: 'ranger',
    label: "Hunter's Zeal",
    tier: 3,
    description: 'On kill, Rangers and allies adjacent to the killed enemy gain a stack of Zeal. Allies gain 5 initiative for each stack of Zeal they have at the end of their turns.',
    effects: [{ kind: 'addAbility', abilityId: 'hunters-zeal' }],
  },
  'shaman-grave-vigor': {
    id: 'shaman-grave-vigor',
    unitClassId: 'shaman',
    label: 'Grave Vigor',
    tier: 3,
    description: 'Whenever a Shaman applies a beneficial effect, that target leaves no corpse on death and summons 1 skeleton on death, gains 1 extra strike on its next normal attack if the effect was Enhance, and then ignores future beneficial effects and targeting from units with Grave Vigor.',
    effects: [{ kind: 'addAbility', abilityId: 'serve-once-more' }, { kind: 'addAbility', abilityId: 'static-charge' }, { kind: 'addAbility', abilityId: 'grave-vigor' }],
  },
  'shaman-war-drums': {
    id: 'shaman-war-drums',
    unitClassId: 'shaman',
    label: 'War Drums',
    tier: 2,
    description: 'Enhance 1 affects all allies on the chosen ally hex instead of one random ally.',
    effects: [{ kind: 'replaceAbility', removeAbilityId: 'enhance-1', addAbilityId: 'war-drums' }],
  },
  'shaman-final-hex': {
    id: 'shaman-final-hex',
    unitClassId: 'shaman',
    label: 'Final Hex',
    tier: 3,
    description: 'Shamans apply 1 stack of Hexed to enemies they attack. When attacking an enemy with 5 stacks of Hexed, Shamans kill that enemy.',
    effects: [{ kind: 'addAbility', abilityId: 'final-hex' }],
  },
  'wizard-storm-rods': {
    id: 'wizard-storm-rods',
    unitClassId: 'wizard',
    label: 'Storm Rods',
    tier: 3,
    description: 'Every 4 turns, each Wizard makes 2 extra strikes against a random enemy within its range. Wizard Blasts deal +1 damage per allied elemental on the battlefield, and Wizards summon 1 elemental at the start of battle.',
    effects: [{ kind: 'addAbility', abilityId: 'charge-4-random-enemy-r-strike-4' }, { kind: 'addAbility', abilityId: 'lightning-rods' }, { kind: 'addAbility', abilityId: 'summon-elemental-1' }],
  },
  'wizard-spell-echo': {
    id: 'wizard-spell-echo',
    unitClassId: 'wizard',
    label: 'Spell Echo',
    tier: 2,
    description: "Each time this Wizard's Blast hits enemies, repeat that Blast from every enemy hit by that Blast or its echoes, but no enemy can be hit more than once per Blast chain.",
    effects: [{ kind: 'addAbility', abilityId: 'spell-echo' }],
  },
  'wizard-vulnerability-hex': {
    id: 'wizard-vulnerability-hex',
    unitClassId: 'wizard',
    label: 'Vulnerability Hex',
    tier: 3,
    description: 'If a Wizard is present in a battle, enemies damaged by Blast have a 20% chance of gaining a stack of Hex. Each enemy takes an additional 100% damage from Blast for each stack of Hex they have.',
    effects: [{ kind: 'addAbility', abilityId: 'vulnerability-hex' }],
  },
};

export const MUTATORS: Record<string, MutatorDefinition> = {
  momentum: {
    id: 'momentum',
    label: 'Momentum',
    description: 'All units gain +10 initiative every beat.',
    initiativeBonusPerBeat: 10,
  },
  haze: {
    id: 'haze',
    label: 'Haze',
    description: 'All units lose 5 initiative every beat.',
    initiativeBonusPerBeat: -5,
  },
  'heavy-air': {
    id: 'heavy-air',
    label: 'Heavy Air',
    description: 'Ranged attack damage is reduced by 50%.',
    rangedDamageMultiplier: 0.5,
  },
  corrosion: {
    id: 'corrosion',
    label: 'Corrosion',
    description: 'All units start with 0 armor and cannot have positive armor.',
    armorCap: 0,
  },
  quakes: {
    id: 'quakes',
    label: 'Quakes',
    description: 'Every 10 beats, each unit is moved to a random adjacent hex if one fits.',
    randomMoveEveryBeats: 10,
  },
  decay: {
    id: 'decay',
    label: 'Decay',
    description: 'Every beat, each unit loses 1 HP ignoring armor.',
    hpLossPerBeat: 1,
  },
};

const LEGACY_TROOP_CLASS_UPGRADE_IDS: Record<string, string> = {
  'archer-shredding-arrows': 'archer-crippling-shots',
  'archer-pinning-volley': 'archer-crippling-shots',
  'avenger-blood-oath': 'avenger-witness',
  'avenger-last-witness': 'avenger-witness',
  'champion-executioner': 'champion-anointed-executioner',
  'champion-anointed': 'champion-anointed-executioner',
  'knight-brace': 'knight-dine-in-hell',
  'knight-retaliate': 'knight-dine-in-hell',
  'druid-wild-growth': 'druid-forest-friends',
  'druid-thornhide': 'druid-ents-visage',
  'druid-bramble-snare': 'druid-ents-visage',
  'druid-wild-call': 'druid-forest-friends',
  'elementalist-arc-conductor': 'elementalist-crackling-mitosis',
  'elementalist-mitosis': 'elementalist-crackling-mitosis',
  'militia-rabble-rush': 'militia-rat-behavior',
  'necromancer-alternate-fuel': 'necromancer-hemomancy',
  'necromancer-rising-tide': 'necromancer-hemomancy',
  'necromancer-early-riser': 'necromancer-explosion-corpse',
  'necromancer-carrion-choir': 'necromancer-explosion-corpse',
  'priest-zeal': 'priest-bolstering-light',
  'priest-overflowing-grace': 'priest-bolstering-light',
  'ranger-concussive-shots': 'ranger-on-the-hunt',
  'ranger-scavengers-hunger': 'ranger-on-the-hunt',
  'ranger-skirmishers-step': 'ranger-shadows-embrace',
  'ranger-heartseeker': 'ranger-shadows-embrace',
  'shaman-serve-once-more': 'shaman-grave-vigor',
  'shaman-static-charge': 'shaman-grave-vigor',
  'wizard-storm': 'wizard-storm-rods',
  'wizard-lightning-rods': 'wizard-storm-rods',
};

const LEGACY_RACE_UPGRADE_IDS: Record<string, string> = {
  'elf-elven-reflexes': 'elf-feline-grace',
};

export function normalizeRaceUpgradeId(id: string): string {
  return LEGACY_RACE_UPGRADE_IDS[id] ?? id;
}

export function isKnownRaceUpgradeId(value: unknown): value is string {
  return typeof value === 'string' && (value in RACE_UPGRADES || value in LEGACY_RACE_UPGRADE_IDS);
}

function formatUnknownMutatorLabel(id: string): string {
  const normalized = id
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (!normalized) {
    return 'Unknown Mutator';
  }

  return normalized.replace(/\b\w/g, (match) => match.toUpperCase());
}

export function getAbility(id: AbilityId): AbilityDefinition {
  const ability = ABILITIES[id];
  if (!ability) {
    throw new Error(`Unknown ability ${id}`);
  }
  return ability;
}

export function getRace(id: RaceId): RaceDefinition {
  const race = RACES[id];
  if (!race) {
    throw new Error(`Unknown race ${id}`);
  }
  return race;
}

export function getUnitClass(id: UnitClassId): UnitClassDefinition {
  const unitClass = UNIT_CLASSES[id];
  if (!unitClass) {
    throw new Error(`Unknown unit class ${id}`);
  }
  return unitClass;
}

export function getRaceUpgrade(id: string): RaceUpgradeDefinition {
  const upgrade = RACE_UPGRADES[id] ?? RACE_UPGRADES[LEGACY_RACE_UPGRADE_IDS[id] ?? ''];
  if (!upgrade) {
    throw new Error(`Unknown race upgrade ${id}`);
  }
  return upgrade;
}

export function getTroopClassUpgrade(id: string): TroopClassUpgradeDefinition {
  const upgrade = TROOP_CLASS_UPGRADES[id] ?? TROOP_CLASS_UPGRADES[LEGACY_TROOP_CLASS_UPGRADE_IDS[id] ?? ''];
  if (!upgrade) {
    throw new Error(`Unknown troop-class upgrade ${id}`);
  }
  return upgrade;
}

export function isKnownTroopClassUpgradeId(value: unknown): value is string {
  return typeof value === 'string' && (value in TROOP_CLASS_UPGRADES || value in LEGACY_TROOP_CLASS_UPGRADE_IDS);
}

export function getMutator(id: string): MutatorDefinition {
  const mutator = MUTATORS[id];
  if (!mutator) {
    return {
      id,
      label: formatUnknownMutatorLabel(id),
      description: `Legacy or missing mutator "${id}". This save references a mutator that is no longer present in the current catalog, so its gameplay effect is ignored.`,
    };
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
  if (key === 'move') return fixedMax(value, 0);
  if (key === 'range') return fixedMax(value, 0);
  if (key === 'size') return fixedMax(value, 1);
  if (key === 'capacity') return fixedMax(value, 0);
  if (key === 'health') return fixedMax(value, 1);
  return fixed(value);
}

export function getTroopQuantityForCost(cost: number): number {
  return fixedMax(fixed(TROOP_UNIT_BUDGET / Math.max(cost, 1)), 1);
}

export function composeBaseTroopDefinition(raceId: RaceId, unitClassId: UnitClassId): TroopDefinition {
  const race = getRace(raceId);
  const unitClass = getUnitClass(unitClassId);
  const attributes = [...new Set([...unitClass.attributes, ...race.addedAttributes])];
  const stats = STAT_KEYS.reduce<UnitStats>(
    (result, key) => {
      if (key === 'range' && !canReceiveRangeAdjustment(attributes)) {
        result[key] = clampStat(key, unitClass.stats[key]);
        return result;
      }
      result[key] = clampStat(key, applyAdjustment(unitClass.stats[key], race.statAdjustments[key]));
      return result;
    },
    { health: 0, damage: 0, speed: 0, move: 0, range: 0, armor: 0, size: 0, capacity: 0 },
  );
  const cost = fixedMax(applyAdjustment(unitClass.cost, race.statAdjustments.cost), 1);
  const abilities = [...unitClass.abilityIds, ...race.abilityIds].map(getAbility);
  return {
    id: `${raceId}/${unitClassId}`,
    raceId,
    unitClassId,
    label: `${race.singularLabel} ${unitClass.label}`,
    role: unitClass.role,
    unitClassTag: unitClass.unitClassTag,
    attributes,
    stats,
    quantity: getTroopQuantityForCost(cost),
    cost,
    abilities,
  };
}

export function composeSummonedTroopDefinition(raceId: RaceId, unitClassId: UnitClassId): TroopDefinition {
  const unitClass = getUnitClass(unitClassId);
  return {
    id: `${raceId}/${unitClassId}`,
    raceId,
    unitClassId,
    label: unitClass.label,
    role: unitClass.role,
    unitClassTag: unitClass.unitClassTag,
    attributes: [...unitClass.attributes],
    stats: { ...unitClass.stats },
    quantity: unitClass.quantity,
    cost: unitClass.cost,
    abilities: unitClass.abilityIds.map(getAbility),
  };
}

export interface SummonedUnitPreview {
  sourceAbilityId: AbilityId;
  unitClassId: UnitClassId;
  count: number;
  consumesCorpse: boolean;
  initialInitiative?: number;
  grantedAbilityIds: AbilityId[];
  troop: TroopDefinition;
}

export function getSummonedUnitPreviews(ability: AbilityDefinition, summonerRaceId: RaceId): SummonedUnitPreview[] {
  return ability.effects
    .filter((effect): effect is Extract<AbilityEffectDefinition, { kind: 'summon' }> => effect.kind === 'summon')
    .map((effect) => {
      const troop = composeSummonedTroopDefinition(summonerRaceId, effect.unitClassId);
      const grantedAbilities = (effect.grantedAbilityIds ?? []).map(getAbility);
      const abilities = [...troop.abilities];
      grantedAbilities.forEach((grantedAbility) => {
        if (!abilities.some((abilityEntry) => abilityEntry.id === grantedAbility.id)) {
          abilities.push(grantedAbility);
        }
      });

      return {
        sourceAbilityId: ability.id,
        unitClassId: effect.unitClassId,
        count: effect.count,
        consumesCorpse: effect.consumeFallenUnitCorpse === true,
        initialInitiative: effect.initialInitiative,
        grantedAbilityIds: effect.grantedAbilityIds ? [...effect.grantedAbilityIds] : [],
        troop: {
          ...troop,
          abilities,
        },
      };
    });
}

export const TROOP_CATALOG = Object.values(RACES).reduce<Record<string, TroopDefinition>>((acc, race) => {
  Object.keys(UNIT_CLASSES).forEach((unitClassId) => {
    acc[`${race.id}/${unitClassId}`] = composeBaseTroopDefinition(race.id, unitClassId);
  });
  return acc;
}, {});

export const UNIT_CLASS_IDS = Object.keys(TROOP_CATALOG);
export const UNLOCKABLE_UNIT_CLASS_IDS = Object.values(UNIT_CLASSES)
  .filter((unitClass) => !unitClass.attributes.includes('summoned'))
  .map((unitClass) => unitClass.id);
export const ALL_TROOP_UNLOCK_IDS = Object.keys(RACES).flatMap((raceId) =>
  UNLOCKABLE_UNIT_CLASS_IDS.map((unitClassId) => getTroopUnlockId(raceId as RaceId, unitClassId)),
);
export const NATIVE_TROOP_UNIT_CLASS_IDS_BY_RACE: Record<RaceId, UnitClassId[]> = {
  human: ['soldier', 'archer', 'knight', 'priest', 'wizard'],
  elf: ['archer', 'ranger', 'druid', 'beastmaster', 'champion'],
  goblin: ['militia', 'soldier', 'shaman', 'necromancer', 'wizard'],
  troll: ['champion', 'avenger', 'priest', 'shaman', 'elementalist'],
  dwarf: ['soldier', 'knight', 'avenger', 'necromancer', 'elementalist'],
  orc: ['militia', 'soldier', 'champion', 'avenger', 'beastmaster'],
  fae: ['ranger', 'druid', 'shaman', 'wizard', 'elementalist'],
};
export const NATIVE_TROOP_UNLOCK_IDS_BY_RACE: Record<RaceId, string[]> = Object.fromEntries(
  (Object.keys(NATIVE_TROOP_UNIT_CLASS_IDS_BY_RACE) as RaceId[]).map((raceId) => [
    raceId,
    NATIVE_TROOP_UNIT_CLASS_IDS_BY_RACE[raceId].map((unitClassId) => getTroopUnlockId(raceId, unitClassId)),
  ]),
) as Record<RaceId, string[]>;
export const NATIVE_TROOP_UNLOCK_IDS = (Object.values(NATIVE_TROOP_UNLOCK_IDS_BY_RACE).flat() as string[]).sort((left, right) =>
  left.localeCompare(right),
);

export function getTroopDefinitionOrThrow(id: string): TroopDefinition {
  const troop = TROOP_CATALOG[id];
  if (!troop) {
    throw new Error(`Unknown troop ${id}`);
  }
  return troop;
}

export function composeTroopDefinition(raceId: RaceId, unitClassId: UnitClassId): TroopDefinition {
  return composeBaseTroopDefinition(raceId, unitClassId);
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

export function getBaseTroopCost(raceId: RaceId, unitClassId: UnitClassId): number {
  return composeBaseTroopDefinition(raceId, unitClassId).cost;
}

export function getTroopUnlockId(raceId: RaceId, unitClassId: UnitClassId): string {
  return `${raceId}/${unitClassId}`;
}

export function getRaceNativeTroopUnlockIds(raceId: RaceId): string[] {
  return [...NATIVE_TROOP_UNLOCK_IDS_BY_RACE[raceId]];
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
