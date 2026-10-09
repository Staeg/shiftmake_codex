import { getAbility, getTroopDefinitionOrThrow } from '../src/engine/unitCatalog';
import type { BattleInput, ResolvedCombatantDefinition, SideId } from '../src/engine/types';

function combatant(troopId: string, side: SideId): ResolvedCombatantDefinition {
  const troop = getTroopDefinitionOrThrow(troopId);
  return {
    combatantId: `reference-${side}-${troopId}`,
    troopInstanceId: null,
    raceId: troop.raceId,
    unitClassId: troop.unitClassId,
    label: troop.label,
    side,
    role: troop.role,
    unitClassTag: troop.unitClassTag,
    attributes: [...troop.attributes],
    stats: { ...troop.stats },
    abilities: [...troop.abilities],
    quantity: 1,
    cost: troop.cost,
  };
}

export const REPLAY_REFERENCE_NAMES = ['ordinary', 'summons', 'death-prevention', 'timed-effects', 'long'] as const;

export function replayReferenceInput(name: typeof REPLAY_REFERENCE_NAMES[number]): BattleInput {
  const player = combatant(name === 'summons' ? 'goblin/beastmaster' : name === 'death-prevention' ? 'troll/soldier' : 'human/soldier', 'player');
  const enemy = combatant('human/knight', 'enemy');
  if (name === 'death-prevention') {
    player.stats.health = 20;
    player.abilities.push(getAbility('stoneblood'));
  }
  if (name === 'timed-effects') {
    player.abilities.push({
      id: 'reference-temporary-rate',
      label: 'Reference Temporary Rate',
      shortText: 'Gain 3 rate for one turn.',
      trigger: { timing: 'startOfBattle' },
      target: { mode: 'self' },
      duration: { kind: 'turns', turns: 1 },
      effects: [{ kind: 'haste', amount: 3, mode: 'flat' }],
    });
  }
  if (name === 'long') {
    for (const unit of [player, enemy]) {
      unit.stats.damage = 0;
      unit.abilities = [];
    }
  }
  return {
    seed: 49,
    riftId: null,
    tier: null,
    mutatorIds: [],
    playerCombatants: [player],
    enemyCombatants: [enemy],
  };
}
