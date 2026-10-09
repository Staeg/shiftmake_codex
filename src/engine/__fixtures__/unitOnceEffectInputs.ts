import { getAbility, getTroopDefinitionOrThrow } from '../unitCatalog';
import type { BattleInput, ResolvedCombatantDefinition, SideId } from '../types';

export const UNIT_ONCE_EFFECT_FIXTURES = ['stoneblood', 'mercy', 'mercy-budget', 'fade', 'glamour', 'summoned-stoneblood'] as const;
export type UnitOnceEffectFixture = typeof UNIT_ONCE_EFFECT_FIXTURES[number];

function combatant(troopId: string, side: SideId, quantity = 1): ResolvedCombatantDefinition {
  const troop = getTroopDefinitionOrThrow(troopId);
  return {
    combatantId: `once-${side}-${troopId}`, troopInstanceId: null,
    raceId: troop.raceId, unitClassId: troop.unitClassId, label: troop.label,
    side, role: troop.role, unitClassTag: troop.unitClassTag, attributes: [...troop.attributes],
    stats: {...troop.stats, health: 1, damage: 0, rate: 0, move: 0, range: 99, armor: 0, size: 1, capacity: 10},
    abilities: [], quantity, cost: troop.cost,
  };
}

export function unitOnceEffectInput(name: UnitOnceEffectFixture): BattleInput {
  const enemy = combatant(name === 'fade' ? 'human/soldier' : 'human/archer', 'enemy');
  enemy.stats = {...enemy.stats, health: 10_000, damage: 1000, rate: 100};
  let players: ResolvedCombatantDefinition[];
  if (name === 'stoneblood') {
    const troll = combatant('troll/soldier', 'player', 2);
    troll.abilities = [getAbility('stoneblood'), getAbility('regen-5')];
    players = [troll];
  } else if (name === 'mercy' || name === 'mercy-budget') {
    const priest = combatant('human/priest', 'player', name === 'mercy' ? 2 : 1);
    const mercy = getAbility('mercy-before-dawn');
    priest.abilities = [{...mercy, trigger: {...mercy.trigger, ...(name === 'mercy-budget' ? {maxUses: 1} : {})}}];
    players = [priest, combatant('human/militia', 'player', 2)];
  } else if (name === 'fade') {
    const elves = combatant('elf/archer', 'player', 2);
    elves.abilities = [getAbility('fade-into-shadow')];
    elves.stats = {...elves.stats, health: 10, move: 1};
    enemy.stats = {...enemy.stats, damage: 1, range: 0, move: 10};
    players = [elves];
  } else if (name === 'glamour') {
    const fae = combatant('fae/wizard', 'player', 2);
    fae.abilities = [getAbility('glamour')];
    fae.stats.health = 150;
    enemy.stats.damage = 50;
    players = [fae];
  } else {
    const summoner = combatant('human/wizard', 'player');
    summoner.stats.size = 2;
    summoner.abilities = [getAbility('stoneblood'), {
      id: 'once-reference-summon', label: 'Once Reference Summon', shortText: 'Summon two elementals with Stoneblood.',
      trigger: {timing: 'startOfBattle'}, target: {mode: 'self'},
      duration: {kind: 'instant'},
      effects: [{kind: 'summon', unitClassId: 'elemental', count: 2, grantedAbilityIds: ['stoneblood']}],
    }];
    players = [summoner];
  }
  return {seed: 49, riftId: null, tier: null, mutatorIds: [], playerCombatants: players, enemyCombatants: [enemy]};
}
